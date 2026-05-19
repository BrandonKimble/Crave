import { areResultsPresentationReadModelsEqual } from './results-presentation-runtime-contract';
import {
  type ResultsPresentationAuthority,
  useResultsPresentationAuthoritySelector,
} from './results-presentation-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchResultsPanelPresentationRuntimeState } from './search-results-panel-runtime-state-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchResultsPanelPresentationRuntimeState = (
  searchRuntimeBus: SearchRuntimeBus,
  resultsPresentationAuthority: ResultsPresentationAuthority
): SearchResultsPanelPresentationRuntimeState => {
  const pendingPresentationIntentId = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => state.toggleInteraction.pendingPresentationIntentId,
    Object.is,
    ['toggleInteraction'] as const,
    'results_panel_presentation_runtime_state'
  );
  const renderPolicy = useResultsPresentationAuthoritySelector(
    resultsPresentationAuthority,
    (snapshot) => snapshot.resultsPresentation,
    areResultsPresentationReadModelsEqual,
    ['resultsPresentation'] as const,
    'results_panel_presentation_authority_state'
  );

  return {
    pendingPresentationIntentId,
    renderPolicy,
  };
};
