import React from 'react';

import { createResultsPresentationRuntimeOwnerValue } from '../controller/results-presentation-owner-runtime';
import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import { useResultsPresentationInteractionRuntime } from './use-results-presentation-interaction-runtime';
import { useResultsPresentationRuntimeMachineOwner } from './use-results-presentation-runtime-machine-owner';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';

type UseResultsPresentationOwnerBridgeRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  isSearchSessionActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  log: ResultsPresentationLog;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
};

type ResultsPresentationOwnerBridgeRuntime = {
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  resultsRuntimeOwner: ResultsPresentationRuntimeOwner;
  interactionModel: ReturnType<typeof useResultsPresentationInteractionRuntime>['interactionModel'];
};

export const useResultsPresentationOwnerBridgeRuntime = ({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  isSearchSessionActive,
  searchRuntimeBus,
  log,
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
}: UseResultsPresentationOwnerBridgeRuntimeArgs): ResultsPresentationOwnerBridgeRuntime => {
  const markSearchSheetCloseMapExitSettledRef = React.useRef<(requestKey: string) => void>(
    () => {}
  );
  const notifyIntentCompleteRef = React.useRef<((intentId: string) => void) | null>(null);

  const { handleToggleInteractionLifecycle, ...resultsRuntimeMachineOwner } =
    useResultsPresentationRuntimeMachineOwner({
      searchRuntimeBus,
      log,
      runOneHandoffCoordinatorRef,
      emitRuntimeMechanismEvent,
      markSearchSheetCloseMapExitSettledRef,
      notifyIntentCompleteRef,
    });

  const resultsInteractionRuntime = useResultsPresentationInteractionRuntime({
    activeTab,
    setActiveTab,
    setActiveTabPreference,
    isSearchSessionActive,
    searchRuntimeBus,
    handleToggleInteractionLifecycle,
    notifyIntentCompleteRef,
    resultsRuntimeOwner: resultsRuntimeMachineOwner,
  });

  const resultsRuntimeOwner = React.useMemo(
    () =>
      createResultsPresentationRuntimeOwnerValue({
        ...resultsRuntimeMachineOwner,
        pendingTogglePresentationIntentId:
          resultsInteractionRuntime.pendingTogglePresentationIntentId,
        scheduleToggleCommit: resultsInteractionRuntime.scheduleToggleCommit,
        notifyFrostReady: resultsInteractionRuntime.notifyFrostReady,
        cancelToggleInteraction: resultsInteractionRuntime.cancelToggleInteraction,
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
