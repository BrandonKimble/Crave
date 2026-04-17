import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import {
  useSearchResultsPanelChromeRuntime,
  type SearchResultsPanelChromeRuntime,
} from './use-search-results-panel-chrome-runtime';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import {
  useSearchResultsPanelListLayoutRuntime,
  type SearchResultsPanelListLayoutRuntime,
} from './use-search-results-panel-list-layout-runtime';
import { useSearchResultsPanelListPublicationRuntime } from './use-search-results-panel-list-publication-runtime';
import {
  useSearchResultsPanelListSelectorsRuntime,
  type SearchResultsPanelListSelectorsRuntime,
} from './use-search-results-panel-list-selectors-runtime';

type UseSearchResultsPanelReadModelRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  | 'searchRuntimeBus'
  | 'resultsSheetRuntime'
  | 'searchInteractionRef'
  | 'shouldDisableSearchBlur'
  | 'mapQueryBudget'
  | 'overlayHeaderActionProgress'
  | 'shouldLogResultsViewability'
  | 'onRuntimeMechanismEvent'
  | 'phaseBMaterializerRef'
> & {
  panelDataRuntime: SearchResultsPanelDataRuntime;
};

export type SearchResultsPanelReadModelRuntime = {
  shouldDisableFiltersHeader: SearchResultsPanelChromeRuntime['shouldDisableFiltersHeader'];
  shouldDisableResultsHeader: SearchResultsPanelChromeRuntime['shouldDisableResultsHeader'];
  shouldUsePlaceholderRows: SearchResultsPanelChromeRuntime['shouldUsePlaceholderRows'];
  hasResolvedResults: SearchResultsPanelChromeRuntime['hasResolvedResults'];
  shouldFreezeResultsChrome: SearchResultsPanelChromeRuntime['shouldFreezeResultsChrome'];
  listHeader: SearchResultsPanelChromeRuntime['listHeader'];
  effectiveFiltersHeaderHeightBase: SearchResultsPanelChromeRuntime['effectiveFiltersHeaderHeightBase'];
  effectiveResultsHeaderHeightForRender: SearchResultsPanelChromeRuntime['effectiveResultsHeaderHeightForRender'];
  resultsReadModelSelectors: SearchResultsPanelListSelectorsRuntime['resultsReadModelSelectors'];
  resultsRenderItem: SearchResultsPanelListLayoutRuntime['resultsRenderItem'];
  resultsKeyExtractor: SearchResultsPanelListLayoutRuntime['resultsKeyExtractor'];
  estimatedItemSize: SearchResultsPanelListLayoutRuntime['estimatedItemSize'];
  getResultItemType: SearchResultsPanelListLayoutRuntime['getResultItemType'];
  overrideItemLayout: SearchResultsPanelListLayoutRuntime['overrideItemLayout'];
};

export const useSearchResultsPanelReadModelRuntime = ({
  searchRuntimeBus,
  resultsSheetRuntime,
  searchInteractionRef,
  shouldDisableSearchBlur,
  mapQueryBudget,
  overlayHeaderActionProgress,
  shouldLogResultsViewability,
  onRuntimeMechanismEvent,
  phaseBMaterializerRef,
  panelDataRuntime,
}: UseSearchResultsPanelReadModelRuntimeArgs): SearchResultsPanelReadModelRuntime => {
  const chromeRuntime = useSearchResultsPanelChromeRuntime({
    panelDataRuntime,
    shouldDisableSearchBlur,
  });
  const listSelectorsRuntime = useSearchResultsPanelListSelectorsRuntime({
    resultsSheetRuntime,
    searchInteractionRef,
    mapQueryBudget,
    overlayHeaderActionProgress,
    shouldLogResultsViewability,
    onRuntimeMechanismEvent,
    phaseBMaterializerRef,
    panelDataRuntime,
    chromeRuntime,
  });
  useSearchResultsPanelListPublicationRuntime({
    searchRuntimeBus,
    resolvedResults: panelDataRuntime.resolvedResults,
    resultsHydrationKey: panelDataRuntime.resultsHydrationKey,
    hydratedResultsKey: panelDataRuntime.hydratedResultsKey,
    shouldHydrateResultsForRender: panelDataRuntime.shouldHydrateResultsForRender,
    resultsReadModelSelectors: listSelectorsRuntime.resultsReadModelSelectors,
  });
  const listLayoutRuntime = useSearchResultsPanelListLayoutRuntime({
    activeTab: panelDataRuntime.activeTab,
    shouldUsePlaceholderRows: chromeRuntime.shouldUsePlaceholderRows,
    resultsReadModelSelectors: listSelectorsRuntime.resultsReadModelSelectors,
  });

  return React.useMemo(
    () => ({
      shouldDisableFiltersHeader: chromeRuntime.shouldDisableFiltersHeader,
      shouldDisableResultsHeader: chromeRuntime.shouldDisableResultsHeader,
      shouldUsePlaceholderRows: chromeRuntime.shouldUsePlaceholderRows,
      hasResolvedResults: chromeRuntime.hasResolvedResults,
      shouldFreezeResultsChrome: chromeRuntime.shouldFreezeResultsChrome,
      listHeader: chromeRuntime.listHeader,
      effectiveFiltersHeaderHeightBase: chromeRuntime.effectiveFiltersHeaderHeightBase,
      effectiveResultsHeaderHeightForRender: chromeRuntime.effectiveResultsHeaderHeightForRender,
      resultsReadModelSelectors: listSelectorsRuntime.resultsReadModelSelectors,
      resultsRenderItem: listLayoutRuntime.resultsRenderItem,
      resultsKeyExtractor: listLayoutRuntime.resultsKeyExtractor,
      estimatedItemSize: listLayoutRuntime.estimatedItemSize,
      getResultItemType: listLayoutRuntime.getResultItemType,
      overrideItemLayout: listLayoutRuntime.overrideItemLayout,
    }),
    [chromeRuntime, listLayoutRuntime, listSelectorsRuntime]
  );
};
