// cli-args.test.js — spawn-level CLI contract for bin/aio.js: the real argv →
// exit code → stream mapping. Unit tests can never see this layer, which is
// exactly how `rollback --dry-run` once shipped running the FULL rollback
// (it strips the real home blocks). Every spawn here is hermetic:
//   AIO_STATE_DIR → temp, AIO_NO_GH=1 (no gh subprocess), AIO_RATE=0 (no
//   throttle sleep), AIO_OFFLINE=1 (no network). shell:false — argv is never
//   interpolated into a command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// One isolated state dir for this file. If the `rollback --dry-run` refusal ever
// regresses, the damage must land here — never in the real ~/.aio, and the
// rollback itself must never reach src/rollback.js (it strips the real home).
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-cli-args-'));
const BIN = fileURLToPath(new URL('../bin/aio.js', import.meta.url));
const REPO = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const ENV = { ...process.env, AIO_STATE_DIR: STATE, AIO_NO_GH: '1', AIO_RATE: '0', AIO_OFFLINE: '1' };

/** Spawn `node bin/aio.js <args>` — shell:false, absolute bin path, fixed env. */
function run(...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    env: ENV,
    cwd: REPO,
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true,
    shell: false,
  });
  assert.ifError(r.error);
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') };
}

/** Recursive file listing of `dir` ([] when absent) — "did it write anything?". */
function tree(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...tree(p).map((x) => `${e.name}/${x}`));
    else out.push(e.name);
  }
  return out.sort();
}

test('rollback --dry-run → refused (exit 1), state untouched, no backups/, rollback never ran', () => {
  const before = tree(STATE);

  const r = run('rollback', '--dry-run');

  assert.equal(r.status, 1, `refusal must exit 1:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /refusing to run/, 'the refusal reason is on stderr');
  // the guard sits BEFORE the switch: no banner, no rollback report — proof the
  // destructive path was never entered (it would print "Context block" etc.)
  assert.ok(!r.stdout.includes('aio rollback'), `rollback body printed:\n${r.stdout}`);
  assert.deepEqual(tree(STATE), before, 'AIO_STATE_DIR byte-for-byte unchanged');
  assert.equal(fs.existsSync(path.join(STATE, 'backups')), false, 'no backups/ created');
});

test('status --dry-run → stderr warns the flag only applies to setup/init', () => {
  const r = run('status', '--dry-run');

  assert.match(r.stderr, /--dry-run only applies/, `expected the warn line:\n${r.stderr}`);
  assert.ok([0, 1].includes(r.status), `status keeps its normal exit, got ${r.status}`);
});

test('status --bogus-flag → unknown flag reported, status exit stays normal', () => {
  const r = run('status', '--bogus-flag');

  assert.match(r.stderr, /unknown flag: --bogus-flag/, `flag must not be dropped silently:\n${r.stderr}`);
  assert.ok([0, 1].includes(r.status), `status keeps its normal exit, got ${r.status}`);
});

test('frobnicate → unknown command, exit 1, points at --help instead of dumping it', () => {
  const r = run('frobnicate');

  assert.equal(r.status, 1, 'unknown command exits 1');
  assert.match(r.stderr, /unknown command: frobnicate/, `named on stderr:\n${r.stderr}`);
  // 5f: a typo must not print 90 lines of HELP — the hint goes to stderr, stdout stays clean
  assert.match(r.stderr, /run 'aio --help' for usage/, `hint on stderr:\n${r.stderr}`);
  assert.ok(!r.stdout.includes('Usage'), `no HELP dump on stdout:\n${r.stdout}`);
});

test('--version → exit 0, version equals package.json', () => {
  const r = run('--version');

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout.trim().split('\n')[0], /^aio \d+\.\d+\.\d+/, `version line:\n${r.stdout}`);
  assert.equal(r.stdout.match(/\d+\.\d+\.\d+/)[0], pkg.version, 'printed version === package.json version');
});

test('--help → exit 0, help documents skill add + completion', () => {
  const r = run('--help');

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /aio skill add/, 'skill add documented');
  assert.match(r.stdout, /aio completion/, 'completion documented');
});

test('completion bogus → exit 1 with usage on stdout', () => {
  const r = run('completion', 'bogus');

  assert.equal(r.status, 1, 'unknown shell is a usage error');
  assert.match(r.stdout, /usage:/, `usage on stdout:\n${r.stdout}\n${r.stderr}`);
});

test('completion bash → exit 0 with a bash complete -F registration', () => {
  const r = run('completion', 'bash');

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /complete -F _aio/, 'bash completion hook emitted');
});

test('skill bogus → exit 1, unknown subcommand named', () => {
  const r = run('skill', 'bogus');

  assert.equal(r.status, 1, 'unknown skill subcommand exits 1');
  assert.match(r.stdout, /unknown subcommand "bogus"/, `named on stdout:\n${r.stdout}`);
});
