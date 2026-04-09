import type {
  SearchRootMapRenderStatePublicationArgsRuntime,
  UseSearchRootMapRenderStatePublicationArgsRuntimeArgs,
} from './search-root-map-render-publication-runtime-contract';

export const useSearchRootMapRenderStatePublicationArgsRuntime = ({
  accessToken,
  startupLocationSnapshot,
  userLocation,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  sessionActionRuntime,
  restaurantSelectionModel,
}: UseSearchRootMapRenderStatePublicationArgsRuntimeArgs): SearchRootMapRenderStatePublicationArgsRuntime => {
  const {
    runtimeOwner: { viewportBoundsService },
    mapBootstrapRuntime: { handleMainMapFullyRendered, isMapStyleReady },
    filterStateRuntime: { scoreMode },
  } = rootSessionRuntime;
  const {
    mapState: { cameraRef, mapRef, mapCenter, mapZoom, mapCameraAnimation, isFollowingUser },
    searchState: { restaurantOnlyId },
  } = rootPrimitivesRuntime;
  const {
    profileOwner: { profileViewState, profileActions },
  } = sessionActionRuntime;

  return {
    rootRenderArgs: {
      mapArgs: {
        accessToken,
        scoreMode,
        restaurantOnlyId,
        viewportBoundsService,
        resolveRestaurantMapLocations: restaurantSelectionModel.resolveRestaurantMapLocations,
        resolveRestaurantLocationSelectionAnchor:
          restaurantSelectionModel.resolveRestaurantLocationSelectionAnchor,
        pickPreferredRestaurantMapLocation:
          restaurantSelectionModel.pickPreferredRestaurantMapLocation,
        mapRef,
        cameraRef,
        mapCenter,
        mapZoom,
        mapCameraAnimation,
        isFollowingUser,
        onMapFullyRendered: handleMainMapFullyRendered,
        isMapStyleReady,
        userLocation,
        userLocationSnapshot: startupLocationSnapshot,
        disableBlur: false,
        highlightedRestaurantId: profileViewState.highlightedRestaurantId,
        profileActions,
        cameraPadding: profileViewState.mapCameraPadding,
      },
    },
  };
};
