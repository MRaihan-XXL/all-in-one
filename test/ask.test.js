// ask.test.js — `aio ask` search engine (fixture db, no network, no Ollama).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

process.env.AIO_NO_AI = '1'; // deterministic: BM25 only
const { bm25Search, runAsk } = await import('../src/search.js');

// ---- fixture catalog ----
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-ask-home-'));
const dbPath = path.join(home, 'ai-tools.db');
const db = new DatabaseSync(dbPath);
db.exec(`CREATE TABLE repos (folder TEXT PRIMARY KEY, url TEXT, category TEXT, description TEXT,
  homepage TEXT, language TEXT, stars INTEGER, screenshot TEXT, status TEXT, installed TEXT)`);
db.exec(`CREATE TABLE tools (id INTEGER PRIMARY KEY, name TEXT, category TEXT, access TEXT,
  version TEXT, url TEXT, description TEXT, screenshot TEXT, status TEXT, installed TEXT)`);
db.exec(`CREATE TABLE sites (name TEXT PRIMARY KEY, url TEXT, category TEXT, why TEXT, used_by TEXT)`);
db.prepare('INSERT INTO repos (folder,url,category,description,language,stars) VALUES (?,?,?,?,?,?)')
  .run('zeta-etl', 'https://github.com/demo/zeta-etl', 'Data / ETL', 'ETL csv ke chart interaktif', 'Python', 999);
db.prepare('INSERT INTO tools (name,category,access,url,description) VALUES (?,?,?,?,?)')
  .run('csvkit', 'Data / CLI', 'csvsql', '', 'CLI untuk manipulasi & query CSV');
db.prepare('INSERT INTO sites (name,url,category,why,used_by) VALUES (?,?,?,?,?)')
  .run('ChartGo', 'https://chartgo.com', 'Chart / Web', 'Bikin chart cepat tanpa login', 'analyst');
db.close();

test('bm25Search: ranks the matching entry first with score + why', () => {
  const entries = [
    { type: 'repo', name: 'zeta-etl', url: 'u', func: 'ETL csv ke chart interaktif', meta: 'Python' },
    { type: 'tool', name: 'csvkit', url: '', func: 'CLI untuk manipulasi CSV', meta: 'CLI' },
    { type: 'site', name: 'ChartGo', url: 'u', func: 'Bikin chart cepat', meta: 'analyst' },
  ];
  const hits = bm25Search('etl csv chart', entries);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].name, 'zeta-etl');
  assert.ok(hits[0].score > 0);
  assert.match(hits[0].why, /BM25/);
  assert.equal(bm25Search('qqqzzz', entries).length, 0, 'no token overlap → no hits');
});

test('runAsk: catalog hits always carry url + function (item 3)', async () => {
  const r = await runAsk({ query: 'zeta etl csv', json: false, dataDir: home, reposDir: null });
  assert.equal(r.ok, true);
  assert.match(r.text, /aio ask/);
  assert.match(r.text, /zeta-etl \[repo\]/);
  assert.match(r.text, /https:\/\/github\.com\/demo\/zeta-etl/, 'link printed');
  assert.match(r.text, /why:/, 'function/reason printed');
  assert.equal(r.json.hits[0].type, 'repo');
  assert.ok(r.json.hits[0].func.length > 0, 'func non-empty');
});

test('runAsk: sites and tools are searchable too', async () => {
  const site = await runAsk({ query: 'ChartGo chart cepat', json: false, dataDir: home, reposDir: null });
  assert.equal(site.json.hits[0].type, 'site');
  assert.equal(site.json.hits[0].url, 'https://chartgo.com');

  const tool = await runAsk({ query: 'csvkit query CSV', json: false, dataDir: home, reposDir: null });
  assert.equal(tool.json.hits[0].type, 'tool');
});

test('runAsk: --json emits machine-readable payload; empty query → usage + exit 1', async () => {
  const j = await runAsk({ query: 'etl csv', json: true, dataDir: home, reposDir: null });
  const parsed = JSON.parse(j.text);
  assert.equal(parsed.query, 'etl csv');
  assert.ok(Array.isArray(parsed.hits) && parsed.hits.length >= 1);
  assert.ok(parsed.hits[0].url !== undefined && parsed.hits[0].func !== undefined);

  const bad = await runAsk({ query: '', json: false, dataDir: home, reposDir: null });
  assert.equal(bad.ok, false);
  assert.match(bad.text, /usage: aio ask/);
});

test('runAsk: empty/missing catalog → friendly failure', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-ask-empty-'));
  const r = await runAsk({ query: 'anything', json: false, dataDir: empty, reposDir: null });
  assert.equal(r.ok, false);
  assert.match(r.text, /catalog empty/);
});
