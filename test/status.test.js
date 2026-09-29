// status.test.js — self-check for src/status.js (isolated state, temp fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-status-'));
const { blockState, runStatus } = await import('../src/status.js');
const { BLOCK_START, BLOCK_END } = await import('../src/write.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-status-fix-'));

test('blockState: missing / no block / injected', () => {
  assert.equal(blockState(path.join(tmp, 'nope.md')), 'missing');
  const plain = path.join(tmp, 'plain.md');
  fs.writeFileSync(plain, '# docs\n');
  assert.equal(blockState(plain), 'no block');
  const wired = path.join(tmp, 'wired.md');
  fs.writeFileSync(wired, `# docs\n${BLOCK_START}\nhello\n${BLOCK_END}\n`);
  assert.equal(blockState(wired), 'injected');
});

test('runStatus: healthy when manifest + repos exist (no data-dir issue)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-status-home-'));
  fs.writeFileSync(path.join(home, 'TOOLS-INDEX.md'), '# tools\n');
  fs.writeFileSync(path.join(home, 'aio-context.md'), '# ctx\n## REPOS (3)\n');
  const repos = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-status-repos-'));
  fs.mkdirSync(path.join(repos, 'alpha'));
  fs.mkdirSync(path.join(repos, 'beta'));
  fs.mkdirSync(path.join(repos, '.git'));

  const r = runStatus({ home, repos });
  const out = r.lines.join('\n');
  assert.match(out, /REPOS 3/);
  assert.match(out, /\(2 dirs\)/);
  assert.ok(!r.issues.some((i) => i.includes('manifest')), r.issues.join('; '));
  assert.ok(!r.issues.some((i) => i.includes('repos dir')), r.issues.join('; '));
});

test('runStatus: manifest missing → issue reported', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-status-home2-'));
  fs.writeFileSync(path.join(home, 'TOOLS-INDEX.md'), '# tools\n');
  const repos = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-status-repos2-'));
  fs.mkdirSync(path.join(repos, 'alpha'));

  const r = runStatus({ home, repos });
  assert.ok(r.issues.some((i) => i.includes('manifest')), r.issues.join('; '));
  assert.equal(r.ok, false);
});
