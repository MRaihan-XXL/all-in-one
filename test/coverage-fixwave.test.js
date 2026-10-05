// coverage-fixwave.test.js — regression tests for the branches the v1.7.0 fix
// wave added but never exercised:
//   src/write.js   corrupt block-hashes.json / corrupt mcp-ledger.json (preserve
//                  aside + refuse to rebuild, never clobber the only copy)
//   src/skill.js   corrupt skills-ledger.json, skillRemove without a name,
//                  fetchText body-cap lanes (stream oversize / no-stream
//                  oversize / reader failure) and the all-candidates-errored
//                  "fetch failed" verdict
//   src/borrow.js  interrupted clone dir (no .git) cleared before the re-clone
// Hermetic: AIO_STATE_DIR + TEMP/TMP/TMPDIR + HOME → temp (BORROW_DIR is baked
// at import), PATH → empty dir (gh/git spawn → ENOENT), no network, no real home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// pin %TEMP% FIRST — borrow.js bakes BORROW_DIR = <tmpdir>/aio-borrow at import
const OWN_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixwave-tmp-'));
process.env.TEMP = OWN_TMP;
process.env.TMP = OWN_TMP;
process.env.TMPDIR = OWN_TMP;
process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixwave-state-')); // must precede the src imports
process.env.AIO_NO_GH = '1';
process.env.AIO_RATE = '0';
process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixwave-path-')); // gh/git unreachable → ENOENT

const { injectBlock, stripBlock, blockEdited, removeMcpAdditions } = await import('../src/write.js');
const { skillList, skillRemove, skillAdd, removeSkillAdditions, skillsDir } = await import('../src/skill.js');
const { BORROW_DIR, borrowClone, borrowClean, runBorrow } = await import('../src/borrow.js');
const { STATE_DIR } = await import('../src/paths.js');

const HASHES = path.join(STATE_DIR, 'block-hashes.json');
const MCP_LEDGER = path.join(STATE_DIR, 'mcp-ledger.json');
const SKILLS_LEDGER = path.join(STATE_DIR, 'skills-ledger.json');
const BODY = '# Demo skill\n\nA body long enough to pass the 20-char stub guard.\n';

function fixture(prefix, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, 'AGENTS.md');
  fs.writeFileSync(file, content);
  return file;
}

/** Any *.corrupt-<ts>.json aside-drops inside STATE_DIR. */
function preserved(prefix) {
  return fs.readdirSync(STATE_DIR).filter((f) => new RegExp(`^${prefix}\\.corrupt-\\d+\\.json$`).test(f));
}

function put(file, bytes) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(file, bytes);
}

/* ---------------- src/write.js: corrupt state ---------------- */

test('block-hashes.json corrupt → preserved aside, drift claim refused, hash never rebuilt', () => {
  const file = fixture('aio-fixwave-hash-', '# my rules\n');
  assert.equal(injectBlock(file, 'BODY-v1', 't').status, 'injected', 'precondition: block recorded');

  put(HASHES, '{ this is not json');
  assert.equal(blockEdited(file), false, 'corrupt drift state → never claims drift');
  assert.equal(fs.existsSync(HASHES), false, 'bad bytes moved aside, not overwritten');
  const kept = preserved('block-hashes');
  assert.equal(kept.length, 1, `corrupt copy preserved: ${kept}`);
  assert.equal(fs.readFileSync(path.join(STATE_DIR, kept[0]), 'utf8'), '{ this is not json', 'bytes kept verbatim');

  // stripBlock's pruneHash must refuse the same way (never rewrite from scratch)
  put(HASHES, '{ still not json');
  assert.equal(stripBlock(file), 'removed', 'block removal still succeeds');
  assert.equal(blockEdited(file), false, 'no block → no drift claim');
  assert.ok(
    preserved('block-hashes').some((f) => fs.readFileSync(path.join(STATE_DIR, f), 'utf8') === '{ still not json'),
    'pruneHash preserved the second corrupt read instead of overwriting it'
  );

  // rememberBlock refuses to rebuild the drift state from a corrupt read
  const fresh = fixture('aio-fixwave-hash2-', '# no block yet\n');
  put(HASHES, '{ not json either');
  const r = injectBlock(fresh, 'BODY', 't');
  assert.match(r.status, /^injected$/, `block lands regardless: ${r.status}`);
  assert.ok(fs.readFileSync(fresh, 'utf8').includes('BODY'), 'content written');
  assert.equal(fs.existsSync(HASHES), false, 'no fresh hash file written over corrupt state');
  assert.equal(blockEdited(fresh), false, 'no hash recorded → no drift claim');
});

test('mcp-ledger.json corrupt → removeMcpAdditions refuses to write, preserves the bytes', () => {
  put(MCP_LEDGER, '["truncated"');

  const out = removeMcpAdditions();

  assert.equal(out.length, 1, `one refusal row: ${JSON.stringify(out)}`);
  assert.equal(out[0].target, 'mcp ledger');
  assert.match(out[0].status, /^ledger unreadable — preserved as .*refusing to write$/, `verbatim: ${out[0].status}`);
  assert.equal(fs.existsSync(MCP_LEDGER), false, 'corrupt ledger not left in place to be wiped');
  const kept = preserved('mcp-ledger');
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(STATE_DIR, kept[0]), 'utf8'), '["truncated"', 'the only copy survives');
  assert.equal(ledgerListSafe(), 0, 'nothing was rewritten');
});

function ledgerListSafe() {
  const f = path.join(STATE_DIR, 'mcp-ledger.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).length : 0;
}

/* ---------------- src/skill.js: corrupt ledger + guards ---------------- */

test('skills-ledger.json corrupt → skillList marks everything yours, rollback refuses to write', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-fixwave-home-'));
  t.mock.method(os, 'homedir', () => home);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const root = skillsDir(home);
  fs.mkdirSync(path.join(root, 'mine'), { recursive: true });
  fs.writeFileSync(path.join(root, 'mine', 'SKILL.md'), BODY);
  put(SKILLS_LEDGER, '{ corrupt');

  const list = skillList();
  assert.equal(list.ok, true, 'a corrupt ledger never breaks the listing');
  assert.match(list.text, /\[ \] mine\s+yours/, 'untracked view (the ledger could not be read)');
  assert.ok(!list.text.includes('[x] mine'), 'no aio claim without a readable ledger');
  assert.ok(list.text.includes(`root: ${root}`), 'root echoed');

  put(SKILLS_LEDGER, '{ corrupt'); // skillList already preserved the first bad copy aside
  const out = removeSkillAdditions();
  assert.equal(out.length, 1, `one refusal row: ${JSON.stringify(out)}`);
  assert.equal(out[0].target, 'skills ledger');
  assert.match(out[0].status, /^ledger unreadable — preserved as .*refusing to write$/, `verbatim: ${out[0].status}`);
  assert.equal(fs.existsSync(SKILLS_LEDGER), false, 'corrupt ledger moved aside');
  assert.ok(preserved('skills-ledger').length >= 1, 'bytes preserved');
  assert.ok(fs.existsSync(path.join(root, 'mine', 'SKILL.md')), 'no skill deleted on an unreadable ledger');
});

test('skillRemove without a name → usage refusal (never a bogus "skill" dir)', () => {
  for (const target of ['', '   ', undefined, null]) {
    const r = skillRemove({ target });
    assert.equal(r.ok, false, `target=${JSON.stringify(target)} is not ok`);
    assert.equal(r.text, '[aio] skill: missing name — usage: aio skill remove <name>', 'exact usage line');
  }
});

/* ---------------- src/skill.js: fetchText body-cap lanes ---------------- */

/** All 3 SKILL.md candidates answer with the SAME outcome → the all-error verdict. */
function skillAddAll(t, respond) {
  t.mock.method(globalThis, 'fetch', async () => respond());
  return skillAdd({ target: 'owner/repo' });
}

test('fetchText: streamed body over the 1 MB cap → aborted + named (all candidates)', async (t) => {
  const big = () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(600_000));
          c.enqueue(new Uint8Array(600_000));
          c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/markdown' } }
    );

  const r = await skillAddAll(t, big);

  assert.equal(r.ok, false, 'an oversize body is a fetch problem, not a missing file');
  assert.match(r.text, /fetch failed \(response body exceeds 1000000 bytes\)/, `original error verbatim: ${r.text}`);
  assert.ok(!r.text.includes('SKILL.md not found'), 'never disguised as a missing skill');
});

test('fetchText: body with no stream → size-checked after text() (all candidates)', async (t) => {
  const fake = () => ({
    ok: true,
    url: 'https://raw.githubusercontent.com/owner/repo/HEAD/SKILL.md',
    headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/markdown' : null) },
    text: async () => 'x'.repeat(1_000_001), // > MAX_BYTES, but only detectable after buffering
  });

  const r = await skillAddAll(t, fake);

  assert.equal(r.ok, false);
  assert.match(r.text, /fetch failed \(response body exceeds 1000000 bytes\)/, `original error verbatim: ${r.text}`);
});

test('fetchText: reader rejects mid-stream → error outcome, never a silent miss (all candidates)', async (t) => {
  const broken = () =>
    new Response(
      new ReadableStream({
        pull() {
          throw new Error('stream boom');
        },
      }),
      { status: 200, headers: { 'content-type': 'text/markdown' } }
    );

  const r = await skillAddAll(t, broken);

  assert.equal(r.ok, false);
  assert.match(r.text, /fetch failed \(stream boom\)/, `original error verbatim: ${r.text}`);
});

/* ---------------- src/borrow.js: interrupted clone ---------------- */

test('borrowClone: interrupted clone dir (no .git) is cleared before the re-clone attempt', (t) => {
  t.mock.method(fs, 'statfsSync', () => {
    throw new Error('ENOSYS: statfs unsupported'); // free space unknown → guard passes (Infinity)
  });
  const dest = path.join(BORROW_DIR, 'aio-fixwave_partial-repo');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'partial.txt'), 'half a clone');

  assert.throws(() => borrowClone('aio-fixwave/partial-repo'), /ENOENT/, 'git is unreachable (PATH pinned above)');

  assert.equal(fs.existsSync(dest), false, 'the partial dir was removed → the re-clone really was attempted');
  fs.rmSync(dest, { recursive: true, force: true });
});

test('borrowClean: stray files at the top level (aborted-clone leftovers) are wiped too', () => {
  fs.mkdirSync(BORROW_DIR, { recursive: true });
  const stray = path.join(BORROW_DIR, 'leftover.txt');
  fs.writeFileSync(stray, 'half a clone');

  const r = borrowClean(BORROW_DIR);

  assert.ok(r.n >= 1, `at least the stray file counted (n=${r.n})`);
  assert.ok(r.freed >= Buffer.byteLength('half a clone'), `bytes counted: ${r.freed}`);
  assert.equal(fs.existsSync(stray), false, 'stray file gone');
  assert.equal(fs.existsSync(BORROW_DIR), true, 'the borrow dir itself survives');
});

test('runBorrow: AIO_OFFLINE=1 → honest offline payload before any fetch (never "search failed")', async (t) => {
  const prev = process.env.AIO_OFFLINE;
  process.env.AIO_OFFLINE = '1';
  t.after(() => {
    if (prev === undefined) delete process.env.AIO_OFFLINE;
    else process.env.AIO_OFFLINE = prev;
  });
  const net = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network must not be touched offline');
  });

  const r = await runBorrow({ query: 'some repo', json: true });

  assert.equal(r.ok, false, 'offline is a refusal, not a crash');
  assert.equal(r.json, null, 'no payload without network');
  assert.match(r.text, /offline \(AIO_OFFLINE=1\)/, `original text: ${r.text}`);
  assert.equal(net.mock.callCount(), 0, 'no lane probed');
});
