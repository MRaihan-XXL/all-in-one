// i18n-cli.test.js — AIO_LANG=id at the SPAWN layer, on surfaces the existing
// coverage never localizes (--help is pinned in coverage-dispatch-errors.test.js,
// msg()/parity in messages.test.js):
//   • unknown command  → '[aio] perintah tidak dikenal: …' on stderr, exit 1
//   • `ask` with no query → 'cara pakai: aio ask "<apa yang kamu butuhkan>"',
//     exit 1 (usage returns BEFORE any network — empty query short-circuits)
//   • unknown flag     → '[aio] flag tidak dikenal: … — diabaikan' on stderr
// and each EN string must be ABSENT — the locale flips wholesale, no mixed output.
// Hermetic: fresh temp HOME/STATE/APPDATA per scenario, PATH='' (no subprocess),
// AIO_OFFLINE/NO_GH/RATE → no probes, OLLAMA_HOST → closed port, shell:false.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/aio.js', import.meta.url));
const REPO = fileURLToPath(new URL('../', import.meta.url));

/** Fresh hermetic env per scenario (mirrors coverage-dispatch-errors.test.js). */
function envFor(t, extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-i18n-home-'));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-i18n-state-'));
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-i18n-app-'));
  t.after(() => {
    for (const d of [home, state, appdata]) fs.rmSync(d, { recursive: true, force: true });
  });
  return {
    ...process.env,
    PATH: '',
    USERPROFILE: home,
    HOME: home,
    APPDATA: appdata,
    AIO_STATE_DIR: state,
    AIO_OFFLINE: '1',
    AIO_NO_GH: '1',
    AIO_RATE: '0',
    OLLAMA_HOST: 'http://127.0.0.1:1',
    NO_COLOR: '1',
    AIO_LANG: 'id',
    ...extra,
  };
}

/** Spawn `node bin/aio.js <args>` — shell:false, absolute bin path, fixed env. */
function run(env, ...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
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

test('AIO_LANG=id: unknown command → "perintah tidak dikenal" on stderr, exit 1, no EN text', (t) => {
  const r = run(envFor(t), 'frobnicate');

  assert.equal(r.status, 1, `unknown command exits 1:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /\[aio\] perintah tidak dikenal: frobnicate/, `ID message:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /unknown command/, 'never the English message');
  assert.match(r.stderr, /run 'aio --help' for usage/, 'the help hint is part of the pinned contract');
});

test('AIO_LANG=id: `ask` with no query → Bahasa usage on stdout, exit 1, no network', (t) => {
  const r = run(envFor(t), 'ask');

  assert.equal(r.status, 1, 'an empty query is a usage error');
  assert.match(r.stdout, /cara pakai: aio ask "<apa yang kamu butuhkan>"/, `ID usage:\n${r.stdout}`);
  assert.doesNotMatch(r.stdout, /usage: aio ask/, 'never the English usage line');
});

test('AIO_LANG=id: unknown flag on status → "flag tidak dikenal" on stderr, status exit stays 0|1', (t) => {
  const r = run(envFor(t), 'status', '--bogus-flag');

  assert.match(r.stderr, /flag tidak dikenal: --bogus-flag/, `ID flag warning:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /unknown flag/, 'never the English warning');
  assert.ok([0, 1].includes(r.status), `status keeps its normal exit, got ${r.status}`);
});
