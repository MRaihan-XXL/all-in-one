# AIO — output gallery

Every block below is **verbatim output** from a real run of this checkout —
captured by `scripts/capture-outputs.mjs`, never hand-typed. Regenerate after
any CLI/UX change:

```console
node scripts/capture-outputs.mjs
```

- package: `aio-connect@1.9.1`
- captured: 2026-10-09T09:07:59.851Z
- host: win32 · node v26.3.0

## Help (English, default)

```console
$ node bin/aio.js --help

  AIO — all-in-one
  auto-connect every AI agent to repos, tools, skills & websites — 100% LIVE

  Usage
    aio                          Wire up every detected agent (default: setup).
                                 Shows the plan first — interactive → asks [y/N],
                                 non-TTY → plan only; use --yes to write silent.
    aio preview                  Show the exact block that would be written
                                 (plan-only, nothing is written)
    aio init [--copilot]         Project scope: inject the block into ./AGENTS.md
                                 (official standard — Zed/Copilot/Cursor read it);
                                 --copilot also writes .github/copilot-instructions.md
                                 (official Copilot repo mechanism, pointer only).
                                 Same gate: TTY → plan + y/N, non-TTY → plan; --yes writes
    aio status                   Read-only health report (manifest, agents)
    aio ask "<what you need>"    LIVE search across GitHub (630M+ repos, public
                                 skills), npm (3M+ pkgs) + crates — adaptive
                                 sources, every hit prints link + function,
                                 ranked by keyword + popularity, then discarded
                                 (no search storage — results never saved)
    aio agent "<your task>"      AGENTIC COORDINATOR — runs EVERY lane in parallel
                                 (GitHub repos ∥ skills ∥ npm ∥ crates ∥ WEB:
                                 wikipedia+hacker news ∥ LOCAL TOOLS on your PATH),
                                 then synthesizes an ordered route: what to read,
                                 run, clone or install first. --json →
                                 {schemaVersion:1, plan, route, hits, stored:0}
    aio borrow "<keywords>"      Live GitHub search for what you need cloned
      aio borrow --get <owner/repo>   shallow-clone to temp (24h TTL, then purged);
                                      accepts a full https://github.com/... URL too
      aio borrow --list | --clean     inspect / wipe temp clones
    aio skill add <owner/repo|url> [--file <path|dir>] [--name <n>] [--dry-run]
                                 Install a public SKILL.md into ~/.agents/skills
                                 (shared by 40+ agents; ledgered for rollback)
      aio skill list | remove <name>  inspect / remove installed skills (only
                                 byte-identical aio installs are ever removed)
      aio skill search "<query>" [--add]  live skill search — prints ranked hits
                                 with ready-to-run install commands; --add
                                 installs the top hit directly
    aio completion <shell>       Print shell completion script (bash|zsh|fish|pwsh)
    aio doctor [--check|--fix]   Self-diagnosis; --fix = safe auto-repair,
                                 --check = CI gate (exit 1 on issues)
    aio verify                   Self-upgrade pipeline: setup → doctor → tests
                                 (never commits)
    aio update [--check]         Update from npm, then re-run setup;
                                  --check = report only (exit 1 = update available)
    aio rollback                 Strip injected blocks, recorded MCP entries +
                                  aio-installed skills (byte-identical only)
                                  (surgical; backups kept)


  Quick chooser
    find a repo / package / tool  aio ask "<what you need>"   (search, rank, discard)
    do a multi-step task          aio agent "<your task>"     (all lanes, ordered route)
    want the code locally         aio borrow --get <owner/repo>
    install a reusable skill      aio skill search "<query>" --add
    check this machine            aio status · aio doctor --check
    check for a newer release     aio update --check          (exit 1 = update available)
    upgrade self, run all gates   aio verify                  (setup -> doctor -> tests)

  Options
    --yes                        Apply the setup plan without prompting
                                  (required for non-interactive writes)
    --dry-run                    setup: print exactly what would change,
                                  write nothing (diff-first review)
    --show-block                 With the plan, print the exact block content
                                  (also what aio preview shows)
    --file <path|dir>            skill add: install from a local SKILL.md or dir
    --name <name>                skill add: override the installed skill name
    --json                       Machine-readable output (ask / agent / borrow /
                                 doctor / skill search)
    -h, --help                   This help
    -v, --version                Version

  Environment
    AIO_OFFLINE=1, AIO_NO_GH=1, AIO_STATE_DIR, GH_TOKEN, OLLAMA_HOST,
    AIO_OLLAMA_MODEL, AIO_NO_AI=1, AIO_RATE=<calls/min|0> (GitHub search
    budget; 0 disables spacing), AIO_QUIET=1 / AIO_NO_BANNER=1 (no banner),
    AIO_LANG=id (help text in Bahasa Indonesia), NO_COLOR=1

  Note
    aioc is an alias of the same binary — Adobe's App Builder CLI (@adobe/aio)
    also owns the name aio on PATH; use aioc when both are installed.

  What it does
    1. Scans installed agents (opencode, claude, kimi, jcode, …).
    2. Generates a slim context manifest (aio-context.md): pointer + detected
       agents — rules live in the block; catalog data stays LIVE, never stored.
    3. Injects a marker-delimited auto-use block into each agent's instruction
       file — idempotent, always exactly one copy.
    4. Teaches every agent the prompt flow:
       prompt → aio ask (live) → use ephemerally → report → clean.

  Disclosure (injected rule — first line of replies that used aio-surfaced entries):
    [aio] Using [<name>](<url>) (<type>) — <function>
    <type> = repo | cli | service | skill | site | tool
```

_exit 0_

## Help (Bahasa Indonesia)

```console
$ AIO_LANG=id node bin/aio.js --help

  AIO — all-in-one
  autokoneksikan setiap AI agent ke repositori, tool, skill & situs — 100% LIVE

  Penggunaan
    aio                          Aktifkan semua agent yang terdeteksi (default: setup).
                                 Rencana ditampilkan dulu — interaktif → tanya [y/N],
                                 non-TTY → hanya rencana; pakai --yes untuk menulis sunyi.
    aio preview                  Tampilkan blok persis yang akan ditulis
                                 (hanya rencana, tidak ada yang ditulis)
    aio init [--copilot]         Cakupan proyek: suntik blok ke ./AGENTS.md
                                 (standar resmi — Zed/Copilot/Cursor membacanya);
                                 --copilot juga menulis .github/copilot-instructions.md
                                 (mekanisme resmi repo Copilot, hanya pointer).
                                 Gerbang sama: TTY → rencana + y/N, non-TTY → rencana; --yes menulis
    aio status                   Laporan kesehatan read-only (manifest, agent)
    aio ask "<apa yang kamu butuh>"  Pencarian LIVE di GitHub (630M+ repo, skill publik),
                                 npm (3M+ paket) + crates — sumber adaptif, setiap
                                 hasil mencetak link + fungsi, diurutkan kata kunci +
                                 popularitas, lalu dibuang (tanpa penyimpanan pencarian
                                 — hasil tidak pernah disimpan)
    aio agent "<tugas kamu>"     KOORDINATOR AGENTIK — jalankan SEMUA lane paralel
                                 (GitHub repos ∥ skills ∥ npm ∥ crates ∥ WEB:
                                 wikipedia+hacker news ∥ TOOL LOKAL di PATH kamu),
                                 lalu sintesis rute berurutan: baca, jalankan,
                                 clone atau install apa duluan. --json →
                                 {schemaVersion:1, plan, route, hits, stored:0}
    aio borrow "<kata kunci>"    Pencarian LIVE GitHub untuk yang ingin kamu clone
      aio borrow --get <owner/repo>   shallow-clone ke temp (TTL 24 jam, lalu dibuang);
                                      URL lengkap https://github.com/... juga diterima
      aio borrow --list | --clean     inspeksi / hapus clone temp
    aio skill add <owner/repo|url> [--file <path|dir>] [--name <n>] [--dry-run]
                                 Install SKILL.md publik ke ~/.agents/skills
                                 (dipakai 40+ agent; dicatat untuk rollback)
      aio skill list | remove <name>  inspeksi / hapus skill terpasang (hanya
                                 instalasi aio yang byte-identikal yang dihapus)
      aio skill search "<query>" [--add]  pencarian skill LIVE — mencetak hasil
                                 berperingkat dengan perintah install siap pakai;
                                 --add langsung install hasil teratas
    aio completion <shell>       Cetak skrip completion shell (bash|zsh|fish|pwsh)
    aio doctor [--check|--fix]   Diagnosis diri; --fix = perbaikan-otomatis aman,
                                 --check = gerbang CI (exit 1 bila ada masalah)
    aio verify                   Pipeline upgrade-diri: setup → doctor → test
                                 (tidak pernah commit)
    aio update [--check]         Update dari npm, lalu jalankan setup ulang;
                                  --check = laporan saja (exit 1 = ada update)
    aio rollback                 Lepas blok yang disuntik, entri MCP tercatat +
                                 skill yang diinstal aio (hanya byte-identikal)
                                 (bedah; backup tetap disimpan)


  Pilih cepat
    cari repo / paket / tool      aio ask "<apa yang kamu butuh>"   (cari, ranking, buang)
    tugas multi-langkah           aio agent "<tugas kamu>"          (semua lane, rute berurutan)
    butuh kodenya lokal           aio borrow --get <owner/repo>
    pasang skill reusable         aio skill search "<query>" --add
    cek mesin ini                 aio status · aio doctor --check
    cek rilis lebih baru          aio update --check                (exit 1 = ada update)
    upgrade diri + semua gerbang  aio verify                        (setup -> doctor -> test)

  Opsi
    --yes                        Terapkan rencana setup tanpa prompt
                                  (wajib untuk penulisan non-interaktif)
    --dry-run                    setup: cetak persis apa yang akan berubah,
                                  tidak menulis apa pun (tinjau diff dulu)
    --show-block                 Sama dengan rencana, cetak isi blok persis
                                  (juga yang ditampilkan aio preview)
    --file <path|dir>            skill add: instal dari SKILL.md/direktori lokal
    --name <name>                skill add: timpa nama skill yang terpasang
    --json                       Output mesin-baca (ask / agent / borrow /
                                  doctor / skill search)
    -h, --help                   Bantuan ini
    -v, --version                Versi

  Lingkungan
    AIO_OFFLINE=1, AIO_NO_GH=1, AIO_STATE_DIR, GH_TOKEN, OLLAMA_HOST,
    AIO_OLLAMA_MODEL, AIO_NO_AI=1, AIO_RATE=<panggilan/menit|0> (anggaran
    pencarian GitHub; 0 menonaktifkan jeda), AIO_QUIET=1 / AIO_NO_BANNER=1
    (tanpa banner), AIO_LANG=id (teks bantuan Bahasa Indonesia), NO_COLOR=1

  Catatan
    aioc adalah alias dari binari yang sama — Adobe's App Builder CLI (@adobe/aio)
    juga memakai nama aio di PATH; pakai aioc bila keduanya terinstal.

  Cara kerja
    1. Memindai agent terpasang (opencode, claude, kimi, jcode, …).
    2. Membuat manifest konteks slim (aio-context.md): pointer + agent terdeteksi
       — aturan hidup di blok; data katalog tetap LIVE, tidak pernah disimpan.
    3. Menyuntik blok auto-use berbatas-marker ke file instruksi tiap agent —
       idempoten, selalu tepat satu salinan.
    4. Mengajarkan setiap agent alur prompt:
       prompt → aio ask (live) → pakai sementara → laporkan → bersihkan.

  Disclosure (aturan disuntik — baris pertama balasan yang memakai entri dari aio):
    [aio] Using [<name>](<url>) (<type>) — <function>
    <type> = repo | cli | service | skill | site | tool
```

_exit 0_

## Version

```console
$ node bin/aio.js -v
aio 1.9.1 — all-in-one (https://github.com/MRaihan-XXL/all-in-one)
```

_exit 0_

## Status (read-only health report)

```console
$ node bin/aio.js status
  state      C:\Users\WORKPLUS\.aio (config.json ok)
  manifest   C:\Users\WORKPLUS\.aio\aio-context.md — 2d old, live architecture (no search storage)
  agents
    opencode   injected     C:\Users\WORKPLUS\.config\opencode\AGENTS.md
    claude     injected     C:\Users\WORKPLUS\.claude\CLAUDE.md
    kimi       injected     C:\Users\WORKPLUS\.kimi-code\AGENTS.md
    jcode      injected     C:\Users\WORKPLUS\.jcode\AGENTS.md
    codex      injected     C:\Users\WORKPLUS\.codex\AGENTS.md
    gemini     injected     C:\Users\WORKPLUS\.gemini\GEMINI.md
    zed        n/a          C:\Users\WORKPLUS\AppData\Roaming\Zed\AGENTS.md
    global     injected     C:\Users\WORKPLUS\AGENTS.md

  healthy — no issues found.
```

_exit 0_

## Doctor (9 checks, CI gate)

```console
$ node bin/aio.js doctor --check
aio doctor — v1.9.1 (check mode)
[ok] node           v26.3.0 (supported: >= 22)
[ok] state          config.json ok (no local catalog)
[ok] live           github reachable — ask searches GitHub + npm + crates (no search storage)
[ok] manifest       live architecture (no search storage) · 2.9d old — C:\Users\WORKPLUS\.aio\aio-context.md
[ok] agent blocks   7/7 installed agents carry the auto-context block
[ok] agents         opencode, claude, kimi, jcode, freebuff, hermes, codex, gemini
[ok] gh auth        logged in — skills lane enabled (gh api search/code)
[ok] ollama         reachable — models: qwen3:1.7b, qwen3:4b
[ok] mcp ledger     2 aio-added MCP entry file(s) present & valid
0 issue(s), 0 warning(s)
```

_exit 0_

## Skill list (installed skills)

```console
$ node bin/aio.js skill list
aio skill list
────────────────────────────────────────────────────────────────────────────
  [ ] animate                        yours — C:\Users\WORKPLUS\.agents\skills\animate\SKILL.md
  [ ] animate-expo                   yours — C:\Users\WORKPLUS\.agents\skills\animate-expo\SKILL.md
  [ ] animation-vocabulary           yours — C:\Users\WORKPLUS\.agents\skills\animation-vocabulary\SKILL.md
  [ ] apple-design                   yours — C:\Users\WORKPLUS\.agents\skills\apple-design\SKILL.md
  [ ] ask-sonner                     yours — C:\Users\WORKPLUS\.agents\skills\ask-sonner\SKILL.md
  [ ] banner-design                  yours — C:\Users\WORKPLUS\.agents\skills\banner-design\SKILL.md
  [ ] brand                          yours — C:\Users\WORKPLUS\.agents\skills\brand\SKILL.md
  [ ] brandkit                       yours — C:\Users\WORKPLUS\.agents\skills\brandkit\SKILL.md
  [ ] codebase-memory                yours — C:\Users\WORKPLUS\.agents\skills\codebase-memory\SKILL.md
  [ ] context7-mcp                   yours — C:\Users\WORKPLUS\.agents\skills\context7-mcp\SKILL.md
  [ ] deploy-to-vercel               yours — C:\Users\WORKPLUS\.agents\skills\deploy-to-vercel\SKILL.md
  [ ] design                         yours — C:\Users\WORKPLUS\.agents\skills\design\SKILL.md
  [ ] design-system                  yours — C:\Users\WORKPLUS\.agents\skills\design-system\SKILL.md
  [ ] design-taste-frontend          yours — C:\Users\WORKPLUS\.agents\skills\design-taste-frontend\SKILL.md
  [ ] design-taste-frontend-v1       yours — C:\Users\WORKPLUS\.agents\skills\design-taste-frontend-v1\SKILL.md
  [ ] emil-design-eng                yours — C:\Users\WORKPLUS\.agents\skills\emil-design-eng\SKILL.md
  [ ] find-animation-opportunities   yours — C:\Users\WORKPLUS\.agents\skills\find-animation-opportunities\SKILL.md
  [ ] find-docs                      yours — C:\Users\WORKPLUS\.agents\skills\find-docs\SKILL.md
  [ ] frontend-design                yours — C:\Users\WORKPLUS\.agents\skills\frontend-design\SKILL.md
  [ ] full-output-enforcement        yours — C:\Users\WORKPLUS\.agents\skills\full-output-enforcement\SKILL.md
  [ ] gpt-taste                      yours — C:\Users\WORKPLUS\.agents\skills\gpt-taste\SKILL.md
  [ ] high-end-visual-design         yours — C:\Users\WORKPLUS\.agents\skills\high-end-visual-design\SKILL.md
  [ ] image-to-code                  yours — C:\Users\WORKPLUS\.agents\skills\image-to-code\SKILL.md
  [ ] imagegen-frontend-mobile       yours — C:\Users\WORKPLUS\.agents\skills\imagegen-frontend-mobile\SKILL.md
  [ ] imagegen-frontend-web          yours — C:\Users\WORKPLUS\.agents\skills\imagegen-frontend-web\SKILL.md
  [ ] impeccable                     yours — C:\Users\WORKPLUS\.agents\skills\impeccable\SKILL.md
  [ ] improve-animations             yours — C:\Users\WORKPLUS\.agents\skills\improve-animations\SKILL.md
  [ ] industrial-brutalist-ui        yours — C:\Users\WORKPLUS\.agents\skills\industrial-brutalist-ui\SKILL.md
  [ ] minimalist-ui                  yours — C:\Users\WORKPLUS\.agents\skills\minimalist-ui\SKILL.md
  [ ] pick-ui-library                yours — C:\Users\WORKPLUS\.agents\skills\pick-ui-library\SKILL.md
  [ ] prototype                      yours — C:\Users\WORKPLUS\.agents\skills\prototype\SKILL.md
  [ ] redesign-existing-projects     yours — C:\Users\WORKPLUS\.agents\skills\redesign-existing-projects\SKILL.md
  [ ] review-animations              yours — C:\Users\WORKPLUS\.agents\skills\review-animations\SKILL.md
  [ ] slides                         yours — C:\Users\WORKPLUS\.agents\skills\slides\SKILL.md
  [ ] stitch-design-taste            yours — C:\Users\WORKPLUS\.agents\skills\stitch-design-taste\SKILL.md
  [ ] ui-styling                     yours — C:\Users\WORKPLUS\.agents\skills\ui-styling\SKILL.md
  [ ] ui-ux-pro-max                  yours — C:\Users\WORKPLUS\.agents\skills\ui-ux-pro-max\SKILL.md
  [ ] vercel-cli-with-tokens         yours — C:\Users\WORKPLUS\.agents\skills\vercel-cli-with-tokens\SKILL.md
  [ ] vercel-composition-patterns    yours — C:\Users\WORKPLUS\.agents\skills\vercel-composition-patterns\SKILL.md
  [ ] vercel-optimize                yours — C:\Users\WORKPLUS\.agents\skills\vercel-optimize\SKILL.md
  [ ] vercel-react-best-practices    yours — C:\Users\WORKPLUS\.agents\skills\vercel-react-best-practices\SKILL.md
  [ ] vercel-react-native-skills     yours — C:\Users\WORKPLUS\.agents\skills\vercel-react-native-skills\SKILL.md
  [ ] vercel-react-view-transitions  yours — C:\Users\WORKPLUS\.agents\skills\vercel-react-view-transitions\SKILL.md
  [ ] web-design-guidelines          yours — C:\Users\WORKPLUS\.agents\skills\web-design-guidelines\SKILL.md
  [ ] write-swift                    yours — C:\Users\WORKPLUS\.agents\skills\write-swift\SKILL.md
  [ ] writing-guidelines             yours — C:\Users\WORKPLUS\.agents\skills\writing-guidelines\SKILL.md
root: C:\Users\WORKPLUS\.agents\skills
```

_exit 0_

## Setup (dry-run plan, nothing written)

```console
$ node bin/aio.js --dry-run

 ▄████▄  ████  ▄████▄ 
██    ██  ██  ██    ██
██    ██  ██  ██    ██
████████  ██  ██    ██
██    ██  ██  ██    ██
██    ██ ████  ▀████▀ 
  ▌ all-in-one v1.9.1 — auto-connect every AI agent to live search
  ▌ live: github · npm · crates · web · tools · skills
  ▌ prompt → aio ask / aio agent → use → report → clean
──────────────────────────────────────────────────────────────────────────
  GPL-3.0 · https://github.com/MRaihan-XXL/all-in-one


aio setup v1.9.1 — DRY RUN (nothing written)
────────────────────────────────────────────────────────────────────────────

Agents
  [x] opencode                   detected  → .config/opencode/AGENTS.md
  [x] claude                     detected  → .claude/CLAUDE.md
  [x] kimi                       detected  → .kimi-code/AGENTS.md
  [x] jcode                      detected  → .jcode/AGENTS.md
  [x] freebuff                   detected  → ~/AGENTS.md (fallback)
  [x] hermes                     detected  → ~/AGENTS.md
  [x] codex                      detected  → .codex/AGENTS.md
  [x] gemini                     detected  → .gemini/GEMINI.md

Context block (auto-use rules + usage disclosure)
  [x] opencode                   would update (dry-run) — C:\Users\WORKPLUS\.config\opencode\AGENTS.md
  [x] claude                     would update (dry-run) — C:\Users\WORKPLUS\.claude\CLAUDE.md
  [x] kimi                       would update (dry-run) — C:\Users\WORKPLUS\.kimi-code\AGENTS.md
  [x] jcode                      would update (dry-run) — C:\Users\WORKPLUS\.jcode\AGENTS.md
  [x] codex                      would update (dry-run) — C:\Users\WORKPLUS\.codex\AGENTS.md
  [x] gemini                     would update (dry-run) — C:\Users\WORKPLUS\.gemini\GEMINI.md
  [ ] zed                        skipped (no config dir yet) — C:\Users\WORKPLUS\AppData\Roaming\Zed\AGENTS.md
  [x] global                     would update (dry-run) — C:\Users\WORKPLUS\AGENTS.md

MCP (codebase-memory-mcp)
  [x] opencode.jsonc             present
  [x] .claude.json               present
  [x] mcp.json                   present
  [x] mcp.json                   present
  [x] settings.json              present
  [x] config.toml                present

Manifest (slim — no local catalog, search stays live)
  [ ] aio-context.md             would write — C:\Users\WORKPLUS\.aio\aio-context.md

Backups: none created (dry-run)
Dry run complete — no files were written. Re-run with --yes (or confirm the prompt) to apply.
```

_exit 0_

## Ask (live search, ranked, discarded)

```console
$ node bin/aio.js ask "sqlite to parquet converter"
aio ask — "sqlite to parquet converter" (live: github+npm · 2 results · 4.4s)

note: ranked by keyword match + source popularity — public results are unvetted;
      verify before running npx/uvx or cloning (docs/THREATS.md).
1. kindly/flatterer [repo] <github> — Opinionated JSON to CSV/XLSX/SQLITE/PARQUET converter. Flattens JSON fast.
   ★206 · Python
   https://github.com/kindly/flatterer
   why: BM25 keyword match (#1) + trust mid
2. i64/sqlite3-dump [repo] <github> — "fast" sqlite to parquet and csv converter
   ★32 · Rust
   https://github.com/i64/sqlite3-dump
   why: BM25 keyword match (#2) + trust low
```

_exit 0_

## Ask (gallery query — the demo card query, verbatim)

```console
$ node bin/aio.js ask "awesome animated chart library"
aio ask — "awesome animated chart library" (live: github+npm · 7 results · 4.6s)

note: ranked by keyword match + source popularity — public results are unvetted;
      verify before running npx/uvx or cloning (docs/THREATS.md).
1. lightweight-charts [tool] <npm> — Performant financial charts built with HTML5 canvas
   v5.2.1 · financial-charting-library · charting-library · html5-charts
   https://www.npmjs.com/package/lightweight-charts
   why: BM25 keyword match (#1) + trust high
2. vizzuhq/vizzu-lib [repo] <github> — Library for animated data visualizations and data stories.
   ★2039 · JavaScript
   https://github.com/vizzuhq/vizzu-lib
   why: BM25 keyword match (#2) + trust high
3. bmarrdev/android-DecoView-charting [repo] <github> — DecoView: Android arc based animated charting library
   ★984 · Java
   https://github.com/bmarrdev/android-DecoView-charting
   why: BM25 keyword match (#3) + trust mid
4. react-native-gifted-charts [tool] <npm> — The most complete library for Bar, Line, Area, Pie, Donut, Stacked Bar, Population Pyramid, Radar, Bubble, Scatter and …
   v1.4.81 · chart · charts · graph
   https://www.npmjs.com/package/react-native-gifted-charts
   why: BM25 keyword match (#4) + trust high
5. dexplo/bar_chart_race [repo] <github> — Create animated bar chart races in Python with matplotlib
   ★1453 · Python
   https://github.com/dexplo/bar_chart_race
   why: BM25 keyword match (#6) + trust mid
6. rendro/easy-pie-chart [repo] <github> — easy pie chart is a lightweight plugin to draw simple, animated pie charts for single values
   ★2060 · TypeScript
   https://github.com/rendro/easy-pie-chart
   why: BM25 keyword match (#7) + trust high
7. xyfeng/XYPieChart [repo] <github> — A simple and animated Pie Chart for your iOS app.
   ★1711 · Objective-C
   https://github.com/xyfeng/XYPieChart
   why: BM25 keyword match (#8) + trust mid
```

_exit 0_

## Borrow cleanup (reversible, TTL temp dir)

```console
$ node bin/aio.js borrow --clean
aio borrow --clean — 0 clone(s) removed, 1 KB freed from C:\Users\WORKPLUS\AppData\Local\Temp\aio-borrow
```

_exit 0_

## Release scorecard (15 aspects)

```console
$ node scripts/verify-scorecard.mjs
[aio] scorecard — 15 aspects × machine checks (v1.9.1)

  integrity    10/10  (4/4) ok
  tests        10/10  (5/5) ok
  robustness   10/10  (5/5) ok
  security     10/10  (4/4) ok
  honesty      10/10  (6/6) ok
  cli-ux       10/10  (5/5) ok
  doctor       10/10  (1/1) ok
  pack         10/10  (3/3) ok
  docs-sync    10/10  (13/13) ok
  release      10/10  (5/5) ok
  quality      10/10  (3/3) ok
  coverage-floor 10/10  (3/3) ok
  i18n         10/10  (4/4) ok
  ci-gates     10/10  (5/5) ok
  freshness    10/10  (11/11) ok

SUMMARY  100/100 — 15/15 aspects >= 10/10
```

_exit 0_

---

Also live: [`docs/SCORECARD.md`](docs/SCORECARD.md) (15-aspect machine checks) ·
[`docs/stats.json`](docs/stats.json) (tests/coverage snapshot) ·
[`docs/THREATS.md`](docs/THREATS.md) (threat model).
