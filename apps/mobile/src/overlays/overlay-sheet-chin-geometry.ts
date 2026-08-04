// ─── THE CHIN RULE — one home (F1465) ────────────────────────────────────────────────────────
//
// A "chin" is a pinned bar at the bottom of an overlay sheet (the poll Publish CTA, the poll
// compose composer, the dm composer). Its geometry was spelled at FIVE sites with FOUR
// different numbers: `expanded + insets.bottom + 88` (PollCreationPanel), `expandedSnapTop +
// insets.bottom + 64` (PollDetailPanel), `expandedTop + Math.max(insets.bottom, 12)`
// (MessagingPanels) and `Math.max(insets.bottom + 48, 72)` spelled byte-identically in TWO
// files (polls-panel-feed-runtime, RestaurantPanel). Two of the panels claimed in prose to
// mirror each other while 88 vs 64 went unreconciled.
//
// RN-free on purpose (the same split overlay-chrome-metrics uses): these are arithmetic facts
// with a jest contract, not styles.
//
// The KEYBOARD LIFT (`-Math.max(0, keyboard.height.value - insets.bottom)`) deliberately stays
// spelled at its three panels: it runs inside a reanimated worklet, and a plain module import
// is not worklet-safe. Those three copies AGREE; this file owns the padding arithmetic.

/** Chin box: nine matching style properties across both chins; these two are the height. */
export const OVERLAY_CHIN_PADDING_TOP = 10;
export const OVERLAY_CHIN_PADDING_BOTTOM = 12;

/**
 * The reserved height of a chin, by chin.
 *
 * OWNER DECISION OWED: the Publish chin reserves 24px more clearance than the compose chin,
 * and no comment at either site ever explained why — the chin BOX is identical in both
 * (paddingTop 10 + paddingBottom 12, nine matching properties). Neither number is derived
 * from that box. Naming them here preserves today's behavior EXACTLY while making the
 * divergence a thing someone can decide instead of a number nobody can see.
 */
export const OVERLAY_PUBLISH_CHIN_RESERVED_HEIGHT = 88;
export const OVERLAY_COMPOSE_CHIN_RESERVED_HEIGHT = 64;

/**
 * Scroll-content bottom padding for a sheet body that ends at the BODY-FRAME bottom.
 *
 * The list body frame fills the full sheet height but the sheet is translated DOWN by
 * `expandedTop`, so its bottom overhangs the visible screen by exactly that much. The padding
 * must therefore cover the overhang + the home-indicator inset + the chin's reserved height,
 * or the last row is buried under the chin.
 */
export const resolveChinContentBottomPadding = ({
  expandedTop,
  insetBottom,
  chinReservedHeight,
}: {
  expandedTop: number;
  insetBottom: number;
  chinReservedHeight: number;
}): number => expandedTop + insetBottom + chinReservedHeight;

/**
 * Base bottom padding for a FLEX-COLUMN chin body (the dm thread): the composer is the last
 * row of the column rather than an absolutely-positioned bar, so no chin height is reserved —
 * the padding only has to clear the overhang and pin the composer above the home indicator.
 * The `Math.max(_, 12)` floor keeps a composer breathing on a device with no home inset.
 */
export const OVERLAY_CHIN_MIN_HOME_INSET = 12;

export const resolveComposerBodyBasePaddingBottom = ({
  expandedTop,
  insetBottom,
}: {
  expandedTop: number;
  insetBottom: number;
}): number => expandedTop + Math.max(insetBottom, OVERLAY_CHIN_MIN_HOME_INSET);

/**
 * Scroll-content bottom padding for a CHINLESS sheet body whose content ends on screen (the
 * polls feed, the restaurant panel): just the home inset plus a comfortable tail, floored so
 * the tail exists on a device with no home inset.
 */
export const OVERLAY_CHINLESS_BOTTOM_TAIL = 48;
export const OVERLAY_CHINLESS_MIN_BOTTOM_PADDING = 72;

export const resolveChinlessContentBottomPadding = (insetBottom: number): number =>
  Math.max(insetBottom + OVERLAY_CHINLESS_BOTTOM_TAIL, OVERLAY_CHINLESS_MIN_BOTTOM_PADDING);
