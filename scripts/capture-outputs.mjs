// capture-outputs.mjs — regenerate OUTPUTS.md from REAL command runs.
// Never hand-typed: every block in OUTPUTS.md is the verbatim stdout/stderr of
// an actual `node bin/aio.js ...` invocation on this machine, stamped with the
// package version and run time. Re-run after any UX change:
//   node scripts/capture-outputs.mjs
// Ask search is live (network); when offline it records the honest error line.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

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
block(
  'Ask (live search, ranked, discarded)',
  'node bin/aio.js ask "sqlite to parquet converter"',
  run(['ask', 'sqlite to parquet converter'])
);
block('Release scorecard (15 aspects)', 'node scripts/verify-scorecard.mjs', (() => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-scorecard.mjs')], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trimEnd() };
})());

const doc = `# AIO — output gallery

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

fs.writeFileSync(path.join(ROOT, 'OUTPUTS.md'), doc);
console.log(`OUTPUTS.md written (${blocks.length} blocks, ${doc.length} chars)`);
