/**
 * Pure drag-frame math for the reorder primitives — extracted from useReorderDrag so the
 * SAME computation runs on both drive paths:
 *   1. pan onUpdate (finger moves), and
 *   2. the edge auto-scroll frame pump (finger STATIONARY while the container scrolls).
 * Path 2 is the one that used to be missing: while auto-scrolling with the finger still,
 * only scrollBy ran, so the lifted row scrolled away with the content and the drop slot
 * went stale. The pump now replays the last gesture sample through this function each
 * frame; the growing scrollOffset alone advances translate + slot.
 *
 * Worklet-pure: no captures, no JS-thread reads — callable from the UI thread.
 */

export const AUTO_SCROLL_EDGE_BAND_PX = 96;
export const AUTO_SCROLL_MAX_STEP_PX = 14;

export type DragFrameInput = {
  /** Last gesture translationY sample (frozen while the finger is stationary). */
  translationY: number;
  /** Last gesture absoluteY sample (frozen while the finger is stationary). */
  absoluteY: number;
  /** CURRENT scroll offset of the container (moves during auto-scroll). */
  scrollOffset: number;
  /** Scroll offset captured at lift. */
  liftScrollOffset: number;
  /** Slot index the row was lifted from. */
  liftSlotIndex: number;
  rowHeight: number;
  pinnedLeadingCount: number;
  itemCount: number;
  viewportTopY: number;
  viewportBottomY: number;
};

export type DragFrameResult = {
  /** The lifted row's translateY from its lift slot (finger + scroll compensation). */
  translate: number;
  /** The clamped slot the lifted row currently occupies. */
  slot: number;
  /** Signed px/frame auto-scroll step (0 outside the edge bands). */
  autoScrollStep: number;
};

export const computeDragFrame = (input: DragFrameInput): DragFrameResult => {
  'worklet';
  // Auto-scroll compensation: while the container scrolls under the finger, the row's
  // translate must grow by the scrolled distance to stay finger-pinned.
  const scrollDelta = input.scrollOffset - input.liftScrollOffset;
  const translate = input.translationY + scrollDelta;

  const rawSlot = input.liftSlotIndex + Math.round(translate / input.rowHeight);
  const minSlot = input.pinnedLeadingCount;
  const maxSlot = input.itemCount - 1;
  const slot = Math.max(minSlot, Math.min(maxSlot, rawSlot));

  // Edge bands → proportional auto-scroll step (0 outside the bands).
  const topDepth = input.viewportTopY + AUTO_SCROLL_EDGE_BAND_PX - input.absoluteY;
  const bottomDepth = input.absoluteY - (input.viewportBottomY - AUTO_SCROLL_EDGE_BAND_PX);
  let autoScrollStep = 0;
  if (topDepth > 0) {
    autoScrollStep = -Math.min(1, topDepth / AUTO_SCROLL_EDGE_BAND_PX) * AUTO_SCROLL_MAX_STEP_PX;
  } else if (bottomDepth > 0) {
    autoScrollStep = Math.min(1, bottomDepth / AUTO_SCROLL_EDGE_BAND_PX) * AUTO_SCROLL_MAX_STEP_PX;
  }

  return { translate, slot, autoScrollStep };
};
