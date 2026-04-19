import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, Button, Space, Segmented, Alert, Select } from 'antd';
import { ClockCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { TagInfo } from '../types';
import { startTagInterval, startTagIncrementInterval } from '../services/api';
import { useApp } from '../App';
import { message } from 'antd';

interface Props {
  tag: TagInfo | null;
  onClose: () => void;
}

type Mode = 'set' | 'increment';

function isNumericType(dt: string | undefined): boolean {
  if (!dt) return false;
  return !!(dt.match(/i=(10|11|6|7|4|5|3|8|9)/) ||
    ['Float', 'Double', 'Int16', 'Int32', 'UInt16', 'UInt32', 'Int64', 'UInt64'].includes(dt));
}

function isBooleanType(dt: string | undefined): boolean {
  if (!dt) return false;
  return !!(dt.match(/(?:^|;)i=1$/) || dt === 'Boolean');
}

const BOOL_OPTIONS = [
  { label: 'true', value: 'true' },
  { label: 'false', value: 'false' },
];

export default function TagIntervalModal({ tag, onClose }: Props) {
  const { setIntervals } = useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('set');

  const isNumeric = isNumericType(tag?.dataType);
  const isBoolean = isBooleanType(tag?.dataType);

  const handleStart = async () => {
    let fields: any;
    try { fields = await form.validateFields(); } catch { return; }

    if (!tag?.nodeId) {
      message.error('Tag node ID is missing — reconnect and try again');
      return;
    }

    setLoading(true);
    try {
      const intervalMs = Number(fields.intervalMs);
      if (!intervalMs || intervalMs <= 0) {
        message.error('Interval must be a positive number');
        return;
      }

      let entry;
      if (mode === 'increment') {
        const delta = Number(fields.delta);
        entry = await startTagIncrementInterval(tag.nodeId, tag.displayName, delta, intervalMs);
        message.success(`Counter started: ${tag.displayName} ${delta >= 0 ? '+' : ''}${delta} every ${intervalMs}ms`);
      } else {
        const values = [fields.val0, fields.val1, fields.val2]
          .filter((v) => v !== undefined && v !== '' && v !== null);
        if (values.length === 0) {
          message.error('Enter at least one value');
          return;
        }
        entry = await startTagInterval(tag.nodeId, tag.displayName, values, intervalMs);
        message.success(`Interval started: [${values.join(' → ')}] every ${intervalMs}ms`);
      }

      setIntervals((prev) => [...prev, entry]);
      handleClose();
    } catch (err: any) {
      message.error(`Failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setMode('set');
    onClose();
  };

  const valueInput = (required?: boolean, autoFocus?: boolean) =>
    isBoolean
      ? <Select allowClear={!required} placeholder="Select..." options={BOOL_OPTIONS} style={{ width: '100%' }} autoFocus={autoFocus} />
      : <Input placeholder={required ? 'e.g. 100' : 'optional'} autoFocus={autoFocus} />;

  return (
    <Modal
      open={!!tag}
      onCancel={handleClose}
      title={
        <Space>
          <ClockCircleOutlined />
          <span>Set Repeating Action — {tag?.displayName}</span>
        </Space>
      }
      footer={[
        <Button key="cancel" onClick={handleClose}>Cancel</Button>,
        <Button key="start" type="primary" onClick={handleStart} loading={loading} icon={<ClockCircleOutlined />}>
          Start
        </Button>,
      ]}
    >
      <Form.Item label="Mode" style={{ marginBottom: 16 }}>
        <Segmented
          value={mode}
          onChange={(v) => { setMode(v as Mode); form.resetFields(['val0', 'val1', 'val2', 'delta']); }}
          options={[
            { label: 'Set to value', value: 'set' },
            { label: 'Increment by', value: 'increment', icon: <PlusOutlined />, disabled: !isNumeric },
          ]}
          block
        />
      </Form.Item>

      {mode === 'increment' && (
        <Alert
          type="info"
          showIcon
          message="Counter mode — the tag value will be increased (or decreased) by the given amount on each tick."
          style={{ marginBottom: 16 }}
        />
      )}

      {mode === 'set' && (
        <Alert
          type="info"
          showIcon
          message="Values rotate in order on each tick. Leave slots 2 and 3 empty to use a single fixed value."
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical" initialValues={{ val0: '', val1: '', val2: '', delta: 1, intervalMs: 10000 }}>
        {mode === 'set' ? (
          <>
            <Form.Item
              label="Value 1"
              name="val0"
              rules={[{ required: true, message: 'Enter at least one value' }]}
            >
              {valueInput(true, true)}
            </Form.Item>
            <Form.Item label="Value 2 (optional)" name="val1">
              {valueInput()}
            </Form.Item>
            <Form.Item label="Value 3 (optional)" name="val2">
              {valueInput()}
            </Form.Item>
          </>
        ) : (
          <Form.Item
            label="Increment by (use negative to decrement)"
            name="delta"
            rules={[{ required: true, type: 'number', message: 'Enter a numeric increment' }]}
          >
            <InputNumber style={{ width: '100%' }} placeholder="e.g. 1" />
          </Form.Item>
        )}

        <Form.Item
          label="Repeat every (ms)"
          name="intervalMs"
          rules={[{ required: true, type: 'number', min: 1, message: 'Enter a positive interval' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} addonAfter="ms" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
