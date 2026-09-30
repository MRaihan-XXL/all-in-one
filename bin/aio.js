#!/usr/bin/env node
// aio — all-in-one: auto-connect your AI agents to repos, tools, skills & sites
import { fileURLToPath } from 'node:url';
import { banner, getVersion } from '../src/banner.js';

const binPath = fileURLToPath(import.meta.url);

const HELP = `
  AIO — all-in-one
  auto-connect every AI agent to repos, tools, skills & websites — 100% LIVE

  Usage
    aio                          Wire up every detected agent (default: setup)
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
    aio rollback                 Remove everything aio injected (backups kept)

  Options
    --repos <dir>                Directory of cloned git repositories (optional,
                                  used for the local install plan only)
    --dry-run                    setup: print exactly what would change,
                                  write nothing (diff-first review)
    --json                       Machine-readable output (ask / borrow)
    -h, --help                   This help
    -v, --version                Version

  Environment
    AIO_REPOS_DIR, AIO_OFFLINE=1, AIO_NO_GH=1, GH_TOKEN, OLLAMA_HOST,
    AIO_OLLAMA_MODEL, AIO_NO_AI=1

  Note
    aioc is an alias of the same binary — Adobe's App Builder CLI (@adobe/aio)
    also owns the name aio on PATH; use aioc when both are installed.

  What it does
    1. Scans installed agents (opencode, claude, kimi, jcode, …).
    2. Generates a slim context manifest (aio-context.md): rules, disclosure,
       detected agents — catalog data stays LIVE, never stored.
    3. Injects a marker-delimited auto-use block into each agent's instruction
       file — idempotent, always exactly one copy.
    4. Teaches every agent the prompt flow:
       prompt → aio ask (live) → use ephemerally → report → clean.

  Disclosure (injected rule — first line of every reply touching the manifest):
    [aio] Using [<name>](<url>) (<type>) — <function>
    <type> = repo | cli | service | skill | site
`;

function parseArgs(argv) {
  const opts = { command: 'setup', repos: null, query: '', flags: {} };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repos') opts.repos = argv[++i] ?? null;
    else if (a === '--get') opts.flags.get = argv[++i] ?? null;
    else if (a === '--json') opts.flags.json = true;
    else if (a === '--clean') opts.flags.clean = true;
    else if (a === '--list') opts.flags.list = true;
    else if (a === '--check') opts.flags.check = true;
    else if (a === '--fix') opts.flags.fix = true;
    else if (a === '--dry-run') opts.flags.dry = true;
    else rest.push(a);
  }
  const cmd = rest[0];
  opts.query = rest.slice(1).join(' ');
  if (
    ['update', 'rollback', 'setup', 'status', 'ask', 'borrow', 'doctor', 'evolve'].includes(cmd)
  ) {
    opts.command = cmd;
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
    const { runRollback } = await import('../src/rollback.js');
    runRollback();
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
    const r = await runEvolve({ repos: opts.repos });
    console.log(r.text);
    process.exit(r.exit);
    break;
  }
  default: {
    console.log(banner());
    const { runSetup } = await import('../src/setup.js');
    try {
      await runSetup({ ...opts, dryRun: !!opts.flags.dry });
    } catch (e) {
      console.error(`[aio] setup failed: ${e.message}`);
      if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
      process.exit(1);
    }
  }
}
