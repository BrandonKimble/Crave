import React from 'react';

import type { SearchRootAutocompleteAuthorityRuntime } from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';
import type { MapBounds } from '../../../../types';

type UseSearchRootAutocompleteAuthorityRuntimeArgs = {
  sessionCoreLane: Pick<SearchRootSessionCoreLane, 'viewportBoundsService'>;
  stateFoundationLane: SearchRootStateFoundationLane;
};

const areBoundsEqual = (left: MapBounds | null, right: MapBounds | null): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.northEast.lat === right.northEast.lat &&
    left.northEast.lng === right.northEast.lng &&
    left.southWest.lat === right.southWest.lat &&
    left.southWest.lng === right.southWest.lng
  );
};

const useStableViewportBoundsSnapshot = (
  viewportBoundsService: SearchRootSessionCoreLane['viewportBoundsService']
): MapBounds | null => {
  const stableBoundsRef = React.useRef<MapBounds | null>(null);
  const nextBounds = viewportBoundsService.getBounds();
  if (!areBoundsEqual(stableBoundsRef.current, nextBounds)) {
    stableBoundsRef.current = nextBounds;
  }
  return stableBoundsRef.current;
};

export const useSearchRootAutocompleteAuthorityRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
}: UseSearchRootAutocompleteAuthorityRuntimeArgs): SearchRootAutocompleteAuthorityRuntime => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, rootSuggestionRuntime } =
    stateFoundationLane;
  const autocompleteBounds = useStableViewportBoundsSnapshot(sessionCoreLane.viewportBoundsService);

  const autocompleteRuntime = useSearchAutocompleteRuntime({
    query: rootPrimitivesRuntime.searchState.query,
    isSuggestionScreenActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: rootSuggestionRuntime.isSuggestionPanelVisible,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    runAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.runAutocomplete,
    cancelAutocomplete: rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    bounds: autocompleteBounds,
    userLocation: null,
  });

  const autocompleteControlPort = React.useMemo(
    () => ({
      allowAutocompleteResults: autocompleteRuntime.allowAutocompleteResults,
      suppressAutocompleteResults: autocompleteRuntime.suppressAutocompleteResults,
    }),
    [autocompleteRuntime.allowAutocompleteResults, autocompleteRuntime.suppressAutocompleteResults]
  );

  return React.useMemo(
    () => ({
      autocompleteRuntime,
      autocompleteControlPort,
    }),
    [autocompleteControlPort, autocompleteRuntime]
  );
};
