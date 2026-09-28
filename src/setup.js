// setup.js — the `aio` default command: scan → generate → inject → ensure → report
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveDataDir, resolveReposDir, writeState, BACKUP_DIR, STATE_DIR } from './paths.js';
import { detectAgents, detectBinary, scanRepos, loadTools, scanSkills } from './scan.js';
import { buildBlock, injectBlock, genContext, ensureMcp, fixPaths, backup } from './write.js';
import { getVersion } from './banner.js';

function targetFiles(home) {
  return [
    { label: 'opencode', file: path.join(home, '.config', 'opencode', 'AGENTS.md') },
    { label: 'claude', file: path.join(home, '.claude', 'CLAUDE.md') },
    { label: 'kimi', file: path.join(home, '.kimi-code', 'AGENTS.md') },
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

  const dataDir = resolveDataDir(opts.home);
  const reposDir = resolveReposDir(opts.repos);
  if (!dataDir) {
    console.log('[aio] note: no local data dir found (ai-tools.db / TOOLS-INDEX.md).');
    console.log('[aio]      Install location registry first, or run with --home <dir>.');
  }
  if (!reposDir) {
    console.log('[aio] note: repos dir not found. Pass --repos <dir> or set AIO_REPOS_DIR.');
  }

  const agents = detectAgents();
  const repos = scanRepos(reposDir);
  const tools = await loadTools(dataDir);
  const skills = scanSkills();
  const mcpBin = detectBinary('codebase-memory-mcp');

  const manifestPath = dataDir
    ? path.join(dataDir, 'aio-context.md')
    : path.join(STATE_DIR, 'aio-context.md');
  genContext({ version, dataDir, reposDir, repos, tools, skills, agents }, manifestPath);

  const body = buildBlock({ version, manifestPath, dataDir });
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
    dataDir,
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
      hermes: '→ ~/AGENTS.md',
      jcode: '→ ~/AGENTS.md (fallback)',
      freebuff: '→ ~/AGENTS.md (fallback)',
    }[a.name];
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

  const skillTotal = skills.reduce((n, s) => n + s.count, 0);
  console.log('\nManifest');
  row('x', 'aio-context.md', `REPOS ${repos.length} · TOOLS ${tools.length} · SKILLS ${skillTotal}`);
  console.log(`  ${manifestPath}`);
  console.log('');
  console.log(`Backups: ${BACKUP_DIR}`);
  console.log('Done. Open any agent directly (opencode / claude / kimi / ...) — it now knows');
  console.log('your repos, tools & skills. No slash-commands needed. Usage is disclosed as:');
  console.log('  [aio] Using <name> (<type>) — <function>');
  console.log('');
}
