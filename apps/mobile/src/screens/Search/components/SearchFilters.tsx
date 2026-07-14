import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { CONTROL_HORIZONTAL_PADDING, CONTROL_RADIUS } from '../constants/ui';
import { SEGMENT_OPTIONS } from '../constants/search';

import { FilterChip } from '../../../components/FilterChip';
import { SegmentedToggle } from '../../../components/SegmentedToggle';
import { SelectorChip } from '../../../components/SelectorChip';
import { ToggleStrip } from '../../../toggles/ToggleStrip';
import type { ToggleStripCacheSeat } from '../../../toggles/toggle-strip-layout-cache';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';

// THE REFERENCE STRIP, AS A DECLARATION (leg 2 — plans/toggle-strip-rebuild-ledger.md).
// The results strip — the feel-checked reference every other strip must match — now
// renders through the strip ENGINE (`ToggleStrip`): band geometry, frost + cutouts,
// physics, and the layout+scrollX warm restore are all engine-owned. This file keeps
// only what is genuinely search's: the control declaration and the live runtime-bus
// chip-state read. The old shell/segment layout-cache join moved INTO the engine
// (SegmentedToggle self-registers over the strip's warm-restore context); the cache
// lives behind ONE seat owned by the search primitives runtime.

const TOGGLE_BORDER_RADIUS = CONTROL_RADIUS;
const TOGGLE_HORIZONTAL_PADDING = CONTROL_HORIZONTAL_PADDING + 4;
const PRICE_TOGGLE_RIGHT_PADDING = Math.max(0, TOGGLE_HORIZONTAL_PADDING - 3);

type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];

export type SearchFiltersProps = {
  // LIVE chip-state source. The rendered strip element rides the mounted-results snapshot
  // store (chrome-freeze), so its PROPS can be stale between data commits — the tab pill hid
  // this behind its internal press animation, but the plain chips (Open now, Rising, Include
  // similar, Price) visibly failed to flip color on press-up. The strip therefore reads its
  // display states straight from the runtime bus (the single writer the toggle setters flip
  // optimistically at press time); the same-named props remain as the first-render values.
  searchRuntimeBus: SearchRuntimeBus;
  activeTab: SegmentValue;
  onTabChange: (value: SegmentValue) => void;
  openNow: boolean;
  onToggleOpenNow: () => void;
  includeSimilarActive: boolean;
  onToggleIncludeSimilar: () => void;
  // metadata.similarAvailable from the committed page-1 response; the availability chip
  // renders when > 0 and the toggle is off, and is a REMOTE CONTROL for the toggle.
  similarAvailableCount: number;
  risingActive: boolean;
  /** Sort dropdown (toggle-strip primitive): opens the Best/Rising OptionSelectorSheet. */
  onToggleSortSelector: () => void;
  priceButtonLabel: string;
  priceButtonActive: boolean;
  onTogglePriceSelector: () => void;
  isPriceSelectorVisible: boolean;
  contentHorizontalPadding: number;
  accentColor: string;
  /** The surface's ONE warm-restore seat (layout + settled scrollX, engine-owned). */
  layoutCacheSeat?: ToggleStripCacheSeat;
};

const SearchFilters: React.FC<SearchFiltersProps> = ({
  searchRuntimeBus,
  activeTab,
  onTabChange,
  openNow,
  onToggleOpenNow,
  includeSimilarActive,
  onToggleIncludeSimilar,
  similarAvailableCount,
  risingActive,
  onToggleSortSelector,
  priceButtonLabel,
  priceButtonActive,
  onTogglePriceSelector,
  isPriceSelectorVisible,
  contentHorizontalPadding,
  accentColor,
  layoutCacheSeat,
}) => {
  const liveChipState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      // S4e: the chip strip renders DESIRED state — the tuple directly (tuple.tab IS the
      // old optimistic `pendingTabSwitchTab ?? activeTab` read, by the writer's invariant).
      activeTab: state.desiredTuple.tab as SegmentValue,
      openNow: state.desiredTuple.filterVariant.openNow,
      includeSimilarActive: state.desiredTuple.filterVariant.includeSimilar,
      similarAvailableCount: state.results?.metadata?.similarAvailable ?? 0,
      risingActive: state.desiredTuple.filterVariant.rising,
      priceButtonActive: state.priceButtonIsActive,
      priceButtonLabel: state.priceButtonLabelText,
      isPriceSelectorVisible: state.isPriceSelectorVisible,
      isSortSelectorVisible: state.isSortSelectorVisible,
    }),
    (left, right) =>
      left.activeTab === right.activeTab &&
      left.openNow === right.openNow &&
      left.includeSimilarActive === right.includeSimilarActive &&
      left.similarAvailableCount === right.similarAvailableCount &&
      left.risingActive === right.risingActive &&
      left.priceButtonActive === right.priceButtonActive &&
      left.priceButtonLabel === right.priceButtonLabel &&
      left.isPriceSelectorVisible === right.isPriceSelectorVisible &&
      left.isSortSelectorVisible === right.isSortSelectorVisible,
    [
      'desiredTuple',
      'results',
      'priceButtonIsActive',
      'priceButtonLabelText',
      'isPriceSelectorVisible',
      'isSortSelectorVisible',
    ] as const
  );
  const isSortSelectorVisible = liveChipState.isSortSelectorVisible;
  activeTab = liveChipState.activeTab;
  openNow = liveChipState.openNow;
  includeSimilarActive = liveChipState.includeSimilarActive;
  similarAvailableCount = liveChipState.similarAvailableCount;
  risingActive = liveChipState.risingActive;
  priceButtonActive = liveChipState.priceButtonActive;
  priceButtonLabel = liveChipState.priceButtonLabel;
  isPriceSelectorVisible = liveChipState.isPriceSelectorVisible;

  return (
    <ToggleStrip
      placement="in-list"
      // Search owns its canonical frost composition (excluded from the foundation
      // plate) — the band's blur sees honest frost by the host's construction.
      backdrop="chrome-frost"
      surfaceColor="#ffffff"
      contentInset={contentHorizontalPadding}
      holeBorderRadius={TOGGLE_BORDER_RADIUS}
      cacheSeat={layoutCacheSeat}
      testID="search-filters-strip"
    >
      {/* Sort dropdown (owner spec 2026-07-12): sits LEFT of the segment toggle — the
          resurrected Local/Global rank-chip pattern. 'Sort' at the silent Best default,
          the value ('Rising') + accent fill when overridden. Absorbs the old Rising chip. */}
      <SelectorChip
        key="sort"
        label={risingActive ? 'Rising' : 'Sort'}
        active={risingActive}
        expanded={isSortSelectorVisible}
        onPress={onToggleSortSelector}
        accentColor={accentColor}
        accessibilityLabel="Select result sort"
        testID="search-sort-toggle"
      />
      <SegmentedToggle
        key="segment"
        options={SEGMENT_OPTIONS}
        value={activeTab}
        onChange={onTabChange}
        accentColor={accentColor}
        accessibilityLabel="Toggle results between restaurants and dishes"
        accessibilityHint="Tap to switch result type"
        testID="search-segment-toggle"
      />
      <FilterChip
        key="open-now"
        label="Open now"
        active={openNow}
        onPress={onToggleOpenNow}
        accentColor={accentColor}
        accessibilityLabel="Toggle open now results"
        testID="search-open-now-toggle"
      />
      <FilterChip
        key="price"
        label={priceButtonLabel}
        active={priceButtonActive}
        onPress={onTogglePriceSelector}
        accentColor={accentColor}
        accessibilityLabel="Select price filters"
        accessibilityState={{ expanded: isPriceSelectorVisible }}
        style={{ paddingRight: PRICE_TOGGLE_RIGHT_PADDING }}
        testID="search-price-toggle"
      >
        {(filled) =>
          isPriceSelectorVisible ? (
            <ChevronUp
              size={16}
              strokeWidth={3}
              color={filled ? '#ffffff' : '#111827'}
              style={{ marginLeft: 6 }}
            />
          ) : (
            <ChevronDown
              size={16}
              strokeWidth={3}
              color={filled ? '#ffffff' : '#111827'}
              style={{ marginLeft: 6 }}
            />
          )
        }
      </FilterChip>
      <FilterChip
        key="include-similar"
        label="Include similar"
        active={includeSimilarActive}
        onPress={onToggleIncludeSimilar}
        accentColor={accentColor}
        accessibilityLabel="Toggle including similar results"
        testID="search-include-similar-toggle"
      />
      {similarAvailableCount > 0 && !includeSimilarActive ? (
        // REMOTE CONTROL for the toggle: tapping only flips "Include similar" — same
        // shared toggle flow/choreography for cards AND map (no expand-in-place).
        <FilterChip
          key="similar-available"
          variant="quiet"
          label={`${similarAvailableCount} similar`}
          active={false}
          onPress={onToggleIncludeSimilar}
          accessibilityLabel={`Show ${similarAvailableCount} similar results`}
          testID="search-similar-available-chip"
        />
      ) : null}
    </ToggleStrip>
  );
};

export type { SegmentValue };
export default React.memo(SearchFilters);
