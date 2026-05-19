import React from 'react';

import { createResultsPresentationInteractionRuntimeValue } from '../controller/results-presentation-interaction-runtime';
import type {
  ResultsInteractionModel,
} from './results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import type {
  ToggleInteractionLifecycleEvent,
} from './results-toggle-interaction-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useResultsPresentationTabToggleRuntime } from './use-results-presentation-tab-toggle-runtime';
import { useResultsPresentationToggleLifecycleRuntime } from './use-results-presentation-toggle-lifecycle-runtime';

type ResultsPresentationInteractionRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  | 'pendingTogglePresentationIntentId'
  | 'scheduleToggleCommit'
  | 'notifyFrostReady'
  | 'cancelToggleInteraction'
> & {
  interactionModel: ResultsInteractionModel;
};

type UseResultsPresentationInteractionRuntimeArgs = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  isSearchSessionActive: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
  resultsRuntimeOwner: Pick<
    ResultsPresentationRuntimeOwner,
    | 'clearStagedSearchSurfaceResultsTransaction'
    | 'commitSearchSurfaceResultsTransaction'
  >;
};

export const useResultsPresentationInteractionRuntime = ({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  isSearchSessionActive,
  searchRuntimeBus,
  handleToggleInteractionLifecycle,
  notifyIntentCompleteRef,
  resultsRuntimeOwner,
}: UseResultsPresentationInteractionRuntimeArgs): ResultsPresentationInteractionRuntime => {
  const toggleLifecycleRuntime = useResultsPresentationToggleLifecycleRuntime({
    searchRuntimeBus,
    handleToggleInteractionLifecycle,
    notifyIntentCompleteRef,
  });

  const interactionModel = useResultsPresentationTabToggleRuntime({
    activeTab,
    setActiveTab,
    setActiveTabPreference,
    isSearchSessionActive,
    searchRuntimeBus,
    toggleLifecycleRuntime,
    resultsRuntimeOwner,
  });

  return React.useMemo(
    () =>
      createResultsPresentationInteractionRuntimeValue({
        pendingTogglePresentationIntentId:
          toggleLifecycleRuntime.pendingTogglePresentationIntentId,
        scheduleToggleCommit: toggleLifecycleRuntime.scheduleToggleCommit,
        notifyFrostReady: toggleLifecycleRuntime.notifyFrostReady,
        cancelToggleInteraction: toggleLifecycleRuntime.cancelToggleInteraction,
        interactionModel,
      }),
    [interactionModel, toggleLifecycleRuntime]
  );
};
