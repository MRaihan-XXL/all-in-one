// live.test.js — src/live.js: detectIntent routing unit + liveSearch integration (fetch mocked).
process.env.AIO_NO_GH = '1'; // ghSkills skips execFile — no shell in tests
process.env.AIO_NO_AI = '1';
// ghRepos/ghSkills call ghThrottle(): without this the default 8/min budget waits
// ~7.5s per call against a stale gh-rate.json — that alone made the suite ~22s.
process.env.AIO_RATE = '0';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ghThrottle's clock file lives in STATE_DIR — isolate it (read at import time by
// paths.js, so it must precede the src import) so tests never touch ~/.aio.
process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-live-state-'));

const { detectIntent, liveSearch, ghSkills, ghThrottle } = await import('../src/live.js');
const { STATE_DIR } = await import('../src/paths.js');

const RATE_FILE = path.join(STATE_DIR, 'gh-rate.json');

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function mockLive(t) {
  return t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('registry.npmjs.org')) {
      return json({
        objects: [{ package: { name: 'zeta-etl', version: '1.0.0', description: 'ETL for csv', keywords: ['etl'] } }],
      });
    }
    if (url.includes('api.github.com/search/repositories')) {
      return json({
        items: [
          {
            full_name: 'acme/zeta-etl',
            html_url: 'https://github.com/acme/zeta-etl',
            description: 'csv ETL',
            stargazers_count: 42,
            language: 'Go',
          },
        ],
      });
    }
    if (url.includes('crates.io')) return json({ crates: [] });
    throw new Error(`unexpected network call in test: ${url}`);
  });
}

test('detectIntent: plain query → repos+npm on, crates/skills off, no web hint', () => {
  const it = detectIntent('csv chart interaktif');
  assert.equal(it.repos, 'csv chart interaktif');
  assert.equal(it.npm, 'csv chart interaktif');
  assert.equal(it.crates, null, 'crates skipped for non-rust ask');
  assert.equal(it.skills, null, 'skills skipped for non-skill ask');
  assert.equal(it.web, false);
});

test('detectIntent: rust/crate keywords → crates routed', () => {
  const it = detectIntent('rust csv crate');
  assert.equal(it.crates, 'rust csv crate');
  assert.equal(it.skills, null);
  assert.ok(it.repos && it.npm, 'always-on sources still routed');

  for (const q of ['serde with cargo', 'parser di crates.io']) {
    assert.ok(detectIntent(q).crates, `crates on for "${q}"`);
  }
});

test('detectIntent: skill-ish query → skills routed', () => {
  const it = detectIntent('awesome cursor skill');
  assert.equal(it.skills, 'awesome cursor skill');
  assert.equal(it.crates, null);

  for (const q of ['claude agent prompts', 'opencode skills list']) {
    assert.ok(detectIntent(q).skills, `skills on for "${q}"`);
  }
});

test('detectIntent: URL in query → web hint, URL stripped from source queries', () => {
  const it = detectIntent('see https://example.com/x docs');
  assert.equal(it.web, true);
  assert.ok(!/https?:\/\//.test(it.repos), 'repos query has no URL');
  assert.ok(!/https?:\/\//.test(it.npm), 'npm query has no URL');
  assert.equal(detectIntent('no url here').web, false);
});

test('liveSearch: parallel sources tag entries and label answering sources', async (t) => {
  const net = mockLive(t);
  const r = await liveSearch('zeta etl csv');
  assert.equal(r.offline, false);
  assert.equal(r.web, false);
  assert.deepEqual(r.sources, ['github', 'npm'], 'labels = sources that answered');
  assert.ok(r.entries.length >= 2, `entries from both sources (${r.entries.length})`);
  assert.ok(r.entries.some((e) => e.src === 'github'));
  assert.ok(r.entries.some((e) => e.src === 'npm'));
  for (const e of r.entries) {
    assert.ok(['repo', 'tool', 'skill'].includes(e.type), `${e.name} type`);
    assert.ok(['github', 'npm', 'crates'].includes(e.src), `${e.name} src`);
    assert.ok(e.name && e.url && e.func, `${e.name} name/url/func`);
  }
  assert.equal(net.mock.callCount(), 2, 'github + npm probed exactly once each');
});

test('liveSearch: AIO_OFFLINE=1 → empty result and no network touched', async (t) => {
  process.env.AIO_OFFLINE = '1';
  t.after(() => {
    delete process.env.AIO_OFFLINE;
  });
  t.mock.method(globalThis, 'fetch', async (input) => {
    throw new Error(`offline mode must not fetch: ${input}`);
  });
  const r = await liveSearch('zeta etl csv');
  assert.deepEqual(r, { entries: [], sources: [], offline: true });
});

test('ghSkills: AIO_NO_GH=1 → resolves [] (lane disabled, no gh subprocess)', async () => {
  assert.equal(process.env.AIO_NO_GH, '1', 'file runs in shell-free mode');
  assert.deepEqual(await ghSkills('awesome cursor skill'), []);
});

test('liveSearch: AIO_NO_GH=1 → skills lane absent from sources and errors', async (t) => {
  const it = detectIntent('awesome cursor skills list');
  assert.ok(it.skills, 'intent routes skills → the skip is live.js\'s guard, not the router');
  const net = mockLive(t);

  const r = await liveSearch('awesome cursor skills list');

  assert.ok(!r.sources.includes('skills'), `skills lane never scheduled: ${r.sources}`);
  assert.ok(!r.errors.some((e) => e.src === 'skills'), 'no skills entry in errors either');
  assert.deepEqual(r.sources, ['github', 'npm'], 'only the fetch-based lanes answer');
  assert.equal(net.mock.callCount(), 2, 'github + npm probed once each — no extra lane ran');
});

test('ghSkills: gh api failure REJECTS (errors[] path, never a fake empty answer)', async (t) => {
  const prevGh = process.env.AIO_NO_GH;
  const prevPath = process.env.PATH;
  delete process.env.AIO_NO_GH; // engage the real `gh api` lane
  process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-no-gh-')); // gh unresolvable → spawn fails
  t.after(() => {
    if (prevGh === undefined) delete process.env.AIO_NO_GH;
    else process.env.AIO_NO_GH = prevGh;
    process.env.PATH = prevPath;
  });

  await assert.rejects(ghSkills('awesome cursor skill'), /ENOENT/, 'gh failure must reject, not return []');
});

test('ghThrottle: AIO_RATE=300 spaces calls (~200ms) + rewrites the clock; AIO_RATE=0 disables both', async (t) => {
  const prevRate = process.env.AIO_RATE;
  t.after(() => {
    if (prevRate === undefined) delete process.env.AIO_RATE;
    else process.env.AIO_RATE = prevRate;
    fs.rmSync(RATE_FILE, { force: true });
  });

  // AIO_RATE=300 → gap = 60000/300 = 200ms (the file default is 8/min = 7.5s);
  // a clock stamped "just now" forces the full wait before the call may proceed.
  process.env.AIO_RATE = '300';
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(RATE_FILE, JSON.stringify({ last: Date.now() }));
  const t0 = Date.now();
  await ghThrottle();
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 150, `expected ~200ms spacing, waited ${elapsed}ms`);
  const clock = JSON.parse(fs.readFileSync(RATE_FILE, 'utf8'));
  assert.ok(clock.last >= t0, `clock file rewritten with a fresh stamp (${clock.last} >= ${t0})`);

  // AIO_RATE=0 → no spacing at all: returns immediately and writes nothing.
  process.env.AIO_RATE = '0';
  fs.rmSync(RATE_FILE, { force: true });
  const t1 = Date.now();
  await ghThrottle();
  assert.ok(Date.now() - t1 < 50, `no wait under AIO_RATE=0 (${Date.now() - t1}ms)`);
  assert.equal(fs.existsSync(RATE_FILE), false, 'no clock file written under AIO_RATE=0');
});
