# Threat model — aio

Scope: the `aio-connect` package (binaries `aio` / `aioc`) as installed
globally from npm, plus the artifacts it writes on the user's machine and the
untrusted content it surfaces through `aio ask`. This document is the answer
both external reviews asked for: what aio protects, what it does not, and
where the remaining risk sits.

## 1. Assets

| Asset | Why it matters |
|---|---|
| Agent instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, …) | every future agent session reads them; a corrupted or hijacked block rewrites agent behavior |
| Agent MCP configs (`opencode.jsonc`, `~/.claude.json`, `mcp.json`, `settings.json`, `config.toml`) | MCP entries make tools callable by the agent |
| `~/.aio/` state + manifest (`config.json`, `aio-context.md`, `mcp-ledger.json`) | drives what gets injected and what `rollback` reverses |
| Timestamped backups under `~/.aio/backups/` | the only restore path after a bad write |
| In-memory `gh` token | authenticates GitHub code search; grants API quota |
| The user's shell | agents execute code; anything an agent runs is code execution on this machine |

## 2. Trust boundaries

| # | Boundary | Crossing |
|---|---|---|
| a | **aio = high-privilege config writer, installed globally** | one command edits instruction files and MCP configs of every agent on the machine |
| b | **`aio ask` results = untrusted third-party metadata** | names, descriptions and URLs come from public registries aio does not control |
| c | **agent = autonomous code executor** | the agent decides what to run; aio's rules are instructions, not a sandbox |
| d | **package registries = untrusted supply chain** | anything surfaced by search can be typosquatted, stale, or malicious |

## 3. Threat table

| ID | Threat | Impact | Mitigation (built) | Residual |
|---|---|---|---|---|
| T1 | Malicious/typosquat package surfaced by search → agent runs `npx` / `uvx` / clones it → arbitrary code execution | High — code runs with the user's privileges | keyword gate + trust-weighted ranking (65% BM25 keyword relevance, 35% source-popularity prior `trust01` — stars/downloads/npm score demote unknowns); **verify-before-run note printed on every `aio ask` output**; ephemeral-only guidance in the injected block (`npx`/`uvx`, never permanent install); human oversight before running anything | **MEDIUM** — popularity is not a safety guarantee; review before running |
| T2 | Prompt injection via README / `SKILL.md` bodies | Medium — injected instructions could steer the agent | aio prints only metadata (name, one-line description, path, URL) — it never injects file contents into agent context; `borrow` clones are temp with a 24 h TTL | **MEDIUM** — the agent may read cloned files itself, outside aio's control |
| T3 | Config corruption / crash mid-write | High — agent files or MCP configs left broken | timestamped backup of every touched file **before** modification; `JSON.parse` verify-before-write; single idempotent marker block; rollback ledger for MCP entries; `aio --dry-run` plan-first review (writes nothing); malformed target configs reported as `parse error` and **never overwritten** (tested) | **LOW** |
| T4 | Token exposure | High — GitHub credential leak | `gh auth token` read at call time into memory only; request headers never logged or written to disk | **LOW** |
| T5 | aio's own supply chain | High — a compromised release reaches every install | zero runtime dependencies; no install/postinstall scripts; GPL-3.0 source; npm publish behind 2FA/EOTP; CI on 3 OS | **Known gap:** releases are not signed |
| T6 | Path traversal via backup labels | Medium — write outside the backup dir | labels sanitized `[^a-z0-9_-]` before joining `BACKUP_DIR` | **LOW** |
| T7 | Telemetry / exfiltration | Medium — user data leaves the machine | none exists — network calls are only github/npm/crates + localhost Ollama + `doctor` probes | none (by construction) |

## 4. Enforcement honesty

The `[aio] Using …` usage-disclosure rule is **instruction-level, not
technically enforced**: aio injects the rule into every agent file, and
whether the agent follows it is model-dependent. Per-agent probe results live
in the README support matrix (kimi = model-dependent after 9 attempts). Do not
read "the block says mandatory" as "the product guarantees compliance".

## 5. Known gaps / future work

- **Unsigned releases** — npm provenance/signing not yet configured (T5).
- **Popularity ≠ trust** — the 35% prior demotes unknowns but cannot prove
  safety (T1 residual).
- **Rate limits** — unauthenticated GitHub search is low-rate; the skills lane
  (`gh api search/code?q=filename:SKILL.md`) needs an authenticated `gh`
  (`gh auth login`, or `GH_TOKEN`/`GITHUB_TOKEN`) or it returns `[]`
  (see [CONFIG.md](./CONFIG.md)).
- **Agent autonomy beyond aio's reach** — once an agent decides to execute
  code, aio has no control (T1/T2 residual).

## 6. Reporting

Report security issues via [GitHub issues](https://github.com/MRaihan-XXL/all-in-one/issues)
on the public repository. Do not include credentials, tokens, or `.env`
contents in an issue.
