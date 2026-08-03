import { KeywordSliceSelectionService } from './keyword-slice-selection.service';

/**
 * F207 / D22 — SKIP THIS CYCLE, LOUDLY.
 *
 * The demand read's expansions used to swallow a DB error and hand back an
 * UNDER-COUNTED score. This selection is where that number turns into a
 * decision about what to enrich, i.e. real spend, so this is where the policy
 * lives: an unavailable demand read is not "no demand". It must not quietly
 * become an empty candidate set (which the pacer reads as the legitimate
 * "nothing due" outcome and advances cadence on).
 */
describe('collector skips a cycle loudly when the demand read is unavailable', () => {
  function build(demandError: Error) {
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const opsAlerts = { emit: jest.fn() };
    const signalDemand = {
      territoryEntityDemand: jest.fn(() => Promise.reject(demandError)),
    };
    const service = new KeywordSliceSelectionService(
      {} as never,
      signalDemand as never,
      {} as never,
      opsAlerts as never,
      logger as never,
    );
    return { service, opsAlerts, logger };
  }

  const source = {
    sourceId: 'src-1',
    handle: 'FoodNYC',
    engineId: 'eng-1',
    engineName: 'nyc',
    territoryPlaceIds: ['44444444-4444-4444-4444-444444444444'],
  };

  it('does not return an empty selection — it refuses, so the lane stays due', async () => {
    const { service } = build(new Error('statement timeout'));

    // The failure mode this replaces: resolving with `terms: []`, which the
    // pacer treats as "nothing to collect" and advances cadence on.
    await expect(service.selectTermsForSource(source as never)).rejects.toThrow(
      'statement timeout',
    );
  });

  it('emits an owner-visible warn naming the source, not just a log line', async () => {
    const { service, opsAlerts, logger } = build(
      new Error('statement timeout'),
    );

    await expect(
      service.selectTermsForSource(source as never),
    ).rejects.toThrow();

    expect(logger.error).toHaveBeenCalled();
    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        kind: 'collector_demand_read_unavailable',
        dedupeKey: expect.stringContaining(
          'collector_demand_read_unavailable:src-1:',
        ),
      }),
    );
    const body = (opsAlerts.emit.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('no keyword slice was selected this cycle');
    expect(body).toContain('statement timeout');
  });
});
