#!/usr/bin/env node
// aio — all-in-one: auto-connect your AI agents to repos, tools, skills & sites
import fs from 'node:fs';
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
    aio skill add <owner/repo|url> [--file <path|dir>] [--name <n>] [--dry-run]
                                 Install a public SKILL.md into ~/.agents/skills
                                 (shared by 40+ agents; ledgered for rollback)
      aio skill list | remove <name>  inspect / remove installed skills (only
                                 byte-identical aio installs are ever removed)
    aio completion <shell>       Print shell completion script (bash|zsh|fish|pwsh)
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
    --file <path|dir>            skill add: install from a local SKILL.md or dir
    --name <name>                skill add: override the installed skill name
    --json                       Machine-readable output (ask / borrow / doctor)
    -h, --help                   This help
    -v, --version                Version

  Environment
    AIO_OFFLINE=1, AIO_NO_GH=1, AIO_STATE_DIR, GH_TOKEN, OLLAMA_HOST,
    AIO_OLLAMA_MODEL, AIO_NO_AI=1, AIO_RATE=<calls/min|0> (GitHub search
    budget; 0 disables spacing), AIO_QUIET=1 (no banner), NO_COLOR=1

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
    else if (a === '--file') opts.flags.file = argv[++i] ?? null;
    else if (a === '--name') opts.flags.name = argv[++i] ?? null;
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
    ['update', 'rollback', 'setup', 'status', 'ask', 'borrow', 'skill', 'completion', 'doctor', 'evolve', 'init'].includes(cmd)
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

// Launch styles disagree on argv layout: `node bin/aio.js <args>` carries the
// script path at [1]; a bun --compile binary carries its VIRTUAL main-module
// path at [1]; only after that come the real args.
// Detect the script token instead of assuming an index — a fixed slice(2)
// silently drops the FIRST argument of a binary (`aio.exe --yes` → no --yes).
// POSIX npm/npx invoke through a SYMLINK (node_modules/.bin/aio): argv[1] is
// the symlink path and node does NOT realpath it — resolve before matching,
// or every Linux/macOS npm/npx launch dies as `unknown command: /usr/local/bin/aio`.
// bun's virtual path differs per platform (release smoke caught this):
//   windows: B:/~BUN/root/<outfile>    posix: /$bunfs/root/<outfile>
const BUN_VIRTUAL = (p) => p.includes('~BUN/root/') || p.includes('/$bunfs/root/');
const rawArgs = process.argv.slice(1);
let scriptTok = rawArgs[0] || '';
// /i: win32 filesystems are case-insensitive — node will happily LOAD bin\AIO.JS,
// so the match must accept it too (realpath does not re-case on win32).
if (scriptTok && !/(^|[/\\])aio\.js$/i.test(scriptTok) && !BUN_VIRTUAL(scriptTok)) {
  try {
    scriptTok = fs.realpathSync(scriptTok);
  } catch { /* not a filesystem path (flag/bare word) — leave untouched */ }
}
const invokedAsScript =
  scriptTok && (/(^|[/\\])aio\.js$/i.test(scriptTok) || BUN_VIRTUAL(scriptTok));
const opts = parseArgs(invokedAsScript ? rawArgs.slice(1) : rawArgs);
// --copilot only has meaning for `aio init` — never silently swallow it elsewhere (N2)
if (opts.flags.copilot && opts.command !== 'init') {
  console.error('[aio] --copilot only applies to `aio init` — ignoring');
}
// --dry-run is only honored by setup/init/skill — warn elsewhere; REFUSE on the destructive
// command so the flag can never be mistaken for a shield that doesn't exist (F3)
if (opts.flags.dry && opts.command !== 'setup' && opts.command !== 'init' && opts.command !== 'help' && opts.command !== 'skill') {
  if (opts.command === 'rollback') {
    console.error('[aio] rollback cannot honor --dry-run — refusing to run; inspect first with `aio doctor`');
    process.exit(1);
  }
  console.error('[aio] --dry-run only applies to `aio setup` / `aio init` — ignoring');
}
// unknown flags must never be silently dropped (F8); `ask` exempt — its query may look like a flag
const KNOWN_FLAGS = new Set(['--get', '--file', '--name', '--json', '--clean', '--list', '--check', '--fix', '--dry-run', '--yes', '--show-block', '--copilot', '--help', '--version', '-h', '-v']);
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
  case 'skill': {
    try {
      const { skillAdd, skillList, skillRemove } = await import('../src/skill.js');
      const words = opts.query.trim().split(/\s+/).filter(Boolean);
      const action = words[0];
      const target = words.slice(1).join(' ');
      let r;
      if (action === 'list') r = skillList();
      else if (action === 'remove') r = skillRemove({ target });
      else if (action === 'add' || action === undefined) {
        r = await skillAdd({ target, file: opts.flags.file, name: opts.flags.name, dry: !!opts.flags.dry });
      } else r = { ok: false, text: `[aio] skill: unknown subcommand "${action}" — use add | list | remove` };
      console.log(r.text);
      process.exit(r.ok ? 0 : 1);
    } catch (e) {
      console.error(`[aio] skill failed: ${e.message}`);
      process.exit(1);
    }
    break;
  }
  case 'completion': {
    const { completion } = await import('../src/completion.js');
    const r = completion(opts.query.trim().split(/\s+/)[0] || '');
    console.log(r.text);
    process.exit(r.ok ? 0 : 1);
    break;
  }
  case 'doctor': {
    const { runDoctor } = await import('../src/doctor.js');
    const r = await runDoctor({ check: opts.flags.check, fix: opts.flags.fix, json: opts.flags.json });
    console.log(r.text);
    process.exit(r.exit);
    break;
  }
  case 'evolve': {
    try {
      const { runEvolve } = await import('../src/evolve.js');
      const r = await runEvolve({});
      console.log(r.text);
      process.exit(r.exit);
    } catch (e) {
      console.error(`[aio] evolve failed: ${e.message}`);
      process.exit(1);
    }
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
