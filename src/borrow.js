// borrow.js — `aio borrow`: live GitHub search + ephemeral shallow clone to temp.
// Nothing permanent: clones live in <tmp>/aio-borrow and self-purge after 24h.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ghThrottle } from './live.js';
import { msg } from './messages.js';

export const BORROW_DIR = path.join(os.tmpdir(), 'aio-borrow');
const TTL_MS = 24 * 60 * 60 * 1000;
const MIN_FREE_BYTES = 1024 * 1024 * 1024; // 1 GB guard

function ghToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000, // a hung `gh` must not stall the whole borrow call
    }).trim();
  } catch {
    return process.env.GITHUB_TOKEN || '';
  }
}

function fmtBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function freeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return Infinity; // platform without statfs → don't block
  }
}

/** Remove borrow dirs older than the TTL. Returns names removed. */
export function purgeExpired(dir = BORROW_DIR) {
  const gone = [];
  if (!fs.existsSync(dir)) return gone;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const full = path.join(dir, ent.name);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs > TTL_MS) {
        fs.rmSync(full, { recursive: true, force: true });
        gone.push(ent.name);
      }
    } catch {
      /* busy/locked — retried next run */
    }
  }
  return gone;
}

/** Live GitHub repository search. Returns top repos: { name, url, desc, stars, why }. */
export async function ghSearch(query, limit = 8) {
  await ghThrottle(); // same GitHub budget as live.js ghRepos/ghSkills — search used to bypass it
  const q = encodeURIComponent(`${query} stars:>5 in:name,description,readme`);
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'aio-borrow' };
  const token = ghToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GitHub search HTTP ${res.status}${res.status === 403 ? ' (rate limited)' : ''}`);
  const data = await res.json();
  return (data.items || []).map((r) => ({
    name: r.full_name,
    url: r.html_url,
    desc: r.description || 'No description provided.',
    stars: r.stargazers_count,
    lang: r.language || '',
    pushed: (r.pushed_at || '').slice(0, 10),
    why: `GitHub search hit — \u2605${r.stargazers_count}${r.language ? ` \u00b7 ${r.language}` : ''}`,
  }));
}

/** Shallow-clone one repo into the borrow dir (after disk guard). */
export function borrowClone(target) {
  const repo = String(target).replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`not a GitHub owner/repo: ${target}`);
  }
  if (!fs.existsSync(BORROW_DIR)) fs.mkdirSync(BORROW_DIR, { recursive: true });
  const free = freeBytes(BORROW_DIR);
  if (free < MIN_FREE_BYTES) {
    throw new Error(`low disk: ${fmtBytes(free)} free (< 1 GB) — run \`aio borrow --clean\` first`);
  }
  const dest = path.join(BORROW_DIR, repo.replace(/[\\/]/g, '_'));
  if (fs.existsSync(path.join(dest, '.git'))) {
    return { path: dest, status: 'already borrowed' };
  }
  if (fs.existsSync(dest)) {
    // dir without .git = an interrupted/partial clone, NOT a healthy borrow —
    // clear it and re-clone instead of handing back a broken tree
    fs.rmSync(dest, { recursive: true, force: true });
  }
  try {
    execFileSync('git', ['clone', '--depth', '1', `https://github.com/${repo}.git`, dest], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // never prompt — a typo'd repo must not hang on a credential prompt
    });
  } catch (e) {
    // surface GitHub's real answer (stderr, verbatim ~300 chars) instead of a bare code
    const detail = String(e.stderr || '').trim().slice(0, 300);
    throw new Error(detail ? `git clone failed: ${detail}` : e.message);
  }
  return { path: dest, status: 'cloned (shallow, depth 1)' };
}

/** Wipe the whole borrow dir. Returns bytes freed + entries removed. */
export function borrowClean(dir = BORROW_DIR) {
  let freed = 0;
  let n = 0;
  if (!fs.existsSync(dir)) return { freed, n, dir };
  const walk = (p) => {
    for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, ent.name);
      try {
        if (ent.isDirectory()) walk(full);
        else freed += fs.statSync(full).size;
      } catch { /* best effort */ }
    }
  };
  walk(dir);
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      fs.rmSync(path.join(dir, ent.name), { recursive: true, force: true });
      n++;
    } else if (ent.isFile()) {
      // stray files at the top level (aborted-clone leftovers) are part of the wipe
      fs.rmSync(path.join(dir, ent.name), { force: true });
      n++;
    }
  }
  return { freed, n, dir };
}

function listBorrowed() {
  if (!fs.existsSync(BORROW_DIR)) return [];
  return fs
    .readdirSync(BORROW_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const full = path.join(BORROW_DIR, d.name);
      // clamp: file mtime can sit a hair ahead of Date.now() (clock skew) — never render "age -0.0h"
      const ageH = (Math.max(0, Date.now() - fs.statSync(full).mtimeMs) / 3600000).toFixed(1);
      return { name: d.name, path: full, ageH };
    });
}

/** `aio borrow` command: search (default) | --get | --clean | --list. */
export async function runBorrow({ query, get, clean, list, json }) {
  const purged = purgeExpired();

  if (clean) {
    const r = borrowClean();
    const txt =
      `aio borrow --clean — ${r.n} clone(s) removed, ${fmtBytes(r.freed)} freed from ${r.dir}` +
      (purged.length ? `\nTTL purge: ${purged.length} expired (>24h): ${purged.join(', ')}` : '');
    return { ok: true, text: txt, json: { schemaVersion: 1, ...r, purged } };
  }

  if (list) {
    const items = listBorrowed();
    const txt = items.length
      ? `aio borrow --list — ${items.length} temp clone(s) in ${BORROW_DIR}\n` +
        items.map((i) => `- ${i.name} — age ${i.ageH}h — ${i.path}`).join('\n')
      : `aio borrow — nothing borrowed (dir: ${BORROW_DIR})`;
    return { ok: true, text: txt, json: { schemaVersion: 1, items } };
  }

  if (get) {
    try {
      const r = borrowClone(get);
      const txt =
        `aio borrow — ${get} → ${r.status}\n` +
        `path: ${r.path}\n` +
        'use it now; auto-purged after 24h (or `aio borrow --clean`).\n' +
        `free disk: ${fmtBytes(freeBytes(BORROW_DIR))}`;
      return { ok: true, text: txt, json: { schemaVersion: 1, ...r, url: `https://github.com/${get}` } };
    } catch (e) {
      return { ok: false, text: msg('borrowGetFailed', { err: e.message }), json: null };
    }
  }

  if (!query || !query.trim()) {
    return {
      ok: false,
      text:
        'usage:\n' +
        '  aio borrow "<what you need>"   live GitHub search (link + function per hit)\n' +
        '  aio borrow --get <owner/repo>  shallow-clone to temp (24h TTL)\n' +
        '  aio borrow --list | --clean    inspect / wipe temp clones',
      json: null,
    };
  }

  if (process.env.AIO_OFFLINE === '1') {
    // same offline payload as search.js runAsk — before any fetch, never
    // "borrow search failed: fetch failed"
    return {
      ok: false,
      json: null,
      text: msg('offlineSearch'),
    };
  }

  try {
    const hits = await ghSearch(query);
    const out = { schemaVersion: 1, query, count: hits.length, hits, purged };
    if (json) return { ok: true, text: JSON.stringify(out, null, 2), json: out };
    if (!hits.length) {
      return { ok: true, json: out, text: `aio borrow — "${query}": no GitHub result. Refine keywords or check https://github.com/search` };
    }
    const lines = [`aio borrow — "${query}" (GitHub live search \u00b7 ${hits.length} results)`];
    if (purged.length) lines.push(`TTL purge: ${purged.length} expired clone(s) removed`);
    lines.push('');
    hits.forEach((h, i) => {
      lines.push(`${i + 1}. ${h.name} — ${h.desc}`);
      lines.push(`   ${h.why}`);
      lines.push(`   ${h.url}`);
    });
    lines.push('', `pin one: aio borrow --get ${hits[0].name}`);
    return { ok: true, text: lines.join('\n'), json: out };
  } catch (e) {
    return { ok: false, text: msg('borrowSearchFailed', { err: e.message }), json: null };
  }
}
