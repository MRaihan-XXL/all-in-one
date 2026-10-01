// targets.js — single source of truth for aio's instruction-file targets.
// setup, status, rollback and doctor all derive their list from here, so adding
// an agent is a one-line change and rollback can never drift from setup (B-04).
// Paths follow each tool's OFFICIAL instruction locations (verified 2026-10):
//   CLI agents → their config dirs; Zed → %APPDATA%\Zed (win) / ~/.config/zed;
//   project mode (`aio init`) → ./AGENTS.md (+ optional .github/copilot-instructions.md).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectAgents } from './scan.js';

/** [label, pathRelativeToHome, configDirRelativeToHome] — dir drives install checks. */
export const AGENT_INSTRUCTIONS = [
  ['opencode', '.config/opencode/AGENTS.md', '.config/opencode'],
  ['claude', '.claude/CLAUDE.md', '.claude'],
  ['kimi', '.kimi-code/AGENTS.md', '.kimi-code'],
  ['jcode', '.jcode/AGENTS.md', '.jcode'],
  ['codex', '.codex/AGENTS.md', '.codex'],
  ['gemini', '.gemini/GEMINI.md', '.gemini'],
];
export const GLOBAL_REL = 'AGENTS.md';

/** Official Zed personal-instructions path (docs: AGENTS.md under the Zed config dir). */
export function zedTarget(home = os.homedir()) {
  const dir =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Zed')
      : path.join(home, '.config', 'zed');
  return { label: 'zed', file: path.join(dir, 'AGENTS.md'), dir };
}

/** ~/AGENTS.md matters for hermes/freebuff — or whenever the file already exists. */
export function globalWanted(home = os.homedir(), agents = null) {
  if (fs.existsSync(path.join(home, GLOBAL_REL))) return true;
  const list = agents || detectAgents();
  return list.some((a) => a.found && (a.name === 'hermes' || a.name === 'freebuff'));
}

/** [{label, file, dir}] — the one target list every command shares.
 *  global: 'auto' (hermes/freebuff/exists) | 'always' (rollback strips it regardless).
 *  dir = the agent's config dir; consumers skip entries whose dir does not exist. */
export function blockTargets(home = os.homedir(), { agents = null, global: g = 'auto' } = {}) {
  const files = AGENT_INSTRUCTIONS.map(([label, rel, dirRel]) => ({
    label,
    file: path.join(home, rel),
    dir: path.join(home, dirRel),
  }));
  const zed = zedTarget(home);
  files.push({ label: zed.label, file: zed.file, dir: zed.dir });
  if (g === 'always' || globalWanted(home, agents)) {
    files.push({ label: 'global', file: path.join(home, GLOBAL_REL), dir: home });
  }
  return files;
}
