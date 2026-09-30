// search.js — `aio ask`: adaptive live search (GitHub repos/skills, npm, crates)
// merged + ranked with BM25, optional local Ollama rerank (qwen3). Zero storage:
// every result is printed only — nothing is written to disk or database.
import { liveSearch } from './live.js';

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.AIO_OLLAMA_MODEL || 'qwen3:4b';

/* ---------------- BM25 (in-memory merge ranker) ---------------- */

function tokenize(s) {
  return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Standard BM25 (k1=1.2, b=0.75) over an in-memory list. Tiny corpus → build per call. */
export function bm25Search(query, entries, limit = 8) {
  const q = tokenize(query);
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
    for (const term of q) {
      const f = tf.get(term) || 0;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / (avgLen || 1))));
    }
    return { entry: e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, rank) => ({
      ...s.entry,
      score: Number(s.score.toFixed(3)),
      why: `BM25 keyword match (#${rank + 1})`,
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

/** `aio ask` → { ok, text, json }. Every hit carries url + function (item 3). */
export async function runAsk({ query, json }) {
  if (!query || !query.trim()) {
    return { ok: false, text: 'usage: aio ask "<what you need>"\nexample: aio ask "csv ke chart interaktif"', json: null };
  }
  const t0 = Date.now();
  const { entries, sources, web, offline } = await liveSearch(query);

  if (offline) {
    return {
      ok: false,
      json: null,
      text: '[aio] offline (AIO_OFFLINE=1) — aio keeps zero local catalog by design; live search needs network.',
    };
  }

  // Merge-rank everything (source order carries stars/relevance; BM25 aligns to the query).
  const ranked = bm25Search(query, entries, 8);
  const pool = (ranked.length ? ranked : entries.slice(0, 8)).map((h) =>
    h.why ? h : { ...h, why: `source-ranked by ${h.src || 'live'}` }
  );
  // Source diversity: every answering source keeps at least 2 rows (best first).
  for (const s of [...new Set(entries.map((e) => e.src))]) {
    const best = entries.filter((e) => e.src === s);
    while (pool.filter((h) => h.src === s).length < 2 && pool.length < 10) {
      const next = best.find((e) => !pool.includes(e));
      if (!next) break;
      pool.push({ ...next, why: `top ${next.src} hit` });
    }
  }

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
    query,
    engine: ai ? `${engine} + ollama:${OLLAMA_MODEL}` : engine,
    sources,
    count: hits.length,
    stored: 0, // zero storage — results are never persisted
    hits,
  };
  if (json) return { ok: true, text: JSON.stringify(out, null, 2), json: out };
  if (!hits.length) {
    return {
      ok: true,
      json: out,
      text:
        `aio ask — "${query}" (${engine} · ${ms}s)\n` +
        'No result from live sources. Refine keywords — or search the web with your own web-search tool' +
        `${web ? ' (URL detected in the prompt)' : ''}.`,
    };
  }
  const lines = [`aio ask — "${query}" (${engine} · ${hits.length} hasil · ${ms}s${web ? ' · web → your web search' : ''})`, ''];
  hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.name} [${h.type}] ${h.src ? `<${h.src}>` : ''} — ${h.func}`);
    if (h.meta) lines.push(`   ${h.meta}`);
    lines.push(h.url ? `   ${h.url}` : '   (no public URL)');
    lines.push(`   why: ${h.why}`);
  });
  return { ok: true, text: lines.join('\n'), json: out };
}
