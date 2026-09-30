# How the aio flow diagram works

The README's animated explainer is `assets/flow.svg`: a single static SVG that
also animates itself — no JavaScript, no runtime dependency, no external
assets. The original three-hop diagram `docs/flow.svg` uses the same technique.
This page documents what the flow shows, how the motion is built, and how it is
verified.

## What the flow shows

Six steps, one loop — as drawn in `assets/flow.svg` (the live pipeline; there
is no catalog-miss branch since v1.3.0):

| # | Step | Meaning |
|---|---|---|
| 1 | **Your prompt** | plain-language input ("I need an awesome X"); no `/slash-command` needed |
| 2 | **`aio ask "<what you need>"`** | **LIVE · ADAPTIVE · ≤ 4 s per source** — parallel lanes **github** (630M+ repos + `filename:SKILL.md` skill files, 6.8M+), **npm** (3M+ packages), **crates** (340K+), plus **web → your agent's own web search**; intent routing (rust → crates, skill words → skills, URL → web hint) and generic-word stripping for GitHub |
| 3 | **top-8 ranked** | sources merged and ranked: **BM25 blended with source trust (65% relevance + 35% popularity prior)**, source diversity (≥ 2 rows per answering source), qwen3 rerank only when warm (≤ 3.5 s); **every hit prints URL + one-line function + `<github>`/`<npm>`/`<crates>` tag**; **no search storage (results discarded)** |
| 4 | **use ephemerally** | `npx` / `uvx` / copy — ephemeral, never a permanent install; or `aio borrow --get owner/repo` shallow-clones into `%TEMP%\aio-borrow` (**24 h TTL**, ≥ 1 GB free-disk guard) |
| 5 | **report + disclosure** | disclosure `[aio] Using [<name>](<url>) (<type>) — <function>` (injected rule — compliance model-dependent): WHAT CHANGED + every repo/tool/site used, each as a markdown link + one-line function |
| 6 | **`aio borrow --clean`** | wipe temp clones (`--list` inspects them first; expired clones are purged automatically) — then the loop continues with the next prompt |

Environment gates: `AIO_OFFLINE=1` makes `aio ask` fail loudly offline (by
design there is no local catalog to fall back to); `AIO_NO_GH=1` skips the
`gh` subprocess (used in tests).

`docs/flow.svg` tells the same story in three hops: **Your prompt → AI agent**
(no slash-command), **aio manifest → AI agent** (dashed, vermilion — the
aio-owned edge feeding `REPOS · TOOLS · SKILLS`), **AI agent → Your
answer** (the reply carries the disclosure line, name linked to the manifest
URL). Its manifest box is drawn **dashed** on purpose: it is not a step the
user triggers — it is background context that feeds the agent continuously.
That file predates v1.3.0 and is kept as-is: today's manifest is slim (live
rules + disclosure + agents — no catalog tables), so `assets/flow.svg` above
is the authoritative diagram.

## Commands in the flow

| Command | Role |
|---|---|
| `aio` | one-time setup: scan → slim manifest → inject agent blocks (idempotent) |
| `aio status` | read-only health report |
| `aio ask "<prompt>"` | step 2 — **live** search across GitHub (repos + skill files), npm and crates in parallel; link + function + source tag per hit; `--json` for machine-readable output (`stored: 0`) |
| `aio borrow "<kw>"` | optional live GitHub search for what you want to **clone** — discovery itself is `ask`'s job, not a catalog-miss fallback |
| `aio borrow --get <owner/repo>` | step 4 — shallow clone to temp, 24 h TTL |
| `aio borrow --list` / `--clean` | step 6 — inspect / wipe temp clones |
| `aio doctor [--check\|--fix]` | self-diagnosis: node · state · live sources · manifest-sync · agent blocks · Ollama; `--check` = CI gate |
| `aio evolve` | self-upgrade pipeline: install-plan scan → setup → doctor → `npm test`; never commits |
| `aio update` / `aio rollback` | reinstall from npm / remove everything aio injected |

## How the animation works

The motion is pure SVG — no JavaScript in either diagram. The original
`docs/flow.svg` uses **SMIL `animateMotion`**: each arrow has a `<circle>`
that travels along *the exact same path data* as the arrow it rides — so a
pulse can never drift off its track.

```xml
<path id="p1" d="M250,198 H285 V98 H316" marker-end="url(#ah)"/>
<circle r="5" fill="#FF4A1C">
  <animateMotion dur="2.4s" begin="0s" repeatCount="indefinite"
                 path="M250,198 H285 V98 H316"/>
</circle>
```

Design decisions (`docs/flow.svg`):

- **2.4 s loop, three phases (`begin` 0 s / 0.8 s / 1.6 s)** — the stagger
  reads as causality: prompt leaves first, context follows, result arrives
  last. One cycle tells the whole story even at low frame rates.
- **Pulses ride the arrows, arrows stay static** — direction is legible even
  with animation disabled or dropped (e.g. static PNG export).
- **The manifest pulse is on the dashed vermilion edge** — reinforces which
  edge aio owns; the two solid edges belong to the user↔agent exchange.
- **`repeatCount="indefinite"`, no JavaScript** — works inside `<img>` embeds,
  on GitHub README rendering, and offline.

The README diagram `assets/flow.svg` (v1.3.0 live pipeline) keeps the same
rules but a different mechanism, because the six-step layout is card-based:

- **Connectors draw themselves** — `<animate attributeName="stroke-dashoffset"
  values="100;0">` on each hairline, staggered `begin` 1.4 s → 4.0 s so the
  pipeline builds in reading order.
- **Cards fade/rise in via CSS `@keyframes`** (`draw`, `fadeIn`, `rise`,
  `hl`) with per-card `animation-delay`; no JS, no layout shift.
- **Lane and loop-back accents blink with SMIL `opacity`**
  (`repeatCount="indefinite"`), so the parallel github/npm/crates lanes read
  as live even in a frozen frame.

## Accessibility & graceful degradation

- The root `<svg>` carries `role="img"` and an `aria-label` describing the
  full flow — screen readers get the semantics without the motion.
- The diagram is fully meaningful as a **single frozen frame**: motion is
  decorative, not informational (WCAG 2.3.1 acceptable as autoplaying,
  non-essential animation).
- No external fonts or images are referenced — layout cannot break.

## Design tokens

`docs/flow.svg` palette:

| Token | Value | Used for |
|---|---|---|
| Ink | `#101418` | canvas |
| Surface | `#171D23` | node boxes |
| Paper | `#F7F5F2` | titles, solid arrows, arrowheads |
| Muted | `#9AA3AD` | captions, step labels |
| Vermilion | `#FF4A1C` | manifest edge, manifest box stroke, pulses |

Same palette as the brand kit (`assets/logo-gallery.html`) — diagram and logo
system are one identity. `assets/flow.svg` (the six-step README diagram) uses a
GitHub-dark palette instead: `#0d1117` canvas, `#161b22` boxes, `#e6edf3` text,
`#8b949e` captions, blue/green/amber accents.

## Verification (how we prove it animates)

Headless Chromium renders the SVG at two virtual-time budgets and the output
hashes are compared:

```powershell
# frame A vs frame B — different bytes ⇒ animateMotion advanced
msedge --headless=new --screenshot=frameA.png --window-size=940,480 `
       --virtual-time-budget=500  docs/flow.svg
msedge --headless=new --screenshot=frameB.png --window-size=940,480 `
       --virtual-time-budget=1800 docs/flow.svg
```

Recorded result (2026-09-28): frame A `FFDE6A1CF6E8…`, frame B
`21CB7403F90A…` — pulses visibly moved along all three edges; palette and the
8-agent list re-skin to the v1.1.0 identity in the same pass.

The v1.3.0 rewrite of `assets/flow.svg` (the six-step live pipeline above) was
re-verified the same way on 2026-09-30: headless Edge screenshots of hero,
flow and stats, all visually checked. A second pass the same day switched the
diagram to **full-English labels** ("use ephemerally", "report every link",
"I need an awesome X") and fixed the loop-back wire's `stroke-dasharray`
(inline 1600 → shared `.wireL` class at 1400, also honored under
`prefers-reduced-motion`).

## Embedding

```html
<img src="./assets/flow.svg" width="100%"
     alt="How aio works: prompt → aio ask (live github ∥ npm ∥ crates) → top-8 ranked → use ephemerally → report with links → clean">
```

`docs/flow.svg` embeds the same way (substitute the path); both were verified
frame-by-frame with the capture snippet above. GitHub README renders SMIL
inside `<img>` (Chromium-based viewers animate; Safari/WebGL-less contexts show
the correct static frame).
