import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';

/**
 * THE COUNT WRITE FAILS LOUD (F4907, the F205 doctrine).
 *
 * `recordEnrichmentFailure` writes the attempt COUNT the janitor's
 * archive/retry policy reads. The comment on that write records the exact
 * prior incident: "The `error` path wrote NO count at all, so these
 * placeholders sat at 0 forever and were re-enriched every week at real
 * Places spend."
 *
 * The whole method body sits in a `try` whose `catch` logged one `warn` and
 * returned normally. A transient DB error — a serialization failure, the
 * 40P01 deadlock class already open on this module's neighbours — therefore
 * left the count at 0 and reintroduced the weekly re-spend with no signal
 * anyone watches. Not crashing and not telling anyone are different
 * decisions; only the first had been made.
 *
 * It still swallows (one entity must not end a batch) — it now rings a bell,
 * in the shape SignalPartitionMaintenanceService and PollWeeklyRitualService
 * use.
 */
describe('recordEnrichmentFailure — the failure counter is not silent', () => {
  type OpsAlert = {
    severity: string;
    kind: string;
    title: string;
    body: string;
    dedupeKey: string;
  };
  type EntityUpdateArgs = { data: Record<string, unknown> };

  function makeService(
    update: jest.Mock<Promise<unknown>, [EntityUpdateArgs]>,
  ) {
    const emit = jest.fn<void, [OpsAlert]>();
    const opsAlerts = { emit };
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const prisma = { entity: { update } };
    const service = new RestaurantLocationEnrichmentService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      opsAlerts as never,
      logger as never,
    );
    // The method is private by design (it is bookkeeping, not API), so the
    // spec reaches it through a narrow structural view rather than widening
    // the service's own surface for a test.
    const asPrivate = service as unknown as {
      recordEnrichmentFailure(entity: unknown, reason: string): Promise<void>;
    };
    const recordEnrichmentFailure = (
      entity: unknown,
      reason: string,
    ): Promise<void> => asPrivate.recordEnrichmentFailure(entity, reason);
    return { recordEnrichmentFailure, emit, logger };
  }

  const ENTITY = {
    entityId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    restaurantMetadata: {},
  };

  it('a throwing count write raises an ops alert naming the entity and the re-spend', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockRejectedValue(new Error('deadlock detected'));
    const { recordEnrichmentFailure, emit, logger } = makeService(update);

    // It must still swallow: one entity's bookkeeping failure cannot end the
    // batch that is enriching the other 24.
    await expect(
      recordEnrichmentFailure(ENTITY, 'places_no_match'),
    ).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledTimes(1);
    const alert = emit.mock.calls[0][0];
    expect(alert.kind).toBe('enrichment_failure_count_write_failed');
    expect(alert.severity).toBe('warn');
    expect(alert.body).toContain(ENTITY.entityId);
    expect(alert.body).toContain('deadlock detected');
    expect(alert.dedupeKey).toContain(ENTITY.entityId);
    // ERROR, not warn: this is the one bookkeeping write whose absence costs
    // money on a schedule.
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('a successful count write raises nothing (the alert is not always-on)', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockResolvedValue({});
    const { recordEnrichmentFailure, emit, logger } = makeService(update);

    await recordEnrichmentFailure(ENTITY, 'places_no_match');

    expect(update).toHaveBeenCalledTimes(1);
    // The counter increment is IN the write this test just proved happened.
    expect(update.mock.calls[0][0].data).toHaveProperty('restaurantMetadata');
    expect(emit).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
