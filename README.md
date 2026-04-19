# OPC UA Simulator

A web-based tool for Functional Analysts to interact with OPC UA servers — read and write tags, invoke commands, and automate sequences with a scripting language. No programming knowledge required to operate it.

---

## What It Does

The simulator connects to an **existing OPC UA server** as a client. Once connected, it automatically discovers all available tags (variables) and commands (methods) exposed by that server and presents them in a dashboard where you can:

- **View live tag values** — updated in real time as the server changes them
- **Write tag values** manually or on a repeating schedule
- **Invoke commands** with arguments, manually or on a schedule
- **Write automation scripts** using a simple scripting language to orchestrate complex sequences

---

## Getting Started

### Requirements

- Node.js 20 LTS or newer
- npm 9+

### Install and Run

```bash
# Clone the repository
git clone <repo-url>
cd OPCUASimulator

# Install all dependencies
npm install

# Start in development mode (hot reload on both server and client)
npm run dev
```

Open `http://localhost:5173` in your browser.

### Production Build

```bash
npm run build   # compile server TypeScript + bundle React client
npm run start   # serve the compiled app on port 3000
```

In production, the server serves the compiled React app as static files. Open `http://localhost:3000`.

### Port Configuration

Edit `packages/server/config.json` to change the default port:

```json
{ "port": 3000 }
```

The `PORT` environment variable overrides this file.

---

## Connecting to an OPC UA Server

1. Enter the OPC UA endpoint URL in the connection bar at the top (e.g. `opc.tcp://192.168.1.10:4840`)
2. Click **Connect**
3. The app browses the server and discovers all tags and commands automatically
4. Use **Refresh** to re-discover nodes if the server structure changes

---

## Dashboard

The Dashboard is split into two panels: **Tags** on the left and **Commands** on the right.

### Tags Panel

Displays all discoverable OPC UA variables. Each row shows:

| Column | Description |
|---|---|
| Tag Name | Display name from the OPC UA server |
| Current Value | Live value, flashes green on every change |
| Type | OPC UA data type (Boolean, Int32, Double, String, …) |
| Access | R (readable) / W (writable) badges |
| Repeating Action | Active interval badge, or button to set one |

**Editing a value** — click the pencil icon on any writable tag to type a new value and save it.

**Repeating intervals** — click the clock icon to open the interval dialog. Two modes:
- *Set to value*: write one, two, or three values in rotation on a fixed timer. Example: rotate between `0`, `100`, `200` every 500ms.
- *Increment by*: add a fixed delta to the current value on each tick. Use negative numbers to decrement.

#### Searching and Filtering

When you have many tags, use the search bar and filter tools to work with a subset:

1. **Type a name in the search box and press Enter** — the table shows only tags whose names contain the search text
2. **Check the tags you want** from the filtered view — checked tags accumulate across multiple searches
3. **Search for something else and check more tags** — previously checked tags are preserved
4. **Click "Apply Filter (N)"** — the table now shows only the N checked tags
5. **Click "Change Filter"** to go back to selection mode (keeps your selection)
6. **Click "Clear"** to reset everything

**Save Filter** — saves the list of checked tag names to a `.tags` file (one name per line). Use the browser's native file picker to choose the location.

**Load Filter** — opens a `.tags` file, automatically checks all matching tags, and applies the filter.

### Commands Panel

Lists all OPC UA methods discovered on the server. Each command shows its input and output argument definitions.

- **Invoke** — opens a dialog to enter argument values and execute the command once
- **Repeating Action** — set a timer to invoke the command repeatedly with fixed arguments

---

## Script Editor

The Script Editor lets you write automation scripts using a simple domain-specific language. Navigate to the **Script** page from the top navigation.

### Lifecycle Blocks

Scripts are structured into three optional blocks:

```
SETUP {
  // Runs once when the simulation starts
}

LOOP {
  // Repeats continuously until STOP SIMULATION or the Stop button
}

TEARDOWN {
  // Runs once after the loop ends, before the simulation stops
}
```

Statements written outside any block are treated as `SETUP`.

### Language Reference

```
// ── Tag and command references ──────────────────────────────
[TagGroup.TagName]                 Reference a tag by display name
[CmdGroup.CmdName](arg1, arg2)     Invoke a command

// ── Writing tag values ──────────────────────────────────────
[TAG] = 100                        Write a number
[TAG] = "text"                     Write a string
[TAG] = true                       Write a boolean
[TAG] = [TAGA] + [TAGB]            Write an arithmetic expression
[TAG] += 1                         Increment once
[TAG] -= 1                         Decrement once

// ── Reading tags into variables ─────────────────────────────
myVar = [TAG]                      Store tag value in a variable

// ── Invoking commands ────────────────────────────────────────
[Cmd](a, b)                        Invoke, discard result
myVar = [Cmd](a, b)                Invoke, store first output

// ── Repeating intervals (EVERY) ─────────────────────────────
[TAG] = 100 EVERY 1s               Write value every second
[TAG] += 1 EVERY 500ms             Increment every 500ms
[TAG] = (100,200,300) EVERY 2s     Rotate through values
[Cmd](a, b) EVERY 5s               Invoke command every 5 seconds

RESET [TAG]                        Stop the active interval for a tag
RESET [Cmd]                        Stop the active interval for a command

// ── Conditionals ─────────────────────────────────────────────
IF [TAG] == 1000 THEN [TAG2] = 0
IF [TAG] >= 500 THEN { [A] = 0; [B] = 1 }
IF myVar == "err" THEN STOP SIMULATION

// ── Control ──────────────────────────────────────────────────
SLEEP 1000                         Pause for 1000ms (1 second)
STOP SIMULATION                    Exit the loop and run TEARDOWN

// ── Arithmetic ───────────────────────────────────────────────
+  -  *  /   (standard precedence)

// ── Comparisons ──────────────────────────────────────────────
==  !=  >  <  >=  <=

// ── Time units ───────────────────────────────────────────────
500ms   10s   2m
```

### Example Script

```
SETUP {
  // Initialize setpoint to 0
  [Control.Setpoint] = 0
  SLEEP 500ms
}

LOOP {
  // Read current status
  status = [Sensor.Status]

  // Ramp setpoint based on sensor inputs
  [Control.Setpoint] = [Sensor.InputA] + [Sensor.InputB]

  // Reset when limit is reached
  IF [Sensor.Status] >= 1000 THEN [Control.Setpoint] = 0

  // Run reset command if needed
  IF status == 0 THEN [Control.Reset]()

  SLEEP 2000
}

TEARDOWN {
  // Safe state on stop
  [Control.Setpoint] = 0
  [Control.Reset]()
}
```

### Running Scripts

- **Validate** — parses the script and reports any syntax errors without running it
- **Run** — starts the simulation; the current block (`SETUP` / `LOOP` / `TEARDOWN`) is shown in the status bar
- **Stop** — interrupts the simulation; TEARDOWN still runs before the executor halts

The execution log shows all tag writes, command invocations, and conditional results. It scrolls automatically within its panel.

### Saving and Opening Scripts

Scripts are saved as `.sim` files on your local machine using the browser's native file picker.

- **Open** — load a `.sim` file from disk
- **Save** — overwrite the currently open file (no dialog if a file is already open)
- **Save As** — choose a new location and file name

The editor content is also automatically saved in the browser (`localStorage`) so navigating to the Dashboard and back does not lose your work.

---

## How It Works Internally

```
Browser  ──HTTP/REST──▶  Express server  ──node-opcua──▶  OPC UA Server
         ◀──Socket.IO──                  ◀──subscriptions─
```

- The server uses **node-opcua** to maintain one OPC UA session at a time
- Tags are monitored with a 100ms subscription — value changes are pushed to the browser via **Socket.IO** (`tag:update` events)
- The script executor runs on the server; the Monaco editor in the browser sends script text to `/api/scripts/run`
- Repeating intervals use recursive `setTimeout` (not `setInterval`) so each tick waits for the previous OPC UA write to complete before scheduling the next

---

## Limitations

- Connects to one OPC UA server at a time
- No authentication (intended for local/internal use)
- Interval state is lost on server restart
- OPC UA Security Policy is set to `None`
