import React from 'react';

import { SCORE_INFO_MAX_HEIGHT } from '../../constants/search';
import { formatCompactCount } from '../../utils/format';
import type { SearchAppShellRankAndScoreModalLayerModel } from './search-app-shell-render-contract';
import type { SearchRootOverlayHostRuntimeParams } from './search-root-overlay-host-runtime-contract';

export const useSearchRootOverlayRankAndScoreModalLayerRuntime = ({
  rootOverlayFoundationRuntime,
  filterModalControlLane,
}: Pick<
  SearchRootOverlayHostRuntimeParams,
  'rootOverlayFoundationRuntime' | 'filterModalControlLane'
>): SearchAppShellRankAndScoreModalLayerModel =>
  React.useMemo(
    () => ({
      rankAndScoreSheetsProps: {
        isScoreInfoVisible:
          filterModalControlLane.filterModalRuntime.isScoreInfoVisible,
        scoreInfo: filterModalControlLane.filterModalRuntime.scoreInfo,
        closeScoreInfo: filterModalControlLane.filterModalRuntime.closeScoreInfo,
        clearScoreInfo: filterModalControlLane.filterModalRuntime.clearScoreInfo,
        scoreInfoMaxHeight: SCORE_INFO_MAX_HEIGHT,
        formatCompactCount,
        onProfilerRender:
          rootOverlayFoundationRuntime.rootInstrumentationRuntime
            .handleProfilerRender,
      },
      onProfilerRender:
        rootOverlayFoundationRuntime.rootInstrumentationRuntime
          .handleProfilerRender,
    }),
    [
      filterModalControlLane.filterModalRuntime.clearScoreInfo,
      filterModalControlLane.filterModalRuntime.closeScoreInfo,
      filterModalControlLane.filterModalRuntime.isScoreInfoVisible,
      filterModalControlLane.filterModalRuntime.scoreInfo,
      rootOverlayFoundationRuntime.rootInstrumentationRuntime
        .handleProfilerRender,
    ]
  );
