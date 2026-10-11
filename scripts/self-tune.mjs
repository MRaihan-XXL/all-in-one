// self-tune.mjs — Cell × Mahoraga evolution M1: local, opt-in, zero cloud storage.
//
// Cell (perfect the data): grids the BM25:trust weight against the SHARED golden
//   set (scripts/golden.mjs — the exact corpus the eval badge reports), fetch-once
//   then offline re-rank per weight. Fitness = hit@1 + MRR. A strictly fitter
//   winner than the committed TRUST_W is reported; --write patches src/search.js
//   so the next release is the next "offspring".
// Mahoraga (adapt): with AIO_SELF_TUNE=1, per-class winners (queryClass: directional/
//   entity/natural, n >= 5) are written to the local experience ledger
//   (~/.aio/self-tune-ledger.json) that `aio ask` opts into via the same env var.
//   The ledger never leaves this machine — zero cloud storage stays sacred.
//
// Latency is reported per weight but NOT added to fitness: the live fetch
//   dominates and is identical across weights (fetch-once), so an additive term
//   would be fake precision. Honesty over formula.
//
// Usage: AIO_SELF_TUNE=1 node scripts/self-tune.mjs [--write] [--json]
// Network required (same as eval-relevance.mjs). Repo-only: scripts/ never ships.
import fs from 'node:fs';
import { liveSearch } from '../src/live.js';
import { rankHits, TRUST_W, queryClass } from '../src/search.js';
import { STATE_DIR, writeAtomic } from '../src/paths.js';
import { QUERIES } from './golden.mjs';

const GRID = [0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6, 0.65, 0.7, 0.8, 0.9, 1];
const write = process.argv.includes('--write');
const asJson = process.argv.includes('--json');
const log = (s) => {
  if (!asJson) console.error(s);
};

/* ---------------- fetch once (network) ---------------- */

if (process.env.AIO_RATE === '0') {
  log('warning: AIO_RATE=0 disables spacing — a sustained 114-query fetch may hit GitHub rate windows; a poisoned grid promotes wrong weights (prefer the default budget)');
}

const pools = []; // { q, want, cls, entries, errN }
const tf = Date.now();
for (const [q, want] of QUERIES) {
  const { entries = [], offline, errors = [] } = await liveSearch(q);
  if (offline) {
    console.error('self-tune: AIO_OFFLINE=1 — live fetch impossible, nothing measured.');
    process.exit(1);
  }
  pools.push({ q, want, cls: queryClass(q), entries, errN: errors.length });
  if (pools.length % 20 === 0) log(`  fetched ${pools.length}/${QUERIES.length} (${((Date.now() - tf) / 1000).toFixed(0)}s)`);
}
const fetchSec = Number(((Date.now() - tf) / 1000).toFixed(1));
// Health gate: a rate-limited lane silently shrinks the pool and the whole grid
// ranks a DIFFERENT corpus than production — yesterday's 403s measured 49% where
// a healthy fetch measures 97.4%. Any failed source or entryless query poisons
// the verdict: report UNRELIABLE instead of promoting a wrong offspring.
const errQ = pools.filter((p) => p.errN > 0).length;
const emptyQ = pools.filter((p) => !p.entries.length).length;
const healthy = errQ === 0 && emptyQ === 0;
log(
  `fetch done: ${pools.length} queries in ${fetchSec}s — health: ${errQ} with source errors, ${emptyQ} entryless — ${healthy ? 'CLEAN' : 'POISONED'}`
);

/* ---------------- grid: offline re-rank ---------------- */

function metrics(ranks) {
  const n = ranks.length || 1;
  let h1 = 0;
  let rr = 0;
  for (const r of ranks) {
    if (r) {
      rr += 1 / r;
      if (r === 1) h1++;
    }
  }
  return { hit1: Number((h1 / n).toFixed(4)), mrr: Number((rr / n).toFixed(4)), n: ranks.length };
}

const CLASSES = ['directional', 'entity', 'natural'];
const grid = [];
for (const w of GRID) {
  const ranks = [];
  const perCls = Object.fromEntries(CLASSES.map((c) => [c, []]));
  const tr = Date.now();
  for (const p of pools) {
    const hits = rankHits(p.q, p.entries, { trustW: w });
    const i = hits.findIndex((h) => p.want.test(`${h.name} ${h.func}`));
    const r = i >= 0 ? i + 1 : 0;
    ranks.push(r);
    perCls[p.cls].push(r);
  }
  const ms = Date.now() - tr;
  const m = metrics(ranks);
  grid.push({ w, ...m, fitness: Number((m.hit1 + m.mrr).toFixed(4)), ms });
  for (const c of CLASSES) {
    const cm = metrics(perCls[c]);
    grid[grid.length - 1][c] = cm.n >= 5 ? { ...cm, fitness: Number((cm.hit1 + cm.mrr).toFixed(4)) } : null;
  }
}

const better = (a, b) => b.fitness - a.fitness || Math.abs(a.w - TRUST_W) - Math.abs(b.w - TRUST_W) || a.w - b.w;
const winner = [...grid].sort(better)[0];
const current = grid.find((g) => g.w === TRUST_W) || null;
const verdict = !healthy ? 'unreliable' : winner.w === TRUST_W ? 'keep' : 'promote';

/* ---------------- Mahoraga: opt-in local ledger ---------------- */

let ledgerFile = null;
if (!healthy) {
  log('ledger skipped — fetch poisoned the grid (see health line above); re-run at the default rate budget');
} else if (process.env.AIO_SELF_TUNE === '1') {
  const classes = {};
  for (const c of CLASSES) {
    const opts = grid.filter((g) => g[c]);
    if (opts.length) {
      const byClass = (a, b) =>
        b[c].fitness - a[c].fitness ||
        Math.abs(a.w - TRUST_W) - Math.abs(b.w - TRUST_W) ||
        a.w - b.w;
      const best = [...opts].sort(byClass)[0];
      classes[c] = { w: best.w, ...best[c] };
    }
  }
  const ledger = {
    version: 1,
    measured: new Date().toISOString().slice(0, 10),
    global: { w: winner.w, fitness: winner.fitness, hit1: winner.hit1, mrr: winner.mrr, n: winner.n },
    classes,
  };
  ledgerFile = `${STATE_DIR}/self-tune-ledger.json`;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeAtomic(ledgerFile, `${JSON.stringify(ledger, null, 2)}\n`);
  log(`ledger written: ${ledgerFile} (classes: ${Object.keys(classes).join(', ') || 'none with n>=5'})`);
} else {
  log('ledger skipped — opt in with AIO_SELF_TUNE=1 (local file, never uploaded)');
}

/* ---------------- report ---------------- */

if (asJson) {
  console.log(
    JSON.stringify(
      {
        n: pools.length,
        fetchSec,
        health: { sourceErrors: errQ, entryless: emptyQ, healthy },
        grid: grid.map(({ w, hit1, mrr, fitness, ms }) => ({ w, hit1, mrr, fitness, ms })),
        current,
        winner: { w: winner.w, fitness: winner.fitness },
        verdict,
        ledger: ledgerFile,
      },
      null,
      2
    )
  );
} else {
  console.log(`\nCell weight grid — n=${pools.length}, fetch ${fetchSec}s (weight-independent), rerank ms per row:`);
  console.log('  w      hit@1   MRR     fitness  rerank-ms');
  for (const g of grid) {
    console.log(`  ${String(g.w).padEnd(6)} ${String(g.hit1).padEnd(7)} ${String(g.mrr).padEnd(7)} ${String(g.fitness).padEnd(8)} ${g.ms}`);
  }
  console.log(
    `\ncommitted TRUST_W=${TRUST_W}${current ? ` fitness=${current.fitness}` : ' (not in grid)'} → winner w=${winner.w} fitness=${winner.fitness} → ${verdict.toUpperCase()}`
  );
  if (verdict === 'unreliable') {
    console.log(
      `fetch health FAILED (${errQ} queries with source errors, ${emptyQ} entryless) — a poisoned grid measures a different corpus than production; nothing written. Re-run at the default rate budget (do not set AIO_RATE=0 for this).`
    );
  } else if (verdict === 'promote' && !write) {
    console.log('re-run with --write to patch src/search.js, then: npm test && node scripts/eval-relevance.mjs --write');
  }
}
if (verdict === 'unreliable') process.exitCode = 1;

/* ---------------- --write: promote the winner ---------------- */

if (write) {
  if (verdict === 'unreliable') {
    console.error('self-tune: refusing --write — fetch health failed (unreliable grid)');
    process.exitCode = 1;
  } else if (verdict === 'keep') {
    log('--write: current TRUST_W already wins — nothing to patch');
  } else {
    const f = new URL('../src/search.js', import.meta.url);
    let src = fs.readFileSync(f, 'utf8');
    const re = /export const TRUST_W = \d+(?:\.\d+)?;/;
    if (!re.test(src)) {
      console.error('self-tune: TRUST_W declaration not found in src/search.js — refusing to patch blind');
      process.exit(1);
    }
    src = src.replace(re, `export const TRUST_W = ${winner.w};`);
    fs.writeFileSync(f, src);
    log(`patched src/search.js: TRUST_W ${TRUST_W} → ${winner.w}`);
    log('next: npm test && node scripts/eval-relevance.mjs --write  (then commit both)');
  }
}
