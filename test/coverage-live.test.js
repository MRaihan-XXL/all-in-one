// coverage-live.test.js — src/live.js gaps: ghToken's real spawn lanes, ghThrottle
// clock read/write failure paths, ghRepos 429/503 retry (incl. missing retry-after),
// cratesSearch mapping + error, and the skills lane landing in liveSearch errors[].
// AIO_NO_GH deliberately UNSET: gh must really spawn — PATH is emptied so `gh` is
// never found (ENOENT, no shell, no network). ghToken's module cache makes the
// throttle test the first ghToken caller by declaration order.
process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-live-cov-')); // before the src import
process.env.PATH = ''; // gh unreachable for every spawn in this process

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ghThrottle, ghRepos, cratesSearch, detectIntent, ghQuery, liveSearch } = await import('../src/live.js');
const { STATE_DIR } = await import('../src/paths.js');
const RATE_FILE = path.join(STATE_DIR, 'gh-rate.json');

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('ghThrottle: token probe fails (gh unreachable) without throwing; clock write failure swallowed', async (t) => {
  process.env.AIO_RATE = '300'; // gap = 200ms so the spacing wait stays cheap
  t.after(() => {
    delete process.env.AIO_RATE;
    fs.rmSync(STATE_DIR, { recursive: true, force: true });
    fs.mkdirSync(STATE_DIR, { recursive: true });
  });

  // first call: no clock file → read miss; ghToken really spawns → ENOENT → cached null;
  // then the clock is written.
  fs.rmSync(RATE_FILE, { force: true });
  const t0 = Date.now();
  await ghThrottle();
  assert.ok(fs.existsSync(RATE_FILE), 'clock written on a healthy state dir');
  assert.ok(Date.now() - t0 < 190, 'first call has no clock → no wait');

  // second call inside the same minute → spacing wait honoured (gap - since ≈ 200ms)
  const t1 = Date.now();
  await ghThrottle();
  const waited = Date.now() - t1;
  assert.ok(waited >= 100 && waited < 1000, `spacing wait happened (${waited}ms)`);

  // read-only-style failure: STATE_DIR exists as a FILE → mkdir/write throw → swallowed
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
  fs.writeFileSync(STATE_DIR, 'not a directory');
  await assert.doesNotReject(ghThrottle(), 'clock write failure never rejects');
  assert.ok(fs.statSync(STATE_DIR).isFile(), 'state dir untouched');
});

test('ghRepos: 429 honours retry-after → silent retry with mapped entries; 503 without header waits ~1s then surfaces', async (t) => {
  process.env.AIO_RATE = '0'; // ghThrottle disabled → no spacing between the retries
  t.after(() => delete process.env.AIO_RATE);
  let scenario = 'retry-429';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls.push(String(input));
    if (scenario === 'retry-429') {
      if (calls.length === 1) return new Response('slow down', { status: 429, headers: { 'retry-after': '0.001' } });
      return json({
        items: [
          {
            full_name: 'acme/json-tools',
            html_url: 'https://github.com/acme/json-tools',
            description: 'JSON parsing and serialization helpers for very large documents '.repeat(4),
            stargazers_count: 5000,
            language: 'Rust',
          },
        ],
      });
    }
    // 503 without retry-after → falls back to the 1s default wait, second probe fails hard
    if (calls.length === 1) return new Response('unavailable', { status: 503 });
    return new Response('still down', { status: 500 });
  });

  const rows = await ghRepos('rust json tools', 3);
  assert.equal(calls.length, 2, '429 retried exactly once');
  assert.equal(rows.length, 1, 'retry response mapped');
  const row = rows[0];
  assert.equal(row.type, 'repo');
  assert.equal(row.src, 'github');
  assert.equal(row.name, 'acme/json-tools');
  assert.equal(row.url, 'https://github.com/acme/json-tools');
  assert.match(row.meta, /^★5000/, 'star prefix in meta');
  assert.ok(row.func.length <= 120 && row.func.endsWith('…'), `description trimmed to 120: ${row.func.length}`);
  assert.ok(Math.abs(row.trust01 - Math.min(1, Math.log10(5001) / 5)) < 1e-9, 'trust prior from stars');

  calls.length = 0;
  scenario = 'retry-503';
  const t0 = Date.now();
  await assert.rejects(ghRepos('anything'), /github 500/, 'second failure surfaces after the retry');
  const waited = Date.now() - t0;
  assert.equal(calls.length, 2, '503 also retried once');
  assert.ok(waited >= 950, `missing retry-after → default 1000ms wait (${waited}ms)`);
});

test('cratesSearch: maps rows (trim, trust, meta fallbacks) and surfaces HTTP 500 as an error', async (t) => {
  let scenario = 'ok';
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (!url.includes('crates.io')) throw new Error(`unexpected network call in test: ${url}`);
    if (scenario === 'error') return new Response('boom', { status: 500 });
    return json({
      crates: [
        {
          id: 'serde-json',
          description: 'Serde support for JSON, with a flexible data model for large payloads. '.repeat(3),
          max_stable_version: '1.0.100',
          stars: 42,
          downloads: 5000000,
        },
        {
          id: 'tiny-crate',
          description: '',
          recent_downloads: 500000, // no max_stable_version, no stars, no downloads → fallbacks
        },
      ],
    });
  });

  const rows = await cratesSearch('serde json', 5);

  assert.equal(rows.length, 2);
  const [big, small] = rows;
  assert.equal(big.type, 'tool');
  assert.equal(big.src, 'crates');
  assert.equal(big.url, 'https://crates.io/crates/serde-json');
  assert.ok(big.func.length <= 120 && big.func.endsWith('…'), `long description trimmed (${big.func.length})`);
  assert.match(big.meta, /v1\.0\.100/, 'stable version in meta');
  assert.ok(big.meta.includes('5m'), 'real downloads shown — crates.io has no stars field (no fabricated ★0)');
  assert.ok(Math.abs(big.trust01 - Math.min(1, Math.log10(5000001) / 7)) < 1e-9, 'trust from downloads');

  assert.equal(small.url, 'https://crates.io/crates/tiny-crate');
  assert.equal(small.func, 'Rust crate (no description)', 'empty description → fallback copy');
  assert.match(small.meta, /^v\?/, 'missing version → ?');
  assert.ok(Math.abs(small.trust01 - Math.min(1, Math.log10(500001) / 7)) < 1e-9, 'recent_downloads fallback');

  scenario = 'error';
  await assert.rejects(cratesSearch('serde json'), /crates 500/, 'HTTP failure is an error, not an empty list');
});

test('liveSearch: skills lane really spawns gh (AIO_NO_GH unset) → ENOENT lands in errors[], never a fake answer', async (t) => {
  process.env.AIO_RATE = '0';
  t.after(() => delete process.env.AIO_RATE);
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('api.github.com')) return json({ items: [] });
    if (url.includes('registry.npmjs.org')) return json({ objects: [] });
    if (url.includes('crates.io')) return json({ crates: [] });
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await liveSearch('rust awesome cursor skill');

  assert.deepEqual(r.sources, ['github', 'npm', 'crates'], 'HTTP sources answered, crates routed by the rust keyword (skills did not)');
  assert.equal(r.offline, false);
  const skillErr = r.errors.find((e) => e.src === 'skills');
  assert.ok(skillErr, `skills lane reported an error: ${JSON.stringify(r.errors)}`);
  assert.match(skillErr.msg, /ENOENT/, 'gh missing → the lane fails loudly');
});

test('detectIntent/ghQuery edge lanes: URL-only query falls back to the raw string, punctuation query survives', () => {
  const it = detectIntent('https://only.example/x');
  assert.equal(it.web, true, 'URL hint set');
  assert.equal(it.repos, 'https://only.example/x', 'stripUrl empties the query → raw string kept');
  assert.equal(it.npm, 'https://only.example/x', 'same fallback feeds npm');

  const none = detectIntent();
  assert.equal(none.web, false, 'default arg');
  assert.equal(none.repos, '', 'empty query routes nothing');

  assert.equal(ghQuery('!!!'), '!!!', 'pure-punctuation query survives the stopword filter');
});
