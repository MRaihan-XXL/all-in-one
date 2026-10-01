# aio — Configuration Reference

Everything `aio` reads or writes on your machine, in execution order.

## Reads (scan phase)

| Source | Used for | If missing |
|---|---|---|
| `$PATH` **or** the agent's config dir | detect agents (`opencode`, `claude`, `kimi`, `jcode`, `freebuff`, `hermes`, `codex`, `gemini`) and `codebase-memory-mcp` | agent reported *not installed* |
| `$AIO_STATE_DIR` (default `~/.aio`) | state dir: `config.json`, `aio-context.md`, `backups/`, `block-hashes.json`, MCP ledger | created on first run |

There is no repos directory and no install plan since v1.5.0 (`--repos`,
`AIO_REPOS_DIR` removed).

## Live sources (read at `aio ask` time — never stored)

| Source | Used for | If missing / failing |
|---|---|---|
| `api.github.com` repo search | GitHub repos (**630M+**) | 4 s timeout → source skipped, other lanes still answer |
| `gh auth token` + `gh api search/code` | public skills (`filename:SKILL.md`, 6.8M+ files) | no `gh` / no auth → `gh api` fails → skills lane lands in `errors[]` and is reported as a source issue (never a silent empty lane); `AIO_NO_GH=1` → lane skipped entirely |
| `registry.npmjs.org` search API | npm packages (**3M+**) | 4 s timeout → skipped |
| `crates.io` API | Rust crates (**340K+**) | 4 s timeout → skipped |
| `OLLAMA_HOST` (default `http://localhost:11434`) / `AIO_OLLAMA_MODEL` | optional rerank — warm only, 3.5 s abort, skipped after 2.5 s elapsed | silent fallback to the BM25 order; `AIO_NO_AI=1` skips the call |

Nothing else is read for search: there is **no database** (v1.3.0 deleted
`ai-tools.db`, `src/catalog.js`, `scripts/build-db.mjs`) and no search history.
`AIO_OFFLINE=1` short-circuits `aio ask` with an explicit offline message.

## Writes (setup phase)

**Consent gate (B-02):** every write goes through `gatedRun` — interactive TTY
prints the plan, then asks `Proceed with these writes? [y/N] `; non-TTY (npx
pipes, CI) prints the plan and stops with
`[aio] non-interactive session — plan shown above, nothing written. Re-run with --yes to apply.`
(exit 0); `--yes` applies without prompting; `--dry-run` / `aio preview` are
always plan-only. Every write is preceded by a file backup to
`~/.aio/backups/` (30-day pruning).

> `aio --dry-run` / `aio preview` = plan-only: prints exactly what would change
> (block inject/update, MCP would-add, manifest would-write) — and writes
> **nothing**: no manifest, no block, no MCP entry, no backups, no state files
> (`config.json`, `block-hashes.json`, `mcp-ledger.json` all untouched — the
> drift-hash and ledger writes are `!dry`-guarded too). The same applies to the
> plan phase of `aio init` and to non-TTY runs without `--yes`.

| # | Target | What happens | Reversed by `aio rollback`? |
|---|---|---|---|
| 1 | `~/.aio/aio-context.md` (or `$AIO_STATE_DIR/aio-context.md`) | generated context manifest (slim M-04: pointer + detected agents — the rules and disclosure live only in the injected block) | kept (generated artifact) |
| 2 | `~/.config/opencode/AGENTS.md` | marker block `<!-- aio:auto-config:v1:start --> … end -->` injected/refreshed | ✅ block removed |
| 3 | `~/.claude/CLAUDE.md` | same block | ✅ block removed |
| 4 | `~/.kimi-code/AGENTS.md` | same block | ✅ block removed |
| 5 | `~/.jcode/AGENTS.md` | same block (created if the `.jcode` dir exists) | ✅ block removed |
| 6 | `~/.codex/AGENTS.md` | same block | ✅ block removed |
| 7 | `~/.gemini/GEMINI.md` | same block | ✅ block removed |
| 8 | `%APPDATA%\Zed\AGENTS.md` (Windows) / `~/.config/zed/AGENTS.md` (POSIX) | same block — official Zed path, only when the config dir exists (`skipped (no config dir yet)`) | ✅ block removed |
| 9 | `~/AGENTS.md` | same block (conditional global — freebuff, hermes, jcode fallback) | ✅ block removed |
| 10 | `~/.config/opencode/opencode.jsonc` | `"codebase-memory-mcp"` entry **only if absent** (textual insert, comments preserved) | ✅ only if aio added it (ledger) |
| 11 | `~/.claude.json` | `mcpServers["codebase-memory-mcp"]` **only if absent** | ✅ only if aio added it (ledger) |
| 12 | `~/.kimi-code/mcp.json` | `mcpServers["codebase-memory-mcp"]` **only if absent** | ✅ only if aio added it (ledger) |
| 13 | `~/.jcode/mcp.json` | `servers["codebase-memory-mcp"]` (jcode's root key is `servers`) **only if absent** | ✅ only if aio added it (ledger) |
| 14 | `~/.gemini/settings.json` | `mcpServers["codebase-memory-mcp"]` — file created when `~/.gemini/` exists, **only if absent** | ✅ only if aio added it (ledger) |
| 15 | `~/.codex/config.toml` | `[mcp_servers.codebase-memory-mcp]` table appended **only if absent** | ✅ only if aio added it (ledger) |
| 16 | `~/.aio/config.json`, `~/.aio/mcp-ledger.json` | state (version, manifest path, last run) + MCP ledger | ledger cleared; config kept |
| 17 | `~/.aio/block-hashes.json` | drift detection (C-02): SHA-256 prefix (16 hex) of the block aio last wrote, per target | entry pruned with the block |

The six agent files, Zed and the conditional global all come from one shared
list (`src/targets.js`) used by setup, status, rollback and doctor (B-04).

### Drift detection (`injected*`)

After each inject the block's hash is recorded (row 17). On later runs:

- `aio status` shows `injected*` instead of `injected` when the block on disk
  no longer matches what aio wrote, plus
  `stale — edited outside aio; run \`aio\` to refresh (backups kept)`, and
  lists it as an issue.
- the next `aio` run reports
  `updated (hand-edit replaced — kept in backups/)` — your edit is in
  `~/.aio/backups/` first, then the block is refreshed.
- dry-run reports `would update (hand-edit detected)`.
- `aio rollback` removes the block and prunes its hash entry.

### `aio init` (project scope)

`aio init [--copilot]` runs in the current directory with the same consent
gate and writes **project** files that `aio rollback` does not touch:

| Target | What happens | Reversed by rollback? |
|---|---|---|
| `./AGENTS.md` | the same marker block, injected/refreshed (official standard — Zed/Copilot/Cursor read it) | ❌ project file — remove it yourself |
| `./.github/copilot-instructions.md` (`--copilot`) | short **pointer** to `../AGENTS.md` — no duplicated rules (M-04), so editors reading both never see the rules twice | ❌ project file |

Commit them so every teammate's agent inherits the same rules.

The block is identical to the global one, with one exception: the
`- Context manifest (auto-generated): …` pointer line is embedded **only when
`~/.aio/aio-context.md` already exists** — on a machine where global `aio`
never ran, `aio init` writes the block without that line (no dangling path).
The global `aio` setup block always carries it (setup generates the manifest
first).

### Idempotency

The block is delimited by stable markers and matched with one regex:

```text
<!-- aio:auto-config:v1:start -->
…generated content (replaced on every run)…
<!-- aio:auto-config:v1:end -->
```

Re-running `aio` **updates in place** — the block never duplicates (verified by
`test/selfcheck.js`).

### The block (excerpt)

```markdown
### AIO AUTO-CONTEXT (generated by aio v1.5.0 — do not edit; re-run `aio` to refresh)
- Context manifest (auto-generated): `…/aio-context.md`

Auto-use rules (plain-language prompts only — NO slash-commands required):
1. USAGE DISCLOSURE — required the moment your reply uses ANY entry surfaced
   through aio (via `aio ask`/`aio borrow`/this manifest: read, cited, listed,
   or recommended). … When triggered, your FIRST line must be
   [aio] Using [<name>](<url>) (<type>) — <function>
   Example: [aio] Using [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) (repo) — HTML/CSS/JS to PDF converter
2. PROMPT → LIVE SEARCH → USE → REPORT (every agent, no exceptions):
   a. Prompt needs a repo/tool/skill → run `aio ask "<prompt words>"` FIRST — it searches LIVE
      (GitHub 630M+ repos + public skills, npm, crates), adaptive to your intent, ZERO storage: results are never saved anywhere.
   b. Websites/URLs → use your own built-in web search …
    …
```

This excerpt is the **global** `aio` block: the `- Context manifest …` line is
always there for global setup. `aio init` (project scope) includes it only when
the manifest exists — see *`aio init`* above.

## Rollback semantics

`aio rollback` is **surgical**, not a file restore:

1. removes the marker block from every target on the shared list
   (`src/targets.js`: the six agent files, Zed, and `~/AGENTS.md` — so your
   edits made *after* setup are preserved) and prunes the block's drift-hash
   entry
2. removes MCP entries recorded in `~/.aio/mcp-ledger.json` — i.e. only the
   entries aio itself created. Pre-existing entries (configured by you or by
   the agent) are never touched.
3. keeps `~/.aio/backups/` as a safety net.

Files written by `aio init` (`./AGENTS.md`, `.github/copilot-instructions.md`)
are **not** touched by rollback — they belong to the repository.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `manifest … LEGACY layout` (doctor/status) | pre-v1.3 manifest still holds catalog tables → run `aio` (regenerates the slim live manifest) |
| `aio` prints a plan and stops (non-interactive) | by design — no TTY and no `--yes` means nothing is written; re-run with `--yes`, or answer `y` at the `[y/N]` prompt in an interactive terminal |
| `injected*` / `block edited by hand` (`aio status`) | run `aio` — the block is refreshed and your edit is kept in `~/.aio/backups/` (see *Drift detection* above) |
| project repo has no agent rules | run `aio init [--copilot]` in the project root, then commit `./AGENTS.md` (+ `.github/copilot-instructions.md`) |
| `offline (AIO_OFFLINE=1)` from `aio ask` | expected: aio keeps no local catalog by design; unset `AIO_OFFLINE` while online |
| manifest is > 7 days old | run `aio` again (regenerated on every run) |
| `binary not on PATH — skipped` (MCP) | install `codebase-memory-mcp`, re-run `aio` |
| agent ignores the manifest | check the block exists: search `aio:auto-config` in its instruction file |
| want a clean machine | `aio rollback` (backups in `~/.aio/backups/`) |
| update to latest rules | `aio update` |

### Node version warning → install Node ≥ 22
`[aio] warning: Node … detected — Node >= 22 recommended` (src/setup.js):
Node ≥ 22 is the supported line (ESM top-level await; zero runtime
dependencies — no native/SQLite modules since v1.3.0).
Install from [nodejs.org](https://nodejs.org), then re-run `aio`.

### `manifest missing or stale` → run `aio`
`aio` regenerates the manifest on every run (slim M-04 layout — header notes
+ pointer to the block + detected agents; no catalog tables and no duplicated
rules, which live only in the block). Check age and
layout with `aio status`: it flags a manifest older than 7 days **and** a
pre-v1.3 legacy layout.

### `agent shows [issue] file exists but has no aio block` → run `aio`
`aio status` flags this as `[issue] <agent>: file exists but has no aio block`,
emitted when the instruction file exists but the marker block was removed by
hand. Re-running `aio` (re)injects it; the block is idempotent, so it is safe
to re-run any time.

### `wrong state location` → `$AIO_STATE_DIR`
Set `AIO_STATE_DIR` to move the state directory off `~/.aio`. There is
**no `--home` flag and no `AIO_HOME`** since v1.3.0, and no repos directory
option at all since v1.5.0 (`--repos` / `AIO_REPOS_DIR` removed) — aio locates
neither a clone dir nor a database. `aio status` prints the resolved paths it
actually used, so you can confirm the override took effect.

### `something broke after wiring` → `aio rollback`
Removes every injected block and every MCP addition aio recorded, while
keeping the timestamped backups in `~/.aio/backups/` as a safety net.

### `npx aio-connect` fails offline → `npm i -g aio-connect`
`npx` needs the npm registry to resolve the package. Run `npm i -g aio-connect`
once while online; after that `aio` setup works offline (it makes no network
calls). `aio ask` is live by design — offline it prints the explicit
`AIO_OFFLINE`/no-network message instead of searching.
