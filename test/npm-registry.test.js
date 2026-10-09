// npm-registry.test.js — src/live.js npmSearch: the registry/result cross-check
// for the npm lane (crates' twin is covered in coverage-live.test.js):
//   • a full row is mapped (package URL, trimmed func, version·keywords meta,
//     trust01 = npm score)
//   • malformed/missing registry fields are NORMALIZED — never fabricated:
//     no description → fallback copy, no version/keywords → empty meta,
//     no score → neutral 0.5 prior (honest "unknown", not 0 or 1)
//   • structurally broken rows (no package{}) REJECT the lane instead of
//     emitting a half-built entry — liveSearch lands that in errors[]
//   • a 500 is an error, not an empty answer (B-01); missing objects[] → []
// Hermetic: fetch is mocked per test (no network), AIO_RATE=0 (no ghThrottle
// sleep), AIO_NO_GH=1 (no `gh` subprocess), AIO_STATE_DIR → temp before import.
process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-npmreg-')); // must precede the src import
process.env.AIO_NO_GH = '1'; // no gh token subprocess
process.env.AIO_RATE = '0'; // ghRepos → ghThrottle: no spacing wait
delete process.env.AIO_OFFLINE; // liveSearch must reach the mocked lanes

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { npmSearch, liveSearch } = await import('../src/live.js');

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('npmSearch: full row mapped — url, trimmed func, version·keywords meta, score-derived trust', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    assert.match(url, /^https:\/\/registry\.npmjs\.org\/-\/v1\/search\?text=/, 'hits the npm search API');
    return json({
      objects: [
        {
          package: {
            name: 'pdf-lib',
            description: 'Create and modify PDF documents '.repeat(10),
            version: '1.4.0',
            keywords: ['pdf', 'merge', 'split', 'extra'],
          },
          score: { final: 0.91 },
        },
      ],
    });
  });

  const rows = await npmSearch('pdf tools', 6);

  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.type, 'tool');
  assert.equal(r.src, 'npm');
  assert.equal(r.name, 'pdf-lib');
  assert.equal(r.url, 'https://www.npmjs.com/package/pdf-lib', 'URL built from the package name');
  assert.ok(r.func.length <= 120 && r.func.endsWith('…'), `description trimmed to 120 (${r.func.length})`);
  assert.equal(r.meta, 'v1.4.0 · pdf · merge · split', 'version + first 3 keywords');
  assert.equal(r.trust01, 0.91, 'trust prior is the npm score, unmodified');
});

test('npmSearch: malformed/missing registry fields normalized — no fabricated version, score defaults to 0.5', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    json({
      objects: [
        { package: { name: 'bare' } }, // no description/version/keywords/score
        { package: { name: 'kw-only', keywords: ['yaml', 'config'] } }, // keywords without version
        { package: { name: 'odd', description: 'desc only' }, score: { final: 0.42 } },
      ],
    }),
  );

  const [bare, kwOnly, odd] = await npmSearch('bare', 5);

  assert.equal(bare.func, 'npm package (no description)', 'missing description → fallback copy');
  assert.equal(bare.meta, '', 'no version/keywords → empty meta, never a fabricated v?/★');
  assert.equal(bare.trust01, 0.5, 'missing score → neutral prior, not 0 and not 1');

  assert.equal(kwOnly.meta, 'yaml · config', 'keywords without version still render');
  assert.equal(kwOnly.func, 'npm package (no description)');

  assert.equal(odd.trust01, 0.42, 'numeric score passes through');
  assert.equal(odd.meta, '', 'version absent → no v-prefix junk');
});

test('npmSearch: row without package{} rejects — structural garbage fails the lane, never a half-built entry', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ objects: [{ score: { final: 0.1 } }] }));

  await assert.rejects(npmSearch('broken'), TypeError, 'a packageless row must reject, not map');
});

test('npmSearch: missing objects[] → empty list; HTTP 500 → rejects `npm 500` (not a fake empty answer)', async (t) => {
  let scenario = 'empty';
  t.mock.method(globalThis, 'fetch', async () => {
    if (scenario === 'error') return new Response('boom', { status: 500 });
    return json({}); // total count present in the real API, objects absent
  });

  assert.deepEqual(await npmSearch('nothing', 3), [], 'absent objects[] is an honest empty result');

  scenario = 'error';
  await assert.rejects(npmSearch('anything'), /npm 500/, 'HTTP failure surfaces as an error');
});

test('liveSearch: npm lane 500 → errors[] carries npm 500 while github still answers — never a fake empty lane', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('registry.npmjs.org')) return new Response('boom', { status: 500 });
    if (url.includes('api.github.com')) return json({ items: [] });
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await liveSearch('node utility');

  assert.equal(r.offline, false);
  assert.deepEqual(r.sources, ['github'], 'github answered (0 hits still counts as answered)');
  assert.deepEqual(r.entries, [], 'the dead npm lane contributed no rows');
  const err = r.errors.find((e) => e.src === 'npm');
  assert.ok(err, `npm failure lands in errors[]: ${JSON.stringify(r.errors)}`);
  assert.equal(err.msg, 'npm 500', 'the real HTTP failure message is preserved');
});
