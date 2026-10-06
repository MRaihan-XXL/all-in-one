// rollback.js — `aio rollback`: surgically undo everything setup did (FR7)
import os from 'node:os';
import { stripBlock, removeMcpAdditions } from './write.js';
import { removeSkillAdditions } from './skill.js';
import { blockTargets } from './targets.js';
import { BACKUP_DIR } from './paths.js';
import { msg } from './messages.js';

/** Runs the full rollback report. Returns true when the rollback was CLEAN —
 *  every row finished. A row that kept something behind (`kept`, `parse error`,
 *  `failed`, `refusing…`) means aio left work on disk, so the command must exit
 *  non-zero instead of reporting success (5g); row text itself is unchanged. */
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

  console.log('\nInstalled skills (only byte-identical aio installs)');
  const skills = removeSkillAdditions();
  if (!skills.length) console.log('  [x] none on record — nothing to remove');
  for (const r of skills) {
    const done = r.status === 'removed' || r.status === 'already gone';
    console.log(`  [${done ? 'x' : ' '}] ${r.target.padEnd(26)} ${r.status}`);
  }

  console.log(`\nRemoved ${removed} context block(s).`);
  console.log(`File backups (kept as safety net): ${BACKUP_DIR}`);
  console.log('Local data (TRACKING.md, TOOLS-INDEX.md) was never touched.');
  console.log('');

  const incomplete = [...mcp, ...skills].some((r) => /kept|parse error|failed|refusing/i.test(r.status));
  if (incomplete) console.log(msg('rollbackIncomplete'));
  return !incomplete;
}
