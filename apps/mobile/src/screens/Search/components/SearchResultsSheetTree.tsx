import React from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

import OverlaySheetShell from '../../../overlays/OverlaySheetShell';
import type { OverlayContentSpec } from '../../../overlays/types';
import { SearchInteractionProvider } from '../context/SearchInteractionContext';
import { useSearchSheetVisualContext } from '../context/SearchSheetVisualContext';
import { useSearchOverlayPanels } from '../hooks/use-search-overlay-panels';
import { useSearchResultsPanelSpec } from '../hooks/use-search-results-panel-spec';

type AnimatedNumberLike = { value: number };
type SearchPanelSpecArgs = Parameters<typeof useSearchResultsPanelSpec>[0];
type OverlayPanelsArgs = Omit<Parameters<typeof useSearchOverlayPanels>[0], 'searchPanelSpec'>;
type SearchResultsSheetTreeHookInputs = SearchPanelSpecArgs & OverlayPanelsArgs;

type SearchResultsSheetTreeProps = {
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  searchInteractionContextValue: React.ComponentProps<typeof SearchInteractionProvider>['value'];
  onProfilerRender: React.ProfilerOnRenderCallback;
} & SearchResultsSheetTreeHookInputs;

const CloseHandoffHeaderSwap: React.FC<{
  searchHeader: React.ReactNode;
  pollsHeader: React.ReactNode;
  handoffProgress: AnimatedNumberLike;
}> = ({ searchHeader, pollsHeader, handoffProgress }) => {
  const searchHeaderAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: handoffProgress.value >= 1 ? 0 : 1,
    }),
    [handoffProgress]
  );
  const pollsHeaderAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: handoffProgress.value >= 1 ? 1 : 0,
    }),
    [handoffProgress]
  );

  return (
    <View style={styles.headerSwapContainer}>
      <Reanimated.View style={searchHeaderAnimatedStyle}>{searchHeader}</Reanimated.View>
      <Reanimated.View
        pointerEvents="none"
        style={[styles.headerSwapOverlay, pollsHeaderAnimatedStyle]}
      >
        {pollsHeader}
      </Reanimated.View>
    </View>
  );
};

const SearchResultsSheetTree = ({
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  searchInteractionContextValue,
  onProfilerRender,
  ...searchResultsSheetInputs
}: SearchResultsSheetTreeProps) => {
  const {
    sheetTranslateY,
    resultsScrollOffset,
    resultsMomentum,
    closeVisualHandoffProgress,
    navBarCutoutHeight,
    navBarCutoutProgress,
    bottomNavHiddenTranslateY,
    navBarCutoutIsHiding,
  } = useSearchSheetVisualContext();
  const overlayHeaderActionProgress = searchResultsSheetInputs.overlayHeaderActionProgress;
  const searchPanelSpec = useSearchResultsPanelSpec(searchResultsSheetInputs);
  const {
    overlaySheetKey,
    overlaySheetSpec,
    overlaySheetVisible,
    overlaySheetApplyNavBarCutout,
    overlayHeaderActionMode,
    pollsPanelSpec,
  } = useSearchOverlayPanels({
    ...searchResultsSheetInputs,
    searchPanelSpec: searchPanelSpec as OverlayContentSpec<unknown> | null,
  });

  const frozenOverlaySheetPropsRef = React.useRef<{
    overlaySheetKey: typeof overlaySheetKey;
    overlaySheetSpec: typeof overlaySheetSpec;
    overlaySheetVisible: boolean;
    overlaySheetApplyNavBarCutout: boolean;
  } | null>(null);
  const nextOverlaySheetProps = {
    overlaySheetKey,
    overlaySheetSpec,
    overlaySheetVisible,
    overlaySheetApplyNavBarCutout,
  };

  if (!shouldFreezeOverlaySheetForCloseHandoff || !frozenOverlaySheetPropsRef.current) {
    frozenOverlaySheetPropsRef.current = nextOverlaySheetProps;
  }

  const frozenOverlaySheetProps =
    shouldFreezeOverlaySheetForCloseHandoff && frozenOverlaySheetPropsRef.current
      ? frozenOverlaySheetPropsRef.current
      : null;

  const overlaySheetPropsForRender = frozenOverlaySheetProps
    ? frozenOverlaySheetProps
    : {
        overlaySheetKey,
        overlaySheetSpec,
        overlaySheetVisible,
        overlaySheetApplyNavBarCutout,
      };
  const shouldMountLivePollsHeaderHandoff =
    overlaySheetPropsForRender.overlaySheetKey === 'search' &&
    Boolean(pollsPanelSpec?.headerComponent) &&
    (shouldFreezeOverlaySheetForCloseHandoff ||
      searchResultsSheetInputs.searchSheetContentLane.kind === 'persistent_poll');
  const frozenCloseHandoffHeadersRef = React.useRef<{
    searchHeader: React.ReactNode;
    pollsHeader: React.ReactNode;
  } | null>(null);
  const liveCloseHandoffHeaders = {
    searchHeader: overlaySheetPropsForRender.overlaySheetSpec?.headerComponent ?? null,
    pollsHeader: pollsPanelSpec?.headerComponent ?? null,
  };
  if (!shouldFreezeOverlaySheetForCloseHandoff || !frozenCloseHandoffHeadersRef.current) {
    frozenCloseHandoffHeadersRef.current = liveCloseHandoffHeaders;
  }
  const closeHandoffHeadersForRender =
    shouldFreezeOverlaySheetForCloseHandoff && frozenCloseHandoffHeadersRef.current
      ? frozenCloseHandoffHeadersRef.current
      : liveCloseHandoffHeaders;
  const overlaySheetSpecForRender =
    shouldMountLivePollsHeaderHandoff && overlaySheetPropsForRender.overlaySheetSpec
      ? {
          ...overlaySheetPropsForRender.overlaySheetSpec,
          headerComponent: (
            <CloseHandoffHeaderSwap
              searchHeader={closeHandoffHeadersForRender.searchHeader}
              pollsHeader={closeHandoffHeadersForRender.pollsHeader}
              handoffProgress={closeVisualHandoffProgress}
            />
          ),
        }
      : overlaySheetPropsForRender.overlaySheetSpec;

  const frozenOverlayHeaderActionModeRef =
    React.useRef<typeof overlayHeaderActionMode>(overlayHeaderActionMode);
  const shouldFreezeOverlayHeaderAction =
    shouldFreezeOverlayHeaderActionForRunOne || shouldFreezeOverlaySheetForCloseHandoff;

  if (!shouldFreezeOverlayHeaderAction) {
    frozenOverlayHeaderActionModeRef.current = overlayHeaderActionMode;
  }

  const overlayHeaderActionModeForRender = shouldFreezeOverlayHeaderAction
    ? frozenOverlayHeaderActionModeRef.current
    : overlayHeaderActionMode;

  return (
    <SearchInteractionProvider value={searchInteractionContextValue}>
      <React.Profiler id="SearchResultsSheetTree" onRender={onProfilerRender}>
        {overlaySheetPropsForRender.overlaySheetSpec &&
        overlaySheetPropsForRender.overlaySheetKey ? (
          <OverlaySheetShell
            visible={overlaySheetPropsForRender.overlaySheetVisible}
            activeOverlayKey={overlaySheetPropsForRender.overlaySheetKey}
            spec={overlaySheetSpecForRender}
            sheetY={sheetTranslateY}
            scrollOffset={resultsScrollOffset}
            momentumFlag={resultsMomentum}
            headerActionProgress={overlayHeaderActionProgress}
            headerActionMode={overlayHeaderActionModeForRender}
            navBarHeight={navBarCutoutHeight}
            applyNavBarCutout={overlaySheetPropsForRender.overlaySheetApplyNavBarCutout}
            navBarCutoutProgress={
              overlaySheetPropsForRender.overlaySheetKey === 'search'
                ? navBarCutoutProgress
                : undefined
            }
            navBarHiddenTranslateY={bottomNavHiddenTranslateY}
            navBarCutoutIsHiding={
              overlaySheetPropsForRender.overlaySheetKey === 'search' ? navBarCutoutIsHiding : false
            }
          />
        ) : null}
      </React.Profiler>
    </SearchInteractionProvider>
  );
};

export default React.memo(SearchResultsSheetTree);

const styles = StyleSheet.create({
  headerSwapContainer: {
    position: 'relative',
  },
  headerSwapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
