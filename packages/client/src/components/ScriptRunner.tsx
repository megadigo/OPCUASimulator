import React, { useState, useEffect, useRef } from 'react';
import {
  Button, Space, Tag, Typography, Alert, List, Badge,
} from 'antd';
import { PlayCircleOutlined, StopOutlined, ClearOutlined } from '@ant-design/icons';
import { runScript, stopScript, parseScript } from '../services/api';
import { getSocket } from '../services/socket';
import { LogEntry, ParseError } from '../types';
import { message } from 'antd';

interface Props {
  content: string;
}

const LOG_COLORS: Record<string, string> = {
  info: '#1677ff',
  warn: '#faad14',
  error: '#ff4d4f',
};

export default function ScriptRunner({ content }: Props) {
  const [running, setRunning] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [validating, setValidating] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();

    socket.on('script:log', (entry: LogEntry) => {
      setLogs((prev) => [...prev.slice(-499), entry]); // keep last 500 entries
    });

    socket.on('script:status', ({ running: r, block }: { running: boolean; block: string | null }) => {
      setRunning(r);
      setCurrentBlock(block);
    });

    return () => {
      socket.off('script:log');
      socket.off('script:status');
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await parseScript(content);
      if (result.errors.length === 0) {
        setParseErrors([]);
        message.success('Script is valid — no errors found');
      } else {
        setParseErrors(result.errors);
        message.error(`${result.errors.length} parse error(s) found`);
      }
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleRun = async () => {
    // Validate first
    const result = await parseScript(content);
    if (result.errors.length > 0) {
      setParseErrors(result.errors);
      message.error('Fix parse errors before running');
      return;
    }
    setParseErrors([]);
    setLogs([]);

    try {
      await runScript(content);
      setRunning(true);
    } catch (err: any) {
      const errors = err.response?.data?.errors as ParseError[] | undefined;
      if (errors?.length) {
        setParseErrors(errors);
        message.error('Parse errors — fix them before running');
      } else {
        message.error(err.response?.data?.error || err.message);
      }
    }
  };

  const handleStop = async () => {
    try {
      await stopScript();
      setRunning(false);
      setCurrentBlock(null);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const statusBadge = running ? (
    <Badge status="processing" text={`Running — ${currentBlock || '…'}`} />
  ) : (
    <Badge status="default" text="Stopped" />
  );

  return (
    <div>
      {/* Controls */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Button
          icon={<PlayCircleOutlined />}
          type="primary"
          onClick={handleRun}
          disabled={running}
        >
          Run
        </Button>
        <Button
          icon={<StopOutlined />}
          danger
          onClick={handleStop}
          disabled={!running}
        >
          Stop
        </Button>
        <Button
          onClick={handleValidate}
          loading={validating}
        >
          Validate
        </Button>
        <Button
          icon={<ClearOutlined />}
          onClick={() => setLogs([])}
          disabled={running}
        >
          Clear Log
        </Button>
        <span style={{ marginLeft: 8 }}>{statusBadge}</span>
      </Space>

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <Alert
          type="error"
          style={{ marginBottom: 12 }}
          message={`${parseErrors.length} parse error(s)`}
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {parseErrors.map((e, i) => (
                <li key={i}>Line {e.line}: {e.message}</li>
              ))}
            </ul>
          }
          showIcon
          closable
          onClose={() => setParseErrors([])}
        />
      )}

      {/* Execution log */}
      <div
        style={{
          background: '#1a1a1a',
          borderRadius: 6,
          padding: '8px 12px',
          height: 220,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        {logs.length === 0 ? (
          <Typography.Text style={{ color: '#666' }}>
            Log output will appear here when the script runs…
          </Typography.Text>
        ) : (
          logs.map((entry, i) => (
            <div key={i} style={{ marginBottom: 2 }}>
              <span style={{ color: '#666' }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>{' '}
              <span style={{ color: LOG_COLORS[entry.level] ?? '#fff', fontWeight: entry.level === 'error' ? 'bold' : 'normal' }}>
                {entry.message}
              </span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
