// borrow.test.js — `aio borrow` temp-clone lifecycle (isolated dirs, NO network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { purgeExpired, borrowClean, runBorrow } = await import('../src/borrow.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aio-borrow-test-'));
}

test('purgeExpired: only clones older than 24h are removed', () => {
  const dir = tmp();
  const old = path.join(dir, 'owner_old-repo');
  const fresh = path.join(dir, 'owner_fresh-repo');
  fs.mkdirSync(old, { recursive: true });
  fs.mkdirSync(fresh, { recursive: true });
  fs.writeFileSync(path.join(old, 'x.txt'), 'x');
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  fs.utimesSync(old, twoDaysAgo, twoDaysAgo);

  const gone = purgeExpired(dir);
  assert.deepEqual(gone, ['owner_old-repo']);
  assert.ok(!fs.existsSync(old));
  assert.ok(fs.existsSync(fresh));
});

test('borrowClean: wipes nested clones and reports bytes freed', () => {
  const dir = tmp();
  const repo = path.join(dir, 'owner_repo');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'main.js'), 'x'.repeat(512));

  const r = borrowClean(dir);
  assert.equal(r.n, 1);
  assert.ok(r.freed >= 512, `freed ${r.freed} >= 512`);
  assert.equal(fs.readdirSync(dir).length, 0, 'dir now empty');
});

test('runBorrow: no args → usage listing search/--get/--clean', async () => {
  const r = await runBorrow({ query: '', json: false });
  assert.equal(r.ok, false);
  assert.match(r.text, /aio borrow "<what you need>"/);
  assert.match(r.text, /--get <owner\/repo>/);
  assert.match(r.text, /--clean/);
});

test('runBorrow --list: empty borrow dir reported cleanly', async () => {
  const r = await runBorrow({ list: true, json: true });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.json.items));
});
