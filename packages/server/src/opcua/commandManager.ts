import { Variant, DataType } from 'node-opcua';
import { opcuaClient } from './client';
import { getCachedCommands, CommandInfo, ArgumentInfo } from './browser';

const DATA_TYPE_MAP: Record<number, DataType> = {
  1:  DataType.Boolean,
  2:  DataType.SByte,
  3:  DataType.Byte,
  4:  DataType.Int16,
  5:  DataType.UInt16,
  6:  DataType.Int32,
  7:  DataType.UInt32,
  8:  DataType.Int64,
  9:  DataType.UInt64,
  10: DataType.Float,
  11: DataType.Double,
  12: DataType.String,
  13: DataType.DateTime,
};

function parseArgDataType(dtStr: string): DataType | null {
  const m = dtStr.match(/(?:^|;)i=(\d+)/);
  if (m) return DATA_TYPE_MAP[Number(m[1])] ?? null;
  // plain numeric string (node-opcua sometimes returns just the enum number)
  const n = Number(dtStr);
  if (!isNaN(n) && DATA_TYPE_MAP[n]) return DATA_TYPE_MAP[n];
  return null;
}

function coerceToDataType(value: unknown, dataType: DataType): unknown {
  switch (dataType) {
    case DataType.Boolean:
      return value === true || value === 'true' || Number(value) !== 0;
    case DataType.Float:
    case DataType.Double:
      return Number(value);
    case DataType.SByte:
    case DataType.Byte:
    case DataType.Int16:
    case DataType.UInt16:
    case DataType.Int32:
    case DataType.UInt32:
      return parseInt(String(value), 10);
    case DataType.Int64:
    case DataType.UInt64:
      return BigInt(String(value).replace(/n$/, ''));
    case DataType.String:
      return String(value);
    default:
      return value;
  }
}

function buildVariant(value: unknown, argDef?: ArgumentInfo): Variant {
  if (argDef) {
    const dataType = parseArgDataType(argDef.dataType);
    if (dataType !== null) {
      return new Variant({ dataType, value: coerceToDataType(value, dataType) });
    }
  }
  // fallback heuristic when no definition is available
  if (typeof value === 'boolean') return new Variant({ dataType: DataType.Boolean, value });
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? new Variant({ dataType: DataType.Int32, value })
      : new Variant({ dataType: DataType.Double, value });
  }
  const str = String(value);
  const num = Number(str);
  if (!isNaN(num) && str.trim() !== '') {
    return Number.isInteger(num)
      ? new Variant({ dataType: DataType.Int32, value: num })
      : new Variant({ dataType: DataType.Double, value: num });
  }
  return new Variant({ dataType: DataType.String, value: str });
}

export async function invokeCommand(
  objectId: string,
  methodId: string,
  args: unknown[],
  inputArgDefs?: ArgumentInfo[]
): Promise<{ status: string; outputs: unknown[] }> {
  const session = opcuaClient.getSession();

  const result = await session.call({
    objectId,
    methodId,
    inputArguments: args.map((arg, i) => buildVariant(arg, inputArgDefs?.[i])),
  });

  return {
    status: result.statusCode.toString(),
    outputs: (result.outputArguments || []).map((v: any) => v.value),
  };
}

export async function invokeCommandByName(
  name: string,
  args: unknown[]
): Promise<{ status: string; outputs: unknown[] }> {
  const cmd = getCachedCommands().find((c) => c.displayName === name || c.nodeId === name);
  if (!cmd) throw new Error(`Command not found: "${name}"`);
  return invokeCommand(cmd.objectId, cmd.nodeId, args, cmd.inputArguments);
}

export function getCommandByName(name: string): CommandInfo | undefined {
  return getCachedCommands().find((c) => c.displayName === name || c.nodeId === name);
}
