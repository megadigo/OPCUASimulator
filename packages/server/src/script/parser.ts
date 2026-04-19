// ─── AST Types ────────────────────────────────────────────────────────────────

export interface TagWriteStatement {
  type: 'TAG_WRITE';
  tagName: string;
  value: string | number | boolean;
}

export interface TagWriteIntervalStatement {
  type: 'TAG_WRITE_INTERVAL';
  tagName: string;
  value: string | number | boolean;
  intervalMs: number;
}

/** TAG_B = +10 EVERY 20s  — increments (or decrements) the tag each tick */
export interface TagIncrementIntervalStatement {
  type: 'TAG_INCREMENT_INTERVAL';
  tagName: string;
  delta: number;
  intervalMs: number;
}

/** TAG_C = TAG_A + TAG_B  — evaluated at runtime from live tag values */
export interface ExpressionWriteStatement {
  type: 'EXPRESSION_WRITE';
  tagName: string;
  leftOperand: string;
  operator: '+' | '-' | '*' | '/';
  rightOperand: string;
}

export interface InvokeStatement {
  type: 'INVOKE';
  commandName: string;
  args: (string | number | boolean)[];
}

export interface InvokeAssignStatement {
  type: 'INVOKE_ASSIGN';
  varName: string;
  commandName: string;
  args: (string | number | boolean)[];
}

/** RESPONSE = COMMAND_A(10, 20)  — command call without explicit INVOQUE keyword */
export interface CommandCallStatement {
  type: 'COMMAND_CALL';
  varName: string;
  commandName: string;
  args: (string | number | boolean)[];
}

export interface InvokeIntervalStatement {
  type: 'INVOKE_INTERVAL';
  commandName: string;
  args: (string | number | boolean)[];
  intervalMs: number;
}

export interface IfThenStatement {
  type: 'IF_THEN';
  varName: string;
  compareValue: string | number | boolean;
  tagName: string;
  assignValue: string | number | boolean;
}

/** IF TAG_A == 10000 THEN STOP_SCRIPT */
export interface IfThenStopStatement {
  type: 'IF_THEN_STOP';
  varName: string;
  compareValue: string | number | boolean;
}

export interface SleepStatement {
  type: 'SLEEP';
  ms: number;
}

export type AlwaysStatement =
  | TagWriteIntervalStatement
  | TagIncrementIntervalStatement
  | InvokeIntervalStatement;

export type SequentialStatement =
  | TagWriteStatement
  | ExpressionWriteStatement
  | CommandCallStatement
  | InvokeStatement
  | InvokeAssignStatement
  | IfThenStatement
  | IfThenStopStatement
  | SleepStatement;

export interface ParsedScript {
  always: AlwaysStatement[];
  onstart: SequentialStatement[];
  once: SequentialStatement[];
}

export interface ParseError {
  line: number;
  message: string;
}

// ─── Value helpers ────────────────────────────────────────────────────────────

function parseValue(raw: string): string | number | boolean {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  const num = Number(t);
  if (!isNaN(num) && t !== '') return num;
  return t;
}

function parseArgs(raw: string): (string | number | boolean)[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((a) => parseValue(a.trim()));
}

/** Accepts: 500ms | 10s | 2m | plain number (treated as seconds) */
function parseIntervalMs(raw: string): number {
  const t = raw.trim().toLowerCase();
  if (t.endsWith('ms')) return parseInt(t, 10);
  if (t.endsWith('m')) return parseInt(t, 10) * 60_000;
  if (t.endsWith('s')) return parseInt(t, 10) * 1_000;
  return parseInt(t, 10) * 1_000;
}

// Matches "each" or "every" (case-insensitive)
const INTERVAL_KW = '(?:each|every)';

// ─── ALWAYS block parser ──────────────────────────────────────────────────────

function parseAlwaysLine(line: string, lineNum: number): AlwaysStatement | ParseError {
  const t = line.trim();

  // INVOQUE CMD(args) [each|every] Ns
  const invokeInterval = t.match(
    new RegExp(`^INVOQUE\\s+(\\w+)\\s*\\(([^)]*)\\)\\s+${INTERVAL_KW}\\s+(\\S+)$`, 'i')
  );
  if (invokeInterval) {
    return {
      type: 'INVOKE_INTERVAL',
      commandName: invokeInterval[1],
      args: parseArgs(invokeInterval[2]),
      intervalMs: parseIntervalMs(invokeInterval[3]),
    };
  }

  // TAG = +/-N [each|every] Ns   (increment / decrement)
  const incrementInterval = t.match(
    new RegExp(`^(\\w+)\\s*=\\s*([+\\-]\\d+(?:\\.\\d+)?)\\s+${INTERVAL_KW}\\s+(\\S+)$`, 'i')
  );
  if (incrementInterval) {
    return {
      type: 'TAG_INCREMENT_INTERVAL',
      tagName: incrementInterval[1],
      delta: parseFloat(incrementInterval[2]),
      intervalMs: parseIntervalMs(incrementInterval[3]),
    };
  }

  // TAG = value [each|every] Ns   (set to fixed value)
  const tagInterval = t.match(
    new RegExp(`^(\\w+)\\s*=\\s*(.+?)\\s+${INTERVAL_KW}\\s+(\\S+)$`, 'i')
  );
  if (tagInterval) {
    return {
      type: 'TAG_WRITE_INTERVAL',
      tagName: tagInterval[1],
      value: parseValue(tagInterval[2]),
      intervalMs: parseIntervalMs(tagInterval[3]),
    };
  }

  return {
    line: lineNum,
    message: `ALWAYS block: expected 'NAME = value [each|every] Ns', 'NAME = +/-N [each|every] Ns', or 'INVOQUE CMD() [each|every] Ns'. Got: "${t}"`,
  };
}

// ─── Sequential block parser ──────────────────────────────────────────────────

// Reserved keywords that can NOT be used as tag/command names in expressions
const RESERVED = new Set(['IF', 'THEN', 'INVOQUE', 'SLEEP', 'ALWAYS', 'ONSTART', 'ONCE', 'STOP_SCRIPT']);

function parseSequentialLine(line: string, lineNum: number): SequentialStatement | ParseError {
  const t = line.trim();

  // SLEEP ms
  const sleep = t.match(/^SLEEP\s+(\d+)$/i);
  if (sleep) return { type: 'SLEEP', ms: parseInt(sleep[1], 10) };

  // IF VAR [==|=] value THEN STOP_SCRIPT
  const ifStop = t.match(/^IF\s+(\w+)\s*(?:==|=)\s*(.+?)\s+THEN\s+STOP_SCRIPT$/i);
  if (ifStop) {
    return {
      type: 'IF_THEN_STOP',
      varName: ifStop[1],
      compareValue: parseValue(ifStop[2]),
    };
  }

  // IF VAR [==|=] value THEN TAG = value
  const ifThen = t.match(/^IF\s+(\w+)\s*(?:==|=)\s*(.+?)\s+THEN\s+(\w+)\s*=\s*(.+)$/i);
  if (ifThen) {
    return {
      type: 'IF_THEN',
      varName: ifThen[1],
      compareValue: parseValue(ifThen[2]),
      tagName: ifThen[3],
      assignValue: parseValue(ifThen[4]),
    };
  }

  // VAR = INVOQUE CMD(args)   — explicit INVOQUE keyword
  const invokeAssign = t.match(/^(\w+)\s*=\s*INVOQUE\s+(\w+)\s*\(([^)]*)\)$/i);
  if (invokeAssign) {
    return {
      type: 'INVOKE_ASSIGN',
      varName: invokeAssign[1],
      commandName: invokeAssign[2],
      args: parseArgs(invokeAssign[3]),
    };
  }

  // INVOQUE CMD(args)   — explicit, no assignment
  const invoke = t.match(/^INVOQUE\s+(\w+)\s*\(([^)]*)\)$/i);
  if (invoke) {
    return {
      type: 'INVOKE',
      commandName: invoke[1],
      args: parseArgs(invoke[2]),
    };
  }

  // VAR = CMD(args)   — implicit command call, no INVOQUE keyword
  const cmdCall = t.match(/^(\w+)\s*=\s*(\w+)\s*\(([^)]*)\)$/);
  if (cmdCall && !RESERVED.has(cmdCall[2].toUpperCase())) {
    return {
      type: 'COMMAND_CALL',
      varName: cmdCall[1],
      commandName: cmdCall[2],
      args: parseArgs(cmdCall[3]),
    };
  }

  // TAG = OPERAND OP OPERAND   — binary expression (TAG_C = TAG_A + TAG_B)
  // Only if left-hand of RHS is an identifier (not a quoted string or negated number)
  const exprAssign = t.match(/^(\w+)\s*=\s*(\w+)\s*([+\-\*\/])\s*(.+)$/);
  if (exprAssign && !RESERVED.has(exprAssign[2].toUpperCase())) {
    return {
      type: 'EXPRESSION_WRITE',
      tagName: exprAssign[1],
      leftOperand: exprAssign[2],
      operator: exprAssign[3] as '+' | '-' | '*' | '/',
      rightOperand: exprAssign[4].trim(),
    };
  }

  // TAG = value   — simple write (must be last)
  const tagWrite = t.match(/^(\w+)\s*=\s*(.+)$/);
  if (tagWrite) {
    return {
      type: 'TAG_WRITE',
      tagName: tagWrite[1],
      value: parseValue(tagWrite[2]),
    };
  }

  return { line: lineNum, message: `Unrecognized statement: "${t}"` };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseScript(content: string): { script?: ParsedScript; errors: ParseError[] } {
  const lines = content.split('\n');
  const errors: ParseError[] = [];
  const script: ParsedScript = { always: [], onstart: [], once: [] };

  type Block = 'ALWAYS' | 'ONSTART' | 'ONCE' | null;
  let currentBlock: Block = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const t = lines[i].trim();

    if (!t || t.startsWith('//') || t.startsWith('#') || t.startsWith('--') || t.startsWith('- ')) continue;

    if (/^ALWAYS\s*\{/i.test(t))  { currentBlock = 'ALWAYS';  continue; }
    if (/^ONSTART\s*\{/i.test(t)) { currentBlock = 'ONSTART'; continue; }
    if (/^ONCE\s*\{/i.test(t))    { currentBlock = 'ONCE';    continue; }
    if (t === '}')                  { currentBlock = null;      continue; }

    if (!currentBlock) {
      errors.push({ line: lineNum, message: `Statement outside of a block (ALWAYS/ONSTART/ONCE): "${t}"` });
      continue;
    }

    if (currentBlock === 'ALWAYS') {
      const stmt = parseAlwaysLine(t, lineNum);
      if ('message' in stmt) errors.push(stmt as ParseError);
      else script.always.push(stmt as AlwaysStatement);
    } else {
      const stmt = parseSequentialLine(t, lineNum);
      if ('message' in stmt) errors.push(stmt as ParseError);
      else {
        if (currentBlock === 'ONSTART') script.onstart.push(stmt as SequentialStatement);
        else script.once.push(stmt as SequentialStatement);
      }
    }
  }

  if (errors.length > 0) return { errors };
  return { script, errors: [] };
}
