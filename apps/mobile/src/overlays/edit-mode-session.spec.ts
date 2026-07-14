import { isSessionDirty, type EditModeSessionState } from './edit-mode-session-core';

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
