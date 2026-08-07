import { registerHeaderCloseAction, runHeaderCloseAction } from './header-nav-action-registry';

describe('header-nav-action-registry close-action stack (F1483)', () => {
  it('runs the top-most (most-recent) override', () => {
    const a = jest.fn();
    const b = jest.fn();
    const releaseA = registerHeaderCloseAction('listDetail', a);
    const releaseB = registerHeaderCloseAction('listDetail', b);

    expect(runHeaderCloseAction('listDetail')).toBe(true);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();

    releaseB();
    releaseA();
  });

  it('RESTORES the entry beneath when the upper entry releases (the F1483 defect)', () => {
    // Two stacked listDetail entries both in edit mode. Under the old last-writer-wins
    // Map, B's release DELETED the key and A's override was gone — runHeaderCloseAction
    // returned false and the host fell back to closeActiveRoute (no discard-confirm).
    const a = jest.fn();
    const b = jest.fn();
    const releaseA = registerHeaderCloseAction('listDetail', a);
    const releaseB = registerHeaderCloseAction('listDetail', b);

    releaseB();

    expect(runHeaderCloseAction('listDetail')).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    releaseA();
    expect(runHeaderCloseAction('listDetail')).toBe(false);
  });

  it('identity-guarded out-of-order release pops the right entry', () => {
    const a = jest.fn();
    const b = jest.fn();
    const releaseA = registerHeaderCloseAction('listDetail', a);
    registerHeaderCloseAction('listDetail', b);

    // A releases first (out of order); B remains and stays the active override.
    releaseA();
    expect(runHeaderCloseAction('listDetail')).toBe(true);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
