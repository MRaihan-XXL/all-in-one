// coverage-bin.test.js — spawn-level dispatch coverage for bin/aio.js: every
// command case (update/status/rollback/ask/borrow/skill/doctor/verify/evolve/init/setup),
// the preview/--show-block wiring, the --copilot guard, and parseArgs' flag lanes
// (get/file/name/json/list/check/fix/yes).
//
// SAFETY (hermetic child env):
//   PATH=''            → git/npm/gh unreachable → borrow --get fails before any
//                        clone, `npm install`/`npm test` die at lookup (zero network)
//   USERPROFILE/HOME/APPDATA → temp → no writes to the real home, rollback strips
//                        only temp files
//   AIO_STATE_DIR      → temp → manifests/backups/ledgers land there
//   AIO_OFFLINE/NO_GH  → no probes; OLLAMA_HOST → closed port (instant refuse)
// Never spawned: bare `aio` writes are ok (--yes runs in temp only); verify
// (and its `evolve` alias) is safe because its npm-test step fails at the empty PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/aio.js', import.meta.url));
const REPO = fileURLToPath(new URL('../', import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bin-home-'));
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bin-state-'));
const APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bin-app-'));
const PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bin-proj-'));

const ENV = {
  ...process.env,
  PATH: '',
  USERPROFILE: HOME,
  HOME,
  APPDATA,
  AIO_STATE_DIR: STATE,
  AIO_OFFLINE: '1',
  AIO_NO_GH: '1',
  AIO_RATE: '0',
  OLLAMA_HOST: 'http://127.0.0.1:1',
  NO_COLOR: '1',
};

/** Spawn `node bin/aio.js <args>` hermetically (optional cwd override). */
function run(cwd = REPO, ...args) {
  return runWith(ENV, cwd, ...args);
}

function runWith(env, cwd = REPO, ...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    env,
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
    shell: false,
  });
  assert.ifError(r.error);
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') };
}

test('status --fix --check → health report, exit 1 on fresh state, no unknown-flag noise', () => {
  const r = run(REPO, 'status', '--fix', '--check');
  assert.equal(r.status, 1, 'manifest missing → issues → exit 1');
  assert.match(r.stdout, /manifest {3}MISSING/, 'names the missing manifest');
  assert.doesNotMatch(r.stderr, /unknown flag/, '--check/--fix are known flags');
});

test('doctor --json → machine-readable report on stdout, exit reflects issues', () => {
  const r = run(REPO, 'doctor', '--json');
  assert.ok(r.status === 0 || r.status === 1, `exit is 0|1, got ${r.status}`);
  const parsed = JSON.parse(r.stdout);
  assert.equal(typeof parsed, 'object');
  assert.ok(parsed !== null && !Array.isArray(parsed), 'json report is an object');
});

test('default command + --copilot → guard warning on stderr, plan-stop, exit 0', () => {
  const r = run(REPO, '--copilot');
  assert.equal(r.status, 0, 'non-interactive plan-stop is not an error');
  assert.match(r.stderr, /--copilot only applies to `aio init`/, 'guard fires outside init');
  assert.match(r.stdout, /\[aio\] non-interactive session/, 'consent gate stopped at the plan');
  assert.doesNotMatch(r.stdout, /\[aio\] unknown flag/, '--copilot is a known flag');
});

test('preview --show-block → setup plan with the full block printed, nothing written', () => {
  const before = fs.readdirSync(STATE);
  const r = run(REPO, 'preview', '--show-block');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /AIO AUTO-CONTEXT/, '--show-block printed block content');
  assert.match(r.stdout, /aio setup v\d+\.\d+\.\d+ . DRY RUN \(nothing written\)/, 'plan-only header');
  assert.deepEqual(fs.readdirSync(STATE), before, 'plan never writes state');
});

test('init --copilot → dry plan in cwd, exits 0, no init-guard warning', () => {
  const r = run(PROJECT, 'init', '--copilot');
  assert.equal(r.status, 0, 'plan-stop falls through to a clean exit');
  assert.match(r.stdout, /DRY RUN \(nothing written\)/, 'showPlan ran runInit in dry mode');
  assert.match(r.stdout, /would inject \(dry-run\)/, 'copilot lane planned');
  assert.match(r.stdout, /\[aio\] non-interactive session/, 'TTY gate in the child');
  assert.doesNotMatch(r.stderr, /--copilot only applies/, 'guard correctly silent for init');
  assert.ok(!fs.existsSync(path.join(PROJECT, 'AGENTS.md')), 'plan only');
});

test('--yes → setup applies: manifest written to the temp state dir, silent apply', () => {
  const r = run(REPO, '--yes');
  assert.equal(r.status, 0, 'applied falls through to exit 0');
  assert.ok(
    fs.existsSync(path.join(STATE, 'aio-context.md')),
    'apply ran genContext against AIO_STATE_DIR',
  );
  assert.doesNotMatch(r.stdout, /\[aio\] non-interactive session/, 'yes path never hits the plan-stop banner');
});

test('rollback → strips temp blocks, reports ledger empties, exit 0', () => {
  const r = run(REPO, 'rollback');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /aio rollback/, 'header');
  assert.match(r.stdout, /Removed \d+ context block\(s\)\./, 'summary line');
  assert.match(r.stdout, /none on record/, 'empty MCP ledger reported');
});

test('ask (offline) → offline explanation, exit 1', () => {
  const r = run(REPO, 'ask', 'csv tool');
  assert.equal(r.status, 1, 'offline ask is not ok');
  assert.match(r.stdout, /offline/i, 'says why it cannot search');
});

test('borrow --list → listing exits 0; --get fails at the missing git (no clone)', () => {
  const list = run(REPO, 'borrow', '--list');
  assert.equal(list.status, 0, '--list is always ok');
  assert.match(list.stdout, /aio borrow/, 'list header');

  const get = run(REPO, 'borrow', '--get', 'owner/repo');
  assert.equal(get.status, 1, 'git is unreachable under PATH="" → clone impossible');
  assert.match(get.stdout, /borrow --get failed/, 'failure reported, network never touched');
});

test('skill list → empty root exits 0; add/remove failure lanes exit 1 with the reason', () => {
  const list = run(REPO, 'skill', 'list');
  assert.equal(list.status, 0);
  assert.match(list.stdout, /aio skill list/, 'list header');
  assert.match(list.stdout, /\(empty\)/, 'temp home has no skills');

  const add = run(REPO, 'skill', 'add', '--file', 'nope.md', '--name', 'x');
  assert.equal(add.status, 1);
  assert.match(add.stdout, /local path not found/, 'missing --file source named');

  const rm = run(REPO, 'skill', 'remove', 'nope');
  assert.equal(rm.status, 1);
  assert.match(rm.stdout, /not installed/, 'missing skill named');
});

test('skill add --sha256 → malformed / mismatched pin refuses (exit 1 + reason), the right pin installs (exit 0)', () => {
  const src = path.join(HOME, 'sha-src.md');
  const CONTENT = '# E2E pin\n\nA body long enough to pass the 20-char stub guard.\n';
  fs.writeFileSync(src, CONTENT);
  const good = crypto.createHash('sha256').update(CONTENT, 'utf8').digest('hex');

  // 1. not 64 hex → skillShaBadFormat, exit 1
  const bad = run(REPO, 'skill', 'add', '--file', src, '--name', 'pin-bad', '--sha256', 'deadbeef');
  assert.equal(bad.status, 1, 'a malformed pin is a refusal, not a warning');
  assert.match(bad.stdout, /^\[aio\] skill: --sha256 must be 64 hex characters, got: deadbeef/);

  // 2. 64 hex of the WRONG digest → skillShaMismatch naming both, exit 1
  const mismatch = run(REPO, 'skill', 'add', '--file', src, '--name', 'pin-mis', '--sha256', 'f'.repeat(64));
  assert.equal(mismatch.status, 1, 'a supply-chain mismatch refuses');
  assert.match(
    mismatch.stdout,
    new RegExp(`^\\[aio\\] skill: sha256 mismatch - wanted f{64}, fetched ${good}\\.`),
    `both digests reported: ${mismatch.stdout}`
  );
  assert.equal(
    fs.existsSync(path.join(HOME, '.agents', 'skills', 'pin-mis')),
    false,
    'nothing installed for a refused pin'
  );

  // 3. the exact digest → installed, exit 0
  const ok = run(REPO, 'skill', 'add', '--file', src, '--name', 'pin-ok', '--sha256', good);
  assert.equal(ok.status, 0, `the right pin installs: ${ok.stdout}`);
  assert.match(ok.stdout, /installed/);
  assert.equal(
    fs.readFileSync(path.join(HOME, '.agents', 'skills', 'pin-ok', 'SKILL.md'), 'utf8'),
    CONTENT,
    'bytes verified against the pin before landing on disk'
  );
});

test('update → npm is unreachable (PATH=""), fails honestly before any network', () => {
  const r = run(REPO, 'update');
  assert.notEqual(r.status, 0, 'update must fail, never report success');
  assert.match(r.stderr, /update failed/, 'failure printed to stderr');
  assert.match(r.stdout, /Updating aio-connect from npm/, 'announced before failing');
});

test('update --check → npm unreachable (PATH="") → check failed, exit 2, never installs', () => {
  const r = run(REPO, 'update', '--check');
  assert.equal(r.status, 2, 'the check itself failed → exit 2 (0 current, 1 behind)');
  assert.match(r.stderr, /update check failed: /, 'the underlying error is surfaced');
  assert.doesNotMatch(r.stdout, /Updating aio-connect/, '--check is read-only: no install lane');
  assert.doesNotMatch(r.stdout, /update check: aio/, 'no verdict without an answer from npm');
});

test('verify → pipeline runs setup+doctor in temp, npm-test step fails at lookup, exit 1', () => {
  const r = run(REPO, 'verify');
  assert.equal(r.status, 1, 'a failing step fails the pipeline');
  assert.match(r.stdout, /aio verify . v\d+\.\d+\.\d+ self-upgrade pipeline/, 'report header');
  assert.doesNotMatch(r.stderr, /deprecated/, 'the canonical command carries no alias warning');
  assert.match(r.stdout, /\[!!\] npm test/, 'npm test step failed');
  assert.match(r.stdout, /pipeline FAILED — fix the \[!!\] step above, then re-run `aio verify`\./, 'failure tail names the canonical command');
  assert.match(r.stdout, /nothing was committed or pushed automatically/, 'never commits');
});

test('evolve alias → deprecation to stderr, pipeline still runs (plain-file state dir fails setup), exit 1', () => {
  const blocked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bin-st-')), 'not-a-dir');
  fs.writeFileSync(blocked, 'x'); // mkdir over a file → setup throws in the child
  const r = runWith({ ...ENV, AIO_STATE_DIR: blocked }, REPO, 'evolve');
  assert.equal(r.status, 1, 'the alias keeps the same exit contract as verify');
  assert.match(r.stderr, /\[aio\] 'evolve' is deprecated — use 'aio verify' \(alias removed after 2 releases\)/, 'EN deprecation line on stderr, before the pipeline');
  assert.match(r.stdout, /aio verify . v\d+\.\d+\.\d+ self-upgrade pipeline/, 'the alias renders the verify report');
  assert.match(r.stdout, /\[!!\] aio setup/, 'setup step failed and is named in the report');
  assert.match(r.stdout, /pipeline FAILED/, 'verdict');
});
