// ─── SHAPE-DERIVED EQUALITY (F980 — the memo landmine, killed structurally) ──────────
//
// The scene-stack scope names its own disease twice, in its own words:
//   "memo landmine: skip fns must compare every render-read prop or a unit change never
//    re-renders the leg body"
//   "snapshot-equality landmine: render-read fields MUST be compared here or a unit change
//    never republishes"
// Nine hand-written comparators each enumerated 10–20 field names BY HAND. Add a field to
// SearchRouteSceneBodyTransportSpec, forget one comparator, and that scene silently stops
// updating — a MISSING re-render, so nothing crashes, nothing throws, and no test fails.
// The defect is invisible until a human notices a stale page.
//
// The fix is the one already proven on app-overlay-route-params-equality.ts, one level down:
// the comparator is DERIVED from the shape. A `satisfies FieldComparators<T>` map must name
// EVERY field of T, so a new field is a COMPILE ERROR that names the missing field. There is
// no "remember to also edit the comparator" step left to forget.
//
// RED recipe: add a field to any spec below without adding its entry here, and tsc fails with
//   "Property '<field>' is missing in type '{...}' but required in type 'FieldComparators<T>'".

/** One comparator per field of T. `-?` makes OPTIONAL fields required entries too — an
 *  optional field is exactly the kind that gets forgotten. */
export type FieldComparators<T> = {
  [K in keyof Required<T>]-?: (left: T[K], right: T[K]) => boolean;
};

/** The default field comparison in this scope: identity. Publications re-mint their
 *  objects, so reference equality IS the "did this change" question. */
export const sameFieldRef = <TValue>(left: TValue, right: TValue): boolean => left === right;

/**
 * Build a whole-shape comparator from a per-field map. Iterates the MAP's keys (the
 * compile-checked list), never the runtime object's — so a field the publisher omitted on
 * one side is still compared, and an extra runtime key cannot smuggle in an unchecked diff.
 */
export const createShapeEquality = <T extends object>(
  comparators: FieldComparators<T>
): ((left: T, right: T) => boolean) => {
  const fieldKeys = Object.keys(comparators) as (keyof T)[];
  return (left, right) => {
    if (left === right) {
      return true;
    }
    for (const fieldKey of fieldKeys) {
      const compare = comparators[fieldKey] as (a: T[keyof T], b: T[keyof T]) => boolean;
      if (!compare(left[fieldKey], right[fieldKey])) {
        return false;
      }
    }
    return true;
  };
};

/** The nullable wrapper every publication comparator in this scope wants: `null`/`undefined`
 *  are equal only to themselves, and anything else defers to the shape comparator. */
export const createNullableShapeEquality = <T extends object>(
  comparators: FieldComparators<T>
): ((left: T | null | undefined, right: T | null | undefined) => boolean) => {
  const areShapesEqual = createShapeEquality(comparators);
  return (left, right) => {
    if (left === right) {
      return true;
    }
    if (left == null || right == null) {
      return false;
    }
    return areShapesEqual(left, right);
  };
};
