# PRD — aio (all-in-one)

| | |
|---|---|
| **Product** | `aio` — All-In-One auto-connect layer for AI coding agents |
| **Package** | `aio-connect` (npm registry; GitHub repo `MRaihan-XXL/all-in-one`) |
| **Version** | 1.2.0 |
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
generated **context manifest** (repositories + tools + skills), injects a small
idempotent **auto-use rule block** into every supported agent's instruction
file, and keeps everything fresh on later runs. After setup the user opens any
agent directly and prompts in plain language — no slash commands.

## 2. Goals

- **G1** One command (`aio`) wires every installed AI agent to the local
  repositories, tools, and skills — permanently (config survives until changed).
- **G2** Zero slash-commands: routing decisions are made by the agent from the
  manifest, from plain-language prompts.
- **G3** The manifest covers **repositories AND tools** (commands, versions,
  locations, links, descriptions) — not just code folders.
- **G4** Stays correct over time: adding repositories or updating features only
  requires re-running `aio` (rescan + block regeneration).
- **G5** Every agent reply that uses a local repo/tool **discloses it**: tool
  name, kind, and function (see FR6).
- **G6** Self-updatable (`aio update`), rollback-able (`aio rollback`), and
  safe to publish (public repo, no local/sensitive data).

## 3. Users

1. **Primary** — the owner: power user running 8 agents + a 231-repo catalog
   (db-first since v1.5; local clones optional) + a local tools database on one
   Windows machine.
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
The injected block tells the agent: match the user's prompt against the
manifest and route itself to the right repository/tool/skill automatically.
The user never types `/…` for routing.

**Acceptance:** block content contains explicit "never ask the user to type
a slash-command" rule.

### FR3 — Manifest = repositories + tools + sites + skills
Generated file `aio-context.md` with four sections:
- **REPOS** — 7-column table (name, URL, function/description, category, stars,
  local path) built **db-first** from `ai-tools.db`: the catalog stays complete
  with **zero local clones**; the directory scan merges in whatever is actually
  on disk (fresh clones win, unlisted folders are added).
- **TOOLS** — name, command/access, version, location, link, description.
  Source: local `ai-tools.db` (SQLite) first, `TOOLS-INDEX.md` parse as
  fallback, nothing if both absent.
- **SITES** — curated websites: name, URL, category, function, audience. Source:
  the `sites` table in `ai-tools.db` (seed: `scripts/sites-seed.json`).
- **SKILLS** — names + locations of global agent skill directories.

**Acceptance:** after setup the manifest lists all four sections with correct
counts for the machine (owner machine 2026-09-30: REPOS 231 · TOOLS 23 ·
SITES 45 · SKILLS 67).

### FR4 — Update resilience (repos & features)
- `aio` **rescans** on every run: a repository added to the repos directory
  appears in the manifest after a re-run.
- The injected block is marker-delimited (`aio:auto-config:v1`) and
  **regenerated** from the running package version: updating `aio` and
  re-running replaces block content in place — never duplicated, never stale.

**Acceptance:** run `aio` twice → block appears exactly once; add a dummy repo
folder → re-run → manifest count increases.

### FR5 — Auto-update
`aio update` reinstalls the package from npm (`npm install -g aio-connect`;
GitHub `github:<owner>/all-in-one` remains a fallback source) and then
automatically re-runs setup with the new code, so rules/manifest pick up the
new version.

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
registry logs, the generated context manifest, and env files. The catalog
database `ai-tools.db` is shipped on purpose (bundled in npm + versioned on
GitHub — it is what keeps the catalog alive without local clones). No
machine-specific absolute paths or secrets in committed code — paths are
resolved at runtime (env var / config / discovery), README examples use
placeholders.

**Acceptance:** `git ls-files` contains none of the excluded files; secret
scan (tokens/passwords/usernames) on tracked files passes.

### FR9 — Catalog search & ephemeral borrow (`ask` / `borrow`)
- `aio ask "<prompt>"` searches repos, tools, sites and skills from the local
  catalog: BM25 ranking, then an optional rerank by the local Ollama `qwen3`
  model when it is reachable (`OLLAMA_HOST`, `AIO_OLLAMA_MODEL`, `AIO_NO_AI=1`
  disables it). Every hit prints **URL + one-line function**; `--json` emits
  machine-readable output.
- `aio borrow "<keywords>"` searches GitHub live (token from `gh auth token`
  or `GITHUB_TOKEN` when available); `aio borrow --get <owner/repo>`
  shallow-clones into `%TEMP%\aio-borrow` with a **24 h TTL** (auto-purged on
  the next borrow run) and a **1 GB free-disk guard**; `--list` inspects temp
  clones, `--clean` wipes them.

**Acceptance:** `node --test` covers ask search (BM25 ranking, URL + function
per hit, sites/tools searchable, `--json`) and the borrow lifecycle (24 h TTL
purge, `--clean`, `--list`).

### FR10 — Self-diagnosis & self-upgrade (`doctor` / `evolve`)
- `aio doctor [--check|--fix]` runs read-only checks — Node, persisted state,
  catalog db, manifest freshness/count sync, agent blocks, Ollama reachability —
  and exits 1 when any issue exists (`--check` = CI gate); `--fix` re-runs the
  idempotent setup pipeline (safe fixes only).
- `aio evolve` runs the full pipeline in one command: scan →
  `build-db --enrich` → setup → `doctor --check` → `npm test`, prints a
  per-step pass/fail report with timings, and **never commits or pushes** (git
  stays with the human).

**Acceptance:** `node --test` covers doctor checks; `aio evolve` reports every
step green on the owner machine (verified 2026-09-30).

## 5. Non-functional requirements

- **NFR1** Idempotent: any run may be repeated without duplication.
- **NFR2** Zero runtime dependencies (Node.js standard library only);
  Node ≥ 22 (uses `node:sqlite` when present, degrades gracefully otherwise).
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
- **Consequences** — `engines.node >=22` in `package.json`; SQLite via built-in
  `node:sqlite` (no native deps); tests via built-in `node --test` (zero
  runtime/test dependencies).
- Reviewed 2026-09-29, status: Accepted.

## 6. Commands (CLI surface)

| Command | Behavior |
|---|---|
| `aio` | Full setup: scan → manifest → inject → MCP ensure → path fix → status table |
| `aio status` | Read-only health report (state, manifest, repo/install counts, agent blocks) |
| `aio ask "<prompt>"` | Catalog search (repos/tools/sites/skills): BM25 + optional local-Ollama rerank; every hit prints link + one-line function; `--json` |
| `aio borrow "<kw>"` | Live GitHub search; `--get <owner/repo>` shallow-clone to `%TEMP%\aio-borrow` (24 h TTL, 1 GB disk guard); `--list` / `--clean` |
| `aio doctor [--check\|--fix]` | Self-diagnosis: node / state / db / manifest-sync / agent blocks / Ollama; `--check` = CI gate, `--fix` = safe repair |
| `aio evolve` | Pipeline: scan → `build-db --enrich` → setup → doctor → `npm test`; never commits |
| `aio update` | Reinstall latest from npm → re-run setup automatically |
| `aio rollback` | Remove injected block + reverse MCP additions from ledger |
| `aio --help` | Usage + branding |
| `aio --version` | Print package version |

Options: `--repos <dir>` (repositories directory), `--home <dir>` (data folder
containing `ai-tools.db` / `TOOLS-INDEX.md`), `--json` (machine-readable output
for `ask` / `borrow`). Environment overrides: `AIO_REPOS_DIR`, `AIO_HOME`,
`OLLAMA_HOST`, `AIO_OLLAMA_MODEL`, `AIO_NO_AI`.

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
- **Banner** — strict-grid ASCII wordmark printed by every `aio` command
  (regression-tested for alignment).
- **README.md** (English) — CI/npm badges, animated hero + flowchart, quick
  start, commands, update & privacy sections.
- **docs/CONFIG.md** — every file `aio` touches, rollback, troubleshooting.
- **scripts/sites-seed.json** — curated seed (45 entries) for the `sites` table
  behind the manifest `## SITES` block.

## 8. Out of scope

- Background daemon / autostart service (config-only persistence by decision).
- ~~Publishing to the public npm registry~~ — **superseded**: v1.1.0 publishes
  as `aio-connect` (the name `aio` was taken).
- Cloud sync of the manifest; web UI; per-prompt live version checks.

## 9. Acceptance checklist

- [x] `node --test` passes (idempotency, rollback, scan, tool fallback,
      disclosure format, TOML/JSON ensure, banner grid, catalog
      categorize/parser, status report, bundled-catalog first-run fallback,
      ask search (BM25 + rerank), borrow lifecycle (TTL/clean), doctor checks,
      bundle fallback, rich parseReposTable) — 30/30.
- [x] On the owner machine: block in **7** instruction files (exactly 1× each),
      MCP entries unchanged/complete, 2 stale registry paths repaired.
- [x] Manifest shows REPOS + TOOLS + SITES + SKILLS with counts
      (231 · 23 · 45 · 67).
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

Verified 2026-09-30: tests **30/30**; `aio ask` live (engine
`ollama:qwen3:4b`, link + function per hit); `aio borrow` live GitHub search;
`aio doctor --check` 0 issues; `aio evolve` pipeline green; SITES **45**;
screenshot artifacts removed by decision (`docs/SCREENSHOTS.md` + `screenshots/`
deleted); 231 clones deleted (db-first catalog, 16.43 GB freed) with status
healthy (0 dirs); repo renamed to `all-in-one`; `aio-connect@1.2.0` published.

## 10. Known limitations

- **`aio ask` rerank needs local Ollama.** The BM25 pass always runs; the
  `qwen3` rerank (default model `qwen3:4b`, override with `AIO_OLLAMA_MODEL`)
  only runs when `OLLAMA_HOST` (default `http://localhost:11434`) responds —
  20 s abort so a cold model load still fits. No Ollama → silent fallback to
  BM25 keyword ranking (`aio doctor` reports it as a warning, not an issue);
  set `AIO_NO_AI=1` to skip the network call entirely.
- **`aio borrow` needs network, `git`, and disk.** Live GitHub search
  rate-limits unauthenticated callers (403 → clear "rate limited" error;
  `gh auth token` / `GITHUB_TOKEN` raises the quota); `--get` refuses to clone
  with less than 1 GB free (guard message tells you to `--clean` first).
  Temp clones live only in `%TEMP%\aio-borrow` — nothing is written to the
  catalog directory.
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
