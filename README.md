<p align="center">
  <img src="./assets/aio-hero.svg" width="92%" alt="aio — the everything connector for AI agents: 100% live search across github, npm and crates — 0 bytes stored">
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
  <img src="./assets/flow.svg" width="98%" alt="Animated live pipeline: prompt → aio ask (github, npm and crates searched in parallel) → top-8 ranked → use ephemerally → report with links → clean → loop">
</p>

<p align="center">
  <img src="./assets/aio-stats.svg" width="98%" alt="Verified live corpus: 400M+ GitHub repos · 3M+ npm packages · 150K+ crates · 33K+ skill files · 0 bytes stored · 34/34 tests">
</p>

## ✨ What it does

`aio` has **no bundled catalog and no database** — it teaches every AI agent on
your machine to **search live on each prompt**: GitHub (**400M+ repos** plus
`filename:SKILL.md` public skills), npm (**3M+ packages**) and crates
(**150K+ crates**), queried in parallel; websites go through your agent's own
built-in web search. Results are printed, ranked and used — **0 bytes are ever
stored**:

```text
prompt → aio ask (live: github ∥ npm ∥ crates) → top-8 ranked (BM25 + diversity)
       → use it ephemerally → report WHAT changed + EVERY link used + function
       → aio borrow --clean
```

| Command | What you get |
|---|---|
| `aio` | scan → slim manifest → inject the auto-use block into every agent |
| `aio ask "csv ke chart"` | **live search** across GitHub (400M+ repos + public skills), npm (3M+ pkgs) and crates in parallel (4 s per source), merge-ranked with BM25 + source diversity; every hit prints **link + one-line function + `<github>`/`<npm>`/`<crates>` tag**; reranked by your local Ollama (qwen3) only when it is warm and fast; `--json` → `{…, stored: 0, hits}` |
| `aio borrow "etl tool"` | **optional ephemeral fetch** — `--get owner/repo` shallow-clones to temp (**24 h TTL**, auto-purged), `--list` inspects, `--clean` wipes it. Not a fallback for `ask`: use it when you actually need the files locally |
| `aio doctor` | self-diagnosis: node · state · live sources · manifest ↔ agent blocks ↔ Ollama; `--fix` repairs, `--check` = CI gate |
| `aio evolve` | the whole self-upgrade pipeline in one run: install-plan scan → setup → doctor → tests (never commits) |
| `aio status` | read-only health report |
| `aio update` / `aio rollback` | update from npm / remove everything aio injected |

Example — real `aio ask` output, abridged (links + functions always included):

```text
aio ask — "awesome animated chart library" (live: github+npm · 8 hasil · 5.0s)

2. vizzuhq/vizzu-lib [repo] <github> — Library for animated data visualizations and data stories.
   ★2037 · JavaScript
   https://github.com/vizzuhq/vizzu-lib
   why: BM25 keyword match (#2)
5. lightweight-charts [tool] <npm> — Performant financial charts built with HTML5 canvas
   v5.2.1 · financial-charting-library · charting-library · html5-charts
   https://www.npmjs.com/package/lightweight-charts
   why: BM25 keyword match (#5)
```

## 📦 Install

```bash
npm install -g aio-connect
```

> The npm name `aio` was taken — the package is **`aio-connect`**, the binary
> stays `aio`. Requires **Node.js ≥ 22** (zero runtime dependencies).

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

- **Zero storage by design**: no `ai-tools.db`, no local catalog, no search
  history — `aio ask` results are printed and discarded (**0 bytes stored**),
  and the npm package ships no database (`files` = bin, src, assets, docs).
- `aio borrow --get` clones into `%TEMP%/aio-borrow` with a **24-hour TTL** —
  the next run purges it, `--clean` wipes everything now.
- CLI tools are consumed via `npx` / `uvx` — never installed permanently.

## ⚙️ What changes on your machine

Everything aio writes is documented in **[docs/CONFIG.md](./docs/CONFIG.md)**.
Short version: one `AIO AUTO-CONTEXT` block per agent instruction file, the
generated `aio-context.md`, MCP entries *only if missing*, and a timestamped
backup of every touched file under `~/.aio/backups/` first. `aio rollback`
reverses exactly what aio added — your own config is never touched.
No telemetry; the only network calls are your explicit `ask`/`borrow`,
`doctor`'s reachability probe, and the agent's own.

## 🕵️ Keeping it fresh

- **New repo cloned?** Run `aio` — the manifest rebuilds from the fresh scan
  (clones feed only the optional install plan; the catalog itself stays live).
- **Something drifted?** `aio doctor --fix` (or `--check` in CI).
- **Full self-upgrade?** `aio evolve` runs install-plan scan → setup →
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
npm test             # node --test — 34 checks (live search, injection, borrow, doctor, …)
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
