import React from 'react';

import { createSearchRootPrimitivesRuntimeValue } from '../controller/search-root-primitives-runtime';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import type { SearchRootBootstrapEnvironment } from './search-root-environment-contract';
import type { SearchPrimitiveUiStateController } from './search-primitive-ui-state-controller';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';
import { useSearchRootMapPrimitivesRuntime } from './use-search-root-map-primitives-runtime';
import { useSearchRootSearchPrimitivesRuntime } from './use-search-root-search-primitives-runtime';

type UseSearchRootPrimitivesRuntimeArgs = Pick<SearchRootBootstrapEnvironment, 'startupCamera'> & {
  primitiveUiStateController: SearchPrimitiveUiStateController;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
};

export const useSearchRootPrimitivesRuntime = ({
  startupCamera,
  primitiveUiStateController,
  suggestionPanelStateController,
}: UseSearchRootPrimitivesRuntimeArgs): SearchRootPrimitivesRuntime => {
  const mapState = useSearchRootMapPrimitivesRuntime({
    startupCamera,
  });
  const searchState = useSearchRootSearchPrimitivesRuntime({
    primitiveUiStateController,
    suggestionPanelStateController,
  });

  return React.useMemo(
    () =>
      createSearchRootPrimitivesRuntimeValue({
        mapState,
        searchState,
      }),
    [mapState, searchState]
  );
};
