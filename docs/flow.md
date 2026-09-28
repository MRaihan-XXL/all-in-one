# How the aio flow diagram works

`docs/flow.svg` is the README's animated explainer: a single static SVG that
also animates itself — no JavaScript, no runtime dependency, no external
assets. This page documents what it shows, how the motion is built, and how it
is verified.

## What the diagram shows

Four nodes, three numbered hops:

| # | Hop | Meaning |
|---|---|---|
| 1 | **Your prompt → AI agent** | plain-language input; no `/slash-command` needed |
| 2 | **aio manifest → AI agent** | the agent pulls `REPOS · TOOLS · SKILLS` context on its own (dashed, vermilion — it is the aio-owned edge) |
| 3 | **AI agent → Your answer** | the reply carries the disclosure line `[aio] Using <name> (<type>) — <function>` |

The manifest box is drawn **dashed** on purpose: it is not a step the user
triggers — it is background context that feeds the agent continuously.

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

Design decisions:

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

| Token | Value | Used for |
|---|---|---|
| Ink | `#101418` | canvas |
| Surface | `#171D23` | node boxes |
| Paper | `#F7F5F2` | titles, solid arrows, arrowheads |
| Muted | `#9AA3AD` | captions, step labels |
| Vermilion | `#FF4A1C` | manifest edge, manifest box stroke, pulses |

Same palette as the brand kit (`assets/logo-gallery.html`) — diagram and logo
system are one identity.

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
<img src="./docs/flow.svg" width="100%"
     alt="How aio works: your prompt → AI agent (fed by the aio manifest) → answer with disclosed usage">
```

GitHub README renders SMIL inside `<img>` (Chromium-based viewers animate;
Safari/WebGL-less contexts show the correct static frame).
