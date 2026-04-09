import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { OVERLAY_TAB_HEADER_HEIGHT } from '../../../../overlays/overlaySheetStyles';
import { RESULTS_BOTTOM_PADDING } from '../../constants/search';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import type { SearchResultsPanelRenderPolicyRuntime } from './use-search-results-panel-render-policy-runtime';
import type { SearchResultsPanelReadModelRuntime } from './use-search-results-panel-read-model-runtime';

const HIDDEN_SCROLL_HEADER_STYLE: ViewStyle = { opacity: 0 };

type UseSearchResultsPanelCoveredRenderRuntimeArgs = {
  panelDataRuntime: SearchResultsPanelDataRuntime;
  readModelRuntime: SearchResultsPanelReadModelRuntime;
  renderPolicyRuntime: SearchResultsPanelRenderPolicyRuntime;
};

export type SearchResultsPanelCoveredRenderRuntime = {
  activeList: 'primary' | 'secondary';
  primaryRowsForRender: ResultsListItem[];
  secondaryRowsForRender: ResultsListItem[];
  effectiveFiltersHeaderHeightForRender: number;
  resolvedResultsHeaderHeightForRender: number;
  scrollHeaderForRender: React.ReactNode;
  resultsContentContainerStyle: {
    paddingBottom: number;
  };
};

export const useSearchResultsPanelCoveredRenderRuntime = ({
  panelDataRuntime,
  readModelRuntime,
  renderPolicyRuntime,
}: UseSearchResultsPanelCoveredRenderRuntimeArgs): SearchResultsPanelCoveredRenderRuntime => {
  const { activeTab } = panelDataRuntime;
  const {
    shouldFreezeResultsChrome,
    listHeader,
    effectiveFiltersHeaderHeightBase,
    effectiveResultsHeaderHeightForRender,
    resultsReadModelSelectors,
  } = readModelRuntime;
  const {
    shouldShowInteractionLoadingState,
    shouldFreezeCoveredResultsRender,
    shouldHideScrollHeaderForSurface,
  } = renderPolicyRuntime;

  const primaryTab: 'restaurants' | 'dishes' = 'restaurants';
  const secondaryTab: 'restaurants' | 'dishes' = 'dishes';
  const activeListLive: 'primary' | 'secondary' =
    activeTab === primaryTab ? 'primary' : 'secondary';
  const primaryRowsLive = resultsReadModelSelectors.rowsByTab[primaryTab];
  const secondaryRowsLive = resultsReadModelSelectors.rowsByTab[secondaryTab];
  const hasRenderableRowsLive = resultsReadModelSelectors.rowsByTab[activeTab].length > 0;
  const shouldForceListHeaderForInteraction = shouldShowInteractionLoadingState;
  const listHeaderForRenderLive =
    hasRenderableRowsLive || shouldForceListHeaderForInteraction
      ? shouldFreezeResultsChrome
        ? listHeader
        : listHeader
      : null;
  const effectiveFiltersHeaderHeightForRenderLive =
    hasRenderableRowsLive || shouldForceListHeaderForInteraction
      ? effectiveFiltersHeaderHeightBase
      : 0;

  const scrollHeaderForRenderLive = React.useMemo(() => {
    if (!listHeaderForRenderLive) {
      return null;
    }
    if (!shouldHideScrollHeaderForSurface) {
      return listHeaderForRenderLive;
    }
    return (
      <View pointerEvents="none" style={HIDDEN_SCROLL_HEADER_STYLE}>
        {listHeaderForRenderLive}
      </View>
    );
  }, [listHeaderForRenderLive, shouldHideScrollHeaderForSurface]);

  const coveredResultsRenderSnapshotRef = React.useRef<{
    activeList: 'primary' | 'secondary';
    primaryRows: ResultsListItem[];
    secondaryRows: ResultsListItem[];
    scrollHeaderForRender: React.ReactNode;
    effectiveFiltersHeaderHeightForRender: number;
    renderRowCount: number;
    contentContainerPaddingBottom: number;
  } | null>(null);
  if (!shouldFreezeCoveredResultsRender || !coveredResultsRenderSnapshotRef.current) {
    coveredResultsRenderSnapshotRef.current = {
      activeList: activeListLive,
      primaryRows: primaryRowsLive,
      secondaryRows: secondaryRowsLive,
      scrollHeaderForRender: scrollHeaderForRenderLive,
      effectiveFiltersHeaderHeightForRender: effectiveFiltersHeaderHeightForRenderLive,
      renderRowCount: resultsReadModelSelectors.rowsByTab[activeTab].length,
      contentContainerPaddingBottom:
        resultsReadModelSelectors.rowsByTab[activeTab].length > 0 ? RESULTS_BOTTOM_PADDING : 0,
    };
  }
  const coveredResultsRenderSnapshot = coveredResultsRenderSnapshotRef.current;
  const activeList = shouldFreezeCoveredResultsRender
    ? coveredResultsRenderSnapshot?.activeList ?? activeListLive
    : activeListLive;
  const primaryRowsForRender = shouldFreezeCoveredResultsRender
    ? coveredResultsRenderSnapshot?.primaryRows ?? primaryRowsLive
    : primaryRowsLive;
  const secondaryRowsForRender = shouldFreezeCoveredResultsRender
    ? coveredResultsRenderSnapshot?.secondaryRows ?? secondaryRowsLive
    : secondaryRowsLive;
  const scrollHeaderForRender = shouldFreezeCoveredResultsRender
    ? coveredResultsRenderSnapshot?.scrollHeaderForRender ?? scrollHeaderForRenderLive
    : scrollHeaderForRenderLive;
  const effectiveFiltersHeaderHeightForRender = shouldFreezeCoveredResultsRender
    ? coveredResultsRenderSnapshot?.effectiveFiltersHeaderHeightForRender ??
      effectiveFiltersHeaderHeightForRenderLive
    : effectiveFiltersHeaderHeightForRenderLive;
  const renderRowCountForRender = shouldFreezeCoveredResultsRender
    ? coveredResultsRenderSnapshot?.renderRowCount ??
      resultsReadModelSelectors.rowsByTab[activeTab].length
    : resultsReadModelSelectors.rowsByTab[activeTab].length;

  const resultsContentContainerStyle = React.useMemo(
    () => ({
      paddingBottom: shouldFreezeCoveredResultsRender
        ? coveredResultsRenderSnapshot?.contentContainerPaddingBottom ?? 0
        : renderRowCountForRender > 0
        ? RESULTS_BOTTOM_PADDING
        : 0,
    }),
    [coveredResultsRenderSnapshot, renderRowCountForRender, shouldFreezeCoveredResultsRender]
  );

  const resolvedResultsHeaderHeightForRender =
    effectiveResultsHeaderHeightForRender || OVERLAY_TAB_HEADER_HEIGHT;

  return React.useMemo(
    () => ({
      activeList,
      primaryRowsForRender,
      secondaryRowsForRender,
      effectiveFiltersHeaderHeightForRender,
      resolvedResultsHeaderHeightForRender,
      scrollHeaderForRender,
      resultsContentContainerStyle,
    }),
    [
      activeList,
      effectiveFiltersHeaderHeightForRender,
      primaryRowsForRender,
      resolvedResultsHeaderHeightForRender,
      resultsContentContainerStyle,
      scrollHeaderForRender,
      secondaryRowsForRender,
    ]
  );
};
