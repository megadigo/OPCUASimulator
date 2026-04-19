import { Server as SocketIOServer } from 'socket.io';
import { ParsedScript, Statement, Expr } from './parser';
import { writeTag } from '../opcua/tagManager';
import { invokeCommand } from '../opcua/commandManager';
import { getCachedTags, getCachedCommands } from '../opcua/browser';

export type ScriptStatus = 'stopped' | 'running' | 'error';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

class ScriptExecutor {
  private status: ScriptStatus = 'stopped';
  private io: SocketIOServer | null = null;
  private stopRequested = false;
  private sleepReject: (() => void) | null = null;
  private activeIntervals = new Map<string, NodeJS.Timeout>();
  private activeIntervalMs  = new Map<string, number>();

  setSocketIO(io: SocketIOServer): void { this.io = io; }
  getStatus(): ScriptStatus { return this.status; }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const entry: LogEntry = { level, message, timestamp: new Date().toISOString() };
    console.log(`[Script/${level.toUpperCase()}] ${message}`);
    if (this.io) this.io.emit('script:log', entry);
  }

  private emitStatus(running: boolean, block: string | null = null): void {
    if (this.io) this.io.emit('script:status', { running, block });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.sleepReject = reject;
      setTimeout(() => { this.sleepReject = null; resolve(); }, ms);
    });
  }

  private resolveTag(name: string) {
    const t = getCachedTags().find((t) => t.displayName === name || t.nodeId === name);
    if (!t) throw new Error(`Tag not found: [${name}]`);
    return t;
  }

  private resolveCmd(name: string) {
    const c = getCachedCommands().find((c) => c.displayName === name || c.nodeId === name);
    if (!c) throw new Error(`Command not found: [${name}]`);
    return c;
  }

  private evalExpr(expr: Expr, vars: Record<string, unknown>): unknown {
    switch (expr.kind) {
      case 'literal': return expr.value;
      case 'tag':     return this.resolveTag(expr.name).value;
      case 'var': {
        if (!(expr.name in vars)) throw new Error(`Variable not defined: ${expr.name}`);
        return vars[expr.name];
      }
      case 'binop': {
        const l = Number(this.evalExpr(expr.left, vars));
        const r = Number(this.evalExpr(expr.right, vars));
        if (expr.op === '+') return l + r;
        if (expr.op === '-') return l - r;
        if (expr.op === '*') return l * r;
        return r !== 0 ? l / r : 0;
      }
    }
  }

  private compare(left: unknown, op: string, right: unknown): boolean {
    const ls = String(left);
    const rs = String(right);
    const l  = Number(left);
    const r  = Number(right);
    switch (op) {
      case '==': return ls === rs;
      case '!=': return ls !== rs;
      case '>':  return l > r;
      case '<':  return l < r;
      case '>=': return l >= r;
      case '<=': return l <= r;
      default:   return false;
    }
  }

  private isIntervalActive(key: string, intervalMs: number): boolean {
    return this.activeIntervals.has(key) && this.activeIntervalMs.get(key) === intervalMs;
  }

  private scheduleRepeat(key: string, intervalMs: number, fn: () => Promise<void>): boolean {
    if (this.isIntervalActive(key, intervalMs)) return false;

    const existing = this.activeIntervals.get(key);
    if (existing) clearTimeout(existing);

    this.activeIntervalMs.set(key, intervalMs);

    const tick = async () => {
      if (this.stopRequested) { this.activeIntervals.delete(key); this.activeIntervalMs.delete(key); return; }
      try { await fn(); } catch (err: any) {
        this.log('error', `[Interval:${key}] ${err.message}`);
      }
      if (!this.stopRequested) {
        this.activeIntervals.set(key, setTimeout(tick, intervalMs));
      } else {
        this.activeIntervals.delete(key);
        this.activeIntervalMs.delete(key);
      }
    };
    this.activeIntervals.set(key, setTimeout(tick, intervalMs));
    return true;
  }

  private async execStatement(stmt: Statement, vars: Record<string, unknown>): Promise<void> {
    switch (stmt.kind) {

      case 'STOP': {
        this.log('info', 'STOP SIMULATION');
        this.stopRequested = true;
        break;
      }

      case 'SLEEP': {
        try { await this.sleep(stmt.ms); } catch { /* interrupted by stop */ }
        break;
      }

      case 'RESET': {
        const t = this.activeIntervals.get(stmt.name);
        if (t) {
          clearTimeout(t);
          this.activeIntervals.delete(stmt.name);
          this.activeIntervalMs.delete(stmt.name);
          this.log('info', `RESET [${stmt.name}] — interval stopped`);
        } else {
          this.log('warn', `RESET [${stmt.name}] — no active interval found`);
        }
        break;
      }

      case 'TAG_WRITE': {
        const tag = this.resolveTag(stmt.tagName);
        const val = this.evalExpr(stmt.expr, vars);
        await writeTag(tag.nodeId, val, tag.dataType);
        this.log('info', `[${stmt.tagName}] = ${val}`);
        break;
      }

      case 'TAG_INCREMENT': {
        const tag = this.resolveTag(stmt.tagName);
        const newVal = Number(tag.value ?? 0) + stmt.delta;
        await writeTag(tag.nodeId, newVal, tag.dataType);
        this.log('info', `[${stmt.tagName}] ${stmt.delta >= 0 ? '+=' : '-='} ${Math.abs(stmt.delta)} → ${newVal}`);
        break;
      }

      case 'TAG_INTERVAL': {
        const { tagName, expr, intervalMs } = stmt;
        if (this.isIntervalActive(tagName, intervalMs)) break;
        this.log('info', `[${tagName}] = expr EVERY ${intervalMs}ms — interval started`);
        this.scheduleRepeat(tagName, intervalMs, async () => {
          const tag = this.resolveTag(tagName);
          const val = this.evalExpr(expr, vars);
          await writeTag(tag.nodeId, val, tag.dataType);
          this.log('info', `[Interval] [${tagName}] = ${val}`);
        });
        break;
      }

      case 'TAG_ROTATE': {
        const { tagName, values, intervalMs } = stmt;
        if (this.isIntervalActive(tagName, intervalMs)) break;
        let idx = 0;
        this.log('info', `[${tagName}] rotating ${values.length} values EVERY ${intervalMs}ms`);
        this.scheduleRepeat(tagName, intervalMs, async () => {
          const tag = this.resolveTag(tagName);
          const val = values[idx % values.length];
          idx++;
          await writeTag(tag.nodeId, val, tag.dataType);
          this.log('info', `[Interval] [${tagName}] = ${val}`);
        });
        break;
      }

      case 'TAG_INCREMENT_INTERVAL': {
        const { tagName, delta, intervalMs } = stmt;
        if (this.isIntervalActive(tagName, intervalMs)) break;
        this.log('info', `[${tagName}] ${delta >= 0 ? '+=' : '-='} ${Math.abs(delta)} EVERY ${intervalMs}ms — interval started`);
        this.scheduleRepeat(tagName, intervalMs, async () => {
          const tag = this.resolveTag(tagName);
          const newVal = Number(tag.value ?? 0) + delta;
          await writeTag(tag.nodeId, newVal, tag.dataType);
          this.log('info', `[Interval] [${tagName}] += ${delta} → ${newVal}`);
        });
        break;
      }

      case 'VAR_ASSIGN': {
        const tag = this.resolveTag(stmt.tagName);
        vars[stmt.varName] = tag.value;
        this.log('info', `${stmt.varName} = [${stmt.tagName}] → ${tag.value}`);
        break;
      }

      case 'CMD_INVOKE': {
        const cmd = this.resolveCmd(stmt.cmdName);
        const args = stmt.args.map((a) => this.evalExpr(a, vars));
        const result = await invokeCommand(cmd.objectId, cmd.nodeId, args, cmd.inputArguments);
        this.log('info', `[${stmt.cmdName}](${args.join(', ')}) → ${result.status}`);
        break;
      }

      case 'CMD_INVOKE_INTERVAL': {
        const { cmdName, args, intervalMs } = stmt;
        if (this.isIntervalActive(cmdName, intervalMs)) break;
        this.log('info', `[${cmdName}]() EVERY ${intervalMs}ms — interval started`);
        this.scheduleRepeat(cmdName, intervalMs, async () => {
          const cmd = this.resolveCmd(cmdName);
          const resolvedArgs = args.map((a) => this.evalExpr(a, vars));
          const result = await invokeCommand(cmd.objectId, cmd.nodeId, resolvedArgs, cmd.inputArguments);
          this.log('info', `[Interval] [${cmdName}](${resolvedArgs.join(', ')}) → ${result.status}`);
        });
        break;
      }

      case 'CMD_ASSIGN': {
        const cmd = this.resolveCmd(stmt.cmdName);
        const args = stmt.args.map((a) => this.evalExpr(a, vars));
        const result = await invokeCommand(cmd.objectId, cmd.nodeId, args, cmd.inputArguments);
        const output = result.outputs[0] ?? 0;
        vars[stmt.varName] = output;
        this.log('info', `${stmt.varName} = [${stmt.cmdName}](${args.join(', ')}) → ${output}`);
        break;
      }

      case 'IF_THEN': {
        const left  = this.evalExpr(stmt.left,  vars);
        const right = this.evalExpr(stmt.right, vars);
        const cond  = this.compare(left, stmt.op, right);
        if (cond) {
          this.log('info', `IF ${left} ${stmt.op} ${right} → true`);
          for (const sub of stmt.body) {
            if (this.stopRequested) break;
            await this.execStatement(sub, vars);
          }
        }
        break;
      }
    }
  }

  private async runBlock(stmts: Statement[], blockName: string, vars: Record<string, unknown>): Promise<void> {
    this.emitStatus(true, blockName);
    for (const stmt of stmts) {
      if (this.stopRequested) break;
      try { await this.execStatement(stmt, vars); }
      catch (err: any) { this.log('error', `[${blockName}] ${err.message}`); }
    }
  }

  async run(script: ParsedScript): Promise<void> {
    this.stopRequested = true;
    if (this.sleepReject) { this.sleepReject(); this.sleepReject = null; }
    for (const t of this.activeIntervals.values()) clearTimeout(t);
    this.activeIntervals.clear();
    this.activeIntervalMs.clear();
    this.stopRequested = false;

    this.status = 'running';
    this.log('info', '══════════ Script started ══════════');

    const vars: Record<string, unknown> = {};

    // SETUP — runs once
    if (script.setup.length > 0) {
      this.log('info', '─── SETUP ───');
      await this.runBlock(script.setup, 'SETUP', vars);
    }

    // LOOP — repeats until stopRequested
    if (script.loop.length > 0 && !this.stopRequested) {
      this.log('info', '─── LOOP started ───');
      this.emitStatus(true, 'LOOP');
      while (!this.stopRequested) {
        await this.runBlock(script.loop, 'LOOP', vars);
        // Yield to the macrotask queue so setTimeout callbacks (EVERY intervals)
        // can fire even when the loop body does no async work.
        if (!this.stopRequested) await new Promise<void>((r) => setTimeout(r, 0));
      }
      this.log('info', '─── LOOP ended ───');
    }

    // TEARDOWN — runs once before final stop (even if stopRequested)
    if (script.teardown.length > 0) {
      this.log('info', '─── TEARDOWN ───');
      const prevStop = this.stopRequested;
      this.stopRequested = false;  // allow teardown to execute fully
      this.emitStatus(true, 'TEARDOWN');
      await this.runBlock(script.teardown, 'TEARDOWN', vars);
      this.stopRequested = prevStop;
    }

    // Clean up any EVERY intervals started during script
    for (const t of this.activeIntervals.values()) clearTimeout(t);
    this.activeIntervals.clear();
    this.activeIntervalMs.clear();

    this.status = 'stopped';
    this.emitStatus(false, null);
    this.log('info', '══════════ Script completed ══════════');
  }

  stop(): void {
    this.stopRequested = true;
    if (this.sleepReject) { this.sleepReject(); this.sleepReject = null; }
    // Intervals and status cleanup happen in run() after teardown completes.
    // If run() is not active, clean up directly.
    if (this.status !== 'running') {
      for (const t of this.activeIntervals.values()) clearTimeout(t);
      this.activeIntervals.clear();
      this.activeIntervalMs.clear();
    }
  }
}

export const scriptExecutor = new ScriptExecutor();
