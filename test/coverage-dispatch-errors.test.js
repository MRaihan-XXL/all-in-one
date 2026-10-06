// coverage-dispatch-errors.test.js — bin/aio.js dispatch lanes the happy paths
// in coverage-bin.test.js never reach:
//   • AIO_LANG=id → Bahasa help text (HELP_ID)
//   • a launch with NO script token (bare `node -e "await import(bin)"`) →
//     rawArgs empty → default setup plan-stop
//   • `status` on a healthy machine → exit 0 (r.ok ? 0 : 1 true arm)
//   • every command-level catch: status / rollback / borrow / skill / doctor /
//     init — each forced by a path that is a DIRECTORY where a file is read
//     (EISDIR) or a FILE where a directory is read (ENOTDIR)
//   • rollback's incomplete contract (corrupt ledger → refusal row → exit 1)
//   • `completion` with no shell → usage refusal
// SAFETY (hermetic child env, same shape as coverage-bin.test.js):
//   PATH=''                 → git/npm/gh unreachable, zero network
//   USERPROFILE/HOME/APPDATA/AIO_STATE_DIR → fresh temp dirs per scenario
//   AIO_OFFLINE/NO_GH/RATE  → no probes; OLLAMA_HOST → closed port
// No real home, no real roaming profile, no writes outside temp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/aio.js', import.meta.url));
const REPO = fileURLToPath(new URL('../', import.meta.url));
const BIN_URL = pathToFileURL(BIN).href;

/** Fresh hermetic env per scenario: temp HOME/STATE/APPDATA, nothing shared. */
function envFor(t, extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-d-home-'));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-d-state-'));
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-d-app-'));
  t.after(() => {
    for (const d of [home, state, appdata]) fs.rmSync(d, { recursive: true, force: true });
  });
  return {
    home,
    state,
    appdata,
    env: {
      ...process.env,
      PATH: '',
      USERPROFILE: home,
      HOME: home,
      APPDATA: appdata,
      AIO_STATE_DIR: state,
      AIO_OFFLINE: '1',
      AIO_NO_GH: '1',
      AIO_RATE: '0',
      OLLAMA_HOST: 'http://127.0.0.1:1',
      NO_COLOR: '1',
      ...extra,
    },
  };
}

/** Spawn `node <argv>` hermetically. argv carries BIN as its first element. */
function run(env, cwd, argv) {
  const r = spawnSync(process.execPath, argv, {
    env,
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
    shell: false,
  });
  assert.ifError(r.error);
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') };
}

/** A throwaway dir the test removes afterwards. */
function scratch(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/* ---------------- help text (HELP_ID) ---------------- */

test('--help with AIO_LANG=id → Bahasa Indonesia help, exit 0', (t) => {
  const { env } = envFor(t, { AIO_LANG: 'id' });
  const r = run(env, REPO, [BIN, '--help']);

  assert.equal(r.status, 0);
  assert.match(r.stdout, /autokoneksikan setiap AI agent/, 'HELP_ID selected by AIO_LANG=id');
  assert.doesNotMatch(r.stdout, /auto-connect every AI agent/, 'never the English text');
});

/* ---------------- launch-style detection (rawArgs empty) ---------------- */

test('launch without a script token → rawArgs empty → default setup plan-stop, exit 0', (t) => {
  const { env } = envFor(t);
  // `node -e` carries NO argv[1]: process.argv is [execPath] only, so the bin
  // sees rawArgs = [] → scriptTok '' → parseArgs([]) → default command
  const r = run(env, REPO, ['--input-type=module', '-e', `await import(${JSON.stringify(BIN_URL)});`]);

  assert.equal(r.status, 0, 'a non-interactive plan is not an error');
  assert.match(r.stdout, /non-interactive session/, 'default setup ran in plan mode');
});

/* ---------------- status: healthy (exit 0) vs throwing (catch) ---------------- */

test('status after a fresh --yes → healthy machine, exit 0', (t) => {
  const { env } = envFor(t);
  const applied = run(env, REPO, [BIN, '--yes']);
  assert.equal(applied.status, 0, 'setup apply works in temp state');

  const r = run(env, REPO, [BIN, 'status']);

  assert.equal(r.status, 0, 'fresh live manifest + no agent config dirs → no issues');
  assert.match(r.stdout, /healthy — no issues found/, 'the healthy verdict');
});

test('status: manifest path is a directory → readFileSync throws → catch, exit 1', (t) => {
  const { env, state } = envFor(t);
  fs.mkdirSync(path.join(state, 'aio-context.md')); // exists → read → EISDIR

  const r = run(env, REPO, [BIN, 'status']);

  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[aio\] status failed: /, 'the original error is surfaced verbatim');
});

/* ---------------- rollback: incomplete contract vs catch ---------------- */

test('rollback: corrupt mcp ledger → refusal row → incomplete → exit 1', (t) => {
  const { env, state } = envFor(t);
  fs.writeFileSync(path.join(state, 'mcp-ledger.json'), '["truncated"');

  const r = run(env, REPO, [BIN, 'rollback']);

  assert.equal(r.status, 1, 'a rollback that kept rows behind fails (5g)');
  assert.match(r.stdout, /rollback incomplete/, 'the incomplete verdict on stdout');
});

test('rollback: an instruction file that is a directory → stripBlock throws → catch, exit 1', (t) => {
  const { env, home } = envFor(t);
  fs.mkdirSync(path.join(home, '.config', 'opencode', 'AGENTS.md'), { recursive: true });

  const r = run(env, REPO, [BIN, 'rollback']);

  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[aio\] rollback failed: /, 'the original error is surfaced verbatim');
});

/* ---------------- borrow: purge runs before any search ---------------- */

test('borrow: BORROW_DIR resolves to a plain file → readdirSync ENOTDIR → catch, exit 1', (t) => {
  const tmp = scratch(t, 'aio-d-tmp-');
  // BORROW_DIR = <tmpdir>/aio-borrow is baked at import — make it a FILE so the
  // TTL purge dies with ENOTDIR before any query, clone or network call
  fs.writeFileSync(path.join(tmp, 'aio-borrow'), 'not a directory');
  const { env } = envFor(t, { TEMP: tmp, TMP: tmp, TMPDIR: tmp });

  const r = run(env, REPO, [BIN, 'borrow', 'pdf tool']);

  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[aio\] borrow failed: /, 'the original error is surfaced verbatim');
});

/* ---------------- skill: local file lane that explodes on read ---------------- */

test('skill add --file <dir> whose SKILL.md is a directory → EISDIR → catch, exit 1', (t) => {
  const dir = scratch(t, 'aio-d-skill-');
  fs.mkdirSync(path.join(dir, 'SKILL.md')); // exists as a DIRECTORY → read throws
  const { env } = envFor(t);

  const r = run(env, REPO, [BIN, 'skill', 'add', '--file', dir]);

  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[aio\] skill failed: /, 'the original error is surfaced verbatim');
});

/* ---------------- completion: no shell argument ---------------- */

test('completion without a shell → usage refusal, exit 1', (t) => {
  const { env } = envFor(t);

  const r = run(env, REPO, [BIN, 'completion']);

  assert.equal(r.status, 1, 'an unknown shell is not ok');
  assert.match(r.stdout, /usage: aio completion bash\|zsh\|fish\|pwsh/, 'the usage line');
});

/* ---------------- doctor: runChecks explodes before reporting ---------------- */

test('doctor: manifest path is a directory → runChecks throws → catch, exit 1', (t) => {
  const { env, state } = envFor(t);
  fs.mkdirSync(path.join(state, 'aio-context.md')); // exists → read → EISDIR

  const r = run(env, REPO, [BIN, 'doctor']);

  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[aio\] doctor failed: /, 'the original error is surfaced verbatim');
});

/* ---------------- init: the write gate actually applies ---------------- */

test('init --yes: ./AGENTS.md is a directory → apply() throws → catch, exit 1', (t) => {
  const project = scratch(t, 'aio-d-proj-');
  fs.mkdirSync(path.join(project, 'AGENTS.md')); // apply() reads it → EISDIR
  const { env } = envFor(t);

  const r = run(env, project, [BIN, 'init', '--yes']);

  assert.equal(r.status, 1, '--yes skips the plan and goes straight to apply()');
  assert.match(r.stderr, /\[aio\] init failed: /, 'the original error is surfaced verbatim');
});

/* ---------------- ask / agent: a real success (r.ok ? 0 : 1 → 0) ---------------- */

// Hermetic fetch stub preloaded with --import: GitHub/npm/crates answer with
// the payloads the live clients parse, every other host 404s (web lanes land in
// errors[] only). Real Response objects so res.ok/res.json()/headers behave
// exactly like production — zero network, deterministic, no live service.
const FETCH_STUB = `
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('api.github.com')) return json({ items: [{ full_name: 'demo/stub-tool', html_url: 'https://github.com/demo/stub-tool', description: 'Stub tool for coverage', stargazers_count: 42, language: 'JavaScript', pushed_at: '2026-01-01T00:00:00Z' }] });
  if (u.includes('registry.npmjs.org')) return json({ objects: [{ package: { name: 'stub-pkg', description: 'Stub package for coverage', version: '1.0.0', keywords: ['stub'], score: { final: 0.5 } } }] });
  if (u.includes('crates.io')) return json({ crates: [{ id: 'stub-crate', description: 'Stub crate for coverage', max_stable_version: '1.0.0', downloads: 10 }] });
  return new Response('stub: lane unavailable', { status: 404 });
};
`;

test('ask/agent with a stubbed network → a source answers → ok:true → exit 0', (t) => {
  const dir = scratch(t, 'aio-d-net-');
  const stub = path.join(dir, 'fetch-stub.mjs');
  fs.writeFileSync(stub, FETCH_STUB);
  // online (AIO_OFFLINE must not be '1'); AIO_NO_AI skips the Ollama rerank lane
  const { env } = envFor(t, { AIO_OFFLINE: '', AIO_NO_AI: '1' });
  const argv = ['--import', pathToFileURL(stub).href, BIN];

  const ask = run(env, REPO, [...argv, 'ask', 'demo tool']);
  assert.equal(ask.status, 0, `ask ok:true → exit 0; stdout: ${ask.stdout.slice(0, 300)} | stderr: ${ask.stderr}`);
  assert.match(ask.stdout, /aio ask — "demo tool"/, 'the ask header');

  const agent = run(env, REPO, [...argv, 'agent', 'demo tool']);
  assert.equal(agent.status, 0, `agent ok:true → exit 0; stdout: ${agent.stdout.slice(0, 300)} | stderr: ${agent.stderr}`);
  assert.match(agent.stdout, /aio agent — "demo tool"/, 'the agent header');
});
