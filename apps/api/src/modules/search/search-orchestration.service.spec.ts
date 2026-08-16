import 'reflect-metadata';
import { SearchOrchestrationService } from './search-orchestration.service';
import {
  QUERY_ENTITY_GROUP_KEYS,
  type QueryEntityGroupDto,
  type QueryEntityGroupKey,
} from './dto/search-query.dto';

/**
 * F3800 — THE SEARCH-GROUP VOCABULARY IS EXHAUSTIVE ON THE NATURAL PATH.
 *
 * The orchestrator stated "what can a search be about" THREE times in
 * hand-copied four-arm lists, all missing `ingredients` — which the
 * interpreter emits as a STANDALONE group. So typing "burrata" produced the
 * "adjust your search" empty response while TAPPING it in autocomplete
 * searched normally, and the whole ingredient SQL lane was unreachable from
 * the query that produces it.
 *
 * This spec is driven BY the vocabulary (`QUERY_ENTITY_GROUP_KEYS`) rather
 * than by its own hand-written list, so the two mutations bite:
 *  - delete an arm from QUERY_ENTITY_GROUP_KEYS -> tsc error at the
 *    `_NoUnenumeratedQueryEntityGroup` bind in search-query.dto.ts;
 *  - bypass the vocabulary with a hand-copied list in the service (i.e.
 *    restore the pre-fix four-arm sum) -> the `ingredients` case here goes RED.
 *
 * There was no spec for SearchOrchestrationService at all before this file.
 */

const ENTITY_ID = '99999999-9999-9999-9999-999999999999';

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

/** A natural query that grounds to exactly ONE group, and nothing else —
 *  the shape the interpreter really emits (groupResolvedEntities returns
 *  `undefined` for every empty group). */
function entitiesForGroupOnly(group: QueryEntityGroupKey): QueryEntityGroupDto {
  return {
    [group]: [
      {
        normalizedName: 'burrata',
        originalText: 'burrata',
        entityIds: [ENTITY_ID],
      },
    ],
  } as QueryEntityGroupDto;
}

/** A natural query per group, so the case name reads like a user action. */
const QUERY_FOR_GROUP: Record<QueryEntityGroupKey, string> = {
  restaurants: 'joes pizza',
  food: 'breakfast tacos',
  foodAttributes: 'spicy',
  restaurantAttributes: 'patio seating',
  ingredients: 'burrata',
};

function createHarness(
  entities: QueryEntityGroupDto,
  queryAnalysis?: { browseMode: boolean },
) {
  const structuredRequest = {
    entities,
    pagination: { page: 1, pageSize: 20 },
  };
  const interpretationService = {
    interpret: jest.fn().mockResolvedValue({
      structuredRequest,
      analysis: {
        restaurants: [],
        foods: [],
        foodAttributes: [],
        restaurantAttributes: [],
      },
      unresolved: [],
      ...(queryAnalysis ? { queryAnalysis } : {}),
    }),
  };
  const searchService = {
    runQuery: jest.fn().mockResolvedValue({
      restaurants: [],
      dishes: [],
      metadata: { searchRequestId: 'sr-1' },
    }),
    buildEmptyResponse: jest.fn().mockReturnValue({
      restaurants: [],
      dishes: [],
      metadata: { searchRequestId: 'sr-1' },
    }),
  };
  const service = new SearchOrchestrationService(
    interpretationService as never,
    searchService as never,
    createLogger() as never,
  );
  return { service, interpretationService, searchService };
}

describe('SearchOrchestrationService — group vocabulary reachability (F3800)', () => {
  it('covers every group the request type can carry (the spec is driven by the vocabulary)', () => {
    // If a sixth group is added to QueryEntityGroupDto, the vocabulary bind in
    // the DTO forces it into QUERY_ENTITY_GROUP_KEYS, and this spec then
    // exercises it automatically. Nothing here is hand-copied.
    expect(QUERY_ENTITY_GROUP_KEYS.length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(QUERY_FOR_GROUP).sort()).toEqual(
      [...QUERY_ENTITY_GROUP_KEYS].sort(),
    );
  });

  for (const group of QUERY_ENTITY_GROUP_KEYS) {
    it(`runs the query for a ${group}-only natural search ("${QUERY_FOR_GROUP[group]}")`, async () => {
      const { service, searchService } = createHarness(
        entitiesForGroupOnly(group),
      );

      await service.runNaturalQuery({
        query: QUERY_FOR_GROUP[group],
      } as never);

      // The gate must SEARCH, not tell the user to adjust their query.
      expect(searchService.buildEmptyResponse).not.toHaveBeenCalled();
      expect(searchService.runQuery).toHaveBeenCalledTimes(1);
      expect(
        (
          (searchService.runQuery.mock.calls as unknown[][])[0][0] as {
            entities: unknown;
          }
        ).entities,
      ).toEqual(entitiesForGroupOnly(group));
    });

    it(`reports coverage 'unresolved' (not 'full') when a ${group}-only search returns nothing`, async () => {
      // The second hand-copied list: a group the gate cannot see makes a
      // zero-result search look like an honest "nothing matched".
      const { service, searchService } = createHarness(
        entitiesForGroupOnly(group),
      );

      const response = await service.runNaturalQuery({
        query: QUERY_FOR_GROUP[group],
      } as never);

      expect(searchService.runQuery).toHaveBeenCalledTimes(1);
      expect(response.metadata.resultCoverageStatus).toBe('unresolved');
    });
  }

  it('SERVES a browse query with empty entities through the same runQuery the All-chip uses', async () => {
    // Foundation red team #1: typed 'best'/'food'/'top' interprets to
    // browseMode with entities = {} — the serve must be the ranked page,
    // never the "adjust your search" scold, and it must reach it through
    // the ONE runQuery chokepoint (no second serve path).
    const { service, searchService } = createHarness({}, { browseMode: true });

    const response = await service.runNaturalQuery({
      query: 'best food near me',
    } as never);

    expect(searchService.buildEmptyResponse).not.toHaveBeenCalled();
    expect(searchService.runQuery).toHaveBeenCalledTimes(1);
    expect(
      (
        (searchService.runQuery.mock.calls as unknown[][])[0][0] as {
          entities: unknown;
        }
      ).entities,
    ).toEqual({});
    // Honest metadata: nothing unresolved, coverage full, analysis attached.
    expect(response.metadata.resultCoverageStatus).toBe('full');
    expect(response.metadata.unresolvedEntities).toEqual([]);
    expect(response.metadata.queryAnalysis).toEqual({ browseMode: true });
    expect(response.metadata.emptyQueryMessage).toBeUndefined();
  });

  it('still scolds a NON-browse query with no targets (browseMode false)', async () => {
    const { service, searchService } = createHarness({}, { browseMode: false });

    await service.runNaturalQuery({ query: 'zorblatt quinlex' } as never);

    expect(searchService.runQuery).not.toHaveBeenCalled();
    expect(searchService.buildEmptyResponse).toHaveBeenCalledTimes(1);
  });

  it('still falls to the empty response when NO group is populated', () => {
    // The gate must not become vacuously true — an empty entities object is
    // the one case that legitimately reaches buildEmptyResponse.
    const { service, searchService } = createHarness({});

    return service.runNaturalQuery({ query: 'asdfghjkl' } as never).then(() => {
      expect(searchService.runQuery).not.toHaveBeenCalled();
      expect(searchService.buildEmptyResponse).toHaveBeenCalledTimes(1);
    });
  });
});
