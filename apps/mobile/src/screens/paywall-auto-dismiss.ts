/**
 * WHEN THE OPENED PAYWALL CLOSES ITSELF (F9801).
 *
 * The host used to close on `visible && access.active`, which reads as "you
 * already have access, nothing to sell you". It is wrong for the exact user the
 * screen exists for: on the reverse trial `access.active` is TRUE from first
 * launch (the app grants trial_base) while `billingRail` is null, so settings →
 * "Manage subscription" routes to the plans — which then dismissed itself in
 * the same commit. The tap did nothing, forever, and the one person who cannot
 * subscribe is the one trying to.
 *
 * The screen's real job is "a purchase made HERE should not leave the buyer
 * staring at the plans they just bought". That is a TRANSITION, not a state:
 * inactive when we opened, active now. Someone who was already active when the
 * screen opened is here to buy, and stays.
 *
 * Pure so the rule is testable without a simulator — the host owns only the
 * ref that remembers the value at present-time.
 */
export function shouldAutoDismissPaywall(input: {
  /** `access.active` sampled the moment the paywall was presented. */
  activeAtPresent: boolean | null;
  /** `access.active` right now. */
  activeNow: boolean;
}): boolean {
  if (input.activeAtPresent === null) {
    // Not presented (or not sampled yet) — nothing to dismiss.
    return false;
  }
  return input.activeAtPresent === false && input.activeNow;
}
