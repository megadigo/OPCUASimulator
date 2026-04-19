import React, { useState } from 'react';
import { Input, Button, Space, Alert, Spin, Typography } from 'antd';
import { LinkOutlined, DisconnectOutlined, ReloadOutlined } from '@ant-design/icons';
import { useApp } from '../App';
import { connectToServer, disconnectFromServer, refreshBrowse } from '../services/api';
import { message } from 'antd';

export default function ConnectionBar() {
  const { connectionStatus, setConnectionStatus, serverUrl, setServerUrl, reloadData, setTags, setCommands } = useApp();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      message.warning('Please enter a server URL');
      return;
    }
    setLoading(true);
    setConnectionStatus('connecting');
    try {
      const result = await connectToServer(serverUrl.trim());
      setConnectionStatus('connected');
      await reloadData();
      message.success(`Connected — ${result.tagCount} tags, ${result.commandCount} commands found`);
    } catch (err: any) {
      setConnectionStatus('error');
      message.error(`Connection failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await disconnectFromServer();
      setConnectionStatus('disconnected');
      setTags([]);
      setCommands([]);
      message.info('Disconnected');
    } catch (err: any) {
      message.error(`Disconnect error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshBrowse();
      await reloadData();
      message.success(`Refreshed — ${result.tagCount} tags, ${result.commandCount} commands`);
    } catch (err: any) {
      message.error(`Refresh failed: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div
      style={{
        background: '#fff',
        padding: '12px 24px',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: 16,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
        OPC UA Server:
      </Typography.Text>

      <Input
        style={{ width: 340 }}
        placeholder="opc.tcp://localhost:4840"
        value={serverUrl}
        onChange={(e) => setServerUrl(e.target.value)}
        onPressEnter={!isConnected ? handleConnect : undefined}
        disabled={isConnected || isConnecting}
        prefix={<LinkOutlined style={{ color: '#999' }} />}
      />

      <Space>
        {!isConnected ? (
          <Button
            type="primary"
            icon={loading ? <Spin size="small" /> : <LinkOutlined />}
            onClick={handleConnect}
            disabled={loading || isConnecting}
            loading={loading}
          >
            Connect
          </Button>
        ) : (
          <>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={refreshing}
            >
              Refresh
            </Button>
            <Button
              danger
              icon={<DisconnectOutlined />}
              onClick={handleDisconnect}
              loading={loading}
            >
              Disconnect
            </Button>
          </>
        )}
      </Space>

      {connectionStatus === 'error' && (
        <Alert type="error" message="Connection error — check the server URL and try again" showIcon style={{ flex: 1 }} />
      )}
    </div>
  );
}
