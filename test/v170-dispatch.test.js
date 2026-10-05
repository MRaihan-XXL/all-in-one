// v170-dispatch.test.js — spawn-level dispatch for the v1.7.0 CLI surface:
// `aio agent` (bin case + usage/offline) and `aio skill search [--add]`, plus the
// inline `--flag=value` lane of parseArgs and the in-command `--help` escape.
// Hermetic child env: AIO_OFFLINE=1 (no network), AIO_NO_GH=1 / AIO_RATE=0 (no
// gh spawn, no throttle sleep), AIO_STATE_DIR + HOME → temp (nothing written to
// the real home), shell:false (argv never interpolated).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BIN = fileURLToPath(new URL('../bin/aio.js', import.meta.url));
const REPO = fileURLToPath(new URL('../', import.meta.url));
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-v170-home-'));
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-v170-state-'));

const ENV = {
  ...process.env,
  AIO_STATE_DIR: STATE,
  AIO_OFFLINE: '1',
  AIO_NO_GH: '1',
  AIO_RATE: '0',
  HOME,
  USERPROFILE: HOME,
  NO_COLOR: '1',
};

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

test('agent → dispatched: offline payload printed, exit 1', () => {
  const r = run('agent', 'convert csv to chart');

  assert.equal(r.status, 1, `offline coordination is not ok:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /offline \(AIO_OFFLINE=1\)/, 'runAgent offline text reaches stdout');
  assert.match(r.stdout, /live coordination needs network/, 'reason printed');
  assert.equal(r.stderr, '', 'no error spew on a clean (if offline) run');
});

test('agent --json → flag forwarded, offline path unchanged, exit 1', () => {
  const r = run('agent', '--json', 'convert csv to chart');

  assert.equal(r.status, 1);
  assert.match(r.stdout, /offline \(AIO_OFFLINE=1\)/, 'json flag does not bypass the offline guard');
  assert.ok(!r.stdout.trim().startsWith('{'), 'no payload without a live result');
});

test('agent with no query → usage text (not the offline message), exit 1', () => {
  const r = run('agent');

  assert.equal(r.status, 1, 'usage is not ok');
  assert.match(r.stdout, /^usage: aio agent "<your task>"/, 'usage printed on stdout');
  assert.ok(!r.stdout.includes('offline'), 'the query guard fires before the offline guard');
});

test('skill search → dispatched: offline payload printed, exit 1', () => {
  const r = run('skill', 'search', 'pdf word convert');

  assert.equal(r.status, 1, `offline skill search is not ok:\n${r.stdout}`);
  assert.match(r.stdout, /offline \(AIO_OFFLINE=1\) — skill search is live by design/, 'runSkillSearch offline text');
});

test('skill search --add → flag accepted and forwarded, offline payload, exit 1', () => {
  const r = run('skill', 'search', '--add', 'pdf word convert');

  assert.equal(r.status, 1);
  assert.match(r.stdout, /offline \(AIO_OFFLINE=1\) — skill search is live by design/, 'offline guard first');
  assert.doesNotMatch(r.stderr, /unknown flag/, '--add is a known flag');
});

test('status --help → HELP printed instead of the command, exit 0', () => {
  const r = run('status', '--help');

  assert.equal(r.status, 0, `--help always exits 0:\n${r.stderr}`);
  assert.match(r.stdout, /Usage/, 'full HELP on stdout');
  assert.doesNotMatch(r.stdout, /^state {6}/m, 'the status body never ran');
});

test('inline --flag=value: empty value → clear error naming the flag, exit 1', () => {
  const r = run('skill', 'add', '--file=', '--name=x');

  assert.equal(r.status, 1, 'a value-flag without a value is a usage error');
  assert.match(r.stderr, /\[aio\] --file requires <path>/, `hint on stderr:\n${r.stderr}`);
  assert.equal(r.stdout, '', 'nothing else printed');
});

test('inline --flag=value: value consumed → real --file path reaches skill add', () => {
  const r = run('skill', 'add', `--file=${path.join(HOME, 'nope.md')}`, '--name=x');

  assert.equal(r.status, 1, 'missing source is a failure');
  assert.match(r.stdout, /local path not found/, 'the inline value reached skillAdd verbatim');
  assert.ok(r.stdout.includes(path.join(HOME, 'nope.md')), 'inline value is the path');
});
