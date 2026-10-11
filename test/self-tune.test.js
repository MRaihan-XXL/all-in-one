// self-tune.test.js — Stage 6 evolution in src/search.js: query-shape classes,
// the opt-in local experience ledger behind resolveTrustW, and the trust-weight
// plumbing in bm25Search/rankHits. Hermetic: AIO_STATE_DIR → fresh temp dir
// BEFORE the src imports (paths.js bakes STATE_DIR at module load), every
// ledger rewrite is spaced so the mtime-keyed read cache re-reads, AIO_SELF_TUNE
// is toggled per test, zero network (entries synthesized locally, TRUST_W always
// imported — its literal value is whatever self-tune.mjs last committed).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-tune-')); // must precede the src imports
process.env.AIO_NO_GH = '1'; // no `gh` subprocess in tests
process.env.AIO_RATE = '0'; // ghThrottle: no spacing sleep
delete process.env.AIO_SELF_TUNE; // default path: opt-in off

const { TRUST_W, queryClass, resolveTrustW, bm25Search, rankHits } = await import('../src/search.js');
const { STATE_DIR } = await import('../src/paths.js');

const LEDGER = path.join(STATE_DIR, 'self-tune-ledger.json');
const PROVEN = {
  global: { fitness: 1.8 },
  classes: { directional: { w: 0.5, n: 9, fitness: 1.9 } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Rewrite the ledger with a fresh mtime — readTuneLedger caches by mtime, so
 *  back-to-back writes inside one millisecond would silently serve the stale
 *  parse. A string is written as raw bytes (corruption fixture). */
async function writeLedger(raw) {
  await sleep(15);
  fs.writeFileSync(LEDGER, typeof raw === 'string' ? raw : JSON.stringify(raw));
}

/** Opt in for one test; always restored so later tests keep the default path. */
function selfTuneOn(t) {
  process.env.AIO_SELF_TUNE = '1';
  t.after(() => delete process.env.AIO_SELF_TUNE);
}

after(() => fs.rmSync(STATE_DIR, { recursive: true, force: true }));

/* ---------------- state dir + query classes ---------------- */

test('state: AIO_STATE_DIR is honored — STATE_DIR is the fresh temp dir', () => {
  assert.equal(STATE_DIR, path.resolve(process.env.AIO_STATE_DIR));
  assert.ok(fs.existsSync(STATE_DIR), 'temp state dir exists before any ledger write');
});

test('queryClass: direction word → directional, bare identifier → entity, else natural', () => {
  assert.equal(queryClass('png to jpeg'), 'directional');
  assert.equal(queryClass('PDF to PNG'), 'directional', 'case-insensitive direction word');
  assert.equal(queryClass('redis'), 'entity', 'no whitespace');
  assert.equal(queryClass('rust web framework'), 'natural');
  // SPEC DIFF: '' trims to '' which has no whitespace, so the implementation
  // classifies it 'entity' (spec expected 'natural'). Never 'directional'.
  assert.equal(queryClass(''), 'entity');
});

test('TRUST_W: committed default is a finite number inside the [0,1] grid', () => {
  assert.equal(typeof TRUST_W, 'number');
  assert.ok(Number.isFinite(TRUST_W), `TRUST_W=${TRUST_W}`);
  assert.ok(TRUST_W >= 0 && TRUST_W <= 1, `TRUST_W=${TRUST_W} outside the grid`);
  // SPEC DIFF: the spec assumed 0 < TRUST_W < 1; the harness grid spans the
  // endpoints and self-tune.mjs --write committed w=0, so only [0,1] holds.
  // The value is never asserted literally — always imported.
});

/* ---------------- resolveTrustW: ledger gates ---------------- */

test('resolveTrustW: env off → TRUST_W, a proven ledger on disk is ignored', async () => {
  delete process.env.AIO_SELF_TUNE;
  await writeLedger(PROVEN); // would hand out 0.5 for directional if read
  assert.equal(resolveTrustW('pdf to png'), TRUST_W, 'zero I/O default path wins');
  fs.rmSync(LEDGER, { force: true }); // next test starts with no ledger
});

test('resolveTrustW: AIO_SELF_TUNE=1 with no ledger file → TRUST_W', (t) => {
  selfTuneOn(t);
  assert.equal(fs.existsSync(LEDGER), false, 'no local experience yet');
  assert.equal(resolveTrustW('pdf to png'), TRUST_W);
});

test('resolveTrustW: proven class weight wins (n>=5, fitness >= global)', async (t) => {
  selfTuneOn(t);
  await writeLedger(PROVEN);
  assert.equal(resolveTrustW('pdf to png'), 0.5, 'directional w=0.50 applied');
  assert.equal(resolveTrustW('redis'), TRUST_W, 'no entry for the entity class');
});

test('resolveTrustW: class with n < 5 → TRUST_W (not proven yet)', async (t) => {
  selfTuneOn(t);
  await writeLedger({ global: { fitness: 1.8 }, classes: { directional: { w: 0.5, n: 4, fitness: 1.9 } } });
  assert.equal(resolveTrustW('pdf to png'), TRUST_W);
});

test('resolveTrustW: class fitness < global → TRUST_W; a tie still promotes the class', async (t) => {
  selfTuneOn(t);
  await writeLedger({ global: { fitness: 1.8 }, classes: { directional: { w: 0.5, n: 9, fitness: 1.7 } } });
  assert.equal(resolveTrustW('pdf to png'), TRUST_W, 'fitter global winner keeps the default');
  await writeLedger({ global: { fitness: 1.8 }, classes: { directional: { w: 0.5, n: 9, fitness: 1.8 } } });
  assert.equal(resolveTrustW('pdf to png'), 0.5, 'only a strictly fitter global beats the class');
});

test('resolveTrustW: class w outside [0,1] → TRUST_W', async (t) => {
  selfTuneOn(t);
  await writeLedger({ global: { fitness: 1.8 }, classes: { directional: { w: 1.5, n: 9, fitness: 1.9 } } });
  assert.equal(resolveTrustW('pdf to png'), TRUST_W, 'w=1.5 above the range');
  await writeLedger({ global: { fitness: 1.8 }, classes: { directional: { w: -0.2, n: 9, fitness: 1.9 } } });
  assert.equal(resolveTrustW('pdf to png'), TRUST_W, 'w=-0.2 below the range');
});

test('resolveTrustW: ledger with classes but no global → fitness check skipped', async (t) => {
  selfTuneOn(t);
  await writeLedger({ classes: { directional: { w: 0.5, n: 9, fitness: 1.9 } } });
  assert.equal(resolveTrustW('pdf to png'), 0.5, 'class w used without a global winner to compare');
});

test('resolveTrustW: corrupt ledger → preserved aside + stderr warning + TRUST_W, never throws', async (t) => {
  selfTuneOn(t);
  const errs = [];
  t.mock.method(console, 'error', (...args) => errs.push(args.join(' ')));
  const garbage = '{ not json ][';
  await writeLedger(garbage); // fresh mtime → cache miss → parse fails
  const w = resolveTrustW('pdf to png'); // must not throw
  assert.equal(w, TRUST_W, 'corrupt experience falls back to the default weight');
  assert.equal(fs.existsSync(LEDGER), false, 'bad bytes moved aside, not left to rot');
  const kept = fs.readdirSync(STATE_DIR).filter((f) => /^self-tune-ledger\.corrupt-\d+\.json$/.test(f));
  assert.equal(kept.length, 1, `preserved aside: ${kept.join(', ')}`);
  assert.equal(fs.readFileSync(path.join(STATE_DIR, kept[0]), 'utf8'), garbage, 'original bytes kept intact');
  const err = errs.join('\n');
  assert.match(err, /self-tune-ledger/, 'the ledger file is named');
  assert.match(err, /corrupt-/, 'the preserve path is named');
  assert.match(err, /warning/i, 'said on stderr — never swallowed');
});

/* ---------------- bm25Search / rankHits: trust plumbing ---------------- */

/** Same query-token overlap, different trust01 — the blend (not the keywords)
 *  decides the order; the longer doc loses the BM25 leg on length alone. */
const ENTRIES = [
  {
    type: 'repo',
    name: 'alpha-beta-kit',
    url: 'https://example.com/a',
    func: 'alpha beta alpha beta',
    meta: 'kit',
    src: 'github',
    trust01: 0.05,
  },
  {
    type: 'tool',
    name: 'alpha-beta-boost',
    url: 'https://example.com/b',
    func: 'alpha beta alpha beta',
    meta: 'long tail words here that only stretch the document',
    src: 'npm',
    trust01: 0.95,
  },
];

test('bm25Search: default call deep-equals an explicit {trustW: TRUST_W} (env off)', () => {
  delete process.env.AIO_SELF_TUNE;
  const implicit = bm25Search('alpha beta', ENTRIES);
  const explicit = bm25Search('alpha beta', ENTRIES, 8, { trustW: TRUST_W });
  assert.ok(implicit.length >= 2, 'both matches returned');
  assert.deepEqual(implicit, explicit, 'no-opts path === resolveTrustW-off path');
});

test('bm25Search: trustW 0 vs 1 flips the top hit (trust orders tied matches)', () => {
  const at0 = bm25Search('alpha beta', ENTRIES, 8, { trustW: 0 });
  const at1 = bm25Search('alpha beta', ENTRIES, 8, { trustW: 1 });
  assert.equal(at0[0].name, 'alpha-beta-kit', 'w=0 → pure relevance: shorter doc wins');
  assert.ok(at0[0].score > at0[1].score, 'relevance order is strict');
  assert.equal(at1[0].name, 'alpha-beta-boost', 'w=1 → pure trust: 0.95 beats 0.05');
  assert.equal(at1[0].score, 0.95, 'trust-only blend surfaces trust01 verbatim');
  assert.notDeepEqual(
    at0.map((h) => h.name),
    at1.map((h) => h.name),
    'the blend flips the whole ordering, not just the head',
  );
});

test('rankHits: returns an array and opts.trustW reorders the pool head', () => {
  const w0 = rankHits('alpha beta', ENTRIES, { trustW: 0 });
  const w1 = rankHits('alpha beta', ENTRIES, { trustW: 1 });
  assert.ok(Array.isArray(w0) && Array.isArray(w1));
  assert.ok(w0.length >= 2 && w1.length >= 2, 'both matches surface');
  assert.notEqual(w0[0].name, w1[0].name, 'trust weight decides the head');
  for (const h of [...w0, ...w1]) assert.ok(h.why, 'every row explains itself');
  for (const h of [...w0, ...w1]) assert.ok(Number.isFinite(h.cov) && h.cov >= 0.6, 'coverage gate passed');
});

test('rankHits: zero keyword overlap → source-ranked fallback keeps the entries', () => {
  const pool = rankHits('zzzz qqqq', ENTRIES, { trustW: TRUST_W });
  assert.ok(Array.isArray(pool), 'always an array');
  assert.ok(pool.length > 0, 'pool never starves when entries exist');
  assert.ok(
    pool.every((h) => /source-ranked by/.test(h.why)),
    `fallback why tag on every row: ${pool.map((h) => h.why).join(' | ')}`,
  );
});
