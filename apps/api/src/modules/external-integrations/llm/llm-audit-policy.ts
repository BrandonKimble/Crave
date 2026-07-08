/**
 * Audit-reason policy for LLM output schemas.
 *
 * Many judge/classifier calls ask the model for a short `reason` alongside its
 * decision. Those reasons exist ONLY for auditing and prompt tuning — nothing
 * downstream branches on them — but they cost output tokens on every call.
 * Policy: reasons ON in dev (auditability), OFF in prod (cost), overridable
 * either way with LLM_AUDIT_REASONS=true|false.
 *
 * NOT covered by this policy: semantic reason fields the product consumes
 * (e.g. moderation's rejection label shown to users) — those stay required
 * in their schemas and never route through applyAuditReasonPolicy.
 */

let cached: boolean | null = null;

export function auditReasonsEnabled(): boolean {
  if (cached !== null) return cached;
  const explicit = process.env.LLM_AUDIT_REASONS?.trim().toLowerCase();
  if (explicit === 'true') cached = true;
  else if (explicit === 'false') cached = false;
  else cached = process.env.APP_ENV?.trim().toLowerCase() !== 'prod';
  return cached;
}

/** Test seam. */
export function resetAuditReasonCache(): void {
  cached = null;
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
