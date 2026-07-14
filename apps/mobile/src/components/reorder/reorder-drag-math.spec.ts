import {
  AUTO_SCROLL_EDGE_BAND_PX,
  AUTO_SCROLL_MAX_STEP_PX,
  computeDragFrame,
  type DragFrameInput,
} from './reorder-drag-math';

// Geometry: 10 rows of 60px in a viewport spanning absolute Y 100..700.
const base: DragFrameInput = {
  translationY: 0,
  translationX: 0,
  absoluteY: 400,
  scrollOffset: 0,
  liftScrollOffset: 0,
  liftSlotIndex: 2,
  rowHeight: 60,
  columns: 1,
  columnStride: 0,
  pinnedLeadingCount: 0,
  itemCount: 10,
  viewportTopY: 100,
  viewportBottomY: 700,
  minTranslationY: Number.NEGATIVE_INFINITY,
};

// The bookmarks slot map (ledger §Leg 5 walkthrough): 2 columns, cellWidth 180 +
// gap 12 → columnStride 192; rowHeight 180 + gap 12 → rowStride 192 (the rowHeight
// input IS the stride). Slot index = row × 2 + col.
const grid: DragFrameInput = {
  ...base,
  rowHeight: 192,
  columns: 2,
  columnStride: 192,
  liftSlotIndex: 5, // row 2, col 1
  itemCount: 6,
  pinnedLeadingCount: 2,
};

describe('computeDragFrame', () => {
  it('finger movement alone moves translate and slot', () => {
    const frame = computeDragFrame({ ...base, translationY: 125 });
    expect(frame.translate).toBe(125);
    expect(frame.slot).toBe(4); // 2 + round(125/60)
    expect(frame.autoScrollStep).toBe(0);
  });

  it('clamps the slot to [pinnedLeadingCount, itemCount - 1]', () => {
    expect(computeDragFrame({ ...base, translationY: -500, pinnedLeadingCount: 1 }).slot).toBe(1);
    expect(computeDragFrame({ ...base, translationY: 5000 }).slot).toBe(9);
  });

  it('emits a proportional auto-scroll step inside the bottom edge band, 0 outside', () => {
    // Outside the band: no step.
    expect(
      computeDragFrame({ ...base, absoluteY: 700 - AUTO_SCROLL_EDGE_BAND_PX }).autoScrollStep
    ).toBe(0);
    // Half-depth into the band: half the max step.
    const half = computeDragFrame({ ...base, absoluteY: 700 - AUTO_SCROLL_EDGE_BAND_PX / 2 });
    expect(half.autoScrollStep).toBeCloseTo(AUTO_SCROLL_MAX_STEP_PX / 2);
    // At (or past) the edge: full step; top band mirrors with negative sign.
    expect(computeDragFrame({ ...base, absoluteY: 700 }).autoScrollStep).toBe(
      AUTO_SCROLL_MAX_STEP_PX
    );
    expect(computeDragFrame({ ...base, absoluteY: 100 }).autoScrollStep).toBe(
      -AUTO_SCROLL_MAX_STEP_PX
    );
  });

  // THE regression case (red-team finding): finger STATIONARY in the edge band while the
  // container auto-scrolls. The gesture sample is frozen — only scrollOffset advances.
  // Before the fix, nothing recomputed on this path: the lifted row scrolled away with
  // the content (translate frozen) and activeSlotIndex went stale. The pump now replays
  // the frozen sample through this function each frame, so the growing scrollOffset
  // alone must (a) grow translate to keep the row finger-pinned and (b) advance the slot.
  it('stationary finger + advancing scrollOffset advances translate and slot', () => {
    const stationary = { ...base, translationY: 30, absoluteY: 660 }; // held in the bottom band
    const frames = [0, 60, 120, 180].map((scrolled) =>
      computeDragFrame({ ...stationary, scrollOffset: stationary.liftScrollOffset + scrolled })
    );
    // Finger-pin: translate grows by exactly the scrolled distance.
    expect(frames.map((f) => f.translate)).toEqual([30, 90, 150, 210]);
    // Drop slot keeps advancing with zero finger movement.
    expect(frames.map((f) => f.slot)).toEqual([3, 4, 5, 6]);
    // And the band step stays live so the pump keeps scrolling.
    for (const frame of frames) {
      expect(frame.autoScrollStep).toBeGreaterThan(0);
    }
  });

  it('upward auto-scroll (negative scroll delta) pulls translate and slot back', () => {
    const frame = computeDragFrame({ ...base, absoluteY: 120, scrollOffset: -120 });
    expect(frame.translate).toBe(-120);
    expect(frame.slot).toBe(0);
    expect(frame.autoScrollStep).toBeLessThan(0);
  });

  // §1.4 chrome clamp: the finger may keep going up; the item's rendered translate and
  // its slot both stop at the floor and rejoin symmetrically on the way back down.
  describe('minTranslationY (chrome top clamp)', () => {
    it('floors translate and slot once the finger crosses the clamp', () => {
      const clamped = computeDragFrame({ ...base, translationY: -300, minTranslationY: -90 });
      expect(clamped.translate).toBe(-90);
      expect(clamped.slot).toBe(1); // 2 + round(−90/60), not 2 + round(−300/60)
    });

    it('is inert above the clamp and rejoins on the way back', () => {
      const free = computeDragFrame({ ...base, translationY: -60, minTranslationY: -90 });
      expect(free.translate).toBe(-60);
      const returned = computeDragFrame({ ...base, translationY: -30, minTranslationY: -90 });
      expect(returned.translate).toBe(-30);
    });

    it('holds the SCREEN position invariantly under auto-scroll (scrollDelta still applies)', () => {
      // Screen pos = liftAbsTop + clamped translationY; content-space translate must
      // still carry the scroll compensation so the render math keeps the item pinned
      // at the boundary while content scrolls under it.
      const frame = computeDragFrame({
        ...base,
        translationY: -300,
        minTranslationY: -90,
        scrollOffset: -120,
      });
      expect(frame.translate).toBe(-210); // −90 + (−120)
    });
  });

  it('columns: 1 is X-invariant (the row stack ignores translationX)', () => {
    const withX = computeDragFrame({ ...base, translationY: 125, translationX: 500 });
    const withoutX = computeDragFrame({ ...base, translationY: 125 });
    expect(withX.slot).toBe(withoutX.slot);
    expect(withX.translateX).toBe(0);
  });
});

// Leg 10 step 6: variable-height slot map. Boundaries are LIFT-TIME prefix sums;
// hit-test = the interval containing the lifted item's center (lift center + translate).
describe('computeDragFrame — variable-height slot map (listDetail rich rows)', () => {
  // The proof obligation: a UNIFORM boundaries array must reduce VERBATIM to the
  // shipped 1-D math for every translation, including the round-half-up tie.
  it('uniform boundaries reduce verbatim to the round() math', () => {
    const uniformBoundaries = Array.from({ length: 11 }, (_, k) => k * 60);
    for (const translationY of [-500, -150, -90, -31, -30, -29, 0, 29, 30, 31, 125, 5000]) {
      const withBoundaries = computeDragFrame({
        ...base,
        translationY,
        slotBoundaries: uniformBoundaries,
      });
      const uniform = computeDragFrame({ ...base, translationY });
      expect(withBoundaries.slot).toBe(uniform.slot);
      expect(withBoundaries.translate).toBe(uniform.translate);
    }
  });

  // 5 rows: 40, 120, 40, 200, 40 px → boundaries [0, 40, 160, 200, 400, 440].
  const varied: DragFrameInput = {
    ...base,
    itemCount: 5,
    liftSlotIndex: 0,
    slotBoundaries: [0, 40, 160, 200, 400, 440],
  };

  it('short row dragged over a tall neighbor swaps at the tall row interval, not a stride', () => {
    // Lift slot 0 (center 20). Uniform stride math (rowHeight 60) would swap at ~30px;
    // the tall neighbor's interval is [40, 160) — the swap must happen there.
    expect(computeDragFrame({ ...varied, translationY: 15 }).slot).toBe(0); // center 35 < 40
    expect(computeDragFrame({ ...varied, translationY: 25 }).slot).toBe(1); // center 45 ∈ [40,160)
    expect(computeDragFrame({ ...varied, translationY: 200 }).slot).toBe(3); // center 220 ∈ [200,400)
  });

  it('clamps below the first and past the last boundary', () => {
    expect(computeDragFrame({ ...varied, translationY: -500 }).slot).toBe(0);
    expect(computeDragFrame({ ...varied, translationY: 5000 }).slot).toBe(4);
    expect(
      computeDragFrame({ ...varied, translationY: -500, pinnedLeadingCount: 1, liftSlotIndex: 1 })
        .slot
    ).toBe(1);
  });

  it('auto-scroll compensation advances the interval hit-test (stationary finger)', () => {
    // Lift slot 1 (center 100), finger still, container scrolled 120 → center 220 ∈ [200,400).
    const frame = computeDragFrame({
      ...varied,
      liftSlotIndex: 1,
      absoluteY: 660,
      scrollOffset: 120,
    });
    expect(frame.slot).toBe(3);
    expect(frame.translate).toBe(120);
    expect(frame.autoScrollStep).toBeGreaterThan(0);
  });

  it('a malformed boundaries length falls back to the uniform math', () => {
    const frame = computeDragFrame({
      ...base,
      translationY: 125,
      slotBoundaries: [0, 60, 120], // wrong length for itemCount 10
    });
    expect(frame.slot).toBe(4); // 2 + round(125/60)
  });

  it('minTranslationY clamp applies before the interval hit-test', () => {
    // Lift slot 3 (center 300), clamp at −90 → center 210 ∈ [200,400) even at −300.
    const frame = computeDragFrame({
      ...varied,
      liftSlotIndex: 3,
      translationY: -300,
      minTranslationY: -90,
    });
    expect(frame.translate).toBe(-90);
    expect(frame.slot).toBe(3);
    const freed = computeDragFrame({ ...varied, liftSlotIndex: 3, translationY: -150 });
    expect(freed.slot).toBe(1); // center 150 ∈ [40,160)
  });
});

describe('computeDragFrame — 2-column slot map (bookmarks grid)', () => {
  it('THE cross-column drag (ledger walkthrough): slot 5 → slot 2 up-left one stride each', () => {
    const frame = computeDragFrame({ ...grid, translationY: -192, translationX: -192 });
    // row = 2 + round(−192/192) = 1; col = 1 + round(−192/192) = 0 → 1×2+0 = 2.
    expect(frame.slot).toBe(2);
    expect(frame.translate).toBe(-192);
    expect(frame.translateX).toBe(-192);
  });

  it('hit-tests against slot CENTERS: swaps exactly past the half-stride midpoint', () => {
    expect(computeDragFrame({ ...grid, translationX: -95 }).slot).toBe(5); // < half stride
    expect(computeDragFrame({ ...grid, translationX: -97 }).slot).toBe(4); // > half stride
  });

  it('pinned edge: the pinned prefix is unreachable (rawSlot 0 clamps to pinned 2)', () => {
    const frame = computeDragFrame({ ...grid, translationY: -384, translationX: -192 });
    expect(frame.slot).toBe(2);
  });

  it('odd-count edge: the trailing empty cell is not a slot (clamps to itemCount − 1)', () => {
    // 7 items: last row = slots 5, 6 and one hole. Drag slot 4 (row 2 col 0) down-right
    // into the hole (row 3 col 1 → rawSlot 7) → clamps to 6.
    const frame = computeDragFrame({
      ...grid,
      itemCount: 7,
      liftSlotIndex: 4,
      translationY: 192,
      translationX: 192,
    });
    expect(frame.slot).toBe(6);
  });

  it('column clamps at the grid edges (cannot round past col 0 or col 1)', () => {
    expect(computeDragFrame({ ...grid, translationX: -800 }).slot).toBe(4); // col pins at 0
    expect(computeDragFrame({ ...grid, liftSlotIndex: 4, translationX: 800 }).slot).toBe(5);
  });

  it('vertical auto-scroll compensation advances the ROW, column untouched', () => {
    const frame = computeDragFrame({
      ...grid,
      liftSlotIndex: 2,
      absoluteY: 660, // bottom band
      scrollOffset: 192,
    });
    // scrollDelta 192 → row = 1 + 1 = 2, col stays 0 → slot 4; step > 0 keeps pumping.
    expect(frame.slot).toBe(4);
    expect(frame.autoScrollStep).toBeGreaterThan(0);
  });
});
