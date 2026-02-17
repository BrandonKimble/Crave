import React from 'react';
import { Keyboard } from 'react-native';
import type { TextInput } from 'react-native';

import { useOverlaySheetPositionStore } from '../../../../overlays/useOverlaySheetPositionStore';
import type { RestaurantOverlayData } from '../../../../overlays/panels/RestaurantPanel';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { FavoriteListType } from '../../../../services/favorite-lists';
import { searchService } from '../../../../services/search';
import type {
  Coordinate,
  FoodResult,
  RestaurantProfile,
  RestaurantResult,
} from '../../../../types';
import { logger } from '../../../../utils';
import type { createPhaseBMaterializer } from '../scheduler/phase-b-materializer';

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';
type ProfileTransitionStatus = 'idle' | 'opening' | 'open' | 'closing';

type MapCameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

type RestaurantFocusSession = {
  restaurantId: string | null;
  locationKey: string | null;
  hasAppliedInitialMultiLocationZoomOut: boolean;
};

type HydratedRestaurantProfile = {
  restaurant: RestaurantResult;
  dishes: FoodResult[];
};

type CameraSnapshot = {
  center: [number, number];
  zoom: number;
  padding: MapCameraPadding | null;
};

type ProfileTransitionState = {
  status: ProfileTransitionStatus;
  savedSheetSnap: Exclude<OverlaySheetSnap, 'hidden'> | null;
  savedCamera: CameraSnapshot | null;
  savedResultsScrollOffset: number | null;
};

type ActiveHydrationIntent = {
  requestSeq: number;
  restaurantId: string;
};

type ProfileSource = 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete' | 'dish_card';

type SaveSheetTarget = { restaurantId?: string; connectionId?: string } | null;

type SaveSheetState = {
  visible: boolean;
  listType: FavoriteListType;
  target: SaveSheetTarget;
};

type RestaurantLocationCandidate = {
  locationId: string;
  latitude: number;
  longitude: number;
};

type RestaurantSnapRequest = {
  snap: Exclude<OverlaySheetSnap, 'hidden'>;
  token: number;
} | null;

type PhaseBMaterializerRef = React.MutableRefObject<ReturnType<typeof createPhaseBMaterializer>>;

type CameraRef = React.MutableRefObject<{
  setCamera?: (options: {
    centerCoordinate: [number, number];
    zoomLevel: number;
    padding: MapCameraPadding;
    animationDuration: number;
    animationMode: 'easeTo';
  }) => void;
} | null>;

type UseProfileRuntimeControllerArgs = {
  restaurantProfile: RestaurantOverlayData | null;
  isRestaurantOverlayVisible: boolean;
  submittedQuery: string;
  trimmedQuery: string;
  restaurantOnlyId: string | null;
  isInitialCameraReady: boolean;
  mapZoom: number | null;
  saveSheetState: SaveSheetState;
  isSearchOverlay: boolean;
  hydratedResultsKey: string | null;
  resultsHydrationKey: string | null;
  hydrationOperationId: string | null;
  cameraRef: CameraRef;
  inputRef: React.MutableRefObject<TextInput | null>;
  phaseBMaterializerRef: PhaseBMaterializerRef;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  profileTransitionRef: React.MutableRefObject<ProfileTransitionState>;
  profileDismissBehaviorRef: React.MutableRefObject<'restore' | 'clear'>;
  shouldClearSearchOnProfileDismissRef: React.MutableRefObject<boolean>;
  restaurantProfileRequestSeqRef: React.MutableRefObject<number>;
  restaurantProfileCacheRef: React.MutableRefObject<Map<string, HydratedRestaurantProfile>>;
  restaurantProfileRequestByIdRef: React.MutableRefObject<
    Map<string, Promise<HydratedRestaurantProfile>>
  >;
  restaurantOverlayDismissHandledRef: React.MutableRefObject<boolean>;
  restaurantFocusSessionRef: React.MutableRefObject<RestaurantFocusSession>;
  hasRestoredProfileMapRef: React.MutableRefObject<boolean>;
  forceRestaurantProfileMiddleSnapRef: React.MutableRefObject<boolean>;
  restaurantSnapRequestTokenRef: React.MutableRefObject<number>;
  previousSaveSheetStateRef: React.MutableRefObject<SaveSheetState | null>;
  fitBoundsSyncTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  lastVisibleSheetStateRef: React.MutableRefObject<Exclude<OverlaySheetSnap, 'hidden'>>;
  lastCameraStateRef: React.MutableRefObject<{ center: [number, number]; zoom: number } | null>;
  restaurantOnlySearchRef: React.MutableRefObject<string | null>;
  hasCenteredOnLocationRef: React.MutableRefObject<boolean>;
  clearSearchStateRef: React.MutableRefObject<
    ((options?: { skipSheetAnimation?: boolean }) => void) | null
  >;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  cameraStateSyncTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setRestaurantProfile: React.Dispatch<React.SetStateAction<RestaurantOverlayData | null>>;
  setRestaurantOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setMapHighlightedRestaurantId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setRestaurantSnapRequest: React.Dispatch<React.SetStateAction<RestaurantSnapRequest>>;
  setProfileTransitionStatus: (
    status: ProfileTransitionStatus,
    settleTo?: ProfileTransitionStatus
  ) => void;
  setIsFollowingUser: React.Dispatch<React.SetStateAction<boolean>>;
  setHydratedResultsKeySync: (next: string | null) => void;
  setMapCameraPadding: React.Dispatch<React.SetStateAction<MapCameraPadding | null>>;
  setSaveSheetState: React.Dispatch<React.SetStateAction<SaveSheetState>>;
  setProfileTransitionStatusState: React.Dispatch<React.SetStateAction<ProfileTransitionStatus>>;
  setIsInitialCameraReady: React.Dispatch<React.SetStateAction<boolean>>;
  beginSuggestionCloseHold: (variant?: 'default' | 'submitting') => boolean;
  ensureSearchOverlay: () => void;
  dismissTransientOverlays: () => void;
  ensureProfileTransitionSnapshot: () => void;
  clearCameraPersistTimeout: () => void;
  clearCameraStateSync: () => void;
  resolveProfileCameraPadding: () => MapCameraPadding;
  resolveRestaurantMapLocations: (restaurant: RestaurantResult) => RestaurantLocationCandidate[];
  resolveRestaurantLocationSelectionAnchor: () => Coordinate | null;
  pickClosestLocationToCenter: (
    locations: RestaurantLocationCandidate[],
    center: Coordinate
  ) => RestaurantLocationCandidate | null;
  pickPreferredRestaurantMapLocation: (
    restaurant: RestaurantResult,
    anchor: Coordinate | null
  ) => RestaurantLocationCandidate | null;
  scheduleCameraCommand: (command: () => void) => void;
  commitCameraState: (payload: {
    center: [number, number];
    zoom: number;
    padding?: MapCameraPadding | null;
  }) => boolean;
  scheduleCameraStateCommit: (
    payload: { center: [number, number]; zoom: number; padding?: MapCameraPadding | null },
    delayMs?: number
  ) => void;
  suppressMapMoved: () => void;
  animateSheetTo: (state: Exclude<OverlaySheetSnap, 'hidden'>) => void;
  resetSheetToHidden: () => void;
  clearProfileTransitionLock: () => void;
  deferRecentlyViewedTrack: (restaurantId: string, restaurantName: string) => void;
  recordRestaurantView: (restaurantId: string, source: ProfileSource) => Promise<void>;
  emitRuntimeMechanismEvent: (
    event: 'profile_intent_cancelled',
    payload: Record<string, unknown>
  ) => void;
  fitBoundsSyncBufferMs: number;
  profileCameraAnimationMs: number;
  profileRestoreAnimationMs: number;
  profileMultiLocationZoomOutDelta: number;
  profileMultiLocationMinZoom: number;
  restaurantFocusCenterEpsilon: number;
  restaurantFocusZoomEpsilon: number;
};

export type ProfileRuntimeController = {
  hydrateRestaurantProfileById: (restaurantId: string) => void;
  focusRestaurantProfileCamera: (
    restaurant: RestaurantResult,
    source: ProfileSource,
    options?: {
      pressedCoordinate?: Coordinate | null;
      preferPressedCoordinate?: boolean;
    }
  ) => void;
  openRestaurantProfilePreview: (
    restaurantId: string,
    restaurantName: string,
    pressedCoordinate?: Coordinate | null
  ) => void;
  openRestaurantProfile: (
    restaurant: RestaurantResult,
    foodResultsOverride?: FoodResult[],
    pressedCoordinate?: Coordinate | null,
    source?: ProfileSource
  ) => void;
  openRestaurantProfileFromResults: (
    restaurant: RestaurantResult,
    foodResultsOverride?: FoodResult[],
    source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
  ) => void;
  closeRestaurantProfile: () => void;
  handleRestaurantOverlayDismissed: () => void;
  handleRestaurantOverlayRequestClose: () => void;
};

export const useProfileRuntimeController = (
  args: UseProfileRuntimeControllerArgs
): ProfileRuntimeController => {
  const {
    restaurantProfile,
    isRestaurantOverlayVisible,
    submittedQuery,
    trimmedQuery,
    restaurantOnlyId,
    isInitialCameraReady,
    mapZoom,
    saveSheetState,
    isSearchOverlay,
    hydratedResultsKey,
    resultsHydrationKey,
    hydrationOperationId,
    cameraRef,
    inputRef,
    phaseBMaterializerRef,
    pendingMarkerOpenAnimationFrameRef,
    profileTransitionRef,
    profileDismissBehaviorRef,
    shouldClearSearchOnProfileDismissRef,
    restaurantProfileRequestSeqRef,
    restaurantProfileCacheRef,
    restaurantProfileRequestByIdRef,
    restaurantOverlayDismissHandledRef,
    restaurantFocusSessionRef,
    hasRestoredProfileMapRef,
    forceRestaurantProfileMiddleSnapRef,
    restaurantSnapRequestTokenRef,
    previousSaveSheetStateRef,
    fitBoundsSyncTimeoutRef,
    lastVisibleSheetStateRef,
    lastCameraStateRef,
    restaurantOnlySearchRef,
    hasCenteredOnLocationRef,
    clearSearchStateRef,
    isClearingSearchRef,
    cameraStateSyncTimeoutRef,
    setRestaurantProfile,
    setRestaurantOverlayVisible,
    setMapHighlightedRestaurantId,
    setIsSuggestionPanelActive,
    setIsSearchFocused,
    setShowSuggestions,
    setSuggestions,
    setRestaurantSnapRequest,
    setProfileTransitionStatus,
    setIsFollowingUser,
    setHydratedResultsKeySync,
    setMapCameraPadding,
    setSaveSheetState,
    setProfileTransitionStatusState,
    setIsInitialCameraReady,
    beginSuggestionCloseHold,
    ensureSearchOverlay,
    dismissTransientOverlays,
    ensureProfileTransitionSnapshot,
    clearCameraPersistTimeout,
    clearCameraStateSync,
    resolveProfileCameraPadding,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickClosestLocationToCenter,
    pickPreferredRestaurantMapLocation,
    scheduleCameraCommand,
    commitCameraState,
    scheduleCameraStateCommit,
    suppressMapMoved,
    animateSheetTo,
    resetSheetToHidden,
    clearProfileTransitionLock,
    deferRecentlyViewedTrack,
    recordRestaurantView,
    emitRuntimeMechanismEvent,
    fitBoundsSyncBufferMs,
    profileCameraAnimationMs,
    profileRestoreAnimationMs,
    profileMultiLocationZoomOutDelta,
    profileMultiLocationMinZoom,
    restaurantFocusCenterEpsilon,
    restaurantFocusZoomEpsilon,
  } = args;

  const activeHydrationIntentRef = React.useRef<ActiveHydrationIntent | null>(null);

  const cancelActiveHydrationIntent = React.useCallback(
    (
      reason:
        | 'superseded_profile_hydration_intent'
        | 'profile_hydration_cancelled_on_overlay_dismiss',
      context?: {
        nextRequestSeq?: number;
        nextRestaurantId?: string | null;
      }
    ) => {
      const activeIntent = activeHydrationIntentRef.current;
      if (!activeIntent) {
        return;
      }
      emitRuntimeMechanismEvent('profile_intent_cancelled', {
        reason,
        restaurantId: activeIntent.restaurantId,
        requestSeq: activeIntent.requestSeq,
        activeRequestSeq: context?.nextRequestSeq ?? restaurantProfileRequestSeqRef.current,
        nextRestaurantId: context?.nextRestaurantId ?? null,
      });
      activeHydrationIntentRef.current = null;
    },
    [emitRuntimeMechanismEvent, restaurantProfileRequestSeqRef]
  );

  const loadRestaurantProfileData = React.useCallback(
    (restaurantId: string) => {
      const cached = restaurantProfileCacheRef.current.get(restaurantId);
      if (cached) {
        return Promise.resolve(cached);
      }
      const inFlight = restaurantProfileRequestByIdRef.current.get(restaurantId);
      if (inFlight) {
        return inFlight;
      }
      const request = searchService
        .restaurantProfile(restaurantId)
        .then((profile) => {
          const payload = profile as RestaurantProfile | null;
          const restaurant = payload?.restaurant;
          if (!restaurant || restaurant.restaurantId !== restaurantId) {
            throw new Error('restaurant profile payload mismatch');
          }
          const dishes = Array.isArray(payload?.dishes) ? payload.dishes : [];
          const normalized: HydratedRestaurantProfile = {
            restaurant,
            dishes,
          };
          restaurantProfileCacheRef.current.set(restaurantId, normalized);
          return normalized;
        })
        .catch((err) => {
          logger.warn('Restaurant profile fetch failed', {
            message: err instanceof Error ? err.message : 'unknown error',
            restaurantId,
          });
          throw err;
        })
        .finally(() => {
          restaurantProfileRequestByIdRef.current.delete(restaurantId);
        });
      restaurantProfileRequestByIdRef.current.set(restaurantId, request);
      return request;
    },
    [restaurantProfileCacheRef, restaurantProfileRequestByIdRef]
  );

  const seedRestaurantProfile = React.useCallback(
    (restaurant: RestaurantResult, queryLabel: string) => {
      const restaurantId = restaurant.restaurantId;
      const cachedProfile = restaurantProfileCacheRef.current.get(restaurantId);
      setRestaurantProfile((prev) => {
        const isSameRestaurant = prev?.restaurant.restaurantId === restaurantId;
        const existingDishes = isSameRestaurant ? prev?.dishes ?? [] : [];
        const nextDishes = cachedProfile?.dishes ?? existingDishes;
        const seededRestaurant = cachedProfile
          ? {
              ...cachedProfile.restaurant,
              contextualScore: restaurant.contextualScore,
            }
          : restaurant;
        const shouldShowLoading = !cachedProfile && nextDishes.length === 0;
        return {
          restaurant: seededRestaurant,
          dishes: nextDishes,
          queryLabel,
          isFavorite: isSameRestaurant ? prev?.isFavorite ?? false : false,
          isLoading: shouldShowLoading,
        };
      });
      restaurantOverlayDismissHandledRef.current = false;
      setRestaurantOverlayVisible(true);
    },
    [
      restaurantProfileCacheRef,
      restaurantOverlayDismissHandledRef,
      setRestaurantOverlayVisible,
      setRestaurantProfile,
    ]
  );

  const hydrateRestaurantProfileById = React.useCallback(
    (restaurantId: string) => {
      if (!restaurantId) {
        return;
      }
      const requestSeq = (restaurantProfileRequestSeqRef.current += 1);
      cancelActiveHydrationIntent('superseded_profile_hydration_intent', {
        nextRequestSeq: requestSeq,
        nextRestaurantId: restaurantId,
      });
      activeHydrationIntentRef.current = {
        requestSeq,
        restaurantId,
      };
      const cachedProfile = restaurantProfileCacheRef.current.get(restaurantId);
      if (cachedProfile) {
        setRestaurantProfile((prev) => {
          if (!prev || prev.restaurant.restaurantId !== restaurantId) {
            return prev;
          }
          const contextualScore =
            typeof prev.restaurant.contextualScore === 'number' &&
            prev.restaurant.contextualScore > 0
              ? prev.restaurant.contextualScore
              : cachedProfile.restaurant.contextualScore;
          return {
            ...prev,
            restaurant: {
              ...cachedProfile.restaurant,
              contextualScore,
            },
            dishes: cachedProfile.dishes,
            isLoading: false,
          };
        });
        if (activeHydrationIntentRef.current?.requestSeq === requestSeq) {
          activeHydrationIntentRef.current = null;
        }
        return;
      }
      setRestaurantProfile((prev) => {
        if (!prev || prev.restaurant.restaurantId !== restaurantId) {
          return prev;
        }
        if (prev.dishes.length > 0 || prev.isLoading) {
          return prev;
        }
        return {
          ...prev,
          isLoading: true,
        };
      });
      void loadRestaurantProfileData(restaurantId)
        .then((loadedProfile) => {
          if (requestSeq !== restaurantProfileRequestSeqRef.current) {
            return;
          }
          setRestaurantProfile((prev) => {
            if (!prev || prev.restaurant.restaurantId !== restaurantId) {
              return prev;
            }
            const contextualScore =
              typeof prev.restaurant.contextualScore === 'number' &&
              prev.restaurant.contextualScore > 0
                ? prev.restaurant.contextualScore
                : loadedProfile.restaurant.contextualScore;
            return {
              ...prev,
              restaurant: {
                ...loadedProfile.restaurant,
                contextualScore,
              },
              dishes: loadedProfile.dishes,
              isLoading: false,
            };
          });
        })
        .catch(() => {
          if (requestSeq !== restaurantProfileRequestSeqRef.current) {
            return;
          }
          setRestaurantProfile((prev) => {
            if (!prev || prev.restaurant.restaurantId !== restaurantId) {
              return prev;
            }
            return {
              ...prev,
              isLoading: false,
            };
          });
        })
        .finally(() => {
          if (activeHydrationIntentRef.current?.requestSeq === requestSeq) {
            activeHydrationIntentRef.current = null;
          }
        });
    },
    [
      cancelActiveHydrationIntent,
      emitRuntimeMechanismEvent,
      loadRestaurantProfileData,
      restaurantProfileCacheRef,
      restaurantProfileRequestSeqRef,
      setRestaurantProfile,
    ]
  );

  const focusRestaurantProfileCamera = React.useCallback(
    (
      restaurant: RestaurantResult,
      source: ProfileSource,
      options?: {
        pressedCoordinate?: Coordinate | null;
        preferPressedCoordinate?: boolean;
      }
    ) => {
      const shouldMoveCameraForProfileOpen =
        source === 'results_sheet' ||
        source === 'dish_card' ||
        source === 'autocomplete' ||
        source === 'auto_open_single_candidate';
      if (!shouldMoveCameraForProfileOpen) {
        return;
      }
      const pressedCoordinate = options?.pressedCoordinate ?? null;
      const preferPressedCoordinate = options?.preferPressedCoordinate === true;
      const profilePadding = resolveProfileCameraPadding();
      const restaurantLocations = resolveRestaurantMapLocations(restaurant);
      const locationSelectionAnchor = resolveRestaurantLocationSelectionAnchor();
      const pressedFocusLocation =
        preferPressedCoordinate && pressedCoordinate
          ? pickClosestLocationToCenter(restaurantLocations, pressedCoordinate)
          : null;
      const focusLocation =
        pressedFocusLocation ??
        pickPreferredRestaurantMapLocation(restaurant, locationSelectionAnchor) ??
        null;
      const focusCoordinate = focusLocation
        ? ({ lng: focusLocation.longitude, lat: focusLocation.latitude } as Coordinate)
        : pressedCoordinate ?? null;
      if (!focusCoordinate) {
        return;
      }
      const focusLocationKey = focusLocation
        ? `${restaurant.restaurantId}:${focusLocation.locationId}`
        : pressedCoordinate
        ? `${restaurant.restaurantId}:${pressedCoordinate.lng.toFixed(
            5
          )}:${pressedCoordinate.lat.toFixed(5)}`
        : `${restaurant.restaurantId}:anchor`;
      const previousFocusSession = restaurantFocusSessionRef.current;
      const isSameRestaurantFocusSession =
        previousFocusSession.restaurantId === restaurant.restaurantId;
      const shouldApplyInitialMultiLocationZoomOut =
        restaurantLocations.length > 1 &&
        (source === 'results_sheet' ||
          source === 'auto_open_single_candidate' ||
          source === 'autocomplete') &&
        (!isSameRestaurantFocusSession ||
          !previousFocusSession.hasAppliedInitialMultiLocationZoomOut);
      const hasAppliedMultiLocationZoomOut =
        (isSameRestaurantFocusSession &&
          previousFocusSession.hasAppliedInitialMultiLocationZoomOut) ||
        shouldApplyInitialMultiLocationZoomOut;
      const nextCenter: [number, number] = [focusCoordinate.lng, focusCoordinate.lat];
      const currentZoom =
        lastCameraStateRef.current?.zoom ?? (typeof mapZoom === 'number' ? mapZoom : null);
      if (typeof currentZoom === 'number' && Number.isFinite(currentZoom)) {
        const nextZoom = shouldApplyInitialMultiLocationZoomOut
          ? Math.max(currentZoom - profileMultiLocationZoomOutDelta, profileMultiLocationMinZoom)
          : currentZoom;
        const isSameFocusedLocation =
          isSameRestaurantFocusSession && previousFocusSession.locationKey === focusLocationKey;
        const currentCenter = lastCameraStateRef.current?.center ?? null;
        const isAlreadyCenteredOnTarget =
          currentCenter != null &&
          Math.abs(currentCenter[0] - nextCenter[0]) <= restaurantFocusCenterEpsilon &&
          Math.abs(currentCenter[1] - nextCenter[1]) <= restaurantFocusCenterEpsilon;
        const isAlreadyAtTargetZoom =
          Math.abs(currentZoom - nextZoom) <= restaurantFocusZoomEpsilon;
        if (
          isSameFocusedLocation &&
          (cameraStateSyncTimeoutRef.current != null ||
            (isAlreadyCenteredOnTarget && isAlreadyAtTargetZoom))
        ) {
          return;
        }
        restaurantFocusSessionRef.current = {
          restaurantId: restaurant.restaurantId,
          locationKey: focusLocationKey,
          hasAppliedInitialMultiLocationZoomOut: hasAppliedMultiLocationZoomOut,
        };
        scheduleCameraCommand(() => {
          clearCameraPersistTimeout();
          setIsFollowingUser(false);
          suppressMapMoved();
          if (!cameraRef.current?.setCamera) {
            commitCameraState({
              center: nextCenter,
              zoom: nextZoom,
              padding: profilePadding,
            });
            return;
          }
          cameraRef.current.setCamera({
            centerCoordinate: nextCenter,
            zoomLevel: nextZoom,
            padding: profilePadding,
            animationDuration: profileCameraAnimationMs,
            animationMode: 'easeTo',
          });
          scheduleCameraStateCommit(
            {
              center: nextCenter,
              zoom: nextZoom,
              padding: profilePadding,
            },
            profileCameraAnimationMs + fitBoundsSyncBufferMs
          );
        });
      } else if (lastCameraStateRef.current) {
        restaurantFocusSessionRef.current = {
          restaurantId: restaurant.restaurantId,
          locationKey: focusLocationKey,
          hasAppliedInitialMultiLocationZoomOut: hasAppliedMultiLocationZoomOut,
        };
        lastCameraStateRef.current = { ...lastCameraStateRef.current, center: nextCenter };
      }
    },
    [
      cameraRef,
      cameraStateSyncTimeoutRef,
      clearCameraPersistTimeout,
      commitCameraState,
      fitBoundsSyncBufferMs,
      lastCameraStateRef,
      mapZoom,
      pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation,
      profileCameraAnimationMs,
      profileMultiLocationMinZoom,
      profileMultiLocationZoomOutDelta,
      resolveProfileCameraPadding,
      resolveRestaurantLocationSelectionAnchor,
      resolveRestaurantMapLocations,
      restaurantFocusCenterEpsilon,
      restaurantFocusSessionRef,
      restaurantFocusZoomEpsilon,
      scheduleCameraCommand,
      scheduleCameraStateCommit,
      setIsFollowingUser,
      suppressMapMoved,
    ]
  );

  const openRestaurantProfilePreview = React.useCallback(
    (restaurantId: string, restaurantName: string, pressedCoordinate?: Coordinate | null) => {
      const trimmedName = restaurantName.trim();
      if (!restaurantId || !trimmedName) {
        return;
      }
      const forceMiddleSnap = forceRestaurantProfileMiddleSnapRef.current;
      forceRestaurantProfileMiddleSnapRef.current = false;
      const transition = profileTransitionRef.current;
      if (transition.status === 'opening' || transition.status === 'closing') {
        return;
      }
      setMapHighlightedRestaurantId((prev) => (prev === restaurantId ? prev : restaurantId));
      ensureSearchOverlay();
      dismissTransientOverlays();
      const shouldDeferSuggestionClear = beginSuggestionCloseHold();
      setIsSuggestionPanelActive(false);
      setIsSearchFocused(false);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      inputRef.current?.blur();
      Keyboard.dismiss();
      profileDismissBehaviorRef.current = forceMiddleSnap ? 'restore' : 'clear';
      shouldClearSearchOnProfileDismissRef.current = false;
      ensureProfileTransitionSnapshot();
      clearCameraPersistTimeout();
      clearCameraStateSync();
      if (fitBoundsSyncTimeoutRef.current) {
        clearTimeout(fitBoundsSyncTimeoutRef.current);
        fitBoundsSyncTimeoutRef.current = null;
      }
      if (pressedCoordinate) {
        const profilePadding = resolveProfileCameraPadding();
        const nextCenter: [number, number] = [pressedCoordinate.lng, pressedCoordinate.lat];
        const currentZoom =
          lastCameraStateRef.current?.zoom ?? (typeof mapZoom === 'number' ? mapZoom : null);
        if (typeof currentZoom === 'number' && Number.isFinite(currentZoom)) {
          scheduleCameraCommand(() => {
            clearCameraPersistTimeout();
            setIsFollowingUser(false);
            suppressMapMoved();
            if (!cameraRef.current?.setCamera) {
              commitCameraState({
                center: nextCenter,
                zoom: currentZoom,
                padding: profilePadding,
              });
              return;
            }
            cameraRef.current.setCamera({
              centerCoordinate: nextCenter,
              zoomLevel: currentZoom,
              padding: profilePadding,
              animationDuration: profileCameraAnimationMs,
              animationMode: 'easeTo',
            });
            scheduleCameraStateCommit(
              {
                center: nextCenter,
                zoom: currentZoom,
                padding: profilePadding,
              },
              profileCameraAnimationMs + fitBoundsSyncBufferMs
            );
          });
        } else if (lastCameraStateRef.current) {
          lastCameraStateRef.current = { ...lastCameraStateRef.current, center: nextCenter };
        }
      }
      if (forceMiddleSnap) {
        const overlaySnapStore = useOverlaySheetPositionStore.getState();
        overlaySnapStore.setSharedSnap('middle');
      } else {
        transition.savedSheetSnap = 'hidden';
      }
      setRestaurantSnapRequest({
        snap: 'middle',
        token: (restaurantSnapRequestTokenRef.current += 1),
      });
      setProfileTransitionStatus(forceMiddleSnap ? 'opening' : 'open', 'open');
      seedRestaurantProfile(
        {
          restaurantId,
          restaurantName: trimmedName,
          restaurantAliases: [],
          contextualScore: 0,
          topFood: [],
        },
        trimmedName
      );
      hydrateRestaurantProfileById(restaurantId);
    },
    [
      beginSuggestionCloseHold,
      cameraRef,
      clearCameraPersistTimeout,
      clearCameraStateSync,
      commitCameraState,
      dismissTransientOverlays,
      ensureProfileTransitionSnapshot,
      ensureSearchOverlay,
      fitBoundsSyncBufferMs,
      fitBoundsSyncTimeoutRef,
      forceRestaurantProfileMiddleSnapRef,
      hydrateRestaurantProfileById,
      inputRef,
      lastCameraStateRef,
      mapZoom,
      profileCameraAnimationMs,
      profileDismissBehaviorRef,
      profileTransitionRef,
      resolveProfileCameraPadding,
      restaurantSnapRequestTokenRef,
      scheduleCameraCommand,
      scheduleCameraStateCommit,
      seedRestaurantProfile,
      setIsFollowingUser,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setMapHighlightedRestaurantId,
      setProfileTransitionStatus,
      setRestaurantSnapRequest,
      setShowSuggestions,
      setSuggestions,
      shouldClearSearchOnProfileDismissRef,
      suppressMapMoved,
    ]
  );

  const openRestaurantProfile = React.useCallback(
    (
      restaurant: RestaurantResult,
      _foodResultsOverride?: FoodResult[],
      pressedCoordinate?: Coordinate | null,
      source: ProfileSource = 'results_sheet'
    ) => {
      const forceMiddleSnap = forceRestaurantProfileMiddleSnapRef.current;
      forceRestaurantProfileMiddleSnapRef.current = false;
      const transition = profileTransitionRef.current;
      if (transition.status === 'opening' || transition.status === 'closing') {
        return;
      }
      setMapHighlightedRestaurantId((prev) =>
        prev === restaurant.restaurantId ? prev : restaurant.restaurantId
      );
      ensureSearchOverlay();
      dismissTransientOverlays();
      const shouldDeferSuggestionClear = beginSuggestionCloseHold();
      setIsSuggestionPanelActive(false);
      setIsSearchFocused(false);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      inputRef.current?.blur();
      Keyboard.dismiss();
      const isRestaurantOnlyContext =
        source === 'autocomplete' ||
        restaurantOnlySearchRef.current === restaurant.restaurantId ||
        restaurantOnlyId === restaurant.restaurantId;
      const shouldClearOnDismiss =
        source === 'auto_open_single_candidate' || isRestaurantOnlyContext;
      profileDismissBehaviorRef.current = shouldClearOnDismiss ? 'clear' : 'restore';
      shouldClearSearchOnProfileDismissRef.current = shouldClearOnDismiss;
      const label = (submittedQuery || trimmedQuery || 'Search').trim();
      ensureProfileTransitionSnapshot();
      clearCameraPersistTimeout();
      clearCameraStateSync();
      if (fitBoundsSyncTimeoutRef.current) {
        clearTimeout(fitBoundsSyncTimeoutRef.current);
        fitBoundsSyncTimeoutRef.current = null;
      }
      const shouldPreferPressedCoordinate =
        source === 'results_sheet' &&
        Boolean(pressedCoordinate) &&
        isRestaurantOverlayVisible &&
        restaurantProfile?.restaurant.restaurantId === restaurant.restaurantId;
      focusRestaurantProfileCamera(restaurant, source, {
        pressedCoordinate,
        preferPressedCoordinate: shouldPreferPressedCoordinate,
      });
      if (forceMiddleSnap) {
        const overlaySnapStore = useOverlaySheetPositionStore.getState();
        overlaySnapStore.setSharedSnap('middle');
      }
      setRestaurantSnapRequest({
        snap: 'middle',
        token: (restaurantSnapRequestTokenRef.current += 1),
      });
      hasRestoredProfileMapRef.current = false;
      hasCenteredOnLocationRef.current = true;
      if (!isInitialCameraReady) {
        setIsInitialCameraReady(true);
      }
      setProfileTransitionStatus('opening', 'open');

      if (saveSheetState.visible && !previousSaveSheetStateRef.current) {
        previousSaveSheetStateRef.current = saveSheetState;
        setSaveSheetState((prev) => ({ ...prev, visible: false }));
      }

      seedRestaurantProfile(restaurant, label);
      hydrateRestaurantProfileById(restaurant.restaurantId);

      if (source !== 'autocomplete' && source !== 'dish_card') {
        deferRecentlyViewedTrack(restaurant.restaurantId, restaurant.restaurantName);
        void recordRestaurantView(restaurant.restaurantId, source);
      }
    },
    [
      beginSuggestionCloseHold,
      clearCameraPersistTimeout,
      clearCameraStateSync,
      deferRecentlyViewedTrack,
      dismissTransientOverlays,
      ensureProfileTransitionSnapshot,
      ensureSearchOverlay,
      fitBoundsSyncTimeoutRef,
      focusRestaurantProfileCamera,
      forceRestaurantProfileMiddleSnapRef,
      hasCenteredOnLocationRef,
      hasRestoredProfileMapRef,
      hydrateRestaurantProfileById,
      inputRef,
      isInitialCameraReady,
      isRestaurantOverlayVisible,
      previousSaveSheetStateRef,
      profileDismissBehaviorRef,
      profileTransitionRef,
      recordRestaurantView,
      restaurantOnlyId,
      restaurantOnlySearchRef,
      restaurantProfile,
      restaurantSnapRequestTokenRef,
      saveSheetState,
      seedRestaurantProfile,
      setIsInitialCameraReady,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setMapHighlightedRestaurantId,
      setProfileTransitionStatus,
      setRestaurantSnapRequest,
      setSaveSheetState,
      setShowSuggestions,
      setSuggestions,
      shouldClearSearchOnProfileDismissRef,
      submittedQuery,
      trimmedQuery,
    ]
  );

  const openRestaurantProfileFromResults = React.useCallback(
    (
      restaurant: RestaurantResult,
      foodResultsOverride?: FoodResult[],
      source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
    ) => {
      openRestaurantProfile(restaurant, foodResultsOverride, null, source ?? 'results_sheet');
    },
    [openRestaurantProfile]
  );

  const applyCameraSnapshot = React.useCallback(
    (snapshot: CameraSnapshot, options?: { animationDuration?: number }) => {
      const padding = snapshot.padding ?? {
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
      };
      scheduleCameraCommand(() => {
        clearCameraPersistTimeout();
        clearCameraStateSync();
        setIsFollowingUser(false);
        suppressMapMoved();
        if (!cameraRef.current?.setCamera) {
          commitCameraState({
            center: snapshot.center,
            zoom: snapshot.zoom,
            padding: snapshot.padding ?? null,
          });
          return;
        }
        const animationDuration = options?.animationDuration ?? profileRestoreAnimationMs;
        cameraRef.current.setCamera({
          centerCoordinate: snapshot.center,
          zoomLevel: snapshot.zoom,
          padding,
          animationDuration,
          animationMode: 'easeTo',
        });
        scheduleCameraStateCommit(
          {
            center: snapshot.center,
            zoom: snapshot.zoom,
            padding: snapshot.padding ?? null,
          },
          animationDuration + fitBoundsSyncBufferMs
        );
      });
    },
    [
      cameraRef,
      clearCameraPersistTimeout,
      clearCameraStateSync,
      commitCameraState,
      fitBoundsSyncBufferMs,
      profileRestoreAnimationMs,
      scheduleCameraCommand,
      scheduleCameraStateCommit,
      setIsFollowingUser,
      suppressMapMoved,
    ]
  );

  const restoreRestaurantProfileMap = React.useCallback(() => {
    if (hasRestoredProfileMapRef.current) {
      return;
    }
    hasRestoredProfileMapRef.current = true;
    clearCameraStateSync();
    if (fitBoundsSyncTimeoutRef.current) {
      clearTimeout(fitBoundsSyncTimeoutRef.current);
      fitBoundsSyncTimeoutRef.current = null;
    }
    const snapshot = profileTransitionRef.current.savedCamera;
    profileTransitionRef.current.savedCamera = null;
    if (!snapshot) {
      setMapCameraPadding(null);
      return;
    }
    applyCameraSnapshot(snapshot, { animationDuration: profileRestoreAnimationMs });
  }, [
    applyCameraSnapshot,
    clearCameraStateSync,
    fitBoundsSyncTimeoutRef,
    hasRestoredProfileMapRef,
    profileRestoreAnimationMs,
    profileTransitionRef,
    setMapCameraPadding,
  ]);

  const restoreSearchSheetState = React.useCallback(() => {
    const transition = profileTransitionRef.current;
    const fallbackState = lastVisibleSheetStateRef.current;
    const targetState = transition.savedSheetSnap ?? fallbackState;
    if (targetState && targetState !== 'hidden') {
      animateSheetTo(targetState);
    }
    transition.savedSheetSnap = null;
  }, [animateSheetTo, lastVisibleSheetStateRef, profileTransitionRef]);

  const handleRestaurantOverlayDismissed = React.useCallback(() => {
    if (restaurantOverlayDismissHandledRef.current) {
      return;
    }
    if (!restaurantProfile && !isRestaurantOverlayVisible) {
      return;
    }
    restaurantOverlayDismissHandledRef.current = true;
    const nextRequestSeq = restaurantProfileRequestSeqRef.current + 1;
    cancelActiveHydrationIntent('profile_hydration_cancelled_on_overlay_dismiss', {
      nextRequestSeq,
      nextRestaurantId: null,
    });
    restaurantProfileRequestSeqRef.current = nextRequestSeq;
    const shouldRestoreSearchSheet = profileDismissBehaviorRef.current !== 'clear';
    const shouldClearSearch = shouldClearSearchOnProfileDismissRef.current;
    setRestaurantSnapRequest(null);
    setMapHighlightedRestaurantId(null);
    setRestaurantProfile(null);
    setRestaurantOverlayVisible(false);
    restaurantFocusSessionRef.current = {
      restaurantId: null,
      locationKey: null,
      hasAppliedInitialMultiLocationZoomOut: false,
    };
    restoreRestaurantProfileMap();
    if (isSearchOverlay && shouldRestoreSearchSheet) {
      restoreSearchSheetState();
    }
    if (previousSaveSheetStateRef.current?.visible) {
      setSaveSheetState(previousSaveSheetStateRef.current);
    }
    previousSaveSheetStateRef.current = null;
    hasRestoredProfileMapRef.current = false;
    profileTransitionRef.current = {
      status: 'idle',
      savedSheetSnap: null,
      savedCamera: null,
      savedResultsScrollOffset: null,
    };
    setProfileTransitionStatusState('idle');
    clearProfileTransitionLock();
    profileDismissBehaviorRef.current = 'restore';
    shouldClearSearchOnProfileDismissRef.current = false;
    if (shouldClearSearch) {
      if (clearSearchStateRef.current) {
        isClearingSearchRef.current = true;
        clearSearchStateRef.current({ skipSheetAnimation: true });
      } else {
        isClearingSearchRef.current = false;
      }
    }
  }, [
    clearProfileTransitionLock,
    clearSearchStateRef,
    hasRestoredProfileMapRef,
    isClearingSearchRef,
    isRestaurantOverlayVisible,
    isSearchOverlay,
    previousSaveSheetStateRef,
    profileDismissBehaviorRef,
    profileTransitionRef,
    cancelActiveHydrationIntent,
    restaurantFocusSessionRef,
    restaurantOverlayDismissHandledRef,
    restaurantProfile,
    restaurantProfileRequestSeqRef,
    restoreRestaurantProfileMap,
    restoreSearchSheetState,
    setMapHighlightedRestaurantId,
    setProfileTransitionStatusState,
    setRestaurantOverlayVisible,
    setRestaurantProfile,
    setRestaurantSnapRequest,
    setSaveSheetState,
    shouldClearSearchOnProfileDismissRef,
  ]);

  const closeRestaurantProfile = React.useCallback(() => {
    if (!restaurantProfile && !isRestaurantOverlayVisible) {
      return;
    }
    if (pendingMarkerOpenAnimationFrameRef.current != null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    }
    setMapHighlightedRestaurantId(null);
    const transition = profileTransitionRef.current;
    if (transition.status !== 'closing') {
      setProfileTransitionStatus('closing');
    }
    if (resultsHydrationKey && resultsHydrationKey !== hydratedResultsKey) {
      phaseBMaterializerRef.current.commitHydrationImmediately({
        operationId: hydrationOperationId ?? 'profile-close-hydration',
        nextHydrationKey: resultsHydrationKey,
        commitHydrationKey: (nextHydrationKey) => {
          setHydratedResultsKeySync(nextHydrationKey);
        },
      });
    }
    if (profileDismissBehaviorRef.current === 'clear') {
      resetSheetToHidden();
    }
    handleRestaurantOverlayDismissed();
  }, [
    handleRestaurantOverlayDismissed,
    hydrationOperationId,
    hydratedResultsKey,
    isRestaurantOverlayVisible,
    pendingMarkerOpenAnimationFrameRef,
    phaseBMaterializerRef,
    profileDismissBehaviorRef,
    profileTransitionRef,
    resetSheetToHidden,
    resultsHydrationKey,
    restaurantProfile,
    setHydratedResultsKeySync,
    setMapHighlightedRestaurantId,
    setProfileTransitionStatus,
  ]);

  const handleRestaurantOverlayRequestClose = React.useCallback(() => {
    setMapHighlightedRestaurantId(null);
    closeRestaurantProfile();
  }, [closeRestaurantProfile, setMapHighlightedRestaurantId]);

  return {
    hydrateRestaurantProfileById,
    focusRestaurantProfileCamera,
    openRestaurantProfilePreview,
    openRestaurantProfile,
    openRestaurantProfileFromResults,
    closeRestaurantProfile,
    handleRestaurantOverlayDismissed,
    handleRestaurantOverlayRequestClose,
  };
};
