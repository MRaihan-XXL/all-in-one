// relevance.test.js — BM25 trust blending (FR12) + the verify-before-run note.
// ALL network is mocked: zero real fetch.
process.env.AIO_NO_GH = '1'; // ghSkills skips execFile — no shell in tests
process.env.AIO_NO_AI = '1'; // deterministic: BM25/trust order, no Ollama
process.env.AIO_RATE = '0'; // ghRepos → ghThrottle: no spacing sleep in tests (7.5s/call otherwise)

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { bm25Search, runAsk } = await import('../src/search.js');

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

/** Answer npm + GitHub search; anything else fails loudly (no silent network). */
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

test('bm25Search: trust blend — equal relevance, higher trust01 wins', () => {
  const entries = [
    { type: 'tool', name: 'chartium', url: '', func: 'chart library for data viz', meta: 'JS', trust01: 0.9 },
    { type: 'tool', name: 'chartlite', url: '', func: 'chart library for data viz', meta: 'JS', trust01: 0.1 },
  ];
  const hits = bm25Search('chart library', entries);
  assert.equal(hits.length, 2, 'both entries pass the keyword gate');
  assert.equal(hits[0].name, 'chartium', 'identical BM25 → higher trust01 orders the tie');
  assert.ok(hits[0].score > hits[1].score, `blended scores: ${hits[0].score} > ${hits[1].score}`);
  assert.match(hits[0].why, /\+ trust (high|mid|low)/);
  assert.match(hits[0].why, /trust high/, 'trust01 0.9 → high tier');
});

test('bm25Search: keyword gate holds — high trust without overlap is excluded', () => {
  const entries = [
    { type: 'repo', name: 'zeta-etl', url: 'u', func: 'ETL pipeline', meta: 'Go', trust01: 1.0 },
    { type: 'tool', name: 'chartkit', url: '', func: 'chart library', meta: 'JS', trust01: 0 },
  ];
  const hits = bm25Search('chart', entries);
  assert.ok(hits.length >= 1, 'the matching entry is surfaced');
  assert.equal(hits[0].name, 'chartkit', 'zero-trust match still outranks a gated non-match');
  assert.ok(!hits.some((h) => h.name === 'zeta-etl'), 'trust 1.0 without token overlap stays excluded');
});

test('bm25Search: no trust01 anywhere → legacy pure-BM25 why (no "+ trust")', () => {
  const entries = [
    { type: 'site', name: 'ChartGo', url: 'u', func: 'Bikin chart cepat', meta: 'analyst' },
    { type: 'tool', name: 'csvkit', url: '', func: 'CLI untuk manipulasi CSV', meta: 'CLI' },
  ];
  const hits = bm25Search('chart', entries);
  assert.equal(hits.length, 1, 'only the chart entry overlaps');
  assert.equal(hits[0].name, 'ChartGo');
  assert.match(hits[0].why, /BM25 keyword match \(#1\)/);
  assert.doesNotMatch(hits[0].why, /\+ trust/, 'no blend when no entry carries trust01');
});

test('bm25Search: typosquat/irrelevant demotion', () => {
  const entries = [
    {
      type: 'tool',
      name: 'awesome-phonenumber',
      url: '',
      func: 'awesome phone number parser',
      meta: '',
      trust01: 0.05,
    },
    {
      type: 'repo',
      name: 'vizzu-lib',
      url: '',
      func: 'Library for animated data visualizations and charts',
      meta: '',
      trust01: 0.9,
    },
    { type: 'tool', name: 'lightweight-charts', url: '', func: 'Performant financial charts', meta: '', trust01: 0.8 },
  ];
  const hits = bm25Search('awesome animated chart library', entries);
  assert.ok(hits.length >= 2, `gated matches surfaced (${hits.length})`);
  assert.notEqual(hits[0].name, 'awesome-phonenumber', 'low-trust partial match demoted');
  assert.match(hits[0].name, /chart|vizzu/i, 'top hit is a genuine chart library');
  const idx = hits.findIndex((h) => h.name === 'awesome-phonenumber');
  if (idx !== -1) {
    assert.ok(idx > 0, 'awesome-phonenumber ranks below the top hit');
  }
});

test('runAsk: prints the verify-before-run note', async (t) => {
  mockLive(t);
  const r = await runAsk({ query: 'zeta etl csv', json: false });
  assert.equal(r.ok, true);
  assert.match(r.text, /note: ranked by keyword match \+ source popularity — public results are unvetted/);
  assert.match(r.text, /verify before running npx\/uvx/);
  const noteAt = r.text.indexOf('note: ranked by');
  const firstHitAt = r.text.search(/^\d+\. /m);
  assert.ok(noteAt !== -1, 'note present');
  assert.ok(firstHitAt !== -1, 'numbered result present');
  assert.ok(noteAt < firstHitAt, 'note comes BEFORE the first numbered result');
});
