import {
  AUTO_SCROLL_EDGE_BAND_PX,
  AUTO_SCROLL_MAX_STEP_PX,
  computeDragFrame,
  type DragFrameInput,
} from './reorder-drag-math';

// Geometry: 10 rows of 60px in a viewport spanning absolute Y 100..700.
const base: DragFrameInput = {
  translationY: 0,
  absoluteY: 400,
  scrollOffset: 0,
  liftScrollOffset: 0,
  liftSlotIndex: 2,
  rowHeight: 60,
  pinnedLeadingCount: 0,
  itemCount: 10,
  viewportTopY: 100,
  viewportBottomY: 700,
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
});
