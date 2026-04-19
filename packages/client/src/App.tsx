import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, theme } from 'antd';
import { DashboardOutlined, CodeOutlined, WifiOutlined } from '@ant-design/icons';
import DashboardPage from './pages/DashboardPage';
import ScriptPage from './pages/ScriptPage';
import { ConnectionStatus, TagInfo, CommandInfo, IntervalEntry } from './types';
import { getSocket } from './services/socket';
import { getTags, getCommands, getIntervals, getStatus } from './services/api';

// ─── App Context ──────────────────────────────────────────────────────────────

export interface AppContextValue {
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  tags: TagInfo[];
  setTags: React.Dispatch<React.SetStateAction<TagInfo[]>>;
  commands: CommandInfo[];
  setCommands: React.Dispatch<React.SetStateAction<CommandInfo[]>>;
  intervals: IntervalEntry[];
  setIntervals: React.Dispatch<React.SetStateAction<IntervalEntry[]>>;
  reloadData: () => Promise<void>;
}

export const AppContext = createContext<AppContextValue>({} as AppContextValue);
export const useApp = () => useContext(AppContext);

// ─── Navigation bar ───────────────────────────────────────────────────────────

function NavMenu() {
  const location = useLocation();
  const { connectionStatus } = useApp();

  const statusColor: Record<ConnectionStatus, string> = {
    connected: '#52c41a',
    connecting: '#faad14',
    disconnected: '#8c8c8c',
    error: '#ff4d4f',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <WifiOutlined style={{ color: statusColor[connectionStatus], fontSize: 16 }} />
        <span style={{ color: statusColor[connectionStatus], fontWeight: 600, fontSize: 12 }}>
          {connectionStatus.toUpperCase()}
        </span>
      </div>
      <Menu
        theme="dark"
        mode="horizontal"
        selectedKeys={[location.pathname]}
        style={{ minWidth: 220, borderBottom: 'none' }}
        items={[
          { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
          { key: '/script', icon: <CodeOutlined />, label: <Link to="/script">Script Editor</Link> },
        ]}
      />
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [serverUrl, setServerUrl] = useState('opc.tcp://localhost:4840');
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [intervals, setIntervals] = useState<IntervalEntry[]>([]);

  const reloadData = useCallback(async () => {
    try {
      const [t, c, i] = await Promise.all([getTags(), getCommands(), getIntervals()]);
      setTags(t);
      setCommands(c);
      setIntervals(i);
    } catch {}
  }, []);

  useEffect(() => {
    getStatus().then((s) => {
      if (s.status === 'connected') {
        setConnectionStatus('connected');
        setServerUrl(s.url);
        reloadData();
      }
    }).catch(() => {});

    const socket = getSocket();

    socket.on('tag:update', ({ nodeId, value }: { nodeId: string; value: unknown }) => {
      setTags((prev) => prev.map((t) => (t.nodeId === nodeId ? { ...t, value } : t)));
    });

    socket.on('connection:status', ({ status, url }: { status: ConnectionStatus; url: string }) => {
      setConnectionStatus(status);
      if (url) setServerUrl(url);
    });

    return () => {
      socket.off('tag:update');
      socket.off('connection:status');
    };
  }, [reloadData]);

  const ctx: AppContextValue = {
    connectionStatus, setConnectionStatus,
    serverUrl, setServerUrl,
    tags, setTags,
    commands, setCommands,
    intervals, setIntervals,
    reloadData,
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <AppContext.Provider value={ctx}>
        <BrowserRouter>
          {/* height:100vh + overflow:hidden → content area owns the scroll */}
          <Layout style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Layout.Header
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
              }}
            >
              <span style={{ color: 'white', fontSize: 20, fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                OPC UA Simulator
              </span>
              <NavMenu />
            </Layout.Header>

            {/* flex:1 + overflow:auto → this area fills the remaining height and scrolls */}
            <Layout.Content
              style={{
                flex: 1,
                overflow: 'auto',
                padding: 20,
                background: '#f5f5f5',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/script" element={<ScriptPage />} />
              </Routes>
            </Layout.Content>
          </Layout>
        </BrowserRouter>
      </AppContext.Provider>
    </ConfigProvider>
  );
}
