import React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { Feather } from '@expo/vector-icons';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';
import Reanimated, { useAnimatedProps, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { Text } from '../../../components';
import { type MaskedHole } from '../../../components/MaskedHoleOverlay';

const TOGGLE_BORDER_RADIUS = 8;
const TOGGLE_HORIZONTAL_PADDING = 7;
const TOGGLE_VERTICAL_PADDING = 5;
const TOGGLE_STACK_GAP = 8;

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;

const HOLE_VERTICAL_PADDING = 0;
const HOLE_RADIUS_BOOST = 1.5;

type CornerRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

type ExtendedHole = MaskedHole & { cornerRadii?: CornerRadii };

const areCornerRadiiEqual = (prev?: CornerRadii, next?: CornerRadii): boolean => {
  if (!prev || !next) {
    return false;
  }
  const closeEnough = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return (
    closeEnough(prev.topLeft, next.topLeft) &&
    closeEnough(prev.topRight, next.topRight) &&
    closeEnough(prev.bottomRight, next.bottomRight) &&
    closeEnough(prev.bottomLeft, next.bottomLeft)
  );
};

const areHolesEqual = (prev: ExtendedHole | undefined, next: ExtendedHole): boolean => {
  if (!prev) {
    return false;
  }
  const closeEnough = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return (
    closeEnough(prev.x, next.x) &&
    closeEnough(prev.y, next.y) &&
    closeEnough(prev.width, next.width) &&
    closeEnough(prev.height, next.height) &&
    (prev.borderRadius ?? 0) === (next.borderRadius ?? 0) &&
    areCornerRadiiEqual(prev.cornerRadii, next.cornerRadii)
  );
};

const normalizeCornerRadii = (value?: number | Partial<CornerRadii>): CornerRadii => {
  const fallback = TOGGLE_BORDER_RADIUS;
  if (typeof value === 'number') {
    return {
      topLeft: value,
      topRight: value,
      bottomRight: value,
      bottomLeft: value,
    };
  }
  return {
    topLeft: value?.topLeft ?? fallback,
    topRight: value?.topRight ?? fallback,
    bottomRight: value?.bottomRight ?? fallback,
    bottomLeft: value?.bottomLeft ?? fallback,
  };
};

const buildRoundedRectPath = (
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii
): string => {
  const tl = Math.min(radii.topLeft, width / 2, height / 2);
  const tr = Math.min(radii.topRight, width / 2, height / 2);
  const br = Math.min(radii.bottomRight, width / 2, height / 2);
  const bl = Math.min(radii.bottomLeft, width / 2, height / 2);

  return [
    `M${x + tl},${y}`,
    `H${x + width - tr}`,
    `Q${x + width},${y} ${x + width},${y + tr}`,
    `V${y + height - br}`,
    `Q${x + width},${y + height} ${x + width - br},${y + height}`,
    `H${x + bl}`,
    `Q${x},${y + height} ${x},${y + height - bl}`,
    `V${y + tl}`,
    `Q${x},${y} ${x + tl},${y}`,
    'Z',
  ].join(' ');
};

type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];

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
  pendingPriceRange: [number, number];
  onPriceChange: (values: number[]) => void;
  onPriceDone: () => void;
  onPriceSliderLayout: (event: LayoutChangeEvent) => void;
  priceSliderWidth: number;
  priceLevelValues: number[];
  priceTickLabels: Record<number, string>;
  pendingPriceSummary: string;
  contentHorizontalPadding: number;
  accentColor: string;
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
  pendingPriceRange,
  onPriceChange,
  onPriceDone,
  onPriceSliderLayout,
  priceSliderWidth,
  priceLevelValues,
  priceTickLabels,
  pendingPriceSummary,
  contentHorizontalPadding,
  accentColor,
}) => {
  const [viewportWidth, setViewportWidth] = React.useState(0);
  const [rowHeight, setRowHeight] = React.useState(0);
  const [holeMap, setHoleMap] = React.useState<Record<string, ExtendedHole>>({});
  const maskIdRef = React.useRef<string>(
    `search-filter-mask-${Math.random().toString(36).slice(2, 8)}`
  );
  const maskId = maskIdRef.current;

  const inset = contentHorizontalPadding;
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const registerHole = React.useCallback(
    (key: string, borderRadius: number | Partial<CornerRadii> = TOGGLE_BORDER_RADIUS) =>
      (event: LayoutChangeEvent) => {
        const { x, y, width, height } = event.nativeEvent.layout;
        const cornerRadii = normalizeCornerRadii(borderRadius);
        const next: ExtendedHole = {
          x,
          y,
          width,
          height,
          borderRadius: typeof borderRadius === 'number' ? borderRadius : undefined,
          cornerRadii,
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
  const overscrollMargin = inset;
  const maskWidth = Math.max(viewportWidth, maxHoleExtent + overscrollMargin * 2);
  const maskHeight = rowHeight > 0 ? rowHeight + 2 : 0;
  const maskTopOffset = rowHeight > 0 ? -1 : 0;

  const holesTranslateProps = useAnimatedProps(() => ({
    transform: [{ translateX: -scrollX.value }],
  }));
  const AnimatedG = Reanimated.createAnimatedComponent(G);

  return (
    <View style={styles.resultFiltersWrapper}>
      <View style={styles.paddedWrapper}>
        <View
          style={styles.stripContainer}
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        >
          <Reanimated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            bounces
            alwaysBounceHorizontal
            contentContainerStyle={[
              styles.filterButtonsContent,
              { paddingHorizontal: inset },
            ]}
            style={styles.filterButtonsScroll}
          >
            <View
              style={styles.cutoutStrip}
              onLayout={(event) => setRowHeight(event.nativeEvent.layout.height)}
            >
              <View style={styles.toggleRow}>
                <View style={styles.segmentedControl}>
                  {SEGMENT_OPTIONS.map((option) => {
                    const selected = activeTab === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onLayout={registerHole(`segment-${option.value}`, TOGGLE_BORDER_RADIUS)}
                        style={[
                          styles.segmentedOption,
                          selected && [
                            styles.segmentedOptionActive,
                            { borderColor: accentColor, shadowColor: accentColor },
                          ],
                        ]}
                        onPress={() => onTabChange(option.value)}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${option.label.toLowerCase()}`}
                        accessibilityState={{ selected }}
                      >
                        <Text
                          numberOfLines={1}
                          variant="caption"
                          weight="semibold"
                          style={[styles.segmentedLabel, selected && { color: accentColor }]}
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
                    openNow && [
                      styles.openNowButtonActive,
                      { borderColor: accentColor, shadowColor: accentColor },
                    ],
                  ]}
                >
                  <Feather
                    name="clock"
                    size={14}
                    color={openNow ? accentColor : '#475569'}
                    style={styles.openNowIcon}
                  />
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[styles.openNowText, openNow && { color: accentColor }]}
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
                      { borderColor: accentColor, shadowColor: accentColor },
                    ],
                  ]}
                >
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[styles.priceButtonLabel, priceButtonActive && { color: accentColor }]}
                  >
                    {priceButtonLabel}
                  </Text>
                  <Feather
                    name={isPriceSelectorVisible ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={priceButtonActive ? accentColor : '#475569'}
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
                      { borderColor: accentColor, shadowColor: accentColor },
                    ],
                  ]}
                >
                  <Feather
                    name="thumbs-up"
                    size={14}
                    color={votesFilterActive ? accentColor : '#475569'}
                    style={styles.votesIcon}
                  />
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[styles.votesText, votesFilterActive && { color: accentColor }]}
                  >
                    100+ votes
                  </Text>
                </Pressable>
              </View>
            </View>
          </Reanimated.ScrollView>

          {viewportWidth > 0 && rowHeight > 0 ? (
          <MaskedView
            pointerEvents="none"
            style={[styles.maskOverlay, { width: maskWidth, height: maskHeight, top: maskTopOffset }]}
            maskElement={
              <Svg width={maskWidth} height={maskHeight}>
                <Defs>
                  <Mask
                    id={maskId}
                    x="0"
                    y="0"
                    width={maskWidth}
                    height={maskHeight}
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                  >
                    <Rect x={0} y={0} width={maskWidth} height={maskHeight} fill="white" />
                    <AnimatedG animatedProps={holesTranslateProps}>
                      {holes.map((hole, index) => {
                        const radiiBase = hole.cornerRadii ?? normalizeCornerRadii(hole.borderRadius);
                        const radii = {
                          topLeft: radiiBase.topLeft + HOLE_RADIUS_BOOST,
                          topRight: radiiBase.topRight + HOLE_RADIUS_BOOST,
                          bottomRight: radiiBase.bottomRight + HOLE_RADIUS_BOOST,
                          bottomLeft: radiiBase.bottomLeft + HOLE_RADIUS_BOOST,
                        };
                        const y = hole.y + 1;
                        const height = hole.height;
                        return (
                          <Path
                            key={index}
                            d={buildRoundedRectPath(hole.x + inset, y, hole.width, height, radii)}
                            fill="black"
                          />
                        );
                      })}
                    </AnimatedG>
                  </Mask>
                </Defs>
                <Rect
                  x={0}
                  y={0}
                  width={maskWidth}
                  height={maskHeight}
                  fill="white"
                  mask={`url(#${maskId})`}
                />
              </Svg>
            }
          >
            <View style={styles.whiteFill} pointerEvents="none" />
          </MaskedView>
        ) : null}
        </View>

        {isPriceSelectorVisible ? (
          <View style={styles.priceSelector}>
            <View style={styles.priceSelectorHeader}>
              <View>
                <Text variant="caption" style={styles.priceFilterLabel}>
                  Price per person
                </Text>
                <Text style={styles.priceSelectorValue}>{pendingPriceSummary}</Text>
              </View>
              <Pressable
                onPress={onPriceDone}
                accessibilityRole="button"
                accessibilityLabel="Apply price filters"
                style={[styles.priceDoneButton, { backgroundColor: accentColor }]}
              >
                <Text style={styles.priceDoneButtonText}>Done</Text>
              </Pressable>
            </View>
            <View style={styles.priceSliderWrapper} onLayout={onPriceSliderLayout}>
              {priceSliderWidth > 0 ? (
                <MultiSlider
                  min={Math.min(...priceLevelValues)}
                  max={Math.max(...priceLevelValues)}
                  step={1}
                  values={pendingPriceRange}
                  sliderLength={priceSliderWidth}
                  onValuesChange={onPriceChange}
                  allowOverlap={false}
                  snapped
                  markerStyle={styles.priceSliderMarker}
                  pressedMarkerStyle={styles.priceSliderMarkerActive}
                  selectedStyle={[styles.priceSliderSelected, { backgroundColor: accentColor }]}
                  unselectedStyle={styles.priceSliderUnselected}
                  containerStyle={styles.priceSlider}
                  trackStyle={styles.priceSliderTrack}
                />
              ) : null}
            </View>
            <View style={styles.priceSliderLabelsRow}>
              {priceLevelValues.map((value) => (
                <Text key={value} style={styles.priceSliderLabel}>
                  {priceTickLabels[value]}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const toggleContentPaddingStyle = {
  paddingHorizontal: TOGGLE_HORIZONTAL_PADDING,
  paddingVertical: TOGGLE_VERTICAL_PADDING,
};

const toggleBaseStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: TOGGLE_BORDER_RADIUS,
  borderWidth: 1,
  borderColor: '#e2e8f0',
  backgroundColor: 'transparent',
  ...toggleContentPaddingStyle,
};

const styles = StyleSheet.create({
  resultFiltersWrapper: {
    marginTop: 0,
    marginBottom: 0,
    gap: 0,
    backgroundColor: 'transparent',
  },
  paddedWrapper: {
    width: '100%',
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
    columnGap: TOGGLE_STACK_GAP,
    padding: 0,
    borderRadius: TOGGLE_BORDER_RADIUS + 3,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  segmentedOption: {
    ...toggleBaseStyle,
    justifyContent: 'center',
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  segmentedOptionActive: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  segmentedLabel: {
    color: '#1f2937',
  },
  openNowButton: {
    ...toggleBaseStyle,
  },
  openNowButtonActive: {
    borderRadius: TOGGLE_BORDER_RADIUS,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  openNowButtonDisabled: {
    opacity: 0.6,
  },
  openNowIcon: {
    marginRight: 6,
  },
  openNowText: {
    color: '#475569',
  },
  priceButton: {
    ...toggleBaseStyle,
    paddingVertical: TOGGLE_VERTICAL_PADDING,
  },
  priceButtonActive: {
    borderRadius: TOGGLE_BORDER_RADIUS,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 2,
  },
  priceButtonDisabled: {
    opacity: 0.6,
  },
  priceButtonLabel: {
    color: '#475569',
  },
  priceButtonChevron: {
    marginLeft: 6,
    marginTop: 0,
  },
  priceSelector: {
    marginTop: TOGGLE_STACK_GAP,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: TOGGLE_STACK_GAP,
    backgroundColor: '#ffffff',
  },
  priceSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priceFilterLabel: {
    color: '#475569',
  },
  priceSelectorValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  priceDoneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FB923C',
  },
  priceDoneButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  priceSliderWrapper: {
    width: '100%',
    paddingHorizontal: 4,
  },
  priceSlider: {
    height: 30,
  },
  priceSliderTrack: {
    height: 6,
    borderRadius: 999,
  },
  priceSliderSelected: {
    backgroundColor: '#FB923C',
  },
  priceSliderUnselected: {
    backgroundColor: '#e2e8f0',
  },
  priceSliderMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FB923C',
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  priceSliderMarkerActive: {
    backgroundColor: '#fff7ed',
  },
  priceSliderLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  priceSliderLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  votesButton: {
    ...toggleBaseStyle,
    flexDirection: 'row',
  },
  votesButtonActive: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  votesButtonDisabled: {
    opacity: 0.6,
  },
  votesIcon: {
    marginRight: 6,
  },
  votesText: {
    color: '#475569',
  },
  maskOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  maskFill: {
    ...StyleSheet.absoluteFillObject,
  },
  whiteFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
});

export type { SegmentValue };
export default SearchFilters;
