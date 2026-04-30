import React from 'react';
import type { LayoutChangeEvent } from 'react-native';

export const useSearchRootSearchSceneHeaderLayoutRuntime = () => {
  const [effectiveResultsHeaderHeight, setResultsHeaderHeight] =
    React.useState(0);
  const [effectiveFiltersHeaderHeight, setFiltersHeaderHeight] =
    React.useState(0);

  const handleResultsHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      setResultsHeaderHeight((previous) =>
        Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
      );
    },
    []
  );
  const handleFiltersHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      setFiltersHeaderHeight((previous) =>
        Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
      );
    },
    []
  );

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
