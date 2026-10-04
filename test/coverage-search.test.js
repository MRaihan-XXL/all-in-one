// coverage-search.test.js — src/search.js gaps: aiRerank (the Ollama lane every
// other test disables via AIO_NO_AI=1), sourceErrorNote's four failure kinds in
// TEXT mode, the two zero-hit text endings, and the source-ranked fallback.
// Network is fully mocked; OLLAMA_HOST points at a fake host (never contacted).
process.env.AIO_NO_GH = '1'; // no `gh auth token` subprocess in tests
process.env.AIO_RATE = '0'; // ghThrottle: no spacing sleep
process.env.OLLAMA_HOST = 'http://aio-ollama.test:11434'; // must precede the src import

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { aiRerank, runAsk } = await import('../src/search.js');

const OLLAMA_MODEL = process.env.AIO_OLLAMA_MODEL || 'qwen3:4b';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const HIT = (name, src = 'github') => ({
  type: 'repo',
  name,
  url: `https://example.test/${name}`,
  func: `function of ${name}`,
  meta: 'meta',
  src,
  trust01: 0.5,
});

/* ---------------- aiRerank (src/search.js:88–135) ---------------- */

test('aiRerank: empty candidate list or AIO_NO_AI=1 → passthrough, fetch never called', async (t) => {
  const net = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('aiRerank must not hit the network on an early exit');
  });

  assert.deepEqual(await aiRerank('anything', []), { ai: false, hits: [] }, 'no candidates → no call');

  process.env.AIO_NO_AI = '1';
  t.after(() => {
    delete process.env.AIO_NO_AI;
  });
  const hits = [HIT('one')];
  const r = await aiRerank('anything', hits);
  assert.equal(r.ai, false, 'AI lane disabled by env');
  assert.equal(r.hits, hits, 'identical array passed through');
  assert.equal(net.mock.callCount(), 0, 'zero network calls');
});

test('aiRerank: Ollama JSON ranking → hits reordered, model-prefixed why, dup/out-of-range dropped', async (t) => {
  const hits = [HIT('zero'), HIT('one'), HIT('two')];
  let sent = null;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    sent = { url: String(input), body: JSON.parse(init.body), signal: init.signal };
    return json({
      message: {
        content: JSON.stringify({
          top: [
            { i: '2', why: 'best fit for the ask' }, // string index still resolves
            { i: 2, why: 'duplicate index ignored' },
            { i: 99, why: 'ghost index ignored' },
          ],
        }),
      },
    });
  });

  const r = await aiRerank('csv chart tool', hits);

  assert.equal(r.ai, true, 'rerank accepted');
  assert.deepEqual(
    r.hits.map((h) => h.name),
    ['two', 'zero', 'one'],
    'ranked first, the rest keeps input order'
  );
  assert.equal(r.hits[0].why, `${OLLAMA_MODEL}: best fit for the ask`, 'why carries the model tag');
  assert.equal(r.hits.filter((h) => h.name === 'two').length, 1, 'duplicate index collapsed');
  assert.equal(r.hits.length, 3, 'out-of-range index added nothing');

  assert.match(sent.url, /\/api\/chat$/, 'posts to the Ollama chat endpoint');
  assert.equal(sent.body.model, OLLAMA_MODEL);
  assert.equal(sent.body.stream, false, 'non-streaming reply');
  assert.equal(sent.body.format, 'json', 'JSON-constrained decoding');
  assert.equal(sent.body.think, false, 'qwen3 reasoning off (latency budget)');
  assert.equal(sent.body.options.temperature, 0.2, 'low temperature');
  assert.match(sent.body.messages[0].content, /Reply ONLY with JSON/, 'strict system prompt');
  assert.match(sent.body.messages[1].content, /^Need: csv chart tool\nCandidates:/, 'user payload carries candidates');
  assert.ok(sent.body.messages[1].content.includes('0. [repo] zero'), 'candidates are numbered');
  assert.ok(sent.signal instanceof AbortSignal, 'abort signal attached (3.5s budget)');
});

test('aiRerank: non-OK reply, unparsable content, empty top, and a dead socket all fall back silently', async (t) => {
  const hits = [HIT('a'), HIT('b')];
  const replies = [
    new Response('rate limited', { status: 429 }), // !res.ok
    json({ message: { content: 'this is {not json' } }), // JSON.parse throw
    json({ message: {} }), // parsed.top not an array
    new Error('fetch failed: ECONNREFUSED 127.0.0.1:11434'), // dead socket
  ];
  t.mock.method(globalThis, 'fetch', async () => {
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return r;
  });

  const labels = ['!res.ok', 'unparsable content', 'missing top[]', 'socket down'];
  for (const label of labels) {
    const r = await aiRerank('q', hits);
    assert.equal(r.ai, false, `${label} → ai:false`);
    assert.equal(r.hits, hits, `${label} → original order stands`);
  }
  assert.equal(replies.length, 0, 'all four reply shapes exercised');
});

test('aiRerank: top[] that is empty or not an array → no reorder, ai:false', async (t) => {
  const hits = [HIT('a')];
  const replies = [json({ message: { content: JSON.stringify({ top: [] }) } }), json({ message: { content: JSON.stringify({ top: 'nope' }) } })];
  t.mock.method(globalThis, 'fetch', async () => replies.shift());

  const empty = await aiRerank('q', hits);
  assert.equal(empty.ai, false, 'empty top is not a ranking');
  assert.equal(empty.hits, hits);

  const wrongType = await aiRerank('q', hits);
  assert.equal(wrongType.ai, false, 'non-array top rejected');
  assert.equal(wrongType.hits, hits);
});

/* ---------------- runAsk text endings (src/search.js:215–244) ---------------- */

test('runAsk: sources answer with zero hits + per-source failures → notes for each failure kind + web hint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('api.github.com')) return json({ items: [] }); // answered, nothing matched
    if (url.includes('registry.npmjs.org')) throw new Error('fetch failed: ECONNREFUSED');
    if (url.includes('crates.io')) throw new Error('The operation was aborted due to timeout');
    if (url.includes('aio-ollama.test')) return new Response('no model', { status: 503 });
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const query = 'rust csv parser https://example.com/doc';
  const r = await runAsk({ query, json: false });

  assert.equal(r.ok, true, 'a source answered → machine consumers see success');
  assert.equal(r.json.hits.length, 0, 'zero hits to render');
  assert.match(r.text, /live: github/, 'the answering source is named');
  assert.match(r.text, /npm: unreachable \(network\)/, 'network failure kind');
  assert.match(r.text, /crates: timeout \(4s budget\)/, 'timeout kind');
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
    if (url.includes('aio-ollama.test')) return new Response('no model', { status: 503 });
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

test('runAsk: warm Ollama → engine suffix and hit why lines carry the model tag', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('api.github.com')) {
      return json({
        items: [
          {
            full_name: 'acme/zeta-etl',
            html_url: 'https://github.com/acme/zeta-etl',
            description: 'ETL for csv',
            stargazers_count: 42,
            language: 'Go',
          },
        ],
      });
    }
    if (url.includes('registry.npmjs.org')) {
      return json({
        objects: [{ package: { name: 'zeta-etl', version: '1.0.0', description: 'ETL for csv' } }],
      });
    }
    if (url.includes('crates.io')) return json({ crates: [] });
    if (url.includes('aio-ollama.test')) {
      return json({ message: { content: JSON.stringify({ top: [{ i: 0, why: 'exact ETL match' }] }) } });
    }
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await runAsk({ query: 'zeta etl csv', json: false });

  assert.equal(r.ok, true);
  assert.match(r.json.engine, new RegExp(`\\+ ollama:${OLLAMA_MODEL}$`), 'engine names the reranker');
  assert.match(r.text, new RegExp(`${OLLAMA_MODEL}: exact ETL match`), 'ai why printed in text');
  assert.match(r.text, /\d+\. acme\/zeta-etl \[repo\] <github>/, 'hits still render after rerank');
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
    if (url.includes('aio-ollama.test')) return new Response('no model', { status: 503 });
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await runAsk({ query: 'zzzz qqqq', json: false });

  assert.equal(r.ok, true);
  assert.ok(r.json.hits.length >= 1, 'entries surface even without keyword overlap');
  assert.match(r.text, /why: source-ranked by github/, 'fallback why tag');
});
