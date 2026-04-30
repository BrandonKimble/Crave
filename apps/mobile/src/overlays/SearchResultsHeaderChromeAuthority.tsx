import React from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Text } from '../components';
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import styles from '../screens/Search/styles';
import OverlayHeaderActionButton from './OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from './OverlaySheetHeaderChrome';
import { bottomSheetSceneStackHostStyles } from './bottomSheetSceneStackHostStyles';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';

type SearchResultsHeaderChromeSnapshot = {
  shouldRender: boolean;
  shouldUseBlur: boolean;
  headerTitle: string;
  contentHorizontalPadding: number;
  activeTabColor: string;
  overlayHeaderActionProgress: SharedValue<number> | null;
  headerDividerAnimatedStyle: StyleProp<ViewStyle> | null;
};

type SearchResultsHeaderChromeHandlers = {
  handleCloseResults: () => void;
  handleResultsHeaderLayout: (event: LayoutChangeEvent) => void;
};

type Listener = () => void;

type SearchResultsHeaderChromePublicationRuntimeArgs = {
  shouldDisableResultsHeader: boolean;
  shouldUseResultsHeaderBlur: boolean;
  headerTitle: string;
  contentHorizontalPadding: number;
  activeTabColor: string;
  overlayHeaderActionProgress: SharedValue<number>;
  headerDividerAnimatedStyle: StyleProp<ViewStyle>;
  handleCloseResults: () => void;
  handleResultsHeaderLayout: (event: LayoutChangeEvent) => void;
};

const noop = () => {};

const EMPTY_SEARCH_RESULTS_HEADER_CHROME_SNAPSHOT: SearchResultsHeaderChromeSnapshot = {
  shouldRender: false,
  shouldUseBlur: true,
  headerTitle: '',
  contentHorizontalPadding: 0,
  activeTabColor: '#000000',
  overlayHeaderActionProgress: null,
  headerDividerAnimatedStyle: null,
};

const listeners = new Set<Listener>();
let snapshot: SearchResultsHeaderChromeSnapshot = EMPTY_SEARCH_RESULTS_HEADER_CHROME_SNAPSHOT;
let handlers: SearchResultsHeaderChromeHandlers = {
  handleCloseResults: noop,
  handleResultsHeaderLayout: noop,
};

const areSearchResultsHeaderChromeSnapshotsEqual = (
  left: SearchResultsHeaderChromeSnapshot,
  right: SearchResultsHeaderChromeSnapshot
): boolean =>
  left === right ||
  (left.shouldRender === right.shouldRender &&
    left.shouldUseBlur === right.shouldUseBlur &&
    left.headerTitle === right.headerTitle &&
    left.contentHorizontalPadding === right.contentHorizontalPadding &&
    left.activeTabColor === right.activeTabColor &&
    left.overlayHeaderActionProgress === right.overlayHeaderActionProgress &&
    left.headerDividerAnimatedStyle === right.headerDividerAnimatedStyle);

const notifySearchResultsHeaderChromeListeners = (): void => {
  listeners.forEach((listener) => {
    listener();
  });
};

const updateSearchResultsHeaderChromeHandlers = (
  nextHandlers: SearchResultsHeaderChromeHandlers
): void => {
  handlers = nextHandlers;
};

const publishSearchResultsHeaderChromeSnapshot = (
  nextSnapshot: SearchResultsHeaderChromeSnapshot
): void => {
  if (areSearchResultsHeaderChromeSnapshotsEqual(snapshot, nextSnapshot)) {
    return;
  }
  snapshot = nextSnapshot;
  notifySearchResultsHeaderChromeListeners();
};

const clearSearchResultsHeaderChromeSnapshot = (): void => {
  handlers = {
    handleCloseResults: noop,
    handleResultsHeaderLayout: noop,
  };
  publishSearchResultsHeaderChromeSnapshot(EMPTY_SEARCH_RESULTS_HEADER_CHROME_SNAPSHOT);
};

const searchResultsHeaderChromeAuthority = {
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
};

export const useSearchResultsHeaderChromePublicationRuntime = ({
  shouldDisableResultsHeader,
  shouldUseResultsHeaderBlur,
  headerTitle,
  contentHorizontalPadding,
  activeTabColor,
  overlayHeaderActionProgress,
  headerDividerAnimatedStyle,
  handleCloseResults,
  handleResultsHeaderLayout,
}: SearchResultsHeaderChromePublicationRuntimeArgs): void => {
  const nextSnapshot = React.useMemo<SearchResultsHeaderChromeSnapshot>(
    () => ({
      shouldRender: !shouldDisableResultsHeader,
      shouldUseBlur: shouldUseResultsHeaderBlur,
      headerTitle,
      contentHorizontalPadding,
      activeTabColor,
      overlayHeaderActionProgress,
      headerDividerAnimatedStyle,
    }),
    [
      activeTabColor,
      contentHorizontalPadding,
      headerDividerAnimatedStyle,
      headerTitle,
      overlayHeaderActionProgress,
      shouldDisableResultsHeader,
      shouldUseResultsHeaderBlur,
    ]
  );

  React.useLayoutEffect(() => {
    updateSearchResultsHeaderChromeHandlers({
      handleCloseResults,
      handleResultsHeaderLayout,
    });
  }, [handleCloseResults, handleResultsHeaderLayout]);

  React.useLayoutEffect(() => {
    publishSearchResultsHeaderChromeSnapshot(nextSnapshot);
  }, [nextSnapshot]);

  React.useLayoutEffect(() => clearSearchResultsHeaderChromeSnapshot, []);
};

const SearchResultsHeaderChromeSurface = React.memo(
  ({
    model,
    onHeaderLayout,
    routeSceneDisplayTargetRegistry,
  }: {
    model: SearchResultsHeaderChromeSnapshot;
    onHeaderLayout: (event: LayoutChangeEvent) => void;
    routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  }) => {
    const sceneVisibilityValue = routeSceneDisplayTargetRegistry.getSceneVisibilityValue('search');
    const visibilityStyle = useAnimatedStyle(
      () => {
        const isVisible = sceneVisibilityValue.value > 0.5;
        return {
          display: isVisible ? 'flex' : 'none',
          opacity: sceneVisibilityValue.value,
          zIndex: isVisible ? 4 : 0,
        };
      },
      [sceneVisibilityValue]
    );
    const handleCloseResults = React.useCallback(() => {
      handlers.handleCloseResults();
    }, []);
    const handleHeaderLayout = React.useCallback(
      (event: LayoutChangeEvent) => {
        onHeaderLayout(event);
        handlers.handleResultsHeaderLayout(event);
      },
      [onHeaderLayout]
    );
    const actionButton = React.useMemo(
      () =>
        model.overlayHeaderActionProgress == null ? null : (
          <OverlayHeaderActionButton
            progress={model.overlayHeaderActionProgress}
            onPress={handleCloseResults}
            accessibilityLabel="Close results"
            accentColor={model.activeTabColor}
            closeColor="#000000"
          />
        ),
      [handleCloseResults, model.activeTabColor, model.overlayHeaderActionProgress]
    );
    const afterRow = React.useMemo(
      () => (
        <Animated.View
          pointerEvents="none"
          style={[styles.resultsHeaderBottomSeparator, model.headerDividerAnimatedStyle]}
        />
      ),
      [model.headerDividerAnimatedStyle]
    );

    if (!model.shouldRender || actionButton == null) {
      return null;
    }

    return (
      <Animated.View
        pointerEvents="auto"
        style={[bottomSheetSceneStackHostStyles.fixedHeader, visibilityStyle]}
      >
        <OverlaySheetHeaderChrome
          onLayout={handleHeaderLayout}
          onGrabHandlePress={handleCloseResults}
          grabHandleAccessibilityLabel="Hide results"
          paddingHorizontal={model.contentHorizontalPadding}
          transparent={model.shouldUseBlur}
          style={[
            styles.resultsHeaderSurface,
            model.shouldUseBlur ? null : styles.resultsHeaderSurfaceSolid,
          ]}
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
          afterRow={afterRow}
        />
      </Animated.View>
    );
  },
  (previousProps, nextProps) =>
    previousProps.model === nextProps.model &&
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry
);

export const SearchResultsHeaderChromeSurfaceHost = React.memo(
  ({
    onHeaderLayout,
    routeSceneDisplayTargetRegistry,
  }: {
    onHeaderLayout: (event: LayoutChangeEvent) => void;
    routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  }) => {
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const model = useRouteAuthoritySelector({
      subscribe: searchResultsHeaderChromeAuthority.subscribe,
      getSnapshot: searchResultsHeaderChromeAuthority.getSnapshot,
      selector: React.useCallback(
        (nextSnapshot: SearchResultsHeaderChromeSnapshot) => nextSnapshot,
        []
      ),
      isEqual: areSearchResultsHeaderChromeSnapshotsEqual,
      attributionOwner: 'SearchResultsHeaderChromeSurfaceHost',
      attributionOperation: 'modelSelector',
    });

    const surface = (
      <SearchResultsHeaderChromeSurface
        model={model}
        onHeaderLayout={onHeaderLayout}
        routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
      />
    );

    const profiledSurface = onProfilerRender ? (
      <React.Profiler id="SearchResultsHeaderChromeSurfaceHost" onRender={onProfilerRender}>
        {surface}
      </React.Profiler>
    ) : (
      surface
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchResultsHeaderChromeSurfaceHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSurface;
  },
  (previousProps, nextProps) =>
    previousProps.onHeaderLayout === nextProps.onHeaderLayout &&
    previousProps.routeSceneDisplayTargetRegistry === nextProps.routeSceneDisplayTargetRegistry
);
