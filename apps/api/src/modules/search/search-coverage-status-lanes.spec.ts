import 'reflect-metadata';
import { SearchService } from './search.service';
import { SearchQueryRequestDto } from './dto/search-query.dto';

/**
 * THE ENTITY-LANE ENUMERATION IS DERIVED, NEVER HAND-LISTED (F3800/D79,
 * re-hit by the 2026-08-19 everything-red-team, finding (a)) — plus the
 * PARTIAL-HONESTY law (finding C4e/(b)).
 *
 * Three sibling predicates on SearchService each hand-copied a four-lane
 * list and all three forgot `ingredients`: an ingredient-only search
 * ('camarones' class) reported coverage 'full' on zero results, never became
 * expansion-eligible (hasEntityTargets gated the expansion trigger), and
 * never triggered on-demand. All three now derive from
 * QUERY_ENTITY_GROUP_KEYS.
 *
 * MUTATION: re-inlining any hand list without `ingredients` turns the
 * ingredient-only cases below RED; dropping the hasUnresolvedTerms consult
 * in calculateCoverageStatus turns the partial-honesty cases RED.
 *
 * The private methods are exercised off the real prototype (no DB, no Nest
 * context) — these are pure predicates over the request shape.
 */

type Svc = {
  hasEntityTargets(request: SearchQueryRequestDto): boolean;
  shouldTriggerOnDemand(
    request: SearchQueryRequestDto,
    format: string,
    placeCount: number,
  ): boolean;
  calculateCoverageStatus(params: {
    request: SearchQueryRequestDto;
    totalItemResults: number;
    totalPlaceResults: number;
    triggeredOnDemand: boolean;
    hasUnresolvedTerms: boolean;
  }): 'full' | 'partial' | 'unresolved';
  onDemandMinResults: number;
};

function service(): Svc {
  const svc = Object.create(SearchService.prototype) as Svc;
  svc.onDemandMinResults = 5;
  return svc;
}

function req(entities: Record<string, unknown>): SearchQueryRequestDto {
  return { entities } as unknown as SearchQueryRequestDto;
}

const groundedIngredient = {
  ingredients: [
    {
      normalizedName: 'camarones',
      originalText: 'camarones',
      entityIds: ['33333333-0000-4000-8000-000000000001'],
    },
  ],
};

describe('entity-lane enumeration is derived (ingredient lane included)', () => {
  it('hasEntityTargets sees an ingredient-only request (expansion eligibility)', () => {
    expect(service().hasEntityTargets(req(groundedIngredient))).toBe(true);
    expect(service().hasEntityTargets(req({}))).toBe(false);
  });

  it('shouldTriggerOnDemand fires for an ingredient-only request below the floor', () => {
    expect(
      service().shouldTriggerOnDemand(req(groundedIngredient), 'dual_list', 0),
    ).toBe(true);
  });

  it('shouldTriggerOnDemand stays restaurant-lane-blind (food-driven law) and floor-gated', () => {
    const placesOnly = req({
      places: [{ normalizedName: 'alcove', entityIds: ['x'] }],
    });
    expect(service().shouldTriggerOnDemand(placesOnly, 'dual_list', 0)).toBe(
      false,
    );
    expect(
      service().shouldTriggerOnDemand(req(groundedIngredient), 'dual_list', 5),
    ).toBe(false);
  });

  it('an ingredient-only search with zero results is unresolved, never full', () => {
    expect(
      service().calculateCoverageStatus({
        request: req(groundedIngredient),
        totalItemResults: 0,
        totalPlaceResults: 0,
        triggeredOnDemand: false,
        hasUnresolvedTerms: false,
      }),
    ).toBe('unresolved');
  });

  it('a NAMED ingredient lane with zero ids is unresolved (the MEDIUM-2 law, ingredient arm)', () => {
    expect(
      service().calculateCoverageStatus({
        request: req({
          ingredients: [{ normalizedName: 'unicorn meat', entityIds: [] }],
        }),
        totalItemResults: 25,
        totalPlaceResults: 10,
        triggeredOnDemand: false,
        hasUnresolvedTerms: false,
      }),
    ).toBe('unresolved');
  });
});

describe('partial-honesty (C4e): unresolved terms beside served results', () => {
  const groundedItem = req({
    items: [
      {
        normalizedName: 'pudding',
        entityIds: ['33333333-0000-4000-8000-000000000002'],
      },
    ],
  });

  it("'zorblatt pudding' — served results + an unresolved term = partial", () => {
    expect(
      service().calculateCoverageStatus({
        request: groundedItem,
        totalItemResults: 20,
        totalPlaceResults: 16,
        triggeredOnDemand: false,
        hasUnresolvedTerms: true,
      }),
    ).toBe('partial');
  });

  it("'pudding' — served results, nothing unresolved = full", () => {
    expect(
      service().calculateCoverageStatus({
        request: groundedItem,
        totalItemResults: 20,
        totalPlaceResults: 16,
        triggeredOnDemand: false,
        hasUnresolvedTerms: false,
      }),
    ).toBe('full');
  });

  it('even a no-targets serve is partial when terms went unresolved', () => {
    expect(
      service().calculateCoverageStatus({
        request: req({}),
        totalItemResults: 25,
        totalPlaceResults: 25,
        triggeredOnDemand: false,
        hasUnresolvedTerms: true,
      }),
    ).toBe('partial');
    expect(
      service().calculateCoverageStatus({
        request: req({}),
        totalItemResults: 25,
        totalPlaceResults: 25,
        triggeredOnDemand: false,
        hasUnresolvedTerms: false,
      }),
    ).toBe('full');
  });
});
