import { Server as SocketIOServer } from 'socket.io';
import { ParsedScript, SequentialStatement } from './parser';
import { writeTagByName, readTag } from '../opcua/tagManager';
import { invokeCommandByName } from '../opcua/commandManager';
import { getCachedTags } from '../opcua/browser';

export type ScriptStatus = 'stopped' | 'running' | 'error';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

// ─── Operand resolver (for EXPRESSION_WRITE) ─────────────────────────────────

async function resolveOperand(operand: string, variables: Record<string, unknown>): Promise<number> {
  const trimmed = operand.trim();

  // Numeric literal
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;

  // Local variable (from INVOKE_ASSIGN / COMMAND_CALL results)
  if (trimmed in variables) return Number(variables[trimmed]);

  // Live tag value from cache
  const tag = getCachedTags().find((t) => t.displayName === trimmed || t.nodeId === trimmed);
  if (tag) return Number(tag.value) || 0;

  throw new Error(`Cannot resolve operand: "${trimmed}" — not a number, variable, or known tag name`);
}

// ─── Executor ─────────────────────────────────────────────────────────────────

class ScriptExecutor {
  private timers: (NodeJS.Timeout | NodeJS.Timer)[] = [];
  private status: ScriptStatus = 'stopped';
  private io: SocketIOServer | null = null;

  setSocketIO(socketIO: SocketIOServer): void {
    this.io = socketIO;
  }

  getStatus(): ScriptStatus {
    return this.status;
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const entry: LogEntry = { level, message, timestamp: new Date().toISOString() };
    console.log(`[Script/${level.toUpperCase()}] ${message}`);
    if (this.io) this.io.emit('script:log', entry);
  }

  private emitStatus(running: boolean, block: string | null): void {
    if (this.io) this.io.emit('script:status', { running, block });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this.timers.push(t);
    });
  }

  private async executeSequential(
    statements: SequentialStatement[],
    blockName: string,
    variables: Record<string, unknown>
  ): Promise<void> {
    for (const stmt of statements) {
      if (this.status !== 'running') break;

      try {
        switch (stmt.type) {

          case 'SLEEP': {
            this.log('info', `[${blockName}] SLEEP ${stmt.ms}ms`);
            await this.sleep(stmt.ms);
            break;
          }

          case 'TAG_WRITE': {
            await writeTagByName(String(stmt.tagName), stmt.value);
            this.log('info', `[${blockName}] ${stmt.tagName} = ${stmt.value}`);
            break;
          }

          case 'EXPRESSION_WRITE': {
            const left = await resolveOperand(stmt.leftOperand, variables);
            const right = await resolveOperand(stmt.rightOperand, variables);
            let result: number;
            if (stmt.operator === '+') result = left + right;
            else if (stmt.operator === '-') result = left - right;
            else if (stmt.operator === '*') result = left * right;
            else result = right !== 0 ? left / right : 0;
            await writeTagByName(stmt.tagName, result);
            this.log('info',
              `[${blockName}] ${stmt.tagName} = ${stmt.leftOperand}(${left}) ${stmt.operator} ${stmt.rightOperand}(${right}) = ${result}`
            );
            break;
          }

          case 'INVOKE': {
            const result = await invokeCommandByName(stmt.commandName, stmt.args);
            this.log('info', `[${blockName}] INVOQUE ${stmt.commandName}(${stmt.args.join(', ')}) → ${result.status}`);
            break;
          }

          case 'INVOKE_ASSIGN': {
            const result = await invokeCommandByName(stmt.commandName, stmt.args);
            const output = result.outputs[0] ?? 0;
            variables[stmt.varName] = output;
            this.log('info',
              `[${blockName}] ${stmt.varName} = INVOQUE ${stmt.commandName}(${stmt.args.join(', ')}) → ${output}`
            );
            break;
          }

          case 'COMMAND_CALL': {
            const result = await invokeCommandByName(stmt.commandName, stmt.args);
            const output = result.outputs[0] ?? 0;
            variables[stmt.varName] = output;
            this.log('info',
              `[${blockName}] ${stmt.varName} = ${stmt.commandName}(${stmt.args.join(', ')}) → ${output}`
            );
            break;
          }

          case 'IF_THEN': {
            const varValue = variables[stmt.varName];
            const matches = String(varValue) === String(stmt.compareValue);
            this.log('info',
              `[${blockName}] IF ${stmt.varName}(=${varValue}) == ${stmt.compareValue} → ${matches ? 'true → executing THEN' : 'false → skip'}`
            );
            if (matches) {
              await writeTagByName(String(stmt.tagName), stmt.assignValue);
              this.log('info', `[${blockName}] THEN ${stmt.tagName} = ${stmt.assignValue}`);
            }
            break;
          }

          case 'IF_THEN_STOP': {
            const varValue = variables[stmt.varName];
            const matches = String(varValue) === String(stmt.compareValue);
            this.log('info',
              `[${blockName}] IF ${stmt.varName}(=${varValue}) == ${stmt.compareValue} → ${matches ? 'true → STOP_SCRIPT' : 'false → continue'}`
            );
            if (matches) {
              this.stop();
              return; // exit sequential block immediately
            }
            break;
          }
        }
      } catch (err: any) {
        this.log('error', `[${blockName}] ${err.message}`);
      }
    }
  }

  async run(script: ParsedScript): Promise<void> {
    if (this.status === 'running') this.stop();

    this.status = 'running';
    this.emitStatus(true, 'starting');
    this.log('info', '══════════ Script started ══════════');

    const variables: Record<string, unknown> = {};

    // ONSTART — sequential, runs once before ALWAYS timers fire
    if (script.onstart.length > 0 && this.status === 'running') {
      this.emitStatus(true, 'ONSTART');
      this.log('info', '─── ONSTART block ───');
      await this.executeSequential(script.onstart, 'ONSTART', variables);
    }

    // ONCE — sequential, runs once after ONSTART
    if (script.once.length > 0 && this.status === 'running') {
      this.emitStatus(true, 'ONCE');
      this.log('info', '─── ONCE block ───');
      await this.executeSequential(script.once, 'ONCE', variables);
    }

    // ALWAYS — start each statement on its own independent interval
    if (script.always.length > 0 && this.status === 'running') {
      this.emitStatus(true, 'ALWAYS');
      this.log('info', '─── ALWAYS block (intervals active) ───');

      for (const stmt of script.always) {
        if (stmt.type === 'TAG_WRITE_INTERVAL') {
          const { tagName, value, intervalMs } = stmt;
          this.log('info', `Interval: ${tagName} = ${value} every ${intervalMs}ms`);
          this.timers.push(setInterval(async () => {
            if (this.status !== 'running') return;
            try {
              await writeTagByName(String(tagName), value);
              this.log('info', `[ALWAYS] ${tagName} = ${value}`);
            } catch (err: any) {
              this.log('error', `[ALWAYS] Write ${tagName}: ${err.message}`);
            }
          }, intervalMs));

        } else if (stmt.type === 'TAG_INCREMENT_INTERVAL') {
          const { tagName, delta, intervalMs } = stmt;
          this.log('info', `Interval: ${tagName} += ${delta} every ${intervalMs}ms`);
          this.timers.push(setInterval(async () => {
            if (this.status !== 'running') return;
            try {
              const cached = getCachedTags().find((t) => t.displayName === tagName || t.nodeId === tagName);
              const current = Number(cached?.value) || 0;
              const newVal = current + delta;
              await writeTagByName(tagName, newVal);
              this.log('info', `[ALWAYS] ${tagName} += ${delta} → ${newVal}`);
            } catch (err: any) {
              this.log('error', `[ALWAYS] Increment ${tagName}: ${err.message}`);
            }
          }, intervalMs));

        } else if (stmt.type === 'INVOKE_INTERVAL') {
          const { commandName, args, intervalMs } = stmt;
          this.log('info', `Interval: INVOQUE ${commandName}() every ${intervalMs}ms`);
          this.timers.push(setInterval(async () => {
            if (this.status !== 'running') return;
            try {
              const result = await invokeCommandByName(commandName, args);
              this.log('info', `[ALWAYS] INVOQUE ${commandName}(${args.join(', ')}) → ${result.status}`);
            } catch (err: any) {
              this.log('error', `[ALWAYS] Invoke ${commandName}: ${err.message}`);
            }
          }, intervalMs));
        }
      }
    } else if (this.status === 'running') {
      this.status = 'stopped';
      this.emitStatus(false, null);
      this.log('info', '══════════ Script completed ══════════');
    }
  }

  stop(): void {
    for (const t of this.timers) {
      clearTimeout(t as NodeJS.Timeout);
      clearInterval(t as NodeJS.Timeout);
    }
    this.timers = [];

    if (this.status === 'running') {
      this.status = 'stopped';
      this.emitStatus(false, null);
      this.log('info', '══════════ Script stopped ══════════');
    }
  }
}

export const scriptExecutor = new ScriptExecutor();
