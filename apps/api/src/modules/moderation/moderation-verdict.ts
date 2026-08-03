/**
 * THE answer to "may this text be published?"
 *
 * WHY IT IS NOT A BOOLEAN (rederived 2026-08-02; owner-ratified 2026-08-03).
 *
 * There are three honest answers to a moderation question, not two: allowed,
 * blocked, and I-could-not-find-out. `ModerationDecision.allowed` was a
 * `boolean`, so the service's catch block was forced to invent an assertion
 * about the text from the ABSENCE of information — it picked `true`
 * ("fail open"), globally, on behalf of every caller, and stamped the
 * fabricated reason `'moderation_error'` onto it. That is not a policy; it is
 * a type with no room to say the truth.
 *
 * This is verbatim the defect access-verdict.ts already rederived one module
 * over, and the shape here deliberately mirrors it line for line — a reader
 * who knows one knows both. The pattern was proven and tested in this
 * codebase; it simply never reached moderation.
 *
 * The lie cannot be right everywhere, because callers genuinely differ:
 *
 *   - Submitting a poll, a comment, or a username: it should REFUSE. The
 *     text is about to become permanent, public, and attributed; the cost of
 *     being wrong is unmoderated content on a public surface, and the user
 *     can simply try again in a moment.
 *   - Rendering something already stored: availability wins. The text is
 *     already live; refusing to draw it protects nobody.
 *
 * INDETERMINATE IS AN INCIDENT, NOT A STEADY STATE. A `don't know` that
 * persists means the moderation vendor is down and every submission is being
 * turned away — that must be visible in the logs as an outage, not absorbed
 * as a product behaviour.
 */

/** Why the text was blocked. Named so a client can act, and a human can debug. */
export type ModerationBlockReason = string;

/** Why the question could not be answered. Never a reason to allow silently. */
export type ModerationIndeterminateCause =
  /** The moderation vendor did not answer (timeout, 5xx, rate limit). */
  | 'moderator_unavailable'
  /** Anything else — still not an answer. */
  | 'unexpected_error';

export type ModerationVerdict =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'blocked'; readonly reason: ModerationBlockReason }
  | {
      readonly kind: 'indeterminate';
      readonly cause: ModerationIndeterminateCause;
      readonly message: string;
    };

export const moderationAllowed = (): ModerationVerdict => ({ kind: 'allowed' });

export const moderationBlocked = (
  reason: ModerationBlockReason,
): ModerationVerdict => ({ kind: 'blocked', reason });

export const moderationIndeterminate = (
  cause: ModerationIndeterminateCause,
  message: string,
): ModerationVerdict => ({ kind: 'indeterminate', cause, message });

/**
 * What a surface does when the answer is unknown.
 *
 * There is no default. A caller must choose, and the choice is visible at the
 * call site — that is the entire point of the type.
 */
export type ModerationIndeterminatePolicy =
  /** Availability wins. For READ surfaces re-rendering already-stored text. */
  | 'allow'
  /** Safety wins. For any WRITE that publishes or persists user text. */
  | 'hold';

/**
 * What a caller does with a verdict, under an EXPLICIT policy for the unknown
 * case. Nothing else in the codebase should branch on `kind` to decide
 * publish/refuse — it should call this and name its policy.
 *
 * `refuse` carries a NAMED cause so the refusal message says which of the two
 * different things happened: the text was rejected, or the moderator was
 * unreachable. Collapsing those two into one string is how the old boolean
 * produced `reason: 'moderation_error'` on an ALLOW.
 */
export type ModerationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly cause: string };

export function resolveModeration(
  verdict: ModerationVerdict,
  onIndeterminate: ModerationIndeterminatePolicy,
): ModerationOutcome {
  switch (verdict.kind) {
    case 'allowed':
      return { ok: true };
    case 'blocked':
      return { ok: false, cause: verdict.reason };
    case 'indeterminate':
      return onIndeterminate === 'allow'
        ? { ok: true }
        : { ok: false, cause: `moderator_unavailable:${verdict.cause}` };
  }
}
