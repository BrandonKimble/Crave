/**
 * THE TOGGLE-STRIP WARM-RESTORE CACHE (strip engine, leg 2 — plans/toggle-strip-rebuild-ledger.md).
 *
 * One engine-owned facility replaces the bespoke per-page joins (SearchFilters used to
 * join the shell's measured layout with the pill's segment layouts by hand): the strip
 * emits ONE cache blob covering everything a remounted instance needs to paint
 * correctly on its FIRST frame —
 *   - band layout (viewport width, row height, content width),
 *   - the derived cutout hole map,
 *   - per-control geometry (SegmentedToggle pills report through the strip's
 *     warm-restore context, keyed by their hole-slot key),
 *   - the settled horizontal SCROLL OFFSET (charter Part 1.4 — the one place the
 *     engine deliberately EXCEEDS the shipped reference, which restored layout only
 *     and reset scrollX on every cross-list remount).
 *
 * A surface owns exactly one `ToggleStripCacheSeat` (search: built once in
 * use-search-root-search-primitives-runtime, shared by the presented strip and the
 * hidden warmup render). The seat is deliberately dumb — read/write — so the engine
 * owns all semantics: what to cache, when to write, how to clamp.
 *
 * Types are structural twins of `MaskedHole` / `LayoutRectangle` (no react-native /
 * component imports) so this module stays pure and jest-able in plain node.
 */

export type ToggleStripHole = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
};

export type ToggleStripControlRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ToggleStripControlLayouts = Record<
  string,
  readonly (ToggleStripControlRect | undefined)[]
>;

export type ToggleStripLayoutCache = {
  /** Measured band viewport width (the strip's horizontal ScrollView frame). */
  viewportWidth: number;
  /** Measured control-row height (drives the mask height). */
  rowHeight: number;
  /**
   * The horizontal ScrollView's contentSize.width — SCROLL SPACE, content insets
   * included. This is the datum scrollX clamps against; 0 means "not yet measured"
   * (clamping degrades to `max(0, scrollX)`).
   */
  contentWidth: number;
  /** Derived cutout holes keyed by hole-slot key (strip-local coordinates). */
  holeMap: Record<string, ToggleStripHole>;
  /** Per-control geometry keyed by the control's hole-slot key (pill segments). */
  controlLayouts: ToggleStripControlLayouts;
  /** SETTLED horizontal scroll offset (drag-end/momentum-end; never mid-flick). */
  scrollX: number;
};

/**
 * A surface's one warm-restore slot. `read` returns the last written cache (or null on
 * a cold surface); `write` replaces it. Implementations should clone on write (the
 * engine hands live-ish objects) — `cloneToggleStripLayoutCache` is the house clone.
 */
export type ToggleStripCacheSeat = {
  read: () => ToggleStripLayoutCache | null;
  write: (cache: ToggleStripLayoutCache) => void;
};

const cloneHole = (hole: ToggleStripHole): ToggleStripHole => ({
  x: hole.x,
  y: hole.y,
  width: hole.width,
  height: hole.height,
  borderRadius: hole.borderRadius,
});

const cloneControlRect = (rect: ToggleStripControlRect): ToggleStripControlRect => ({
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
});

export const cloneToggleStripLayoutCache = (
  cache: ToggleStripLayoutCache | null | undefined
): ToggleStripLayoutCache | null => {
  if (!cache) {
    return null;
  }
  return {
    viewportWidth: cache.viewportWidth,
    rowHeight: cache.rowHeight,
    contentWidth: cache.contentWidth,
    holeMap: Object.fromEntries(
      Object.entries(cache.holeMap).map(([key, hole]) => [key, cloneHole(hole)])
    ),
    controlLayouts: Object.fromEntries(
      Object.entries(cache.controlLayouts).map(([key, rects]) => [
        key,
        rects.map((rect) => (rect ? cloneControlRect(rect) : rect)),
      ])
    ),
    scrollX: cache.scrollX,
  };
};

/**
 * A standalone module-scope seat (leg 3): header-mounted strips have no surface
 * runtime to hang the seat on — the strip component IS the surface's chrome — so the
 * panel module owns one of these. Clone-on-write/read per the seat contract.
 */
export const createToggleStripCacheSeat = (): ToggleStripCacheSeat => {
  let stored: ToggleStripLayoutCache | null = null;
  return {
    read: () => cloneToggleStripLayoutCache(stored),
    write: (cache) => {
      stored = cloneToggleStripLayoutCache(cache);
    },
  };
};

/**
 * THE RE-PRESENT RESET (owner decision 2026-07-12, leg 3): strip scrollX RESETS when a
 * scene is re-presented (industry standard), while still PERSISTING across intra-
 * presentation remounts (the results tab flip — the ratified leg-2 improvement).
 * This is the engine facility every surface uses: zero the cached scrollX, KEEP the
 * layout half (holes / control geometry / band measurements), so the next present
 * paints warm at x=0 with no measure-flash. Surfaces call it at their presentation-end
 * chokepoint: search = the close-search cleanup runtime; header-mounted strips = strip
 * unmount (a header strip unmounts exactly when its scene stops being presented and
 * never remounts within one presentation, so tab-flip persistence is untouched).
 * No-op on a cold seat.
 */
export const clearToggleStripCacheScrollX = (seat: ToggleStripCacheSeat): void => {
  const cache = seat.read();
  if (cache != null && cache.scrollX !== 0) {
    seat.write({ ...cache, scrollX: 0 });
  }
  // LIVE instances too (sim-caught on leg 3): a RETAINED strip (the results leg stays
  // mounted across dismiss) never re-seeds from the cache — its native ScrollView
  // keeps the old offset. The reset must reach the living scroll position, not just
  // the cold-remount seed, or the re-present rule only holds for scenes that unmount.
  const listeners = seatResetListeners.get(seat);
  if (listeners) {
    for (const listener of [...listeners]) {
      listener();
    }
  }
};

// ── Live-instance reset channel (engine-internal) ─────────────────────────────────
// ToggleStrip registers a scroll-to-zero callback against its seat; the clear helper
// above fans out to every mounted instance sharing that seat. Pure module — callbacks
// only, no react-native imports.
const seatResetListeners = new Map<ToggleStripCacheSeat, Set<() => void>>();

export const registerToggleStripSeatResetListener = (
  seat: ToggleStripCacheSeat,
  listener: () => void
): (() => void) => {
  let listeners = seatResetListeners.get(seat);
  if (!listeners) {
    listeners = new Set();
    seatResetListeners.set(seat, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      seatResetListeners.delete(seat);
    }
  };
};

/**
 * THE SEEDED-HOLE PRUNE (leg 4 — orchestrator red-team finding): the strip seeds its
 * hole map from the cache on mount so a remount paints cutouts on frame one, but a
 * cached hole whose control is NOT rendered this presentation (a conditional chip —
 * bookmarks' Edit chip exists only while sort = Custom) would never re-register AND
 * never unregister (unregistration is the mounted slot's unmount cleanup): a phantom
 * see-through window floating in the white plate, forever. The correct point is the
 * SEED, not a later sweep: a hole is the shadow of a rendered control, so the seed is
 * filtered to the hole keys the current children will actually produce — the phantom
 * is unrepresentable rather than pruned on a timer. A control that mounts LATER
 * (Edit appearing when sort flips to Custom) registers live through its own onLayout.
 */
export const pruneToggleStripHoleMapToRenderedSlots = (
  holeMap: Record<string, ToggleStripHole>,
  renderedHoleKeys: readonly string[]
): Record<string, ToggleStripHole> => {
  const rendered = new Set(renderedHoleKeys);
  return Object.fromEntries(Object.entries(holeMap).filter(([key]) => rendered.has(key)));
};

/**
 * Clamp a cached scrollX into the restorable range for the CURRENT geometry. Two
 * jobs: (1) never persist/restore a rubber-band position (negative or past-the-end
 * offsets settle back — restoring one would paint a strip frozen mid-bounce);
 * (2) survive content shrink between unmount and remount (a conditional chip
 * disappearing must not restore an out-of-range offset that iOS would leave stuck
 * until the next touch).
 */
export const clampToggleStripScrollX = ({
  scrollX,
  contentWidth,
  viewportWidth,
}: {
  scrollX: number;
  contentWidth: number;
  viewportWidth: number;
}): number => {
  if (!Number.isFinite(scrollX)) {
    return 0;
  }
  if (!(contentWidth > 0) || !(viewportWidth > 0)) {
    // Geometry unknown: a SETTLED offset was in-range at settle time by iOS's own
    // physics — trust it (minus rubber-band negatives) rather than killing the restore.
    return Math.max(0, scrollX);
  }
  const maxScrollX = Math.max(0, contentWidth - viewportWidth);
  return Math.min(Math.max(0, scrollX), maxScrollX);
};
