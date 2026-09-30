# How the aio flow diagram works

The README's animated explainer is `assets/flow.svg`: a single static SVG that
also animates itself — no JavaScript, no runtime dependency, no external
assets. The original three-hop diagram `docs/flow.svg` uses the same technique.
This page documents what the flow shows, how the motion is built, and how it is
verified.

## What the flow shows

Six steps plus one branch — as drawn in `assets/flow.svg`:

| # | Step | Meaning |
|---|---|---|
| 1 | **Your prompt** | plain-language input; no `/slash-command` needed |
| 2 | **`aio ask "<what you need>"`** | catalog search over repos · tools · sites · skills: BM25, reranked by local Ollama `qwen3` when it is up; **every hit prints URL + one-line function** (catalog: 231 repos · 23 tools · 45 sites) |
| 3a | **hit → use the entry** | take the catalog entry (link + function): a repo, tool, site or skill already known locally |
| 3b | **miss → `aio borrow "<keywords>"`** | live GitHub search for what the catalog lacks |
| 4 | **Use ephemerally** | `aio borrow --get owner/repo` shallow-clones into `%TEMP%\aio-borrow` (**24 h TTL**, ≥ 1 GB free-disk guard) — or run `npx`/`uvx`, or open the site; nothing installed permanently |
| 5 | **Report** | mandatory disclosure `[aio] Using [<name>](<url>) (<type>) — <function>`: WHAT CHANGED + every repo/tool/site used, each as a markdown link + one-line function |
| 6 | **`aio borrow --clean`** | wipe temp clones (`--list` inspects them first; expired clones are purged automatically) |

`docs/flow.svg` tells the same story in three hops: **Your prompt → AI agent**
(no slash-command), **aio manifest → AI agent** (dashed, vermilion — the
aio-owned edge feeding `REPOS · TOOLS · SITES · SKILLS`), **AI agent → Your
answer** (the reply carries the disclosure line, name linked to the manifest
URL). Its manifest box is drawn **dashed** on purpose: it is not a step the
user triggers — it is background context that feeds the agent continuously.

## Commands in the flow

| Command | Role |
|---|---|
| `aio` | one-time setup: scan → manifest → inject agent blocks (idempotent) |
| `aio status` | read-only health report |
| `aio ask "<prompt>"` | step 2 — catalog search, link + function per hit; `--json` for machine-readable output |
| `aio borrow "<kw>"` | step 3b — live GitHub search for what the catalog lacks |
| `aio borrow --get <owner/repo>` | step 4 — shallow clone to temp, 24 h TTL |
| `aio borrow --list` / `--clean` | step 6 — inspect / wipe temp clones |
| `aio doctor [--check\|--fix]` | self-diagnosis: node · state · db · manifest-sync · agent blocks · Ollama; `--check` = CI gate |
| `aio evolve` | self-upgrade pipeline: scan → `build-db --enrich` → setup → doctor → `npm test`; never commits |
| `aio update` / `aio rollback` | reinstall from npm / remove everything aio injected |

## How the animation works

The motion is pure SVG **SMIL**: each arrow has a `<circle>` with an
`animateMotion` that travels along *the exact same path data* as the arrow it
rides — so a pulse can never drift off its track.

```xml
<path id="p1" d="M250,198 H285 V98 H316" marker-end="url(#ah)"/>
<circle r="5" fill="#FF4A1C">
  <animateMotion dur="2.4s" begin="0s" repeatCount="indefinite"
                 path="M250,198 H285 V98 H316"/>
</circle>
```

Design decisions (`docs/flow.svg`; `assets/flow.svg` follows the same rules with
seven pulses bound via `<mpath href="#f1"/>`, staggered over 1.4–2.6 s):

- **2.4 s loop, three phases (`begin` 0 s / 0.8 s / 1.6 s)** — the stagger
  reads as causality: prompt leaves first, context follows, result arrives
  last. One cycle tells the whole story even at low frame rates.
- **Pulses ride the arrows, arrows stay static** — direction is legible even
  with animation disabled or dropped (e.g. static PNG export).
- **The manifest pulse is on the dashed vermilion edge** — reinforces which
  edge aio owns; the two solid edges belong to the user↔agent exchange.
- **`repeatCount="indefinite"`, no JavaScript** — works inside `<img>` embeds,
  on GitHub README rendering, and offline.

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

## Embedding

```html
<img src="./assets/flow.svg" width="100%"
     alt="How aio works: prompt → aio ask → aio borrow (temp clone) → use ephemerally → report with links → clean">
```

`docs/flow.svg` embeds the same way (substitute the path); both were verified
frame-by-frame with the capture snippet above. GitHub README renders SMIL
inside `<img>` (Chromium-based viewers animate; Safari/WebGL-less contexts show
the correct static frame).
