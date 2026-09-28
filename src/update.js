// update.js — `aio update`: self-update from the public GitHub repo, then re-run setup
import os from 'node:os';
import { spawnSync } from 'node:child_process';

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

  console.log('[aio] Package updated — re-running setup with the new version ...');
  const fresh = spawnSync(process.execPath, [binPath], { stdio: 'inherit' });
  process.exit(fresh.status ?? 0);
}
