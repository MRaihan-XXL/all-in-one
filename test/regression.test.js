// regression.test.js — regression guards: diversify/dedupe (src/search.js),
// POSIX-safe bin path (src/doctor.js), backup pruning + MCP rollback resilience
// (src/write.js). Isolated state, temp fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-regress-')); // state → temp dir, never ~/.aio (must precede src imports)
process.env.AIO_NO_AI = '1'; // deterministic: no Ollama

const { diversify, dedupe } = await import('../src/search.js');
const { STATE_DIR, CONFIG_FILE, BACKUP_DIR } = await import('../src/paths.js');
const { aioBinPath } = await import('../src/doctor.js');
const { pruneBackups, removeMcpAdditions } = await import('../src/write.js');

/** Fixture entries: first npm candidate (NPM_A) is the one already ranked into the pool. */
const NPM_A = { src: 'npm', type: 'tool', name: 'pkg-a', url: 'https://www.npmjs.com/package/pkg-a', func: 'fn a', meta: '' };
const NPM_B = { src: 'npm', type: 'tool', name: 'pkg-b', url: 'https://www.npmjs.com/package/pkg-b', func: 'fn b', meta: '' };
const GH_1 = { src: 'github', type: 'repo', name: 'gh-one', url: 'https://github.com/o/one', func: 'fn one', meta: '' };
const GH_2 = { src: 'github', type: 'repo', name: 'gh-two', url: 'https://github.com/o/two', func: 'fn two', meta: '' };
const ENTRIES = [NPM_A, NPM_B, GH_1, GH_2];

test('diversify: thin source topped up to 2 rows, no duplicate url/name, ≤ limit', () => {
  // pool = ranked rows (spread copies): exactly 1 npm row (= first npm entries candidate) + 2 github rows
  const pool = [
    { ...NPM_A, why: 'BM25 keyword match (#1)' },
    { ...GH_1, why: 'source-ranked by github' },
    { ...GH_2, why: 'source-ranked by github' },
  ];
  assert.equal(pool.filter((h) => h.src === 'npm').length, 1, 'pool starts with exactly 1 npm row');

  const out = diversify(pool, ENTRIES, 10);

  assert.equal(out.filter((h) => h.src === 'npm').length, 2, 'source with <2 rows topped up to 2');
  assert.ok(out.some((h) => h.name === NPM_B.name), 'npm candidate absent from the pool was pulled in');
  const keys = out.map((h) => h.url || h.name);
  assert.equal(keys.filter((u) => u === NPM_A.url).length, 1, 'ranked copy not re-added (identity vs URL compare)');
  assert.equal(new Set(keys).size, keys.length, 'no duplicate url/name in the result');
  assert.equal(out.length, 4, '3 pool rows + 1 top-up');
  assert.ok(out.length <= 10, `result length ${out.length} ≤ limit 10`);
  // copy semantics: the top-up is a spread copy — the source entry itself stays pristine
  assert.equal(NPM_B.why, undefined, 'entries not mutated');
  assert.equal(out.find((h) => h.name === NPM_B.name).why, 'top npm hit', 'top-up carries its own why');
});

test('diversify: result capped at limit (limit=3)', () => {
  const pool = [
    { ...NPM_A, why: 'BM25 keyword match (#1)' },
    { ...GH_1, why: 'source-ranked by github' },
  ];

  const out = diversify(pool, ENTRIES, 3);

  assert.equal(out.length, 3, 'hard cap at limit — no 4th row');
  assert.equal(out.filter((h) => h.src === 'npm').length, 2, 'first source in entries order still topped up');
  assert.equal(new Set(out.map((h) => h.url || h.name)).size, out.length, 'no duplicates under the cap');
});

test('dedupe: same url keeps only the first hit; distinct urls all kept', () => {
  const hits = [
    { name: 'a', url: 'https://github.com/o/a' },
    { name: 'a-clone', url: 'https://github.com/o/a' }, // repos ∩ skills overlap
    { name: 'b', url: 'https://github.com/o/b' },
    { name: 'c', url: 'https://github.com/o/c' },
  ];

  const out = dedupe(hits);

  assert.equal(out.length, 3, 'duplicate url dropped, distinct urls kept');
  assert.equal(out[0].name, 'a', 'first occurrence wins');
  assert.deepEqual(out.map((h) => h.name), ['a', 'b', 'c']);
  assert.equal(hits.length, 4, 'input array untouched');
});

test('aioBinPath: fileURLToPath → existing absolute bin/aio.js (POSIX-path guard)', () => {
  const bin = aioBinPath();

  assert.ok(path.isAbsolute(bin), `absolute path expected, got: ${bin}`);
  assert.equal(fs.existsSync(bin), true, 'bin/aio.js resolves on disk');
  assert.equal(path.basename(bin), 'aio.js');
});

test('pruneBackups: drops backups older than maxAgeDays, keeps fresh ones', () => {
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true }); // isolated dir → deterministic count
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const oldFile = path.join(BACKUP_DIR, 'inject__old__docs.md');
  const freshFile = path.join(BACKUP_DIR, 'inject__fresh__docs.md');
  fs.writeFileSync(oldFile, 'old');
  fs.writeFileSync(freshFile, 'fresh');
  const ago40 = new Date(Date.now() - 40 * 86400000);
  fs.utimesSync(oldFile, ago40, ago40); // 40 days old > 30-day budget

  const removed = pruneBackups(30);

  assert.equal(removed, 1, 'exactly the stale backup pruned');
  assert.equal(fs.existsSync(oldFile), false, 'old file gone');
  assert.equal(fs.existsSync(freshFile), true, 'fresh file kept');
});

test('removeMcpAdditions: malformed config → parse error, file untouched, ledger kept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-mcp-broken-'));
  const file = path.join(dir, 'settings.json');
  const bad = '{"codebase-memory-mcp": broken'; // contains the key → reaches the parse branch
  fs.writeFileSync(file, bad);
  const ledgerFile = path.join(STATE_DIR, 'mcp-ledger.json');
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(ledgerFile, JSON.stringify([{ file, key: 'codebase-memory-mcp' }], null, 2));

  let out;
  assert.doesNotThrow(() => {
    out = removeMcpAdditions();
  });

  assert.equal(out.length, 1);
  assert.ok(out[0].status.includes('parse error'), `expected parse error status, got: ${out[0].status}`);
  assert.equal(fs.readFileSync(file, 'utf8'), bad, 'malformed file NOT overwritten');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(ledgerFile, 'utf8')),
    [{ file, key: 'codebase-memory-mcp' }],
    'ledger entry kept so rollback can retry after the user fixes the file'
  );
});
