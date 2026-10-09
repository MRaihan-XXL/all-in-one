// stats.mjs - regenerate the project's live numbers from a REAL suite run.
// Never hand-edited, never estimated: counts come from node --test, coverage
// from a coverage run, scorecard from verify-scorecard, pack bytes from a real
// `npm pack --dry-run`. Fails loudly when a known pattern moves - a silent miss
// would publish stale numbers.
//   node scripts/stats.mjs          report the numbers, check every pattern
//   node scripts/stats.mjs --write  also patch README.md (counts/coverage/eval/
//                                   pack), index.html, assets/aio-stats.svg and
//                                   docs/stats.json; locally it also refreshes
//                                   OUTPUTS.md via scripts/capture-outputs.mjs
//                                   (skipped when CI is set: the gallery block
//                                   for doctor/state must come from a real
//                                   configured machine).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const write = process.argv.includes('write') ? true : process.argv.includes('--write');
const CI = !!process.env.CI;

function exec(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    process.stderr.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
  }
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

function grab(re, text, what) {
  const m = text.match(re);
  if (!m) throw new Error(`stats: pattern not found for ${what} - refusing to publish stale numbers`);
  return m;
}

function patch(file, text, re, repl, what) {
  if (!re.test(text)) throw new Error(`stats: pattern not found in ${file} for ${what} - refusing to publish stale numbers`);
  return text.replace(re, repl);
}

// 1. suite counts (spec reporter prints one aggregate summary on stdout:
//    `ℹ tests N` / `ℹ pass N` / `ℹ fail N` / `ℹ skipped N` - single number)
const testOut = exec(process.execPath, ['--test', 'test/*.js']);
const lastNum = (re, text, what) => {
  const ms = [...text.matchAll(re)];
  if (!ms.length) throw new Error(`stats: pattern not found for ${what} - refusing to publish stale numbers`);
  return Number(ms[ms.length - 1][1]);
};
const total = lastNum(/\btests (\d+)/g, testOut, 'total');
const pass = lastNum(/\bpass (\d+)/g, testOut, 'pass');
const fail = lastNum(/\bfail (\d+)/g, testOut, 'fail');
const skip = lastNum(/\bskipped (\d+)/g, testOut, 'skip');

// 2. coverage triplet (coverage run prints `... | lines | branches | functions`)
const covOut = exec(process.execPath, [
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-lines=90',
  '--test-coverage-branches=80',
  '--test-coverage-functions=85',
  'test/*.js',
]);
const cov = grab(/^\S.*\ball files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|?\s*$/m, covOut, 'coverage');
const coverage = { lines: Number(cov[1]), branches: Number(cov[2]), functions: Number(cov[3]) };

const countLine = `${total} tests: ${pass} pass, ${skip} skip, ${fail} fail`;
const covLine = `${coverage.lines} / ${coverage.branches} / ${coverage.functions}`;

if (!write) {
  const scOut = exec(process.execPath, ['scripts/verify-scorecard.mjs']);
  const sc = grab(/SUMMARY\s+(\d+)\/(\d+)/, scOut, 'scorecard');
  const stats = {
    generated: new Date().toISOString(),
    tests: { total, pass, fail, skip },
    coverage,
    scorecard: { earned: Number(sc[1]), possible: Number(sc[2]) },
  };
  console.log(JSON.stringify(stats, null, 2));
  console.log('(report only - rerun with --write to patch README.md, assets/aio-stats.svg, docs/stats.json)');
  process.exit(0);
}

// ── --write: patch the docs from the numbers above ──────────────────────────
// README.md - the two `npm test` reference lines
const readmePath = path.join(ROOT, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = patch(
  'README.md',
  readme,
  /(# node --test \u2014 )\d+ tests: \d+ pass, \d+ skip, \d+ fail/,
  `$1${countLine}`,
  'npm test counts',
);
readme = patch(
  'README.md',
  readme,
  /\(last run: [\d.]+ \/ [\d.]+ \/ [\d.]+\)/,
  `(last run: ${covLine})`,
  'coverage triplet',
);
// the hero image alt texts carry the same counts in prose form - keep them in sync too
readme = patch(
  'README.md',
  readme,
  /\d+ tests \(\d+ pass \u00b7 \d+ skip \u00b7 \d+ fail\)/,
  `${total} tests (${pass} pass \u00b7 ${skip} skip \u00b7 ${fail} fail)`,
  'README img alt counts',
);
// the stats screenshot alt carries the same count in a shorter prose form
readme = patch(
  'README.md',
  readme,
  /\d+ tests run/,
  `${total} tests run`,
  'README screenshot alt counts',
);

// README eval badge + gallery line - patched from eval-result.json (the same
// file scripts/eval-relevance.mjs --write and the nightly workflow produce)
{
  const evPath = path.join(ROOT, 'eval-result.json');
  if (fs.existsSync(evPath)) {
    const ev = JSON.parse(fs.readFileSync(evPath, 'utf8'));
    const n1 = Math.round((ev.hit1 / 100) * ev.n);
    const n8 = Math.round((ev.hit8 / 100) * ev.n);
    readme = patch(
      'README.md',
      readme,
      /eval-hit%401%20[\d.]+%25%20%C2%B7%20MRR%20[\d.]+%20%C2%B7%20n%3D\d+/,
      `eval-hit%401%20${ev.hit1}%25%20%C2%B7%20MRR%20${ev.mrr}%20%C2%B7%20n%3D${ev.n}`,
      'eval badge label',
    );
    readme = patch(
      'README.md',
      readme,
      /alt="eval: hit@1 [\d.]+% {2}MRR [\d.]+ {2}n=\d+ \(\d{4}-\d{2}-\d{2}\)"/,
      `alt="eval: hit@1 ${ev.hit1}%  MRR ${ev.mrr}  n=${ev.n} (${ev.measured})"`,
      'eval badge alt',
    );
    readme = patch(
      'README.md',
      readme,
      /hit@8 = \d+\/\d+ \([\d.]+%\), hit@1 = \d+\/\d+ \([\d.]+%\), MRR [\d.]+, measured \d{4}-\d{2}-\d{2}/,
      `hit@8 = ${n8}/${ev.n} (${ev.hit8}%), hit@1 = ${n1}/${ev.n} (${ev.hit1}%), MRR ${ev.mrr}, measured ${ev.measured}`,
      'eval gallery line',
    );
  }
}

// README pack line - real `npm pack --dry-run` bytes. Editing README changes
// the tarball README describes, so measure -> patch -> re-measure until the
// digits converge (usually 2 passes, hard cap 5). A PACKED file is README.md,
// CHANGELOG.md, docs/**, src, bin, sbom - so this must run AFTER every write
// to those (stats.json placeholder, stats.json verdict), never before: the
// scorecard re-measures the tarball live and a stale line fails the release.
function convergePack() {
  function packInfo() {
    // cmd.exe wrapper on Windows: npm.cmd needs a shell, but shell:true + args
    // array is deprecated (DEP0190) — same recipe as verify-scorecard.mjs.
    const cmd = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm', 'pack', '--dry-run', '--json']
      : ['pack', '--dry-run', '--json'];
    const r = spawnSync(cmd, args, {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    if (r.status !== 0) throw new Error(`stats: npm pack exited ${r.status}`);
    const j = JSON.parse(r.stdout)[0];
    return { size: j.size, files: j.entryCount };
  }
  const re = /current pack [\d,]+ bytes \u2248\n {2}[\d.]+ KiB \/ \d+ files/;
  for (let i = 0; i < 5; i++) {
    const p = packInfo();
    const want = `current pack ${p.size.toLocaleString('en-US')} bytes \u2248\n  ${(p.size / 1024).toFixed(1)} KiB / ${p.files} files`;
    if (!re.test(readme)) throw new Error('stats: README pack line not found - refusing to publish stale numbers');
    const next = readme.replace(re, want);
    if (next === readme) break; // converged - README matches the measured tarball
    readme = next;
    fs.writeFileSync(readmePath, readme); // packInfo reads README from disk
    if (i === 4) throw new Error('stats: pack line failed to converge after 5 passes');
  }
  fs.writeFileSync(readmePath, readme); // also persists count/eval patches
}

// index.html - the stats card alt attribute (same prose counts, comma form)
const idxPath = path.join(ROOT, 'index.html');
let idx = fs.readFileSync(idxPath, 'utf8');
idx = patch(
  'index.html',
  idx,
  /\d+ tests \(\d+ pass, \d+ skip, \d+ fail\)/,
  `${total} tests (${pass} pass, ${skip} skip, ${fail} fail)`,
  'index.html alt counts',
);
fs.writeFileSync(idxPath, idx);

// assets/aio-stats.svg - aria-label + the two visible stats nodes
const svgPath = path.join(ROOT, 'assets', 'aio-stats.svg');
let svg = fs.readFileSync(svgPath, 'utf8');
svg = patch(
  'assets/aio-stats.svg',
  svg,
  /\d+ tests: \d+ pass, \d+ skip, \d+ fail(?=")/,
  countLine,
  'aria-label counts',
);
svg = patch(
  'assets/aio-stats.svg',
  svg,
  /(font-size="40" letter-spacing="-1.5" style="animation-delay:1\.1s[^"]*">)\d+/,
  `$1${total}`,
  'big number',
);
svg = patch(
  'assets/aio-stats.svg',
  svg,
  /(animation-delay:1\.26s[^"]*">)\d+ pass \u00b7 \d+ skip \u00b7 \d+ fail/,
  `$1${pass} pass \u00b7 ${skip} skip \u00b7 ${fail} fail`,
  'pass/skip/fail line',
);
fs.writeFileSync(svgPath, svg);

// docs/stats.json - written BEFORE the scorecard runs so every gate reads one
// coherent state; the scorecard placeholder (0/0) satisfies the equality gate
// and is replaced with the real verdict at the end of this run.
const statsPath = path.join(ROOT, 'docs', 'stats.json');
const stats = {
  generated: new Date().toISOString(),
  tests: { total, pass, fail, skip },
  coverage,
  scorecard: { earned: 0, possible: 0 },
};
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n');
// stats.json is packed - converge the README pack line on THIS state before
// any scorecard measures the tarball (count/eval README patches land here too)
convergePack();

// refresh the verbatim output gallery from real runs (local only - CI runners
// have no configured ~/.aio state, and a failing doctor there would poison
// OUTPUTS.md with a dishonest machine's report)
// The screenshot gallery is re-rendered inside capture-outputs between the
// demo repaint and the scorecard (a shot taken before paintDemo is honestly
// stale when live ask results changed), so nothing to do here.
if (!CI) {
  const c = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'capture-outputs.mjs')], {
    cwd: ROOT, encoding: 'utf8', timeout: 300000,
    env: { ...process.env },
  });
  process.stdout.write(c.stdout || '');
  if (c.status !== 0) {
    process.stderr.write(c.stderr || '');
    throw new Error(`capture-outputs exited ${c.status}`);
  }
}

// the real release verdict, parsed from a full scorecard run on this state
const scOut = exec(process.execPath, ['scripts/verify-scorecard.mjs']);
const sc = grab(/SUMMARY\s+(\d+)\/(\d+)/, scOut, 'scorecard');
stats.scorecard = { earned: Number(sc[1]), possible: Number(sc[2]) };
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n');
// the verdict write changed the packed stats.json - converge once more
convergePack();

// index.html noscript snapshot - after the verdict so the recorded numbers
// are real; same fail-loud contract as every patch above
idx = fs.readFileSync(idxPath, 'utf8');
idx = patch(
  'index.html',
  idx,
  /static snapshot in docs\/stats\.json: [^<]*/,
  `static snapshot in docs/stats.json: ${countLine.replace(/^(\d+) tests: /, '$1 tests (').replace(/ pass, /, ' pass · ').replace(/ skip, /, ' skip · ').replace(/ fail$/, ' fail)')} · coverage ${covLine} · scorecard ${stats.scorecard.earned}/${stats.scorecard.possible} · ${stats.generated.slice(0, 10)}`,
  'index.html noscript snapshot',
);
fs.writeFileSync(idxPath, idx);

// the noscript write just bumped index.html, a shot source - re-render
// site.png so the freshness gate stays honest (local only; CI reads git)
if (!CI && process.platform === 'win32') {
  const edge = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((p) => fs.existsSync(p));
  if (edge) {
    const s = spawnSync(
      'powershell.exe',
      ['-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'screenshots.ps1'), '-Only', 'site'],
      { cwd: ROOT, encoding: 'utf8', timeout: 300000 },
    );
    if (s.status !== 0) {
      process.stderr.write(s.stderr || '');
      throw new Error(`stats: screenshots.ps1 -Only site exited ${s.status}`);
    }
    process.stdout.write(s.stdout || '');
  }
}

// one last full scorecard must pass (exec throws on any FAIL) so the tree is
// never left green-on-paper and red-on-measurement - and it runs after every
// write, including the site.png re-render above
const fin = grab(
  /SUMMARY\s+(\d+)\/(\d+)/,
  exec(process.execPath, ['scripts/verify-scorecard.mjs']),
  'final scorecard'
);
console.log(`final scorecard ${fin[1]}/${fin[2]} (post-verdict pack state)`);

console.log(`patched README.md, index.html, assets/aio-stats.svg, docs/stats.json (${countLine}, cov ${covLine}, scorecard ${stats.scorecard.earned}/${stats.scorecard.possible})`);
