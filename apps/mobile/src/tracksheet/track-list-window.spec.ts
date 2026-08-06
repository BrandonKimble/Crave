// FALSIFIERS FOR THE RENDER WINDOW. Written against the MEASURED device facts,
// not against the implementation: the numbers below (screen 852, a collapsed
// sheet showing ~one card, ~70pt poll cards, 25 in the corpus) are the six-switch
// run that produced rowDistinct=23. Each test states a consequence the device
// can contradict.

import {
  projectTrackListRenderedBandPx,
  resolveTrackListDrawDistance,
  resolveTrackSheetVisibleHeight,
  TRACK_LIST_MIN_DRAW_DISTANCE_PX,
} from './track-list-window';

// The measured geometry of the run this rung came from.
const SCREEN_HEIGHT = 852;
const COLLAPSED_TOP = 700; // collapsed sheet: ~152pt of body visible
const EXPANDED_TOP = 120; // expanded sheet: ~732pt of body visible
const POLL_CARD_PX = 70;
const CHROME_AND_SPACER_PX = EXPANDED_TOP + 68;

const rowsBuiltAt = (tau: number): number => {
  const visibleHeight = resolveTrackSheetVisibleHeight({
    tau,
    collapsedTop: COLLAPSED_TOP,
    expandedTop: EXPANDED_TOP,
    screenHeight: SCREEN_HEIGHT,
  });
  const band = projectTrackListRenderedBandPx({
    // The list's frame is full-screen BY CONSTRUCTION — that is the term the
    // window cannot shrink, and the tests must keep paying for it honestly.
    viewportHeight: SCREEN_HEIGHT,
    drawDistance: resolveTrackListDrawDistance({ visibleHeight, screenHeight: SCREEN_HEIGHT }),
  });
  return Math.max(0, Math.ceil((band - CHROME_AND_SPACER_PX) / POLL_CARD_PX));
};

const COLLAPSED_TAU = 0;
const EXPANDED_TAU = COLLAPSED_TOP - EXPANDED_TOP;

describe('the track list render window', () => {
  it('THE MEASURED DEFECT: a screen-sized drawDistance builds essentially the whole corpus', () => {
    // The old value, restated as its consequence. This is the RED the rung
    // exists to turn green — if this ever stops reproducing, the premise is gone.
    const oldBand = projectTrackListRenderedBandPx({
      viewportHeight: SCREEN_HEIGHT,
      drawDistance: SCREEN_HEIGHT,
    });
    const oldRows = Math.ceil((oldBand - CHROME_AND_SPACER_PX) / POLL_CARD_PX);
    expect(oldRows).toBeGreaterThanOrEqual(23); // device measured rowDistinct=23
  });

  it('a COLLAPSED flip builds far fewer rows than the corpus', () => {
    const rows = rowsBuiltAt(COLLAPSED_TAU);
    expect(rows).toBeLessThan(rowsBuiltAt(EXPANDED_TAU));
    // The device built 23 of 25. Anything near that is the defect intact.
    expect(rows).toBeLessThan(20);
  });

  it('an EXPANDED sheet still gets a full screenful plus headroom', () => {
    const visibleHeight = resolveTrackSheetVisibleHeight({
      tau: EXPANDED_TAU,
      collapsedTop: COLLAPSED_TOP,
      expandedTop: EXPANDED_TOP,
      screenHeight: SCREEN_HEIGHT,
    });
    const band = projectTrackListRenderedBandPx({
      viewportHeight: SCREEN_HEIGHT,
      drawDistance: resolveTrackListDrawDistance({ visibleHeight, screenHeight: SCREEN_HEIGHT }),
    });
    // Everything the user can see, plus real headroom under it. Under-rendering
    // an expanded sheet is the regression this rung must not trade for.
    expect(band).toBeGreaterThan(visibleHeight + CHROME_AND_SPACER_PX);
    expect(rowsBuiltAt(EXPANDED_TAU) * POLL_CARD_PX).toBeGreaterThan(visibleHeight);
  });

  it('a drag from collapsed to expanded ENDS with a larger window than it began', () => {
    // The settle is what moves it; the assertion is that the destination
    // posture is not left starved.
    expect(rowsBuiltAt(EXPANDED_TAU)).toBeGreaterThan(rowsBuiltAt(COLLAPSED_TAU));
  });

  it('the window grows MONOTONICALLY with the sheet — no posture is starved mid-way', () => {
    const taus = [0, 100, 200, 300, 400, 500, EXPANDED_TAU];
    const bands = taus.map((tau) => rowsBuiltAt(tau));
    bands.forEach((rows, index) => {
      if (index > 0) {
        expect(rows).toBeGreaterThanOrEqual(bands[index - 1]);
      }
    });
  });

  it('never drops below the flick floor, however small the sheet', () => {
    expect(resolveTrackListDrawDistance({ visibleHeight: 0, screenHeight: SCREEN_HEIGHT })).toBe(
      TRACK_LIST_MIN_DRAW_DISTANCE_PX
    );
  });

  it('never exceeds the screen, however large the sheet', () => {
    expect(
      resolveTrackListDrawDistance({ visibleHeight: 10_000, screenHeight: SCREEN_HEIGHT })
    ).toBe(SCREEN_HEIGHT);
  });

  it('clamps visible height at both ends (hidden excursion, bounce past expanded)', () => {
    const geometry = {
      collapsedTop: COLLAPSED_TOP,
      expandedTop: EXPANDED_TOP,
      screenHeight: SCREEN_HEIGHT,
    };
    // A hidden excursion drives tau below 0; it is not a claim about visibility.
    expect(resolveTrackSheetVisibleHeight({ tau: -400, ...geometry })).toBe(
      SCREEN_HEIGHT - COLLAPSED_TOP
    );
    // A bounce past expanded must not report more sheet than exists.
    expect(resolveTrackSheetVisibleHeight({ tau: EXPANDED_TAU + 500, ...geometry })).toBe(
      SCREEN_HEIGHT - EXPANDED_TOP
    );
  });
});
