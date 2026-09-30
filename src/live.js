// live.js — real-time source layer: GitHub (repos + skills via code search),
// npm, crates.io. No search storage: results are printed, never written to disk/db.
// Every source degrades silently (timeout/missing gh/rate limit → skip).
// Every entry carries `trust01` — a popularity prior in [0,1] (stars/downloads/
// npm score) that `search.js` blends into the final ranking (FR12).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const UA = { 'user-agent': 'aio-connect/1.3 (+https://github.com/MRaihan-XXL/all-in-one)' };
const T = (ms) => AbortSignal.timeout(ms);

/* ---------------- helpers ---------------- */

let ghTokenCache; // in-memory only — never logged, never persisted
async function ghToken() {
  if (ghTokenCache !== undefined) return ghTokenCache;
  if (process.env.AIO_NO_GH === '1') {
    ghTokenCache = null;
    return null; // shell-free mode (tests): no subprocess spawn
  }
  try {
    const { stdout } = await execFileP('gh', ['auth', 'token'], { timeout: 4000, windowsHide: true });
    ghTokenCache = String(stdout).trim() || null;
  } catch {
    ghTokenCache = null; // unauthenticated: search still works (lower rate)
  }
  return ghTokenCache;
}

function ghHeaders(json = true) {
  const h = { ...UA };
  if (json) h.accept = 'application/vnd.github+json';
  return h; // Authorization attached per-call by ghAuthHeaders()
}

async function ghAuthHeaders(json = true) {
  const h = ghHeaders(json);
  const t = await ghToken();
  if (t) h.authorization = `Bearer ${t}`;
  return h;
}

function trim(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// GitHub ANDs every term — drop generic words or rich queries return 0 hits.
const STOP = new Set([
  'a', 'an', 'the', 'for', 'to', 'of', 'in', 'on', 'with', 'and', 'or', 'is', 'my', 'i',
  'awesome', 'best', 'free', 'good', 'nice', 'great', 'library', 'libraries', 'tool', 'tools',
  'package', 'packages', 'need', 'want', 'find', 'some', 'any', 'please', 'make', 'use', 'using',
]);
export function ghQuery(q) {
  const words = String(q).toLowerCase().split(/[^a-z0-9.@/-]+/).filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w));
  return (kept.length ? kept : words).slice(0, 6).join(' ') || String(q);
}

/* ---------------- sources ---------------- */

/** GitHub repository search — the whole public corpus (630M+ repos, Octoverse 2025). */
export async function ghRepos(q, n = 6) {
  const gq = ghQuery(q);
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(gq)}&sort=stars&order=desc&per_page=${n}`;
  const res = await fetch(url, { headers: await ghAuthHeaders(), signal: T(4000) });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((r) => ({
    type: 'repo',
    name: r.full_name,
    url: r.html_url,
    func: trim(r.description, 120) || `${r.language || 'Repo'} repository (no description)`,
    meta: `★${r.stargazers_count}${r.language ? ` · ${r.language}` : ''}`,
    src: 'github',
    trust01: Math.min(1, Math.log10(1 + (r.stargazers_count || 0)) / 5),
  }));
}

/**
 * Skills live discovery via GitHub code search (filename:SKILL.md) — 6.8M+ public
 * skill files (measured 2026-09-30). Needs `gh` (authenticated); absent → [].
 */
export async function ghSkills(q, n = 6) {
  if (process.env.AIO_NO_GH === '1') return [];
  const codeQ = `filename:SKILL.md ${ghQuery(q)}`.trim();
  const api = `search/code?q=${encodeURIComponent(codeQ)}&per_page=${n}`;
  try {
    const { stdout } = await execFileP('gh', ['api', api], {
      timeout: 4500,
      maxBuffer: 1 << 20,
      windowsHide: true,
      env: { ...process.env, GH_PAGER: '' },
    });
    const data = JSON.parse(stdout);
    return (data.items || []).map((f) => ({
      type: 'skill',
      name: f.repository.full_name,
      url: f.repository.html_url,
      func: `SKILL.md — ${f.path}`,
      meta: 'public skill (github code search)',
      src: 'github',
      trust01: 0.5, // no popularity field in code search results → neutral prior
    }));
  } catch {
    return [];
  }
}

/** npm registry search — 3M+ packages. */
export async function npmSearch(q, n = 6) {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=${n}`;
  const res = await fetch(url, { headers: UA, signal: T(4000) });
  if (!res.ok) throw new Error(`npm ${res.status}`);
  const data = await res.json();
  return (data.objects || []).map((o) => ({
    type: 'tool',
    name: o.package.name,
    url: `https://www.npmjs.com/package/${o.package.name}`,
    func: trim(o.package.description, 120) || 'npm package (no description)',
    meta: [o.package.version ? `v${o.package.version}` : '', (o.package.keywords || []).slice(0, 3).join(' · ')]
      .filter(Boolean)
      .join(' · '),
    src: 'npm',
    trust01: typeof o.score?.final === 'number' ? o.score.final : 0.5, // npm quality/popularity score
  }));
}

/** crates.io search — Rust tools. */
export async function cratesSearch(q, n = 5) {
  const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(q)}&per_page=${n}`;
  const res = await fetch(url, { headers: UA, signal: T(4000) });
  if (!res.ok) throw new Error(`crates ${res.status}`);
  const data = await res.json();
  return (data.crates || []).map((c) => ({
    type: 'tool',
    name: c.id,
    url: `https://crates.io/crates/${c.id}`,
    func: trim(c.description, 120) || 'Rust crate (no description)',
    meta: `v${c.max_stable_version || '?'} · ★${c.stars ?? 0}`,
    src: 'crates',
    trust01: Math.min(1, Math.log10(1 + (c.downloads || c.recent_downloads || 0)) / 7),
  }));
}

/* ---------------- adaptive routing ---------------- */

/**
 * Which sources fit this query (adaptive = skip sources that cannot hit).
 * Always-on: GitHub repos + npm. crates only for rust-ish asks; skills only for
 * skill-ish asks (gh code search is the scarce quota). Returns the sanitized
 * per-source queries.
 */
export function detectIntent(query = '') {
  const q = String(query).trim();
  const s = q.toLowerCase();
  const hasUrl = /\bhttps?:\/\/|www\./.test(s);
  const stripUrl = q.replace(/https?:\/\/\S+|www\.\S+/g, ' ').trim() || q;
  return {
    web: hasUrl, // hint: agent's own web search covers URLs
    repos: stripUrl,
    npm: stripUrl,
    crates: /\b(rust|crate|cargo|crates\.io)\b/.test(s) ? stripUrl : null,
    skills: /\b(skill|skills|prompt|agent|cursor|awesome[- _]?skill|claude|gemini|opencode)\b/.test(s)
      ? stripUrl
      : null,
    npmOnly: /\b(npm|node|package|library|dependency|react|vue|svelte|typescript|javascript)\b/.test(s),
  };
}

/**
 * Run every applicable source in parallel (allSettled, 4s budget each).
 * Returns { entries, sources } — sources = labels that answered.
 * NEVER persists anything.
 */
export async function liveSearch(query, { n = 6 } = {}) {
  if (process.env.AIO_OFFLINE === '1') return { entries: [], sources: [], offline: true };
  const it = detectIntent(query);
  const jobs = [];
  const labels = [];
  if (it.repos) {
    jobs.push(ghRepos(it.repos, n));
    labels.push('github');
  }
  if (it.skills) {
    jobs.push(ghSkills(it.skills, Math.min(n, 5)));
    labels.push('skills');
  }
  if (it.npm) {
    jobs.push(npmSearch(it.npm, n));
    labels.push('npm');
  }
  if (it.crates) {
    jobs.push(cratesSearch(it.crates, 5));
    labels.push('crates');
  }
  const settled = await Promise.allSettled(jobs);
  const entries = [];
  const sources = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length) {
      entries.push(...r.value);
      sources.push(labels[i]);
    }
  });
  return { entries, sources, web: it.web, offline: false };
}
