// messages.test.js — src/messages.js: EN/ID catalog parity (same keys, same
// {placeholders}) plus msg()'s locale contract: EN is the default and stays
// byte-identical to the pre-i18n originals, AIO_LANG=id selects the ID table,
// {placeholder} substitution, and the {s} English plural suffix is stripped in
// id while it survives in the EN render. Every AIO_LANG mutation is restored
// per test so a leak can never flip another file's locale.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { msg, parity } = await import('../src/messages.js');

const ORIG_LANG = process.env.AIO_LANG;

/** Run `fn` under the given AIO_LANG, always restoring the caller's locale. */
function withLang(t, lang, fn) {
  if (lang === undefined) delete process.env.AIO_LANG; // process.env.X = undefined would stringify to "undefined"
  else process.env.AIO_LANG = lang;
  t.after(() => {
    if (ORIG_LANG === undefined) delete process.env.AIO_LANG;
    else process.env.AIO_LANG = ORIG_LANG;
  });
  fn();
}

/* ---------------- parity ---------------- */

test('parity: >= 49 keys, no key missing on either side, no placeholder drift', () => {
  const p = parity();

  assert.ok(p.total >= 49, `total keys ${p.total} >= 49`);
  assert.deepEqual(p.missingID, [], 'every EN key carries an ID twin');
  assert.deepEqual(p.missingEN, [], 'every ID key carries an EN twin');
  assert.deepEqual(p.placeholderDrift, [], 'EN and ID placeholders match per key');
});

/* ---------------- EN default (byte-identical originals) ---------------- */

test('msg (EN default): known keys render byte-identical to the originals', (t) => {
  withLang(t, undefined, () => {
    assert.equal(
      msg('evolveDeprecated'),
      "[aio] 'evolve' is deprecated — use 'aio verify' (alias removed after 2 releases)",
    );
    assert.equal(
      msg('updateAvailable', { cur: '1.6.0', latest: '1.7.0' }),
      '[aio] update check: aio 1.6.0 is behind latest 1.7.0 - run `aio update`.',
    );
    assert.equal(msg('unknownCommand', { cmd: 'frobnicate' }), '[aio] unknown command: frobnicate');
    assert.match(msg('skillMdMissing', { target: 'x', n: 2 }), /location\{s\}\)\.$/, 'an unpassed placeholder survives verbatim');
    assert.equal(msg('noSuchKeyEver'), 'noSuchKeyEver', 'missing key degrades to the key itself');
  });
});

/* ---------------- AIO_LANG=id ---------------- */

test('AIO_LANG=id: a known key switches to the ID string, EN comes back when unset', (t) => {
  withLang(t, 'id', () => {
    assert.equal(
      msg('evolveDeprecated'),
      "[aio] 'evolve' sudah usang — gunakan 'aio verify' (alias dihapus setelah 2 rilis)",
      'the deprecation note is localized',
    );
    assert.equal(
      msg('updateCurrent', { v: '1.7.0' }),
      '[aio] cek update: aio 1.7.0 sudah rilis terbaru.',
      'the update-check verdict too',
    );
  });
});

test('{s} plural suffix: present in the EN render, stripped in the id render', (t) => {
  const vars = { target: 'pdf tool', n: 1, s: 's' };

  withLang(t, undefined, () => {
    assert.equal(
      msg('skillMdMissing', vars),
      '[aio] skill: SKILL.md not found for pdf tool (tried 1 locations).',
      'EN keeps the English plural suffix',
    );
  });

  withLang(t, 'id', () => {
    const id = msg('skillMdMissing', vars);
    assert.equal(id, '[aio] skill: SKILL.md tidak ditemukan untuk pdf tool (dicoba 1 lokasi).', 'ID drops {s} entirely');
    assert.doesNotMatch(id, /\{s\}|location/, 'no English suffix or raw placeholder survives');
  });
});
