// coverage-evolve.test.js — src/evolve.js's source-checkout guard: no package.json
// or no test/ → honest early failure, never spawning the pipeline. fs.existsSync
// (a default import, so the module sees the mock) decides the lane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { runEvolve } = await import('../src/evolve.js');

test('runEvolve: no package.json at ROOT → early failure, no pipeline children', async (t) => {
  t.mock.method(fs, 'existsSync', () => false);

  const r = await runEvolve({});

  assert.equal(r.ok, false);
  assert.equal(r.exit, 1);
  assert.match(r.text, /needs a source checkout/, 'says what it looked for');
  assert.match(r.text, /npm i -g aio-connect/, 'binary-build guidance');
});

test('runEvolve: package.json present but test/ missing → same honest guard', async (t) => {
  t.mock.method(fs, 'existsSync', (p) => String(p).endsWith('package.json'));

  const r = await runEvolve({});

  assert.equal(r.ok, false);
  assert.equal(r.exit, 1);
  assert.match(r.text, /needs a source checkout/, 'second || branch hits the guard');
});
