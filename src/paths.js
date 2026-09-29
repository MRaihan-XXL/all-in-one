// paths.js — location resolution: state (~/.aio), data dir, repos dir
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STATE_DIR = process.env.AIO_STATE_DIR
  ? path.resolve(process.env.AIO_STATE_DIR)
  : path.join(os.homedir(), '.aio');
export const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
export const BACKUP_DIR = path.join(STATE_DIR, 'backups');
/** First existing repos dir under $HOME (platform-neutral; machines persist their own via state). */
export const DEFAULT_REPOS_DIR =
  ['github', 'repos', 'Projects', 'projects', 'code', 'dev'].map((d) => path.join(os.homedir(), d)).find((d) => fs.existsSync(d)) ?? null;

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(partial) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const next = { ...readState(), ...partial };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

function hasLocalData(dir) {
  return ['ai-tools.db', 'TOOLS-INDEX.md'].some((f) => fs.existsSync(path.join(dir, f)));
}

/** Priority: --home > $AIO_HOME > persisted state > walk up from cwd (marker discovery). */
export function resolveDataDir(cliHome) {
  if (cliHome) {
    const abs = path.resolve(cliHome);
    if (!hasLocalData(abs)) {
      console.error(`[aio] warning: --home has no ai-tools.db / TOOLS-INDEX.md: ${abs}`);
    }
    writeState({ dataDir: abs });
    return abs;
  }
  if (process.env.AIO_HOME) return path.resolve(process.env.AIO_HOME);
  const st = readState();
  if (st.dataDir && hasLocalData(st.dataDir)) return st.dataDir;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (hasLocalData(dir)) {
      writeState({ dataDir: dir });
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Priority: --repos > $AIO_REPOS_DIR > persisted state > default (if it exists). */
export function resolveReposDir(cliRepos) {
  if (cliRepos) {
    const abs = path.resolve(cliRepos);
    writeState({ reposDir: abs });
    return abs;
  }
  if (process.env.AIO_REPOS_DIR) return path.resolve(process.env.AIO_REPOS_DIR);
  const st = readState();
  if (st.reposDir && fs.existsSync(st.reposDir)) return st.reposDir;
  if (DEFAULT_REPOS_DIR) return DEFAULT_REPOS_DIR;
  return null;
}
