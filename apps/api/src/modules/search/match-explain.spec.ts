import {
  buildMatchExplainContext,
  deriveDishMatchExplain,
  deriveRestaurantMatchExplain,
  type MatchExplainContext,
} from './match-explain';
import type { ConceptConstraint } from './search-execution-directives';

/**
 * WHY THIS MATCHED — derivation law:
 *  - exact rows (tier 0/NULL, no widened arm, no hidden ingredient) → ABSENT
 *  - similar > contains > partial (one explanation per row)
 *  - partial names the words the row DID match (never the missing ones)
 */

const PATIO = 'attr-patio';
const BAR = 'attr-bar';
const PUB = 'attr-pub';

const softConcept = (id: string, widenedId?: string): ConceptConstraint => ({
  id,
  hardness: 'soft',
  dishArms: [
    { column: 'restaurant_attributes', id },
    ...(widenedId
      ? [{ column: 'restaurant_attributes' as const, id: widenedId }]
      : []),
  ],
  restaurantArms: [
    { column: 'restaurant_attributes', id },
    ...(widenedId
      ? [{ column: 'restaurant_attributes' as const, id: widenedId }]
      : []),
  ],
  ...(widenedId
    ? {
        widenedArms: [
          { column: 'restaurant_attributes' as const, id: widenedId },
        ],
      }
    : {}),
});

const entity = (name: string, ids: string[], originalText?: string) => ({
  normalizedName: name,
  entityIds: ids,
  originalText: originalText ?? name,
});

const baseContext = (overrides?: Partial<MatchExplainContext>) =>
  ({
    concepts: [],
    subjectTerm: null,
    ingredient: null,
    ...overrides,
  }) satisfies MatchExplainContext;

describe('buildMatchExplainContext', () => {
  it('resolves concept terms from the user entities and splits widened arms', () => {
    const ctx = buildMatchExplainContext({
      softConcepts: [softConcept(BAR, PUB)],
      attributeEntities: [entity('bar', [BAR], 'bar')],
      subjectEntities: [entity('ramen', ['item-1'], 'ramen')],
      ingredientEntities: [],
      ingredientWidened: false,
      hasIngredientAsk: false,
    });
    expect(ctx.subjectTerm).toBe('ramen');
    expect(ctx.concepts).toHaveLength(1);
    expect(ctx.concepts[0].term).toBe('bar');
    expect(ctx.concepts[0].dishAnchorArms.map((a) => a.id)).toEqual([BAR]);
    expect(ctx.concepts[0].dishWidenedArms.map((a) => a.id)).toEqual([PUB]);
  });

  it('carries the ingredient ask with the widened flag', () => {
    const ctx = buildMatchExplainContext({
      softConcepts: [],
      attributeEntities: [],
      subjectEntities: [],
      ingredientEntities: [entity('bacon', ['ing-1'])],
      ingredientWidened: true,
      hasIngredientAsk: true,
    });
    expect(ctx.ingredient).toEqual({ terms: ['bacon'], widened: true });
  });

  it('has no ingredient facts when the query grounded none', () => {
    const ctx = buildMatchExplainContext({
      softConcepts: [],
      attributeEntities: [],
      subjectEntities: [],
      ingredientEntities: [entity('bacon', ['ing-1'])],
      ingredientWidened: false,
      hasIngredientAsk: false,
    });
    expect(ctx.ingredient).toBeNull();
  });
});

describe('deriveDishMatchExplain', () => {
  const ctxWithBar = (): MatchExplainContext =>
    buildMatchExplainContext({
      softConcepts: [softConcept(BAR, PUB), softConcept(PATIO)],
      attributeEntities: [
        entity('bar', [BAR], 'bar'),
        entity('patio', [PATIO], 'patio'),
      ],
      subjectEntities: [entity('ramen', ['item-1'], 'ramen')],
      ingredientEntities: [],
      ingredientWidened: false,
      hasIngredientAsk: false,
    });

  it('EXACT stays silent: tier 0 satisfying every concept by anchor arms', () => {
    const explain = deriveDishMatchExplain(
      {
        matchTier: 0,
        itemName: 'Tonkotsu Ramen',
        foodAttributeIds: [],
        placeAttributeIds: [BAR, PATIO],
      },
      ctxWithBar(),
    );
    expect(explain).toBeUndefined();
  });

  it('no-gate rows (tier NULL) stay silent', () => {
    const explain = deriveDishMatchExplain(
      {
        matchTier: null,
        itemName: 'Tonkotsu Ramen',
        foodAttributeIds: [],
        placeAttributeIds: [],
      },
      ctxWithBar(),
    );
    expect(explain).toBeUndefined();
  });

  it('tier 2 (the ring) → similar, framed by the asked subject word', () => {
    const explain = deriveDishMatchExplain(
      {
        matchTier: 2,
        itemName: 'Tsukemen',
        foodAttributeIds: [],
        placeAttributeIds: [],
      },
      ctxWithBar(),
    );
    expect(explain).toEqual({ kind: 'similar', terms: ['ramen'] });
  });

  it('widened-arm-only satisfaction → similar with the asked word, even at tier 0', () => {
    const explain = deriveDishMatchExplain(
      {
        matchTier: 0,
        itemName: 'Tonkotsu Ramen',
        // the row is a PUB (widened arm of "bar"), plus patio via anchor
        foodAttributeIds: [],
        placeAttributeIds: [PUB, PATIO],
      },
      ctxWithBar(),
    );
    expect(explain).toEqual({ kind: 'similar', terms: ['bar'] });
  });

  it('tier 1 → partial naming the words the row DID match', () => {
    const explain = deriveDishMatchExplain(
      {
        matchTier: 1,
        itemName: 'Tonkotsu Ramen',
        foodAttributeIds: [],
        placeAttributeIds: [PATIO],
      },
      ctxWithBar(),
    );
    expect(explain).toEqual({ kind: 'partial', terms: ['patio'] });
  });

  it('tier 1 matching nothing nameable → silent (never a deficit report)', () => {
    const explain = deriveDishMatchExplain(
      {
        matchTier: 1,
        itemName: 'Tonkotsu Ramen',
        foodAttributeIds: [],
        placeAttributeIds: [],
      },
      ctxWithBar(),
    );
    expect(explain).toBeUndefined();
  });

  describe('ingredient containment', () => {
    const ingredientCtx = (widened: boolean): MatchExplainContext =>
      buildMatchExplainContext({
        softConcepts: [],
        attributeEntities: [],
        subjectEntities: [],
        ingredientEntities: [entity('bacon', ['ing-1'])],
        ingredientWidened: widened,
        hasIngredientAsk: true,
      });

    it('a row NOT admitted through the containment arm gets no chip, whatever its name (S-2: twin dishes, category members, served siblings)', () => {
      for (const admitted of [undefined, null, false] as const) {
        const explain = deriveDishMatchExplain(
          {
            matchTier: null,
            itemName: 'Stracciatella',
            foodAttributeIds: [],
            placeAttributeIds: [],
            ingredientEvidenceMatch: false,
            admittedViaContainment: admitted,
          },
          ingredientCtx(false),
        );
        expect(explain).toBeUndefined();
      }
    });

    it('TESTIMONY arm matched → contains with basis evidence (may assert)', () => {
      const explain = deriveDishMatchExplain(
        {
          matchTier: 0,
          itemName: 'Carbonara',
          foodAttributeIds: [],
          placeAttributeIds: [],
          ingredientEvidenceMatch: true,
          admittedViaContainment: true,
        },
        ingredientCtx(false),
      );
      expect(explain).toEqual({
        kind: 'contains',
        terms: ['bacon'],
        basis: 'evidence',
      });
    });

    it('derived arm (canon/name-twin) → basis derived (must hedge)', () => {
      const explain = deriveDishMatchExplain(
        {
          matchTier: 0,
          itemName: 'Carbonara',
          foodAttributeIds: [],
          placeAttributeIds: [],
          ingredientEvidenceMatch: false,
          admittedViaContainment: true,
        },
        ingredientCtx(false),
      );
      expect(explain).toEqual({
        kind: 'contains',
        terms: ['bacon'],
        basis: 'derived',
      });
    });

    it('absent arm fact → basis derived (never promise the uninspected)', () => {
      const explain = deriveDishMatchExplain(
        {
          matchTier: 0,
          itemName: 'Carbonara',
          foodAttributeIds: [],
          placeAttributeIds: [],
          admittedViaContainment: true,
        },
        ingredientCtx(false),
      );
      expect(explain).toEqual({
        kind: 'contains',
        terms: ['bacon'],
        basis: 'derived',
      });
    });

    it('dish name carrying the ingredient word → silent (it IS the thing)', () => {
      const explain = deriveDishMatchExplain(
        {
          matchTier: 0,
          itemName: 'Bacon Cheeseburger',
          foodAttributeIds: [],
          placeAttributeIds: [],
        },
        ingredientCtx(false),
      );
      expect(explain).toBeUndefined();
    });

    it('ingredient widening active → contains carries the widened flag', () => {
      const explain = deriveDishMatchExplain(
        {
          matchTier: 0,
          itemName: 'Carbonara',
          foodAttributeIds: [],
          placeAttributeIds: [],
          ingredientEvidenceMatch: true,
          admittedViaContainment: true,
        },
        ingredientCtx(true),
      );
      expect(explain).toEqual({
        kind: 'contains',
        terms: ['bacon'],
        widened: true,
        basis: 'evidence',
      });
    });
  });

  it('PRIORITY: similar beats contains beats partial', () => {
    const ctx = buildMatchExplainContext({
      softConcepts: [softConcept(BAR, PUB), softConcept(PATIO)],
      attributeEntities: [
        entity('bar', [BAR], 'bar'),
        entity('patio', [PATIO], 'patio'),
      ],
      subjectEntities: [],
      ingredientEntities: [entity('bacon', ['ing-1'])],
      ingredientWidened: false,
      hasIngredientAsk: true,
    });
    // Row: widened-only bar hit + hidden bacon + tier 1 → similar wins.
    const similar = deriveDishMatchExplain(
      {
        matchTier: 1,
        itemName: 'Carbonara',
        foodAttributeIds: [],
        placeAttributeIds: [PUB],
      },
      ctx,
    );
    expect(similar?.kind).toBe('similar');
    // Row: hidden bacon + tier 1 (no widened hit) → contains beats partial.
    const contains = deriveDishMatchExplain(
      {
        matchTier: 1,
        itemName: 'Carbonara',
        foodAttributeIds: [],
        placeAttributeIds: [PATIO],
        admittedViaContainment: true,
      },
      ctx,
    );
    expect(contains?.kind).toBe('contains');
  });
});

describe('deriveRestaurantMatchExplain', () => {
  const ctx = (): MatchExplainContext =>
    buildMatchExplainContext({
      softConcepts: [softConcept(BAR, PUB), softConcept(PATIO)],
      attributeEntities: [
        entity('bar', [BAR], 'bar'),
        entity('patio', [PATIO], 'patio'),
      ],
      subjectEntities: [],
      ingredientEntities: [],
      ingredientWidened: false,
      hasIngredientAsk: false,
    });

  it('EXACT stays silent: tier 0 with anchor tokens', () => {
    expect(
      deriveRestaurantMatchExplain(
        { matchTier: 0, conceptTokens: [BAR, PATIO] },
        ctx(),
      ),
    ).toBeUndefined();
  });

  it('widened-only token → similar with the asked word', () => {
    expect(
      deriveRestaurantMatchExplain(
        { matchTier: 0, conceptTokens: [`${BAR}:w`, PATIO] },
        ctx(),
      ),
    ).toEqual({ kind: 'similar', terms: ['bar'] });
  });

  it('tier 1 → partial naming the matched words', () => {
    expect(
      deriveRestaurantMatchExplain(
        { matchTier: 1, conceptTokens: [PATIO] },
        ctx(),
      ),
    ).toEqual({ kind: 'partial', terms: ['patio'] });
  });

  it('tier 1 with no tokens → silent', () => {
    expect(
      deriveRestaurantMatchExplain({ matchTier: 1, conceptTokens: [] }, ctx()),
    ).toBeUndefined();
  });

  it('anchor token wins over a stray widened token for the same concept', () => {
    expect(
      deriveRestaurantMatchExplain(
        { matchTier: 1, conceptTokens: [BAR, `${BAR}:w`] },
        ctx(),
      ),
    ).toEqual({ kind: 'partial', terms: ['bar'] });
  });
});

describe('wire shape', () => {
  it('emits only kind/terms(/widened) — a compact, additive object', () => {
    const explain = deriveDishMatchExplain(
      {
        matchTier: 2,
        itemName: 'Tsukemen',
        foodAttributeIds: [],
        placeAttributeIds: [],
      },
      baseContext({ subjectTerm: 'ramen' }),
    );
    expect(Object.keys(explain!).sort()).toEqual(['kind', 'terms']);
  });
});
