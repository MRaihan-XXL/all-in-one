// verify.js — `aio verify`: run the self-upgrade pipeline as one command and
// report what changed. Never commits/pushes by itself (git stays with the human).
// Pipeline: setup (manifest+blocks) → doctor --check → tests.
// No install-plan scan exists here (the dev-only scripts/install-tools.mjs was
// removed); verify never touches repositories beyond this repo's own checkout.
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getVersion } from './banner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function step(name, file, args = []) {
  const started = Date.now();
  try {
    execFileSync(process.execPath, [file, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
    return { name, ok: true, ms: Date.now() - started, out: 'ok' };
  } catch (e) {
    const tail = (e.stdout ? String(e.stdout) : e.stderr ? String(e.stderr) : e.message).trim().split('\n').slice(-3).join(' | ');
    return { name, ok: false, ms: Date.now() - started, out: tail.slice(0, 240) };
  }
}

/** `aio verify` command (CLI alias: `aio evolve`) → { ok, text, exit }. */
export async function runVerify() {
  // A compiled binary (or a partial install) has no package.json/test/ next to
  // itself — the pipeline would re-exec the wrong binary. Fail honestly instead.
  if (!fs.existsSync(path.join(ROOT, 'package.json')) || !fs.existsSync(path.join(ROOT, 'test'))) {
    return {
      ok: false,
      exit: 1,
      text:
        `aio verify — self-test pipeline needs a source checkout (looked in ${ROOT}).\n` +
        'Binary build: install the npm package (`npm i -g aio-connect`) or clone the repo, then run `aio verify` there.',
    };
  }
  const results = [];

  // 1. Regenerate manifest + reinject agent blocks (idempotent).
  //    --yes: the pipeline itself is the consent (non-TTY gate would stop at the plan).
  results.push(step('aio setup (manifest+blocks)', path.join(ROOT, 'bin', 'aio.js'), ['--yes']));

  // 2. Health gate.
  results.push(step('doctor --check', path.join(ROOT, 'bin', 'aio.js'), ['doctor', '--check']));

  // 3. Tests (only reachable in a source checkout — the guard above requires test/).
  const testStep = (() => {
    const started = Date.now();
    try {
      execFileSync('npm', ['test'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000, shell: true });
      return { name: 'npm test', ok: true, ms: Date.now() - started, out: 'all pass' };
    } catch (e) {
      const tail = (e.stdout ? String(e.stdout) : String(e.stderr)).trim().split('\n').slice(-4).join(' | ');
      return { name: 'npm test', ok: false, ms: Date.now() - started, out: tail.slice(0, 300) };
    }
  })();
  results.push(testStep);

  const ok = results.every((r) => r.ok);
  const lines = [
    `aio verify — v${getVersion()} self-upgrade pipeline`,
    '─'.repeat(76),
    ...results.map((r) => `  [${r.ok ? 'x' : '!!'}] ${r.name.padEnd(28)} ${(r.ms / 1000).toFixed(1)}s  ${r.out}`),
    '─'.repeat(76),
    ok
      ? 'pipeline green — review the diff (git status) and commit when ready.'
      : 'pipeline FAILED — fix the [!!] step above, then re-run `aio verify`.',
    `next: git diff  ·  nothing was committed or pushed automatically.`,
  ];
  return { ok, text: lines.join('\n'), exit: ok ? 0 : 1 };
}
