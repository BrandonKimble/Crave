import React from 'react';

import type { SearchRankAndScoreSheetsProps } from '../../components/SearchRankAndScoreSheets';
import {
  ACTIVE_TAB_COLOR,
  ACTIVE_TAB_COLOR_DARK,
  SCORE_INFO_MAX_HEIGHT,
} from '../../constants/search';
import { formatCompactCount } from '../../utils/format';

type UseSearchRankAndScoreSheetsPropsArgs = Omit<
  SearchRankAndScoreSheetsProps,
  'activeTabColor' | 'activeTabColorDark' | 'scoreInfoMaxHeight' | 'formatCompactCount'
>;

export const useSearchRankAndScoreSheetsProps = ({
  rankSheetRef,
  isRankSelectorVisible,
  closeRankSelector,
  dismissRankSelector,
  pendingScoreMode,
  setPendingScoreMode,
  handleRankDone,
  isScoreInfoVisible,
  scoreInfo,
  closeScoreInfo,
  clearScoreInfo,
  onProfilerRender,
}: UseSearchRankAndScoreSheetsPropsArgs): SearchRankAndScoreSheetsProps =>
  React.useMemo(
    () => ({
      rankSheetRef,
      isRankSelectorVisible,
      closeRankSelector,
      dismissRankSelector,
      pendingScoreMode,
      setPendingScoreMode,
      handleRankDone,
      activeTabColor: ACTIVE_TAB_COLOR,
      activeTabColorDark: ACTIVE_TAB_COLOR_DARK,
      isScoreInfoVisible,
      scoreInfo,
      closeScoreInfo,
      clearScoreInfo,
      scoreInfoMaxHeight: SCORE_INFO_MAX_HEIGHT,
      formatCompactCount,
      onProfilerRender,
    }),
    [
      clearScoreInfo,
      closeRankSelector,
      closeScoreInfo,
      dismissRankSelector,
      handleRankDone,
      isRankSelectorVisible,
      isScoreInfoVisible,
      onProfilerRender,
      pendingScoreMode,
      rankSheetRef,
      scoreInfo,
      setPendingScoreMode,
    ]
  );
