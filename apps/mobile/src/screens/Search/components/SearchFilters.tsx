import React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { Feather } from '@expo/vector-icons';
import RangeSlider from 'rn-range-slider';
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';
import Reanimated, {
  useAnimatedProps,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import {
  CONTROL_HEIGHT,
  CONTROL_HORIZONTAL_PADDING,
  CONTROL_RADIUS,
  CONTROL_VERTICAL_PADDING,
} from '../constants/ui';

import { Text } from '../../../components';
import { type MaskedHole } from '../../../components/MaskedHoleOverlay';

const TOGGLE_HEIGHT = CONTROL_HEIGHT;
const TOGGLE_BORDER_RADIUS = CONTROL_RADIUS; // fixed radius as before
const TOGGLE_HORIZONTAL_PADDING = CONTROL_HORIZONTAL_PADDING;
const TOGGLE_VERTICAL_PADDING = CONTROL_VERTICAL_PADDING;
const TOGGLE_STACK_GAP = 8;
const TOGGLE_MIN_HEIGHT = TOGGLE_HEIGHT;
const PRICE_CUTOUT_RADIUS = CONTROL_RADIUS + 6;
const STRIP_BACKGROUND_HEIGHT = 14;
const PRICE_CUTOUT_HORIZONTAL_PADDING = CONTROL_HORIZONTAL_PADDING;
const PRICE_CUTOUT_VERTICAL_PADDING = CONTROL_VERTICAL_PADDING + 2;

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;

const HOLE_VERTICAL_PADDING = 0;
const HOLE_RADIUS_BOOST = 1;

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
  onPriceChangeFinish: (values: number[]) => void;
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
  onPriceChangeFinish,
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
  const [priceSelectorLayout, setPriceSelectorLayout] = React.useState({ width: 0, height: 0 });
  const maskIdRef = React.useRef<string>(
    `search-filter-mask-${Math.random().toString(36).slice(2, 8)}`
  );
  const maskId = maskIdRef.current;

  const inset = contentHorizontalPadding;
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const renderSliderThumb = React.useCallback(
    () => <View style={[styles.priceSliderThumb, styles.priceSliderThumbShadow]} />,
    []
  );
  const renderSliderRail = React.useCallback(() => <View style={styles.priceSliderRail} />, []);
  const renderSliderRailSelected = React.useCallback(
    () => <View style={[styles.priceSliderRailSelected, { backgroundColor: accentColor }]} />,
    [accentColor]
  );

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
            contentContainerStyle={[styles.filterButtonsContent, { paddingHorizontal: inset }]}
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
                            { backgroundColor: accentColor, shadowColor: accentColor },
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
                    openNow && [
                      styles.openNowButtonActive,
                      { backgroundColor: accentColor, shadowColor: accentColor },
                    ],
                  ]}
                >
                  <Feather
                    name="clock"
                    size={14}
                    color={openNow ? '#ffffff' : '#111827'}
                    style={styles.openNowIcon}
                  />
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
                      { backgroundColor: accentColor, shadowColor: accentColor },
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
                      { backgroundColor: accentColor, shadowColor: accentColor },
                    ],
                  ]}
                >
                  <Feather
                    name="thumbs-up"
                    size={14}
                    color={votesFilterActive ? '#ffffff' : '#111827'}
                    style={styles.votesIcon}
                  />
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

          {viewportWidth > 0 && rowHeight > 0 ? (
            <MaskedView
              pointerEvents="none"
              style={[
                styles.maskOverlay,
                { width: maskWidth, height: maskHeight, top: maskTopOffset },
              ]}
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
                          const radiiBase =
                            hole.cornerRadii ?? normalizeCornerRadii(hole.borderRadius);
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

        <View style={styles.priceGapFiller} pointerEvents="none" />

        {isPriceSelectorVisible ? (
          <View style={styles.priceSelectorWrapper}>
            <View style={styles.priceSelectorSpacer} pointerEvents="none" />
            <View
              style={styles.priceSelectorCutoutWrapper}
              onLayout={({ nativeEvent: { layout } }) =>
                setPriceSelectorLayout({ width: layout.width, height: layout.height })
              }
            >
              {priceSelectorLayout.width > 0 && priceSelectorLayout.height > 0 ? (
                <MaskedView
                  pointerEvents="none"
                  style={[
                    styles.priceSelectorMaskOverlay,
                    {
                      width: priceSelectorLayout.width,
                      height: priceSelectorLayout.height,
                      top: 0,
                    },
                  ]}
                  maskElement={
                    <Svg width={priceSelectorLayout.width} height={priceSelectorLayout.height}>
                      <Defs>
                        <Mask
                          id="price-selector-mask"
                          x="0"
                          y="0"
                          width={priceSelectorLayout.width}
                          height={priceSelectorLayout.height}
                          maskUnits="userSpaceOnUse"
                          maskContentUnits="userSpaceOnUse"
                        >
                          <Rect
                            x={0}
                            y={0}
                            width={priceSelectorLayout.width}
                            height={priceSelectorLayout.height}
                            fill="white"
                          />
                          <Rect
                            x={contentHorizontalPadding}
                            y={0}
                            width={Math.max(
                              priceSelectorLayout.width - contentHorizontalPadding * 2,
                              0
                            )}
                            height={priceSelectorLayout.height}
                            rx={PRICE_CUTOUT_RADIUS}
                            ry={PRICE_CUTOUT_RADIUS}
                            fill="black"
                          />
                        </Mask>
                      </Defs>
                      <Rect
                        x={0}
                        y={0}
                        width={priceSelectorLayout.width}
                        height={priceSelectorLayout.height}
                        fill="white"
                        mask="url(#price-selector-mask)"
                      />
                    </Svg>
                  }
                >
                  <View style={styles.priceSelectorMaskFill} pointerEvents="none" />
                </MaskedView>
              ) : null}
              <View style={[styles.priceSelector, { marginHorizontal: contentHorizontalPadding }]}>
                <View style={styles.priceSelectorHeader}>
                  <View>
                    <Text variant="caption" style={styles.priceFilterLabel}>
                      Price per person
                    </Text>
                    <View style={styles.priceSelectorValuePill}>
                      <Text style={styles.priceSelectorValue}>{pendingPriceSummary}</Text>
                    </View>
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
                <View
                  style={[
                    styles.priceSliderWrapper,
                    {
                      paddingHorizontal: contentHorizontalPadding + 10,
                      maxWidth: 320,
                      alignSelf: 'center',
                    },
                  ]}
                  onLayout={onPriceSliderLayout}
                >
                  {priceSliderWidth > 0 ? (
                    <RangeSlider
                      style={[styles.priceSlider, { width: priceSliderWidth }]}
                      min={Math.min(...priceLevelValues)}
                      max={Math.max(...priceLevelValues)}
                      step={1}
                      low={pendingPriceRange[0]}
                      high={pendingPriceRange[1]}
                      renderThumb={renderSliderThumb}
                      renderRail={renderSliderRail}
                      renderRailSelected={renderSliderRailSelected}
                      onValueChanged={(low: number, high: number, fromUser?: boolean) => {
                        const nextLow = Math.min(high, Math.max(low, priceLevelValues[0]));
                        const nextHigh = Math.max(
                          nextLow,
                          Math.min(high, priceLevelValues.at(-1)!)
                        );
                        if (nextLow === pendingPriceRange[0] && nextHigh === pendingPriceRange[1]) {
                          return;
                        }
                        onPriceChange([nextLow, nextHigh]);
                        if (fromUser !== false) {
                          onPriceChangeFinish([nextLow, nextHigh]);
                        }
                      }}
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
            </View>
          </View>
        ) : null}
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
    columnGap: TOGGLE_STACK_GAP,
    padding: 0,
    borderRadius: TOGGLE_BORDER_RADIUS + 3,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  segmentedOption: {
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
    justifyContent: 'center',
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  segmentedOptionActive: {
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
  openNowIcon: {
    marginRight: 6,
  },
  openNowText: {
    color: '#111827',
  },
  openNowTextActive: {
    color: '#ffffff',
  },
  priceButton: {
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
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
  priceSelectorWrapper: {
    marginTop: 0,
    position: 'relative',
  },
  priceSelectorSpacer: {
    height: 0,
  },
  priceSelectorCutoutWrapper: {
    position: 'relative',
    zIndex: 1,
  },
  priceGapFiller: {
    height: TOGGLE_STACK_GAP,
    backgroundColor: '#ffffff',
  },
  priceSelectorMaskOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  priceSelectorMaskFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
  priceSelector: {
    borderRadius: PRICE_CUTOUT_RADIUS,
    borderWidth: 0,
    paddingHorizontal: PRICE_CUTOUT_HORIZONTAL_PADDING + 6,
    paddingVertical: PRICE_CUTOUT_VERTICAL_PADDING + 8,
    backgroundColor: 'transparent',
  },
  priceSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  priceFilterLabel: {
    color: '#1f2937',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 2,
  },
  priceSelectorValuePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  priceSelectorValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  priceDoneButton: {
    height: CONTROL_HEIGHT,
    borderRadius: CONTROL_RADIUS,
    paddingHorizontal: CONTROL_HORIZONTAL_PADDING,
    paddingVertical: CONTROL_VERTICAL_PADDING,
    backgroundColor: '#1f2937',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceDoneButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  priceSliderWrapper: {
    width: '100%',
    paddingHorizontal: 4,
    marginTop: 12,
    alignItems: 'center',
  },
  priceSlider: {
    height: 40,
  },
  priceSliderRail: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e6ecf3',
  },
  priceSliderRailSelected: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#9fb1c5',
  },
  priceSliderThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1f2937',
    backgroundColor: '#ffffff',
  },
  priceSliderThumbShadow: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
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
    ...buildToggleBaseStyle(TOGGLE_MIN_HEIGHT),
    flexDirection: 'row',
  },
  votesButtonActive: {},
  votesButtonDisabled: {
    opacity: 0.6,
  },
  votesIcon: {
    marginRight: 6,
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
