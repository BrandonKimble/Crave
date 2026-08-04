import {
  canRedoEditModeSession,
  canUndoEditModeSession,
  commitEditModeSessionHistoryEntry,
  createEditModeSession,
  hasEditModeSessionEverEdited,
  isSessionDirty,
  redoEditModeSession,
  reorderEditModeSession,
  undoEditModeSession,
  type EditModeSessionState,
} from './edit-mode-session-core';

// Dirty ⇔ current order ≠ baseline (history[0]) — the saved-state semantic. The leg-10
// red-team nit: `history.length > 1` counted an undone-back-to-baseline session as dirty,
// so cancelling a NO-OP edit still discard-confirmed.

const state = (
  order: readonly string[],
  history: readonly (readonly string[])[],
  historyIndex: number
): EditModeSessionState => ({ order, history, historyIndex });

describe('isSessionDirty', () => {
  it('is false for no session', () => {
    expect(isSessionDirty(null)).toBe(false);
  });

  it('is false at the fresh baseline', () => {
    expect(isSessionDirty(state(['a', 'b', 'c'], [['a', 'b', 'c']], 0))).toBe(false);
  });

  it('is true after a committed move', () => {
    expect(
      isSessionDirty(
        state(
          ['b', 'a', 'c'],
          [
            ['a', 'b', 'c'],
            ['b', 'a', 'c'],
          ],
          1
        )
      )
    ).toBe(true);
  });

  it('is FALSE after undoing back to the baseline, even with history entries (the fix)', () => {
    expect(
      isSessionDirty(
        state(
          ['a', 'b', 'c'],
          [
            ['a', 'b', 'c'],
            ['b', 'a', 'c'],
          ],
          0
        )
      )
    ).toBe(false);
  });

  it('is true mid-drag when the LIVE order differs even though no entry is committed yet', () => {
    expect(isSessionDirty(state(['b', 'a', 'c'], [['a', 'b', 'c']], 0))).toBe(true);
  });

  it('is false when moves cancel out into the baseline order via a later commit + undo chain', () => {
    expect(
      isSessionDirty(
        state(
          ['a', 'b'],
          [
            ['a', 'b'],
            ['b', 'a'],
            ['a', 'b'],
          ],
          2
        )
      )
    ).toBe(false);
  });
});

// ─── The MACHINE (F1474) ─────────────────────────────────────────────────────────────────
//
// Before this block the file's name was the only thing claiming coverage of the edit-mode
// session: every case above imports the dirty predicate, and deleting the entire
// `useEditModeSession` hook left the spec green. The transitions now live as pure functions
// in the core (the hook is the React shell that holds the state and calls them), so the drop
// / undo / redo contract is something a test can make RED.

const enter = createEditModeSession;

describe('edit-mode session machine', () => {
  it('enters at the baseline: order === history[0], nothing to undo or redo', () => {
    const live = enter(['a', 'b', 'c']);
    expect(live.order).toEqual(['a', 'b', 'c']);
    expect(live.history).toEqual([['a', 'b', 'c']]);
    expect(live.historyIndex).toBe(0);
    expect(canUndoEditModeSession(live)).toBe(false);
    expect(canRedoEditModeSession(live)).toBe(false);
    expect(hasEditModeSessionEverEdited(live)).toBe(false);
  });

  it('does not alias the caller array — a later mutation of the baseline cannot rewrite history', () => {
    const baseline = ['a', 'b'];
    const live = enter(baseline);
    baseline.push('c');
    expect(live.order).toEqual(['a', 'b']);
    expect(live.history[0]).toEqual(['a', 'b']);
  });

  it('reorders live without committing history', () => {
    const live = reorderEditModeSession(enter(['a', 'b', 'c']), 0, 2);
    expect(live?.order).toEqual(['b', 'c', 'a']);
    expect(live?.history).toEqual([['a', 'b', 'c']]);
    expect(hasEditModeSessionEverEdited(live)).toBe(false);
  });

  it('ignores a same-slot reorder and a null session', () => {
    const live = enter(['a', 'b']);
    expect(reorderEditModeSession(live, 1, 1)).toBe(live);
    expect(reorderEditModeSession(null, 0, 1)).toBeNull();
  });

  it('commits one history entry on drop', () => {
    const dropped = commitEditModeSessionHistoryEntry(
      reorderEditModeSession(enter(['a', 'b', 'c']), 0, 1)
    );
    expect(dropped?.history).toEqual([
      ['a', 'b', 'c'],
      ['b', 'a', 'c'],
    ]);
    expect(dropped?.historyIndex).toBe(1);
    expect(canUndoEditModeSession(dropped)).toBe(true);
    expect(hasEditModeSessionEverEdited(dropped)).toBe(true);
  });

  it('commits NOTHING when the drop settled back on the committed order', () => {
    const live = enter(['a', 'b']);
    expect(commitEditModeSessionHistoryEntry(live)).toBe(live);
  });

  // F1473 — THE RED CASE. `commitHistoryEntry` used to ask "did the order change?" with
  // `settled.join(' ') === live.order.join(' ')`, which cannot tell `['a b','c']` from
  // `['a','b c']` — both join to "a b c". The ids are SERVER-generated, so one space is all
  // it takes: the reorder below was judged a no-op, no history entry was committed, and
  // undo/redo plus `hasEverEdited` silently lost the move.
  // RED recipe: restore `settled.join(' ') === live.order.join(' ')` in
  // `commitEditModeSessionHistoryEntry` — this case fails with history length 1, historyIndex
  // 0, canUndo false.
  it('commits a reorder of ids that CONTAIN SPACES (the join(" ") collision)', () => {
    const dropped = commitEditModeSessionHistoryEntry({
      order: ['a', 'b c'],
      history: [['a b', 'c']],
      historyIndex: 0,
    });
    expect(dropped?.history).toEqual([
      ['a b', 'c'],
      ['a', 'b c'],
    ]);
    expect(dropped?.historyIndex).toBe(1);
    expect(canUndoEditModeSession(dropped)).toBe(true);
    expect(hasEditModeSessionEverEdited(dropped)).toBe(true);
  });

  it('the same collision cannot fool the dirty check either', () => {
    expect(isSessionDirty({ order: ['a', 'b c'], history: [['a b', 'c']], historyIndex: 0 })).toBe(
      true
    );
  });

  it('undo walks back to the baseline order; redo walks forward', () => {
    const dropped = commitEditModeSessionHistoryEntry(
      reorderEditModeSession(enter(['a', 'b', 'c']), 0, 1)
    );
    const undone = undoEditModeSession(dropped);
    expect(undone?.order).toEqual(['a', 'b', 'c']);
    expect(isSessionDirty(undone)).toBe(false);
    // §2.8: an undone-to-baseline session is NOT dirty but HAS edited.
    expect(hasEditModeSessionEverEdited(undone)).toBe(true);
    expect(canRedoEditModeSession(undone)).toBe(true);

    const redone = redoEditModeSession(undone);
    expect(redone?.order).toEqual(['b', 'a', 'c']);
    expect(canRedoEditModeSession(redone)).toBe(false);
  });

  it('undo at the baseline and redo at the tip are no-ops', () => {
    const live = enter(['a', 'b']);
    expect(undoEditModeSession(live)).toBe(live);
    expect(redoEditModeSession(live)).toBe(live);
    expect(undoEditModeSession(null)).toBeNull();
    expect(redoEditModeSession(null)).toBeNull();
  });

  it('a commit after an undo TRUNCATES the redo tail', () => {
    const first = commitEditModeSessionHistoryEntry(
      reorderEditModeSession(enter(['a', 'b', 'c']), 0, 1)
    );
    const undone = undoEditModeSession(first);
    const second = commitEditModeSessionHistoryEntry(reorderEditModeSession(undone, 0, 2));
    expect(second?.history).toEqual([
      ['a', 'b', 'c'],
      ['b', 'c', 'a'],
    ]);
    expect(second?.historyIndex).toBe(1);
    expect(canRedoEditModeSession(second)).toBe(false);
  });
});
