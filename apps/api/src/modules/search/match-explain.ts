import type { MatchExplain } from '@crave-search/shared';
import type {
  ConceptArm,
  ConceptConstraint,
} from './search-execution-directives';

/**
 * WHY THIS MATCHED — the one explain derivation (owner design 2026-08-30).
 *
 * PRINCIPLE: explain by affinity, never by deficit. An exact match says
 * NOTHING; every other admitted row gets exactly ONE compact explanation,
 * prioritized similar > contains > partial (most informative first):
 *
 *  - 'similar'  — the row rode the tier-2 ring (dense sibling / judged
 *    cousin of the asked dish) or satisfied a soft concept ONLY through a
 *    judged widening arm ("bar" admitted the pub). terms = the user's asked
 *    word — the thing this row is close to.
 *  - 'contains' — the query grounded an ingredient and this dish matched
 *    through containment while its NAME does not carry the ingredient word
 *    (the carbonara for a "pancetta" ask). terms = the asked ingredient
 *    word(s); `widened` marks that ingredient widening was active, so copy
 *    softens ("or a close stand-in").
 *  - 'partial'  — pooled tier 1: the row matched SOME of the user's soft
 *    words. terms = the words it DID match (positive framing). A tier-1 row
 *    that matched none of the resolvable words gets no explanation at all —
 *    silence beats a deficit report.
 *
 * Derivation is pure and display-only: it never touches admission, ordering,
 * or the pooled gate. Inputs are facts each row already carries (tier,
 * attribute-id arrays / the matched-concept tokens column) plus the query's
 * own words.
 */

/** One soft concept, explain-view: which words it stands for and which of
 *  its arms are the anchor's own vs judged widening. */
export interface ExplainConcept {
  id: string;
  /** The user's display word for this concept (originalText preferred). */
  term: string | null;
  /** Dish-axis anchor arms (the concept's own). */
  dishAnchorArms: ConceptArm[];
  /** Dish-axis widened arms (judged satisfies neighbors). */
  dishWidenedArms: ConceptArm[];
}

export interface MatchExplainContext {
  concepts: ExplainConcept[];
  /** The asked subject word (for tier-2 ring copy: "close to omakase"). */
  subjectTerm: string | null;
  /** Ingredient ask facts, or null when the query grounded no ingredient. */
  ingredient: { terms: string[]; widened: boolean } | null;
}

interface EntityLike {
  normalizedName: string;
  entityIds?: string[];
  originalText?: string | null;
}

/** Resolve each soft concept to the user's own word and split its dish-axis
 *  arms into anchor vs widened. Word lookup: the request entity whose
 *  entityIds carry the concept id (originalText preferred — the user's own
 *  spelling). */
export function buildMatchExplainContext(params: {
  softConcepts: ConceptConstraint[];
  attributeEntities: EntityLike[];
  subjectEntities: EntityLike[];
  ingredientEntities: EntityLike[];
  ingredientWidened: boolean;
  hasIngredientAsk: boolean;
}): MatchExplainContext {
  const termForId = (id: string): string | null => {
    for (const entity of params.attributeEntities) {
      if ((entity.entityIds ?? []).includes(id)) {
        return entity.originalText || entity.normalizedName || null;
      }
    }
    return null;
  };
  const concepts: ExplainConcept[] = params.softConcepts.map((concept) => {
    const widenedKeys = new Set(
      (concept.widenedArms ?? []).map((arm) => `${arm.column}|${arm.id}`),
    );
    return {
      id: concept.id,
      term: termForId(concept.id),
      dishAnchorArms: concept.dishArms.filter(
        (arm) => !widenedKeys.has(`${arm.column}|${arm.id}`),
      ),
      dishWidenedArms: concept.dishArms.filter((arm) =>
        widenedKeys.has(`${arm.column}|${arm.id}`),
      ),
    };
  });
  const subject = params.subjectEntities[0];
  const ingredientTerms = params.ingredientEntities
    .map((entity) => entity.originalText || entity.normalizedName)
    .filter((term): term is string => Boolean(term));
  return {
    concepts,
    subjectTerm: subject
      ? subject.originalText || subject.normalizedName || null
      : null,
    ingredient:
      params.hasIngredientAsk && ingredientTerms.length
        ? { terms: ingredientTerms, widened: params.ingredientWidened }
        : null,
  };
}

const armHit = (
  arm: ConceptArm,
  foodAttributeIds: readonly string[],
  placeAttributeIds: readonly string[],
): boolean =>
  arm.column === 'food_attributes'
    ? foodAttributeIds.includes(arm.id)
    : placeAttributeIds.includes(arm.id);

/** Derive the explanation for one DISH row from facts it already carries. */
export function deriveDishMatchExplain(
  row: {
    matchTier: number | null | undefined;
    itemName: string;
    foodAttributeIds: readonly string[];
    placeAttributeIds: readonly string[];
    /** TESTIMONY-arm containment fact (owner ruling 2026-08-30): true when
     *  a human wrote the ingredient on this dish (c.ingredients matched);
     *  false/absent = the row rode a derived arm and copy must hedge. */
    ingredientEvidenceMatch?: boolean | null;
    /** The ADMISSION fact (red team 2026-09-04 S-2): this row entered the
     *  page through the containment arm. Absent/false = it was admitted by
     *  food id (a category member, a twin dish, a served sibling) and no
     *  "may have X in it" chip is owed however its name reads. */
    admittedViaContainment?: boolean | null;
  },
  ctx: MatchExplainContext,
): MatchExplain | undefined {
  // Tier 2 = the similar ring: a different (adjacent) craving entirely.
  if (row.matchTier === 2) {
    return { kind: 'similar', terms: ctx.subjectTerm ? [ctx.subjectTerm] : [] };
  }

  // Widened-arm-only satisfaction: the row satisfies a concept, but only
  // through its judged neighbor — "close match: bar". Applies at any tier.
  const widenedOnlyTerms: string[] = [];
  const satisfiedTerms: string[] = [];
  for (const concept of ctx.concepts) {
    const anchorHit = concept.dishAnchorArms.some((arm) =>
      armHit(arm, row.foodAttributeIds, row.placeAttributeIds),
    );
    const widenedHit =
      !anchorHit &&
      concept.dishWidenedArms.some((arm) =>
        armHit(arm, row.foodAttributeIds, row.placeAttributeIds),
      );
    if (widenedHit && concept.term) {
      widenedOnlyTerms.push(concept.term);
    }
    if ((anchorHit || widenedHit) && concept.term) {
      satisfiedTerms.push(concept.term);
    }
  }
  if (widenedOnlyTerms.length) {
    return { kind: 'similar', terms: widenedOnlyTerms };
  }

  // Ingredient containment where the dish name doesn't say so itself —
  // and ONLY for rows the containment arm admitted.
  if (ctx.ingredient && row.admittedViaContainment === true) {
    const name = row.itemName.toLowerCase();
    const namedInDish = ctx.ingredient.terms.some((term) =>
      name.includes(term.toLowerCase()),
    );
    if (!namedInDish) {
      return {
        kind: 'contains',
        terms: ctx.ingredient.terms,
        ...(ctx.ingredient.widened ? { widened: true as const } : {}),
        // Never promise what we inferred (owner ruling 2026-08-30):
        // 'evidence' only when the testimony arm provably matched.
        basis:
          row.ingredientEvidenceMatch === true
            ? ('evidence' as const)
            : ('derived' as const),
      };
    }
  }

  // Pooled tier 1: name the words the row DID match. Nothing nameable ⇒
  // no chip (never a deficit report).
  if (row.matchTier === 1 && satisfiedTerms.length) {
    return { kind: 'partial', terms: satisfiedTerms };
  }
  return undefined;
}

/**
 * Derive the explanation for one RESTAURANT row. Per-concept satisfaction
 * arrives as tokens computed in the same scan that computed the row's tier
 * (`matched_soft_concept_tokens`): '<conceptId>' = satisfied through an
 * anchor arm, '<conceptId>:w' = satisfied ONLY through a widened arm.
 */
export function deriveRestaurantMatchExplain(
  row: {
    matchTier: number | null | undefined;
    conceptTokens: readonly string[];
  },
  ctx: MatchExplainContext,
): MatchExplain | undefined {
  const widenedOnlyTerms: string[] = [];
  const satisfiedTerms: string[] = [];
  for (const concept of ctx.concepts) {
    const anchor = row.conceptTokens.includes(concept.id);
    const widened = !anchor && row.conceptTokens.includes(`${concept.id}:w`);
    if (widened && concept.term) {
      widenedOnlyTerms.push(concept.term);
    }
    if ((anchor || widened) && concept.term) {
      satisfiedTerms.push(concept.term);
    }
  }
  if (widenedOnlyTerms.length) {
    return { kind: 'similar', terms: widenedOnlyTerms };
  }
  if (row.matchTier === 1 && satisfiedTerms.length) {
    return { kind: 'partial', terms: satisfiedTerms };
  }
  return undefined;
}
