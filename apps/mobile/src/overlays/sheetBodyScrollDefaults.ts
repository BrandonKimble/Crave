import type { ScrollViewProps } from 'react-native';

/**
 * Canonical no-over-scroll defaults for EVERY bottom-sheet body.
 *
 * Why this exists — the continuous scroll→sheet DOWN-handoff. You drag down; the list scrolls up to
 * its top; then — finger still down, one unbroken gesture — the sheet itself becomes the grabber and
 * collapses. This is the mirror of the up-handoff (drag up → sheet expands → hands off to list
 * scroll) and it only works if, at the moment the list reaches its top, the list PINS there instead
 * of rubber-band over-scrolling past it. If over-scroll is enabled, the native scroll bounces the
 * content DOWN past the (fixed) header at that exact moment — the list visibly "separates from the
 * header" while the sheet collapses. The collapse-pan and the native scroll run simultaneously, so
 * the only way to keep the list still is to make it physically unable to move at its top.
 *
 * Disabling bounce three ways pins it: iOS needs BOTH `bounces:false` and `alwaysBounceVertical:false`
 * (the latter otherwise re-enables a top bounce when content is short); Android needs
 * `overScrollMode:'never'`.
 *
 * This is applied STRUCTURALLY by `BottomSheetScrollContainer` (the single native scroll view every
 * sheet body — list, scrollview, mounted — renders through), AFTER the prop spread, so it cannot be
 * overridden per scene. Over-scroll is therefore NOT a transport knob: a new sheet gets the correct
 * handoff for free and can't accidentally break it. (If a future non-handoff sheet ever genuinely
 * needs bounce, add an explicit opt-out at the container — don't reintroduce a per-scene prop.)
 *
 * ALWAYS-SCROLLABLE (owner decree 2026-07-11): every page's list stays scroll-ENABLED even when its
 * content fits the viewport (decided upstream via `shouldEnableScroll`). That is orthogonal to
 * over-scroll: scroll-enabled short content simply doesn't move, and bounce stays OFF. No-bounce is
 * UNCONDITIONAL — the earlier direction-gated bounce (a `touchDirection` shared value that enabled
 * bounce on up-drags) was reverted because its top over-scroll let the list translate past the
 * pinned header during the down-handoff AND desynced the FrostCutout plate (which translates by
 * -scrollOffset and cannot follow a negative over-scroll offset).
 */
// SHORT_PAGE_SCROLL_ROOM_PX is DELETED (boundary-physics law §5): a short page has
// interior scroll range 0 — both boundaries at once — and the runtime-owned overscroll
// gives it real rubber-band feel with zero fake padding. The old floor existed only so
// the handoff had a real scroll to fail into; boundary ownership replaced that need.

export const SHEET_BODY_NO_OVERSCROLL: {
  bounces: boolean;
  alwaysBounceVertical: boolean;
  overScrollMode: ScrollViewProps['overScrollMode'];
} = {
  bounces: false,
  alwaysBounceVertical: false,
  overScrollMode: 'never',
};
