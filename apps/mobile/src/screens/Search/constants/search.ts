import { Dimensions } from 'react-native';

import { colors as themeColors } from '../../../constants/theme';
import { FONT_SIZES } from '../../../constants/typography';
import { OVERLAY_HORIZONTAL_PADDING } from '../../../overlays/overlaySheetStyles';
import { CONTROL_HEIGHT } from './ui';

export const SCREEN_HEIGHT = Dimensions.get('window').height;
export const SCREEN_WIDTH = Dimensions.get('window').width;

export const CONTENT_HORIZONTAL_PADDING = OVERLAY_HORIZONTAL_PADDING;
export const SEARCH_HORIZONTAL_PADDING = CONTENT_HORIZONTAL_PADDING;
export const SEARCH_CONTAINER_PADDING_TOP = 8;
export const CARD_GAP = 6;
export const SHARED_SECTION_GAP = CARD_GAP;
export const FIRST_RESULT_TOP_PADDING_EXTRA = 8;
export const SECTION_GAP = SHARED_SECTION_GAP;
export const TOP_FOOD_INLINE_WIDTH_BUFFER = CONTENT_HORIZONTAL_PADDING;
export const ACTIVE_TAB_COLOR = themeColors.primary;
export const MINIMUM_VOTES_FILTER = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const RESULTS_BOTTOM_PADDING = 375;
export const PRICE_THUMB_SIZE = 20;
export const PRICE_SLIDER_WRAPPER_HORIZONTAL_PADDING = 4;

export const DISTANCE_MIN_DECIMALS = 1;
export const DISTANCE_MAX_DECIMALS = 0;

export const USA_FALLBACK_CENTER: [number, number] = [-98.5795, 39.8283];
export const USA_FALLBACK_ZOOM = 3.2;
export const TOP_FOOD_RENDER_LIMIT = 3;
export const SINGLE_LOCATION_ZOOM_LEVEL = 13;
export const TIGHT_BOUNDS_THRESHOLD_DEGREES = 0.002;
export const RESTAURANT_FIT_BOUNDS_PADDING = 80;
export const LABEL_TEXT_SIZE = 12;
export const PIN_MARKER_SIZE = 28;
export const PIN_MARKER_SCALE = 1;
export const PIN_MARKER_RENDER_SIZE = PIN_MARKER_SIZE * PIN_MARKER_SCALE;
export const LABEL_RADIAL_OFFSET_EM = 1.3;
export const LABEL_TRANSLATE_Y = -PIN_MARKER_RENDER_SIZE * 0.45;
export const PIN_BASE_WIDTH = 96;
export const PIN_BASE_HEIGHT = 96;
export const PIN_FILL_WIDTH = 80;
export const PIN_FILL_HEIGHT = 72;
export const PIN_FILL_SCALE = 1.0;
export const PIN_BASE_SCALE = PIN_MARKER_RENDER_SIZE / PIN_BASE_HEIGHT;
export const PIN_FILL_VERTICAL_BIAS = -5.5; // Shift up so top gap = side gap
export const PIN_FILL_HORIZONTAL_BIAS = 0;
export const PIN_FILL_RENDER_WIDTH = PIN_FILL_WIDTH * PIN_BASE_SCALE * PIN_FILL_SCALE;
export const PIN_FILL_RENDER_HEIGHT = PIN_FILL_HEIGHT * PIN_BASE_SCALE * PIN_FILL_SCALE;
export const PIN_FILL_LEFT_OFFSET =
  (PIN_BASE_WIDTH * PIN_BASE_SCALE - PIN_FILL_RENDER_WIDTH) / 2 +
  PIN_FILL_HORIZONTAL_BIAS * PIN_BASE_SCALE;
export const PIN_FILL_TOP_OFFSET =
  (PIN_BASE_HEIGHT * PIN_BASE_SCALE - PIN_FILL_RENDER_HEIGHT) / 2 +
  PIN_FILL_VERTICAL_BIAS * PIN_BASE_SCALE;

// Pin fill center in wrapper coordinates (geometric center of symmetric shape)
export const PIN_FILL_CENTER_X = PIN_FILL_LEFT_OFFSET + PIN_FILL_RENDER_WIDTH / 2;
export const PIN_FILL_CENTER_Y = PIN_FILL_TOP_OFFSET + PIN_FILL_RENDER_HEIGHT / 2;

// Rank text sizing - use pin fill dimensions for container
export const PIN_RANK_FONT_SIZE = FONT_SIZES.body; // 14
export const PIN_RANK_CONTAINER_WIDTH = PIN_FILL_RENDER_WIDTH; // ~22.63 - wider for 2-digit numbers
export const PIN_RANK_CONTAINER_HEIGHT = PIN_FILL_RENDER_HEIGHT; // ~20.37

// Optical adjustment for platform text rendering (positive = shift right)
const PIN_RANK_OPTICAL_OFFSET_X = 0;

// Position container centered on pin fill center (with optical adjustment)
export const PIN_RANK_LEFT =
  PIN_FILL_CENTER_X - PIN_RANK_CONTAINER_WIDTH / 2 + PIN_RANK_OPTICAL_OFFSET_X;
export const PIN_RANK_TOP = PIN_FILL_CENTER_Y - PIN_RANK_CONTAINER_HEIGHT / 2;

export const AUTOCOMPLETE_MIN_CHARS = 1;
export const SEARCH_BAR_HOLE_PADDING = 0;
export const SEARCH_BAR_HOLE_RADIUS = 14;
export const SHORTCUT_CHIP_HOLE_PADDING = 0;
export const SHORTCUT_CHIP_HOLE_RADIUS = 12;
export const SEARCH_SUGGESTION_PANEL_OVERLAP = 12;
export const SEARCH_SUGGESTION_PANEL_PADDING_TOP = 0;
export const SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM = 0;
export const SEARCH_SUGGESTION_TOP_FILL_HEIGHT = 220;
export const SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM = 9;
export const SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP = 1;
export const SEARCH_SUGGESTION_HEADER_PANEL_GAP = 0;
export const SEARCH_SHORTCUTS_BOTTOM_MARGIN = SECTION_GAP;

export const MARKER_SHADOW_STYLE = {
  shadowColor: 'rgba(0, 0, 0, 0.35)',
  shadowOpacity: 0.45,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 4,
  elevation: 8,
};

export const AUTOCOMPLETE_CACHE_TTL_MS = 5 * 60 * 1000;
export const SEARCH_THIS_AREA_COLOR = '#0ea5e9';
export const MAP_MOVE_MIN_DISTANCE_MILES = 0.1;
export const MAP_MOVE_DISTANCE_RATIO = 0.08;
export const CLOSE_BUTTON_HOLE_PADDING = 0;
export const CLOSE_BUTTON_HOLE_Y_OFFSET = 0;
export const RESULTS_HEADER_MASK_PADDING = 2;

export const TOGGLE_HEIGHT = CONTROL_HEIGHT;
export const NAV_TOP_PADDING = 8;
export const NAV_BOTTOM_PADDING = 0;
export const RESULT_HEADER_ICON_SIZE = 35;
export const RESULT_CLOSE_ICON_SIZE = RESULT_HEADER_ICON_SIZE;
export const SECONDARY_METRIC_ICON_SIZE = 14;
export const VOTE_ICON_SIZE = SECONDARY_METRIC_ICON_SIZE;
export const SPACING_XS = 2;
export const SPACING_SM = 3;
export const SPACING_MD = 5;
export const CARD_LINE_GAP = 6;
export const RANK_BADGE_WIDTH = 32;
export const RESULT_TITLE_RIGHT_PADDING = 48;
export const RESULT_DETAILS_INDENT = RANK_BADGE_WIDTH + CARD_LINE_GAP;
export const CARD_VERTICAL_PADDING = 12;
export const CARD_VERTICAL_PADDING_BALANCE = 2;
export const CAMERA_STORAGE_KEY = 'search:lastCamera';
export const LOCATION_STORAGE_KEY = 'search:lastLocation';
export const SCORE_INFO_MAX_HEIGHT = SCREEN_HEIGHT * 0.25;
export const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;

export type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];
