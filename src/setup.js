// setup.js — the `aio` default command: scan → generate → inject → ensure → report
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveReposDir, writeState, BACKUP_DIR, STATE_DIR } from './paths.js';
import { detectAgents, detectBinary } from './scan.js';
import { buildBlock, injectBlock, genContext, ensureMcp, fixPaths, backup } from './write.js';
import { getVersion } from './banner.js';

function targetFiles(home) {
  return [
    { label: 'opencode', file: path.join(home, '.config', 'opencode', 'AGENTS.md') },
    { label: 'claude', file: path.join(home, '.claude', 'CLAUDE.md') },
    { label: 'kimi', file: path.join(home, '.kimi-code', 'AGENTS.md') },
    { label: 'jcode', file: path.join(home, '.jcode', 'AGENTS.md') },
    { label: 'codex', file: path.join(home, '.codex', 'AGENTS.md') },
    { label: 'gemini', file: path.join(home, '.gemini', 'GEMINI.md') },
    { label: 'global', file: path.join(home, 'AGENTS.md') },
  ];
}

function row(tag, name, detail) {
  console.log(`  [${tag}] ${name.padEnd(26)} ${detail}`);
}

export async function runSetup(opts = {}) {
  const version = getVersion();
  const home = os.homedir();

  if (Number(process.versions.node.split('.')[0]) < 22) {
    console.error(`[aio] warning: Node ${process.versions.node} detected — Node >= 22 recommended`);
  }

  const reposDir = resolveReposDir(opts.repos);
  if (!reposDir) {
    console.log('[aio] note: repos dir not found (optional — install plan only). Pass --repos <dir>.');
  }

  const agents = detectAgents();
  const mcpBin = detectBinary('codebase-memory-mcp');

  const manifestPath = path.join(STATE_DIR, 'aio-context.md');
  genContext({ version, agents }, manifestPath);

  const body = buildBlock({ version, manifestPath });
  const targets = targetFiles(home);
  const blockResults = targets.map((t) => {
    if (!fs.existsSync(path.dirname(t.file))) {
      return { ...t, status: 'skipped (agent not installed)' };
    }
    return { ...t, ...injectBlock(t.file, body, `inject-${t.label}`) };
  });

  const mcpResults = mcpBin
    ? ensureMcp(mcpBin)
    : [{ target: 'codebase-memory-mcp', status: 'binary not on PATH — skipped' }];

  const pathResults = fixPaths();

  writeState({
    version,
    reposDir,
    manifestPath,
    lastRun: new Date().toISOString(),
  });

  /* ---- report ---- */
  console.log('');
  console.log(`aio setup v${version}`);
  console.log('─'.repeat(76));

  console.log('\nAgents');
  for (const a of agents) {
    const cover = {
      opencode: '→ .config/opencode/AGENTS.md',
      claude: '→ .claude/CLAUDE.md',
      kimi: '→ .kimi-code/AGENTS.md',
      jcode: '→ .jcode/AGENTS.md',
      codex: '→ .codex/AGENTS.md',
      gemini: '→ .gemini/GEMINI.md',
      hermes: '→ ~/AGENTS.md',
      freebuff: '→ ~/AGENTS.md (fallback)',
    }[a.name] || '';
    row(a.found ? 'x' : ' ', a.name, `${a.found ? 'detected' : 'not installed'}  ${cover}`);
  }

  console.log('\nContext block (auto-use rules + usage disclosure)');
  for (const r of blockResults) row(r.status.includes('skip') ? ' ' : 'x', path.basename(r.file), `${r.status} — ${r.file}`);

  console.log('\nMCP (codebase-memory-mcp)');
  if (!mcpResults.length) console.log('  [ ] none — no config files found');
  for (const r of mcpResults) row(r.status.includes('skip') ? ' ' : 'x', r.target, r.status);

  console.log('\nStale path repair (folder rename)');
  if (!pathResults.length) console.log('  [x] clean — no broken "AI tutorial" references');
  for (const r of pathResults) row('x', path.basename(r.target), r.status);

  console.log('\nManifest (slim — catalog stays LIVE, zero storage)');
  row('x', 'aio-context.md', `rules + disclosure + ${agents.filter((a) => a.found).length} agents · manifest data = live at ask time`);
  console.log(`  ${manifestPath}`);
  console.log('');
  console.log(`Backups: ${BACKUP_DIR}`);
  console.log('Done. Every agent now searches LIVE (GitHub/npm/crates) — no slash-commands, nothing stored.');
  console.log('Prompt flow: aio ask (live) → use ephemerally → report (link + function) → clean.');
  console.log('  [aio] Using [<name>](<url>) (<type>) — <function>');
  console.log('');
}
