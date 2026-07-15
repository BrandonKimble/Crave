import {
  __resetSceneChromeAckForTest,
  getSceneChromeAckSceneKey,
  recordSceneChromeAck,
  recordSceneChromeMeasuredHeight,
  resolveSceneChromeHeight,
} from './scene-chrome-ack-runtime';

// The ack store (T5 — the join itself is engine-owned; see transition-transaction.spec.ts
// for the {paint, chrome} join + the join_liveness_degrade RED proof).

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
