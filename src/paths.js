// paths.js — location resolution: state (~/.aio)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STATE_DIR = process.env.AIO_STATE_DIR
  ? path.resolve(process.env.AIO_STATE_DIR)
  : path.join(os.homedir(), '.aio');
export const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
export const BACKUP_DIR = path.join(STATE_DIR, 'backups');

/** Write via tmp + rename so a crash/kill mid-write can never leave a torn
 *  state/ledger/config file behind (a torn JSON is indistinguishable from
 *  corruption). EPERM (Windows refusing to rename over a busy target) and EXDEV
 *  (tmp on another mount) fall back to a direct write — a non-atomic write is
 *  still better than no write; only the torn-file case is what we prevent. */
export function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort — never mask the real error below */
    }
    if (e && (e.code === 'EPERM' || e.code === 'EXDEV')) {
      fs.writeFileSync(file, data);
    } else {
      throw e;
    }
  }
}

/** Move a corrupt JSON aside instead of overwriting it: those bytes are the
 *  only copy of the old state (recoverable by hand) and the only evidence of
 *  what went wrong — never destroy them. Returns the preserve path (or the
 *  original path when the rename itself is refused; callers still refuse to
 *  rewrite it either way). */
export function preserveCorrupt(file) {
  const dest = String(file).replace(/\.json$/i, '') + `.corrupt-${Date.now()}.json`;
  try {
    fs.renameSync(file, dest);
    return dest;
  } catch {
    return file;
  }
}

export function readState() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  } catch {
    return {}; // no config.json yet — first run, nothing to report
  }
  try {
    return JSON.parse(raw);
  } catch {
    // CORRUPT is not "fresh": preserve the bad file, say so on stderr, and only
    // then fall back to {} — otherwise the next writeState would silently
    // clobber the only copy and the run would look perfectly healthy.
    const kept = preserveCorrupt(CONFIG_FILE);
    console.error(`[aio] warning: ${CONFIG_FILE} is unreadable — preserved as ${kept}, continuing with empty state`);
    return {};
  }
}

export function writeState(partial) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const next = { ...readState(), ...partial };
  writeAtomic(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}
