import { EntityType } from '@prisma/client';
import { PlaceCuisineExtractionService } from './restaurant-cuisine-extraction.service';

/**
 * NO EVIDENCE IS NOT A COMPLETED EXTRACTION (F4948).
 *
 * The once-ever gate reads `restaurantMetadata.cuisineExtraction.extractedAt`.
 * A freshly-grounded restaurant with no matching place types and no editorial
 * summary has NOTHING to extract from — the LLM cannot even be asked. The old
 * code wrote `source: 'none'` and STAMPED `extractedAt` anyway, so the gate
 * marked it done permanently: when refreshStaleLocations later re-polled and
 * an editorial summary finally appeared, the restaurant was never re-asked.
 *
 * The fix makes "no evidence" representationally distinct from
 * "extracted, found nothing": no-evidence writes NO record (its absence is
 * exactly what the gate reads as "not yet asked"), so first-evidence-later
 * re-tries. MUTATION: revert the service's `else { return; }` back to writing
 * a 'none' record and the first assertion below reds.
 */
describe('cuisine extraction does not stamp "no evidence" as done (F4948)', () => {
  type EntityUpdateArgs = { data: Record<string, unknown> };

  function makeService(opts: {
    entity: Record<string, unknown>;
    update: jest.Mock<Promise<unknown>, [EntityUpdateArgs]>;
    extractCuisineFromSummary: jest.Mock;
  }) {
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const prisma = {
      entity: {
        findUnique: jest.fn().mockResolvedValue(opts.entity),
        update: opts.update,
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      placeAttributeEvidence: { createMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const llmService = {
      extractCuisineFromSummary: opts.extractCuisineFromSummary,
    };
    const aliasManagement = {
      // Return no valid aliases so attribute resolution (DB creates /
      // transactions) is skipped — `source` is decided before this filtering,
      // so the once-ever stamp under test is unaffected.
      validateScopeConstraints: () => ({ validAliases: [] as string[] }),
    };
    const service = new PlaceCuisineExtractionService(
      prisma as never,
      llmService as never,
      aliasManagement as never,
      logger as never,
    );
    return { service, prisma, llmService };
  }

  const NO_EVIDENCE_ENTITY = {
    entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Fresh Ungrounded Spot',
    type: EntityType.place,
    placeAttributes: [],
    // No matching place types, and no editorial summary to ask the LLM with.
    placeMetadata: { googlePlaces: { types: [], editorialSummary: null } },
  };

  it('a no-evidence restaurant writes NO cuisineExtraction record (gate stays open)', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockResolvedValue({});
    const extractCuisineFromSummary = jest.fn();
    const { service } = makeService({
      entity: NO_EVIDENCE_ENTITY,
      update,
      extractCuisineFromSummary,
    });

    await service.extractCuisineForPlace(NO_EVIDENCE_ENTITY.entityId);

    // The LLM was never asked (there was nothing to ask with)...
    expect(extractCuisineFromSummary).not.toHaveBeenCalled();
    // ...and NOTHING was persisted — in particular no extractedAt stamp that
    // the once-ever gate would read as "done". This is the assertion that
    // reds if the no-evidence branch is reverted to writing a record.
    const stampedDone = update.mock.calls.some((call) => {
      const meta = call[0]?.data?.placeMetadata as
        | Record<string, unknown>
        | undefined;
      const extraction = meta?.cuisineExtraction as
        | Record<string, unknown>
        | undefined;
      return Boolean(extraction?.extractedAt);
    });
    expect(stampedDone).toBe(false);
  });

  it('once a summary appears, the LLM IS asked (the re-try the gate allows)', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockResolvedValue({});
    const extractCuisineFromSummary = jest
      .fn()
      .mockResolvedValue({ cuisines: ['thai'] });
    const withSummary = {
      ...NO_EVIDENCE_ENTITY,
      placeMetadata: {
        googlePlaces: {
          types: [],
          editorialSummary: 'A cozy Thai kitchen in East Austin.',
        },
      },
    };
    const { service } = makeService({
      entity: withSummary,
      update,
      extractCuisineFromSummary,
    });

    await service.extractCuisineForPlace(withSummary.entityId);

    // First evidence arrived -> the extraction actually runs (no permanent
    // short-circuit from a prior no-evidence stamp).
    expect(extractCuisineFromSummary).toHaveBeenCalledTimes(1);
    const stampedDone = update.mock.calls.some((call) => {
      const meta = call[0]?.data?.placeMetadata as
        | Record<string, unknown>
        | undefined;
      const extraction = meta?.cuisineExtraction as
        | Record<string, unknown>
        | undefined;
      return (extraction?.source as string) === 'llm';
    });
    expect(stampedDone).toBe(true);
  });

  it('the LLM asked but finding nothing IS recorded as done (llm_found_nothing)', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockResolvedValue({});
    const extractCuisineFromSummary = jest
      .fn()
      .mockResolvedValue({ cuisines: [] });
    const withSummary = {
      ...NO_EVIDENCE_ENTITY,
      placeMetadata: {
        googlePlaces: {
          types: [],
          editorialSummary: 'An unremarkable spot with no cuisine signal.',
        },
      },
    };
    const { service } = makeService({
      entity: withSummary,
      update,
      extractCuisineFromSummary,
    });

    await service.extractCuisineForPlace(withSummary.entityId);

    // We HAD evidence and asked; a distinct typed value records that so the
    // gate does not re-spend on the same unchanged summary.
    expect(extractCuisineFromSummary).toHaveBeenCalledTimes(1);
    const recorded = update.mock.calls.find((call) => {
      const meta = call[0]?.data?.placeMetadata as
        | Record<string, unknown>
        | undefined;
      return Boolean(meta?.cuisineExtraction);
    });
    const extraction = (
      recorded?.[0]?.data?.placeMetadata as Record<string, unknown>
    )?.cuisineExtraction as Record<string, unknown>;
    expect(extraction?.source).toBe('llm_found_nothing');
    expect(extraction?.extractedAt).toBeTruthy();
  });
});
