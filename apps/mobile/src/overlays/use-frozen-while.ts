import React from 'react';

/**
 * HOLD THE LAST VALUE WHILE A GATE IS ACTIVE — ONE mechanism (F6204).
 *
 * F1324 consolidated the freeze RULE (the two run-one freeze flags became one
 * decision assigned twice) and left the MACHINERY duplicated: the suggestion
 * surface and the header chrome each carried a byte-identical latch — a memo, a
 * ref written in the render body under `if (!shouldFreeze…)`, and a
 * `shouldFreeze ? (ref.current ?? next) : next` read. The half-edit hazard
 * F1324 named therefore survived it: deleting one host's latch changed no type
 * and failed no test.
 *
 * The latch is INITIALISED with `next`, so "frozen before anything was ever
 * latched" is unrepresentable and the `?? next` fallback does not exist to be
 * unreachable.
 */
export const useFrozenWhile = <T>(next: T, isFrozen: boolean): T => {
  const latchedRef = React.useRef<T>(next);
  if (!isFrozen) {
    latchedRef.current = next;
  }
  return latchedRef.current;
};
