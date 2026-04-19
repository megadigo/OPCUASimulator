import axios from 'axios';
import {
  TagInfo,
  CommandInfo,
  IntervalEntry,
  ScriptFile,
  ParseError,
} from '../types';

const api = axios.create({ baseURL: '/api' });

// ─── Connection ──────────────────────────────────────────────────────────────

export const connectToServer = (url: string) =>
  api.post<{ status: string; tagCount: number; commandCount: number }>('/connect', { url }).then((r) => r.data);

export const disconnectFromServer = () =>
  api.post<{ status: string }>('/disconnect').then((r) => r.data);

export const getStatus = () =>
  api.get<{ status: string; url: string }>('/status').then((r) => r.data);

export const refreshBrowse = () =>
  api.post<{ tagCount: number; commandCount: number }>('/refresh').then((r) => r.data);

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const getTags = () =>
  api.get<TagInfo[]>('/tags').then((r) => r.data);

export const writeTag = (nodeId: string, value: unknown, dataType?: string) =>
  api.post<{ success: boolean }>('/tags/write', { nodeId, value, dataType }).then((r) => r.data);

// ─── Commands ─────────────────────────────────────────────────────────────────

export const getCommands = () =>
  api.get<CommandInfo[]>('/commands').then((r) => r.data);

export const invokeCommand = (objectId: string, methodId: string, args: unknown[]) =>
  api.post<{ status: string; outputs: unknown[] }>('/commands/invoke', { objectId, methodId, args }).then((r) => r.data);

// ─── Intervals ────────────────────────────────────────────────────────────────

export const getIntervals = () =>
  api.get<IntervalEntry[]>('/intervals').then((r) => r.data);

export const startTagInterval = (
  nodeId: string,
  displayName: string,
  values: unknown[],
  intervalMs: number
) => api.post<IntervalEntry>('/intervals/tag', { nodeId, displayName, values, mode: 'set', intervalMs }).then((r) => r.data);

export const startTagIncrementInterval = (
  nodeId: string,
  displayName: string,
  delta: number,
  intervalMs: number
) => api.post<IntervalEntry>('/intervals/tag', { nodeId, displayName, delta, mode: 'increment', intervalMs }).then((r) => r.data);

export const startCommandInterval = (
  objectId: string,
  methodId: string,
  displayName: string,
  args: unknown[],
  intervalMs: number
) =>
  api.post<IntervalEntry>('/intervals/command', { objectId, methodId, displayName, args, intervalMs }).then((r) => r.data);

export const deleteInterval = (id: string) =>
  api.delete<{ success: boolean }>(`/intervals/${id}`).then((r) => r.data);

// ─── Scripts ─────────────────────────────────────────────────────────────────

export const getScripts = () =>
  api.get<ScriptFile[]>('/scripts').then((r) => r.data);

export const getScript = (name: string) =>
  api.get<ScriptFile>(`/scripts/${encodeURIComponent(name)}`).then((r) => r.data);

export const saveScript = (name: string, content: string) =>
  api.post<{ success: boolean }>('/scripts', { name, content }).then((r) => r.data);

export const deleteScript = (name: string) =>
  api.delete<{ success: boolean }>(`/scripts/${encodeURIComponent(name)}`).then((r) => r.data);

export const parseScript = (content: string) =>
  api.post<{ script?: object; errors: ParseError[] }>('/scripts/parse', { content }).then((r) => r.data);

export const runScript = (content: string) =>
  api.post<{ success: boolean; status: string; errors?: ParseError[] }>('/scripts/run', { content }).then((r) => r.data);

export const stopScript = () =>
  api.post<{ success: boolean; status: string }>('/scripts/stop').then((r) => r.data);

export const getScriptStatus = () =>
  api.get<{ status: string }>('/scripts/exec/status').then((r) => r.data);
