#!/usr/bin/env node
// scripts/verify-scorecard.mjs — release scorecard for aio.
//
// 15 aspects × machine-checkable sub-checks. Runs AFTER `node --test` in the
// `npm test` chain, so tests are green by construction; this script never
// re-runs the suite (circularity guard) — it asserts invariants docs & release
// promises: parse integrity, fix-wave robustness, security posture, honest
// offline/zero-storage behaviour, real CLI UX, doctor, slim pack, docs sync,
// release readiness, eval quality gate, recorded coverage floor, i18n parity,
// CI gates, artifact freshness. Offline, fast (~3s), stdlib-only.
//
// Pass criterion (README): every aspect >= 10/10. Exit 1 otherwise.

import fs from 'node:fs';
import os from 'node:os';
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
  // npm is npm.cmd on Windows; routing through cmd.exe keeps the args as an
  // array without shell:true+args, which Node deprecates (DEP0190).
  const cmd = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', 'pack', '--dry-run', '--json']
    : ['pack', '--dry-run', '--json'];
  const r = spawnSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (r.status !== 0) return { error: `npm pack exit ${r.status}: ${(r.stderr || '').slice(0, 200)}` };
  try { return { json: JSON.parse(r.stdout) }; }
  catch (e) { return { error: `unparsable pack json: ${e.message}` }; }
}

// Spawn `node bin/aio.js <args>` hermetically, mirroring the test-suite contract
// (test/cli-args.test.js): isolated state dir + no gh subprocess + no throttle
// sleep + no network. Without isolation these probes read the caller's real
// ~/.aio — they passed locally but failed on a fresh CI runner (state/manifest
// missing), which is correct product behaviour, not a product bug.
const ISO_STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-sc-'));
function runNodeIso(args) {
  return runNode(args, {
    AIO_STATE_DIR: ISO_STATE, AIO_NO_GH: '1', AIO_RATE: '0', AIO_OFFLINE: '1',
  });
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
{
  // recorded suite size: catches a silently shrinking suite (numbers come from
  // the real run recorded in docs/stats.json, never hand-typed here).
  let n = null, err = '';
  try { n = JSON.parse(read('docs/stats.json')).tests.total; } catch (e) { err = e.message; }
  check('tests', 'stats.json records >= 250 tests', typeof n === 'number' && n >= 250,
    n === null ? err : `${n} tests`);
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
  const files = [...list('src', /\.js$/).map((f) => path.join('src', f)), 'bin/aio.js',
    ...list('scripts', /\.(?:js|mjs)$/).map((f) => path.join('scripts', f)),
    ...list('test', /\.js$/).map((f) => path.join('test', f))];
  const leaked = files.filter((f) => /ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{36}/.test(read(f)));
  check('security', 'no hardcoded token literals in src/bin/scripts/test', leaked.length === 0, leaked.join(', '));
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
  // Pinned contract (test/cli-args.test.js): the flag is reported on stderr and
  // status keeps its NORMAL exit (0 or 1 — empty state legitimately exits 1).
  const bf = runNodeIso(['status', '--bogus-flag']);
  check('cli-ux', 'unknown flag warns, status exit stays 0|1 (pinned)',
    [0, 1].includes(bf.status) && /unknown flag: --bogus-flag/.test(bf.stderr),
    `status=${bf.status} ${(bf.stderr || bf.stdout).slice(0, 120)}`);
}

// ── 7. doctor ───────────────────────────────────────────────────────────────
{
  // Environment-independent contract (B-09 / test/v150.test.js): always exactly
  // 9 tagged check lines + version header, and `--check` exits 1 IFF any [!!]
  // issue exists. A fresh machine (missing manifest) correctly reports [!!] → 1;
  // requiring exit 0 would only ever pass on an already-configured host.
  const d = runNodeIso(['doctor', '--check']);
  const out = `${d.stdout}\n${d.stderr}`;
  const tagged = out.split('\n').filter((l) => /^\[(ok|~~|!!)\] /.test(l));
  const issues = tagged.filter((l) => l.startsWith('[!!]')).length;
  check('doctor', 'doctor --check: 9 tagged lines, version header, exit ⇔ [!!]',
    tagged.length === 9 && out.includes(`v${pkg.version}`) && d.status === (issues > 0 ? 1 : 0),
    `lines=${tagged.length} issues=${issues} exit=${d.status} ${out.slice(0, 140)}`);
}

// ── 8. pack (tarball slim) ──────────────────────────────────────────────────
{
  const p = runNpmPack();
  if (p.error) check('pack', 'npm pack --dry-run parses', false, p.error);
  else {
    const entry = p.json[0] || {};
    const files = (entry.files || []).map((x) => x.path);
    check('pack', 'tarball file count <= 34', files.length <= 34, `${files.length} files`);
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

// ── 9b. honesty gates (added v1.9.1: the things that once drifted by hand) ──
{
  // (a) every version badge painted in an SVG must equal package.json
  const stale = [];
  for (const f of list('assets', /\.svg$/)) {
    for (const line of read(path.join('assets', f)).split('\n')) {
      if (line.includes(' · ')) continue; // result-meta line (npm result versions, not badges)
      for (const m of line.matchAll(/\bv\d+\.\d+\.\d+\b/g)) {
        if (m[0] !== `v${pkg.version}`) stale.push(`${f}=${m[0]}`);
      }
    }
  }
  check('docs-sync', `SVG version badges match package.json (v${pkg.version})`, stale.length === 0, stale.join(', '));
}
{
  // (b) the removed alias must not be sold as a feature any more
  const files = [...list('assets', /\.svg$/).map((f) => path.join('assets', f)), 'index.html'];
  const bad = files.filter((f) => /\bevolve\b/.test(read(f)));
  check('docs-sync', 'no `evolve` in assets/*.svg or index.html (use verify)', bad.length === 0, bad.join(', '));
}
{
  // (c) the disclosure enum has ONE source (write.js); help ×2, README and PRD
  // must quote it verbatim, and every result type live.js emits must be a member
  const enumStr = (read('src/write.js').match(/repo \| cli \| service \| skill \| site \| tool/) || [])[0];
  const spots = ['bin/aio.js', 'README.md', 'PRD.md'];
  const missing = enumStr ? spots.filter((f) => !read(f).includes(enumStr)) : [...spots];
  const binCount = (read('bin/aio.js').match(/repo \| cli \| service \| skill \| site \| tool/g) || []).length;
  const members = enumStr ? enumStr.split(' | ') : [];
  const emitted = [...read('src/live.js').matchAll(/type: '([a-z]+)'/g)].map((m) => m[1]);
  const foreign = emitted.filter((t) => !members.includes(t));
  check('docs-sync', 'disclosure enum verbatim in help×2/README/PRD, live.js types are members',
    !!enumStr && missing.length === 0 && binCount === 2 && foreign.length === 0 && emitted.length > 0,
    `missing=[${missing.join(',')}] binHits=${binCount} foreign=[${foreign.join(',')}]`);
}
{
  // (d) the demo card is a verbatim capture: every real-output line it paints
  // must appear byte-for-byte in OUTPUTS.md (chrome lines like `$` excluded)
  const demo = read('assets/aio-demo.svg').replace(/<[^>]+>/g, '');
  const out = read('OUTPUTS.md');
  const askLine = (demo.match(/aio ask — "[^"]*" \(live:[^)]*\)/) || [])[0];
  const needles = [
    `aio setup v${pkg.version} — DRY RUN (nothing written)`,
    'note: ranked by keyword match + source popularity — public results are unvetted;',
    'aio borrow --clean — ',
    '[x] opencode',
    ...(askLine ? [askLine] : []),
  ];
  const missDemo = needles.filter((n) => !demo.includes(n));
  const missOut = askLine ? needles.filter((n) => !out.includes(n)) : ['ask header not found in demo'];
  check('docs-sync', 'demo card lines byte-identical in OUTPUTS.md (verbatim capture)',
    !!askLine && missDemo.length === 0 && missOut.length === 0,
    `demo:[${missDemo.join(' | ')}] output:[${missOut.join(' | ')}]`);
}
{
  // (e) README eval badge + gallery line must equal eval-result.json (the
  // nightly workflow's snapshot); stats.mjs --write applies the same patch
  let ok = false, detail = '';
  try {
    const ev = JSON.parse(read('eval-result.json'));
    const rm = read('README.md');
    const n1 = Math.round((ev.hit1 / 100) * ev.n);
    const n8 = Math.round((ev.hit8 / 100) * ev.n);
    ok = rm.includes(`MRR%20${ev.mrr}%20%C2%B7%20n%3D${ev.n}`)
      && rm.includes(`MRR ${ev.mrr}  n=${ev.n} (${ev.measured})`)
      && rm.includes(`hit@8 = ${n8}/${ev.n} (${ev.hit8}%), hit@1 = ${n1}/${ev.n} (${ev.hit1}%), MRR ${ev.mrr}, measured ${ev.measured}`);
    detail = `mrr=${ev.mrr} measured=${ev.measured}`;
  } catch (e) { detail = e.message; }
  check('docs-sync', 'README eval badge + gallery line match eval-result.json', ok, detail);
}
{
  // (f) the pack number printed in README must be the measured tarball, not a
  // remembered one (stats.mjs --write patches it with a converge loop)
  let ok = false, detail = '';
  const p = runNpmPack();
  if (p.error) detail = p.error;
  else {
    const e = p.json[0] || {};
    const rm = read('README.md');
    const sizeStr = (e.size || 0).toLocaleString('en-US');
    ok = rm.includes(`current pack ${sizeStr} bytes`) && rm.includes(`/ ${e.entryCount} files)`);
    detail = `pack=${sizeStr} bytes / ${e.entryCount} files`;
  }
  check('docs-sync', 'README pack line matches a live npm pack --dry-run', ok, detail);
}

// ── 10. release readiness ───────────────────────────────────────────────────
check('release', 'publish uses --access public --provenance', has('.github/workflows/release.yml', /npm publish --access public --provenance/));
check('release', 'id-token: write (OIDC)', has('.github/workflows/release.yml', /id-token: write/));
{
  const wf = read('.github/workflows/release.yml');
  check('release', 'scoop checkver + autoupdate', /"checkver"/.test(wf) && /"autoupdate"/.test(wf));
  check('release', 'cosign + SHA256SUMS present', /cosign sign-blob/.test(wf) && /SHA256SUMS/.test(wf));
  check('release', 'tag-guard step (Tag is main tip)', /Tag is main tip/.test(wf));
}

// ── 11. quality (the live eval gate) ─────────────────────────────────────────
{
  let ok = false, detail = '';
  try {
    const ev = JSON.parse(read('eval-result.json'));
    ok = ev.n >= 100 && ev.hit8 >= 95 && ev.mrr >= 0.9 && /^\d{4}-\d{2}-\d{2}$/.test(ev.measured || '');
    detail = `n=${ev.n} hit@8=${ev.hit8} mrr=${ev.mrr} measured=${ev.measured}`;
  } catch (e) { detail = e.message; }
  check('quality', 'eval golden set: n>=100, hit@8>=95%, mrr>=0.9, dated', ok, detail);
}
check('quality', 'eval workflow regenerates + commits the snapshot',
  /--write/.test(read('.github/workflows/eval.yml'))
  && /contents:\s*write/.test(read('.github/workflows/eval.yml')));
check('quality', 'eval script covers all query families (QUERIES array)',
  /const QUERIES = \[/.test(read('scripts/eval-relevance.mjs')));

// ── 12. coverage floor (recorded numbers, never hand-typed) ──────────────────
{
  let ok = false, detail = '';
  try {
    const st = JSON.parse(read('docs/stats.json'));
    const c = st.coverage, t = st.tests;
    ok = c.lines >= 90 && c.branches >= 80 && c.functions >= 85
      && t.fail === 0 && t.total >= 150 && st.scorecard.earned === st.scorecard.possible;
    detail = `lines=${c.lines} branches=${c.branches} funcs=${c.functions} tests=${t.total} fail=${t.fail}`;
  } catch (e) { detail = e.message; }
  check('coverage-floor', 'docs/stats.json: >= gates, 0 fail, scorecard clean', ok, detail);
}
{
  let ok = false, detail = '';
  try {
    const st = JSON.parse(read('docs/stats.json'));
    const want = `${st.tests.total} tests: ${st.tests.pass} pass, ${st.tests.skip} skip, ${st.tests.fail} fail`;
    ok = read('README.md').includes(want);
    detail = want;
  } catch (e) { detail = e.message; }
  check('coverage-floor', 'README test line matches docs/stats.json exactly', ok, detail);
}
{
  // the prose-form alt texts are patched by the same `stats.mjs --write` run;
  // verify them too so a skipped regeneration fails the scorecard, not the reader
  let ok = false, detail = '';
  try {
    const st = JSON.parse(read('docs/stats.json'));
    const t = st.tests;
    const wantComma = `${t.total} tests (${t.pass} pass, ${t.skip} skip, ${t.fail} fail)`;
    const wantDot = `${t.total} tests (${t.pass} pass \u00b7 ${t.skip} skip \u00b7 ${t.fail} fail)`;
    const idxOk = read('index.html').includes(wantComma);
    const rmOk = read('README.md').includes(wantDot);
    ok = idxOk && rmOk;
    detail = `index.html=${idxOk ? 'ok' : 'STALE'} README-hero=${rmOk ? 'ok' : 'STALE'} (${wantComma})`;
  } catch (e) { detail = e.message; }
  check('coverage-floor', 'index.html + README hero alt counts match docs/stats.json', ok, detail);
}

// ── 13. i18n (catalog parity + HELP mirror) ─────────────────────────────────
{
  const { parity, msg } = await import(new URL('../src/messages.js', import.meta.url));
  const p = parity();
  check('i18n', `messages parity: ${p.total} keys in BOTH tables`, p.total >= 100 && p.missingID.length === 0 && p.missingEN.length === 0,
    JSON.stringify({ missingID: p.missingID, missingEN: p.missingEN }));
  check('i18n', 'no placeholder drift EN vs ID', p.placeholderDrift.length === 0, p.placeholderDrift.join(', '));
  check('i18n', 'msg renders (EN default + AIO_LANG=id switch)',
    msg('evolveDeprecated').includes('deprecated')
    && (() => { const prev = process.env.AIO_LANG; process.env.AIO_LANG = 'id';
        const id = msg('evolveDeprecated'); process.env.AIO_LANG = prev;
        return id.includes('usang'); })());
}
{
  const he = read('bin/aio.js').match(/const HELP_EN = `([\s\S]*?)`;/);
  const hi = read('bin/aio.js').match(/const HELP_ID = `([\s\S]*?)`;/);
  const n = (m) => (m ? m[1].split('\n').length : 0);
  check('i18n', 'HELP_EN/HELP_ID line-for-line mirror', he && hi && n(he) === n(hi),
    `en=${n(he)} id=${n(hi)}`);
}

// ── 14. ci gates (every promise has a workflow enforcing it) ─────────────────
{
  const ci = read('.github/workflows/ci.yml');
  check('ci-gates', 'CI runs the coverage gate (90/80/85)',
    /--test-coverage-lines=90/.test(ci) && /--test-coverage-branches=80/.test(ci) && /--test-coverage-functions=85/.test(ci));
  check('ci-gates', 'CI runs the scorecard', /verify-scorecard\.mjs/.test(ci));
  check('ci-gates', 'CI runs npm audit + guarded signature audit',
    /npm audit --omit=dev/.test(ci) && /npm audit signatures/.test(ci));
  check('ci-gates', 'CI enforces SBOM freshness (regen + clean diff)',
    /sbom\.mjs[\s\S]{0,120}git diff --exit-code sbom\.cdx\.json/.test(ci));
  check('ci-gates', 'stats auto-gen + og render workflows present',
    fs.existsSync(path.join(ROOT, '.github', 'workflows', 'stats.yml'))
    && fs.existsSync(path.join(ROOT, '.github', 'workflows', 'og.yml')));
}

// ── 15. freshness (recorded artifacts must be recent) ────────────────────────
{
  const ageDays = (f) => (Date.now() - fs.statSync(path.join(ROOT, f)).mtimeMs) / 86400000;
  check('freshness', 'docs/stats.json regenerated <= 14 days',
    ageDays('docs/stats.json') <= 14, `${ageDays('docs/stats.json').toFixed(1)}d`);
  // A git checkout rewrites mtimes in tree-write order, which can invert
  // og-cover.png vs og.html on a fresh clone — last-commit time is the honest
  // "when was this last touched" signal; fall back to mtime outside git.
  // A DIRTY file (edited, not yet committed) has no honest commit time: git
  // log would report the previous commit and mask the edit — use mtime there.
  const touchTime = (f) => {
    const d = spawnSync('git', ['-C', ROOT, 'status', '--porcelain', '--', f],
      { encoding: 'utf8' });
    if ((d.stdout || '').trim()) return fs.statSync(path.join(ROOT, f)).mtimeMs;
    const g = spawnSync('git', ['-C', ROOT, 'log', '-1', '--format=%ct', '--', f],
      { encoding: 'utf8' });
    const s = (g.stdout || '').trim();
    return (g.status === 0 && s) ? Number(s) * 1000
      : fs.statSync(path.join(ROOT, f)).mtimeMs;
  };
  check('freshness', 'og-cover.png exists and is not older than its source',
    fs.existsSync(path.join(ROOT, 'assets', 'og-cover.png'))
    && touchTime('assets/og-cover.png') >= touchTime('scripts/og.html'));
  // (g) gallery screenshots must be re-rendered after their source edits
  const shotPairs = [
    ['assets/screenshots/flow.png', 'assets/flow.svg'],
    ['assets/screenshots/hero.png', 'assets/aio-hero.svg'],
    ['assets/screenshots/demo.png', 'assets/aio-demo.svg'],
    ['assets/screenshots/disclosure.png', 'assets/aio-disclosure.svg'],
    ['assets/screenshots/stats.png', 'assets/aio-stats.svg'],
    ['assets/screenshots/site.png', 'index.html'],
  ];
  for (const [png, src] of shotPairs) {
    check('freshness', `${png} not older than ${src}`,
      fs.existsSync(path.join(ROOT, png)) && fs.existsSync(path.join(ROOT, src))
      && touchTime(png) >= touchTime(src),
      fs.existsSync(path.join(ROOT, png)) && fs.existsSync(path.join(ROOT, src))
        ? `shot ${new Date(touchTime(png)).toISOString().slice(0, 16)} vs src ${new Date(touchTime(src)).toISOString().slice(0, 16)}`
        : 'missing file');
  }
  let ok = false, detail = 'unreadable';
  try {
    const ev = JSON.parse(read('eval-result.json'));
    const days = (Date.now() - Date.parse(ev.measured)) / 86400000;
    ok = days <= 5;
    detail = `${days.toFixed(1)}d since ${ev.measured}`;
  } catch (e) { detail = e.message; }
  check('freshness', 'eval measured <= 5 days ago (nightly keeps it honest)', ok, detail);
  let sb = false, sd = '';
  try {
    sb = JSON.parse(read('sbom.cdx.json')).metadata.component.version === pkg.version;
    sd = `sbom ${JSON.parse(read('sbom.cdx.json')).metadata.component.version} vs pkg ${pkg.version}`;
  } catch (e) { sd = e.message; }
  check('freshness', 'sbom.cdx.json version matches package.json', sb, sd);
  check('freshness', 'package-lock.json present (audit/signature capable)',
    fs.existsSync(path.join(ROOT, 'package-lock.json')));
}

// ── 16. docs parity (runs last: every check above must have its SCORECARD row) ─
{
  const sc = read('docs/SCORECARD.md');
  const rows = (sc.match(/^\| `/gm) || []).length;
  const expected = results.length + 2; // both checks below land as rows too
  check('docs-sync', `SCORECARD.md title carries current version (${pkg.version})`,
    sc.includes(pkg.version), sc.split('\n')[0].slice(0, 80));
  check('docs-sync', `SCORECARD.md has one row per check (${expected} expected)`,
    rows === expected, `${rows} rows`);
}

// ── report ──────────────────────────────────────────────────────────────────
const ASPECTS = ['integrity', 'tests', 'robustness', 'security', 'honesty', 'cli-ux', 'doctor', 'pack', 'docs-sync', 'release',
  'quality', 'coverage-floor', 'i18n', 'ci-gates', 'freshness'];
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
const verdict = `${Math.round((100 * total) / (ASPECTS.length * 10))}/100 — ${aspectsOk}/${ASPECTS.length} aspects >= 10/10`;
if (aspectsOk === ASPECTS.length) {
  console.log(`SUMMARY  ${verdict}`);
  process.exit(0);
}
console.error(`SUMMARY  ${verdict} — RELEASE BLOCKED`);
process.exit(1);
