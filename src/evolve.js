// evolve.js — `aio evolve`: run the full self-upgrade pipeline as one command and
// report what changed. Never commits/pushes by itself (git stays with the human).
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolveReposDir } from './paths.js';
import { getVersion } from './banner.js';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const ROOT = path.resolve(HERE, '..');

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

/** `aio evolve` command → { ok, text, exit }. */
export async function runEvolve(opts = {}) {
  const reposDir = resolveReposDir(opts.repos);
  const results = [];

  // 1. Install plan refresh (local clones only — the catalog itself is live).
  const hasClones = reposDir && fs.existsSync(reposDir) &&
    fs.readdirSync(reposDir, { withFileTypes: true }).some((d) => d.isDirectory());
  results.push(
    hasClones
      ? step('scan (install plan)', path.join(ROOT, 'scripts', 'install-tools.mjs'), ['scan'])
      : { name: 'scan (install plan)', ok: true, ms: 0, out: 'skipped — no local clones (catalog is live)' }
  );

  // 2. Regenerate manifest + reinject agent blocks (idempotent).
  results.push(step('aio setup (manifest+blocks)', path.join(ROOT, 'bin', 'aio.js'), []));

  // 3. Health gate.
  results.push(step('doctor --check', path.join(ROOT, 'bin', 'aio.js'), ['doctor', '--check']));

  // 4. Tests.
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
    `aio evolve — v${getVersion()} self-upgrade pipeline`,
    '─'.repeat(76),
    ...results.map((r) => `  [${r.ok ? 'x' : '!!'}] ${r.name.padEnd(28)} ${(r.ms / 1000).toFixed(1)}s  ${r.out}`),
    '─'.repeat(76),
    ok
      ? 'pipeline green — review the diff (git status) and commit when ready.'
      : 'pipeline FAILED — fix the [!!] step above, then re-run `aio evolve`.',
    `next: git diff  ·  nothing was committed or pushed automatically.`,
  ];
  return { ok, text: lines.join('\n'), exit: ok ? 0 : 1 };
}
