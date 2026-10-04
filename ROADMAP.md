# Roadmap

Planned work for `aio-connect`, newest release scope excluded (that lives in
`CHANGELOG.md`). Items are written as verifiable outcomes, not aspirations —
an item is done when the stated check passes.

## Distribution & release

- **npm provenance** — publish with `--provenance` (OIDC) so the npm tarball
  attests to its source commit; `release.yml` already requests
  `id-token: write`, so this is a flag plus a registry check.
- **macOS x64 native smoke** — `aio-darwin-x64` is cross-compiled on ubuntu
  and never executed on an Intel mac; add a native smoke step before calling
  it tested.
- **linux-arm64 smoke via qemu** — same gap for `aio-linux-arm64`
  (`qemu-user-static` or an arm64 runner).
- **scoop autoupdate per release** — the shipped `aio-scoop.json` is
  generated per release; wire an autoupdate block (or a manifest PR) so scoop
  users are not told to re-download by hand.

## Evaluation & docs

- **Auto-regenerate `assets/aio-stats.svg` (P15)** — render the strip from
  nightly `eval.yml` results instead of a hand-edited figure, so the embedded
  counts and test claims cannot go stale.
- **README eval badge from nightly `eval.yml`** — same source of truth,
  badge form.
- **FR6 disclosure retest matrix** — rule 0 (`0. FIRST LINE RULE …`
  repeating the exact disclosure line before rule 1) shipped in v1.6.0;
  re-run the free-form prompt probe per agent, kimi first. Status: shipped,
  **verification pending** — keep reporting kimi as model-dependent until the
  retest measures otherwise.
- **help i18n** — translate the `HELP` text; today it is English only.

## Product

- **`aio skill search "<query>"`** — one step instead of two: search the live
  corpora and install the chosen `SKILL.md` (`ask` + `skill add` in one).
- **Completion generated from a single source** — the command/flag list is
  currently duplicated between `bin/aio.js` `HELP` and
  `src/completion.js`; share one list so a new command cannot be missed.

## Deliberately out of scope

Background daemon, cloud sync and a web UI stay out (see `PRD.md` §8).
