import * as fs from 'fs';
import * as path from 'path';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

// Ensure scripts directory exists
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

export interface ScriptFile {
  name: string;
  content: string;
  updatedAt: string;
}

function toFileName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return safe.endsWith('.sim') ? safe : `${safe}.sim`;
}

function toFilePath(name: string): string {
  return path.join(SCRIPTS_DIR, toFileName(name));
}

export function listScripts(): ScriptFile[] {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith('.sim'))
    .map((f) => {
      const filePath = path.join(SCRIPTS_DIR, f);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        name: f.replace(/\.sim$/, ''),
        content,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadScript(name: string): ScriptFile {
  const filePath = toFilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Script not found: "${name}"`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const stat = fs.statSync(filePath);
  return { name, content, updatedAt: stat.mtime.toISOString() };
}

export function saveScript(name: string, content: string): void {
  const filePath = toFilePath(name);
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function deleteScript(name: string): void {
  const filePath = toFilePath(name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
