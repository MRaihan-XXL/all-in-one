// consent.js — first-run consent for `aio` setup / init (B-02).
// Interactive terminal → show the plan, then ask [y/N].
// Non-TTY (npx pipes, CI) → plan only, nothing written: pass --yes to write
// unattended. --dry-run / preview → always plan-only.

export function decide({ dry = false, yes = false, preview = false, interactive = false } = {}) {
  if (dry || preview) return 'dry'; // caller asked for plan-only
  if (yes) return 'write'; // explicit consent given up front
  if (interactive) return 'plan-ask'; // show plan, then prompt
  return 'plan-stop'; // no TTY, no --yes → plan + exit 0
}

/** Interactive y/N prompt. Only called when stdin/stdout are a TTY. */
export async function promptYes(question = 'Proceed with these writes? [y/N] ') {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question(question)).trim().toLowerCase();
    return a === 'y' || a === 'yes';
  } finally {
    rl.close();
  }
}

/** Shared write gate: plan → (ask | stop) → apply. Returns 'plan' | 'stopped' | 'cancelled' | 'applied'.
 *  showPlan(preview) must be read-only; apply() performs the writes. */
export async function gatedRun({ dry = false, yes = false, preview = false, showPlan, apply }) {
  const interactive = !!(process.stdin.isTTY && process.stdout.isTTY);
  const mode = decide({ dry, yes, preview, interactive });
  if (mode === 'dry') {
    await showPlan(preview);
    return 'plan';
  }
  if (mode === 'plan-stop') {
    await showPlan(false);
    console.log('[aio] non-interactive session — plan shown above, nothing written. Re-run with --yes to apply.');
    return 'stopped';
  }
  if (mode === 'plan-ask') {
    await showPlan(false); // show the exact plan first
    if (!(await promptYes())) {
      console.log('[aio] cancelled — no files written. Re-run with --yes to apply without prompting.');
      return 'cancelled';
    }
    await apply();
    return 'applied';
  }
  await apply();
  return 'applied';
}
