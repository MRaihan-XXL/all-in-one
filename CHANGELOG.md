# Changelog

All notable changes to `aio-connect` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
2. Commit, then tag the same value: `git tag v1.5.0`.
3. Push the tag — `release.yml` runs `npm test`, refuses a tag that does not
   equal `package.json` version, publishes to npm (`secrets.NPM_TOKEN`) and
   creates the GitHub Release.
