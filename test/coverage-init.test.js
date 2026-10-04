// coverage-init.test.js — src/init.js lanes v150.test.js misses: the --copilot
// DRY branch (would inject / would update), the copilot "unchanged" rerun, and
// the apply report line for copilot. cwd is swapped per test; state is a temp dir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AIO_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-initcov-'));

const { runInit } = await import('../src/init.js');
const { STATE_DIR } = await import('../src/paths.js');

/** Run runInit in a fresh temp project dir; return { logs, cwd, prev }. */
async function inProject(t, opts, setup) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-initproj-'));
  setup?.(cwd);
  const prev = process.cwd();
  process.chdir(cwd);
  t.after(() => process.chdir(prev));
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  await runInit(opts);
  return { logs: logs.join('\n'), cwd };
}

function tree(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...tree(p).map((x) => `${e.name}/${x}`));
    else out.push(e.name);
  }
  return out.sort();
}

test('runInit dry --copilot, no .github yet → would inject, zero files written', async (t) => {
  const { logs, cwd } = await inProject(t, { dryRun: true, copilot: true });
  assert.match(logs, /would inject \(dry-run\)/, 'dry copilot lane reports the planned inject');
  assert.match(logs, /DRY RUN \(nothing written\)/, 'dry header');
  assert.deepEqual(tree(cwd), [], 'a dry run creates nothing, not even .github/');
  assert.ok(!logs.includes('Done. Commit'), 'apply footer suppressed on dry');
});

test('runInit dry --copilot over an existing pointer → would update, team content untouched', async (t) => {
  const { logs, cwd } = await inProject(t, { dryRun: true, copilot: true }, (dir) => {
    fs.mkdirSync(path.join(dir, '.github'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'team rules, do not clobber\n');
  });
  assert.match(
    logs,
    /would update \(dry-run; existing content backed up on write\)/,
    'existing copilot file → update-not-inject wording',
  );
  assert.equal(
    fs.readFileSync(path.join(cwd, '.github', 'copilot-instructions.md'), 'utf8'),
    'team rules, do not clobber\n',
    'dry run never touches the existing file',
  );
});

test('runInit --copilot twice → second pass reports unchanged for both files', async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-initproj-'));
  const prev = process.cwd();
  process.chdir(cwd);
  t.after(() => process.chdir(prev));

  // first pass applies (writes AGENTS.md + pointer), second must be a no-op
  t.mock.method(console, 'log', () => {});
  await runInit({ copilot: true });
  t.mock.restoreAll();
  assert.deepEqual(tree(cwd), ['.github/copilot-instructions.md', 'AGENTS.md'], 'first pass wrote both files');

  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  await runInit({ copilot: true });
  const out = logs.join('\n');

  assert.match(out, /\[x\] AGENTS\.md\s+unchanged/, 'AGENTS.md already carries the block');
  assert.match(out, /\[x\] \.github\/copilot-instructions\.md\s+unchanged/, 'copilot pointer byte-identical');
  assert.match(out, /Done\. Commit AGENTS\.md \+ \.github\/copilot-instructions\.md/, 'apply footer names both files');
  assert.deepEqual(tree(cwd), ['.github/copilot-instructions.md', 'AGENTS.md'], 'rerun wrote nothing new');
});

test('runInit report: manifest present → block carries the pointer path; apply footer reminds global vs project', async (t) => {
  fs.writeFileSync(path.join(STATE_DIR, 'aio-context.md'), '# aio context\nLive architecture\n');
  const { logs, cwd } = await inProject(t, { dryRun: false });
  const agents = fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes(path.join(STATE_DIR, 'aio-context.md')), 'block points at the real manifest');
  assert.match(logs, /Reminder: `aio` \(global\) wires your machine; `aio init` wires THIS repo\./, 'footer');
  assert.ok(!logs.includes('.github/copilot-instructions.md so every'), 'no copilot mention without the flag');
});
