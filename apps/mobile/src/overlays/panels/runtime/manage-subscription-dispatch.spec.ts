/**
 * THE RAIL DECIDES WHERE "MANAGE SUBSCRIPTION" LANDS.
 *
 * Before this dispatch the row was one hardcoded Apple URL for everyone, so
 * a Stripe-web subscriber tapping it saw an App Store page with no record of
 * their subscription — no cancel, no card change, no explanation. Each case
 * below is one of those tappers.
 */
import { runManageSubscriptionAction } from './manage-subscription-dispatch';
import { MANAGE_SUBSCRIPTIONS_URL } from '../../../constants/legalLinks';

jest.mock('../../../utils', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const makeDeps = (overrides?: Partial<Parameters<typeof runManageSubscriptionAction>[1]>) => ({
  showManageSubscriptions: jest.fn().mockResolvedValue(true),
  createPortalSession: jest
    .fn()
    .mockResolvedValue({ url: 'https://billing.stripe.com/p/session_1' }),
  openURL: jest.fn().mockResolvedValue(undefined),
  presentPaywall: jest.fn(),
  announceFailure: jest.fn(),
  ...overrides,
});

describe('runManageSubscriptionAction', () => {
  it("app_store -> Apple's in-app sheet, and NOTHING else fires", async () => {
    const deps = makeDeps();
    await runManageSubscriptionAction('app_store', deps);
    expect(deps.showManageSubscriptions).toHaveBeenCalledTimes(1);
    expect(deps.createPortalSession).not.toHaveBeenCalled();
    expect(deps.openURL).not.toHaveBeenCalled();
    expect(deps.presentPaywall).not.toHaveBeenCalled();
  });

  it('app_store with an unpresentable sheet falls back to the Apple URL — never a silent no-op', async () => {
    const deps = makeDeps({ showManageSubscriptions: jest.fn().mockResolvedValue(false) });
    await runManageSubscriptionAction('app_store', deps);
    expect(deps.openURL).toHaveBeenCalledWith(MANAGE_SUBSCRIPTIONS_URL);
  });

  it('web -> mints a portal session and opens THAT url (never the Apple page)', async () => {
    const deps = makeDeps();
    await runManageSubscriptionAction('web', deps);
    expect(deps.createPortalSession).toHaveBeenCalledTimes(1);
    expect(deps.openURL).toHaveBeenCalledWith('https://billing.stripe.com/p/session_1');
    expect(deps.openURL).not.toHaveBeenCalledWith(MANAGE_SUBSCRIPTIONS_URL);
    expect(deps.showManageSubscriptions).not.toHaveBeenCalled();
    expect(deps.presentPaywall).not.toHaveBeenCalled();
  });

  it('a failed portal fetch ANNOUNCES the failure and opens nothing', async () => {
    const deps = makeDeps({
      createPortalSession: jest.fn().mockRejectedValue(new Error('502')),
    });
    await runManageSubscriptionAction('web', deps);
    expect(deps.openURL).not.toHaveBeenCalled();
    expect(deps.announceFailure).toHaveBeenCalledTimes(1);
  });

  it('null -> the plans (there is nothing to manage), not Apple', async () => {
    const deps = makeDeps();
    await runManageSubscriptionAction(null, deps);
    expect(deps.presentPaywall).toHaveBeenCalledTimes(1);
    expect(deps.showManageSubscriptions).not.toHaveBeenCalled();
    expect(deps.createPortalSession).not.toHaveBeenCalled();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  it('an UNKNOWN rail (undefined — older server, missing field) is not treated as Apple', async () => {
    const deps = makeDeps();
    await runManageSubscriptionAction(undefined, deps);
    expect(deps.presentPaywall).toHaveBeenCalledTimes(1);
    expect(deps.showManageSubscriptions).not.toHaveBeenCalled();
  });
});
