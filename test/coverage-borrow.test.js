// coverage-borrow.test.js — src/borrow.js depth: ghSearch mapping/errors, the
// borrowClone guards (invalid target / low disk / already borrowed / clone
// failure) and every runBorrow output path (search, --get, --list, --clean).
// NO network: global fetch is mocked. NO working `gh`/`git`: PATH points at an
// empty dir so those execFileSync calls fail with ENOENT (borrow.js has no
// AIO_NO_GH guard) — nothing is ever cloned or fetched for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// BORROW_DIR is baked AT IMPORT as path.join(os.tmpdir(), 'aio-borrow') — pin
// %TEMP% at a throwaway dir first so purge/list/clean never touch the real one.
const OWN_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-borrow-cov-'));
process.env.TEMP = OWN_TMP;
process.env.TMP = OWN_TMP;
process.env.TMPDIR = OWN_TMP;
// gh/git unresolvable → every spawn inside borrow.js throws ENOENT immediately.
process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-borrow-cov-path-'));
delete process.env.GITHUB_TOKEN; // ambient token must not leak into assertions

const { BORROW_DIR, ghSearch, borrowClone, runBorrow, purgeExpired } = await import('../src/borrow.js');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function resetBorrowDir() {
  fs.rmSync(BORROW_DIR, { recursive: true, force: true });
}

/* ---------------- ghSearch (lines 48–75) ---------------- */

test('ghSearch: items mapped to name/url/desc/stars/lang/pushed/why; token becomes a Bearer header', async (t) => {
  process.env.GITHUB_TOKEN = 'tok-abc';
  t.after(() => delete process.env.GITHUB_TOKEN);
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    seen.push({ url: String(input), headers: init.headers });
    return json({
      items: [
        {
          full_name: 'acme/tool',
          html_url: 'https://github.com/acme/tool',
          description: 'does things',
          stargazers_count: 1234,
          language: 'Rust',
          pushed_at: '2026-01-02T03:04:05Z',
        },
        { full_name: 'acme/stub', html_url: 'https://github.com/acme/stub', description: null, stargazers_count: 7 },
      ],
    });
  });

  const hits = await ghSearch('rust cli', 3);

  assert.equal(hits.length, 2);
  const [a, b] = hits;
  assert.equal(a.name, 'acme/tool');
  assert.equal(a.url, 'https://github.com/acme/tool');
  assert.equal(a.desc, 'does things');
  assert.equal(a.stars, 1234);
  assert.equal(a.lang, 'Rust');
  assert.equal(a.pushed, '2026-01-02', 'pushed_at truncated to YYYY-MM-DD');
  assert.match(a.why, /★1234 · Rust/);
  assert.equal(b.desc, 'No description provided.', 'null description gets the fallback text');
  assert.equal(b.lang, '', 'null language → empty string');
  assert.equal(b.pushed, '', 'missing pushed_at → empty string');
  assert.match(b.why, /★7/);
  assert.match(seen[0].url, /per_page=3/, 'limit passed through to the API');
  assert.match(seen[0].url, /q=rust%20cli%20stars/, 'query carries the stars filter');
  assert.equal(seen[0].headers.authorization, 'Bearer tok-abc', 'env token attached when gh auth is unavailable');
});

test('ghSearch: !ok → throw (403 carries the rate-limited hint, 500 does not); missing items → []', async (t) => {
  let mode = '403';
  t.mock.method(globalThis, 'fetch', async () => {
    if (mode === '403') return json({}, 403);
    if (mode === '500') return json({}, 500);
    return json(mode === 'empty' ? {} : { items: null });
  });

  await assert.rejects(ghSearch('x'), /GitHub search HTTP 403 \(rate limited\)/, '403 names the rate limit');
  mode = '500';
  await assert.rejects(ghSearch('x'), /GitHub search HTTP 500/, '500 is reported as-is');
  await assert.rejects(ghSearch('x'), (e) => !/rate limited/.test(e.message), 'non-403 has no rate-limit hint');
  mode = 'empty';
  assert.deepEqual(await ghSearch('x'), [], 'no items field → empty list');
  mode = 'null';
  assert.deepEqual(await ghSearch('x'), [], 'items:null → empty list');
});

/* ---------------- borrowClone guards (lines 79–97) ---------------- */

test('borrowClone: non owner/repo targets throw before any spawn', () => {
  assert.throws(() => borrowClone('not-a-repo'), /not a GitHub owner\/repo/);
  assert.throws(() => borrowClone('https://example.com/x'), /not a GitHub owner\/repo/);
  assert.throws(() => borrowClone('a/b/c'), /not a GitHub owner\/repo/, 'three path segments rejected');
});

test('borrowClone: <1 GB free → low-disk error naming `aio borrow --clean` (fmtBytes MB branch)', (t) => {
  t.mock.method(fs, 'statfsSync', () => ({ bavail: 1000, bsize: 1024 * 1024 })); // 1000 MB < 1 GB guard

  assert.throws(
    () => borrowClone('owner/repo'),
    (e) => /low disk: 1000 MB free \(< 1 GB\)/.test(e.message) && /aio borrow --clean/.test(e.message),
    'guard message names the size and the remedy'
  );
});

test('borrowClone: statfs unavailable → guard passes (Infinity), then the git spawn fails → caller reports it', async (t) => {
  t.mock.method(fs, 'statfsSync', () => {
    throw new Error('ENOSYS: statfs unsupported');
  });
  resetBorrowDir();
  const dest = path.join(BORROW_DIR, 'fresh_newrepo');

  const r = await runBorrow({ get: 'fresh/newrepo' });

  assert.equal(r.ok, false, 'clone failure is reported, never thrown out of runBorrow');
  assert.match(r.text, /borrow --get failed: /, `failure text: ${r.text}`);
  assert.equal(r.json, null);
  assert.equal(fs.existsSync(dest), false, 'no partial clone dir left behind');
});

/* ---------------- runBorrow --get (lines 156–168) ---------------- */

test('runBorrow --get: already-cloned target → ok + status/path/free-disk report (no spawn)', async () => {
  resetBorrowDir();
  fs.mkdirSync(path.join(BORROW_DIR, 'owner_repo'), { recursive: true });

  const r = await runBorrow({ get: 'https://github.com/owner/repo.git' });

  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /aio borrow — https:\/\/github\.com\/owner\/repo\.git → already borrowed/, 'the raw --get argument is echoed');
  assert.match(r.text, /path: .*owner_repo/);
  assert.match(r.text, /auto-purged after 24h/);
  assert.match(r.text, /free disk: \d+(\.\d+)? (GB|MB|KB)/, 'fmtBytes renders the free space');
  assert.equal(r.json.status, 'already borrowed');
  assert.ok(String(r.json.url).startsWith('https://github.com/'), `payload carries a GitHub URL: ${r.json.url}`);
});

test('runBorrow --get: invalid target → ok:false "borrow --get failed", json null', async () => {
  const r = await runBorrow({ get: 'not-a-repo' });

  assert.equal(r.ok, false);
  assert.match(r.text, /^\[aio\] borrow --get failed: not a GitHub owner\/repo/);
  assert.equal(r.json, null);
});

/* ---------------- runBorrow --list / --clean (lines 139–154) ---------------- */

test('runBorrow --list: clones listed with name/age/path; empty dir reports "nothing borrowed"', async () => {
  resetBorrowDir();
  const clone = path.join(BORROW_DIR, 'acme_widget');
  fs.mkdirSync(clone, { recursive: true });
  // A just-made dir is a race on Windows: file times can land ahead of Date.now()
  // by a sub-ms tick, so ageH renders "-0.0" and the format assert fails ~half the
  // time. Pin a known age instead → deterministic "1.5".
  const pinned = new Date(Date.now() - 90 * 60000);
  fs.utimesSync(clone, pinned, pinned);

  const r = await runBorrow({ list: true, json: true });
  assert.equal(r.ok, true);
  assert.equal(r.json.items.length, 1, 'the fresh clone is listed');
  assert.equal(r.json.items[0].name, 'acme_widget');
  assert.equal(r.json.items[0].path, path.join(BORROW_DIR, 'acme_widget'));
  assert.equal(r.json.items[0].ageH, '1.5', 'age in hours = pinned 90 minutes');
  assert.match(r.text, /aio borrow --list — 1 temp clone\(s\) in /);
  assert.match(r.text, /- acme_widget — age 1\.5h — /, 'age rendered as hours');

  resetBorrowDir();
  const empty = await runBorrow({ list: true, json: true });
  assert.match(empty.text, /nothing borrowed \(dir: /, 'empty list reported without error');
  assert.deepEqual(empty.json.items, []);
});

test('runBorrow --clean: TTL purge first, then wipe + bytes freed + KB fmtBytes branch', async () => {
  resetBorrowDir();
  const expired = path.join(BORROW_DIR, 'old_repo');
  const fresh = path.join(BORROW_DIR, 'fresh_repo');
  fs.mkdirSync(expired, { recursive: true });
  fs.mkdirSync(path.join(fresh, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(expired, 'a.txt'), 'x'.repeat(2048));
  fs.writeFileSync(path.join(fresh, 'nested', 'b.txt'), 'y'.repeat(5 * 1024 * 1024));
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
  fs.utimesSync(expired, twoDaysAgo, twoDaysAgo);

  const r = await runBorrow({ clean: true });

  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /1 clone\(s\) removed, 5 MB freed from /, 'fmtBytes MB branch');
  assert.match(r.text, /TTL purge: 1 expired \(>24h\): old_repo/, 'expired clone purged and named');
  assert.equal(r.json.n, 1, 'only the fresh clone needed the wipe');
  assert.equal(r.json.purged[0], 'old_repo');
  assert.equal(fs.existsSync(BORROW_DIR) ? fs.readdirSync(BORROW_DIR).length : 0, 0, 'borrow dir empty afterwards');

  // second pass with a sub-1 MB payload → fmtBytes KB branch
  fs.mkdirSync(path.join(BORROW_DIR, 'tiny_repo'), { recursive: true });
  fs.writeFileSync(path.join(BORROW_DIR, 'tiny_repo', 't.txt'), 'z'.repeat(2048));
  const kb = await runBorrow({ clean: true });
  assert.match(kb.text, /2 KB freed from /, 'fmtBytes KB branch');
  assert.deepEqual(kb.json.purged, [], 'nothing expired on the second pass');
});

/* ---------------- runBorrow search (lines 170–201) ---------------- */

test('runBorrow search: hits numbered with why/url, TTL purge line, pin-one hint, json payload', async (t) => {
  resetBorrowDir();
  const expired = path.join(BORROW_DIR, 'stale_repo');
  fs.mkdirSync(expired, { recursive: true });
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
  fs.utimesSync(expired, twoDaysAgo, twoDaysAgo);
  t.mock.method(globalThis, 'fetch', async () =>
    json({
      items: [
        {
          full_name: 'acme/one',
          html_url: 'https://github.com/acme/one',
          description: 'first hit',
          stargazers_count: 10,
          language: 'Go',
          pushed_at: '2026-02-03T00:00:00Z',
        },
        {
          full_name: 'acme/two',
          html_url: 'https://github.com/acme/two',
          description: 'second hit',
          stargazers_count: 5,
          language: 'JS',
          pushed_at: '2026-02-04T00:00:00Z',
        },
      ],
    })
  );

  const r = await runBorrow({ query: 'csv toolkit', json: false });

  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /aio borrow — "csv toolkit" \(GitHub live search · 2 results\)/);
  assert.match(r.text, /TTL purge: 1 expired clone\(s\) removed/, 'purge reported inside the search report');
  assert.match(r.text, /1\. acme\/one — first hit/);
  assert.match(r.text, /★10 · Go/);
  assert.match(r.text, /https:\/\/github\.com\/acme\/one/);
  assert.match(r.text, /pin one: aio borrow --get acme\/one/);
  assert.equal(r.json.count, 2, 'payload count matches the hits');
  assert.equal(r.json.schemaVersion, 1);
  assert.equal(r.json.query, 'csv toolkit');
  assert.equal(fs.existsSync(expired), false, 'purge ran before the search report');
});

test('runBorrow search --json → text is the machine payload', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ items: [] }));
  const r = await runBorrow({ query: 'nothing here', json: true });

  assert.equal(r.ok, true);
  const p = JSON.parse(r.text);
  assert.deepEqual(p, r.json, 'text and json payloads agree');
  assert.equal(p.count, 0);
});

test('runBorrow search: zero hits → friendly no-result text, ok stays true', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ items: [] }));
  const r = await runBorrow({ query: 'zzz no match' });

  assert.equal(r.ok, true, 'a completed search with no hits is not a failure');
  assert.match(r.text, /"zzz no match": no GitHub result/);
  assert.match(r.text, /github\.com\/search/, 'points at the GitHub search page');
});

test('runBorrow search: fetch rejects → ok:false "borrow search failed"', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch failed: ECONNREFUSED');
  });
  const r = await runBorrow({ query: 'anything at all' });

  assert.equal(r.ok, false);
  assert.match(r.text, /^\[aio\] borrow search failed: fetch failed: ECONNREFUSED/);
  assert.equal(r.json, null);
});

test("purgeExpired: an entry that cannot be stat'ed is skipped, not fatal", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-purge-busy-'));
  fs.mkdirSync(path.join(dir, 'busy_clone'));
  const origStat = fs.statSync.bind(fs);
  t.mock.method(fs, 'statSync', (p) => {
    if (String(p).startsWith(dir)) throw new Error('EBUSY: resource busy or locked');
    return origStat(p);
  });

  const gone = purgeExpired(dir);

  assert.deepEqual(gone, [], 'busy clone skipped — nothing reported as removed');
  assert.ok(fs.existsSync(path.join(dir, 'busy_clone')), 'busy clone kept for the next run');
});
