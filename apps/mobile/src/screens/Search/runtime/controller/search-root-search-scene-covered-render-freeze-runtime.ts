import React from 'react';

import { RESULTS_BOTTOM_PADDING } from '../../constants/search';

type SearchRootSearchSceneCoveredRenderFreezeInput = {
  shouldFreezeCoveredResultsRender: boolean;
  activeListLive: 'primary' | 'secondary';
  primaryRowsLive: ReadonlyArray<any>;
  secondaryRowsLive: ReadonlyArray<any>;
  scrollHeaderForRenderLive: React.ReactNode;
  effectiveFiltersHeaderHeightForRenderLive: number;
  renderRowCountLive: number;
};

type SearchRootSearchSceneCoveredRenderFreezeSnapshot = {
  activeList: SearchRootSearchSceneCoveredRenderFreezeInput['activeListLive'];
  primaryRows: SearchRootSearchSceneCoveredRenderFreezeInput['primaryRowsLive'];
  secondaryRows: SearchRootSearchSceneCoveredRenderFreezeInput['secondaryRowsLive'];
  scrollHeaderForRender: React.ReactNode;
  effectiveFiltersHeaderHeightForRender: number;
  renderRowCount: number;
  contentContainerPaddingBottom: number;
};

export const createSearchRootSearchSceneCoveredRenderFreezeRuntime = () => {
  let coveredResultsRenderSnapshot: SearchRootSearchSceneCoveredRenderFreezeSnapshot | null =
    null;

  return {
    resolve: ({
      shouldFreezeCoveredResultsRender,
      activeListLive,
      primaryRowsLive,
      secondaryRowsLive,
      scrollHeaderForRenderLive,
      effectiveFiltersHeaderHeightForRenderLive,
      renderRowCountLive,
    }: SearchRootSearchSceneCoveredRenderFreezeInput) => {
      if (!shouldFreezeCoveredResultsRender || !coveredResultsRenderSnapshot) {
        coveredResultsRenderSnapshot = {
          activeList: activeListLive,
          primaryRows: primaryRowsLive,
          secondaryRows: secondaryRowsLive,
          scrollHeaderForRender: scrollHeaderForRenderLive,
          effectiveFiltersHeaderHeightForRender:
            effectiveFiltersHeaderHeightForRenderLive,
          renderRowCount: renderRowCountLive,
          contentContainerPaddingBottom:
            renderRowCountLive > 0 ? RESULTS_BOTTOM_PADDING : 0,
        };
      }

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
        ? coveredResultsRenderSnapshot?.scrollHeaderForRender ??
          scrollHeaderForRenderLive
        : scrollHeaderForRenderLive;
      const effectiveFiltersHeaderHeightForRender =
        shouldFreezeCoveredResultsRender
          ? coveredResultsRenderSnapshot?.effectiveFiltersHeaderHeightForRender ??
            effectiveFiltersHeaderHeightForRenderLive
          : effectiveFiltersHeaderHeightForRenderLive;
      const renderRowCountForRender = shouldFreezeCoveredResultsRender
        ? coveredResultsRenderSnapshot?.renderRowCount ?? renderRowCountLive
        : renderRowCountLive;

      return {
        activeList,
        effectiveFiltersHeaderHeightForRender,
        primaryRowsForRender,
        resultsContentContainerStyle: {
          paddingBottom: shouldFreezeCoveredResultsRender
            ? coveredResultsRenderSnapshot?.contentContainerPaddingBottom ?? 0
            : renderRowCountForRender > 0
              ? RESULTS_BOTTOM_PADDING
              : 0,
        },
        scrollHeaderForRender,
        secondaryRowsForRender,
      };
    },
  };
};
