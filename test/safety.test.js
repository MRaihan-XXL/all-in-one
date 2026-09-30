// safety.test.js — dry-run + rollback guarantees of src/write.js (isolated state, temp fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-safety-')); // backups/state → temp dir, never ~/.aio
process.env.AIO_NO_AI = '1'; // deterministic: no Ollama

const { injectBlock, ensureJsonEntry, stripBlock, BLOCK_START, BLOCK_END } = await import('../src/write.js');
const { STATE_DIR, BACKUP_DIR } = await import('../src/paths.js');

/** Files currently resting in BACKUP_DIR (0 when the dir does not exist yet). */
function backupCount() {
  return fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).length : 0;
}

/** Fresh temp fixture file with the given content. */
function fixture(prefix, name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

test('injectBlock dry-run: reports plan, writes nothing', () => {
  assert.ok(STATE_DIR.includes('aio-safety-'), 'state isolated in a temp dir');
  assert.ok(BACKUP_DIR.startsWith(STATE_DIR), 'BACKUP_DIR lives under STATE_DIR');
  const file = fixture('aio-safe-inj-', 'docs.md', '# docs\n');
  const before = fs.readFileSync(file, 'utf8');
  const n0 = backupCount();

  const r = injectBlock(file, 'BODY', 'lbl', { dry: true });

  assert.equal(r.status, 'would inject (dry-run)');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'file byte-identical after dry run');
  assert.equal(backupCount(), n0, 'no backup written (dir empty/nonexistent stays that way)');
});

test('injectBlock dry-run: existing block → would update, content untouched', () => {
  const file = fixture('aio-safe-upd-', 'rules.md', `# docs\n${BLOCK_START}\nold body\n${BLOCK_END}\n`);
  const before = fs.readFileSync(file, 'utf8');
  const n0 = backupCount();

  const r = injectBlock(file, 'NEW BODY', 'lbl', { dry: true });

  assert.equal(r.status, 'would update (dry-run)');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'content byte-identical after dry run');
  assert.ok(fs.readFileSync(file, 'utf8').includes('old body'), 'old body still present');
  assert.equal(backupCount(), n0, 'no backup written');
});

test('ensureJsonEntry dry-run: would add, config byte-identical, no backup', () => {
  const file = fixture('aio-safe-json-', 'settings.json', '{"mcpServers":{}}');
  const before = fs.readFileSync(file, 'utf8');
  const n0 = backupCount();

  const r = ensureJsonEntry(file, 'k', { command: 'x' }, 'lbl', 'mcpServers', false, { dry: true });

  assert.equal(r.status, 'would add (dry-run)');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'config byte-identical after dry run');
  assert.equal(backupCount(), n0, 'no backup written');
});

test('ensureJsonEntry: malformed config → parse error, file NOT overwritten', () => {
  const bad = '{not json';
  const file = fixture('aio-safe-bad-', 'settings.json', bad);
  const n0 = backupCount();

  const r = ensureJsonEntry(file, 'k', { command: 'x' }, 'lbl', 'mcpServers', false);

  assert.ok(r.status.startsWith('parse error:'), `expected parse error, got: ${r.status}`);
  assert.equal(fs.readFileSync(file, 'utf8'), bad, 'partial-failure safety: malformed file untouched');
  assert.equal(backupCount(), n0, 'no backup written on parse failure');
});

test('rollback round-trip: inject → strip restores original + keeps backup', () => {
  const file = fixture('aio-safe-roll-', 'agents.md', '# my header\n');
  const n0 = backupCount();

  assert.equal(injectBlock(file, 'BODY', 'lbl').status, 'injected');
  const injected = fs.readFileSync(file, 'utf8');
  assert.ok(injected.includes(BLOCK_START), 'block written');
  const n1 = backupCount();
  assert.ok(n1 > n0, `inject backed up first (${n0} → ${n1})`);

  assert.equal(stripBlock(file), 'removed');
  const restored = fs.readFileSync(file, 'utf8');
  assert.ok(!restored.includes(BLOCK_START), 'block gone');
  assert.ok(!restored.includes('BODY'), 'body gone');
  assert.ok(restored.startsWith('# my header'), 'original header preserved');
  const n2 = backupCount();
  assert.ok(n2 > n1, `strip backed up the injected state too (${n1} → ${n2})`);
});

test('ensureJsonEntry: existing key → present, file untouched', () => {
  const orig = '{"mcpServers":{"k":{"command":"y"}}}\n';
  const file = fixture('aio-safe-idem-', 'settings.json', orig);
  const n0 = backupCount();

  const r = ensureJsonEntry(file, 'k', { command: 'x' }, 'lbl', 'mcpServers', false);

  assert.equal(r.status, 'present');
  assert.equal(fs.readFileSync(file, 'utf8'), orig, 'idempotent hit → file not rewritten');
  assert.equal(backupCount(), n0, 'no backup for a no-op');
});
