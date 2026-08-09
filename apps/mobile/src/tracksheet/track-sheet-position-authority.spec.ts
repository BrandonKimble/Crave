import {
  getTrackSheetPositionAuthority,
  resetTrackSheetPositionAuthorityForTest,
} from './track-sheet-position-authority';

describe('track-sheet-position-authority', () => {
  afterEach(() => {
    resetTrackSheetPositionAuthorityForTest();
  });

  it('pre-publication reads are total: offscreen sheetTopY, zero scroll', () => {
    const authority = getTrackSheetPositionAuthority();
    expect(authority.getPosition()).toBeNull();
    // The seed must read as FULLY OFFSCREEN — a 0 here would paint the scrim
    // dimmed on the never-painted pre-publication frame if it ever leaked.
    expect(authority.getSheetTopY().value).toBeGreaterThanOrEqual(10000);
    expect(authority.getPresentedListScroll()).toBe(0);
  });

  it('publication is zero-copy: getSheetTopY returns the EXACT published object', () => {
    const authority = getTrackSheetPositionAuthority();
    const sheetTopY = { value: 321 };
    authority.publish({ sheetTopY, getPresentedListScroll: () => 42 });
    expect(authority.getSheetTopY()).toBe(sheetTopY);
    expect(authority.getPresentedListScroll()).toBe(42);
  });

  it('getPresentedListScroll is point-in-time, not a snapshot at publish', () => {
    const authority = getTrackSheetPositionAuthority();
    let tau = 100;
    const trackH = 80;
    authority.publish({
      sheetTopY: { value: 0 },
      getPresentedListScroll: () => Math.max(0, tau - trackH),
    });
    expect(authority.getPresentedListScroll()).toBe(20);
    tau = 500; // the list scrolls after publication
    expect(authority.getPresentedListScroll()).toBe(420);
    tau = 10; // τ below trackH clamps to 0, never negative
    expect(authority.getPresentedListScroll()).toBe(0);
  });

  it('subscribers fire on identity change and NOT on identical republish', () => {
    const authority = getTrackSheetPositionAuthority();
    const events: string[] = [];
    const unsubscribe = authority.subscribe(() => events.push('notified'));
    const sheetTopY = { value: 1 };
    const getPresentedListScroll = () => 0;
    authority.publish({ sheetTopY, getPresentedListScroll });
    expect(events).toHaveLength(1);
    authority.publish({ sheetTopY, getPresentedListScroll });
    expect(events).toHaveLength(1); // identical republish is silent
    authority.clear();
    expect(events).toHaveLength(2);
    authority.clear(); // already clear — silent
    expect(events).toHaveLength(2);
    unsubscribe();
    authority.publish({ sheetTopY, getPresentedListScroll });
    expect(events).toHaveLength(2);
  });
});
