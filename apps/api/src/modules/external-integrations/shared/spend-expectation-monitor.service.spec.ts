import { SpendExpectationMonitorService } from './spend-expectation-monitor.service';
import { EXPECTED_MONTHLY_SPEND_USD } from './expected-monthly-spend';

/**
 * THE COMPARATOR IS THE REPLACEMENT FOR THE REFUSAL (D149).
 *
 * When spend governance stopped killing work, this became the only thing
 * standing between a runaway loop and a surprise invoice — so its two
 * thresholds have to be provably capable of BOTH answers. Every case below
 * names the mutation that reds it; a threshold that can only read green is
 * the disease this codebase already learned about on the map.
 */
describe('SpendExpectationMonitorService.compareToExpectation', () => {
  // Day 15 of a 31-day month: the prorated Places expectation is
  // 100 * 15/31 = $48.387.
  const NOW = new Date('2026-08-15T04:10:00Z');
  const PRORATED_PLACES_USD =
    (EXPECTED_MONTHLY_SPEND_USD.google_places.expectedMonthlyUsd * 15) / 31;

  /**
   * Build a prisma double that reports exactly `targetUsd` of Places spend
   * and nothing for the other two vendors. Places autocomplete bills
   * $0.0028/call (vendor-pricing.ts), so the row count is chosen to hit the
   * dollar figure — real pricing, not a mocked total.
   */
  const buildPrisma = (targetUsd: number) => {
    const perCallUsd = 0.0028;
    const calls = Math.round(targetUsd / perCallUsd);
    return {
      apiUsageEvent: {
        findMany: jest
          .fn()
          .mockImplementation((args: { where: { service: string } }) =>
            Promise.resolve(
              args.where.service === 'google_places'
                ? Array.from({ length: calls }, () => ({
                    skuTier: 'essentials',
                    operation: 'autocomplete',
                    requestCount: 1,
                  }))
                : [],
            ),
          ),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
  };

  const buildLogger = () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    };
    logger.setContext.mockReturnValue(logger);
    return logger;
  };

  const run = async (targetUsd: number) => {
    const emit = jest.fn();
    const service = new SpendExpectationMonitorService(
      buildPrisma(targetUsd) as never,
      buildLogger() as never,
      { emit } as never,
    );
    const results = await service.compareToExpectation(NOW);
    const places = results.find((r) => r.vendor === 'google_places');
    const alerts = emit.mock.calls
      .map((call: unknown[]) => call[0] as { kind: string; severity: string })
      .filter((a) => a.kind === 'spend_vs_expectation');
    return { places, alerts, emit };
  };

  it('2.1x prorated expected → CRITICAL (which emails)', async () => {
    // MUTATION: raise the `ratio >= 2` threshold and this reds.
    const { places, alerts, emit } = await run(PRORATED_PLACES_USD * 2.1);
    expect(places?.ratio).toBeGreaterThan(2);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    // F9601: DAILY. A loop still burning tomorrow is worth being told about
    // again; a month-wide key said it once and then watched in silence.
    // MUTATION: widen the key back to `${monthKey}` and this reds.
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'spend_vs_expectation_critical:google_places:2026-08-15',
      }),
    );
  });

  it('1.3x prorated expected → WARN, and the warn OPTS IN to email', async () => {
    // MUTATION: drop `emailOnWarn: true` and this reds — the whole point of
    // D149 is that a spend anomaly stops being a dashboard-only row.
    const { alerts, emit } = await run(PRORATED_PLACES_USD * 1.3);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('warn');
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'spend_vs_expectation',
        emailOnWarn: true,
        // F9601: WEEKLY, not monthly. A month-wide key meant one early
        // true-but-benign warn (a city onboarding on day 2) muted this vendor
        // for the other 29 days — including the day a real loop started.
        // MUTATION: put `2026-08` back and this reds.
        dedupeKey: expect.stringMatching(
          /^spend_vs_expectation_warn:google_places:w\d+$/,
        ) as unknown as string,
      }),
    );
  });

  it('0.9x prorated expected → SILENCE (an alert that fires on a normal month gets filtered)', async () => {
    // MUTATION: lower the `ratio >= 1` threshold below 0.9 and this reds.
    const { places, alerts } = await run(PRORATED_PLACES_USD * 0.9);
    expect(places?.ratio).toBeLessThan(1);
    expect(alerts).toHaveLength(0);
  });

  it('the ratio is measured from PRICED ledger rows, not from a total anyone typed', async () => {
    const { places } = await run(PRORATED_PLACES_USD * 2.1);
    expect(places?.proratedExpectedUsd).toBeCloseTo(PRORATED_PLACES_USD, 5);
    expect(places?.spentUsd).toBeCloseTo(PRORATED_PLACES_USD * 2.1, 1);
  });

  it('a vendor with no spend at all says nothing (zero is not an anomaly)', async () => {
    const { alerts } = await run(0);
    expect(alerts).toHaveLength(0);
  });
});
