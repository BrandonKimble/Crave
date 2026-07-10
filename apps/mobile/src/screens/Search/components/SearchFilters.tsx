import React from 'react';
import { type LayoutRectangle } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { CONTROL_HORIZONTAL_PADDING, CONTROL_RADIUS } from '../constants/ui';
import { SEGMENT_OPTIONS } from '../constants/search';

import { type MaskedHole } from '../../../components/MaskedHoleOverlay';
import { FilterChip } from '../../../components/FilterChip';
import {
  FrostedFilterStrip,
  type FrostedFilterStripMeasuredLayout,
} from '../../../components/FrostedFilterStrip';
import { SegmentedToggle } from '../../../components/SegmentedToggle';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { useSearchRuntimeBusSelector } from '../runtime/shared/use-search-runtime-bus-selector';

// GATE 2 (plans/toggle-system-ideal.md): the search strip — the feel-checked
// reference — now renders THROUGH the shared toggle primitives instead of mirroring
// them: the restaurant⇄dish pill is `SegmentedToggle` (the primitive extracted from
// this file's original pill; identical constants and mechanics) and the five chips
// are `FilterChip`. Every toggle improvement lands in the primitives, once, and
// reaches every strip. This file keeps only what is search's own: the live runtime-
// bus chip-state read and the warm-restore layout-cache join.

const TOGGLE_BORDER_RADIUS = CONTROL_RADIUS;
const TOGGLE_HORIZONTAL_PADDING = CONTROL_HORIZONTAL_PADDING + 4;
const PRICE_TOGGLE_RIGHT_PADDING = Math.max(0, TOGGLE_HORIZONTAL_PADDING - 3);

type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];

export type SearchFiltersLayoutCache = {
  viewportWidth: number;
  rowHeight: number;
  holeMap: Record<string, MaskedHole>;
  /** Pill segment geometry, index-aligned with SEGMENT_OPTIONS (SegmentedToggle's
   *  warm-restore schema — the pill paints correctly on the FIRST frame after a
   *  chrome swap). */
  segmentLayouts?: (LayoutRectangle | undefined)[];
};

const cloneLayoutRectangle = (layout: LayoutRectangle): LayoutRectangle => ({
  x: layout.x,
  y: layout.y,
  width: layout.width,
  height: layout.height,
});

const cloneMaskedHole = (hole: MaskedHole): MaskedHole => ({
  x: hole.x,
  y: hole.y,
  width: hole.width,
  height: hole.height,
  borderRadius: hole.borderRadius,
});

export const cloneSearchFiltersLayoutCache = (
  cache: SearchFiltersLayoutCache | null | undefined
): SearchFiltersLayoutCache | null => {
  if (!cache) {
    return null;
  }
  return {
    viewportWidth: cache.viewportWidth,
    rowHeight: cache.rowHeight,
    holeMap: Object.fromEntries(
      Object.entries(cache.holeMap).map(([key, hole]) => [key, cloneMaskedHole(hole)])
    ),
    segmentLayouts: cache.segmentLayouts
      ? cache.segmentLayouts.map((layout) => (layout ? cloneLayoutRectangle(layout) : layout))
      : undefined,
  };
};

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
  onToggleRising: () => void;
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
  searchRuntimeBus,
  activeTab,
  onTabChange,
  openNow,
  onToggleOpenNow,
  includeSimilarActive,
  onToggleIncludeSimilar,
  similarAvailableCount,
  risingActive,
  onToggleRising,
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
    }),
    (left, right) =>
      left.activeTab === right.activeTab &&
      left.openNow === right.openNow &&
      left.includeSimilarActive === right.includeSimilarActive &&
      left.similarAvailableCount === right.similarAvailableCount &&
      left.risingActive === right.risingActive &&
      left.priceButtonActive === right.priceButtonActive &&
      left.priceButtonLabel === right.priceButtonLabel &&
      left.isPriceSelectorVisible === right.isPriceSelectorVisible,
    [
      'desiredTuple',
      'results',
      'priceButtonIsActive',
      'priceButtonLabelText',
      'isPriceSelectorVisible',
    ] as const
  );
  activeTab = liveChipState.activeTab;
  openNow = liveChipState.openNow;
  includeSimilarActive = liveChipState.includeSimilarActive;
  similarAvailableCount = liveChipState.similarAvailableCount;
  risingActive = liveChipState.risingActive;
  priceButtonActive = liveChipState.priceButtonActive;
  priceButtonLabel = liveChipState.priceButtonLabel;
  isPriceSelectorVisible = liveChipState.isPriceSelectorVisible;

  // The frosted cutout shell (mask geometry, per-control hole registration, horizontal
  // scroll) is the SHARED `FrostedFilterStrip`; the pill mechanics are the SHARED
  // `SegmentedToggle`. We keep only the measured layouts each reports back, joined
  // into the warm-restore cache.
  const [shellLayout, setShellLayout] = React.useState<FrostedFilterStripMeasuredLayout | null>(
    initialLayoutCache
      ? {
          holeMap: initialLayoutCache.holeMap,
          viewportWidth: initialLayoutCache.viewportWidth,
          rowHeight: initialLayoutCache.rowHeight,
        }
      : null
  );
  const handleShellLayout = React.useCallback((layout: FrostedFilterStripMeasuredLayout) => {
    setShellLayout(layout);
  }, []);
  const segmentLayoutsRef = React.useRef<(LayoutRectangle | undefined)[]>(
    initialLayoutCache?.segmentLayouts ? [...initialLayoutCache.segmentLayouts] : []
  );
  const [segmentLayoutsVersion, setSegmentLayoutsVersion] = React.useState(0);
  const handleSegmentLayoutsChange = React.useCallback(
    (layouts: (LayoutRectangle | undefined)[]) => {
      segmentLayoutsRef.current = layouts;
      setSegmentLayoutsVersion((prev) => prev + 1);
    },
    []
  );
  const initialSegmentLayouts = React.useRef(initialLayoutCache?.segmentLayouts ?? undefined);

  // Warm-restore cache = the shell's measured layout (hole map + viewport + row height)
  // joined with the pill's segment layouts (reported by SegmentedToggle).
  React.useEffect(() => {
    if (!onLayoutCacheChange || !shellLayout) {
      return;
    }
    if (shellLayout.viewportWidth <= 0 || shellLayout.rowHeight <= 0) {
      return;
    }
    onLayoutCacheChange({
      viewportWidth: shellLayout.viewportWidth,
      rowHeight: shellLayout.rowHeight,
      holeMap: Object.fromEntries(
        Object.entries(shellLayout.holeMap).map(([key, hole]) => [key, cloneMaskedHole(hole)])
      ),
      segmentLayouts: segmentLayoutsRef.current.map((layout) =>
        layout ? cloneLayoutRectangle(layout) : layout
      ),
    });
  }, [onLayoutCacheChange, segmentLayoutsVersion, shellLayout]);

  return (
    <FrostedFilterStrip
      disableBlur={disableBlur}
      surfaceColor="#ffffff"
      contentInset={contentHorizontalPadding}
      holeBorderRadius={TOGGLE_BORDER_RADIUS}
      initialHoleLayout={
        initialLayoutCache
          ? {
              holeMap: initialLayoutCache.holeMap,
              viewportWidth: initialLayoutCache.viewportWidth,
              rowHeight: initialLayoutCache.rowHeight,
            }
          : null
      }
      onMeasuredLayoutChange={handleShellLayout}
    >
      <SegmentedToggle
        key="segment"
        options={SEGMENT_OPTIONS}
        value={activeTab}
        onChange={onTabChange}
        accentColor={accentColor}
        initialSegmentLayouts={initialSegmentLayouts.current}
        onSegmentLayoutsChange={handleSegmentLayoutsChange}
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
      <FilterChip
        key="rising"
        label="Rising"
        active={risingActive}
        onPress={onToggleRising}
        accentColor={accentColor}
        accessibilityLabel="Toggle rising momentum filter"
        testID="search-rising-toggle"
      />
    </FrostedFilterStrip>
  );
};

export type { SegmentValue };
export default React.memo(SearchFilters);
