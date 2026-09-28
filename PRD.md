# PRD — aio (all-in-one-repo)

| | |
|---|---|
| **Product** | `aio` — All-In-One auto-connect layer for AI coding agents |
| **Package** | `all-in-one-repo` (npm, installed from GitHub) |
| **Version** | 1.0.0 |
| **Status** | Approved for implementation |
| **License** | GPL-3.0 |
| **Docs language** | English (international) |

---

## 1. Background

Developers increasingly run several AI coding agents side by side (opencode,
Claude Code, Kimi Code, jcode, freebuff, Hermes — plus whatever comes next).
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

1. **Primary** — the owner: power user running 6 agents + 43 cloned repos +
   a local tools database on one Windows machine.
2. **Secondary** — public GitHub users: anyone installing
   `npm install -g github:<owner>/all-in-one-repo` on their own machine with
   their own repos/agents (data folder optional).

## 4. Functional requirements

### FR1 — Agent detection & permanent wiring
`aio` detects installed agents on `PATH` (at minimum: `opencode`, `claude`,
`kimi`, `jcode`, `freebuff`, `hermes`) and writes the auto-use block into each
agent's instruction file (global instruction file as fallback). Configuration
persists: after one run, every later agent session is already wired.

**Acceptance:** running `aio` reports per-agent status
(detected / instruction file / block / MCP / fallback).

### FR2 — No slash-commands (auto-use)
The injected block tells the agent: match the user's prompt against the
manifest and route itself to the right repository/tool/skill automatically.
The user never types `/…` for routing.

**Acceptance:** block content contains explicit "never ask the user to type
a slash-command" rule.

### FR3 — Manifest = repositories + tools + skills
Generated file `aio-context.md` with three sections:
- **REPOS** — name, URL (from real `.git/config`), local path, category.
- **TOOLS** — name, command/access, version, location, link, description.
  Source: local `ai-tools.db` (SQLite) first, `TOOLS-INDEX.md` parse as
  fallback, nothing if both absent.
- **SKILLS** — names + locations of global agent skill directories.

**Acceptance:** after setup the manifest lists all three sections with correct
counts for the machine.

### FR4 — Update resilience (repos & features)
- `aio` **rescans** on every run: a repository added to the repos directory
  appears in the manifest after a re-run.
- The injected block is marker-delimited (`aio:auto-config:v1`) and
  **regenerated** from the running package version: updating `aio` and
  re-running replaces block content in place — never duplicated, never stale.

**Acceptance:** run `aio` twice → block appears exactly once; add a dummy repo
folder → re-run → manifest count increases.

### FR5 — Auto-update
`aio update` reinstalls the package from the GitHub repository
(`npm install -g github:<owner>/all-in-one-repo`) and then automatically
re-runs setup with the new code, so rules/manifest pick up the new version.

**Acceptance:** `aio update` exits 0 on success, prints new version + setup
report; offline → clear error, exit 1, no partial damage.

### FR6 — Usage disclosure in agent output
The injected block mandates: whenever an agent uses a repository or tool from
the manifest, it must start that step with:

```
[aio] Using <name> (<type>) — <function>
```

where `<function>` is the manifest description (what the tool/repo does).

**Acceptance:** rule present in block with that exact format.

### FR7 — Backup & rollback
Every file is backed up to `~/.aio/backups/` before first modification.
`aio rollback` surgically removes the auto-use block and any MCP entry `aio`
added (recorded in a ledger) — user edits outside the block are preserved.

**Acceptance:** `node --test` proves inject-twice idempotency and exact
rollback restore.

### FR8 — Publication without local/sensitive data
Public GitHub repository; `.gitignore` excludes the local tools database,
screenshots, tracking/registry logs, generated context manifest, and env
files. No machine-specific absolute paths or secrets in committed code —
paths are resolved at runtime (env var / config / discovery), README examples
use placeholders.

**Acceptance:** `git ls-files` contains none of the excluded files; secret
scan (tokens/passwords/usernames) on tracked files passes.

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

## 6. Commands (CLI surface)

| Command | Behavior |
|---|---|
| `aio` | Full setup: scan → manifest → inject → MCP ensure → path fix → status table |
| `aio update` | Reinstall latest from GitHub → re-run setup automatically |
| `aio rollback` | Remove injected block + reverse MCP additions from ledger |
| `aio --help` | Usage + branding |
| `aio --version` | Print package version |

Options: `--repos <dir>` (repositories directory), `--home <dir>` (data folder
containing `ai-tools.db` / `TOOLS-INDEX.md`). Environment overrides:
`AIO_REPOS_DIR`, `AIO_HOME`.

## 7. Branding & documentation deliverables

- **Logo** `docs/logo.svg` — mark + wordmark, referenced in README header.
- **Animated flowchart** `docs/flow.svg` — SMIL-animated diagram:
  prompt → agent → manifest (repos/tools/skills) → disclosed output.
- **Banner** — ASCII wordmark printed by every `aio` command.
- **README.md** (English) — badges, logo, flowchart, quick start, commands,
  update & privacy sections.
- **docs/CONFIG.md** — every file `aio` touches, rollback, troubleshooting.

## 8. Out of scope

- Background daemon / autostart service (config-only persistence by decision).
- Publishing to the public npm registry (GitHub-install distribution only).
- Cloud sync of the manifest; web UI; per-prompt live version checks.

## 9. Acceptance checklist

- [ ] `node --test` passes (idempotency, rollback, scan, tool fallback).
- [ ] On the owner machine: block in 4 instruction files (exactly 1× each),
      MCP entries unchanged/complete, 2 stale registry paths repaired.
- [ ] Manifest shows REPOS + TOOLS + SKILLS with counts.
- [ ] Re-run `aio` → no duplicates (FR4).
- [ ] Public repo pushed; tracked-files secret scan clean (FR8).
- [ ] Fresh `npm install -g github:…` → `aio --help` works; `aio update`
      exits 0 (FR5).

## 10. Revision history

| Date | Change |
|---|---|
| 2026-09-14 | v1 — initial PRD (FR1–FR8, branding, auto-update, disclosure) |
