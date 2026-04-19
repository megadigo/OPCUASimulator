import React, { useState } from 'react';
import { Card, Row, Col, Divider, Typography, Space, Alert } from 'antd';
import { CodeOutlined, BulbOutlined } from '@ant-design/icons';
import ScriptEditor, { DEFAULT_SCRIPT } from '../components/ScriptEditor';
import ScriptRunner from '../components/ScriptRunner';
import ScriptFileManager from '../components/ScriptFileManager';
import { useApp } from '../App';

const DSL_REFERENCE = `ALWAYS { }       Repeat each line on its own independent timer
ONSTART { }      Run once at startup (sequential, before ALWAYS)
ONCE { }         Run once after ONSTART (sequential)

── Repeating (ALWAYS block) ──────────────────────────────
TAG = 100 every 10s          Set TAG to 100 every 10 s
TAG = +10 every 20s          Increment TAG by 10 every 20 s
TAG = -5 every 1s            Decrement TAG by 5 every 1 s
INVOQUE CMD(a) every 5s      Invoke command every 5 s

── Sequential (ONSTART / ONCE) ───────────────────────────
TAG = value                  Write a fixed value
TAG_C = TAG_A + TAG_B        Compute expression (live values)
TAG_C = TAG_A - 10           Expression with literal
RESPONSE = CMD_A(10, 20)     Call command, capture result
RESPONSE = INVOQUE CMD(a)    Same with explicit INVOQUE
IF VAR == "OK" THEN TAG = 1  Condition with == operator
IF VAR == 100 THEN STOP_SCRIPT  Stop when condition is met
SLEEP 1000                   Pause 1000 ms

── Time units ────────────────────────────────────────────
500ms  |  10s  |  2m`;

export default function ScriptPage() {
  const { connectionStatus } = useApp();
  const [content, setContent] = useState(DEFAULT_SCRIPT);
  const [currentName, setCurrentName] = useState<string | null>(null);

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
{`ALWAYS {
  TAG_A = 100 every 10s
  TAG_B = +10 every 20s
  INVOQUE CMD_A(1) every 30s
}

ONSTART {
  RESPONSE = CMD_A(100, 200)
  IF RESPONSE == 0 THEN TAG_A = 200
  IF RESPONSE == "ERR" THEN STOP_SCRIPT
  TAG_C = TAG_A + TAG_B
  SLEEP 1000
}

ONCE {
  TAG_C = "2000"
  IF TAG_A == 10000 THEN STOP_SCRIPT
}`}
            </pre>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
