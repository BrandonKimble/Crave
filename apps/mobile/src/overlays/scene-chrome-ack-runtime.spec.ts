import { __resetSceneChromeAckForTest, recordSceneChromeAck } from './scene-chrome-ack-runtime';
import * as transitionTransaction from '../navigation/runtime/transition-engine/transition-transaction';
import {
  computeSceneChromeHeight,
  HEADER_STRIP_BOTTOM_SPACER_HEIGHT,
} from '../navigation/runtime/scene-chrome-geometry';
import { TOGGLE_STRIP_BAND_HEIGHT } from '../toggles/toggle-strip-metrics';
import { OVERLAY_TAB_HEADER_HEIGHT } from './overlay-chrome-metrics';

// The ack store (T5 — the join itself is engine-owned; see transition-transaction.spec.ts
// for the {paint, chrome} join + the join_liveness_degrade RED proof). The module's only
// real product is the `offerTransitionJoinInput('chrome')` call it triggers (F1457) — the
// spec asserts on that, not on a getter that existed only for this spec to read.

declare const global: { __DEV__?: boolean };

describe('scene-chrome-ack-runtime', () => {
  beforeEach(() => {
    __resetSceneChromeAckForTest();
    jest.useFakeTimers();
    global.__DEV__ = true;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('offers the chrome join input on the first ack for a scene', () => {
    const offerSpy = jest.spyOn(transitionTransaction, 'offerTransitionJoinInput');
    recordSceneChromeAck('polls');
    expect(offerSpy).toHaveBeenCalledWith('chrome');
    expect(offerSpy).toHaveBeenCalledTimes(1);
  });

  it('dedupes a repeated ack for the SAME scene (no re-offer)', () => {
    const offerSpy = jest.spyOn(transitionTransaction, 'offerTransitionJoinInput');
    recordSceneChromeAck('polls');
    recordSceneChromeAck('polls');
    expect(offerSpy).toHaveBeenCalledTimes(1);
  });

  it('offers again when the acked scene changes (last committed scene wins)', () => {
    const offerSpy = jest.spyOn(transitionTransaction, 'offerTransitionJoinInput');
    recordSceneChromeAck('polls');
    recordSceneChromeAck('lists');
    expect(offerSpy).toHaveBeenCalledTimes(2);
  });
});

// ─── THE COMPUTED CHROME GEOMETRY (THE PAGE L1 — the measured cache's replacement) ────────────
//
// Chrome height is a pure function of declared facts; the measured-chrome cache, its
// same-composition-signature guess, and the retained fallback are DELETED (a scene can no
// longer inherit another scene's geometry — the gap/leak class is unrepresentable). The
// live counterpart of these contracts is the [CHROME-GEOMETRY] dev bark in
// PersistentSheetHeaderHost: computed ≠ measured on any present is a RED error.

describe('computeSceneChromeHeight (L1)', () => {
  const base = computeSceneChromeHeight('messagesInbox'); // strip: 'none'

  it('is exact and identical for every strip-less scene — including search and settings', () => {
    // No signature guessing, no measurement: pure derivation means every strip-less
    // scene IS the base chrome row. grabHandle:'hidden' (settings) does not change the
    // box; spec-less search renders the same persistent chrome row.
    for (const scene of ['listDetail', 'profile', 'settings', 'notifications', 'search'] as const) {
      expect(computeSceneChromeHeight(scene)).toBe(base);
    }
  });

  it('header-strip scenes add exactly the declared band + spacer', () => {
    const strip = computeSceneChromeHeight('polls');
    expect(computeSceneChromeHeight('lists')).toBe(strip);
    expect(strip - base).toBeCloseTo(
      TOGGLE_STRIP_BAND_HEIGHT + HEADER_STRIP_BOTTOM_SPACER_HEIGHT,
      5
    );
  });

  it('is the raw declared sum — RN grid-rounds every consumer identically at render', () => {
    // Sim-measured truth (2026-07-16 matrix run): strip-less chrome rendered
    // 68.33333587646484 and strip chrome 108.33333587646484 on the @3x Pro Max — the
    // pixel-grid rounding of these raw sums (68.25 / 108.25). The computed value stays
    // RAW on purpose: a body inset of 68.25 and the chrome wrapper land on the SAME
    // grid point, and keeping the module RN-free keeps these contracts hermetic. The
    // [CHROME-GEOMETRY] bark compares with sub-pixel tolerance for exactly this reason.
    expect(base).toBe(OVERLAY_TAB_HEADER_HEIGHT); // 68.25
    expect(base).toBeCloseTo(68.25, 5);
    expect(computeSceneChromeHeight('polls')).toBeCloseTo(108.25, 5);
  });
});
