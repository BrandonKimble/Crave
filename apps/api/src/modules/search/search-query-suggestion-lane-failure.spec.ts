import 'reflect-metadata';
import { SearchQuerySuggestionService } from './search-query-suggestion.service';

/**
 * QUERY SUGGESTIONS DEGRADE PER LANE, UNDER A NAMED POLICY (F3807).
 *
 * `getSuggestions` used to wrap its ENTIRE body in one
 * `catch { logger.warn(...); return [] }`. Three things followed:
 *  - a failure in EITHER substrate read emptied the whole panel, even though
 *    the other lane was healthy;
 *  - a defect anywhere in the pure selection/hydration logic below the reads
 *    was laundered into the same permanently-empty state, which a client
 *    cannot tell apart from "no matches";
 *  - the service had NO spec file at all, and its only consumer stubs
 *    `getSuggestions` out (autocomplete.service.spec.ts), so nothing observed
 *    any of it end to end.
 *
 * This file is the service's first spec. It pins the replacement: each read is
 * guarded on its own and logs the named policy string, so a persistent outage
 * is a countable event; and the logic below the reads is NOT swallowed.
 *
 * MUTATION-CAPABLE, both directions:
 *  - restore the whole-body catch -> case 1 and case 2 go RED (the surviving
 *    lane's suggestion disappears);
 *  - delete the `this.logger.warn(...)` from `readLane` -> the policy
 *    assertions go RED while the behaviour assertions stay green.
 */

const USER_ID = 'user-f3807';

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

function demandRow(queryKey: string) {
  return {
    queryKey,
    distinctActors: 5,
    signalCount: 9,
    demandScore: 9,
    lastUsed: new Date('2026-08-01T00:00:00Z'),
  };
}

function personalRow(queryKey: string) {
  return {
    queryKey,
    signalCount: 3,
    lastUsed: new Date('2026-08-02T00:00:00Z'),
  };
}

function createHarness(overrides: {
  queryDemand?: jest.Mock;
  personalQueryRows?: jest.Mock;
  personalQueryCounts?: jest.Mock;
}) {
  const logger = createLogger();
  const signalDemandRead = {
    queryDemand: overrides.queryDemand ?? jest.fn().mockResolvedValue([]),
    personalQueryRows:
      overrides.personalQueryRows ?? jest.fn().mockResolvedValue([]),
    personalQueryCounts:
      overrides.personalQueryCounts ??
      jest.fn().mockResolvedValue(new Map<string, number>()),
  };
  const service = new SearchQuerySuggestionService(
    signalDemandRead as never,
    logger as never,
  );
  return { service, signalDemandRead, logger };
}

function warnedPolicies(logger: ReturnType<typeof createLogger>): string[] {
  return logger.warn.mock.calls
    .map(
      (call: unknown[]) => (call[1] as { policy?: string } | undefined)?.policy,
    )
    .filter((policy): policy is string => typeof policy === 'string');
}

describe('SearchQuerySuggestionService: per-lane fail-open (F3807)', () => {
  it('keeps the PERSONAL lane when the global demand read fails, and names the policy', async () => {
    const { service, logger } = createHarness({
      // The global lane is down for BOTH calls (selection and hydration).
      queryDemand: jest.fn().mockRejectedValue(new Error('demand read down')),
      personalQueryRows: jest.fn().mockResolvedValue([personalRow('tacos')]),
      personalQueryCounts: jest.fn().mockResolvedValue(new Map([['tacos', 4]])),
    });

    const suggestions = await service.getSuggestions('ta', 5, USER_ID);

    // The healthy lane still fills the panel — the whole-lane catch returned [].
    expect(suggestions.map((s) => s.text)).toEqual(['tacos']);
    expect(suggestions[0]).toMatchObject({ source: 'personal', userCount: 4 });
    // ...and the outage is countable, not anonymous.
    expect(warnedPolicies(logger)).toContain(
      'query-suggestion-global-lane-fail-open',
    );
  });

  it('keeps the GLOBAL lane when the personal read fails, and names the policy', async () => {
    const { service, logger } = createHarness({
      queryDemand: jest.fn().mockResolvedValue([demandRow('tacos')]),
      personalQueryRows: jest
        .fn()
        .mockRejectedValue(new Error('personal read down')),
    });

    const suggestions = await service.getSuggestions('ta', 5, USER_ID);

    expect(suggestions.map((s) => s.text)).toEqual(['tacos']);
    expect(suggestions[0]).toMatchObject({ source: 'global', globalCount: 5 });
    expect(warnedPolicies(logger)).toContain(
      'query-suggestion-personal-lane-fail-open',
    );
  });

  it('does not warn at all on the healthy path', async () => {
    const { service, logger } = createHarness({
      queryDemand: jest.fn().mockResolvedValue([demandRow('tacos')]),
    });

    const suggestions = await service.getSuggestions('ta', 5);

    expect(suggestions.map((s) => s.text)).toEqual(['tacos']);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('hydrates the global count through a key normalized the SAME way at both ends', async () => {
    // The selection key and hydrateCounts' map key must agree; they used to
    // agree only because the signal ledger lowercases subjectText at WRITE —
    // an invariant owned by a different module. Mixed casing here proves the
    // agreement is now local.
    const { service } = createHarness({
      queryDemand: jest
        .fn()
        .mockResolvedValueOnce([demandRow('Tacos Al Pastor')])
        .mockResolvedValueOnce([demandRow('tacos al pastor')]),
    });

    const suggestions = await service.getSuggestions('ta', 5);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].globalCount).toBe(5);
  });
});
