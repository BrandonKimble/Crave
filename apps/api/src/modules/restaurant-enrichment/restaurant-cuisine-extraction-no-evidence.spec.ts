import { EntityType } from '@prisma/client';
import { PlaceCuisineExtractionService } from './restaurant-cuisine-extraction.service';

/**
 * ONE CUISINE JUDGE, ALL SIGNALS (owner-ruled 2026-08-30) + F4948.
 *
 * The venue NAME is first-class evidence: the judge is asked whenever a
 * name or a summary exists — which for a real place is ALWAYS, since
 * places carry names. The old "no evidence -> defer" branch survives only
 * for the degenerate no-name/no-summary/no-types row (F4948's law: no
 * evidence is not a completed extraction — write NO record, so the
 * fingerprint gate reads "not yet asked" and re-tries when evidence
 * appears).
 *
 * MUTATION: gate the LLM call on the summary again (the pre-2026-08-30
 * shape) and the name-only assertion below reds.
 */
describe('cuisine judge reads the venue name as first-class evidence', () => {
  type EntityUpdateArgs = { data: Record<string, unknown> };

  function makeService(opts: {
    entity: Record<string, unknown>;
    update: jest.Mock<Promise<unknown>, [EntityUpdateArgs]>;
    extractVenueCuisineFacts: jest.Mock;
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
      placeAttributeEvidence: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
      // K1: the read column is a projection — the lane re-projects it from
      // evidence after each completed extraction.
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const attributeOntologyQueue = { queueAdjudication: jest.fn() };
    const llmService = {
      extractVenueCuisineFacts: opts.extractVenueCuisineFacts,
    };
    const aliasManagement = {
      // Return no valid aliases so attribute resolution (DB creates /
      // transactions) is skipped — `source` is decided before this filtering,
      // so the stamp under test is unaffected.
      validateScopeConstraints: () => ({ validAliases: [] as string[] }),
    };
    const service = new PlaceCuisineExtractionService(
      prisma as never,
      llmService as never,
      aliasManagement as never,
      attributeOntologyQueue as never,
      logger as never,
      { embedEntities: () => Promise.resolve(0) } as never,
    );
    return { service, prisma, llmService };
  }

  const NAME_ONLY_ENTITY = {
    entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Chaba Thai',
    type: EntityType.place,
    placeAttributes: [],
    // No matching place types and no editorial summary — the name is the
    // only evidence, and it IS evidence now.
    placeMetadata: { googlePlaces: { types: [], editorialSummary: null } },
  };

  it('a name-only place IS judged — the name alone is evidence', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockResolvedValue({});
    const extractVenueCuisineFacts = jest
      .fn()
      .mockResolvedValue({ cuisines: ['thai'], attributes: [] });
    const { service } = makeService({
      entity: NAME_ONLY_ENTITY,
      update,
      extractVenueCuisineFacts,
    });

    await service.extractCuisineForPlace(NAME_ONLY_ENTITY.entityId);

    expect(extractVenueCuisineFacts).toHaveBeenCalledTimes(1);
    expect(extractVenueCuisineFacts).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chaba Thai' }),
    );
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

  it('a truly evidence-free row (no name, no summary, no types) writes NO record (F4948)', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockResolvedValue({});
    const extractVenueCuisineFacts = jest.fn();
    const { service } = makeService({
      entity: { ...NAME_ONLY_ENTITY, name: '  ' },
      update,
      extractVenueCuisineFacts,
    });

    await service.extractCuisineForPlace(NAME_ONLY_ENTITY.entityId);

    // The LLM was never asked (there was nothing to ask with)...
    expect(extractVenueCuisineFacts).not.toHaveBeenCalled();
    // ...and NOTHING was persisted — in particular no extractedAt stamp that
    // the fingerprint gate would read as "done".
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

  it('the judge asked but finding nothing IS recorded as done (llm_found_nothing)', async () => {
    const update = jest
      .fn<Promise<unknown>, [EntityUpdateArgs]>()
      .mockResolvedValue({});
    const extractVenueCuisineFacts = jest
      .fn()
      .mockResolvedValue({ cuisines: [], attributes: [] });
    const ambiguousName = {
      ...NAME_ONLY_ENTITY,
      name: "Roman's",
    };
    const { service } = makeService({
      entity: ambiguousName,
      update,
      extractVenueCuisineFacts,
    });

    await service.extractCuisineForPlace(ambiguousName.entityId);

    // We HAD evidence (the name) and asked; a distinct typed value records
    // that so the gate does not re-spend on the same unchanged inputs.
    expect(extractVenueCuisineFacts).toHaveBeenCalledTimes(1);
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
