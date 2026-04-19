# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all workspace dependencies
npm install

# Start both server and client in dev mode (concurrently)
npm run dev

# Build both packages for production
npm run build

# Run compiled server (requires prior build)
npm run start
```

Individual packages:
```bash
# Server only (port 3000, ts-node-dev with hot reload)
npm run dev -w packages/server

# Client only (port 5173, Vite HMR)
npm run dev -w packages/client
```

There are no test or lint commands — TypeScript compilation is the primary correctness check.

## Architecture

This is an **npm workspaces monorepo** with two packages: `packages/server` (Node.js + Express) and `packages/client` (React + Vite). The server compiles to `dist/` and serves the built client statically in production. In development, Vite proxies `/api` and `/socket.io` to `localhost:3000`.

### Server (`packages/server/src/`)

The server has four main layers:

**OPC UA Layer** (`opcua/`)
- `client.ts` — Singleton `opcuaClient` wrapping node-opcua's `OPCUAClient`. Manages connect/disconnect/session lifecycle.
- `browser.ts` — Recursively browses the OPC UA server tree and catalogs TAGs (variables) and Commands (methods) into in-memory cache.
- `tagManager.ts` — Read/write individual tags and manage live subscriptions. Emits `tag:update` via Socket.IO. Requires `setSocketIO(io)` to be called at startup.
- `commandManager.ts` — Invokes OPC UA methods via `session.call()`.

**Script Engine** (`script/`)
- Custom DSL with three block types: `ALWAYS` (repeating), `ONSTART` (run once on start), `ONCE` (run once after ONSTART).
- `parser.ts` → tokenizes DSL text into an AST (`ParsedScript`).
- `executor.ts` → runs the AST; ALWAYS block statements each get independent `setInterval` timers.
- `scheduler.ts` → manages the timer lifecycle.
- Emits `script:log` and `script:status` via Socket.IO.

**Interval Manager** (`api/intervalManager.ts`)
- UUID-keyed in-memory Map of repeating TAG writes and command invocations.
- Two TAG modes: `set` (repeat constant value) or `increment` (add delta each tick).
- State is lost on server restart — intervals are not persisted.

**REST API** (`api/routes.ts`)
- ~20 endpoints under `/api`: connection, tags, commands, intervals, scripts (CRUD + run/stop/parse).

**Entry point** (`server.ts`) wires Express, Socket.IO, CORS, and static file serving together. Port defaults to `process.env.PORT ?? 3000`.

### Client (`packages/client/src/`)

**State** — `App.tsx` provides a React Context (`AppContext`) holding connection status, discovered tags/commands, active intervals, and server URL. No external state library.

**Pages**
- `DashboardPage` — Two-column layout: `TagTable` (left) + `CommandPanel` (right).
- `ScriptPage` — Monaco Editor + `ScriptRunner` + execution log.

**Key components**
- `TagTable` — Live-updating table with inline value editing and interval modal.
- `ScriptEditor` — Monaco Editor with custom DSL language registration.
- `ScriptFileManager` — Saves/loads `.sim` script files to/from the server.

**Services**
- `services/api.ts` — Typed Axios REST client.
- `services/socket.ts` — Socket.IO singleton client.

**Types** (`types/index.ts`) — Shared interfaces: `TagInfo`, `CommandInfo`, `IntervalEntry`, `ScriptFile`, `LogEntry`, `ParseError`.

## Key Design Decisions

- Scripts are persisted as JSON files in `packages/server/scripts/` — no database.
- Singleton pattern for `opcuaClient` and `scriptExecutor` — only one active connection/execution at a time.
- `TagManager` and `IntervalManager` receive Socket.IO via `setSocketIO()` rather than importing it directly.
- `SPEC.md` at the repo root is the authoritative reference for design decisions, the full API table, and DSL grammar.
