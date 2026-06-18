import React from 'react';

import type { ResultsInteractionModel } from './results-presentation-owner-contract';
import type { ResultsPresentationRuntimeOwner } from './results-presentation-runtime-owner-contract';
import {
  type ScheduleToggleCommit,
  type ToggleInteractionLifecycleEvent,
} from './results-toggle-interaction-contract';
import type { SearchRuntimeBus, SearchRuntimeBusState } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import { useResultsPresentationToggleCommitRuntime } from './use-results-presentation-toggle-commit-runtime';
import { useResultsPresentationToggleStateRuntime } from './use-results-presentation-toggle-state-runtime';

type ToggleCommitRunner = Parameters<ScheduleToggleCommit>[0];
type ToggleCommitOptions = Parameters<ScheduleToggleCommit>[1];

type ResultsPresentationToggleLifecycleRuntime = Pick<
  ResultsPresentationRuntimeOwner,
  | 'pendingTogglePresentationIntentId'
  | 'scheduleToggleCommit'
  | 'notifyFrostReady'
  | 'cancelToggleInteraction'
> & {
  beginToggleInteraction: (
    runner: ToggleCommitRunner,
    options: ToggleCommitOptions,
    startPatch?: Partial<SearchRuntimeBusState>
  ) => void;
};

type UseResultsPresentationToggleLifecycleRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
};

export const useResultsPresentationToggleLifecycleRuntime = ({
  searchRuntimeBus,
  handleToggleInteractionLifecycle,
  notifyIntentCompleteRef,
}: UseResultsPresentationToggleLifecycleRuntimeArgs): ResultsPresentationToggleLifecycleRuntime => {
  const pendingTogglePresentationIntentId = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.toggleInteraction.pendingPresentationIntentId,
    Object.is,
    ['toggleInteraction'] as const
  );

  const toggleStateRuntime = useResultsPresentationToggleStateRuntime({
    searchRuntimeBus,
    handleToggleInteractionLifecycle,
  });
  const toggleCommitRuntime = useResultsPresentationToggleCommitRuntime({
    searchRuntimeBus,
    handleToggleInteractionLifecycle,
    notifyIntentCompleteRef,
    toggleStateRuntime,
  });

  return React.useMemo(
    () => ({
      pendingTogglePresentationIntentId,
      scheduleToggleCommit: toggleStateRuntime.scheduleToggleCommit,
      notifyFrostReady: toggleCommitRuntime.notifyFrostReady,
      cancelToggleInteraction: toggleStateRuntime.cancelToggleInteraction,
      beginToggleInteraction: toggleStateRuntime.beginToggleInteraction,
    }),
    [
      pendingTogglePresentationIntentId,
      toggleCommitRuntime.notifyFrostReady,
      toggleStateRuntime.beginToggleInteraction,
      toggleStateRuntime.cancelToggleInteraction,
      toggleStateRuntime.scheduleToggleCommit,
    ]
  );
};
