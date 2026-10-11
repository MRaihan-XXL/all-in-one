// eval-relevance.mjs — live relevance eval for `aio ask`: 114 golden queries
// (the 20 v1.7 queries + 20 directional "X to Y" + 54 natural dev asks +
// 20 noise/tail asks). Metrics (all reported — presence-only would overstate):
//   hit@8 = any relevant row in the top 8 · hit@1 = relevant row at rank 1
//   MRR   = mean reciprocal rank of the FIRST relevant row (1.0 = perfect)
// Writes eval-result.json (n, hit8, hit1, mrr, measured) — the machine source
// for the README badge and the scorecard's quality gate.
// Usage: node scripts/eval-relevance.mjs
// Network required; ranking is deterministic (BM25 + trust).

const { runAsk } = await import('../src/search.js');
const { QUERIES } = await import('./golden.mjs');


const t0 = Date.now();
let hit8 = 0;
let hit1 = 0;
let rrSum = 0;
const rows = [];
for (const [q, want] of QUERIES) {
  const r = await runAsk({ query: q, json: true });
  const list = r.json?.hits || [];
  const rank = list.findIndex((h) => want.test(`${h.name} ${h.func}`));
  const ok = rank >= 0;
  if (ok) {
    hit8++;
    rrSum += 1 / (rank + 1);
    if (rank === 0) hit1++;
  }
  rows.push({ q, hit: ok, rank: ok ? rank + 1 : '-', sources: (r.json?.sources || []).join('+') || 'none' });
}

for (const r of rows) {
  console.log(`${r.hit ? ' HIT' : 'MISS'}  top-${String(r.rank).padEnd(2)}  [${r.sources.padEnd(18)}] ${r.q}`);
}
const n = QUERIES.length;
const measured = new Date().toISOString().slice(0, 10);
const ms = Date.now() - t0;
const result = {
  n,
  hit8: Number(((hit8 / n) * 100).toFixed(1)),
  hit1: Number(((hit1 / n) * 100).toFixed(1)),
  mrr: Number((rrSum / n).toFixed(3)),
  seconds: Number((ms / 1000).toFixed(1)),
  measured,
};
console.log(
  `\nhit@8 = ${hit8}/${n} (${result.hit8}%) · hit@1 = ${hit1}/${n} (${result.hit1}%) · MRR = ${result.mrr} · ${result.seconds}s · measured ${measured}`
);
if (process.argv.includes('--write')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  writeFileSync(new URL('../eval-result.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log('wrote eval-result.json');
  // keep the README badge + gallery line in lockstep with the snapshot (the
  // scorecard fails on drift; stats.mjs --write applies the same patch)
  const rmUrl = new URL('../README.md', import.meta.url);
  let rm = readFileSync(rmUrl, 'utf8');
  const subs = [
    [/eval-hit%401%20[\d.]+%25%20%C2%B7%20MRR%20[\d.]+%20%C2%B7%20n%3D\d+/,
      `eval-hit%401%20${result.hit1}%25%20%C2%B7%20MRR%20${result.mrr}%20%C2%B7%20n%3D${result.n}`],
    [/alt="eval: hit@1 [\d.]+% {2}MRR [\d.]+ {2}n=\d+ \(\d{4}-\d{2}-\d{2}\)"/,
      `alt="eval: hit@1 ${result.hit1}%  MRR ${result.mrr}  n=${result.n} (${result.measured})"`],
    [/hit@8 = \d+\/\d+ \([\d.]+%\), hit@1 = \d+\/\d+ \([\d.]+%\), MRR [\d.]+, measured \d{4}-\d{2}-\d{2}/,
      `hit@8 = ${hit8}/${n} (${result.hit8}%), hit@1 = ${hit1}/${n} (${result.hit1}%), MRR ${result.mrr}, measured ${result.measured}`],
  ];
  for (const [re, to] of subs) {
    if (!re.test(rm)) {
      console.error(`eval-relevance: README pattern not found: ${re} - eval-result.json written, README left stale`);
      process.exitCode = 1;
    } else rm = rm.replace(re, to);
  }
  if (rm !== readFileSync(rmUrl, 'utf8')) {
    writeFileSync(rmUrl, rm);
    console.log('patched README.md eval badge + gallery line');
  }
}
