// eval-relevance.mjs — live relevance eval for `aio ask`: 20 golden queries, hit@8.
// Usage: node scripts/eval-relevance.mjs
// Network required; AIO_NO_AI=1 keeps ranking deterministic (BM25 + trust, no Ollama).
// A query HITS when any top-8 result's name/func matches its ground-truth pattern.
process.env.AIO_NO_AI = process.env.AIO_NO_AI ?? '1';

const { runAsk } = await import('../src/search.js');

const QUERIES = [
  ['csv to interactive chart', /chart|plot|graph|visuali[sz]/i],
  ['pdf to word converter', /pdf/i],
  ['markdown to html', /markdown|remark|md-|marked/i],
  ['terminal recording gif', /terminal|asciinema|record|screenshot/i],
  ['jwt authentication node', /jwt|auth|token/i],
  ['websocket client javascript', /websocket|\bws\b|socket/i],
  ['rust web framework', /rust|actix|axum|rocket|tower|warp/i],
  ['excel spreadsheet parser', /excel|xlsx|spreadsheet|sheet|workbook/i],
  ['image compression cli', /compress|optimi[sz]|imagemin|sharp|squoosh/i],
  ['sql database migration', /migrat|schema|prisma|knex|flyway|liquibase/i],
  ['react date picker', /date|calendar|picker/i],
  ['python websocket server', /websocket|\bws\b|aiohttp|fastapi|tornado/i],
  ['emoji picker component', /emoji|emoticon/i],
  ['documentation generator', /docs|documentation|doc(?:s|kit)?\b/i],
  ['docker container gui', /docker|container|podman/i],
  ['latex to pdf', /latex|typst|tectonic|pandoc/i],
  ['chromium headless screenshot', /puppeteer|playwright|headless|screenshot|chrom/i],
  ['csv to json', /csv|json/i],
  ['rust cli argument parser', /clap|arg|cli|pico-args/i],
  ['kanban board api', /kanban|trello|board|task/i],
];

const t0 = Date.now();
let hits = 0;
const rows = [];
for (const [q, want] of QUERIES) {
  const r = await runAsk({ query: q, json: true });
  const list = r.json?.hits || [];
  const rank = list.findIndex((h) => want.test(`${h.name} ${h.func}`));
  const ok = rank >= 0;
  if (ok) hits++;
  rows.push({ q, hit: ok, rank: ok ? rank + 1 : '-', sources: (r.json?.sources || []).join('+') || 'none' });
}

for (const r of rows) {
  console.log(`${r.hit ? ' HIT' : 'MISS'}  top-${String(r.rank).padEnd(2)}  [${r.sources.padEnd(18)}] ${r.q}`);
}
const score = `${hits}/${QUERIES.length}`;
console.log(`\nhit@8 = ${score} (${((hits / QUERIES.length) * 100).toFixed(0)}%) · ${((Date.now() - t0) / 1000).toFixed(1)}s · measured ${new Date().toISOString().slice(0, 10)}`);
