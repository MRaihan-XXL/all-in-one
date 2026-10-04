# PRD — aio (all-in-one)

| | |
|---|---|
| **Product** | `aio` — All-In-One auto-connect layer for AI coding agents |
| **Package** | `aio-connect` (npm registry; GitHub repo `MRaihan-XXL/all-in-one`) |
| **Version** | 1.6.0 (2026-10-05; supersedes 1.5.0) |
| **Status** | Approved for implementation |
| **License** | GPL-3.0 |
| **Docs language** | English (international) |

---

## 1. Background

Developers increasingly run several AI coding agents side by side (opencode,
Claude Code, Kimi Code, jcode, freebuff, Hermes, Codex, Gemini — plus whatever
comes next).
Each agent keeps its own session, its own config, and its own way of loading
context. Locally cloned repositories, installed CLI tools, and agent skills
live in separate places, so every new session starts "cold": the agent does not
know what is on the machine, and the user has to re-explain context or type
slash-commands (`/skill`, `/mcp-tool`, …) to reach the right capability.

`aio` solves this with a single command: it scans the machine, writes one
generated **context manifest** (live-search rules + disclosure + detected
agents), injects a small idempotent **auto-use rule block** into every
supported agent's instruction file, and keeps everything fresh on later runs.
Repos, tools, skills and sites are then resolved **live at prompt time** —
no catalog database. After setup the user opens any agent directly and
prompts in plain language — no slash commands.

## 2. Goals

- **G1** One command (`aio`) wires every installed AI agent to your
  repositories, tools, and skills — permanently (config survives until changed).
- **G2** Zero slash-commands: routing decisions are made by the agent from the
  manifest, from plain-language prompts.
- **G3** Coverage extends to **repositories AND tools** (commands, versions,
  locations, links, descriptions) — resolved live at prompt time, not just
  code folders.
- **G4** Stays correct over time: the live catalog cannot go stale; adding
  repositories only requires re-running `aio` (rescan + block regeneration).
- **G5** Every agent reply that uses a local repo/tool **discloses it**: tool
  name, kind, and function (see FR6).
- **G6** Self-updatable (`aio update`), rollback-able (`aio rollback`), and
  safe to publish (public repo, no local/sensitive data).

## 3. Users

1. **Primary** — the owner: power user running 8 agents on one Windows
   machine; the catalog is **live** (GitHub 630M+ repos · npm · crates —
   zero search storage).
2. **Secondary** — public GitHub users: anyone installing
   `npm install -g aio-connect` on their own machine with
   their own repos/agents (data folder optional).

## 4. Functional requirements

### FR1 — Agent detection & permanent wiring
`aio` detects installed agents by `PATH` binary **or** their configuration
directory (minimum set: `opencode`, `claude`, `kimi`, `jcode`, `freebuff`,
`hermes`, `codex`, `gemini`) and writes the auto-use block into each
agent's canonical instruction file (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md`,
global `~/AGENTS.md` as fallback). Configuration
persists: after one run, every later agent session is already wired.

**Acceptance:** running `aio` reports per-agent status
(detected / instruction file / block / MCP / fallback).

### FR2 — No slash-commands (auto-use)
The injected block tells the agent: route the prompt itself — run
`aio ask "<prompt words>"` for anything that needs a repo/tool/skill (LIVE
GitHub/npm/crates search, zero search storage), use the agent's own built-in web
search for websites/URLs, and never ask the user to type `/…` for routing.

**Acceptance:** block content contains explicit "never ask the user to type
a slash-command" rule **and** the `aio ask` → use → report → clean mandate.

### FR3 — Manifest = slim live-architecture status (no catalog data, no rules)
Generated file `aio-context.md` carries no catalog tables — the catalog is
live, so there is nothing to store. Since v1.5.0 (M-04) it also carries **no
rules**: the auto-use rules and the usage-disclosure rule live only in the
injected block (single source of truth, no token double-cost per session):
- **Header** — live-architecture statement (GitHub 630M+ repos + public
  skills, npm 3M+ packages, crates 340K+; websites → the agent's own web
  search; **no search storage**) + a pointer to the block
  ("rules & mandatory disclosure live in the `AIO AUTO-CONTEXT` block")
  + the prompt
  flow (`aio ask` → ephemeral use → report → `borrow --clean`).
- **AGENTS DETECTED** — per-agent found/not-installed list.

Repositories/tools/sites/skills are no longer enumerated: `aio ask` resolves
them at query time (FR9/FR11).

**Acceptance:** after setup the manifest exists, states "zero search storage", and
`aio doctor`/`aio status` flag a legacy (pre-v1.3) catalog layout as stale
until refreshed.

### FR4 — Update resilience (agent set & block)
- `aio` **rescans** on every run: a newly installed agent is detected and
  wired after a re-run (the catalog itself is live, so it never goes stale).
  There is no repos directory or install plan since v1.5.0 — `--repos`,
  `AIO_REPOS_DIR`, `resolveReposDir` and `scanRepos` were removed from the
  package.
- The injected block is marker-delimited (`aio:auto-config:v1`) and
  **regenerated** from the running package version: updating `aio` and
  re-running replaces block content in place — never duplicated, never stale.
- **Drift detection (C-02)** — each inject records a SHA-256 prefix (16 hex)
  per target in `~/.aio/block-hashes.json`; `aio status` flags hand-edited
  blocks as `injected*` (stale note + issue), and the next `aio` run reports
  `updated (hand-edit replaced — kept in backups/)` — the edit stays in
  `~/.aio/backups/`.

**Acceptance:** run `aio` twice → block appears exactly once; hand-edit an
injected block → `aio status` shows `injected*`; re-run `aio` → replaced and
the edit kept in `backups/`.

### FR5 — Auto-update
`aio update` reinstalls the package from npm (`npm install -g aio-connect` —
npm is the only source since v1.5.0) and then re-runs setup with the
**freshly installed global binary** (`npm root -g` → `bin/aio.js --yes`), so
the new rules/manifest are applied by the new code and never by a stale
npx-cached copy (B-03).

**Acceptance:** `aio update` exits 0 on success, prints new version + setup
report; offline → clear error, exit 1, no partial damage.

### FR6 — Usage disclosure in agent output
The injected block mandates: whenever an agent uses a repository or tool from
the manifest, it must start that step with:

```
[aio] Using [<name>](<url>) (<type>) — <function>
```

where `<function>` is the manifest description (what the tool/repo does) and
`[<name>](<url>)` is a **markdown link** to the entry's URL (the link form was
explicitly chosen over a bottom-of-answer footnote). If an entry has no URL,
the name stays plain. `<type>` is one of `repo | cli | service | skill | site`.
Enforcement is **instruction-level**: the rule is injected into every agent
file; compliance is model-dependent — the per-agent probe table lives in the
README (kimi = model-dependent after 9 attempts).

**Acceptance:** rule present in block with that exact format **and** emitted
by real agents in live sessions (proven on this machine: claude, jcode via
antigravity, and opencode all printed the line unprompted).

### FR7 — Backup & rollback
Every file is backed up to `~/.aio/backups/` before first modification.
`aio rollback` surgically removes the auto-use block and any MCP entry `aio`
added (recorded in a ledger) — user edits outside the block are preserved.

**Acceptance:** `node --test` proves inject-twice idempotency and exact
rollback restore.

### FR8 — Publication without local/sensitive data
Public GitHub repository; `.gitignore` excludes local-only data: tracking/
registry logs, the generated context manifest, and env files. **No database
ships**: v1.3.0 deleted `ai-tools.db`, `src/catalog.js` and
`scripts/build-db.mjs`, and `package.json` `files` carries only
bin/src/assets/docs/README/LICENSE — there is no catalog file to bundle or
version. No machine-specific absolute paths or secrets in committed code —
paths are resolved at runtime (env var / config / discovery), README examples
use placeholders.

**Acceptance:** `git ls-files` contains none of the excluded files; secret
scan (tokens/passwords/usernames) on tracked files passes.

### FR9 — Live search & ephemeral borrow (`ask` / `borrow`)
- `aio ask "<prompt>"` is a **live search router**: GitHub repo search
  (`api.github.com`, 630M+ repos) plus `filename:SKILL.md` code search
  (6.8M+ skill files), npm (`registry.npmjs.org`, 3M+ packages) and
  crates.io (340K+ crates) queried **in parallel** with a 4 s per-source
  timeout; intent routing (rust → crates, skill words → skills, URL → web
  hint) and generic-word stripping for GitHub. Results are merge-ranked with
  **BM25**, a **source diversity** guarantee (≥ 2 rows per answering source),
  a **trust-weighted** final order (65% keyword relevance + 35% source
  popularity prior — FR12), and an optional
  qwen3 Ollama rerank only when warm and fast (≤ 3.5 s; skipped once elapsed
  > 2.5 s). Every hit prints **URL + one-line function + source tag**;
  `--json` emits `{query, engine, sources, count, stored: 0, hits}`.
  **Zero search storage** — nothing searched is ever written to disk. Websites are
  covered by the agent's own web search; `AIO_OFFLINE=1` makes the offline
  gate explicit, `AIO_NO_GH=1` skips the GitHub subprocess (tests).
- `aio borrow` is **optional ephemeral tooling** (not a search fallback):
  `aio borrow "<keywords>"` runs a live GitHub search when you want to clone;
  `aio borrow --get <owner/repo>` shallow-clones into `%TEMP%\aio-borrow` with
  a **24 h TTL** (auto-purged on the next borrow run) and a **1 GB free-disk
  guard**; `--list` inspects temp clones, `--clean` wipes them.

**Acceptance:** `node --test` covers live sources + intent routing (offline/
no-gh gates), BM25 ranking, source diversity, URL + function + source tag per
hit, `--json` (`stored: 0`), and the borrow lifecycle (24 h TTL purge,
`--clean`, `--list`).

### FR10 — Self-diagnosis & self-upgrade (`doctor` / `evolve`)
- `aio doctor [--check|--fix]` runs **exactly 9 read-only checks**, each row
  tagged `[ok]` / `[~~]` / `[!!]` — Node, persisted state, live source
  reachability (no search storage), manifest freshness + live layout, agent
  blocks, agents detected, `gh` auth, Ollama, MCP ledger
  (B-08, B-09; network probes run in parallel) — and exits 1 when any issue
  exists (`--check` = CI gate); `--fix` re-runs the idempotent setup pipeline
  (safe fixes only).
- `aio evolve` runs the full pipeline in one command: setup (manifest +
  blocks) → `doctor --check` → `npm test`, prints a per-step pass/fail report
  with timings, and **never commits or pushes** (git stays with the human).
  No repos-dir or install-plan scan runs anywhere: `scripts/install-tools.mjs`
  is dev-machine tooling, not shipped in the npm package, and `aio setup`
  contains no repository scan (removed entirely in v1.5.0).

**Acceptance:** `node --test` covers doctor checks; `aio evolve` reports every
step green on the owner machine (verified 2026-09-30).

### FR11 — Real-time unlimited search, zero search storage
The catalog is **the network, queried at prompt time** — unlimited (630M+
GitHub repos, 3M+ npm packages, 340K+ crates, 6.8M+ public skill files), always
current, and never persisted: no SQLite file, no `catalog.js`, no build step,
no search history. Answering sources degrade rather than block the answer
(4 s timeout, rate limit → skip; a lane that *fails* — e.g. the skills lane
without `gh` auth — is reported in `errors[]`, never silently faked as "0
hits"), so a partial answer still returns; the only
bytes aio writes are the manifest, the agent blocks, backups, MCP state and
the drift-hash list `block-hashes.json`
(see docs/CONFIG.md).

**Sources for the figures** (all floors, re-verified 2026-09-30 after a user
evaluation found the previous numbers understated): GitHub repositories
**630M+** — GitHub Octoverse 2025; crates.io **340K+** — live API
`meta.total` = 342,787; `filename:SKILL.md` files **6.8M+** — live GitHub
code search `total_count` = 6,832,128; npm packages **3M+** — npm's official
figure (unchanged).

**Acceptance:** `aio ask --json` reports `stored: 0` (asserted in the test
suite) and there is no catalog file to write — `npm test` **209/209** as of
2026-10-05.

### FR12 — Security & trust
- **Threat model** — `docs/THREATS.md` documents assets, trust boundaries,
  the T1–T7 threat table, enforcement honesty and known gaps.
- **Trust-weighted ranking** — final order = 65% BM25 keyword relevance
  (keyword overlap is the gate) + 35% source popularity prior `trust01`
  (GitHub stars log-scale, npm `score.final`, crates downloads log-scale;
  skills neutral 0.5); `why` lines show `+ trust high|mid|low`.
- **Verify-before-run note** — every `aio ask` output ends with
  `note: ranked by keyword match + source popularity — public results are unvetted; verify before running npx/uvx or cloning (docs/THREATS.md).`
- **Consent gate (B-02)** — `aio` / `aio init` print the plan first: TTY →
  `Proceed with these writes? [y/N] ` prompt; non-TTY → plan only, exit 0,
  nothing written ("Re-run with --yes to apply."); `--yes` applies silently;
  `--dry-run` / `aio preview` are always plan-only.
- **`aio --dry-run`** — plan-only setup: prints exactly what would change
  (block inject/update, MCP would-add, manifest would-write) and writes
  nothing at all — no manifest, no block, no MCP entry, no backups, no state
  files (`config.json`, `block-hashes.json`, `mcp-ledger.json` untouched).
  The same holds for `aio preview`, non-TTY plan output and `aio init --dry-run`.
- **Write guards** — consent gate above, backups before every modification,
  hand-edit drift detection (FR4), malformed target configs reported as
  `parse error` and never overwritten, rollback ledger for MCP entries.
- **`gh` token** — read at call time into memory only; never logged or
  persisted.

**Acceptance:** `test/safety.test.js` covers `--dry-run` (no writes);
`test/relevance.test.js` covers trust-weighted ranking; `node scripts/eval-relevance.mjs`
prints hit@8 (**20/20**, 100%) and hit@1 (**19/20**, 95%), MRR **0.97** —
measured 2026-10-01; suite **209/209**.

## 5. Non-functional requirements

- **NFR1** Idempotent: any run may be repeated without duplication.
- **NFR2** Zero runtime dependencies (Node.js standard library only);
  Node ≥ 22 (no SQLite — v1.3.0 removed the local database entirely).
- **NFR3** Fail loudly: non-zero exit codes and explicit messages; never
  silently swallow errors.
- **NFR4** Windows-first, cross-platform-friendly (PATH/PATHEXT detection,
  `os.homedir()`).
- **NFR5** Backups before mutation; rollback available.
- **NFR6** Branding: `aio` prints a logo banner; README shows logo +
  animated flowchart (see §7).

### Decision: why Node.js (not Python/shell)

- **Requirement** — third-party users on a fresh machine must run `aio` with ONE
  command (`npx aio-connect`), zero manual dependency setup — explicit project
  directive: "keep Node.js".
- **Rationale** — Node ≥22 is preinstalled or one-line installable for the
  audience (AI agent CLIs are npm/npx: opencode, claude-code, gemini-cli, kimi).
  Python adds a venv/PATH step on Windows (primary dev platform) and breaks the
  npx one-shot flow; a compiled binary adds cross-platform release burden (YAGNI).
- **Consequences** — `engines.node >=22` in `package.json`; no native deps
  (SQLite was used only for the pre-v1.3 catalog and is gone since 1.3.0);
  tests via built-in `node --test` (zero runtime/test dependencies).
- Reviewed 2026-09-29, status: Accepted.

## 6. Commands (CLI surface)

| Command | Behavior |
|---|---|
| `aio` | Full setup: scan → manifest → inject → MCP ensure → status table. **Consent gate**: plan first — TTY asks `Proceed with these writes? [y/N] `, non-TTY → plan only, exit 0, nothing written; `--yes` writes silent |
| `aio preview` | Plan-only setup (alias of `--dry-run`) that also shows the exact block that would be written |
| `aio init [--copilot]` | Project scope: same gate; injects the block into `./AGENTS.md`; `--copilot` also writes `.github/copilot-instructions.md` (pointer only). Not reversed by `rollback` |
| `aio status` | Read-only health report (state, manifest, agent blocks — hand-edited blocks flagged `injected*`) |
| `aio ask "<prompt>"` | **Live search router**: GitHub (630M+ repos + `filename:SKILL.md` skills, 6.8M+ files) + npm (3M+) + crates (340K+) in parallel, 4 s/source; BM25 merge + source diversity + optional warm-Ollama rerank; every hit prints link + one-line function + `<src>` tag; `--json` (`stored: 0`) |
| `aio borrow "<kw>"` | Optional live GitHub search for what you want cloned; `--get <owner/repo>` shallow-clone to `%TEMP%\aio-borrow` (24 h TTL, 1 GB disk guard); `--list` / `--clean` |
| `aio doctor [--check\|--fix]` | Self-diagnosis: 9 checks (node / state / live sources / manifest / agent blocks / agents / gh auth / Ollama / MCP ledger), rows tagged `[ok]`/`[~~]`/`[!!]`; `--check` = CI gate, `--fix` = safe repair |
| `aio evolve` | Pipeline: setup (manifest + blocks) → `doctor --check` → `npm test`; never commits |
| `aio update` | Reinstall latest from npm → re-run setup automatically |
| `aio rollback` | Remove injected block + reverse MCP additions from ledger |
| `aio --help` | Usage + branding |
| `aio --version` | Print package version |

Options: `--yes` (apply the setup plan without prompting — required for
non-interactive writes), `--dry-run` (plan only, write nothing), `--copilot`
(`aio init`: also write `.github/copilot-instructions.md`), `--json`
(machine-readable output for `ask` / `borrow`). Environment overrides:
`AIO_STATE_DIR` (state dir, default `~/.aio`),
`AIO_OFFLINE=1`, `AIO_NO_GH=1`, `OLLAMA_HOST`, `AIO_OLLAMA_MODEL`,
`AIO_NO_AI`. There is no `--home` flag, no `AIO_HOME` (since v1.3.0) and no
`--repos` / `AIO_REPOS_DIR` (removed in v1.5.0).

## 7. Branding & documentation deliverables

- **Logo system** `assets/` — "three streams, one node" motif: tile, mark,
  wordmark, lockups, monochrome, favicon + presentation page
  `assets/logo-gallery.html`; `docs/logo.svg` mirrors the tile for README.
- **Animated flowchart** — `assets/flow.svg` (six-step prompt flow, embedded by
  the README) plus the original three-hop `docs/flow.svg`; both are
  SMIL-animated diagrams with no runtime dependency, both explained in
  `docs/flow.md`.
- **Animated hero** `assets/aio-hero.svg` — logo animation used at the top of
  the README.
- **UI assets v1.2 redesign** (2026-09-30) — `assets/aio-hero.svg`,
  `assets/flow.svg` and the new `assets/aio-stats.svg` (verified-counts strip:
  231 repos · 23 tools · 45 sites · 67 skills · 30/30 tests · 3/3 OS CI) rebuilt
  as one editorial system: dark `#0B0D10`, single accent `#FF4A1C` from the
  logo, hairline rules, high-contrast type — no rainbow/glow. Animation is
  SMIL/CSS only inside the SVG (no JavaScript, no runtime dependency); the hero
  and stats strips are embedded in `index.html` as well as the README.
- **UI assets v2 — live pipeline** (2026-09-30, v1.3.0, finalised in 1.3.1) —
  same three SVGs re-rendered for the 100% live architecture, each verified via
  headless Edge screenshots: `assets/aio-hero.svg` (version chip now `v1.5.0`,
  "LIVE — NO SEARCH STORAGE" panel, rows github 630M+ / npm 3M+ / crates 340K+ /
  skill files 6.8M+, ticker `$ prompt → aio ask → use → report ↗ → clean`;
  wordmark redrawn as constructed vector letterforms, no system fonts),
  `assets/flow.svg` (six-step live pipeline: parallel github/npm/crates/web
  lanes, top-8 + diversity, no catalog-miss branch; full-English labels + loop-wire
  `stroke-dasharray` fixed), `assets/aio-stats.svg` (630M+ · 3M+ · 340K+ ·
  6.8M+ · 0 RESULTS KEPT · 209/209 TESTS, eyebrow "VERIFIED — LIVE CORPUS,
  FLOORS MEASURED 2026-09-30", chip "100% LIVE"), plus the new disclosure-card
  asset `assets/aio-disclosure.svg` (details in the next bullet). Figures are
  **verified floors, measured 2026-09-30** (sources in §4 FR11); the v1.2
  counts strip above is superseded but kept as history.
- **Terminal demo** `assets/aio-demo.svg` (added for v1.4.0) — 60-second
  terminal demo: `aio setup` wires every agent, `aio ask` searches
  github/npm/crates live, results ranked with the verify-before-run note, and
  the reply opens with the disclosure line; embedded in the README under the
  flow diagram.
- **OG cover** `assets/og-cover.png` (added for v1.5.0) — 1200×630 social
  card, generated from `scripts/og.html`.
- **Disclosure card** `assets/aio-disclosure.svg` (added 2026-09-30 after a
  user evaluation) — FR6 disclosure card: terminal-style typewriter reveal of
  the usage line `[aio] Using [<name>](<url>) (<type>) — <function>`, link
  underline sweep, REQUIRED chip; embedded at the end of the README
  disclosure section and under the landing page's disclosure example.
- **Token economy in generated docs** — `buildBlock` (src/write.js) output cut
  from 3258 → 2119 bytes per agent block (−35% ≈ −285 tokens × 7 agent files ≈
  −2000 tokens per session; every mandate and test string preserved verbatim);
  the `aio ask` rerank payload (src/search.js `aiRerank`) trimmed: top-12
  candidates, `func` ≤ 100 chars, query ≤ 160 chars, shorter system prompt.
- **Banner** — strict-grid ASCII wordmark printed by every `aio` command
  (regression-tested for alignment).
- **README.md** (English) — CI/npm badges, animated hero + flowchart, quick
  start, commands, update & privacy sections.
- **docs/CONFIG.md** — every file `aio` touches, rollback, troubleshooting.
- ~~**scripts/sites-seed.json** — curated seed (45 entries) for the `sites`
  table behind the manifest `## SITES` block.~~ Removed in v1.3.0 with the
  database (websites are now the agent's own web search).

## 8. Out of scope

- Background daemon / autostart service (config-only persistence by decision).
- ~~Publishing to the public npm registry~~ — **superseded**: v1.1.0 publishes
  as `aio-connect` (the name `aio` was taken).
- Cloud sync of the manifest; web UI; per-prompt live version checks.

## 9. Acceptance checklist

- [x] **v1.3.0 (2026-09-30):** `npm test` **34/34** (live sources + intent
      routing, BM25 + source diversity, `stored: 0`, offline/no-gh gates,
      borrow lifecycle, doctor, slim block); `aio doctor --check` **0 issues,
      0 warnings** (live source check ok); live smoke
      `aio ask "awesome animated chart library"` → `github+npm`, 8 hits,
      4.4–5.0 s; no database ships (`ai-tools.db`, `src/catalog.js`,
      `scripts/build-db.mjs` deleted).
- [x] `node --test` passes (idempotency, rollback, scan, tool fallback,
      disclosure format, TOML/JSON ensure, banner grid, catalog
      categorize/parser, status report, bundled-catalog first-run fallback,
      ask search (BM25 + rerank), borrow lifecycle (TTL/clean), doctor checks,
      bundle fallback, rich parseReposTable) — 30/30. *(v1.2.0 baseline —
      superseded by the v1.3.0 row above)*
- [x] On the owner machine: block in **7** instruction files (exactly 1× each),
      MCP entries unchanged/complete, 2 stale registry paths repaired.
- [x] Manifest shows REPOS + TOOLS + SITES + SKILLS with counts
      (231 · 23 · 45 · 67). *(pre-v1.3 layout — the manifest is slim since
      v1.3.0, FR3)*
- [x] Re-run `aio` → no duplicates (FR4); setup → rollback → setup cycle
      removes/restores 7/7 blocks.
- [x] Public repo pushed; tracked-files secret scan clean (FR8).
- [x] Fresh install → `aio --help` works; `aio update` exits 0 (FR5).
- [x] FR6 emitted by real agents in live sessions (claude, jcode, opencode).
- [x] npm publish of `aio-connect@1.1.0` → live on the public registry;
      fresh install from npm → `aio --version` 1.1.0, `aio --help` works;
      `aio update` exits 0 (FR5, from the registry).

Verified 2026-09-28: tests 9/9; setup → rollback → setup cycle proven on the
owner machine (blocks removed/restored **7/7**, pre-existing MCP entries never
touched, ledger-driven MCP reversal for the entries aio created); manifest
`REPOS 97 · TOOLS 23 · SKILLS 67`; 97/97 homepage screenshots; repo
`MRaihan-XXL/all-in-one` public; FR6 live-tested on three agents
(claude, jcode, opencode); `aio-connect@1.1.0` published (2FA enforced by
npm), fresh-install + `aio update` verified from the registry, owner machine
migrated off the old `all-in-one-repo@1.0.0` package.

Verified 2026-09-29: tests **17/17** (node --test), REPOS **231** · TOOLS 23 ·
SKILLS 67, screenshots **231/231**, `aio status` healthy (7/7 agent blocks),
`aio-connect@1.1.2` published (live on the registry, dist-tags latest).

Verified 2026-09-30 (v1.2.0): tests **30/30**; `aio ask` live (engine
`ollama:qwen3:4b`, link + function per hit); `aio borrow` live GitHub search;
`aio doctor --check` 0 issues; `aio evolve` pipeline green; SITES **45**;
screenshot artifacts removed by decision (`docs/SCREENSHOTS.md` + `screenshots/`
deleted); 231 clones deleted (db-first catalog, 16.43 GB freed) with status
healthy (0 dirs); repo renamed to `all-in-one`; `aio-connect@1.2.0` published.

Verified 2026-09-30 (v1.3.0): tests **34/34**; `aio doctor --check` **0
issues, 0 warnings** (live source reachable); live smoke `aio ask` →
`github+npm`, 8 hits, 4.4–5.0 s with `stored: 0`; no database ships (bundle =
bin/src/assets/docs only); hero/flow/stats SVGs v2 re-rendered and verified
via headless Edge screenshots; GitHub Pages CI green on 3 OS for the previous
commit (a follow-up run covers this docs batch).

Verified 2026-09-30 (v1.4.0): tests 45/45, doctor 0 issues / 0 warnings, eval hit@8 20/20 (scripts/eval-relevance.mjs), --dry-run writes nothing

Verified 2026-10-01 (v1.4.1): tests 52/52, doctor 0 issues / 0 warnings (incl. mcp-ledger check), eval hit@8 20/20 · hit@1 19/20 (95%) · MRR 0.97 (scripts/eval-relevance.mjs, 2026-10-01), evolve pipeline green, --dry-run writes nothing

Verified 2026-10-01 (v1.5.0): tests **79/79**; `aio doctor --check` **0 issues, 0 warnings** (9 checks); consent gate verified (non-TTY → plan only, exit 0, nothing written; `--yes` applies); `--dry-run` / `aio preview` write nothing; hand-edit → `aio status` shows `injected*` → re-run keeps the edit in `backups/`.

## 10. Known limitations

- **`aio ask` rerank needs a warm local Ollama.** The BM25 + source-diversity
  pass always runs; the `qwen3` rerank (default model `qwen3:4b`, override
  with `AIO_OLLAMA_MODEL`) is attempted only while the run is still inside
  the speed budget — 3.5 s abort, and skipped entirely once elapsed time
  passes 2.5 s. No Ollama → silent fallback to the merged BM25 order
  (`aio doctor` reports it as a warning, not an issue); set `AIO_NO_AI=1` to
  skip the network call entirely.
- **Live sources need network and can rate-limit.** Each source (GitHub, npm,
  crates) has a 4 s timeout and is skipped silently when it fails; GitHub
  code search needs an authenticated `gh` — without `gh` (or when `gh api`
  fails) the skills lane lands in `errors[]` and is reported as a source
  issue, never a silent empty answer, while `AIO_NO_GH=1` skips the lane
  entirely; `AIO_OFFLINE=1` turns `aio ask`
  into an explicit offline message instead of a silent empty result.
- **`aio borrow` needs network, `git`, and disk.** Live GitHub search
  rate-limits unauthenticated callers (403 → clear "rate limited" error;
  `gh auth token` / `GITHUB_TOKEN` raises the quota); `--get` refuses to clone
  with less than 1 GB free (guard message tells you to `--clean` first).
  Temp clones live only in `%TEMP%\aio-borrow` — nothing is written to disk
  beyond that temp dir.
- **`aio doctor --fix` only re-runs setup.** Fixes are limited to the
  idempotent pipeline (regenerate manifest + reinject blocks); it never edits
  agent files by hand, never touches MCP ledgers, and `aio evolve` never
  commits.
- **kimi — FR6 not applied.** After 9 attempts kimi quotes the disclosure rule
  verbatim but does not emit the `[aio] Using …` line in its reply — a
  model/harness-dependent behavior, not a packaging bug. Workaround: native
  Moonshot login or manual review of the injected block. Wiring (FR1) and MCP
  ensure pass for kimi; FR6 compliance for kimi must not be claimed
  unconditionally.
- **Install scripts are Windows-first.** CI (`.github/workflows/ci.yml`) covers
  windows/ubuntu/macos for `npm test` + CLI help (`node bin/aio.js --help`);
  `scripts/install-tools.mjs` (uv/npm/go) is Windows-first and untested on
  Linux/macOS.

## 11. Revision history

| Date | Change |
|---|---|
| 2026-09-14 | v1 — initial PRD (FR1–FR8, branding, auto-update, disclosure) |
| 2026-09-28 | v1.1 — acceptance checklist signed off after end-to-end verification |
| 2026-09-28 | v1.2 — 8 agents (codex/gemini, dir-based detection, 6 MCP formats), npm `aio-connect`, FR6 live proof, brand kit, screenshot evidence index |
| 2026-09-29 | v1.3 — `aio-connect@1.1.1` published to npm (2FA web-auth): cross-platform CI workflow, portable default repos dir, `src/catalog.js` fine-grained categories + install columns in ai-tools.db, `aio status` command, install-tools script, FR6 support-matrix/privacy/troubleshooting docs, landing-page qualifiers |
| 2026-09-29 | v1.4 — `aio-connect@1.1.2`: bundled `ai-tools.db` + first-run fallback (resolveDataDir), CI actions v5, catalog 231 repos (+30 gems & discovery), screenshots 231/231 |
| 2026-09-30 | v1.5 - aio 1.2.0: aio ask (BM25 + local-Ollama rerank, link+function output), aio borrow (ephemeral GitHub clones, 24h TTL), aio doctor/evolve (self-diagnosis/self-upgrade), ## SITES (45) + disclosure site, db-first catalog (clones optional), animated README/flow assets, screenshots artifacts removed, repo renamed all-in-one |
| 2026-09-30 | v1.6 — aio 1.3.0: 100% live architecture — ai-tools.db + catalog.js + build-db deleted, aio ask = parallel GitHub/npm/crates search (BM25 + source diversity + warm qwen3 rerank), web = agent's own search, zero storage (0 bytes), assets v2 live pipeline redesign, 34/34 tests, doctor live check |

| 2026-09-30 | v1.7 — aio 1.3.1: evaluation round — verified figures corrected (630M+ Octoverse 2025, crates api 342,787 → 340K+, SKILL.md count 6,832,128 → 6.8M+), flow.svg full English + loop-wire fix, hero wordmark → constructed vector letterforms, new disclosure card asset, banner rounded terminals, 34/34 tests |

| 2026-09-30 | v1.8 — aio 1.4.0: security pass — docs/THREATS.md threat model, trust-weighted ranking (65% relevance + 35% popularity), verify-before-run note, aio --dry-run, relevance eval hit@8 20/20, aioc alias (Adobe PATH conflict), claim precision (no search storage / instruction-level disclosure), 45/45 tests |

| 2026-10-01 | v1.9 — aio 1.4.1: POSIX-safe paths (fileURLToPath), evolve = setup → doctor → tests (install-plan scan dropped — dev tooling, not shipped in the npm package), status strictly read-only, conditional global AGENTS block, ask error transparency (errors[], ok:false when every source fails), diversity identity fix (URL/name, ≤10 rows), default n=8, MCP rollback hardening (per-file try/catch; parse-error/missing ledger entries kept for retry), 30-day backup pruning, versioned UA, ranking eval hit@1 19/20 + MRR 0.97, 52/52 tests, test/ shipped in npm package, animation upgrade across all 5 SVG assets |

| 2026-10-01 | v1.10 — aio 1.5.0: honest-review remediation (B-01–B-10; B-05 index.html nav `nth-child` rule fixed, B-06 index.html `og:image` → `assets/og-cover.png` at absolute URL https://mraihan-xxl.github.io/all-in-one/assets/og-cover.png), first-run consent gate (B-02: TTY plan + [y/N], non-TTY plan-only exit 0, --yes to apply, --dry-run/aio preview always plan), `aio init [--copilot]` project mode (./AGENTS.md official standard + .github/copilot-instructions.md pointer, same gate, not reversed by rollback), drift detection (C-02: block-hashes.json SHA-256 prefix, status `injected*` + stale note, hand-edit backed up before replace), shared target list (B-04: 6 agent files + Zed official path + conditional global), doctor = exactly 9 checks with [ok]/[~~]/[!!] tags incl. gh auth + MCP ledger (B-08/B-09), M-04 slim manifest (pointer + detected agents; rules live only in the block), B-03 update re-runs the fresh global bin with --yes, B-10 repos/install-plan/fixPaths tooling removed from src entirely (scanRepos, resolveReposDir, DEFAULT_REPOS_DIR, --repos, AIO_REPOS_DIR, reposDir, .aio-fixpaths), release.yml (tag v* → npm test → tag==version → npm publish via NPM_TOKEN secret → GH release) + eval.yml (daily cron relevance eval), assets/og-cover.png (1200×630, scripts/og.html), CHANGELOG.md shipped in package, 79/79 tests |

| 2026-10-05 | v1.11 — aio 1.6.0 scope: `aio skill add <owner/repo\|url> [--file <path\|dir>] [--name <n>] [--dry-run]` (raw.githubusercontent HEAD, 3 layout candidates → `~/.agents/skills/<name>/SKILL.md`, sha256-claimed in `skills-ledger.json`; `skill list` / `skill remove` refuse user-owned skills; rollback removes only byte-identical aio installs), `aio completion bash\|zsh\|fish\|pwsh`, `aio doctor --json` (9 checks as `{schemaVersion:1, version, mode, ok, issues, warns, checks[]}`) + `schemaVersion: 1` on `ask --json`/`borrow --json` (bump only on breaking shape; additive fields free), standalone binaries + installers (`aio-windows-x64.exe`, `aio-linux-x64`, `aio-linux-arm64`, `aio-darwin-x64`, `aio-darwin-arm64` + `SHA256SUMS` + cosign-signed `SHA256SUMS.sig`; download-then-run `install.ps1`/`install.sh` with sha256 verification, scoop manifest; binary caveats: evolve needs source/npm, update needs npm, doctor reports the embedded bun build), GitHub search rate budget (`gh-rate.json` timestamps only — 8/min unauth, 25/min with GH token, `AIO_RATE`/`AIO_RATE=0`), `AIO_QUIET=1`/`AIO_NO_BANNER=1` + `NO_COLOR=1`, FR6 rule 0 (`FIRST LINE RULE` repeating the disclosure line before rule 1 — kimi retest pending, no new compliance claim), release.yml hardening (tag must be the `origin/main` tip, per-OS binary smoke, asset upload, cosign signs after upload), uninstall order documented (rollback first, then `npm rm -g`), `CONTRIBUTING.md` + `ROADMAP.md` added, tests 209/209, coverage gate 90/80/85 |