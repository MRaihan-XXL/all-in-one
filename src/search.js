// search.js — catalog search for `aio ask`: BM25 over repos/tools/sites/skills,
// then an optional local Ollama rerank (qwen3). Zero npm dependencies — fetch only.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadRepos, loadSites, scanSkills } from './scan.js';

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.AIO_OLLAMA_MODEL || 'qwen3:4b';

/* ---------------- catalog ---------------- */

/** Normalized entries: { type, name, url, func, meta } — func/meta feed ranking. */
export async function loadCatalog(dataDir, reposDir) {
  const entries = [];
  for (const r of await loadRepos(dataDir, reposDir)) {
    entries.push({
      type: 'repo',
      name: r.name,
      url: r.url || '',
      func: r.description || 'GitHub repository (no description in catalog)',
      meta: [r.category, r.language, r.stars ? `\u2605${r.stars}` : ''].filter(Boolean).join(' \u00b7 '),
    });
  }
  if (dataDir) {
    const dbPath = path.join(dataDir, 'ai-tools.db');
    if (fs.existsSync(dbPath)) {
      try {
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(dbPath, { readOnly: true });
        for (const t of db
          .prepare('SELECT name, category, url, description, access FROM tools ORDER BY id')
          .all()) {
          entries.push({
            type: 'tool',
            name: t.name,
            url: t.url || '',
            func: t.description || 'Local tool from the catalog',
            meta: [t.category, t.access ? String(t.access) : ''].filter(Boolean).join(' \u00b7 '),
          });
        }
        db.close();
      } catch (e) {
        console.error(`[aio] note: tools table unreadable (${e.message})`);
      }
    }
    for (const s of await loadSites(dataDir)) {
      entries.push({
        type: 'site',
        name: s.name,
        url: s.url,
        func: s.why || 'Web tool in the curated sites catalog',
        meta: [s.category, s.used_by ? `for ${s.used_by}` : ''].filter(Boolean).join(' \u00b7 '),
      });
    }
  }
  for (const loc of scanSkills()) {
    for (const n of loc.names) {
      entries.push({ type: 'skill', name: n, url: '', func: `Agent skill installed at ${loc.location}`, meta: 'skill' });
    }
  }
  return entries;
}

/* ---------------- BM25 ---------------- */

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
  const cands = hits.map((h, i) => `${i}. [${h.type}] ${h.name} — ${h.func}`).join('\n');
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal: AbortSignal.timeout(20000), // covers first-call model load
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
              'You rank catalog candidates for a developer need. Reply ONLY with JSON: {"top":[{"i":<index>,"why":"<max 12 words>"}]} — best first, only items that genuinely fit, max 5.',
          },
          { role: 'user', content: `Need: ${query}\nCandidates:\n${cands}` },
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
    return { ai: false, hits }; // Ollama down/slow/invalid → BM25 order stands
  }
}

/* ---------------- command helpers ---------------- */

/** `aio ask` → { ok, text, json }. Every hit carries url + function (item 3). */
export async function runAsk({ query, json, dataDir, reposDir }) {
  if (!query || !query.trim()) {
    return { ok: false, text: 'usage: aio ask "<what you need>"\nexample: aio ask "csv ke chart interaktif"', json: null };
  }
  const entries = await loadCatalog(dataDir, reposDir);
  const core = entries.filter((e) => e.type !== 'skill').length; // repos+tools+sites
  if (!core) {
    return { ok: false, text: '[aio] catalog empty — no db/manifest found. Run `aio` first.', json: null };
  }
  const bm = bm25Search(query, entries);
  const { ai, hits } = await aiRerank(query, bm);
  const out = { query, engine: ai ? `ollama:${OLLAMA_MODEL}` : 'bm25', count: hits.length, hits };
  if (json) return { ok: true, text: JSON.stringify(out, null, 2), json: out };
  if (!hits.length) {
    return {
      ok: true,
      json: out,
      text:
        `aio ask — "${query}" (engine: ${out.engine})\n` +
        'No catalog match. Try `aio borrow "<keywords>"` for live GitHub search.',
    };
  }
  const lines = [`aio ask — "${query}" (engine: ${out.engine} · ${hits.length} hasil)`, ''];
  hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.name} [${h.type}] — ${h.func}`);
    if (h.meta) lines.push(`   ${h.meta}`);
    lines.push(h.url ? `   ${h.url}` : '   (local — no public URL)');
    lines.push(`   why: ${h.why}`);
  });
  return { ok: true, text: lines.join('\n'), json: out };
}
