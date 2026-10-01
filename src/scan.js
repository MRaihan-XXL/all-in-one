// scan.js — read-only machine scan: agents, MCP binary
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Agent spec: PATH binary OR instruction-parent dir present (codex/gemini may be
// configured without a shell wrapper).
const AGENTS = [
  { name: 'opencode', dirHint: '.config/opencode' },
  { name: 'claude', dirHint: '.claude' },
  { name: 'kimi', dirHint: '.kimi-code' },
  { name: 'jcode', dirHint: '.jcode' },
  { name: 'freebuff', dirHint: null },
  { name: 'hermes', dirHint: null },
  { name: 'codex', dirHint: '.codex' },
  { name: 'gemini', dirHint: '.gemini' },
];
export const AGENT_NAMES = AGENTS.map((a) => a.name);

function pathDirs() {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .map((d) => d.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function findOnPath(name) {
  const exts = ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean), '.PS1'];
  for (const dir of pathDirs()) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        /* unreadable PATH entry — keep scanning */
      }
    }
  }
  return null;
}

/** Detect the known agent CLIs: on PATH, or by their instruction directory. */
export function detectAgents() {
  const home = os.homedir();
  return AGENTS.map(({ name, dirHint }) => {
    const bin = findOnPath(name);
    const configured = Boolean(dirHint && fs.existsSync(path.join(home, dirHint)));
    return {
      name,
      found: Boolean(bin) || configured,
      bin: bin || (configured ? `(configured: ~/${dirHint})` : null),
    };
  });
}

/** Detect an auxiliary binary (e.g. codebase-memory-mcp) on PATH. */
export function detectBinary(name) {
  return findOnPath(name);
}

