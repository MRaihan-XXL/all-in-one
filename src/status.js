// status.js — `aio status`: read-only health report (state, manifest, agents)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CONFIG_FILE, STATE_DIR } from './paths.js';
import { BLOCK_START, blockEdited } from './write.js';
import { blockTargets } from './targets.js';

/** injected | no block | missing — for one agent instruction file. */
export function blockState(file) {
  if (!fs.existsSync(file)) return 'missing';
  return fs.readFileSync(file, 'utf8').includes(BLOCK_START) ? 'injected' : 'no block';
}

export function runStatus(opts = {}) {
  const home = os.homedir();
  const issues = [];
  const lines = [];

  lines.push(`state      ${STATE_DIR} ${fs.existsSync(CONFIG_FILE) ? '(config.json ok)' : '(no config.json yet)'}`);

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

  lines.push('agents');
  for (const { label, file, dir } of blockTargets(home)) {
    let s = blockState(file);
    // agent never installed (no config dir, no file) → not a problem, show n/a (N9)
    if (s === 'missing' && dir && !fs.existsSync(dir)) s = 'n/a';
    // C-02 drift: block exists but was edited outside aio → show it, refresh via `aio`
    if (s === 'injected' && blockEdited(file)) s = 'injected*';
    if (s === 'no block') issues.push(`${label}: file exists but has no aio block — run \`aio\``);
    lines.push(`  ${label.padEnd(10)} ${s.padEnd(12)} ${file}`);
    if (s === 'injected*') {
      lines.push(`  ${''.padEnd(10)}${'stale'.padEnd(12)}— edited outside aio; run \`aio\` to refresh (backups kept)`);
      issues.push(`${label}: block edited by hand — run \`aio\` to refresh (the edit is kept in backups/)`);
    }
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
