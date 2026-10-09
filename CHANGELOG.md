# Changelog

All notable changes to `aio-connect` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.1] - 2026-10-08

### Added

- **Index proof motion** — the homepage proof section counts up to its values
  and ships a `<noscript>` snapshot, so a no-JS reader sees the same numbers.
- **Two-phase `OUTPUTS.md` capture** — `scripts/capture-outputs.mjs` now also
  records the `setup --dry-run`, gallery `ask` query and `borrow --clean`
  blocks; CLI blocks are written first, the scorecard appended after it passes.
- **README numbers machine-patched** — `scripts/eval-relevance.mjs --write`
  and `scripts/stats.mjs --write` patch the eval badge/gallery line and the
  pack line (measure → patch → converge), so hand-typed figures cannot drift.
- **Release notes from the changelog** — the release workflow publishes this
  section as the GitHub release body (`generate-notes` as the fallback).
- **Kinetic animation overhaul** — the whole asset family (hero, flow, demo,
  disclosure, stats) gains beat/flick/heartbeat keyframes, the landing h1 rises
  word by word (70 ms stagger), plus a marquee ticker, spring hover states and
  a reveal stagger — all behind `prefers-reduced-motion`.
- **Screenshot capture hardened** — `scripts/screenshots.ps1` gives every shot
  a unique headless Edge profile, wipes the profile before each capture, and
  retries the SMIL typewriter shot with a size guard (a clip stuck at width 0
  ships as ~10 KB instead of ~11.6 KB → retried, then failed loudly).
- **Site `#outputs` section** — the landing page's `#outputs` gallery fetches
  `OUTPUTS.md` live into a `<pre>`, with an explicit "read it on GitHub"
  fallback when the origin does not serve the file.
- **Inline disclosure SVG** — the landing page inlines the disclosure card
  instead of loading it through `<img>`: the SMIL typewriter freezes when the
  SVG is served via `<img>` under headless capture, so the reveal only runs
  inline.
- **+17 tests (290 → 307)** — 5 new files: `rate-lock.test.js` (RATE_LOCK `wx`
  exclusivity), `npm-registry.test.js` (registry cross-check + normalization),
  `i18n-cli.test.js` (`AIO_LANG=id` uncovered surfaces), `env-guards.test.js`
  (env-guard/banner behavior) and `coverage-gates.test.js` (coverage-gate
  contract) → **307 tests** (306 pass, 1 skip, 0 fail).

### Changed

- **Verbatim demo capture** — the demo card is a byte-verbatim capture of
  real runs (real header/timings, `scichart` as #2, real dry-run and borrow
  lines) — no paraphrased annotations.
- **Disclosure enum gains `tool`** — `src/write.js`, both help texts, README
  and PRD quote `repo | cli | service | skill | site | tool`.
- **Flow diagram single-sourced** — `docs/flow.svg` retired;
  `docs/flow.md` documents `assets/flow.svg` only.
- **Badges + ticker** — hero/demo badges bumped to v1.9.1; the ticker lists
  `verify` instead of the removed `evolve` alias.
- **Scorecard hardening** — the `npm pack` spawn routes through `cmd.exe`
  (retires the deprecated `shell: true` + args array, DEP0190); the freshness
  gate compares dirty-tree-aware touch times, so an uncommitted edit is
  measured by its mtime instead of being masked by `git log`; the token-literal
  scan now covers `scripts/` and `test/` alongside `src/` and `bin/`; a new
  `>= 250 tests` floor is read from `docs/stats.json`; and `docs/SCORECARD.md`
  gains two gates — its title must carry `pkg.version` and it must hold exactly
  one row per check (77).
- **Screenshots re-rendered with the fixes** — flow WEB-row bar overlap, hero
  panel bottom border, demo caret over `--clean`, stats caption overflow and
  the usage `<pre>` wrap.

**Gates:** 307 tests (306 pass · 1 skip · 0 fail) · scorecard 100/100 (15/15) · pack 31 files.

### Fixed

- **Stale marketing art** — v1.9.0 → v1.9.1 SVG/marketing badges and the stale
  `evolve` mentions in hero/index art.
- **Stale README numbers** — the eval badge/gallery line (was 0.984 /
  2026-10-06, now matches `eval-result.json` 0.985 / 2026-10-08) and the pack
  line (was 108,837 bytes / 33 files) are patched by the machine — all now
  verified by 7 new scorecard gates (badge sync, no-evolve, enum parity,
  demo-verbatim vs `OUTPUTS.md`, eval sync, pack sync, screenshot freshness).

## [1.9.0] - 2026-10-08

### Added

- **Evidence gallery** — `OUTPUTS.md` carries verbatim CLI output, regenerated
  with `node scripts/capture-outputs.mjs`; `assets/screenshots/` ships 6 PNG
  captures (regen `scripts/screenshots.ps1`); `index.html` gains a
  "Machine-verified proof" section that auto-loads `docs/stats.json`, and the
  README a static table of the JSON endpoints (`stats.json`,
  `sbom.cdx.json`, `eval-result.json`).
- **Social + motion** — twitter/og cards plus a referrer policy, and
  scroll-reveal animations (IntersectionObserver, honors
  `prefers-reduced-motion`; without JS the content still shows).
- **+11 tests** — 5 write-state units, sha256 unit + E2E, failed-import E2E
  and `statfsSync` determinism → **290 tests** (289 pass, 1 skip, 0 fail).

### Changed

- **`aio doctor` / `aio status` fully i18n** — both commands now render
  through the `msg()` catalog (+45 doctor keys, +18 status keys → **107 keys
  EN/ID**, enforced by the parity test).
- **Docs anti-basi** — SCORECARD/README drop stale snapshot numbers for
  conditions; `scripts/stats.mjs` now also patches the alternate README and
  `index.html`.

### Fixed

- **Write-state hardening** — temp files are unique per pid/timestamp (no
  cross-process race); a corrupt ledger stays readable (ENOENT → sentinel,
  non-array ignored); a scalar JSON entry root errors with
  `root is not an object`; missing hashes read as `null`; `preservedAside`
  keeps context across blocks.
- **Honest failures** — `bin/aio.js` failed dynamic import prints a message
  and exits 1 (not a stack trace); `src/scan.js` rejects symlinks presented
  as directories; `aio doctor` / `aio status` rethrow `EISDIR` (read-race
  guard); `aio update` killed by a signal no longer reports success
  (exit 1).

### Removed

- **`scripts/install-tools.mjs`** — no longer used by setup.
- **`docs/logo.svg`** — orphan asset.

### Security

- **CI workflows** — new `npm-auth-check.yml` (weekly cron);
  `stats.yml` gains a concurrency group and rebases before push; `eval.yml`
  and `og.yml` are rebase-guarded.

**Gates:** 290 tests · cov 98.19/90.61/97.56 · scorecard 100/100 · pack 116.2 kB / 32 files.

## [1.8.0] - 2026-10-06

### Added

- **i18n catalog EN/ID (`src/messages.js`)** — 51 keys behind `msg()` +
  `parity()`; `AIO_LANG=id` now renders full CLI output (help, errors,
  doctor, update, skill, borrow …), not only the help text. English strings
  are byte-identical to the pre-i18n originals, and parity (both tables, no
  placeholder drift) is enforced by `test/messages.test.js` and the scorecard
  `i18n` aspect.
- **`aio update [--check]`** — read-only newest-version comparison against
  `npm view aio-connect version`: exit 0 = up-to-date, 1 = behind, 2 = check
  failed (`updateCurrent` / `updateAvailable` / `updateCheckFailed`).
- **PATH discovery** — `src/scan.js` `listPathCommands()` (PATHEXT-aware) feeds
  the `aio agent` local-tools lane: curated tools are confirmed on the user's
  PATH and print `local · on PATH` with `— on PATH: <full path>`, and a CLI
  aio's list does not know surfaces on an exact query-token match (≥ 3 chars,
  generic words filtered) — no phantom entries.
- **`aio skill add --sha256 <hex>`** — pins the download: the fetched content
  is hashed before install; bad format → `skillShaBadFormat`, mismatch →
  `skillShaMismatch` (exit 1). Works with `--dry-run`.
- **SBOM** — `scripts/sbom.mjs` writes `sbom.cdx.json` (CycloneDX 1.5,
  deterministic — no timestamp), shipped in the tarball (`npm run sbom`).

### Changed

- **`aio evolve` → `aio verify`** — renamed for clarity; `evolve` stays as a
  hidden alias for 2 releases and prints an em-dash deprecation line to
  stderr. Help gains a **Quick chooser** section (ID `Pilih cepat`, 7 rows per
  language) plus the `aio update [--check]` line in both languages.
- **Scorecard: 10 → 15 aspects × 10/10 = 100/100 (15/15)** — added
  `quality`, `coverage-floor`, `i18n`, `ci-gates`, `freshness`; verdict
  normalized; the pack gate is now `file count <= 34`.
- **tests + coverage** — suite **254 → 279** (**278 pass, 1 skip, 0 fail**;
  the skip is the pre-existing symlink-availability skip in
  `test/regression-fixes.test.js`); coverage **97.97 lines / 90.26 branches /
  97.56 functions** against gates 90/80/85.
- **tarball** — pack **108,837 bytes (≈ 106.3 KiB) / 33 files** (unpacked
  317,860), now also shipping `sbom.cdx.json`.
- **eval** — golden set **114 queries**: hit@8 **114/114**, hit@1 **111/114**,
  MRR **0.984**, measured 2026-10-06 (`eval-result.json`; the nightly
  `eval.yml` workflow regenerates and auto-commits the snapshot).
- **brand / assets** — `assets/wordmark-allinone.svg` (geometric monoline
  "AllinOne": steel extrusion, machined grain, vermilion i-dot) added to the
  logo gallery; `flow.svg` animation cleanup (the noisy dashed underline under
  `borrow --clean` is gone; the master 8 s loop stays the single timeline),
  and every asset keeps `prefers-reduced-motion`.

### Fixed

- **`aio evolve` dispatch** — the deprecated alias crashed with
  `cmd is not defined` (ReferenceError) instead of running the pipeline; it
  now dispatches to the same runner as `aio verify`.

### Security

- **CI supply-chain gates (`ci.yml`)** — `npm audit --omit=dev`, a guarded
  `npm audit signatures` (honestly skipped when the lockfile has 0
  dependencies), SBOM freshness (regenerate + `git diff --exit-code
  sbom.cdx.json`), the coverage gates, and the scorecard run.
- **New workflows** — `stats.yml` (weekly cron regenerates the README/stats
  numbers from a real suite run via `scripts/stats.mjs --write` and
  auto-commits with `[skip ci]`) and `og.yml` (windows-latest renders
  `assets/og-cover.png` from `scripts/og.html` with headless Edge).

## [1.7.0] - 2026-10-05

### Added

- **`aio agent "<task>"`** — agentic coordinator: runs EVERY lane in parallel
  (GitHub repos ∥ skills ∥ npm ∥ crates ∥ WEB: Wikipedia `action=opensearch` +
  Hacker News Algolia ∥ LOCAL TOOLS already on PATH), then synthesizes an
  ordered **cheapest-first route** — run now → read first → quick try
  (`npx` / `cargo add`) → `aio borrow --get` (deep dive) → `aio skill add`
  (install the playbook). The synthesis is **rule-based by design** (aio
  never pretends an LLM decided it); coordination results are printed and
  discarded (`stored: 0`, zero search storage).
  `--json` → `{schemaVersion: 1, task, engine: 'agent', plan, sources, errors,
  route, count, stored: 0, hits}`.
- **`aio skill search "<query>" [--add]`** — live skill discovery in one step
  (was: search → copy the name → `skill add`): GitHub skill files
  (`gh` code search, auth-gated) plus a repo fallback, printing ranked hits
  with ready-to-run `aio skill add …` commands; `--add` installs the top hit.
  `--json` supported; same B-01 ok-rule as `ask` — a source answered OR
  nothing failed, so a failed lane is reported, never faked as "0 hits".
- **Web lane (`aio agent` only)** — Wikipedia `action=opensearch` + Hacker News
  `hn.algolia.com/api/v1/search?…&tags=story` (comment objects carry no title
  and are filtered at source), both with a 4 s timeout; a partial failure
  still answers with the surviving hits, both failing surfaces a lane error —
  never a fake "0 hits".
- **Local tools lane (`aio agent` only)** — curated ~38-entry map intersected
  with `PATH` via `detectBinary` (no phantom suggestions), token-boundary
  matching plus a `KEYSTOP` generic-word filter; the fast `aio ask` probe
  budget is unchanged (the lane is consulted only by `aio agent`).
- **Help i18n** — `AIO_LANG=id` prints the full help in Bahasa Indonesia
  (`HELP_ID`, mirroring the English text line-for-line; commands, flags and
  env var names stay English so copy-paste keeps working).
- **`--flag=value` inline form** (the space form still works), **`--add`**
  flag for `skill search`, and `agent` added to the command list +
  shell completion.

### Changed

- **Fix wave (P0/P1/P2)** — atomic ledger writes with corrupt-file
  preservation, skill path-traversal guard, gh token/throttle/redirect
  hardening, borrow re-clone + offline handling, honest rollback/flag/command
  errors, single-source `COMMANDS`/`FLAGS` (details under Fixed).
- **tests + coverage** — suite **209/209 → 254** (**253 pass, 1 skip,
  0 fail**), with new test files for the agent lane, skill search, the fix
  wave and v1.7 dispatch; `npm run test:coverage` now reports **97.15%
  lines / 87.50% branches / 96.83% functions** against the existing gates
  (`--test-coverage-lines=90 --test-coverage-branches=80
  --test-coverage-functions=85`).
- **Slim tarball** — `package.json` `files` = bin, src, docs, README,
  CHANGELOG, LICENSE (`test/` and `assets/` dropped): pack 101,080 bytes
  (≈ 98.7 KiB) packed / 30 files.
- **Brand — dimensional primary marks (v1.7 rebrand)** — `logo-mark`
  (-reversed), `logo-wordmark`, `logo-tile`, `logo-lockup` (-reversed) and
  `logo-favicon` are now dimensional (extruded steel, machined grain, glossy
  vermilion node); **mono variants stay flat for print**;
  `assets/logo-gallery.html` updated to brand kit **v1.2.0** with the
  dual-system rules.
- **Landing / README content** — v1.7.0 badge, ticker
  `LIVE: github ∥ npm ∥ crates ∥ web ∥ tools`, tagline now includes `agent`,
  stats cell = `254 · 253 pass · 1 skip · 0 fail`.
- **numbers** — npm downloads **1,520** last-30-days (measured 2026-10-04).

### Fixed

- **Corrupt-ledger wipes (P0)** — atomic `writeAtomic` at ~18 write sites plus
  a `<name>.corrupt-<ts>` preserve-aside when a write still fails
  (`src/write.js`, skills/mcp/block ledgers): a failed write can no longer
  truncate a ledger it was about to replace.
- **Skill path traversal** — the `SKILL.md` join now enforces both prefix
  checks, and raw-case `github.com` URLs are accepted.
- **GitHub** — `ghToken()` reads `GH_TOKEN` / `GITHUB_TOKEN` env first; the
  gh throttle takes an `wx` lock; responses capped at 1 MB with an
  https-redirect check; device-name blacklist; crates count formatting;
  `GIT_TERMINAL_PROMPT=0` + stderr captured (a credential prompt can no longer
  hang a search).
- **borrow** — 5 s `gh` timeout, partial clones re-cloned, `AIO_OFFLINE=1`
  respected, stray-file cleanup.
- **cli** — rollback exit codes, unknown-command hint, missing-value flag
  errors, help-text updates; `COMMANDS`/`FLAGS` single-sourced from
  `src/completion.js` (no second list to drift); dead exports removed.

### Security

- **npm provenance** — `npm publish --access public --provenance` (OIDC
  attestation; `release.yml` grants `id-token: write`): the published tarball
  now carries an attestation back to its source commit.
- **scoop autoupdate** — the generated `aio-scoop.json` gains `checkver` and
  `autoupdate` (release URL + `SHA256SUMS` regex): `scoop update` resolves the
  new release and pins it against the same checksum file the installers
  verify, instead of a hand-re-downloaded manifest.

## [1.6.0] - 2026-10-05

### Added

- **`aio skill add <owner/repo|url> [--file <path|dir>] [--name <n>]
  [--dry-run]`** — downloads a public `SKILL.md` (raw.githubusercontent `HEAD`,
  3 layout candidates: `SKILL.md`, `<name>/SKILL.md`,
  `.agents/skills/<name>/SKILL.md`) into
  `~/.agents/skills/<name>/SKILL.md`, the agentskills.io shared layout read by
  40+ agents; `--file` installs a local file or directory instead. Idempotent
  (already-installed-by-aio → no-op), and aio only claims skills it wrote —
  sha256 recorded in `~/.aio/skills-ledger.json`. Companion commands
  `aio skill list` and `aio skill remove <name>` (refuses user-owned skills);
  pre-existing user skills are never touched by add, remove or rollback.
- **`aio completion bash|zsh|fish|pwsh`** — prints a shell completion script
  (`src/completion.js`, static command/flag lists: offline-safe, works inside
  the compiled binary).
- **`aio doctor --json`** — machine output
  `{schemaVersion: 1, version, mode, ok, issues, warns, checks: [{level, id,
  detail}]}` over the same 9 checks. `aio ask --json` and `aio borrow --json`
  now also carry `schemaVersion: 1` — a contract: bump only on a breaking
  shape change, additive fields are free.
- **Standalone binaries (no Node required)** — release assets
  `aio-windows-x64.exe`, `aio-linux-x64`, `aio-linux-arm64`, `aio-darwin-x64`,
  `aio-darwin-arm64` plus `SHA256SUMS`, `aio-scoop.json`, `install.ps1` and
  `install.sh`. Both installers are download-then-run and sha256-verify the
  asset against `SHA256SUMS` before it lands — nothing remote is piped into a
  shell. Windows: `iwr …/install.ps1 -OutFile install.ps1` then
  `powershell -ExecutionPolicy Bypass -File install.ps1` (installs to
  `%LOCALAPPDATA%\Programs\aio`, adds the user PATH); Linux/macOS:
  `curl -fsSL -o /tmp/aio-install.sh …/install.sh` then
  `sh /tmp/aio-install.sh` (installs to `~/.local/bin`); scoop:
  `scoop install .\aio-scoop.json`.
- **GitHub search rate budget (P5)** — `aio` spaces GitHub search calls across
  processes via `~/.aio/gh-rate.json` (timestamps only — no queries, no
  results; zero search storage preserved). Defaults 8 calls/min
  unauthenticated, 25/min with a `GH_TOKEN`; `AIO_RATE=<n>` overrides,
  `AIO_RATE=0` disables spacing.

### Changed

- **Disclosure rule 0 (FR6 strengthening)** — the injected block now opens
  with `0. FIRST LINE RULE (non-negotiable …)` repeating the exact
  `[aio] Using [<name>](<url>) (<type>) — <function>` line before rule 1, for
  agents that skim later rules. Honest status: retest against kimi is pending
  — no new compliance claim until measured.
- **Quiet/color env** — `AIO_QUIET=1` (or `AIO_NO_BANNER=1`) suppresses the
  banner; `NO_COLOR=1` disables ANSI colors (the banner already prints
  colorless when piped).
- **Binary caveats documented** — `aio evolve` needs a source/npm install and
  prints an honest error in a standalone binary; `aio update` still goes
  through npm (needs `npm`); `aio doctor`'s node check reports the embedded
  bun runtime for binaries.
- **Uninstall order documented** — `aio rollback` first, then
  `npm rm -g aio-connect` (or delete the binary); removing the tool first
  orphans blocks, MCP and skills ledger entries.
- **tests** — status/doctor hermetic: mocked `homedir` + `AIO_NO_GH`, no
  real-home or `gh` subprocess dependence.
- **tests + coverage gate** — suite **79/79 → 209/209** (+27, then +89, then
  +14 (review regressions + bun-virtual argv): CLI spawn-level tests closing
  the `rollback --dry-run` gap, then the
  skill/consent/borrow/write/search/doctor coverage push);
  `npm run test:coverage` now enforces `--test-coverage-lines=90
  --test-coverage-branches=80 --test-coverage-functions=85` and exits
  non-zero below them (actual: 98.68% lines / 88.80% branches / 98.31%
  functions).
- **Pre-merge review hardening** — POSIX symlink launch fix (realpath argv
  detection — npm/npx on Linux/macOS); both bun `--compile` virtual argv
  markers (`~BUN/root/` windows + `/$bunfs/root/` posix) recognized — POSIX
  smoke caught the gap; npm publish moved **after** binaries +
  signing (publish-once safety); cosign `--bundle SHA256SUMS.bundle`
  (verify-blob now possible → docs/THREATS.md); `install.ps1` null-user-PATH
  crash + `install.sh` PATH-hint interpolation; `aio skill remove`/rollback
  now unlink `SKILL.md` only (user sibling files survive); `http://` refused +
  HTML content-types refused + ledger never stores URL credentials;
  `doctor --json` gains optional `fix:{attempted,ok,error}`; completion words
  gain `setup`/`completion`/`version`; borrow age clamp (no `-0.0h`).
- **Note** — the symlink test skips where creating symlinks needs admin
  rights; CI executes it, so CI runs the full 209/209.

### Fixed

- **cli** — `aio init --copilot` backs up an existing
  `.github/copilot-instructions.md` before replacing it (previous content
  kept in `~/.aio/backups/`); the dry-run line discloses this.
- **cli** — `rollback --dry-run` refuses to run (a destructive command cannot
  honor the flag); unknown flags warn instead of being silently dropped
  (`ask` exempt — its query may look like a flag); `--dry-run` outside
  setup/init warns.
- **write** — rollback ledger write creates the state dir on fresh machines
  (no ENOENT); unsupported config layouts report honestly and keep the ledger
  entry (no false "already gone"); partial TOML removal is never written.
- **status** — installed agent with a missing instruction file is now an
  issue (parity with doctor); truncated block (start marker without end)
  classified as no-block → issue.
- **setup** — parseable-but-wrong-shape config root (e.g.
  `"mcpServers": "string"`) rebuilt instead of throwing TypeError.
- **assets** — all five SVGs: keyTimes spec compliance (first=0, last=1 per
  SMIL 5.10), flow CSS/SMIL phase alignment (+1.4s), shared 8s master
  timeline + 1.06s caret — all post-tag (commit `cdc4886` + follow-up);
  npm 1.5.0 ships pre-sync assets.

### Security

- **Release CI hardening** — `release.yml` now checks out with
  `fetch-depth: 0` and **fails when the pushed tag is not the `origin/main`
  tip** (a stale tag ships yesterday's code — the v1.5.0 incident), builds all
  5 binaries and smoke-tests each one on the OS that can run it (`--version`,
  `preview`, `completion bash`, `skill list`; the cross-built `aio-darwin-x64`
  and `aio-linux-arm64` are not executed — tracked in `ROADMAP.md`), uploads
  `SHA256SUMS` / `aio-scoop.json` / `install.ps1` / `install.sh`, then cosign
  keyless-signs `SHA256SUMS` (`SHA256SUMS.sig`) — signing runs *after* upload
  so a signing outage never blocks the binaries.

## [1.5.0] - 2026-10-01

### Added

- **First-run consent gate (B-02)** — `aio` / `aio init` no longer write on
  first run. Interactive TTY prints the plan, then asks `Proceed with these
  writes? [y/N] `; non-TTY (npx pipes, CI) prints the plan and exits 0 with
  nothing written ("Re-run with --yes to apply."); `--yes` applies silently;
  `--dry-run` / `aio preview` are always plan-only
  (`src/consent.js` `decide()` → `dry` / `write` / `plan-ask` / `plan-stop`).
- **`aio init [--copilot]`** — project scope: injects the block into
  `./AGENTS.md` (official standard read by Zed/Copilot/Cursor); `--copilot`
  additionally writes `.github/copilot-instructions.md` as a pointer only (no
  block markers). Same consent gate as setup; `aio rollback` does not reverse
  `aio init` writes (`src/init.js`).
- **Drift detection (C-02)** — after each inject, `setup` records a SHA-256
  prefix (16 hex chars) per target in `~/.aio/block-hashes.json`; `aio status`
  flags hand-edited blocks as `injected*` with a stale note, and the next
  `aio` run reports
  `updated (hand-edit replaced — kept in backups/)` (`src/write.js`
  `blockEdited()`).
- **Shared target list (B-04)** — `src/targets.js` is now the single source
  for setup, status, rollback and doctor: six agent files (opencode, claude,
  kimi, jcode, codex, gemini) + a Zed target (`%APPDATA%\Zed\AGENTS.md` on
  Windows, `~/.config/zed/AGENTS.md` on POSIX; skipped when the config dir
  does not exist) + the conditional global `~/AGENTS.md`.
- **Doctor now runs exactly 9 checks** — node, state, live sources, manifest,
  agent blocks, agents, gh auth, Ollama, MCP ledger; every row tagged
  `[ok]` / `[~~]` / `[!!]`, network probes run in parallel (B-08, B-09).
- **Release automation** — `.github/workflows/release.yml` (tag `v*` →
  `npm test` → tag must equal `package.json` version → `npm publish` via
  `secrets.NPM_TOKEN` → `gh release create`) and
  `.github/workflows/eval.yml` (daily cron `0 3 * * *` + manual dispatch,
  runs `scripts/eval-relevance.mjs` with `GITHUB_TOKEN`).
- **`assets/og-cover.png`** — 1200×630 social card (source:
  `scripts/og.html`).
- `CHANGELOG.md` (this file) ships in the npm package (`package.json`
  `files`).

### Changed

- **Slim manifest (M-04)** — `~/.aio/aio-context.md` is now a pointer plus the
  detected-agent list; the auto-use rules and usage disclosure live only in
  the injected block, not in the manifest.
- **Consent wording in help** — `aio --help` documents the gate: "Shows the
  plan first — interactive → asks [y/N], non-TTY → plan only; use --yes to
  write silent."
- **CI** — `ci.yml` gained a coverage-report step on ubuntu (informational,
  not a gate); test suite grew to **79/79** (was 52/52; final count includes the
post-review fix-batch tests, e.g. the B1 dry-state regression net).

### Fixed

- **Honest-review remediation (B-01…B-10)** — verified in source: B-01 ask
  `ok` invariant (fails only when every source fails), B-02 consent gate,
  B-03 `aio update` re-runs the freshly installed global binary with `--yes`
  (never a stale npx cache), B-04 shared target list, B-07 setup report tags,
  B-08 `engines.node >= 22`, B-09 doctor always reports 9 checks.
- **B-05** — `index.html`: broken nav `nth-child` CSS rule replaced — nav items
  are styled correctly again.
- **B-06** — `index.html`: `og:image` pointed at a missing file → now
  `assets/og-cover.png`, absolute URL
  `https://mraihan-xxl.github.io/all-in-one/assets/og-cover.png`.
- **B-10** — repos/install-plan vestiges removed from `src/` entirely:
  `scanRepos`, `resolveReposDir`, `DEFAULT_REPOS_DIR`, `--repos`,
  `AIO_REPOS_DIR`.
- POSIX-safe paths via `fileURLToPath` maintained across the new modules.
- **Backup filenames** — two backups written in the same millisecond get a
  de-dup suffix (`_1`, `_2`, …) instead of overwriting each other (CI ubuntu
  race); prune/rollback only count/read names (`src/write.js` `backup()`).

### Removed

- **Repos/install-plan tooling** — `--repos <dir>`, `AIO_REPOS_DIR`,
  `reposDir`, `resolveReposDir()`, `scanRepos()` and the install-plan scan
  are gone from the shipped package; no path-repair (`.aio-fixpaths` /
  `fixPaths`) code ships either. `aio` scans installed agents and the live
  catalog only. (Previously removed in 1.4.1 as dev tooling; now absent from
  `src/` entirely.)

### Security

- Non-interactive runs are read-only by default: no TTY and no `--yes` means
  plan only, exit 0, zero writes.
- Hand-edited blocks are detected before overwrite and the original is kept
  in `~/.aio/backups/` (30-day pruning).
- Publishing requires a matching git tag and tests, with `NPM_TOKEN` held as
  a GitHub Actions secret.

## [1.4.1] - 2026-10-01

POSIX-safe paths (fileURLToPath); evolve = setup → doctor → tests (install-plan scan dropped from the package); status strictly read-only; conditional global AGENTS block; ask error transparency (`errors[]`, `ok:false` when every source fails); diversity identity fix; default n=8; MCP rollback hardening; 30-day backup pruning; versioned UA; eval hit@1 19/20 · MRR 0.97; 52/52 tests; `test/` shipped in the npm package; animation upgrade across all 5 SVG assets.

## [1.4.0] - 2026-09-30

Security pass — `docs/THREATS.md` threat model; trust-weighted ranking (65% relevance + 35% popularity); verify-before-run note; `aio --dry-run`; relevance eval hit@8 20/20; `aioc` alias (Adobe `@adobe/aio` PATH conflict); claim precision (no search storage, instruction-level disclosure); 45/45 tests.

## [1.3.1] - 2026-09-30

Evaluation round — corrected published figures (630M+ Octoverse 2025, crates 340K+, 6.8M+ skill files); flow/hero/disclosure assets re-rendered; 34/34 tests.

## [1.3.0] - 2026-09-30

100% live architecture — `ai-tools.db` / `catalog.js` / `build-db` deleted; `aio ask` = parallel GitHub/npm/crates search (BM25 + source diversity + warm qwen3 rerank); web = the agent's own search; zero search storage (0 bytes); assets v2 redesign; 34/34 tests; doctor live check.

## [1.2.0] - 2026-09-30

`aio ask` (BM25 + local-Ollama rerank, link + function output), `aio borrow` (ephemeral GitHub clones, 24h TTL), `aio doctor`/`aio evolve` (self-diagnosis/self-upgrade), SITES section + disclosure site, db-first catalog, animated README/flow assets, repo renamed `all-in-one`.

Older releases (1.1.x era): see `PRD.md` §11 Revision history.

---

### Release process

1. Bump `package.json` `version` (and the banner/asset chips if shown).
2. Commit, then tag the same value: `git tag v1.7.0`.
3. Push the tag — `release.yml` fails unless the tag **is the `origin/main`
   tip**, runs `npm test`, refuses a tag that does not equal `package.json`
   version, publishes to npm (`secrets.NPM_TOKEN`, `--provenance` via OIDC),
   creates the GitHub
   Release, then builds + smoke-tests the 5 standalone binaries and uploads
   `SHA256SUMS`, `SHA256SUMS.sig` (cosign), `aio-scoop.json`, `install.ps1`
   and `install.sh`.
