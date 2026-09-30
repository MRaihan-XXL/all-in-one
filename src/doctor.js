// doctor.js — `aio doctor`: self-diagnosis of the whole aio installation.
// --check: read-only report, exit 1 when any [!!] issue exists (CI-friendly).
// --fix  : apply safe fixes (re-run the idempotent setup pipeline).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { STATE_DIR, readState } from './paths.js';
import { detectAgents } from './scan.js';
import { BLOCK_START } from './write.js';
import { getVersion } from './banner.js';

const AGENT_FILES = [
  ['.config/opencode/AGENTS.md', '.config/opencode'],
  ['.claude/CLAUDE.md', '.claude'],
  ['.kimi-code/AGENTS.md', '.kimi-code'],
  ['.jcode/AGENTS.md', '.jcode'],
  ['.codex/AGENTS.md', '.codex'],
  ['.gemini/GEMINI.md', '.gemini'],
  ['AGENTS.md', null],
];

function line(level, id, detail) {
  const tag = level === 'ok' ? '[ok]' : level === 'warn' ? '[~~]' : '[!!]';
  return { level, id, detail, text: `${tag} ${id.padEnd(14)} ${detail}` };
}

/** Run all checks. Returns { checks, issues, warns, ok }. */
export async function runChecks(opts = {}) {
  const home = os.homedir();
  const checks = [];

  // 1. Node
  const major = Number(process.versions.node.split('.')[0]);
  checks.push(
    major >= 22
      ? line('ok', 'node', `v${process.versions.node} (>= 22 recommended line)`)
      : major >= 18
        ? line('warn', 'node', `v${process.versions.node} — works, but >= 22 recommended`)
        : line('bad', 'node', `v${process.versions.node} — Node >= 18 required`)
  );

  // 2. State
  const state = readState();
  checks.push(
    Object.keys(state).length
      ? line('ok', 'state', 'config.json ok (no local catalog)')
      : line('warn', 'state', 'no persisted state — run `aio` once')
  );

  // 3. Live sources (info — the catalog IS the network; warn never fails CI)
  if (process.env.AIO_OFFLINE === '1') {
    checks.push(line('ok', 'live', 'AIO_OFFLINE=1 — live search intentionally disabled'));
  } else {
    try {
      const res = await fetch('https://api.github.com/rate_limit', { headers: { 'user-agent': 'aio-connect/1.3' }, signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      checks.push(line('ok', 'live', 'github reachable — ask searches GitHub + npm + crates (no search storage)'));
    } catch (e) {
      checks.push(line('warn', 'live', `github unreachable (${e.message}) — aio ask will still try npm/crates`));
    }
  }

  // 4. Manifest freshness
  const manifestPath = path.join(STATE_DIR, 'aio-context.md');
  if (fs.existsSync(manifestPath)) {
    const txt = fs.readFileSync(manifestPath, 'utf8');
    const ageDays = (Date.now() - fs.statSync(manifestPath).mtimeMs) / 86400000;
    const live = txt.includes('Live architecture');
    const detail = `${live ? 'live architecture (no search storage)' : 'LEGACY layout'} · ${ageDays.toFixed(1)}d old — ${manifestPath}`;
    if (!live) {
      checks.push(line('bad', 'manifest', `${detail} — fix: aio --fix`));
    } else if (ageDays > 7) {
      checks.push(line('warn', 'manifest', `${detail} — stale (>7d) — refresh: aio`));
    } else {
      checks.push(line('ok', 'manifest', detail));
    }
  } else {
    checks.push(line('bad', 'manifest', 'aio-context.md missing — fix: aio --fix'));
  }

  // 5. Agent blocks
  let injected = 0;
  let installed = 0;
  const missing = [];
  for (const [rel, dirHint] of AGENT_FILES) {
    const file = path.join(home, rel);
    const agentHome = dirHint ? path.join(home, dirHint) : null;
    if (!agentHome || !fs.existsSync(agentHome)) continue; // agent not installed → skip
    installed++;
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(BLOCK_START)) injected++;
    else missing.push(path.basename(file));
  }
  checks.push(
    missing.length
      ? line('bad', 'agent blocks', `${injected}/${installed} injected — missing: ${missing.join(', ')} — fix: aio --fix`)
      : line('ok', 'agent blocks', `${injected}/${installed} installed agents carry the auto-context block`)
  );

  // 6. Agents detected (info)
  const agents = detectAgents().filter((a) => a.found).map((a) => a.name);
  checks.push(line('ok', 'agents', agents.length ? agents.join(', ') : 'none detected'));

  // 7. Ollama (info — powers `aio ask` AI rerank)
  try {
    const res = await fetch(`${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const data = await res.json();
    checks.push(line('ok', 'ollama', `reachable — models: ${(data.models || []).map((m) => m.name).slice(0, 4).join(', ')}`));
  } catch {
    checks.push(line('warn', 'ollama', 'not reachable — ask rerank skipped (source/BM25 order kept)'));
  }

  const issues = checks.filter((c) => c.level === 'bad').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  return { checks, issues, warns, ok: issues === 0 };
}

/** `aio doctor` command. */
export async function runDoctor(opts = {}) {
  const { checks, issues, warns, ok } = await runChecks(opts);
  const header = `aio doctor — v${getVersion()} ${opts.check ? '(check mode)' : opts.fix ? '(fix mode)' : ''}`;
  const body = checks.map((c) => c.text).join('\n');
  let fixNote = '';
  if (opts.fix && !ok) {
    // Safe fix = re-run the idempotent setup (regen manifest + reinject blocks).
    try {
      execFileSync(process.execPath, [new URL('../bin/aio.js', import.meta.url).pathname.replace(/^\//, '')], {
        stdio: 'ignore',
        timeout: 120000,
      });
      fixNote = '\nfix: setup re-run complete — re-check:\n';
      const after = await runChecks(opts);
      fixNote += after.checks.map((c) => c.text).join('\n');
      return {
        ok: after.ok,
        text: `${header}\n${body}${fixNote}\nafter fix: ${after.issues} issue(s), ${after.warns} warning(s)`,
        exit: after.ok ? 0 : 1,
      };
    } catch (e) {
      fixNote = `\nfix failed: ${e.message}`;
    }
  }
  const summary = `${issues} issue(s), ${warns} warning(s)`;
  const hint = !ok ? `\n→ run \`aio doctor --fix\` (regenerate manifest + agent blocks) or \`aio\` directly.` : '';
  return { ok, text: `${header}\n${body}${fixNote}\n${summary}${hint}`, exit: ok ? 0 : 1 };
}
