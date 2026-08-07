import React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import { useResultsPresentationInteractionRuntime } from './use-results-presentation-interaction-runtime';
import { useResultsPresentationRuntimeMachineOwner } from './use-results-presentation-runtime-machine-owner';

type UseResultsPresentationOwnerBridgeRuntimeArgs = {
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
};

type ResultsPresentationOwnerBridgeRuntime = {
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  interactionModel: ReturnType<typeof useResultsPresentationInteractionRuntime>['interactionModel'];
};

export const useResultsPresentationOwnerBridgeRuntime = ({
  setActiveTab,
  setActiveTabPreference,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
}: UseResultsPresentationOwnerBridgeRuntimeArgs): ResultsPresentationOwnerBridgeRuntime => {
  const markSearchSheetCloseMapExitSettledRef = React.useRef<(requestKey: string) => void>(
    () => {}
  );
  const notifyIntentCompleteRef = React.useRef<((intentId: string) => void) | null>(null);

  // F5301: this was a rest-destructure (`const { handleToggleInteractionLifecycle,
  // ...resultsRuntimeMachineOwner } = ...`). The callee returns a `React.useMemo`, so its
  // identity IS stable — but a rest element allocates a FRESH object on every render, and
  // that fresh object was dep #2 of the `resultsRuntimeOwner` memo below, which was dep #1
  // of the return memo. Both memos therefore recomputed unconditionally and this hook's
  // entire return identity changed every render. Taking the memoized object whole makes
  // the dep an input again (the rule use-search-root-overlay-chrome-host-runtime.ts:137-141
  // states: a dep that is not an input is not a safety margin, it is a guaranteed false
  // invalidation).
  const resultsRuntimeMachineOwner = useResultsPresentationRuntimeMachineOwner({
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
    markSearchSheetCloseMapExitSettledRef,
    notifyIntentCompleteRef,
  });

  const resultsInteractionRuntime = useResultsPresentationInteractionRuntime({
    setActiveTab,
    setActiveTabPreference,
    searchRuntimeBus,
    handleToggleInteractionLifecycle: resultsRuntimeMachineOwner.handleToggleInteractionLifecycle,
    notifyIntentCompleteRef,
  });

  /**
   * F1610: the repacker this replaced destructured seventeen named fields, so like the other
   * spread sites in this cluster it was also a runtime FILTER — a bare
   * `{ ...resultsRuntimeMachineOwner, ... }` inline would keep the type but change the value.
   * The fields are named explicitly; the contract type on the memo is what keeps them honest.
   */
  const resultsRuntimeOwner = React.useMemo<ResultsPresentationRuntimeOwner>(
    () => ({
      beginSearchThisAreaPresentationPending:
        resultsRuntimeMachineOwner.beginSearchThisAreaPresentationPending,
      beginVariantRerunPresentationPending:
        resultsRuntimeMachineOwner.beginVariantRerunPresentationPending,
      cancelPresentationIntent: resultsRuntimeMachineOwner.cancelPresentationIntent,
      cancelToggleInteraction: resultsInteractionRuntime.cancelToggleInteraction,
      clearStagedSearchSurfaceResultsTransaction:
        resultsRuntimeMachineOwner.clearStagedSearchSurfaceResultsTransaction,
      commitSearchSurfaceResultsExitTransaction:
        resultsRuntimeMachineOwner.commitSearchSurfaceResultsExitTransaction,
      handleExecutionBatchMountedHidden:
        resultsRuntimeMachineOwner.handleExecutionBatchMountedHidden,
      handleMarkerEnterSettled: resultsRuntimeMachineOwner.handleMarkerEnterSettled,
      handleMarkerEnterStarted: resultsRuntimeMachineOwner.handleMarkerEnterStarted,
      handleMarkerExitSettled: resultsRuntimeMachineOwner.handleMarkerExitSettled,
      handleMarkerExitStarted: resultsRuntimeMachineOwner.handleMarkerExitStarted,
      handlePageOneResultsCommitted: resultsRuntimeMachineOwner.handlePageOneResultsCommitted,
      handlePresentationIntentAbort: resultsRuntimeMachineOwner.handlePresentationIntentAbort,
      pendingTogglePresentationIntentId:
        resultsInteractionRuntime.pendingTogglePresentationIntentId,
      scheduleToggleCommit: resultsInteractionRuntime.scheduleToggleCommit,
      searchSurfaceResultsTransactionKey:
        resultsRuntimeMachineOwner.searchSurfaceResultsTransactionKey,
      stageSearchSurfaceResultsTransaction:
        resultsRuntimeMachineOwner.stageSearchSurfaceResultsTransaction,
    }),
    [resultsInteractionRuntime, resultsRuntimeMachineOwner]
  );

  return React.useMemo(
    () => ({
      markSearchSheetCloseMapExitSettledRef,
      resultsRuntimeOwner,
      interactionModel: resultsInteractionRuntime.interactionModel,
    }),
    [resultsRuntimeOwner, resultsInteractionRuntime.interactionModel]
  );
};
