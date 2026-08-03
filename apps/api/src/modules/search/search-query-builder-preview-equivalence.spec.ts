import { Prisma } from '@prisma/client';
import { SearchQueryBuilder } from './search-query.builder';

/**
 * F511 — the builder maintains a hand-written `preview` string beside every
 * Prisma.Sql clause. A preview that can drift from the query it describes is a
 * SECOND SOURCE OF TRUTH: the ideal fix is to derive the preview from the Sql,
 * but Prisma.Sql renders values as `$N` placeholders with a separate values
 * array and the human preview deliberately uses a different rendering
 * (formatUuidArray → `ARRAY['..']::uuid[]`), so a byte-faithful derivation is
 * impractical. This spec is the alternative the design sanctioned: it RENDERS
 * each clause's Prisma.Sql to a concrete string (inlining `sql.values` into the
 * `$N` placeholders), canonicalizes both the rendered Sql AND the hand preview
 * onto one token stream, and asserts they are EQUAL. If anyone edits a clause's
 * Sql arm without editing its preview arm (or vice versa), the canonical forms
 * diverge and this spec goes RED — the drift the finding warned about becomes
 * impossible to land silently.
 *
 * SCOPE: the arms whose preview is meant to be a FAITHFUL rendering of the Sql
 * — restaurant conditions and the connection foodId / foodAttribute /
 * connectionId / minimumVotes arms. The ingredient named-food arm is
 * deliberately abbreviated in its preview (`same-name-or-alias(f, i)`), so
 * ingredient/twin filters are excluded here by construction.
 */

// Inline sql.values into the `?` placeholders of a Prisma.Sql (Prisma renders
// positional params as `?`, consumed in order) so the rendered string carries
// the SAME literals the preview inlines by hand.
function renderInlined(sql: Prisma.Sql): string {
  const values = sql.values;
  let i = 0;
  return sql.sql.replace(/\?/g, () => {
    const value = values[i++];
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (Array.isArray(value)) {
      return value.map((v) => JSON.stringify(v)).join(', ');
    }
    return typeof value === 'object'
      ? JSON.stringify(value)
      : String(value as string | number | boolean | bigint);
  });
}

// Collapse the two renderings onto one token stream: drop per-element and
// array casts, quotes, whitespace and parenthesization — the cosmetic
// differences between Prisma's `$N::uuid` params and the preview's inlined
// `'uuid'` literals — so what remains is the STRUCTURE (columns, operators,
// value order). Two clauses that describe the same query canonicalize equal;
// any real drift (a missing arm, a different column, a different id set) does
// not.
function canon(input: string): string {
  return input
    .replace(/::uuid\[\]|::uuid|::smallint\[\]|::smallint/g, '')
    .replace(/'/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';

type ClauseResult = { sql: Prisma.Sql; preview: string };
type BuilderPrivate = {
  buildRestaurantConditions(filters: unknown, opts?: unknown): ClauseResult;
  buildConnectionConditions(filters: unknown): ClauseResult;
  buildConnectionMatchConditions(filters: unknown): ClauseResult;
};

function baseFilters(overrides: Record<string, unknown> = {}): unknown {
  return {
    restaurantIds: [],
    connectionIds: [],
    restaurantAttributeIds: [],
    foodIds: [],
    foodTextExpansionIds: [],
    twinIngredientIds: [],
    foodAttributeIds: [],
    ingredientIds: [],
    foodAttributePrimary: false,
    boundsPayload: null,
    polygonPayload: null,
    priceLevels: [],
    minimumVotes: null,
    ...overrides,
  };
}

describe('SearchQueryBuilder preview⟺sql equivalence (F511)', () => {
  const builder = new SearchQueryBuilder() as unknown as BuilderPrivate;

  const assertEquivalent = (result: {
    sql: Prisma.Sql;
    preview: string;
  }): void => {
    expect(canon(renderInlined(result.sql))).toBe(canon(result.preview));
  };

  it('buildRestaurantConditions: sql and preview describe the same clause', () => {
    assertEquivalent(
      builder.buildRestaurantConditions(
        baseFilters({
          restaurantIds: [UUID_A, UUID_B],
          restaurantAttributeIds: [UUID_A],
          priceLevels: [1, 2],
        }),
      ),
    );
  });

  it('buildConnectionConditions: foodIds + foodAttributes + connectionIds + minimumVotes', () => {
    const result = builder.buildConnectionConditions(
      baseFilters({
        connectionIds: [UUID_A],
        foodIds: [UUID_A, UUID_B],
        foodAttributeIds: [UUID_B],
        minimumVotes: 3,
      }),
    );
    assertEquivalent(result);
  });

  it('buildConnectionConditions: primary-food-attribute OR arm', () => {
    assertEquivalent(
      builder.buildConnectionConditions(
        baseFilters({
          foodAttributePrimary: true,
          foodAttributeIds: [UUID_A],
          foodTextExpansionIds: [UUID_B],
          foodIds: [],
        }),
      ),
    );
  });

  it('buildConnectionMatchConditions: shares the same core, stays equivalent', () => {
    assertEquivalent(
      builder.buildConnectionMatchConditions(
        baseFilters({
          foodIds: [UUID_A],
          foodAttributeIds: [UUID_B],
          minimumVotes: 5,
        }),
      ),
    );
  });

  it('RED backstop: a preview that drops a clause the sql keeps is caught', () => {
    // Prove the canonical comparison can FAIL — mutate the preview to omit the
    // foodAttribute arm the sql still carries. If this ever passes, the guard
    // is asleep.
    const result = builder.buildConnectionConditions(
      baseFilters({
        foodIds: [UUID_A],
        foodAttributeIds: [UUID_B],
      }),
    );
    const driftedPreview = result.preview.replace(
      /c\.food_attributes[^)]*/i,
      'TRUE',
    );
    expect(canon(renderInlined(result.sql))).not.toBe(canon(driftedPreview));
  });
});
