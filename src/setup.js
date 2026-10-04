// setup.js — the `aio` default command: detect → generate → inject → ensure → report
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeState, BACKUP_DIR, STATE_DIR } from './paths.js';
import { detectAgents, detectBinary } from './scan.js';
import { buildBlock, injectBlock, genContext, ensureMcp, pruneBackups } from './write.js';
import { blockTargets } from './targets.js';
import { getVersion } from './banner.js';

function row(tag, name, detail) {
  console.log(`  [${tag}] ${name.padEnd(26)} ${detail}`);
}

/** Report tag: '!' = error/parse error, ' ' = skipped, 'x' = ok (B-07). */
const tagOf = (status) => (/error/i.test(status) ? '!' : /skip/i.test(status) ? ' ' : 'x');

export async function runSetup(opts = {}) {
  const version = getVersion();
  const home = os.homedir();
  const dry = !!opts.dryRun; // FR12: plan only — no manifest, blocks, MCP, state writes

  if (Number(process.versions.node.split('.')[0]) < 22 && !process.versions.bun) {
    console.error(`[aio] warning: Node ${process.versions.node} detected — Node >= 22 recommended`);
  }

  const agents = detectAgents();
  const mcpBin = detectBinary('codebase-memory-mcp');

  const manifestPath = path.join(STATE_DIR, 'aio-context.md');
  if (!dry) genContext({ version, agents }, manifestPath);

  const body = buildBlock({ version, manifestPath });
  const targets = blockTargets(home, { agents });
  const blockResults = targets.map((t) => {
    if (!fs.existsSync(t.dir)) {
      return { ...t, status: 'skipped (no config dir yet)' };
    }
    return { ...t, ...injectBlock(t.file, body, `inject-${t.label}`, { dry }) };
  });

  const mcpResults = mcpBin
    ? ensureMcp(mcpBin, { dry })
    : [{ target: 'codebase-memory-mcp', status: 'binary not on PATH — skipped' }];

  let pruned = 0;
  if (!dry) {
    writeState({
      version,
      manifestPath,
      lastRun: new Date().toISOString(),
    });
    pruned = pruneBackups(30); // backups older than 30 days → no unbounded growth
  }

  /* ---- report ---- */
  console.log('');
  console.log(`aio setup v${version}${dry ? ' — DRY RUN (nothing written)' : ''}`);
  console.log('─'.repeat(76));

  console.log('\nAgents');
  for (const a of agents) {
    const cover = {
      opencode: '→ .config/opencode/AGENTS.md',
      claude: '→ .claude/CLAUDE.md',
      kimi: '→ .kimi-code/AGENTS.md',
      jcode: '→ .jcode/AGENTS.md',
      codex: '→ .codex/AGENTS.md',
      gemini: '→ .gemini/GEMINI.md',
      hermes: '→ ~/AGENTS.md',
      freebuff: '→ ~/AGENTS.md (fallback)',
    }[a.name] || '';
    row(a.found ? 'x' : ' ', a.name, `${a.found ? 'detected' : 'not installed'}  ${cover}`);
  }

  console.log('\nContext block (auto-use rules + usage disclosure)');
  for (const r of blockResults) row(tagOf(r.status), r.label, `${r.status} — ${r.file}`);

  console.log('\nMCP (codebase-memory-mcp)');
  if (!mcpResults.length) console.log('  [ ] none — no config files found');
  for (const r of mcpResults) row(tagOf(r.status), r.target, r.status);

  console.log('\nManifest (slim — no local catalog, search stays live)');
  if (dry) row(' ', 'aio-context.md', `would write — ${manifestPath}`);
  else {
    row('x', 'aio-context.md', `rules + disclosure + ${agents.filter((a) => a.found).length} agents · manifest data = live at ask time`);
    console.log(`  ${manifestPath}`);
  }

  if (opts.showBlock) {
    console.log('\nBlock preview (exact content that would be written)');
    console.log('─'.repeat(76));
    console.log(body);
    console.log('─'.repeat(76));
  }

  console.log('');
  console.log(dry ? 'Backups: none created (dry-run)' : `Backups: ${BACKUP_DIR}${pruned ? ` (${pruned} expired >30d pruned)` : ''}`);
  console.log(
    dry
      ? 'Dry run complete — no files were written. Re-run with --yes (or confirm the prompt) to apply.'
      : 'Done. Every agent now searches LIVE (GitHub/npm/crates) — no slash-commands, no search history kept.'
  );
  if (!dry) console.log('Prompt flow: aio ask (live) → use ephemerally → report (link + function) → clean.');
  if (!dry) console.log('  [aio] Using [<name>](<url>) (<type>) — <function>');
  console.log('');
}
