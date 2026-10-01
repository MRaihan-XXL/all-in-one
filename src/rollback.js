// rollback.js — `aio rollback`: surgically undo everything setup did (FR7)
import os from 'node:os';
import { stripBlock, removeMcpAdditions } from './write.js';
import { blockTargets } from './targets.js';
import { BACKUP_DIR } from './paths.js';

export function runRollback() {
  const home = os.homedir();
  // one shared list with setup/status/doctor — global always included (B-04)
  const targets = blockTargets(home, { global: 'always' });

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
  console.log('Local data (TRACKING.md, TOOLS-INDEX.md) was never touched.');
  console.log('');
}
