// live.js — real-time source layer: GitHub (repos + skills via code search),
// npm, crates.io. No search storage: results are printed, never written to disk/db.
// Every source degrades silently (timeout/missing gh/rate limit → skip).
// Every entry carries `trust01` — a popularity prior in [0,1] (stars/downloads/
// npm score) that `search.js` blends into the final ranking (FR12).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getVersion } from './banner.js';
import { STATE_DIR, writeAtomic } from './paths.js';
import { detectBinary, listPathCommands } from './scan.js';

const execFileP = promisify(execFile);
const UA = { 'user-agent': `aio-connect/${getVersion()} (+https://github.com/MRaihan-XXL/all-in-one)` };
const T = (ms) => AbortSignal.timeout(ms);

/* ---- GitHub search rate budget (P5) ---------------------------------------
   Unauthenticated GitHub search allows 10 req/min — an agent calling `aio ask`
   per prompt hits 403 quickly and the failure masquerades as "source down".
   We space GitHub search calls ACROSS processes via a timestamp-only file
   (no queries, no results — zero search storage; this is a clock, not history).
   Defaults: 8 calls/min unauthenticated, 25 with a token (API cap: 30).
   AIO_RATE=n overrides the budget; AIO_RATE=0 disables spacing entirely. */
const RATE_FILE = path.join(STATE_DIR, 'gh-rate.json');
const RATE_LOCK = path.join(STATE_DIR, 'gh-rate.lock');

/** Cross-process reservation for the rate clock. The old read-then-write let
 *  concurrent callers (ghRepos ∥ ghSkills, or two aio processes) both pass on
 *  stale state. wx lock file + stale break (holder >15s is presumed dead) +
 *  short retry; any lock failure degrades to the old lockless path — a
 *  too-eager call beats a stuck one. */
async function acquireRateLock() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch {
    return false; // state dir unusable (read-only/file) → lockless path
  }
  const deadline = Date.now() + 9000; // holder can wait out a full gap (~7.5s)
  for (;;) {
    try {
      fs.writeFileSync(RATE_LOCK, String(Date.now()), { flag: 'wx' });
      return true;
    } catch (e) {
      if (!e || e.code !== 'EEXIST') return false;
      let stale = false;
      try {
        stale = Date.now() - fs.statSync(RATE_LOCK).mtimeMs > 15000;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
        continue; // released between the write and the stat — retry
      }
      if (stale) {
        try {
          fs.rmSync(RATE_LOCK, { force: true });
        } catch {
          /* raced a releaser — the next loop iteration resolves it */
        }
        continue;
      }
      if (Date.now() > deadline) return false; // holder outruns us — proceed lockless
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function releaseRateLock() {
  try {
    fs.rmSync(RATE_LOCK, { force: true });
  } catch {
    /* never mask the caller's result */
  }
}

export async function ghThrottle() {
  if (process.env.AIO_RATE === '0') return;
  const locked = await acquireRateLock();
  try {
    const t = await ghToken(); // cached after the first call
    const perMin = Number(process.env.AIO_RATE) > 0 ? Number(process.env.AIO_RATE) : t ? 25 : 8;
    const gap = 60000 / perMin;
    let last = 0;
    try {
      last = JSON.parse(fs.readFileSync(RATE_FILE, 'utf8')).last || 0;
    } catch {
      /* first run or no state — no wait */
    }
    const since = Date.now() - last;
    if (last && since < gap) {
      // cap the wait — better an honest 403 than an unbounded stall
      await new Promise((r) => setTimeout(r, Math.min(gap - since, 8000)));
    }
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      writeAtomic(RATE_FILE, JSON.stringify({ last: Date.now() }));
    } catch {
      /* read-only home — spacing degrades to in-process only */
    }
  } finally {
    if (locked) releaseRateLock();
  }
}

/* ---------------- helpers ---------------- */

let ghTokenCache; // in-memory only — never logged, never persisted
async function ghToken() {
  if (ghTokenCache !== undefined) return ghTokenCache;
  // GH_TOKEN is documented (README/HELP/error hints) but was never read: check
  // env first (trimmed, non-empty wins), before the `gh auth token` subprocess.
  const env = String(process.env.GH_TOKEN || '').trim() || String(process.env.GITHUB_TOKEN || '').trim();
  if (env) {
    ghTokenCache = env;
    return ghTokenCache;
  }
  if (process.env.AIO_NO_GH === '1') {
    ghTokenCache = null;
    return null; // shell-free mode (tests): no subprocess spawn
  }
  try {
    const { stdout } = await execFileP('gh', ['auth', 'token'], { timeout: 4000, windowsHide: true });
    ghTokenCache = String(stdout).trim() || null;
  } catch {
    ghTokenCache = null; // unauthenticated: search still works (lower rate)
  }
  return ghTokenCache;
}

function ghHeaders() {
  // every gh API call here is JSON — the flag param had only one value (7b)
  return { ...UA, accept: 'application/vnd.github+json' }; // Authorization attached per-call by ghAuthHeaders()
}

async function ghAuthHeaders() {
  const h = ghHeaders();
  const t = await ghToken();
  if (t) h.authorization = `Bearer ${t}`;
  return h;
}

function trim(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// GitHub ANDs every term — drop generic words or rich queries return 0 hits.
const STOP = new Set([
  'a', 'an', 'the', 'for', 'to', 'of', 'in', 'on', 'with', 'and', 'or', 'is', 'my', 'i',
  'awesome', 'best', 'free', 'good', 'nice', 'great', 'library', 'libraries', 'tool', 'tools',
  'package', 'packages', 'need', 'want', 'find', 'some', 'any', 'please', 'make', 'use', 'using',
]);
export function ghQuery(q) {
  const words = String(q).toLowerCase().split(/[^a-z0-9.@/-]+/).filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w));
  return (kept.length ? kept : words).slice(0, 6).join(' ') || String(q);
}

/* ---------------- sources ---------------- */

/** GitHub repository search — the whole public corpus (630M+ repos, Octoverse 2025).
 *  One silent retry on 429/503 honouring Retry-After (capped 1.5s) — rate limits
 *  must not masquerade as "no match" (P-01). */
export async function ghRepos(q, n = 6) {
  const gq = ghQuery(q);
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(gq)}&sort=stars&order=desc&per_page=${n}`;
  await ghThrottle();
  let res = await fetch(url, { headers: await ghAuthHeaders(), signal: T(4000) });
  if (res.status === 429 || res.status === 503) {
    const ra = Number(res.headers.get('retry-after'));
    const wait = Math.min((Number.isFinite(ra) && ra > 0 ? ra : 1) * 1000, 1500);
    await new Promise((r) => setTimeout(r, wait));
    res = await fetch(url, { headers: await ghAuthHeaders(), signal: T(4000) });
  }
  if (!res.ok) {
    // 403 with an exhausted quota is a rate limit, not "github down": surface the
    // reset time so the user knows when it clears (429/503 keep the retry above).
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      if (Number.isFinite(reset) && reset > 0) {
        const secs = Math.max(0, reset - Math.floor(Date.now() / 1000));
        throw new Error(`github rate-limited until ${new Date(reset * 1000).toUTCString()} (+${secs}s)`);
      }
    }
    throw new Error(`github ${res.status}`);
  }
  const data = await res.json();
  return (data.items || []).map((r) => ({
    type: 'repo',
    name: r.full_name,
    url: r.html_url,
    func: trim(r.description, 120) || `${r.language || 'Repo'} repository (no description)`,
    meta: `★${r.stargazers_count}${r.language ? ` · ${r.language}` : ''}`,
    src: 'github',
    trust01: Math.min(1, Math.log10(1 + (r.stargazers_count || 0)) / 5),
  }));
}

/**
 * Skills live discovery via GitHub code search (filename:SKILL.md) — 6.8M+ public
 * skill files (measured 2026-09-30). Disabled entirely under AIO_NO_GH (no job
 * scheduled). A failed `gh api` call REJECTS — the lane must land in errors[],
 * not fake "answered with 0 hits" (W1: a swallowed error would inflate sources[]).
 */
export async function ghSkills(q, n = 6) {
  if (process.env.AIO_NO_GH === '1') return [];
  const codeQ = `filename:SKILL.md ${ghQuery(q)}`.trim();
  const api = `search/code?q=${encodeURIComponent(codeQ)}&per_page=${n}`;
  await ghThrottle();
  const { stdout } = await execFileP('gh', ['api', api], {
    timeout: 4500,
    maxBuffer: 1 << 20,
    windowsHide: true,
    env: { ...process.env, GH_PAGER: '' },
  });
  const data = JSON.parse(stdout);
  return (data.items || []).map((f) => ({
    type: 'skill',
    name: f.repository.full_name,
    url: f.repository.html_url,
    func: `SKILL.md — ${f.path}`,
    meta: 'public skill (github code search)',
    src: 'github',
    trust01: 0.5, // no popularity field in code search results → neutral prior
  }));
}

/** npm registry search — 3M+ packages. */
export async function npmSearch(q, n = 6) {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=${n}`;
  const res = await fetch(url, { headers: UA, signal: T(4000) });
  if (!res.ok) throw new Error(`npm ${res.status}`);
  const data = await res.json();
  return (data.objects || []).map((o) => ({
    type: 'tool',
    name: o.package.name,
    url: `https://www.npmjs.com/package/${o.package.name}`,
    func: trim(o.package.description, 120) || 'npm package (no description)',
    meta: [o.package.version ? `v${o.package.version}` : '', (o.package.keywords || []).slice(0, 3).join(' · ')]
      .filter(Boolean)
      .join(' · '),
    src: 'npm',
    trust01: typeof o.score?.final === 'number' ? o.score.final : 0.5, // npm quality/popularity score
  }));
}

/** crates.io objects have NO stars field — the old ★0 was fabricated. Show what
 *  actually exists (total downloads, else recent), compact enough for the row. */
const fmtCount = (n) => (n >= 1_000_000 ? `${Math.round(n / 1_000_000)}m` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** crates.io search — Rust tools. */
export async function cratesSearch(q, n = 5) {
  const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(q)}&per_page=${n}`;
  const res = await fetch(url, { headers: UA, signal: T(4000) });
  if (!res.ok) throw new Error(`crates ${res.status}`);
  const data = await res.json();
  return (data.crates || []).map((c) => {
    const dl = c.downloads ?? c.recent_downloads;
    const meta = [`v${c.max_stable_version || '?'}`, typeof dl === 'number' ? `↓${fmtCount(dl)}` : '']
      .filter(Boolean)
      .join(' · ');
    return {
      type: 'tool',
      name: c.id,
      url: `https://crates.io/crates/${c.id}`,
      func: trim(c.description, 120) || 'Rust crate (no description)',
      meta,
      src: 'crates',
      trust01: Math.min(1, Math.log10(1 + (c.downloads || c.recent_downloads || 0)) / 7),
    };
  });
}

/* ---------------- agent-only lanes: WEB + LOCAL TOOLS ----------------
   Scheduled exclusively by `aio agent` (all-mode): `aio ask` keeps its lean
   4-lane budget (its tests pin the exact probe count), while the coordinator
   consults EVERYTHING — repos, skills, npm, crates, the open web and the
   tools already installed on this machine. Same contract as every lane:
   4s budget, no storage, failures land in errors[] — never a fake empty lane. */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Web-lane content tokens — stop-stripped, ≥3 chars (csv/pdf/chart). */
const webToks = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));

/** Wikipedia's opensearch prefix-matches loosely: a full multi-word task query
 *  returns 0 rows ("convert csv to interactive chart") while a short one drags
 *  in prefix junk ("csv chart" → "CSS Chattahoochee"). So query with the SINGLE
 *  longest content token — every title then legitimately starts with it.
 *  Exported for tests. */
export function wikiQuery(q) {
  const toks = webToks(q);
  if (toks.length) return [...toks].sort((a, b) => b.length - a.length)[0];
  const fb = String(q).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return fb[0] || String(q);
}

/** Relevance gate for the web lane — only when the query carries ≥2 content
 *  tokens (a 1-token query is already prefix-exact by construction). A row must
 *  share ≥1 content token with the query (either direction, ≥3 chars) or it is
 *  noise: an honest short lane beats a junk-filled one. */
export function webRelevant(title, qToks) {
  if (qToks.length < 2) return true;
  const tt = String(title).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  return tt.some((t) => qToks.some((q) => t.startsWith(q) || q.startsWith(t)));
}

/** Web lane — Wikipedia opensearch + Hacker News Algolia. Both are keyless,
 *  JSON, no scraping; a hard failure of BOTH halves rejects (so the errors[]
 *  note shows), one healthy half still answers. */
export async function webSearch(q, n = 5) {
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(wikiQuery(q))}&limit=${n}&format=json`;
  // tags=story: without it the relevance-mixed index returns comment objects
  // (no title) first — a filter then silently empties the lane.
  const hnUrl = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&hitsPerPage=${n}&tags=story`;
  const [wiki, hn] = await Promise.allSettled([
    fetch(wikiUrl, { headers: UA, signal: T(4000) }).then(async (r) => {
      if (!r.ok) throw new Error(`wikipedia ${r.status}`);
      const a = await r.json();
      // opensearch shape: [term, [titles], [descs], [urls]] — an {error:...}
      // object must surface as a failed lane, never silently become "0 hits"
      if (!Array.isArray(a)) throw new Error(`wikipedia: ${a?.error?.code || 'bad response'}`);
      const [, titles = [], descs = [], urls = []] = Array.isArray(a) ? a : [];
      return titles.map((t, i) => ({
        type: 'site',
        name: t,
        url: urls[i] || `https://en.wikipedia.org/wiki/${encodeURIComponent(t)}`,
        func: trim(descs[i], 120) || 'Wikipedia article',
        meta: 'wikipedia',
        src: 'web',
        trust01: 0.5, // curated encyclopedia — neutral prior, no popularity field
      }));
    }),
    fetch(hnUrl, { headers: UA, signal: T(4000) }).then(async (r) => {
      if (!r.ok) throw new Error(`hacker news ${r.status}`);
      const d = await r.json();
      if (!Array.isArray(d?.hits)) throw new Error('hacker news: bad response'); // never mask a failed lane as 0 hits
      return (d.hits || [])
        .filter((h) => h.title)
        .map((h) => ({
          type: 'site',
          name: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          func: `Hacker News discussion — ${h.points ?? 0} points by ${h.author ?? '?'}`,
          meta: 'hacker news',
          src: 'web',
          trust01: Math.min(1, Math.log10(1 + (h.points || 0)) / 3),
        }));
    }),
  ]);
  const out = [];
  let firstErr = null;
  for (const r of [wiki, hn]) {
    if (r.status === 'fulfilled') out.push(...r.value);
    else firstErr = firstErr || r.reason;
  }
  if (!out.length && firstErr) throw firstErr; // both halves dead → real error, not "0 hits"
  const qToks = webToks(q);
  const clean = out.filter((r) => webRelevant(r.name, qToks));
  // Never starve: if the gate wipes EVERY row the lane produced, the unfiltered
  // rows stand (same contract as ask's coverage gate). In production wiki rows
  // are already prefix-exact by construction, so this only rescues a fixture-
  // or edge-case wipe — junk rows sharing nothing with a ≥2-token query still drop.
  return (clean.length ? clean : out).slice(0, n * 2);
}

/** Local tools lane — coordinate what is ALREADY on this machine. A hit means
 *  "run it now, no install": distinctive name/keyword match against a curated
 *  map AND a PATH probe (scan.js detectBinary) — no PATH presence = no row, so
 *  the coordinator never suggests a tool the user does not have. Never fetches. */
const LOCAL_TOOLS = [
  { name: 'ffmpeg', func: 'convert/record audio & video', url: 'https://ffmpeg.org', keys: ['video', 'audio', 'transcode', 'media convert'] },
  { name: 'yt-dlp', func: 'download video/audio + subtitles from 1000+ sites', url: 'https://github.com/yt-dlp/yt-dlp', keys: ['youtube', 'download video', 'subtitle', 'transcript'] },
  { name: 'pandoc', func: 'document converter — docx/pdf/epub/md/html', url: 'https://pandoc.org', keys: ['docx', 'markdown', 'convert document', 'word document'] },
  { name: 'jq', func: 'slice & transform JSON from the shell', url: 'https://jqlang.github.io/jq/', keys: ['json'] },
  { name: 'rg', func: 'recursive regex search (ripgrep)', url: 'https://github.com/BurntSushi/ripgrep', keys: ['ripgrep', 'grep', 'search code', 'search files'] },
  { name: 'fd', func: 'simple fast find', url: 'https://github.com/sharkdp/fd', keys: ['find file'] },
  { name: 'fzf', func: 'fuzzy finder for anything', url: 'https://github.com/junegunn/fzf', keys: ['fuzzy'] },
  { name: 'gh', func: 'GitHub CLI — repos, issues, PR, actions', url: 'https://cli.github.com', keys: ['github', 'pull request'] },
  { name: 'git', func: 'version control', url: 'https://git-scm.com', keys: ['version control'] },
  { name: 'docker', func: 'containers & images', url: 'https://www.docker.com', keys: ['container'] },
  { name: 'kubectl', func: 'Kubernetes control', url: 'https://kubernetes.io', keys: ['kubernetes', 'k8s'] },
  { name: 'terraform', func: 'infrastructure as code', url: 'https://www.terraform.io', keys: ['infrastructure'] },
  { name: 'make', func: 'task runner / build automation', url: 'https://www.gnu.org/software/make/', keys: ['build task'] },
  { name: 'cmake', func: 'cross-platform build system', url: 'https://cmake.org', keys: ['build c++'] },
  { name: 'go', func: 'Go toolchain', url: 'https://go.dev', keys: ['golang'] },
  { name: 'cargo', func: 'Rust package manager', url: 'https://crates.io', keys: ['rust'] },
  { name: 'python', func: 'Python interpreter', url: 'https://www.python.org', keys: [] },
  { name: 'uv', func: 'fast Python package/venv manager', url: 'https://github.com/astral-sh/uv', keys: ['python package'] },
  { name: 'node', func: 'JavaScript runtime', url: 'https://nodejs.org', keys: [] },
  { name: 'pnpm', func: 'disk-efficient npm client', url: 'https://pnpm.io', keys: [] },
  { name: 'bun', func: 'fast JS runtime + bundler', url: 'https://bun.sh', keys: [] },
  { name: 'deno', func: 'secure JS/TS runtime', url: 'https://deno.com', keys: [] },
  { name: 'code', func: 'VS Code editor CLI', url: 'https://code.visualstudio.com', keys: ['vscode'] },
  { name: 'curl', func: 'HTTP client', url: 'https://curl.se', keys: ['http request'] },
  { name: 'wget', func: 'file downloader', url: 'https://www.gnu.org/software/wget/', keys: ['download file'] },
  { name: '7z', func: 'archive pack/unpack (7-Zip)', url: 'https://www.7-zip.org', keys: ['unzip', 'extract archive'] },
  { name: 'pdftk', func: 'PDF toolkit — merge/split/fill forms', url: 'https://pdflabs.com/tools/pdftk-the-pdf-toolkit/', keys: ['pdf merge', 'pdf split'] },
  { name: 'magick', func: 'ImageMagick — image convert/resize', url: 'https://imagemagick.org', keys: ['imagemagick', 'resize image', 'convert image'] },
  { name: 'tesseract', func: 'OCR — image to text', url: 'https://github.com/tesseract-ocr/tesseract', keys: ['ocr'] },
  { name: 'sqlite3', func: 'embedded SQL database', url: 'https://sqlite.org', keys: ['sqlite', 'database query'] },
  { name: 'psql', func: 'PostgreSQL client', url: 'https://www.postgresql.org', keys: ['postgres'] },
  { name: 'redis-cli', func: 'Redis client', url: 'https://redis.io', keys: ['redis'] },
  { name: 'aws', func: 'AWS CLI', url: 'https://aws.amazon.com/cli/', keys: ['amazon web'] },
  { name: 'gcloud', func: 'Google Cloud CLI', url: 'https://cloud.google.com/sdk', keys: ['google cloud'] },
  { name: 'openssl', func: 'crypto toolkit — certs/keys', url: 'https://www.openssl.org', keys: ['certificate', 'self signed'] },
  { name: 'rclone', func: 'sync files across cloud storage', url: 'https://rclone.org', keys: ['sync files', 'cloud storage'] },
  { name: 'hyperfine', func: 'benchmark any command', url: 'https://github.com/sharkdp/hyperfine', keys: ['benchmark command'] },
  { name: 'soffice', func: 'LibreOffice — office convert/headless', url: 'https://libreoffice.org', keys: ['libreoffice', 'office document'] },
];

// Generic words that must NOT fire a tool match on their own: without this,
// "convert csv" would summon ffmpeg (key "media convert") on any machine that
// has it installed. A key needs a distinctive surviving word to match.
const KEYSTOP = new Set([
  'convert', 'run', 'use', 'best', 'free', 'tool', 'tools', 'cli', 'how', 'with',
  'for', 'and', 'the', 'data', 'file', 'files', 'open', 'new', 'create', 'from',
  'into', 'to', 'format', 'formats', 'make', 'get', 'list', 'code', 'web', 'media',
]);

// PATH-command discovery cache (one scan per process) + words that must never
// surface as a discovered binary name even when present on PATH.
let PATH_CMDS = null;
function pathCommands() {
  if (!PATH_CMDS) PATH_CMDS = listPathCommands();
  return PATH_CMDS;
}
const GENERIC_BIN = new Set(['npx', 'node', 'npm', 'npmx', 'corepack', 'sh', 'bash', 'zsh', 'pwsh', 'powershell', 'cmd', 'sudo']);

export function localTools(q, n = 4) {
  const s = String(q || '').toLowerCase();
  if (!s.trim()) return [];
  const tokens = new Set(s.split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  const out = [];
  for (const t of LOCAL_TOOLS) {
    if (out.length >= n) break;
    // distinctive name match with token boundaries (bare includes() would make
    // "git" fire on "github" and "go" on "golang")
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(t.name)}(?:[^a-z0-9]|$)`);
    const nameHit = re.test(s);
    const keyHit = t.keys.some((k) =>
      k.split(/[^a-z0-9]+/).some((w) => w.length > 2 && !KEYSTOP.has(w) && tokens.has(w)),
    );
    if (!nameHit && !keyHit) continue;
    const bin = detectBinary(t.name);
    if (!bin) continue; // no phantom suggestions — the row means "installed, run it"
    out.push({
        type: 'tool',
        name: t.name,
        url: t.url,
        func: `${t.func} — on PATH: ${bin}`,
        meta: 'local · on PATH',
        src: 'tools',
        trust01: 0.9, // present + relevant = highest practical confidence
      });
    }
    // PATH discovery: a CLI aio's curated list does not know can still surface,
    // but ONLY on an exact token match (>= 3 chars, never a KEYSTOP word), so the
    // lane reports what is installed instead of guessing what might be useful.
    if (out.length < n) {
      const curated = new Set(LOCAL_TOOLS.map((t2) => t2.name.toLowerCase()));
      for (const [stem, full] of pathCommands()) {
        if (out.length >= n) break;
        if (curated.has(stem) || stem.length < 3 || KEYSTOP.has(stem) || GENERIC_BIN.has(stem)) continue;
        if (!tokens.has(stem)) continue;
        out.push({
          type: 'tool',
          name: stem,
          url: null,
          func: `${stem} — on PATH: ${full}`,
          meta: 'local · on PATH',
          src: 'tools',
          trust01: 0.8,
        });
      }
    }
    return out;
  }

/* ---------------- adaptive routing ---------------- */

/**
 * Which sources fit this query (adaptive = skip sources that cannot hit).
 * Always-on: GitHub repos + npm. crates only for rust-ish asks; skills only for
 * skill-ish asks (gh code search is the scarce quota). Returns the sanitized
 * per-source queries.
 */
export function detectIntent(query = '') {
  const q = String(query).trim();
  const s = q.toLowerCase();
  const hasUrl = /\bhttps?:\/\/|www\./.test(s);
  const stripUrl = q.replace(/https?:\/\/\S+|www\.\S+/g, ' ').trim() || q;
  return {
    web: hasUrl, // hint: agent's own web search covers URLs
    repos: stripUrl,
    npm: stripUrl,
    crates: /\b(rust|crate|cargo|crates\.io)\b/.test(s) ? stripUrl : null,
    // skills lane = scarce gh code-search quota → skill/prompt asks only (P-03)
    skills: /\b(skills?|prompts?|awesome[- _]?skill)\b/.test(s) ? stripUrl : null,
  };
}

/**
 * Run every applicable source in parallel (allSettled, 4s budget each).
 * Returns { entries, sources, errors } — sources = labels that answered,
 * errors = [{src, msg}] for failures (rate limit / network / timeout) so the
 * caller can distinguish "source down" from "no match". NEVER persists anything.
 */
export async function liveSearch(query, { n = 8, all = false } = {}) {
  if (process.env.AIO_OFFLINE === '1') return { entries: [], sources: [], offline: true };
  const it = detectIntent(query);
  const jobs = [];
  const labels = [];
  if (it.repos) {
    jobs.push(ghRepos(it.repos, n));
    labels.push('github');
  }
  if (it.skills && process.env.AIO_NO_GH !== '1') {
    jobs.push(ghSkills(it.skills, Math.min(n, 6)));
    labels.push('skills');
  }
  if (it.npm) {
    jobs.push(npmSearch(it.npm, n));
    labels.push('npm');
  }
  if (it.crates) {
    jobs.push(cratesSearch(it.crates, Math.min(n, 6)));
    labels.push('crates');
  }
  if (all) {
    // `aio agent` coordinates EVERYTHING: open web (wikipedia+HN) + the tools
    // already on PATH run alongside the catalog lanes above (same allSettled).
    jobs.push(webSearch(it.repos || String(query), 5));
    labels.push('web');
    const tools = localTools(query);
    if (tools.length) {
      jobs.push(Promise.resolve(tools));
      labels.push('tools');
    }
  }
  const settled = await Promise.allSettled(jobs);
  const entries = [];
  const sources = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sources.push(labels[i]); // a lane that answered counts even with 0 hits (B-01)
      if (Array.isArray(r.value) && r.value.length) entries.push(...r.value);
    } else {
      errors.push({ src: labels[i], msg: String(r.reason?.message || r.reason || 'failed') });
    }
  });
  return { entries, sources, errors, web: it.web, offline: false };
}
