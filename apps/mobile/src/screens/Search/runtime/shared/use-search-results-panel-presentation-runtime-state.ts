import { areResultsPresentationReadModelsEqual } from './results-presentation-runtime-contract';
import { useSearchBus } from './search-runtime-bus';
import type { SearchResultsPanelPresentationRuntimeState } from './search-results-panel-runtime-state-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchResultsPanelPresentationRuntimeState =
  (): SearchResultsPanelPresentationRuntimeState => {
    const searchRuntimeBus = useSearchBus();

    return useSearchRuntimeBusSelector(
      searchRuntimeBus,
      (state) => ({
        pendingPresentationIntentId: state.toggleInteraction.pendingPresentationIntentId,
        renderPolicy: state.resultsPresentation,
      }),
      (left, right) =>
        left.pendingPresentationIntentId === right.pendingPresentationIntentId &&
        areResultsPresentationReadModelsEqual(left.renderPolicy, right.renderPolicy),
      ['toggleInteraction', 'resultsPresentation'] as const
    );
  };
