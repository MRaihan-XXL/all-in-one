// banner.js — aio CLI branding (logo + wordmark + version)
import fs from 'node:fs';

export function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
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

export function banner() {
  const color = Boolean(process.stdout.isTTY);
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
