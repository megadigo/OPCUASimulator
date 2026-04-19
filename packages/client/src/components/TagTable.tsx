import React, { useRef, useState, useEffect, useCallback } from 'react';
import '../flash.css';
import {
  Table, Button, Space, Tag, Tooltip, Input, Typography, Alert,
} from 'antd';
import {
  EditOutlined, ClockCircleOutlined, CheckOutlined, CloseOutlined,
  SaveOutlined, FilterOutlined, ClearOutlined, FolderOpenOutlined,
} from '@ant-design/icons';
import type { ColumnType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import { TagInfo } from '../types';
import { writeTag, deleteInterval } from '../services/api';
import { useApp } from '../App';
import TagIntervalModal from './TagIntervalModal';
import { message } from 'antd';
import { getSocket } from '../services/socket';

const hasFileSystemAccess = typeof (window as any).showSaveFilePicker === 'function';

function matchesSearch(name: string, token: string): boolean {
  return name.toLowerCase().includes(token.toLowerCase());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// OPC UA built-in DataType NodeId → friendly label
// https://reference.opcfoundation.org/Core/Part3/v104/docs/8.1
const OPC_TYPE_MAP: Record<number, string> = {
  1: 'Boolean',
  2: 'SByte',
  3: 'Byte',
  4: 'Int16',
  5: 'UInt16',
  6: 'Int32',
  7: 'UInt32',
  8: 'Int64',
  9: 'UInt64',
  10: 'Float',
  11: 'Double',
  12: 'String',
  13: 'DateTime',
  14: 'Guid',
  15: 'ByteString',
  16: 'XmlElement',
  17: 'NodeId',
  21: 'Integer',
  26: 'Number',
  27: 'Integer',
  28: 'UInteger',
};

function resolveDataTypeLabel(dt: string | undefined): string {
  if (!dt) return '—';
  // Try to extract the numeric id from formats like "ns=0;i=11" or "i=11"
  const match = dt.match(/(?:^|;)i=(\d+)/);
  if (match) {
    const id = Number(match[1]);
    return OPC_TYPE_MAP[id] ?? `i=${id}`;
  }
  // Already a friendly name (e.g. "Double")
  return dt;
}

function AccessBadge({ level }: { level: number }) {
  return (
    <Space size={4}>
      {!!(level & 1) && <Tag color="blue"  style={{ fontSize: 10, padding: '0 4px' }}>R</Tag>}
      {!!(level & 2) && <Tag color="green" style={{ fontSize: 10, padding: '0 4px' }}>W</Tag>}
    </Space>
  );
}

function EditCell({ tag, onSaved, hasInterval }: { tag: TagInfo; onSaved: () => void; hasInterval: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(formatValue(tag.value));
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await writeTag(tag.nodeId, val, tag.dataType);
      message.success(`${tag.displayName} updated`);
      setEditing(false);
      onSaved();
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Space>
        <Typography.Text code style={{ minWidth: 80, display: 'inline-block' }}>
          {formatValue(tag.value)}
        </Typography.Text>
        {!!(tag.accessLevel & 2) && !hasInterval && (
          <Tooltip title="Edit value">
            <Button size="small" icon={<EditOutlined />}
              onClick={() => { setVal(formatValue(tag.value)); setEditing(true); }} />
          </Tooltip>
        )}
      </Space>
    );
  }

  return (
    <Space>
      <Input
        size="small" value={val}
        onChange={(e) => setVal(e.target.value)}
        onPressEnter={save}
        style={{ width: 120 }}
        autoFocus
      />
      <Button size="small" type="primary" icon={<CheckOutlined />} loading={saving} onClick={save} />
      <Button size="small" icon={<CloseOutlined />} onClick={() => setEditing(false)} />
    </Space>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TagTable() {
  const { tags, intervals, setIntervals, reloadData } = useApp();
  const [intervalTag, setIntervalTag] = useState<TagInfo | null>(null);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  const flash = useCallback((nodeId: string) => {
    setFlashingIds((prev) => new Set([...prev, nodeId]));
    setTimeout(() => setFlashingIds((prev) => { const n = new Set(prev); n.delete(nodeId); return n; }), 750);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: any) => { if (data.nodeId) flash(data.nodeId); };
    socket.on('tag:update', handler);
    return () => { socket.off('tag:update', handler); };
  }, [flash]);

  const openInputRef = useRef<HTMLInputElement>(null);

  // Checkbox selection (node IDs of checked rows)
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);

  // Whether the filter is currently applied (table restricted to checked rows)
  const [filterApplied, setFilterApplied] = useState(false);

  // Search input value
  const [pattern, setPattern] = useState('');
  // Applied search token — filters visible rows (set on Enter)
  const [searchToken, setSearchToken] = useState('');

  // ── Enter: filter visible rows by current pattern ─────────────────────────
  const applySearch = () => {
    setSearchToken(pattern.trim());
  };

  // ── Apply / Change / Clear ────────────────────────────────────────────────
  const applyFilter = () => {
    if (checkedKeys.length === 0) { message.warning('Check at least one tag first'); return; }
    setFilterApplied(true);
  };

  const changeFilter = () => {
    setFilterApplied(false);
    setSearchToken('');
    setPattern('');
  };

  const clearFilter = () => {
    setFilterApplied(false);
    setCheckedKeys([]);
    setPattern('');
    setSearchToken('');
  };

  // ── Save filter to file ───────────────────────────────────────────────────
  const saveFilter = async () => {
    if (checkedKeys.length === 0) { message.warning('Check at least one tag before saving'); return; }
    const names = tags.filter((t) => checkedKeys.includes(t.nodeId)).map((t) => t.displayName);
    const text = names.join('\n');

    if (hasFileSystemAccess) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'filter.tags',
          types: [{ description: 'Tag Filter', accept: { 'text/plain': ['.tags'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        message.success(`Filter saved (${names.length} tags)`);
      } catch (err: any) {
        if (err.name !== 'AbortError') message.error(err.message);
      }
    } else {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'filter.tags'; a.click();
      URL.revokeObjectURL(url);
    }
  };

  // ── Load filter from file ─────────────────────────────────────────────────
  const loadFilterFromText = (text: string) => {
    const names = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const matchingIds = tags.filter((t) => names.includes(t.displayName)).map((t) => t.nodeId);
    if (matchingIds.length === 0) { message.warning('No matching tags found in file'); return; }
    setCheckedKeys(matchingIds);
    setFilterApplied(true);
    message.success(`Filter loaded — ${matchingIds.length} tag(s) selected`);
  };

  const loadFilter = async () => {
    if (hasFileSystemAccess) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'Tag Filter', accept: { 'text/plain': ['.tags'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        loadFilterFromText(await file.text());
      } catch (err: any) {
        if (err.name !== 'AbortError') message.error(err.message);
      }
    } else {
      openInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadFilterFromText(reader.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Rows shown in the table ───────────────────────────────────────────────
  const visibleTags = filterApplied
    ? tags.filter((t) => checkedKeys.includes(t.nodeId))
    : searchToken
      ? tags.filter((t) => matchesSearch(t.displayName, searchToken))
      : tags;

  const checkedCount = checkedKeys.length;

  // ── Row selection config (Ant Design built-in checkboxes) ────────────────
  const rowSelection: TableRowSelection<TagInfo> = {
    selectedRowKeys: checkedKeys,
    onChange: (keys) => {
      // Only update the checked state for rows currently visible.
      // Keys from previous searches (hidden rows) are preserved.
      const visibleIds = new Set(visibleTags.map((t) => t.nodeId));
      setCheckedKeys((prev) => [
        ...prev.filter((k) => !visibleIds.has(k)),
        ...(keys as string[]),
      ]);
    },
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_NONE,
      Table.SELECTION_INVERT,
    ],
  };

  // ── Intervals ─────────────────────────────────────────────────────────────
  const tagIntervals = intervals.filter((i) => i.type === 'tag');

  const handleRemoveInterval = async (id: string) => {
    try {
      await deleteInterval(id);
      setIntervals((prev) => prev.filter((i) => i.id !== id));
      message.success('Interval stopped');
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: ColumnType<TagInfo>[] = [
    {
      title: 'Tag Name',
      dataIndex: 'displayName',
      key: 'displayName',
      sorter: (a, b) => a.displayName.localeCompare(b.displayName),
      render: (name) => <Typography.Text strong>{name}</Typography.Text>,
      width: '38%',
    },
    {
      title: 'Current Value',
      key: 'value',
      width: '22%',
      render: (_, record) => (
        <EditCell
          tag={record}
          onSaved={reloadData}
          hasInterval={!!tagIntervals.find((i) => i.nodeId === record.nodeId)}
        />
      ),
    },
    {
      title: 'Type',
      dataIndex: 'dataType',
      key: 'dataType',
      width: '9%',
      render: (dt) => (
        <Tag style={{ fontSize: 11 }}>
          {resolveDataTypeLabel(dt)}
        </Tag>
      ),
    },
    {
      title: 'Access',
      dataIndex: 'accessLevel',
      key: 'accessLevel',
      width: '7%',
      render: (level) => <AccessBadge level={level} />,
    },
    {
      title: 'Repeating Action',
      key: 'actions',
      width: '22%',
      render: (_, record) => {
        const active = tagIntervals.find((i) => i.nodeId === record.nodeId);
        if (active) {
          return (
            <Tag
              color={active.mode === 'increment' ? 'cyan' : 'blue'}
              closable
              onClose={() => handleRemoveInterval(active.id)}
              style={{ fontSize: 11, maxWidth: '100%', whiteSpace: 'normal', lineHeight: '18px' }}
            >
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {active.label}
            </Tag>
          );
        }
        if (!(record.accessLevel & 2)) return null;
        return (
          <Tooltip title="Set repeating interval / counter">
            <Button size="small" icon={<ClockCircleOutlined />} onClick={() => setIntervalTag(record)} />
          </Tooltip>
        );
      },
    },
  ];

  return (
    <>
      {/* Hidden fallback file input */}
      <input ref={openInputRef} type="file" accept=".tags" style={{ display: 'none' }} onChange={handleFileInput} />

      {/* ── Search toolbar ─────────────────────────────────────────────── */}
      <Space wrap style={{ marginBottom: 8 }}>
        <FilterOutlined style={{ color: '#999' }} />
        <Input
          style={{ width: 240 }}
          placeholder="Search tags by name — press Enter"
          value={pattern}
          onChange={(e) => { setPattern(e.target.value); if (!e.target.value) setSearchToken(''); }}
          onPressEnter={applySearch}
          allowClear
          disabled={filterApplied}
        />
      </Space>

      {/* ── Filter action buttons ───────────────────────────────────────── */}
      <Space wrap style={{ marginBottom: 10 }}>
        {filterApplied ? (
          <Button icon={<FilterOutlined />} onClick={changeFilter}>
            Change Filter
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<FilterOutlined />}
            onClick={applyFilter}
            disabled={checkedCount === 0}
          >
            Apply Filter{checkedCount > 0 ? ` (${checkedCount})` : ''}
          </Button>
        )}
        <Button icon={<SaveOutlined />} onClick={saveFilter} disabled={checkedCount === 0}>
          Save Filter
        </Button>
        <Button icon={<FolderOpenOutlined />} onClick={loadFilter}>
          Load Filter
        </Button>
        {(checkedCount > 0 || filterApplied) && (
          <Button icon={<ClearOutlined />} onClick={clearFilter}>Clear</Button>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {filterApplied
            ? `Showing ${visibleTags.length} of ${tags.length} tags`
            : searchToken
              ? `${visibleTags.length} of ${tags.length} tags match "${searchToken}"${checkedCount > 0 ? ` · ${checkedCount} checked` : ''}`
              : checkedCount > 0
                ? `${tags.length} tags · ${checkedCount} checked`
                : `${tags.length} tags`}
        </Typography.Text>
      </Space>

      {/* Active filter banner */}
      {filterApplied && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8, padding: '4px 12px' }}
          message={`Filter active — ${visibleTags.length} tag(s) shown`}
          action={
            <Button size="small" onClick={clearFilter} icon={<ClearOutlined />}>
              Clear Filter
            </Button>
          }
        />
      )}

      {/* ── Tag table with built-in checkboxes ─────────────────────────── */}
      <Table
        dataSource={visibleTags}
        columns={columns}
        rowKey="nodeId"
        size="small"
        rowSelection={rowSelection}
        rowClassName={(record) => flashingIds.has(record.nodeId) ? 'row-flash' : ''}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} tags` }}
        locale={{ emptyText: filterApplied ? 'No tags match the applied filter' : searchToken ? `No tags match "${searchToken}"` : 'No tags — connect to an OPC UA server first' }}
      />

      <TagIntervalModal tag={intervalTag} onClose={() => setIntervalTag(null)} />
    </>
  );
}
