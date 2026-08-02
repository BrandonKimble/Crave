/**
 * THE answer to "may this principal do this, right now?"
 *
 * WHY IT IS NOT A BOOLEAN (derived from scratch, 2026-08-02).
 *
 * There are three honest answers to an access question, not two: yes, no, and
 * I-could-not-find-out. `hasAccess` returned a `boolean`, so its catch block
 * was forced to invent an assertion about the world from the ABSENCE of
 * information — it picked `true` ("fail open"). That is not a policy; it is a
 * type system leaving no room to say the truth, and a lie chosen once,
 * globally, on behalf of every caller.
 *
 * The lie cannot be right everywhere, because callers genuinely differ:
 *
 *   - Reading a shared poll: an entitlement lookup that fails should ALLOW.
 *     Availability wins; the cost of being wrong is one free read.
 *   - Starting an LLM-backed search: it should DENY. Money wins; the cost of
 *     being wrong is unbounded vendor spend on an unverified account.
 *
 * One global default has to be wrong for one of them, and it was. Making the
 * verdict a sum type moves the decision to the caller, where the trade-off
 * actually lives, and forces each surface to state it out loud.
 *
 * This is the same shape as TomtomChainProbeResult (`named | empty | failed`),
 * which made "recorded a fault as ground truth" unrepresentable. That pattern
 * was already proven in this codebase; it simply never reached entitlements.
 *
 * INDETERMINATE IS AN INCIDENT, NOT A STEADY STATE. A `don't know` that
 * persists is an outage wearing a disguise — the old code logged one line per
 * occurrence and granted access forever. Callers must surface it, not absorb
 * it.
 */

/** Why access was refused. Named so a client can act, and a human can debug. */
export type DenialReason =
  | 'no_grant' // The ledger has no live grant for this code.
  | 'expired'; // A grant existed and its window has closed.

/** Why the question could not be answered. Never a reason to grant silently. */
export type IndeterminateCause =
  | 'store_unavailable' // Postgres/Redis did not answer.
  | 'unexpected_error'; // Anything else — still not an answer.

export type AccessVerdict =
  | { readonly kind: 'granted'; readonly entitlementCode: string }
  | { readonly kind: 'denied'; readonly reason: DenialReason }
  | {
      readonly kind: 'indeterminate';
      readonly cause: IndeterminateCause;
      readonly message: string;
    };

export const granted = (entitlementCode: string): AccessVerdict => ({
  kind: 'granted',
  entitlementCode,
});

export const denied = (reason: DenialReason): AccessVerdict => ({
  kind: 'denied',
  reason,
});

export const indeterminate = (
  cause: IndeterminateCause,
  message: string,
): AccessVerdict => ({ kind: 'indeterminate', cause, message });

/**
 * What a surface does when the answer is unknown.
 *
 * There is no default. A caller must choose, and the choice is visible at the
 * call site — that is the entire point of the type.
 */
export type IndeterminatePolicy =
  /** Availability wins. For reads whose worst case is a free response. */
  | 'allow'
  /** Money or secrecy wins. For anything that spends or reveals. */
  | 'deny';

/**
 * Collapse a verdict to a decision under an EXPLICIT policy for the unknown
 * case. Nothing else in the codebase should branch on `kind` to decide
 * allow/deny — it should call this and name its policy.
 */
export function resolveVerdict(
  verdict: AccessVerdict,
  onIndeterminate: IndeterminatePolicy,
): boolean {
  switch (verdict.kind) {
    case 'granted':
      return true;
    case 'denied':
      return false;
    case 'indeterminate':
      return onIndeterminate === 'allow';
  }
}
