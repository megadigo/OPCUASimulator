import React, { useRef, useState } from 'react';
import { Button, Space, Tooltip, Typography } from 'antd';
import { FileAddOutlined, FolderOpenOutlined, SaveOutlined, FileOutlined } from '@ant-design/icons';
import { message } from 'antd';

// File System Access API — not in all TS libs, use window casts
const hasFileSystemAccess = typeof (window as any).showSaveFilePicker === 'function';

interface Props {
  currentName: string | null;
  setCurrentName: (name: string | null) => void;
  content: string;
  onLoad: (content: string, name: string) => void;
  onNew: () => void;
}

export default function ScriptFileManager({ currentName, setCurrentName, content, onLoad, onNew }: Props) {
  const [fileHandle, setFileHandle] = useState<any>(null);
  const openInputRef = useRef<HTMLInputElement>(null);

  // ── Open ────────────────────────────────────────────────────────────────────

  const handleOpen = async () => {
    if (hasFileSystemAccess) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'Simulator Scripts', accept: { 'text/plain': ['.sim'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        const name = file.name.replace(/\.sim$/i, '');
        setFileHandle(handle);
        setCurrentName(name);
        onLoad(text, name);
        message.success(`Opened: ${file.name}`);
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
    reader.onload = () => {
      const name = file.name.replace(/\.sim$/i, '');
      setCurrentName(name);
      setFileHandle(null);
      onLoad(reader.result as string, name);
      message.success(`Opened: ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const writeToHandle = async (handle: any) => {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  const handleSave = async () => {
    if (fileHandle) {
      try {
        await writeToHandle(fileHandle);
        message.success(`Saved: ${currentName}.sim`);
      } catch (err: any) {
        if (err.name !== 'AbortError') message.error(err.message);
      }
    } else {
      await handleSaveAs();
    }
  };

  const handleSaveAs = async () => {
    if (hasFileSystemAccess) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${currentName || 'script'}.sim`,
          types: [{ description: 'Simulator Scripts', accept: { 'text/plain': ['.sim'] } }],
        });
        await writeToHandle(handle);
        const name = (await handle.getFile()).name.replace(/\.sim$/i, '');
        setFileHandle(handle);
        setCurrentName(name);
        message.success(`Saved: ${name}.sim`);
      } catch (err: any) {
        if (err.name !== 'AbortError') message.error(err.message);
      }
    } else {
      // Fallback: trigger browser download
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentName || 'script'}.sim`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <>
      {/* Hidden fallback file input for browsers without File System Access API */}
      <input
        ref={openInputRef}
        type="file"
        accept=".sim"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      <Space wrap>
        <Tooltip title="New script">
          <Button icon={<FileAddOutlined />} onClick={() => { setFileHandle(null); onNew(); }}>New</Button>
        </Tooltip>

        <Button icon={<FolderOpenOutlined />} onClick={handleOpen}>Open</Button>

        <Button icon={<SaveOutlined />} type="primary" ghost onClick={handleSave}>
          Save
        </Button>

        <Button icon={<SaveOutlined />} onClick={handleSaveAs}>
          Save As…
        </Button>

        {currentName && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <FileOutlined style={{ marginRight: 6 }} />
            {currentName}.sim
          </Typography.Text>
        )}
      </Space>
    </>
  );
}
