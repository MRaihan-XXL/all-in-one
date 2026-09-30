// bundle.test.js — package payload (zero storage: no catalog/db) + paths utilities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bundle-'));
process.env.AIO_STATE_DIR = state;

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const { STATE_DIR, CONFIG_FILE, readState, writeState, resolveReposDir } = await import('../src/paths.js');

test('package ships bin/src/assets/docs — no legacy catalog artifacts', () => {
  for (const d of ['bin', 'src', 'assets', 'docs']) assert.ok(pkg.files.includes(d), `${d} in files`);
  assert.ok(!pkg.files.some((f) => f.includes('ai-tools.db')), 'ai-tools.db no longer shipped');
  assert.equal(fs.existsSync(new URL('../src/catalog.js', import.meta.url)), false, 'src/catalog.js removed');
  assert.equal(fs.existsSync(new URL('../ai-tools.db', import.meta.url)), false, 'no db in package root');
});

test('writeState/readState: roundtrip inside AIO_STATE_DIR', () => {
  assert.equal(STATE_DIR, path.resolve(state), 'STATE_DIR follows AIO_STATE_DIR');
  assert.deepEqual(readState(), {}, 'fresh state reads empty');
  assert.equal(fs.existsSync(CONFIG_FILE), false, 'nothing written until writeState');

  writeState({ reposDir: 'D:/repos/demo' });
  assert.ok(fs.existsSync(CONFIG_FILE), 'config.json created');
  assert.equal(readState().reposDir, 'D:/repos/demo');

  const merged = writeState({ other: 1 });
  assert.deepEqual(merged, { reposDir: 'D:/repos/demo', other: 1 }, 'partial merge keeps prior keys');
  assert.equal(readState().other, 1);
});

test('resolveReposDir: env AIO_REPOS_DIR beats persisted state, cli arg persists', () => {
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bundle-repos-env-'));
  const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bundle-repos-cli-'));

  process.env.AIO_REPOS_DIR = envDir;
  try {
    assert.equal(resolveReposDir(), path.resolve(envDir), 'env wins over state (D:/repos/demo)');
  } finally {
    delete process.env.AIO_REPOS_DIR;
  }

  const persisted = resolveReposDir(cliDir);
  assert.equal(persisted, path.resolve(cliDir), 'cli arg resolved to abs');
  assert.equal(readState().reposDir, path.resolve(cliDir), 'cli arg persisted to state');

  assert.equal(resolveReposDir(), path.resolve(cliDir), 'state consulted when env/cli absent');
});
