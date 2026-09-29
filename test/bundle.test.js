// bundle.test.js — first-run fallback: catalog shipped in the package is copied to state dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bundle-'));
const deep = path.join(state, 'a', 'b', 'c', 'd', 'e');
fs.mkdirSync(deep, { recursive: true });
process.env.AIO_STATE_DIR = state;
const cwd = process.cwd();

const { resolveDataDir, STATE_DIR } = await import('../src/paths.js');

test('resolveDataDir: bundled ai-tools.db copied to state dir when no data dir found', () => {
  process.chdir(deep); // walk reaches filesystem root without finding local data
  try {
    const dir = resolveDataDir(null);
    assert.equal(dir, STATE_DIR);
    assert.ok(fs.existsSync(path.join(STATE_DIR, 'ai-tools.db')), 'catalog copied');
    assert.ok(fs.statSync(path.join(STATE_DIR, 'ai-tools.db')).size > 1000, 'non-empty');
    // second call resolves from persisted state, file already there (no recopy needed)
    assert.equal(resolveDataDir(null), STATE_DIR);
  } finally {
    process.chdir(cwd);
  }
});
