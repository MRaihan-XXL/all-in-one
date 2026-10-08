// update.js — `aio update`: self-update from npm, then re-run setup with the
// NEWLY installed copy (never the stale npx-cached binary — B-03).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { msg } from './messages.js';
import { getVersion } from './banner.js';

/** Absolute path of the fresh global install (npm root -g + package bin). */
export function globalBinPath(pkg = 'aio-connect') {
  try {
    const root = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      shell: true,
      timeout: 30000,
      windowsHide: true,
    }).trim();
    const bin = path.join(root, pkg, 'bin', 'aio.js');
    if (fs.existsSync(bin)) return bin;
  } catch {
    /* npm unavailable → report below */
  }
  return null;
}

export function runUpdate({ binPath, check = false }) {
  const pkg = 'aio-connect';

  // --check: read-only newest-version comparison, never installs (npm outdated style:
  // 0 = current, 1 = update available, 2 = check itself failed).
  if (check) {
    let latest;
    try {
      latest = execFileSync('npm', ['view', pkg, 'version'], {
        encoding: 'utf8',
        shell: true,
        timeout: 30000,
        windowsHide: true,
      }).trim();
    } catch (e) {
      console.error(msg('updateCheckFailed', { err: e.message }));
      process.exitCode = 2;
      return;
    }
    const cur = getVersion();
    if (cur === latest) {
      console.log(msg('updateCurrent', { v: cur }));
      process.exitCode = 0;
    } else {
      console.log(msg('updateAvailable', { cur, latest }));
      process.exitCode = 1;
    }
    return;
  }

  console.log(msg('updateUpdating', { pkg }));
  const install = spawnSync('npm', ['install', '-g', pkg], {
    shell: true,
    stdio: 'inherit',
    cwd: os.homedir(),
  });
  if (install.error) {
    console.error(msg('updateFailed', { err: install.error.message }));
    process.exit(1);
  }
  if (install.status !== 0) {
    console.error(msg('updateFailedCode', { code: install.status }));
    process.exit(install.status ?? 1);
  }

  // Re-run with the fresh global copy — NOT the running (possibly npx-cached) binPath.
  const fresh = globalBinPath(pkg);
  if (!fresh) {
    console.error(msg('updateFreshMissing'));
    process.exit(1);
  }
  if (binPath && binPath !== fresh) {
    console.log(msg('updateOldCopy'));
  }
  console.log(msg('updateRerun'));
  // source/npm → re-run via the node that hosts us; compiled binary → its
  // embedded runtime can't execute a JS file, so use the PATH node (npm's host).
  const nodeBin = /node(\.exe)?$/i.test(process.execPath) ? process.execPath : 'node';
  const res = spawnSync(nodeBin, [fresh, '--yes'], { stdio: 'inherit' });
  // spawn failure (res.error) and a signal-killed child (status === null)
  // must never read as success
  process.exit(res.error || res.status === null ? 1 : res.status);
}
