// completion.test.js — src/completion.js: static shell scripts, no probing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { completion } = await import('../src/completion.js');

test('completion: bash|zsh|fish|pwsh → ok + a script that mentions aio', () => {
  for (const shell of ['bash', 'zsh', 'fish', 'pwsh']) {
    const r = completion(shell);
    assert.equal(r.ok, true, `${shell} → ok`);
    assert.ok(r.text.includes('aio'), `${shell} script mentions aio`);
    assert.ok(r.text.length > 0, `${shell} script non-empty`);
    assert.ok(r.text.startsWith('#'), `${shell} script opens with a comment header`);
  }
});

test('completion: bash word list offers the current commands (setup, completion, version)', () => {
  const r = completion('bash');
  const m = r.text.match(/local words="([^"]+)"/);
  assert.ok(m, `bash script embeds its word list:\n${r.text}`);
  const words = m[1].split(/\s+/);
  for (const w of ['setup', 'completion', 'version']) {
    assert.ok(words.includes(w), `word "${w}" offered for completion (got: ${words.join(' ')})`);
  }
});

test('completion: powershell is accepted as an alias of pwsh', () => {
  const r = completion('powershell');
  assert.equal(r.ok, true);
  assert.match(r.text, /Register-ArgumentCompleter/, 'PowerShell completer emitted');
});

test('completion: unknown shell → ok false + usage line', () => {
  const r = completion('bogus');
  assert.equal(r.ok, false);
  assert.ok(r.text.includes('usage: aio completion'), r.text);
});

test('completion: empty/missing shell → ok false + usage line', () => {
  for (const arg of ['', undefined]) {
    const r = completion(arg);
    assert.equal(r.ok, false, `completion(${JSON.stringify(arg)}) → ok false`);
    assert.ok(r.text.includes('usage: aio completion'), r.text);
  }
});
