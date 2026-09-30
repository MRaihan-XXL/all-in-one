#!/usr/bin/env node
// aio — all-in-one: auto-connect your AI agents to repos, tools, skills & sites
import { fileURLToPath } from 'node:url';
import { banner, getVersion } from '../src/banner.js';

const binPath = fileURLToPath(import.meta.url);

const HELP = `
  AIO — all-in-one
  auto-connect every AI agent to your repos, tools, skills & websites

  Usage
    aio                          Wire up every detected agent (default: setup)
    aio status                   Read-only health report (state, manifest, agents)
    aio ask "<what you need>"    Search the catalog (repo/tool/site/skill) —
                                 every hit prints link + function (+ local-AI rerank)
    aio borrow "<keywords>"      Live GitHub search for what the catalog lacks
      aio borrow --get <owner/repo>   shallow-clone to temp (24h TTL, then purged)
      aio borrow --list | --clean     inspect / wipe temp clones
    aio doctor [--check|--fix]   Self-diagnosis; --fix = safe auto-repair,
                                 --check = CI gate (exit 1 on issues)
    aio evolve                   Self-upgrade pipeline: scan → build-db →
                                 manifest+blocks → doctor → tests (never commits)
    aio update                   Update from npm, then re-run setup
    aio rollback                 Remove everything aio injected (backups kept)

  Options
    --repos <dir>                Directory of cloned git repositories
                                 (default: ~/github, ~/repos, ~/Projects … or $AIO_REPOS_DIR)
    --home <dir>                 Data dir with ai-tools.db / TOOLS-INDEX.md
                                 (default: $AIO_HOME, persisted state, or cwd walk)
    --json                       Machine-readable output (ask / borrow)
    -h, --help                   This help
    -v, --version                Version

  Environment
    AIO_REPOS_DIR, AIO_HOME, OLLAMA_HOST, AIO_OLLAMA_MODEL, AIO_NO_AI=1

  What it does
    1. Scans installed agents (opencode, claude, kimi, jcode, …), the catalog
       db (repos + tools + sites), and global skills.
    2. Generates a context manifest (aio-context.md): REPOS / TOOLS / SITES /
       SKILLS — each entry carries URL + one-line function.
    3. Injects a marker-delimited auto-use block into each agent's instruction
       file — idempotent, always exactly one copy.
    4. Teaches every agent the prompt flow:
       prompt → aio ask → aio borrow (ephemeral) → use → report with links → clean.

  Disclosure (mandatory, every reply that touches the manifest):
    [aio] Using [<name>](<url>) (<type>) — <function>
    <type> = repo | cli | service | skill | site
`;

function parseArgs(argv) {
  const opts = { command: 'setup', repos: null, home: null, query: '', flags: {} };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repos') opts.repos = argv[++i] ?? null;
    else if (a === '--home') opts.home = argv[++i] ?? null;
    else if (a === '--get') opts.flags.get = argv[++i] ?? null;
    else if (a === '--json') opts.flags.json = true;
    else if (a === '--clean') opts.flags.clean = true;
    else if (a === '--list') opts.flags.list = true;
    else if (a === '--check') opts.flags.check = true;
    else if (a === '--fix') opts.flags.fix = true;
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
    const { resolveDataDir, resolveReposDir } = await import('../src/paths.js');
    const { runAsk } = await import('../src/search.js');
    const r = await runAsk({
      query: opts.query,
      json: opts.flags.json,
      dataDir: resolveDataDir(opts.home),
      reposDir: resolveReposDir(opts.repos),
    });
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
    const r = await runDoctor({ check: opts.flags.check, fix: opts.flags.fix, home: opts.home });
    console.log(r.text);
    process.exit(r.exit);
    break;
  }
  case 'evolve': {
    const { runEvolve } = await import('../src/evolve.js');
    const r = await runEvolve({ home: opts.home, repos: opts.repos });
    console.log(r.text);
    process.exit(r.exit);
    break;
  }
  default: {
    console.log(banner());
    const { runSetup } = await import('../src/setup.js');
    try {
      await runSetup(opts);
    } catch (e) {
      console.error(`[aio] setup failed: ${e.message}`);
      if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
      process.exit(1);
    }
  }
}
