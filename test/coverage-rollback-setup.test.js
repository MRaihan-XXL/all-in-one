// coverage-rollback-setup.test.js — the exec lanes coverage-bin.test.js cannot
// reach from the outside:
//   src/rollback.js  a CLEAN run (removed / already-gone rows → returns true)
//                    and an INCOMPLETE run (hand-edited skill kept → returns
//                    false) — exactly the contract bin/aio.js turns into
//                    exit 0 vs exit 1 (5g)
//   src/setup.js     a NON-DRY run: agent config dir present → inject path +
//                    [x] detected rows, corrupt .claude.json → [!] parse-error
//                    tag, fake MCP binary on PATH → ensureMcp lane, a backup
//                    older than 30d pruned, and the Node < 22 warning branch.
// Hermetic: AIO_STATE_DIR + APPDATA + PATH are pinned BEFORE the src imports
// (paths.js bakes STATE_DIR at import time); os.homedir is mocked per test, so
// no real home, roaming profile or network is ever touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// paths.js bakes STATE_DIR from AIO_STATE_DIR at import — pin it first
process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-rs-state-'));
process.env.AIO_NO_GH = '1';
process.env.AIO_RATE = '0';
// zedTarget() reads %APPDATA% on win32 — point it at temp, never the real profile
process.env.APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-rs-app-'));
// PATH holds ONLY a fake codebase-memory-mcp: detectBinary() finds it while no
// agent CLI is ever detected by name (every other scan comes from temp HOME)
const PATH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-rs-path-'));
fs.writeFileSync(path.join(PATH_DIR, 'codebase-memory-mcp'), '');
process.env.PATH = PATH_DIR;

const { runRollback } = await import('../src/rollback.js');
const { runSetup } = await import('../src/setup.js');
const { BACKUP_DIR, STATE_DIR } = await import('../src/paths.js');
const { skillsDir } = await import('../src/skill.js');

const MCP_LEDGER = path.join(STATE_DIR, 'mcp-ledger.json');
const SKILLS_LEDGER = path.join(STATE_DIR, 'skills-ledger.json');
// stripBlock only matches the markers, not the body — a minimal pair is enough
const BLOCK = '<!-- aio:auto-config:v1:start -->\ncontext body for the test.\n<!-- aio:auto-config:v1:end -->\n';
const BODY = '# Demo skill\n\nA body long enough to pass the 20-char stub guard.\n';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function write(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}

/** Capture console.log (and console.error on request) for assertions. */
function capture(t, alsoError = false) {
  const lines = [];
  const errs = [];
  t.mock.method(console, 'log', (...a) => lines.push(a.join(' ')));
  if (alsoError) t.mock.method(console, 'error', (...a) => errs.push(a.join(' ')));
  return { lines, errs };
}

/* ---------------- src/rollback.js: clean vs incomplete ---------------- */

test('runRollback: clean rows return true; a hand-edited skill flips it to false', (t) => {
  const home = tmp('aio-rs-home-');
  t.mock.method(os, 'homedir', () => home);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { lines } = capture(t);

  // one instruction file carries a block (removed), every other target is absent
  write(path.join(home, '.claude', 'CLAUDE.md'), BLOCK);

  // MCP ledger: one removable row + one whose key is already gone (both tags)
  const claudeJson = path.join(home, '.claude.json');
  write(claudeJson, JSON.stringify({ mcpServers: { 'codebase-memory-mcp': { command: 'x' } } }) + '\n');
  const jcodeJson = path.join(home, '.jcode', 'mcp.json');
  write(jcodeJson, '{}\n');
  write(
    MCP_LEDGER,
    JSON.stringify([
      { file: claudeJson, key: 'codebase-memory-mcp' },
      { file: jcodeJson, key: 'codebase-memory-mcp' },
    ])
  );

  // skills ledger: one byte-identical aio install (removed) + one already gone
  const root = skillsDir(home);
  const cleanFile = path.join(root, 'clean-skill', 'SKILL.md');
  write(cleanFile, BODY);
  write(
    SKILLS_LEDGER,
    JSON.stringify([
      { name: 'clean-skill', file: cleanFile, sha: sha(BODY), source: 'local demo' },
      { name: 'ghost-skill', file: path.join(root, 'ghost-skill', 'SKILL.md'), sha: sha('gone'), source: 'local gone' },
    ])
  );

  assert.equal(runRollback(), true, 'only resolved rows → the command reports success');
  assert.equal(fs.existsSync(cleanFile), false, 'the byte-identical skill was removed');
  assert.ok(
    lines.some((l) => l.includes('[x] claude') && l.includes('removed')),
    `context row tagged [x]: ${JSON.stringify(lines.filter((l) => l.includes('claude')).slice(0, 3))}`
  );
  assert.ok(lines.some((l) => l.includes('[ ]') && l.includes('absent')), 'absent targets tagged [ ]');
  assert.ok(lines.some((l) => l.includes('already gone')), 'already-gone rows reported');
  assert.ok(!lines.some((l) => l.includes('rollback incomplete')), 'clean run never reports incompleteness');

  // second run: the recorded skill was hand-edited after install → kept + exit 1
  lines.length = 0;
  const editFile = path.join(root, 'edit-skill', 'SKILL.md');
  write(editFile, BODY);
  write(SKILLS_LEDGER, JSON.stringify([{ name: 'edit-skill', file: editFile, sha: sha('original'), source: 'local demo' }]));

  assert.equal(runRollback(), false, 'a kept row → the exit-1 contract');
  assert.ok(
    lines.some((l) => l.includes('modified by hand — kept (yours now)')),
    `kept status printed: ${JSON.stringify(lines.filter((l) => l.includes('edit-skill')))}`
  );
  assert.ok(lines.some((l) => l.includes('[ ]') && l.includes('edit-skill')), 'kept row tagged [ ]');
  assert.ok(lines.some((l) => l.includes('rollback incomplete')), 'incomplete verdict printed');
  assert.equal(fs.existsSync(editFile), true, 'a hand-edited skill is never deleted');
});

/* ---------------- src/setup.js: the applied (non-dry) run ---------------- */

test('runSetup non-dry: detected agent, corrupt claude.json, MCP binary, pruned backup, old Node', async (t) => {
  const home = tmp('aio-rs-setup-home-');
  t.mock.method(os, 'homedir', () => home);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  // claude installed (config dir present) → agent detected + inject path taken
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  // corrupt JSON config → ensureJsonEntry parse error → tagOf('!') arm
  write(path.join(home, '.claude.json'), '{ this is not json');
  // a backup older than the 30-day window → pruneBackups() must count it
  const oldBackup = path.join(BACKUP_DIR, 'inject-claude__old__CLAUDE.md');
  write(oldBackup, 'previous content');
  const past = new Date(Date.now() - 40 * 86400000);
  fs.utimesSync(oldBackup, past, past);

  // Node < 22 warning lane: process.versions.node is writable:false but
  // configurable — redefine for the duration of this test, then restore
  const nodeDesc = Object.getOwnPropertyDescriptor(process.versions, 'node');
  t.after(() => Object.defineProperty(process.versions, 'node', nodeDesc));
  Object.defineProperty(process.versions, 'node', { value: '21.18.0', writable: true, enumerable: true, configurable: true });

  const { lines, errs } = capture(t, true);

  await runSetup();

  assert.ok(
    errs.some((l) => l.includes('warning: Node 21.18.0 detected')),
    `old-Node warning printed: ${JSON.stringify(errs)}`
  );
  assert.ok(lines.some((l) => l.includes('[!]') && l.includes('parse error')), 'tagOf error arm from the corrupt claude.json');
  assert.ok(lines.some((l) => l.includes('[ ]') && l.includes('skipped')), 'tagOf skip arm from absent config dirs');
  assert.ok(lines.some((l) => l.includes('[x] claude') && l.includes('detected')), 'detected-agent row (found=true)');
  assert.ok(
    lines.some((l) => l.includes('[x] claude') && l.includes('injected — ')),
    `block inject path taken: ${JSON.stringify(lines.filter((l) => l.includes('claude')))}`
  );
  assert.ok(lines.some((l) => l.includes('expired >30d pruned')), 'pruneBackups counted the 40-day-old backup');
  assert.equal(fs.existsSync(oldBackup), false, 'the expired backup was actually pruned');
});
