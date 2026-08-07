import {
  ACCESS_UNKNOWN_AFTER_WAIT_ENFORCES,
  resolveAppRouteDestination,
  resolveAppRouteReadiness,
  type AppRouteAccessFacts,
  type AppRouteDestinationFacts,
  type AppRouteReadinessFacts,
} from './app-route-destination';

const readinessFacts = (
  overrides: Partial<AppRouteReadinessFacts> = {}
): AppRouteReadinessFacts => ({
  isOnboardingHydrated: true,
  isInitialIntentResolved: true,
  authStatus: 'signed_in',
  hasResolvedSignedInProfile: true,
  accessIsLoading: false,
  ...overrides,
});

const accessFacts = (overrides: Partial<AppRouteAccessFacts> = {}): AppRouteAccessFacts => ({
  isLoading: false,
  isKnown: true,
  enforced: false,
  active: false,
  ...overrides,
});

const destinationFacts = (
  overrides: Partial<AppRouteDestinationFacts> = {}
): AppRouteDestinationFacts => ({
  isPerfScenarioNavigationBypassActive: false,
  onboardingStatus: 'completed',
  authStatus: 'signed_in',
  isAccountDeleted: false,
  access: accessFacts(),
  ...overrides,
});

describe('app route readiness (F4501: the paywall axis is an INPUT to readiness)', () => {
  it('is NOT ready while the access query is still in flight for a signed-in user', () => {
    // THE FINDING, as a red line: every other async fact has settled and the old
    // composition would have published a destination computed from an unresolved
    // paywall axis. Deleting `accessIsLoading` from resolveAppRouteReadiness turns
    // this assertion RED.
    expect(resolveAppRouteReadiness(readinessFacts({ accessIsLoading: true }))).toBe(false);
  });

  it('is ready once the access query has settled', () => {
    expect(resolveAppRouteReadiness(readinessFacts())).toBe(true);
  });

  it('does not wait for access when there is no signed-in user to wall', () => {
    expect(
      resolveAppRouteReadiness(
        readinessFacts({
          authStatus: 'signed_out',
          hasResolvedSignedInProfile: false,
          accessIsLoading: true,
        })
      )
    ).toBe(true);
  });

  it('still waits for the four original facts', () => {
    expect(resolveAppRouteReadiness(readinessFacts({ isOnboardingHydrated: false }))).toBe(false);
    expect(resolveAppRouteReadiness(readinessFacts({ isInitialIntentResolved: false }))).toBe(
      false
    );
    expect(resolveAppRouteReadiness(readinessFacts({ authStatus: 'loading' }))).toBe(false);
    expect(resolveAppRouteReadiness(readinessFacts({ hasResolvedSignedInProfile: false }))).toBe(
      false
    );
  });
});

describe('app route destination', () => {
  it('walls a signed-in user the server says is enforced and inactive', () => {
    expect(
      resolveAppRouteDestination(
        destinationFacts({ access: accessFacts({ enforced: true, active: false }) })
      )
    ).toBe('paywall');
  });

  it('admits an entitled user', () => {
    expect(
      resolveAppRouteDestination(
        destinationFacts({ access: accessFacts({ enforced: true, active: true }) })
      )
    ).toBe('main');
  });

  it('puts the deleted-account face above the paywall', () => {
    expect(
      resolveAppRouteDestination(
        destinationFacts({
          isAccountDeleted: true,
          access: accessFacts({ enforced: true, active: false }),
        })
      )
    ).toBe('account_deleted');
  });

  it('routes by onboarding and auth before it reads access at all', () => {
    expect(resolveAppRouteDestination(destinationFacts({ onboardingStatus: 'in_progress' }))).toBe(
      'onboarding'
    );
    expect(resolveAppRouteDestination(destinationFacts({ authStatus: 'signed_out' }))).toBe(
      'sign_in'
    );
    expect(
      resolveAppRouteDestination(destinationFacts({ isPerfScenarioNavigationBypassActive: true }))
    ).toBe('main');
  });

  describe('access UNKNOWN after readiness has waited (F4501 escalation, D87)', () => {
    // This arm is the OWNER'S call — a fetch error, a timeout, or a profile payload
    // with no `access` block. It is asserted here so it is a marked decision rather
    // than an emergent one. The first test PINS the current value, so flipping the
    // policy goes RED and has to be argued for in the diff (verified by mutation);
    // the second asserts the routing FOLLOWS the constant, so the arm can never be
    // decided anywhere else.
    it('is pinned OPEN, matching the behaviour that shipped', () => {
      expect(ACCESS_UNKNOWN_AFTER_WAIT_ENFORCES).toBe(false);
    });

    it('routes an unknown-enforcement user by that constant and nothing else', () => {
      const destination = resolveAppRouteDestination(
        destinationFacts({
          access: accessFacts({ isKnown: false, enforced: false, active: false }),
        })
      );
      expect(destination).toBe(ACCESS_UNKNOWN_AFTER_WAIT_ENFORCES ? 'paywall' : 'main');
    });
  });
});
