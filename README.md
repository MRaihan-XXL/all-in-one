<p align="center">
  <img src="./assets/aio-hero.svg" width="92%" alt="aio — the everything connector for AI agents: 100% live search across github, npm and crates — no search storage — results printed, never saved">
</p>

<h1 align="center">aio — all-in-one</h1>

<p align="center">
  <b>Auto-connect every AI coding agent to your repos, tools, skills &amp; websites.</b><br>
  No slash-commands. No manual config. One command — then it searches for you.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aio-connect"><img src="https://img.shields.io/npm/v/aio-connect?color=cb3837" alt="npm version"></a>
  <a href="https://github.com/MRaihan-XXL/all-in-one/actions/workflows/ci.yml"><img src="https://github.com/MRaihan-XXL/all-in-one/actions/workflows/ci.yml/badge.svg" alt="CI 3-OS"></a>
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="license: GPL-3.0">
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="node >= 22">
  <img src="https://img.shields.io/badge/agents-8-orange.svg" alt="8 agents supported">
  <img src="https://img.shields.io/badge/zero%20runtime%20deps-stdlib-lightgrey.svg" alt="zero runtime dependencies">
</p>

<p align="center">
  <a href="./PRD.md">📜 PRD</a> ·
  <a href="./docs/flow.md">🌊 How it works</a> ·
  <a href="./docs/CONFIG.md">⚙️ What changes</a> ·
  <a href="./assets/logo-gallery.html">🎨 Brand kit</a>
</p>

---

<p align="center">
  <img src="./assets/flow.svg" width="98%" alt="Animated live pipeline: prompt → aio ask (github, npm and crates searched in parallel) → top-8 + diversity ranking → use ephemerally → report with links → clean → loop">
</p>

<p align="center">
  <img src="./assets/aio-demo.svg" width="98%" alt="60-second terminal demo: aio setup wires every agent, aio ask searches github npm and crates live, results ranked with a verify note, reply opens with the disclosure line">
</p>

<p align="center">
  <img src="./assets/aio-stats.svg" width="98%" alt="Verified live corpus — floors measured 2026-09-30: 630M+ GitHub repos · 3M+ npm packages · 340K+ crates · 6.8M+ skill files · no search storage · 209/209 tests">
</p>

## ✨ What it does

`aio` has **no bundled catalog and no database** — it teaches every AI agent on
your machine to **search live on each prompt**: GitHub (**630M+ repos** plus
`filename:SKILL.md` public skills — **6.8M+ skill files**), npm (**3M+
packages**) and crates (**340K+ crates**), queried in parallel — all counts are
**verified floors, measured 2026-09-30**; websites go through your agent's
own built-in web search. Results are printed, ranked and discarded — **no
search history is stored** (aio's own files are the manifest, one block per
agent file, timestamped backups, `config.json`, the MCP rollback ledger
`mcp-ledger.json`, the drift-hash list
`block-hashes.json`, the GitHub rate clock `gh-rate.json` (one call timestamp,
no queries/results) and `skills-ledger.json` (written only after an explicit
`aio skill add`), all listed in
[docs/CONFIG.md](./docs/CONFIG.md)). The counts above are **the corpora aio
can reach — the searchable universe, not aio's own size; ranking is not
capped by them**:

```text
prompt → aio ask (live: github ∥ npm ∥ crates) → top-8 + diversity (BM25 + ≥2 rows/source)
       → use it ephemerally → report WHAT changed + EVERY link used + function
       → aio borrow --clean
```

> **Auth:** GitHub works unauthenticated at low rate; `gh auth login` (or `GH_TOKEN`)
> unlocks the skills lane (code search requires auth — without it the lane fails and
> `aio ask` reports it as a source issue, never a silent empty lane; `AIO_NO_GH=1`
> skips the lane entirely) and raises the rate limit. Details: [docs/CONFIG.md](./docs/CONFIG.md).

| Command | What you get |
|---|---|
| `aio` | scan → slim manifest → inject the auto-use block into every agent. **Consent gate**: prints the plan first — interactive → asks `Proceed with these writes? [y/N] `, non-TTY → plan only (exit 0, nothing written); `--yes` writes silent, `--dry-run`/`aio preview` = plan only |
| `aio init [--copilot]` | **project scope**: inject the block into `./AGENTS.md` (official standard — Zed/Copilot/Cursor read it); `--copilot` also writes `.github/copilot-instructions.md` (pointer only). Same consent gate; not reversed by `rollback` |
| `aio ask "csv ke chart"` | **live search** across GitHub (630M+ repos + public skills), npm (3M+ pkgs) and crates (340K+) in parallel (4 s per source), merge-ranked with BM25 + source diversity, blended 65% keyword relevance + 35% source popularity (stars/downloads/npm score); every hit prints **link + one-line function + `<github>`/`<npm>`/`<crates>` tag**; reranked by your local Ollama (qwen3) only when it is warm and fast; `--json` → `{schemaVersion: 1, …, stored: 0, hits}` (`stored: 0` = no search results stored) |
| `aio borrow "etl tool"` | **optional ephemeral fetch** — `--get owner/repo` shallow-clones to temp (**24 h TTL**, auto-purged), `--list` inspects, `--clean` wipes it. Not a fallback for `ask`: use it when you actually need the files locally |
| `aio skill add <owner/repo\|url>` | **install a public `SKILL.md`** into `~/.agents/skills/<name>/SKILL.md` (the agentskills.io shared layout read by 40+ agents). Tries 3 locations on `raw.githubusercontent.com/…/HEAD` (`SKILL.md`, `<name>/SKILL.md`, `.agents/skills/<name>/SKILL.md`); `--file <path\|dir>` installs a local file instead; `--name <n>` overrides the name; `--dry-run` prints the target and writes nothing. Idempotent, sha256-recorded in `~/.aio/skills-ledger.json`; never touches skills it did not write |
| `aio skill list` / `aio skill remove <name>` | inspect installed skills (`[x] … aio` = aio-installed, `yours` = not tracked by aio's ledger) and remove one — `remove` refuses skills aio never wrote, so a user-owned skill stays yours |
| `aio completion bash\|zsh\|fish\|pwsh` | print a shell completion script to stdout (static command/flag list — works offline and inside the compiled binary); add it to `~/.bashrc` / `~/.zshrc` / `~/.config/fish/completions/aio.fish` / `$PROFILE` as the script header says |
| `aio doctor` | **9 checks**, every row tagged `[ok]`/`[~~]`/`[!!]`: node · state · live sources · manifest · agent blocks · agents · gh auth · Ollama · MCP ledger; `--fix` repairs, `--check` = CI gate, `--json` = machine output `{schemaVersion: 1, version, mode, ok, issues, warns, checks[]}` |
| `aio evolve` | the whole self-upgrade pipeline in one run: setup (manifest+blocks) → doctor --check → npm test (never commits) |
| `aio status` | read-only health report — flags hand-edited blocks as `injected*` (drift) |
| `aio update` / `aio rollback` | update from npm / remove everything aio injected (blocks, MCP ledger entries, and only byte-identical aio-installed skills) |

Example — real `aio ask` output, abridged (links + functions always included):

```text
aio ask — "awesome animated chart library" (live: github+npm · 8 results · 5.0s)

note: ranked by keyword match + source popularity — public results are unvetted;
      verify before running npx/uvx or cloning (docs/THREATS.md).

1. lightweight-charts [tool] <npm> — Performant financial charts built with HTML5 canvas
   v5.2.1 · financial-charting-library · charting-library · html5-charts
   https://www.npmjs.com/package/lightweight-charts
   why: BM25 keyword match (#1) + trust high
2. vizzuhq/vizzu-lib [repo] <github> — Library for animated data visualizations and data stories.
   ★2037 · JavaScript
   https://github.com/vizzuhq/vizzu-lib
   why: BM25 keyword match (#2) + trust high
```

## Why aio — vs the alternatives

Three things people usually compare aio against, and what each one actually
covers:

| | **aio** | `gh skill install` | a plain `AGENTS.md` file | built-in web search |
|---|---|---|---|---|
| What it covers | live search **and** the wiring: block injection, disclosure rule, safety net | skills distribution only — copies one skill into the shared layout | static instructions you paste yourself | whatever the agent's own search returns |
| Catalog | none — GitHub (**630M+ repos** + `filename:SKILL.md` skills), npm (**3M+**), crates (**340K+**) queried per prompt, ranked (BM25 + source popularity) | n/a — one skill, copied once | only what was written down; stale as soon as the ecosystem moves | general web; no GitHub/npm/crates structure, no ranking contract |
| Storage | **zero search storage** — results printed and discarded | files on disk (the point of the tool) | one static file | agent-dependent |
| Freshness | re-run `aio` rebuilds the manifest and blocks; hand-edits are detected (`injected*`) and backed up | re-run by hand | edit by hand | always live by nature |
| Safety net | consent gate before any write, timestamped backups, `aio doctor`, `aio rollback`, MCP/skills ledgers | none | none | none |

`gh skill install` is **not a competitor** — it complements aio. Both use the
same shared skills layout (`~/.agents/skills/<name>/SKILL.md`, read by 40+
agents); `aio skill add` is the same install done with aio's ledger on top, so
`aio rollback` can take back exactly what it wrote.

Three properties the alternatives do not combine:

1. **Live search, zero search storage.** Every prompt searches GitHub, npm and
   crates in parallel; results are printed, ranked and discarded — no local
   catalog, no search history, nothing to go stale.
2. **Mandatory usage-disclosure contract.** The injected block requires the
   first line of any reply that used an aio-surfaced entry to be
   `[aio] Using [<name>](<url>) (<type>) — <function>`, plus a final report
   listing every repo/tool/site as a markdown link. Instruction-level and
   model-dependent — measured per agent below, never claimed unconditionally.
3. **Safety net for the writes.** Nothing is written without consent (TTY
   `[y/N]` or `--yes`; non-TTY = plan only), every touched file is backed up
   first, `aio doctor` diagnoses, `aio rollback` reverses, and ledgers record
   exactly what aio added.

## Quickstart (30 seconds)

```bash
npx -y aio-connect           # zero-install: runs the latest published release
                             # → prints the plan, then asks [y/N]
npx -y aio-connect --yes     # same, without the prompt (writes immediately)
# restart your agent so it re-reads its instruction file, then:
npx -y aio-connect ask "pdf to word converter"
```

`npx` needs no install step and always runs the latest release — the right way
to try aio. Keep reading for a permanent `aio` on your PATH.

## 📦 Install

Four channels; pick one.

| Channel | Command | Notes |
|---|---|---|
| **npm global** | `npm install -g aio-connect` | needs **Node.js ≥ 22**; puts `aio` (+ alias `aioc`) on PATH; zero runtime dependencies |
| **npx (trial)** | `npx -y aio-connect` | zero-install, always the latest release; not on PATH — prefix every command, and npx needs the registry once while online |
| **Standalone binary** (no Node) | see below | one executable per platform from the [GitHub release](https://github.com/MRaihan-XXL/all-in-one/releases), sha256-verified |
| **scoop** (Windows) | see below | installs the Windows binary through scoop |

After any channel that puts `aio` on PATH:

```bash
aio                      # interactive: prints the plan, then asks [y/N]
aio --yes                # unattended: apply the plan without prompting
aio --dry-run            # plan only — print every change, write nothing
aio preview              # plan only — show the exact block that would be written
```

> Writes are gated (B-02): no TTY and no `--yes` means **plan only, exit 0,
> nothing written** — safe to pipe.

**Standalone binaries** — release assets `aio-windows-x64.exe`,
`aio-linux-x64`, `aio-linux-arm64`, `aio-darwin-x64`, `aio-darwin-arm64`, next
to `SHA256SUMS` and the cosign-signed `SHA256SUMS.sig`.

Windows (download-then-run; nothing is piped into a shell):

```powershell
iwr https://github.com/MRaihan-XXL/all-in-one/releases/latest/download/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File install.ps1
```

Installs to `%LOCALAPPDATA%\Programs\aio` and adds it to your user PATH.

Linux / macOS:

```bash
curl -fsSL -o /tmp/aio-install.sh https://github.com/MRaihan-XXL/all-in-one/releases/latest/download/install.sh
sh /tmp/aio-install.sh
```

Installs to `~/.local/bin` (override with `BIN_DIR`). Both installers verify
the binary against the release's `SHA256SUMS` before it lands — a mismatch
aborts with nothing installed.

scoop: download `aio-scoop.json` from the release page, then

```powershell
scoop install .\aio-scoop.json
```

> **Binary caveats, stated plainly:**
> - `aio evolve` needs a source or npm install (it runs `npm test` from the
>   checkout) — the standalone binary prints an honest error instead of
>   half-running the pipeline.
> - `aio update` still goes through npm, so it needs `npm` on the machine.
> - `aio doctor` reports the embedded runtime in the node check
>   (`v<node> (supported: >= 22, bun <version> build)`) — that is the
>   compiled runtime, not an installed Node.

> **Uninstall order (real trap):** always run **`aio rollback` FIRST**, then
> `npm rm -g aio-connect` (or delete the binary). Removing the package first
> orphans what it wrote — the injected blocks, the MCP ledger entries and the
> skills ledger stay behind with no tool left to reverse them.

The npm name `aio` was taken — the package is **`aio-connect`**, and it ships
two binaries: **`aio` and `aioc`** (`aioc` is an alias). Adobe's App Builder
CLI (`@adobe/aio`) also owns the binary name `aio` on PATH — if both are
installed globally, use `aioc` for this tool, or run via `npx aio-connect`.
The binary and installer channels need no Node at all.

### Environment variables

| Variable | Effect |
|---|---|
| `AIO_RATE=<calls/min\|0>` | GitHub search budget: default **8 calls/min** unauthenticated, **25/min** once a GitHub token is available (`gh auth login` / `GH_TOKEN`); `0` disables spacing entirely. Spacing is shared across processes via `~/.aio/gh-rate.json` (timestamps only) |
| `AIO_QUIET=1` (or `AIO_NO_BANNER=1`) | no banner |
| `NO_COLOR=1` | no ANSI colors (the banner is already colorless when piped) |
| `AIO_OFFLINE=1` | `aio ask` short-circuits with an explicit offline message; `skill add` refuses remote installs |
| `AIO_NO_GH=1` | skip the GitHub skills lane entirely |
| `AIO_STATE_DIR` | move the state dir off `~/.aio` |
| `GH_TOKEN` / `gh auth login` | authenticated GitHub search (raises the rate budget, enables the skills lane) |
| `OLLAMA_HOST`, `AIO_OLLAMA_MODEL`, `AIO_NO_AI=1` | optional local rerank for `aio ask` (warm only) |

### `--json` and the `schemaVersion` contract

`aio ask --json`, `aio borrow --json` and `aio doctor --json` all emit
`"schemaVersion": 1`. Machine consumers pin to that number: aio bumps it **only
on a breaking shape change**, and new fields are added without a bump —
parse what you need, ignore the rest. `doctor --json` returns
`{schemaVersion, version, mode, ok, issues, warns, checks: [{level, id, detail}]}`.

## 🤖 Honesty is the product

Every agent that reads the manifest **must disclose what it used**, as the
first line of its reply. Enforcement is **instruction-level**: aio injects
that rule into every agent file; compliance is model-dependent (see the
FR6/kimi note below). The required line:

```text
[aio] Using [<name>](<url>) (<type>) — <function>
```

and every final report lists the work done **plus each repo/tool/site as a
markdown link with a one-line function**:

```text
- [[d3](https://github.com/d3/d3)] — chart library, rendered the bar chart
Changes: added chart.js, wired the data feed.
```

`<type>` = `repo | cli | service | skill | site`.

<p align="center">
  <img src="./assets/aio-disclosure.svg" width="98%" alt="Disclosure card: every agent reply begins with the [aio] Using name-url-type-function line — linked, attributed, auditable; first line, every time">
</p>

## 🔁 No search storage

- **No search history by design**: no `ai-tools.db`, no local catalog, no search
  history — `aio ask` results are printed and discarded (**zero search
  storage — results printed, never saved**), and the npm package ships no
  database (`files` = bin, src, test, assets, docs, README, CHANGELOG, LICENSE).
  What aio *does* write: the
  manifest `~/.aio/aio-context.md`, one `AIO AUTO-CONTEXT` block per agent
  file, timestamped backups under `~/.aio/backups/`, `~/.aio/config.json`,
  `~/.aio/mcp-ledger.json` (which MCP entries aio added — read back by
  `aio rollback`), `~/.aio/block-hashes.json` (drift detection),
  `~/.aio/gh-rate.json` (GitHub rate clock — a single `last` call timestamp,
  no queries and no results) and `~/.aio/skills-ledger.json` (name, path,
  sha256 and source of each skill — written **only after an explicit
  `aio skill add`**) — all listed in [docs/CONFIG.md](./docs/CONFIG.md).
- `aio borrow --get` clones into `%TEMP%/aio-borrow` with a **24-hour TTL** —
  the next run purges it, `--clean` wipes everything now.
- CLI tools are consumed via `npx` / `uvx` — never installed permanently.

## ⚙️ What changes on your machine

Everything aio writes is documented in **[docs/CONFIG.md](./docs/CONFIG.md)**.
Short version: one `AIO AUTO-CONTEXT` block per agent instruction file, the
generated `aio-context.md`, MCP entries *only if missing*, and a timestamped
backup of every touched file under `~/.aio/backups/` first. `aio rollback`
reverses exactly what aio added — your own config is never touched.
The one other opt-in writer is `aio skill add`: a single `SKILL.md` under
`~/.agents/skills/` plus its `skills-ledger.json` entry.
No telemetry; the only network calls are your explicit `ask`/`borrow`/
`skill add`, `doctor`'s reachability probe, and the agent's own.

## 🕵️ Keeping it fresh

- **New agent installed?** Run `aio` — the manifest rebuilds and the block is
  injected for the newly detected agent (the catalog itself stays live).
- **Block edited by hand?** `aio status` flags it (`injected*` + stale note);
  the next `aio` run reports `updated (hand-edit replaced — kept in backups/)`
  — your edit stays in `~/.aio/backups/` (hash check via
  `~/.aio/block-hashes.json`).
- **Something drifted?** `aio doctor --fix` (or `--check` in CI).
- **Full self-upgrade?** `aio evolve` runs setup (manifest+blocks) →
  doctor --check → npm test and prints the diff; committing stays your call.
- **Want your machine back?** `aio rollback`.

## 🧩 Supported agents

| Agent | Where the auto-use block lands | MCP ensured | FR6 (disclosure) |
|---|---|---|---|
| `opencode` | `~/.config/opencode/AGENTS.md` | ✅ `opencode.jsonc` | PASS |
| `claude` | `~/.claude/CLAUDE.md` | ✅ `~/.claude.json` | PASS |
| `kimi` | `~/.kimi-code/AGENTS.md` | ✅ `~/.kimi-code/mcp.json` | **⚠ model-dependent** |
| `jcode` | `~/.jcode/AGENTS.md` (fallback `~/AGENTS.md`) | ✅ `~/.jcode/mcp.json` | PASS |
| `codex` | `~/.codex/AGENTS.md` | ✅ `~/.codex/config.toml` | PASS |
| `gemini` | `~/.gemini/GEMINI.md` | ✅ `~/.gemini/settings.json` | PASS |
| `zed` | `%APPDATA%\Zed\AGENTS.md` (Windows) / `~/.config/zed/AGENTS.md` (POSIX) — skipped when no config dir yet | — | — (block target only) |
| `freebuff` | `~/AGENTS.md` (fallback) | — | PASS |
| `hermes` | `~/AGENTS.md` | — | PASS |

> **FR6** = free-form prompt probe: the agent must open its reply with the
> manifest's disclosure line. kimi quotes the rule but does not apply it
> after 9 attempts — model/harness-dependent, not a packaging bug.
> v1.6.0 strengthens the block with a **rule 0** (`0. FIRST LINE RULE
> (non-negotiable …)`) that repeats the exact disclosure line before rule 1,
> aimed at agents that skim later rules; **the kimi retest is still pending** —
> the matrix above is unchanged until it is measured again.

## 🛡 Security

- Threat model: **[docs/THREATS.md](./docs/THREATS.md)** — assets, trust
  boundaries, the T1–T7 threat table, known gaps, reporting.
- **Trust-weighted ranking** — final order = 65% BM25 keyword relevance
  (keyword overlap is the gate) + 35% source popularity prior (`trust01`:
  GitHub stars, npm score, crates downloads; skills neutral), and every
  `aio ask` output ends with:
  `note: ranked by keyword match + source popularity — public results are unvetted; verify before running npx/uvx or cloning (docs/THREATS.md).`
- **`aio --dry-run`** — plan-only setup: prints exactly what would change
  (block inject/update, MCP would-add, manifest would-write) and writes
  **nothing**: no manifest, no block, no MCP entry, no backups, no state files
  (`config.json`, `block-hashes.json` and `mcp-ledger.json` stay untouched).
- **Writes are guarded** — first write requires consent (TTY `[y/N]` prompt or
  explicit `--yes`; non-TTY defaults to read-only plan), then a timestamped
  backup of every touched file before modification, malformed target configs
  reported as `parse error` and never overwritten, rollback ledger for MCP
  entries (`aio rollback` reverses exactly what aio added).
- **`gh` token** — read at call time into memory only, never logged or
  persisted; authenticated requests also raise the GitHub rate limit.
- **Skill installs are ledger-scoped** — `aio skill add` writes only
  `~/.agents/skills/<name>/SKILL.md` (name sanitized, path-traversal guarded)
  and records its sha256 in `~/.aio/skills-ledger.json`; `aio skill remove`
  and `aio rollback` delete a skill only while it is still byte-identical to
  what aio wrote — hand-modified or pre-existing skills are never touched.
- **Release integrity (v1.6.0)** — the installers download first and verify
  against the release's `SHA256SUMS` before anything lands (a mismatch aborts
  with nothing installed; no remote script is piped into a shell); `SHA256SUMS`
  is cosign keyless-signed (`SHA256SUMS.sig`); the release workflow refuses a
  tag that is not the tip of `main`, then builds all 5 binaries and
  smoke-tests the ones the build OS can execute (`aio-darwin-x64` and
  `aio-linux-arm64` are cross-built and not yet smoked — see
  [ROADMAP.md](./ROADMAP.md)).
- **Packaging** — zero runtime dependencies, no install/postinstall scripts,
  npm publish behind 2FA/EOTP.
- Known gaps, stated plainly: the release binaries are not individually
  signed (only `SHA256SUMS` carries a cosign signature; npm provenance is not
  configured yet), and disclosure is instruction-level (model-dependent), not
  technically enforced.

## 🛠 Development

```bash
npm test             # node --test — 209 tests (live search, injection, consent gate, drift, borrow, doctor, …)
npm run test:coverage # same suite with node's built-in coverage
node bin/aio.js      # run from a checkout without installing
node bin/aio.js ask "pdf ke word"
node bin/aio.js doctor --check
node scripts/eval-relevance.mjs   # from a repo checkout (scripts/ ships in the repo, not the npm tarball): live 20-query golden set → hit@8 = 20/20 (100%), hit@1 = 19/20 (95%), MRR 0.97, measured 2026-10-01
```

Contribution workflow and conventions: **[CONTRIBUTING.md](./CONTRIBUTING.md)**.
Planned work: **[ROADMAP.md](./ROADMAP.md)**.

## 🎨 Brand kit

Identity ("three streams, one node"), palette, favicon sizes, CLI banner grid
and usage rules live in **[assets/logo-gallery.html](./assets/logo-gallery.html)**;
source SVGs (including the animated hero + flowchart) are in
[`assets/`](./assets/).

## License

[GPL-3.0](./LICENSE) © MRaihan-XXL
