import React from 'react';

import { writeSearchDesiredTuple } from '../shared/search-desired-state-writer';
import type { SearchCommittedBounds } from '../shared/search-desired-state-contract';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import {
  buildLevelsFromRange,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceRangeValues,
  type PriceRangeTuple,
} from '../../utils/price';

type QueryMutationMechanismEmitter = (
  event: 'query_mutation_coalesced',
  payload?: Record<string, unknown>
) => void;

type UseQueryMutationOrchestratorArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  pendingPriceRange: PriceRangeTuple;
  setPendingPriceRange: (next: PriceRangeTuple) => void;
  isPriceSelectorVisible: boolean;
  setIsPriceSelectorVisible: (next: boolean) => void;
  priceLevels: number[];
  priceSheetRef: React.MutableRefObject<{ requestClose: () => void } | null>;
  /** S3-pre commit-moment adopt: a chip commit re-reads the SETTLED native camera into the
   *  tuple, so a zoom-then-toggle resolves against the CURRENT viewport by construction. */
  captureFreshTupleBounds: () => Promise<SearchCommittedBounds | null>;
  onMechanismEvent?: QueryMutationMechanismEmitter;
};

type QueryMutationOrchestrator = {
  togglePriceSelector: () => void;
  toggleIncludeSimilar: () => void;
  toggleRising: () => void;
  toggleOpenNow: () => void;
  commitPriceSelection: () => void;
  closePriceSelector: () => void;
  dismissPriceSelector: () => void;
  handlePriceDone: () => void;
};

export const useQueryMutationOrchestrator = (
  args: UseQueryMutationOrchestratorArgs
): QueryMutationOrchestrator => {
  const {
    searchRuntimeBus,
    pendingPriceRange,
    setPendingPriceRange,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    priceLevels,
    priceSheetRef,
    captureFreshTupleBounds,
    onMechanismEvent,
  } = args;

  // Chip commits are COMMIT MOMENTS (charter §2): adopt the settled camera into the tuple
  // in the same write as the variant flip, so the rerun resolves against the viewport the
  // user is looking at — the zoom-then-toggle lane needs no special casing anywhere else.
  // The flip value is read AFTER the capture lands so rapid re-taps stay correct.
  const writeChipVariantTuple = React.useCallback(
    (
      buildFilterVariant: () => {
        openNow?: boolean;
        priceLevels?: number[];
        rising?: boolean;
        includeSimilar?: boolean;
      },
      cause: 'chip_open_now' | 'chip_rising' | 'chip_price' | 'chip_include_similar'
    ) => {
      void captureFreshTupleBounds()
        .catch(() => null)
        .then((committedBounds) => {
          writeSearchDesiredTuple(
            searchRuntimeBus,
            {
              filterVariant: buildFilterVariant(),
              ...(committedBounds != null ? { committedBounds } : {}),
            },
            cause
          );
        });
    },
    [captureFreshTupleBounds, searchRuntimeBus]
  );

  const pendingPriceRangeRef = React.useRef<PriceRangeTuple>(pendingPriceRange);

  React.useEffect(() => {
    pendingPriceRangeRef.current = pendingPriceRange;
  }, [pendingPriceRange]);

  React.useEffect(() => {
    if (!isPriceSelectorVisible) {
      const nextRange = getRangeFromLevels(priceLevels);
      const currentRange = pendingPriceRangeRef.current;
      if (currentRange[0] !== nextRange[0] || currentRange[1] !== nextRange[1]) {
        setPendingPriceRange(nextRange);
      }
    }
  }, [isPriceSelectorVisible, priceLevels, setPendingPriceRange]);

  const emitMutationCoalesced = React.useCallback(
    (payload: Record<string, unknown>) => {
      onMechanismEvent?.('query_mutation_coalesced', payload);
    },
    [onMechanismEvent]
  );

  const clearPendingTabSwitchDraft = React.useCallback(() => {
    searchRuntimeBus.publish({
      pendingTabSwitchTab: null,
    });
  }, [searchRuntimeBus]);

  const toggleIncludeSimilar = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    // S2: the trigger only WRITES the tuple (optimistic chip flip via the legacy
    // projection in the same publish); the desired-tuple reader owns the commit.
    writeChipVariantTuple(
      () => ({
        includeSimilar: !searchRuntimeBus.getState().desiredTuple.filterVariant.includeSimilar,
      }),
      'chip_include_similar'
    );
  }, [
    clearPendingTabSwitchDraft,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
    writeChipVariantTuple,
  ]);

  const toggleRising = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    writeChipVariantTuple(
      () => ({
        rising: !searchRuntimeBus.getState().desiredTuple.filterVariant.rising,
      }),
      'chip_rising'
    );
  }, [
    clearPendingTabSwitchDraft,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
    writeChipVariantTuple,
  ]);

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    clearPendingTabSwitchDraft();
    writeChipVariantTuple(
      () => ({
        openNow: !searchRuntimeBus.getState().desiredTuple.filterVariant.openNow,
      }),
      'chip_open_now'
    );
  }, [
    clearPendingTabSwitchDraft,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
    writeChipVariantTuple,
  ]);

  const commitPriceSelection = React.useCallback(() => {
    const snapshot = pendingPriceRangeRef.current;
    const sheet = priceSheetRef.current;
    if (sheet) {
      sheet.requestClose();
    } else {
      setIsPriceSelectorVisible(false);
    }

    const normalizedRange = normalizePriceRangeValues(snapshot);
    const shouldClear = isFullPriceRange(normalizedRange);
    const nextLevels = shouldClear ? [] : buildLevelsFromRange(normalizedRange);
    const currentLevels = searchRuntimeBus.getState().desiredTuple.filterVariant.priceLevels;
    const hasChanged =
      nextLevels.length !== currentLevels.length ||
      nextLevels.some((value, index) => value !== currentLevels[index]);

    if (!hasChanged) {
      emitMutationCoalesced({ reason: 'price_filter_duplicate_intent' });
      return;
    }
    clearPendingTabSwitchDraft();
    // S2: the price sheet is DRAFT state (widget-owned sliders) committed as ONE tuple
    // write at the Done gesture; the desired-tuple reader owns the rerun commit.
    writeChipVariantTuple(() => ({ priceLevels: nextLevels }), 'chip_price');
  }, [
    writeChipVariantTuple,
    clearPendingTabSwitchDraft,
    emitMutationCoalesced,
    priceSheetRef,
    searchRuntimeBus,
    setIsPriceSelectorVisible,
  ]);

  const closePriceSelector = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
  }, [setIsPriceSelectorVisible]);

  const dismissPriceSelector = React.useCallback(() => {
    const sheet = priceSheetRef.current;
    if (sheet) {
      sheet.requestClose();
      return;
    }
    closePriceSelector();
  }, [closePriceSelector, priceSheetRef]);

  const togglePriceSelector = React.useCallback(() => {
    if (isPriceSelectorVisible) {
      commitPriceSelection();
      return;
    }
    setIsPriceSelectorVisible(true);
  }, [commitPriceSelection, isPriceSelectorVisible, setIsPriceSelectorVisible]);

  const handlePriceDone = React.useCallback(() => {
    commitPriceSelection();
  }, [commitPriceSelection]);

  return {
    togglePriceSelector,
    toggleIncludeSimilar,
    toggleRising,
    toggleOpenNow,
    commitPriceSelection,
    closePriceSelector,
    dismissPriceSelector,
    handlePriceDone,
  };
};
