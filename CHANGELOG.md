# Changelog

All notable changes to `aio-connect` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
2. Commit, then tag the same value: `git tag v1.6.0`.
3. Push the tag — `release.yml` fails unless the tag **is the `origin/main`
   tip**, runs `npm test`, refuses a tag that does not equal `package.json`
   version, publishes to npm (`secrets.NPM_TOKEN`), creates the GitHub
   Release, then builds + smoke-tests the 5 standalone binaries and uploads
   `SHA256SUMS`, `SHA256SUMS.sig` (cosign), `aio-scoop.json`, `install.ps1`
   and `install.sh`.
