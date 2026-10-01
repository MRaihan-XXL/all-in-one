// paths.js — location resolution: state (~/.aio)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STATE_DIR = process.env.AIO_STATE_DIR
  ? path.resolve(process.env.AIO_STATE_DIR)
  : path.join(os.homedir(), '.aio');
export const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
export const BACKUP_DIR = path.join(STATE_DIR, 'backups');

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
