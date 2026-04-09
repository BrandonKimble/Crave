import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';
import styles from '../../styles';

type UseSearchResultsPanelChromeRuntimeArgs = {
  panelDataRuntime: SearchResultsPanelDataRuntime;
  shouldDisableSearchBlur: boolean;
};

export type SearchResultsPanelChromeRuntime = {
  shouldDisableFiltersHeader: boolean;
  shouldDisableResultsHeader: boolean;
  shouldUsePlaceholderRows: boolean;
  hasResolvedResults: boolean;
  shouldFreezeResultsChrome: boolean;
  listHeader: React.ReactNode;
  effectiveFiltersHeaderHeightBase: number;
  effectiveResultsHeaderHeightForRender: number;
  shouldUseResultsHeaderBlurForRender: boolean;
  submittedQueryForReadModel: string;
  handleResultsHeaderLayout: (event: LayoutChangeEvent) => void;
};

export const useSearchResultsPanelChromeRuntime = ({
  panelDataRuntime,
  shouldDisableSearchBlur,
}: UseSearchResultsPanelChromeRuntimeArgs): SearchResultsPanelChromeRuntime => {
  const { submittedQuery, isRunOneChromeDeferred, filtersHeader, resolvedResults } =
    panelDataRuntime;

  const shouldDisableFiltersHeader = false;
  const shouldDisableResultsHeader = false;
  const shouldUsePlaceholderRows = false;

  const [resultsSheetHeaderHeight, setResultsSheetHeaderHeight] = React.useState(0);
  const [filtersHeaderHeight, setFiltersHeaderHeight] = React.useState(0);

  const hasResolvedResults = resolvedResults != null;
  const effectiveFiltersHeaderHeight = shouldDisableFiltersHeader ? 0 : filtersHeaderHeight;
  const effectiveResultsHeaderHeight = shouldDisableResultsHeader ? 0 : resultsSheetHeaderHeight;

  const handleResultsHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (shouldDisableResultsHeader) {
        return;
      }
      const nextHeight = event.nativeEvent.layout.height;
      setResultsSheetHeaderHeight((previous) =>
        Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
      );
    },
    [shouldDisableResultsHeader]
  );

  const handleFiltersHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (shouldDisableFiltersHeader) {
        return;
      }
      const nextHeight = event.nativeEvent.layout.height;
      setFiltersHeaderHeight((previous) =>
        Math.abs(previous - nextHeight) < 0.5 ? previous : nextHeight
      );
    },
    [shouldDisableFiltersHeader]
  );

  const shouldUseResultsHeaderBlur = !shouldDisableSearchBlur;
  const listHeader = React.useMemo(() => {
    if (shouldDisableFiltersHeader) {
      return null;
    }
    return (
      <View style={styles.resultsListHeader} onLayout={handleFiltersHeaderLayout}>
        {filtersHeader}
        <View style={styles.resultsListHeaderBottomStrip} />
      </View>
    );
  }, [filtersHeader, handleFiltersHeaderLayout, shouldDisableFiltersHeader]);

  const shouldFreezeResultsChrome = isRunOneChromeDeferred && !hasResolvedResults;
  const frozenResultsChromeSnapshotRef = React.useRef<{
    listHeader: React.ReactNode;
    submittedQuery: string;
    effectiveFiltersHeaderHeight: number;
    effectiveResultsHeaderHeight: number;
    shouldUseResultsHeaderBlur: boolean;
  } | null>(null);

  if (!shouldFreezeResultsChrome || !frozenResultsChromeSnapshotRef.current) {
    frozenResultsChromeSnapshotRef.current = {
      listHeader,
      submittedQuery,
      effectiveFiltersHeaderHeight,
      effectiveResultsHeaderHeight,
      shouldUseResultsHeaderBlur,
    };
  }

  const frozenResultsChromeSnapshot = frozenResultsChromeSnapshotRef.current;
  const submittedQueryForReadModel = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.submittedQuery ?? submittedQuery
    : submittedQuery;
  const effectiveFiltersHeaderHeightBase = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.effectiveFiltersHeaderHeight ?? effectiveFiltersHeaderHeight
    : effectiveFiltersHeaderHeight;
  const effectiveResultsHeaderHeightForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.effectiveResultsHeaderHeight ?? effectiveResultsHeaderHeight
    : effectiveResultsHeaderHeight;
  const shouldUseResultsHeaderBlurForRender = shouldFreezeResultsChrome
    ? frozenResultsChromeSnapshot?.shouldUseResultsHeaderBlur ?? shouldUseResultsHeaderBlur
    : shouldUseResultsHeaderBlur;

  return React.useMemo(
    () => ({
      shouldDisableFiltersHeader,
      shouldDisableResultsHeader,
      shouldUsePlaceholderRows,
      hasResolvedResults,
      shouldFreezeResultsChrome,
      listHeader,
      effectiveFiltersHeaderHeightBase,
      effectiveResultsHeaderHeightForRender,
      shouldUseResultsHeaderBlurForRender,
      submittedQueryForReadModel,
      handleResultsHeaderLayout,
    }),
    [
      effectiveFiltersHeaderHeightBase,
      effectiveResultsHeaderHeightForRender,
      handleResultsHeaderLayout,
      hasResolvedResults,
      listHeader,
      shouldDisableFiltersHeader,
      shouldDisableResultsHeader,
      shouldFreezeResultsChrome,
      shouldUsePlaceholderRows,
      shouldUseResultsHeaderBlurForRender,
      submittedQueryForReadModel,
    ]
  );
};
