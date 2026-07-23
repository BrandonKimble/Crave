import { Prisma } from '@prisma/client';

/**
 * THE canonical wrap-aware longitude-interval intersection (red-team 3c,
 * wave-5 F4) — stated ONCE, in TS and as a SQL generator, and consumed by
 * every longitude-intersection read (demand-mass reader, signal-demand fresh
 * arms). An interval with min > max CROSSES the antimeridian and covers
 * [min, 180] ∪ [-180, max] (the places-catalog / signals representation —
 * a Fiji viewport is a 6° box, never a 354° near-world band). A plain
 * btree range test on a crossing row is meaningless; the four cases below
 * are exhaustive:
 * - neither crosses: plain range overlap;
 * - both cross: both contain the antimeridian ⇒ always intersect;
 * - exactly one crosses: the crossing side's two arcs are tested against the
 *   plain side (an OR of the two half-range comparisons).
 * Fixture law: a Fiji viewport signal (crossing) must NOT attribute to
 * Austin; a crossing-geo signal MUST reach the crossing place it overlaps.
 */
export function lngIntervalsIntersect(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): boolean {
  const aCrosses = aMin > aMax;
  const bCrosses = bMin > bMax;
  if (!aCrosses && !bCrosses) {
    return aMin <= bMax && aMax >= bMin;
  }
  if (aCrosses && bCrosses) {
    return true;
  }
  if (aCrosses) {
    return aMin <= bMax || aMax >= bMin;
  }
  return bMin <= aMax || bMax >= aMin;
}

/** Column references for one longitude interval in a SQL statement. */
export interface LngIntervalColumns {
  min: Prisma.Sql;
  max: Prisma.Sql;
}

/**
 * SQL statement of lngIntervalsIntersect over two column pairs — the ONE
 * generator every SQL longitude-intersection predicate goes through (raw
 * `a.min <= b.max AND a.max >= b.min` range tests are the wave-5 F4 defect:
 * they silently mis-handle crossing rows).
 */
export function lngIntersectSql(
  a: LngIntervalColumns,
  b: LngIntervalColumns,
): Prisma.Sql {
  return Prisma.sql`
      CASE
        WHEN ${a.min} <= ${a.max} AND ${b.min} <= ${b.max}
          THEN ${a.min} <= ${b.max} AND ${a.max} >= ${b.min}
        WHEN ${a.min} > ${a.max} AND ${b.min} > ${b.max}
          THEN TRUE
        WHEN ${a.min} > ${a.max}
          THEN ${a.min} <= ${b.max} OR ${a.max} >= ${b.min}
        ELSE ${b.min} <= ${a.max} OR ${b.max} >= ${a.min}
      END`;
}

/**
 * Wrap-aware longitude-interval CONTAINMENT (outer ⊇ inner) — the TS twin of
 * lngContainsSql. §3's attribution law is containment, never intersection;
 * this is the longitude half of a bbox containment judgment, exhaustive over
 * the crossing cases (same representation law as lngIntervalsIntersect):
 * - neither crosses: plain range nesting;
 * - outer crosses, inner doesn't: the inner interval fits one of the outer's
 *   two arcs ([min, 180] or [-180, max]);
 * - both cross: both contain the antimeridian, so nesting is plain range
 *   nesting on the crossed representation (outer.min <= inner.min AND
 *   outer.max >= inner.max);
 * - outer doesn't cross but inner does: impossible (a non-crossing interval
 *   never contains the antimeridian) — FALSE.
 */
export function lngIntervalContains(
  outerMin: number,
  outerMax: number,
  innerMin: number,
  innerMax: number,
): boolean {
  const outerCrosses = outerMin > outerMax;
  const innerCrosses = innerMin > innerMax;
  if (!outerCrosses && !innerCrosses) {
    return outerMin <= innerMin && outerMax >= innerMax;
  }
  if (outerCrosses && !innerCrosses) {
    return innerMin >= outerMin || innerMax <= outerMax;
  }
  if (outerCrosses && innerCrosses) {
    return outerMin <= innerMin && outerMax >= innerMax;
  }
  return false;
}

/**
 * SQL statement of lngIntervalContains over two column pairs — the ONE
 * generator for wrap-aware longitude containment predicates (the bbox
 * fallback arm of every polygon-first containment judgment).
 */
export function lngContainsSql(
  outer: LngIntervalColumns,
  inner: LngIntervalColumns,
): Prisma.Sql {
  return Prisma.sql`
      CASE
        WHEN ${outer.min} <= ${outer.max} AND ${inner.min} <= ${inner.max}
          THEN ${outer.min} <= ${inner.min} AND ${outer.max} >= ${inner.max}
        WHEN ${outer.min} > ${outer.max} AND ${inner.min} <= ${inner.max}
          THEN ${inner.min} >= ${outer.min} OR ${inner.max} <= ${outer.max}
        WHEN ${outer.min} > ${outer.max} AND ${inner.min} > ${inner.max}
          THEN ${outer.min} <= ${inner.min} AND ${outer.max} >= ${inner.max}
        ELSE FALSE
      END`;
}

/** The signals-ledger geo columns (alias `s`) as an interval reference. */
export const SIGNAL_LNG_COLUMNS: LngIntervalColumns = {
  min: Prisma.sql`s.geo_min_lng`,
  max: Prisma.sql`s.geo_max_lng`,
};

/** places-catalog bbox columns for a given row alias. */
export function placeLngColumns(alias: string): LngIntervalColumns {
  const ref = Prisma.raw(alias);
  return {
    min: Prisma.sql`${ref}.bbox_min_lng`,
    max: Prisma.sql`${ref}.bbox_max_lng`,
  };
}
