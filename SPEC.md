# OPC UA Simulator — Specification

## Overview

A Node.js + TypeScript application with a web UI for Functional Analysts to simulate equipment via OPC UA. The app acts exclusively as an **OPC UA Client**, connecting to an existing OPC UA Server. No technical knowledge required to operate it.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 20 LTS |
| Backend language | TypeScript 5.3 |
| HTTP/API server | Express.js 4 |
| Real-time updates | Socket.IO 4 |
| OPC UA Client | node-opcua 2 |
| Frontend framework | React 18 + TypeScript + Vite 5 |
| UI components | Ant Design 5 |
| Code editor widget | Monaco Editor 4 |
| Script persistence | JSON files on disk |
| Package manager | npm workspaces (monorepo) |

---

## Project Structure

```
OPCUASimulator/
├── package.json               ← workspace root (dev/build/start scripts)
├── SPEC.md
├── packages/
│   ├── server/
│   │   ├── config.json        ← server configuration (port)
│   │   ├── scripts/           ← persisted user .sim script files
│   │   ├── src/
│   │   │   ├── server.ts              ← Express + Socket.IO entry point
│   │   │   ├── opcua/
│   │   │   │   ├── client.ts          ← OPC UA client lifecycle
│   │   │   │   ├── browser.ts         ← Recursive node discovery (TAGs + Commands)
│   │   │   │   ├── tagManager.ts      ← Read/write TAGs + OPC UA subscriptions
│   │   │   │   └── commandManager.ts  ← Invoke OPC UA Methods
│   │   │   ├── api/
│   │   │   │   ├── routes.ts          ← All REST endpoints
│   │   │   │   └── intervalManager.ts ← Repeating write/command timer management
│   │   │   ├── script/
│   │   │   │   ├── parser.ts          ← Tokenize & parse the DSL
│   │   │   │   ├── executor.ts        ← Run a parsed script
│   │   │   │   └── scheduler.ts       ← Manage ALWAYS/interval timers
│   │   │   └── storage/
│   │   │       └── scriptStorage.ts   ← Save/load scripts as JSON files
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── client/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx                ← Router + AppContext (global state)
│       │   ├── pages/
│       │   │   ├── DashboardPage.tsx  ← TAGs + Commands overview
│       │   │   └── ScriptPage.tsx     ← Script editor & runner
│       │   ├── components/
│       │   │   ├── ConnectionBar.tsx
│       │   │   ├── TagTable.tsx
│       │   │   ├── TagIntervalModal.tsx
│       │   │   ├── CommandPanel.tsx
│       │   │   ├── CommandIntervalModal.tsx
│       │   │   ├── ScriptEditor.tsx
│       │   │   ├── ScriptRunner.tsx
│       │   │   └── ScriptFileManager.tsx
│       │   ├── services/
│       │   │   ├── api.ts             ← Axios REST client
│       │   │   └── socket.ts          ← Socket.IO singleton client
│       │   └── types/
│       │       └── index.ts           ← Shared TypeScript interfaces
│       ├── vite.config.ts             ← Proxies /api and /socket.io to :3000
│       ├── tsconfig.json
│       └── package.json
```

---

## Commands

```bash
npm install              # install all workspace deps
npm run dev              # start server + client concurrently (hot reload)
npm run build            # compile both packages for production
npm run start            # run compiled server (client served as static files)
```

Dev server: `http://localhost:5173` (proxied to backend at `:3000`)

---

## Server Configuration

`packages/server/config.json` is read at startup:

```json
{ "port": 3000 }
```

`PORT` environment variable takes precedence over the file. If the file is missing or malformed, port defaults to `3000`.

---

## Backend Design

### OPC UA Client (`opcua/client.ts`)

Singleton `opcuaClient`. Exposes:
- `connect(endpointUrl)` — opens connection + session
- `disconnect()` — closes session + connection
- `getSession()` — returns active `ClientSession`
- `getStatus()` — `connected | disconnected | connecting | error`
- `getCurrentUrl()` — last connected endpoint URL

### Node Browser (`opcua/browser.ts`)

Recursively browses the OPC UA server from `ObjectsFolder` up to depth 8. Skips standard nodes (`Server`, `DeviceSet`, `NetworkSet`, `Aliases`). Builds a flat in-memory catalogue of:

- **TAGs** (`TagInfo`): `nodeId`, `displayName`, `dataType`, `value`, `accessLevel` (bitmask: bit0=read, bit1=write)
- **Commands** (`CommandInfo`): `nodeId`, `displayName`, `objectId`, `inputArguments`, `outputArguments`

Results cached in memory. `getCachedTags()` / `getCachedCommands()` return the current cache. `updateCachedTagValue(nodeId, value)` patches a single value in-place. Cache is rebuilt on `/api/refresh` or reconnect.

### TAG Manager (`opcua/tagManager.ts`)

- `readTag(nodeId)` — live read via session
- `writeTag(nodeId, value, dataType?)` — coerces value to the correct OPC UA `DataType`, writes via session
- `subscribeToTags(tags[])` — creates one `ClientSubscription` with `requestedPublishingInterval: 100ms`; each TAG monitored at `samplingInterval: 100ms`. On change, patches cache and emits `tag:update` via Socket.IO
- `stopSubscription()` — terminates the subscription

### Command Manager (`opcua/commandManager.ts`)

- `invokeCommand(objectId, methodId, args[])` — calls `session.call()`
- `invokeCommandByName(name, args[])` — looks up by display name from cache

### Interval Manager (`api/intervalManager.ts`)

Manages repeating writes and command invocations. Uses a **recursive `setTimeout`** pattern (not `setInterval`) so each tick waits for the async operation to complete before scheduling the next, preventing write overlap when the OPC UA server is slow.

**`startTagInterval(nodeId, displayName, values[], intervalMs)`**
- Accepts an array of 1–3 values. On each tick, writes `values[index % values.length]` and advances the index. After the last value the cycle restarts from position 0.
- Resolves the tag's `nodeId` directly from cache for the write — avoids displayName lookup failures.

**`startTagIncrementInterval(nodeId, displayName, delta, intervalMs)`**
- Reads current value from cache (falls back to live read), adds `delta`, writes result via `nodeId`.

**`startCommandInterval(objectId, methodId, displayName, args[], intervalMs)`**
- Invokes the command with the given args on each tick.

All three return an `IntervalEntry` with a human-readable `label`:
- Set mode: `[val1 → val2 → val3] / 500ms`
- Increment mode: `+5 / 1000ms`
- Command mode: `(arg1, arg2) / 2000ms`

`stopInterval(id)` / `stopAllIntervals()` use `clearTimeout`.

### REST API (`api/routes.ts`)

| Method | Endpoint | Body / Notes |
|---|---|---|
| `POST` | `/api/connect` | `{ url }` — connects and browses |
| `POST` | `/api/disconnect` | stops scripts + intervals + subscription |
| `GET` | `/api/status` | `{ status, url }` |
| `POST` | `/api/refresh` | re-browse and re-subscribe |
| `GET` | `/api/tags` | full TAG catalogue from cache |
| `POST` | `/api/tags/write` | `{ nodeId, value, dataType? }` |
| `GET` | `/api/commands` | full Command catalogue from cache |
| `POST` | `/api/commands/invoke` | `{ objectId, methodId, args[] }` |
| `GET` | `/api/intervals` | list active intervals |
| `POST` | `/api/intervals/tag` | `{ nodeId, displayName, values[], mode:'set', intervalMs }` or `{ ..., delta, mode:'increment' }` — enforces one interval per tag |
| `DELETE` | `/api/intervals/:id` | stop interval by UUID |
| `POST` | `/api/intervals/command` | `{ objectId, methodId, displayName, args[], intervalMs }` |
| `GET` | `/api/scripts` | list saved scripts |
| `GET` | `/api/scripts/:name` | load script content |
| `POST` | `/api/scripts` | `{ name, content }` save script |
| `DELETE` | `/api/scripts/:name` | delete script |
| `POST` | `/api/scripts/parse` | `{ content }` — returns `{ script?, errors[] }` |
| `POST` | `/api/scripts/run` | `{ content }` — parse + start executor |
| `POST` | `/api/scripts/stop` | stop running script |
| `GET` | `/api/scripts/exec/status` | `{ status }` |

### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `tag:update` | Server → Client | `{ nodeId, value, timestamp }` |
| `script:log` | Server → Client | `{ level, message, timestamp }` |
| `script:status` | Server → Client | `{ running, block }` |
| `interval:tick` | Server → Client | `{ id, type, nodeId?, displayName?, newValue? }` |

---

## Frontend Design

### Global State (`App.tsx`)

React Context (`AppContext`) holds: `connectionStatus`, `serverUrl`, `tags[]`, `commands[]`, `intervals[]` and their setters. Two routes: `/` (Dashboard) and `/script` (Script Editor).

### Page 1 — Dashboard (`/`)

Two-column layout: TAG table (left) + Command panel (right).

**TAG Table (`TagTable.tsx`)**
- Live updates via `tag:update` Socket.IO events
- **Search**: text input performs a case-insensitive substring match on tag display names. Matching tags are added to the checkbox selection.
- **Checkbox selection**: rows can be checked individually or via the search. A filter can be applied to show only checked tags.
- **Filter persistence**: selected tag names and applied-state are saved to `localStorage` (key `opcua-sim-tag-filter-v2`) and restored on next visit.
- **Inline edit**: pencil button writes a new value directly. Hidden when the tag has an active interval.
- **Repeating Action column**: shows the active interval badge (closable to stop) or the clock button to open the interval modal. Badge label format: `[val → val] / 500ms` or `+5 / 1000ms`.

**Tag Interval Modal (`TagIntervalModal.tsx`)**

Two modes selectable via Segmented control:

*Set to value mode*
- Up to 3 value slots (Value 1 required, Value 2 and 3 optional). Empty optional slots are ignored.
- Boolean tags (`i=1` / `DataType.Boolean`) render a `true/false` Select; all other types render a text Input.
- Values rotate in order on each tick. After the last non-empty value, the cycle restarts at position 1.
- Interval field in milliseconds (default `10000ms`).

*Increment by mode* (numeric tags only)
- Single delta field (positive = increment, negative = decrement).
- Applied to the current cached value on each tick.

**Command Panel (`CommandPanel.tsx`)**
- Lists discovered commands with their input argument definitions.
- Invoke button opens an arg input dialog. Clock button opens `CommandIntervalModal`.

### Page 2 — Script Editor (`/script`)

- Monaco Editor with custom DSL syntax tokenizer (keywords: `ALWAYS`, `ONSTART`, `ONCE`, `INVOQUE`, `IF`, `THEN`, `SLEEP`, `each`)
- Script file manager: lists `.sim` files from server, open/save/save-as dialogs
- Runner: Run / Stop buttons, status indicator, scrollable execution log (color-coded by level)

---

## Script Engine

### DSL Grammar

```
ALWAYS {
  TAGA = 100 each 10s
  TAGB = 100 each 20s
  INVOQUE COMMANDA(100, 200) each 30s
}

ONSTART {
  RESPONSE = INVOQUE COMMANDA(100, 200)
  IF RESPONSE = 0 THEN TAGA = 200
  SLEEP 1000
  TAGC = "hello"
}

ONCE {
  TAGC = "2000"
  INVOQUE COMMANDB()
}
```

### Block Behaviour

| Block | Behaviour |
|---|---|
| `ALWAYS { }` | Each statement runs on its own independent timer. Starts when script starts, runs until stopped. |
| `ONSTART { }` | Executes sequentially once at script start, before `ALWAYS` timers fire. |
| `ONCE { }` | Executes sequentially exactly once, after `ONSTART` completes. |

### Statement Types

| Statement | Syntax |
|---|---|
| TAG write | `TAGNAME = value` |
| TAG write with interval | `TAGNAME = value each Ns` (ALWAYS only) |
| Command invoke | `INVOQUE CMDNAME(arg1, arg2)` |
| Command with result | `VAR = INVOQUE CMDNAME(arg1, arg2)` |
| Command with interval | `INVOQUE CMDNAME() each Ns` (ALWAYS only) |
| Conditional | `IF VAR = value THEN TAGNAME = value` |
| Sleep | `SLEEP ms` (ONSTART / ONCE only) |

---

## Key Design Decisions

| Decision | Choice |
|---|---|
| Port configuration | `config.json` in server package; `PORT` env var overrides |
| Interval scheduling | Recursive `setTimeout` — each tick waits for write completion, no overlap |
| Interval write target | Always uses `nodeId` directly, never displayName string lookup |
| TAG subscription rate | 100ms publishing + sampling interval for near-real-time UI updates |
| Multi-value intervals | Array of 1–3 values rotated in order; index wraps at end |
| Script persistence | JSON files in `server/scripts/`, `.sim` extension |
| TAG identification in scripts | Display name (not raw nodeId) — accessible to non-technical users |
| OPC UA security | `SecurityPolicy.None` — simulator for internal/local use |
| Interval state | UUID-keyed Map in memory, not persisted — cleared on disconnect |
| Auth | None — localhost-only simulator |

---

## Out of Scope

- OPC UA Server implementation
- Historical data / trending charts
- User authentication
- Deployment / containerization
