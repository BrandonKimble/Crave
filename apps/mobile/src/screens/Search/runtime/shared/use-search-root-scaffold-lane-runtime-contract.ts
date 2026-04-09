import { useSearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';

export type UseSearchRootScaffoldLaneRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
  };
  startupPollBounds: Parameters<
    typeof useSearchRootScaffoldRuntime
  >[0]['resultsSheetRuntimeLaneArgs']['startupPollBounds'];
  mapRef: Parameters<
    typeof useSearchRootScaffoldRuntime
  >[0]['resultsSheetRuntimeLaneArgs']['mapRef'];
  searchLayoutTop: number;
  searchBarFrame: Parameters<
    typeof useSearchRootScaffoldRuntime
  >[0]['overlaySessionArgs']['searchBarFrame'];
  isSuggestionPanelActive: boolean;
  isAutocompleteSuppressed: boolean;
  rootSessionRuntime: SearchRootSessionRuntime;
};

export type SearchRootOverlaySessionArgsRuntime = Parameters<
  typeof useSearchRootScaffoldRuntime
>[0]['overlaySessionArgs'];

export type SearchRootResultsSheetRuntimeLaneArgsRuntime = Parameters<
  typeof useSearchRootScaffoldRuntime
>[0]['resultsSheetRuntimeLaneArgs'];

export type SearchRootInstrumentationArgsRuntime = Parameters<
  typeof useSearchRootScaffoldRuntime
>[0]['instrumentationArgs'];
