// scan.js — read-only machine scan: agents, repos, tools, skills, MCP binary
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const AGENT_NAMES = ['opencode', 'claude', 'kimi', 'jcode', 'freebuff', 'hermes'];

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

/** Detect the known agent CLIs on PATH. */
export function detectAgents() {
  return AGENT_NAMES.map((name) => {
    const bin = findOnPath(name);
    return { name, found: Boolean(bin), bin };
  });
}

/** Detect an auxiliary binary (e.g. codebase-memory-mcp) on PATH. */
export function detectBinary(name) {
  return findOnPath(name);
}

/** Scan a directory of cloned git repos; URL comes from each real .git/config. */
export function scanRepos(reposDir) {
  if (!reposDir || !fs.existsSync(reposDir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(reposDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const full = path.join(reposDir, ent.name);
    let url = '';
    try {
      const cfg = fs.readFileSync(path.join(full, '.git', 'config'), 'utf8');
      const m = cfg.match(/url\s*=\s*(\S+)/);
      if (m) url = m[1].replace(/\.git$/, '');
    } catch {
      /* not a git repo — listed as local-only */
    }
    out.push({ name: ent.name, url, path: full });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function stripMd(s) {
  return s.replace(/[`*_]/g, '').trim();
}

/** Parse TOOLS-INDEX.md markdown tables → tool rows (fallback when no DB). */
export function parseToolsIndex(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = [];
  let section = '';
  for (const line of lines) {
    const h = line.match(/^##\s+(\d+[a-z]?)\.?\s+(.*)$/i);
    if (h) {
      section = h[2].replace(/\s*\(.*\)$/, '').trim();
      continue;
    }
    if (!line.trim().startsWith('|')) continue;
    const raw = line.split('|');
    const cells = raw.slice(1, raw.length - 1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/^:?-{3,}:?$/.test(cells[0])) continue; // separator row
    const c0 = stripMd(cells[0]);
    if (/^(command|tool|catatan|layanan|akses|fungsi|item|skill|name)$/i.test(c0)) continue; // header
    out.push({
      name: c0,
      category: section,
      access: stripMd(cells[0]),
      version: '',
      url: '',
      description: cells.slice(1).map(stripMd).filter(Boolean).join(' · '),
      status: '',
      source: 'TOOLS-INDEX.md',
    });
  }
  return out;
}

/**
 * Tool catalog: prefer ai-tools.db (SQLite via node:sqlite, optional),
 * fall back to TOOLS-INDEX.md parse, else empty (graceful on other machines).
 */
export async function loadTools(dataDir) {
  if (!dataDir) return [];
  const dbPath = path.join(dataDir, 'ai-tools.db');
  if (fs.existsSync(dbPath)) {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db
        .prepare(
          'SELECT name, category, access, version, url, description, status FROM tools ORDER BY id'
        )
        .all();
      db.close();
      if (rows.length) return rows.map((r) => ({ ...r, source: 'ai-tools.db' }));
    } catch (e) {
      console.error(`[aio] note: could not read ai-tools.db (${e.message}) — falling back`);
    }
  }
  const mdPath = path.join(dataDir, 'TOOLS-INDEX.md');
  if (fs.existsSync(mdPath)) {
    try {
      return parseToolsIndex(mdPath);
    } catch (e) {
      console.error(`[aio] note: could not parse TOOLS-INDEX.md (${e.message})`);
    }
  }
  return [];
}

/** Count/list global agent skill directories (follows symlinked skills). */
export function scanSkills() {
  const home = os.homedir();
  const locations = [path.join(home, '.agents', 'skills'), path.join(home, '.claude', 'skills')];
  return locations.map((loc) => {
    let names = [];
    try {
      names = fs
        .readdirSync(loc, { withFileTypes: true })
        .filter((d) => {
          if (d.isDirectory()) return true;
          if (d.isSymbolicLink()) {
            try {
              return fs.statSync(path.join(loc, d.name)).isDirectory();
            } catch {
              return false;
            }
          }
          return false;
        })
        .map((d) => d.name)
        .sort();
    } catch {
      /* location absent */
    }
    return { location: loc, count: names.length, names };
  });
}
