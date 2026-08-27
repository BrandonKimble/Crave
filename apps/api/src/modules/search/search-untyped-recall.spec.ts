import 'reflect-metadata';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import type { EntityResolutionInput } from '../content-processing/entity-resolver/entity-resolution.types';
import {
  judgedVocabularyDouble,
  LEGACY_CUE_SEED,
} from '../../shared/testing/judged-vocabulary-double';

/**
 * STEP-2 UNTYPED RECALL + LEMMA PROBES (spec §4.2, the never-look defect).
 * Real-data premises verified on the mirror 2026-08-01: "breakfast" is
 * genuinely multi-type (food + food_attribute + restaurant_attribute) and
 * "empanadas" has NO exact/alias row while "empanada" exists — so both
 * lanes below exercise real failure classes, not synthetic ones.
 */

const VEGAN_ATTR = 'aaaaaaaa-0000-0000-0000-000000000001';
const BREAKFAST_FOOD = 'bbbbbbbb-0000-0000-0000-000000000001';
const BREAKFAST_ATTR = 'bbbbbbbb-0000-0000-0000-000000000002';
const EMPANADA_FOOD = 'cccccccc-0000-0000-0000-000000000001';

type Candidate = {
  entityId: string;
  name: string;
  type: string;
  sparseEvidence: string;
  sparseSimilarity: number;
};

function makeService(
  retrieve: (term: string, types: string[]) => Candidate[],
  dietaryIds: Set<string> = new Set(),
): SearchQueryInterpretationService {
  const entityTextSearch = {
    retrieveCandidates: jest.fn(
      (term: string, types: string[]): Promise<Candidate[]> =>
        Promise.resolve(retrieve(term, types)),
    ),
  };
  const dietary = { getDietaryIds: jest.fn(() => Promise.resolve(dietaryIds)) };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return new SearchQueryInterpretationService(
    entityTextSearch as never,
    {} as never,
    dietary as never,
    {
      // FacetRegistry double: dietary ids carry placement rank 0 (F4 —
      // the rank rides the facet row, sourced from the dietary registry).
      getPlacementRanks: () =>
        Promise.resolve(new Map([...dietaryIds].map((id) => [id, 0]))),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    judgedVocabularyDouble({ negators: LEGACY_CUE_SEED }),
    logger as never,
  );
}

function input(name: string, entityType: string): EntityResolutionInput {
  return {
    tempId: `${entityType}:test`,
    normalizedName: name,
    originalText: name,
    entityType: entityType as never,
    aliases: [name],
    engineId: null,
  };
}

describe('step-2 untyped recall + single-bucket placement', () => {
  it('lemma variant probe grounds "empanadas" via "empanada" as EXACT (no alias luck)', async () => {
    const svc = makeService((term, types) => {
      if (term === 'empanada' && types.includes('item')) {
        return [
          {
            entityId: EMPANADA_FOOD,
            name: 'empanada',
            type: 'item',
            sparseEvidence: 'exact',
            sparseSimilarity: 1,
          },
        ];
      }
      return [];
    });
    const results = await (
      svc as never as {
        linkViaHybridRecall: (
          i: EntityResolutionInput[],
        ) => Promise<
          Array<{ entityId: string | null; resolutionTier: string }>
        >;
      }
    ).linkViaHybridRecall([input('empanadas', 'item')]);
    expect(results[0].entityId).toBe(EMPANADA_FOOD);
    expect(results[0].resolutionTier).toBe('exact');
  });

  it('never-look fix: a food-typed term that only exists as an attribute re-buckets there', async () => {
    const svc = makeService((term, types) => {
      // Nothing in the food/ingredient vocabularies; exact in food_attribute.
      if (term === 'breakfast' && types.includes('item_attribute')) {
        return [
          {
            entityId: BREAKFAST_ATTR,
            name: 'breakfast',
            type: 'item_attribute',
            sparseEvidence: 'exact',
            sparseSimilarity: 1,
          },
        ];
      }
      return [];
    });
    const results = await (
      svc as never as {
        linkViaHybridRecall: (i: EntityResolutionInput[]) => Promise<
          Array<{
            entityId: string | null;
            originalInput: { entityType: string };
          }>
        >;
      }
    ).linkViaHybridRecall([input('breakfast', 'item')]);
    expect(results[0].entityId).toBe(BREAKFAST_ATTR);
    // Single-bucket placement: grouping keys off originalInput.entityType.
    expect(results[0].originalInput.entityType).toBe('item_attribute');
  });

  it('dietary flag WINS placement over the deterministic type order', async () => {
    const svc = makeService(
      (term, types) => {
        if (term !== 'vegan') return [];
        const out: Candidate[] = [];
        if (types.includes('item'))
          out.push({
            entityId: BREAKFAST_FOOD,
            name: 'vegan',
            type: 'item',
            sparseEvidence: 'exact',
            sparseSimilarity: 1,
          });
        if (types.includes('place_attribute'))
          out.push({
            entityId: VEGAN_ATTR,
            name: 'vegan',
            type: 'place_attribute',
            sparseEvidence: 'exact',
            sparseSimilarity: 1,
          });
        return out;
      },
      new Set([VEGAN_ATTR]),
    );
    // Typed as restaurant → typed link misses → cross-type sees BOTH food
    // (earlier in the deterministic order) and the dietary attribute; the
    // dietary flag must win.
    const results = await (
      svc as never as {
        linkViaHybridRecall: (i: EntityResolutionInput[]) => Promise<
          Array<{
            entityId: string | null;
            originalInput: { entityType: string };
          }>
        >;
      }
    ).linkViaHybridRecall([input('vegan', 'place')]);
    expect(results[0].entityId).toBe(VEGAN_ATTR);
    expect(results[0].originalInput.entityType).toBe('place_attribute');
  });

  it('unified retrieval: one all-types call per surface form; exact wins', async () => {
    const retrieve = jest.fn((term: string, types: string[]) => {
      if (term === 'taco' && types.includes('item')) {
        return [
          {
            entityId: EMPANADA_FOOD,
            name: 'taco',
            type: 'item',
            sparseEvidence: 'exact',
            sparseSimilarity: 1,
          },
        ];
      }
      return [];
    });
    const svc = makeService(retrieve);
    const results = await (
      svc as never as {
        linkViaHybridRecall: (
          i: EntityResolutionInput[],
        ) => Promise<Array<{ entityId: string | null }>>;
      }
    ).linkViaHybridRecall([input('taco', 'item')]);
    expect(results[0].entityId).toBe(EMPANADA_FOOD);
    // ONE retrieval per surface form (taco + lemma variant tacos), each
    // over ALL types — the lane chain's per-lane round trips are gone.
    expect(retrieve).toHaveBeenCalledTimes(2);
    for (const call of retrieve.mock.calls) {
      expect(call[1]).toEqual(
        expect.arrayContaining(['item', 'place_attribute', 'place']),
      );
    }
  });
});
