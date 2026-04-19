export interface ParseError { line: number; message: string; }

export type Expr =
  | { kind: 'literal'; value: unknown }
  | { kind: 'tag';     name: string }
  | { kind: 'var';     name: string }
  | { kind: 'binop';   op: '+' | '-' | '*' | '/'; left: Expr; right: Expr };

export type Statement =
  | { kind: 'TAG_WRITE';              tagName: string; expr: Expr }
  | { kind: 'TAG_INCREMENT';          tagName: string; delta: number }
  | { kind: 'TAG_INTERVAL';           tagName: string; expr: Expr; intervalMs: number }
  | { kind: 'TAG_ROTATE';             tagName: string; values: unknown[]; intervalMs: number }
  | { kind: 'TAG_INCREMENT_INTERVAL'; tagName: string; delta: number; intervalMs: number }
  | { kind: 'VAR_ASSIGN';             varName: string; tagName: string }
  | { kind: 'CMD_INVOKE';             cmdName: string; args: Expr[] }
  | { kind: 'CMD_INVOKE_INTERVAL';    cmdName: string; args: Expr[]; intervalMs: number }
  | { kind: 'CMD_ASSIGN';             varName: string; cmdName: string; args: Expr[] }
  | { kind: 'IF_THEN';                left: Expr; op: string; right: Expr; body: Statement[] }
  | { kind: 'RESET';                  name: string }
  | { kind: 'SLEEP';                  ms: number }
  | { kind: 'STOP' };

export interface ParsedScript { statements: Statement[]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIntervalMs(raw: string): number {
  const t = raw.trim().toLowerCase();
  if (t.endsWith('ms')) return parseInt(t, 10);
  if (t.endsWith('m'))  return parseInt(t, 10) * 60_000;
  if (t.endsWith('s'))  return parseInt(t, 10) * 1_000;
  return parseInt(t, 10);
}

function parseLiteral(raw: string): unknown {
  const t = raw.trim();
  if (t === 'true')  return true;
  if (t === 'false') return false;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  const n = Number(t);
  if (!isNaN(n) && t !== '') return n;
  return t;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { kind: 'TAG';  name: string }
  | { kind: 'NUM';  value: number }
  | { kind: 'STR';  value: string }
  | { kind: 'BOOL'; value: boolean }
  | { kind: 'IDENT'; name: string }
  | { kind: 'OP';   op: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = src.trim();
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }

    if (s[i] === '[') {
      const end = s.indexOf(']', i);
      if (end === -1) break;
      tokens.push({ kind: 'TAG', name: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (s[i] === '"' || s[i] === "'") {
      const q = s[i];
      const end = s.indexOf(q, i + 1);
      if (end === -1) break;
      tokens.push({ kind: 'STR', value: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (['+', '-', '*', '/'].includes(s[i])) {
      const prevIsVal = tokens.length > 0 && ['TAG', 'NUM', 'STR', 'BOOL', 'IDENT'].includes(tokens[tokens.length - 1].kind);
      if ((s[i] === '-' || s[i] === '+') && !prevIsVal && /\d/.test(s[i + 1] ?? '')) {
        const sign = s[i] === '-' ? -1 : 1;
        i++;
        let n = '';
        while (i < s.length && /[\d.]/.test(s[i])) n += s[i++];
        tokens.push({ kind: 'NUM', value: sign * parseFloat(n) });
        continue;
      }
      tokens.push({ kind: 'OP', op: s[i] });
      i++;
      continue;
    }

    if (/\d/.test(s[i])) {
      let n = '';
      while (i < s.length && /[\d.]/.test(s[i])) n += s[i++];
      tokens.push({ kind: 'NUM', value: parseFloat(n) });
      continue;
    }

    if (/[A-Za-z_]/.test(s[i])) {
      let name = '';
      while (i < s.length && /[\w.]/.test(s[i])) name += s[i++];
      if (name === 'true')  tokens.push({ kind: 'BOOL', value: true });
      else if (name === 'false') tokens.push({ kind: 'BOOL', value: false });
      else tokens.push({ kind: 'IDENT', name });
      continue;
    }
    i++;
  }
  return tokens;
}

// ─── Expression parser (recursive descent) ───────────────────────────────────

function parseExprStr(src: string): Expr {
  const tokens = tokenize(src);
  const [expr] = parseAddSub(tokens, 0);
  return expr;
}

function parseAddSub(tokens: Token[], pos: number): [Expr, number] {
  let [left, i] = parseMulDiv(tokens, pos);
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.kind === 'OP' && (tok.op === '+' || tok.op === '-')) {
      const op = tok.op as '+' | '-';
      const [right, next] = parseMulDiv(tokens, i + 1);
      left = { kind: 'binop', op, left, right };
      i = next;
    } else break;
  }
  return [left, i];
}

function parseMulDiv(tokens: Token[], pos: number): [Expr, number] {
  let [left, i] = parsePrimary(tokens, pos);
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.kind === 'OP' && (tok.op === '*' || tok.op === '/')) {
      const op = tok.op as '*' | '/';
      const [right, next] = parsePrimary(tokens, i + 1);
      left = { kind: 'binop', op, left, right };
      i = next;
    } else break;
  }
  return [left, i];
}

function parsePrimary(tokens: Token[], pos: number): [Expr, number] {
  const tok = tokens[pos];
  if (!tok) return [{ kind: 'literal', value: 0 }, pos];
  switch (tok.kind) {
    case 'TAG':  return [{ kind: 'tag',     name:  tok.name  }, pos + 1];
    case 'NUM':  return [{ kind: 'literal', value: tok.value }, pos + 1];
    case 'STR':  return [{ kind: 'literal', value: tok.value }, pos + 1];
    case 'BOOL': return [{ kind: 'literal', value: tok.value }, pos + 1];
    case 'IDENT':return [{ kind: 'var',     name:  tok.name  }, pos + 1];
    default:     return [{ kind: 'literal', value: 0 }, pos + 1];
  }
}

function parseArgList(raw: string): Expr[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((a) => parseExprStr(a.trim()));
}

// ─── Line parser ──────────────────────────────────────────────────────────────

function parseStatement(line: string, lineNum: number): Statement | ParseError {
  const t = line.trim();

  if (/^STOP\s+SIMULATION$/i.test(t)) return { kind: 'STOP' };

  const sleep = t.match(/^SLEEP\s+(\d+)$/i);
  if (sleep) return { kind: 'SLEEP', ms: parseInt(sleep[1], 10) };

  const reset = t.match(/^RESET\s+\[([^\]]+)\]$/i);
  if (reset) return { kind: 'RESET', name: reset[1] };

  // IF expr op expr THEN body
  const ifMatch = t.match(/^IF\s+(.+?)\s+(==|!=|>=|<=|>|<)\s+(.+?)\s+THEN\s+(.+)$/i);
  if (ifMatch) {
    const left  = parseExprStr(ifMatch[1]);
    const op    = ifMatch[2];
    const right = parseExprStr(ifMatch[3]);
    const thenPart = ifMatch[4].trim();
    const body: Statement[] = [];
    const parts = thenPart.startsWith('{')
      ? thenPart.replace(/^\{/, '').replace(/\}$/, '').split(';').map(s => s.trim()).filter(Boolean)
      : [thenPart];
    for (const part of parts) {
      const sub = parseStatement(part, lineNum);
      if ('message' in sub) return sub as ParseError;
      body.push(sub as Statement);
    }
    return { kind: 'IF_THEN', left, op, right, body };
  }

  // [CMD](args) EVERY Nms
  const cmdIntervalM = t.match(/^\[([^\]]+)\]\s*\(([^)]*)\)\s+EVERY\s+(\S+)$/i);
  if (cmdIntervalM) {
    return {
      kind: 'CMD_INVOKE_INTERVAL',
      cmdName: cmdIntervalM[1],
      args: parseArgList(cmdIntervalM[2]),
      intervalMs: parseIntervalMs(cmdIntervalM[3]),
    };
  }

  // [CMD](args)
  const cmdInvokeM = t.match(/^\[([^\]]+)\]\s*\(([^)]*)\)$/);
  if (cmdInvokeM) {
    return { kind: 'CMD_INVOKE', cmdName: cmdInvokeM[1], args: parseArgList(cmdInvokeM[2]) };
  }

  // varName = [CMD](args)
  const cmdAssignM = t.match(/^([A-Za-z_]\w*)\s*=\s*\[([^\]]+)\]\s*\(([^)]*)\)$/);
  if (cmdAssignM) {
    return {
      kind: 'CMD_ASSIGN',
      varName: cmdAssignM[1],
      cmdName: cmdAssignM[2],
      args: parseArgList(cmdAssignM[3]),
    };
  }

  // [TAG] += / -= N EVERY Nms
  const tagIncIntervalM = t.match(/^\[([^\]]+)\]\s*(\+=|-=)\s*(\d+(?:\.\d+)?)\s+EVERY\s+(\S+)$/i);
  if (tagIncIntervalM) {
    const delta = parseFloat(tagIncIntervalM[3]) * (tagIncIntervalM[2] === '-=' ? -1 : 1);
    return { kind: 'TAG_INCREMENT_INTERVAL', tagName: tagIncIntervalM[1], delta, intervalMs: parseIntervalMs(tagIncIntervalM[4]) };
  }

  // [TAG] += / -= N
  const tagIncM = t.match(/^\[([^\]]+)\]\s*(\+=|-=)\s*(\d+(?:\.\d+)?)$/);
  if (tagIncM) {
    const delta = parseFloat(tagIncM[3]) * (tagIncM[2] === '-=' ? -1 : 1);
    return { kind: 'TAG_INCREMENT', tagName: tagIncM[1], delta };
  }

  // [TAG] = (v1,v2,v3) EVERY Nms  — rotate
  const rotateM = t.match(/^\[([^\]]+)\]\s*=\s*\(([^)]+)\)\s+EVERY\s+(\S+)$/i);
  if (rotateM) {
    return {
      kind: 'TAG_ROTATE',
      tagName: rotateM[1],
      values: rotateM[2].split(',').map(v => parseLiteral(v.trim())),
      intervalMs: parseIntervalMs(rotateM[3]),
    };
  }

  // [TAG] = expr EVERY Nms
  const tagIntervalM = t.match(/^\[([^\]]+)\]\s*=\s*(.+?)\s+EVERY\s+(\S+)$/i);
  if (tagIntervalM) {
    return {
      kind: 'TAG_INTERVAL',
      tagName: tagIntervalM[1],
      expr: parseExprStr(tagIntervalM[2]),
      intervalMs: parseIntervalMs(tagIntervalM[3]),
    };
  }

  // [TAG] = expr
  const tagWriteM = t.match(/^\[([^\]]+)\]\s*=\s*(.+)$/);
  if (tagWriteM) {
    return { kind: 'TAG_WRITE', tagName: tagWriteM[1], expr: parseExprStr(tagWriteM[2]) };
  }

  // varName = [TAG]
  const varAssignM = t.match(/^([A-Za-z_]\w*)\s*=\s*\[([^\]]+)\]$/);
  if (varAssignM) {
    return { kind: 'VAR_ASSIGN', varName: varAssignM[1], tagName: varAssignM[2] };
  }

  return { line: lineNum, message: `Unrecognized statement: "${t}"` };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseScript(content: string): { script?: ParsedScript; errors: ParseError[] } {
  const lines = content.split('\n');
  const errors: ParseError[] = [];
  const statements: Statement[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].replace(/\/\/.*$/, '').trim();
    if (!line) continue;

    const stmt = parseStatement(line, lineNum);
    if ('message' in stmt) errors.push(stmt as ParseError);
    else statements.push(stmt as Statement);
  }

  if (errors.length > 0) return { errors };
  return { script: { statements }, errors: [] };
}
