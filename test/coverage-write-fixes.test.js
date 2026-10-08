// coverage-write-fixes.test.js — the fix-wave contracts in src/paths.js and
// src/write.js that no existing test reaches:
//   src/paths.js  writeAtomic's per-call unique tmp name (pid + ms + rand) —
//                 two writers racing one path must never share a tmp file
//                 (shared tmp = interleaved bytes renamed into the real file)
//   src/write.js  ledgerAdd: a corrupt mcp-ledger.json is preserved aside and
//                 NEVER rebuilt as [] (the [] would wipe the pre-corruption
//                 records on the next rollback)
//                 ledgerRead: ENOENT right after a this-run preserve returns
//                 the {corrupt, path} sentinel, not a fresh []
//                 hashesRead: ENOENT right after a this-run preserve returns
//                 null — rememberBlock must not rebuild the drift state
//                 ensureJsonEntry: a scalar / null / array ROOT reports
//                 "parse error: root is not an object" instead of a TypeError
// Isolated: AIO_STATE_DIR → temp dir before the src import (paths.js bakes
// STATE_DIR at import); every fixture is a temp file; no network, no real home.
// Every state-poisoning test (corrupt ledger/hashes) writes its OWN corrupt
// file first, so each test is independent of declaration order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-wfix-state-')); // must precede the src import

const { writeAtomic, STATE_DIR, BACKUP_DIR } = await import('../src/paths.js');
const { ensureJsonEntry, injectBlock, ledgerList, removeMcpAdditions } = await import('../src/write.js');

const KEY = 'codebase-memory-mcp';
const LEDGER = path.join(STATE_DIR, 'mcp-ledger.json');
const HASHES = path.join(STATE_DIR, 'block-hashes.json');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

/** Fresh temp dir (caller removes it) — all fixtures live outside the repo. */
function scratch(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Any *.corrupt-<ts>.json aside-drop in STATE_DIR holding exactly `bytes`. */
function preservedWith(prefix, bytes) {
  if (!fs.existsSync(STATE_DIR)) return [];
  return fs
    .readdirSync(STATE_DIR)
    .filter((f) => new RegExp(`^${prefix}\\.corrupt-\\d+\\.json$`).test(f))
    .filter((f) => read(path.join(STATE_DIR, f)) === bytes);
}

/** Backups currently in BACKUP_DIR (0 when the dir does not exist yet). */
function backupCount() {
  return fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).length : 0;
}

/* ---------------- src/paths.js: writeAtomic tmp uniqueness ---------------- */

test('writeAtomic: two racing writers to one path → distinct tmp names, final file = exactly one writer\'s JSON', async (t) => {
  const dir = scratch('aio-wfix-atomic-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');

  const tmps = [];
  const origWrite = fs.writeFileSync.bind(fs);
  t.mock.method(fs, 'writeFileSync', (p, data, opts) => {
    const s = String(p);
    if (s.endsWith('.tmp')) tmps.push(s);
    return origWrite(p, data, opts);
  });
  // Both calls land in the SAME millisecond — the historical collision window
  // (pid + Date.now only). The per-call rand suffix is what keeps them apart.
  t.mock.method(Date, 'now', () => 1_700_000_000_000);

  const payloads = [
    { writer: 1, blob: 'a'.repeat(64) },
    { writer: 2, blob: 'b'.repeat(64) },
  ];
  await Promise.all(
    payloads.map(
      (p) =>
        (async () => {
          await Promise.resolve();
          writeAtomic(file, JSON.stringify(p));
        })()
    )
  );

  assert.equal(tmps.length, 2, 'each writer staged its own tmp file');
  assert.notEqual(tmps[0], tmps[1], `tmp names must not collide in the same ms: ${tmps[0]}`);
  assert.ok(
    tmps.every((p) => p.startsWith(`${file}.`) && p.endsWith('.tmp')),
    `tmp staged beside the target: ${tmps}`
  );

  const parsed = JSON.parse(read(file)); // valid JSON → never torn/empty/interleaved
  assert.deepEqual(parsed, parsed.writer === 1 ? payloads[0] : payloads[1], 'one writer\'s bytes, verbatim');
  assert.deepEqual(fs.readdirSync(dir), ['state.json'], 'both tmp files renamed away, no leftovers');
});

/* ---------------- src/write.js: ledgerAdd refusal (C-03) ---------------- */

test('ensureJsonEntry → ledgerAdd: corrupt mcp-ledger.json preserved aside, NEVER rebuilt as []', (t) => {
  const dir = scratch('aio-wfix-ledger-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfg = path.join(dir, 'settings.json');
  fs.writeFileSync(cfg, '{"mcpServers":{}}');
  const CORRUPT = '{"not":"an array"}'; // valid JSON, wrong shape — still corrupt for a ledger
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, CORRUPT);

  const r = ensureJsonEntry(cfg, KEY, { command: 'x' }, 'lbl', 'mcpServers', false);

  assert.equal(r.status, 'added', `config entry still lands: ${r.status}`);
  assert.equal(JSON.parse(read(cfg)).mcpServers[KEY].command, 'x', 'the config itself is updated');
  assert.equal(fs.existsSync(LEDGER), false, 'corrupt ledger not overwritten in place');
  const kept = preservedWith('mcp-ledger', CORRUPT);
  assert.equal(kept.length, 1, `corrupt copy preserved: ${kept}`);
  assert.deepEqual(ledgerList(), [], 'ledgerList degrades to [] WITHOUT writing it back');
  assert.equal(fs.existsSync(LEDGER), false, 'ledgerList never creates a fresh [] either');
});

test('mcp ledger: ENOENT after this-run preserve → {corrupt,path} sentinel keeps standing (second add + rollback refuse)', (t) => {
  const dir = scratch('aio-wfix-sent-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const CORRUPT = '"string root"';
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, CORRUPT);

  // 1st add: reads the corrupt file → preserve-aside → refuse.
  const cfg1 = path.join(dir, 'one.json');
  fs.writeFileSync(cfg1, '{"mcpServers":{}}');
  assert.equal(ensureJsonEntry(cfg1, KEY, { command: 'x' }, 'lbl', 'mcpServers', false).status, 'added');
  assert.equal(fs.existsSync(LEDGER), false, 'corrupt bytes moved aside on the first read');
  assert.equal(preservedWith('mcp-ledger', CORRUPT).length, 1, 'bytes kept verbatim');

  // 2nd add: the file is now ENOENT **because this run renamed it** — the read
  // must return the sentinel again, not a fresh [] (a [] would be written back
  // and hide the pre-corruption records from rollback).
  const cfg2 = path.join(dir, 'two.json');
  fs.writeFileSync(cfg2, '{"mcpServers":{}}');
  assert.equal(ensureJsonEntry(cfg2, KEY, { command: 'y' }, 'lbl', 'mcpServers', false).status, 'added');
  assert.equal(fs.existsSync(LEDGER), false, 'ENOENT-after-preserve → still no [] rebuilt');

  // rollback sees the same sentinel and refuses loudly instead of writing keep=[]
  const out = removeMcpAdditions();
  assert.equal(out.length, 1, `one refusal row: ${JSON.stringify(out)}`);
  assert.equal(out[0].target, 'mcp ledger');
  assert.match(
    out[0].status,
    /^ledger unreadable — preserved as .*refusing to write$/,
    `verbatim: ${out[0].status}`
  );
  assert.equal(fs.existsSync(LEDGER), false, 'rollback refused BEFORE any write');
});

/* ---------------- src/write.js: hashesRead ENOENT-after-preserve ---------------- */

test('block-hashes.json: ENOENT after this-run preserve → null → the drift state is never rebuilt', (t) => {
  const dir = scratch('aio-wfix-hashes-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const CORRUPT = '{ not json';
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(HASHES, CORRUPT);

  // 1st writer: reads the corrupt file → preserve-aside → null → refuses to record.
  const first = path.join(dir, 'first.md');
  fs.writeFileSync(first, '# rules\n');
  assert.equal(injectBlock(first, 'BODY-1', 't').status, 'injected', 'the block itself still lands');
  assert.equal(fs.existsSync(HASHES), false, 'corrupt drift state moved aside, not overwritten');
  assert.equal(preservedWith('block-hashes', CORRUPT).length, 1, 'bad bytes kept verbatim');

  // 2nd writer, same run: HASHES is now ENOENT **by our own hand**. A `{}`
  // read here would write a FRESH hash file (rememberBlock) and let the next
  // run claim "no drift" for every block — the null read must refuse instead.
  const second = path.join(dir, 'second.md');
  fs.writeFileSync(second, '# other rules\n');
  assert.equal(injectBlock(second, 'BODY-2', 't').status, 'injected');
  assert.equal(fs.existsSync(HASHES), false, 'ENOENT-after-preserve → rememberBlock writes nothing');
  assert.equal(preservedWith('block-hashes', CORRUPT).length, 1, 'the original corrupt copy survives untouched');
});

/* ---------------- src/write.js: ensureJsonEntry root guard (C-04) ---------------- */

test('ensureJsonEntry: scalar / null / array ROOT → exact "parse error: root is not an object", file untouched', (t) => {
  const dir = scratch('aio-wfix-root-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const roots = ['42', '"str"', '[1]', 'null', 'true'];
  const n0 = backupCount();

  roots.forEach((raw, i) => {
    const file = path.join(dir, `cfg-${i}.json`);
    fs.writeFileSync(file, raw);
    const r = ensureJsonEntry(file, KEY, { command: 'x' }, 'lbl', 'mcpServers', false);

    assert.equal(r.target, path.basename(file), 'the offending file is named');
    assert.equal(
      r.status,
      'parse error: root is not an object',
      `root ${raw} → exact status, got: ${r.status}`
    );
    assert.equal(read(file), raw, `root ${raw} never rewritten / crashed on`);
  });

  assert.equal(backupCount(), n0, 'no backup written for a refused root');
  assert.equal(fs.existsSync(path.join(STATE_DIR, 'mcp-ledger.json')), false, 'no ledger entry recorded for a refused root');
});
