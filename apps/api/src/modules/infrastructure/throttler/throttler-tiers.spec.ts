import { readThrottlerWindow } from './throttler.module';
import {
  rateLimitTierLimitsForSpec,
  type RateLimitTierName,
} from './throttler.decorator';

/**
 * THE TIER TABLE AND THE CONFIG ARE ONE STATEMENT.
 *
 * Revised 2026-08-03: `default` applies NO override — it defers to the
 * env-governed global windows (prod's THROTTLER_* values differ from the
 * config literals, so restating them here would lie the moment ops moved
 * them). Every named tier must apply a real ceiling; `default` must not.
 */
describe('rate-limit tiers', () => {
  it('every declared tier applies a ceiling — no member is inert', () => {
    const declared: Array<Exclude<RateLimitTierName, 'default'>> = [
      'search',
      'naturalSearch',
      'autocomplete',
      'auth',
      'sensitive',
      'heavyGeoRead',
      'publicRead',
      'webhook',
    ];
    for (const tier of declared) {
      const windows = rateLimitTierLimitsForSpec[tier];
      expect(Object.keys(windows).sort()).toEqual(['long', 'medium', 'short']);
      for (const window of Object.values(windows) as Array<{ limit: number }>) {
        expect(Number.isInteger(window.limit)).toBe(true);
        expect(window.limit).toBeGreaterThan(0);
      }
    }
  });

  it("the 'default' tier applies NO override — it defers to the env-governed global windows", () => {
    // Superseded 2026-08-03: prod runs THROTTLER_* env values (3/20/120)
    // that differ from config literals; a literal 'default' entry would
    // silently divorce those routes from ops' env the moment it changed.
    expect(
      (rateLimitTierLimitsForSpec as Record<string, unknown>).default,
    ).toBeUndefined();
  });
});

describe('readThrottlerWindow', () => {
  const configOf = (values: Record<string, unknown>) =>
    ({ get: (key: string) => values[key] }) as never;

  it('keeps a configured 0 — a closed window closes, it does not reopen to a default', () => {
    const window = readThrottlerWindow(
      configOf({ 'throttler.short.ttl': 1000, 'throttler.short.limit': 0 }),
      'short',
    );
    expect(window).toEqual({ ttl: 1000, limit: 0 });
  });

  it('refuses boot on a malformed ceiling rather than quietly widening', () => {
    // Number.NaN is what `parseInt('abc', 10)` produces in configuration.ts.
    const malformed = configOf({
      'throttler.medium.ttl': 10000,
      'throttler.medium.limit': Number.NaN,
    });
    expect(() => readThrottlerWindow(malformed, 'medium')).toThrow(
      /malformed: throttler\.medium\.limit/,
    );
  });

  it('refuses boot when the config layer does not declare the window', () => {
    expect(() => readThrottlerWindow(configOf({}), 'long')).toThrow(
      /missing: throttler\.long\.ttl/,
    );
  });
});
