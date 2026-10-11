# Show HN draft (not posted)

Manual post only — do not submit this file anywhere automatically.

## Title

Primary (recommended):

    Show HN: aio – zero-storage live search for AI coding agents

Alternates:

    Show HN: aio-connect – live GitHub/npm/crates search wired into every AI agent
    Show HN: I A/B-tested an LLM rerank, got 0/114 in budget, deleted it (and shipped aio)

## Body

I'm the author.

aio (npm package `aio-connect`) is a CLI that connects every AI coding agent on
your machine to live search. It injects one instruction block into each agent's
config, then provides `aio ask` / `aio agent` commands that search GitHub, npm
and crates on every prompt — results are printed and discarded, never stored.

How it works:

- `aio` scans for installed agents (opencode, Claude Code, kimi, codex, gemini
  and others), prints the exact plan, and writes only after consent. Each
  touched file gets a timestamped backup; `aio rollback` removes exactly what
  aio added.
- `aio ask "pdf to word converter"` queries GitHub (630M+ repos), npm (3M+
  packages) and crates (340K+ crates) in parallel with a 4s-per-source budget,
  merge-ranks with BM25 plus a source-popularity trust weight, prints a link
  and a one-line function for every hit, then throws the results away. No
  catalog, no search database.
- The injected block mandates disclosure: a reply that used an aio-surfaced
  tool must open with `[aio] Using [<name>](<url>) (<type>) — <function>` and
  list every tool used in the final report. This is an instruction-level
  contract — the README's agent matrix records which agents pass and which are
  model-dependent.
- A failing source is reported as a source issue in the output, never faked as
  "0 hits".

Real `aio ask` output, abridged:

```text
aio ask — "awesome animated chart library" (live: github+npm · 7 results · 4.8s)

1. lightweight-charts [tool] <npm> — Performant financial charts built with HTML5 canvas
   https://www.npmjs.com/package/lightweight-charts
2. scichart [tool] <npm> — Fast WebGL JavaScript Charting Library and Framework
   https://www.npmjs.com/package/scichart
```

The ranking claims are measured, not asserted. The repo ships a 114-query
held-out golden set (`scripts/eval-relevance.mjs`); the latest run
(`eval-result.json`, refreshed by a nightly workflow) scored hit@8 114/114,
hit@1 113/114 (99.1%), MRR 0.994. I also A/B-tested a local Ollama qwen3
rerank stage on that same set: 0 of 114 calls answered inside its 3.5s budget
(p50 3502ms) while the BM25-plus-trust baseline was already near the ceiling,
so I removed it — an honest zero beats a slow maybe. The suite is 325 tests,
and a machine-checkable scorecard must hit 100/100 before npm publish.

Zero runtime dependencies, Node.js >= 22, GPL-3.0.

- Repo: https://github.com/MRaihan-XXL/all-in-one
- npm: https://www.npmjs.com/package/aio-connect

What I'd like feedback on: whether an instruction-level disclosure contract is
worth the injected block size, or a smaller footprint would be preferable —
and whether the nightly eval numbers change how much you'd trust a search tool
that keeps nothing on disk.

## Posting checklist

- [ ] Post manually on Hacker News (Submit → "Show HN"); this file is a draft only.
- [ ] Best window: Tuesday–Thursday, 9–11am ET.
- [ ] Reply to comments in the first 2 hours — that window decides the thread.
- [ ] When pasting examples into comments, keep `AIO_*` env vars, `GH_TOKEN`
      and any tokens out; use the abridged `aio ask` output above.
- [ ] Current published version matches the draft (post-release: 1.9.2) — don't claim the
      unreleased version in comments.
- [ ] Every number in the post traces to README.md, eval-result.json,
      docs/SCORECARD.md or the test suite — keep it that way if you edit.
