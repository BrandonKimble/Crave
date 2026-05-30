import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
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
  resultsPresentationAuthority: ResultsPresentationAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
  resultsSheetRuntime: Pick<
    AppRouteSharedSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'prepareSharedSheetForSearchPresentation'
    | 'sharedSheetRuntimeModel'
    | 'shouldRenderMountedSharedSheetRef'
    | 'markSharedSheetHidden'
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
  resultsPresentationAuthority,
  routeSceneSwitchAuthority,
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
    resultsPresentationAuthority,
    routeSceneSwitchAuthority,
    onSearchSheetContentLaneChanged,
    searchChromeScalarSurfacePresentationRuntime,
    resultsSheetRuntime,
  });
