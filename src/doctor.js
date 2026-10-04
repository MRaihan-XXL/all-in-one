// doctor.js — `aio doctor`: self-diagnosis of the whole aio installation.
// --check: read-only report, exit 1 when any [!!] issue exists (CI-friendly).
// --fix  : apply safe fixes (re-run the idempotent setup pipeline).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, execFile } from 'node:child_process';
import { STATE_DIR, readState } from './paths.js';
import { detectAgents } from './scan.js';
import { BLOCK_START, ledgerList, ledgerFile } from './write.js';
import { blockTargets } from './targets.js';
import { getVersion } from './banner.js';

/** CLI entry for re-spawning: source/npm install → bin/aio.js; a compiled
 *  binary has no sibling script file → the executable IS the CLI. */
export function aioBinPath() {
  const p = fileURLToPath(new URL('../bin/aio.js', import.meta.url));
  return fs.existsSync(p) ? p : process.execPath;
}

function line(level, id, detail) {
  const tag = level === 'ok' ? '[ok]' : level === 'warn' ? '[~~]' : '[!!]';
  return { level, id, detail, text: `${tag} ${id.padEnd(14)} ${detail}` };
}

/** All network/subprocess probes in parallel (P-02) — results consumed in order. */
function probeLive() {
  if (process.env.AIO_OFFLINE === '1') return Promise.resolve({ ok: true, offline: true });
  return fetch('https://api.github.com/rate_limit', {
    headers: { 'user-agent': `aio-connect/${getVersion()}` },
    signal: AbortSignal.timeout(3000),
  })
    .then((res) => (res.ok ? { ok: true } : Promise.reject(new Error(`HTTP ${res.status}`))))
    .catch((e) => ({ ok: false, msg: e.message }));
}

function probeOllama() {
  return fetch(`${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/tags`, {
    signal: AbortSignal.timeout(1500),
  })
    .then((res) => res.json())
    .then((data) => ({ ok: true, models: (data.models || []).map((m) => m.name).slice(0, 4).join(', ') }))
    .catch(() => ({ ok: false }));
}

function probeGhAuth() {
  if (process.env.AIO_NO_GH === '1') return Promise.resolve({ state: 'off' });
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'status'], { timeout: 4000, windowsHide: true }, (err) => {
      resolve({ state: err ? 'missing-or-out' : 'ok' });
    });
  });
}

/** Run all checks. Returns { checks, issues, warns, ok } — always 9 checks (B-09). */
export async function runChecks(opts = {}) {
  const home = os.homedir();
  const checks = [];

  // Kick off the three probes together, then report in stable order (P-02).
  const [live, ollama, gh] = await Promise.all([probeLive(), probeOllama(), probeGhAuth()]);

  // 1. Node — supported line is >= 22 (package engines); older runs are unsupported (B-08).
  //    A compiled binary embeds its runtime and also passes via process.versions.bun.
  const major = Number(process.versions.node.split('.')[0]);
  const supported = major >= 22 || !!process.versions.bun;
  checks.push(
    supported
      ? line('ok', 'node', `v${process.versions.node} (supported: >= 22${process.versions.bun ? `, bun ${process.versions.bun} build` : ''})`)
      : major >= 18
        ? line('warn', 'node', `v${process.versions.node} — runs, but unsupported; install Node >= 22`)
        : line('bad', 'node', `v${process.versions.node} — Node >= 22 required`)
  );

  // 2. State
  const state = readState();
  checks.push(
    Object.keys(state).length
      ? line('ok', 'state', 'config.json ok (no local catalog)')
      : line('warn', 'state', 'no persisted state — run `aio` once')
  );

  // 3. Live sources (info — the catalog IS the network; warn never fails CI)
  checks.push(
    live.offline
      ? line('ok', 'live', 'AIO_OFFLINE=1 — live search intentionally disabled')
      : live.ok
        ? line('ok', 'live', 'github reachable — ask searches GitHub + npm + crates (no search storage)')
        : line('warn', 'live', `github unreachable (${live.msg}) — aio ask will still try npm/crates`)
  );

  // 4. Manifest freshness
  const manifestPath = path.join(STATE_DIR, 'aio-context.md');
  if (fs.existsSync(manifestPath)) {
    const txt = fs.readFileSync(manifestPath, 'utf8');
    const ageDays = (Date.now() - fs.statSync(manifestPath).mtimeMs) / 86400000;
    const liveLayout = txt.includes('Live architecture');
    const detail = `${liveLayout ? 'live architecture (no search storage)' : 'LEGACY layout'} · ${ageDays.toFixed(1)}d old — ${manifestPath}`;
    if (!liveLayout) {
      checks.push(line('bad', 'manifest', `${detail} — fix: aio --fix`));
    } else if (ageDays > 7) {
      checks.push(line('warn', 'manifest', `${detail} — stale (>7d) — refresh: aio`));
    } else {
      checks.push(line('ok', 'manifest', detail));
    }
  } else {
    checks.push(line('bad', 'manifest', 'aio-context.md missing — fix: aio --fix'));
  }

  // 5. Agent blocks — from the shared target list (B-04); only count agents
  //    whose config dir exists (an agent you don't have is not "missing")
  const agents = detectAgents();
  let injected = 0;
  let installed = 0;
  const missing = [];
  for (const { label, file, dir } of blockTargets(home, { agents })) {
    if (!fs.existsSync(dir)) continue;
    installed++;
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(BLOCK_START)) injected++;
    else missing.push(label);
  }
  checks.push(
    missing.length
      ? line('bad', 'agent blocks', `${injected}/${installed} injected — missing: ${missing.join(', ')} — fix: aio --fix`)
      : line('ok', 'agent blocks', `${injected}/${installed} installed agents carry the auto-context block`)
  );

  // 6. Agents detected (info)
  const found = agents.filter((a) => a.found).map((a) => a.name);
  checks.push(line('ok', 'agents', found.length ? found.join(', ') : 'none detected'));

  // 7. gh auth — the skills lane reports an error on use without it (W1)
  checks.push(
    gh.state === 'ok'
      ? line('ok', 'gh auth', 'logged in — skills lane enabled (gh api search/code)')
      : gh.state === 'off'
        ? line('ok', 'gh auth', 'AIO_NO_GH=1 — skills lane disabled by choice')
        : line('warn', 'gh auth', 'not logged in — skills lane will report an error on use (run `gh auth login`)')
  );

  // 8. Ollama (info — powers `aio ask` AI rerank)
  checks.push(
    ollama.ok
      ? line('ok', 'ollama', `reachable — models: ${ollama.models || 'none'}`)
      : line('warn', 'ollama', 'not reachable — ask rerank skipped (source/BM25 order kept)')
  );

  // 9. MCP ledger — always reported (B-09); missing ledger + state = attribution lost (S-01)
  if (!fs.existsSync(ledgerFile()) && Object.keys(state).length) {
    checks.push(line('warn', 'mcp ledger', 'ledger missing — re-run `aio` to re-record MCP entries for rollback'));
  } else {
    const ledger = ledgerList();
    if (ledger.length) {
      const broken = [];
      for (const { file, key } of ledger) {
        if (!fs.existsSync(file)) {
          broken.push(`${key}: ${path.basename(file)} missing`);
          continue;
        }
        const txt = fs.readFileSync(file, 'utf8');
        if (file.endsWith('.jsonc') || file.endsWith('.toml')) {
          if (!txt.includes(key)) broken.push(`${key}: entry gone from ${path.basename(file)}`);
        } else {
          try {
            JSON.parse(txt);
            if (!txt.includes(key)) broken.push(`${key}: entry gone from ${path.basename(file)}`);
          } catch {
            broken.push(`${path.basename(file)}: parse error — fix before \`aio rollback\``);
          }
        }
      }
      checks.push(
        broken.length
          ? line('warn', 'mcp ledger', broken.join('; '))
          : line('ok', 'mcp ledger', `${ledger.length} aio-added MCP entry file(s) present & valid`)
      );
    } else {
      checks.push(line('ok', 'mcp ledger', '0 entries on record — nothing aio-added'));
    }
  }

  const issues = checks.filter((c) => c.level === 'bad').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  return { checks, issues, warns, ok: issues === 0 };
}

/** Machine-readable doctor output (schemaVersion:1 — same contract as ask/borrow).
 *  `fix` (optional): { attempted, ok, error? } — machine consumers must be able to
 *  tell that a fix ran (or failed) without parsing human text. */
function doctorJson(checks, { mode, ok, issues, warns, fix = null }) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      version: getVersion(),
      mode,
      ok,
      issues,
      warns,
      ...(fix ? { fix } : {}),
      checks: checks.map((c) => ({ level: c.level, id: c.id, detail: c.detail })),
    },
    null,
    2
  );
}

/** `aio doctor` command. */
export async function runDoctor(opts = {}) {
  const { checks, issues, warns, ok } = await runChecks(opts);
  const mode = opts.check ? 'check' : opts.fix ? 'fix' : 'doctor';
  const header = `aio doctor — v${getVersion()} ${opts.check ? '(check mode)' : opts.fix ? '(fix mode)' : ''}`;
  const body = checks.map((c) => c.text).join('\n');
  let fixNote = '';
  let fixOutcome = null;
  if (opts.fix && !ok) {
    // Safe fix = re-run the idempotent setup (regen manifest + reinject blocks).
    // --yes: the fix itself is the consent (non-TTY gate would stop at the plan).
    try {
      const bin = aioBinPath();
      // source/npm → re-run via node with the script path; compiled binary →
      // argv already starts at [1] (no script token), so pass flags directly.
      const spawn = bin === process.execPath ? [bin, ['--yes']] : [process.execPath, [bin, '--yes']];
      execFileSync(spawn[0], spawn[1], {
        stdio: 'ignore',
        timeout: 120000,
      });
      fixNote = '\nfix: setup re-run complete — re-check:\n';
      const after = await runChecks(opts);
      fixNote += after.checks.map((c) => c.text).join('\n');
      const fixed = { ok: after.ok, exit: after.ok ? 0 : 1 };
      fixOutcome = { attempted: true, ok: after.ok };
      if (opts.json) {
        return { ...fixed, text: doctorJson(after.checks, { mode, ok: after.ok, issues: after.issues, warns: after.warns, fix: fixOutcome }) };
      }
      return {
        ok: after.ok,
        text: `${header}\n${body}${fixNote}\nafter fix: ${after.issues} issue(s), ${after.warns} warning(s)`,
        exit: fixed.exit,
      };
    } catch (e) {
      fixNote = `\nfix failed: ${e.message}`;
      fixOutcome = { attempted: true, ok: false, error: e.message };
    }
  }
  const summary = `${issues} issue(s), ${warns} warning(s)`;
  const hint = !ok ? `\n→ run \`aio doctor --fix\` (regenerate manifest + agent blocks) or \`aio --yes\` directly.` : '';
  if (opts.json) {
    return { ok, text: doctorJson(checks, { mode, ok, issues, warns, fix: fixOutcome }), exit: ok ? 0 : 1 };
  }
  return { ok, text: `${header}\n${body}${fixNote}\n${summary}${hint}`, exit: ok ? 0 : 1 };
}
