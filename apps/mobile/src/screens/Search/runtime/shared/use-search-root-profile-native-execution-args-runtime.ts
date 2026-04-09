import { SCREEN_HEIGHT, USA_FALLBACK_CENTER, USA_FALLBACK_ZOOM } from '../../constants/search';
import type {
  SearchRootProfileOwnerArgs,
  SearchRootRestaurantSelectionModel,
  UseSearchRootProfileActionRuntimeArgs,
} from './use-search-root-profile-action-runtime-contract';

const PROFILE_PIN_TARGET_CENTER_RATIO = 0.25;
const PROFILE_PIN_MIN_VISIBLE_HEIGHT = 160;
const PROFILE_CAMERA_ANIMATION_MS = 800;
const PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA = 0.55;
const PROFILE_MULTI_LOCATION_MIN_ZOOM = 3.5;
const RESTAURANT_FOCUS_CENTER_EPSILON = 1e-5;
const RESTAURANT_FOCUS_ZOOM_EPSILON = 0.01;

type UseSearchRootProfileNativeExecutionArgsRuntimeArgs = Pick<
  UseSearchRootProfileActionRuntimeArgs,
  | 'insets'
  | 'rootSessionRuntime'
  | 'rootPrimitivesRuntime'
  | 'rootSuggestionRuntime'
  | 'rootScaffoldRuntime'
> & {
  selectionModel: SearchRootRestaurantSelectionModel;
};

export const useSearchRootProfileNativeExecutionArgsRuntime = ({
  insets,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  selectionModel,
}: UseSearchRootProfileNativeExecutionArgsRuntimeArgs): Pick<
  SearchRootProfileOwnerArgs,
  'cameraTransitionPorts' | 'selectionModel' | 'nativeExecutionArgs'
> => {
  const {
    runtimeOwner: { cameraIntentArbiter },
    primitives: { lastVisibleSheetStateRef, lastCameraStateRef, commitCameraViewport },
  } = rootSessionRuntime;
  const {
    mapState: { suppressMapMoved, mapCenter, mapZoom, setIsFollowingUser },
  } = rootPrimitivesRuntime;
  const { searchBarFrame } = rootSuggestionRuntime;
  const {
    overlaySessionRuntime: { searchBarTop, navBarTopForSnaps },
    resultsSheetRuntimeOwner,
    instrumentationRuntime: { emitRuntimeMechanismEvent },
  } = rootScaffoldRuntime;

  return {
    cameraTransitionPorts: {
      resultsScrollOffset: resultsSheetRuntimeOwner.resultsScrollOffset,
      sheetTranslateY: resultsSheetRuntimeOwner.sheetTranslateY,
      snapPoints: resultsSheetRuntimeOwner.snapPoints,
      sheetState: resultsSheetRuntimeOwner.sheetState,
      mapCenter,
      mapZoom,
      searchBarTop,
      searchBarHeight: searchBarFrame?.height ?? 0,
      insetsTop: insets.top,
      navBarTop: navBarTopForSnaps,
      screenHeight: SCREEN_HEIGHT,
      profilePinTargetCenterRatio: PROFILE_PIN_TARGET_CENTER_RATIO,
      profilePinMinVisibleHeight: PROFILE_PIN_MIN_VISIBLE_HEIGHT,
      fallbackCenter: USA_FALLBACK_CENTER,
      fallbackZoom: USA_FALLBACK_ZOOM,
    },
    selectionModel: {
      ...selectionModel,
      profileMultiLocationZoomOutDelta: PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA,
      profileMultiLocationMinZoom: PROFILE_MULTI_LOCATION_MIN_ZOOM,
      restaurantFocusCenterEpsilon: RESTAURANT_FOCUS_CENTER_EPSILON,
      restaurantFocusZoomEpsilon: RESTAURANT_FOCUS_ZOOM_EPSILON,
    },
    nativeExecutionArgs: {
      emitRuntimeMechanismEvent,
      cameraIntentArbiter,
      profileCameraAnimationMs: PROFILE_CAMERA_ANIMATION_MS,
      lastVisibleSheetStateRef,
      lastCameraStateRef,
      setIsFollowingUser,
      suppressMapMoved,
      commitCameraViewport,
    },
  };
};
