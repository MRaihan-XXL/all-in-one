// search.js — `aio ask`: adaptive live search (GitHub repos/skills, npm, crates)
// merged + ranked with BM25 blended with source trust (stars/downloads/npm score).
// No search storage: every result is printed only — never written to disk or
// database.
import fs from 'node:fs';
import path from 'node:path';
import { liveSearch } from './live.js';
import { msg } from './messages.js';
import { STATE_DIR, preserveCorrupt } from './paths.js';

/* ---------------- BM25 (in-memory merge ranker) ---------------- */

/** Committed rank weight (trust share; BM25 share = 1 - TRUST_W). The Cell
 *  harness (scripts/self-tune.mjs) grids this against the golden set and a
 *  strictly fitter winner is committed here — each release is the next
 *  "offspring". Default 0.65 relevance + 0.35 trust (FR12). */
export const TRUST_W = 0.1;

/** Query-shape classes for Mahoraga's local experience ledger — deterministic
 *  proxies only: direction words first, then bare identifiers, else natural. */
export function queryClass(q) {
  const s = String(q || '').trim();
  if (/\bto\b/i.test(s)) return 'directional';
  if (!/\s/.test(s)) return 'entity';
  return 'natural';
}

const TUNE_LEDGER = path.join(STATE_DIR, 'self-tune-ledger.json');
let tuneCache = { mtime: -2, ledger: null };

function readTuneLedger() {
  let mtime = -1;
  try {
    mtime = fs.statSync(TUNE_LEDGER).mtimeMs;
  } catch {
    /* absent = no local experience yet */
  }
  if (mtime === -1) {
    if (tuneCache.mtime !== -1) tuneCache = { mtime: -1, ledger: null };
    return null;
  }
  if (tuneCache.mtime === mtime) return tuneCache.ledger;
  let ledger = null;
  try {
    ledger = JSON.parse(fs.readFileSync(TUNE_LEDGER, 'utf8'));
  } catch {
    // Corrupt local experience must not crash ranking, but it is also the only
    // copy of what went wrong: move it aside and say so — never swallow it.
    const kept = preserveCorrupt(TUNE_LEDGER);
    console.error(msg('tuneLedgerCorrupt', { file: TUNE_LEDGER, kept }));
    ledger = null;
  }
  tuneCache = { mtime, ledger };
  return ledger;
}

/** Effective trust weight — TRUST_W by default (env off = zero extra I/O).
 *  Mahoraga (opt-in AIO_SELF_TUNE=1) swaps in a per-class weight ONLY when the
 *  local ledger proved it: n >= 5 and class fitness >= the global winner's.
 *  Local machine only — experience never leaves this machine (zero-storage). */
export function resolveTrustW(query) {
  if (process.env.AIO_SELF_TUNE !== '1') return TRUST_W;
  const ledger = readTuneLedger();
  const cls = ledger?.classes?.[queryClass(query)];
  if (!cls || typeof cls.w !== 'number' || cls.w < 0 || cls.w > 1 || !(cls.n >= 5)) {
    return TRUST_W;
  }
  const g = ledger?.global;
  if (typeof cls.fitness === 'number' && typeof g?.fitness === 'number' && cls.fitness < g.fitness) {
    return TRUST_W;
  }
  return cls.w;
}

function tokenize(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    // light plural stem so query "chart" matches docs "charts" (exact-token gate)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

// Query-side intensifier stoplist — "awesome" must not fetch awesome-phonenumber.
// (Only the query side; documents keep every token.) Direction/preposition words
// joined in: "pdf to word" must not count "to" as a matchable term — that is how
// pdf-to-png kept sneaking into a word-document query (direction blindness).
const QSTOP = new Set([
  'awesome', 'best', 'free', 'good', 'nice', 'great', 'please', 'need', 'want',
  'find', 'some', 'any', 'recommend', 'recommended', 'looking',
  'to', 'from', 'into', 'via', 'with', 'for', 'ke', 'dari', 'untuk', 'dengan',
]);

function trustTier(t) {
  if (typeof t !== 'number') return 'low';
  return t >= 0.66 ? 'high' : t >= 0.33 ? 'mid' : 'low';
}

/** Standard BM25 (k1=1.2, b=0.75) over an in-memory list. Tiny corpus → build per call.
 *  Entries carrying a numeric `trust01` (source popularity: stars / downloads / npm
 *  score, mapped to [0,1]) are re-ranked (1 - w) relevance + w trust — keyword overlap
 *  stays the gate, trust only orders the matches (supply-chain signal, FR12).
 *  w = opts.trustW (Cell harness grids it) or resolveTrustW(query) (Mahoraga /
 *  default TRUST_W). Score is also scaled by query-term coverage so a single
 *  rare-term hit cannot outrank a candidate matching most of the query. */
export function bm25Search(query, entries, limit = 8, opts = {}) {
  const raw = tokenize(query);
  const q = raw.filter((t) => !QSTOP.has(t));
  if (!q.length) return [];
  const docs = entries.map((e) => tokenize(`${e.name} ${e.name} ${e.func} ${e.meta || ''}`));
  const N = docs.length || 1;
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / (N || 1);
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const k1 = 1.2;
  const b = 0.75;
  const scored = entries.map((e, i) => {
    const d = docs[i];
    const tf = new Map();
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    let matchedTerms = 0;
    for (const term of q) {
      const f = tf.get(term) || 0;
      if (!f) continue;
      matchedTerms++;
      const idf = Math.log(1 + (N - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / (avgLen || 1))));
    }
    score *= 0.4 + (0.6 * matchedTerms) / q.length; // query-term coverage
    return { entry: e, score, cov: matchedTerms / q.length };
  });
  const matched = scored.filter((s) => s.score > 0); // keyword gate: no overlap → no hit
  const maxScore = matched.reduce((m, s) => Math.max(m, s.score), 0) || 1;
  const blend = matched.some((s) => typeof s.entry.trust01 === 'number');
  if (blend) {
    const w =
      typeof opts.trustW === 'number'
        ? Math.min(1, Math.max(0, opts.trustW))
        : resolveTrustW(query);
    for (const s of matched) {
      const t = typeof s.entry.trust01 === 'number' ? Math.min(1, Math.max(0, s.entry.trust01)) : 0;
      s.score = (1 - w) * (s.score / maxScore) + w * t;
    }
  }
  return matched
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, rank) => ({
      ...s.entry,
      score: Number(s.score.toFixed(3)),
      cov: Number(s.cov.toFixed(2)), // fraction of query terms the hit covers (runAsk's noise gate)
      why: `BM25 keyword match (#${rank + 1})${blend ? ` + trust ${trustTier(s.entry.trust01)}` : ''}`,
    }));
}

/* ---------------- command helpers ---------------- */

/** Source diversity: every answering source keeps ≥2 rows. Membership is tracked
 *  by URL/name (ranked rows are copies — identity compare would duplicate).
 *  Returns a capped COPY of the pool (caller's array is untouched). Exported for deterministic tests. */
export function diversify(pool, entries, limit = 10) {
  const out = [...pool];
  const seen = new Set(out.map((h) => h.url || h.name));
  for (const s of [...new Set(entries.map((e) => e.src))]) {
    const best = entries.filter((e) => e.src === s);
    while (out.filter((h) => h.src === s).length < 2 && out.length < limit) {
      const next = best.find((e) => !seen.has(e.url || e.name));
      if (!next) break;
      seen.add(next.url || next.name);
      out.push({ ...next, why: `top ${next.src} hit` });
    }
  }
  return out;
}

/** Drop rows sharing a URL/name with an earlier row (repos ∩ skills overlap). */
export function dedupe(hits) {
  const seen = new Set();
  return hits.filter((h) => {
    const k = h.url || h.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Human note per source failure — rate limits and dead networks must not masquerade as "no match".
 *  Exported: `aio agent` (agent.js) renders the same honest per-source notes. */
export function sourceErrorNote(errors) {
  return errors.map((e) => {
    const m = String(e.msg || '');
    const kind = /403|401|rate|abuse/i.test(m)
      ? msg('errRateLimited')
      : /timeout|abort|timed out/i.test(m)
        ? msg('errTimeout')
        : /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i.test(m)
          ? msg('errUnreachable')
          : m.slice(0, 120);
    return `      ${e.src}: ${kind}`;
  });
}

/** Merge-rank one query's fetched pool: BM25+trust, source fallback, diversity,
 *  dedupe, coverage gate. Exported so the Cell harness re-ranks the SAME pool at
 *  alternative weights without refetching (fetch-once grid, scripts/self-tune.mjs).
 *  Comments live here with the logic they explain. */
export function rankHits(query, entries, opts = {}) {
  // Merge-rank everything (source order carries stars/relevance; BM25 aligns to the query).
  const ranked = bm25Search(query, entries, 8, opts);
  let pool = (ranked.length ? ranked : entries.slice(0, 8)).map((h) =>
    h.why ? h : { ...h, why: `source-ranked by ${h.src || 'live'}` }
  );
  pool = dedupe(diversify(pool, entries, 10));
  // Near-name noise gate: a hit covering <60% of the query's content terms is a
  // guess, not an answer — "word-wrap" for "pdf to word". BM25 rows carry cov;
  // source-ranked fallback rows (no cov) always pass. Never starve the pool:
  // if the gate would empty it, the unfiltered pool stands.
  const strict = pool.filter((h) => (h.cov ?? 1) >= 0.6);
  return strict.length ? strict : pool;
}

/** `aio ask` → { ok, text, json }. Every hit carries url + function (item 3). */
export async function runAsk({ query, json }) {
  if (!query || !query.trim()) {
    return { ok: false, text: msg('usageAsk'), json: null };
  }
  const t0 = Date.now();
  const { entries, sources, errors = [], sourcesDetail = [], web, offline } = await liveSearch(query);

  if (offline) {
    return {
      ok: false,
      json: null,
      text: msg('offlineSearch'),
    };
  }

  const trustW = resolveTrustW(query);
  const hits = rankHits(query, entries, { trustW });

  const engine = sources.length ? `live: ${sources.join('+')}` : 'live: no source answered';
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  // ok = a source answered (even with 0 hits) OR nothing failed — the same rule
  // for --json and text, so machine consumers never see a masked failure (B-01).
  const ok = sources.length > 0 || errors.length === 0;
  const out = {
    schemaVersion: 1, // machine consumers pin to this — bump only on breaking shape change
    query,
    engine,
    ok, // the verdict the text mode already shows — JSON consumers get it too
    sources,
    sourcesDetail, // per-lane {name, ms, ok, hits} — auditable timing (Stage 3)
    errors,
    count: hits.length,
    stored: 0, // zero storage — results are never persisted
    rankWeight: trustW, // effective trust weight — 0.35 default, ledger-proven only when opted in
    hits,
  };
  if (json) return { ok, text: JSON.stringify(out, null, 2), json: out };
  // text mode only below: the engine stays EN in the payload above (machine
  // contract) — the human rendering flips with AIO_LANG.
  const engineText = sources.length ? msg('engineLive', { lanes: sources.join('+') }) : msg('engineNoSource');
  const timeLine = sourcesDetail.length
    ? msg('timeFooter', { detail: sourcesDetail.map((s) => `${s.name} ${(s.ms / 1000).toFixed(1)}s`).join(' · ') })
    : null;
  if (!hits.length) {
    const errBlock = errors.length ? `\n${sourceErrorNote(errors).join('\n')}\n` : '';
    return {
      ok,
      json: out,
      text:
        `${msg('askHeaderZero', { query, engine: engineText, sec: ms })}\n` +
        errBlock +
        (errors.length && !sources.length
          ? msg('liveSourcesFailed')
          : msg('askNoResult') + (web ? msg('askUrlHint') : '') + '.') +
        (timeLine ? `\n${timeLine}` : ''),
    };
  }
  const lines = [
    msg('askHeader', { query, engine: engineText, n: hits.length, sec: ms, web: web ? msg('askHeaderWeb') : '' }),
    '',
  ];
  lines.push(msg('askNote'));
  if (errors.length) lines.push(msg('askSourceIssues', { srcs: errors.map((e) => e.src).join(', ') }));
  hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.name} [${h.type}] ${h.src ? `<${h.src}>` : ''} — ${h.func}`);
    if (h.meta) lines.push(`   ${h.meta}`);
    lines.push(h.url ? `   ${h.url}` : `   ${msg('askNoUrl')}`);
    lines.push(`   why: ${h.why}`);
  });
  if (timeLine) lines.push(timeLine); // footer: per-lane timing, honest worst-case visible
  return { ok, text: lines.join('\n'), json: out };
}
