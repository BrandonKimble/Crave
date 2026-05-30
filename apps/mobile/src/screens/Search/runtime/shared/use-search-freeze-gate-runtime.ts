import React from 'react';

import { createSearchFreezeGateRuntimeValue } from '../controller/search-freeze-gate-runtime';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchFreezeGateStateRuntime } from './use-search-freeze-gate-state-runtime';
import { useSearchResponseFrameFreezeRuntime } from './use-search-response-frame-freeze-runtime';
import { useSearchSurfaceRedrawStallPressureRuntime } from './use-search-surface-redraw-stall-pressure-runtime';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

type SearchSurfaceRedrawCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: string;
  };
  advancePhase: (phase: string, payload?: Record<string, unknown>) => void;
};

type UseSearchFreezeGateRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsRequestKey: string | null;
  searchMode: 'natural' | 'shortcut' | null;
  getPerfNow: () => number;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinatorLike>;
  searchSurfaceRedrawCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
};

type UseSearchFreezeGateRuntimeResult = {
  isSearchSurfaceRedrawChromeFreezeActive: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive: boolean;
  isSearchSurfaceRedrawActive: boolean;
  isResponseFrameFreezeActive: boolean;
  freezeClassification: SearchFreezeClassification;
};

export const useSearchFreezeGateRuntime = ({
  searchRuntimeBus,
  resultsRequestKey,
  searchMode,
  getPerfNow,
  searchSurfaceRedrawCoordinatorRef,
  searchSurfaceRedrawCommitSpanPressureByOperationRef,
}: UseSearchFreezeGateRuntimeArgs): UseSearchFreezeGateRuntimeResult => {
  useSearchResponseFrameFreezeRuntime({
    searchRuntimeBus,
    resultsRequestKey,
  });

  const freezeGateStateRuntime = useSearchFreezeGateStateRuntime(searchRuntimeBus);

  useSearchSurfaceRedrawStallPressureRuntime({
    searchMode,
    getPerfNow,
    searchSurfaceRedrawCoordinatorRef,
    searchSurfaceRedrawCommitSpanPressureByOperationRef,
  });

  return React.useMemo(
    () =>
      createSearchFreezeGateRuntimeValue({
        isSearchSurfaceRedrawChromeFreezeActive:
          freezeGateStateRuntime.freezeGateState.isSearchSurfaceRedrawChromeFreezeActive,
        isSearchSurfaceRedrawPreflightFreezeActive:
          freezeGateStateRuntime.freezeGateState.isSearchSurfaceRedrawPreflightFreezeActive,
        isSearchSurfaceRedrawActive:
          freezeGateStateRuntime.freezeGateState.isSearchSurfaceRedrawActive,
        isResponseFrameFreezeActive:
          freezeGateStateRuntime.freezeGateState.isResponseFrameFreezeActive,
        freezeClassification: freezeGateStateRuntime.freezeGateState.freezeClassification,
      }),
    [freezeGateStateRuntime.freezeGateState]
  );
};
