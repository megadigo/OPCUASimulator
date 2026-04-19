import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, Button, Space, Typography, Divider } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { CommandInfo } from '../types';
import { startCommandInterval } from '../services/api';
import { useApp } from '../App';
import { message } from 'antd';

interface Props {
  command: CommandInfo | null;
  onClose: () => void;
}

export default function CommandIntervalModal({ command, onClose }: Props) {
  const { setIntervals } = useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }

    const args = (command?.inputArguments || []).map((_, i) => values[`arg_${i}`] ?? '');

    setLoading(true);
    try {
      const entry = await startCommandInterval(
        command!.objectId,
        command!.nodeId,
        command!.displayName,
        args,
        values.intervalSec * 1000
      );
      setIntervals((prev) => [...prev, entry]);
      message.success(`Interval started: ${command!.displayName}() every ${values.intervalSec}s`);
      onClose();
    } catch (err: any) {
      message.error(`Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const hasArgs = (command?.inputArguments?.length ?? 0) > 0;

  return (
    <Modal
      open={!!command}
      onCancel={onClose}
      title={
        <Space>
          <ClockCircleOutlined />
          <span>Repeat Command — {command?.displayName}</span>
        </Space>
      }
      footer={[
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="start" type="primary" onClick={handleStart} loading={loading}>
          Start Interval
        </Button>,
      ]}
    >
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        The command <b>{command?.displayName}</b> will be invoked repeatedly at the given interval.
      </Typography.Text>

      <Form form={form} layout="vertical" initialValues={{ intervalSec: 10 }}>
        {hasArgs && (
          <>
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
          </>
        )}

        <Form.Item
          label="Repeat every (seconds)"
          name="intervalSec"
          rules={[{ required: true, type: 'number', min: 1, message: 'Enter a positive interval' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} addonAfter="seconds" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
