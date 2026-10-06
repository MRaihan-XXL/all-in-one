// path-discovery.test.js — src/scan.js listPathCommands() + the PATH-discovery
// tail of src/live.js localTools(): a binary aio's curated list does not know
// still surfaces (exact token match, stem >= 3, never a KEYSTOP/GENERIC_BIN/
// curated name), while a 2-char token and a KEYSTOP word never do — and both
// are provably ON PATH, so the guard (not absence) is what blocks them.
// Network never touched. Fake binaries live in one temp dir PREPENDED to PATH
// at load time (localTools caches the scan on first use), PATH restored after.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-path-state-'));
process.env.AIO_STATE_DIR = STATE; // must precede the src import (paths.js bakes it)

const { localTools } = await import('../src/live.js');
const { listPathCommands } = await import('../src/scan.js');

const ORIG_PATH = process.env.PATH;
const IS_WIN = process.platform === 'win32';
const EXT = IS_WIN ? '.cmd' : ''; // win32 needs a PATHEXT suffix to be listed at all

/** Drop a fake binary into the temp PATH dir (executable bits on POSIX). */
function addCmd(name) {
  const p = path.join(BIN_DIR, name);
  fs.writeFileSync(p, IS_WIN ? '@echo ok\r\n' : '#!/bin/sh\necho ok\n');
  if (!IS_WIN) fs.chmodSync(p, 0o755);
  return p;
}

const BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-path-cmds-'));
const FAKE_BIN = addCmd(`AIOFakeBin${EXT}`); // mixed case → the map key must lowercase it
addCmd(`ab${EXT}`); // 2 chars → too short to ever surface
addCmd(`convert${EXT}`); // KEYSTOP word → never surfaces
addCmd('notes.txt'); // win32: no PATHEXT match → not a command
fs.mkdirSync(path.join(BIN_DIR, 'adir')); // a directory is never a command

process.env.PATH = BIN_DIR + path.delimiter + ORIG_PATH;
after(() => {
  process.env.PATH = ORIG_PATH;
  fs.rmSync(BIN_DIR, { recursive: true, force: true });
  fs.rmSync(STATE, { recursive: true, force: true });
});

test('localTools: an unknown-but-installed CLI surfaces from PATH with trust01 0.8', () => {
  const rows = localTools('use aiofakebin now', 4);
  const hits = rows.filter((r) => r.name === 'aiofakebin');

  assert.equal(hits.length, 1, `exactly one discovered row: ${JSON.stringify(rows)}`);
  const row = hits[0];
  assert.equal(row.type, 'tool');
  assert.equal(row.src, 'tools');
  assert.equal(row.url, null, 'a PATH binary has no homepage aio knows');
  assert.equal(row.trust01, 0.8, 'discovered rows rank below the curated 0.9 ones');
  assert.equal(row.meta, 'local · on PATH');
  assert.equal(row.func, `aiofakebin — on PATH: ${FAKE_BIN}`, 'the exact executable it found');
});

test('localTools: a 2-char token and a KEYSTOP word never surface (both are on PATH)', () => {
  const map = listPathCommands();
  assert.ok(map.has('ab'), 'positive control: the 2-char binary IS discoverable');
  assert.ok(map.has('convert'), 'positive control: the KEYSTOP binary IS discoverable');

  const two = localTools('run ab now', 4);
  assert.ok(!two.some((r) => r.name === 'ab'), `stem < 3 must drop: ${JSON.stringify(two)}`);

  const stop = localTools('convert now', 4);
  assert.ok(!stop.some((r) => r.name === 'convert'), `KEYSTOP must drop: ${JSON.stringify(stop)}`);

  // same lane, distinctive token → the guard only vetoes the two above
  assert.ok(localTools('use aiofakebin now', 4).some((r) => r.name === 'aiofakebin'));
});

test('listPathCommands: Map of lowercased stems → absolute paths', () => {
  const map = listPathCommands();

  assert.ok(map instanceof Map, 'a Map, not an array/object');
  assert.equal(map.get('aiofakebin'), FAKE_BIN, 'PATHEXT stripped, key lowercased, value absolute');
  assert.ok(map.size >= 3, `scans every PATH dir: ${map.size} entries`);
  assert.ok([...map.keys()].every((k) => k === k.toLowerCase()), 'every key is lowercased');
  assert.ok(!map.has('adir'), 'directories are never commands');

  if (IS_WIN) {
    assert.ok(!map.has('notes.txt'), 'a file without a PATHEXT suffix is skipped on win32');
  } else {
    assert.equal(map.get('notes.txt'), path.join(BIN_DIR, 'notes.txt'), 'posix has no PATHEXT filter');
  }
});
