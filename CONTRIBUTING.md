# Contributing to aio

`aio-connect` is a zero-runtime-dependency Node CLI (ESM, Node >= 22). Read
this before opening a PR; it is short on purpose.

## Setup

There is no install step — the package has **zero runtime dependencies** and
the test suite uses the built-in `node --test` runner:

```bash
git clone https://github.com/MRaihan-XXL/all-in-one.git
cd all-in-one
npm test                # node --test "test/*.js"
npm run test:coverage   # same suite with node's built-in coverage
```

`npm run test:coverage` needs Node ≥ 22.8 — it passes the `--test-coverage-*`
threshold flags; the runtime itself still supports Node ≥ 22.

Run the CLI from the checkout without installing:

```bash
node bin/aio.js --help
node bin/aio.js doctor --check
```

## Conventions

- **Marker-delimited blocks.** Injected content lives between
  `<!-- aio:auto-config:v1:start -->` and `<!-- aio:auto-config:v1:end -->`
  (`src/write.js`). One block per file, replaced in place on every run —
  never a second copy, never a partial write.
- **A ledger for every write.** Anything aio may need to reverse gets a
  ledger entry first: MCP additions in `~/.aio/mcp-ledger.json`, installed
  skills in `~/.aio/skills-ledger.json`. `aio rollback` removes only what the
  ledger records and only while the bytes still match what aio wrote.
- **Zero runtime dependencies.** Prefer `node:` stdlib. DevDependencies are
  discouraged — if a test cannot run on `node --test` alone, justify it in the
  PR. No install/postinstall scripts, ever.
- **No hardcoded test counts in code.** Do not embed a suite total (`NN/NN`)
  in source, tests or assets — the count changes every PR. Where a doc states
  one, it is refreshed at release time; in a PR description, report the number
  you actually measured.
- **Adding an agent = one line.** Append to `AGENT_INSTRUCTIONS` in
  `src/targets.js` — `[label, pathRelativeToHome, configDirRelativeToHome]`;
  setup, status, rollback and doctor all read that shared list (B-04).
  Detection for the same agent is one `{ name, dirHint }` row in
  `src/scan.js`.
- **Honest claims.** Zero search storage means zero: never persist queries or
  results. Disclosure (FR6) is instruction-level and model-dependent — state
  per-agent measurements, never a blanket compliance claim.

## Docs

Behavior changed — update the docs in the same PR. The docs mirror the CLI:

| Change | Update |
|---|---|
| new command, flag or env var | `bin/aio.js` `HELP` **and** `README.md` |
| file read/written | `docs/CONFIG.md` (and the README zero-storage list) |
| new trust surface / mitigation | `docs/THREATS.md` |
| user-visible behavior | `CHANGELOG.md` `## [Unreleased]` |
| requirement / scope | `PRD.md` |

`README.md`, `CHANGELOG.md`, `PRD.md`, `docs/*.md`, `CONTRIBUTING.md` and
`ROADMAP.md` are the only files a docs-only contribution needs to touch.
`TRACKING.md`, `TOOLS-INDEX.md` and `aio-context.md` are gitignored
(machine-local) — they never belong in a commit.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): subject` — `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
One logical change per commit; keep diffs small and reviewable. Never commit
secrets, `.env` files or machine-local state (`~/.aio` never ships).

## Release

A release is a version bump plus a tag — CI does the rest.

1. Bump `version` in `package.json`, move `CHANGELOG.md` `[Unreleased]` into a
   dated section.
2. Commit, tag the same value: `git tag v1.6.0`.
3. Push the tag. `release.yml` gates, in order:
   - tag must be the tip of `origin/main` (a stale tag ships old code),
   - `npm test`,
   - tag must equal the `package.json` version,
   - `npm publish` (`secrets.NPM_TOKEN`),
   - GitHub Release,
   - build the 5 standalone binaries (smoke-tested on the OS that can execute
     them: windows-x64, linux-x64, darwin-arm64; darwin-x64 and linux-arm64
     are cross-built), then upload `SHA256SUMS`, `SHA256SUMS.sig` (cosign
     keyless), `aio-scoop.json`, `install.ps1`, `install.sh`.

The tag is never moved once published — fix forward with a new version.
