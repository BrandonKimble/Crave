import React from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { Text } from '../../../../components';
import OverlayHeaderActionButton from '../../../../overlays/OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from '../../../../overlays/OverlaySheetHeaderChrome';
import styles from '../../styles';
import { measureSearchResultsHeaderChromeBoundary } from './search-result-row-header-chrome-boundary-telemetry';
import { useSearchSurfaceRuntimeSelector } from '../surface/search-surface-runtime';

type SearchResultsPageHeaderSnapshot = {
  headerTitle: string;
  contentHorizontalPadding: number;
  activeTabColor: string;
  overlayHeaderActionProgress: SharedValue<number>;
  handleCloseResults: () => void;
  handleResultsHeaderLayout: (event: LayoutChangeEvent) => void;
};

type UseSearchResultsPageHeaderRuntimeArgs = {
  shouldDisableResultsHeader: boolean;
  headerTitle: string;
  contentHorizontalPadding: number;
  activeTabColor: string;
  overlayHeaderActionProgress: SharedValue<number>;
  handleCloseResults: () => void;
  handleResultsHeaderLayout: (event: LayoutChangeEvent) => void;
};

const SearchResultsPageHeader = React.memo(
  ({ model }: { model: SearchResultsPageHeaderSnapshot }) => {
    const headerChromeBoundaryRef = React.useRef<View | null>(null);
    const handleHeaderChromeBoundaryLayout = React.useCallback(
      (event: LayoutChangeEvent) => {
        model.handleResultsHeaderLayout(event);
        measureSearchResultsHeaderChromeBoundary(headerChromeBoundaryRef);
      },
      [model]
    );
    const actionButton = React.useMemo(
      () => (
        <OverlayHeaderActionButton
          progress={model.overlayHeaderActionProgress}
          onPress={model.handleCloseResults}
          accessibilityLabel="Close results"
          accentColor={model.activeTabColor}
          closeColor="#000000"
        />
      ),
      [model.activeTabColor, model.handleCloseResults, model.overlayHeaderActionProgress]
    );
    return (
      <View
        ref={headerChromeBoundaryRef}
        collapsable={false}
        onLayout={handleHeaderChromeBoundaryLayout}
      >
        <OverlaySheetHeaderChrome
          onGrabHandlePress={model.handleCloseResults}
          grabHandleAccessibilityLabel="Hide results"
          paddingHorizontal={model.contentHorizontalPadding}
          style={styles.resultsHeaderSurface}
          title={
            <Text
              variant="title"
              weight="semibold"
              style={styles.submittedQueryLabel}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {model.headerTitle}
            </Text>
          }
          actionButton={actionButton}
          showDivider={false}
        />
      </View>
    );
  }
);

SearchResultsPageHeader.displayName = 'SearchResultsPageHeader';

export const useSearchResultsPageHeaderRuntime = ({
  shouldDisableResultsHeader,
  headerTitle,
  contentHorizontalPadding,
  activeTabColor,
  overlayHeaderActionProgress,
  handleCloseResults,
  handleResultsHeaderLayout,
}: UseSearchResultsPageHeaderRuntimeArgs): React.ReactNode => {
  const shouldRetainResultsPage = useSearchSurfaceRuntimeSelector(
    React.useCallback(
      (surfaceSnapshot) =>
        surfaceSnapshot.activeBundle.kind === 'results' || surfaceSnapshot.heldBundle != null,
      []
    )
  );
  const retainedModelRef = React.useRef<SearchResultsPageHeaderSnapshot | null>(null);
  const liveModel = React.useMemo<SearchResultsPageHeaderSnapshot>(() => {
    const retainedHeaderTitle = retainedModelRef.current?.headerTitle;
    const resolvedHeaderTitle =
      headerTitle.trim().length > 0 ? headerTitle : (retainedHeaderTitle ?? 'Results');
    return {
      headerTitle: resolvedHeaderTitle,
      contentHorizontalPadding,
      activeTabColor,
      overlayHeaderActionProgress,
      handleCloseResults,
      handleResultsHeaderLayout,
    };
  }, [
    activeTabColor,
    contentHorizontalPadding,
    handleCloseResults,
    handleResultsHeaderLayout,
    headerTitle,
    overlayHeaderActionProgress,
    shouldDisableResultsHeader,
    shouldRetainResultsPage,
  ]);

  retainedModelRef.current = liveModel;

  return React.useMemo(() => <SearchResultsPageHeader model={liveModel} />, [liveModel]);
};
