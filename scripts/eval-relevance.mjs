// eval-relevance.mjs — live relevance eval for `aio ask`: 20 golden queries.
// Metrics (all reported — presence-only would overstate quality):
//   hit@8 = any relevant row in the top 8 · hit@1 = relevant row at rank 1
//   MRR   = mean reciprocal rank of the FIRST relevant row (1.0 = perfect)
// Usage: node scripts/eval-relevance.mjs
// Network required; AIO_NO_AI=1 keeps ranking deterministic (BM25 + trust, no Ollama).
process.env.AIO_NO_AI = process.env.AIO_NO_AI ?? '1';

const { runAsk } = await import('../src/search.js');

// Patterns are deliberately tight: a row only counts when name+func match the
// CORE of the intent (not a generic word the query happens to contain).
const QUERIES = [
  ['csv to interactive chart', /chart|plot|graph|visuali[sz]/i],
  ['pdf to word converter', /docx|\bword\b|pandoc|libreoffice|pdf.*(?:to|2)\s*(?:word|docx)/i],
  ['markdown to html', /markdown|remark|marked|mdast|showdown/i],
  ['terminal recording gif', /asciinema|terminal.*record|record.*(?:terminal|gif)|terminal.*gif/i],
  ['jwt authentication node', /\bjwt\b|jsonwebtoken|\bjose\b/i],
  ['websocket client javascript', /websocket|socket\.io|\bws\b/i],
  ['rust web framework', /\bactix\b|\baxum\b|\brocket\b|\btower\b|\bwarp\b|rouille|\bpoem\b|\bsalvo\b/i],
  ['excel spreadsheet parser', /xlsx|exceljs|sheetjs|\bexcel\b|workbook|spreadsheet/i],
  ['image compression cli', /compress|optimi[sz]|imagemin|\bsharp\b|squoosh|imageoptim/i],
  ['sql database migration', /migrat|prisma|knex|flyway|liquibase|dbmate/i],
  ['react date picker', /date.?pick|calendar/i],
  ['python websocket server', /websocket|aiohttp|fastapi|tornado|websockets/i],
  ['emoji picker component', /emoji|emoticon|twemoji/i],
  ['documentation generator', /documentation|typedoc|jsdoc|sphinx|mkdocs|doxygen|docgen|doc-?builder/i],
  ['docker container gui', /portainer|lazydocker|docker.*\b(?:gui|ui|desktop|dashboard)\b|podman.*\b(?:gui|ui)\b/i],
  ['latex to pdf', /latex|typst|tectonic|pandoc|pdflatex|xelatex|lualatex/i],
  ['chromium headless screenshot', /puppeteer|playwright|headless|chromium|chrome.*devtools/i],
  ['csv to json', /csv.*json|json.*csv/i],
  ['rust cli argument parser', /\bclap\b|pico-?args|\bargh\b|\bbpaf\b|lexopt|gumdrop/i],
  ['kanban board api', /kanban|trello/i],
];

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
console.log(
  `\nhit@8 = ${hit8}/${n} (${((hit8 / n) * 100).toFixed(0)}%) · hit@1 = ${hit1}/${n} (${((hit1 / n) * 100).toFixed(0)}%) · MRR = ${(rrSum / n).toFixed(2)} · ${((Date.now() - t0) / 1000).toFixed(1)}s · measured ${new Date().toISOString().slice(0, 10)}`
);
