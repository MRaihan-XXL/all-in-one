// scan.js — read-only machine scan: agents, repos, tools, skills, MCP binary
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

/** Open ai-tools.db read-only (optional dependency; null when absent/broken). */
async function openDb(dataDir) {
  if (!dataDir) return null;
  const dbPath = path.join(dataDir, 'ai-tools.db');
  if (!fs.existsSync(dbPath)) return null;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch (e) {
    console.error(`[aio] note: could not read ai-tools.db (${e.message})`);
    return null;
  }
}

/**
 * Repository catalog — db-first (survives with zero local clones), merged with
 * whatever actually exists on disk (local path + clones not yet in the db).
 */
export async function loadRepos(dataDir, reposDir) {
  const db = await openDb(dataDir);
  const byFolder = new Map();
  if (db) {
    try {
      const rows = db
        .prepare(
          'SELECT folder, url, category, description, language, stars FROM repos ORDER BY folder'
        )
        .all();
      for (const r of rows) {
        byFolder.set(r.folder, {
          name: r.folder,
          url: r.url || '',
          description: r.description || '',
          category: r.category || '',
          language: r.language || '',
          stars: r.stars || 0,
          path: reposDir ? path.join(reposDir, r.folder) : null,
          cloned: Boolean(reposDir && fs.existsSync(path.join(reposDir, r.folder))),
        });
      }
    } catch (e) {
      console.error(`[aio] note: repos table unreadable (${e.message}) — falling back to scan`);
    }
    try {
      db.close();
    } catch { /* already closed */ }
  }
  // Directory scan stays as the fallback / merge source (fresh clones win).
  for (const r of scanRepos(reposDir)) {
    const hit = byFolder.get(r.name);
    if (hit) {
      if (!hit.url && r.url) hit.url = r.url;
      hit.cloned = true;
      hit.path = r.path;
    } else {
      byFolder.set(r.name, { ...r, description: '', category: '', language: '', stars: 0, cloned: true });
    }
  }
  return [...byFolder.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Curated website catalog (## SITES block). Empty when the table is absent. */
export async function loadSites(dataDir) {
  const db = await openDb(dataDir);
  if (!db) return [];
  try {
    const has = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sites'")
      .get();
    if (!has) return [];
    return db
      .prepare('SELECT name, url, category, why, used_by FROM sites ORDER BY category, name')
      .all()
      .map((r) => ({ ...r, url: r.url || '', why: r.why || '', used_by: r.used_by || '' }));
  } catch (e) {
    console.error(`[aio] note: sites table unreadable (${e.message})`);
    return [];
  } finally {
    try {
      db.close();
    } catch { /* already closed */ }
  }
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
