// agent.test.js — src/agent.js `aio agent` (v1.7.0 feature lock): the plan/route
// synthesis, the --json schema contract, the B-01 ok-rule and the usage/offline
// guards. EVERY lane is mocked — catalog hosts by URL, wikipedia/HN by URL, and
// the local-tools lane by a PATH that holds EXACTLY jq + cargo. Zero network,
// zero gh subprocess, zero real-PATH probing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-agent-state-')); // must precede the src import
process.env.AIO_NO_GH = '1'; // skills lane never scheduled → no gh subprocess
process.env.AIO_NO_AI = '1'; // deterministic ranking (no Ollama rerank)
process.env.AIO_RATE = '0'; // ghThrottle: no spacing wait in tests

// local-tools lane fixture: PATH → a dir holding ONLY jq + cargo (detectBinary
// reads process.env.PATH per call, so the probe is fully deterministic).
const BIN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-agent-bin-'));
for (const bin of ['jq', 'cargo']) fs.writeFileSync(path.join(BIN_DIR, bin), '');
const REAL_PATH = process.env.PATH;
process.env.PATH = BIN_DIR;
after(() => {
  process.env.PATH = REAL_PATH;
  fs.rmSync(BIN_DIR, { recursive: true, force: true });
});

const { runAgent } = await import('../src/agent.js');

const TASK = 'rust json chart';

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const WIKI = [
  TASK,
  ['Rust (programming language)', 'JSON'],
  ['systems programming language', 'data interchange format'],
  ['https://en.wikipedia.org/wiki/Rust_(programming_language)', 'https://en.wikipedia.org/wiki/JSON'],
];
const HN = {
  hits: [
    { title: 'Show HN: JSON charts in Rust', url: 'https://example.com/charts', objectID: '42', points: 120, author: 'ada' },
    { title: 'Charting libs compared', objectID: '43', points: 7, author: 'lin' }, // no url → item fallback
    { objectID: '44' }, // no title → filtered
  ],
};
const GH_ITEMS = [
  {
    full_name: 'acme/json-chart',
    html_url: 'https://github.com/acme/json-chart',
    description: 'JSON chart rendering in Rust',
    stargazers_count: 1234,
    language: 'Rust',
  },
  {
    full_name: 'acme/unrelated',
    html_url: 'https://github.com/acme/unrelated',
    description: 'totally different words',
    stargazers_count: 10,
    language: 'Go',
  },
];
// npm package deliberately shares NO token with the task (→ BM25 drops it →
// agent.js's "every answered source gets a row" fill at pool lines runs).
const NPM = { objects: [{ package: { name: 'zzz-unrelated', version: '1.0.0', description: 'totally different words' } }] };
const CRATES = { crates: [{ id: 'chart-render', description: 'JSON chart rendering', max_stable_version: '0.4.0', downloads: 42000 }] };

/** Answer every lane; `fail` names the lanes that break (github|npm|crates|wiki|hn). */
function mockLanes(t, { fail = [] } = {}) {
  const calls = [];
  const net = t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    const boom = (msg) => {
      if (fail.includes(msg)) throw new Error(`fetch failed: ECONNREFUSED (${msg})`);
    };
    if (url.includes('api.github.com/search/repositories')) {
      if (fail.includes('github')) return new Response('boom', { status: 500 });
      return json({ items: GH_ITEMS });
    }
    if (url.includes('registry.npmjs.org')) {
      boom('npm');
      return json(NPM);
    }
    if (url.includes('crates.io')) {
      boom('crates');
      return json(CRATES);
    }
    if (url.includes('en.wikipedia.org')) {
      boom('wiki');
      return json(WIKI);
    }
    if (url.includes('hn.algolia.com')) {
      boom('hn');
      return json(HN);
    }
    throw new Error(`unexpected network call in test: ${url}`);
  });
  net.calls = calls;
  return net;
}

/** Route is ordered cheapest-first: tools → web → npm → crates → github → skills. */
function routeKeys(route) {
  return route.map((s) => {
    if (s.step === 'run now') return 0;
    if (s.step === 'read first') return 1;
    if (s.step === 'quick try') return s.use.startsWith('cargo add ') ? 3 : 2;
    if (s.step === 'deep dive') return 4;
    if (s.step === 'install skill') return 5;
    throw new Error(`unexpected route step: ${JSON.stringify(s)}`);
  });
}

test('runAgent: empty/missing query → usage text, ok:false, json:null', async () => {
  for (const query of ['', '   ', undefined]) {
    const r = await runAgent({ query, json: false });
    assert.equal(r.ok, false, `query=${JSON.stringify(query)} is not ok`);
    assert.match(r.text, /^usage: aio agent "<your task>"/, 'usage first line');
    assert.match(r.text, /example: aio agent "convert csv/, 'example line');
    assert.equal(r.json, null, 'usage carries no payload');
  }
});

test('runAgent: AIO_OFFLINE=1 → offline message, ok:false, zero fetch', async (t) => {
  process.env.AIO_OFFLINE = '1';
  t.after(() => {
    delete process.env.AIO_OFFLINE;
  });
  const net = t.mock.method(globalThis, 'fetch', async (input) => {
    throw new Error(`offline mode must not fetch: ${input}`);
  });

  const r = await runAgent({ query: TASK, json: true });

  assert.equal(r.ok, false);
  assert.equal(r.json, null);
  assert.match(r.text, /offline \(AIO_OFFLINE=1\)/, 'offline reason surfaced');
  assert.match(r.text, /live coordination needs network/, 'why it cannot coordinate');
  assert.equal(net.mock.callCount(), 0, 'no lane probed');
});

test('runAgent --json → schema contract + ordered route, every lane probed exactly once', async (t) => {
  const net = mockLanes(t);

  const r = await runAgent({ query: TASK, json: true });

  assert.equal(r.ok, true, r.text);
  const p = JSON.parse(r.text);
  assert.deepEqual(p, r.json, 'text and json payloads agree');
  assert.deepEqual(
    Object.keys(p).sort(),
    ['count', 'engine', 'errors', 'hits', 'plan', 'route', 'schemaVersion', 'sources', 'stored', 'task'],
    'payload keys pinned'
  );
  assert.equal(p.schemaVersion, 1, 'schemaVersion pinned to 1');
  assert.equal(p.engine, 'agent');
  assert.equal(p.task, TASK);
  assert.equal(p.stored, 0, 'zero storage');
  assert.equal(p.count, p.hits.length, 'count matches hits');
  assert.deepEqual(p.sources, ['github', 'npm', 'crates', 'web', 'tools'], 'every scheduled lane answered');
  assert.deepEqual(p.errors, [], 'no lane failed');
  assert.ok(p.hits.length >= 6, `pool spans the lanes (${p.hits.length})`);
  for (const h of p.hits) {
    assert.ok(['github', 'npm', 'crates', 'web', 'tools'].includes(h.src), `${h.name} src tag`);
    assert.ok(h.name && h.func && h.url, `${h.name} name/func/url`);
  }

  // plan = all six lanes with an honest answered flag (skills suppressed under AIO_NO_GH)
  assert.deepEqual(p.plan.map((x) => x.lane), ['github', 'skills', 'npm', 'crates', 'web', 'tools']);
  for (const lane of p.plan) {
    assert.ok(lane.why && lane.why.length > 0, `${lane.lane} carries a why`);
    assert.equal(lane.answered, p.sources.includes(lane.lane), `${lane.lane} answered flag mirrors sources`);
  }
  assert.equal(p.plan.find((x) => x.lane === 'skills').answered, false, 'skills lane never ran here');

  // route: cheapest first — tools → web → npm → crates → github (skills absent)
  assert.ok(p.route.length >= 5, `route built from the pool (${p.route.length} steps)`);
  const keys = routeKeys(p.route);
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b), `route ordered cheapest-first: ${keys}`);
  assert.deepEqual([...new Set(keys)], [0, 1, 2, 3, 4], 'tools, web, npm, crates and github all routed');
  assert.equal(p.route[0].step, 'run now', 'a local tool is always the cheapest step');
  for (const s of p.route) assert.ok(s.use && s.why, `${s.step} step carries use + why`);

  // agent coordinates EVERYTHING: 5 HTTP probes (github, npm, crates, wiki, hn)
  assert.equal(net.mock.callCount(), 5, `one probe per HTTP lane: ${net.calls.join(' ')}`);
});

test('runAgent text mode → plan checkboxes, numbered route, per-source lanes block', async (t) => {
  mockLanes(t);

  const r = await runAgent({ query: TASK, json: false });

  assert.equal(r.ok, true);
  const t0 = r.text.split('\n');
  assert.match(t0[0], /^aio agent — "rust json chart" \(coordinating: github\+npm\+crates\+web\+tools · \d+ results · [\d.]+s\)$/, 'header');
  assert.ok(r.text.includes('plan  github ∥ skills ∥ npm ∥ crates ∥ web ∥ tools — parallel, printed never stored'), 'plan line');
  assert.ok(r.text.includes('[x] github'), 'answered lane marked');
  assert.ok(r.text.includes('[ ] skills'), 'skipped lane unmarked');
  assert.ok(r.text.includes('route (coordinated — cheapest first)'), 'route section');
  assert.match(r.text, /  1\. \[run now\] /, 'first route step is a local tool to run now');
  assert.match(r.text, /  \d+\. \[run now\] jq/, 'the other local tool is routed too');
  assert.match(r.text, /  \d+\. \[quick try\] npx /, 'npm step is an npx try');
  assert.match(r.text, /  \d+\. \[quick try\] cargo add /, 'crates step is a cargo add');
  assert.match(r.text, /  \d+\. \[deep dive\] aio borrow --get acme\/json-chart/, 'github step borrows the repo');
  assert.ok(r.text.includes('lanes (top hits per source)'), 'lanes section');
  assert.ok(r.text.includes('  <tools>'), 'tools lane printed');
  assert.ok(r.text.includes('  <web>'), 'web lane printed');
  assert.ok(r.text.includes('note: every lane is live and unvetted'), 'honesty note');
  assert.ok(r.json.hits.length >= 1, 'structured payload still returned in text mode');
});

test('runAgent: one lane fails → ok stays true, failure rendered in the issues block (B-01)', async (t) => {
  mockLanes(t, { fail: ['github'] });

  const r = await runAgent({ query: TASK, json: false });

  assert.equal(r.ok, true, 'other lanes answered → ok');
  assert.ok(r.json.sources.includes('npm') && r.json.sources.includes('web'), 'survivors listed');
  assert.ok(!r.json.sources.includes('github'), 'the failed lane is not claimed as answered');
  assert.deepEqual(r.json.errors, [{ src: 'github', msg: 'github 500' }], 'failure surfaced verbatim');
  assert.ok(r.text.includes('issues:'), 'issues block printed');
  assert.match(r.text, /github: github 500/, 'per-source note carries the original message');
  assert.ok(!r.text.includes('[x] github'), 'plan shows the lane as unanswered');
});

test('runAgent: every lane fails → ok:false, json contract intact, honest empty route', async (t) => {
  mockLanes(t, { fail: ['github', 'npm', 'wiki', 'hn'] });

  const r = await runAgent({ query: 'zzz unknown thing', json: true });

  assert.equal(r.ok, false, 'no source answered → not ok');
  const p = JSON.parse(r.text);
  assert.deepEqual(p, r.json, 'text and json payloads agree');
  assert.equal(p.schemaVersion, 1, 'schemaVersion pinned even on failure');
  assert.equal(p.stored, 0, 'zero storage even on failure');
  assert.deepEqual(p.sources, [], 'nothing claimed');
  assert.deepEqual(
    p.errors.map((e) => e.src).sort(),
    ['github', 'npm', 'web'],
    'every failed lane reported'
  );
  assert.deepEqual(p.route, [], 'no route without evidence');
  assert.equal(p.count, 0);

  // same failure, rendered as text (the fallback verdict is human-only)
  const txt = await runAgent({ query: 'zzz unknown thing', json: false });
  assert.equal(txt.ok, false, 'text mode reports the same failure');
  assert.ok(txt.text.includes('coordinating: no lane answered'), 'header admits nothing answered');
  assert.ok(txt.text.includes('issues:'), 'errors still explained');
  assert.ok(
    txt.text.includes('route — no lane matched this task; refine the keywords and rerun.'),
    'empty-route fallback'
  );
  assert.ok(!txt.text.includes('lanes (top hits per source)'), 'no lanes section without hits');
});

test('runAgent: no keyword overlap → source-ranked fallback fills the pool (never an empty answer)', async (t) => {
  mockLanes(t);

  const r = await runAgent({ query: 'qqqzzz vvvvv', json: true });

  assert.equal(r.ok, true, 'lanes answered even when BM25 finds nothing');
  const p = r.json;
  assert.ok(p.hits.length >= 4, `fallback pool built from source order (${p.hits.length})`);
  for (const h of p.hits) assert.match(h.why, /source-ranked by \w+/, `${h.name} carries a fallback why`);
  const keys = routeKeys(p.route);
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b), 'route still ordered cheapest-first');
  assert.ok(keys.includes(1) && keys.includes(2) && keys.includes(4), 'web + npm + github routed');
  assert.ok(!keys.includes(0), 'no local tool matched this query');
});
