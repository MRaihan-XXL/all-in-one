// coverage-gates.test.js — the recorded coverage gates that `npm test` and CI
// enforce, and the parser shape scripts/verify-scorecard.mjs uses on them:
//   • package.json `test:coverage` carries --test-coverage-lines=90 /
//     --test-coverage-branches=80 / --test-coverage-functions=85 (>= the
//     documented floor) plus the enabling --experimental-test-coverage flag
//   • the `test` script chains node --test → verify-scorecard.mjs
//   • .github/workflows/ci.yml runs the identical gate flags
// Why here: the scorecard only runs inside `npm test`, never in `node --test`,
// so nothing in the suite would notice the gates being lowered or dropped.
// Read-only: parses files, no spawns, no network (the stats pipeline is
// deliberately NOT run — it re-executes the suite and the coverage report).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Same regex shape the scorecard's `at()` helper uses: --test-coverage-<k>=<n>. */
function gate(script, k) {
  const m = String(script).match(new RegExp(`--test-coverage-${k}=(\\d+)`));
  return m ? Number(m[1]) : null;
}

test('test:coverage script: gates present and >= 90/80/85 (scorecard parser shape)', () => {
  const c = pkg.scripts?.['test:coverage'];
  assert.ok(c, 'package.json defines test:coverage');
  assert.match(c, /node --test/, 'the gate runs the real suite');
  assert.match(c, /--experimental-test-coverage/, 'gates only bite with the coverage flag');

  assert.equal(gate(c, 'lines'), 90, 'lines gate is 90 (parseable, not silently lowered)');
  assert.equal(gate(c, 'branches'), 80, 'branches gate is 80');
  assert.equal(gate(c, 'functions'), 85, 'functions gate is 85');
});

test('npm test chain: node --test first, then the release scorecard', () => {
  const t = pkg.scripts?.test || '';
  assert.match(t, /node --test/, 'the suite is the first step');
  assert.match(
    t,
    /node --test[\s\S]*&&[\s\S]*verify-scorecard\.mjs/,
    'the scorecard runs after the suite (never re-runs it — circularity guard)',
  );
});

test('CI workflow enforces the same coverage gate flags', () => {
  const ci = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

  assert.match(ci, /--test-coverage-lines=90/, 'CI lines gate matches the package.json floor');
  assert.match(ci, /--test-coverage-branches=80/, 'CI branches gate matches');
  assert.match(ci, /--test-coverage-functions=85/, 'CI functions gate matches');
  assert.match(ci, /verify-scorecard\.mjs/, 'CI also runs the scorecard');
});
