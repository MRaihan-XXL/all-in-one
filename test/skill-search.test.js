// skill-search.test.js — src/skill.js `aio skill search` (v1.7.0 feature lock):
// usage/offline guards, the live two-lane contract (skills + github), the json
// payload schema (commands[], stored:0), the honest errors[] path, and --add
// installing the top hit into a fixture home — never the real ~/.agents/skills.
// AIO_STATE_DIR → temp BEFORE the src import; PATH='' so `gh` is unresolvable
// (lane failure is an ENOENT, not a shell spawn); AIO_RATE=0 (no throttle sleep).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-skill-search-')); // must precede the src import
process.env.AIO_NO_GH = '1'; // skills lane resolves [] without spawning (toggled per failing test)
process.env.AIO_NO_AI = '1';
process.env.AIO_RATE = '0';
process.env.PATH = ''; // gh/git unreachable for every spawn in this process

const { skillSearch } = await import('../src/skill.js');
const { STATE_DIR } = await import('../src/paths.js');

const LEDGER = path.join(STATE_DIR, 'skills-ledger.json');
const BODY = '# Demo skill\n\nA body long enough to pass the 20-char stub guard.\n';

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function md(text) {
  return new Response(text, { status: 200, headers: { 'content-type': 'text/markdown' } });
}

/** ghRepos answers with these two repos; raw.githubusercontent serves BODY. */
function mockLive(t, { repos, raw = 'hit' } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.includes('api.github.com/search/repositories')) {
      if (repos === 'down') throw new Error('fetch failed: ECONNREFUSED');
      return json({ items: repos });
    }
    if (url.includes('raw.githubusercontent.com')) {
      if (raw === 'down') throw new Error('fetch failed: ECONNREFUSED');
      return md(BODY);
    }
    throw new Error(`unexpected network call in test: ${url}`);
  });
  return calls;
}

const REPOS = [
  {
    full_name: 'acme/pdf-tools',
    html_url: 'https://github.com/acme/pdf-tools',
    description: 'PDF splitting and merging',
    stargazers_count: 321,
    language: 'Rust',
  },
  {
    full_name: 'acme/doc-skills',
    html_url: 'https://github.com/acme/doc-skills',
    description: 'document skills collection',
    stargazers_count: 12,
    language: 'Shell',
  },
];

/** Isolated skills root — skillSearch --add must never write the real one. */
function fixtureHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-skill-search-home-'));
  t.mock.method(os, 'homedir', () => home);
  fs.rmSync(LEDGER, { force: true });
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

/** Drop AIO_NO_GH so the skills lane really spawns gh (PATH='' → ENOENT). */
function ghLaneFails(t) {
  delete process.env.AIO_NO_GH;
  t.after(() => {
    process.env.AIO_NO_GH = '1';
  });
}

test('skillSearch: empty query → usage text, ok:false, json:null', async () => {
  for (const query of ['', '   ', undefined]) {
    const r = await skillSearch({ query, json: false });
    assert.equal(r.ok, false, `query=${JSON.stringify(query)} is not ok`);
    assert.match(r.text, /^usage: aio skill search "<query>" \[--add\]/, 'usage first line');
    assert.match(r.text, /example: aio skill search "pdf word convert"/, 'example line');
    assert.equal(r.json, null, 'usage carries no payload');
  }
});

test('skillSearch: AIO_OFFLINE=1 → offline message, ok:false, zero fetch', async (t) => {
  process.env.AIO_OFFLINE = '1';
  t.after(() => {
    delete process.env.AIO_OFFLINE;
  });
  const net = t.mock.method(globalThis, 'fetch', async (input) => {
    throw new Error(`offline mode must not fetch: ${input}`);
  });

  const r = await skillSearch({ query: 'pdf tools', json: true });

  assert.equal(r.ok, false);
  assert.equal(r.json, null);
  assert.match(r.text, /offline \(AIO_OFFLINE=1\) — skill search is live by design/, 'offline reason surfaced');
  assert.equal(net.mock.callCount(), 0, 'no lane probed');
});

test('skillSearch text mode → ranked rows with ready-to-run install commands', async (t) => {
  mockLive(t, { repos: REPOS });

  const r = await skillSearch({ query: 'pdf word convert', json: false });

  assert.equal(r.ok, true, r.text);
  assert.match(r.text.split('\n')[0], /^aio skill search — "pdf word convert" \(live: skills\+github · 2 hits · [\d.]+s\)$/, 'header');
  assert.ok(r.text.includes('1. acme/pdf-tools [repo] — PDF splitting and merging'), 'first row');
  assert.ok(r.text.includes('2. acme/doc-skills [repo] — document skills collection'), 'second row');
  assert.equal(r.text.split('install: aio skill add').length - 1, 2, 'one install command per hit');
  assert.ok(r.text.includes('   install: aio skill add acme/pdf-tools'), 'command is copy-paste ready');
  assert.ok(r.text.includes('note: public results are unvetted'), 'honesty note');
  assert.ok(!r.text.includes('source issues:'), 'no failures to report');
  assert.deepEqual(r.json.sources, ['skills', 'github'], 'both lanes answered');
});

test('skillSearch --json → payload schema: schemaVersion 1, stored 0, commands per hit', async (t) => {
  mockLive(t, { repos: REPOS });

  const r = await skillSearch({ query: 'pdf word convert', json: true });

  assert.equal(r.ok, true);
  const p = JSON.parse(r.text);
  assert.deepEqual(p, r.json, 'text and json payloads agree');
  assert.deepEqual(
    Object.keys(p).sort(),
    ['commands', 'count', 'errors', 'hits', 'query', 'schemaVersion', 'sources', 'stored'],
    'payload keys pinned'
  );
  assert.equal(p.schemaVersion, 1, 'schemaVersion pinned to 1');
  assert.equal(p.query, 'pdf word convert');
  assert.equal(p.stored, 0, 'zero storage');
  assert.equal(p.count, p.hits.length, 'count matches hits');
  assert.deepEqual(p.errors, [], 'no lane failed');
  assert.deepEqual(p.commands, p.hits.map((h) => `aio skill add ${h.name}`), 'commands mirror the hits');
  for (const h of p.hits) assert.ok(['skills', 'github'].includes(h.src), `${h.name} src tag`);
});

test('skillSearch: skills lane dies (no gh) + github answers → ok true, failure surfaced', async (t) => {
  ghLaneFails(t);
  mockLive(t, { repos: REPOS });

  const r = await skillSearch({ query: 'pdf tools', json: false });

  assert.equal(r.ok, true, 'the github lane answered → ok');
  assert.deepEqual(r.json.sources, ['github'], 'skills is not claimed as answered');
  assert.equal(r.json.errors.length, 1, 'one failure reported');
  assert.equal(r.json.errors[0].src, 'skills');
  assert.match(r.json.errors[0].msg, /ENOENT/, 'the missing gh is named verbatim');
  assert.ok(r.text.includes('source issues: skills:'), `failure printed: ${r.text.split('\n')[1]}`);
  assert.ok(r.text.includes('install: aio skill add'), 'hits still rendered');
});

test('skillSearch: every lane fails → ok:false, payload still parses, honest "Live sources failed"', async (t) => {
  ghLaneFails(t);
  mockLive(t, { repos: 'down' });

  const r = await skillSearch({ query: 'pdf tools', json: true });

  assert.equal(r.ok, false, 'no source answered → not ok');
  const p = JSON.parse(r.text);
  assert.deepEqual(p, r.json, 'text and json payloads agree');
  assert.equal(p.schemaVersion, 1, 'schemaVersion pinned to 1');
  assert.equal(p.stored, 0, 'zero storage even on failure');
  assert.deepEqual(p.sources, [], 'nothing claimed');
  assert.deepEqual(p.errors.map((e) => e.src).sort(), ['github', 'skills'], 'both failures reported');
  assert.equal(p.count, 0);
  assert.deepEqual(p.commands, [], 'no commands without hits');

  // same failure rendered as text (the human verdict is text-only)
  const txt = await skillSearch({ query: 'pdf tools', json: false });
  assert.equal(txt.ok, false, 'text mode reports the same failure');
  assert.ok(txt.text.includes('live: no lane answered'), 'header admits nothing answered');
  assert.ok(txt.text.includes('source issues:'), 'failures explained');
  assert.ok(txt.text.includes('Live sources failed — fix the issue above, then retry.'), 'honest failure verdict');
  assert.ok(txt.text.includes('github: fetch failed: ECONNREFUSED'), 'original message kept');
});

test('skillSearch --add: top hit installed into the fixture home + ledgered', async (t) => {
  const home = fixtureHome(t);
  mockLive(t, { repos: REPOS });

  const r = await skillSearch({ query: 'pdf tools', add: true, json: false });

  assert.equal(r.ok, true, r.text);
  assert.ok(r.text.includes('aio skill search — "pdf tools" → installing top hit'), 'intent line');
  assert.ok(r.text.includes('[aio] skill pdf-tools: installed'), 'skillAdd report forwarded');
  const file = path.join(home, '.agents', 'skills', 'pdf-tools', 'SKILL.md');
  assert.equal(fs.readFileSync(file, 'utf8'), BODY, `installed at ${file}`);
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  assert.equal(ledger.length, 1, 'exactly one ledger entry');
  assert.equal(ledger[0].name, 'pdf-tools');
  assert.match(ledger[0].source, /^github acme\/pdf-tools$/, 'provenance recorded');
});

test('skillSearch --add --json → payload carries the installed record (no commands key)', async (t) => {
  const home = fixtureHome(t);
  mockLive(t, { repos: REPOS });

  const r = await skillSearch({ query: 'pdf tools', add: true, json: true });

  assert.equal(r.ok, true);
  const p = JSON.parse(r.text);
  assert.deepEqual(p, r.json, 'text and json payloads agree');
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.stored, 0, 'zero storage');
  assert.equal(p.query, 'pdf tools');
  assert.equal(p.count, p.hits.length);
  assert.equal(p.installed.name, 'acme/pdf-tools', 'install record names the searched hit');
  assert.equal(p.installed.ok, true, 'install outcome forwarded');
  assert.match(p.installed.text, /installed/, 'skillAdd text attached');
  assert.ok(!('commands' in p), '--add payload trades commands for installed');
  assert.ok(fs.existsSync(path.join(home, '.agents', 'skills', 'pdf-tools', 'SKILL.md')), 'file on disk');
});

test('skillSearch --add: lanes answer but nothing is installable → refusal names the query', async (t) => {
  mockLive(t, { repos: [] });

  const r = await skillSearch({ query: 'nothing at all', add: true, json: false });

  assert.equal(r.ok, false, 'no hit → not ok');
  assert.equal(r.json, null, 'no payload for a refusal');
  assert.match(r.text, /^\[aio\] skill search: no installable hit for "nothing at all"$/, `verbatim: ${r.text}`);
  assert.ok(!r.text.includes('(lanes:'), 'all lanes answered → no lanes suffix');
});

test('skillSearch --add: no hit AND failing lanes → refusal lists the dead lanes', async (t) => {
  ghLaneFails(t);
  mockLive(t, { repos: 'down' });

  const r = await skillSearch({ query: 'nothing at all', add: true, json: false });

  assert.equal(r.ok, false);
  assert.equal(r.json, null);
  assert.match(r.text, /no installable hit for "nothing at all" \(lanes: skills, github\)$/, `lanes named: ${r.text}`);
});
