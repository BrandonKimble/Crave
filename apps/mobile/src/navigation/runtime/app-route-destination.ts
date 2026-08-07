import type { AppRouteDestination, AuthStatus, OnboardingRouteStatus } from './app-route-types';

/**
 * THE PAYWALL AXIS AS AN INPUT TO READINESS (F4501).
 *
 * `AppRouteCoordinator` used to compose readiness from four async facts (store
 * hydration, initial intent, auth resolution, signed-in profile) and then compute
 * `needsPaywall` from a FIFTH — access — that readiness never waited for. The
 * implicit mitigation was an ordering (the profile `.then` seeds the access cache
 * before the `.finally` flips the profile flag), but the seed is guarded by
 * `if (profile.access)` and `access` is OPTIONAL on the profile DTO, so a payload
 * that omits it left the axis unresolved while readiness had already declared the
 * route trustworthy. `active` failing to false is fail-CLOSED and harmless;
 * `enforced` failing to false is fail-OPEN and sells nothing to somebody who
 * should have been walled.
 *
 * These functions are the destination decision as a PURE pair, so both halves are
 * spec-able in the node lane (this package's jest project is `.spec.ts` only —
 * rendering the coordinator is not available here, and a decision that cannot be
 * asserted is the shape the audit keeps finding).
 */

/**
 * ESCALATED TO THE OWNER (F4501, D87) — DO NOT SILENTLY FLIP.
 *
 * This is the arm for access being genuinely UNKNOWN *after* readiness has waited
 * for it: a fetch error, a timeout, or a profile payload that carried no `access`
 * block at all. Whether that user is walled (fail-closed) or admitted (fail-open)
 * is a paywall/business call, not an engineering one, so D87 approved the symmetry
 * fix — access joins the awaited facts — and ESCALATED this.
 *
 * `false` PRESERVES the behaviour that shipped: unknown enforcement reads as "the
 * wall is not enforcing" and the user reaches 'main'. It is written here as one
 * named constant rather than inherited from a `?? false` shared with `active`, so
 * the decision is a line the owner can find and change, not a default.
 */
export const ACCESS_UNKNOWN_AFTER_WAIT_ENFORCES: boolean = false;

export type AppRouteAccessFacts = {
  /** The access query is still in flight for this user. */
  isLoading: boolean;
  /**
   * Server access truth has actually been OBSERVED. `enforced` and `active` read
   * false both when the server says "off" and when nothing ever answered; this is
   * the fact that tells those two apart.
   */
  isKnown: boolean;
  /** Server-owned rollout switch: the app-wide paywall is enforcing. */
  enforced: boolean;
  /** Server-truth entitlement. */
  active: boolean;
};

export type AppRouteReadinessFacts = {
  isOnboardingHydrated: boolean;
  isInitialIntentResolved: boolean;
  authStatus: AuthStatus;
  hasResolvedSignedInProfile: boolean;
  accessIsLoading: boolean;
};

/**
 * Every async axis the destination reads must be settled here — including the one
 * that decides money. For a signed-out user there is no access query to wait for.
 */
export const resolveAppRouteReadiness = ({
  isOnboardingHydrated,
  isInitialIntentResolved,
  authStatus,
  hasResolvedSignedInProfile,
  accessIsLoading,
}: AppRouteReadinessFacts): boolean =>
  isOnboardingHydrated &&
  isInitialIntentResolved &&
  authStatus !== 'loading' &&
  (authStatus !== 'signed_in' || (hasResolvedSignedInProfile && !accessIsLoading));

/**
 * The enforcement answer the destination acts on. Known truth wins; the unknown
 * arm is the escalated constant above and nothing else.
 */
export const resolveEnforcementAfterWait = (access: AppRouteAccessFacts): boolean =>
  access.isKnown ? access.enforced : ACCESS_UNKNOWN_AFTER_WAIT_ENFORCES;

export type AppRouteDestinationFacts = {
  isPerfScenarioNavigationBypassActive: boolean;
  onboardingStatus: OnboardingRouteStatus;
  authStatus: AuthStatus;
  isAccountDeleted: boolean;
  access: AppRouteAccessFacts;
};

export const resolveAppRouteDestination = ({
  isPerfScenarioNavigationBypassActive,
  onboardingStatus,
  authStatus,
  isAccountDeleted,
  access,
}: AppRouteDestinationFacts): AppRouteDestination => {
  if (isPerfScenarioNavigationBypassActive) {
    return 'main';
  }
  if (onboardingStatus !== 'completed') {
    return 'onboarding';
  }
  if (authStatus !== 'signed_in') {
    return 'sign_in';
  }
  // ABOVE THE PAYWALL, deliberately: a closed account has nothing to buy access
  // TO, and every authenticated route refuses it anyway. Showing the paywall here
  // would sell a subscription for an account being erased.
  if (isAccountDeleted) {
    return 'account_deleted';
  }
  // HARD PAYWALL routing axis (decided 2026-07-09): a signed-in, onboarded user
  // without access lands on the paywall, not 'main' — but ONLY when the server
  // wall is live (rollout stays a single server-side switch).
  if (resolveEnforcementAfterWait(access) && !access.active) {
    return 'paywall';
  }
  return 'main';
};
