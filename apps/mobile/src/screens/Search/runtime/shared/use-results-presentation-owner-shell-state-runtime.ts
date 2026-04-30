import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useResultsPresentationShellRuntime } from './use-results-presentation-shell-runtime';

type UseResultsPresentationOwnerShellStateRuntimeArgs = {
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'resultsSheetRuntimeModel'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
  >;
};

export type ResultsPresentationOwnerShellStateRuntime = ReturnType<
  typeof useResultsPresentationShellRuntime
>;

export const useResultsPresentationOwnerShellStateRuntime = ({
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  isSearchLoading,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  searchRuntimeBus,
  onSearchSheetContentLaneChanged,
  searchChromeScalarSurfacePresentationRuntime,
  resultsSheetRuntime,
}: UseResultsPresentationOwnerShellStateRuntimeArgs): ResultsPresentationOwnerShellStateRuntime =>
  useResultsPresentationShellRuntime({
    query,
    submittedQuery,
    hasActiveSearchContent,
    isSearchSessionActive,
    isSearchLoading,
    isSuggestionPanelActive,
    shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions,
    searchRuntimeBus,
    onSearchSheetContentLaneChanged,
    searchChromeScalarSurfacePresentationRuntime,
    resultsSheetRuntime,
  });
