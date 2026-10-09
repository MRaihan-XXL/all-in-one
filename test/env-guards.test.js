// env-guards.test.js — src/banner.js environment guards (the AIO_* vars the
// banner honors, and HOW string values are read):
//   • AIO_NO_BANNER=1 / AIO_QUIET=1 → banner suppressed (empty string)
//   • env values are strings: AIO_QUIET='0'/'false'/'' must keep the banner ON
//     (plain truthiness would kill it — the `off()` helper exists for exactly 6h)
//   • an unknown AIO_* var is ignored — there is no allowlist to trip, and a
//     suppressed banner comes back once the var is removed (no leak)
// Hermetic: pure in-process unit test — no network, no spawns, no state dirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { banner, ART, getVersion } = await import('../src/banner.js');

const ORIG_QUIET = process.env.AIO_QUIET;
const ORIG_NO_BANNER = process.env.AIO_NO_BANNER;

/** Save/restore an env var around `fn` — banner() reads env at call time. */
function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

/** Restore the caller's locale of both vars (a leak would poison later tests). */
function restore(t) {
  t.after(() => {
    for (const [name, prev] of [['AIO_QUIET', ORIG_QUIET], ['AIO_NO_BANNER', ORIG_NO_BANNER]]) {
      if (prev === undefined) delete process.env[name];
      else process.env[name] = prev;
    }
  });
}

test('AIO_NO_BANNER=1 → empty banner; once removed the banner is back (no leak)', (t) => {
  restore(t);
  withEnv('AIO_QUIET', undefined, () => {
    withEnv('AIO_NO_BANNER', '1', () => {
      assert.equal(banner(), '', 'AIO_NO_BANNER suppresses the banner entirely');
    });
    const b = banner();
    assert.ok(b.includes('all-in-one v'), 'var removed → banner restored');
    assert.ok(b.includes(ART[0]), 'the ART grid comes back too');
    assert.ok(b.includes(getVersion()), 'the pinned package version renders');
  });
});

test("string falsy values ('0', 'false', '') keep the banner ON for both vars", (t) => {
  restore(t);
  for (const v of ['0', 'false', '']) {
    for (const name of ['AIO_QUIET', 'AIO_NO_BANNER']) {
      withEnv(name, v, () => {
        assert.ok(
          banner().includes('all-in-one v'),
          `${name}=${JSON.stringify(v)} must NOT suppress the banner (string semantics)`,
        );
      });
    }
  }
  // control: the same vars with '1' really do suppress
  for (const name of ['AIO_QUIET', 'AIO_NO_BANNER']) {
    withEnv(name, '1', () => {
      assert.equal(banner(), '', `${name}=1 suppresses`);
    });
  }
});

test('unknown AIO_* var → banner unaffected (no allowlist guard to trip)', (t) => {
  restore(t);
  withEnv('AIO_QUIET', undefined, () =>
    withEnv('AIO_NO_BANNER', undefined, () =>
      withEnv('AIO_TOTALLY_UNKNOWN_VAR', '1', () => {
        assert.ok(banner().includes('all-in-one v'), 'an unrecognized AIO_ var is ignored');
      }),
    ),
  );
});
