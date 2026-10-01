// update.js — `aio update`: self-update from npm, then re-run setup with the
// NEWLY installed copy (never the stale npx-cached binary — B-03).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';

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

export function runUpdate({ binPath }) {
  const pkg = 'aio-connect';

  console.log(`[aio] Updating ${pkg} from npm ...`);
  const install = spawnSync('npm', ['install', '-g', pkg], {
    shell: true,
    stdio: 'inherit',
    cwd: os.homedir(),
  });
  if (install.error) {
    console.error(`[aio] update failed: ${install.error.message}`);
    process.exit(1);
  }
  if (install.status !== 0) {
    console.error(`[aio] update failed: npm install exited with code ${install.status}`);
    process.exit(install.status ?? 1);
  }

  // Re-run with the fresh global copy — NOT the running (possibly npx-cached) binPath.
  const fresh = globalBinPath(pkg);
  if (!fresh) {
    console.error('[aio] update: fresh install not found under npm root -g — run `aio` manually.');
    process.exit(1);
  }
  if (binPath && binPath !== fresh) {
    console.log('[aio] note: you invoked the old copy (npx cache?) — use the global `aio` from now on.');
  }
  console.log('[aio] Package updated — re-running setup with the new version ...');
  const res = spawnSync(process.execPath, [fresh, '--yes'], { stdio: 'inherit' });
  process.exit(res.status ?? 0);
}
