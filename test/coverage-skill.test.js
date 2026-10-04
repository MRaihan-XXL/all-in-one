// coverage-skill.test.js — src/skill.js gaps: remote install (raw URL candidate
// fallback + fetchText 404/short/throw lanes), hand-edit detection, local --file
// error paths, skillList, skillRemove success/missing/modified, and the
// removeSkillAdditions already-gone / path-mismatch lanes.
// Isolated: AIO_STATE_DIR → temp (before the src import); every skills root sits
// under a temp home behind t.mock.method(os, 'homedir'). Network is mocked.
process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-skill-cov-'));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { skillAdd, skillList, skillRemove, removeSkillAdditions, skillsDir } = await import('../src/skill.js');
const { STATE_DIR } = await import('../src/paths.js');

const LEDGER = path.join(STATE_DIR, 'skills-ledger.json');
const BODY = '# Demo skill\n\nA body long enough to pass the 20-char stub guard.\n';

function resp(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/markdown' } });
}

function fixtureHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-skill-cov-home-'));
  t.mock.method(os, 'homedir', () => home);
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function putLedger(entries) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(entries, null, 2));
}

function readLedger() {
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}

/* ---------------- remote install + fetchText lanes ---------------- */

test('skillAdd owner/repo: URL candidates tried in order until one answers → installed + ledgered', async (t) => {
  const home = fixtureHome(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/HEAD/SKILL.md')) return resp('not here', 404); // candidate 1 misses
    if (url.includes('/HEAD/tools/SKILL.md')) return resp(BODY); // candidate 2 hits
    throw new Error(`unexpected network call in test: ${url}`);
  });

  const r = await skillAdd({ target: 'acme/tools', name: 'my-skill' });

  assert.equal(r.ok, true, r.text);
  assert.match(r.text, /installed/, 'install reported');
  assert.match(r.text, /source: github acme\/tools/, 'provenance recorded');
  assert.equal(calls.length, 2, 'stopped at the first working candidate');
  assert.ok(calls[0].includes('raw.githubusercontent.com/acme/tools/HEAD/SKILL.md'), 'root layout tried first');
  const file = path.join(skillsDir(home), 'my-skill', 'SKILL.md');
  assert.equal(fs.readFileSync(file, 'utf8'), BODY, 'bytes written verbatim');
  const rec = readLedger().find((e) => e.name === 'my-skill');
  assert.ok(rec, 'ledger entry written');
  assert.equal(rec.source, 'github acme/tools');
  assert.equal(rec.file, file, 'ledger points at the install path');
  assert.match(rec.sha, /^[0-9a-f]{16}$/, 'sha recorded for rollback');
});

test('skillAdd: direct https URL → single candidate; 404 → "tried 1 location"', async (t) => {
  fixtureHome(t);
  const target = 'https://example.com/notes.md';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls.push(String(input));
    return resp('gone', 404);
  });

  const r = await skillAdd({ target });

  assert.equal(r.ok, false);
  assert.match(r.text, /SKILL\.md not found for https:\/\/example\.com\/notes\.md/, 'target echoed');
  assert.match(r.text, /tried 1 location\)\./, 'singular count for a single-URL target');
  assert.ok(!r.text.includes('AIO_OFFLINE'), 'not an offline message');
  assert.deepEqual(calls, [target], 'the URL itself is fetched as-is');
});

test('skillAdd: throw → 404 → too-short body across 3 candidates → "tried 3 locations"', async (t) => {
  fixtureHome(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    calls.push(url);
    if (calls.length === 1) throw new Error('fetch failed: ECONNREFUSED');
    if (calls.length === 2) return resp('nope', 404);
    return resp('tiny'); // 200 but trimmed length < 20 → stub, not a skill
  });

  const r = await skillAdd({ target: 'zzz/nope' });

  assert.equal(r.ok, false);
  assert.match(r.text, /tried 3 locations\)\./, 'plural count for three candidates');
  assert.equal(calls.length, 3, 'every candidate attempted after failures');
});

/* ---------------- local --file error lanes ---------------- */

test('skillAdd --file: missing path → named; directory without SKILL.md → named', async (t) => {
  const home = fixtureHome(t);

  const missing = await skillAdd({ target: '', file: path.join(home, 'nope.md') });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /local path not found — .*nope\.md/);

  const dir = path.join(home, 'empty-dir');
  fs.mkdirSync(dir);
  const noSkill = await skillAdd({ target: '', file: dir });
  assert.equal(noSkill.ok, false);
  assert.match(noSkill.text, /SKILL\.md not found — .*empty-dir/);
});

/* ---------------- existingStatus: hand-edited branch ---------------- */

test('skillAdd: hand-edited install → re-add reports "modified since aio installed it", ok:false', async (t) => {
  const home = fixtureHome(t);
  const src = path.join(home, 'src.md');
  fs.writeFileSync(src, BODY);
  await skillAdd({ target: '', file: src, name: 'edited-skill' });

  const file = path.join(skillsDir(home), 'edited-skill', 'SKILL.md');
  fs.writeFileSync(file, BODY + '\nmy local edits\n');

  const r = await skillAdd({ target: '', file: src, name: 'edited-skill' });

  assert.equal(r.ok, false, 'a hand-edited skill is never claimed back');
  assert.match(r.text, /present \(modified since aio installed it\) — skipped/);
  assert.match(r.text, /edited-skill/, 'name in the report');
  assert.ok(fs.readFileSync(file, 'utf8').includes('my local edits'), 'user edits untouched');
});

/* ---------------- skillList ---------------- */

test('skillList: empty root vs mixed tracked/untracked directories', async (t) => {
  const home = fixtureHome(t);
  const root = skillsDir(home);

  const empty = skillList();
  assert.equal(empty.ok, true);
  assert.match(empty.text, /^aio skill list/, 'header');
  assert.match(empty.text, /\(empty\) — install one: aio skill add/, 'empty hint');
  assert.ok(empty.text.includes(`root: ${root}`), 'root echoed');

  const a = path.join(root, 'list-a');
  const b = path.join(root, 'list-b');
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(b, { recursive: true });
  fs.mkdirSync(path.join(root, 'no-file')); // no SKILL.md → skipped
  fs.writeFileSync(path.join(a, 'SKILL.md'), BODY);
  fs.writeFileSync(path.join(b, 'SKILL.md'), BODY);
  putLedger([{ name: 'list-a', file: path.join(a, 'SKILL.md'), sha: 'x'.repeat(16), source: 'local' }]);

  const mixed = skillList();
  assert.ok(mixed.text.includes('[x] list-a'), 'tracked skill marked [x]');
  assert.match(mixed.text, /list-a\s+aio/, 'tracked label');
  assert.ok(mixed.text.includes('[ ] list-b'), 'your own skill marked [ ]');
  assert.match(mixed.text, /list-b\s+yours/, 'untracked label');
  assert.ok(!mixed.text.includes('no-file'), 'directories without SKILL.md are skipped');
  assert.ok(!mixed.text.includes('(empty)'), 'no empty hint once something is found');
});

/* ---------------- skillRemove ---------------- */

test('skillRemove: success / not installed / hand-modified refusal', async (t) => {
  const home = fixtureHome(t);
  const src = path.join(home, 'src.md');
  fs.writeFileSync(src, BODY);
  await skillAdd({ target: '', file: src, name: 'rm-me' });
  await skillAdd({ target: '', file: src, name: 'rm-edit' });

  const gone = skillRemove({ target: 'rm-me' });
  assert.equal(gone.ok, true, gone.text);
  assert.match(gone.text, /removed — /);
  assert.ok(!fs.existsSync(path.join(skillsDir(home), 'rm-me')), 'directory deleted');
  assert.ok(!readLedger().some((e) => e.name === 'rm-me'), 'ledger entry dropped');

  const missing = skillRemove({ target: 'not-installed-skill' });
  assert.equal(missing.ok, false);
  assert.match(missing.text, /not installed — /);

  fs.writeFileSync(path.join(skillsDir(home), 'rm-edit', 'SKILL.md'), BODY + '\nhand edits\n');
  const modified = skillRemove({ target: 'rm-edit' });
  assert.equal(modified.ok, false, 'hand-edited → never deleted');
  assert.match(modified.text, /modified since aio installed it — aio will not delete your edits; remove manually/);
  assert.ok(fs.existsSync(path.join(skillsDir(home), 'rm-edit', 'SKILL.md')), 'file kept');
});

/* ---------------- removeSkillAdditions ---------------- */

test('removeSkillAdditions: already-gone entry dropped; path-mismatch entry invalid + kept', (t) => {
  const home = fixtureHome(t);
  const root = skillsDir(home);
  const ghostFile = path.join(root, 'ghost', 'SKILL.md'); // never created
  const mismatchFile = 'D:/somewhere/else/SKILL.md';
  putLedger([
    { name: 'ghost', file: ghostFile, sha: 'a'.repeat(16) },
    { name: 'mis', file: mismatchFile, sha: 'b'.repeat(16) },
  ]);

  const out = removeSkillAdditions();

  assert.deepEqual(
    out.map((o) => o.status),
    ['already gone', 'ledger entry invalid — kept (manual review)'],
    `statuses: ${JSON.stringify(out)}`
  );
  const kept = readLedger();
  assert.deepEqual(kept.map((e) => e.name), ['mis'], 'gone dropped, mismatch kept for review');
  assert.ok(!fs.existsSync(ghostFile), 'nothing to delete for a gone skill');
});
