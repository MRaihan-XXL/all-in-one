// selfcheck.js — one self-check per critical invariant (node --test, no framework)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-selfcheck-'));
process.env.AIO_STATE_DIR = path.join(tmp, 'state'); // isolate ~/.aio side effects

const { injectBlock, stripBlock, buildBlock, ensureJsonEntry, ensureTomlEntry } = await import('../src/write.js');
const { detectAgents } = await import('../src/scan.js');
const { ART, banner } = await import('../src/banner.js');

test('injectBlock: exactly one block, refreshed in place, prefix kept (FR4)', () => {
  const f = path.join(tmp, 'AGENTS.md');
  fs.writeFileSync(f, '# My rules\nkeep me\n');
  assert.equal(injectBlock(f, 'body-v1', 't').status, 'injected');
  assert.equal(injectBlock(f, 'body-v2', 't').status, 'updated');
  assert.equal(injectBlock(f, 'body-v2', 't').status, 'unchanged');
  const txt = fs.readFileSync(f, 'utf8');
  assert.equal(txt.split('aio:auto-config:v1:start').length - 1, 1);
  assert.ok(txt.includes('body-v2'), 'new body present');
  assert.ok(!txt.includes('body-v1'), 'old body gone');
  assert.ok(txt.startsWith('# My rules\nkeep me'), 'user content preserved');
});

test('stripBlock: removes injected block, restores original (FR7)', () => {
  const f = path.join(tmp, 'rules2.md');
  const orig = 'keep this\n';
  fs.writeFileSync(f, orig);
  injectBlock(f, 'B', 't');
  assert.equal(stripBlock(f), 'removed');
  assert.equal(fs.readFileSync(f, 'utf8'), orig);
  assert.equal(stripBlock(f), 'absent');
});

test('buildBlock: mandatory usage-disclosure line (FR6)', () => {
  const b = buildBlock({ version: '1.0.0', manifestPath: '/tmp/m.md', dataDir: null });
  assert.ok(b.includes('[aio] Using [<name>](<url>) (<type>) — <function>'));
  assert.ok(b.includes('NO slash-commands'));
  assert.ok(b.includes('/tmp/m.md'));
});

test('ensureJsonEntry: create=true bootstraps file inside existing dir (gemini)', () => {
  const dir = path.join(tmp, '.gemini');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'settings.json');
  assert.equal(
    ensureJsonEntry(f, 'codebase-memory-mcp', { command: '/bin/mcp' }, 't', 'mcpServers', true).status,
    'added'
  );
  assert.equal(
    ensureJsonEntry(f, 'codebase-memory-mcp', { command: '/bin/mcp' }, 't', 'mcpServers', true).status,
    'present'
  );
  assert.ok(JSON.parse(fs.readFileSync(f, 'utf8')).mcpServers['codebase-memory-mcp']);
  // no parent dir → still skipped, nothing created
  assert.equal(
    ensureJsonEntry(path.join(tmp, 'no-such-dir', 'x.json'), 'k', {}, 't', 's', true).status,
    'file not found — skipped'
  );
});

test('ensureTomlEntry: appends [mcp_servers.key] exactly once, idempotent (codex)', () => {
  const f = path.join(tmp, 'config.toml');
  fs.writeFileSync(f, 'model = "gpt"\n');
  const e = { command: 'C:\\bin\\mcp.exe' };
  assert.equal(ensureTomlEntry(f, 'codebase-memory-mcp', e, 't').status, 'added');
  assert.equal(ensureTomlEntry(f, 'codebase-memory-mcp', e, 't').status, 'present');
  const txt = fs.readFileSync(f, 'utf8');
  assert.equal(txt.split('[mcp_servers.codebase-memory-mcp]').length - 1, 1);
  assert.ok(txt.includes('model = "gpt"'), 'existing TOML kept');
  assert.ok(txt.includes('command = "C:\\\\bin\\\\mcp.exe"'), 'command escaped');
});

test('detectAgents: PATH binary OR instruction dir → found (codex/gemini)', () => {
  const list = detectAgents();
  assert.ok(list.some((a) => a.name === 'codex'));
  assert.ok(list.some((a) => a.name === 'gemini'));
  for (const a of list) assert.ok(typeof a.found === 'boolean');
});

test('banner: strict grid — every ART row same width, no crooked letters', () => {
  const w = ART[0].length;
  assert.ok(ART.length >= 4);
  for (const [i, line] of ART.entries()) {
    assert.equal(line.length, w, `row ${i} width ${line.length} != ${w}`);
  }
  assert.ok(banner().includes('all-in-one v'), 'branded tagline present');
});
