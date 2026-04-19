import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Divider, Typography, Space, Alert } from 'antd';
import { CodeOutlined, BulbOutlined } from '@ant-design/icons';
import ScriptEditor, { DEFAULT_SCRIPT } from '../components/ScriptEditor';
import ScriptRunner from '../components/ScriptRunner';
import ScriptFileManager from '../components/ScriptFileManager';
import { useApp } from '../App';

const DSL_REFERENCE = `── Blocks ────────────────────────────────────────────────
SETUP { }        Runs once at the start of the simulation
LOOP { }         Repeats continuously while running
TEARDOWN { }     Runs once before the simulation stops

Statements outside any block are treated as SETUP.

── Tags / Commands ───────────────────────────────────────
[TagName]                        Reference a tag
[CmdName](args)                  Invoke a command

── Write / Read ──────────────────────────────────────────
[TAG] = 100                      Write static value
[TAG] = "text"                   Write string
[TAG] = true                     Write boolean
[TAG] = [TAGA] + [TAGB]          Write arithmetic expression
[TAG] += 1                       One-time increment
[TAG] -= 1                       One-time decrement
myVar = [TAG]                    Read tag into variable
myVar = [Cmd.Name](a, b)         Execute command, store result
[Cmd.Name](a, b)                 Execute command, discard result

── Repeating intervals ───────────────────────────────────
[TAG] = 100 EVERY 1000ms         Write value every interval
[TAG] += 1 EVERY 500ms           Increment every interval
[TAG] = (100,200,300) EVERY 1s   Rotate through values
[Cmd](a, b) EVERY 2000ms         Invoke command every interval
RESET [TAG]                      Stop active interval

── Control ───────────────────────────────────────────────
IF [TAG] == 1000 THEN [TAG2] = 0
IF [TAG] >= 500 THEN { [A]=0; [B]=1 }
IF myVar == "err" THEN STOP SIMULATION
SLEEP 1000                       Pause for 1000 ms
STOP SIMULATION                  Stop the script

── Operators ─────────────────────────────────────────────
+  -  *  /    arithmetic (standard precedence)
==  !=  >  <  >=  <=  comparison
// comment`;

export default function ScriptPage() {
  const { connectionStatus } = useApp();
  const [content, setContent] = useState<string>(() => localStorage.getItem('opcua-sim-script') ?? DEFAULT_SCRIPT);
  const [currentName, setCurrentName] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('opcua-sim-script', content);
  }, [content]);

  const handleNew = () => {
    setContent(DEFAULT_SCRIPT);
    setCurrentName(null);
  };

  const handleLoad = (newContent: string, name: string) => {
    setContent(newContent);
    setCurrentName(name);
  };

  return (
    <div>
      {connectionStatus !== 'connected' && (
        <Alert
          type="warning"
          showIcon
          message="Not connected to an OPC UA server. Connect from the Dashboard before running scripts."
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      <Row gutter={16}>
        {/* Editor panel */}
        <Col xs={24} xl={16}>
          <Card
            title={
              <Space>
                <CodeOutlined />
                <span>Script Editor</span>
              </Space>
            }
            extra={
              <ScriptFileManager
                currentName={currentName}
                setCurrentName={setCurrentName}
                content={content}
                onLoad={handleLoad}
                onNew={handleNew}
              />
            }
            style={{ marginBottom: 16 }}
          >
            <ScriptEditor value={content} onChange={setContent} />

            <Divider style={{ margin: '16px 0' }} />

            <ScriptRunner content={content} />
          </Card>
        </Col>

        {/* Reference panel */}
        <Col xs={24} xl={8}>
          <Card
            title={
              <Space>
                <BulbOutlined style={{ color: '#faad14' }} />
                <span>Script Reference</span>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <pre
              style={{
                background: '#f6f8fa',
                borderRadius: 6,
                padding: 12,
                fontSize: 12,
                lineHeight: 1.8,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                margin: 0,
                color: '#24292f',
              }}
            >
              {DSL_REFERENCE}
            </pre>
          </Card>

          <Card title="Example Script" size="small">
            <pre
              style={{
                background: '#f6f8fa',
                borderRadius: 6,
                padding: 12,
                fontSize: 11,
                lineHeight: 1.7,
                overflow: 'auto',
                whiteSpace: 'pre',
                margin: 0,
                color: '#24292f',
              }}
            >
{`SETUP {
  [Control.Setpoint] = 0
  status = [Sensor.Status]
  [Control.Init]()
}

LOOP {
  [Control.Counter] += 1 EVERY 500ms
  [Control.Mode] = (0,1,2) EVERY 2000ms
  [Control.Setpoint] = [Sensor.InputA] + [Sensor.InputB]

  IF [Sensor.Status] >= 1000 THEN [Control.Setpoint] = 0
  IF [Sensor.Status] == 0 THEN STOP SIMULATION

  SLEEP 1000
}

TEARDOWN {
  RESET [Control.Counter]
  RESET [Control.Mode]
  [Control.Setpoint] = 0
  [Control.Reset]()
}`}
            </pre>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
