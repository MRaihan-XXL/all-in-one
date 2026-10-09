// rate-lock.test.js — src/live.js RATE_LOCK (P5 rate clock) exclusive-lock contract:
//   • the lock is created with flag 'wx' — a second concurrent ghThrottle must
//     FAIL to acquire while the holder sleeps inside its critical section: it
//     never clobbers the holder's lock content and never releases a lock it
//     does not own (the old read-then-write let both callers pass on stale state)
//   • a stale holder (>15s, presumed dead) is BROKEN instead of waited out
//   • AIO_RATE=0 short-circuits BEFORE the lock — a foreign lock is untouched
// Hermetic: AIO_STATE_DIR → temp pinned BEFORE the live.js import (paths.js
// bakes STATE_DIR at load), AIO_NO_GH=1 (no `gh` subprocess for the token
// probe), ghThrottle never fetches → no network, no writes outside the temp dir.
process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-ratelock-')); // must precede the src import
process.env.AIO_NO_GH = '1'; // ghToken → cached null, no subprocess

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ghThrottle } = await import('../src/live.js');
const { STATE_DIR } = await import('../src/paths.js');
const RATE_FILE = path.join(STATE_DIR, 'gh-rate.json');
const LOCK = path.join(STATE_DIR, 'gh-rate.lock');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll `pred` every 10ms until true or `timeout` (false on timeout). */
async function until(pred, timeout = 4000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (pred()) return true;
    if (Date.now() >= end) return pred();
    await sleep(10);
  }
}

/** Fresh state dir for this test: no clock, no lock. */
function resetState() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.rmSync(RATE_FILE, { force: true });
  fs.rmSync(LOCK, { force: true });
}

test('RATE_LOCK: second concurrent writer fails against the held wx lock — no clobber, no foreign release', async (t) => {
  process.env.AIO_RATE = '60'; // gap = 1000ms → the holder sleeps WHILE holding the lock
  t.after(() => {
    delete process.env.AIO_RATE;
    fs.rmSync(LOCK, { force: true });
  });
  resetState();
  // recent clock → the holder waits out the gap inside the critical section
  fs.writeFileSync(RATE_FILE, JSON.stringify({ last: Date.now() }));

  const first = ghThrottle();
  assert.ok(await until(() => fs.existsSync(LOCK)), 'first writer acquired the lock');
  const held = fs.readFileSync(LOCK, 'utf8');
  assert.match(held, /^\d+$/, `lock content is the holder timestamp: ${held}`);

  // second writer: wx create must fail with EEXIST → it spins, it does not write
  let secondSettled = false;
  const second = ghThrottle();
  second.then(
    () => { secondSettled = true; },
    () => { secondSettled = true; },
  );
  await sleep(250);
  assert.ok(fs.existsSync(LOCK), 'loser never removed the holder lock');
  assert.equal(fs.readFileSync(LOCK, 'utf8'), held, 'wx: second writer did not clobber the held lock');
  assert.equal(secondSettled, false, 'second writer stays blocked while the lock is held');

  await Promise.all([first, second]);
  assert.equal(fs.existsSync(LOCK), false, 'lock released once both writers are done');
  assert.ok(fs.existsSync(RATE_FILE), 'clock written under the lock');
});

test('RATE_LOCK: stale holder (>15s) is broken, not waited out — acquisition stays fast', async (t) => {
  process.env.AIO_RATE = '60';
  t.after(() => {
    delete process.env.AIO_RATE;
    fs.rmSync(LOCK, { force: true });
  });
  resetState(); // no clock → no spacing wait, the lock is the only gate

  fs.writeFileSync(LOCK, String(Date.now()));
  const past = new Date(Date.now() - 30000); // holder >15s old → presumed dead
  fs.utimesSync(LOCK, past, past);

  const t0 = Date.now();
  await ghThrottle();
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `stale lock broken quickly, not the 9s deadline (${ms}ms)`);
  assert.equal(fs.existsSync(LOCK), false, 'our lock released after the critical section');
  assert.ok(fs.existsSync(RATE_FILE), 'clock written under the acquired lock');
});

test('AIO_RATE=0: spacing disabled → the lock is never taken, a foreign lock stays untouched', async (t) => {
  process.env.AIO_RATE = '0';
  t.after(() => {
    delete process.env.AIO_RATE;
    fs.rmSync(LOCK, { force: true });
  });
  resetState();
  fs.writeFileSync(LOCK, 'foreign-holder'); // pre-existing lock the disable path must not touch

  const t0 = Date.now();
  await ghThrottle();
  assert.ok(Date.now() - t0 < 500, 'returned before any acquisition or spacing wait');
  assert.equal(fs.readFileSync(LOCK, 'utf8'), 'foreign-holder', 'lock neither created, clobbered nor removed');
  assert.equal(fs.existsSync(RATE_FILE), false, 'clock not written either — the guard is the first statement');
});
