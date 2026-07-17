import React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { computeSceneChromeHeight } from '../../../../navigation/runtime/scene-chrome-geometry';

export const useSearchRootSearchSceneHeaderLayoutRuntime = () => {
  // L1 (THE PAGE): the results header height is the COMPUTED chrome fact — the measured
  // feed from the hoisted chrome died with the retained-height authority. The setter
  // lane below is UNFED for the results header (kept only because the runtime contract
  // threads it through the read models; the search-family migration slice deletes the
  // whole thread).
  const [effectiveResultsHeaderHeight, setResultsHeaderHeight] = React.useState(
    computeSceneChromeHeight('search')
  );
  const [effectiveFiltersHeaderHeight, setFiltersHeaderHeight] = React.useState(0);

  const handleResultsHeaderLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setResultsHeaderHeight((previous) =>
      Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
    );
  }, []);
  const handleFiltersHeaderLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setFiltersHeaderHeight((previous) =>
      Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
    );
  }, []);

  return React.useMemo(
    () => ({
      effectiveFiltersHeaderHeight,
      effectiveResultsHeaderHeight,
      handleFiltersHeaderLayout,
      handleResultsHeaderLayout,
    }),
    [
      effectiveFiltersHeaderHeight,
      effectiveResultsHeaderHeight,
      handleFiltersHeaderLayout,
      handleResultsHeaderLayout,
    ]
  );
};
