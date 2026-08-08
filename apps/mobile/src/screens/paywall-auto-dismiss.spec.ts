import { shouldAutoDismissPaywall } from './paywall-auto-dismiss';

/**
 * F9801 — THE REVERSE-TRIAL USER CAN REACH THE PLANS.
 *
 * Two people, one screen. Bob has no access, opens the paywall, buys: the
 * screen must get out of his way. Alice is on the app-granted reverse trial —
 * `access.active` is TRUE and `billingRail` is null, so "Manage subscription"
 * routes her here on purpose. Under the old `visible && access.active` rule her
 * tap closed the screen in the same commit and read as a dead button.
 */
describe('shouldAutoDismissPaywall', () => {
  it('ALICE: already active when it opened → stays open (the dead tap, killed)', () => {
    // MUTATION: return `activeNow` and this reds — that IS the old rule.
    expect(shouldAutoDismissPaywall({ activeAtPresent: true, activeNow: true })).toBe(false);
  });

  it('BOB: inactive at open, active now → dismisses (the purchase he just made)', () => {
    // MUTATION: return false unconditionally and this reds — Bob would be left
    // staring at the plans he just bought.
    expect(shouldAutoDismissPaywall({ activeAtPresent: false, activeNow: true })).toBe(true);
  });

  it('still inactive → stays open', () => {
    expect(shouldAutoDismissPaywall({ activeAtPresent: false, activeNow: false })).toBe(false);
  });

  it('not presented (nothing sampled) → never dismisses', () => {
    expect(shouldAutoDismissPaywall({ activeAtPresent: null, activeNow: true })).toBe(false);
  });
});
