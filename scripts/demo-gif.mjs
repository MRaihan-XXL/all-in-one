#!/usr/bin/env node
// demo-gif.mjs — render assets/screenshots/demo.gif: a ~30s terminal demo built
// from REAL live runs (`aio ask` + `aio status`, captured at generation time),
// frame-stepped through Edge headless (same recipe as scripts/screenshots.ps1)
// and assembled with ffmpeg (palettegen/paletteuse).
//
// Regenerate:  node scripts/demo-gif.mjs
//   needs: msedge (windows), ffmpeg on PATH, network (the `ask` run is live).
//   ~90 static frames, ~1.5 min. Pacing lives in each frame's delay — see the
//   `push(html, delay)` timeline below, delays are seconds.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'screenshots', 'demo.gif');
const W = 1100;
const H = 720;

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('msedge.exe not found - Edge is the renderer (og.yml recipe)');
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status !== 0) {
  console.error('ffmpeg not found on PATH - it assembles the GIF');
  process.exit(1);
}

// ---- 1. real captures (live, at generation time — never hand-typed) ----
function runAio(args) {
  const r = spawnSync('node', [join(ROOT, 'bin', 'aio.js'), ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    cwd: ROOT,
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    throw new Error(`aio ${args.join(' ')} exited ${r.status}`);
  }
  const out = (r.stdout || '').replace(/\r/g, '');
  return out.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));
}

const ASK_CMD = 'aio ask "turn a CSV into an interactive chart"';
const STATUS_CMD = 'aio status';
const ask = runAio(['ask', 'turn a CSV into an interactive chart']);
const status = runAio(['status']);
console.log(`captured: ask ${ask.length} lines, status ${status.length} lines`);

// ---- 2. terminal frame rendering ----
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function askLineHtml(line) {
  const h = esc(line);
  if (line.startsWith('aio ask')) return `<span class="hdr">${h}</span>`;
  if (line.startsWith('note:') || line.startsWith('      ')) return `<span class="dim">${h}</span>`;
  if (/^\d+\.\s/.test(line)) {
    // "N. owner/repo [repo] <github> — desc": bold the repo id only
    const m = h.match(/^(\d+\.\s[\w.@-]+\/[\w.@-]+)(.*)$/);
    if (m) return `<span class="bold">${m[1]}</span>${m[2]}`;
    return h;
  }
  if (line.startsWith('   ★')) return `<span class="star">${h}</span>`;
  if (line.startsWith('   https://')) return `<span class="link">${h}</span>`;
  if (line.startsWith('   why:') || line.startsWith('time:')) return `<span class="dim">${h}</span>`;
  return h;
}

function statusLineHtml(line) {
  let h = esc(line);
  h = h.replace(/\binjected\b/g, '<span class="ok">injected</span>');
  h = h.replace(/\bn\/a\b/g, '<span class="warn">n\/a<\/span>');
  h = h.replace(/\bhealthy\b/g, '<span class="ok">healthy</span>');
  h = h.replace(/^(\s{4})([\w-]+)(\s)/, '$1<span class="bold">$2</span>$3');
  if (/^ {2}\S/.test(line)) return `<span class="lab">${h}</span>`; // state/manifest/agents labels
  return h;
}

function page(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0b0e14;color:#c9d1d9;
  font:13.5px/1.45 "Cascadia Mono","Cascadia Code",Consolas,"Courier New",monospace;}
.term{padding:26px 30px;white-space:pre-wrap;word-break:break-word;}
.p{color:#3fb950;font-weight:700}.cur{color:#58a6ff}
.hdr{color:#e6edf3;font-weight:700}.bold{color:#e6edf3;font-weight:700}
.dim{color:#8b949e}.link{color:#58a6ff}.star{color:#e3b341}
.ok{color:#3fb950}.warn{color:#d29922}.lab{color:#79c0ff}
.end{padding:150px 60px;text-align:center;white-space:normal}
.big{font-size:21px;color:#3fb950;margin-bottom:30px}
.sub{font-size:15.5px;color:#c9d1d9;margin-bottom:22px}
.url{font-size:13.5px;color:#58a6ff}
</style></head><body><div class="${inner.startsWith('<div class="end"') ? 'x' : 'term'}">${inner}</div></body></html>`;
}

const frames = [];
const push = (html, delay) => frames.push({ html, delay });
const promptLine = (cmd, cursor) =>
  `<span class="p">$</span> ${esc(cmd)}${cursor ? '<span class="cur">▌</span>' : ''}`;

function typing(cmd, delay = 0.13) {
  push(page(promptLine('', true)), 1.2);
  for (let i = 1; i <= cmd.length; i++) push(page(promptLine(cmd.slice(0, i), true)), delay);
  push(page(promptLine(cmd, false)), 0.5);
}

// scene 1 — ask, output revealed block by block
typing(ASK_CMD);
{
  const L = ask.map(askLineHtml);
  const at = (pre) => ask.findIndex((l) => l.startsWith(pre));
  const states = [1, 3, at('1.'), at('2.'), at('3.'), at('4.'), L.length].map(
    (n) => L.slice(0, n).join('\n'),
  );
  const delays = [0.4, 0.45, 0.9, 0.9, 0.9, 0.9, 0.45];
  states.forEach((s, i) => push(page(s), delays[i]));
  push(page(L.join('\n')), 2.5); // reading pause
}

// scene 2 — status on a fresh screen (terminals cut like this in demos)
typing(STATUS_CMD);
{
  const L = status.map(statusLineHtml);
  const agentsEnd = status.findIndex((l) => l.trim() === '') + 1; // blank line after rows
  const states = [1, 2, agentsEnd, L.length].map((n) => L.slice(0, n).join('\n'));
  const delays = [0.4, 0.45, 0.9, 0.45];
  states.forEach((s, i) => push(page(s), delays[i]));
  push(page(L.join('\n')), 2.2);
}

// scene 3 — end card
{
  const lines = [
    '<div class="big">npx -y aio-connect ask "your query"</div>',
    '<div class="sub">Zero search storage — results printed, never saved.</div>',
    '<div class="url">github.com/MRaihan-XXL/all-in-one</div>',
  ];
  for (let n = 1; n <= lines.length; n++) {
    push(page(`<div class="end">${lines.slice(0, n).join('')}</div>`), 0.5);
  }
  push(page(`<div class="end">${lines.join('')}</div>`), 6.5);
}

const total = frames.reduce((s, f) => s + f.delay, 0);
console.log(`frames: ${frames.length}, total ${total.toFixed(1)}s`);

// ---- 3. Edge headless: one static HTML per frame, sequential -Wait ----
const work = join(tmpdir(), 'aio-demo-gif');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const prof = join(work, 'profile');
rmSync(prof, { recursive: true, force: true });

for (let i = 0; i < frames.length; i++) {
  const htmlPath = join(work, `f${String(i).padStart(3, '0')}.html`);
  const pngPath = join(work, `f${String(i).padStart(3, '0')}.png`);
  writeFileSync(htmlPath, frames[i].html);
  const shot = () =>
    spawnSync(EDGE, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--user-data-dir=${prof}`,
      '--virtual-time-budget=900',
      `--screenshot=${pngPath}`,
      `--window-size=${W},${H}`,
      'file:///' + htmlPath.replace(/\\/g, '/'),
    ], { stdio: 'ignore', timeout: 30_000 });
  shot();
  if (!existsSync(pngPath)) {
    // poisoned profile can swallow a shot (same failure mode as screenshots.ps1)
    rmSync(prof, { recursive: true, force: true });
    shot();
  }
  if (!existsSync(pngPath)) {
    console.error(`FAIL frame ${i} (${htmlPath})`);
    process.exit(1);
  }
  if (i % 15 === 14) console.log(`  shot ${i + 1}/${frames.length}`);
}
console.log('shots done');

// ---- 4. ffmpeg: variable-delay concat -> palette -> gif ----
const list = frames
  .map((f, i) => {
    const p = join(work, `f${String(i).padStart(3, '0')}.png`).replace(/\\/g, '/');
    return `file '${p}'\nduration ${f.delay.toFixed(3)}`;
  })
  .join('\n');
const lastPng = join(work, `f${String(frames.length - 1).padStart(3, '0')}.png`)
  .replace(/\\/g, '/');
writeFileSync(join(work, 'list.txt'), `${list}\nfile '${lastPng}'\n`);

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || '');
    throw new Error(`ffmpeg exited ${r.status}`);
  }
}
const base = ['-y', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt')];
ffmpeg([...base, '-vf', 'palettegen=stats_mode=diff', join(work, 'pal.png')]);
function use(ditherScale) {
  ffmpeg([
    ...base, '-i', join(work, 'pal.png'),
    '-lavfi', `paletteuse=dither=bayer:bayer_scale=${ditherScale}`,
    OUT,
  ]);
}
use(3);
// static terminal frames dither poorly at scale 3 — shrink if oversized
if (readFileSync(OUT).length > 3_500_000) use(5);
rmSync(work, { recursive: true, force: true });
const kb = (readFileSync(OUT).length / 1024).toFixed(0);
console.log(`OK  demo.gif  ${kb} KB  ${frames.length} frames  ${total.toFixed(1)}s`);
