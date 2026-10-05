// bundle.test.js — package payload (zero storage: no catalog/db) + state utilities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-bundle-'));
process.env.AIO_STATE_DIR = state;
process.env.AIO_RATE = '0'; // any inherited CLI spawn must never sleep on ghThrottle spacing

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const { STATE_DIR, CONFIG_FILE, readState, writeState } = await import('../src/paths.js');

test('package ships bin/src/docs — no test/ or assets/ payload (7b tarball trim)', () => {
  for (const d of ['bin', 'src', 'docs']) assert.ok(pkg.files.includes(d), `${d} in files`);
  for (const d of ['test', 'assets']) assert.ok(!pkg.files.includes(d), `${d} not shipped`);
  assert.ok(!pkg.files.some((f) => f.includes('ai-tools.db')), 'ai-tools.db no longer shipped');
  assert.equal(fs.existsSync(new URL('../src/catalog.js', import.meta.url)), false, 'src/catalog.js removed');
  assert.equal(fs.existsSync(new URL('../ai-tools.db', import.meta.url)), false, 'no db in package root');
});

test('npm pack --dry-run: CHANGELOG.md ships, no .env/TRACKING.md/TOOLS-INDEX.md/.github leak', () => {
  const opts = { encoding: 'utf8', timeout: 120000, cwd: repoRoot, windowsHide: true };
  const execpath = process.env.npm_execpath; // `npm test` → npm-cli.js (shell-free on win32)
  const r =
    execpath && execpath.endsWith('.js')
      ? spawnSync(process.execPath, [execpath, 'pack', '--dry-run', '--json'], opts)
      : spawnSync('npm', ['pack', '--dry-run', '--json'], { ...opts, shell: process.platform === 'win32' });

  assert.ifError(r.error);
  assert.equal(r.status, 0, `npm pack --dry-run failed:\n${r.stdout}\n${r.stderr}`);
  const out = String(r.stdout || '');
  const start = out.indexOf('[');
  const end = out.lastIndexOf(']');
  assert.ok(start !== -1 && end > start, `unparsable npm pack output:\n${out}\n${r.stderr}`);
  const files = JSON.parse(out.slice(start, end + 1))[0].files.map((f) => f.path);

  assert.ok(files.includes('CHANGELOG.md'), `CHANGELOG.md ships — pack list:\n${files.join('\n')}`);
  assert.ok(files.includes('package.json') && files.includes('README.md'), 'always-included metadata present');
  assert.ok(!pkg.files.includes('TRACKING.md') && !pkg.files.includes('TOOLS-INDEX.md'), 'no dev docs in files[]');
  const leaks = files.filter(
    (p) =>
      p === 'TRACKING.md' ||
      p === 'TOOLS-INDEX.md' ||
      p === '.github' ||
      p.startsWith('.github/') ||
      /(^|\/)\.env(\.|$)/.test(p)
  );
  assert.deepEqual(leaks, [], 'no .env / TRACKING.md / TOOLS-INDEX.md / .github paths in the pack');
});

test('writeState/readState: roundtrip inside AIO_STATE_DIR', () => {
  assert.equal(STATE_DIR, path.resolve(state), 'STATE_DIR follows AIO_STATE_DIR');
  assert.deepEqual(readState(), {}, 'fresh state reads empty');
  assert.equal(fs.existsSync(CONFIG_FILE), false, 'nothing written until writeState');

  writeState({ manifestPath: 'D:/state/aio-context.md' });
  assert.ok(fs.existsSync(CONFIG_FILE), 'config.json created');
  assert.equal(readState().manifestPath, 'D:/state/aio-context.md');

  const merged = writeState({ other: 1 });
  assert.deepEqual(merged, { manifestPath: 'D:/state/aio-context.md', other: 1 }, 'partial merge keeps prior keys');
  assert.equal(readState().other, 1);
});

