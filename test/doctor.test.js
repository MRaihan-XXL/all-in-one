// doctor.test.js — `aio doctor` self-diagnosis (isolated state, no fixes, no Ollama dependency).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-doctor-state-'));
const { runChecks, runDoctor } = await import('../src/doctor.js');

test('runChecks: returns structured checks (levels + ids), never throws', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-doctor-home-'));
  const r = await runChecks({ home });
  assert.ok(Array.isArray(r.checks) && r.checks.length >= 6, 'at least 6 checks');
  for (const c of r.checks) {
    assert.ok(['ok', 'warn', 'bad'].includes(c.level), `level: ${c.level}`);
    assert.ok(c.id && c.detail !== undefined, 'id + detail present');
    assert.match(c.text, /^\[(ok|~~|!!)\]/, 'tagged line format');
  }
  assert.ok(r.checks.some((c) => c.id === 'node'), 'node check exists');
  assert.ok(r.checks.some((c) => c.id === 'manifest'), 'manifest check exists');
  assert.ok(r.checks.some((c) => c.id === 'agent blocks'), 'agent blocks check exists');
  assert.equal(typeof r.ok, 'boolean');
});

test('runChecks: fixture home (no db/manifest) → issues flagged, ok=false', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-doctor-home2-'));
  const r = await runChecks({ home });
  assert.equal(r.ok, false, 'missing catalog must be an issue');
  assert.ok(r.issues >= 1);
  assert.ok(r.checks.some((c) => c.id === 'catalog db' && c.level === 'bad'));
  assert.ok(r.checks.some((c) => c.id === 'manifest' && c.level === 'bad'));
});

test('runDoctor: report text + exit 1 when issues exist', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-doctor-home3-'));
  const r = await runDoctor({ home });
  assert.match(r.text, /aio doctor/);
  assert.match(r.text, /issue\(s\)/);
  assert.equal(r.exit, 1, 'issues → exit 1');
  assert.equal(r.ok, false);
});
