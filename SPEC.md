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
| Script persistence | `.sim` files on local filesystem (browser File System Access API) |
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
│   │   ├── scripts/           ← legacy server-side .sim script files
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
│   │   │   │   ├── parser.ts          ← DSL tokenizer & AST builder
│   │   │   │   └── executor.ts        ← Run a parsed script
│   │   │   └── storage/
│   │   │       └── scriptStorage.ts   ← Server-side script file CRUD
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── client/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx                ← Router + AppContext (global state)
│       │   ├── flash.css              ← Row flash keyframe animation
│       │   ├── pages/
│       │   │   ├── DashboardPage.tsx  ← TAGs + Commands overview
│       │   │   └── ScriptPage.tsx     ← Script editor & runner + DSL reference
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

- `invokeCommand(objectId, methodId, args[], inputArgDefs?)` — calls `session.call()`. Uses `inputArgDefs` (OPC UA `ArgumentInfo` with DataType NodeId) to coerce each argument to the exact expected type before invocation, preventing `BadInvalidArgument` errors.
- `invokeCommandByName(name, args[])` — looks up by display name from cache, passes input argument definitions

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
| `POST` | `/api/intervals/tag` | `{ nodeId, displayName, values[], mode:'set', intervalMs }` or `{ ..., delta, mode:'increment' }` |
| `DELETE` | `/api/intervals/:id` | stop interval by UUID |
| `POST` | `/api/intervals/command` | `{ objectId, methodId, displayName, args[], intervalMs }` |
| `GET` | `/api/scripts` | list server-side saved scripts |
| `GET` | `/api/scripts/:name` | load script content from server |
| `POST` | `/api/scripts` | `{ name, content }` save script to server |
| `DELETE` | `/api/scripts/:name` | delete script from server |
| `POST` | `/api/scripts/parse` | `{ content }` — returns `{ script?, errors[] }` |
| `POST` | `/api/scripts/run` | `{ content }` — parse + start executor |
| `POST` | `/api/scripts/stop` | stop running script |
| `GET` | `/api/scripts/exec/status` | `{ status }` |

### Socket.IO Events

| Event | Direction | Payload |
|---|---|---|
| `tag:update` | Server → Client | `{ nodeId, value, timestamp }` — emitted on every value change (subscription, script, or external write) |
| `script:log` | Server → Client | `{ level, message, timestamp }` |
| `script:status` | Server → Client | `{ running, block }` — block is `'SETUP'`, `'LOOP'`, `'TEARDOWN'`, or `null` |
| `interval:tick` | Server → Client | `{ id, type, nodeId?, displayName?, newValue? }` |

---

## Frontend Design

### Global State (`App.tsx`)

React Context (`AppContext`) holds: `connectionStatus`, `serverUrl`, `tags[]`, `commands[]`, `intervals[]` and their setters. Two routes: `/` (Dashboard) and `/script` (Script Editor).

### Page 1 — Dashboard (`/`)

Two-column layout: TAG table (left) + Command panel (right).

**TAG Table (`TagTable.tsx`)**

- Live value updates via `tag:update` Socket.IO events (patched into AppContext).
- **Row flash**: any tag whose value changes (from subscription, script, or external write) briefly flashes green via `tag:update`. Uses CSS animation in `flash.css`.
- **Search** (press Enter): case-insensitive substring filter applied to visible rows. The table shows only matching tags while the search is active. Clearing the input restores all tags.
- **Checkbox selection**: user manually checks individual rows from the filtered view. Checks accumulate across multiple searches — checking tags from search "A", then changing to search "B" preserves the tags checked in "A". The `onChange` handler only updates visibility of the currently visible rows, preserving hidden checked keys.
- **Apply Filter**: shows all checked tags (regardless of current search). Button label shows `Apply Filter (N)` with the count; disabled when no tags are checked. Search input is disabled while filter is active.
- **Change Filter**: shown instead of Apply Filter when a filter is active. Clicking it returns to selection mode (keeps checked keys, clears search).
- **Save Filter**: saves the list of checked tag display names to a `.tags` file via the browser File System Access API (or download fallback on Firefox). Format: one tag name per line.
- **Load Filter**: opens a `.tags` file, matches tag names, checks them, and applies the filter.
- **Clear**: removes filter, clears all checked keys and search.
- **Inline edit**: pencil button writes a new value directly. Hidden when the tag has an active interval.
- **Repeating Action column**: shows the active interval badge (closable to stop) or the clock button to open the interval modal.

**Tag Interval Modal (`TagIntervalModal.tsx`)**

Two modes selectable via Segmented control:

*Set to value mode*
- Up to 3 value slots (Value 1 required, Value 2 and 3 optional). Empty optional slots are ignored.
- Boolean tags render a `true/false` Select; all other types render a text Input.
- Values rotate in order on each tick. After the last non-empty value, the cycle restarts at position 1.
- Interval field in milliseconds (default `10000ms`).

*Increment by mode* (numeric tags only)
- Single delta field (positive = increment, negative = decrement).
- Applied to the current cached value on each tick.

**Command Panel (`CommandPanel.tsx`)**
- Lists discovered commands with input/output argument definitions.
- **Invoke button**: opens arg input dialog. Hidden when a repeating interval is active for that command.
- **Repeating Action column**: shows active interval badge (closable) or clock button to set one.
- **Row flash**: flashes green on successful manual invoke and on every `interval:tick` for that command.

### Page 2 — Script Editor (`/script`)

- Monaco Editor with custom DSL syntax highlighting (see Script Engine section).
- **Script content persisted** in `localStorage` (`opcua-sim-script`) — navigating to Dashboard and back does not lose the script.
- **Script File Manager** (`ScriptFileManager.tsx`): Open/Save/Save As using the browser's native file picker (File System Access API). Falls back to `<input type="file">` / download link on Firefox. Files have `.sim` extension. Stores the file handle so "Save" overwrites without prompting.
- **Runner** (`ScriptRunner.tsx`): Run / Stop / Validate buttons, current block indicator (`SETUP` / `LOOP` / `TEARDOWN`), scrollable execution log. Log auto-scrolls within its container only — does not move page focus.

---

## Script Engine

### DSL Overview

Flat imperative language. Tags are always referenced with `[brackets]`. Commands are `[brackets]` followed by `(args)`. Three optional lifecycle blocks structure execution; statements outside any block are treated as `SETUP`.

### Lifecycle Blocks

| Block | Behaviour |
|---|---|
| `SETUP { }` | Executes once sequentially at simulation start. |
| `LOOP { }` | Executes sequentially and repeats continuously until `STOP SIMULATION` or stop is requested. Between each iteration the executor yields to the event loop (`setTimeout(0)`) so interval callbacks can fire. |
| `TEARDOWN { }` | Executes once sequentially after the loop exits, before the simulation stops. Always runs even when stopped externally. |

### DSL Syntax

```
// ── Tags and commands ──────────────────────────────────────
[TagGroup.TagName]                 Reference a tag
[CmdGroup.CmdName](arg1, arg2)     Invoke a command

// ── Writes ─────────────────────────────────────────────────
[TAG] = 100                        Write static numeric value
[TAG] = "text"                     Write string
[TAG] = true                       Write boolean
[TAG] = [TAGA] + [TAGB]            Write arithmetic expression
[TAG] = [TAGA] + 100               Mix tag reference and literal
[TAG] += 1                         One-time increment
[TAG] -= 1                         One-time decrement

// ── Read into variable ─────────────────────────────────────
myVar = [TAG]                      Read tag value into variable

// ── Command calls ──────────────────────────────────────────
[Cmd](a, b)                        Invoke command, discard result
myVar = [Cmd](a, b)                Invoke command, store first output

// ── Repeating intervals (EVERY) ────────────────────────────
[TAG] = 100 EVERY 1000ms           Write value every interval
[TAG] = [TAGA] + 10 EVERY 500ms    Write expression every interval
[TAG] += 1 EVERY 500ms             Increment every interval
[TAG] -= 1 EVERY 500ms             Decrement every interval
[TAG] = (100,200,300) EVERY 1s     Rotate through values
[Cmd](a, b) EVERY 2000ms           Invoke command every interval

// ── Interval control ───────────────────────────────────────
RESET [TAG]                        Stop active interval for tag
RESET [Cmd]                        Stop active interval for command

// ── Conditionals ───────────────────────────────────────────
IF [TAG] == 1000 THEN [TAG2] = 0
IF [TAG] >= 500 THEN { [A] = 0; [B] = 1 }    // multi-statement body
IF myVar == "err" THEN STOP SIMULATION

// ── Control ────────────────────────────────────────────────
SLEEP 1000                         Pause sequential execution for N ms
STOP SIMULATION                    Exit LOOP and run TEARDOWN

// ── Comments ───────────────────────────────────────────────
// anything after // is ignored

// ── Arithmetic operators ───────────────────────────────────
+  -  *  /    standard precedence (* / before + -)

// ── Comparison operators ───────────────────────────────────
==  !=  >  <  >=  <=
```

### Interval Deduplication

`EVERY` statements inside `LOOP` are idempotent: if an interval is already active for the same tag/command with the same `intervalMs`, subsequent iterations skip re-registration. This prevents the LOOP from accidentally resetting timers on each pass. A different `intervalMs` replaces the existing interval.

### Parser (`script/parser.ts`)

Exported types:

```typescript
export type Expr =
  | { kind: 'literal'; value: unknown }
  | { kind: 'tag';     name: string }
  | { kind: 'var';     name: string }
  | { kind: 'binop';   op: '+' | '-' | '*' | '/'; left: Expr; right: Expr };

export type Statement =
  | { kind: 'TAG_WRITE';              tagName: string; expr: Expr }
  | { kind: 'TAG_INCREMENT';          tagName: string; delta: number }
  | { kind: 'TAG_INTERVAL';           tagName: string; expr: Expr; intervalMs: number }
  | { kind: 'TAG_ROTATE';             tagName: string; values: unknown[]; intervalMs: number }
  | { kind: 'TAG_INCREMENT_INTERVAL'; tagName: string; delta: number; intervalMs: number }
  | { kind: 'VAR_ASSIGN';             varName: string; tagName: string }
  | { kind: 'CMD_INVOKE';             cmdName: string; args: Expr[] }
  | { kind: 'CMD_INVOKE_INTERVAL';    cmdName: string; args: Expr[]; intervalMs: number }
  | { kind: 'CMD_ASSIGN';             varName: string; cmdName: string; args: Expr[] }
  | { kind: 'IF_THEN';                left: Expr; op: string; right: Expr; body: Statement[] }
  | { kind: 'RESET';                  name: string }
  | { kind: 'SLEEP';                  ms: number }
  | { kind: 'STOP' };

export interface ParsedScript {
  setup:    Statement[];
  loop:     Statement[];
  teardown: Statement[];
}

export function parseScript(content: string): { script?: ParsedScript; errors: ParseError[] }
```

Line-by-line dispatch. Comments stripped (`//`). Blank lines skipped. Recursive-descent expression parser handles full arithmetic precedence. Time literals: `500ms`, `10s`, `2m`.

### Executor (`script/executor.ts`)

```typescript
class ScriptExecutor {
  setSocketIO(io: SocketIOServer): void
  run(script: ParsedScript): Promise<void>
  stop(): void
  getStatus(): 'stopped' | 'running' | 'error'
}
export const scriptExecutor = new ScriptExecutor();
```

Execution flow:
1. Cancel any currently running script (clears all timers)
2. Run `SETUP` statements sequentially
3. Enter `LOOP`: repeatedly run loop statements, yielding to event loop (`setTimeout(0)`) between iterations
4. On `STOP SIMULATION` or external `stop()`: interrupt SLEEP (via stored reject), set `stopRequested = true`, exit loop
5. Run `TEARDOWN` statements (stopRequested temporarily cleared so teardown executes fully)
6. Clear all active EVERY intervals, emit `script:status { running: false }`

Tag resolution by `displayName`. Command resolution by `displayName`. Both throw if not found.

Logging: only logs when IF conditions are met (not on every evaluation). SLEEP is silent.

### Monaco Language Definition (`ScriptEditor.tsx`)

Custom Monarch tokenizer `opcua-sim`:
- `[Name]` → blue bold (tag reference)
- `[Name](` → purple bold (command call)
- `SETUP`, `LOOP`, `TEARDOWN` → blue bold
- `IF`, `THEN`, `SLEEP`, `EVERY` → purple bold
- `STOP SIMULATION`, `RESET` → red bold
- `EVERY` time literals → green
- `==`, `!=`, `>=`, `<=`, `+=`, `-=` → red operators
- Strings, numbers, comments standard colours

---

## Key Design Decisions

| Decision | Choice |
|---|---|
| Port configuration | `config.json` in server package; `PORT` env var overrides |
| Interval scheduling | Recursive `setTimeout` — each tick waits for write completion, no overlap |
| Interval write target | Always uses `nodeId` directly, never displayName string lookup |
| TAG subscription rate | 100ms publishing + sampling interval for near-real-time UI updates |
| Multi-value intervals | Array of 1–3 values rotated in order; index wraps at end |
| Script file storage | Browser File System Access API (native file picker); server-side routes kept for API compatibility |
| Script editor persistence | `localStorage` key `opcua-sim-script` — survives navigation within the SPA |
| Tag filter storage | `.tags` file (one display name per line) via File System Access API |
| TAG identification in scripts | Display name (not raw nodeId) — accessible to non-technical users |
| EVERY deduplication | `isIntervalActive(key, intervalMs)` — skips re-registration if same interval already running |
| LOOP event loop yield | `await setTimeout(0)` after each iteration — allows EVERY callbacks to fire even when loop body is all-interval statements |
| Row flash trigger | `tag:update` socket event (covers all value sources: subscriptions, scripts, external writes) |
| OPC UA argument coercion | Uses declared `ArgumentInfo.dataType` NodeId from browse to coerce args to exact expected type |
| OPC UA security | `SecurityPolicy.None` — simulator for internal/local use |
| Interval state | UUID-keyed Map in memory, not persisted — cleared on disconnect |
| Auth | None — localhost-only simulator |

---

## Out of Scope

- OPC UA Server implementation
- Historical data / trending charts
- User authentication
- Deployment / containerization
