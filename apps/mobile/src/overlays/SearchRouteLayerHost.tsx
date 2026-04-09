import React from 'react';

import OverlaySheetShell from './OverlaySheetShell';
import { useResolvedSearchRouteHostModel } from './useResolvedSearchRouteHostModel';
import { SearchInteractionProvider } from '../screens/Search/context/SearchInteractionContext';

const SearchRouteLayerHost = () => {
  const searchRouteHostModel = useResolvedSearchRouteHostModel();

  if (!searchRouteHostModel) {
    return null;
  }

  const { visualState, searchInteractionRef } = searchRouteHostModel;

  const renderedSheet = (
    <OverlaySheetShell
      visible={searchRouteHostModel.overlaySheetVisible}
      spec={searchRouteHostModel.overlaySheetSpec}
      sheetY={visualState.sheetTranslateY}
      scrollOffset={visualState.resultsScrollOffset}
      momentumFlag={visualState.resultsMomentum}
      headerActionProgress={visualState.overlayHeaderActionProgress}
      headerActionMode={searchRouteHostModel.overlayHeaderActionMode}
      navBarHeight={visualState.navBarCutoutHeight}
      applyNavBarCutout={searchRouteHostModel.overlaySheetApplyNavBarCutout}
      navBarCutoutProgress={
        searchRouteHostModel.overlaySheetKey === 'search'
          ? visualState.navBarCutoutProgress
          : undefined
      }
      navBarHiddenTranslateY={visualState.bottomNavHiddenTranslateY}
      navBarCutoutIsHiding={
        searchRouteHostModel.overlaySheetKey === 'search' ? visualState.navBarCutoutIsHiding : false
      }
    />
  );

  return searchRouteHostModel.overlaySheetKey === 'search' && searchInteractionRef ? (
    <SearchInteractionProvider value={{ interactionRef: searchInteractionRef }}>
      {renderedSheet}
    </SearchInteractionProvider>
  ) : (
    renderedSheet
  );
};

export default React.memo(SearchRouteLayerHost);
