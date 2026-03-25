import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import OverlaySheetShell from '../../../overlays/OverlaySheetShell';
import type { OverlayContentSpec } from '../../../overlays/types';
import { SearchInteractionProvider } from '../context/SearchInteractionContext';
import { useSearchOverlayPanels } from '../hooks/use-search-overlay-panels';
import { useSearchResultsPanelSpec } from '../hooks/use-search-results-panel-spec';

type SearchResultsSheetTreeProps = {
  searchPanelSpecArgs: Parameters<typeof useSearchResultsPanelSpec>[0];
  overlayPanelsArgs: Omit<Parameters<typeof useSearchOverlayPanels>[0], 'searchPanelSpec'>;
  shouldFreezeOverlaySheetProps: boolean;
  shouldFreezeOverlayHeaderActionMode: boolean;
  searchInteractionContextValue: React.ComponentProps<typeof SearchInteractionProvider>['value'];
  sheetTranslateY: SharedValue<number>;
  resultsScrollOffset: SharedValue<number>;
  resultsMomentum: SharedValue<boolean>;
  overlayHeaderActionProgress: SharedValue<number>;
  navBarCutoutHeight: number;
  bottomNavHideProgress: SharedValue<number>;
  bottomNavHiddenTranslateY: number;
  shouldHideBottomNav: boolean;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

const SearchResultsSheetTree = ({
  searchPanelSpecArgs,
  overlayPanelsArgs,
  shouldFreezeOverlaySheetProps,
  shouldFreezeOverlayHeaderActionMode,
  searchInteractionContextValue,
  sheetTranslateY,
  resultsScrollOffset,
  resultsMomentum,
  overlayHeaderActionProgress,
  navBarCutoutHeight,
  bottomNavHideProgress,
  bottomNavHiddenTranslateY,
  shouldHideBottomNav,
  onProfilerRender,
}: SearchResultsSheetTreeProps) => {
  const searchPanelSpec = useSearchResultsPanelSpec(searchPanelSpecArgs);
  const {
    overlaySheetKey,
    overlaySheetSpec,
    overlaySheetVisible,
    overlaySheetApplyNavBarCutout,
    overlayHeaderActionMode,
  } = useSearchOverlayPanels({
    ...overlayPanelsArgs,
    searchPanelSpec: searchPanelSpec as OverlayContentSpec<unknown> | null,
  });

  const frozenOverlaySheetPropsRef = React.useRef<{
    overlaySheetKey: typeof overlaySheetKey;
    overlaySheetSpec: typeof overlaySheetSpec;
    overlaySheetVisible: boolean;
    overlaySheetApplyNavBarCutout: boolean;
  } | null>(null);

  if (!shouldFreezeOverlaySheetProps || !frozenOverlaySheetPropsRef.current) {
    frozenOverlaySheetPropsRef.current = {
      overlaySheetKey,
      overlaySheetSpec,
      overlaySheetVisible,
      overlaySheetApplyNavBarCutout,
    };
  }

  const overlaySheetPropsForRender =
    shouldFreezeOverlaySheetProps && frozenOverlaySheetPropsRef.current
      ? frozenOverlaySheetPropsRef.current
      : {
          overlaySheetKey,
          overlaySheetSpec,
          overlaySheetVisible,
          overlaySheetApplyNavBarCutout,
        };

  const frozenOverlayHeaderActionModeRef =
    React.useRef<typeof overlayHeaderActionMode>(overlayHeaderActionMode);

  if (!shouldFreezeOverlayHeaderActionMode) {
    frozenOverlayHeaderActionModeRef.current = overlayHeaderActionMode;
  }

  const overlayHeaderActionModeForRender = shouldFreezeOverlayHeaderActionMode
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
            spec={overlaySheetPropsForRender.overlaySheetSpec}
            sheetY={sheetTranslateY}
            scrollOffset={resultsScrollOffset}
            momentumFlag={resultsMomentum}
            headerActionProgress={overlayHeaderActionProgress}
            headerActionMode={overlayHeaderActionModeForRender}
            navBarHeight={navBarCutoutHeight}
            applyNavBarCutout={overlaySheetPropsForRender.overlaySheetApplyNavBarCutout}
            navBarCutoutProgress={
              overlaySheetPropsForRender.overlaySheetKey === 'search'
                ? bottomNavHideProgress
                : undefined
            }
            navBarHiddenTranslateY={bottomNavHiddenTranslateY}
            navBarCutoutIsHiding={
              overlaySheetPropsForRender.overlaySheetKey === 'search' ? shouldHideBottomNav : false
            }
          />
        ) : null}
      </React.Profiler>
    </SearchInteractionProvider>
  );
};

export default React.memo(SearchResultsSheetTree);
