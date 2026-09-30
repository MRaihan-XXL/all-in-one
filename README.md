<p align="center">
  <img src="./assets/aio-hero.svg" width="92%" alt="aio — the everything connector for AI agents: live catalog + prompt flow">
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
  <img src="./assets/flow.svg" width="98%" alt="Animated flowchart: prompt → aio ask → aio borrow → use ephemerally → report with links → clean">
</p>

<p align="center">
  <img src="./assets/aio-stats.svg" width="98%" alt="Verified: 231 repos · 23 tools · 45 sites · 67 skills · 30/30 tests · green CI">
</p>

## ✨ What it does

`aio` builds a **catalog** of everything you have — 231 repos, 23 tools,
45 curated sites, 67 skills — and teaches every AI agent on your machine to
**search it automatically** on each prompt:

```text
prompt → aio ask (catalog + local-AI rerank) → aio borrow (live GitHub, temp)
       → use it ephemerally → report WHAT changed + EVERY link used + function
       → aio borrow --clean
```

| Command | What you get |
|---|---|
| `aio` | scan → manifest → inject the auto-use block into every agent |
| `aio ask "csv ke chart"` | search the catalog — every hit prints **link + one-line function**; reranked by your local Ollama (qwen3) when it is up, silent BM25 fallback when not |
| `aio borrow "etl tool"` | **live GitHub search** for what the catalog lacks → `--get owner/repo` shallow-clones to temp (**24 h TTL**, auto-purged), `--clean` wipes it |
| `aio doctor` | self-diagnosis: db ↔ manifest ↔ agent blocks ↔ Ollama; `--fix` repairs, `--check` = CI gate |
| `aio evolve` | the whole self-upgrade pipeline in one run: scan → build-db → manifest → doctor → tests (never commits) |
| `aio status` | read-only health report |
| `aio update` / `aio rollback` | update from npm / remove everything aio injected |

Example — real `aio ask` output (links + functions always included):

```text
aio ask — "csv ke chart interaktif" (engine: ollama:qwen3:4b · 4 hasil)

1. d3 [repo] — Bring data to life with SVG, Canvas and HTML.
   Charts / DataViz · ★113779
   https://github.com/d3/d3
   why: d3 is a leading library for interactive SVG/HTML charts, fits CSV data visualization
```

## 📦 Install

```bash
npm install -g aio-connect
```

> The npm name `aio` was taken — the package is **`aio-connect`**, the binary
> stays `aio`. Requires **Node.js ≥ 22** (`node:sqlite` built in).

## 🤖 Honesty is the product

Every agent that reads the manifest **must disclose what it used**, as the
first line of its reply:

```text
[aio] Using [<name>](<url>) (<type>) — <function>
```

and every final report lists the work done **plus each repo/tool/site as a
markdown link with a one-line function**:

```text
- [[d3](https://github.com/d3/d3)] — chart library, rendered the bar chart
Perubahan: added chart.js, wired the data feed.
```

`<type>` = `repo | cli | service | skill | site`.

## 🔁 Nothing is stored permanently

- `aio borrow --get` clones into `%TEMP%/aio-borrow` with a **24-hour TTL** —
  the next run purges it, `--clean` wipes everything now.
- CLI tools are consumed via `npx` / `uvx` — never installed permanently.
- The catalog (metadata, not files) lives in the shipped `ai-tools.db` —
  you can delete every local clone and `aio ask` still works.

## ⚙️ What changes on your machine

Everything aio writes is documented in **[docs/CONFIG.md](./docs/CONFIG.md)**.
Short version: one `AIO AUTO-CONTEXT` block per agent instruction file, the
generated `aio-context.md`, MCP entries *only if missing*, and a timestamped
backup of every touched file under `~/.aio/backups/` first. `aio rollback`
reverses exactly what aio added — your own config is never touched.
No telemetry; the only network calls are your explicit `ask`/`borrow` and
the agent's own.

## 🕵️ Keeping it fresh

- **New repo cloned?** Run `aio` — the manifest rebuilds from the catalog db.
- **Something drifted?** `aio doctor --fix` (or `--check` in CI).
- **Full self-upgrade?** `aio evolve` runs scan → build-db → manifest →
  doctor → tests and prints the diff; committing stays your call.
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
| `freebuff` | `~/AGENTS.md` (fallback) | — | PASS |
| `hermes` | `~/AGENTS.md` | — | PASS |

> **FR6** = free-form prompt probe: the agent must open its reply with the
> manifest's disclosure line. kimi quotes the rule but does not apply it
> after 9 attempts — model/harness-dependent, not a packaging bug.

## 🛠 Development

```bash
npm test             # node --test — 30 checks (injection, search, borrow, doctor, …)
node bin/aio.js      # run from a checkout without installing
node bin/aio.js ask "pdf ke word"
node bin/aio.js doctor --check
```

## 🎨 Brand kit

Identity ("three streams, one node"), palette, favicon sizes, CLI banner grid
and usage rules live in **[assets/logo-gallery.html](./assets/logo-gallery.html)**;
source SVGs (including the animated hero + flowchart) are in
[`assets/`](./assets/).

## License

[GPL-3.0](./LICENSE) © MRaihan-XXL
