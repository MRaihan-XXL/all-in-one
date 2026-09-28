// rollback.js — `aio rollback`: surgically undo everything setup did (FR7)
import path from 'node:path';
import os from 'node:os';
import { stripBlock, removeMcpAdditions, backup } from './write.js';
import { BACKUP_DIR } from './paths.js';

export function runRollback() {
  const home = os.homedir();
  const targets = [
    { label: 'opencode', file: path.join(home, '.config', 'opencode', 'AGENTS.md') },
    { label: 'claude', file: path.join(home, '.claude', 'CLAUDE.md') },
    { label: 'kimi', file: path.join(home, '.kimi-code', 'AGENTS.md') },
    { label: 'global', file: path.join(home, 'AGENTS.md') },
  ];

  console.log('aio rollback');
  console.log('─'.repeat(76));

  console.log('\nContext block');
  let removed = 0;
  for (const t of targets) {
    const st = stripBlock(t.file);
    if (st === 'removed') removed++;
    console.log(`  [${st === 'removed' ? 'x' : ' '}] ${t.label.padEnd(26)} ${st} — ${t.file}`);
  }

  console.log('\nMCP additions (only entries aio itself added)');
  const mcp = removeMcpAdditions();
  if (!mcp.length) console.log('  [x] none on record — nothing to remove');
  for (const r of mcp) {
    console.log(`  [${r.status === 'removed' ? 'x' : ' '}] ${r.target.padEnd(26)} ${r.status}`);
  }

  console.log(`\nRemoved ${removed} context block(s).`);
  console.log(`File backups (kept as safety net): ${BACKUP_DIR}`);
  console.log('Local data (ai-tools.db, TOOLS-INDEX.md, TRACKING.md) was never touched.');
  console.log('');
}
