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
  /**
   * Last gesture translationX sample. Only meaningful when `columns > 1` (a grid);
   * the 1-D row stack passes 0 and its slot math is X-invariant.
   */
  translationX: number;
  /** Last gesture absoluteY sample (frozen while the finger is stationary). */
  absoluteY: number;
  /** CURRENT scroll offset of the container (moves during auto-scroll). */
  scrollOffset: number;
  /** Scroll offset captured at lift. */
  liftScrollOffset: number;
  /** Slot index the row was lifted from. */
  liftSlotIndex: number;
  /**
   * Vertical slot stride (slot height INCLUDING inter-row gap). Named rowHeight from
   * the 1-D era; the grid passes measuredRowHeight + gap.
   */
  rowHeight: number;
  /** Slot-map shape: 1 = the classic row stack; 2 = the bookmarks tile grid. */
  columns: number;
  /** Horizontal slot stride (cell width INCLUDING inter-column gap). Unused when columns === 1. */
  columnStride: number;
  pinnedLeadingCount: number;
  itemCount: number;
  viewportTopY: number;
  viewportBottomY: number;
  /**
   * SCREEN-SPACE top clamp on the finger translation (wave-2 §1.4): the smallest
   * translationY at which the lifted item's TOP edge sits exactly on the chrome
   * boundary (header bottom). `-Infinity` = no clamp. Derivation: the rendered
   * position is `liftRect + translationY + scrollDelta` while the container itself
   * moves by `-scrollDelta`, so the item's on-screen top is
   * `liftAbsTop + translationY` — clamping translationY clamps the SCREEN position
   * invariantly under auto-scroll (the finger may keep going; the item stops at the
   * boundary and rejoins on the way back).
   */
  minTranslationY: number;
  /**
   * VARIABLE-HEIGHT slot map (leg 10 step 6): LIFT-TIME prefix boundaries of the
   * 1-column stack — length `itemCount + 1`, `slotBoundaries[k]` = the top of slot k,
   * last entry = total stack height (all values measured px, spacing included).
   * When present (columns must be 1) the vertical hit-test becomes "the interval
   * containing the lifted item's CENTER" (lift-slot center + translate) instead of the
   * uniform-stride round. The boundaries are FROZEN AT LIFT by the caller so the
   * reference geometry never shifts under live shuffles (no swap oscillation).
   *
   * UNIFORM REDUCTION (the spec's proof obligation): with stride h,
   * boundaries[k] = k·h, so center = lift·h + h/2 + translate and the containing
   * interval index is lift + round(translate / h) — VERBATIM the shipped 1-D math,
   * including the round-half-up tie (center exactly on a boundary belongs to the
   * next interval, as Math.round(±0.5) rounds toward +∞ / to −0).
   * Null/undefined = the uniform-stride math, unchanged.
   */
  slotBoundaries?: readonly number[] | null;
};

export type DragFrameResult = {
  /** The lifted item's translateY from its lift slot (finger + scroll compensation). */
  translate: number;
  /** The lifted item's translateX from its lift slot (finger only; scroll is vertical). */
  translateX: number;
  /** The clamped slot the lifted item currently occupies. */
  slot: number;
  /** Signed px/frame auto-scroll step (0 outside the edge bands). */
  autoScrollStep: number;
};

export const computeDragFrame = (input: DragFrameInput): DragFrameResult => {
  'worklet';
  // Auto-scroll compensation: while the container scrolls under the finger, the row's
  // translate must grow by the scrolled distance to stay finger-pinned.
  const scrollDelta = input.scrollOffset - input.liftScrollOffset;
  // §1.4 chrome clamp: the finger translation is floored BEFORE compensation so both
  // the rendered translate and the slot hit-test stop at the boundary together.
  const clampedTranslationY = Math.max(input.translationY, input.minTranslationY);
  const translate = clampedTranslationY + scrollDelta;
  const translateX = input.columns > 1 ? input.translationX : 0;

  // Nearest-slot-center hit-test on each axis: `round(offset / stride)` crosses to the
  // next slot exactly when the dragged item's center passes the midpoint between slot
  // centers. With columns === 1 this reduces verbatim to the shipped 1-D math
  // (rawSlot = liftSlot + round(translate / rowHeight)).
  const columns = Math.max(1, input.columns);
  const liftRow = Math.floor(input.liftSlotIndex / columns);
  const liftCol = input.liftSlotIndex - liftRow * columns;
  const maxRow = Math.ceil(input.itemCount / columns) - 1;
  const boundaries =
    columns === 1 &&
    input.slotBoundaries != null &&
    input.slotBoundaries.length === input.itemCount + 1
      ? input.slotBoundaries
      : null;
  let rawRow: number;
  if (boundaries != null) {
    // Variable-height slot map: the lifted item's center in the FROZEN lift geometry,
    // hit-tested against the interval it falls in (see the input doc for the verbatim
    // uniform reduction). Linear scan — worklet-safe, itemCount is list-sized.
    const center =
      (boundaries[input.liftSlotIndex] + boundaries[input.liftSlotIndex + 1]) / 2 + translate;
    let containing = input.itemCount - 1;
    for (let k = 0; k < input.itemCount; k += 1) {
      if (center < boundaries[k + 1]) {
        containing = k;
        break;
      }
    }
    rawRow = containing;
  } else {
    rawRow = liftRow + Math.round(translate / input.rowHeight);
  }
  const row = Math.max(0, Math.min(maxRow, rawRow));
  const rawCol =
    columns > 1 ? liftCol + Math.round(translateX / Math.max(1, input.columnStride)) : 0;
  const col = Math.max(0, Math.min(columns - 1, rawCol));

  const rawSlot = row * columns + col;
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

  return { translate, translateX, slot, autoScrollStep };
};
