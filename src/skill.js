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
import { STATE_DIR, writeAtomic, preserveCorrupt } from './paths.js';
import { getVersion } from './banner.js';
import { ghSkills, ghRepos } from './live.js';
import { msg } from './messages.js';

const LEDGER = path.join(STATE_DIR, 'skills-ledger.json');

/** Shared skills root (both the global AGENTS.md and 40+ tools read it). */
export function skillsDir(home = os.homedir()) {
  return path.join(home, '.agents', 'skills');
}

function ledgerRead() {
  let raw;
  try {
    raw = fs.readFileSync(LEDGER, 'utf8');
  } catch {
    return []; // no ledger yet = aio installed nothing (missing ≠ corrupt)
  }
  try {
    const o = JSON.parse(raw);
    if (Array.isArray(o)) return o;
  } catch {
    /* fall through — invalid JSON is corrupt too */
  }
  // CORRUPT: preserved aside, sentinel returned — a [] read-back would let the
  // next write PERMANENTLY wipe the record (rollback then deletes nothing).
  return { corrupt: true, path: preserveCorrupt(LEDGER) };
}
function ledgerWrite(list) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeAtomic(LEDGER, JSON.stringify(list, null, 2));
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
// Windows device names are unusable as files/dirs (CON, COM1, aux.txt, NUL.md…) —
// blacklist with and without extension; they lowercase above, so test the result.
const WIN_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/;
const safeName = (s) => {
  const n = String(s)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
  return !n || WIN_DEVICE.test(n) ? 'skill' : n;
};

/** owner/repo | https URL to a .md | bare name → fetch candidates (order matters). */
function candidates(target) {
  const gh = target.match(/^(?:(?:https?:\/\/)?github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/);
  if (gh && !/\.md$/i.test(target)) {
    const [, owner, repo] = gh;
    const name = safeName(repo);
    return {
      name,
      source: `github ${owner}/${repo}`,
      // raw.githubusercontent paths are CASE-SENSITIVE: candidate 2/3 must use the
      // repo path as typed (Acme/My-Tool 404s as my-tool) — safeName() is only the
      // destination dir / --name default.
      urls: [
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${repo}/SKILL.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/.agents/skills/${repo}/SKILL.md`,
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

const MAX_BYTES = 1_000_000; // a SKILL.md is a prompt file — never read a runaway body

/** One candidate fetch → an OUTCOME, never a bare null: 'miss' (404/HTML/empty
 *  stub/offline = genuinely not there) vs 'error' (network/oversize/off-https
 *  refusal). Only the outcome split keeps a connection failure from reporting
 *  "SKILL.md not found (tried 3 locations)" — a false claim. */
async function fetchText(url) {
  if (process.env.AIO_OFFLINE === '1') return { kind: 'miss' };
  let res;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': `aio-connect/${getVersion()}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { kind: 'error', error: String(e?.message || e) }; // original error text, verbatim
  }
  // followed redirects must stay on https (a redirect can downgrade/leave the host)
  if (res.url && !res.url.startsWith('https://')) return { kind: 'error', error: `redirected off https: ${res.url}` };
  if (!res.ok) return res.status === 404 ? { kind: 'miss' } : { kind: 'error', error: `HTTP ${res.status}` };
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > MAX_BYTES) return { kind: 'error', error: `response too large (${len} bytes > ${MAX_BYTES})` };
  // a 200 HTML page (github.com blob view, 404 pages served as 200) is not a skill file
  if ((res.headers.get('content-type') || '').toLowerCase().includes('text/html')) return { kind: 'miss' };

  // stream with a hard 1 MB cap — abort mid-stream instead of buffering unbounded
  let txt;
  try {
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel().catch(() => {});
          return { kind: 'error', error: `response body exceeds ${MAX_BYTES} bytes` };
        }
        chunks.push(Buffer.from(value));
      }
      txt = Buffer.concat(chunks).toString('utf8');
    } else {
      txt = await res.text(); // no stream (mocked/odd body) — size-check after
      if (Buffer.byteLength(txt) > MAX_BYTES) return { kind: 'error', error: `response body exceeds ${MAX_BYTES} bytes` };
    }
  } catch (e) {
    return { kind: 'error', error: String(e?.message || e) };
  }
  if (txt.trim().length < 20) return { kind: 'miss' }; // an empty stub is not a skill
  return { kind: 'ok', text: txt };
}

function existingStatus(file, name) {
  const cur = fs.readFileSync(file, 'utf8');
  const l = ledgerRead();
  const rec = Array.isArray(l) ? l.find((e) => e.name === name) : undefined; // corrupt ledger → treat as untracked
  if (!rec) return { status: 'present (not installed by aio) — skipped', claim: false };
  if (sha(cur) === rec.sha) return { status: 'present', claim: true };
  return { status: 'present (modified since aio installed it) — skipped', claim: false };
}

/** `aio skill add <owner/repo|url> [--file <path>] [--name <n>] [--dry-run]`. */
export async function skillAdd({ target, file: local, name: nameOpt, dry = false, sha256: wantSha }) {
  const home = os.homedir();
  const root = skillsDir(home);

  // 1. resolve content + name
  let content = null;
  let name = null;
  let source = null;
  if (local) {
    const p = path.resolve(local);
    if (!fs.existsSync(p)) return { ok: false, text: msg('skillPathNotFound', { p }) };
    const isDir = fs.statSync(p).isDirectory();
    const src = isDir ? path.join(p, 'SKILL.md') : p;
    if (!fs.existsSync(src)) return { ok: false, text: msg('skillMdNotFound', { src }) };
    content = fs.readFileSync(src, 'utf8');
    name = safeName(nameOpt || (isDir ? path.basename(p) : path.basename(p, path.extname(p))));
    source = `local ${src}`;
  } else {
    if (/^http:\/\//i.test(target || '')) {
      return { ok: false, text: msg('skillInsecureHttp') };
    }
    const c = candidates(target || '');
    if (!c) {
      return {
        ok: false,
        text: msg('usageSkillAdd'),
      };
    }
    name = safeName(nameOpt || c.name);
    source = c.source;
    const outcomes = [];
    for (const url of c.urls) {
      const r = await fetchText(url);
      outcomes.push(r);
      if (r.kind === 'ok') {
        content = r.text;
        break;
      }
    }
    if (!content) {
      const errs = outcomes.filter((o) => o.kind === 'error');
      // ALL candidates errored (no 404/stub among them) → a fetch problem, not a
      // missing file; report it as such with the first original error verbatim.
      if (errs.length && errs.length === outcomes.length) {
        return {
          ok: false,
          text: msg('skillFetchFailed', { err: errs[0].error, target }),
        };
      }
      return {
        ok: false,
        text:
          msg('skillMdMissing', { target, n: c.urls.length, s: c.urls.length > 1 ? 's' : '' }) +
          (process.env.AIO_OFFLINE === '1' ? ' AIO_OFFLINE=1 — remote install disabled.' : ''),
      };
    }
  }

  // 1b. optional integrity pin (--sha256 <hex>): hash the exact content that is
  // about to be written and refuse a mismatch - a supply-chain check the caller
  // can run by pinning the hash out-of-band.
  if (wantSha) {
    const want = String(wantSha).toLowerCase().trim();
    if (!/^[0-9a-f]{64}$/.test(want)) return { ok: false, text: msg('skillShaBadFormat', { want }) };
    const got = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    if (got !== want) return { ok: false, text: msg('skillShaMismatch', { want, got }) };
  }

  // 2. idempotence / ownership
  const dir = path.join(root, name);
  const file = path.join(dir, 'SKILL.md');
  if (fs.existsSync(file)) {
    const st = existingStatus(file, name);
    // exit 0 for a benign skip ("already installed by aio" / "not aio's file") —
    // only genuine refusals/failures keep exit 1 (bin reads r.ok)
    const benign = st.status === 'present' || st.status === 'present (not installed by aio) — skipped';
    return { ok: benign, text: msg('skillStatus', { name, status: st.status, file }) };
  }

  // 3. write (dry = plan only)
  if (dry) return { ok: true, text: msg('skillWouldInstall', { name, file, source }) };
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(file, content);
  const l = ledgerRead();
  const list = (Array.isArray(l) ? l : []).filter((e) => e.name !== name); // corrupt preserved aside → fresh record
  list.push({ name, file, sha: sha(content), source });
  ledgerWrite(list);
  return { ok: true, text: msg('skillInstalled', { name, file, source }) };
}

/** `aio skill list` — what aio tracks, plus any skills you installed yourself. */
export function skillList() {
  const root = skillsDir();
  const l = ledgerRead();
  const tracked = Array.isArray(l) ? l : []; // corrupt ledger → every skill shows as "yours"
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
  if (!String(target ?? '').trim()) {
    // reject BEFORE sanitize: safeName('') falls back to 'skill' and would target
    // a bogus dir instead of telling the user what to pass
    return { ok: false, text: msg('usageSkillRemove') };
  }
  const name = safeName(target);
  const root = path.resolve(skillsDir());
  const dir = path.resolve(root, name);
  if (!dir.startsWith(root + path.sep)) return { ok: false, text: msg('skillInvalidName') };
  const file = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(file)) return { ok: false, text: msg('skillNotInstalled', { name, file }) };
  const st = existingStatus(file, name);
  // same ownership contract as rollback: byte-identical aio installs only —
  // hand-modified → it is the user's file now, aio never silently deletes it
  if (st.claim === false) {
    const modified = st.status.includes('modified');
    return {
      ok: false,
      text: modified
        ? msg('skillModified', { name, file })
        : msg('skillNotOurs', { name, file }),
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
  const l = ledgerRead();
  ledgerWrite((Array.isArray(l) ? l : []).filter((e) => e.name !== name));
  return {
    ok: true,
    text: keptDir
      ? msg('skillMdRemoved', { name, dir })
      : msg('skillRemoved', { name, dir }),
  };
}

/** Reverse exactly what skillAdd wrote (called by `aio rollback`).
 *  Path-traversal guard: a tampered ledger can never delete outside ~/.agents/skills. */
export function removeSkillAdditions() {
  const root = path.resolve(skillsDir());
  const out = [];
  const keep = [];
  const ledger = ledgerRead();
  if (!Array.isArray(ledger)) {
    // corrupt ledger (preserved aside): writing keep=[] back would replace the
    // only recoverable copy with an empty record — refuse, loudly, via an out-row.
    return [{ target: 'skills ledger', status: `ledger unreadable — preserved as ${ledger.path}, refusing to write` }];
  }
  for (const e of ledger) {
    const dir = path.resolve(root, safeName(e.name));
    // file must derive from the SANITIZED dir, never from raw e.name: a tampered
    // ledger {"name":"..","file":<outside>/SKILL.md} would otherwise delete
    // outside the skills root (raw resolve escapes, safeName does not).
    const file = path.join(dir, 'SKILL.md');
    if (
      !dir.startsWith(root + path.sep) ||
      !file.startsWith(root + path.sep) ||
      file !== path.resolve(e.file || '')
    ) {
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

/** `aio skill search "<q>"` — live skill discovery in ONE step (was: ask →
 *  copy the name → skill add). Searches GitHub skill files (gh code search,
 *  the scarce/auth lane) + repos (fallback candidates — skillAdd tries the 3
 *  SKILL.md locations for any owner/repo). `--add` installs the top skill hit
 *  immediately; without it every row prints a ready-to-run install command.
 *  Same contract as ask: zero storage, failures surface in errors[]. */
export async function skillSearch({ query, add = false, json = false }) {
  const q = String(query || '').trim();
  if (!q) {
    return {
      ok: false,
      json: null,
      text: msg('usageSkillSearch'),
    };
  }
  if (process.env.AIO_OFFLINE === '1') {
    return { ok: false, json: null, text: msg('offlineSkillSearch') };
  }
  const t0 = Date.now();
  const lanes = [
    ['skills', ghSkills(q, 8)],
    ['github', ghRepos(q, 6)],
  ];
  const settled = await Promise.allSettled(lanes.map(([, p]) => p));
  const hits = [];
  const sources = [];
  const errors = [];
  settled.forEach((r, i) => {
    const label = lanes[i][0];
    if (r.status === 'fulfilled') {
      sources.push(label);
      if (Array.isArray(r.value)) hits.push(...r.value);
    } else {
      // skills lane needs auth — an unauthenticated/missing gh must say so
      // instead of pretending there are no skills.
      errors.push({ src: label, msg: String(r.reason?.message || r.reason || 'failed') });
    }
  });

  let installed = null;
  if (add) {
    const top = hits.find((h) => h.type === 'skill') || hits[0];
    if (!top) {
      const fail = { ok: false, json: null, text: msg('skillSearchNoHit', { q, lanes: errors.length ? ` (lanes: ${errors.map((e) => e.src).join(', ')})` : '' }) };
      return fail;
    }
    const r = await skillAdd({ target: top.name });
    installed = { name: top.name, ...r };
    if (json) {
      const payload = { schemaVersion: 1, query: q, sources, errors, count: hits.length, stored: 0, hits, installed };
      return { ok: r.ok, text: JSON.stringify(payload, null, 2), json: payload };
    }
    return { ok: r.ok, json: null, text: `aio skill search — "${q}" → installing top hit\n${r.text}` };
  }

  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = sources.length > 0 || errors.length === 0;
  const payload = {
    schemaVersion: 1, // bump only on breaking shape change (same contract as ask)
    query: q,
    sources,
    errors,
    count: hits.length,
    stored: 0, // live search — nothing persisted
    hits,
    commands: hits.map((h) => `aio skill add ${h.name}`),
  };
  if (json) return { ok, text: JSON.stringify(payload, null, 2), json: payload };

  const lines = [`aio skill search — "${q}" (live: ${sources.join('+') || 'no lane answered'} · ${hits.length} hits · ${ms}s)`];
  if (errors.length) {
    lines.push(`source issues: ${errors.map((e) => `${e.src}: ${String(e.msg).slice(0, 80)}`).join(' | ')}`);
  }
  if (!hits.length) {
    lines.push(errors.length && !sources.length ? 'Live sources failed — fix the issue above, then retry.' : 'No skill found — refine keywords.');
    return { ok, json: payload, text: lines.join('\n') };
  }
  hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.name} ${h.type === 'skill' ? '[skill]' : '[repo]'} — ${h.func}`);
    lines.push(`   install: aio skill add ${h.name}`);
  });
  lines.push('note: public results are unvetted — read SKILL.md before trusting it (docs/THREATS.md).');
  return { ok, json: payload, text: lines.join('\n') };
}
