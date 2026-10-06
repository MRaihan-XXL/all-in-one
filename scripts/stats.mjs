// stats.mjs - regenerate the project's live numbers from a REAL suite run.
// Never hand-edited, never estimated: counts come from node --test, coverage
// from a coverage run, scorecard from verify-scorecard. Fails loudly when a
// known pattern moves - a silent miss would publish stale numbers.
//   node scripts/stats.mjs          report the numbers, check every pattern
//   node scripts/stats.mjs --write  also patch README.md, assets/aio-stats.svg
//                                   and docs/stats.json
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const write = process.argv.includes('--write');

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

// 1. suite counts (spec reporter prints the summary on stdout)
const testOut = exec(process.execPath, ['--test', 'test/*.js']);
const total = Number(grab(/ℹ tests (\d+)/, testOut, 'total')[1]);
const pass = Number(grab(/ℹ pass (\d+)/, testOut, 'pass')[1]);
const fail = Number(grab(/ℹ fail (\d+)/, testOut, 'fail')[1]);
const skip = Number(grab(/ℹ skipped (\d+)/, testOut, 'skipped')[1]);

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

// 3. scorecard summary
const scOut = exec(process.execPath, ['scripts/verify-scorecard.mjs']);
const sc = grab(/SUMMARY\s+(\d+)\/(\d+)/, scOut, 'scorecard');
const scorecard = { earned: Number(sc[1]), possible: Number(sc[2]) };

const stats = {
  generated: new Date().toISOString(),
  tests: { total, pass, fail, skip },
  coverage,
  scorecard,
};
console.log(JSON.stringify(stats, null, 2));
if (!write) {
  console.log('(report only - rerun with --write to patch README.md, assets/aio-stats.svg, docs/stats.json)');
  process.exit(0);
}

const countLine = `${total} tests: ${pass} pass, ${skip} skip, ${fail} fail`;
const covLine = `${coverage.lines} / ${coverage.branches} / ${coverage.functions}`;

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
fs.writeFileSync(readmePath, readme);

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
  /(font-size="40" letter-spacing="-1.5" style="animation-delay:1\.1s">)\d+/,
  `$1${total}`,
  'big number',
);
svg = patch(
  'assets/aio-stats.svg',
  svg,
  /(animation-delay:1\.26s">)\d+ pass \u00b7 \d+ skip \u00b7 \d+ fail/,
  `$1${pass} pass \u00b7 ${skip} skip \u00b7 ${fail} fail`,
  'pass/skip/fail line',
);
fs.writeFileSync(svgPath, svg);

// docs/stats.json - machine-readable snapshot
const statsPath = path.join(ROOT, 'docs', 'stats.json');
fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n');

console.log(`patched README.md, assets/aio-stats.svg, docs/stats.json (${countLine}, cov ${covLine})`);
