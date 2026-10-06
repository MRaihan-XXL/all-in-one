// coverage-update.test.js — src/update.js: globalBinPath (npm missing / root hit /
// no bin), runUpdate's post-install lanes (fresh-not-found, note, re-run) and the
// read-only `--check` lanes (current → exit 0, behind → exit 1, `npm view` failed
// → exit 2). npm is faked by a temp dir prepended to PATH (a shim that just echoes
// a root — npm.cmd for cmd.exe on win32, a shebang script for sh on POSIX) — zero
// network, zero installs; process.exit is mocked to a sentinel throw so runUpdate's
// fatal paths are observable without killing the test process, and the --check lanes
// report through console + process.exitCode, both restored after the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ORIG_PATH = process.env.PATH;

/** Temp "npm root -g": a fake `npm` on PATH echoes `root`, optionally hosting bin/aio.js. */
function fakeNpm(withBin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-upd-'));
  const root = path.join(dir, 'node_modules');
  fs.mkdirSync(root, { recursive: true });
  if (withBin) {
    fs.mkdirSync(path.join(root, 'aio-connect', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'aio-connect', 'bin', 'aio.js'), 'process.exit(0);\n');
  }
  if (process.platform === 'win32') {
    // cmd.exe (shell:true) resolves npm.cmd via PATHEXT — the shim never needs +x.
    fs.writeFileSync(path.join(dir, 'npm.cmd'), `@echo ${root}\n`);
  } else {
    // sh (shell:true) resolves `npm` by name and needs a shebang + execute bit.
    const npmPath = path.join(dir, 'npm');
    fs.writeFileSync(npmPath, `#!/bin/sh\necho ${root}\n`);
    fs.chmodSync(npmPath, 0o755);
  }
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
const { getVersion } = await import('../src/banner.js');

/** Temp dir whose `npm` shim answers `npm view` with `out` (or fails), logging
 *  the argv it received so a test can prove --check only ever runs a read. */
function fakeNpmAnswer(out, fail = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-upd-check-'));
  const log = path.join(dir, 'npm-args.log');
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(dir, 'npm.cmd'),
      fail
        ? `@echo %* >> "${log}"\r\n@exit /b 1\r\n`
        : `@echo %* >> "${log}"\r\n@echo ${out}\r\n`,
    );
  } else {
    const npmPath = path.join(dir, 'npm');
    fs.writeFileSync(
      npmPath,
      fail
        ? `#!/bin/sh\necho "$@" >> "${log}"\nexit 1\n`
        : `#!/bin/sh\necho "$@" >> "${log}"\necho ${out}\n`,
    );
    fs.chmodSync(npmPath, 0o755);
  }
  return {
    dir,
    args: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''),
  };
}

/** Capture the --check lane's report: console output + the process.exitCode it sets. */
function checkLane(t) {
  const logs = [];
  const errs = [];
  t.mock.method(console, 'log', (...a) => logs.push(a.join(' ')));
  t.mock.method(console, 'error', (...a) => errs.push(a.join(' ')));
  const saved = process.exitCode;
  process.exitCode = undefined;
  t.after(() => {
    process.exitCode = saved;
  });
  return { logs, errs, code: () => process.exitCode };
}

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

/* ---------------- `aio update --check` (read-only, zero network) ---------------- */

test('runUpdate check: npm view reports the current version → exit 0 + latest-release line', (t) => {
  const npm = fakeNpmAnswer(getVersion());
  usePath(t, npm.dir);
  const lane = checkLane(t);

  runUpdate({ binPath: 'C:\\npx-cache\\aio.js', check: true });

  assert.equal(lane.code(), 0, 'up to date is a clean exit');
  assert.equal(lane.logs.join('\n'), `[aio] update check: aio ${getVersion()} is the latest release.`);
  assert.deepEqual(lane.errs, [], 'nothing on stderr');
  assert.match(npm.args(), /view aio-connect version/, 'the query it actually ran');
  assert.doesNotMatch(npm.args(), /install/, 'the check never installs');
});

test('runUpdate check: npm view reports a newer version → exit 1 + the exact remedy', (t) => {
  const npm = fakeNpmAnswer('99.0.0');
  usePath(t, npm.dir);
  const lane = checkLane(t);

  runUpdate({ binPath: 'C:\\npx-cache\\aio.js', check: true });

  assert.equal(lane.code(), 1, 'behind is a distinct, scriptable exit');
  assert.equal(lane.logs.join('\n'), '[aio] update check: aio ' + getVersion() + ' is behind latest 99.0.0 - run `aio update`.');
  assert.deepEqual(lane.errs, [], 'the remedy is a stdout verdict, not an error');
  assert.doesNotMatch(npm.args(), /install/, 'read-only even when an update exists');
});

test('runUpdate check: npm view fails → exit 2 + the failure on stderr, no verdict', (t) => {
  const npm = fakeNpmAnswer('', true);
  usePath(t, npm.dir);
  const lane = checkLane(t);

  runUpdate({ binPath: 'C:\\npx-cache\\aio.js', check: true });

  assert.equal(lane.code(), 2, 'a failed check is neither "current" nor "behind"');
  assert.match(lane.errs.join('\n'), /^\[aio\] update check failed: /, 'the underlying error is surfaced verbatim');
  assert.deepEqual(lane.logs, [], 'no verdict can be claimed without an answer');
});
