// Pure core of the edit-mode session primitive (edit-mode-session.ts) — kept
// reanimated-free so the dirty semantic is jest-provable.

export type EditModeSessionState = {
  order: readonly string[];
  history: readonly (readonly string[])[];
  historyIndex: number;
};

// Dirty ⇔ the CURRENT order differs from the BASELINE (history[0]) — the saved-state
// semantic. `history.length > 1` was wrong: undoing back to the baseline still counted
// as dirty and discard-confirmed a no-op cancel (leg-10 red-team nit).
export const isSessionDirty = (live: EditModeSessionState | null): boolean => {
  if (live == null) {
    return false;
  }
  const baseline = live.history[0];
  if (baseline == null) {
    return true;
  }
  // F963: this used to be `baseline.join(' ') !== live.order.join(' ')`. That is correct
  // ONLY while no id can contain a space — a precondition this file never stated and
  // nothing enforces. The day an id gains one (a slug, a composite key, a
  // server-generated label), `['a b','c']` and `['a','b c']` become indistinguishable
  // and the dirty check silently returns FALSE: a real edit is discarded as a no-op
  // cancel. Element-wise comparison is strictly correct, cheaper (no allocation), and
  // has no precondition to remember.
  return (
    baseline.length !== live.order.length || baseline.some((id, index) => id !== live.order[index])
  );
};
