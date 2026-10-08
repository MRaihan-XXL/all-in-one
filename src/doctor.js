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
import { msg } from './messages.js';

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

/** All network/subprocess probes in parallel (P-02) — results consumed in order.
 *  A non-2xx rate_limit answer (403/429) is kept as its own status so the report
 *  can say "rate-limited" instead of a misleading "unreachable" (6d). */
function probeLive() {
  if (process.env.AIO_OFFLINE === '1') return Promise.resolve({ ok: true, offline: true });
  return fetch('https://api.github.com/rate_limit', {
    headers: { 'user-agent': `aio-connect/${getVersion()}` },
    signal: AbortSignal.timeout(3000),
  })
    .then((res) => (res.ok ? { ok: true } : { ok: false, status: res.status, msg: `HTTP ${res.status}` }))
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
export async function runChecks() {
  const home = os.homedir();
  const checks = [];

  // Kick off the three probes together, then report in stable order (P-02).
  const [live, ollama, gh] = await Promise.all([probeLive(), probeOllama(), probeGhAuth()]);

  // 1. Node — supported line is >= 22 (package engines); older runs are unsupported (B-08).
  //    Load floor >= 20.10: below it aio never loaded at all (6e), so only those are "bad".
  //    A compiled binary embeds its runtime and also passes via process.versions.bun.
  const [major, minor] = process.versions.node.split('.').map(Number);
  const loads = major > 20 || (major === 20 && minor >= 10);
  const supported = major >= 22 || !!process.versions.bun;
  checks.push(
    supported
      ? line('ok', 'node', msg('doctorNodeOk', { v: process.versions.node, bun: process.versions.bun ? `, bun ${process.versions.bun} build` : '' }))
      : loads
        ? line('warn', 'node', msg('doctorNodeWarn', { v: process.versions.node }))
        : line('bad', 'node', msg('doctorNodeBad', { v: process.versions.node }))
  );

  // 2. State
  const state = readState();
  checks.push(
    Object.keys(state).length
      ? line('ok', 'state', msg('doctorStateOk'))
      : line('warn', 'state', msg('doctorStateWarn'))
  );

  // 3. Live sources (info — the catalog IS the network; warn never fails CI)
  checks.push(
    live.offline
      ? line('ok', 'live', msg('doctorLiveOffline'))
      : live.ok
        ? line('ok', 'live', msg('doctorLiveOk'))
        : line(
            'warn',
            'live',
            live.status === 403 || live.status === 429
              ? msg('doctorLiveRate', { status: live.status })
              : msg('doctorLiveDown', { msg: live.msg })
          )
  );

  // 4. Manifest freshness
  const manifestPath = path.join(STATE_DIR, 'aio-context.md');
  if (fs.existsSync(manifestPath)) {
    // all reads inside try: a file vanishing/locking between existsSync and
    // readFileSync must become a warn row, never a crash of the whole check (C-07)
    try {
      const txt = fs.readFileSync(manifestPath, 'utf8');
      const ageDays = (Date.now() - fs.statSync(manifestPath).mtimeMs) / 86400000;
      const liveLayout = txt.includes('Live architecture');
      const detail = msg('doctorManifestLine', {
        layout: msg(liveLayout ? 'doctorLayoutLive' : 'doctorLayoutLegacy'),
        age: ageDays.toFixed(1),
        path: manifestPath,
      });
      if (!liveLayout) {
        checks.push(line('bad', 'manifest', msg('doctorManifestFix', { detail })));
      } else if (ageDays > 7) {
        checks.push(line('warn', 'manifest', msg('doctorManifestStale', { detail })));
      } else {
        checks.push(line('ok', 'manifest', detail));
      }
    } catch (e) {
      // EISDIR (path is a directory, not a file) = broken install → rethrow so
      // dispatch reports `doctor failed: ...` verbatim and exits 1 (loud, by
      // contract). Transient read trouble (vanish/lock) → warn row instead.
      if (e && e.code === 'EISDIR') throw e;
      checks.push(line('warn', 'manifest', msg('doctorManifestUnreadable')));
    }
  } else {
    checks.push(line('bad', 'manifest', msg('doctorManifestMissing')));
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
    // read inside try: target file vanishing mid-scan = report as missing, not a crash (C-07)
    let hasBlock = false;
    try {
      hasBlock = fs.readFileSync(file, 'utf8').includes(BLOCK_START);
    } catch {
      hasBlock = false;
    }
    if (fs.existsSync(file) && hasBlock) injected++;
    else missing.push(label);
  }
  checks.push(
    missing.length
      ? line('bad', 'agent blocks', msg('doctorBlocksMissing', { inj: injected, inst: installed, list: missing.join(', ') }))
      : line('ok', 'agent blocks', msg('doctorBlocksOk', { inj: injected, inst: installed }))
  );

  // 6. Agents detected (info)
  const found = agents.filter((a) => a.found).map((a) => a.name);
  checks.push(line('ok', 'agents', found.length ? found.join(', ') : msg('doctorAgentsNone')));

  // 7. gh auth — the skills lane reports an error on use without it (W1)
  checks.push(
    gh.state === 'ok'
      ? line('ok', 'gh auth', msg('doctorGhOk'))
      : gh.state === 'off'
        ? line('ok', 'gh auth', msg('doctorGhOff'))
        : line('warn', 'gh auth', msg('doctorGhNoAuth'))
  );

  // 8. Ollama (info — powers `aio ask` AI rerank)
  checks.push(
    ollama.ok
      ? line('ok', 'ollama', msg('doctorOllamaOk', { models: ollama.models || 'none' }))
      : line('warn', 'ollama', msg('doctorOllamaDown'))
  );

  // 9. MCP ledger — always reported (B-09); missing ledger + state = attribution lost (S-01)
  if (!fs.existsSync(ledgerFile()) && Object.keys(state).length) {
    checks.push(line('warn', 'mcp ledger', msg('doctorLedgerMissing')));
  } else {
    const ledger = ledgerList();
    if (ledger.length) {
      const broken = [];
      for (const { file, key } of ledger) {
        // read first, inside try: covers ENOENT (vanishing between checks —
        // keep the exact 'missing' wording the report contract uses) AND
        // EACCES/locked files, which used to throw out of runChecks (C-07).
        let txt;
        try {
          txt = fs.readFileSync(file, 'utf8');
        } catch (e) {
          broken.push(
            e && e.code === 'ENOENT'
              ? msg('doctorLedgerNoFile', { key, file: path.basename(file) })
              : msg('doctorLedgerUnreadable', { key, file: path.basename(file) })
          );
          continue;
        }
        if (file.endsWith('.jsonc') || file.endsWith('.toml')) {
          if (!txt.includes(key)) broken.push(msg('doctorLedgerGone', { key, file: path.basename(file) }));
        } else {
          try {
            JSON.parse(txt);
            if (!txt.includes(key)) broken.push(msg('doctorLedgerGone', { key, file: path.basename(file) }));
          } catch {
            broken.push(msg('doctorLedgerParse', { file: path.basename(file) }));
          }
        }
      }
      checks.push(
        broken.length
          ? line('warn', 'mcp ledger', broken.join('; '))
          : line('ok', 'mcp ledger', msg('doctorLedgerOk', { n: ledger.length }))
      );
    } else {
      checks.push(line('ok', 'mcp ledger', msg('doctorLedgerEmpty')));
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
  const { checks, issues, warns, ok } = await runChecks();
  const mode = opts.check ? 'check' : opts.fix ? 'fix' : 'doctor';
  const header = msg('doctorHeader', {
    v: getVersion(),
    mode: opts.check ? msg('doctorModeCheck') : opts.fix ? msg('doctorModeFix') : '',
  });
  const body = checks.map((c) => c.text).join('\n');
  let fixNote = '';
  let fixOutcome = null;
  // --check is read-only by contract: --fix never spawns under it, only notes the conflict (6c)
  if (opts.fix && opts.check) {
    fixNote = `\n${msg('doctorFixIgnored')}`;
  } else if (opts.fix && !ok) {
    // Safe fix = re-run the idempotent setup (regen manifest + reinject blocks).
    // --yes: the fix itself is the consent (non-TTY gate would stop at the plan).
    try {
      const bin = aioBinPath();
      // source/npm → re-run via node with the script path; compiled binary →
      // argv already starts at [1] (no script token), so pass flags directly.
      const spawn = bin === process.execPath ? [bin, ['--yes']] : [process.execPath, [bin, '--yes']];
      // pipe stderr (6i): a fix that fails must show WHY, not a bare "Command failed"
      execFileSync(spawn[0], spawn[1], {
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 120000,
        encoding: 'utf8',
      });
      fixNote = `\n${msg('doctorFixDone')}\n`;
      const after = await runChecks();
      fixNote += after.checks.map((c) => c.text).join('\n');
      const fixed = { ok: after.ok, exit: after.ok ? 0 : 1 };
      fixOutcome = { attempted: true, ok: after.ok };
      if (opts.json) {
        return { ...fixed, text: doctorJson(after.checks, { mode, ok: after.ok, issues: after.issues, warns: after.warns, fix: fixOutcome }) };
      }
      return {
        ok: after.ok,
        text: `${header}\n${body}${fixNote}\n${msg('doctorAfterFix', { i: after.issues, w: after.warns })}`,
        exit: fixed.exit,
      };
    } catch (e) {
      const detail = String(e.stderr ?? '').trim().slice(0, 300);
      // dedup: keep stderr only when the message doesn't already carry it
      const extra = detail && !String(e.message).includes(detail) ? `\n${detail}` : '';
      fixNote = `\n${msg('doctorFixFailed', { err: `${e.message}${extra}` })}`;
      fixOutcome = { attempted: true, ok: false, error: detail || e.message };
    }
  }
  const summary = msg('doctorSummary', { i: issues, w: warns });
  const hint = !ok ? msg('doctorHint') : '';
  if (opts.json) {
    return { ok, text: doctorJson(checks, { mode, ok, issues, warns, fix: fixOutcome }), exit: ok ? 0 : 1 };
  }
  return { ok, text: `${header}\n${body}${fixNote}\n${summary}${hint}`, exit: ok ? 0 : 1 };
}
