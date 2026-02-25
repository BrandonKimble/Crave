import React from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  CONTROL_HEIGHT,
  CONTROL_HORIZONTAL_PADDING,
  CONTROL_RADIUS,
  CONTROL_VERTICAL_PADDING,
} from '../constants/ui';
import { SEGMENT_OPTIONS } from '../constants/search';

import { Text } from '../../../components';
import MaskedHoleOverlay, { type MaskedHole } from '../../../components/MaskedHoleOverlay';
import { FrostedGlassBackground } from '../../../components/FrostedGlassBackground';

const TOGGLE_HEIGHT = CONTROL_HEIGHT;
const TOGGLE_BORDER_RADIUS = CONTROL_RADIUS; // fixed radius as before
const TOGGLE_HORIZONTAL_PADDING = CONTROL_HORIZONTAL_PADDING + 4;
const TOGGLE_VERTICAL_PADDING = CONTROL_VERTICAL_PADDING;
const TOGGLE_STACK_GAP = 8;
const TOGGLE_MIN_HEIGHT = TOGGLE_HEIGHT;
const PRICE_TOGGLE_RIGHT_PADDING = Math.max(0, TOGGLE_HORIZONTAL_PADDING - 3);
const STRIP_BACKGROUND_HEIGHT = 14;
const DEFAULT_VIEWPORT_WIDTH = Dimensions.get('window').width;

const SEGMENT_TRAVEL_MIN_MS = 34;
const SEGMENT_TRAVEL_FULL_MS = 150;
const SEGMENT_TRAVEL_EASING = Easing.linear;

const resolveSegmentTravelDurationMs = (from: number, to: number): number => {
  'worklet';
  const distance = Math.abs(to - from);
  return Math.max(SEGMENT_TRAVEL_MIN_MS, Math.round(distance * SEGMENT_TRAVEL_FULL_MS));
};
const getNextSegmentValue = (value: SegmentValue): SegmentValue =>
  value === 'restaurants' ? 'dishes' : 'restaurants';

const HOLE_RADIUS_BOOST = 1;

const areHolesEqual = (prev: MaskedHole | undefined, next: MaskedHole): boolean => {
  if (!prev) {
    return false;
  }
  const closeEnough = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return (
    closeEnough(prev.x, next.x) &&
    closeEnough(prev.y, next.y) &&
    closeEnough(prev.width, next.width) &&
    closeEnough(prev.height, next.height) &&
    (prev.borderRadius ?? 0) === (next.borderRadius ?? 0)
  );
};

const areLayoutsEqual = (prev: LayoutRectangle | undefined, next: LayoutRectangle): boolean => {
  if (!prev) {
    return false;
  }
  const closeEnough = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return (
    closeEnough(prev.x, next.x) &&
    closeEnough(prev.y, next.y) &&
    closeEnough(prev.width, next.width) &&
    closeEnough(prev.height, next.height)
  );
};

type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];

export type SearchFiltersLayoutCache = {
  viewportWidth: number;
  rowHeight: number;
  holeMap: Record<string, MaskedHole>;
  segmentLayouts?: Partial<Record<SegmentValue, LayoutRectangle>>;
};

type SearchFiltersProps = {
  activeTab: SegmentValue;
  onTabChange: (value: SegmentValue) => void;
  rankButtonLabel: string;
  rankButtonActive: boolean;
  onToggleRankSelector: () => void;
  isRankSelectorVisible: boolean;
  openNow: boolean;
  onToggleOpenNow: () => void;
  votesFilterActive: boolean;
  onToggleVotesFilter: () => void;
  priceButtonLabel: string;
  priceButtonActive: boolean;
  onTogglePriceSelector: () => void;
  isPriceSelectorVisible: boolean;
  contentHorizontalPadding: number;
  accentColor: string;
  disableBlur?: boolean;
  initialLayoutCache?: SearchFiltersLayoutCache | null;
  onLayoutCacheChange?: (cache: SearchFiltersLayoutCache) => void;
};

const SearchFilters: React.FC<SearchFiltersProps> = ({
  activeTab,
  onTabChange,
  rankButtonLabel,
  rankButtonActive,
  onToggleRankSelector,
  isRankSelectorVisible,
  openNow,
  onToggleOpenNow,
  votesFilterActive,
  onToggleVotesFilter,
  priceButtonLabel,
  priceButtonActive,
  onTogglePriceSelector,
  isPriceSelectorVisible,
  contentHorizontalPadding,
  accentColor,
  disableBlur = false,
  initialLayoutCache,
  onLayoutCacheChange,
}) => {
  const [viewportWidth, setViewportWidth] = React.useState(
    initialLayoutCache?.viewportWidth ?? DEFAULT_VIEWPORT_WIDTH
  );
  const [rowHeight, setRowHeight] = React.useState(
    initialLayoutCache?.rowHeight ?? TOGGLE_MIN_HEIGHT
  );
  const [holeMap, setHoleMap] = React.useState<Record<string, MaskedHole>>(
    initialLayoutCache?.holeMap ?? {}
  );
  const segmentLayoutsRef = React.useRef<Partial<Record<SegmentValue, LayoutRectangle>>>(
    initialLayoutCache?.segmentLayouts ? { ...initialLayoutCache.segmentLayouts } : {}
  );
  const interactionTabRef = React.useRef<SegmentValue>(activeTab);
  const hasSyncedFromExternalTabRef = React.useRef(false);
  const [segmentLayoutsVersion, setSegmentLayoutsVersion] = React.useState(0);
  const initialRestaurantLayout = segmentLayoutsRef.current.restaurants;
  const initialDishesLayout = segmentLayoutsRef.current.dishes;
  const initialSegmentLayoutReady = Boolean(
    initialRestaurantLayout?.width &&
      initialRestaurantLayout.width > 0 &&
      initialDishesLayout?.width &&
      initialDishesLayout.width > 0
  );

  const inset = contentHorizontalPadding;
  const scrollX = useSharedValue(0);
  const segmentSelectionProgress = useSharedValue(activeTab === 'restaurants' ? 0 : 1);
  const segmentTargetProgress = useSharedValue(activeTab === 'restaurants' ? 0 : 1);
  const restaurantSegmentX = useSharedValue(initialRestaurantLayout?.x ?? 0);
  const restaurantSegmentWidth = useSharedValue(initialRestaurantLayout?.width ?? 0);
  const dishesSegmentX = useSharedValue(initialDishesLayout?.x ?? 0);
  const dishesSegmentWidth = useSharedValue(initialDishesLayout?.width ?? 0);
  const segmentLayoutReady = useSharedValue(initialSegmentLayoutReady ? 1 : 0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const animateSegmentSelection = React.useCallback(
    (value: SegmentValue, animated: boolean) => {
      const targetProgress = value === 'restaurants' ? 0 : 1;
      const fromProgress = segmentSelectionProgress.value;
      const durationMs = resolveSegmentTravelDurationMs(fromProgress, targetProgress);
      segmentTargetProgress.value = targetProgress;
      if (animated) {
        segmentSelectionProgress.value = withTiming(targetProgress, {
          duration: durationMs,
          easing: SEGMENT_TRAVEL_EASING,
        });
      } else {
        segmentSelectionProgress.value = targetProgress;
      }
    },
    [segmentSelectionProgress, segmentTargetProgress]
  );

  const registerSegmentLayout = React.useCallback(
    (value: SegmentValue) => (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      const prev = segmentLayoutsRef.current[value];
      if (prev && areLayoutsEqual(prev, layout)) {
        return;
      }
      segmentLayoutsRef.current[value] = layout;
      if (value === 'restaurants') {
        restaurantSegmentX.value = layout.x;
        restaurantSegmentWidth.value = layout.width;
      } else {
        dishesSegmentX.value = layout.x;
        dishesSegmentWidth.value = layout.width;
      }
      const nextRestaurantLayout = segmentLayoutsRef.current.restaurants;
      const nextDishesLayout = segmentLayoutsRef.current.dishes;
      if (
        nextRestaurantLayout?.width &&
        nextRestaurantLayout.width > 0 &&
        nextDishesLayout?.width &&
        nextDishesLayout.width > 0
      ) {
        segmentLayoutReady.value = 1;
      }
      setSegmentLayoutsVersion((prevVersion) => prevVersion + 1);
    },
    [
      dishesSegmentWidth,
      dishesSegmentX,
      restaurantSegmentWidth,
      restaurantSegmentX,
      segmentLayoutReady,
    ]
  );

  const registerHole = React.useCallback(
    (key: string, borderRadius: number = TOGGLE_BORDER_RADIUS) =>
      (event: LayoutChangeEvent) => {
        const { x, y, width, height } = event.nativeEvent.layout;
        const next: MaskedHole = {
          x,
          y,
          width,
          height,
          borderRadius,
        };
        setHoleMap((prev) => {
          const prevHole = prev[key];
          if (prevHole && areHolesEqual(prevHole, next)) {
            return prev;
          }
          return { ...prev, [key]: next };
        });
      },
    []
  );

  const holes = React.useMemo(() => Object.values(holeMap), [holeMap]);
  const maxHoleExtent = React.useMemo(() => {
    if (!holes.length) {
      return 0;
    }
    return Math.max(...holes.map((hole) => hole.x + hole.width));
  }, [holes]);
  const overscrollMargin = Math.max(inset, viewportWidth);
  const maskWidth = Math.max(viewportWidth, maxHoleExtent + overscrollMargin * 2);
  const maskHeight = rowHeight > 0 ? rowHeight + TOGGLE_STACK_GAP + 1 : 0;
  const maskTopOffset = rowHeight > 0 ? -1 : 0;

  const maskAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));
  const maskedHoles = React.useMemo(
    () =>
      holes.map((hole) => ({
        x: hole.x + inset + overscrollMargin,
        y: hole.y + 1,
        width: hole.width,
        height: hole.height,
        borderRadius: (hole.borderRadius ?? TOGGLE_BORDER_RADIUS) + HOLE_RADIUS_BOOST,
      })),
    [holes, inset, overscrollMargin]
  );
  const highlightAnimatedStyle = useAnimatedStyle(() => ({
    opacity: segmentLayoutReady.value,
    transform: [
      {
        translateX: interpolate(
          segmentSelectionProgress.value,
          [0, 1],
          [restaurantSegmentX.value, dishesSegmentX.value]
        ),
      },
    ],
    width: interpolate(
      segmentSelectionProgress.value,
      [0, 1],
      [restaurantSegmentWidth.value, dishesSegmentWidth.value]
    ),
  }));
  const restaurantsLabelLightStyle = useAnimatedStyle(() => ({
    opacity: 1 - segmentSelectionProgress.value,
  }));
  const restaurantsLabelDarkStyle = useAnimatedStyle(() => ({
    opacity: segmentSelectionProgress.value,
  }));
  const dishesLabelLightStyle = useAnimatedStyle(() => ({
    opacity: segmentSelectionProgress.value,
  }));
  const dishesLabelDarkStyle = useAnimatedStyle(() => ({
    opacity: 1 - segmentSelectionProgress.value,
  }));

  React.useEffect(() => {
    if (!hasSyncedFromExternalTabRef.current) {
      interactionTabRef.current = activeTab;
      animateSegmentSelection(activeTab, false);
      hasSyncedFromExternalTabRef.current = true;
      return;
    }
    if (activeTab === interactionTabRef.current) {
      return;
    }
    interactionTabRef.current = activeTab;
    animateSegmentSelection(activeTab, segmentLayoutReady.value > 0);
  }, [activeTab, animateSegmentSelection, segmentLayoutReady]);

  const scheduleSegmentToggleCommit = React.useCallback(
    (next: SegmentValue) => {
      if (next === interactionTabRef.current) {
        return;
      }
      interactionTabRef.current = next;
      onTabChange(next);
    },
    [onTabChange]
  );
  const handleSegmentToggleAccessibility = React.useCallback(() => {
    const next = getNextSegmentValue(interactionTabRef.current);
    animateSegmentSelection(next, true);
    scheduleSegmentToggleCommit(next);
  }, [animateSegmentSelection, scheduleSegmentToggleCommit]);
  const segmentToggleTapGesture = React.useMemo(
    () =>
      Gesture.Tap()
        .shouldCancelWhenOutside(false)
        .onEnd((_event, success) => {
          if (!success) {
            return;
          }
          const currentProgress = segmentSelectionProgress.value;
          const nextTargetProgress = segmentTargetProgress.value === 0 ? 1 : 0;
          const durationMs = resolveSegmentTravelDurationMs(currentProgress, nextTargetProgress);
          segmentTargetProgress.value = nextTargetProgress;
          segmentSelectionProgress.value = withTiming(nextTargetProgress, {
            duration: durationMs,
            easing: SEGMENT_TRAVEL_EASING,
          });
          runOnJS(scheduleSegmentToggleCommit)(nextTargetProgress === 0 ? 'restaurants' : 'dishes');
        }),
    [scheduleSegmentToggleCommit, segmentSelectionProgress, segmentTargetProgress]
  );

  React.useEffect(() => {
    if (!onLayoutCacheChange) {
      return;
    }
    if (viewportWidth <= 0 || rowHeight <= 0) {
      return;
    }
    onLayoutCacheChange({
      viewportWidth,
      rowHeight,
      holeMap,
      segmentLayouts: { ...segmentLayoutsRef.current },
    });
  }, [holeMap, onLayoutCacheChange, rowHeight, segmentLayoutsVersion, viewportWidth]);

  return (
    <View style={styles.resultFiltersWrapper}>
      {!disableBlur && <FrostedGlassBackground />}
      <View style={styles.paddedWrapper}>
        <View
          style={styles.stripContainer}
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            setViewportWidth((prev) => (Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth));
          }}
        >
          <Reanimated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            directionalLockEnabled
            scrollEventThrottle={16}
            onScroll={onScroll}
            alwaysBounceHorizontal
            contentContainerStyle={[styles.filterButtonsContent, { paddingHorizontal: inset }]}
            style={styles.filterButtonsScroll}
          >
            <View
              style={styles.cutoutStrip}
              onLayout={(event) => {
                const nextHeight = event.nativeEvent.layout.height;
                setRowHeight((prev) => (Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight));
              }}
            >
              <View style={styles.toggleRow}>
                <Pressable
                  onLayout={registerHole('toggle-rank')}
                  onPress={onToggleRankSelector}
                  accessibilityRole="button"
                  accessibilityLabel="Select rank mode"
                  accessibilityState={{
                    expanded: isRankSelectorVisible,
                    selected: rankButtonActive,
                  }}
                  style={[
                    styles.rankButton,
                    rankButtonActive && [styles.rankButtonActive, { backgroundColor: accentColor }],
                  ]}
                >
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[
                      styles.rankButtonLabel,
                      rankButtonActive && styles.rankButtonLabelActive,
                    ]}
                  >
                    {rankButtonLabel}
                  </Text>
                  {isRankSelectorVisible ? (
                    <ChevronUp
                      size={16}
                      strokeWidth={3}
                      color={rankButtonActive ? '#ffffff' : '#111827'}
                      style={styles.rankButtonChevron}
                    />
                  ) : (
                    <ChevronDown
                      size={16}
                      strokeWidth={3}
                      color={rankButtonActive ? '#ffffff' : '#111827'}
                      style={styles.rankButtonChevron}
                    />
                  )}
                </Pressable>
                <GestureDetector gesture={segmentToggleTapGesture}>
                  <View
                    style={styles.segmentedControl}
                    onLayout={registerHole('segment-group', TOGGLE_BORDER_RADIUS)}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Toggle results between restaurants and dishes"
                    accessibilityHint="Tap to switch result type"
                    onAccessibilityTap={handleSegmentToggleAccessibility}
                  >
                    <Reanimated.View
                      pointerEvents="none"
                      style={[
                        styles.segmentedHighlight,
                        { backgroundColor: accentColor },
                        highlightAnimatedStyle,
                      ]}
                    />
                    {SEGMENT_OPTIONS.map((option) => {
                      const lightLabelStyle =
                        option.value === 'restaurants'
                          ? restaurantsLabelLightStyle
                          : dishesLabelLightStyle;
                      const darkLabelStyle =
                        option.value === 'restaurants'
                          ? restaurantsLabelDarkStyle
                          : dishesLabelDarkStyle;
                      return (
                        <View
                          key={option.value}
                          onLayout={registerSegmentLayout(option.value)}
                          style={styles.segmentedOption}
                        >
                          <View style={styles.segmentedLabelStack}>
                            <Text
                              numberOfLines={1}
                              variant="caption"
                              weight="semibold"
                              style={[styles.segmentedLabel, styles.segmentedLabelMeasure]}
                            >
                              {option.label}
                            </Text>
                            <Reanimated.View
                              pointerEvents="none"
                              style={[styles.segmentedLabelLayer, darkLabelStyle]}
                            >
                              <Text
                                numberOfLines={1}
                                variant="caption"
                                weight="semibold"
                                style={styles.segmentedLabel}
                              >
                                {option.label}
                              </Text>
                            </Reanimated.View>
                            <Reanimated.View
                              pointerEvents="none"
                              style={[styles.segmentedLabelLayer, lightLabelStyle]}
                            >
                              <Text
                                numberOfLines={1}
                                variant="caption"
                                weight="semibold"
                                style={[styles.segmentedLabel, styles.segmentedLabelActive]}
                              >
                                {option.label}
                              </Text>
                            </Reanimated.View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </GestureDetector>
                <Pressable
                  onLayout={registerHole('toggle-open-now')}
                  onPress={onToggleOpenNow}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle open now results"
                  accessibilityState={{ selected: openNow }}
                  style={[
                    styles.openNowButton,
                    openNow && [styles.openNowButtonActive, { backgroundColor: accentColor }],
                  ]}
                >
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[styles.openNowText, openNow && styles.openNowTextActive]}
                  >
                    Open now
                  </Text>
                </Pressable>
                <Pressable
                  onLayout={registerHole('toggle-price')}
                  onPress={onTogglePriceSelector}
                  accessibilityRole="button"
                  accessibilityLabel="Select price filters"
                  accessibilityState={{
                    expanded: isPriceSelectorVisible,
                    selected: priceButtonActive,
                  }}
                  style={[
                    styles.priceButton,
                    priceButtonActive && [
                      styles.priceButtonActive,
                      { backgroundColor: accentColor },
                    ],
                  ]}
                >
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[
                      styles.priceButtonLabel,
                      priceButtonActive && styles.priceButtonLabelActive,
                    ]}
                  >
                    {priceButtonLabel}
                  </Text>
                  {isPriceSelectorVisible ? (
                    <ChevronUp
                      size={16}
                      strokeWidth={3}
                      color={priceButtonActive ? '#ffffff' : '#111827'}
                      style={styles.priceButtonChevron}
                    />
                  ) : (
                    <ChevronDown
                      size={16}
                      strokeWidth={3}
                      color={priceButtonActive ? '#ffffff' : '#111827'}
                      style={styles.priceButtonChevron}
                    />
                  )}
                </Pressable>
                <Pressable
                  onLayout={registerHole('toggle-votes')}
                  onPress={onToggleVotesFilter}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle 100 plus votes filter"
                  accessibilityState={{ selected: votesFilterActive }}
                  style={[
                    styles.votesButton,
                    votesFilterActive && [
                      styles.votesButtonActive,
                      { backgroundColor: accentColor },
                    ],
                  ]}
                >
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[styles.votesText, votesFilterActive && styles.votesTextActive]}
                  >
                    100+ votes
                  </Text>
                </Pressable>
              </View>
            </View>
          </Reanimated.ScrollView>

          {viewportWidth > 0 && rowHeight > 0 && maskedHoles.length > 0 ? (
            <MaskedHoleOverlay
              pointerEvents="none"
              holes={maskedHoles}
              backgroundColor="#ffffff"
              style={[
                styles.maskOverlay,
                {
                  width: maskWidth,
                  height: maskHeight,
                  top: maskTopOffset,
                  left: -overscrollMargin,
                },
                maskAnimatedStyle,
              ]}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
};

const buildToggleBaseStyle = (height: number) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  borderRadius: TOGGLE_BORDER_RADIUS,
  borderWidth: 0,
  borderColor: 'transparent',
  backgroundColor: 'transparent',
  height,
  paddingHorizontal: TOGGLE_HORIZONTAL_PADDING,
  paddingVertical: TOGGLE_VERTICAL_PADDING,
});

const styles = StyleSheet.create({
  resultFiltersWrapper: {
    marginTop: 0,
    marginBottom: 0,
    gap: 0,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  paddedWrapper: {
    width: '100%',
  },
  stripBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: STRIP_BACKGROUND_HEIGHT,
    backgroundColor: '#ffffff',
    zIndex: 1,
  },
  stripContainer: {
    position: 'relative',
    width: '100%',
  },
  filterButtonsScroll: {
    flexGrow: 0,
    width: '100%',
    backgroundColor: 'transparent',
  },
  filterButtonsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: TOGGLE_STACK_GAP,
    paddingVertical: 0,
  },
  cutoutStrip: {
    position: 'relative',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  toggleRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: TOGGLE_STACK_GAP,
    paddingVertical: 0,
  },
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 0,
    padding: 0,
    borderRadius: TOGGLE_BORDER_RADIUS,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    flexShrink: 0,
    overflow: 'hidden',
  },
  rankButton: {
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
    paddingRight: PRICE_TOGGLE_RIGHT_PADDING,
  },
  rankButtonActive: {},
  rankButtonLabel: {
    color: '#111827',
  },
  rankButtonLabelActive: {
    color: '#ffffff',
  },
  rankButtonChevron: {
    marginLeft: 6,
    marginTop: 0,
  },
  segmentedOption: {
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
    justifyContent: 'center',
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  segmentedHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: TOGGLE_BORDER_RADIUS,
  },
  segmentedLabel: {
    color: '#111827',
  },
  segmentedLabelActive: {
    color: '#ffffff',
  },
  segmentedLabelStack: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedLabelLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedLabelMeasure: {
    opacity: 0,
  },
  openNowButton: {
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
  },
  openNowButtonActive: {},
  openNowButtonDisabled: {
    opacity: 0.6,
  },
  openNowText: {
    color: '#111827',
  },
  openNowTextActive: {
    color: '#ffffff',
  },
  priceButton: {
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
    paddingRight: PRICE_TOGGLE_RIGHT_PADDING,
  },
  priceButtonActive: {},
  priceButtonDisabled: {
    opacity: 0.6,
  },
  priceButtonLabel: {
    color: '#111827',
  },
  priceButtonLabelActive: {
    color: '#ffffff',
  },
  priceButtonChevron: {
    marginLeft: 6,
    marginTop: 0,
  },
  votesButton: {
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
    flexDirection: 'row',
  },
  votesButtonActive: {},
  votesButtonDisabled: {
    opacity: 0.6,
  },
  votesText: {
    color: '#111827',
  },
  votesTextActive: {
    color: '#ffffff',
  },
  maskOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export type { SegmentValue };
export default React.memo(SearchFilters);
