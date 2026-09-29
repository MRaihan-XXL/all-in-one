#!/usr/bin/env node
/* R6+ — regen `repos` table: fine-grained categories (src/catalog.js) + install
 * metadata (scripts/install-tools.mjs log). gh enrichment kept from previous run.
 * Usage: node scripts/build-db.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReposTable, categorize, groupOf, GROUPS, LABELS } from '../src/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'ai-tools.db');
const MANIFEST = path.join(ROOT, 'aio-context.md');
const PLAN = path.join(os.tmpdir(), 'aio-install-plan.json');
const LOG = path.join(os.homedir(), '.aio', 'install-log.jsonl');
const TODAY = new Date().toISOString().slice(0, 10);

const repos = parseReposTable(readFileSync(MANIFEST, 'utf8'));
if (repos.length === 0) { console.error('no REPOS rows parsed'); process.exit(1); }

/* install plan: name → kind/cmd (all scanned repos) */
const plan = existsSync(PLAN) ? JSON.parse(readFileSync(PLAN, 'utf8')) : { repos: [] };
const planMap = new Map(plan.repos.map((r) => [r.name, r]));

/* install log: last entry per name wins (retry chain) */
const logMap = new Map();
if (existsSync(LOG)) for (const line of readFileSync(LOG, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { const e = JSON.parse(line); logMap.set(e.name, e); } catch {}
}

const SKIP_DEFAULT = {
  'npm-lib': 'not a tool (library)',
  'python-lib': 'not a tool (library)',
  selfhosted: 'self-hosted app',
  rust: 'needs cargo (or prebuilt)',
  unknown: 'no install manifest',
};

const db = new DatabaseSync(DB);
const cols = db.prepare('PRAGMA table_info(repos)').all().map((c) => c.name);
for (const c of ['category_group', 'install_type', 'install_cmd', 'install_status']) {
  if (!cols.includes(c)) db.exec(`ALTER TABLE repos ADD COLUMN ${c} TEXT`);
}

const existing = new Map(db.prepare('SELECT * FROM repos').all().map((r) => [r.folder, r]));
const up = db.prepare(`
  INSERT INTO repos (folder, url, category, description, homepage, language, stars, screenshot, status, installed)
  VALUES (@folder, @url, @category, @description, @homepage, @language, @stars, @screenshot, @status, @installed)
  ON CONFLICT(folder) DO UPDATE SET
    url = @url,
    description = CASE WHEN repos.description IS NOT NULL AND repos.description <> '' THEN repos.description ELSE @description END,
    homepage = @homepage, language = @language, stars = @stars,
    category = @category, category_group = @category_group,
    install_type = @install_type, install_cmd = @install_cmd, install_status = @install_status`);
const metaStmt = db.prepare('INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const updMeta = (k, v) => metaStmt.run(k, v);

let installed = 0, failed = 0;
const fineDist = {}, groupDist = {}, statusDist = {};
db.exec('BEGIN');
for (const r of repos) {
  const old = existing.get(r.folder);
  const fine = old?.category === 'CLI Aktif' ? 'CLI Aktif' : categorize(r.folder, old?.description ?? '', []);
  const group = old?.category === 'CLI Aktif' ? 'CLI Aktif' : groupOf(fine);
  const lg = logMap.get(r.folder);
  const pl = planMap.get(r.folder);
  const type = lg?.kind ?? pl?.kind ?? null;
  const stat = lg?.status ?? (pl?.cmd ? null : SKIP_DEFAULT[pl?.kind] ? `skip: ${SKIP_DEFAULT[pl.kind]}` : null);
  const cmd = lg?.cmd ?? pl?.cmd ?? '';
  if (lg?.status === 'installed') installed++;
  if (lg?.status === 'failed') failed++;

  up.run({
    folder: r.folder, url: r.url,
    category: fine, category_group: group,
    description: old?.description ?? '', homepage: old?.homepage ?? '', language: old?.language ?? '',
    stars: old?.stars ?? 0, screenshot: old?.screenshot ?? '',
    status: old?.status ?? 'cloned (install on-demand)',
    installed: old?.installed ?? TODAY,
    install_type: type, install_cmd: cmd, install_status: stat,
  });
  fineDist[fine] = (fineDist[fine] || 0) + 1;
  groupDist[group] = (groupDist[group] || 0) + 1;
  const sKey = (stat ?? 'unknown').replace(/:.*$/, '').trim();
  statusDist[sKey] = (statusDist[sKey] || 0) + 1;
}
updMeta('generated', TODAY);
updMeta('repos_count', String(repos.length));
updMeta('tools_installed', String(installed));
updMeta('fine_labels', String(Object.keys(fineDist).length));
updMeta('sources', 'aio-context.md (REPOS), GitHub API (deskripsi/stars), install plan + install-log.jsonl (kind/status), baris curated dipertahankan');
db.exec('COMMIT');

const total = db.prepare('SELECT COUNT(*) c FROM repos').get().c;
console.log(`repos = ${total}/${repos.length} · installed=${installed} failed=${failed}`);
console.log(`\n-- category_group --`);
for (const [k, v] of Object.entries(groupDist).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\n-- fine labels (${Object.keys(fineDist).length}/${LABELS.length}) --`);
for (const [k, v] of Object.entries(fineDist).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\n-- install status --`);
for (const [k, v] of Object.entries(statusDist).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
if (total !== repos.length) { console.error('FAIL: count mismatch'); process.exit(1); }
console.log('OK');
