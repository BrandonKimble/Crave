import React from 'react';
import type {
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
} from './bottomSheetSceneStackHostContract';
import { BottomSheetSceneStackListBodySurface } from './BottomSheetSceneStackListBodySurface';
import { useBottomSheetSceneStackBodyRenderActivity } from './BottomSheetSceneStackBodyActivityContext';
import type {
  SearchRouteSceneBodyContentSpec,
  SearchRouteSceneBodyTransportSpec,
} from './searchOverlayRouteHostContract';
import {
  areSearchRouteSceneBodyContentSpecsEqual,
  areSearchRouteSceneBodyTransportSpecsEqual,
} from './searchOverlayRouteHostContract';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  markSearchNavSwitchRuntimeAttribution,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

type SearchMountedListBodyContentSpec = Extract<
  SearchRouteSceneBodyContentSpec,
  { surfaceKind: 'list' }
>;

export type SearchMountedSceneBodySnapshot = {
  sceneBodyContent: SearchMountedListBodyContentSpec | null;
  sceneBodyTransport: SearchRouteSceneBodyTransportSpec | null;
};

const EMPTY_SEARCH_MOUNTED_SCENE_BODY_SNAPSHOT: SearchMountedSceneBodySnapshot = {
  sceneBodyContent: null,
  sceneBodyTransport: null,
};

const searchMountedSceneBodyListeners = new Set<() => void>();
let searchMountedSceneBodySnapshot = EMPTY_SEARCH_MOUNTED_SCENE_BODY_SNAPSHOT;

const hasSearchMountedSceneBodySnapshot = (
  snapshot: SearchMountedSceneBodySnapshot
): snapshot is {
  sceneBodyContent: SearchMountedListBodyContentSpec;
  sceneBodyTransport: SearchRouteSceneBodyTransportSpec;
} => snapshot.sceneBodyContent != null && snapshot.sceneBodyTransport != null;

const areSearchMountedSceneBodySnapshotsEqual = (
  left: SearchMountedSceneBodySnapshot,
  right: SearchMountedSceneBodySnapshot
): boolean =>
  left === right ||
  (areSearchRouteSceneBodyContentSpecsEqual(left.sceneBodyContent, right.sceneBodyContent) &&
    areSearchRouteSceneBodyTransportSpecsEqual(left.sceneBodyTransport, right.sceneBodyTransport));

const markSearchMountedSceneBodySnapshotFieldDiff = (field: string, didChange: boolean): void => {
  if (!didChange) {
    return;
  }
  markSearchNavSwitchRuntimeAttribution('SearchMountedSceneBodySnapshot', `field:${field}`);
};

const markSearchMountedSceneBodySnapshotDiffs = (
  left: SearchMountedSceneBodySnapshot,
  right: SearchMountedSceneBodySnapshot
): void => {
  const leftContent = left.sceneBodyContent;
  const rightContent = right.sceneBodyContent;
  if (leftContent !== rightContent) {
    markSearchMountedSceneBodySnapshotFieldDiff('sceneBodyContentRef', true);
  }
  if (leftContent?.surfaceKind !== rightContent?.surfaceKind) {
    markSearchMountedSceneBodySnapshotFieldDiff('content.surfaceKind', true);
  }
  if (leftContent?.surfaceKind === 'list' && rightContent?.surfaceKind === 'list') {
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.data',
      leftContent.data !== rightContent.data
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.renderItem',
      leftContent.renderItem !== rightContent.renderItem
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.keyExtractor',
      leftContent.keyExtractor !== rightContent.keyExtractor
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.ListHeaderComponent',
      leftContent.ListHeaderComponent !== rightContent.ListHeaderComponent
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.ListFooterComponent',
      leftContent.ListFooterComponent !== rightContent.ListFooterComponent
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.ItemSeparatorComponent',
      leftContent.ItemSeparatorComponent !== rightContent.ItemSeparatorComponent
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.secondaryList',
      leftContent.secondaryList !== rightContent.secondaryList
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'content.onEndReached',
      leftContent.onEndReached !== rightContent.onEndReached
    );
  }

  const leftTransport = left.sceneBodyTransport;
  const rightTransport = right.sceneBodyTransport;
  if (leftTransport !== rightTransport) {
    markSearchMountedSceneBodySnapshotFieldDiff('sceneBodyTransportRef', true);
  }
  if (leftTransport != null && rightTransport != null) {
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.contentContainerStyle',
      leftTransport.contentContainerStyle !== rightTransport.contentContainerStyle
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.scrollIndicatorInsets',
      leftTransport.scrollIndicatorInsets !== rightTransport.scrollIndicatorInsets
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.onScrollBeginDrag',
      leftTransport.onScrollBeginDrag !== rightTransport.onScrollBeginDrag
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.onScrollEndDrag',
      leftTransport.onScrollEndDrag !== rightTransport.onScrollEndDrag
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.onMomentumBeginJS',
      leftTransport.onMomentumBeginJS !== rightTransport.onMomentumBeginJS
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.onMomentumEndJS',
      leftTransport.onMomentumEndJS !== rightTransport.onMomentumEndJS
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.activeList',
      leftTransport.activeList !== rightTransport.activeList
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.flashListProps',
      leftTransport.flashListProps !== rightTransport.flashListProps
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.listRef',
      leftTransport.listRef !== rightTransport.listRef
    );
    markSearchMountedSceneBodySnapshotFieldDiff(
      'transport.secondaryList',
      leftTransport.secondaryList !== rightTransport.secondaryList
    );
  }
};

export const getSearchMountedSceneBodySnapshot = (): SearchMountedSceneBodySnapshot =>
  searchMountedSceneBodySnapshot;

export const subscribeSearchMountedSceneBodySnapshot = (listener: () => void): (() => void) => {
  markSearchNavSwitchRuntimeAttribution('SearchMountedSceneBodySnapshot', 'subscribe');
  searchMountedSceneBodyListeners.add(listener);
  return () => {
    markSearchNavSwitchRuntimeAttribution('SearchMountedSceneBodySnapshot', 'unsubscribe');
    searchMountedSceneBodyListeners.delete(listener);
  };
};

export const syncSearchMountedSceneBodySnapshot = (
  nextSnapshot: SearchMountedSceneBodySnapshot
): void => {
  if (areSearchMountedSceneBodySnapshotsEqual(searchMountedSceneBodySnapshot, nextSnapshot)) {
    return;
  }

  markSearchMountedSceneBodySnapshotDiffs(searchMountedSceneBodySnapshot, nextSnapshot);
  searchMountedSceneBodySnapshot = nextSnapshot;
  searchMountedSceneBodyListeners.forEach((listener) => {
    listener();
  });
};

const subscribeToEmptySearchMountedSceneBodySnapshot = (): (() => void) => () => {};

type SearchMountedSceneBodyProps = {
  bodyDefaults?: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime?: BottomSheetSceneStackBodyScrollRuntime;
};

type SearchMountedSceneLiveListSurfaceProps = {
  retainedSnapshot: {
    sceneBodyContent: SearchMountedListBodyContentSpec;
    sceneBodyTransport: SearchRouteSceneBodyTransportSpec;
  };
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
};

const SearchMountedSceneLiveListSurface = React.memo(
  ({
    retainedSnapshot,
    bodyDefaults,
    bodyScrollRuntime,
  }: SearchMountedSceneLiveListSurfaceProps) => {
    useSearchNavSwitchCommitAttribution('SearchMountedSceneLiveListSurface');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchMountedSceneLiveListSurface',
        operation: 'renderToLayoutEffect:live',
        startedAtMs: renderStartedAtMs,
      });
    }, [renderStartedAtMs]);

    return (
      <BottomSheetSceneStackListBodySurface
        sceneKey="search"
        shouldRenderListBody
        bodyDefaults={bodyDefaults}
        bodyScrollRuntime={bodyScrollRuntime}
        sceneBodyContentSpec={retainedSnapshot.sceneBodyContent}
        sceneBodyTransportSpec={retainedSnapshot.sceneBodyTransport}
      />
    );
  }
);

SearchMountedSceneLiveListSurface.displayName = 'SearchMountedSceneLiveListSurface';

export const SearchMountedSceneBody = React.memo(
  ({ bodyDefaults, bodyScrollRuntime }: SearchMountedSceneBodyProps) => {
    useSearchNavSwitchCommitAttribution('SearchMountedSceneBody');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const renderActivity = useBottomSheetSceneStackBodyRenderActivity();
    const shouldSubscribeToSearchBody =
      renderActivity.sceneKey === 'search' && renderActivity.shouldSubscribeDataLane;
    const liveSnapshot = React.useSyncExternalStore(
      shouldSubscribeToSearchBody
        ? subscribeSearchMountedSceneBodySnapshot
        : subscribeToEmptySearchMountedSceneBodySnapshot,
      shouldSubscribeToSearchBody
        ? getSearchMountedSceneBodySnapshot
        : () => EMPTY_SEARCH_MOUNTED_SCENE_BODY_SNAPSHOT,
      () => EMPTY_SEARCH_MOUNTED_SCENE_BODY_SNAPSHOT
    );
    const retainedSnapshotRef = React.useRef<SearchMountedSceneBodySnapshot>(
      getSearchMountedSceneBodySnapshot()
    );

    if (shouldSubscribeToSearchBody && hasSearchMountedSceneBodySnapshot(liveSnapshot)) {
      markSearchNavSwitchRuntimeAttribution('SearchMountedSceneBody', 'snapshotCapture');
      retainedSnapshotRef.current = liveSnapshot;
    }

    React.useLayoutEffect(() => {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchMountedSceneBody',
        operation: `renderToLayoutEffect:subscribe:${shouldSubscribeToSearchBody ? 'on' : 'off'}`,
        startedAtMs: renderStartedAtMs,
      });
    });

    const retainedSnapshot = retainedSnapshotRef.current;
    if (
      bodyDefaults == null ||
      bodyScrollRuntime == null ||
      !hasSearchMountedSceneBodySnapshot(retainedSnapshot)
    ) {
      return null;
    }

    return (
      <SearchMountedSceneLiveListSurface
        retainedSnapshot={retainedSnapshot}
        bodyDefaults={bodyDefaults}
        bodyScrollRuntime={bodyScrollRuntime}
      />
    );
  }
);

SearchMountedSceneBody.displayName = 'SearchMountedSceneBody';
