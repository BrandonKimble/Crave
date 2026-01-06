import React from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Reanimated, {
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { WithSpringConfig } from 'react-native-reanimated';
import {
  CONTROL_HEIGHT,
  CONTROL_HORIZONTAL_PADDING,
  CONTROL_RADIUS,
  CONTROL_VERTICAL_PADDING,
} from '../constants/ui';

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

const SEGMENT_HIGHLIGHT_SPRING: WithSpringConfig = {
  damping: 28,
  stiffness: 220,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.2,
  restSpeedThreshold: 0.2,
};
const SEGMENT_HIGHLIGHT_WIDTH_SPRING: WithSpringConfig = {
  ...SEGMENT_HIGHLIGHT_SPRING,
  overshootClamping: true,
};
const SEGMENT_HIGHLIGHT_STRETCH_MS = 95;
const SEGMENT_HIGHLIGHT_STRETCH_EASING = Easing.out(Easing.cubic);
const SEGMENT_HIGHLIGHT_STRETCH_OVERSHOOT_PX = 6;

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;

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
};

type SearchFiltersProps = {
  activeTab: SegmentValue;
  onTabChange: (value: SegmentValue) => void;
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
  const segmentLayoutsRef = React.useRef<Partial<Record<SegmentValue, LayoutRectangle>>>({});
  const highlightReadyRef = React.useRef(false);

  const inset = contentHorizontalPadding;
  const scrollX = useSharedValue(0);
  const highlightTranslateX = useSharedValue(0);
  const highlightWidth = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const updateSegmentHighlight = React.useCallback(
    (value: SegmentValue, animated: boolean): boolean => {
      const layout = segmentLayoutsRef.current[value];
      if (!layout) {
        return false;
      }
      if (animated) {
        const currentX = highlightTranslateX.value;
        const currentWidth = highlightWidth.value;

        if (currentWidth <= 0 || Math.abs(currentX - layout.x) < 0.5) {
          highlightTranslateX.value = withSpring(layout.x, SEGMENT_HIGHLIGHT_SPRING);
          highlightWidth.value = withSpring(layout.width, SEGMENT_HIGHLIGHT_WIDTH_SPRING);
          return true;
        }

        const currentRight = currentX + currentWidth;
        const targetRight = layout.x + layout.width;
        const movingRight = layout.x > currentX;
        const stretchX = movingRight ? currentX : layout.x;
        const stretchWidth = movingRight
          ? targetRight - currentX + SEGMENT_HIGHLIGHT_STRETCH_OVERSHOOT_PX
          : currentRight - layout.x + SEGMENT_HIGHLIGHT_STRETCH_OVERSHOOT_PX;

        highlightTranslateX.value = withSequence(
          withTiming(stretchX, {
            duration: SEGMENT_HIGHLIGHT_STRETCH_MS,
            easing: SEGMENT_HIGHLIGHT_STRETCH_EASING,
          }),
          withSpring(layout.x, SEGMENT_HIGHLIGHT_SPRING)
        );
        highlightWidth.value = withSequence(
          withTiming(Math.max(layout.width, stretchWidth), {
            duration: SEGMENT_HIGHLIGHT_STRETCH_MS,
            easing: SEGMENT_HIGHLIGHT_STRETCH_EASING,
          }),
          withSpring(layout.width, SEGMENT_HIGHLIGHT_WIDTH_SPRING)
        );
        return true;
      }
      highlightTranslateX.value = layout.x;
      highlightWidth.value = layout.width;
      return true;
    },
    [highlightTranslateX, highlightWidth]
  );

  const registerSegmentLayout = React.useCallback(
    (value: SegmentValue) => (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      const prev = segmentLayoutsRef.current[value];
      if (prev && areLayoutsEqual(prev, layout)) {
        return;
      }
      segmentLayoutsRef.current[value] = layout;
      if (value === activeTab) {
        const didUpdate = updateSegmentHighlight(value, highlightReadyRef.current);
        if (didUpdate && !highlightReadyRef.current) {
          highlightReadyRef.current = true;
        }
      }
    },
    [activeTab, updateSegmentHighlight]
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
    opacity: highlightWidth.value > 0 ? 1 : 0,
    transform: [{ translateX: highlightTranslateX.value }],
    width: highlightWidth.value,
  }));

  React.useEffect(() => {
    const didUpdate = updateSegmentHighlight(activeTab, highlightReadyRef.current);
    if (didUpdate && !highlightReadyRef.current) {
      highlightReadyRef.current = true;
    }
  }, [activeTab, updateSegmentHighlight]);

  React.useEffect(() => {
    if (!onLayoutCacheChange) {
      return;
    }
    if (viewportWidth <= 0 || rowHeight <= 0) {
      return;
    }
    onLayoutCacheChange({ viewportWidth, rowHeight, holeMap });
  }, [holeMap, onLayoutCacheChange, rowHeight, viewportWidth]);

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
            scrollEnabled={!isPriceSelectorVisible}
            bounces={!isPriceSelectorVisible}
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
                <View
                  style={styles.segmentedControl}
                  onLayout={registerHole('segment-group', TOGGLE_BORDER_RADIUS)}
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
                    const selected = activeTab === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onLayout={registerSegmentLayout(option.value)}
                        style={styles.segmentedOption}
                        onPress={() => onTabChange(option.value)}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${option.label.toLowerCase()}`}
                        accessibilityState={{ selected }}
                      >
                        <Text
                          numberOfLines={1}
                          variant="body"
                          weight="semibold"
                          style={[styles.segmentedLabel, selected && styles.segmentedLabelActive]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
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
                    variant="body"
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
                    variant="body"
                    weight="semibold"
                    style={[
                      styles.priceButtonLabel,
                      priceButtonActive && styles.priceButtonLabelActive,
                    ]}
                  >
                    {priceButtonLabel}
                  </Text>
                  <Feather
                    name={isPriceSelectorVisible ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={priceButtonActive ? '#ffffff' : '#111827'}
                    style={styles.priceButtonChevron}
                  />
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
                    variant="body"
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
  flexDirection: 'row',
  alignItems: 'center',
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

export type { SegmentValue, SearchFiltersLayoutCache };
export default React.memo(SearchFilters);
