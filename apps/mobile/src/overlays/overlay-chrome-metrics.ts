import { CONTROL_HEIGHT } from '../screens/Search/constants/ui';

// THE CHROME-ROW METRICS (THE PAGE L1) — RN-free by design so the computed chrome
// geometry (scene-chrome-geometry.ts) and its jest contracts can consume them without
// pulling react-native. overlaySheetStyles re-exports every name, so style consumers
// are unchanged; these tokens are the DECLARED inputs the chrome row's fixed height is
// summed from (OverlaySheetHeaderChrome renders `fixedHeight` — text conforms to the
// box, never the reverse, which is what makes the sum physically true).

export const OVERLAY_HORIZONTAL_PADDING = 20;
export const OVERLAY_CORNER_RADIUS = 22;
export const OVERLAY_HEADER_CLOSE_BUTTON_SIZE = CONTROL_HEIGHT;
export const OVERLAY_GRAB_HANDLE_WIDTH = 40;
export const OVERLAY_GRAB_HANDLE_HEIGHT = 3.25;
export const OVERLAY_GRAB_HANDLE_RADIUS = 2;
export const OVERLAY_GRAB_HANDLE_PADDING_TOP = 8;

export const OVERLAY_HEADER_PADDING_BOTTOM = 10;
export const OVERLAY_HEADER_ROW_MARGIN_TOP = 7;
export const OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM = 8;

export const OVERLAY_TAB_HEADER_HEIGHT =
  OVERLAY_GRAB_HANDLE_PADDING_TOP +
  OVERLAY_GRAB_HANDLE_HEIGHT +
  OVERLAY_HEADER_ROW_MARGIN_TOP +
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE +
  OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM +
  OVERLAY_HEADER_PADDING_BOTTOM;
