// status.js — `aio status`: read-only health report (state, manifest, agents, installs)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CONFIG_FILE, STATE_DIR, resolveReposDir } from './paths.js';
import { BLOCK_START } from './write.js';
import { detectAgents } from './scan.js';

/** injected | no block | missing — for one agent instruction file. */
export function blockState(file) {
  if (!fs.existsSync(file)) return 'missing';
  return fs.readFileSync(file, 'utf8').includes(BLOCK_START) ? 'injected' : 'no block';
}

/** Same target list as setup.js targetFiles() — global only for hermes/freebuff or when it exists. */
function targetFiles(home) {
  const files = [
    ['opencode', path.join(home, '.config', 'opencode', 'AGENTS.md')],
    ['claude', path.join(home, '.claude', 'CLAUDE.md')],
    ['kimi', path.join(home, '.kimi-code', 'AGENTS.md')],
    ['jcode', path.join(home, '.jcode', 'AGENTS.md')],
    ['codex', path.join(home, '.codex', 'AGENTS.md')],
    ['gemini', path.join(home, '.gemini', 'GEMINI.md')],
  ];
  const globalFile = path.join(home, 'AGENTS.md');
  const wantGlobal =
    fs.existsSync(globalFile) ||
    detectAgents().some((a) => a.found && (a.name === 'hermes' || a.name === 'freebuff'));
  if (wantGlobal) files.push(['global', globalFile]);
  return files;
}

function countRepoDirs(reposDir) {
  try {
    return fs.readdirSync(reposDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.')).length;
  } catch { return null; }
}

function installSummary() {
  const file = path.join(STATE_DIR, 'install-log.jsonl');
  if (!fs.existsSync(file)) return null;
  const latest = new Map(); // name → last status (retry chain, last entry wins)
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.name && (e.status === 'installed' || e.status === 'failed')) latest.set(e.name, e.status);
    } catch {}
  }
  if (latest.size === 0) return null;
  const installed = [...latest.values()].filter((s) => s === 'installed').length;
  const failed = latest.size - installed;
  return `${installed} installed · ${failed} failed (latest attempt per repo)`;
}

export function runStatus(opts = {}) {
  const home = os.homedir();
  const issues = [];
  const lines = [];

  lines.push(`state      ${STATE_DIR} ${fs.existsSync(CONFIG_FILE) ? '(config.json ok)' : '(no config.json yet)'}`);

  const reposDir = resolveReposDir(opts.repos, { write: false }); // status is read-only
  if (reposDir && fs.existsSync(reposDir)) {
    const n = countRepoDirs(reposDir);
    lines.push(n ? `repos      ${reposDir} (${n} dirs)` : `repos      ${reposDir} (0 dirs — optional, install plan only)`);
  } else {
    lines.push('repos      not configured (optional — the catalog is LIVE; pass --repos to scan a clone dir)');
  }

  const mp = path.join(STATE_DIR, 'aio-context.md');
  if (!fs.existsSync(mp)) {
    lines.push('manifest   MISSING — run `aio` to generate it');
    issues.push('manifest missing');
  } else {
    const age = Math.floor((Date.now() - fs.statSync(mp).mtimeMs) / 86400000);
    const live = fs.readFileSync(mp, 'utf8').includes('Live architecture');
    lines.push(`manifest   ${mp} — ${age}d old, ${live ? 'live architecture (no search storage)' : 'legacy layout — refresh: aio'}`);
    if (!live) issues.push('manifest still has the legacy catalog layout — run `aio` to refresh');
    else if (age > 7) issues.push(`manifest is ${age} days old — run \`aio\` to refresh`);
  }

  const inst = installSummary();
  if (inst) lines.push(`installs   ${inst}`);

  lines.push('agents');
  for (const [label, file] of targetFiles(home)) {
    const s = blockState(file);
    if (s === 'no block') issues.push(`${label}: file exists but has no aio block — run \`aio\``);
    lines.push(`  ${label.padEnd(10)} ${s.padEnd(9)} ${file}`);
  }

  for (const l of lines) console.log(`  ${l}`);
  if (issues.length) {
    console.log('');
    for (const i of issues) console.log(`  [issue] ${i}`);
    console.log('\n  → run `aio` to (re)generate and (re)wire.');
  } else {
    console.log('\n  healthy — no issues found.');
  }
  return { ok: issues.length === 0, issues, lines };
}
