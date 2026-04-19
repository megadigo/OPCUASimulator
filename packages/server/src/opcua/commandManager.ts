import { Variant, DataType } from 'node-opcua';
import { opcuaClient } from './client';
import { getCachedCommands, CommandInfo } from './browser';

function coerceArg(value: unknown): Variant {
  if (typeof value === 'boolean') {
    return new Variant({ dataType: DataType.Boolean, value });
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return new Variant({ dataType: DataType.Int32, value });
    }
    return new Variant({ dataType: DataType.Double, value });
  }
  const str = String(value);
  const num = Number(str);
  if (!isNaN(num) && str.trim() !== '') {
    if (Number.isInteger(num)) return new Variant({ dataType: DataType.Int32, value: num });
    return new Variant({ dataType: DataType.Double, value: num });
  }
  return new Variant({ dataType: DataType.String, value: str });
}

export async function invokeCommand(
  objectId: string,
  methodId: string,
  args: unknown[]
): Promise<{ status: string; outputs: unknown[] }> {
  const session = opcuaClient.getSession();

  const result = await session.call({
    objectId,
    methodId,
    inputArguments: args.map(coerceArg),
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
  const commands = getCachedCommands();
  const cmd = commands.find((c) => c.displayName === name || c.nodeId === name);
  if (!cmd) throw new Error(`Command not found: "${name}"`);
  return invokeCommand(cmd.objectId, cmd.nodeId, args);
}

export function getCommandByName(name: string): CommandInfo | undefined {
  return getCachedCommands().find((c) => c.displayName === name || c.nodeId === name);
}
