import { v4 as uuidv4 } from 'uuid';
import { Server as SocketIOServer } from 'socket.io';
import { writeTag, readTag } from '../opcua/tagManager';
import { invokeCommandByName } from '../opcua/commandManager';
import { getCachedTags } from '../opcua/browser';

export interface IntervalEntry {
  id: string;
  type: 'tag' | 'command';
  mode: 'set' | 'increment';
  label: string;
  intervalMs: number;
  nodeId?: string;
  displayName?: string;
  values?: unknown[];
  delta?: number;
  commandName?: string;
  args?: unknown[];
}

const activeIntervals = new Map<string, NodeJS.Timeout>();
const intervalMeta = new Map<string, IntervalEntry>();
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer): void {
  io = socketIO;
}

function scheduleRepeat(id: string, intervalMs: number, fn: () => Promise<void>): void {
  const tick = async () => {
    if (!activeIntervals.has(id)) return;
    await fn();
    if (activeIntervals.has(id)) {
      activeIntervals.set(id, setTimeout(tick, intervalMs) as unknown as NodeJS.Timeout);
    }
  };
  activeIntervals.set(id, setTimeout(tick, intervalMs) as unknown as NodeJS.Timeout);
}

/** Set tag to a rotating list of values on each tick */
export function startTagInterval(
  nodeId: string,
  displayName: string,
  values: unknown[],
  intervalMs: number
): IntervalEntry {
  const id = uuidv4();
  const label = `[${values.join(' → ')}] / ${intervalMs}ms`;
  let index = 0;

  scheduleRepeat(id, intervalMs, async () => {
    try {
      const value = values[index % values.length];
      index = (index + 1) % values.length;
      const cached = getCachedTags().find((t) => t.nodeId === nodeId);
      await writeTag(nodeId, value, cached?.dataType);
      if (io) io.emit('interval:tick', { id, type: 'tag', nodeId, displayName });
    } catch (err: any) {
      console.error(`[Interval] Write error (${displayName}):`, err.message);
    }
  });

  const entry: IntervalEntry = { id, type: 'tag', mode: 'set', label, intervalMs, nodeId, displayName, values };
  intervalMeta.set(id, entry);
  return entry;
}

/** Increment (or decrement) tag by delta on each tick */
export function startTagIncrementInterval(
  nodeId: string,
  displayName: string,
  delta: number,
  intervalMs: number
): IntervalEntry {
  const id = uuidv4();
  const sign = delta >= 0 ? '+' : '';
  const label = `${sign}${delta} / ${intervalMs}ms`;

  scheduleRepeat(id, intervalMs, async () => {
    try {
      const cached = getCachedTags().find((t) => t.nodeId === nodeId);
      const current = Number(cached?.value ?? (await readTag(nodeId))) || 0;
      const newValue = current + delta;
      await writeTag(nodeId, newValue, cached?.dataType);
      if (io) io.emit('interval:tick', { id, type: 'tag', nodeId, displayName, newValue });
    } catch (err: any) {
      console.error(`[Interval] Increment error (${displayName}):`, err.message);
    }
  });

  const entry: IntervalEntry = {
    id, type: 'tag', mode: 'increment', label, intervalMs, nodeId, displayName, delta,
  };
  intervalMeta.set(id, entry);
  return entry;
}

/** Invoke a command on each tick */
export function startCommandInterval(
  objectId: string,
  methodId: string,
  displayName: string,
  args: unknown[],
  intervalMs: number
): IntervalEntry {
  const id = uuidv4();
  const label = `(${args.join(', ')}) / ${intervalMs}ms`;

  scheduleRepeat(id, intervalMs, async () => {
    try {
      await invokeCommandByName(displayName, args);
      if (io) io.emit('interval:tick', { id, type: 'command', commandName: displayName });
    } catch (err: any) {
      console.error(`[Interval] Command error (${displayName}):`, err.message);
    }
  });

  const entry: IntervalEntry = {
    id, type: 'command', mode: 'set', label, intervalMs, commandName: displayName, args,
  };
  intervalMeta.set(id, entry);
  return entry;
}

export function stopInterval(id: string): boolean {
  const timer = activeIntervals.get(id);
  if (!timer) return false;
  clearTimeout(timer);
  activeIntervals.delete(id);
  intervalMeta.delete(id);
  return true;
}

export function stopAllIntervals(): void {
  for (const timer of activeIntervals.values()) clearTimeout(timer);
  activeIntervals.clear();
  intervalMeta.clear();
}

export function listIntervals(): IntervalEntry[] {
  return Array.from(intervalMeta.values());
}
