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
  return baseline == null || baseline.join(' ') !== live.order.join(' ');
};
