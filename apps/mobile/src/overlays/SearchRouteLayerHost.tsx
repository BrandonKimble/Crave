import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import OverlaySheetShell from './OverlaySheetShell';
import SearchRouteMountedSceneOwners from './SearchRouteMountedSceneOwners';
import { useResolvedSearchRouteHostModel } from './useResolvedSearchRouteHostModel';
import { SearchInteractionProvider } from '../screens/Search/context/SearchInteractionContext';

type SearchRouteLayerHostProps = {
  chromeTransitionProgress?: SharedValue<number>;
  backdropDimProgress?: SharedValue<number>;
};

const ResolvedSearchRouteSheetHost = ({
  chromeTransitionProgress,
  backdropDimProgress,
}: SearchRouteLayerHostProps) => {
  const searchRouteHostModel = useResolvedSearchRouteHostModel();

  if (!searchRouteHostModel) {
    return null;
  }

  const { visualState, searchInteractionRef } = searchRouteHostModel;

  const renderedSheet = (
    <OverlaySheetShell
      visible={searchRouteHostModel.overlaySheetVisible}
      spec={searchRouteHostModel.activeSceneSpec}
      chromeTransitionProgress={chromeTransitionProgress}
      backdropDimProgress={backdropDimProgress}
      headerActionMode={searchRouteHostModel.overlayHeaderActionMode}
      navBarHeight={visualState.navBarCutoutHeight}
      applyNavBarCutout={searchRouteHostModel.overlaySheetApplyNavBarCutout}
      navBarCutoutProgress={
        searchRouteHostModel.activeSceneKey === 'search'
          ? visualState.navBarCutoutProgress
          : undefined
      }
      navBarHiddenTranslateY={visualState.bottomNavHiddenTranslateY}
      navBarCutoutIsHiding={
        searchRouteHostModel.activeSceneKey === 'search' ? visualState.navBarCutoutIsHiding : false
      }
    />
  );

  return searchRouteHostModel.activeSceneKey === 'search' && searchInteractionRef ? (
    <SearchInteractionProvider value={{ interactionRef: searchInteractionRef }}>
      {renderedSheet}
    </SearchInteractionProvider>
  ) : (
    renderedSheet
  );
};

const SearchRouteLayerHost = ({
  chromeTransitionProgress,
  backdropDimProgress,
}: SearchRouteLayerHostProps) => (
  <>
    <SearchRouteMountedSceneOwners />
    <ResolvedSearchRouteSheetHost
      chromeTransitionProgress={chromeTransitionProgress}
      backdropDimProgress={backdropDimProgress}
    />
  </>
);

export default React.memo(SearchRouteLayerHost);
