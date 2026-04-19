import {
  BrowseDirection,
  NodeClass,
  AttributeIds,
  DataValue,
} from 'node-opcua';
import { opcuaClient } from './client';

export interface TagInfo {
  nodeId: string;
  displayName: string;
  dataType: string;
  value: unknown;
  accessLevel: number;
}

export interface ArgumentInfo {
  name: string;
  dataType: string;
  description: string;
}

export interface CommandInfo {
  nodeId: string;
  displayName: string;
  objectId: string;
  inputArguments: ArgumentInfo[];
  outputArguments: ArgumentInfo[];
}

let cachedTags: TagInfo[] = [];
let cachedCommands: CommandInfo[] = [];

export function getCachedTags(): TagInfo[] {
  return cachedTags;
}

export function getCachedCommands(): CommandInfo[] {
  return cachedCommands;
}

export function updateCachedTagValue(nodeId: string, value: unknown): void {
  const tag = cachedTags.find((t) => t.nodeId === nodeId);
  if (tag) tag.value = value;
}

async function readArgumentDefs(nodeId: string): Promise<ArgumentInfo[]> {
  const session = opcuaClient.getSession();
  try {
    const dv: DataValue = await session.read({
      nodeId,
      attributeId: AttributeIds.Value,
    });
    if (!dv.value?.value) return [];
    const args = Array.isArray(dv.value.value) ? dv.value.value : [dv.value.value];
    return args.map((a: any) => ({
      name: a.name || '',
      dataType: a.dataType != null ? String(a.dataType) : 'Unknown',
      description: a.description?.text || a.description || '',
    }));
  } catch {
    return [];
  }
}

const SKIP_NODES = new Set(['Server', 'DeviceSet', 'NetworkSet', 'Aliases']);

async function browseNode(
  nodeId: string,
  tags: TagInfo[],
  commands: CommandInfo[],
  depth: number,
  visited: Set<string>
): Promise<void> {
  if (depth > 8) return;
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const session = opcuaClient.getSession();

  let browseResult: any;
  try {
    browseResult = await session.browse({
      nodeId,
      referenceTypeId: 'HierarchicalReferences',
      includeSubtypes: true,
      browseDirection: BrowseDirection.Forward,
      nodeClassMask: 0xff,
      resultMask: 63,
    });
  } catch {
    return;
  }

  if (!browseResult.references) return;

  for (const ref of browseResult.references) {
    const refNodeId = ref.nodeId.toString();
    const displayName = ref.displayName?.text || ref.browseName?.name || refNodeId;

    if (ref.nodeClass === NodeClass.Variable) {
      let value: unknown = null;
      let dataType = 'Unknown';
      let accessLevel = 1;

      try {
        const dv: DataValue = await session.read({
          nodeId: ref.nodeId,
          attributeId: AttributeIds.Value,
        });
        value = dv.value?.value ?? null;
      } catch {}

      try {
        const dtDv: DataValue = await session.read({
          nodeId: ref.nodeId,
          attributeId: AttributeIds.DataType,
        });
        if (dtDv.value?.value) {
          dataType = dtDv.value.value.toString();
        }
      } catch {}

      try {
        const alDv: DataValue = await session.read({
          nodeId: ref.nodeId,
          attributeId: AttributeIds.AccessLevel,
        });
        if (alDv.value?.value !== undefined) {
          accessLevel = Number(alDv.value.value);
        }
      } catch {}

      // Skip property nodes (InputArguments, OutputArguments, etc.)
      const browseName = ref.browseName?.name || '';
      if (browseName === 'InputArguments' || browseName === 'OutputArguments') continue;

      tags.push({ nodeId: refNodeId, displayName, dataType, value, accessLevel });

    } else if (ref.nodeClass === NodeClass.Method) {
      // Browse method children for argument definitions
      let inputArgs: ArgumentInfo[] = [];
      let outputArgs: ArgumentInfo[] = [];

      try {
        const methodBrowse = await session.browse({
          nodeId: ref.nodeId,
          referenceTypeId: 'HierarchicalReferences',
          includeSubtypes: true,
          browseDirection: BrowseDirection.Forward,
          nodeClassMask: 0xff,
          resultMask: 63,
        });

        if (methodBrowse.references) {
          for (const mref of methodBrowse.references) {
            const mname = mref.browseName?.name || '';
            if (mname === 'InputArguments') {
              inputArgs = await readArgumentDefs(mref.nodeId.toString());
            } else if (mname === 'OutputArguments') {
              outputArgs = await readArgumentDefs(mref.nodeId.toString());
            }
          }
        }
      } catch {}

      commands.push({
        nodeId: refNodeId,
        displayName,
        objectId: nodeId,
        inputArguments: inputArgs,
        outputArguments: outputArgs,
      });

    } else if (ref.nodeClass === NodeClass.Object) {
      const bn = ref.browseName?.name || '';
      if (SKIP_NODES.has(bn)) continue;
      await browseNode(refNodeId, tags, commands, depth + 1, visited);
    }
  }
}

export async function browseServer(): Promise<{ tags: TagInfo[]; commands: CommandInfo[] }> {
  const tags: TagInfo[] = [];
  const commands: CommandInfo[] = [];
  const visited = new Set<string>();

  await browseNode('ObjectsFolder', tags, commands, 0, visited);

  cachedTags = tags;
  cachedCommands = commands;

  return { tags, commands };
}
