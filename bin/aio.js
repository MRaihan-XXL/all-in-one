#!/usr/bin/env node
// aio — all-in-one: auto-connect your AI agents to repos, tools, skills & sites
import { fileURLToPath } from 'node:url';
import { banner, getVersion } from '../src/banner.js';

const binPath = fileURLToPath(import.meta.url);

const HELP = `
  AIO — all-in-one
  auto-connect every AI agent to repos, tools, skills & websites — 100% LIVE

  Usage
    aio                          Wire up every detected agent (default: setup).
                                 Shows the plan first — interactive → asks [y/N],
                                 non-TTY → plan only; use --yes to write silent.
    aio preview                  Show the exact block that would be written
                                 (plan-only, nothing is written)
    aio init [--copilot]         Project scope: inject the block into ./AGENTS.md
                                 (official standard — Zed/Copilot/Cursor read it);
                                 --copilot also writes .github/copilot-instructions.md
                                 (official Copilot repo mechanism, pointer only).
                                 Same gate: TTY → plan + y/N, non-TTY → plan; --yes writes
    aio status                   Read-only health report (manifest, agents)
    aio ask "<what you need>"    LIVE search across GitHub (630M+ repos, public
                                 skills), npm (3M+ pkgs) + crates — adaptive
                                 sources, every hit prints link + function,
                                 ranked by keyword + popularity, then discarded
                                 (no search storage — results never saved)
    aio borrow "<keywords>"      Live GitHub search for what you need cloned
      aio borrow --get <owner/repo>   shallow-clone to temp (24h TTL, then purged)
      aio borrow --list | --clean     inspect / wipe temp clones
    aio doctor [--check|--fix]   Self-diagnosis; --fix = safe auto-repair,
                                 --check = CI gate (exit 1 on issues)
    aio evolve                   Self-upgrade pipeline: setup → doctor → tests
                                 (never commits)
    aio update                   Update from npm, then re-run setup
    aio rollback                 Strip injected blocks + recorded MCP entries
                                 (surgical; backups kept)

  Options
    --yes                        Apply the setup plan without prompting
                                  (required for non-interactive writes)
    --dry-run                    setup: print exactly what would change,
                                  write nothing (diff-first review)
    --show-block                 With the plan, print the exact block content
                                  (also what aio preview shows)
    --json                       Machine-readable output (ask / borrow)
    -h, --help                   This help
    -v, --version                Version

  Environment
    AIO_OFFLINE=1, AIO_NO_GH=1, AIO_STATE_DIR, GH_TOKEN, OLLAMA_HOST,
    AIO_OLLAMA_MODEL, AIO_NO_AI=1

  Note
    aioc is an alias of the same binary — Adobe's App Builder CLI (@adobe/aio)
    also owns the name aio on PATH; use aioc when both are installed.

  What it does
    1. Scans installed agents (opencode, claude, kimi, jcode, …).
    2. Generates a slim context manifest (aio-context.md): pointer + detected
       agents — rules live in the block; catalog data stays LIVE, never stored.
    3. Injects a marker-delimited auto-use block into each agent's instruction
       file — idempotent, always exactly one copy.
    4. Teaches every agent the prompt flow:
       prompt → aio ask (live) → use ephemerally → report → clean.

  Disclosure (injected rule — first line of replies that used aio-surfaced entries):
    [aio] Using [<name>](<url>) (<type>) — <function>
    <type> = repo | cli | service | skill | site
`;

function parseArgs(argv) {
  const opts = { command: 'setup', query: '', flags: {} };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--get') opts.flags.get = argv[++i] ?? null;
    else if (a === '--json') opts.flags.json = true;
    else if (a === '--clean') opts.flags.clean = true;
    else if (a === '--list') opts.flags.list = true;
    else if (a === '--check') opts.flags.check = true;
    else if (a === '--fix') opts.flags.fix = true;
    else if (a === '--dry-run') opts.flags.dry = true;
    else if (a === '--yes') opts.flags.yes = true;
    else if (a === '--show-block') opts.flags.preview = true;
    else if (a === '--copilot') opts.flags.copilot = true;
    else rest.push(a);
  }
  const cmd = rest[0];
  opts.query = rest.slice(1).join(' ');
  if (
    ['update', 'rollback', 'setup', 'status', 'ask', 'borrow', 'doctor', 'evolve', 'init'].includes(cmd)
  ) {
    opts.command = cmd;
  } else if (cmd === 'preview') {
    opts.command = 'setup'; // same path as default — preview forces plan-only
    opts.flags.preview = true;
  } else if (cmd === 'help' || cmd === '--help' || cmd === '-h') opts.command = 'help';
  else if (cmd === '--version' || cmd === '-v' || cmd === 'version') opts.command = 'version';
  else if (cmd !== undefined) {
    console.error(`[aio] unknown command: ${cmd}`);
    opts.command = 'help';
    opts.bad = true;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
// --copilot only has meaning for `aio init` — never silently swallow it elsewhere (N2)
if (opts.flags.copilot && opts.command !== 'init') {
  console.error('[aio] --copilot only applies to `aio init` — ignoring');
}
// --dry-run is only honored by setup/init — warn elsewhere; REFUSE on the destructive
// command so the flag can never be mistaken for a shield that doesn't exist (F3)
if (opts.flags.dry && opts.command !== 'setup' && opts.command !== 'init' && opts.command !== 'help') {
  if (opts.command === 'rollback') {
    console.error('[aio] rollback cannot honor --dry-run — refusing to run; inspect first with `aio doctor`');
    process.exit(1);
  }
  console.error('[aio] --dry-run only applies to `aio setup` / `aio init` — ignoring');
}
// unknown flags must never be silently dropped (F8); `ask` exempt — its query may look like a flag
const KNOWN_FLAGS = new Set(['--get', '--json', '--clean', '--list', '--check', '--fix', '--dry-run', '--yes', '--show-block', '--copilot', '--help', '--version', '-h', '-v']);
if (opts.command !== 'ask' && opts.command !== 'help' && opts.command !== 'version') {
  for (const tok of opts.query.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('--') && !KNOWN_FLAGS.has(tok.split('=')[0])) console.error(`[aio] unknown flag: ${tok} — ignoring`);
  }
}

switch (opts.command) {
  case 'help':
    console.log(HELP);
    process.exit(opts.bad ? 1 : 0);
  case 'version':
    console.log(`aio ${getVersion()} — all-in-one (https://github.com/MRaihan-XXL/all-in-one)`);
    process.exit(0);
  case 'update': {
    console.log(banner());
    const { runUpdate } = await import('../src/update.js');
    runUpdate({ binPath });
    break;
  }
  case 'status': {
    const { runStatus } = await import('../src/status.js');
    const r = runStatus(opts);
    process.exit(r.ok ? 0 : 1);
  }
  case 'rollback': {
    console.log(banner());
    try {
      const { runRollback } = await import('../src/rollback.js');
      runRollback();
    } catch (e) {
      console.error(`[aio] rollback failed: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case 'ask': {
    const { runAsk } = await import('../src/search.js');
    const r = await runAsk({ query: opts.query, json: opts.flags.json });
    console.log(r.text);
    process.exit(r.ok ? 0 : 1);
    break;
  }
  case 'borrow': {
    const { runBorrow } = await import('../src/borrow.js');
    const r = await runBorrow({
      query: opts.query,
      get: opts.flags.get,
      clean: opts.flags.clean,
      list: opts.flags.list,
      json: opts.flags.json,
    });
    console.log(r.text);
    process.exit(r.ok ? 0 : 1);
    break;
  }
  case 'doctor': {
    const { runDoctor } = await import('../src/doctor.js');
    const r = await runDoctor({ check: opts.flags.check, fix: opts.flags.fix });
    console.log(r.text);
    process.exit(r.exit);
    break;
  }
  case 'evolve': {
    const { runEvolve } = await import('../src/evolve.js');
    const r = await runEvolve({});
    console.log(r.text);
    process.exit(r.exit);
    break;
  }
  case 'init': {
    console.log(banner());
    const { gatedRun } = await import('../src/consent.js');
    const { runInit } = await import('../src/init.js');
    try {
      await gatedRun({
        dry: !!opts.flags.dry,
        yes: !!opts.flags.yes,
        preview: false,
        showPlan: () => runInit({ dryRun: true, copilot: !!opts.flags.copilot }),
        apply: () => runInit({ dryRun: false, copilot: !!opts.flags.copilot }),
      });
    } catch (e) {
      console.error(`[aio] init failed: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  default: {
    console.log(banner());
    const { runSetup } = await import('../src/setup.js');
    const { gatedRun } = await import('../src/consent.js');
    try {
      const result = await gatedRun({
        dry: !!opts.flags.dry,
        yes: !!opts.flags.yes,
        preview: !!opts.flags.preview,
        showPlan: (p) => runSetup({ dryRun: true, showBlock: p }),
        apply: () => runSetup({ dryRun: false }),
      });
      if (result !== 'applied') process.exit(0);
    } catch (e) {
      console.error(`[aio] setup failed: ${e.message}`);
      if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
      process.exit(1);
    }
  }
}
