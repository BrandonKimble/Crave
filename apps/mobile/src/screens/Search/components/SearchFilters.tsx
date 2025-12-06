import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

import { Text } from '../../../components';

const TOGGLE_BORDER_RADIUS = 8;
const TOGGLE_HORIZONTAL_PADDING = 7;
const TOGGLE_VERTICAL_PADDING = 5;
const TOGGLE_STACK_GAP = 8;

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;

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
  return (
    <View style={styles.resultFiltersWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterButtonsContent}
        style={[
          styles.filterButtonsScroll,
          {
            marginHorizontal: -contentHorizontalPadding,
            paddingHorizontal: contentHorizontalPadding,
          },
        ]}
      >
        <View style={styles.inlineSegmentWrapper}>
          <View style={styles.segmentedControl}>
            {SEGMENT_OPTIONS.map((option) => {
              const selected = activeTab === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.segmentedOption,
                    selected && [
                      styles.segmentedOptionActive,
                      { borderColor: accentColor, backgroundColor: accentColor },
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
        </View>
        <Pressable
          onPress={onToggleOpenNow}
          accessibilityRole="button"
          accessibilityLabel="Toggle open now results"
          accessibilityState={{ selected: openNow }}
          style={[
            styles.openNowButton,
            openNow && {
              ...styles.openNowButtonActive,
              borderColor: accentColor,
              backgroundColor: accentColor,
            },
          ]}
        >
          <Feather
            name="clock"
            size={14}
            color={openNow ? '#ffffff' : '#475569'}
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
            { borderColor: accentColor, backgroundColor: accentColor },
            ],
          ]}
        >
          <Text
            variant="caption"
            weight="semibold"
            style={[styles.priceButtonLabel, priceButtonActive && styles.priceButtonLabelActive]}
          >
            {priceButtonLabel}
          </Text>
          <Feather
            name={isPriceSelectorVisible ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={priceButtonActive ? '#ffffff' : '#475569'}
            style={styles.priceButtonChevron}
          />
        </Pressable>
        <Pressable
          onPress={onToggleVotesFilter}
          accessibilityRole="button"
          accessibilityLabel="Toggle 100 plus votes filter"
          accessibilityState={{ selected: votesFilterActive }}
          style={[
            styles.votesButton,
            votesFilterActive && [
              styles.votesButtonActive,
              { borderColor: accentColor, backgroundColor: accentColor },
            ],
          ]}
        >
          <Feather
            name="thumbs-up"
            size={14}
            color={votesFilterActive ? '#ffffff' : '#475569'}
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
      </ScrollView>
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
  borderColor: '#cbd5e1',
  backgroundColor: '#ffffff',
  ...toggleContentPaddingStyle,
};

const styles = StyleSheet.create({
  resultFiltersWrapper: {
    marginTop: 0,
    marginBottom: 0,
    gap: 0,
  },
  filterButtonsScroll: {
    flexGrow: 0,
  },
  filterButtonsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: TOGGLE_STACK_GAP,
    paddingRight: 4,
  },
  inlineSegmentWrapper: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'flex-start',
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
    backgroundColor: '#FB923C',
    borderColor: '#FB923C',
  },
  segmentedLabel: {
    color: '#475569',
  },
  segmentedLabelActive: {
    color: '#ffffff',
  },
  openNowButton: {
    ...toggleBaseStyle,
  },
  openNowButtonActive: {
    borderRadius: TOGGLE_BORDER_RADIUS,
    borderColor: '#FB923C',
    backgroundColor: '#FB923C',
    shadowColor: '#FB923C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
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
  openNowTextActive: {
    color: '#ffffff',
  },
  priceButton: {
    ...toggleBaseStyle,
    paddingVertical: TOGGLE_VERTICAL_PADDING,
  },
  priceButtonActive: {
    borderRadius: TOGGLE_BORDER_RADIUS,
    backgroundColor: '#FB923C',
    borderColor: '#FB923C',
  },
  priceButtonDisabled: {
    opacity: 0.6,
  },
  priceButtonLabel: {
    color: '#475569',
  },
  priceButtonLabelActive: {
    color: '#ffffff',
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
    borderColor: '#FB923C',
    backgroundColor: '#FB923C',
    shadowColor: '#FB923C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
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
  votesTextActive: {
    color: '#ffffff',
  },
});

export type { SegmentValue };
export default SearchFilters;
