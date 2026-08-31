import { StyleSheet } from 'react-native';
import { STRIP_BAND_BOTTOM_SPACER_HEIGHT } from '../../toggles/toggle-strip-metrics';

import { SEARCH_SHORTCUT_SHADOW } from './shadows';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { colors as themeColors } from '../../constants/theme';
import {
  OVERLAY_CHROME_ZINDEX,
  OVERLAY_CORNER_RADIUS,
  OVERLAY_NAV_SILHOUETTE_ZINDEX,
} from '../../overlays/overlaySheetStyles';
import {
  ACTIVE_TAB_COLOR,
  CARD_LINE_GAP,
  CARD_VERTICAL_PADDING,
  CARD_VERTICAL_PADDING_BALANCE,
  CONTENT_HORIZONTAL_PADDING,
  FIRST_RESULT_TOP_PADDING_EXTRA,
  NAV_TOP_PADDING,
  PRICE_SLIDER_WRAPPER_HORIZONTAL_PADDING,
  PRICE_THUMB_SIZE,
  PRICE_THUMB_DOT_SIZE,
  PRICE_THUMB_HIT_SIZE,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_HORIZONTAL_PADDING,
  SEARCH_SHORTCUTS_BOTTOM_MARGIN,
  SEARCH_THIS_AREA_COLOR,
  RESULT_ACTIONS_LEFT_GAP,
  RANK_BADGE_WIDTH,
  RESULT_DETAILS_INDENT,
  SPACING_SM,
  SPACING_XS,
} from './constants/search';
import { CONTROL_HEIGHT, CONTROL_HORIZONTAL_PADDING, CONTROL_RADIUS } from './constants/ui';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: StyleSheet.absoluteFillObject,
  mapViewport: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: themeColors.surface,
  },
  statusBarFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  statusBarFadeLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingBottom: 24,
    zIndex: OVERLAY_CHROME_ZINDEX,
    elevation: OVERLAY_CHROME_ZINDEX,
  },
  searchContainer: {
    paddingHorizontal: SEARCH_HORIZONTAL_PADDING,
    paddingTop: SEARCH_CONTAINER_PADDING_TOP,
    zIndex: 50,
  },
  searchShortcutsRow: {
    paddingTop: 2,
    marginBottom: SEARCH_SHORTCUTS_BOTTOM_MARGIN,
    marginTop: 10,
    zIndex: 55,
  },
  // The chip strip is a horizontal scroll surface (R7 groundwork). `overflow: visible`
  // keeps the chip shadows from being clipped by the scroll view's bounds; the row's
  // horizontal padding lives on the CONTENT so chip onLayout x-coordinates keep the
  // same padding-inclusive origin the plain row reported, and chips scroll to the
  // screen edge Google-Maps style.
  searchShortcutsScroll: {
    overflow: 'visible',
  },
  searchShortcutsScrollContent: {
    paddingHorizontal: SEARCH_HORIZONTAL_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  searchShortcutChip: {
    // Mirrors the toggle-strip control box (SegmentedToggle option: 32-high,
    // radius-8, 12/5 padding) so the shortcuts and the strip cutouts read as one family.
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: '#ffffff',
    height: 32,
    paddingHorizontal: 12,
    paddingVertical: 5,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginRight: 0,
    ...SEARCH_SHORTCUT_SHADOW,
  },
  searchShortcutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  searchThisAreaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  searchThisAreaButton: {
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 11,
    paddingVertical: 8,
    justifyContent: 'center',
    ...SEARCH_SHORTCUT_SHADOW,
  },
  searchThisAreaText: {
    color: SEARCH_THIS_AREA_COLOR,
  },
  searchShortcutChipText: {
    // Matches the SegmentedToggle inactive label color.
    color: '#111827',
  },
  searchSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
    zIndex: 10,
  },
  searchSurfaceScroll: {
    alignSelf: 'stretch',
    width: '100%',
  },
  searchSuggestionHeaderSurface: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  searchSuggestionHeaderBottomSeparatorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  searchSuggestionHeaderBottomSeparator: {
    height: 1,
    backgroundColor: themeColors.border,
  },
  searchSuggestionScrollSurface: {
    backgroundColor: 'transparent',
  },
  searchSuggestionScrollContent: {
    position: 'relative',
  },
  searchSuggestionScrollBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
  },
  searchSuggestionTopFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
  },
  bottomNavWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    zIndex: OVERLAY_NAV_SILHOUETTE_ZINDEX,
    elevation: OVERLAY_NAV_SILHOUETTE_ZINDEX,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingTop: NAV_TOP_PADDING,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  navTouchShield: {
    ...StyleSheet.absoluteFillObject,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  navIcon: {
    marginBottom: 2,
  },
  navLabel: {
    marginTop: 0,
    color: themeColors.textBody,
    textAlign: 'center',
    includeFontPadding: false,
  },
  navLabelActive: {
    color: ACTIVE_TAB_COLOR,
  },
  scoreInfoContent: {
    gap: 12,
  },
  scoreInfoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreInfoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreInfoTitle: {
    color: '#0f172a',
  },
  scoreInfoValue: {
    color: themeColors.textPrimary,
  },
  scoreInfoClose: {
    padding: 6,
    borderRadius: 999,
  },
  scoreInfoSubtitle: {
    color: themeColors.textBody,
  },
  scoreInfoMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    rowGap: 8,
  },
  scoreInfoMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  scoreInfoMetricText: {
    color: '#0f172a',
  },
  scoreInfoMetricLabel: {
    color: themeColors.textBody,
  },
  scoreInfoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
  scoreInfoDescription: {
    color: themeColors.textBody,
    lineHeight: LINE_HEIGHTS.body,
  },
  resultsSheetSurface: {
    backgroundColor: 'transparent',
  },
  resultsListBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
  },
  resultsSurface: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  resultsListHeader: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  // The band block's bottom seam — the ONE shared constant (strip-band seam law §1).
  resultsListHeaderBottomStrip: {
    height: STRIP_BAND_BOTTOM_SPACER_HEIGHT,
    width: '100%',
    backgroundColor: '#ffffff',
  },
  onDemandNotice: {
    alignSelf: 'stretch',
    marginHorizontal: CONTENT_HORIZONTAL_PADDING,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.background,
  },
  onDemandNoticeText: {
    color: themeColors.textBody,
    textAlign: 'center',
  },
  loadMoreSpacer: {
    minHeight: 120,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  loadMoreSpinner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  resultsSheetContainer: {
    flex: 1,
  },
  priceSheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  priceSheetHeaderContentRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceSheetHeadlineSuffix: {
    color: '#0f172a',
    flexShrink: 1,
  },
  priceSheetSummaryReelItem: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceSheetSummaryText: {
    color: '#0f172a',
    textAlign: 'center',
  },
  priceSheetSummaryMeasureText: {
    opacity: 0,
  },
  priceSheetSummaryPill: {
    position: 'relative',
    height: CONTROL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: CONTROL_HORIZONTAL_PADDING + 4,
    borderRadius: CONTROL_RADIUS,
    backgroundColor: `${themeColors.primary}14`,
    overflow: 'hidden',
    flexShrink: 0,
  },
  priceSheetSummaryMeasureContainer: {
    position: 'absolute',
    opacity: 0,
    left: -9999,
    top: 0,
  },
  priceSheetSliderWrapper: {
    width: '100%',
    paddingHorizontal: PRICE_SLIDER_WRAPPER_HORIZONTAL_PADDING,
    marginTop: 0,
    marginBottom: 4,
  },
  sheetActionsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  sheetCancelButton: {
    height: 40,
    borderRadius: 12,
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${themeColors.primary}14`,
  },
  sheetCancelText: {
    color: '#000000',
  },
  priceTrackContainer: {
    width: '100%',
    height: PRICE_THUMB_HIT_SIZE,
    justifyContent: 'center',
  },
  priceSliderRailSegment: {
    position: 'absolute',
    height: 4,
    borderRadius: 999,
    backgroundColor: `${themeColors.primary}17`,
    top: '50%',
    marginTop: -2,
  },
  priceSliderRailSelectedSegment: {
    position: 'absolute',
    height: 4,
    borderRadius: 999,
    backgroundColor: themeColors.primary,
    top: '50%',
    marginTop: -2,
  },
  priceSliderThumbHitTarget: {
    position: 'absolute',
    top: '50%',
    marginTop: -PRICE_THUMB_HIT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    width: PRICE_THUMB_HIT_SIZE,
    height: PRICE_THUMB_HIT_SIZE,
  },
  priceSliderThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    width: PRICE_THUMB_SIZE,
    height: PRICE_THUMB_SIZE,
    borderRadius: PRICE_THUMB_SIZE / 2,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  priceSliderThumbHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PRICE_THUMB_SIZE / 2,
    backgroundColor: `${themeColors.primary}22`,
  },
  priceSliderThumbDot: {
    width: PRICE_THUMB_DOT_SIZE,
    height: PRICE_THUMB_DOT_SIZE,
    borderRadius: PRICE_THUMB_DOT_SIZE / 2,
    backgroundColor: themeColors.primary,
  },
  priceSheetDoneButton: {
    height: 40,
    borderRadius: 12,
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceSheetDoneText: {
    color: '#ffffff',
  },
  resultItem: {
    paddingTop: CARD_VERTICAL_PADDING - CARD_VERTICAL_PADDING_BALANCE,
    paddingBottom: CARD_VERTICAL_PADDING + CARD_VERTICAL_PADDING_BALANCE,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    backgroundColor: '#ffffff',
    alignSelf: 'stretch',
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  resultItemSeparator: {
    height: 8,
    width: '100%',
    backgroundColor: 'transparent',
  },
  firstResultItem: {
    paddingTop:
      CARD_VERTICAL_PADDING - CARD_VERTICAL_PADDING_BALANCE + FIRST_RESULT_TOP_PADDING_EXTRA - 8,
  },
  resultPressable: {
    width: '100%',
  },
  // §7.1 card anatomy: the photo strip rides under the metadata block as the
  // card's last element (button strip comes later).
  cardPhotoStripSection: {
    width: '100%',
    marginTop: 10,
  },
  resultHeader: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: RESULT_ACTIONS_LEFT_GAP,
    minHeight: 32,
    marginBottom: 0,
  },
  resultTitleContainer: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    minHeight: 0,
    paddingTop: 0,
    gap: CARD_LINE_GAP,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CARD_LINE_GAP,
    maxWidth: '100%',
  },
  rankBadge: {
    width: RANK_BADGE_WIDTH,
    height: 30,
    borderRadius: 15,
    backgroundColor: themeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: FONT_SIZES.title,
    lineHeight: 30, // Match container height exactly for vertical centering
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  cardBodyStack: {
    width: '100%',
    gap: CARD_LINE_GAP,
    paddingLeft: RESULT_DETAILS_INDENT,
  },
  // Quiet cue on dense-sibling ("Include similar") rows — muted caption, no loud badge.
  similarMatchLabel: {
    color: '#9ca3af',
    letterSpacing: 0.2,
  },
  // WHY THIS MATCHED chip (owner design 2026-08-30): one quiet muted pill per
  // non-exact card — same hush as similarMatchLabel, pill-shaped like the tag
  // chips. Exact matches render nothing.
  matchExplainChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  matchExplainChipText: {
    color: '#6b7280',
    letterSpacing: 0.2,
  },
  metricBlock: {
    marginTop: 0,
    marginBottom: 0,
    gap: CARD_LINE_GAP,
  },
  metricLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 4,
    rowGap: 2,
  },
  metricIcon: {
    marginRight: 2,
  },
  restaurantScoreIcon: {
    marginRight: 1,
  },
  metricDot: {
    color: themeColors.textBody,
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    marginHorizontal: SPACING_SM,
  },
  metricValue: {
    color: themeColors.textPrimary,
  },
  restaurantMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    minWidth: 0,
    columnGap: SPACING_XS,
    rowGap: CARD_LINE_GAP,
  },
  restaurantMetricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    columnGap: 4,
  },
  restaurantMetricRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 0,
    flexShrink: 1,
    minWidth: 0,
    columnGap: SPACING_XS,
  },
  resultMetaText: {
    color: themeColors.textBody,
    flexShrink: 1,
    includeFontPadding: false,
    lineHeight: LINE_HEIGHTS.body,
  },
  resultMetaPrefix: {
    color: themeColors.textBody,
  },
  resultMetaTextRight: {
    textAlign: 'right',
  },
  resultMetaOpen: {
    color: '#16a34a',
  },
  resultMetaClosingSoon: {
    color: '#f59e0b',
  },
  resultMetaSuffix: {
    color: themeColors.textBody,
  },
  resultMetaClosed: {
    color: '#dc2626',
  },
  resultMetaSeparator: {
    color: themeColors.textBody,
  },
  resultMetaPrice: {
    color: themeColors.textBody,
  },
  resultMetaDistance: {
    color: themeColors.textBody,
  },
  resultContent: {
    marginLeft: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingLeft: RESULT_DETAILS_INDENT,
  },
  resultContentStack: {
    gap: CARD_LINE_GAP,
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  // The empty-results block top-aligns inside the results surface (which spans from the
  // header to the screen bottom — most of it below the sheet's collapsed fold), so it
  // takes comfortable top padding rather than centering in the oversized container. The
  // old marginTop: -20 (from a centered parent era) clipped the whole block above the
  // surface's visible bounds — the empty favorites "blank sheet".
  emptyState: {
    paddingVertical: 0,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyStateSurfaceBlock: {
    paddingTop: 48,
  },
  emptyStateSubtitle: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  textSlate900: {
    color: themeColors.textPrimary,
  },
  topFoodSection: {
    marginTop: 0,
    marginBottom: 0,
    gap: CARD_LINE_GAP,
    alignSelf: 'stretch',
  },
  matchedTagsSection: {
    gap: 6,
    alignSelf: 'stretch',
  },
  matchedTagsLabel: {
    color: themeColors.textMuted,
    letterSpacing: 0.2,
  },
  matchedTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  matchedTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  matchedTagText: {
    color: themeColors.textBody,
  },
  topFoodInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
    minWidth: 0,
    width: '100%',
    alignSelf: 'stretch',
    columnGap: CARD_LINE_GAP,
    rowGap: CARD_LINE_GAP,
  },
  topFoodInlineLineContainer: {
    flex: 1,
    minWidth: 0,
  },
  topFoodInlineLineText: {
    color: themeColors.textBody,
    flexShrink: 1,
    minWidth: 0,
  },
  topFoodRankInline: {
    color: themeColors.primary,
  },
  topFoodNameInline: {
    color: themeColors.textBody,
  },
  topFoodMore: {
    color: themeColors.secondaryAccent,
    marginTop: 0,
    alignSelf: 'flex-start',
    paddingLeft: 0,
    flexShrink: 0,
  },
  topFoodInlineMeasure: {
    position: 'absolute',
    opacity: 0,
    left: -10000,
    top: 0,
    pointerEvents: 'none',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    columnGap: CARD_LINE_GAP,
    alignSelf: 'flex-start',
  },
  cardTitleText: {
    flexShrink: 1,
    minWidth: 0,
  },
  topFoodMeasureText: {
    color: themeColors.textBody,
  },
});

export default styles;
