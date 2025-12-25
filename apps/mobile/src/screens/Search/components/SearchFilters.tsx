import React from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { Feather } from '@expo/vector-icons';
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
const TOGGLE_HORIZONTAL_PADDING = CONTROL_HORIZONTAL_PADDING + 4;
const TOGGLE_VERTICAL_PADDING = CONTROL_VERTICAL_PADDING;
const TOGGLE_STACK_GAP = 7;
const TOGGLE_MIN_HEIGHT = TOGGLE_HEIGHT;
const PRICE_TOGGLE_RIGHT_PADDING = Math.max(0, TOGGLE_HORIZONTAL_PADDING - 3);
const STRIP_BACKGROUND_HEIGHT = 14;

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;

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
  const maskHeight = rowHeight > 0 ? rowHeight + TOGGLE_STACK_GAP + 1 : 0;
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
            scrollEnabled={!isPriceSelectorVisible}
            bounces={!isPriceSelectorVisible}
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
                    openNow && [
                      styles.openNowButtonActive,
                      { backgroundColor: accentColor, shadowColor: accentColor },
                    ],
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
                      { backgroundColor: accentColor, shadowColor: accentColor },
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
                      { backgroundColor: accentColor, shadowColor: accentColor },
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
