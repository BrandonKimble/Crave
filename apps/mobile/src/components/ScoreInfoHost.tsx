import React from 'react';

import SearchRankAndScoreSheets from '../screens/Search/components/SearchRankAndScoreSheets';
import { SCORE_INFO_MAX_HEIGHT } from '../screens/Search/constants/search';
import { formatCompactCount } from '../screens/Search/utils/format';
import { scoreInfoStore } from './score-info-store';
import { useSingletonSurfaceHost } from './singleton-surface-store';

const noop = (): void => undefined;

/**
 * Root host for the imperative score-info sheet (see score-info-store.ts).
 * Mounted ONCE beside AppModalHost/OptionSelectorHost so the sheet is
 * viewport-anchored on every surface. Renders the ONE canonical score sheet
 * (SearchRankAndScoreSheets) with its sort-selector half inert — sort lives on
 * each surface's own strip. Keeps the last payload through the exit animation
 * so the content doesn't blank mid-slide-out.
 */
export const ScoreInfoHost: React.FC = () => {
  const {
    visible,
    rendered: renderedPayload,
    requestClose,
  } = useSingletonSurfaceHost(scoreInfoStore);
  if (renderedPayload == null) {
    return null;
  }
  return (
    <SearchRankAndScoreSheets
      isScoreInfoVisible={visible}
      scoreInfo={renderedPayload}
      closeScoreInfo={requestClose}
      clearScoreInfo={noop}
      scoreInfoMaxHeight={SCORE_INFO_MAX_HEIGHT}
      formatCompactCount={formatCompactCount}
      isSortSelectorVisible={false}
      sortMode="best"
      onSortSelect={noop}
      closeSortSelector={noop}
      onProfilerRender={null}
    />
  );
};
