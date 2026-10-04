// regression-fixes.test.js — pre-merge review fixes, as regression guards:
//   1. bin/aio.js argv detection: argv[1] is realpathSync'd BEFORE the `aio.js`
//      match, so an npm/npx SYMLINK launch (`node_modules/.bin/aio` → bin/aio.js)
//      dispatches instead of dying as `unknown command: <link>`.
//   2. `skill remove` / rollback unlink SKILL.md only + rmdir-if-empty — a user's
//      sibling files (and their directory) must survive an aio removal.
//   3. http:// targets refused before any fetch.
//   4. candidates() hygiene: a scheme-less `github.com/owner/repo` owner is the
//      REPO owner (never the `github.com` host), text/html is not a skill, and
//      URL credentials reach fetch but never the ledger.
// Hermetic: AIO_STATE_DIR → temp BEFORE the src imports; every spawn runs with
// AIO_OFFLINE=1 (the skill-remove spawns also get an isolated HOME/USERPROFILE);
// every in-process fetch is stubbed — the real network and the real
// ~/.agents/skills are never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixes-state-')); // must precede the src import
process.env.AIO_NO_GH = '1'; // no gh subprocess in tests
delete process.env.AIO_OFFLINE; // the fetch-stub tests below must REACH the (mocked) fetch

const { skillAdd, skillRemove, removeSkillAdditions, skillsDir } = await import('../src/skill.js');
const { STATE_DIR } = await import('../src/paths.js');

const BIN = fileURLToPath(new URL('../bin/aio.js', import.meta.url));
const REPO = fileURLToPath(new URL('../', import.meta.url));
const LEDGER = path.join(STATE_DIR, 'skills-ledger.json');
// same digest the ledger records: sha256 hex, first 16 chars (src/skill.js)
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const BODY = '# Reviewed skill\n\nBody long enough to clear the 20-char fetch guard.\n';

const ENV = { ...process.env, AIO_STATE_DIR: STATE_DIR, AIO_NO_GH: '1', AIO_RATE: '0', AIO_OFFLINE: '1' };

/** Spawn `node <script> <args>` — hermetic fixed env, shell:false (argv never shelled). */
function spawnWith(env, script, ...args) {
  const r = spawnSync(process.execPath, [script, ...args], {
    env,
    cwd: REPO,
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true,
    shell: false,
  });
  assert.ifError(r.error);
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') };
}
const run = (...args) => spawnWith(ENV, BIN, ...args);
const runIn = (env, ...args) => spawnWith(env, BIN, ...args);

/** Isolated HOME + STATE_DIR for a spawned CLI: skills + ledger live only there. */
function childEnv(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixes-home-'));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixes-st-'));
  t.after(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(state, { recursive: true, force: true });
  });
  return {
    home,
    state,
    env: {
      ...ENV,
      HOME: home, // posix homedir
      USERPROFILE: home, // win32 homedir
      APPDATA: path.join(home, 'AppData', 'Roaming'), // absent → win32 targets dropped
      PATH: '',
      AIO_STATE_DIR: state,
    },
  };
}

/** Plant an aio-OWNED skill (ledger sha matches content byte-for-byte) + user files. */
function plantSkill(home, state, name, content, extras = {}) {
  const dir = path.join(home, '.agents', 'skills', name);
  const file = path.join(dir, 'SKILL.md');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content);
  for (const [f, txt] of Object.entries(extras)) fs.writeFileSync(path.join(dir, f), txt);
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(
    path.join(state, 'skills-ledger.json'),
    JSON.stringify([{ name, file, sha: sha(content), source: `local ${file}` }], null, 2)
  );
  return { dir, file };
}

/** Isolated fixture home for IN-PROCESS skill calls (os.homedir is mocked). */
function fixtureHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixes-home-'));
  t.mock.method(os, 'homedir', () => home);
  fs.rmSync(LEDGER, { force: true }); // every test starts from "aio installed nothing"
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function ledger() {
  if (!fs.existsSync(LEDGER)) return [];
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}

function resp(body, type = 'text/plain; charset=utf-8') {
  return new Response(body, { status: 200, headers: { 'content-type': type } });
}

/* ---------------- 1. argv detection (BLOCKER regression) ---------------- */

test('bin argv detection: symlink launch realpath-resolves to aio.js (npm/npx style)', (t) => {
  // Contrast (always runs): the plain `node bin/aio.js …` layout needs no realpath.
  const direct = run('--version');
  assert.equal(direct.status, 0, `direct launch failed:\n${direct.stdout}\n${direct.stderr}`);
  assert.match(direct.stdout.trim().split('\n')[0], /^aio /, `version line:\n${direct.stdout}`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixes-link-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const link = path.join(dir, 'aio-link'); // deliberately NOT named aio.js — the match must come from realpath
  try {
    fs.symlinkSync(BIN, link);
  } catch (e) {
    // win32 file symlinks need Administrator/Developer Mode (EPERM) — the POSIX CI runner exercises this
    t.skip(`symlink creation unavailable (${e.code}): ${e.message}`);
    return;
  }

  const viaLink = spawnWith(ENV, link, '--version');

  assert.equal(
    viaLink.status,
    0,
    `symlink launch must dispatch like the real script:\n${viaLink.stdout}\n${viaLink.stderr}`
  );
  assert.match(
    viaLink.stdout.trim().split('\n')[0],
    /^aio /,
    `version line, not "unknown command: ${link}":\n${viaLink.stdout}\n${viaLink.stderr}`
  );
});

/* ---------------- 2. skill remove keeps user files ---------------- */

test('skill remove: aio SKILL.md unlinked, user sibling file + directory kept, output says so', (t) => {
  const { env, home, state } = childEnv(t);
  const { dir, file } = plantSkill(home, state, 'foo', BODY, { 'notes.txt': 'user notes, not aio\'s' });

  const r = runIn(env, 'skill', 'remove', 'foo');

  assert.equal(r.status, 0, `removal of an aio-owned skill must exit 0:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /SKILL\.md removed — directory kept \(not empty\)/, `kept-dir reported: ${r.stdout}`);
  assert.ok(!fs.existsSync(file), 'the aio-written SKILL.md is unlinked');
  assert.ok(fs.existsSync(path.join(dir, 'notes.txt')), 'user sibling file untouched');
  assert.ok(fs.existsSync(dir), `directory not recursively deleted: ${dir}`);
  const rows = JSON.parse(fs.readFileSync(path.join(state, 'skills-ledger.json'), 'utf8'));
  assert.deepEqual(rows, [], 'ledger entry dropped with the file');
});

test('skill remove mirror: SKILL.md-only directory → whole dir gone, output "removed"', (t) => {
  const { env, home, state } = childEnv(t);
  const { dir } = plantSkill(home, state, 'bar', BODY);

  const r = runIn(env, 'skill', 'remove', 'bar');

  assert.equal(r.status, 0, `exit 0 expected:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /skill bar: removed — /, `plain "removed" status: ${r.stdout}`);
  assert.ok(!fs.existsSync(dir), 'nothing else lived in it → the empty dir goes too');
  assert.ok(fs.existsSync(path.join(home, '.agents', 'skills')), 'the skills root itself survives');
});

test('removeSkillAdditions: rollback unlinks SKILL.md only — user files keep their directory', (t) => {
  const home = fixtureHome(t);
  const dir = path.join(skillsDir(home), 'keep-skill');
  const file = path.join(dir, 'SKILL.md');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, BODY);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'mine');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify([{ name: 'keep-skill', file, sha: sha(BODY), source: 'local fixture' }], null, 2));

  const out = removeSkillAdditions();

  assert.deepEqual(out, [{ target: 'keep-skill', status: 'SKILL.md removed (directory kept — not empty)' }]);
  assert.ok(!fs.existsSync(file), 'SKILL.md gone');
  assert.ok(fs.existsSync(path.join(dir, 'notes.txt')), 'user file survives the rollback');
  assert.ok(fs.existsSync(dir), 'non-empty directory survives');
  assert.deepEqual(ledger(), [], 'ledger cleared — aio owns nothing anymore');
});

/* ---------------- 3. http:// refused ---------------- */

test('skillAdd: http:// target refused before any fetch, nothing written', async (t) => {
  const home = fixtureHome(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls.push(String(input));
    throw new Error(`http:// must be refused before fetch: ${input}`);
  });

  const r = await skillAdd({ target: 'http://example.com/SKILL.md' });

  assert.equal(r.ok, false, r.text);
  assert.match(r.text, /insecure http:\/\//, `refusal reason surfaced: ${r.text}`);
  assert.deepEqual(calls, [], 'no fetch attempted');
  assert.equal(fs.existsSync(skillsDir(home)), false, 'no skill written');
  assert.deepEqual(ledger(), [], 'no ledger entry');
});

/* ---------------- 4. candidate URL hygiene + HTML rejection ---------------- */

test('skillAdd: scheme-less github.com/owner/repo → raw.githubusercontent owner is "owner", not the host', async (t) => {
  const home = fixtureHome(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    calls.push(url);
    return url === 'https://raw.githubusercontent.com/owner/repo/HEAD/SKILL.md' ? resp(BODY) : resp('nope', 404);
  });

  const r = await skillAdd({ target: 'github.com/owner/repo' });

  assert.equal(r.ok, true, r.text);
  assert.equal(
    calls[0],
    'https://raw.githubusercontent.com/owner/repo/HEAD/SKILL.md',
    `first candidate URL (calls: ${JSON.stringify(calls)})`
  );
  assert.equal(calls.length, 1, 'first candidate hit — no fallback needed');
  const entry = ledger().find((e) => e.name === 'repo');
  assert.ok(entry, `ledger entry recorded in ${LEDGER}`);
  assert.equal(entry.source, 'github owner/repo', 'provenance names the owner, never github.com/');
  assert.equal(fs.readFileSync(path.join(skillsDir(home), 'repo', 'SKILL.md'), 'utf8'), BODY, 'bytes written verbatim');
});

test('skillAdd: direct https URL serving text/html → not installed (an HTML page is not a skill)', async (t) => {
  const home = fixtureHome(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls.push(String(input));
    return resp('<!doctype html><html><body>Sign in to view this file</body></html>', 'text/html; charset=utf-8');
  });

  const r = await skillAdd({ target: 'https://example.com/SKILL.md' });

  assert.equal(r.ok, false, r.text);
  assert.match(r.text, /SKILL\.md not found for https:\/\/example\.com\/SKILL\.md/, `target echoed: ${r.text}`);
  assert.deepEqual(calls, ['https://example.com/SKILL.md'], 'the page WAS fetched — content-type is what rejected it');
  assert.equal(fs.existsSync(path.join(skillsDir(home), 'skill.md')), false, 'nothing installed');
  assert.deepEqual(ledger(), [], 'no ledger entry');
});

test('skillAdd: credentialed https URL → fetch keeps userinfo, ledger source never stores it', async (t) => {
  const home = fixtureHome(t);
  const target = 'https://user:pass@example.com/x/SKILL.md';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls.push(String(input));
    return resp(BODY);
  });

  const r = await skillAdd({ target });

  assert.equal(r.ok, true, r.text);
  assert.equal(calls[0], target, 'credentials are what make a private raw URL fetchable');
  const raw = fs.readFileSync(LEDGER, 'utf8');
  const entry = JSON.parse(raw).find((e) => e.name === 'skill.md');
  assert.ok(entry, `ledger entry recorded in ${LEDGER}`);
  assert.equal(entry.source, 'https://example.com/x/SKILL.md', 'source = URL minus userinfo/query/hash');
  assert.ok(!raw.includes('user:pass'), `ledger must not persist userinfo: ${raw}`);
  assert.ok(
    !JSON.parse(raw).some((e) => String(e.source).includes('@')),
    `no authority marker in any ledger source: ${raw}`
  );
  assert.ok(!r.text.includes('pass'), `install report carries no password: ${r.text}`);
});
