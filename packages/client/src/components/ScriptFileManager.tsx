import React, { useState, useEffect } from 'react';
import {
  Button, Space, Dropdown, Modal, Input, Typography, List, Popconfirm, Tooltip,
} from 'antd';
import {
  FileAddOutlined, FolderOpenOutlined, SaveOutlined, DeleteOutlined, FileOutlined,
} from '@ant-design/icons';
import { ScriptFile } from '../types';
import { getScripts, saveScript, deleteScript, getScript } from '../services/api';
import { message } from 'antd';

interface Props {
  currentName: string | null;
  setCurrentName: (name: string | null) => void;
  content: string;
  onLoad: (content: string, name: string) => void;
  onNew: () => void;
}

export default function ScriptFileManager({ currentName, setCurrentName, content, onLoad, onNew }: Props) {
  const [scripts, setScripts] = useState<ScriptFile[]>([]);
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadScriptList = async () => {
    try {
      const list = await getScripts();
      setScripts(list);
    } catch {}
  };

  useEffect(() => { loadScriptList(); }, []);

  const handleSave = async () => {
    if (!currentName) { setSaveAsVisible(true); return; }
    setSaving(true);
    try {
      await saveScript(currentName, content);
      message.success(`Saved: ${currentName}`);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    if (!newName.trim()) { message.warning('Enter a script name'); return; }
    setSaving(true);
    try {
      await saveScript(newName.trim(), content);
      setCurrentName(newName.trim());
      message.success(`Saved as: ${newName.trim()}`);
      setSaveAsVisible(false);
      setNewName('');
      await loadScriptList();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async (name: string) => {
    try {
      const file = await getScript(name);
      onLoad(file.content, file.name);
      setOpenModalVisible(false);
      message.success(`Loaded: ${name}`);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteScript(name);
      setScripts((prev) => prev.filter((s) => s.name !== name));
      if (currentName === name) setCurrentName(null);
      message.success(`Deleted: ${name}`);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  return (
    <>
      <Space wrap>
        <Tooltip title="New script">
          <Button icon={<FileAddOutlined />} onClick={onNew}>New</Button>
        </Tooltip>

        <Button
          icon={<FolderOpenOutlined />}
          onClick={() => { loadScriptList(); setOpenModalVisible(true); }}
        >
          Open
        </Button>

        <Button
          icon={<SaveOutlined />}
          type="primary"
          ghost
          onClick={handleSave}
          loading={saving}
        >
          Save
        </Button>

        <Button
          icon={<SaveOutlined />}
          onClick={() => { setNewName(currentName || ''); setSaveAsVisible(true); }}
        >
          Save As…
        </Button>

        {currentName && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <FileOutlined style={{ marginRight: 6 }} />
            {currentName}.sim
          </Typography.Text>
        )}
      </Space>

      {/* Open Script Modal */}
      <Modal
        open={openModalVisible}
        onCancel={() => setOpenModalVisible(false)}
        title={<Space><FolderOpenOutlined /> Open Script</Space>}
        footer={<Button onClick={() => setOpenModalVisible(false)}>Close</Button>}
      >
        {scripts.length === 0 ? (
          <Typography.Text type="secondary">No saved scripts yet.</Typography.Text>
        ) : (
          <List
            dataSource={scripts}
            renderItem={(s) => (
              <List.Item
                key={s.name}
                actions={[
                  <Button
                    key="open"
                    type="link"
                    onClick={() => handleOpen(s.name)}
                  >
                    Open
                  </Button>,
                  <Popconfirm
                    key="del"
                    title={`Delete "${s.name}"?`}
                    onConfirm={() => handleDelete(s.name)}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Button type="link" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FileOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                  title={`${s.name}.sim`}
                  description={`Last saved: ${new Date(s.updatedAt).toLocaleString()}`}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* Save As Modal */}
      <Modal
        open={saveAsVisible}
        onCancel={() => setSaveAsVisible(false)}
        title={<Space><SaveOutlined /> Save Script As</Space>}
        onOk={handleSaveAs}
        okText="Save"
        confirmLoading={saving}
      >
        <Input
          placeholder="Script name (no extension)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleSaveAs}
          autoFocus
        />
      </Modal>
    </>
  );
}
