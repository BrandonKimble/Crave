import React from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';

import {
  createRestaurantRouteHostModel,
  createRestaurantRouteHostState,
} from '../../../../overlays/restaurantRouteHostContract';
import {
  createRestaurantRoutePanelContract,
  createRestaurantRoutePanelDraft,
} from '../../../../overlays/restaurantRoutePanelContract';
import { useRestaurantRouteRuntimeStore } from '../../../../overlays/restaurantRouteRuntimeStore';
import type {
  SearchRootProfileActionRuntime,
  SearchRootResultsActionRuntime,
} from './use-search-root-action-lanes-runtime-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type { SearchRootVisualRuntime } from './search-root-visual-runtime-contract';

type UseSearchRestaurantRoutePublicationRuntimeArgs = {
  profileActionRuntime: SearchRootProfileActionRuntime;
  resultsActionRuntime: SearchRootResultsActionRuntime;
  overlaySessionRuntime: SearchRootScaffoldRuntime['overlaySessionRuntime'];
  handleRestaurantSavePress: (restaurantId: string) => void;
  visualContext: {
    sheetTranslateY: SearchRootScaffoldRuntime['resultsSheetRuntimeOwner']['sheetTranslateY'];
    resultsScrollOffset: SearchRootScaffoldRuntime['resultsSheetRuntimeOwner']['resultsScrollOffset'];
    resultsMomentum: SearchRootScaffoldRuntime['resultsSheetRuntimeOwner']['resultsMomentum'];
    navBarTopForSnaps: number;
    searchBarTop: number;
    overlayHeaderActionProgress: SearchRootVisualRuntime['overlayHeaderActionProgress'];
    navBarCutoutHeight: number;
    bottomNavHiddenTranslateY: number;
  };
  suggestionProgress: SearchRootSuggestionRuntime['suggestionProgress'];
};

export const useSearchRestaurantRoutePublicationRuntime = ({
  profileActionRuntime,
  resultsActionRuntime,
  overlaySessionRuntime,
  handleRestaurantSavePress,
  visualContext,
  suggestionProgress,
}: UseSearchRestaurantRoutePublicationRuntimeArgs): void => {
  const publishRestaurantRouteHostModel = useRestaurantRouteRuntimeStore(
    (state) => state.publishRestaurantRouteHostModel
  );
  const restaurantOverlayAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: resultsActionRuntime.presentationState.shouldSuppressRestaurantOverlay
        ? 1 - suggestionProgress.value
        : 1,
    }),
    [resultsActionRuntime.presentationState.shouldSuppressRestaurantOverlay, suggestionProgress]
  );
  const restaurantRouteHostConfig = React.useMemo(
    () => ({
      shouldFreezeContent:
        resultsActionRuntime.presentationState.shouldFreezeRestaurantPanelContent,
      interactionEnabled:
        resultsActionRuntime.presentationState.shouldEnableRestaurantOverlayInteraction,
      containerStyle: restaurantOverlayAnimatedStyle,
    }),
    [
      resultsActionRuntime.presentationState.shouldEnableRestaurantOverlayInteraction,
      resultsActionRuntime.presentationState.shouldFreezeRestaurantPanelContent,
      restaurantOverlayAnimatedStyle,
    ]
  );
  const restaurantRoutePanel = React.useMemo(
    () =>
      createRestaurantRoutePanelContract({
        ...createRestaurantRoutePanelDraft({
          data: profileActionRuntime.profileOwner.profileViewState.restaurantPanelSnapshot,
          onToggleFavorite: handleRestaurantSavePress,
        }),
        onRequestClose: profileActionRuntime.profileOwner.profileActions.closeRestaurantProfile,
      }),
    [
      handleRestaurantSavePress,
      profileActionRuntime.profileOwner.profileActions.closeRestaurantProfile,
      profileActionRuntime.profileOwner.profileViewState.restaurantPanelSnapshot,
    ]
  );
  const restaurantRoutePresentationState = React.useMemo(
    () => ({
      sheetY: visualContext.sheetTranslateY,
      scrollOffset: visualContext.resultsScrollOffset,
      momentumFlag: visualContext.resultsMomentum,
    }),
    [
      visualContext.resultsMomentum,
      visualContext.resultsScrollOffset,
      visualContext.sheetTranslateY,
    ]
  );
  const restaurantRouteHostState = React.useMemo(
    () =>
      createRestaurantRouteHostState({
        hostConfig: restaurantRouteHostConfig,
        presentationState: restaurantRoutePresentationState,
        snapController: profileActionRuntime.profileOwner.restaurantSheetSnapController,
        navBarTop: visualContext.navBarTopForSnaps,
        searchBarTop: visualContext.searchBarTop,
        headerActionProgress: visualContext.overlayHeaderActionProgress,
        navBarHeight: visualContext.navBarCutoutHeight,
        navBarHiddenTranslateY: visualContext.bottomNavHiddenTranslateY,
      }),
    [
      profileActionRuntime.profileOwner.restaurantSheetSnapController,
      restaurantRouteHostConfig,
      restaurantRoutePresentationState,
      visualContext.bottomNavHiddenTranslateY,
      visualContext.navBarCutoutHeight,
      visualContext.navBarTopForSnaps,
      visualContext.overlayHeaderActionProgress,
      visualContext.searchBarTop,
    ]
  );
  const restaurantRouteHostModel = React.useMemo(
    () =>
      createRestaurantRouteHostModel({
        panel: restaurantRoutePanel,
        hostState: restaurantRouteHostState,
      }),
    [restaurantRouteHostState, restaurantRoutePanel]
  );

  React.useEffect(() => {
    if (!overlaySessionRuntime.shouldRenderSearchOverlay) {
      publishRestaurantRouteHostModel(null);
      return;
    }

    publishRestaurantRouteHostModel(restaurantRouteHostModel);
  }, [
    overlaySessionRuntime.shouldRenderSearchOverlay,
    publishRestaurantRouteHostModel,
    restaurantRouteHostModel,
  ]);

  React.useEffect(
    () => () => {
      publishRestaurantRouteHostModel(null);
    },
    [publishRestaurantRouteHostModel]
  );
};
