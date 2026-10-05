// dry-state.test.js — B1 regression net: a dry run must NEVER write state.
// Covers the self-healing ledger (mcp-ledger.json) + drift hash (block-hashes.json)
// side effects in the 'present'/'unchanged' branches of src/write.js, and the
// N5 stale-hash pruning of stripBlock.
// AIO_STATE_DIR → temp dir (paths.js reads it at import; must precede src imports).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-dry-state-')); // state/backups/hashes → temp dir (must precede src imports)
process.env.AIO_NO_GH = '1'; // no gh subprocess in tests
process.env.AIO_NO_AI = '1'; // deterministic: no Ollama rerank

const { injectBlock, stripBlock, ensureJsonEntry, ensureTomlEntry } = await import('../src/write.js');
const { STATE_DIR } = await import('../src/paths.js');

const LEDGER = path.join(STATE_DIR, 'mcp-ledger.json'); // self-healing MCP ledger (S-01)
const HASHES = path.join(STATE_DIR, 'block-hashes.json'); // drift hash (C-02)
// mirrors write.js hashKey — block-hashes keys are lowercased on win32 (6f)
const hk = (f) => (process.platform === 'win32' ? path.resolve(f).toLowerCase() : path.resolve(f));

/** Fresh temp fixture file with the given content. */
function fixture(prefix, name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const MCP_KEY = 'codebase-memory-mcp';
const MCP_ENTRY = { command: 'npx -y codebase-memory-mcp' };

/* ---------------- B1: dry run must not touch the ledger ---------------- */

test('B1: ensureJsonEntry present + dry → no ledger file; same call real → ledger records entry', () => {
  const file = fixture(
    'aio-dry-json-',
    'settings.json',
    JSON.stringify({ mcpServers: { [MCP_KEY]: MCP_ENTRY } }, null, 2) + '\n'
  );
  fs.rmSync(LEDGER, { force: true });

  const dry = ensureJsonEntry(file, MCP_KEY, MCP_ENTRY, 'claude-json', 'mcpServers', false, { dry: true });
  assert.equal(dry.status, 'present', 'exact-shape entry reports present');
  assert.equal(fs.existsSync(LEDGER), false, 'B1: dry run must not create the ledger');

  const real = ensureJsonEntry(file, MCP_KEY, MCP_ENTRY, 'claude-json', 'mcpServers', false, { dry: false });
  assert.equal(real.status, 'present');
  assert.ok(fs.existsSync(LEDGER), 'real run records the self-healing ledger');
  assert.deepEqual(readJson(LEDGER), [{ file, key: MCP_KEY }], 'ledger holds exactly that entry');
});

test('B1: ensureTomlEntry present + dry → no ledger file; same call real → ledger records entry', () => {
  const file = fixture(
    'aio-dry-toml-',
    'config.toml',
    [
      'model = "gpt"',
      '',
      `[mcp_servers.${MCP_KEY}]`,
      '# added by aio — remove via `aio rollback`',
      `command = ${JSON.stringify(MCP_ENTRY.command)}`,
      '',
    ].join('\n')
  );
  fs.rmSync(LEDGER, { force: true });

  const dry = ensureTomlEntry(file, MCP_KEY, MCP_ENTRY, 'codex-toml', { dry: true });
  assert.equal(dry.status, 'present', 'exact aio table + command line reports present');
  assert.equal(fs.existsSync(LEDGER), false, 'B1: dry run must not create the ledger');

  const real = ensureTomlEntry(file, MCP_KEY, MCP_ENTRY, 'codex-toml', { dry: false });
  assert.equal(real.status, 'present');
  assert.deepEqual(readJson(LEDGER), [{ file, key: MCP_KEY }], 'ledger holds exactly that entry');
});

/* ---------------- B1: unchanged branch must not touch block-hashes.json ---------------- */

test('B1: injectBlock unchanged branch — dry run neither creates nor modifies block-hashes.json', () => {
  const file = fixture('aio-dry-hash-', 'AGENTS.md', '# my rules\n');

  // real run first: establish the baseline hash entry
  assert.equal(injectBlock(file, 'BODY', 't').status, 'injected');
  assert.ok(fs.existsSync(HASHES), 'real run recorded the drift hash');
  const baseline = fs.readFileSync(HASHES, 'utf8');

  // dry rerun of the exact same block → byte-identical state
  assert.equal(injectBlock(file, 'BODY', 't', { dry: true }).status, 'unchanged');
  assert.equal(fs.readFileSync(HASHES, 'utf8'), baseline, 'dry run leaves block-hashes.json untouched');

  // delete the hash file → dry run must not recreate it
  fs.rmSync(HASHES, { force: true });
  assert.equal(injectBlock(file, 'BODY', 't', { dry: true }).status, 'unchanged');
  assert.equal(fs.existsSync(HASHES), false, 'B1: dry run must not create block-hashes.json');

  // real run (pre-1.5 self-heal path) DOES record the missing entry
  assert.equal(injectBlock(file, 'BODY', 't').status, 'unchanged');
  assert.ok(fs.existsSync(HASHES), 'real run records the missing hash entry');
  const stored = readJson(HASHES);
  assert.ok(stored[hk(file)], `hash entry present for ${hk(file)}`);
  assert.equal(Object.keys(stored).length, 1, 'exactly one file tracked');
});

/* ---------------- N5: stripBlock prunes stale hash keys ---------------- */

test('stripBlock: file without a block but with a stale hash entry → entry pruned', () => {
  const file = fixture('aio-dry-strip-', 'AGENTS.md', '# rules — no block here\n');
  fs.writeFileSync(HASHES, JSON.stringify({ [hk(file)]: '0123456789abcdef' }, null, 2));

  assert.equal(stripBlock(file), 'absent');
  assert.equal(readJson(HASHES)[hk(file)], undefined, 'stale drift key pruned');
  assert.ok(fs.existsSync(file), 'the file itself is left alone');
});

test('stripBlock: nonexistent path with a stale hash entry → entry pruned', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-dry-gone-'));
  const gone = path.join(dir, 'AGENTS.md'); // never created
  assert.equal(fs.existsSync(gone), false, 'precondition: file absent');
  fs.writeFileSync(HASHES, JSON.stringify({ [hk(gone)]: 'fedcba9876543210' }, null, 2));

  assert.equal(stripBlock(gone), 'absent');
  assert.equal(readJson(HASHES)[hk(gone)], undefined, 'stale drift key pruned for a missing file');
});
