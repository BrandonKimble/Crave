import {
  isEnvFlagEnabled,
  isEnvFlagExplicitlyDisabled,
} from '../../../shared/config/env-flag';
/**
 * Audit-reason policy for LLM output schemas.
 *
 * Many judge/classifier calls ask the model for a short `reason` alongside
 * its decision. Nothing downstream branches on them; they exist for auditing
 * and prompt tuning.
 *
 * POLICY (owner-ordered rederivation 2026-08-11): **always ON, everywhere,
 * for every JUDGE lane** — overridable off with LLM_AUDIT_REASONS=false as
 * the emergency lever. The old dev-on/prod-off split optimized the wrong
 * side of an asymmetry:
 *
 * - THE COST IS NOISE, measured at real volumes. The lanes this policy
 *   covers (entity match single+batch, attribute placement, poll subject,
 *   place chooser) total ~40k judgments/30d in the ledger. A ≤12-word
 *   evidence reason is ~15 output tokens, so always-on costs ~0.6M output
 *   tokens/month — under a dollar at flash rates, and half that wherever a
 *   lane rides batch pricing. (The whole fleet's judged output for 30d was
 *   ~2M tokens on these lanes.)
 * - THE VALUE IS PROVEN, not hoped: every relevance-gate bug so far was
 *   found by reading its persisted reasons, and the prompt rederivation
 *   campaign grades candidates against WHY the judge decided, which a
 *   prod-silent fleet cannot answer after the fact.
 * - Reasons follow the "evidence, not narrative" rule (quote the ask, name
 *   the rule), which keeps them short AND machine-checkable.
 *
 * Deliberately NOT given reasons: high-volume mechanical lanes where the
 * gold harness is the debugging surface (collection extraction mentions,
 * embeddings, vocabulary labels) — their schemas simply carry no reason
 * field, so this policy never touches them.
 *
 * Also outside this policy (always required regardless of the flag):
 * - SEMANTIC reasons the product consumes (moderation's rejection label).
 * - PERSISTED audit reasons on irreversible decisions (relevance gate).
 */

let cached: boolean | null = null;

export function auditReasonsEnabled(): boolean {
  if (cached !== null) return cached;
  const explicit = process.env.LLM_AUDIT_REASONS;
  if (isEnvFlagEnabled(explicit)) cached = true;
  else if (isEnvFlagExplicitlyDisabled(explicit)) cached = false;
  // Default ON in every environment (2026-08-11; was dev-only). The env
  // flag remains the loud, deliberate off-switch.
  else cached = true;
  return cached;
}

/**
 * Return the schema unchanged when audit reasons are on; otherwise a deep
 * clone with every property literally named `reason` removed (from
 * `properties` and `required`) at any nesting depth.
 */
export function applyAuditReasonPolicy<T extends Record<string, unknown>>(
  schema: T,
): Record<string, unknown> {
  if (auditReasonsEnabled()) return schema;
  return strip(structuredClone(schema) as Record<string, unknown>);
}

function strip(node: Record<string, unknown>): Record<string, unknown> {
  const properties = node.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (properties) {
    delete properties.reason;
    for (const child of Object.values(properties)) {
      if (child && typeof child === 'object') strip(child);
    }
  }
  if (Array.isArray(node.required)) {
    node.required = (node.required as string[]).filter(
      (key) => key !== 'reason',
    );
  }
  const items = node.items as Record<string, unknown> | undefined;
  if (items && typeof items === 'object') strip(items);
  return node;
}
