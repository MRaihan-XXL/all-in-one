// coverage-consent.test.js — src/consent.js: every decide() lane, gatedRun's four
// outcomes (plan/stop/cancel/apply) and promptYes' y/yes/no/empty answers.
// TTY is faked by swapping process.stdin/process.stdout (configurable getters) for
// pre-fed PassThroughs — no real terminal, no real input, no fs, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';

const { decide, promptYes, gatedRun } = await import('../src/consent.js');

const STDIN_DESC = Object.getOwnPropertyDescriptor(process, 'stdin');
const STDOUT_DESC = Object.getOwnPropertyDescriptor(process, 'stdout');
const restoreStreams = () => {
  Object.defineProperty(process, 'stdin', STDIN_DESC);
  Object.defineProperty(process, 'stdout', STDOUT_DESC);
};

/** Swap both streams for a fake TTY; `answer` is pre-fed so readline sees it. */
function fakeTty(t, answer) {
  const input = new PassThrough();
  input.isTTY = true;
  if (answer !== null) input.write(answer);
  const output = new PassThrough();
  output.isTTY = true;
  let written = '';
  output.on('data', (d) => {
    written += d;
  });
  Object.defineProperty(process, 'stdin', { value: input, configurable: true });
  Object.defineProperty(process, 'stdout', { value: output, configurable: true });
  t.after(restoreStreams);
  return { text: () => written };
}

/** Force both streams non-TTY (deterministic plan-stop regardless of the runner). */
function forcePipe(t) {
  Object.defineProperty(process, 'stdin', { value: { isTTY: false }, configurable: true });
  Object.defineProperty(process, 'stdout', { value: { isTTY: false }, configurable: true });
  t.after(restoreStreams);
}

function spyConsole(t) {
  const logs = [];
  t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
  return logs;
}

function harness() {
  const seen = { plan: [], applied: 0 };
  return {
    seen,
    showPlan: (p) => seen.plan.push(p),
    apply: () => {
      seen.applied++;
    },
  };
}

/* ---------------- decide ---------------- */

test('decide: dry/preview → dry; yes → write; interactive → plan-ask; else plan-stop', () => {
  assert.equal(decide({ dry: true }), 'dry');
  assert.equal(decide({ preview: true }), 'dry');
  assert.equal(decide({ dry: true, yes: true }), 'dry', 'dry outranks yes');
  assert.equal(decide({ yes: true, interactive: true }), 'write', 'yes outranks interactive');
  assert.equal(decide({ interactive: true }), 'plan-ask');
  assert.equal(decide(), 'plan-stop');
  assert.equal(decide({}), 'plan-stop');
});

/* ---------------- gatedRun: non-interactive lanes ---------------- */

test('gatedRun: dry → showPlan(preview), returns plan, apply untouched', async (t) => {
  const h = harness();
  const r = await gatedRun({ dry: true, preview: true, showPlan: h.showPlan, apply: h.apply });
  assert.equal(r, 'plan');
  assert.deepEqual(h.seen.plan, [true], 'preview flag forwarded to showPlan');
  assert.equal(h.seen.applied, 0, 'a dry run never applies');
});

test('gatedRun: non-TTY without --yes → plan-stop banner, returns stopped, nothing applied', async (t) => {
  forcePipe(t);
  const logs = spyConsole(t);
  const h = harness();

  const r = await gatedRun({ showPlan: h.showPlan, apply: h.apply });

  assert.equal(r, 'stopped');
  assert.deepEqual(h.seen.plan, [false], 'plan shown without preview');
  assert.equal(h.seen.applied, 0, 'no writes without consent');
  assert.equal(logs.length, 1, 'exactly one banner line');
  assert.match(logs[0], /^\[aio\] non-interactive session/, 'non-interactive banner');
  assert.match(logs[0], /Re-run with --yes/, 'tells the user how to proceed');
});

test('gatedRun: --yes → applied with no plan and no prompt', async (t) => {
  forcePipe(t); // even a non-TTY session applies under --yes
  const logs = spyConsole(t);
  const h = harness();

  const r = await gatedRun({ yes: true, showPlan: h.showPlan, apply: h.apply });

  assert.equal(r, 'applied');
  assert.deepEqual(h.seen.plan, [], 'no plan needed once consent is given');
  assert.equal(h.seen.applied, 1, 'apply ran exactly once');
  assert.equal(logs.length, 0, 'silent apply (the caller prints its own report)');
});

/* ---------------- promptYes: every answer shape ---------------- */

test('promptYes: y/yes/Y variants → true; n/empty/garbage → false; question echoed', async (t) => {
  const cases = [
    ['y\n', true],
    ['y \n', true],
    ['Y\n', true],
    ['yes\n', true],
    ['YES\n', true],
    ['n\n', false],
    ['no\n', false],
    ['\n', false], // bare Enter = the N default
    ['maybe\n', false],
  ];
  let n = 0;
  for (const [answer, expected] of cases) {
    n++;
    const fake = fakeTty(t, answer);
    const got = await promptYes(`Question ${n}? [y/N] `);
    assert.equal(got, expected, `answer ${JSON.stringify(answer)} → ${expected}`);
    assert.ok(fake.text().includes(`Question ${n}? [y/N]`), 'the caller-provided question was printed');
    restoreStreams(); // each case installs its own fake
  }
});

/* ---------------- gatedRun: interactive lanes ---------------- */

test('gatedRun: TTY + "y" → plan shown, prompt printed, apply runs, applied', async (t) => {
  const fake = fakeTty(t, 'y\n');
  const logs = spyConsole(t);
  const h = harness();

  const r = await gatedRun({ showPlan: h.showPlan, apply: h.apply });

  assert.equal(r, 'applied');
  assert.deepEqual(h.seen.plan, [false], 'plan shown before asking');
  assert.equal(h.seen.applied, 1, 'consent given → apply ran');
  assert.equal(logs.length, 0, 'no cancel banner on the accept path');
  assert.match(fake.text(), /Proceed with these writes\? \[y\/N\]/, 'default prompt shown on stdout');
});

test('gatedRun: TTY + "n" → cancelled banner, apply untouched', async (t) => {
  fakeTty(t, 'n\n');
  const logs = spyConsole(t);
  const h = harness();

  const r = await gatedRun({ showPlan: h.showPlan, apply: h.apply });

  assert.equal(r, 'cancelled');
  assert.deepEqual(h.seen.plan, [false], 'plan still shown first');
  assert.equal(h.seen.applied, 0, 'declined → no writes');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[aio\] cancelled/, 'cancel banner');
  assert.match(logs[0], /Re-run with --yes/, 'cancel banner points at --yes');
});

test('gatedRun: TTY + bare Enter (N default) → cancelled, apply untouched', async (t) => {
  fakeTty(t, '\n');
  const h = harness();

  const r = await gatedRun({ showPlan: h.showPlan, apply: h.apply });

  assert.equal(r, 'cancelled', 'Enter means no');
  assert.equal(h.seen.applied, 0);
});
