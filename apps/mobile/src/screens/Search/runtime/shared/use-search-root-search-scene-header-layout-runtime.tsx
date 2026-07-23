import React from 'react';
import type { LayoutChangeEvent } from 'react-native';

// L1 (THE PAGE): the results header height is the COMPUTED chrome fact
// (computeSceneChromeHeight('search')) — the measured results-header lane is DELETED
// (strip-band seam law §4: no measured lanes). Only the filters header keeps a
// measured height (its box is genuinely content-driven).
export const useSearchRootSearchSceneHeaderLayoutRuntime = () => {
  const [effectiveFiltersHeaderHeight, setFiltersHeaderHeight] = React.useState(0);

  const handleFiltersHeaderLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setFiltersHeaderHeight((previous) =>
      Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
    );
  }, []);

  return React.useMemo(
    () => ({
      effectiveFiltersHeaderHeight,
      handleFiltersHeaderLayout,
    }),
    [effectiveFiltersHeaderHeight, handleFiltersHeaderLayout]
  );
};
