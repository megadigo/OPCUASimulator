import { Router, Request, Response } from 'express';
import { opcuaClient } from '../opcua/client';
import { browseServer, getCachedTags, getCachedCommands } from '../opcua/browser';
import { writeTag, subscribeToTags, stopSubscription } from '../opcua/tagManager';
import { invokeCommand } from '../opcua/commandManager';
import {
  startTagInterval,
  startTagIncrementInterval,
  startCommandInterval,
  stopInterval,
  stopAllIntervals,
  listIntervals,
} from './intervalManager';
import { listScripts, loadScript, saveScript, deleteScript } from '../storage/scriptStorage';
import { parseScript } from '../script/parser';
import { scriptExecutor } from '../script/executor';

const router = Router();

// ─── Connection ──────────────────────────────────────────────────────────────

router.post('/connect', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    await opcuaClient.connect(url);
    const { tags, commands } = await browseServer();
    await subscribeToTags(tags);
    res.json({ status: 'connected', tagCount: tags.length, commandCount: commands.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    scriptExecutor.stop();
    stopAllIntervals();
    await stopSubscription();
    await opcuaClient.disconnect();
    res.json({ status: 'disconnected' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', (req: Request, res: Response) => {
  res.json({
    status: opcuaClient.getStatus(),
    url: opcuaClient.getCurrentUrl(),
  });
});

// ─── Tags ─────────────────────────────────────────────────────────────────────

router.get('/tags', (req: Request, res: Response) => {
  res.json(getCachedTags());
});

router.post('/tags/write', async (req: Request, res: Response) => {
  const { nodeId, value, dataType } = req.body;
  if (!nodeId || value === undefined) {
    return res.status(400).json({ error: 'nodeId and value are required' });
  }
  try {
    await writeTag(nodeId, value, dataType);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { tags, commands } = await browseServer();
    await subscribeToTags(tags);
    res.json({ tagCount: tags.length, commandCount: commands.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Commands ─────────────────────────────────────────────────────────────────

router.get('/commands', (req: Request, res: Response) => {
  res.json(getCachedCommands());
});

router.post('/commands/invoke', async (req: Request, res: Response) => {
  const { objectId, methodId, args } = req.body;
  if (!objectId || !methodId) {
    return res.status(400).json({ error: 'objectId and methodId are required' });
  }
  try {
    const result = await invokeCommand(objectId, methodId, args || []);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Intervals ────────────────────────────────────────────────────────────────

router.get('/intervals', (req: Request, res: Response) => {
  res.json(listIntervals());
});

router.post('/intervals/tag', (req: Request, res: Response) => {
  const { nodeId, displayName, values, delta, mode, intervalMs } = req.body;
  if (!nodeId || !intervalMs) {
    return res.status(400).json({ error: 'nodeId and intervalMs are required' });
  }
  const existing = listIntervals().find((i) => i.type === 'tag' && i.nodeId === nodeId);
  if (existing) stopInterval(existing.id);

  if (mode === 'increment') {
    if (delta === undefined) return res.status(400).json({ error: 'delta is required for increment mode' });
    const entry = startTagIncrementInterval(nodeId, displayName || nodeId, Number(delta), Number(intervalMs));
    return res.json(entry);
  }
  if (!Array.isArray(values) || values.length === 0) return res.status(400).json({ error: 'values array is required for set mode' });
  const entry = startTagInterval(nodeId, displayName || nodeId, values, Number(intervalMs));
  res.json(entry);
});

router.post('/intervals/command', (req: Request, res: Response) => {
  const { objectId, methodId, displayName, args, intervalMs } = req.body;
  if (!objectId || !methodId || !intervalMs) {
    return res.status(400).json({ error: 'objectId, methodId and intervalMs are required' });
  }
  const entry = startCommandInterval(
    objectId, methodId, displayName || methodId, args || [], Number(intervalMs)
  );
  res.json(entry);
});

router.delete('/intervals/:id', (req: Request, res: Response) => {
  const ok = stopInterval(req.params.id);
  res.json({ success: ok });
});

// ─── Scripts ─────────────────────────────────────────────────────────────────
// IMPORTANT: specific routes (/status, /parse, /run, /stop) must come BEFORE /:name

router.get('/scripts', (req: Request, res: Response) => {
  try {
    res.json(listScripts());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/scripts/exec/status', (req: Request, res: Response) => {
  res.json({ status: scriptExecutor.getStatus() });
});

router.post('/scripts/parse', (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  const result = parseScript(content);
  res.json(result);
});

router.post('/scripts/run', async (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });

  const { script, errors } = parseScript(content);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Parse errors', errors });
  }

  try {
    scriptExecutor.run(script!).catch((err) => {
      console.error('[Script] Runtime error:', err.message);
    });
    res.json({ success: true, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scripts/stop', (req: Request, res: Response) => {
  scriptExecutor.stop();
  res.json({ success: true, status: 'stopped' });
});

router.get('/scripts/:name', (req: Request, res: Response) => {
  try {
    const script = loadScript(req.params.name);
    res.json(script);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/scripts', (req: Request, res: Response) => {
  const { name, content } = req.body;
  if (!name || content === undefined) {
    return res.status(400).json({ error: 'name and content are required' });
  }
  try {
    saveScript(name, content);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/scripts/:name', (req: Request, res: Response) => {
  try {
    deleteScript(req.params.name);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
