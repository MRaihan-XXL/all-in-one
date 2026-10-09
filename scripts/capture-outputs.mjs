// capture-outputs.mjs — regenerate OUTPUTS.md from REAL command runs.
// Never hand-typed: every block in OUTPUTS.md is the verbatim stdout/stderr of
// an actual `node bin/aio.js ...` invocation on this machine, stamped with the
// package version and run time. Re-run after any UX change:
//   node scripts/capture-outputs.mjs
// Ask search is live (network); when offline it records the honest error line.
//
// Two-phase write: the CLI blocks land FIRST, then the release scorecard runs
// (its demo-verbatim gate reads the just-written OUTPUTS.md), then the
// scorecard block is appended. One pass, no stale self-report.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OUT_PATH = path.join(ROOT, 'OUTPUTS.md');

function run(args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'aio.js'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, NO_COLOR: '1', AIO_RATE: '0', ...env },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trimEnd();
  return { status: r.status, out };
}

const blocks = [];
function block(title, cmd, { out, status }) {
  blocks.push(
    `## ${title}\n\n` +
    `\`\`\`console\n$ ${cmd}\n${out}\n\`\`\`\n\n` +
    `_exit ${status}_\n`
  );
}

block('Help (English, default)', 'node bin/aio.js --help', run(['--help']));
block('Help (Bahasa Indonesia)', 'AIO_LANG=id node bin/aio.js --help', run(['--help'], { AIO_LANG: 'id' }));
block('Version', 'node bin/aio.js -v', run(['-v']));
block('Status (read-only health report)', 'node bin/aio.js status', run(['status']));
block('Doctor (9 checks, CI gate)', 'node bin/aio.js doctor --check', run(['doctor', '--check']));
block('Skill list (installed skills)', 'node bin/aio.js skill list', run(['skill', 'list']));
block('Setup (dry-run plan, nothing written)', 'node bin/aio.js --dry-run', run(['--dry-run']));
block(
  'Ask (live search, ranked, discarded)',
  'node bin/aio.js ask "sqlite to parquet converter"',
  run(['ask', 'sqlite to parquet converter'])
);
const galleryAsk = run(['ask', 'awesome animated chart library']);
block(
  'Ask (gallery query — the demo card query, verbatim)',
  'node bin/aio.js ask "awesome animated chart library"',
  galleryAsk
);
block('Borrow cleanup (reversible, TTL temp dir)', 'node bin/aio.js borrow --clean', run(['borrow', '--clean']));

function render(withScorecard) {
  return `# AIO — output gallery

Every block below is **verbatim output** from a real run of this checkout —
captured by \`scripts/capture-outputs.mjs\`, never hand-typed. Regenerate after
any CLI/UX change:

\`\`\`console
node scripts/capture-outputs.mjs
\`\`\`

- package: \`${pkg.name}@${pkg.version}\`
- captured: ${new Date().toISOString()}
- host: ${process.platform} · node ${process.version}

${blocks.join('\n')}
---

Also live: [\`docs/SCORECARD.md\`](docs/SCORECARD.md) (15-aspect machine checks) ·
[\`docs/stats.json\`](docs/stats.json) (tests/coverage snapshot) ·
[\`docs/THREATS.md\`](docs/THREATS.md) (threat model).
`;
}

// ── self-paint: the demo card quotes THIS run byte-for-byte ──────────────
// Live timing and ranking can never be hand-typed honestly (every run prints
// different `N results · T.Ts`), so capture writes them back into the SVG —
// the card's "verbatim" claim becomes structural instead of a promise.
const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paintDemo(galleryOut) {
  const svgPath = path.join(ROOT, 'assets', 'aio-demo.svg');
  let svg = fs.readFileSync(svgPath, 'utf8');
  const ls = galleryOut.split('\n');
  const header = ls.find((l) => l.startsWith('aio ask — '));
  if (!header) {
    console.error('capture: gallery ask header not found (offline?) — demo card left untouched');
    return;
  }
  const replaceAt = (y, content) => {
    const re = new RegExp(`(<text x="114" y="${y}"[^>]*>)[\\s\\S]*?(</text>)`);
    if (!re.test(svg)) throw new Error(`capture: demo anchor y=${y} not found`);
    svg = svg.replace(re, (_m, open, close) => `${open}${content}${close}`);
  };
  replaceAt(228, escXml(header));

  // top-2 result rows: `N. name [type] <src> — func` + the meta line under it
  const rows = [];
  for (let i = 0; i < ls.length && rows.length < 2; i++) {
    const m = ls[i].match(/^(\d+)\. (\S+) \[(\w+)\] <(\w+)> — (.*)$/);
    if (m) rows.push({ n: m[1], name: m[2], type: m[3], src: m[4], func: m[5], meta: (ls[i + 1] || '').trim() });
  }
  if (rows.length < 2) {
    console.error(`capture: need 2 gallery results to paint, got ${rows.length} — demo card left stale`);
    return;
  }
  [[278, 298], [324, 344]].forEach(([yN, yM], i) => {
    const r = rows[i];
    replaceAt(yN, `${r.n}. ${escXml(r.name)} <tspan fill="#8A919B">[${r.type}] &lt;${r.src}&gt;</tspan><tspan fill="#5A606A"> — ${escXml(r.func)}</tspan>`);
    svg = svg.replace(
      new RegExp(`(<text x="138" y="${yM}"[^>]*>)[\\s\\S]*?(</text>)`),
      (_m, open, close) => `${open}${escXml(r.meta)}${close}`
    );
  });

  // the disclosure example follows result #1 (it cites what the run returned);
  // budget the whole line so it can never overflow the card (~132 mono chars)
  const r1 = rows[0];
  const url = r1.src === 'npm' ? `https://www.npmjs.com/package/${r1.name}` : `https://github.com/${r1.name}`;
  const prefix = `[aio] Using [${r1.name}](${url}) (${r1.type}) — `;
  const budget = Math.max(20, 132 - prefix.length);
  const short = r1.func.length > budget ? `${r1.func.slice(0, budget).replace(/\s+\S*$/, '')}…` : r1.func;
  replaceAt(372, `${prefix}${escXml(short)}`);

  // write only on real change: an unchanged repaint would bump aio-demo.svg
  // mtime and make the just-captured demo.png fail the freshness gate although
  // the shot still shows exactly this content
  const next = svg;
  const prev = fs.readFileSync(svgPath, 'utf8');
  if (next !== prev) {
    fs.writeFileSync(svgPath, next);
    console.log(`demo card repainted from this run (header + ${rows.length} results + disclosure)`);
  } else {
    console.log('demo card unchanged (previous repaint already matches this run)');
  }
}

// phase 1 — CLI blocks only (the scorecard gate reads this file)
paintDemo(galleryAsk.out);
fs.writeFileSync(OUT_PATH, render(false));

// Re-render the gallery between phase 1 and phase 2: paintDemo just rewrote
// assets/aio-demo.svg (live ask results change run to run), so any earlier
// shot is honestly stale for the freshness gate. Local only — CI runners have
// no Edge and read the gate from git.
if (!process.env.CI && process.platform === 'win32') {
  const edge = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((p) => fs.existsSync(p));
  if (edge) {
    const s = spawnSync(
      'powershell.exe',
      ['-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'screenshots.ps1')],
      { cwd: ROOT, encoding: 'utf8', timeout: 300000 },
    );
    if (s.status !== 0) {
      process.stderr.write(s.stderr || '');
      throw new Error(`capture-outputs: screenshots.ps1 exited ${s.status}`);
    }
    process.stdout.write(s.stdout || '');
  }
}

// phase 2 — the release scorecard, appended verbatim
let scStatus = 0;
{
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-scorecard.mjs')], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, NO_COLOR: '1' },
  });
  scStatus = r.status ?? 1;
  block('Release scorecard (15 aspects)', 'node scripts/verify-scorecard.mjs', {
    status: r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`.trimEnd(),
  });
}

const doc = render(true);
fs.writeFileSync(OUT_PATH, doc);
console.log(`OUTPUTS.md written (${blocks.length} blocks, ${doc.length} chars)`);
// honest exit: a failed scorecard block must fail this script (stats.mjs
// and CI propagate it) — the gallery never reports green it did not see.
process.exitCode = scStatus;
