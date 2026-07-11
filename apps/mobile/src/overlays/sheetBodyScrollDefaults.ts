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
 * ALWAYS-SCROLLABLE AMENDMENT (owner decree 2026-07-11): every page must scroll/bounce even when
 * its content fits the viewport. These literals are now the REST-STATE / fallback values: the
 * container gates `bounces`/`alwaysBounceVertical` on the UI thread (bounce ON only for up-drags
 * or while bottom-overscrolled — see the `touchDirection` prop doc on BottomSheetScrollContainer).
 * The TOP contract above is unchanged: a down-drag always finds bounce off and pins at the top.
 * Android keeps `overScrollMode:'never'` (its overscroll stretch cannot be direction-gated).
 */
export const SHEET_BODY_NO_OVERSCROLL: {
  bounces: boolean;
  alwaysBounceVertical: boolean;
  overScrollMode: ScrollViewProps['overScrollMode'];
} = {
  bounces: false,
  alwaysBounceVertical: false,
  overScrollMode: 'never',
};

/**
 * Slack past the content's max legitimate offset before the container treats the list as
 * bottom-overscrolled (keeps the bounce gate from flickering on sub-pixel content/frame rounding).
 */
export const BOTTOM_OVERSCROLL_EPSILON_PX = 2;
