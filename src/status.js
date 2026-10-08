// status.js — `aio status`: read-only health report (state, manifest, agents)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CONFIG_FILE, STATE_DIR } from './paths.js';
import { BLOCK_START, BLOCK_END, blockEdited } from './write.js';
import { blockTargets } from './targets.js';
import { msg } from './messages.js';

/** injected | no block | missing — for one agent instruction file. */
export function blockState(file) {
  if (!fs.existsSync(file)) return 'missing';
  const txt = fs.readFileSync(file, 'utf8');
  if (!txt.includes(BLOCK_START)) return 'no block';
  // truncated block (start marker, no end) is NOT healthy — classify as no block → issue
  return txt.includes(BLOCK_END) ? 'injected' : 'no block';
}

export function runStatus() {
  const home = os.homedir();
  const issues = [];
  const lines = [];

  lines.push(`state      ${STATE_DIR} ${fs.existsSync(CONFIG_FILE) ? msg('statusCfgOk') : msg('statusCfgNone')}`);

  const mp = path.join(STATE_DIR, 'aio-context.md');
  if (!fs.existsSync(mp)) {
    lines.push(msg('statusManifestMissing'));
    issues.push(msg('statusIssNoManifest'));
  } else {
    const age = Math.floor((Date.now() - fs.statSync(mp).mtimeMs) / 86400000);
    const live = fs.readFileSync(mp, 'utf8').includes('Live architecture');
    lines.push(msg('statusManifestLine', { mp, age, layout: msg(live ? 'doctorLayoutLive' : 'statusLayoutLegacy') }));
    if (!live) issues.push(msg('statusIssLegacy'));
    else if (age > 7) issues.push(msg('statusIssStale', { age }));
  }

  lines.push(msg('statusAgentsHead'));
  for (const { label, file, dir } of blockTargets(home)) {
    let s = blockState(file);
    // agent never installed (no config dir, no file) → not a problem, show n/a (N9)
    if (s === 'missing' && dir && !fs.existsSync(dir)) s = 'n/a';
    // installed agent but instruction file is gone → same state doctor calls [!!]
    else if (s === 'missing') issues.push(msg('statusIssFileMissing', { label }));
    // C-02 drift: block exists but was edited outside aio → show it, refresh via `aio`
    if (s === 'injected' && blockEdited(file)) s = 'injected*';
    if (s === 'no block') issues.push(msg('statusIssNoBlock', { label }));
    lines.push(`  ${label.padEnd(10)} ${s.padEnd(12)} ${file}`);
    if (s === 'injected*') {
      lines.push(`  ${''.padEnd(10)}${msg('statusStaleWord').padEnd(12)}${msg('statusStaleNote')}`);
      issues.push(msg('statusIssEdited', { label }));
    }
  }

  for (const l of lines) console.log(`  ${l}`);
  if (issues.length) {
    console.log('');
    for (const i of issues) console.log(`  [issue] ${i}`);
    console.log(`\n${msg('statusHint')}`);
  } else {
    console.log(`\n  ${msg('statusHealthy')}`);
  }
  return { ok: issues.length === 0, issues, lines };
}
