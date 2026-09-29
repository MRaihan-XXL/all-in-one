// catalog.js — pure functions shared by scripts/build-db.mjs and tests.
// Parses the REPOS table of aio-context.md and maps repos to a fine-grained
// category (with its parent group from the original6-category taxonomy).

/** Fine labels grouped under the original6 taxonomy groups. */
export const GROUPS = [
  'AI Agent / Framework',
  'Library React / UI',
  'Web Scraping / Data',
  'Materi / Skills',
  'CLI Aktif',
  'Aplikasi / Lainnya',
];

const LABEL_GROUP = {
  'AI Agent / Framework': 'AI Agent / Framework',
  'LLM / Model / Inference': 'AI Agent / Framework',
  'MCP / Server': 'AI Agent / Framework',
  'RAG / VectorDB': 'AI Agent / Framework',
  'React / UI Library': 'Library React / UI',
  'Design / Icon / Theme': 'Library React / UI',
  'Charts / DataViz': 'Library React / UI',
  'Animation / Graphics': 'Library React / UI',
  'Web Scraping / Crawler': 'Web Scraping / Data',
  'OSINT / Search': 'Web Scraping / Data',
  'Data / ETL': 'Web Scraping / Data',
  'Document / Conversion': 'Web Scraping / Data',
  'Skills / Prompts': 'Materi / Skills',
  'Learning / Docs': 'Materi / Skills',
  'Monitoring / Observability': 'Aplikasi / Lainnya',
  'DevOps / Infra': 'Aplikasi / Lainnya',
  'Dev / Code Tool': 'Aplikasi / Lainnya',
  'Self-hosted / Server': 'Aplikasi / Lainnya',
  'Productivity / Office': 'Aplikasi / Lainnya',
  'Communication / Social': 'Aplikasi / Lainnya',
  'Email / Marketing': 'Aplikasi / Lainnya',
  'Browser / Client': 'Aplikasi / Lainnya',
  'Media / Audio-Video': 'Aplikasi / Lainnya',
  'Automation / Bot': 'Aplikasi / Lainnya',
  'Security': 'Aplikasi / Lainnya',
  'Finance / Crypto': 'Aplikasi / Lainnya',
  'Game / Fun': 'Aplikasi / Lainnya',
  'Aplikasi / Lainnya': 'Aplikasi / Lainnya',
};

export const LABELS = Object.keys(LABEL_GROUP);

/** Ordered rules — first match on (name + description + topics) wins. */
const RULES = [
  ['Skills / Prompts', /\bskills?\b|skill-|prompts?\b|playbook|cheat-?sheet|agents? skills/],
  ['Learning / Docs', /awesome|tutorial|course|curriculum|roadmap|learn|educat|lesson|handbook|interview|\bguide\b|mindmap|\bbooks?\b/],
  ['Web Scraping / Crawler', /scrap|crawl|spider|playwright|puppeteer|selenium|browser autom|headless|http ?client|wget/],
  ['OSINT / Search', /\bosint\b|search engine|searx|whois|\bdork|shodan|\brecon\b|osint/],
  ['Document / Conversion', /\bpdf\b|markdown|pandoc|docx|\bocr\b|file convert|extract text|converter/],
  ['Data / ETL', /\betl\b|dataset|dataframe|\bcsv\b|analytic|parallel processing|mpp|data pipeline|dataset|jupyter/],
  ['MCP / Server', /\bmcp\b|model context/],
  ['RAG / VectorDB', /\brag\b|vector|chroma|qdrant|milvus|weaviate|\bfaiss\b|pinecone/],
  ['LLM / Model / Inference', /ollama|llama|\bvllm\b|inference|\bgguf\b|quantiz|embedding|stable diffusion|comfyui|whisper|text-to-speech|\btts\b|fine-?tun|\blora\b|transformers|ggml|diffusion|speech/],
  ['AI Agent / Framework', /agent|assistant|chatbot|copilot|agentic|autogen|crewai|\bdify\b|langflow|flowise|reasoning|orchestr|\bllm\b|\bgpt\b|claude|openai|anthropic|gemini|prompt engine|chat ?bot/],
  ['Security', /security|vulnerab|exploit|pentest|malware|forensic|encrypt|\bpassword\b|sql injection|threat|cve|pentesting|scanner/],
  ['Monitoring / Observability', /monitor|observab|prometheus|grafana|\buptim|\bmetric|status page|log aggreg|alerting|telemetry/],
  ['DevOps / Infra', /docker|kubernetes|\bk8s\b|terraform|ansible|nginx|reverse proxy|deploy|container|ci\/cd|pipeline|database|\bpostgres|\bmysql|\bredis|\bsqlite|backup|gateway|\bserver\b|web server|\bapi\b|cloud/],
  ['Self-hosted / Server', /self-?host|\bnas\b|\bvpn\b|firewall|home assistant|home automation|smart home|\biot\b|nextcloud|file manager|rss|\bvpn\b|homelab/],
  ['React / UI Library', /\breact\b|next\.?js|\bvue\b|svelte|tailwind|shadcn|\bradix\b|component|ui kit|frontend|bootstrap|\bcss\b|framework ui|design system ui/],
  ['Design / Icon / Theme', /\bicons?\b|\blogo\b|illustration|\bfigma\b|typography|\bfonts?\b|\bthemes?\b|color palette|assets/],
  ['Charts / DataViz', /\bcharts?\b|graphs?\b|visuali|plotting|\bd3\b|echarts|plotly|recharts|dashboard/],
  ['Animation / Graphics', /animation|gsap|framer|\bmotion\b|lottie|three\.?js|\bwebgl\b|shader|\b3d\b|canvas/],
  ['Dev / Code Tool', /\bterminal\b|\bshell\b|editor|\bvim\b|neovim|\bgrep\b|\bjq\b|\bfzf\b|\btmux\b|\blint\b|formatt|compil|debugger|language server|\bcli\b|syntax|version control|\bgit\b tool/],
  ['Productivity / Office', /notes?|wiki|kanban|\btodo\b|\btasks?\b|calendar|office suite|spreadsheet|knowledge base|whiteboard|brainstorm|obsidian|project manage|task manage|todo/],
  ['Email / Marketing', /\bemail\b|\bmail(?!ing machine)|newsletter|marketing|\bcrm\b|\bseo\b|newsletter/],
  ['Communication / Social', /\bchat\b|social|forum|mastodon|matrix|slack|discord|telegram|whatsapp|communit|messag/],
  ['Browser / Client', /browser|firefox|chrome|chromium|\bbrave\b|web.?browser/],
  ['Media / Audio-Video', /\bvideo\b|\baudio\b|\bmusic\b|podcast|ffmpeg|\bstream\b|player|subtitle|audiobook|image|photo|screen record|video edit|\bmusic\b|media/],
  ['Automation / Bot', /\bbots?\b|automation|\bn8n\b|zapier|scheduler|\bcron\b|workflow automat|script automat/],
  ['Finance / Crypto', /finance|budget|invoice|accounting|trading|crypto|bitcoin|blockchain|\bstocks?\b|\bweb3\b|money/],
  ['Game / Fun', /\bgames?\b|puzzle|chess|tetris|roguelike|meme|\bfun\b/],
];

/** Fine label for a repo (null-safe: always returns a known label). */
export function categorize(name = '', desc = '', topics = []) {
  const s = `${name} ${desc} ${topics.join(' ')}`.toLowerCase();
  for (const [label, re] of RULES) if (re.test(s)) return label;
  return 'Aplikasi / Lainnya';
}

export function groupOf(label) {
  return LABEL_GROUP[label] ?? 'Aplikasi / Lainnya';
}

/** Parse the `## REPOS (n)` table of aio-context.md → [{folder,url,owner,repo,dirPath}]. */
export function parseReposTable(md) {
  const section = md.split(/^## REPOS \(\d+\)$/m)[1]?.split(/^## /m)[0] ?? '';
  const repos = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|/);
    if (!m) continue;
    const [, folder, urlRaw, dirPath] = m;
    const url = /github\.com/i.test(urlRaw) ? urlRaw.trim() : '';
    const um = url.match(/github\.com\/([^/]+)\/([^/\s]+)/);
    repos.push({ folder: folder.trim(), url, owner: um?.[1] ?? '', repo: um?.[2] ?? '', dirPath });
  }
  return repos;
}
