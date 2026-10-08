// skill.test.js — src/skill.js unit tests (isolated state + fixture home, NO network).
// Follows the isolation pattern of status.test.js: AIO_STATE_DIR is pinned to a
// temp dir BEFORE the dynamic import (paths.js bakes STATE_DIR at import time),
// and each test mocks os.homedir so skills land in <fixtureHome>/.agents/skills —
// never in the real user home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-skill-state-')); // must precede the src import
process.env.AIO_NO_GH = '1'; // no gh subprocess in tests
process.env.AIO_OFFLINE = '1'; // never touch the network — remote lane returns null before fetch

const { skillAdd, skillRemove, removeSkillAdditions, skillsDir } = await import('../src/skill.js');
const { STATE_DIR } = await import('../src/paths.js');

const LEDGER = path.join(STATE_DIR, 'skills-ledger.json');
// same digest the ledger records: sha256 hex, first 16 chars (src/skill.js)
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

/** Isolated home for os.homedir() + an empty ledger (tests share STATE_DIR). */
function fixtureHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-skill-home-'));
  t.mock.method(os, 'homedir', () => home);
  fs.rmSync(LEDGER, { force: true }); // every test starts from "aio installed nothing"
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

/** Local skill source dir holding a SKILL.md of known content. */
function sourceDir(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-skill-src-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
  return dir;
}

/** Ledger contents — [] both when absent and when emptied (mirrors ledgerRead). */
function ledger() {
  if (!fs.existsSync(LEDGER)) return [];
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}

test('skillAdd --file (local dir): writes SKILL.md + ledger entry whose sha matches content', async (t) => {
  const home = fixtureHome(t);
  const CONTENT = '# X Skill\n\nDo the thing.\n';
  const src = sourceDir(CONTENT);

  const r = await skillAdd({ target: '', file: src, name: 'x-skill', dry: false });

  assert.equal(r.ok, true, r.text);
  const file = path.join(skillsDir(home), 'x-skill', 'SKILL.md');
  assert.equal(fs.readFileSync(file, 'utf8'), CONTENT, `installed at ${file}`);
  const entry = ledger().find((e) => e.name === 'x-skill');
  assert.ok(entry, `ledger entry recorded in ${LEDGER}`);
  assert.equal(entry.file, file, 'ledger records the exact installed path');
  assert.equal(entry.sha, sha(CONTENT), 'sha = sha256(content).hex.slice(0,16)');
  assert.match(entry.source, /^local /, 'source labelled local');
});

test('skillAdd: re-add the same skill → ok + status "present", bytes unchanged', async (t) => {
  const home = fixtureHome(t);
  const CONTENT = '# Re-add\n\nIdempotent.\n';
  const src = sourceDir(CONTENT);
  await skillAdd({ target: '', file: src, name: 'x-skill', dry: false });
  const file = path.join(skillsDir(home), 'x-skill', 'SKILL.md');
  const before = fs.readFileSync(file, 'utf8');

  const r = await skillAdd({ target: '', file: src, name: 'x-skill', dry: false });

  assert.equal(r.ok, true, 'already installed BY aio → true idempotence (exit 0)');
  assert.match(r.text, /x-skill: present\b/, `status is exactly "present": ${r.text}`);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'file byte-identical');
  assert.equal(ledger().filter((e) => e.name === 'x-skill').length, 1, 'no duplicate ledger row');
});

test('skillAdd dry:true → ok plan only: file NOT written, no ledger entry', async (t) => {
  const home = fixtureHome(t);
  const src = sourceDir('# Dry\n\nPlan only.\n');

  const r = await skillAdd({ target: '', file: src, name: 'x-dry', dry: true });

  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /would install \(dry-run\)/, `plan reported: ${r.text}`);
  assert.equal(fs.existsSync(path.join(skillsDir(home), 'x-dry')), false, 'no skill dir created');
  assert.equal(fs.existsSync(LEDGER), false, 'dry run never even creates the ledger');
  assert.deepEqual(ledger(), [], 'dry run records nothing');
});

test('foreign skill (on disk, no ledger): add refused, remove refused, file kept', async (t) => {
  const home = fixtureHome(t);
  const dir = path.join(skillsDir(home), 'foreign-skill');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# mine, not aio\'s\n');
  const src = sourceDir('# mine, not aio\'s\n');

  const add = await skillAdd({ target: '', file: src, name: 'foreign-skill', dry: false });
  assert.equal(add.ok, true, add.text); // 2f: a benign skip exits 0 (remove below still refuses)
  assert.match(add.text, /not installed by aio/, `ownership refused: ${add.text}`);

  const rm = skillRemove({ target: 'foreign-skill' });
  assert.equal(rm.ok, false, rm.text);
  assert.match(rm.text, /not installed by aio/, `removal refused: ${rm.text}`);
  assert.ok(fs.existsSync(path.join(dir, 'SKILL.md')), 'user-owned file still on disk');
});

test('removeSkillAdditions: byte-identical aio install → removed, dir gone, ledger emptied', async (t) => {
  const home = fixtureHome(t);
  const src = sourceDir('CLEAN ME — byte identical');
  await skillAdd({ target: '', file: src, name: 'clean-skill', dry: false });
  const dir = path.join(skillsDir(home), 'clean-skill');
  assert.ok(fs.existsSync(dir), 'precondition: installed');

  const out = removeSkillAdditions();

  assert.deepEqual(out, [{ target: 'clean-skill', status: 'removed' }]);
  assert.equal(fs.existsSync(dir), false, 'skill dir gone');
  assert.deepEqual(ledger(), [], 'ledger emptied — aio owns nothing anymore');
});

test('removeSkillAdditions: hand-modified SKILL.md → kept + reported, ledger entry dropped', async (t) => {
  const home = fixtureHome(t);
  const src = sourceDir('ORIGINAL');
  await skillAdd({ target: '', file: src, name: 'tweaked-skill', dry: false });
  const file = path.join(skillsDir(home), 'tweaked-skill', 'SKILL.md');
  fs.writeFileSync(file, 'ORIGINAL + hand edit'); // drift: sha no longer matches the ledger

  const out = removeSkillAdditions();

  assert.equal(out.length, 1);
  assert.equal(out[0].target, 'tweaked-skill');
  assert.match(out[0].status, /modified by hand/, `reported as handed over: ${out[0].status}`);
  assert.equal(fs.readFileSync(file, 'utf8'), 'ORIGINAL + hand edit', 'file KEPT byte-identical');
  assert.deepEqual(ledger(), [], 'ownership passed to the user — entry dropped');
});

test('removeSkillAdditions: traversal ledger entry → invalid + kept, nothing outside the skills root deleted', (t) => {
  const home = fixtureHome(t);
  const root = skillsDir(home);

  // Sentinel exactly where a "../evil" ledger name would resolve — OUTSIDE the
  // skills root. If the path guard were missing this is what a tampered ledger
  // could take out.
  const sentinel = path.resolve(root, '..', 'evil', 'SKILL.md');
  fs.mkdirSync(path.dirname(sentinel), { recursive: true });
  fs.writeFileSync(sentinel, 'DO NOT DELETE');

  // Hand-crafted tampered entry: name walks out of the root and `file` does not
  // even point at the path the guard computes → must be flagged, not trusted.
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    LEDGER,
    JSON.stringify([{ name: '../evil', file: path.join(root, 'elsewhere', 'SKILL.md'), sha: 'deadbeefdeadbeef' }], null, 2)
  );

  const out = removeSkillAdditions();

  assert.equal(out.length, 1);
  assert.match(out[0].status, /invalid/, `must not be acted on: ${out[0].status}`);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'DO NOT DELETE', 'sentinel outside the skills root untouched');
  assert.deepEqual(ledger(), [{ name: '../evil', file: path.join(root, 'elsewhere', 'SKILL.md'), sha: 'deadbeefdeadbeef' }], 'invalid entry KEPT for manual review');
});

test('skillAdd: AIO_OFFLINE=1 + remote target → ok:false naming AIO_OFFLINE, network never touched', async (t) => {
  fixtureHome(t);
  t.mock.method(globalThis, 'fetch', async (input) => {
    throw new Error(`offline guard must return before fetch: ${input}`);
  });

  const r = await skillAdd({ target: 'owner/some-repo' });

  assert.equal(r.ok, false, r.text);
  assert.match(r.text, /AIO_OFFLINE/, `offline reason surfaced: ${r.text}`);
  assert.match(r.text, /SKILL\.md not found/, 'no content → install refused');
});

test('skillAdd: no target and no --file → usage, ok:false', async (t) => {
  fixtureHome(t);

  const r = await skillAdd({ target: '' });

  assert.equal(r.ok, false);
  assert.ok(r.text.startsWith('usage:'), `usage first: ${r.text}`);
  assert.match(r.text, /aio skill add/);
});

/* ---------------- --sha256 integrity pin (1b) ---------------- */

test('skillAdd --sha256: malformed pin → refusal with the NORMALIZED value, nothing installed', async (t) => {
  const home = fixtureHome(t);
  const src = sourceDir('# Pinned skill\n\nA body long enough to pass the stub guard.\n');

  const spaced = await skillAdd({ target: '', file: src, name: 'sha-bad', sha256: '  DEADBEEF  ' });
  assert.equal(spaced.ok, false, spaced.text);
  assert.equal(
    spaced.text,
    '[aio] skill: --sha256 must be 64 hex characters, got: deadbeef',
    'trim + lowercase run before the 64-hex validation'
  );

  const short = await skillAdd({ target: '', file: src, name: 'sha-short', sha256: 'abc123' });
  assert.equal(short.ok, false, short.text);
  assert.match(short.text, /must be 64 hex characters, got: abc123/);

  assert.equal(fs.existsSync(path.join(skillsDir(home), 'sha-bad')), false, 'refused before any write');
  assert.equal(fs.existsSync(path.join(skillsDir(home), 'sha-short')), false, 'refused before any write');
  assert.deepEqual(ledger(), [], 'a malformed pin records nothing');
});

test('skillAdd --sha256: 64 hex but wrong digest → refusal naming BOTH hashes, nothing installed', async (t) => {
  const home = fixtureHome(t);
  const CONTENT = '# Sha mismatch\n\nA body long enough to pass the stub guard.\n';
  const src = sourceDir(CONTENT);
  const got = crypto.createHash('sha256').update(CONTENT, 'utf8').digest('hex');
  const want = 'f'.repeat(64);

  const r = await skillAdd({ target: '', file: src, name: 'sha-mismatch', sha256: want });

  assert.equal(r.ok, false, r.text);
  assert.equal(
    r.text,
    `[aio] skill: sha256 mismatch - wanted ${want}, fetched ${got}. Refusing to install.`,
    'both digests verbatim, refusal explicit'
  );
  assert.equal(fs.existsSync(path.join(skillsDir(home), 'sha-mismatch')), false, 'refused before any write');
  assert.deepEqual(ledger(), [], 'a supply-chain refusal records nothing');
});

test('skillAdd --sha256: matching digest → installed; ledger keeps its own 16-char sha', async (t) => {
  const home = fixtureHome(t);
  const CONTENT = '# Sha match\n\nA body long enough to pass the stub guard.\n';
  const src = sourceDir(CONTENT);
  const want = crypto.createHash('sha256').update(CONTENT, 'utf8').digest('hex');

  const r = await skillAdd({ target: '', file: src, name: 'sha-ok', sha256: want.toUpperCase() });

  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /installed/, 'uppercase hex accepted (normalized before comparison)');
  const file = path.join(skillsDir(home), 'sha-ok', 'SKILL.md');
  assert.equal(fs.readFileSync(file, 'utf8'), CONTENT, 'content written only after the pin matched');
  assert.equal(ledger().find((e) => e.name === 'sha-ok').sha, sha(CONTENT), 'ledger digest unchanged by the pin');
});
