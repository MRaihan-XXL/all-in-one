// coverage-search.test.js — src/search.js gaps: sourceErrorNote's four failure
// kinds in TEXT mode, the two zero-hit text endings, and the source-ranked
// fallback. Network is fully mocked; any unexpected call throws.
process.env.AIO_NO_GH = '1'; // no `gh auth token` subprocess in tests
process.env.AIO_RATE = '0'; // ghThrottle: no spacing sleep

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { runAsk } = await import('../src/search.js');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/* ---------------- runAsk text endings (src/search.js:215–244) ---------------- */

test('runAsk: sources answer with zero hits + per-source failures → notes for each failure kind + web hint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('api.github.com')) return json({ items: [] }); // answered, nothing matched
    if (url.includes('registry.npmjs.org')) throw new Error('fetch failed: ECONNREFUSED');
    if (url.includes('crates.io')) throw new Error('The operation was aborted due to timeout');
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const query = 'rust csv parser https://example.com/doc';
  const r = await runAsk({ query, json: false });

  assert.equal(r.ok, true, 'a source answered → machine consumers see success');
  assert.equal(r.json.hits.length, 0, 'zero hits to render');
  assert.match(r.text, /live: github/, 'the answering source is named');
  assert.match(r.text, /npm: unreachable \(network\)/, 'network failure kind');
  assert.match(r.text, /crates: timeout \(4s\/source budget\)/, 'timeout kind');
  assert.match(r.text, /No result from live sources\./, 'zero-hit ending');
  assert.match(r.text, /\(URL detected in the prompt\)/, 'web hint appended for a URL query');
  assert.match(r.text, /aio ask — "rust csv parser https:\/\/example\.com\/doc" \(live: github · \d+\.\ds\)/, 'header with timing');
});

test('runAsk: every source down in text mode → rate-limit/network/raw notes + "Live sources failed" ending', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('api.github.com')) return new Response('forbidden', { status: 403 });
    if (url.includes('registry.npmjs.org')) throw new Error('registry returned garbage (unexpected shape)');
    if (url.includes('crates.io')) return new Response('nope', { status: 404 });
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await runAsk({ query: 'csv rust toolkit', json: false });

  assert.equal(r.ok, false, 'nothing answered and something failed');
  assert.match(r.text, /live: no source answered/, 'engine degrades honestly');
  assert.match(r.text, /github: rate-limited — set GH_TOKEN/, '403 → rate-limit guidance');
  assert.match(r.text, /npm: registry returned garbage \(unexpected shape\)/, 'unclassified messages pass through raw (truncated)');
  assert.match(r.text, /Live sources failed — fix the issue above, then retry\./, 'all-failed ending');
  assert.equal(r.json.errors.length, 3, 'all three failures recorded');
});

test('runAsk: zero BM25 overlap → source-ranked fallback keeps hits and tags the why', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('api.github.com')) {
      return json({
        items: [
          {
            full_name: 'acme/flux',
            html_url: 'https://github.com/acme/flux',
            description: 'quantum flux capacitor',
            stargazers_count: 7,
            language: 'Rust',
          },
        ],
      });
    }
    if (url.includes('registry.npmjs.org')) return json({ objects: [] });
    if (url.includes('crates.io')) return json({ crates: [] });
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await runAsk({ query: 'zzzz qqqq', json: false });

  assert.equal(r.ok, true);
  assert.ok(r.json.hits.length >= 1, 'entries surface even without keyword overlap');
  assert.match(r.text, /why: source-ranked by github/, 'fallback why tag');
});
