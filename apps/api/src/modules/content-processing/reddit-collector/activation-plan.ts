import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';

/**
 * THE ACTIVATION PLAN FILE IS THE AUTHORITY FOR A RESUME (F9976).
 *
 * Activation flips document→run pointers, which destroys the very predicate
 * (`documentsOwnedByRun`) the plan is computed from. So a plan can only be
 * computed ONCE, before any flip — a crash-resume that recomputes gets an
 * empty plan for every already-flipped run, skips their projection rebuild
 * (generation-A projections over a generation-B ledger, forever, printing
 * success), and — the F9976 discovery — OVERWRITES the good plan file with
 * the empty one, destroying the recovery artifact the handoff doc promised.
 *
 * The shape that makes activation genuinely idempotent from the artifact:
 *   - first run: compute the plan, persist it, then start mutating;
 *   - resume: the saved file IS the plan — never recompute, never overwrite;
 *   - success: the artifact is consumed (deleted), so the next activation of
 *     the same version starts fresh instead of replaying a stale plan.
 */
export interface ActivationPlan {
  promptVersion: number;
  communities: string[];
  plan: Array<{ runId: string; documentIds: string[] }>;
  restaurantIds: string[];
}

export async function resolveActivationPlan(params: {
  planPath: string;
  promptVersion: number;
  communities: string[];
  compute: () => Promise<Pick<ActivationPlan, 'plan' | 'restaurantIds'>>;
}): Promise<{ plan: ActivationPlan; resumed: boolean }> {
  if (existsSync(params.planPath)) {
    const saved = JSON.parse(
      readFileSync(params.planPath, 'utf-8'),
    ) as ActivationPlan;
    if (
      saved.promptVersion !== params.promptVersion ||
      JSON.stringify([...saved.communities].sort()) !==
        JSON.stringify([...params.communities].sort())
    ) {
      throw new Error(
        `activation plan at ${params.planPath} is for v${saved.promptVersion}/` +
          `${saved.communities.join('+')}, not v${params.promptVersion}/` +
          `${params.communities.join('+')} — refusing to mix plans. ` +
          `Delete the file only if that activation is known complete.`,
      );
    }
    return { plan: saved, resumed: true };
  }

  const computed = await params.compute();
  const plan: ActivationPlan = {
    promptVersion: params.promptVersion,
    communities: params.communities,
    ...computed,
  };
  writeFileSync(params.planPath, JSON.stringify(plan));
  return { plan, resumed: false };
}

/** Consume the artifact after a fully successful activation — a completed
 *  plan left on disk would replay as a stale resume next time. */
export function consumeActivationPlan(planPath: string): void {
  if (existsSync(planPath)) {
    unlinkSync(planPath);
  }
}
