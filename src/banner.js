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

const ART = [
  '  █████╗  ██╗   ██████╗ ',
  ' ██╔══██╗ ██║  ██╔═══██╗',
  ' ████████║ ██║  ██║   ██║',
  ' ██╔══██║ ██║  ██║   ██║',
  ' ██║  ██║ ██║  ╚██████╔╝',
  ' ╚═╝  ╚═╝ ╚═╝   ╚═════╝ ',
];

export function banner() {
  const color = process.stdout.isTTY;
  const green = color ? '\x1b[32m' : '';
  const dim = color ? '\x1b[2m' : '';
  const reset = color ? '\x1b[0m' : '';
  const version = getVersion();
  const lines = [
    ...ART.map((l) => green + l + reset),
    `${dim}  all-in-one-repo v${version} — auto-connect AI agents to your repos, tools & skills${reset}`,
    `${dim}  GPL-3.0 · https://github.com/MRaihan-XXL/all-in-one-repo${reset}`,
  ];
  return lines.join('\n');
}
