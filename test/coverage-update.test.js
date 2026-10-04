// coverage-update.test.js — src/update.js: globalBinPath (npm missing / root hit /
// no bin) and runUpdate's post-install lanes (fresh-not-found, note, re-run).
// npm is faked by a temp dir prepended to PATH (a batch file that just echoes a
// root) — zero network, zero installs; process.exit is mocked to a sentinel throw
// so runUpdate's fatal paths are observable without killing the test process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ORIG_PATH = process.env.PATH;

/** Temp "npm root -g": npm.cmd echoes `root`, optionally hosting bin/aio.js. */
function fakeNpm(withBin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-upd-'));
  const root = path.join(dir, 'node_modules');
  fs.mkdirSync(root, { recursive: true });
  if (withBin) {
    fs.mkdirSync(path.join(root, 'aio-connect', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'aio-connect', 'bin', 'aio.js'), 'process.exit(0);\n');
  }
  fs.writeFileSync(path.join(dir, 'npm.cmd'), `@echo ${root}\n`);
  return { dir, root };
}

function usePath(t, p) {
  process.env.PATH = p;
  t.after(() => {
    process.env.PATH = ORIG_PATH;
  });
}

/** process.exit → sentinel throw + captured stderr, restored after the test. */
function fatalTrap(t) {
  const errs = [];
  t.mock.method(console, 'error', (...a) => errs.push(a.join(' ')));
  t.mock.method(console, 'log', () => {});
  t.mock.method(process, 'exit', (code) => {
    const e = new Error(`EXIT:${code}`);
    e.isExit = true;
    throw e;
  });
  return {
    errs,
    run(fn) {
      try {
        fn();
      } catch (e) {
        assert.ok(e.isExit, `expected process.exit, got: ${e.stack ?? e}`);
        return e.message;
      }
      assert.fail('runUpdate returned without calling process.exit');
    },
  };
}

const { globalBinPath, runUpdate } = await import('../src/update.js');

test('globalBinPath: npm unreachable → null (caught, no throw)', (t) => {
  usePath(t, '');
  assert.equal(globalBinPath(), null, 'missing npm falls back to null');
});

test('globalBinPath: fake npm root hosting the bin → absolute path', (t) => {
  const { dir, root } = fakeNpm(true);
  usePath(t, dir);
  assert.equal(globalBinPath(), path.join(root, 'aio-connect', 'bin', 'aio.js'));
});

test('runUpdate: install ok but fresh bin absent → exit 1 + reinstall hint', (t) => {
  const { dir } = fakeNpm(false); // npm echoes a root without aio-connect
  usePath(t, dir);
  const trap = fatalTrap(t);

  const code = trap.run(() => runUpdate({ binPath: 'C:\\npx-cache\\aio.js' }));

  assert.equal(code, 'EXIT:1');
  assert.match(trap.errs.join('\n'), /fresh install not found under npm root -g/, 'actionable hint');
});

test('runUpdate: fresh bin found → note (stale binPath), re-run, exit with its status', (t) => {
  const { dir } = fakeNpm(true);
  usePath(t, dir);
  const logs = [];
  const trap = fatalTrap(t);
  t.mock.method(console, 'log', (...a) => logs.push(a.join(' ')));

  const code = trap.run(() => runUpdate({ binPath: 'C:\\npx-cache\\aio.js' }));

  assert.equal(code, 'EXIT:0', 'fake aio.js exits 0 and that status is forwarded');
  const out = logs.join('\n');
  assert.match(out, /you invoked the old copy \(npx cache\?\)/, 'stale-binPath note');
  assert.match(out, /Package updated . re-running setup/, 'announces the re-run');
});
