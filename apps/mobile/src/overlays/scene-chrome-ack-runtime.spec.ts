import {
  CHROME_ACK_WATCHDOG_MS,
  __resetSceneChromeAckForTest,
  getSceneChromeAckSceneKey,
  joinSceneChromeAck,
  recordSceneChromeAck,
  recordSceneChromeMeasuredHeight,
  resolveSceneChromeHeight,
} from './scene-chrome-ack-runtime';

// THE JOINED REVEAL contract (leg 6 — child-transition primitive §2.3): the reveal flip joins
// {paintAck, chromeAck}. These sweeps pin the join's three behaviors — synchronous when the
// header already committed, deferred until it does, and the RED-provable watchdog degrade
// (suppressing the header's ack MUST fire the loud bark; an always-green join would be lying).

declare const global: { __DEV__?: boolean };

describe('scene-chrome-ack-runtime', () => {
  beforeEach(() => {
    __resetSceneChromeAckForTest();
    jest.useFakeTimers();
    global.__DEV__ = true;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('joins synchronously when the chromeAck already matches the presented scene', () => {
    recordSceneChromeAck('polls');
    const flip = jest.fn();
    joinSceneChromeAck('polls', flip);
    expect(flip).toHaveBeenCalledTimes(1);
  });

  it('defers the flip until the header records the matching ack, then fires exactly once', () => {
    recordSceneChromeAck('polls');
    const flip = jest.fn();
    joinSceneChromeAck('bookmarks', flip);
    expect(flip).not.toHaveBeenCalled();
    recordSceneChromeAck('bookmarks');
    expect(flip).toHaveBeenCalledTimes(1);
    // A later ack / the (cleared) watchdog must not double-fire.
    recordSceneChromeAck('bookmarks');
    jest.advanceTimersByTime(CHROME_ACK_WATCHDOG_MS + 10);
    expect(flip).toHaveBeenCalledTimes(1);
  });

  it('ignores a NON-matching ack while waiting', () => {
    const flip = jest.fn();
    joinSceneChromeAck('settings', flip);
    recordSceneChromeAck('profile');
    expect(flip).not.toHaveBeenCalled();
    recordSceneChromeAck('settings');
    expect(flip).toHaveBeenCalledTimes(1);
  });

  it('RED: a suppressed header ack degrades via the watchdog WITH the loud dev bark', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const flip = jest.fn();
    joinSceneChromeAck('messagesInbox', flip);
    expect(flip).not.toHaveBeenCalled();
    jest.advanceTimersByTime(CHROME_ACK_WATCHDOG_MS + 1);
    expect(flip).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toContain('[JOINEDREVEAL]');
    consoleError.mockRestore();
  });

  it('a cancelled join never fires (superseding switch)', () => {
    const flip = jest.fn();
    const cancel = joinSceneChromeAck('dmSession', flip);
    cancel();
    recordSceneChromeAck('dmSession');
    jest.advanceTimersByTime(CHROME_ACK_WATCHDOG_MS + 10);
    expect(flip).not.toHaveBeenCalled();
  });

  it('the store is single-valued (last committed scene wins)', () => {
    recordSceneChromeAck('polls');
    recordSceneChromeAck('bookmarks');
    expect(getSceneChromeAckSceneKey()).toBe('bookmarks');
  });

  // ─── measured-chrome height cache (wave-3 §2.7 — same-committed-frame body lane) ───────────
  describe('measured-chrome height cache', () => {
    it('exact per-scene measurement wins', () => {
      recordSceneChromeMeasuredHeight('bookmarks', 112);
      recordSceneChromeMeasuredHeight('listDetail', 64);
      expect(resolveSceneChromeHeight('bookmarks')).toBe(112);
      expect(resolveSceneChromeHeight('listDetail')).toBe(64);
    });

    it('an unmeasured scene derives from a SAME-composition-signature measurement', () => {
      // bookmarks + polls both declare strip:'header' / handle visible.
      recordSceneChromeMeasuredHeight('bookmarks', 112);
      expect(resolveSceneChromeHeight('polls')).toBe(112);
      // listDetail (strip 'in-list') must NOT inherit a strip:'header' chrome height…
      expect(resolveSceneChromeHeight('listDetail')).toBeNull();
      // …but does inherit from a strip-less, handle-visible scene.
      recordSceneChromeMeasuredHeight('messagesInbox', 64);
      expect(resolveSceneChromeHeight('listDetail')).toBe(64);
      // settings (grabHandle hidden) matches neither composition.
      expect(resolveSceneChromeHeight('settings')).toBeNull();
    });

    it('spec-less scenes (search) neither donate nor receive signature guesses', () => {
      recordSceneChromeMeasuredHeight('search', 180);
      // search's measurement must not leak into strip-less sheet scenes…
      expect(resolveSceneChromeHeight('messagesInbox')).toBeNull();
      // …and search itself only ever resolves its own exact measurement.
      expect(resolveSceneChromeHeight('search')).toBe(180);
    });

    it('RED-guard: zero/negative measurements are never recorded; empty cache resolves null', () => {
      expect(resolveSceneChromeHeight('bookmarks')).toBeNull();
      recordSceneChromeMeasuredHeight('bookmarks', 0);
      recordSceneChromeMeasuredHeight('bookmarks', -4);
      expect(resolveSceneChromeHeight('bookmarks')).toBeNull();
    });
  });
});
