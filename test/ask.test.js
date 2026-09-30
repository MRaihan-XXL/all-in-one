// ask.test.js — `aio ask` live router. ALL network is mocked: zero real fetch.
process.env.AIO_NO_GH = '1'; // ghSkills skips execFile — no shell in tests
process.env.AIO_NO_AI = '1'; // deterministic: BM25/source order, no Ollama

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

test('runAsk: live hits carry url + function + <src> tag, header says live:', async (t) => {
  const net = mockLive(t);
  const r = await runAsk({ query: 'zeta etl csv', json: false });
  assert.equal(r.ok, true);
  assert.match(r.text, /^aio ask — "zeta etl csv" \(live: /, 'header carries live: sources');
  assert.match(r.text, /live: github\+npm/, 'both answering sources named');
  assert.match(r.text, /\[repo\] <github> — csv ETL/);
  assert.match(r.text, /https:\/\/github\.com\/acme\/zeta-etl/, 'github url printed');
  assert.match(r.text, /\[tool\] <npm> — ETL for csv/);
  assert.match(r.text, /https:\/\/www\.npmjs\.com\/package\/zeta-etl/, 'npm url printed');
  assert.match(r.text, /why:/, 'reason printed');
  assert.ok(r.json.hits.length >= 2, `both sources surfaced (${r.json.hits.length})`);
  for (const h of r.json.hits) {
    assert.ok(h.url, `${h.name} url`);
    assert.ok(h.func && h.func.length > 0, `${h.name} func`);
    assert.ok(['github', 'npm', 'crates'].includes(h.src), `${h.name} src tag`);
    assert.ok(['repo', 'tool', 'skill'].includes(h.type), `${h.name} type`);
  }
  assert.equal(net.mock.callCount(), 2, 'github + npm probed exactly once each');
});

test('runAsk: --json → machine payload with stored=0, sources, count', async (t) => {
  mockLive(t);
  const j = await runAsk({ query: 'zeta etl csv', json: true });
  assert.equal(j.ok, true);
  const p = JSON.parse(j.text);
  assert.equal(p.query, 'zeta etl csv');
  assert.ok(p.engine.startsWith('live:'), p.engine);
  assert.deepEqual(p.sources, ['github', 'npm']);
  assert.equal(p.stored, 0, 'zero storage');
  assert.equal(typeof p.count, 'number');
  assert.equal(p.count, p.hits.length, 'count matches hits');
  assert.ok(Array.isArray(p.hits) && p.hits.length >= 1);
  assert.deepEqual(p, j.json, 'text and json payloads agree');
});

test('runAsk: AIO_OFFLINE=1 → ok=false + offline message, no network touched', async (t) => {
  process.env.AIO_OFFLINE = '1';
  t.after(() => {
    delete process.env.AIO_OFFLINE;
  });
  t.mock.method(globalThis, 'fetch', async (input) => {
    throw new Error(`offline mode must not fetch: ${input}`);
  });
  const r = await runAsk({ query: 'anything at all', json: false });
  assert.equal(r.ok, false);
  assert.equal(r.json, null);
  assert.match(r.text, /offline \(AIO_OFFLINE=1\)/);
});

test('runAsk: empty query → usage, ok=false', async () => {
  const blank = await runAsk({ query: '   ', json: false });
  assert.equal(blank.ok, false);
  assert.match(blank.text, /usage: aio ask/);
  assert.equal(blank.json, null);

  const missing = await runAsk({ json: false });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /usage: aio ask/);
});
