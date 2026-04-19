export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TagInfo {
  nodeId: string;
  displayName: string;
  dataType: string;
  value: unknown;
  accessLevel: number; // bitmask: bit0=read, bit1=write
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

export interface ScriptFile {
  name: string;
  content: string;
  updatedAt: string;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface TagUpdate {
  nodeId: string;
  value: unknown;
  timestamp: string;
}
