// banner.js — aio CLI branding (logo + wordmark + version)
import pkg from '../package.json' with { type: 'json' };

export function getVersion() {
  return pkg.version || '0.0.0';
}

// Strict grid: each glyph is a fixed width, joined with single spaces — every
// row is exactly 8+1+4+1+8 = 22 columns, so letters can never come out crooked.
// Half-block corners (▄/▀) give the O and the A's shoulder soft, rounded terminals.
const GLYPHS = {
  A: [' ▄████▄ ', '██    ██', '██    ██', '████████', '██    ██', '██    ██'],
  I: ['████', ' ██ ', ' ██ ', ' ██ ', ' ██ ', '████'],
  O: [' ▄████▄ ', '██    ██', '██    ██', '██    ██', '██    ██', ' ▀████▀ '],
};
export const ART = GLYPHS.A.map((row, i) => `${row} ${GLYPHS.I[i]} ${GLYPHS.O[i]}`);

// Top-to-bottom glow: dark ember → bright coral (a rising "powering up" ramp).
const RAMP = [52, 94, 135, 167, 180, 203];

// Env vars arrive as strings: `AIO_QUIET=0`/`=false` must mean "banner on",
// so plain truthiness can't be the switch (6h).
const off = (v) => Boolean(v) && !['0', 'false'].includes(String(v).toLowerCase());

export function banner() {
  if (off(process.env.AIO_QUIET) || off(process.env.AIO_NO_BANNER)) return '';
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  const dim = color ? '\x1b[2m' : '';
  const accent = color ? '\x1b[38;5;203m' : '';
  const cyan = color ? '\x1b[38;5;80m' : '';
  const reset = color ? '\x1b[0m' : '';
  const version = getVersion();
  const art = ART.map((l, i) => (color ? `\x1b[38;5;${RAMP[i]}m` : '') + l + reset);
  const rule = dim + '─'.repeat(74) + reset;
  const lines = [
    '',
    ...art,
    `${accent}  ▌ all-in-one${reset}${dim} v${version} — auto-connect every AI agent to${reset}`,
    `${dim}  ▌ live: github · npm · crates · web${reset}   ${cyan}prompt → aio ask → use → report → clean${reset}`,
    rule,
    `${dim}  GPL-3.0 · https://github.com/MRaihan-XXL/all-in-one${reset}`,
    '',
  ];
  return lines.join('\n');
}
