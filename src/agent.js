// agent.js — `aio agent`: the agentic COORDINATOR. One task → every lane at
// once (GitHub repos ∥ skills ∥ npm ∥ crates ∥ WEB: wikipedia+HN ∥ LOCAL TOOLS
// already on PATH), parallel, then a deterministic synthesis: which source
// answers which part of the task plus an ordered route (read → run → clone →
// install). Zero storage — everything is printed and discarded.
// The synthesis is rule-based BY DESIGN: aio never pretends an LLM decided it.
// It hands the executing agent a coordination plan with links; the agent does
// the actual work (docs/THREATS.md: honest about what is deterministic).
import { liveSearch } from './live.js';
import { bm25Search, dedupe, diversify, sourceErrorNote } from './search.js';
import { msg } from './messages.js';

const LANE_WHY = {
  github: 'implementation references (630M+ public repos)',
  skills: 'installable SKILL.md playbooks',
  npm: 'runnable packages (npx, no install)',
  crates: 'Rust crates',
  web: 'context first — wikipedia + hacker news',
  tools: 'already installed on this machine — run now',
};

/** Generic task words — a quick-try must cover a REAL task token, never one of
 *  these (that is how "convert csv to interactive chart" got routed to a
 *  CSV→JSON converter: it "matched" on convert/csv and answered nothing). */
const ROUTE_GENERIC = new Set([
  'convert', 'make', 'create', 'run', 'use', 'using', 'best', 'free', 'easy', 'fast',
  'simple', 'tool', 'tools', 'package', 'install', 'download', 'get', 'find', 'need',
  'want', 'into', 'from', 'with', 'for', 'and', 'the', 'how', 'way', 'build', 'write',
  'open', 'save', 'manage', 'data', 'file', 'files', 'format', 'formats', 'awesome',
  'check', 'compare', 'new', 'any', 'some',
]);
const toks = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Ordered route over the lanes that actually answered. Order = cheapest first:
 *  tools (no install) → web (read before code) → npm/crates (quick try) →
 *  repo (borrow the source) → skill (install the playbook). Executable lanes
 *  (npm/crates) are quality-gated when they have a choice: with >1 candidate,
 *  every pick must cover ≥1 core task token (≥4 chars, non-generic) — or the
 *  step drops and the deep-dive lane carries the task. A lone candidate is
 *  never filtered (there is nothing to choose between). */
function buildRoute(hits, query) {
  const bySrc = new Map();
  for (const h of hits) {
    if (!bySrc.has(h.src)) bySrc.set(h.src, []);
    bySrc.get(h.src).push(h);
  }
  const qCore = toks(query).filter((t) => t.length >= 4 && !ROUTE_GENERIC.has(t));
  const fits = (h) => {
    if (!qCore.length) return true;
    const ht = toks(`${h.name} ${h.func}`);
    return qCore.some((c) => ht.some((t) => t === c || t.startsWith(c) || c.startsWith(t)));
  };
  const route = [];
  const take = (src, k, gate = false) => {
    const c = bySrc.get(src) || [];
    const sel = gate && c.length > 1 ? c.filter(fits) : c;
    return sel.slice(0, k);
  };
  for (const h of take('tools', 3)) {
    route.push({ step: 'run now', use: h.name, why: h.func });
  }
  for (const h of take('web', 2)) {
    route.push({ step: 'read first', use: h.name, why: `context before code — ${h.url}` });
  }
  for (const h of take('npm', 2, true)) {
    route.push({ step: 'quick try', use: `npx ${h.name}`, why: `${h.func} — verify before running (docs/THREATS.md)` });
  }
  for (const h of take('crates', 1, true)) {
    route.push({ step: 'quick try', use: `cargo add ${h.name}`, why: h.func });
  }
  for (const h of take('github', 2)) {
    route.push({ step: 'deep dive', use: `aio borrow --get ${h.name}`, why: `clone to temp, 24h TTL — ${h.func}` });
  }
  for (const h of take('skills', 1)) {
    route.push({ step: 'install skill', use: `aio skill add ${h.name}`, why: h.func });
  }
  return route;
}

/** `aio agent` → { ok, text, json }. Same ok-rule as ask: a source answered
 *  (even with 0 hits) OR nothing failed — machine consumers never see a masked
 *  failure (B-01). */
export async function runAgent({ query, json }) {
  if (!query || !query.trim()) {
    return { ok: false, text: msg('usageAgent'), json: null };
  }
  const t0 = Date.now();
  const { entries, sources, errors = [], offline } = await liveSearch(query, { n: 10, all: true });

  if (offline) {
    return {
      ok: false,
      json: null,
      text: msg('offlineAgent'),
    };
  }

  const ranked = bm25Search(query, entries, 12);
  let pool = (ranked.length ? ranked : entries.slice(0, 12)).map((h) =>
    h.why ? h : { ...h, why: `source-ranked by ${h.src || 'live'}` },
  );
  // guarantee every ANSWERED source shows at least one row: diversify()'s fill
  // can exhaust its limit before later sources get a turn (e.g. web answered
  // but all 14 slots were eaten by github+npm)
  const srcSeen = new Set(pool.map((h) => h.src));
  for (const s of [...new Set(entries.map((e) => e.src))]) {
    if (srcSeen.has(s)) continue;
    const alt = entries.find((e) => e.src === s);
    if (alt) pool.push({ ...alt, why: `top ${s} hit` });
  }
  pool = dedupe(diversify(pool, entries, 16)).slice(0, 16);

  const route = buildRoute(pool, query);
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  const lanesRun = ['github', 'skills', 'npm', 'crates', 'web', 'tools'];
  const laneHits = (lane) => entries.filter((e) => e.src === lane).length; // honest per-lane count
  const out = {
    schemaVersion: 1, // bump only on breaking shape change (same contract as ask)
    task: query,
    engine: 'agent',
    plan: lanesRun.map((lane) => ({
      lane,
      why: LANE_WHY[lane],
      answered: sources.includes(lane),
      hits: laneHits(lane), // >0 = real rows; 0 = answered but empty ([~] in text)
    })),
    sources,
    errors,
    route,
    count: pool.length,
    stored: 0, // zero storage — coordination results are printed, never persisted
    hits: pool,
  };
  const ok = sources.length > 0 || errors.length === 0;
  if (json) return { ok, text: JSON.stringify(out, null, 2), json: out };

  const lines = [
    `aio agent — "${query}" (coordinating: ${sources.length ? sources.join('+') : 'no lane answered'} · ${pool.length} results · ${ms}s)`,
    '',
    `plan  ${lanesRun.join(' ∥ ')} — parallel, printed never stored`,
    `  ${out.plan
      .map((p) => {
        if (!p.answered) return `[ ] ${p.lane}`;
        // [~] = lane answered but brought 0 rows — the box stays unticked so the
        // plan never claims evidence it does not have.
        return p.hits ? `[x] ${p.lane}` : `[~] ${p.lane} 0 hits — answered empty`;
      })
      .join('  ')}`,
  ];
  if (errors.length) {
    lines.push('issues:');
    lines.push(...sourceErrorNote(errors));
  }
  lines.push('');
  if (route.length) {
    lines.push('route (coordinated — cheapest first)');
    route.forEach((r, i) => {
      lines.push(`  ${i + 1}. [${r.step}] ${r.use}`);
      lines.push(`     ${r.why}`);
    });
  } else {
    lines.push('route — no lane matched this task; refine the keywords and rerun.');
  }
  if (pool.length) {
    lines.push('');
    lines.push('lanes (top hits per source)');
    for (const src of [...new Set(pool.map((h) => h.src))]) {
      const top = pool.filter((h) => h.src === src).slice(0, 3);
      lines.push(`  <${src}>`);
      top.forEach((h, i) => {
        lines.push(`    ${i + 1}. ${h.name} [${h.type}] — ${h.func}`);
        if (h.url) lines.push(`       ${h.url}`);
      });
    }
  }
  lines.push('');
  lines.push('note: every lane is live and unvetted — verify before running npx/cargo');
  lines.push('      or cloning; report WHAT you used + EVERY link (docs/THREATS.md).');
  return { ok, text: lines.join('\n'), json: out };
}
