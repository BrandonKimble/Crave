import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import { useSearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import { type UseSearchRootScaffoldLaneRuntimeArgs } from './use-search-root-scaffold-lane-runtime-contract';
import { useSearchRootInstrumentationArgsRuntime } from './use-search-root-instrumentation-args-runtime';
import { useSearchRootOverlaySessionArgsRuntime } from './use-search-root-overlay-session-args-runtime';
import { useSearchRootResultsSheetRuntimeLaneArgsRuntime } from './use-search-root-results-sheet-runtime-lane-args-runtime';

export const useSearchRootScaffoldLaneRuntime = ({
  insets,
  startupPollBounds,
  mapRef,
  searchLayoutTop,
  searchBarFrame,
  isSuggestionPanelActive,
  isAutocompleteSuppressed,
  rootSessionRuntime,
}: UseSearchRootScaffoldLaneRuntimeArgs): SearchRootScaffoldRuntime => {
  const overlaySessionArgs = useSearchRootOverlaySessionArgsRuntime({
    insets,
    searchLayoutTop,
    searchBarFrame,
    isSuggestionPanelActive,
    rootSessionRuntime,
  });
  const resultsSheetRuntimeLaneArgs = useSearchRootResultsSheetRuntimeLaneArgsRuntime({
    insets,
    startupPollBounds,
    mapRef,
    rootSessionRuntime,
  });
  const instrumentationArgs = useSearchRootInstrumentationArgsRuntime({
    isAutocompleteSuppressed,
    rootSessionRuntime,
  });

  return useSearchRootScaffoldRuntime({
    overlaySessionArgs,
    resultsSheetRuntimeLaneArgs,
    instrumentationArgs,
  });
};
