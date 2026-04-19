import React, { useState } from 'react';
import {
  Table, Button, Space, Tag, Tooltip, Modal, Form, Input, Typography, Divider, Alert,
} from 'antd';
import {
  PlayCircleOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnType } from 'antd/es/table';
import { CommandInfo, IntervalEntry } from '../types';
import { invokeCommand, deleteInterval } from '../services/api';
import { useApp } from '../App';
import CommandIntervalModal from './CommandIntervalModal';
import { message } from 'antd';

interface InvokeResult {
  commandName: string;
  status: string;
  outputs: unknown[];
  ok: boolean;
}

function InvokeModal({
  command,
  onClose,
}: {
  command: CommandInfo | null;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvokeResult | null>(null);

  const handleInvoke = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }

    const args = (command?.inputArguments || []).map((_, i) => {
      const raw = values[`arg_${i}`] ?? '';
      const num = Number(raw);
      return isNaN(num) || raw === '' ? raw : num;
    });

    setLoading(true);
    try {
      const res = await invokeCommand(command!.objectId, command!.nodeId, args);
      setResult({
        commandName: command!.displayName,
        status: res.status,
        outputs: res.outputs,
        ok: res.status.includes('Good'),
      });
    } catch (err: any) {
      setResult({
        commandName: command!.displayName,
        status: err.response?.data?.error || err.message,
        outputs: [],
        ok: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setResult(null); form.resetFields(); onClose(); };

  return (
    <Modal
      open={!!command}
      onCancel={handleClose}
      title={
        <Space>
          <PlayCircleOutlined />
          <span>Invoke — {command?.displayName}</span>
        </Space>
      }
      footer={[
        <Button key="close" onClick={handleClose}>Close</Button>,
        <Button key="invoke" type="primary" onClick={handleInvoke} loading={loading} icon={<PlayCircleOutlined />}>
          Invoke
        </Button>,
      ]}
    >
      {(command?.inputArguments?.length ?? 0) > 0 ? (
        <Form form={form} layout="vertical">
          <Divider orientation="left" plain>Input Arguments</Divider>
          {command?.inputArguments.map((arg, i) => (
            <Form.Item
              key={i}
              label={`${arg.name || `Argument ${i + 1}`} (${arg.dataType})`}
              name={`arg_${i}`}
              tooltip={arg.description}
            >
              <Input placeholder={arg.dataType} />
            </Form.Item>
          ))}
        </Form>
      ) : (
        <Typography.Text type="secondary">This command takes no input arguments.</Typography.Text>
      )}

      {result && (
        <>
          <Divider orientation="left" plain>Result</Divider>
          <Alert
            type={result.ok ? 'success' : 'error'}
            icon={result.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            showIcon
            message={`Status: ${result.status}`}
            description={
              result.outputs.length > 0 ? (
                <div>
                  <Typography.Text strong>Outputs:</Typography.Text>
                  {result.outputs.map((o, i) => (
                    <div key={i}><Typography.Text code>{String(o)}</Typography.Text></div>
                  ))}
                </div>
              ) : undefined
            }
          />
        </>
      )}
    </Modal>
  );
}

export default function CommandPanel() {
  const { commands, intervals, setIntervals } = useApp();
  const [invokeCmd, setInvokeCmd] = useState<CommandInfo | null>(null);
  const [intervalCmd, setIntervalCmd] = useState<CommandInfo | null>(null);

  const commandIntervals = intervals.filter((i) => i.type === 'command');

  const handleRemoveInterval = async (id: string) => {
    try {
      await deleteInterval(id);
      setIntervals((prev) => prev.filter((i) => i.id !== id));
      message.success('Interval stopped');
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const columns: ColumnType<CommandInfo>[] = [
    {
      title: 'Command',
      dataIndex: 'displayName',
      key: 'displayName',
      sorter: (a, b) => a.displayName.localeCompare(b.displayName),
      render: (name) => <Typography.Text strong>{name}</Typography.Text>,
      width: '35%',
    },
    {
      title: 'Input Args',
      key: 'inputArgs',
      width: '30%',
      render: (_, record) =>
        record.inputArguments.length === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <Space size={[4, 4]} wrap>
            {record.inputArguments.map((a, i) => (
              <Tag key={i} style={{ fontSize: 11 }}>{a.name || `arg${i}`}: {a.dataType}</Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Output Args',
      key: 'outputArgs',
      width: '25%',
      render: (_, record) =>
        record.outputArguments.length === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <Space size={[4, 4]} wrap>
            {record.outputArguments.map((a, i) => (
              <Tag key={i} color="purple" style={{ fontSize: 11 }}>{a.name || `out${i}`}: {a.dataType}</Tag>
            ))}
          </Space>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: '10%',
      render: (_, record) => (
        <Space>
          <Tooltip title="Invoke command">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<PlayCircleOutlined />}
              onClick={() => setInvokeCmd(record)}
            />
          </Tooltip>
          <Tooltip title="Set repeating interval">
            <Button
              size="small"
              icon={<ClockCircleOutlined />}
              onClick={() => setIntervalCmd(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        dataSource={commands}
        columns={columns}
        rowKey="nodeId"
        size="small"
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `${t} commands` }}
        scroll={{ y: 340 }}
        locale={{ emptyText: 'No commands — connect to an OPC UA server first' }}
      />

      {commandIntervals.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Active Intervals:</Typography.Text>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {commandIntervals.map((entry) => (
              <Tag
                key={entry.id}
                color="purple"
                closable
                onClose={() => handleRemoveInterval(entry.id)}
                style={{ fontSize: 12 }}
              >
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                {entry.label}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <InvokeModal command={invokeCmd} onClose={() => setInvokeCmd(null)} />
      <CommandIntervalModal command={intervalCmd} onClose={() => setIntervalCmd(null)} />
    </>
  );
}
