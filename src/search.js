// search.js — `aio ask`: adaptive live search (GitHub repos/skills, npm, crates)
// merged + ranked with BM25 blended with source trust (stars/downloads/npm score),
// optional local Ollama rerank (qwen3). No search storage: every result is
// printed only — never written to disk or database.
import { liveSearch } from './live.js';
import { msg } from './messages.js';

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.AIO_OLLAMA_MODEL || 'qwen3:4b';

/* ---------------- BM25 (in-memory merge ranker) ---------------- */

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
 *  score, mapped to [0,1]) are re-ranked 65% relevance + 35% trust — keyword overlap
 *  stays the gate, trust only orders the matches (supply-chain signal, FR12).
 *  Score is also scaled by query-term coverage so a single rare-term hit cannot
 *  outrank a candidate matching most of the query. */
export function bm25Search(query, entries, limit = 8) {
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
    for (const s of matched) {
      const t = typeof s.entry.trust01 === 'number' ? Math.min(1, Math.max(0, s.entry.trust01)) : 0;
      s.score = 0.65 * (s.score / maxScore) + 0.35 * t;
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

/* ---------------- optional local-AI rerank ---------------- */

/** Rerank hits with local Ollama; returns { ai, hits } — falls back silently. */
export async function aiRerank(query, hits) {
  if (!hits.length || process.env.AIO_NO_AI === '1') return { ai: false, hits };
  // token budget: rank the best 12 candidates, truncate long functions — the rest pass through unranked
  const cands = hits
    .slice(0, 12)
    .map((h, i) => `${i}. [${h.type}] ${h.name} — ${String(h.func || '').slice(0, 100)}`)
    .join('\n');
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(3500), // warm model only — cold load must not stall `ask`
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        think: false, // qwen3 reasoning mode would blow the latency budget
        options: { temperature: 0.2 },
        messages: [
          {
            role: 'system',
            content:
              'Rank catalog candidates for a developer need. Reply ONLY with JSON: {"top":[{"i":<index>,"why":"<max 10 words>"}]} — best first, max 5, only genuine fits.',
          },
          { role: 'user', content: `Need: ${query.slice(0, 160)}\nCandidates:\n${cands}` },
        ],
      }),
    });
    if (!res.ok) return { ai: false, hits };
    const data = await res.json();
    const parsed = JSON.parse(data.message?.content || '{}');
    if (!Array.isArray(parsed.top) || !parsed.top.length) return { ai: false, hits };
    const byIdx = new Map(hits.map((h, i) => [i, h]));
    const seen = new Set();
    const top = [];
    for (const t of parsed.top) {
      const h = byIdx.get(Number(t.i));
      if (h && !seen.has(Number(t.i))) {
        seen.add(Number(t.i));
        top.push({ ...h, why: `${OLLAMA_MODEL}: ${t.why}` });
      }
    }
    const rest = hits.filter((_, i) => !seen.has(i));
    return { ai: true, hits: [...top, ...rest] };
  } catch {
    return { ai: false, hits }; // Ollama down/slow/invalid → merged order stands
  }
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
      ? 'rate-limited — set GH_TOKEN / `gh auth login`, or retry later'
      : /timeout|abort|timed out/i.test(m)
        ? 'timeout (4s/source budget)'
        : /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i.test(m)
          ? 'unreachable (network)'
          : m.slice(0, 120);
    return `      ${e.src}: ${kind}`;
  });
}

/** `aio ask` → { ok, text, json }. Every hit carries url + function (item 3). */
export async function runAsk({ query, json }) {
  if (!query || !query.trim()) {
    return { ok: false, text: msg('usageAsk'), json: null };
  }
  const t0 = Date.now();
  const { entries, sources, errors = [], web, offline } = await liveSearch(query);

  if (offline) {
    return {
      ok: false,
      json: null,
      text: msg('offlineSearch'),
    };
  }

  // Merge-rank everything (source order carries stars/relevance; BM25 aligns to the query).
  const ranked = bm25Search(query, entries, 8);
  let pool = (ranked.length ? ranked : entries.slice(0, 8)).map((h) =>
    h.why ? h : { ...h, why: `source-ranked by ${h.src || 'live'}` }
  );
  pool = dedupe(diversify(pool, entries, 10));
  // Near-name noise gate: a hit covering <60% of the query's content terms is a
  // guess, not an answer — "word-wrap" for "pdf to word". BM25 rows carry cov;
  // source-ranked fallback rows (no cov) always pass. Never starve the pool:
  // if the gate would empty it, the unfiltered pool stands.
  const strict = pool.filter((h) => (h.cov ?? 1) >= 0.6);
  pool = strict.length ? strict : pool;

  // Rerank only if we are still inside the speed budget (warm Ollama, ≤3.5s).
  let ai = false;
  let hits = pool;
  if (pool.length && Date.now() - t0 <= 2500) {
    const r = await aiRerank(query, pool);
    ai = r.ai;
    hits = r.hits;
  }

  const engine = sources.length ? `live: ${sources.join('+')}` : 'live: no source answered';
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  const out = {
    schemaVersion: 1, // machine consumers pin to this — bump only on breaking shape change
    query,
    engine: ai ? `${engine} + ollama:${OLLAMA_MODEL}` : engine,
    sources,
    errors,
    count: hits.length,
    stored: 0, // zero storage — results are never persisted
    hits,
  };
  // ok = a source answered (even with 0 hits) OR nothing failed — the same rule
  // for --json and text, so machine consumers never see a masked failure (B-01).
  const ok = sources.length > 0 || errors.length === 0;
  if (json) return { ok, text: JSON.stringify(out, null, 2), json: out };
  if (!hits.length) {
    const errBlock = errors.length ? `\n${sourceErrorNote(errors).join('\n')}\n` : '';
    return {
      ok,
      json: out,
      text:
        `aio ask — "${query}" (${engine} · ${ms}s)\n` +
        errBlock +
        (errors.length && !sources.length
          ? 'Live sources failed — fix the issue above, then retry.'
          : 'No result from live sources. Refine keywords — or search the web with your own web-search tool' +
            `${web ? ' (URL detected in the prompt)' : ''}.`),
    };
  }
  const lines = [`aio ask — "${query}" (${engine} · ${hits.length} results · ${ms}s${web ? ' · web → your web search' : ''})`, ''];
  lines.push('note: ranked by keyword match + source popularity — public results are unvetted;');
  lines.push('      verify before running npx/uvx or cloning (docs/THREATS.md).');
  if (errors.length) lines.push(`source issues: ${errors.map((e) => e.src).join(', ')} — see --json errors[]`);
  hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.name} [${h.type}] ${h.src ? `<${h.src}>` : ''} — ${h.func}`);
    if (h.meta) lines.push(`   ${h.meta}`);
    lines.push(h.url ? `   ${h.url}` : '   (no public URL)');
    lines.push(`   why: ${h.why}`);
  });
  return { ok, text: lines.join('\n'), json: out };
}
