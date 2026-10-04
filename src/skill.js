// skill.js — `aio skill add`: install a public SKILL.md into ~/.agents/skills
// (the shared agentskills.io layout <skill>/SKILL.md — read by every agent that
// scans .agents/skills, 40+ of them, without touching a single instruction file).
// Contract matches the rest of aio: idempotent, ledger-tracked, and rollback
// removes ONLY what aio wrote, ONLY while it is byte-identical (hand-edited →
// kept and reported, ownership passes to the user).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { STATE_DIR } from './paths.js';
import { getVersion } from './banner.js';

const LEDGER = path.join(STATE_DIR, 'skills-ledger.json');

/** Shared skills root (both the global AGENTS.md and 40+ tools read it). */
export function skillsDir(home = os.homedir()) {
  return path.join(home, '.agents', 'skills');
}

function ledgerRead() {
  try {
    const o = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}
function ledgerWrite(list) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(list, null, 2));
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const safeName = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64) || 'skill';

/** owner/repo | https URL to a .md | bare name → fetch candidates (order matters). */
function candidates(target) {
  const gh = target.match(/^(?:(?:https?:\/\/)?github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/);
  if (gh && !/\.md$/i.test(target)) {
    const [, owner, repo] = gh;
    const name = safeName(repo);
    return {
      name,
      source: `github ${owner}/${repo}`,
      urls: [
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${name}/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/.agents/skills/${name}/SKILL.md`,
      ],
    };
  }
  if (/^https:\/\/\S+$/i.test(target)) {
    // fetch with the URL as given (private raw URLs may carry creds) — but the
    // LEDGER must never persist userinfo/query (a ledger is not a secret store).
    const u = new URL(target);
    u.username = '';
    u.password = '';
    u.search = '';
    u.hash = '';
    return { name: safeName(path.basename(u.pathname)), source: u.toString(), urls: [target] };
  }
  return null;
}

async function fetchText(url) {
  if (process.env.AIO_OFFLINE === '1') return null;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': `aio-connect/${getVersion()}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    // a 200 HTML page (github.com blob view, 404 pages served as 200) is not a skill file
    if ((res.headers.get('content-type') || '').toLowerCase().includes('text/html')) return null;
    const txt = await res.text();
    return txt.trim().length >= 20 ? txt : null; // an empty stub is not a skill
  } catch {
    return null;
  }
}

function existingStatus(file, name) {
  const cur = fs.readFileSync(file, 'utf8');
  const rec = ledgerRead().find((e) => e.name === name);
  if (!rec) return { status: 'present (not installed by aio) — skipped', claim: false };
  if (sha(cur) === rec.sha) return { status: 'present', claim: true };
  return { status: 'present (modified since aio installed it) — skipped', claim: false };
}

/** `aio skill add <owner/repo|url> [--file <path>] [--name <n>] [--dry-run]`. */
export async function skillAdd({ target, file: local, name: nameOpt, dry = false }) {
  const home = os.homedir();
  const root = skillsDir(home);

  // 1. resolve content + name
  let content = null;
  let name = null;
  let source = null;
  if (local) {
    const p = path.resolve(local);
    if (!fs.existsSync(p)) return { ok: false, text: `[aio] skill: local path not found — ${p}` };
    const isDir = fs.statSync(p).isDirectory();
    const src = isDir ? path.join(p, 'SKILL.md') : p;
    if (!fs.existsSync(src)) return { ok: false, text: `[aio] skill: SKILL.md not found — ${src}` };
    content = fs.readFileSync(src, 'utf8');
    name = safeName(nameOpt || (isDir ? path.basename(p) : path.basename(p, path.extname(p))));
    source = `local ${src}`;
  } else {
    if (/^http:\/\//i.test(target || '')) {
      return { ok: false, text: '[aio] skill: insecure http:// URL refused — use https://' };
    }
    const c = candidates(target || '');
    if (!c) {
      return {
        ok: false,
        text:
          'usage: aio skill add <owner/repo | url> [--file <path|dir>] [--name <name>]\n' +
          '       aio skill list  ·  aio skill remove <name>\n' +
          'example: aio skill add anthropics/skills --name pdf-tools',
      };
    }
    name = safeName(nameOpt || c.name);
    source = c.source;
    for (const url of c.urls) {
      content = await fetchText(url);
      if (content) break;
    }
    if (!content) {
      return {
        ok: false,
        text:
          `[aio] skill: SKILL.md not found for ${target} (tried ${c.urls.length} location${c.urls.length > 1 ? 's' : ''}).` +
          (process.env.AIO_OFFLINE === '1' ? ' AIO_OFFLINE=1 — remote install disabled.' : ''),
      };
    }
  }

  // 2. idempotence / ownership
  const dir = path.join(root, name);
  const file = path.join(dir, 'SKILL.md');
  if (fs.existsSync(file)) {
    const st = existingStatus(file, name);
    // exit ok only for "already installed by aio" (true idempotence)
    return { ok: st.status === 'present', text: `[aio] skill ${name}: ${st.status} — ${file}` };
  }

  // 3. write (dry = plan only)
  if (dry) return { ok: true, text: `[aio] skill ${name}: would install (dry-run) — ${file} (source: ${source})` };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content);
  const list = ledgerRead().filter((e) => e.name !== name);
  list.push({ name, file, sha: sha(content), source });
  ledgerWrite(list);
  return { ok: true, text: `[aio] skill ${name}: installed — ${file}\n        source: ${source} · recorded for \`aio rollback\`` };
}

/** `aio skill list` — what aio tracks, plus any skills you installed yourself. */
export function skillList() {
  const root = skillsDir();
  const tracked = ledgerRead();
  const lines = ['aio skill list', '─'.repeat(76)];
  let found = 0;
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).sort()) {
      const f = path.join(root, d, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      found++;
      const rec = tracked.find((e) => e.name === d);
      const mark = rec ? 'aio' : 'yours';
      lines.push(`  [${mark === 'aio' ? 'x' : ' '}] ${d.padEnd(30)} ${mark} — ${f}`);
    }
  }
  if (!found) lines.push('  (empty) — install one: aio skill add <owner/repo>');
  lines.push(`root: ${root}`);
  return { ok: true, text: lines.join('\n') };
}

/** `aio skill remove <name>` — explicit user action (rollback covers the rest). */
export function skillRemove({ target }) {
  const name = safeName(target || '');
  const root = path.resolve(skillsDir());
  const dir = path.resolve(root, name);
  if (!dir.startsWith(root + path.sep)) return { ok: false, text: '[aio] skill: invalid name' };
  const file = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(file)) return { ok: false, text: `[aio] skill ${name}: not installed — ${file}` };
  const st = existingStatus(file, name);
  // same ownership contract as rollback: byte-identical aio installs only —
  // hand-modified → it is the user's file now, aio never silently deletes it
  if (st.claim === false) {
    const modified = st.status.includes('modified');
    return {
      ok: false,
      text: modified
        ? `[aio] skill ${name}: modified since aio installed it — aio will not delete your edits; remove manually: ${file}`
        : `[aio] skill ${name}: present (not installed by aio) — skipped: ${file}`,
    };
  }
  // delete EXACTLY what aio wrote (the SKILL.md) — never sibling files the user
  // may have added; the directory goes only when nothing else lives in it
  fs.unlinkSync(file);
  let keptDir = false;
  try {
    fs.rmdirSync(dir);
  } catch {
    keptDir = true;
  }
  ledgerWrite(ledgerRead().filter((e) => e.name !== name));
  return {
    ok: true,
    text: keptDir
      ? `[aio] skill ${name}: SKILL.md removed — directory kept (not empty): ${dir}`
      : `[aio] skill ${name}: removed — ${dir}`,
  };
}

/** Reverse exactly what skillAdd wrote (called by `aio rollback`).
 *  Path-traversal guard: a tampered ledger can never delete outside ~/.agents/skills. */
export function removeSkillAdditions() {
  const root = path.resolve(skillsDir());
  const out = [];
  const keep = [];
  for (const e of ledgerRead()) {
    const dir = path.resolve(root, safeName(e.name));
    const file = path.resolve(root, e.name, 'SKILL.md');
    if (!dir.startsWith(root + path.sep) || file !== path.resolve(e.file || '')) {
      out.push({ target: e.name, status: 'ledger entry invalid — kept (manual review)' });
      keep.push(e);
      continue;
    }
    if (!fs.existsSync(file)) {
      out.push({ target: e.name, status: 'already gone' });
      continue; // gone = nothing to own; drop the entry
    }
    if (sha(fs.readFileSync(file, 'utf8')) !== e.sha) {
      out.push({ target: e.name, status: 'modified by hand — kept (yours now)' });
      continue; // user took ownership; aio stops claiming it
    }
    // same ownership rule as skillRemove: unlink only the aio-written SKILL.md,
    // rmdir only if the directory is otherwise empty (user files survive)
    fs.unlinkSync(file);
    let keptDir = false;
    try {
      fs.rmdirSync(dir);
    } catch {
      keptDir = true;
    }
    out.push({ target: e.name, status: keptDir ? 'SKILL.md removed (directory kept — not empty)' : 'removed' });
  }
  ledgerWrite(keep);
  return out;
}
