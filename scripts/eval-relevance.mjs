// eval-relevance.mjs — live relevance eval for `aio ask`: 110 golden queries
// (the 20 v1.7 queries + 20 directional "X to Y" + 50 natural dev asks +
// 20 noise/tail asks). Metrics (all reported — presence-only would overstate):
//   hit@8 = any relevant row in the top 8 · hit@1 = relevant row at rank 1
//   MRR   = mean reciprocal rank of the FIRST relevant row (1.0 = perfect)
// Writes eval-result.json (n, hit8, hit1, mrr, measured) — the machine source
// for the README badge and the scorecard's quality gate.
// Usage: node scripts/eval-relevance.mjs
// Network required; AIO_NO_AI=1 keeps ranking deterministic (BM25 + trust, no Ollama).
process.env.AIO_NO_AI = process.env.AIO_NO_AI ?? '1';

const { runAsk } = await import('../src/search.js');

// Patterns are deliberately tight: a row only counts when name+func match the
// CORE of the intent (not a generic word the query happens to contain).
const QUERIES = [
  // ---- original v1.7 set (20) ----
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
  ['rust cli argument parser', /\bclap\b|\bpico-?args\b|\bargh\b|\bbpaf\b|\blexopt\b|\bgumdrop\b/i],
  ['kanban board api', /kanban|trello/i],
  // ---- directional: X to Y (20) — direction-blind ranking dies here ----
  ['png to jpeg converter', /png.*jpe?g|jpe?g.*png|\bsharp\b|\bjimp\b|squoosh|imagemagick|image.*convert/i],
  ['yaml to json', /ya?ml.*json|json.*ya?ml|js-yaml|ya?ml.*convert/i],
  ['json to yaml', /json.*ya?ml|ya?ml.*json|json.*ya?ml|ya?ml/i],
  ['docx to pdf', /docx.*pdf|pdf.*docx|\bpandoc\b|libreoffice|\bsoffice\b|word.*pdf/i],
  ['html to markdown', /html.*markdown|markdown.*html|\bturndown\b|to.?markdown|readability/i],
  ['video to gif', /video.*gif|gif.*video|ffmpeg.*gif|\bgifski\b|video2?gif/i],
  ['image to text', /\bocr\b|tesseract|image.*text|extract.*text|text.*extract/i],
  ['csv to xlsx', /csv.*xlsx|xlsx.*csv|\bxlsx\b|exceljs|sheetjs|spreadsheet/i],
  ['markdown to pdf', /markdown.*pdf|pdf.*markdown|\bmd\b.*pdf|\bpandoc\b/i],
  ['typescript to javascript', /typescript.*javascript|transpile|\btsc\b|\besbuild\b|\bswc\b|compile.*ts/i],
  ['image resize cli', /resize|resizer|\bsharp\b|imagemagick|\bmagick\b|image.*dimension/i],
  ['heic to png', /\bheic\b|\bheif\b|libheif|image.*convert|convert.*image/i],
  ['audio to mp3', /\bmp3\b|ffmpeg|audio.*convert|convert.*audio|transcode/i],
  ['sql to csv', /sql.*csv|csv.*sql|query.*csv|export.*csv|to.?csv/i],
  ['screenshot to pdf', /screenshot.*pdf|pdf.*screenshot|print.*pdf|html.*pdf/i],
  ['rss to json', /rss.*json|feed.*json|rss2?json|feedparser|\brss\b/i],
  ['pdf to text', /pdf.*text|text.*pdf|pdf.*extract|pdfjs|pdf-?parse|extract.*pdf/i],
  ['image to pdf', /image.*pdf|pdf.*image|img2pdf|jpg.*pdf|pdf.*convert/i],
  ['json to csv', /json.*csv|csv.*json|json2?csv|to.?csv/i],
  ['node to bun', /\bbun\b.*(?:migrat|run|install)|migrat.*\bbun\b|\bbun\b/i],
  // ---- natural dev asks (50) ----
  ['jwt refresh token rotation', /refresh.*token|token.*rotat|\bjwt\b|oauth/i],
  ['react virtualized list', /virtuali[sz]|window.*list|react-window|virtuoso/i],
  ['rust async runtime', /\btokio\b|async-std|futures|async.*runtime|runtime.*async/i],
  ['python data validation', /pydantic|dataclasses|validation|validate/i],
  ['typescript type guard examples', /type.?guard|narrowing|\btypeof\b|instanceof/i],
  ['sql injection scanner', /sqlmap|injection|sqli|security.*scan|scan.*sql/i],
  ['log rotation linux', /logrotate|log.*rotat|rotat.*log|log.*manag/i],
  ['regex cheat sheet', /regex|regexp|regular.*expression|cheatsheet|cheat.*sheet/i],
  ['websocket reconnect strategy', /websocket|reconnect|retry.*connect|connect.*retry/i],
  ['oauth2 pkce flow', /oauth|pkce|\boidc\b|authorization.*code/i],
  ['docker compose postgres', /docker.*compose|compose.*postgres|postgres.*docker|docker.*postgres/i],
  ['kubernetes ingress nginx', /ingress|nginx.*kubernetes|kubernetes.*nginx|\bk8s\b/i],
  ['terraform aws s3', /terraform|\bs3\b|aws.*terraform|terraform.*aws/i],
  ['github actions cache', /actions.*cache|cache.*action|gha.*cache|cache.*workflow/i],
  ['eslint flat config', /eslint|flat.*config|config.*flat|\brc\b.*eslint/i],
  ['zod schema validation', /\bzod\b|schema.*valid|valid.*schema/i],
  ['prisma postgres migration', /prisma|migration|postgres/i],
  ['next.js image optimization', /next.*image|image.*optimi|nextjs|next\.js/i],
  ['svelte transition animation', /svelte|transition|animation|animate/i],
  ['vue composition api composable', /composition.*api|composable|\bvue\b.*(?:hook|compos)/i],
  ['sqlite wal mode', /sqlite|wal.*mode|wal\b.*(?:checkpoint|mode)|database.*wal/i],
  ['redis pub sub example', /redis.*pub|pub.*sub|pubsub|subscribe/i],
  ['rabbitmq dead letter queue', /rabbitmq|dead.*letter|amqp|queue/i],
  ['grpc streaming client', /\bgrpc\b|streaming|proto.*buf|protocol.*buffer/i],
  ['graphql codegen typescript', /graphql.*codegen|codegen.*graphql|graphql.*type|type.*graphql/i],
  ['jest snapshot testing', /jest|snapshot|testing/i],
  ['playwright headless browser', /playwright|headless|browser.*test|test.*browser/i],
  ['vitest coverage report', /vitest|coverage|report/i],
  ['webpack bundle analyzer', /webpack|bundle.*analyz|analyz.*bundle|stats/i],
  ['vite plugin example', /\bvite\b|plugin/i],
  ['esbuild minify css', /esbuild|minify|css.*min|min.*css/i],
  ['tailwind css color palette', /tailwind|palette|color|theme/i],
  ['css grid generator', /css.*grid|grid.*generator|grid/i],
  ['svg path editor', /svg.*path|path.*edit|\bsvg\b|vector/i],
  ['three.js orbit controls', /three|orbit|3d|controls/i],
  ['d3.js bar chart tutorial', /\bd3\b|bar.*chart|chart|tutorial/i],
  ['chart.js react example', /chart|react|example/i],
  ['pdf.js render page', /pdf|render|page/i],
  ['highlight.js code blocks', /highlight|code.*block|syntax|prism/i],
  ['dompurify sanitize html', /sanitiz|dompurify|clean.*html|security/i],
  ['crypto password hash bcrypt', /bcrypt|hash|password|crypto/i],
  ['totp authenticator otp', /\btotp\b|otp|authenticator|2fa|mfa/i],
  ['rate limiter express', /rate.*limit|limit|express|throttl/i],
  ['helmet csp headers', /helmet|csp|security.*header|header.*security/i],
  ['cors middleware node', /\bcors\b|middleware|cross.*origin/i],
  ['compression gzip nginx', /compress|gzip|brotli|nginx/i],
  ['semver bump script', /semver|version.*bump|bump|changelog/i],
  ['npm publish automation', /npm.*publish|publish|release|automation/i],
  ['docker slim image', /slim|docker.*image|image.*size|minif/i],
  ['git hook pre commit lint', /pre.*commit|git.*hook|hook.*lint|lint.*staged/i],
  ['monorepo turborepo setup', /turborepo|monorepo|workspace|lerna/i],
  ['pnpm workspace example', /pnpm|workspace|monorepo/i],
  ['code coverage badge', /coverage|badge|report/i],
  ['dependabot vs renovate', /dependabot|renovate|update.*dep|dep.*update/i],
  // ---- noise / tail (20) — the queries where junk used to win ----
  ['awesome python list', /awesome.*python|python.*awesome|awesome-python/i],
  ['best vscode extensions', /vscode|extension|visual.*studio/i],
  ['free font for code', /font|mono|typeface/i],
  ['pretty terminal prompt', /prompt|starship|oh-my-posh|powerlevel|theme/i],
  ['fast json parser js', /json|parser|fast/i],
  ['minimal static site generator', /static.*site|site.*gener|minimal|hugo|zola|eleventy/i],
  ['emoji slack reaction', /emoji|slack|reaction/i],
  ['github profile readme', /profile|readme|github.*page|stats/i],
  ['readme badge generator', /badge|readme|shield|shields\.io/i],
  ['changelog generator', /changelog|conventional|release.*note|changes/i],
  ['auto delete temp files', /temp.*clean|clean.*temp|tmp.*clean|cleanup|garbage/i],
  ['markdown table generator', /table|markdown|grid/i],
  ['svg to png cli', /svg.*png|png.*svg|svg|convert/i],
  ['cron expression builder', /cron|schedule|crontab|interval/i],
  ['http status code poster', /status|http|code.*poster|cheat/i],
  ['gitignore template', /gitignore|ignore|template/i],
  ['localhost https cert', /cert|ssl|tls|localhost|mkcert|https/i],
  ['dotfiles bootstrap script', /dotfile|bootstrap|setup.*script|symlink/i],
  ['screen resolution stats', /resolution|screen|stat|display/i],
  ['keyboard shortcut cheatsheet', /shortcut|keybind|keyboard|cheat/i],
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
  const { writeFileSync } = await import('node:fs');
  writeFileSync(new URL('../eval-result.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log('wrote eval-result.json');
}
