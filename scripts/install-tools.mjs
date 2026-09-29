#!/usr/bin/env node
/* install-tools.mjs — scan every cloned repo for an install method (Task B).
 * Usage:
 *   node scripts/install-tools.mjs scan   → plan JSON on stdout + temp file
 *   node scripts/install-tools.mjs run    → execute safe installs, append ~/.aio/install-log.jsonl
 * Safety: npm uses --ignore-scripts; python via uv tool (isolated); go via go install.
 * Heavy builds (cargo/make) and self-hosted apps are SKIPPED (recorded as skip reasons).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const REPOS = process.env.AIO_REPOS_DIR || 'D:\\Tools\\github';
const PLAN = path.join(os.tmpdir(), 'aio-install-plan.json');
const LOG = path.join(os.homedir(), '.aio', 'install-log.jsonl');
const MIN_FREE_GB = 2;
const SKIP_APPS = new Set(['core', 'searxng']); // server apps, not CLI tools
let GOBIN = null;

function freeGB(drive) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-PSDrive ${drive[0]}).Free`], { encoding: 'utf8' });
    return parseInt(out, 10) / 1024 ** 3 || 99;
  } catch { return 99; }
}

function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

function scanOne(dir) {
  const name = path.basename(dir);
  const rec = { name, dir, kind: 'unknown', reason: '', pkg: '', cmd: '', bins: [] };
  const pkg = readJson(path.join(dir, 'package.json'));
  const hasCompose = existsSync(path.join(dir, 'docker-compose.yml')) || existsSync(path.join(dir, 'docker-compose.yaml')) || existsSync(path.join(dir, 'compose.yaml'));
  const hasDocker = existsSync(path.join(dir, 'Dockerfile'));

  if (pkg && pkg.bin && Object.keys(pkg.bin).length) {
    rec.kind = 'npm';
    rec.pkg = pkg.name || name;
    rec.bins = Array.isArray(pkg.bin) ? pkg.bin : Object.keys(pkg.bin);
    rec.cmd = `npm install -g --ignore-scripts "${dir}"`;
    return rec;
  }
  if (hasCompose) { rec.kind = 'selfhosted'; rec.reason = 'docker compose app'; return rec; }

  const pyproject = existsSync(path.join(dir, 'pyproject.toml')) ? readFileSync(path.join(dir, 'pyproject.toml'), 'utf8') : '';
  const setupPy = existsSync(path.join(dir, 'setup.py')) ? readFileSync(path.join(dir, 'setup.py'), 'utf8') : '';
  const hasScripts = /\[project\.scripts\]|console_scripts|entry_points/.test(pyproject + setupPy);
  if (hasScripts) {
    rec.kind = 'python';
    rec.pkg = dir;
    rec.cmd = `uv tool install "${dir}"`;
    return rec;
  }
  if (existsSync(path.join(dir, 'Cargo.toml'))) { rec.kind = 'rust'; rec.reason = 'needs cargo (not installed)'; return rec; }
  if (existsSync(path.join(dir, 'go.mod'))) {
    const isMain = existsSync(path.join(dir, 'main.go'));
    rec.kind = 'go';
    rec.reason = isMain ? '' : 'main pkg in subdir (go install . n/a)';
    if (isMain) rec.cmd = 'go install .';
    return rec;
  }
  if (pyproject || setupPy || existsSync(path.join(dir, 'requirements.txt'))) { rec.kind = 'python-lib'; rec.reason = 'no console entry point'; return rec; }
  if (pkg) { rec.kind = 'npm-lib'; rec.reason = 'no bin field'; return rec; }
  if (hasDocker) { rec.kind = 'selfhosted'; rec.reason = 'dockerfile only'; return rec; }
  rec.reason = 'no install manifest';
  return rec;
}

function scan() {
  const out = [];
  for (const e of fs.readdirSync(REPOS, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(REPOS, e.name);
    if (!existsSync(path.join(dir, '.git'))) continue;
    const rec = scanOne(dir);
    if (SKIP_APPS.has(e.name)) { rec.cmd = ''; rec.reason = 'server app (not a CLI)'; }
    out.push(rec);
  }
  const by = {};
  for (const r of out) by[r.kind] = (by[r.kind] || 0) + 1;
  const plan = { scanned: out.length, counts: by, repos: out };
  fs.writeFileSync(PLAN, JSON.stringify(plan, null, 1));
  console.log(JSON.stringify(by, null, 1));
  console.log(`plan → ${PLAN}`);
  return plan;
}

function log(entry) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function run() {
  if (!existsSync(PLAN)) { console.error('no plan — run scan first'); process.exit(1); }
  try { GOBIN = execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8', shell: true }).trim(); } catch { GOBIN = null; }
  const done = new Set();
  if (existsSync(LOG)) for (const line of readFileSync(LOG, 'utf8').split('\n')) {
    try { const e = JSON.parse(line); if (e.status === 'installed') done.add(e.name); } catch {}
  }
  const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
  let ok = 0, fail = 0, skip = 0;
  for (const r of plan.repos) {
    if (done.has(r.name)) { skip++; continue; }
    if (!r.cmd) { log({ name: r.name, kind: r.kind, status: 'skipped', detail: r.reason }); skip++; continue; }
    if (r.kind === 'npm') {
      const exists = r.bins.filter((b) => { try { execFileSync('where.exe', [b], { stdio: 'ignore' }); return true; } catch { return false; } });
      if (exists.length && exists.length === r.bins.length) { log({ name: r.name, kind: r.kind, status: 'skipped', detail: `bin already on PATH: ${exists.join(',')}`, cmd: r.cmd }); skip++; continue; }
    }
    if (freeGB('C:') < MIN_FREE_GB || freeGB('D:') < MIN_FREE_GB) { console.error('DISK LOW — aborting'); log({ name: r.name, kind: r.kind, status: 'aborted', detail: 'disk <2GB' }); break; }
    let res;
    try {
      const env = { ...process.env };
      if (r.kind === 'go' && GOBIN) env.GOBIN = GOBIN;
      // npm is a .cmd on Windows → must run through the shell; others are real exes
      if (r.kind === 'npm') {
        res = spawnSync(r.cmd, { encoding: 'utf8', timeout: 180000, shell: true, cwd: r.dir, env });
      } else {
        const [c, ...args] = r.cmd.replace(/"([^"]+)"/g, '$1').split(' ');
        res = spawnSync(c, args, { encoding: 'utf8', timeout: 180000, shell: false, cwd: r.dir, env });
      }
      const out = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
      const err = out.split('\n').filter(Boolean).slice(-4).join(' | ');
      if (res.status === 0) { ok++; console.log(`OK    ${r.name}`); log({ name: r.name, kind: r.kind, status: 'installed', cmd: r.cmd }); }
      else { fail++; console.log(`FAIL  ${r.name}: ${err.slice(0, 300)}`); log({ name: r.name, kind: r.kind, status: 'failed', detail: err.slice(0, 500), cmd: r.cmd }); }
    } catch (e) {
      fail++; console.log(`FAIL  ${r.name}: ${e.message}`);
      log({ name: r.name, kind: r.kind, status: 'failed', detail: e.message.slice(0, 500), cmd: r.cmd });
    }
  }
  console.log(`\ninstalled=${ok} failed=${fail} skipped=${skip}`);
}

const mode = process.argv[2];
if (mode === 'scan') scan();
else if (mode === 'run') run();
else if (mode === 'prebuilt') prebuilt();
else if (mode === 'go-retry') goRetry();
else { console.error('usage: install-tools.mjs scan|run|prebuilt|go-retry'); process.exit(1); }

/** Download prebuilt Windows binaries from GitHub releases for selected Rust repos. */
function prebuilt() {
  const PICKS = ['bat', 'ripgrep', 'starship'];
  let binDir = null;
  try { binDir = execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8', shell: true }).trim(); } catch {}
  if (!binDir) binDir = process.env.APPDATA + '\\npm';
  for (const name of PICKS) {
    const dir = path.join(REPOS, name);
    if (!existsSync(dir)) { log({ name, kind: 'prebuilt', status: 'skipped', detail: 'repo missing' }); continue; }
    try {
      const cfg = readFileSync(path.join(dir, '.git', 'config'), 'utf8');
      const slug = cfg.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\s*$/m)?.[1];
      if (!slug) throw new Error('no github remote');
      const tag = execFileSync('gh', ['release', 'view', '-R', slug, '--json', 'tagName', '-q', '.tagName'], { encoding: 'utf8' }).trim();
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `aio-${name}-`));
      execFileSync('gh', ['release', 'download', tag, '-R', slug, '-D', tmp, '-p', '*x86_64*windows*', '-p', '*x86_64*msvc*'], { encoding: 'utf8' });
      let files = fs.readdirSync(tmp).filter((f) => !/aarch64|arm64|i686|386|musl/i.test(f));
      if (!files.length) files = fs.readdirSync(tmp);
      const archive = files.find((f) => /\.zip$/i.test(f)) || files.find((f) => /\.(tar\.gz|tgz)$/i.test(f));
      if (!archive) throw new Error(`no windows asset: ${files.join(',').slice(0, 120)}`);
      execFileSync('tar', ['-xf', path.join(tmp, archive)], { cwd: tmp, stdio: 'ignore' });
      const exe = (function find(list, sub) {
        for (const f of list) {
          const p = path.join(sub, f);
          if (fs.statSync(p).isDirectory()) { const r = find(fs.readdirSync(p), p); if (r) return r; }
          else if (f.endsWith('.exe')) return p;
        }
        return null;
      })(fs.readdirSync(tmp), tmp);
      if (!exe) throw new Error('no .exe found in asset');
      fs.copyFileSync(exe, path.join(binDir, path.basename(exe)));
      console.log(`OK    ${name} → ${path.join(binDir, path.basename(exe))}`);
      log({ name, kind: 'prebuilt', status: 'installed', cmd: `gh release download ${tag} (${slug})`, detail: path.basename(exe) });
    } catch (e) {
      console.log(`FAIL  ${name}: ${e.message.slice(0, 200)}`);
      log({ name, kind: 'prebuilt', status: 'failed', detail: e.message.slice(0, 300) });
    }
  }
}

/** openbao needs cgo (broken local gcc) — retry without cgo. */
function goRetry() {
  const r = { name: 'openbao', kind: 'go', dir: path.join(REPOS, 'openbao'), cmd: 'go install .' };
  const env = { ...process.env, GOBIN: GOBIN || undefined, CGO_ENABLED: '0' };
  const res = spawnSync('go', ['install', '.'], { cwd: r.dir, env, encoding: 'utf8', timeout: 300000 });
  const out = `${res.stdout || ''}\n${res.stderr || ''}`.trim().split('\n').slice(-4).join(' | ');
  if (res.status === 0) { console.log('OK    openbao (CGO_ENABLED=0)'); log({ name: 'openbao', kind: 'go', status: 'installed', cmd: 'go install . (CGO_ENABLED=0)' }); }
  else { console.log(`FAIL  openbao: ${out.slice(0, 300)}`); log({ name: 'openbao', kind: 'go', status: 'failed', detail: out.slice(0, 400) }); }
}
