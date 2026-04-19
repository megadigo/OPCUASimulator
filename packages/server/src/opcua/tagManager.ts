import {
  AttributeIds,
  ClientSubscription,
  ClientMonitoredItem,
  TimestampsToReturn,
  DataValue,
  Variant,
  DataType,
  StatusCodes,
} from 'node-opcua';
import { Server as SocketIOServer } from 'socket.io';
import { opcuaClient } from './client';
import { TagInfo, getCachedTags, updateCachedTagValue } from './browser';

let subscription: ClientSubscription | null = null;
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer): void {
  io = socketIO;
}

export async function subscribeToTags(tags: TagInfo[]): Promise<void> {
  if (!opcuaClient.isConnected()) return;
  const session = opcuaClient.getSession();

  if (subscription) {
    try { await subscription.terminate(); } catch {}
    subscription = null;
  }

  subscription = ClientSubscription.create(session, {
    requestedPublishingInterval: 100,
    requestedLifetimeCount: 100,
    requestedMaxKeepAliveCount: 10,
    maxNotificationsPerPublish: 100,
    publishingEnabled: true,
    priority: 10,
  });

  for (const tag of tags) {
    if (!(tag.accessLevel & 1)) continue; // skip non-readable tags

    try {
      const monitoredItem = ClientMonitoredItem.create(
        subscription,
        { nodeId: tag.nodeId, attributeId: AttributeIds.Value },
        { samplingInterval: 100, discardOldest: true, queueSize: 10 },
        TimestampsToReturn.Both
      );

      monitoredItem.on('changed', (dv: DataValue) => {
        const value = dv.value?.value ?? null;
        updateCachedTagValue(tag.nodeId, value);
        if (io) {
          io.emit('tag:update', {
            nodeId: tag.nodeId,
            value,
            timestamp: dv.sourceTimestamp?.toISOString() ?? new Date().toISOString(),
          });
        }
      });
    } catch {}
  }
}

export async function stopSubscription(): Promise<void> {
  if (subscription) {
    try { await subscription.terminate(); } catch {}
    subscription = null;
  }
}

function parseDataType(dataTypeStr: string): DataType {
  // Handle OPC UA NodeId format: ns=0;i=N
  const nodeIdMatch = dataTypeStr.match(/i=(\d+)/);
  if (nodeIdMatch) {
    const id = parseInt(nodeIdMatch[1], 10);
    const idMap: Record<number, DataType> = {
      1: DataType.Boolean,
      3: DataType.Byte,
      4: DataType.Int16,
      5: DataType.UInt16,
      6: DataType.Int32,
      7: DataType.UInt32,
      8: DataType.Int64,
      9: DataType.UInt64,
      10: DataType.Float,
      11: DataType.Double,
      12: DataType.String,
      13: DataType.DateTime,
    };
    return idMap[id] ?? DataType.Double;
  }

  // Handle string names
  const nameMap: Record<string, DataType> = {
    Boolean: DataType.Boolean,
    Int16: DataType.Int16,
    UInt16: DataType.UInt16,
    Int32: DataType.Int32,
    UInt32: DataType.UInt32,
    Float: DataType.Float,
    Double: DataType.Double,
    String: DataType.String,
    DateTime: DataType.DateTime,
  };
  return nameMap[dataTypeStr] ?? DataType.Double;
}

function coerceValue(value: unknown, dataType: DataType): unknown {
  switch (dataType) {
    case DataType.Double:
    case DataType.Float:
      return Number(value);
    case DataType.Int16:
    case DataType.UInt16:
    case DataType.Int32:
    case DataType.UInt32:
      return parseInt(String(value), 10);
    case DataType.Boolean:
      return value === true || value === 'true' || value === 1;
    case DataType.String:
      return String(value);
    default:
      return value;
  }
}

export async function readTag(nodeId: string): Promise<unknown> {
  const session = opcuaClient.getSession();
  const dv: DataValue = await session.read({ nodeId, attributeId: AttributeIds.Value });
  return dv.value?.value ?? null;
}

export async function writeTag(nodeId: string, value: unknown, dataTypeStr?: string): Promise<void> {
  const session = opcuaClient.getSession();

  let resolvedDataType = 'Double';
  if (dataTypeStr) {
    resolvedDataType = dataTypeStr;
  } else {
    const tags = getCachedTags();
    const tag = tags.find((t) => t.nodeId === nodeId);
    if (tag) resolvedDataType = tag.dataType;
  }

  const dataType = parseDataType(resolvedDataType);
  const coerced = coerceValue(value, dataType);

  const statusCode = await session.write({
    nodeId,
    attributeId: AttributeIds.Value,
    value: new DataValue({
      statusCode: StatusCodes.Good,
      value: new Variant({ dataType, value: coerced }),
    }),
  });

  if (statusCode !== StatusCodes.Good) {
    throw new Error(`Write failed with status: ${statusCode.toString()}`);
  }
}

export async function writeTagByName(name: string, value: unknown): Promise<void> {
  const tags = getCachedTags();
  const tag = tags.find((t) => t.displayName === name || t.nodeId === name);
  if (!tag) throw new Error(`TAG not found: "${name}"`);
  await writeTag(tag.nodeId, value, tag.dataType);
}
