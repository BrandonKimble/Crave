// Pure core of the edit-mode session primitive (edit-mode-session.ts) — kept
// reanimated-free so the STATE MACHINE is jest-provable.
//
// F1474: this file used to hold only `isSessionDirty`, and `edit-mode-session.spec.ts`
// pinned only that — the hook's machine (enter · reorder · commit · undo · redo) lived
// entirely inside `useEditModeSession` where the hermetic node lane (no react-native, no
// renderHook) could never reach it. Deleting the whole hook left the spec green. Every
// transition is a pure function HERE now; the hook is the React shell that holds the state
// and calls them, so "what does a drop do" is a fact a test can make RED.

export type EditModeSessionState = {
  order: readonly string[];
  history: readonly (readonly string[])[];
  historyIndex: number;
};

// F963/F1473: the ONE "did the order actually change" question. It used to be spelled
// `a.join(' ') !== b.join(' ')` in TWO places — correct ONLY while no id can contain a
// space, a precondition neither site stated and nothing enforces. The ids are
// SERVER-generated (ListsPanel feeds `list.listId`), so the day one gains a space
// `['a b','c']` and `['a','b c']` become indistinguishable: the dirty check reports a real
// edit as a no-op cancel, and `commitHistoryEntry` drops the move from history entirely
// (undo/redo and `hasEverEdited` lose it silently). Element-wise is strictly correct,
// cheaper (no allocation), and has no precondition to remember.
export const haveOrdersDiverged = (left: readonly string[], right: readonly string[]): boolean =>
  left.length !== right.length || left.some((id, index) => id !== right[index]);

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
  return haveOrdersDiverged(baseline, live.order);
};

/** Enter: the baseline order is both the live order and history[0]. */
export const createEditModeSession = (baselineOrder: readonly string[]): EditModeSessionState => {
  const baseline = [...baselineOrder];
  return { order: baseline, history: [baseline], historyIndex: 0 };
};

const applyMove = (order: readonly string[], from: number, to: number): string[] => {
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/** Live slot-crossing reorder — moves the order, commits NOTHING to history. */
export const reorderEditModeSession = (
  live: EditModeSessionState | null,
  fromIndex: number,
  toIndex: number
): EditModeSessionState | null => {
  if (live == null || fromIndex === toIndex) {
    return live;
  }
  return { ...live, order: applyMove(live.order, fromIndex, toIndex) };
};

/** Drop = commit one history entry, truncating any redo tail. A no-op move commits nothing. */
export const commitEditModeSessionHistoryEntry = (
  live: EditModeSessionState | null
): EditModeSessionState | null => {
  if (live == null) {
    return live;
  }
  const settled = live.history[live.historyIndex];
  if (settled != null && !haveOrdersDiverged(settled, live.order)) {
    return live;
  }
  const truncated = live.history.slice(0, live.historyIndex + 1);
  return {
    ...live,
    history: [...truncated, live.order],
    historyIndex: truncated.length,
  };
};

export const canUndoEditModeSession = (live: EditModeSessionState | null): boolean =>
  live != null && live.historyIndex > 0;

export const canRedoEditModeSession = (live: EditModeSessionState | null): boolean =>
  live != null && live.historyIndex < live.history.length - 1;

/** True once ANY edit dropped this session — survives undo-to-baseline (§2.8 label→pill). */
export const hasEditModeSessionEverEdited = (live: EditModeSessionState | null): boolean =>
  live != null && live.history.length > 1;

export const undoEditModeSession = (
  live: EditModeSessionState | null
): EditModeSessionState | null => {
  if (!canUndoEditModeSession(live) || live == null) {
    return live;
  }
  const nextIndex = live.historyIndex - 1;
  return { ...live, historyIndex: nextIndex, order: live.history[nextIndex] };
};

export const redoEditModeSession = (
  live: EditModeSessionState | null
): EditModeSessionState | null => {
  if (!canRedoEditModeSession(live) || live == null) {
    return live;
  }
  const nextIndex = live.historyIndex + 1;
  return { ...live, historyIndex: nextIndex, order: live.history[nextIndex] };
};
