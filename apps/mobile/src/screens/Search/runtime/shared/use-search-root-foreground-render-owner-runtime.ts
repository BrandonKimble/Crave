import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import {
  useSearchRootForegroundRenderRuntime,
  type SearchRootForegroundRenderRuntime,
} from './use-search-root-foreground-render-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type { SearchRootPresentationVisualRuntime } from './use-search-root-presentation-visual-runtime';

type UseSearchRootForegroundRenderOwnerRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  presentationVisualRuntime: SearchRootPresentationVisualRuntime;
} & Pick<SearchRootActionLanes, 'sessionActionRuntime'>;

export const useSearchRootForegroundRenderOwnerRuntime = ({
  insets,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  presentationVisualRuntime,
}: UseSearchRootForegroundRenderOwnerRuntimeArgs): SearchRootForegroundRenderRuntime =>
  useSearchRootForegroundRenderRuntime({
    chromeArgs: {
      insetsTop: insets.top,
      insetsLeft: insets.left,
      insetsRight: insets.right,
      isSuggestionOverlayVisible: rootSuggestionRuntime.isSuggestionOverlayVisible,
      headerVisualModel:
        requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
          .resultsPresentationOwner.shellModel.headerVisualModel,
      shouldHideBottomNavForRender:
        presentationVisualRuntime.visualRuntime.shouldHideBottomNavForRender,
      suggestionInputs: presentationVisualRuntime.suggestionInputs,
      headerInputs: presentationVisualRuntime.headerInputs,
      filtersWarmupInputs: presentationVisualRuntime.filtersWarmupInputs,
      shouldFreezeSuggestionSurfaceForRunOne:
        presentationVisualRuntime.shouldFreezeSuggestionSurfaceForRunOne,
      shouldFreezeOverlayHeaderChromeForRunOne:
        presentationVisualRuntime.shouldFreezeOverlayHeaderChromeForRunOne,
    },
    bottomNavArgs: {
      bottomInset: rootScaffoldRuntime.overlaySessionRuntime.bottomInset,
      handleBottomNavLayout: rootScaffoldRuntime.overlaySessionRuntime.handleBottomNavLayout,
      shouldDisableSearchBlur: false,
      rootOverlay: rootScaffoldRuntime.overlaySessionRuntime.rootOverlay,
      handleProfilePress: sessionActionRuntime.foregroundInteractionRuntime.handleProfilePress,
      handleOverlaySelect: sessionActionRuntime.foregroundInteractionRuntime.handleOverlaySelect,
      bottomNavAnimatedStyle: presentationVisualRuntime.visualRuntime.bottomNavAnimatedStyle,
      shouldHideBottomNav: presentationVisualRuntime.visualRuntime.shouldHideBottomNavForRender,
      bottomNavItemVisibilityAnimatedStyle:
        presentationVisualRuntime.visualRuntime.bottomNavItemVisibilityAnimatedStyle,
    },
  });
