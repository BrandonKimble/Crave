/**
 * D47 scale pass — ACTIVE-RUN IS A JOIN PREDICATE, NOT A POST-FILTER.
 *
 * Both projection loaders used to fetch every generation's events for the
 * batch, carry `sourceDocument.activeExtractionRunId` purely to compare it in
 * JS, and drop the losers. The discard grows without bound: supersedeAndActivate
 * only DELETES a superseded generation that shares the activating run's
 * systemPromptHash, so a re-extraction under an ITERATED prompt — the entire
 * point of the re-extract rail — retains its predecessor forever.
 *
 * The load-bearing claim is therefore about EXCLUSION, and it is asserted on
 * the emitted SQL: the predicate is a column-to-column comparison inside the
 * join, which is the only form that can (a) exclude before the wire and (b)
 * use idx_source_documents_active_run. Asserting that a helper was "mentioned"
 * would be the exact failure act-identity.ts documents, so these read the real
 * statement text.
 */
import { ProjectionRebuildService } from './projection-rebuild.service';

const logger = {
  setContext: jest.fn().mockReturnThis(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

type Captured = { sql: string; values: unknown[] };

function buildService(captured: Captured[]) {
  const tx = {
    $queryRaw: jest
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          captured.push({ sql: strings.join('?'), values });
          return Promise.resolve([]);
        },
      ),
    // Present so a regression back to the ORM shape is caught, not silently run.
    placeEvent: { findMany: jest.fn().mockResolvedValue([]) },
    placeEntityEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ProjectionRebuildService(
    {} as never,
    logger as never,
  ) as unknown as {
    loadActivePlaceEvents: (tx: unknown, ids: string[]) => Promise<unknown[]>;
    loadActivePlaceEntityEvents: (
      tx: unknown,
      ids: string[],
    ) => Promise<unknown[]>;
  };
  return { service, tx };
}

const IDS = ['11111111-1111-1111-1111-111111111111'];

describe.each([
  [
    'loadActiveRestaurantEvents',
    'core_restaurant_events',
    (
      s: ReturnType<typeof buildService>['service'],
      tx: unknown,
      ids: string[],
    ) => s.loadActivePlaceEvents(tx, ids),
  ],
  [
    'loadActiveRestaurantEntityEvents',
    'core_restaurant_entity_events',
    (
      s: ReturnType<typeof buildService>['service'],
      tx: unknown,
      ids: string[],
    ) => s.loadActivePlaceEntityEvents(tx, ids),
  ],
] as const)('%s', (_name, table, load) => {
  it('excludes non-active generations INSIDE the join, not in JS', async () => {
    const captured: Captured[] = [];
    const { service, tx } = buildService(captured);

    await load(service, tx, IDS);

    expect(captured).toHaveLength(1);
    const { sql } = captured[0];
    expect(sql).toContain(`FROM ${table} ev`);
    // THE PREDICATE. RED if it moves back out of the join into a JS filter.
    expect(sql).toContain('JOIN collection_source_documents sd');
    expect(sql).toContain('ON sd.document_id = ev.source_document_id');
    expect(sql).toContain(
      'AND sd.active_extraction_run_id = ev.extraction_run_id',
    );
  });

  it('does NOT go through the ORM loader that could not express the predicate', async () => {
    const captured: Captured[] = [];
    const { service, tx } = buildService(captured);

    await load(service, tx, IDS);

    expect(tx.placeEvent.findMany).not.toHaveBeenCalled();
    expect(tx.placeEntityEvent.findMany).not.toHaveBeenCalled();
  });

  it('does not select the joined column it used to carry only to discard rows', async () => {
    const captured: Captured[] = [];
    const { service, tx } = buildService(captured);

    await load(service, tx, IDS);

    // sd.active_extraction_run_id appears ONCE — in the join, never in SELECT.
    const occurrences =
      captured[0].sql.split('sd.active_extraction_run_id').length - 1;
    expect(occurrences).toBe(1);
  });

  it('binds the restaurant batch as ONE array parameter, not an inlined IN list', async () => {
    const captured: Captured[] = [];
    const { service, tx } = buildService(captured);

    await load(service, tx, IDS);

    expect(captured[0].sql).toContain('ev.restaurant_id = ANY(');
    expect(captured[0].values).toEqual([IDS]);
  });

  it('an empty batch queries NOTHING — no unbounded scan of every event', async () => {
    const captured: Captured[] = [];
    const { service, tx } = buildService(captured);

    await expect(load(service, tx, [])).resolves.toEqual([]);
    expect(captured).toHaveLength(0);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
