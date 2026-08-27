import 'reflect-metadata';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import type {
  EntityResolutionInput,
  EntityResolutionResult,
} from '../content-processing/entity-resolver/entity-resolution.types';
import {
  judgedVocabularyDouble,
  LEGACY_CUE_SEED,
} from '../../shared/testing/judged-vocabulary-double';

/**
 * THE DENSE LANE OBEYS THE TIE-PLURALITY LAW IT CITES (F6209).
 *
 * The dense lane's own comment claims "THE SAME PLACEMENT LAW as every other
 * lane", and four sibling lanes (gazetteer placement, decomposed, exact,
 * fuzzy) each end with `entityIds: tiedIds.length > 1 ? tiedIds : undefined`.
 * The dense lane computed `tiedTop`, spent it on the argmax, and returned no
 * `entityIds` — so a genuine tie was resolved to a silent argmax, which
 * `EntityResolutionInput`'s contract forbids ("reveals the set (one OR-filter
 * group) instead of trusting a silent argmax").
 *
 * SHOWS RED: delete the `entityIds` field from the dense return and this
 * expectation fails while every other suite stays green — which is exactly
 * how the omission survived four sibling fixes.
 */

const OCTOPUS_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const OCTOPUS_B = 'aaaaaaaa-0000-0000-0000-000000000002';
const GRAPEFRUIT = 'bbbbbbbb-0000-0000-0000-000000000001';

function makeService(): SearchQueryInterpretationService {
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  return new SearchQueryInterpretationService(
    {} as never,
    {} as never,
    {} as never,
    { getCuisineIds: () => Promise.resolve(new Set()) } as never,
    {} as never,
    {} as never,
    {} as never,
    judgedVocabularyDouble({ negators: LEGACY_CUE_SEED }),
    logger as never,
  );
}

function decideDense(
  svc: SearchQueryInterpretationService,
  candidates: Array<{
    entityId: string;
    name: string;
    type: string;
    rrf: number;
    denseCosine: number | null;
  }>,
): EntityResolutionResult {
  const input: EntityResolutionInput = {
    tempId: 'food:test',
    normalizedName: 'pulpo',
    originalText: 'pulpo',
    entityType: 'item' as never,
    aliases: ['pulpo'],
    engineId: null,
  };
  return (
    svc as never as {
      decideDenseLink: (
        i: EntityResolutionInput,
        c: typeof candidates,
        d: ReadonlySet<string>,
        k: ReadonlySet<string>,
      ) => EntityResolutionResult;
    }
  ).decideDenseLink(input, candidates, new Set<string>(), new Set<string>());
}

describe('the dense lane reveals its tie plurality', () => {
  it('emits every same-placement candidate within the tie epsilon', () => {
    const result = decideDense(makeService(), [
      // Two corpus rows for ONE concept, indistinguishable by cosine
      // (0.0005 apart, inside LINKER_TIE_EPSILON = 0.001).
      {
        entityId: OCTOPUS_A,
        name: 'octopus',
        type: 'item',
        rrf: 0.5,
        denseCosine: 0.8,
      },
      {
        entityId: OCTOPUS_B,
        name: 'Octopus',
        type: 'item',
        rrf: 0.49,
        denseCosine: 0.7995,
      },
      // A genuinely different answer, far enough down to clear the margin.
      {
        entityId: GRAPEFRUIT,
        name: 'grapefruit pulp',
        type: 'item',
        rrf: 0.6,
        denseCosine: 0.6,
      },
    ]);

    expect(result.resolutionTier).toBe('dense');
    expect(result.entityId).toBe(OCTOPUS_A);
    expect([...(result.entityIds ?? [])].sort()).toEqual(
      [OCTOPUS_A, OCTOPUS_B].sort(),
    );
  });

  it('leaves entityIds absent when the top is alone at its cosine', () => {
    const result = decideDense(makeService(), [
      {
        entityId: OCTOPUS_A,
        name: 'octopus',
        type: 'item',
        rrf: 0.5,
        denseCosine: 0.8,
      },
      {
        entityId: GRAPEFRUIT,
        name: 'grapefruit pulp',
        type: 'item',
        rrf: 0.6,
        denseCosine: 0.6,
      },
    ]);

    expect(result.entityId).toBe(OCTOPUS_A);
    expect(result.entityIds).toBeUndefined();
  });
});
