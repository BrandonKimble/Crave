import { useSearchOverlaySessionRuntime } from './use-search-overlay-session-runtime';
import { useSearchResultsSheetRuntimeLane } from './use-search-results-sheet-runtime-lane';
import { useSearchRuntimeInstrumentationRuntime } from './use-search-runtime-instrumentation-runtime';

type UseSearchRootScaffoldRuntimeArgs = {
  overlaySessionArgs: Parameters<typeof useSearchOverlaySessionRuntime>[0];
  resultsSheetRuntimeLaneArgs: Omit<
    Parameters<typeof useSearchResultsSheetRuntimeLane>[0],
    'shouldShowPollsSheet' | 'searchBarTop' | 'navBarTopForSnaps' | 'isSearchOverlay'
  > & {
    initialDockedPollsArgs: Omit<
      Parameters<typeof useSearchResultsSheetRuntimeLane>[0]['initialDockedPollsArgs'],
      'shouldShowDockedPollsTarget'
    >;
  };
  instrumentationArgs: Omit<
    Parameters<typeof useSearchRuntimeInstrumentationRuntime>[0],
    'isSearchOverlay' | 'rootOverlay' | 'activeOverlayKey'
  >;
};

export type SearchRootScaffoldRuntime = {
  overlaySessionRuntime: ReturnType<typeof useSearchOverlaySessionRuntime>;
  resultsSheetRuntimeLane: Omit<
    ReturnType<typeof useSearchResultsSheetRuntimeLane>,
    'resultsSheetRuntimeOwner'
  >;
  resultsSheetRuntimeOwner: ReturnType<
    typeof useSearchResultsSheetRuntimeLane
  >['resultsSheetRuntimeOwner'];
  instrumentationRuntime: ReturnType<typeof useSearchRuntimeInstrumentationRuntime>;
};

export const useSearchRootScaffoldRuntime = ({
  overlaySessionArgs,
  resultsSheetRuntimeLaneArgs,
  instrumentationArgs,
}: UseSearchRootScaffoldRuntimeArgs): SearchRootScaffoldRuntime => {
  const overlaySessionRuntime = useSearchOverlaySessionRuntime(overlaySessionArgs);
  const { resultsSheetRuntimeOwner, ...resultsSheetRuntimeLane } = useSearchResultsSheetRuntimeLane(
    {
      ...resultsSheetRuntimeLaneArgs,
      shouldShowPollsSheet: overlaySessionRuntime.shouldShowPollsSheet,
      searchBarTop: overlaySessionRuntime.searchBarTop,
      navBarTopForSnaps: overlaySessionRuntime.navBarTopForSnaps,
      isSearchOverlay: overlaySessionRuntime.isSearchOverlay,
      initialDockedPollsArgs: {
        ...resultsSheetRuntimeLaneArgs.initialDockedPollsArgs,
        shouldShowDockedPollsTarget: overlaySessionRuntime.shouldShowDockedPollsTarget,
      },
    }
  );
  const instrumentationRuntime = useSearchRuntimeInstrumentationRuntime({
    ...instrumentationArgs,
    isSearchOverlay: overlaySessionRuntime.isSearchOverlay,
    rootOverlay: overlaySessionRuntime.rootOverlay,
    activeOverlayKey: overlaySessionRuntime.activeOverlayKey,
  });

  return {
    overlaySessionRuntime,
    resultsSheetRuntimeLane,
    resultsSheetRuntimeOwner,
    instrumentationRuntime,
  };
};
