# Release scorecard — aio / aio-connect v1.7.0

Machine-checkable release gate produced by `scripts/verify-scorecard.mjs`.
Ten aspects, ten points each, one row per sub-check exactly as the script
implements it — nothing here is aspirational: every row is a regex, a file
existence test, or a real spawn of `bin/aio.js`.

The script is meant to run as the **last step of `npm test`**, after
`node --test` has already passed. It never re-runs the suite itself
(circularity guard): the tests are green by construction when the scorecard
starts. It exits 0 only when every aspect scores 10/10.

## 1. integrity (10 pts)

| check | what it asserts |
|---|---|
| `bin entry + files[] (bin/src/docs)` | `package.json` has `bin.aio === "bin/aio.js"` **and** `files[]` contains `bin`, `src`, `docs` |
| `engines.node >= 22` | `String(pkg.engines.node)` matches `/2[2-9]\|\d{3,}/` (e.g. `>=22`, `22.x`, `100+`) |
| `node --check on N sources` (N = live count) | `node --check` exits 0 for every `src/*.js` plus `bin/aio.js`; failing paths are listed as detail |
| `LICENSE present` | `LICENSE` exists at the repo root |

## 2. tests (10 pts)

The suite itself already ran earlier in the same chain — this aspect only
asserts invariants about the test setup.

| check | what it asserts |
|---|---|
| `test suite size >= 15 files` | `test/` contains ≥ 15 `.js` files (actual count in detail) |
| `no .only() left in tests` | no `test/*.js` matches `\.only\(` (offending files in detail) |
| `npm test runs node --test` | `pkg.scripts.test` matches `/node --test/` |
| `coverage gates >= 90/80/85` | `pkg.scripts["test:coverage"]` carries `--test-coverage-lines=90` (≥90), `--test-coverage-branches=80` (≥80), `--test-coverage-functions=85` (≥85); a missing flag fails the check |

## 3. robustness (10 pts)

Fix-wave invariants: atomic writes, exclusive locking, traversal guards.

| check | what it asserts |
|---|---|
| `writeAtomic used >= 15 times in src` | occurrences of `writeAtomic(` summed over all `src/*.js` ≥ 15 |
| `raw writeFileSync confined to paths.js/live.js` | every `src/*.js` containing `writeFileSync(` is one of `paths.js` (the atomic impl) or `live.js` (RATE_LOCK); any other file fails |
| `RATE_LOCK is a wx exclusive lock` | `src/live.js` matches `writeFileSync(RATE_LOCK` … within 120 chars … `flag: 'wx'` |
| `skill path-traversal prefix guards >= 2` | `src/skill.js` contains ≥ 2 occurrences of `startsWith(root` |
| `corrupt-ledger preserve-aside present` | `src/paths.js` contains the string `corrupt-` (corrupt-ledger preserve-aside) |

## 4. security (10 pts)

| check | what it asserts |
|---|---|
| `no hardcoded token literals in src/bin` | no `src/*.js` or `bin/aio.js` matches `ghp_…`/`gho_…`/`ghu_…` (20+ chars) or `npm_` + 36 chars |
| `GH_TOKEN read from env (never hardcoded)` | `src/live.js` reads `process.env.GH_TOKEN` |
| `.env never shipped` | `files[]` does not include `.env` **and** `.gitignore` exists **and** has a line matching `^\.env` |
| `git spawn never prompts (GIT_TERMINAL_PROMPT in borrow)` | `src/borrow.js` contains `GIT_TERMINAL_PROMPT` |

## 5. honesty (10 pts)

Offline gating, declared schema, zero storage, surfaced errors.

| check | what it asserts |
|---|---|
| `AIO_OFFLINE gate in >= 5 modules` | ≥ 5 files under `src/*.js` contain `AIO_OFFLINE` (actual count in detail) |
| `src/search.js declares schemaVersion: 1` | `src/search.js` matches `schemaVersion: 1` |
| `src/agent.js declares schemaVersion: 1` | `src/agent.js` matches `schemaVersion: 1` |
| `src/skill.js declares schemaVersion: 1` | `src/skill.js` matches `schemaVersion: 1` |
| `agent reports stored: 0 (zero storage)` | `src/agent.js` contains `stored: 0` |
| `agent surfaces source errors (no fake empty)` | `src/agent.js` contains `sourceErrorNote` (a failing source is reported, never a fake "0 hits") |

## 6. cli-ux (10 pts)

Real spawns of `bin/aio.js` (`node`, 30 s timeout, `NO_COLOR=1`).

| check | what it asserts |
|---|---|
| `--help exit 0 + documents \`aio agent\`` | `aio --help` exits 0 and stdout matches `/aio agent/` |
| `-v prints package version` | `aio -v` exits 0 and stdout contains `pkg.version` |
| `AIO_LANG=id help in Bahasa Indonesia` | `AIO_LANG=id aio --help` exits 0 and stdout matches `/Penggunaan/` |
| `unknown command exits 1, names the command` | `aio frobnicate` exits 1 and stderr matches `/unknown command: frobnicate/` |
| `unknown flag warns but keeps exit 0 (pinned)` | `aio status --bogus-flag` exits 0 and stderr matches `/unknown flag: --bogus-flag/` (warn-and-continue is pinned behaviour) |

## 7. doctor (10 pts)

| check | what it asserts |
|---|---|
| `aio doctor --check` exit 0 | `aio doctor --check` exits 0; on failure the first 200 chars of stderr/stdout are attached as detail |

## 8. pack (10 pts)

`npm pack --dry-run --json` in the repo root (60 s timeout; shell on win32).

| check | what it asserts |
|---|---|
| `tarball file count <= 30` | first pack entry has ≤ 30 files (actual count in detail) |
| `tarball packed size <= 120 kB (test/assets/scripts excluded)` | first pack entry `size` ≤ 120000 bytes |
| `test/assets/scripts excluded from tarball` | no tarball path starts with `test/`, `assets/`, or `scripts/` (first offenders in detail) |

If `npm pack` fails or its JSON is unparsable, this aspect instead records a
single failing check `npm pack --dry-run parses` (1 check, not 3).

## 9. docs-sync (10 pts)

Reads the live files, so stale docs fail the release.

| check | what it asserts |
|---|---|
| `README documents aio agent + skill search + AIO_LANG` | `README.md` matches `aio agent`, `skill search`, **and** `AIO_LANG` |
| `CHANGELOG has 1.7.0 entry` (label uses live `pkg.version`) | `CHANGELOG.md` contains `pkg.version` with dots escaped (`1\.7\.0`) |
| `README states current version 1.7.0` (label uses live `pkg.version`) | `README.md` contains the literal `pkg.version` substring |
| `THREATS covers provenance` | `docs/THREATS.md` matches `/provenance/i` |
| `docs/SCORECARD.md present` | this file exists at `docs/SCORECARD.md` |

## 10. release (10 pts)

All five read `.github/workflows/release.yml`.

| check | what it asserts |
|---|---|
| `publish uses --access public --provenance` | workflow contains the literal `npm publish --access public --provenance` |
| `id-token: write (OIDC)` | workflow contains `id-token: write` |
| `scoop checkver + autoupdate` | workflow contains the quoted keys `"checkver"` **and** `"autoupdate"` |
| `cosign + SHA256SUMS present` | workflow contains `cosign sign-blob` **and** `SHA256SUMS` |
| `tag-guard step (Tag is main tip)` | workflow contains `Tag is main tip` |

## How to run

```sh
npm test                              # suite first; scorecard is the last step of the chain
node scripts/verify-scorecard.mjs     # scorecard only (never re-runs the test suite)
```

- **exit 0** — release-ready: `SUMMARY 100/100 — 10/10 aspects >= 10/10`.
- **exit 1** — `RELEASE BLOCKED`, preceded by one line per failed sub-check:
  `FAIL [aspect] name → detail`.

## Scoring

- Per aspect: `score = round(10 × passed / total)` over that aspect's
  sub-checks; the report prints `aspect score/10 (passed/total)`.
- Release bar: **every aspect 10/10**, i.e. 100/100 — counted as
  `aspects >= 10/10`. One failed sub-check rounds its aspect below 10 and
  blocks the release.

## Design notes

- Machine-checkable only: offline, ~3 s, Node stdlib (`node:fs`,
  `node:child_process`) plus `npm pack`.
- Docs-sync reads the live README/CHANGELOG/THREATS, so documentation that
  drifts from the code fails the gate instead of passing silently.
- Historical or unverifiable claims (download counts, badges, third-party
  metrics) are **not** scored here.
- The scorecard asserts invariants; it does not judge code quality. A green
  run means the release promises hold, not that the suite was re-proven.
