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

  setSocketIO(io: SocketIOServer): void { this.io = io; }
  getStatus(): ScriptStatus { return this.status; }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const entry: LogEntry = { level, message, timestamp: new Date().toISOString() };
    console.log(`[Script/${level.toUpperCase()}] ${message}`);
    if (this.io) this.io.emit('script:log', entry);
  }

  private emitStatus(running: boolean): void {
    if (this.io) this.io.emit('script:status', { running, block: running ? 'running' : null });
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

  private scheduleRepeat(key: string, intervalMs: number, fn: () => Promise<void>): void {
    const existing = this.activeIntervals.get(key);
    if (existing) clearTimeout(existing);

    const tick = async () => {
      if (this.stopRequested) { this.activeIntervals.delete(key); return; }
      try { await fn(); } catch (err: any) {
        this.log('error', `[Interval:${key}] ${err.message}`);
      }
      if (!this.stopRequested) {
        this.activeIntervals.set(key, setTimeout(tick, intervalMs));
      } else {
        this.activeIntervals.delete(key);
      }
    };
    this.activeIntervals.set(key, setTimeout(tick, intervalMs));
  }

  private async execStatement(stmt: Statement, vars: Record<string, unknown>): Promise<void> {
    switch (stmt.kind) {

      case 'STOP': {
        this.log('info', 'STOP SIMULATION');
        this.stopRequested = true;
        break;
      }

      case 'SLEEP': {
        this.log('info', `SLEEP ${stmt.ms}ms`);
        try { await this.sleep(stmt.ms); } catch { /* interrupted by stop */ }
        break;
      }

      case 'RESET': {
        const t = this.activeIntervals.get(stmt.name);
        if (t) {
          clearTimeout(t);
          this.activeIntervals.delete(stmt.name);
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
        this.log('info', `IF ${left} ${stmt.op} ${right} → ${cond ? 'true' : 'false'}`);
        if (cond) {
          for (const sub of stmt.body) {
            if (this.stopRequested) break;
            await this.execStatement(sub, vars);
          }
        }
        break;
      }
    }
  }

  async run(script: ParsedScript): Promise<void> {
    this.stop();
    this.stopRequested = false;
    this.status = 'running';
    this.emitStatus(true);
    this.log('info', '══════════ Script started ══════════');

    const vars: Record<string, unknown> = {};

    for (const stmt of script.statements) {
      if (this.stopRequested) break;
      try {
        await this.execStatement(stmt, vars);
      } catch (err: any) {
        this.log('error', err.message);
      }
    }

    if (this.activeIntervals.size > 0 && !this.stopRequested) {
      this.log('info', `Sequential complete — ${this.activeIntervals.size} interval(s) running`);
    } else {
      this.status = 'stopped';
      this.emitStatus(false);
      this.log('info', '══════════ Script completed ══════════');
    }
  }

  stop(): void {
    this.stopRequested = true;
    if (this.sleepReject) { this.sleepReject(); this.sleepReject = null; }
    for (const t of this.activeIntervals.values()) clearTimeout(t);
    this.activeIntervals.clear();
    if (this.status === 'running') {
      this.status = 'stopped';
      this.emitStatus(false);
      this.log('info', '══════════ Script stopped ══════════');
    }
  }
}

export const scriptExecutor = new ScriptExecutor();
