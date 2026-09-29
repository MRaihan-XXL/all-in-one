#!/usr/bin/env node
// aio — all-in-one-repo: auto-connect your AI agents to local repos, tools & skills
import { fileURLToPath } from 'node:url';
import { banner, getVersion } from '../src/banner.js';

const binPath = fileURLToPath(import.meta.url);

const HELP = `
aio — all-in-one-repo

Usage:
  aio                      Wire up every detected agent (default: setup)
  aio update               Update from npm, then re-run setup
  aio rollback             Remove everything aio injected (backups are kept)

Options:
  --repos <dir>            Directory containing cloned git repositories
                           (default: D:\\Tools\\github, or $AIO_REPOS_DIR)
  --home <dir>             Data dir with ai-tools.db / TOOLS-INDEX.md
                           (default: $AIO_HOME, persisted state, or cwd walk)
  -h, --help               Show this help
  -v, --version            Show version

Environment:
  AIO_REPOS_DIR, AIO_HOME  Same as --repos / --home

What it does:
  1. Scans installed agents (opencode, claude, kimi, jcode, freebuff, hermes,
     codex, gemini), cloned repos, local tools catalog, and global skills.
  2. Generates a context manifest (aio-context.md) listing REPOS/TOOLS/SKILLS.
  3. Injects a marker-delimited auto-use block into each agent's instruction
     file — idempotent, always exactly one copy.
  4. Ensures the codebase-memory-mcp server exists where supported.
  5. Repairs stale path references after folder renames.

No slash-commands needed: the agent reads the manifest on its own and must
disclose usage as:  [aio] Using [<name>](<url>) (<type>) — <function>
`;

function parseArgs(argv) {
  const opts = { command: 'setup', repos: null, home: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repos') opts.repos = argv[++i] ?? null;
    else if (a === '--home') opts.home = argv[++i] ?? null;
    else rest.push(a);
  }
  const cmd = rest[0];
  if (cmd === 'update' || cmd === 'rollback' || cmd === 'setup') opts.command = cmd;
  else if (cmd === 'help' || cmd === '--help' || cmd === '-h') opts.command = 'help';
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
    console.log(getVersion());
    process.exit(0);
  case 'update': {
    console.log(banner());
    const { runUpdate } = await import('../src/update.js');
    runUpdate({ binPath });
    break;
  }
  case 'rollback': {
    console.log(banner());
    const { runRollback } = await import('../src/rollback.js');
    runRollback();
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
