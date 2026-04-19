import React from 'react';
import { Row, Col, Card, Typography, Statistic, Space, Empty } from 'antd';
import { TagsOutlined, ApiOutlined, WifiOutlined } from '@ant-design/icons';
import { useApp } from '../App';
import ConnectionBar from '../components/ConnectionBar';
import TagTable from '../components/TagTable';
import CommandPanel from '../components/CommandPanel';

export default function DashboardPage() {
  const { connectionStatus, tags, commands, intervals } = useApp();
  const isConnected = connectionStatus === 'connected';

  return (
    // Fill the full height given by Layout.Content (which is flex:1)
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>

      <ConnectionBar />

      {/* Summary stats row */}
      {isConnected && (
        <Row gutter={12} style={{ flexShrink: 0 }}>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Tags" value={tags.length} prefix={<TagsOutlined />} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Commands" value={commands.length} prefix={<ApiOutlined />} valueStyle={{ color: '#722ed1' }} />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Active Intervals" value={intervals.length} prefix={<WifiOutlined />}
                valueStyle={{ color: intervals.length > 0 ? '#52c41a' : '#999' }} />
            </Card>
          </Col>
        </Row>
      )}

      {!isConnected ? (
        <Card style={{ flex: 1 }}>
          <Empty
            description={
              <Space direction="vertical" align="center">
                <Typography.Title level={4} type="secondary">Not Connected</Typography.Title>
                <Typography.Text type="secondary">
                  Enter the OPC UA server URL above and click Connect to discover tags and commands.
                </Typography.Text>
              </Space>
            }
          />
        </Card>
      ) : (
        // This row fills the remaining height
        <Row gutter={12} style={{ flex: 1, overflow: 'hidden' }}>
          <Col xs={24} xl={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Card
              title={
                <Space>
                  <TagsOutlined style={{ color: '#1677ff' }} />
                  <span>Tags</span>
                  <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
                    ({tags.length})
                  </Typography.Text>
                </Space>
              }
              style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
            >
              <TagTable />
            </Card>
          </Col>

          <Col xs={24} xl={10} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Card
              title={
                <Space>
                  <ApiOutlined style={{ color: '#722ed1' }} />
                  <span>Commands</span>
                  <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
                    ({commands.length})
                  </Typography.Text>
                </Space>
              }
              style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px' } }}
            >
              <CommandPanel />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
