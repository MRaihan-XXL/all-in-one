// messages.js — AIO_LANG=id user-facing message catalog: every [aio] error,
// usage, note and text-mode report string lives here in BOTH languages.
// English strings are byte-identical to the pre-i18n originals (the default
// locale — tests and existing scripts see no change); AIO_LANG=id selects
// Bahasa Indonesia. --json payloads stay EN in BOTH locales (machine contract).
// Test parity: EN and ID must carry the same keys and the same {placeholders}.
const EN = {
  /* ---- usage ---- */
  usageAsk: 'usage: aio ask "<what you need>"\nexample: aio ask "csv ke chart interaktif"',
  usageAgent: 'usage: aio agent "<your task>"\nexample: aio agent "convert csv to interactive chart and publish"',
  usageSkillSearch: 'usage: aio skill search "<query>" [--add]\nexample: aio skill search "pdf word convert"',
  usageSkillAdd:
    'usage: aio skill add <owner/repo | url> [--file <path|dir>] [--name <name>] [--sha256 <hex>]\n' +
    '       aio skill list  ·  aio skill remove <name>\n' +
    'example: aio skill add anthropics/skills --name pdf-tools',
  usageSkillRemove: '[aio] skill: missing name — usage: aio skill remove <name>',
  evolveDeprecated: "[aio] 'evolve' is deprecated — use 'aio verify' (alias removed after 2 releases)",
  usageCompletion: 'usage: aio completion bash|zsh|fish|pwsh',

  /* ---- offline ---- */
  offlineSearch: '[aio] offline (AIO_OFFLINE=1) — aio keeps zero local catalog by design; live search needs network.',
  offlineAgent: '[aio] offline (AIO_OFFLINE=1) — aio keeps zero local catalog by design; live coordination needs network.',
  offlineSkillSearch: '[aio] offline (AIO_OFFLINE=1) — skill search is live by design.',

  /* ---- bin dispatch ---- */
  cmdRequires: '[aio] {a} requires {hint}',
  unknownCommand: '[aio] unknown command: {cmd}',
  tryHelp: "run 'aio --help' for usage",
  copilotOnlyInit: '[aio] --copilot only applies to `aio init` — ignoring',
  rollbackNoDryRun: '[aio] rollback cannot honor --dry-run — refusing to run; inspect first with `aio doctor`',
  dryRunOnlySetupInit: '[aio] --dry-run only applies to `aio setup` / `aio init` — ignoring',
  unknownFlag: '[aio] unknown flag: {tok} — ignoring',
  cmdFailed: '[aio] {cmd} failed: {err}',
  skillUnknownSub: '[aio] skill: unknown subcommand "{action}" — use add | list | remove | search',

  /* ---- agent (text mode; --json payload + route step labels stay EN) ---- */
  agentHeader: 'aio agent — "{query}" (coordinating: {coordinating} · {n} results · {sec}s)',
  noLaneAnswered: 'no lane answered',
  agentPlan: 'plan  {lanes} — parallel, printed never stored',
  agentLaneEmpty: '{lane} 0 hits — answered empty',
  agentIssues: 'issues:',
  agentRouteHead: 'route (coordinated — cheapest first)',
  agentRouteNone: 'route — no lane matched this task; refine the keywords and rerun.',
  agentLanesHead: 'lanes (top hits per source)',
  agentNote:
    'note: every lane is live and unvetted — verify before running npx/cargo\n' +
    '      or cloning; report WHAT you used + EVERY link (docs/THREATS.md).',

  /* ---- ask text mode (--json engine/why stay EN) ---- */
  engineLive: 'live: {lanes}',
  engineNoSource: 'live: no source answered',
  askHeader: 'aio ask — "{query}" ({engine} · {n} results · {sec}s{web})',
  askHeaderWeb: ' · web → your web search',
  askHeaderZero: 'aio ask — "{query}" ({engine} · {sec}s)',
  liveSourcesFailed: 'Live sources failed — fix the issue above, then retry.',
  askNoResult:
    'No result from live sources. Refine keywords — or search the web with your own web-search tool',
  askUrlHint: ' (URL detected in the prompt)',
  askNote:
    'note: ranked by keyword match + source popularity — public results are unvetted;\n' +
    '      verify before running npx/uvx or cloning (docs/THREATS.md).',
  askSourceIssues: 'source issues: {srcs} — see --json errors[]',
  askNoUrl: '(no public URL)',
  timeFooter: 'time: {detail}', // shared footer: ask/agent/skillSearch per-lane timing
  errRateLimited: 'rate-limited — set GH_TOKEN / `gh auth login`, or retry later',
  errTimeout: 'timeout (4s/source budget)',
  errUnreachable: 'unreachable (network)',

  /* ---- skill ---- */
  skillPathNotFound: '[aio] skill: local path not found — {p}',
  skillMdNotFound: '[aio] skill: SKILL.md not found — {src}',
  skillInsecureHttp: '[aio] skill: insecure http:// URL refused — use https://',
  skillFetchFailed: '[aio] skill: fetch failed ({err}) — check network/URL instead of "not found" for {target}.',
  skillMdMissing: '[aio] skill: SKILL.md not found for {target} (tried {n} location{s}).',
  skillStatus: '[aio] skill {name}: {status} — {file}',
  skillWouldInstall: '[aio] skill {name}: would install (dry-run) — {file} (source: {source})',
  skillShaBadFormat: '[aio] skill: --sha256 must be 64 hex characters, got: {want}',
  skillShaMismatch: '[aio] skill: sha256 mismatch - wanted {want}, fetched {got}. Refusing to install.',
  skillInstalled: '[aio] skill {name}: installed — {file}\n        source: {source} · recorded for `aio rollback`',
  skillInvalidName: '[aio] skill: invalid name',
  skillNotInstalled: '[aio] skill {name}: not installed — {file}',
  skillModified: '[aio] skill {name}: modified since aio installed it — aio will not delete your edits; remove manually: {file}',
  skillNotOurs: '[aio] skill {name}: present (not installed by aio) — skipped: {file}',
  skillMdRemoved: '[aio] skill {name}: SKILL.md removed — directory kept (not empty): {dir}',
  skillRemoved: '[aio] skill {name}: removed — {dir}',
  skillSearchNoHit: '[aio] skill search: no installable hit for "{q}"{lanes}',
  skillSearchHeader: 'aio skill search — "{q}" ({engine} · {n} hits · {sec}s)',
  skillSourceIssues: 'source issues: {detail}',
  skillSearchNoFound: 'No skill found — refine keywords.',
  skillSearchNote:
    'note: public results are unvetted — read SKILL.md before trusting it (docs/THREATS.md).',
  skillSearchInstalling: 'aio skill search — "{q}" → installing top hit',
  skillInstallRow: 'install: aio skill add {name}',

  /* ---- borrow ---- */
  borrowGetFailed: '[aio] borrow --get failed: {err}',
  borrowSearchFailed: '[aio] borrow search failed: {err}',
  usageBorrow:
    'usage:\n' +
    '  aio borrow "<what you need>"   live GitHub search (link + function per hit)\n' +
    '  aio borrow --get <owner/repo>  shallow-clone to temp (24h TTL)\n' +
    '  aio borrow --list | --clean    inspect / wipe temp clones',
  borrowCleanHead: 'aio borrow --clean — {n} clone(s) removed, {freed} freed from {dir}',
  borrowTtlPurgeNamed: 'TTL purge: {n} expired (>24h): {names}',
  borrowListHead: 'aio borrow --list — {n} temp clone(s) in {dir}',
  borrowListItem: '- {name} — age {age}h — {path}',
  borrowListEmpty: 'aio borrow — nothing borrowed (dir: {dir})',
  borrowGetHead: 'aio borrow — {target} → {status}',
  borrowPath: 'path: {path}',
  borrowUseNote: 'use it now; auto-purged after 24h (or `aio borrow --clean`).',
  borrowFreeDisk: 'free disk: {free}',
  borrowNoResult: 'aio borrow — "{query}": no GitHub result. Refine keywords or check https://github.com/search',
  borrowSearchHeader: 'aio borrow — "{query}" (GitHub live search · {n} results)',
  borrowTtlPurge: 'TTL purge: {n} expired clone(s) removed',
  borrowPinOne: 'pin one: aio borrow --get {name}',

  /* ---- live fallback copies (meta tags / src / type stay EN data) ---- */
  liveRepoNoDesc: '{lang} repository (no description)',
  liveRepoLangNone: 'Repo',
  liveNpmNoDesc: 'npm package (no description)',
  liveCrateNoDesc: 'Rust crate (no description)',
  liveWikiNoDesc: 'Wikipedia article',
  liveHnDiscussion: 'Hacker News discussion — {pts} points by {author}',

  /* ---- update ---- */
  updateCheckFailed: '[aio] update check failed: {err}',
  updateCurrent: '[aio] update check: aio {v} is the latest release.',
  updateAvailable: '[aio] update check: aio {cur} is behind latest {latest} - run `aio update`.',
  updateUpdating: '[aio] Updating {pkg} from npm ...',
  updateFailed: '[aio] update failed: {err}',
  updateFailedCode: '[aio] update failed: npm install exited with code {code}',
  updateFreshMissing: '[aio] update: fresh install not found under npm root -g — run `aio` manually.',
  updateOldCopy: '[aio] note: you invoked the old copy (npx cache?) — use the global `aio` from now on.',
  updateRerun: '[aio] Package updated — re-running setup with the new version ...',

  /* ---- doctor ---- */
  doctorHeader: 'aio doctor — v{v} {mode}',
  doctorModeCheck: '(check mode)',
  doctorModeFix: '(fix mode)',
  doctorNodeOk: 'v{v} (supported: >= 22{bun})',
  doctorNodeWarn: 'v{v} — runs, but unsupported; install Node >= 22 (load floor: >= 20.10)',
  doctorNodeBad: 'v{v} — Node >= 22 required (load floor: Node >= 20.10)',
  doctorStateOk: 'config.json ok (no local catalog)',
  doctorStateWarn: 'no persisted state — run `aio` once',
  doctorLiveOffline: 'AIO_OFFLINE=1 — live search intentionally disabled',
  doctorLiveOk: 'github reachable — ask searches GitHub + npm + crates (no search storage)',
  doctorLiveRate: 'rate-limited (HTTP {status}) — gh auth login / GH_TOKEN — aio ask will still try npm/crates',
  doctorLiveDown: 'github unreachable ({msg}) — aio ask will still try npm/crates',
  doctorLayoutLive: 'live architecture (no search storage)',
  doctorLayoutLegacy: 'LEGACY layout',
  doctorManifestLine: '{layout} · {age}d old — {path}',
  doctorManifestFix: '{detail} — fix: aio --fix',
  doctorManifestStale: '{detail} — stale (>7d) — refresh: aio',
  doctorManifestUnreadable: 'manifest unreadable or vanished mid-check — fix: aio --fix',
  doctorManifestMissing: 'aio-context.md missing — fix: aio --fix',
  doctorBlocksMissing: '{inj}/{inst} injected — missing: {list} — fix: aio --fix',
  doctorBlocksOk: '{inj}/{inst} installed agents carry the auto-context block',
  doctorAgentsNone: 'none detected',
  doctorGhOk: 'logged in — skills lane enabled (gh api search/code)',
  doctorGhOff: 'AIO_NO_GH=1 — skills lane disabled by choice',
  doctorGhNoAuth: 'not logged in — skills lane will report an error on use (run `gh auth login`)',
  doctorLedgerMissing: 'ledger missing — re-run `aio` to re-record MCP entries for rollback',
  doctorLedgerGone: '{key}: entry gone from {file}',
  doctorLedgerNoFile: '{key}: {file} missing',
  doctorLedgerUnreadable: '{key}: {file} unreadable — fix before `aio rollback`',
  doctorLedgerParse: '{file}: parse error — fix before `aio rollback`',
  doctorLedgerOk: '{n} aio-added MCP entry file(s) present & valid',
  doctorLedgerEmpty: '0 entries on record — nothing aio-added',
  doctorFixIgnored: '--fix ignored under --check (read-only mode)',
  doctorFixDone: 'fix: setup re-run complete — re-check:',
  doctorAfterFix: 'after fix: {i} issue(s), {w} warning(s)',
  doctorFixFailed: 'fix failed: {err}',
  doctorSummary: '{i} issue(s), {w} warning(s)',
  doctorHint: '\n→ run `aio doctor --fix` (regenerate manifest + agent blocks) or `aio --yes` directly.',

  /* ---- status ---- */
  statusCfgOk: '(config.json ok)',
  statusCfgNone: '(no config.json yet)',
  statusManifestMissing: 'manifest   MISSING — run `aio` to generate it',
  statusManifestLine: 'manifest   {mp} — {age}d old, {layout}',
  statusLayoutLegacy: 'legacy layout — refresh: aio',
  statusIssNoManifest: 'manifest missing',
  statusIssLegacy: 'manifest still has the legacy catalog layout — run `aio` to refresh',
  statusIssStale: 'manifest is {age} days old — run `aio` to refresh',
  statusIssFileMissing: '{label}: instruction file missing — run `aio` to re-inject',
  statusIssNoBlock: '{label}: file exists but has no aio block — run `aio`',
  statusIssEdited: '{label}: block edited by hand — run `aio` to refresh (the edit is kept in backups/)',
  statusAgentsHead: 'agents',
  statusStaleWord: 'stale',
  statusStaleNote: '— edited outside aio; run `aio` to refresh (backups kept)',
  statusHealthy: 'healthy — no issues found.',
  statusHint: '  → run `aio` to (re)generate and (re)wire.',

  /* ---- state / consent / rollback / setup ---- */
  configUnreadable: '[aio] warning: {file} is unreadable — preserved as {kept}, continuing with empty state',
  tuneLedgerCorrupt: '[aio] warning: {file} is unreadable — preserved as {kept}, falling back to default rank weights',
  nodeVersionWarn: '[aio] warning: Node {version} detected — Node >= 22 recommended',
  consentNonInteractive: '[aio] non-interactive session — plan shown above, nothing written. Re-run with --yes to apply.',
  consentCancelled: '[aio] cancelled — no files written. Re-run with --yes to apply without prompting.',
  rollbackIncomplete: '[aio] rollback incomplete — some rows were kept behind (see above); exit 1.',
};

const ID = {
  /* ---- usage ---- */
  usageAsk: 'cara pakai: aio ask "<apa yang kamu butuhkan>"\ncontoh: aio ask "csv ke chart interaktif"',
  usageAgent: 'cara pakai: aio agent "<tugas kamu>"\ncontoh: aio agent "ubah csv jadi chart interaktif lalu terbitkan"',
  usageSkillSearch: 'cara pakai: aio skill search "<kueri>" [--add]\ncontoh: aio skill search "pdf word convert"',
  usageSkillAdd:
    'cara pakai: aio skill add <owner/repo | url> [--file <path|dir>] [--name <nama>] [--sha256 <hex>]\n' +
    '       aio skill list  ·  aio skill remove <nama>\n' +
    'contoh: aio skill add anthropics/skills --name pdf-tools',
  usageSkillRemove: '[aio] skill: nama belum diisi — cara pakai: aio skill remove <nama>',
  evolveDeprecated: "[aio] 'evolve' sudah usang — gunakan 'aio verify' (alias dihapus setelah 2 rilis)",
  usageCompletion: 'cara pakai: aio completion bash|zsh|fish|pwsh',

  /* ---- offline ---- */
  offlineSearch: '[aio] offline (AIO_OFFLINE=1) — aio sengaja tidak menyimpan katalog lokal; pencarian live butuh jaringan.',
  offlineAgent: '[aio] offline (AIO_OFFLINE=1) — aio sengaja tidak menyimpan katalog lokal; koordinasi live butuh jaringan.',
  offlineSkillSearch: '[aio] offline (AIO_OFFLINE=1) — skill search sengaja berjalan live.',

  /* ---- bin dispatch ---- */
  cmdRequires: '[aio] {a} butuh {hint}',
  unknownCommand: '[aio] perintah tidak dikenal: {cmd}',
  tryHelp: "jalankan 'aio --help' untuk cara pakai",
  copilotOnlyInit: '[aio] --copilot hanya berlaku untuk `aio init` — diabaikan',
  rollbackNoDryRun: '[aio] rollback tidak mendukung --dry-run — menolak dijalankan; periksa dulu dengan `aio doctor`',
  dryRunOnlySetupInit: '[aio] --dry-run hanya berlaku untuk `aio setup` / `aio init` — diabaikan',
  unknownFlag: '[aio] flag tidak dikenal: {tok} — diabaikan',
  cmdFailed: '[aio] {cmd} gagal: {err}',
  skillUnknownSub: '[aio] skill: subperintah tidak dikenal "{action}" — gunakan add | list | remove | search',

  /* ---- agent (text mode; --json payload + route step labels stay EN) ---- */
  agentHeader: 'aio agent — "{query}" (mengoordinasi: {coordinating} · {n} hasil · {sec}s)',
  noLaneAnswered: 'tidak ada lane yang menjawab',
  agentPlan: 'rencana  {lanes} — paralel, dicetak tidak pernah disimpan',
  agentLaneEmpty: '{lane} 0 hit — dijawab kosong',
  agentIssues: 'masalah:',
  agentRouteHead: 'rute (dikoordinasi — termurah dulu)',
  agentRouteNone: 'rute — tidak ada lane yang cocok dengan tugas ini; perhalus kata kunci lalu jalankan ulang.',
  agentLanesHead: 'lane (hit teratas per sumber)',
  agentNote:
    'catatan: setiap lane live dan belum diverifikasi — verifikasi sebelum menjalankan npx/cargo\n' +
    '      atau meng-clone; laporkan APA yang kamu pakai + SETIAP tautan (docs/THREATS.md).',

  /* ---- ask text mode (--json engine/why stay EN) ---- */
  engineLive: 'live: {lanes}',
  engineNoSource: 'live: tidak ada sumber yang menjawab',
  askHeader: 'aio ask — "{query}" ({engine} · {n} hasil · {sec}s{web})',
  askHeaderWeb: ' · web → pencarian web kamu',
  askHeaderZero: 'aio ask — "{query}" ({engine} · {sec}s)',
  liveSourcesFailed: 'Sumber live gagal — perbaiki masalah di atas, lalu coba lagi.',
  askNoResult:
    'Tidak ada hasil dari sumber live. Perhalus kata kunci — atau cari di web dengan tool web-search kamu sendiri',
  askUrlHint: ' (URL terdeteksi di prompt)',
  askNote:
    'catatan: diurutkan dari kecocokan kata kunci + popularitas sumber — hasil publik belum diverifikasi;\n' +
    '      verifikasi sebelum menjalankan npx/uvx atau meng-clone (docs/THREATS.md).',
  askSourceIssues: 'masalah sumber: {srcs} — lihat --json errors[]',
  askNoUrl: '(tanpa URL publik)',
  timeFooter: 'waktu: {detail}', // footer bersama: timing per lane ask/agent/skillSearch
  errRateLimited: 'dibatasi rate — set GH_TOKEN / `gh auth login`, atau coba lagi nanti',
  errTimeout: 'timeout (anggaran 4s/sumber)',
  errUnreachable: 'tidak terjangkau (jaringan)',

  /* ---- skill ---- */
  skillPathNotFound: '[aio] skill: path lokal tidak ditemukan — {p}',
  skillMdNotFound: '[aio] skill: SKILL.md tidak ditemukan — {src}',
  skillInsecureHttp: '[aio] skill: URL http:// tidak aman ditolak — gunakan https://',
  skillFetchFailed: '[aio] skill: gagal mengambil ({err}) — cek jaringan/URL, bukan "tidak ditemukan", untuk {target}.',
  skillMdMissing: '[aio] skill: SKILL.md tidak ditemukan untuk {target} (dicoba {n} lokasi{s}).',
  skillStatus: '[aio] skill {name}: {status} — {file}',
  skillWouldInstall: '[aio] skill {name}: akan dipasang (dry-run) — {file} (sumber: {source})',
  skillShaBadFormat: '[aio] skill: --sha256 harus 64 karakter heksadesimal, dapat: {want}',
  skillShaMismatch: '[aio] skill: sha256 tidak cocok - diharapkan {want}, hasil {got}. Instalasi ditolak.',
  skillInstalled: '[aio] skill {name}: terpasang — {file}\n        sumber: {source} · dicatat untuk `aio rollback`',
  skillInvalidName: '[aio] skill: nama tidak valid',
  skillNotInstalled: '[aio] skill {name}: belum terpasang — {file}',
  skillModified: '[aio] skill {name}: berubah sejak dipasang aio — aio tidak akan menghapus editan kamu; hapus manual: {file}',
  skillNotOurs: '[aio] skill {name}: ada (bukan dipasang aio) — dilewati: {file}',
  skillMdRemoved: '[aio] skill {name}: SKILL.md dihapus — folder disimpan (tidak kosong): {dir}',
  skillRemoved: '[aio] skill {name}: dihapus — {dir}',
  skillSearchNoHit: '[aio] skill search: tidak ada hit yang bisa dipasang untuk "{q}"{lanes}',
  skillSearchHeader: 'aio skill search — "{q}" ({engine} · {n} hit · {sec}s)',
  skillSourceIssues: 'masalah sumber: {detail}',
  skillSearchNoFound: 'Skill tidak ditemukan — perhalus kata kunci.',
  skillSearchNote:
    'catatan: hasil publik belum diverifikasi — baca SKILL.md sebelum mempercayainya (docs/THREATS.md).',
  skillSearchInstalling: 'aio skill search — "{q}" → memasang hit teratas',
  skillInstallRow: 'pasang: aio skill add {name}',

  /* ---- borrow ---- */
  borrowGetFailed: '[aio] borrow --get gagal: {err}',
  borrowSearchFailed: '[aio] borrow search gagal: {err}',
  usageBorrow:
    'cara pakai:\n' +
    '  aio borrow "<kata kunci>"    pencarian live GitHub (link + fungsi per hasil)\n' +
    '  aio borrow --get <owner/repo>  shallow-clone ke temp (TTL 24 jam)\n' +
    '  aio borrow --list | --clean    inspeksi / hapus clone temp',
  borrowCleanHead: 'aio borrow --clean — {n} clone dihapus, {freed} dibebaskan dari {dir}',
  borrowTtlPurgeNamed: 'TTL purge: {n} kedaluwarsa (>24 jam): {names}',
  borrowListHead: 'aio borrow --list — {n} clone temp di {dir}',
  borrowListItem: '- {name} — umur {age} jam — {path}',
  borrowListEmpty: 'aio borrow — belum ada yang dipinjam (dir: {dir})',
  borrowGetHead: 'aio borrow — {target} → {status}',
  borrowPath: 'path: {path}',
  borrowUseNote: 'pakai sekarang; otomatis dibuang setelah 24 jam (atau `aio borrow --clean`).',
  borrowFreeDisk: 'disk bebas: {free}',
  borrowNoResult: 'aio borrow — "{query}": tidak ada hasil GitHub. Perhalus kata kunci atau cek https://github.com/search',
  borrowSearchHeader: 'aio borrow — "{query}" (pencarian live GitHub · {n} hasil)',
  borrowTtlPurge: 'TTL purge: {n} clone kedaluwarsa dihapus',
  borrowPinOne: 'pilih satu: aio borrow --get {name}',

  /* ---- live fallback copies (meta tags / src / type stay EN data) ---- */
  liveRepoNoDesc: '{lang} repositori (tanpa deskripsi)',
  liveRepoLangNone: 'Repositori',
  liveNpmNoDesc: 'paket npm (tanpa deskripsi)',
  liveCrateNoDesc: 'crate Rust (tanpa deskripsi)',
  liveWikiNoDesc: 'artikel Wikipedia',
  liveHnDiscussion: 'Diskusi Hacker News — {pts} poin oleh {author}',

  /* ---- update ---- */
  updateCheckFailed: '[aio] cek update gagal: {err}',
  updateCurrent: '[aio] cek update: aio {v} sudah rilis terbaru.',
  updateAvailable: '[aio] cek update: aio {cur} tertinggal dari {latest} - jalankan `aio update`.',
  updateUpdating: '[aio] Memperbarui {pkg} dari npm ...',
  updateFailed: '[aio] update gagal: {err}',
  updateFailedCode: '[aio] update gagal: npm install keluar dengan kode {code}',
  updateFreshMissing: '[aio] update: instalasi baru tidak ditemukan di npm root -g — jalankan `aio` manual.',
  updateOldCopy: '[aio] catatan: kamu memanggil salinan lama (cache npx?) — pakai `aio` global mulai sekarang.',
  updateRerun: '[aio] Paket diperbarui — menjalankan ulang setup dengan versi baru ...',

  /* ---- doctor ---- */
  doctorHeader: 'aio doctor — v{v} {mode}',
  doctorModeCheck: '(mode cek)',
  doctorModeFix: '(mode perbaikan)',
  doctorNodeOk: 'v{v} (didukung: >= 22{bun})',
  doctorNodeWarn: 'v{v} — jalan, tapi tidak didukung; pasang Node >= 22 (lantai muat: >= 20.10)',
  doctorNodeBad: 'v{v} — Node >= 22 wajib (lantai muat: Node >= 20.10)',
  doctorStateOk: 'config.json ok (tanpa katalog lokal)',
  doctorStateWarn: 'state belum tersimpan — jalankan `aio` sekali',
  doctorLiveOffline: 'AIO_OFFLINE=1 — pencarian live sengaja dinonaktifkan',
  doctorLiveOk: 'github terjangkau — ask mencari di GitHub + npm + crates (tanpa penyimpanan pencarian)',
  doctorLiveRate: 'dibatasi rate (HTTP {status}) — gh auth login / GH_TOKEN — aio ask tetap mencoba npm/crates',
  doctorLiveDown: 'github tidak terjangkau ({msg}) — aio ask tetap mencoba npm/crates',
  doctorLayoutLive: 'arsitektur live (tanpa penyimpanan pencarian)',
  doctorLayoutLegacy: 'tata letak LEGACY',
  doctorManifestLine: '{layout} · umur {age} hari — {path}',
  doctorManifestFix: '{detail} — perbaiki: aio --fix',
  doctorManifestStale: '{detail} — basi (>7 hari) — segarkan: aio',
  doctorManifestUnreadable: 'manifest tidak terbaca atau hilang saat dicek — perbaiki: aio --fix',
  doctorManifestMissing: 'aio-context.md tidak ada — perbaiki: aio --fix',
  doctorBlocksMissing: '{inj}/{inst} terpasang — hilang: {list} — perbaiki: aio --fix',
  doctorBlocksOk: '{inj}/{inst} agen terpasang membawa blok auto-context',
  doctorAgentsNone: 'tidak terdeteksi',
  doctorGhOk: 'masuk — jalur skills aktif (gh api search/code)',
  doctorGhOff: 'AIO_NO_GH=1 — jalur skills dimatikan atas pilihan',
  doctorGhNoAuth: 'belum masuk — jalur skills akan melaporkan error saat dipakai (jalankan `gh auth login`)',
  doctorLedgerMissing: 'ledger hilang — jalankan ulang `aio` untuk mencatat ulang entri MCP agar rollback berfungsi',
  doctorLedgerGone: '{key}: entri hilang dari {file}',
  doctorLedgerNoFile: '{key}: {file} tidak ada',
  doctorLedgerUnreadable: '{key}: {file} tidak terbaca — perbaiki sebelum `aio rollback`',
  doctorLedgerParse: '{file}: galat parse — perbaiki sebelum `aio rollback`',
  doctorLedgerOk: '{n} berkas entri MCP buatan aio ada & valid',
  doctorLedgerEmpty: '0 entri tercatat — tidak ada yang ditambahkan aio',
  doctorFixIgnored: '--fix diabaikan di bawah --check (mode baca-saja)',
  doctorFixDone: 'perbaikan: setup dijalankan ulang — cek ulang:',
  doctorAfterFix: 'setelah perbaikan: {i} masalah, {w} peringatan',
  doctorFixFailed: 'perbaikan gagal: {err}',
  doctorSummary: '{i} masalah, {w} peringatan',
  doctorHint: '\n→ jalankan `aio doctor --fix` (buat ulang manifest + blok agen) atau `aio --yes` langsung.',

  /* ---- status ---- */
  statusCfgOk: '(config.json oke)',
  statusCfgNone: '(config.json belum ada)',
  statusManifestMissing: 'manifest   HILANG — jalankan `aio` untuk membuatnya',
  statusManifestLine: 'manifest   {mp} — umur {age} hari, {layout}',
  statusLayoutLegacy: 'tata letak lama — segarkan: aio',
  statusIssNoManifest: 'manifest tidak ada',
  statusIssLegacy: 'manifest masih memakai tata letak katalog lama — jalankan `aio` untuk segarkan',
  statusIssStale: 'manifest berumur {age} hari — jalankan `aio` untuk segarkan',
  statusIssFileMissing: '{label}: berkas instruksi hilang — jalankan `aio` untuk pasang ulang',
  statusIssNoBlock: '{label}: berkas ada tetapi tanpa blok aio — jalankan `aio`',
  statusIssEdited: '{label}: blok diedit manual — jalankan `aio` untuk segarkan (edit tetap disimpan di backups/)',
  statusAgentsHead: 'agen',
  statusStaleWord: 'basi',
  statusStaleNote: '— diedit di luar aio; jalankan `aio` untuk segarkan (cadangan disimpan)',
  statusHealthy: 'sehat — tidak ada masalah.',
  statusHint: '  → jalankan `aio` untuk membuat & menyambung ulang.',

  /* ---- state / consent / rollback / setup ---- */
  configUnreadable: '[aio] peringatan: {file} tidak terbaca — disimpan sebagai {kept}, lanjut dengan state kosong',
  tuneLedgerCorrupt: '[aio] peringatan: {file} tidak terbaca — disimpan sebagai {kept}, kembali ke bobot ranking default',
  nodeVersionWarn: '[aio] peringatan: Node {version} terdeteksi — Node >= 22 disarankan',
  consentNonInteractive: '[aio] sesi non-interaktif — rencana ditampilkan di atas, tidak ada yang ditulis. Jalankan ulang dengan --yes untuk menerapkan.',
  consentCancelled: '[aio] dibatalkan — tidak ada file yang ditulis. Jalankan ulang dengan --yes tanpa konfirmasi.',
  rollbackIncomplete: '[aio] rollback tidak lengkap — sebagian baris tersisa (lihat di atas); exit 1.',
};

/** Render key with {placeholder} substitution (missing key → EN → key itself). */
export function msg(key, vars = {}) {
  const id = process.env.AIO_LANG === 'id';
  let raw = id ? (ID[key] ?? EN[key] ?? key) : (EN[key] ?? key);
  // {s} is the English plural suffix (location{s}); Indonesian nouns never take
  // it, so drop it in the id locale. Parity still requires both tables to carry
  // the same placeholder set, so the key stays checkable.
  if (id) raw = raw.replaceAll('{s}', '');
  return raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Parity report for tests: keys present in one table only + placeholder drift. */
export function parity() {
  const keys = new Set([...Object.keys(EN), ...Object.keys(ID)]);
  const missingID = [];
  const missingEN = [];
  const placeholderDrift = [];
  const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of [...keys].sort()) {
    if (!(k in ID)) missingID.push(k);
    else if (!(k in EN)) missingEN.push(k);
    else if (ph(EN[k]) !== ph(ID[k])) placeholderDrift.push(k);
  }
  return { total: keys.size, missingID, missingEN, placeholderDrift };
}
