#!/usr/bin/env node
// scripts/verify-scorecard.mjs — release scorecard for aio.
//
// 10 aspects × machine-checkable sub-checks. Runs AFTER `node --test` in the
// `npm test` chain, so tests are green by construction; this script never
// re-runs the suite (circularity guard) — it asserts invariants docs & release
// promises: parse integrity, fix-wave robustness, security posture, honest
// offline/zero-storage behaviour, real CLI UX, doctor, slim pack, docs sync,
// release workflow. Offline, fast (~3s), stdlib-only.
//
// Pass criterion (README): every aspect >= 10/10. Exit 1 otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const has = (f, re) => re.test(read(f));
const count = (f, re) => (read(f).match(re) || []).length;
const list = (dir, re) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f));

const results = []; // { aspect, name, ok, detail }
const check = (aspect, name, ok, detail = '') => results.push({ aspect, name, ok: !!ok, detail });

// ── spawns ──────────────────────────────────────────────────────────────────
function runNode(args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'aio.js'), ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function runNpmPack() {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, shell: process.platform === 'win32',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (r.status !== 0) return { error: `npm pack exit ${r.status}: ${(r.stderr || '').slice(0, 200)}` };
  try { return { json: JSON.parse(r.stdout) }; }
  catch (e) { return { error: `unparsable pack json: ${e.message}` }; }
}

// ── 1. integrity ────────────────────────────────────────────────────────────
check('integrity', 'bin entry + files[] (bin/src/docs)',
  pkg.bin && pkg.bin.aio === 'bin/aio.js'
  && ['bin', 'src', 'docs'].every((d) => (pkg.files || []).includes(d)));
check('integrity', 'engines.node >= 22', /2[2-9]|\d{3,}/.test(String(pkg.engines?.node)));
{
  const sources = [...list('src', /\.js$/).map((f) => path.join('src', f)), 'bin/aio.js'];
  const bad = sources.filter((f) => spawnSync(process.execPath, ['--check', path.join(ROOT, f)],
    { encoding: 'utf8', timeout: 15000 }).status !== 0);
  check('integrity', `node --check on ${sources.length} sources`, bad.length === 0, bad.join(', '));
}
check('integrity', 'LICENSE present', fs.existsSync(path.join(ROOT, 'LICENSE')));

// ── 2. tests (suite itself already ran in this chain) ───────────────────────
check('tests', 'test suite size >= 15 files', list('test', /\.js$/).length >= 15,
  `${list('test', /\.js$/).length} files`);
{
  const only = list('test', /\.js$/).filter((f) => /\.only\(/.test(read(path.join('test', f))));
  check('tests', 'no .only() left in tests', only.length === 0, only.join(', '));
}
check('tests', 'npm test runs node --test', /node --test/.test(pkg.scripts?.test || ''));
{
  const c = pkg.scripts?.['test:coverage'] || '';
  const at = (k, min) => { const m = c.match(new RegExp(`--test-coverage-${k}=(\\d+)`)); return m ? +m[1] >= min : false; };
  check('tests', 'coverage gates >= 90/80/85', at('lines', 90) && at('branches', 80) && at('functions', 85));
}

// ── 3. robustness (fix-wave invariants) ─────────────────────────────────────
check('robustness', 'writeAtomic used >= 15 times in src',
  [...list('src', /\.js$/)].reduce((n, f) => n + count(path.join('src', f), /writeAtomic\(/g), 0) >= 15);
{
  // raw writeFileSync is allowed ONLY where atomic/wx semantics demand it:
  // paths.js (the atomic impl) and live.js (RATE_LOCK wx exclusive lock).
  const raw = [...list('src', /\.js$/)].filter((f) => /writeFileSync\(/.test(read(path.join('src', f))));
  const allowed = ['paths.js', 'live.js'];
  const stray = raw.filter((f) => !allowed.includes(f));
  check('robustness', 'raw writeFileSync confined to paths.js/live.js', stray.length === 0, stray.join(', '));
  check('robustness', 'RATE_LOCK is a wx exclusive lock',
    /writeFileSync\(RATE_LOCK[\s\S]{0,120}flag: 'wx'/.test(read('src/live.js')));
}
check('robustness', 'skill path-traversal prefix guards >= 2', count('src/skill.js', /startsWith\(root/g) >= 2);
check('robustness', 'corrupt-ledger preserve-aside present', has('src/paths.js', /corrupt-/));

// ── 4. security ─────────────────────────────────────────────────────────────
{
  const files = [...list('src', /\.js$/).map((f) => path.join('src', f)), 'bin/aio.js'];
  const leaked = files.filter((f) => /ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{36}/.test(read(f)));
  check('security', 'no hardcoded token literals in src/bin', leaked.length === 0, leaked.join(', '));
}
check('security', 'GH_TOKEN read from env (never hardcoded)',
  has('src/live.js', /process\.env\.GH_TOKEN/));
check('security', '.env never shipped', !(pkg.files || []).includes('.env')
  && fs.existsSync(path.join(ROOT, '.gitignore')) && /^\.env/m.test(read('.gitignore')));
check('security', 'git spawn never prompts (GIT_TERMINAL_PROMPT in borrow)', has('src/borrow.js', /GIT_TERMINAL_PROMPT/));

// ── 5. honesty (offline / zero storage / surfaced errors) ───────────────────
{
  const offline = [...list('src', /\.js$/)].filter((f) => /AIO_OFFLINE/.test(read(path.join('src', f))));
  check('honesty', 'AIO_OFFLINE gate in >= 5 modules', offline.length >= 5, `${offline.length} files`);
}
for (const f of ['src/search.js', 'src/agent.js', 'src/skill.js']) {
  check('honesty', `${f} declares schemaVersion: 1`, has(f, /schemaVersion: 1/));
}
check('honesty', 'agent reports stored: 0 (zero storage)', has('src/agent.js', /stored: 0/));
check('honesty', 'agent surfaces source errors (no fake empty)', has('src/agent.js', /sourceErrorNote/));

// ── 6. cli-ux (real spawns) ─────────────────────────────────────────────────
{
  const h = runNode(['--help']);
  check('cli-ux', '--help exit 0 + documents `aio agent`', h.status === 0 && /aio agent/.test(h.stdout));
  const v = runNode(['-v']);
  check('cli-ux', '-v prints package version', v.status === 0 && v.stdout.includes(pkg.version));
  const id = runNode(['--help'], { AIO_LANG: 'id' });
  check('cli-ux', 'AIO_LANG=id help in Bahasa Indonesia', id.status === 0 && /Penggunaan/.test(id.stdout));
  const bad = runNode(['frobnicate']);
  check('cli-ux', 'unknown command exits 1, names the command', bad.status === 1 && /unknown command: frobnicate/.test(bad.stderr));
  const bf = runNode(['status', '--bogus-flag']);
  check('cli-ux', 'unknown flag warns but keeps exit 0 (pinned)', bf.status === 0 && /unknown flag: --bogus-flag/.test(bf.stderr));
}

// ── 7. doctor ───────────────────────────────────────────────────────────────
{
  const d = runNode(['doctor', '--check']);
  check('doctor', '`aio doctor --check` exit 0', d.status === 0, (d.stderr || d.stdout).slice(0, 200));
}

// ── 8. pack (tarball slim) ──────────────────────────────────────────────────
{
  const p = runNpmPack();
  if (p.error) check('pack', 'npm pack --dry-run parses', false, p.error);
  else {
    const entry = p.json[0] || {};
    const files = (entry.files || []).map((x) => x.path);
    check('pack', 'tarball file count <= 30', files.length <= 30, `${files.length} files`);
    check('pack', 'tarball packed size <= 120 kB (test/assets/scripts excluded)', (entry.size || 0) <= 120000, `${entry.size} bytes`);
    const heavy = files.filter((f) => f.startsWith('test/') || f.startsWith('assets/') || f.startsWith('scripts/'));
    check('pack', 'test/assets/scripts excluded from tarball', heavy.length === 0, heavy.slice(0, 3).join(', '));
  }
}

// ── 9. docs sync ────────────────────────────────────────────────────────────
check('docs-sync', 'README documents aio agent + skill search + AIO_LANG',
  has('README.md', /aio agent/) && has('README.md', /skill search/) && has('README.md', /AIO_LANG/));
check('docs-sync', `CHANGELOG has ${pkg.version} entry`, has('CHANGELOG.md', new RegExp(pkg.version.replace(/\./g, '\\.'))));
check('docs-sync', `README states current version ${pkg.version}`, read('README.md').includes(pkg.version));
check('docs-sync', 'THREATS covers provenance', has('docs/THREATS.md', /provenance/i));
check('docs-sync', 'docs/SCORECARD.md present', fs.existsSync(path.join(ROOT, 'docs', 'SCORECARD.md')));

// ── 10. release readiness ───────────────────────────────────────────────────
check('release', 'publish uses --access public --provenance', has('.github/workflows/release.yml', /npm publish --access public --provenance/));
check('release', 'id-token: write (OIDC)', has('.github/workflows/release.yml', /id-token: write/));
{
  const wf = read('.github/workflows/release.yml');
  check('release', 'scoop checkver + autoupdate', /"checkver"/.test(wf) && /"autoupdate"/.test(wf));
  check('release', 'cosign + SHA256SUMS present', /cosign sign-blob/.test(wf) && /SHA256SUMS/.test(wf));
  check('release', 'tag-guard step (Tag is main tip)', /Tag is main tip/.test(wf));
}

// ── report ──────────────────────────────────────────────────────────────────
const ASPECTS = ['integrity', 'tests', 'robustness', 'security', 'honesty', 'cli-ux', 'doctor', 'pack', 'docs-sync', 'release'];
let total = 0, aspectsOk = 0;
const failures = results.filter((r) => !r.ok);
console.log(`[aio] scorecard — ${ASPECTS.length} aspects × machine checks (v${pkg.version})\n`);
for (const a of ASPECTS) {
  const rs = results.filter((r) => r.aspect === a);
  const passed = rs.filter((r) => r.ok).length;
  const score = Math.round((10 * passed) / rs.length);
  total += score;
  if (score >= 10) aspectsOk += 1;
  console.log(`  ${a.padEnd(12)} ${String(score).padStart(2)}/10  (${passed}/${rs.length}) ${score >= 10 ? 'ok' : 'FAIL'}`);
}
console.log('');
for (const f of failures) console.log(`  FAIL [${f.aspect}] ${f.name}${f.detail ? ` → ${f.detail}` : ''}`);
if (failures.length) console.log('');
const verdict = `${total}/100 — ${aspectsOk}/${ASPECTS.length} aspects >= 10/10`;
if (aspectsOk === ASPECTS.length) {
  console.log(`SUMMARY  ${verdict}`);
  process.exit(0);
}
console.error(`SUMMARY  ${verdict} — RELEASE BLOCKED`);
process.exit(1);
