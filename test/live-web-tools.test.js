// live-web-tools.test.js — src/live.js agent-only lanes (v1.7.0): webSearch
// (Wikipedia opensearch ∥ HN Algolia, allSettled half-failure contract) and
// localTools (curated map + token-boundary match + KEYSTOP + PATH gate), plus
// liveSearch's {all:true} scheduling of the web/tools lanes.
// Network fully mocked; the PATH is swapped per test so every detectBinary probe
// is deterministic (and never sees the real machine's tools).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-web-tools-state-')); // must precede the src import
process.env.AIO_NO_GH = '1'; // no gh subprocess
process.env.AIO_NO_AI = '1';
process.env.AIO_RATE = '0'; // no throttle sleep

const { webSearch, localTools, liveSearch, ghRepos } = await import('../src/live.js');

const ORIG_PATH = process.env.PATH;

/** PATH → a fresh dir holding exactly `files` (each an extensionless stub). */
function setPath(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-tools-bin-'));
  for (const f of files) fs.writeFileSync(path.join(dir, f), '');
  process.env.PATH = dir;
  t.after(() => {
    process.env.PATH = ORIG_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const WIKI = ['chart tool', ['Chart', 'Bar chart'], ['chart type', ''], ['https://en.wikipedia.org/wiki/Chart', '']];
const HN = {
  hits: [
    { title: 'Show HN: Chart tooling', url: 'https://example.com/c', objectID: '1', points: 90, author: 'ada' },
    { title: 'No url story', objectID: '2', points: 3, author: 'lin' }, // url fallback
    { objectID: '3' }, // no title → filtered
  ],
};

/* ---------------- webSearch ---------------- */

test('ghRepos: GH_TOKEN from the environment wins (Bearer header, no gh subprocess)', async (t) => {
  process.env.GH_TOKEN = 'ghp_test_token';
  t.after(() => {
    delete process.env.GH_TOKEN;
  });
  const seen = {};
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const h = new Headers(init?.headers);
    seen.auth = h.get('authorization');
    seen.ua = h.get('user-agent');
    return json({ items: [{ full_name: 'a/b', html_url: 'https://github.com/a/b', description: 'desc', stargazers_count: 42, language: 'JS' }] });
  });

  const hits = await ghRepos('some query', 1);

  assert.equal(seen.auth, 'Bearer ghp_test_token', 'token used verbatim');
  assert.equal(hits.length, 1, 'lane answered from the env token path');
  assert.equal(hits[0].src, 'github');
  assert.equal(hits[0].name, 'a/b');
});

test('webSearch: both halves answer → wiki + HN rows tagged src=web, one probe per host', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.includes('en.wikipedia.org')) return json(WIKI);
    if (url.includes('hn.algolia.com')) return json(HN);
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const rows = await webSearch('chart tool', 3);

  assert.deepEqual(calls.map((u) => (u.includes('wikipedia') ? 'wiki' : 'hn')), ['wiki', 'hn'], 'both halves probed');
  assert.ok(calls[0].includes('action=opensearch') && calls[0].includes('limit=3'), 'wikipedia opensearch query');
  assert.ok(calls[1].includes('tags=story') && calls[1].includes('hitsPerPage=3'), 'HN restricted to stories');
  for (const r of rows) {
    assert.equal(r.src, 'web', `${r.name} src`);
    assert.equal(r.type, 'site', `${r.name} type`);
    assert.ok(r.name && r.func && r.url && r.meta, `${r.name} full row`);
  }
  const names = rows.map((r) => r.name);
  assert.deepEqual(names, ['Chart', 'Bar chart', 'Show HN: Chart tooling', 'No url story'], 'untitled HN row filtered');
  assert.equal(rows[0].url, 'https://en.wikipedia.org/wiki/Chart', 'explicit wiki url kept');
  assert.equal(rows[1].func, 'Wikipedia article', 'missing description → fallback copy');
  assert.equal(rows[2].url, 'https://example.com/c', 'HN url kept');
  assert.equal(rows[3].url, 'https://news.ycombinator.com/item?id=2', 'HN url fallback by objectID');
  assert.match(rows[2].func, /90 points by ada/, 'HN discussion copy');
});

test('webSearch: HN payload is not a hit array → that half fails, wikipedia still answers', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('en.wikipedia.org')) return json(WIKI);
    if (url.includes('hn.algolia.com')) return json({ error: 'rate limited', hits: { nope: true } });
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const rows = await webSearch('chart tool', 3);

  assert.equal(rows.length, 2, 'the healthy half still answers');
  assert.ok(rows.every((r) => r.meta === 'wikipedia'), 'wiki-only result');
});

test('webSearch: wikipedia answers a bad-shape body / HN is down → wiki rows survive', async (t) => {
  let scenario = 'wiki-not-array';
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('en.wikipedia.org')) {
      // {error:...} object instead of the opensearch tuple → must fail, never "0 hits"
      return scenario === 'wiki-not-array' ? json({ error: { code: 'ratelimited' } }) : new Response('down', { status: 500 });
    }
    if (url.includes('hn.algolia.com')) return scenario === 'wiki-not-array' ? new Response('down', { status: 500 }) : json(HN);
    throw new Error(`unexpected network call in test: ${url}`);
  });

  // wiki object body + HN 500 → BOTH halves failed → the first error throws
  await assert.rejects(webSearch('chart tool', 3), /wikipedia: ratelimited/, 'both halves dead → real error, not 0 hits');

  // wiki HTTP 500 + HN healthy → HN rows only
  scenario = 'wiki-http';
  const rows = await webSearch('chart tool', 3);
  assert.equal(rows.length, 2, 'one healthy half still answers');
  assert.ok(rows.every((r) => r.meta === 'hacker news'), 'HN-only result');
});

/* ---------------- localTools ---------------- */

test('localTools: on-PATH tool matched by key → row; same query without the binary → no row', (t) => {
  setPath(t, ['jq', 'ffmpeg']);

  const hit = localTools('parse json payload');
  assert.equal(hit.length, 1, `single curated hit: ${JSON.stringify(hit)}`);
  assert.equal(hit[0].name, 'jq');
  assert.equal(hit[0].src, 'tools');
  assert.equal(hit[0].type, 'tool');
  assert.equal(hit[0].meta, 'local · on PATH');
  assert.equal(hit[0].trust01, 0.9);
  assert.match(hit[0].func, /on PATH: .*jq$/, `path rendered: ${hit[0].func}`);
  assert.equal(hit[0].url, 'https://jqlang.github.io/jq/');

  // name match also gated by PATH presence
  assert.equal(localTools('video transcode audio').length, 1, 'ffmpeg present → one row');

  // PATH gate: nothing installed → no phantom suggestions
  setPath(t, []);
  assert.deepEqual(localTools('parse json payload'), [], 'absent binary → no row');
  assert.deepEqual(localTools('video transcode audio'), [], 'absent binary → no row');
});

test('localTools: token boundaries — "github api" never returns git (but does return gh)', (t) => {
  setPath(t, ['git', 'gh']);

  const rows = localTools('github api');
  assert.deepEqual(rows.map((r) => r.name), ['gh'], 'gh matches the github key; bare "git" must not fire on "github"');

  assert.deepEqual(localTools('set up git').map((r) => r.name), ['git'], 'positive control: git matches as its own token');
  assert.deepEqual(localTools('golang project').map((r) => r.name), [], 'bare "go" must not fire on "golang" either');
});

test('localTools: KEYSTOP — "convert csv" never returns ffmpeg even when it is installed', (t) => {
  setPath(t, ['ffmpeg', 'pandoc', 'magick']);

  assert.deepEqual(localTools('convert csv'), [], 'generic "convert" must not summon a converter');
  // KEYSTOP only vetoes the generic word — a distinctive surviving word still fires
  assert.deepEqual(localTools('convert document').map((r) => r.name), ['pandoc'], 'pandoc still matches via "document"');

  // positive control — the guard is the only reason the row is missing
  assert.deepEqual(localTools('transcode video').map((r) => r.name), ['ffmpeg'], 'ffmpeg appears once a distinctive word matches');
});

test('localTools: empty query → []; hit list capped at n', (t) => {
  setPath(t, ['jq', 'rg', 'fd']);

  assert.deepEqual(localTools(''), []);
  assert.deepEqual(localTools('   '), []);
  assert.deepEqual(localTools(undefined), []);

  const rows = localTools('json ripgrep find files', 2);
  assert.deepEqual(rows.map((r) => r.name), ['jq', 'rg'], 'n=2 caps the list (fd matched but came third)');
  assert.deepEqual(localTools('json ripgrep find files').map((r) => r.name), ['jq', 'rg', 'fd'], 'default n=4 keeps all three');
});

/* ---------------- liveSearch {all:true} ---------------- */

test('liveSearch all:true → schedules the web lane, plus a tools lane only when a local tool matches', async (t) => {
  setPath(t, ['jq']);
  const net = t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('api.github.com')) return json({ items: [] });
    if (url.includes('registry.npmjs.org')) return json({ objects: [] });
    if (url.includes('en.wikipedia.org')) return json(WIKI);
    if (url.includes('hn.algolia.com')) return json(HN);
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const withTools = await liveSearch('json chart', { all: true });
  assert.equal(withTools.offline, false);
  assert.deepEqual(withTools.sources, ['github', 'npm', 'web', 'tools'], 'web lane scheduled; tools lane appended last');
  assert.ok(withTools.entries.some((e) => e.src === 'web'), 'web rows merged into entries');
  assert.ok(withTools.entries.some((e) => e.src === 'tools'), 'local tool rows merged into entries');
  assert.equal(net.mock.callCount(), 4, 'github + npm + wiki + hn probed (no crates/skills routed)');

  // same PATH, query that matches no curated tool → the tools lane is never scheduled
  const withoutTools = await liveSearch('zzz nothing here', { all: true });
  assert.deepEqual(withoutTools.sources, ['github', 'npm', 'web'], 'no tools label without a local hit');
  assert.ok(!withoutTools.sources.includes('tools'), 'tools lane absent from sources');
  assert.ok(!withoutTools.errors.some((e) => e.src === 'tools'), 'tools lane absent from errors');
  assert.equal(net.mock.callCount(), 8, 'a second full sweep — still zero real network');
});

test('liveSearch all:true → a dead web lane lands in errors[], sources keep the healthy ones', async (t) => {
  setPath(t, []);
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('api.github.com')) return json({ items: [] });
    if (url.includes('registry.npmjs.org')) return json({ objects: [] });
    if (url.includes('en.wikipedia.org') || url.includes('hn.algolia.com')) {
      throw new Error('fetch failed: ECONNREFUSED');
    }
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await liveSearch('json chart', { all: true });

  assert.deepEqual(r.sources, ['github', 'npm'], 'healthy lanes still answer');
  const webErr = r.errors.find((e) => e.src === 'web');
  assert.ok(webErr, `web lane reported an error: ${JSON.stringify(r.errors)}`);
  assert.match(webErr.msg, /ECONNREFUSED/, 'original message preserved');
  assert.equal(r.offline, false);
});
