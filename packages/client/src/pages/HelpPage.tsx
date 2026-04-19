import React from 'react';
import {
  Typography, Collapse, Card, Tag, Space, Table, Divider, Alert,
} from 'antd';
import {
  WifiOutlined, DashboardOutlined, CodeOutlined, ClockCircleOutlined,
  EditOutlined, FilterOutlined, SaveOutlined, FolderOpenOutlined,
  PlayCircleOutlined, StopOutlined, CheckCircleOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const sectionStyle: React.CSSProperties = {
  marginBottom: 0,
};

const codeBlock: React.CSSProperties = {
  background: '#f6f8fa',
  borderRadius: 6,
  padding: '10px 14px',
  fontSize: 12,
  lineHeight: 1.8,
  whiteSpace: 'pre',
  overflowX: 'auto',
  margin: '8px 0',
  color: '#24292f',
  border: '1px solid #e8e8e8',
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <Text code style={{ fontSize: 12 }}>{children}</Text>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={sectionStyle}>{children}</div>;
}

// ── Collapse panels ───────────────────────────────────────────────────────────

const connectingPanel = (
  <Section>
    <Paragraph>
      The simulator acts as an <Text strong>OPC UA Client</Text>. It does not run an OPC UA server
      — it connects to one that is already running on your network or locally.
    </Paragraph>
    <ol>
      <li>Enter the OPC UA endpoint URL in the connection bar at the top of the page.<br />
        Example: <Code>opc.tcp://192.168.1.10:4840</Code>
      </li>
      <li>Click <Text strong>Connect</Text>. The app browses the server and discovers all tags and commands automatically.</li>
      <li>Once connected, the status indicator in the top bar turns <Text style={{ color: '#52c41a' }}>green</Text>.</li>
      <li>Use <Text strong>Refresh</Text> to re-discover nodes if the server structure changes while connected.</li>
      <li>Click <Text strong>Disconnect</Text> to close the session.</li>
    </ol>
    <Alert
      type="info"
      showIcon
      style={{ marginTop: 8 }}
      message="The server uses Security Policy: None. It is intended for local or internal network use only."
    />
  </Section>
);

const tagsPanel = (
  <Section>
    <Paragraph>
      The <Text strong>Tags</Text> table on the Dashboard lists every OPC UA variable (tag)
      discovered on the server. Values update in real time — a row flashes green whenever its
      value changes, regardless of the source (subscription, script, or an external write).
    </Paragraph>

    <Title level={5}>Columns</Title>
    <Table
      size="small"
      pagination={false}
      style={{ marginBottom: 12 }}
      columns={[
        { title: 'Column', dataIndex: 'col', width: '20%' },
        { title: 'Description', dataIndex: 'desc' },
      ]}
      dataSource={[
        { key: 1, col: 'Tag Name', desc: 'Display name from the OPC UA server.' },
        { key: 2, col: 'Current Value', desc: 'Live value. Flashes green on every change. Click the pencil icon to edit.' },
        { key: 3, col: 'Type', desc: 'OPC UA data type — Boolean, Int16, Int32, Float, Double, String, DateTime, …' },
        { key: 4, col: 'Access', desc: 'R = readable, W = writable.' },
        { key: 5, col: 'Repeating Action', desc: 'Shows the active interval, or the clock button to set one.' },
      ]}
    />

    <Title level={5}><EditOutlined /> Editing a value</Title>
    <Paragraph>
      Click the pencil icon on any writable tag to enter a new value. Press <Code>Enter</Code> or
      click the tick button to save. The edit button is hidden while an interval is active on that tag.
    </Paragraph>

    <Title level={5}><ClockCircleOutlined /> Repeating intervals</Title>
    <Paragraph>
      Click the clock icon to open the interval dialog. Choose a mode:
    </Paragraph>
    <ul>
      <li>
        <Text strong>Set to value</Text> — write one, two, or three values in rotation on a fixed
        timer. Example: rotate between <Code>0</Code>, <Code>100</Code>, <Code>200</Code> every 500 ms.
        Boolean tags show a true/false selector; all other types accept free text.
      </li>
      <li>
        <Text strong>Increment by</Text> — add a fixed delta to the current cached value on each tick.
        Use a negative number to decrement. Only available for numeric tags.
      </li>
    </ul>
    <Paragraph>
      Click the <Text strong>×</Text> on the interval badge to stop it.
    </Paragraph>
  </Section>
);

const searchFilterPanel = (
  <Section>
    <Paragraph>
      When working with large tag lists, the search and filter tools help you focus on a subset.
    </Paragraph>

    <Title level={5}>Workflow</Title>
    <ol>
      <li>Type part of a tag name in the search box and press <Code>Enter</Code>. The table shows only matching tags.</li>
      <li>Check the tags you want from the filtered view.</li>
      <li>Change the search term and press <Code>Enter</Code> again. Previously checked tags are preserved.</li>
      <li>Repeat until you have selected all the tags you need.</li>
      <li>Click <Text strong>Apply Filter (N)</Text>. The table now shows only the checked tags.</li>
    </ol>

    <Title level={5}>Buttons</Title>
    <Table
      size="small"
      pagination={false}
      style={{ marginBottom: 12 }}
      columns={[
        { title: 'Button', dataIndex: 'btn', width: '30%' },
        { title: 'What it does', dataIndex: 'desc' },
      ]}
      dataSource={[
        { key: 1, btn: 'Apply Filter (N)', desc: 'Show only the N checked tags. Disabled while no tags are checked.' },
        { key: 2, btn: 'Change Filter', desc: 'Return to selection mode while keeping the current selection.' },
        { key: 3, btn: 'Save Filter', desc: 'Save the list of checked tag names to a .tags file on your machine.' },
        { key: 4, btn: 'Load Filter', desc: 'Open a .tags file, check all matching tags, and apply the filter.' },
        { key: 5, btn: 'Clear', desc: 'Remove the filter, clear all checked tags, and reset the search.' },
      ]}
    />

    <Title level={5}><SaveOutlined /> Saving and loading filters</Title>
    <Paragraph>
      A filter file (<Code>.tags</Code>) is a plain text file with one tag display name per line.
      Use <Text strong>Save Filter</Text> to export your current selection and <Text strong>Load Filter</Text> to
      restore it in a future session — even if tags appear in a different order.
    </Paragraph>
  </Section>
);

const commandsPanel = (
  <Section>
    <Paragraph>
      The <Text strong>Commands</Text> panel on the right side of the Dashboard lists every OPC UA
      method discovered on the server. Each row shows the command name and its input/output argument definitions.
    </Paragraph>

    <Title level={5}>Invoking a command</Title>
    <ol>
      <li>Click <Text strong>Invoke</Text> next to the command.</li>
      <li>A dialog opens showing the input arguments and their types. Fill in each value.</li>
      <li>Click <Text strong>Invoke</Text> in the dialog. Output values are shown in the result area.</li>
    </ol>

    <Title level={5}><ClockCircleOutlined /> Repeating a command</Title>
    <Paragraph>
      Click the clock icon to set a repeating interval. The command will be invoked with the same
      arguments on every tick. Click the <Text strong>×</Text> on the badge to stop it.
    </Paragraph>
  </Section>
);

const scriptOverviewPanel = (
  <Section>
    <Paragraph>
      The Script Editor lets you write automation scripts that run on the server and interact with
      OPC UA tags and commands. Scripts are written in a simple line-by-line language — no
      programming experience required.
    </Paragraph>

    <Title level={5}>Lifecycle blocks</Title>
    <Paragraph>
      Scripts are structured into three optional blocks. Statements outside any block are treated as <Code>SETUP</Code>.
    </Paragraph>
    <pre style={codeBlock}>{`SETUP {
  // Runs once when the simulation starts
}

LOOP {
  // Repeats continuously until STOP SIMULATION or the Stop button
}

TEARDOWN {
  // Runs once after the loop ends, before the simulation stops
}`}</pre>

    <Title level={5}>Running a script</Title>
    <ol>
      <li>Write or open a script in the editor.</li>
      <li>Click <Text strong>Validate</Text> to check for syntax errors without running.</li>
      <li>Click <Text strong><PlayCircleOutlined /> Run</Text> to start the simulation.</li>
      <li>The status bar shows the current block (<Code>SETUP</Code> / <Code>LOOP</Code> / <Code>TEARDOWN</Code>).</li>
      <li>Click <Text strong><StopOutlined /> Stop</Text> to interrupt. The TEARDOWN block still runs before the executor halts.</li>
    </ol>
    <Alert
      type="warning"
      showIcon
      style={{ marginTop: 8 }}
      message="You must be connected to an OPC UA server before running a script. Tags and commands are resolved by display name at runtime."
    />
  </Section>
);

const scriptSyntaxPanel = (
  <Section>
    <Title level={5}>Writing to a tag</Title>
    <pre style={codeBlock}>{`[TAG] = 100               // write a number
[TAG] = "hello"           // write a string
[TAG] = true              // write a boolean
[TAG] = [TAGA] + [TAGB]   // write an arithmetic expression
[TAG] += 1                // one-time increment
[TAG] -= 5                // one-time decrement`}</pre>

    <Title level={5}>Reading a tag into a variable</Title>
    <pre style={codeBlock}>{`myVar = [TAG]             // read tag value into a variable
result = [Cmd](a, b)      // invoke command, store first output`}</pre>

    <Title level={5}>Invoking a command</Title>
    <pre style={codeBlock}>{`[Cmd.Reset]()             // invoke with no arguments
[Cmd.Set](100, "auto")    // invoke with arguments, discard result
out = [Cmd.Read]()        // invoke and store result in variable`}</pre>

    <Title level={5}>Repeating intervals (EVERY)</Title>
    <Paragraph>
      <Code>EVERY</Code> statements start a background timer. Inside <Code>LOOP</Code>, the same
      interval is not restarted on every iteration — it runs in the background until <Code>RESET</Code>
      or the simulation stops.
    </Paragraph>
    <pre style={codeBlock}>{`[TAG] = 100 EVERY 1s              // write value every second
[TAG] += 1 EVERY 500ms            // increment every 500 ms
[TAG] -= 2 EVERY 2000ms           // decrement every 2 s
[TAG] = (0,50,100) EVERY 1s       // rotate through values
[Cmd.Ping]() EVERY 10s            // invoke command every 10 s

RESET [TAG]                        // stop active interval on TAG
RESET [Cmd.Ping]                   // stop active interval on command`}</pre>

    <Title level={5}>Conditionals</Title>
    <pre style={codeBlock}>{`IF [TAG] == 1000 THEN [TAG2] = 0
IF [TAG] >= 500  THEN { [A] = 0; [B] = 1 }
IF myVar == "error" THEN STOP SIMULATION`}</pre>

    <Title level={5}>Control statements</Title>
    <pre style={codeBlock}>{`SLEEP 1000           // pause for 1000 ms
SLEEP 5s             // pause for 5 seconds
STOP SIMULATION      // exit LOOP, run TEARDOWN, then halt`}</pre>

    <Title level={5}>Operators</Title>
    <Table
      size="small"
      pagination={false}
      style={{ marginBottom: 8 }}
      columns={[
        { title: 'Operator', dataIndex: 'op', width: '20%' },
        { title: 'Meaning', dataIndex: 'meaning' },
      ]}
      dataSource={[
        { key: 1,  op: '+  -  *  /',    meaning: 'Arithmetic — standard precedence (* / before + -)' },
        { key: 2,  op: '==',            meaning: 'Equal to' },
        { key: 3,  op: '!=',            meaning: 'Not equal to' },
        { key: 4,  op: '>  <',          meaning: 'Greater than / less than' },
        { key: 5,  op: '>=  <=',        meaning: 'Greater than or equal / less than or equal' },
        { key: 6,  op: '+=  -=',        meaning: 'In-place increment / decrement (one-time)' },
      ]}
    />

    <Title level={5}>Time units</Title>
    <Paragraph>
      <Code>SLEEP</Code> and <Code>EVERY</Code> accept <Code>ms</Code> (milliseconds),
      <Code> s</Code> (seconds), or <Code>m</Code> (minutes):
      <Code> 500ms</Code>, <Code>10s</Code>, <Code>2m</Code>.
      A plain number is treated as milliseconds.
    </Paragraph>

    <Title level={5}>Comments</Title>
    <pre style={codeBlock}>{`// This is a comment — everything after // is ignored`}</pre>
  </Section>
);

const scriptFilesPanel = (
  <Section>
    <Paragraph>
      Scripts are saved as <Code>.sim</Code> files on your local machine. The browser's native file
      picker is used to choose the location — no files are stored on the server.
    </Paragraph>

    <Table
      size="small"
      pagination={false}
      style={{ marginBottom: 12 }}
      columns={[
        { title: 'Button', dataIndex: 'btn', width: '25%' },
        { title: 'Behaviour', dataIndex: 'desc' },
      ]}
      dataSource={[
        { key: 1, btn: 'New',     desc: 'Clear the editor and start a fresh script.' },
        { key: 2, btn: 'Open',    desc: 'Open a .sim file from your machine.' },
        { key: 3, btn: 'Save',    desc: 'Overwrite the currently open file without prompting.' },
        { key: 4, btn: 'Save As', desc: 'Choose a new name and location.' },
      ]}
    />

    <Alert
      type="info"
      showIcon
      message="The editor content is saved automatically in the browser (localStorage). Navigating to the Dashboard and back will not lose your script."
    />
  </Section>
);

const scriptExamplePanel = (
  <Section>
    <pre style={{ ...codeBlock, fontSize: 12, lineHeight: 1.7 }}>{`SETUP {
  // Initialise outputs to a known state
  [Control.Setpoint] = 0
  [Control.Mode] = "AUTO"
  SLEEP 500ms
}

LOOP {
  // Keep counter ticking in the background
  [Control.Counter] += 1 EVERY 500ms

  // Rotate mode every 2 seconds
  [Control.Mode] = ("AUTO","MANUAL","SAFE") EVERY 2s

  // Update setpoint from sensor inputs
  [Control.Setpoint] = [Sensor.InputA] + [Sensor.InputB]

  // Conditional safety reset
  IF [Sensor.Status] >= 1000 THEN [Control.Setpoint] = 0

  // Stop when sensor goes offline
  IF [Sensor.Status] == 0 THEN STOP SIMULATION

  SLEEP 1000
}

TEARDOWN {
  // Stop background timers and return to safe state
  RESET [Control.Counter]
  RESET [Control.Mode]
  [Control.Setpoint] = 0
  [Control.Reset]()
}`}</pre>
  </Section>
);

const troubleshootPanel = (
  <Section>
    <Table
      size="small"
      pagination={false}
      columns={[
        { title: 'Problem', dataIndex: 'problem', width: '35%' },
        { title: 'What to try', dataIndex: 'solution' },
      ]}
      dataSource={[
        {
          key: 1,
          problem: 'Cannot connect to the server',
          solution: 'Check the endpoint URL format (opc.tcp://host:port). Verify the OPC UA server is running and reachable from this machine. Check firewall rules for the port.',
        },
        {
          key: 2,
          problem: 'No tags or commands appear after connecting',
          solution: 'The server may expose nodes under non-standard folders. Try clicking Refresh. Some servers require authentication or specific node access permissions.',
        },
        {
          key: 3,
          problem: 'Tag write has no effect',
          solution: 'Confirm the tag has Write (W) access. Some tags are read-only by design on the server side.',
        },
        {
          key: 4,
          problem: 'Script validation error: "Tag not found"',
          solution: 'Tag names in scripts must exactly match the display name shown in the Tags table, including capitalisation and dots.',
        },
        {
          key: 5,
          problem: 'Script runs but EVERY interval never fires',
          solution: 'EVERY intervals start on the first loop iteration. Make sure the LOOP block has a SLEEP statement so the event loop can process the interval callbacks.',
        },
        {
          key: 6,
          problem: 'Command invocation returns BadInvalidArgument',
          solution: 'Verify that the argument values match the types expected by the command (visible in the Commands panel). The simulator coerces types automatically but may fail with incompatible formats.',
        },
        {
          key: 7,
          problem: 'Intervals are gone after restarting the app',
          solution: 'Interval state is held in memory and is not persisted. You need to set them again, or use a script to re-establish them on startup.',
        },
      ]}
    />
  </Section>
);

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Card style={{ marginBottom: 16 }}>
        <Space align="start">
          <QuestionCircleOutlined style={{ fontSize: 32, color: '#1677ff', marginTop: 2 }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>OPC UA Simulator — Help</Title>
            <Typography.Text type="secondary">
              Connect to an OPC UA server, interact with tags and commands, and automate sequences with scripts.
            </Typography.Text>
          </div>
        </Space>
      </Card>

      <Collapse
        accordion={false}
        defaultActiveKey={['connecting']}
        size="large"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'connecting',
            label: (
              <Space>
                <WifiOutlined style={{ color: '#1677ff' }} />
                <Text strong>Connecting to an OPC UA Server</Text>
              </Space>
            ),
            children: connectingPanel,
          },
          {
            key: 'tags',
            label: (
              <Space>
                <DashboardOutlined style={{ color: '#1677ff' }} />
                <Text strong>Tags — Viewing and Editing Values</Text>
              </Space>
            ),
            children: tagsPanel,
          },
          {
            key: 'search',
            label: (
              <Space>
                <FilterOutlined style={{ color: '#1677ff' }} />
                <Text strong>Searching and Filtering Tags</Text>
              </Space>
            ),
            children: searchFilterPanel,
          },
          {
            key: 'commands',
            label: (
              <Space>
                <PlayCircleOutlined style={{ color: '#1677ff' }} />
                <Text strong>Commands — Invoking Methods</Text>
              </Space>
            ),
            children: commandsPanel,
          },
          {
            key: 'script-overview',
            label: (
              <Space>
                <CodeOutlined style={{ color: '#1677ff' }} />
                <Text strong>Script Editor — Overview</Text>
              </Space>
            ),
            children: scriptOverviewPanel,
          },
          {
            key: 'script-syntax',
            label: (
              <Space>
                <CodeOutlined style={{ color: '#722ed1' }} />
                <Text strong>Script Language Reference</Text>
              </Space>
            ),
            children: scriptSyntaxPanel,
          },
          {
            key: 'script-files',
            label: (
              <Space>
                <FolderOpenOutlined style={{ color: '#1677ff' }} />
                <Text strong>Saving and Opening Script Files</Text>
              </Space>
            ),
            children: scriptFilesPanel,
          },
          {
            key: 'script-example',
            label: (
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text strong>Script Example — Full Script Walkthrough</Text>
              </Space>
            ),
            children: scriptExamplePanel,
          },
          {
            key: 'troubleshoot',
            label: (
              <Space>
                <QuestionCircleOutlined style={{ color: '#faad14' }} />
                <Text strong>Troubleshooting</Text>
              </Space>
            ),
            children: troubleshootPanel,
          },
        ]}
      />
    </div>
  );
}
