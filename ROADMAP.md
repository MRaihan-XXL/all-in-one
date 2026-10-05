# Roadmap

Planned work for `aio-connect`, newest release scope excluded (that lives in
`CHANGELOG.md`). Items are written as verifiable outcomes, not aspirations —
an item is done when the stated check passes.

## Done in v1.7.0 (details in `CHANGELOG.md`)

- **npm provenance** — `npm publish --access public --provenance` (OIDC;
  `release.yml` already grants `id-token: write`); the published tarball now
  carries an attestation to its source commit.
- **scoop autoupdate per release** — the generated `aio-scoop.json` ships
  `checkver` + `autoupdate` (release URL + `SHA256SUMS` regex), so
  `scoop update` resolves each release and pins it to the checksum file.
- **`aio skill search "<query>" [--add]`** — live skill discovery in one
  step: ranked hits with ready-to-run `aio skill add …` commands; `--add`
  installs the top hit; `--json` supported.
- **help i18n** — `AIO_LANG=id` prints the full Bahasa Indonesia help
  (`HELP_ID`, mirrors the English text line-for-line).
- **Completion generated from a single source** — `COMMANDS` / `FLAGS` live
  once in `src/completion.js`; `bin/aio.js` imports them for dispatch,
  unknown-flag warnings and help, so a new command cannot be missed by one of
  the two.

## Distribution & release

- **macOS x64 native smoke** — `aio-darwin-x64` is cross-compiled on ubuntu
  and never executed on an Intel mac; add a native smoke step before calling
  it tested.
- **linux-arm64 smoke via qemu** — same gap for `aio-linux-arm64`
  (`qemu-user-static` or an arm64 runner).
- **Individually signed binaries** — npm provenance now covers the npm
  tarball (v1.7.0), but the 5 standalone binaries still rely on the
  cosign-signed `SHA256SUMS`; per-asset signatures remain open (T5 in
  `docs/THREATS.md`).

## Evaluation & docs

- **Auto-regenerate `assets/aio-stats.svg` (P15)** — render the strip from
  nightly `eval.yml` results instead of a hand-edited figure, so the embedded
  counts and test claims cannot go stale. **Status: NOT done** — the v1.7.0
  stats cell (`254 · 253 pass · 1 skip · 0 fail`) was still updated by hand.
- **README eval badge from nightly `eval.yml`** — same source of truth,
  badge form. **Status: NOT done.**
- **FR6 disclosure retest matrix** — rule 0 (`0. FIRST LINE RULE …`
  repeating the exact disclosure line before rule 1) shipped in v1.6.0;
  re-run the free-form prompt probe per agent, kimi first. Status: shipped,
  **retest ATTEMPTED 2026-10-05 during v1.7.0, INCONCLUSIVE** — the probe
  died on the environment, not on aio:
  - kimi CLI (v0.28.0) default provider = the 9router relay at
    `localhost:20128`, which was **down (connection refused)** → every run
    with the default model `gh/gpt-4o` failed with `provider.connection_error`.
  - The config's fallback provider, Ollama `ollama/qwen3:4b` on
    `localhost:11434`, answered 200 OK but took **~45 s (45,054 ms) for a
    trivial 2-word completion** — a multi-turn FR6 probe cannot finish in
    reasonable time (a 300 s run produced no response and no logged error).

  **Verification pending — keep reporting kimi as model-dependent** until a
  retest measures otherwise; matrix unchanged, no new compliance claim.

## Deliberately out of scope

Background daemon, cloud sync and a web UI stay out (see `PRD.md` §8).
