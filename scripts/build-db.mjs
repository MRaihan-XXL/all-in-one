#!/usr/bin/env node
/* R6 — regen `repos` table of ai-tools.db from aio-context.md + gh api enrichment.
 * Preserve curated fields of existing rows (category/screenshot/status/installed/description).
 * Usage: node scripts/build-db.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'ai-tools.db');
const MANIFEST = path.join(ROOT, 'aio-context.md');
const BATCH = 40;
const TODAY = new Date().toISOString().slice(0, 10);

/* 1 — parse REPOS table from the manifest */
const md = readFileSync(MANIFEST, 'utf8');
const section = md.split(/^## REPOS \(\d+\)$/m)[1]?.split(/^## /m)[0] ?? '';
const repos = [];
for (const line of section.split('\n')) {
  const m = line.match(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|/);
  if (!m) continue;
  const [, folder, urlRaw, dirPath] = m;
  const url = /github\.com/i.test(urlRaw) ? urlRaw.trim() : '';
  const um = url.match(/github\.com\/([^/]+)\/([^/\s]+)/);
  repos.push({ folder: folder.trim(), url, owner: um?.[1] ?? '', repo: um?.[2] ?? '', dirPath });
}
if (repos.length === 0) { console.error('no REPOS rows parsed'); process.exit(1); }

/* 2 — categorize (existing taxonomy, skills → scraping → ui → agent → other) */
function categorize(name, desc = '', topics = []) {
  const s = `${name} ${desc} ${topics.join(' ')}`.toLowerCase();
  if (/\bskills?\b|skill-|\bprompts?\b|awesome-|tutorial|learning|course|curriculum|roadmap|cheatsheet|cheat-sheet|mindmap|handbook|educat|lesson|playbook/.test(s)) return 'Materi / Skills';
  if (/scrap|crawl|spider|playwright|puppeteer|selenium|browser.?autom|\bosint\b|searx|search.?engine|web.?scrap/.test(s)) return 'Web Scraping / Data';
  if (/\breact\b|next\.?js|tailwind|shadcn|radix|ui kit|component librar|frontend|gsap|framer|chart|dashboard|icons?/i.test(s) && !/\bagent\b/.test(s)) return 'Library React / UI';
  if (/agent|\bllm\b|\brag\b|\bmcp\b|autogen|crewai|\bcrew\b|dify|langflow|flowise|assistant|chatbot|reasoning|orchestr|multi-?agent|model context|openhands|prompt.?engine|gpt/.test(s)) return 'AI Agent / Framework';
  return 'Aplikasi / Lainnya';
}

/* 3 — enrich via gh api graphql (inline literals, batched) */
function enrich(batch) {
  const sel = batch.map((r, i) =>
    `r${i}:repository(owner:"${r.owner}",name:"${r.repo}"){description homepageUrl stargazers{totalCount} primaryLanguage{name} repositoryTopics(first:10){nodes{topic{name}}}}`
  ).join(' ');
  const q = `query{${sel}}`;
  const out = execFileSync('gh', ['api', 'graphql', '-f', `query=${q}`], { encoding: 'utf8', maxBuffer: 8 << 20 });
  const data = JSON.parse(out);
  const map = new Map();
  batch.forEach((r, i) => {
    const node = data?.data?.[`r${i}`];
    if (!node) return;
    map.set(r.folder, {
      description: node.description ?? '',
      homepage: node.homepageUrl ?? '',
      language: node.primaryLanguage?.name ?? '',
      stars: node.stargazers?.totalCount ?? 0,
      topics: (node.repositoryTopics?.nodes ?? []).map((t) => t.topic.name),
    });
  });
  return map;
}

const meta = new Map();
let ok = 0;
for (let i = 0; i < repos.length; i += BATCH) {
  const batch = repos.slice(i, i + BATCH).filter((r) => r.owner);
  if (!batch.length) continue;
  try {
    for (const [k, v] of enrich(batch)) { meta.set(k, v); ok++; }
    console.log(`gh: ${Math.min(i + BATCH, repos.length)}/${repos.length}`);
  } catch (e) {
    console.error(`gh batch ${i} failed: ${e.message}`);
  }
}

/* 4 — upsert (preserve curated existing fields) */
const db = new DatabaseSync(DB);
const existing = new Map(db.prepare('SELECT * FROM repos').all().map((r) => [r.folder, r]));
const up = db.prepare(`
  INSERT INTO repos (folder, url, category, description, homepage, language, stars, screenshot, status, installed)
  VALUES (@folder, @url, @category, @description, @homepage, @language, @stars, @screenshot, @status, @installed)
  ON CONFLICT(folder) DO UPDATE SET
    url = @url,
    description = CASE WHEN repos.description IS NOT NULL AND repos.description <> '' THEN repos.description ELSE @description END,
    homepage = @homepage,
    language = @language,
    stars = @stars,
    category = @category`);

let inserted = 0, updated = 0;
db.exec('BEGIN');
for (const r of repos) {
  const g = meta.get(r.folder) ?? {};
  const old = existing.get(r.folder);
  const row = {
    folder: r.folder,
    url: r.url,
    category: old?.category ?? categorize(r.folder, g.description ?? '', g.topics ?? []),
    description: g.description ?? old?.description ?? '',
    homepage: g.homepage ?? old?.homepage ?? '',
    language: g.language ?? old?.language ?? '',
    stars: g.stars ?? old?.stars ?? 0,
    screenshot: old?.screenshot ?? '',
    status: old?.status ?? 'cloned (install on-demand)',
    installed: old?.installed ?? TODAY,
  };
  up.run(row);
  old ? updated++ : inserted++;
}
const setMeta = db.prepare('INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
setMeta.run('generated', TODAY);
setMeta.run('repos_count', String(repos.length));
setMeta.run('github_api_ok', `${ok}/${repos.length}`);
setMeta.run('sources', 'aio-context.md (REPOS table), GitHub API (deskripsi/stars/language/topics), baris lama dipertahankan');
db.exec('COMMIT');

/* 5 — verify */
const total = db.prepare('SELECT COUNT(*) c FROM repos').get().c;
const cats = db.prepare('SELECT category, COUNT(*) c FROM repos GROUP BY category ORDER BY c DESC').all();
console.log(`\nrepos total = ${total} (manifest ${repos.length}) · new=${inserted} updated=${updated} · gh ok=${ok}/${repos.length}`);
for (const c of cats) console.log(`  ${String(c.c).padStart(3)}  ${c.category}`);
if (total !== repos.length) { console.error('FAIL: count mismatch'); process.exit(1); }
console.log('OK');
