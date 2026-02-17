import React from 'react';
import {
  Animated,
  AppState,
  InteractionManager,
  Keyboard,
  PixelRatio,
  unstable_batchedUpdates,
  View,
  Easing as RNEasing,
} from 'react-native';
import type { LayoutChangeEvent, LayoutRectangle, TextInput } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import {
  Easing,
  Extrapolation,
  interpolate,
  runOnUI,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import MapboxGL from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Text } from '../../components';
import { OVERLAY_TAB_HEADER_HEIGHT } from '../../overlays/overlaySheetStyles';
import { type OverlayModalSheetHandle } from '../../overlays/OverlayModalSheet';
import { resolveExpandedTop } from '../../overlays/sheetUtils';
import { logger } from '../../utils';
import { searchService } from '../../services/search';
import type { FavoriteListType } from '../../services/favorite-lists';
import type { AutocompleteMatch } from '../../services/autocomplete';
import { useSearchStore } from '../../store/searchStore';
import { useSystemStatusStore } from '../../store/systemStatusStore';
import type {
  SearchResponse,
  FoodResult,
  RestaurantResult,
  MapBounds,
  Coordinate,
} from '../../types';
import type { RootStackParamList } from '../../types/navigation';
import { type RestaurantOverlayData } from '../../overlays/panels/RestaurantPanel';
import { buildMapStyleURL } from '../../constants/map';
import { useOverlayStore, type OverlayKey } from '../../store/overlayStore';
import { useOverlaySheetPositionStore } from '../../overlays/useOverlaySheetPositionStore';
import { type MaskedHole } from '../../components/MaskedHoleOverlay';
import { useSearchRequests } from '../../hooks/useSearchRequests';
import useTransitionDriver from '../../hooks/use-transition-driver';
import { useDebouncedLayoutMeasurement } from '../../hooks/useDebouncedLayoutMeasurement';
import SearchBottomNav from './components/SearchBottomNav';
import SearchMapLoadingGrid from './components/SearchMapLoadingGrid';
import SearchOverlayHeaderChrome from './components/SearchOverlayHeaderChrome';
import SearchPriceSheet from './components/SearchPriceSheet';
import SearchResultsSheetTree from './components/SearchResultsSheetTree';
import SearchRankAndScoreSheets, {
  type ScoreInfoPayload,
} from './components/SearchRankAndScoreSheets';
import {
  SEARCH_BOTTOM_NAV_ICON_RENDERERS,
  type SearchBottomNavItemKey,
} from './components/search-bottom-nav-icons';
import SearchStatusBarFade from './components/SearchStatusBarFade';
import SearchSuggestionSurface from './components/SearchSuggestionSurface';
import { type SearchFiltersLayoutCache } from './components/SearchFilters';
import DishResultCard from './components/dish-result-card';
import RestaurantResultCard from './components/restaurant-result-card';
import SearchMap, {
  type MapboxMapRef,
  type RestaurantFeatureProperties,
} from './components/search-map';
import useSearchChromeTransition from './hooks/use-search-chrome-transition';
import useSearchHistory from './hooks/use-search-history';
import { usePollCreationPanelController } from './hooks/use-poll-creation-panel-controller';
import { useAutocompleteController } from './hooks/use-autocomplete-controller';
import { useOverlaySnapOrchestration } from './hooks/use-overlay-snap-orchestration';
import { useSearchPriceSheetController } from './hooks/use-search-price-sheet-controller';
import { useSearchResultsReadModel } from './hooks/use-search-results-read-model';
import { useRestaurantLocationSelection } from './hooks/use-restaurant-location-selection';
import { useSaveSheetState } from './hooks/use-save-sheet-state';
import { useSearchLayoutController } from './hooks/use-search-layout-controller';
import { useSearchClearController } from './hooks/use-search-clear-controller';
import { useSearchFocusController } from './hooks/use-search-focus-controller';
import { useSearchViewMoreController } from './hooks/use-search-view-more-controller';
import { useRecentSearchActions } from './hooks/use-recent-search-actions';
import { useSuggestionInteractionController } from './hooks/use-suggestion-interaction-controller';
import { useSuggestionDisplayModel } from './hooks/use-suggestion-display-model';
import { useSuggestionLayoutWarmth } from './hooks/use-suggestion-layout-warmth';
import { useSuggestionHistoryBuffer } from './hooks/use-suggestion-history-buffer';
import { useSuggestionTransitionHold } from './hooks/use-suggestion-transition-hold';
import { useUserLocationController } from './hooks/use-user-location-controller';
import useSearchSheet from './hooks/use-search-sheet';
import useScrollDividerStyle from './hooks/use-scroll-divider-style';
import useSearchSubmit from './hooks/use-search-submit';
import { useMapPresentationController } from './runtime/map/map-presentation-controller';
import { useMapDiffApplier } from './runtime/map/map-diff-applier';
import { useMapInteractionController } from './runtime/map/map-interaction-controller';
import { useMarkerInteractionController } from './runtime/map/marker-interaction-controller';
import { useShortcutCoverageOwner } from './runtime/map/use-shortcut-coverage-owner';
import { useStableMapHandlers } from './runtime/map/use-stable-map-handlers';
import { buildMarkerCatalogReadModel } from './runtime/map/map-read-model-builder';
import { type ResultsListItem } from './runtime/read-models/read-model-selectors';
import { useQueryMutationOrchestrator } from './runtime/mutations/query-mutation-orchestrator';
import { useProfileRuntimeController } from './runtime/profile/profile-runtime-controller';
import { useProfileCameraOrchestration } from './runtime/profile/use-profile-camera-orchestration';
import { useProfileAutoOpenController } from './runtime/profile/use-profile-auto-open-controller';
import { useShortcutHarnessObserver } from './runtime/telemetry/shortcut-harness-observer';
import { useSearchRuntimeComposition } from './hooks/use-search-runtime-composition';
import {
  isRunOneHandoffDeferredChromePhase,
  type RunOneHandoffPhase,
} from './runtime/controller/run-one-handoff-phase';
import useSearchTransition from './hooks/use-search-transition';
import { useSearchSessionCoordinator } from './session/use-search-session-coordinator';
import styles from './styles';
import { SEARCH_BAR_SHADOW, SEARCH_SHORTCUT_SHADOW } from './shadows';
import { LINE_HEIGHTS } from '../../constants/typography';
import type { OverlayHeaderActionMode } from '../../overlays/useOverlayHeaderActionController';
import {
  getCachedBottomNavMetrics,
  setCachedBottomNavMetricsFromLayout,
} from './utils/bottom-nav-metrics-cache';
import {
  ACTIVE_TAB_COLOR,
  ACTIVE_TAB_COLOR_DARK,
  AUTOCOMPLETE_CACHE_TTL_MS,
  AUTOCOMPLETE_MIN_CHARS,
  CAMERA_STORAGE_KEY,
  LABEL_TEXT_SIZE,
  LOCATION_STORAGE_KEY,
  MINIMUM_VOTES_FILTER,
  NAV_TOP_PADDING,
  NAV_BOTTOM_PADDING,
  SCORE_INFO_MAX_HEIGHT,
  SCREEN_HEIGHT,
  SEARCH_CHROME_FADE_ZONE_PX,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_BAR_HOLE_PADDING,
  SEARCH_BAR_HOLE_RADIUS,
  SEARCH_HORIZONTAL_PADDING,
  SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM,
  SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP,
  SEARCH_SUGGESTION_HEADER_PANEL_GAP,
  SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM,
  SHORTCUT_CHIP_HOLE_PADDING,
  SHORTCUT_CHIP_HOLE_RADIUS,
  SINGLE_LOCATION_ZOOM_LEVEL,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
} from './constants/search';

const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const EMPTY_SORTED_RESTAURANT_MARKERS: Array<Feature<Point, RestaurantFeatureProperties>> = [];
const SEARCH_BOTTOM_NAV_ITEMS: ReadonlyArray<{ key: SearchBottomNavItemKey; label: string }> = [
  { key: 'search', label: 'Search' },
  { key: 'polls', label: 'Polls' },
  { key: 'bookmarks', label: 'Favorites' },
  { key: 'profile', label: 'Profile' },
];

import { getRangeFromLevels, type PriceRangeTuple } from './utils/price';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from './utils/marker-lod';
import { getQualityColorFromScore } from './utils/quality';
import { formatCompactCount } from './utils/format';
import { boundsFromPairs, hasBoundsMovedSignificantly, isLngLatTuple } from './utils/geo';

MapboxGL.setTelemetryEnabled(false);

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';
const PIXEL_SCALE = PixelRatio.get();
const CUTOUT_EDGE_SLOP = 1 / PIXEL_SCALE;
const floorToPixel = (value: number) => Math.floor(value * PIXEL_SCALE) / PIXEL_SCALE;
const ceilToPixel = (value: number) => Math.ceil(value * PIXEL_SCALE) / PIXEL_SCALE;
const roundPerfValue = (value: number): number => Math.round(value * 10) / 10;
const SHORTCUT_HARNESS_RUN_TIMEOUT_MS = 45000;
const SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS = 320;
type DockedPollsSnapRequest = {
  snap: OverlaySheetSnap;
  token: number;
};
const resolveResultsPage = (response: SearchResponse | null): number | null => {
  if (!response) {
    return null;
  }
  const page = response.metadata?.page;
  if (typeof page === 'number' && Number.isFinite(page) && page > 0) {
    return page;
  }
  return 1;
};

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

const hashStringFNV1a = (value: string, seed: number = FNV1A_OFFSET_BASIS): number => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV1A_PRIME) >>> 0;
  }
  return hash >>> 0;
};

const buildStableKeyFingerprint = (keys: readonly string[]): string => {
  if (!keys.length) {
    return '0:empty:empty:0';
  }

  let hash = FNV1A_OFFSET_BASIS;
  for (const key of keys) {
    hash = hashStringFNV1a(key, hash);
  }

  const firstKey = keys[0] ?? 'empty';
  const lastKey = keys[keys.length - 1] ?? 'empty';
  return `${keys.length}:${firstKey}:${lastKey}:${hash.toString(36)}`;
};

const shadowFadeStyle = (baseOpacity: number, baseElevation: number, alpha: number) => {
  'worklet';
  const clampedAlpha = Math.max(0, Math.min(alpha, 1));
  return {
    shadowOpacity: baseOpacity * clampedAlpha,
    elevation: clampedAlpha > 0 ? baseElevation : 0,
  };
};
const SEARCH_BAR_BASE_SHADOW_OPACITY = SEARCH_BAR_SHADOW.shadowOpacity ?? 0;
const SEARCH_BAR_BASE_ELEVATION = SEARCH_BAR_SHADOW.elevation ?? 0;
const SEARCH_SHORTCUT_BASE_SHADOW_OPACITY = SEARCH_SHORTCUT_SHADOW.shadowOpacity ?? 0;
const SEARCH_SHORTCUT_BASE_ELEVATION = SEARCH_SHORTCUT_SHADOW.elevation ?? 0;
const SEARCH_SUGGESTION_EMPTY_FILL_HEIGHT = 16;
const SUGGESTION_PANEL_FADE_MS = 200;
const SUGGESTION_PANEL_LAYOUT_HOLD_MS = 200;
const SUGGESTION_PANEL_KEYBOARD_DELAY_MS = 0;
const SUGGESTION_PANEL_MIN_MS = 160;
const SUGGESTION_PANEL_MAX_MS = 320;
const SEARCH_SHORTCUTS_FADE_MS = 200;
const SEARCH_SHORTCUTS_STRIP_FALLBACK_HEIGHT = 52;
const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION === '1';
const JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS = 0.25;
const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE =
  process.env.EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG === '1';
const JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS = 12;
const JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE = false;
const JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MIN_MS = 120;
const RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS = 45;
const RUN_ONE_STALL_PRESSURE_THRESHOLD_MS = 80;
const RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS = new Set([
  'SearchScreen',
  'SearchMapTree',
  'SearchResultsSheetTree',
  'SearchOverlayChrome',
  'BottomNav',
]);
// Keep reveal transitions shallow in shortcut mode to avoid one-frame burst work.
const MARKER_REVEAL_CHUNK = 1;
const MARKER_REVEAL_STAGGER_MS = 0;
const MAX_FULL_PINS = 30;
const MAX_SHORTCUT_DOT_FEATURES = 80;
const LOD_CAMERA_THROTTLE_MS = 80;
const LOD_PIN_TOGGLE_STABLE_MS_MOVING = 190;
const LOD_PIN_TOGGLE_STABLE_MS_IDLE = 0;
const LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING = 120;
const LOD_VISIBLE_CANDIDATE_BUFFER = 16;
const PROFILE_PIN_TARGET_CENTER_RATIO = 0.25;
const PROFILE_PIN_MIN_VISIBLE_HEIGHT = 160;
const SHORTCUT_CONTENT_FADE_DEFAULT = 0;
const SHORTCUT_CONTENT_FADE_OUT = 1;
const SHORTCUT_CONTENT_FADE_HOLD = 2;
const PROFILE_CAMERA_ANIMATION_MS = 800;
const PROFILE_RESTORE_ANIMATION_MS = 650;
const PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA = 0.55;
const PROFILE_MULTI_LOCATION_MIN_ZOOM = 3.5;
const RESTAURANT_FOCUS_CENTER_EPSILON = 1e-5;
const RESTAURANT_FOCUS_ZOOM_EPSILON = 0.01;
const PROFILE_TRANSITION_LOCK_MS = 750;
const FIT_BOUNDS_SYNC_BUFFER_MS = 160;
const RESULTS_WASH_FADE_MS = 220;
const RESULTS_VISUAL_READY_FALLBACK_MS = 1200;

const normalizeProfilerContributorId = (id: string): string => {
  const normalized = id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : 'unknown';
};

type MapCameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

type ProfileTransitionStatus = 'idle' | 'opening' | 'open' | 'closing';

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

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Main'>>();
  const useMemo = React.useMemo;
  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const lastSearchBoundsCaptureSeqRef = React.useRef(0);
  const hasPrimedInitialBoundsRef = React.useRef(false);
  const [mapCenter, setMapCenter] = React.useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = React.useState<number | null>(null);
  const {
    viewportBoundsService,
    latestBoundsRef,
    cameraIntentArbiter,
    overlayRuntimeController,
    searchSessionController,
    searchRuntimeBus,
    runOneHandoffCoordinatorRef,
    runtimeWorkSchedulerRef,
    phaseBMaterializerRef,
  } = useSearchRuntimeComposition({
    setMapCenter,
    setMapZoom,
  });
  const commitCameraViewport = React.useCallback(
    (
      payload: { center: [number, number]; zoom: number },
      options?: { allowDuringGesture?: boolean }
    ) =>
      cameraIntentArbiter.commit({
        center: payload.center,
        zoom: payload.zoom,
        allowDuringGesture: options?.allowDuringGesture,
      }),
    [cameraIntentArbiter]
  );
  const [mapCameraPadding, setMapCameraPadding] = React.useState<MapCameraPadding | null>(null);
  const [isInitialCameraHydrated, setIsInitialCameraHydrated] = React.useState(false);
  const [isInitialCameraReady, setIsInitialCameraReady] = React.useState(false);
  const [isMapStyleReady, setIsMapStyleReady] = React.useState(false);
  const [isFollowingUser, setIsFollowingUser] = React.useState(false);
  const suppressMapMovedRef = React.useRef(false);
  const suppressMapMovedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRestaurantSelectionRef = React.useRef<{
    restaurantId: string;
  } | null>(null);
  const restaurantOnlySearchRef = React.useRef<string | null>(null);
  const searchSessionQueryRef = React.useRef('');
  const profileDismissBehaviorRef = React.useRef<'restore' | 'clear'>('restore');
  const shouldClearSearchOnProfileDismissRef = React.useRef(false);
  const isClearingSearchRef = React.useRef(false);
  const closeRestaurantProfileRef = React.useRef<(() => void) | null>(null);
  const clearSearchStateRef = React.useRef<
    | ((options?: {
        shouldRefocusInput?: boolean;
        skipSheetAnimation?: boolean;
        deferSuggestionClear?: boolean;
      }) => void)
    | null
  >(null);
  const openRestaurantProfilePreviewRef = React.useRef<
    | ((
        restaurantId: string,
        restaurantName: string,
        pressedCoordinate?: Coordinate | null
      ) => void)
    | null
  >(null);
  const profileHydrateRestaurantByIdRef = React.useRef<(restaurantId: string) => void>(
    () => undefined
  );
  const mapLoadingOpacity = useSharedValue(1);

  React.useLayoutEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);

  React.useEffect(() => {
    logger.info('Mapbox config', {
      hasToken: accessToken.length > 0,
      hasStyleUrl: true,
    });
  }, [accessToken]);

  const suppressMapMoved = React.useCallback((duration = 800) => {
    suppressMapMovedRef.current = true;
    if (suppressMapMovedTimeoutRef.current) {
      clearTimeout(suppressMapMovedTimeoutRef.current);
    }
    suppressMapMovedTimeoutRef.current = setTimeout(() => {
      suppressMapMovedRef.current = false;
    }, duration);
  }, []);

  React.useEffect(() => {
    if (!isInitialCameraReady) {
      setIsMapStyleReady(false);
    }
  }, [isInitialCameraReady]);

  React.useEffect(() => {
    if (!isInitialCameraReady || !isMapStyleReady) {
      mapLoadingOpacity.value = 1;
      return;
    }
    mapLoadingOpacity.value = withTiming(0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [isInitialCameraReady, isMapStyleReady, mapLoadingOpacity]);

  const mapLoadingAnimatedStyle = useAnimatedStyle(() => ({
    opacity: mapLoadingOpacity.value,
  }));

  const handleMapLoaded = React.useCallback(() => {
    setIsMapStyleReady(true);
    if (hasPrimedInitialBoundsRef.current) {
      return;
    }
    hasPrimedInitialBoundsRef.current = true;
    void (async () => {
      if (latestBoundsRef.current) {
        return;
      }
      if (!mapRef.current?.getVisibleBounds) {
        return;
      }
      try {
        const visibleBounds = await mapRef.current.getVisibleBounds();
        if (
          Array.isArray(visibleBounds) &&
          visibleBounds.length >= 2 &&
          isLngLatTuple(visibleBounds[0]) &&
          isLngLatTuple(visibleBounds[1])
        ) {
          viewportBoundsService.setBounds(boundsFromPairs(visibleBounds[0], visibleBounds[1]));
        }
      } catch {
        // ignore
      }
    })();
  }, [viewportBoundsService]);

  React.useEffect(() => {
    return () => {
      if (suppressMapMovedTimeoutRef.current) {
        clearTimeout(suppressMapMovedTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (pollBoundsTimeoutRef.current) {
        clearTimeout(pollBoundsTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (cameraPersistTimeoutRef.current) {
        clearTimeout(cameraPersistTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (profileTransitionTimeoutRef.current) {
        clearTimeout(profileTransitionTimeoutRef.current);
      }
      if (fitBoundsSyncTimeoutRef.current) {
        clearTimeout(fitBoundsSyncTimeoutRef.current);
      }
      if (cameraStateSyncTimeoutRef.current) {
        clearTimeout(cameraStateSyncTimeoutRef.current);
      }
      if (cameraCommandFrameRef.current != null) {
        cancelAnimationFrame(cameraCommandFrameRef.current);
        cameraCommandFrameRef.current = null;
      }
    };
  }, []);

  // Hydrate last camera or cached location before mounting the map to avoid the globe spin.
  React.useEffect(() => {
    let isActive = true;
    void (async () => {
      try {
        const [storedCamera, storedLocation] = await Promise.all([
          AsyncStorage.getItem(CAMERA_STORAGE_KEY),
          AsyncStorage.getItem(LOCATION_STORAGE_KEY),
        ]);
        if (!isActive) {
          return;
        }

        let hydrated = false;
        const shouldDeferInitialCamera = () =>
          profileTransitionRef.current.status !== 'idle' || Boolean(lastCameraStateRef.current);
        const hasActiveCamera = Boolean(lastCameraStateRef.current);
        const cacheDeferredCamera = (center: [number, number], zoom: number) => {
          const transition = profileTransitionRef.current;
          if (!transition.savedCamera) {
            transition.savedCamera = {
              center: [center[0], center[1]],
              zoom,
              padding: null,
            };
          }
        };
        const applyInitialCamera = (center: [number, number], zoom: number) => {
          commitCameraViewport({ center, zoom }, { allowDuringGesture: true });
          lastCameraStateRef.current = { center, zoom };
          lastPersistedCameraRef.current = JSON.stringify({ center, zoom });
          setIsFollowingUser(false);
          hasCenteredOnLocationRef.current = true;
          hydrated = true;
        };
        if (hasActiveCamera) {
          hydrated = true;
        }

        if (!hydrated && storedCamera) {
          const parsedCamera = JSON.parse(storedCamera);
          if (
            parsedCamera &&
            Array.isArray(parsedCamera.center) &&
            parsedCamera.center.length === 2 &&
            typeof parsedCamera.center[0] === 'number' &&
            typeof parsedCamera.center[1] === 'number' &&
            typeof parsedCamera.zoom === 'number'
          ) {
            const center: [number, number] = [parsedCamera.center[0], parsedCamera.center[1]];
            if (shouldDeferInitialCamera()) {
              cacheDeferredCamera(center, parsedCamera.zoom);
              hydrated = true;
            } else {
              applyInitialCamera(center, parsedCamera.zoom);
            }
          }
        }

        if (!hydrated && storedLocation) {
          const parsedLocation = JSON.parse(storedLocation);
          if (
            parsedLocation &&
            typeof parsedLocation.lat === 'number' &&
            Number.isFinite(parsedLocation.lat) &&
            typeof parsedLocation.lng === 'number' &&
            Number.isFinite(parsedLocation.lng) &&
            (!parsedLocation.updatedAt ||
              (typeof parsedLocation.updatedAt === 'number' &&
                Number.isFinite(parsedLocation.updatedAt) &&
                Date.now() - parsedLocation.updatedAt <= 6 * 60 * 60 * 1000))
          ) {
            const center: [number, number] = [parsedLocation.lng, parsedLocation.lat];
            userLocationIsCachedRef.current = true;
            setUserLocation({ lat: parsedLocation.lat, lng: parsedLocation.lng });
            if (shouldDeferInitialCamera()) {
              cacheDeferredCamera(center, SINGLE_LOCATION_ZOOM_LEVEL);
              hydrated = true;
            } else {
              applyInitialCamera(center, SINGLE_LOCATION_ZOOM_LEVEL);
            }
          }
        }

        if (hydrated && isActive) {
          setIsInitialCameraReady(true);
        }
      } catch {
        // ignore
      } finally {
        if (isActive) {
          setIsInitialCameraHydrated(true);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, [commitCameraViewport]);

  React.useEffect(() => {
    if (isInitialCameraReady || !isInitialCameraHydrated) {
      return;
    }
    if (!locationPermissionDenied) {
      return;
    }
    if (mapCenter && mapZoom !== null) {
      setIsInitialCameraReady(true);
      return;
    }
    const fallbackCenter = USA_FALLBACK_CENTER;
    const fallbackZoom = USA_FALLBACK_ZOOM;
    commitCameraViewport(
      {
        center: fallbackCenter,
        zoom: fallbackZoom,
      },
      { allowDuringGesture: true }
    );
    lastCameraStateRef.current = { center: fallbackCenter, zoom: fallbackZoom };
    setIsFollowingUser(false);
    setIsInitialCameraReady(true);
  }, [
    commitCameraViewport,
    isInitialCameraHydrated,
    isInitialCameraReady,
    locationPermissionDenied,
    mapCenter,
    mapZoom,
    setIsFollowingUser,
  ]);

  React.useEffect(() => {
    if (!isInitialCameraHydrated || isInitialCameraReady) {
      return;
    }
    if (mapCenter || mapZoom !== null) {
      return;
    }
    if (locationPermissionDenied) {
      return;
    }

    const timeout = setTimeout(() => {
      if (mapCenter || mapZoom !== null) {
        return;
      }
      const fallbackCenter = USA_FALLBACK_CENTER;
      const fallbackZoom = USA_FALLBACK_ZOOM;
      commitCameraViewport(
        {
          center: fallbackCenter,
          zoom: fallbackZoom,
        },
        { allowDuringGesture: true }
      );
      lastCameraStateRef.current = { center: fallbackCenter, zoom: fallbackZoom };
      setIsFollowingUser(false);
      setIsInitialCameraReady(true);
    }, 600);

    return () => clearTimeout(timeout);
  }, [
    commitCameraViewport,
    isInitialCameraHydrated,
    isInitialCameraReady,
    locationPermissionDenied,
    mapCenter,
    mapZoom,
    setIsFollowingUser,
  ]);

  const stopLocationPulse = React.useCallback(() => {
    locationPulseAnimationRef.current?.stop();
    locationPulseAnimationRef.current = null;
    locationPulse.setValue(0);
  }, [locationPulse]);

  const startLocationPulse = React.useCallback(() => {
    locationPulseAnimationRef.current?.stop();
    locationPulse.setValue(0);
    locationPulseAnimationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(locationPulse, {
          toValue: 1,
          duration: 1500,
          easing: RNEasing.out(RNEasing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(locationPulse, {
          toValue: 0,
          duration: 1000,
          easing: RNEasing.in(RNEasing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    locationPulseAnimationRef.current.start();
  }, [locationPulse]);

  React.useEffect(() => {
    startLocationPulse();
    return () => {
      stopLocationPulse();
    };
  }, [startLocationPulse, stopLocationPulse]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        startLocationPulse();
        return;
      }
      stopLocationPulse();
    });
    return () => {
      subscription.remove();
    };
  }, [startLocationPulse, stopLocationPulse]);

  React.useEffect(() => {
    if (!isInitialCameraHydrated) {
      return;
    }
    if (!userLocation || hasCenteredOnLocationRef.current) {
      return;
    }
    const center: [number, number] = [userLocation.lng, userLocation.lat];
    const zoom = SINGLE_LOCATION_ZOOM_LEVEL;
    const payload = JSON.stringify({ center, zoom });
    commitCameraViewport({ center, zoom }, { allowDuringGesture: true });
    lastCameraStateRef.current = { center, zoom };
    lastPersistedCameraRef.current = payload;
    hasCenteredOnLocationRef.current = true;
    setIsFollowingUser(false);
    if (cameraRef.current?.setCamera) {
      cameraRef.current.setCamera({
        centerCoordinate: center,
        zoomLevel: zoom,
        animationDuration: 0,
        animationMode: 'none',
        pitch: 0,
        heading: 0,
      });
    }
    setIsInitialCameraReady(true);
    void AsyncStorage.setItem(CAMERA_STORAGE_KEY, payload).catch(() => undefined);
  }, [commitCameraViewport, isInitialCameraHydrated, userLocation]);

  const mapStyleURL = useMemo(() => buildMapStyleURL(accessToken), [accessToken]);

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = React.useState('');
  const [isSearchSessionActive, setIsSearchSessionActive] = React.useState(false);
  const [restaurantOnlyId, setRestaurantOnlyId] = React.useState<string | null>(null);
  const [searchMode, setSearchMode] = React.useState<'natural' | 'shortcut' | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [visualReadyRequestKey, setVisualReadyRequestKey] = React.useState<string | null>(null);
  const visualReadyWriteSourceRef = React.useRef<
    'map_visual_ready' | 'fallback_timeout' | 'marker_reveal_settled_raf' | 'unknown'
  >('unknown');
  const visualReadyFallbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFilterTogglePending, setIsFilterTogglePending] = React.useState(false);
  const [, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [, setShowSuggestions] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressed] = React.useState(false);
  const resultsRequestKey =
    results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? null;
  const resultsPage = resolveResultsPage(results);
  const [resultsVisualSyncCandidate, setResultsVisualSyncCandidate] = React.useState<string | null>(
    null
  );
  const visualSyncCandidateWriteSourceRef = React.useRef<'page_one_results_commit' | 'unknown'>(
    'unknown'
  );
  const [markerRevealCommitId, setMarkerRevealCommitId] = React.useState<number | null>(null);
  const markerRevealCommitSeqRef = React.useRef(0);
  const [runOneHandoffSnapshot, setRunOneHandoffSnapshot] = React.useState(() =>
    runOneHandoffCoordinatorRef.current.getSnapshot()
  );
  const runOneCommitSpanPressureByOperationRef = React.useRef<Map<string, number>>(new Map());
  const runOneStallPressureByOperationRef = React.useRef<Map<string, number>>(new Map());
  React.useEffect(() => {
    return runOneHandoffCoordinatorRef.current.subscribe((snapshot) => {
      const commitSnapshot = () => {
        setRunOneHandoffSnapshot((previous) => {
          const previousMetadata = previous.metadata as Record<string, unknown>;
          const nextMetadata = snapshot.metadata as Record<string, unknown>;
          const previousCommitSpanPressure = previousMetadata?.commitSpanPressure === true;
          const nextCommitSpanPressure = nextMetadata?.commitSpanPressure === true;
          if (
            previous.operationId === snapshot.operationId &&
            previous.phase === snapshot.phase &&
            previous.seq === snapshot.seq &&
            previous.page === snapshot.page &&
            previous.markerRevealSettledAtMs === snapshot.markerRevealSettledAtMs &&
            previousCommitSpanPressure === nextCommitSpanPressure
          ) {
            return previous;
          }
          return snapshot;
        });
      };
      if (typeof React.startTransition === 'function') {
        React.startTransition(() => {
          commitSnapshot();
        });
        return;
      }
      commitSnapshot();
    });
  }, [runOneHandoffCoordinatorRef]);
  React.useEffect(() => {
    const maxCommitSpanByOperation = runOneCommitSpanPressureByOperationRef.current;
    const maxStallFrameByOperation = runOneStallPressureByOperationRef.current;
    const activeOperationId = runOneHandoffSnapshot.operationId;
    if (!activeOperationId) {
      maxCommitSpanByOperation.clear();
      maxStallFrameByOperation.clear();
      return;
    }
    Array.from(maxCommitSpanByOperation.keys()).forEach((operationId) => {
      if (operationId !== activeOperationId) {
        maxCommitSpanByOperation.delete(operationId);
      }
    });
    Array.from(maxStallFrameByOperation.keys()).forEach((operationId) => {
      if (operationId !== activeOperationId) {
        maxStallFrameByOperation.delete(operationId);
      }
    });
  }, [runOneHandoffSnapshot.operationId]);
  const runOneHandoffLiveSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
  const runOneHandoffSnapshotForRender =
    runOneHandoffLiveSnapshot.updatedAtMs > runOneHandoffSnapshot.updatedAtMs
      ? runOneHandoffLiveSnapshot
      : runOneHandoffSnapshot;
  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      return;
    }
    const operationId = runOneHandoffSnapshotForRender.operationId;
    if (!operationId) {
      return;
    }
    const initialPhase = runOneHandoffSnapshotForRender.phase;
    if (initialPhase !== 'h2_marker_reveal' && initialPhase !== 'h3_hydration_ramp') {
      return;
    }

    let rafHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let previousFrameAtMs = getPerfNow();

    const cancelScheduledTick = () => {
      if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    };

    const scheduleNextTick = () => {
      if (typeof requestAnimationFrame === 'function') {
        rafHandle = requestAnimationFrame(() => {
          rafHandle = null;
          tick();
        });
        return;
      }
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        tick();
      }, 16);
    };

    const tick = () => {
      const nowMs = getPerfNow();
      const frameDeltaMs = Math.max(0, nowMs - previousFrameAtMs);
      previousFrameAtMs = nowMs;

      const handoffSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
      if (handoffSnapshot.operationId !== operationId) {
        return;
      }
      const handoffPhase = handoffSnapshot.phase;
      if (handoffPhase !== 'h2_marker_reveal' && handoffPhase !== 'h3_hydration_ramp') {
        return;
      }

      if (frameDeltaMs >= RUN_ONE_STALL_PRESSURE_THRESHOLD_MS) {
        const previousMaxStallMs = runOneStallPressureByOperationRef.current.get(operationId) ?? 0;
        const nextMaxStallMs = Math.max(previousMaxStallMs, frameDeltaMs);
        if (nextMaxStallMs > previousMaxStallMs) {
          runOneStallPressureByOperationRef.current.set(operationId, nextMaxStallMs);
        }
        if (previousMaxStallMs <= 0) {
          runOneHandoffCoordinatorRef.current.advancePhase(handoffPhase, {
            operationId,
            stallPressure: true,
            // Reuse existing run-1 load-shedding consumers (hydration stepRows + H4 extra frame).
            commitSpanPressure: true,
            maxRun1StallFrameMs: Number(nextMaxStallMs.toFixed(1)),
            stallPressureDetectedAtMs: Number(nowMs.toFixed(1)),
            stallPressureSource: 'raf_frame_delta',
          });
        }
      }

      scheduleNextTick();
    };

    scheduleNextTick();
    return () => {
      cancelScheduledTick();
    };
  }, [
    getPerfNow,
    runOneHandoffCoordinatorRef,
    runOneHandoffSnapshotForRender.operationId,
    runOneHandoffSnapshotForRender.phase,
    searchMode,
  ]);
  const runOneHandoffPhase: RunOneHandoffPhase = runOneHandoffSnapshotForRender.phase;
  const isRun1HandoffOperationInFlight = runOneHandoffSnapshotForRender.operationId != null;
  const isRun1HandoffActive = runOneHandoffPhase !== 'idle';
  const isRunOnePreflightFreezeActive =
    isRun1HandoffOperationInFlight && runOneHandoffPhase === 'idle';
  const isChromeDeferred = isRunOneHandoffDeferredChromePhase(runOneHandoffPhase);
  const isRunOneChromeFreezeActive =
    isRun1HandoffActive && runOneHandoffPhase !== 'h4_chrome_resume';
  const allowRunOneHydrationFinalizeCommit =
    !isRun1HandoffOperationInFlight || runOneHandoffPhase === 'h4_chrome_resume';
  const runOneSelectionFeedbackOperationId =
    isRun1HandoffActive && runOneHandoffSnapshotForRender.operationId
      ? runOneHandoffSnapshotForRender.operationId
      : null;
  const hydrationOperationId = runOneHandoffSnapshotForRender.operationId ?? resultsRequestKey;
  const isVisualSyncPending =
    resultsVisualSyncCandidate != null && resultsVisualSyncCandidate !== visualReadyRequestKey;
  const isSearchLoading = isLoading || isVisualSyncPending;
  const markVisualRequestReady = React.useCallback(
    (
      requestKey: string | null,
      source:
        | 'map_visual_ready'
        | 'fallback_timeout'
        | 'marker_reveal_settled_raf'
        | 'unknown' = 'unknown'
    ) => {
      visualReadyWriteSourceRef.current = source;
      if (!requestKey) {
        return;
      }
      setVisualReadyRequestKey((prev) => (prev === requestKey ? prev : requestKey));
    },
    []
  );
  const handlePageOneResultsCommitted = React.useCallback(() => {
    markerRevealCommitSeqRef.current += 1;
    const commitId = markerRevealCommitSeqRef.current;
    setMarkerRevealCommitId(commitId);
    visualSyncCandidateWriteSourceRef.current = 'page_one_results_commit';
    setResultsVisualSyncCandidate(`visual-commit:${commitId}`);
  }, []);
  React.useEffect(
    () => () => {
      if (visualReadyFallbackTimeoutRef.current) {
        clearTimeout(visualReadyFallbackTimeoutRef.current);
        visualReadyFallbackTimeoutRef.current = null;
      }
    },
    []
  );
  const searchInteractionRef = React.useRef({
    isInteracting: false,
    isResultsSheetDragging: false,
    isResultsListScrolling: false,
    isResultsSheetSettling: false,
  });
  const activeTab = useSearchStore((state) => state.activeTab);
  const preferredActiveTab = useSearchStore((state) => state.preferredActiveTab);
  const setActiveTab = useSearchStore((state) => state.setActiveTab);
  const hasActiveTabPreference = useSearchStore((state) => state.hasActiveTabPreference);
  const setPreferredActiveTab = useSearchStore((state) => state.setPreferredActiveTab);
  const {
    searchLayout,
    searchContainerFrame,
    searchBarFrame,
    searchShortcutsFrame,
    searchShortcutChipFrames,
    searchShortcutsFadeResetKey,
    setSearchShortcutsFadeResetKey,
    searchContainerLayoutCacheRef,
    searchShortcutsLayoutCacheRef,
    handleSearchHeaderLayout,
    handleSearchContainerLayout,
    handleSearchShortcutsRowLayout,
    handleRestaurantsShortcutLayout,
    handleDishesShortcutLayout,
  } = useSearchLayoutController({
    searchInteractionRef,
    searchContainerPaddingTop: SEARCH_CONTAINER_PADDING_TOP,
  });
  const [suggestionContentHeight, setSuggestionContentHeight] = React.useState(0);
  const suggestionContentHeightRef = React.useRef(0);
  const suggestionSpacingInitializedRef = React.useRef(false);
  const suggestionHeaderContentBottomRef = React.useRef(0);
  const suggestionHeaderHolesRef = React.useRef<MaskedHole[]>([]);
  const suggestionHeaderSearchHoleRef = React.useRef<MaskedHole | null>(null);
  const suggestionHeaderShortcutHolesRef = React.useRef<{
    restaurants: MaskedHole | null;
    dishes: MaskedHole | null;
  }>({
    restaurants: null,
    dishes: null,
  });
  const [isPriceSelectorVisible, setIsPriceSelectorVisible] = React.useState(false);
  const [isRankSelectorVisible, setIsRankSelectorVisible] = React.useState(false);
  const [isPriceSheetContentReady, setIsPriceSheetContentReady] = React.useState(false);
  const rankSheetRef = React.useRef<OverlayModalSheetHandle | null>(null);
  const priceSheetRef = React.useRef<OverlayModalSheetHandle | null>(null);
  const {
    recentSearches,
    isRecentLoading,
    recentlyViewedRestaurants,
    isRecentlyViewedLoading,
    recentlyViewedFoods,
    isRecentlyViewedFoodsLoading,
    loadRecentHistory,
    updateLocalRecentSearches,
    trackRecentlyViewedRestaurant,
  } = useSearchHistory({ isSignedIn: !!isSignedIn });
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [isSuggestionPanelActive, setIsSuggestionPanelActive] = React.useState(false);
  const [searchTransitionVariant, setSearchTransitionVariant] = React.useState<
    'default' | 'submitting'
  >('default');
  const [pollsSheetSnap, setPollsSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [pollsDockedSnapRequest, setPollsDockedSnapRequest] =
    React.useState<DockedPollsSnapRequest | null>(null);
  const pollsDockedSnapTokenRef = React.useRef(0);
  const [pollCreationSnapRequest, setPollCreationSnapRequest] = React.useState<Exclude<
    OverlaySheetSnap,
    'hidden'
  > | null>(null);
  const [pollsHeaderActionAnimationToken, setPollsHeaderActionAnimationToken] = React.useState(0);
  const [tabOverlaySnapRequest, setTabOverlaySnapRequest] = React.useState<Exclude<
    OverlaySheetSnap,
    'hidden'
  > | null>(null);
  const [isDockedPollsDismissed, setIsDockedPollsDismissed] = React.useState(false);
  const [isNavRestorePending, setIsNavRestorePending] = React.useState(false);
  const [bookmarksSheetSnap, setBookmarksSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [profileSheetSnap, setProfileSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const overlaySwitchInFlightRef = React.useRef(false);
  const ignoreDockedPollsHiddenUntilMsRef = React.useRef(0);
  const dockedPollsRestoreInFlightRef = React.useRef(false);

  const requestDockedPollsRestore = React.useCallback(
    (snap?: Exclude<OverlaySheetSnap, 'hidden'>) => {
      const resolvedSnap: Exclude<OverlaySheetSnap, 'hidden'> =
        snap ??
        (pollsSheetSnap !== 'hidden'
          ? pollsSheetSnap
          : hasUserSharedSnap
          ? sharedSnap
          : 'collapsed');
      ignoreDockedPollsHiddenUntilMsRef.current = Date.now() + 650;
      dockedPollsRestoreInFlightRef.current = true;
      setIsDockedPollsDismissed(false);
      setPollsDockedSnapRequest((previous) => {
        // Keep explicit non-collapsed restore requests from being overwritten by
        // a generic docked-polls "show again" request.
        if (resolvedSnap === 'collapsed' && previous && previous.snap !== 'collapsed') {
          return previous;
        }
        pollsDockedSnapTokenRef.current += 1;
        return {
          snap: resolvedSnap,
          token: pollsDockedSnapTokenRef.current,
        };
      });
    },
    [
      hasUserSharedSnap,
      pollsSheetSnap,
      setIsDockedPollsDismissed,
      setPollsDockedSnapRequest,
      sharedSnap,
    ]
  );
  const [saveSheetSnap, setSaveSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const {
    saveSheetState,
    setSaveSheetState,
    getDishSaveHandler,
    getRestaurantSaveHandler,
    handleRestaurantSavePress,
    handleCloseSaveSheet,
    showSaveListOverlay,
  } = useSaveSheetState();

  const [restaurantProfile, setRestaurantProfile] = React.useState<RestaurantOverlayData | null>(
    null
  );
  const [isRestaurantOverlayVisible, setRestaurantOverlayVisible] = React.useState(false);
  const isRestaurantOverlayVisibleRef = React.useRef(false);
  const restaurantProfileRequestSeqRef = React.useRef(0);
  const restaurantProfileCacheRef = React.useRef<Map<string, HydratedRestaurantProfile>>(new Map());
  const restaurantProfileRequestByIdRef = React.useRef<
    Map<string, Promise<HydratedRestaurantProfile>>
  >(new Map());
  const restaurantOverlayDismissHandledRef = React.useRef(false);
  const forceRestaurantProfileMiddleSnapRef = React.useRef(false);
  const restaurantSnapRequestTokenRef = React.useRef(0);
  const [restaurantSnapRequest, setRestaurantSnapRequest] = React.useState<{
    snap: Exclude<OverlaySheetSnap, 'hidden'>;
    token: number;
  } | null>(null);
  const [profileTransitionStatus, setProfileTransitionStatusState] =
    React.useState<ProfileTransitionStatus>('idle');
  const lastVisibleSheetStateRef = React.useRef<Exclude<OverlaySheetSnap, 'hidden'>>('middle');
  const previousSaveSheetStateRef = React.useRef<{
    visible: boolean;
    listType: FavoriteListType;
    target: { restaurantId?: string; connectionId?: string } | null;
  } | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [hasMoreFood, setHasMoreFood] = React.useState(false);
  const [hasMoreRestaurants, setHasMoreRestaurants] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [isPaginationExhausted, setIsPaginationExhausted] = React.useState(false);
  React.useEffect(() => {
    searchRuntimeBus.publish({
      results,
      resultsRequestKey,
      query,
      submittedQuery,
      activeTab,
      searchMode,
      isSearchLoading,
      isLoadingMore,
      isSearchSessionActive,
      currentPage,
    });
  }, [
    currentPage,
    isLoadingMore,
    isSearchLoading,
    isSearchSessionActive,
    query,
    results,
    resultsRequestKey,
    activeTab,
    searchMode,
    searchRuntimeBus,
    submittedQuery,
  ]);
  const {
    userLocation,
    setUserLocation,
    userLocationRef,
    userLocationIsCachedRef,
    locationPermissionDenied,
    ensureUserLocation,
  } = useUserLocationController({
    locationStorageKey: LOCATION_STORAGE_KEY,
  });
  const [pollBounds, setPollBounds] = React.useState<MapBounds | null>(null);
  isRestaurantOverlayVisibleRef.current = isRestaurantOverlayVisible;
  const [mapMovedSinceSearch, setMapMovedSinceSearch] = React.useState(false);
  const resultsSheetDraggingRef = React.useRef(false);
  const resultsListScrollingRef = React.useRef(false);
  const resultsSheetSettlingRef = React.useRef(false);
  const pendingResultsSheetSnapRef = React.useRef<OverlaySheetSnap | null>(null);
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);
  const mapMovedSinceSearchRef = React.useRef(false);
  const pendingMapMovedRevealRef = React.useRef(false);
  const mapGestureActiveRef = React.useRef(false);
  const mapIdleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollBoundsRef = React.useRef<MapBounds | null>(null);
  const pollBoundsTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const anySheetDraggingRef = React.useRef(false);
  const updateSearchInteractionRef = React.useCallback(
    (next: Partial<typeof searchInteractionRef.current>) => {
      const current = searchInteractionRef.current;
      const merged = { ...current, ...next };
      merged.isInteracting =
        merged.isResultsSheetDragging ||
        merged.isResultsListScrolling ||
        merged.isResultsSheetSettling;
      searchInteractionRef.current = merged;
    },
    []
  );

  const cancelMapUpdateTimeouts = React.useCallback(() => {
    if (pollBoundsTimeoutRef.current) {
      clearTimeout(pollBoundsTimeoutRef.current);
      pollBoundsTimeoutRef.current = null;
    }
    if (cameraPersistTimeoutRef.current) {
      clearTimeout(cameraPersistTimeoutRef.current);
      cameraPersistTimeoutRef.current = null;
    }
  }, []);
  const setResultsSheetDragging = React.useCallback(
    (isDragging: boolean) => {
      if (!isDragging && resultsSheetSettlingRef.current) {
        return;
      }
      if (resultsSheetDraggingRef.current === isDragging) {
        return;
      }
      resultsSheetDraggingRef.current = isDragging;
      updateSearchInteractionRef({ isResultsSheetDragging: isDragging });
      anySheetDraggingRef.current = isDragging;
      if (isDragging) {
        cancelMapUpdateTimeouts();
      }
      if (!isDragging) {
        if (
          pendingMapMovedRevealRef.current &&
          !searchInteractionRef.current.isInteracting &&
          !anySheetDraggingRef.current &&
          mapMovedSinceSearchRef.current
        ) {
          pendingMapMovedRevealRef.current = false;
          setMapMovedSinceSearch(true);
        }
      }
    },
    [cancelMapUpdateTimeouts, updateSearchInteractionRef]
  );
  const setResultsListScrolling = React.useCallback(
    (isScrolling: boolean) => {
      if (resultsListScrollingRef.current === isScrolling) {
        return;
      }
      resultsListScrollingRef.current = isScrolling;
      updateSearchInteractionRef({ isResultsListScrolling: isScrolling });
      if (!isScrolling) {
        if (
          pendingMapMovedRevealRef.current &&
          !searchInteractionRef.current.isInteracting &&
          !anySheetDraggingRef.current &&
          mapMovedSinceSearchRef.current
        ) {
          pendingMapMovedRevealRef.current = false;
          setMapMovedSinceSearch(true);
        }
      }
    },
    [updateSearchInteractionRef]
  );
  const setResultsSheetSettlingState = React.useCallback(
    (isSettling: boolean) => {
      if (resultsSheetSettlingRef.current === isSettling) {
        return;
      }
      resultsSheetSettlingRef.current = isSettling;
      updateSearchInteractionRef({ isResultsSheetSettling: isSettling });
      if (isSettling) {
        cancelMapUpdateTimeouts();
      }
      if (!isSettling && resultsSheetDraggingRef.current) {
        setResultsSheetDragging(false);
      }
      if (!isSettling) {
        if (
          pendingMapMovedRevealRef.current &&
          !searchInteractionRef.current.isInteracting &&
          !anySheetDraggingRef.current &&
          mapMovedSinceSearchRef.current
        ) {
          pendingMapMovedRevealRef.current = false;
          setMapMovedSinceSearch(true);
        }
      }
    },
    [cancelMapUpdateTimeouts, setResultsSheetDragging, updateSearchInteractionRef]
  );
  const resetResultsSheetInteraction = React.useCallback(() => {
    if (resultsScrollingTimeoutRef.current) {
      clearTimeout(resultsScrollingTimeoutRef.current);
      resultsScrollingTimeoutRef.current = null;
    }
    resultsSheetDraggingRef.current = false;
    resultsSheetSettlingRef.current = false;
    resultsListScrollingRef.current = false;
    updateSearchInteractionRef({
      isResultsSheetDragging: false,
      isResultsListScrolling: false,
      isResultsSheetSettling: false,
    });
    anySheetDraggingRef.current = false;
    cancelMapUpdateTimeouts();
    if (pendingMapMovedRevealRef.current && mapMovedSinceSearchRef.current) {
      pendingMapMovedRevealRef.current = false;
      setMapMovedSinceSearch(true);
    }
  }, [cancelMapUpdateTimeouts, updateSearchInteractionRef]);

  // Stable context value so list items don't re-render on drag state changes
  const searchInteractionContextValue = React.useMemo(
    () => ({ interactionRef: searchInteractionRef }),
    [searchInteractionRef]
  );

  const resetMapMoveFlag = React.useCallback(() => {
    if (mapIdleTimeoutRef.current) {
      clearTimeout(mapIdleTimeoutRef.current);
      mapIdleTimeoutRef.current = null;
    }
    pendingMapMovedRevealRef.current = false;
    const captureSeq = ++lastSearchBoundsCaptureSeqRef.current;
    const boundsSnapshot = viewportBoundsService.getBounds();
    if (boundsSnapshot) {
      viewportBoundsService.captureSearchBaseline(boundsSnapshot);
    } else {
      const boundsCandidate = mapRef.current?.getVisibleBounds?.();
      if (boundsCandidate) {
        void boundsCandidate.then((visibleBounds) => {
          if (lastSearchBoundsCaptureSeqRef.current !== captureSeq) {
            return;
          }
          if (
            !visibleBounds ||
            visibleBounds.length < 2 ||
            !isLngLatTuple(visibleBounds[0]) ||
            !isLngLatTuple(visibleBounds[1])
          ) {
            return;
          }
          const bounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
          viewportBoundsService.setBounds(bounds);
          viewportBoundsService.captureSearchBaseline(bounds);
        });
      }
    }
    mapMovedSinceSearchRef.current = false;
    setMapMovedSinceSearch(false);
  }, [viewportBoundsService]);
  const markMapMovedIfNeeded = React.useCallback(
    (bounds: MapBounds) => {
      if (mapMovedSinceSearchRef.current) {
        return true;
      }
      const baseline = viewportBoundsService.getSearchBaselineBounds();
      if (!baseline) {
        return false;
      }
      if (!hasBoundsMovedSignificantly(baseline, bounds)) {
        return false;
      }
      mapMovedSinceSearchRef.current = true;
      return true;
    },
    [viewportBoundsService]
  );
  const scheduleMapIdleReveal = React.useCallback(() => {
    if (mapIdleTimeoutRef.current) {
      clearTimeout(mapIdleTimeoutRef.current);
    }
    mapIdleTimeoutRef.current = setTimeout(() => {
      mapIdleTimeoutRef.current = null;
      if (searchInteractionRef.current.isInteracting || anySheetDraggingRef.current) {
        pendingMapMovedRevealRef.current = true;
        return;
      }
      if (mapMovedSinceSearchRef.current) {
        pendingMapMovedRevealRef.current = false;
        setMapMovedSinceSearch(true);
      }
    }, 450);
  }, []);

  const schedulePollBoundsUpdate = React.useCallback((bounds: MapBounds) => {
    if (pollBoundsRef.current && !hasBoundsMovedSignificantly(pollBoundsRef.current, bounds)) {
      return;
    }
    if (pollBoundsTimeoutRef.current) {
      clearTimeout(pollBoundsTimeoutRef.current);
    }
    pollBoundsTimeoutRef.current = setTimeout(() => {
      if (searchInteractionRef.current.isInteracting || anySheetDraggingRef.current) {
        return;
      }
      pollBoundsRef.current = bounds;
      setPollBounds(bounds);
    }, 500);
  }, []);

  const resolveCurrentMapBounds = React.useCallback(async (): Promise<MapBounds | null> => {
    const currentBounds = viewportBoundsService.getBounds();
    if (currentBounds) {
      return currentBounds;
    }
    const rawBounds = await mapRef.current?.getVisibleBounds?.();
    if (!rawBounds || rawBounds.length < 2) {
      return null;
    }
    const first = rawBounds[0] as unknown;
    const second = rawBounds[1] as unknown;
    if (!isLngLatTuple(first) || !isLngLatTuple(second)) {
      return null;
    }
    const bounds = boundsFromPairs(first, second);
    viewportBoundsService.setBounds(bounds);
    return bounds;
  }, [viewportBoundsService]);

  const resetFocusedMapState = React.useCallback(() => {
    pendingRestaurantSelectionRef.current = null;
  }, []);
  const setRestaurantOnlyIntent = React.useCallback((restaurantId: string | null) => {
    restaurantOnlySearchRef.current = restaurantId;
    if (!restaurantId) {
      setRestaurantOnlyId(null);
    }
  }, []);
  const lastSearchRequestIdRef = React.useRef<string | null>(null);
  const suggestionHeaderHeightValue = useSharedValue(0);
  const suggestionScrollOffset = useSharedValue(0);
  const suggestionScrollTopValue = useSharedValue(0);
  const suggestionScrollMaxHeightValue = useSharedValue(0);
  const shortcutContentFadeMode = useSharedValue(SHORTCUT_CONTENT_FADE_DEFAULT);
  const overlayHeaderActionProgress = useSharedValue(0);
  const [searchHeaderActionModeOverride, setSearchHeaderActionModeOverride] =
    React.useState<OverlayHeaderActionMode | null>(null);
  const inputRef = React.useRef<TextInput | null>(null);
  const ignoreNextSearchBlurRef = React.useRef(false);
  const cancelSearchEditOnBackRef = React.useRef(false);
  const restoreHomeOnSearchBackRef = React.useRef(false);
  const resultsScrollRef = React.useRef<FlashListRef<ResultsListItem> | null>(null);
  const resultsScrollingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserScrolledResultsRef = React.useRef(false);
  const allowLoadMoreForCurrentScrollRef = React.useRef(true);
  const searchFiltersLayoutCacheRef = React.useRef<SearchFiltersLayoutCache | null>(null);
  const cameraPersistTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraStateRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  const lastPersistedCameraRef = React.useRef<string | null>(null);
  const profileTransitionRef = React.useRef<ProfileTransitionState>({
    status: 'idle',
    savedSheetSnap: null,
    savedCamera: null,
    savedResultsScrollOffset: null,
  });
  const hasRestoredProfileMapRef = React.useRef(false);
  const profileTransitionTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitBoundsSyncTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraStateSyncTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraCommandFrameRef = React.useRef<number | null>(null);
  const locationPulse = React.useRef(new Animated.Value(0)).current;
  const locationPulseAnimationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const hasCenteredOnLocationRef = React.useRef(false);
  const restaurantFocusSessionRef = React.useRef<RestaurantFocusSession>({
    restaurantId: null,
    locationKey: null,
    hasAppliedInitialMultiLocationZoomOut: false,
  });
  const activeOverlay = useOverlayStore((state) => state.activeOverlay);
  const overlayStack = useOverlayStore((state) => state.overlayStack);
  const overlayParams = useOverlayStore((state) => state.overlayParams);
  const registerTransientDismissor = useOverlayStore((state) => state.registerTransientDismissor);
  const dismissTransientOverlays = useOverlayStore((state) => state.dismissTransientOverlays);
  const hasUserSharedSnap = useOverlaySheetPositionStore((state) => state.hasUserSharedSnap);
  const sharedSnap = useOverlaySheetPositionStore((state) => state.sharedSnap);
  const rootOverlay = overlayStack[0] ?? activeOverlay;
  const isSearchOverlay = rootOverlay === 'search';
  const showBookmarksOverlay = rootOverlay === 'bookmarks';
  const showPollsOverlay = rootOverlay === 'polls';
  const showProfileOverlay = rootOverlay === 'profile';
  const restoreDockedPolls = React.useCallback(
    ({
      snap,
      clearTabSnapRequest = false,
    }: {
      snap?: Exclude<OverlaySheetSnap, 'hidden'>;
      clearTabSnapRequest?: boolean;
    } = {}) => {
      if (clearTabSnapRequest) {
        setTabOverlaySnapRequest(null);
      }
      requestDockedPollsRestore(snap);
    },
    [requestDockedPollsRestore, setTabOverlaySnapRequest]
  );
  const previousRootOverlayRef = React.useRef<OverlayKey | null>(null);
  React.useEffect(() => {
    const previous = previousRootOverlayRef.current;
    previousRootOverlayRef.current = rootOverlay;
    if (rootOverlay !== 'search') {
      return;
    }
    if (!previous || previous === 'search') {
      return;
    }
    unstable_batchedUpdates(() => {
      restoreDockedPolls({ clearTabSnapRequest: true });
    });
  }, [restoreDockedPolls, rootOverlay]);
  const pollOverlayParams = overlayParams.polls;
  const { progress: suggestionProgress, isVisible: isSuggestionPanelVisible } = useSearchTransition(
    {
      enabled: true,
      active: isSuggestionPanelActive,
      showMs: SUGGESTION_PANEL_FADE_MS,
      hideMs: SUGGESTION_PANEL_FADE_MS,
      minMs: SUGGESTION_PANEL_MIN_MS,
      maxMs: SUGGESTION_PANEL_MAX_MS,
      delayMs: SUGGESTION_PANEL_KEYBOARD_DELAY_MS,
    }
  );
  const isSuggestionOverlayVisible = isSuggestionPanelActive || isSuggestionPanelVisible;
  const searchBarTop = useMemo(() => {
    const rawTop = searchBarFrame
      ? searchLayout.top + searchBarFrame.y
      : searchLayout.top + SEARCH_CONTAINER_PADDING_TOP;
    return Math.max(rawTop, 0);
  }, [searchBarFrame, searchLayout.top]);
  const {
    isSearchOriginRestorePending,
    captureSearchSessionOrigin,
    beginSearchCloseRestore,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
  } = useSearchSessionCoordinator({
    rootOverlay,
    pollsSheetSnap,
    bookmarksSheetSnap,
    profileSheetSnap,
    isDockedPollsDismissed,
    hasUserSharedSnap,
    sharedSnap,
    requestDockedPollsRestore,
    setIsNavRestorePending,
    setTabOverlaySnapRequest,
    setIsDockedPollsDismissed,
    setOverlay: overlayRuntimeController.setRootOverlay,
  });
  const ensureSearchOverlay = React.useCallback(() => {
    overlayRuntimeController.ensureSearchOverlay(restoreDockedPolls);
  }, [overlayRuntimeController, restoreDockedPolls]);

  const bottomInset = Math.max(insets.bottom, 12);
  const shouldHideBottomNavForTabSuggestions = !isSearchOverlay && isSuggestionPanelActive;
  // Hide the bottom nav while search is active, and also while suggestion UI is presented
  // from non-search root tabs so tab chrome doesn't show through the suggestion surface.
  const shouldHideBottomNav =
    shouldHideBottomNavForTabSuggestions ||
    (isSearchOverlay &&
      (isSearchSessionActive || isSuggestionPanelActive || isSearchLoading || isNavRestorePending));
  const [bottomNavFrame, setBottomNavFrame] = React.useState<LayoutRectangle | null>(() => {
    const cached = getCachedBottomNavMetrics();
    if (!cached) {
      return null;
    }
    return { x: 0, y: cached.top, width: 0, height: cached.height };
  });
  const handleBottomNavLayout = React.useCallback((event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    setCachedBottomNavMetricsFromLayout(layout);
    setBottomNavFrame((prev) => {
      if (
        prev &&
        Math.abs(prev.x - layout.x) < 0.5 &&
        Math.abs(prev.y - layout.y) < 0.5 &&
        Math.abs(prev.width - layout.width) < 0.5 &&
        Math.abs(prev.height - layout.height) < 0.5
      ) {
        return prev;
      }
      return layout;
    });
  }, []);
  const ESTIMATED_NAV_ICON_SIZE = 24;
  const ESTIMATED_NAV_ICON_LABEL_GAP = 2;
  const estimatedNavBarHeight = PixelRatio.roundToNearestPixel(
    NAV_TOP_PADDING +
      ESTIMATED_NAV_ICON_SIZE +
      ESTIMATED_NAV_ICON_LABEL_GAP +
      LINE_HEIGHTS.body +
      bottomInset +
      NAV_BOTTOM_PADDING
  );
  const resolvedEstimatedNavBarHeight =
    Number.isFinite(estimatedNavBarHeight) && estimatedNavBarHeight > 0 ? estimatedNavBarHeight : 0;
  const fallbackNavBarHeight =
    bottomNavFrame?.height && bottomNavFrame.height > 0
      ? bottomNavFrame.height
      : resolvedEstimatedNavBarHeight;
  const bottomNavHideProgress = useSharedValue(shouldHideBottomNav ? 0 : 1);
  const bottomNavHiddenTranslateY = Math.max(24, fallbackNavBarHeight + bottomInset + 12);
  React.useEffect(() => {
    bottomNavHideProgress.value = withTiming(shouldHideBottomNav ? 0 : 1, {
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [bottomNavHideProgress, shouldHideBottomNav]);
  const bottomNavAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: (1 - bottomNavHideProgress.value) * bottomNavHiddenTranslateY }],
    }),
    [bottomNavHiddenTranslateY]
  );
  // Snap points should track the measured nav-bar top when available. This keeps collapsed
  // overlays flush to the nav edge even when root-level layout shifts (e.g. status banner push).
  const navBarTopForSnaps =
    bottomNavFrame && Number.isFinite(bottomNavFrame.y) && bottomNavFrame.y > 0
      ? bottomNavFrame.y
      : SCREEN_HEIGHT - fallbackNavBarHeight;
  const navBarTop = shouldHideBottomNav ? SCREEN_HEIGHT : navBarTopForSnaps;
  const navBarHeight = shouldHideBottomNav ? 0 : fallbackNavBarHeight;
  const navBarCutoutHeight = fallbackNavBarHeight;

  const [resultsSheetHeaderHeight, setResultsSheetHeaderHeight] = React.useState(0);
  const shouldShowDockedPolls =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    !isSearchSessionActive &&
    !isSearchLoading &&
    !isSearchOriginRestorePending &&
    !isDockedPollsDismissed;
  const {
    panelVisible,
    sheetState,
    snapPoints,
    shouldRenderSheet,
    sheetTranslateY,
    snapTo: resultsSheetSnapTo,
    resetSheetToHidden,
    animateSheetTo,
    showPanel,
    showPanelInstant,
    handleSheetSnapChange,
    resultsContainerAnimatedStyle,
    resultsScrollOffset,
    resultsMomentum,
    headerDividerAnimatedStyle,
  } = useSearchSheet({
    isSearchOverlay,
    suspendHiddenSync: shouldShowDockedPolls,
    searchBarTop,
    insetTop: insets.top,
    navBarTop: navBarTopForSnaps,
    headerHeight: OVERLAY_TAB_HEADER_HEIGHT,
  });
  const prepareShortcutSheetTransition = React.useCallback(() => {
    if (!shouldShowDockedPolls) {
      return false;
    }
    const transitionSnap: Exclude<OverlaySheetSnap, 'hidden'> =
      pollsSheetSnap !== 'hidden'
        ? pollsSheetSnap
        : isDockedPollsDismissed
        ? 'collapsed'
        : hasUserSharedSnap
        ? sharedSnap
        : 'expanded';
    showPanelInstant(transitionSnap);
    return true;
  }, [
    hasUserSharedSnap,
    isDockedPollsDismissed,
    pollsSheetSnap,
    sharedSnap,
    shouldShowDockedPolls,
    showPanelInstant,
  ]);
  React.useEffect(() => {
    if (!isNavRestorePending) {
      return;
    }
    if (!isSearchOverlay) {
      setIsNavRestorePending(false);
      return;
    }
    if (!shouldShowDockedPolls) {
      return;
    }
    if (pollsSheetSnap === 'hidden') {
      return;
    }
    setIsNavRestorePending(false);
  }, [isNavRestorePending, isSearchOverlay, pollsSheetSnap, shouldShowDockedPolls]);
  const lastNavBarTopForSnapsRef = React.useRef(navBarTopForSnaps);
  React.useEffect(() => {
    const previous = lastNavBarTopForSnapsRef.current;
    if (previous === navBarTopForSnaps) {
      return;
    }
    lastNavBarTopForSnapsRef.current = navBarTopForSnaps;
    if (sheetState !== 'collapsed') {
      return;
    }
    if (!Number.isFinite(navBarTopForSnaps)) {
      return;
    }
    if (Number.isFinite(previous) && Math.abs(navBarTopForSnaps - previous) < 1) {
      return;
    }
    if (resultsSheetDraggingRef.current || resultsSheetSettlingRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      animateSheetTo('collapsed');
    });
  }, [animateSheetTo, navBarTopForSnaps, sheetState]);
  const isSearchEditingRef = React.useRef(false);
  const pendingResultsSheetRevealRef = React.useRef(false);
  const allowSearchBlurExitRef = React.useRef(false);
  const requestResultsSheetReveal = React.useCallback(() => {
    const isEditingNow =
      Boolean(inputRef.current?.isFocused?.()) || isSearchEditingRef.current || isSearchFocused;
    if (isEditingNow) {
      pendingResultsSheetRevealRef.current = true;
      return;
    }
    showPanel();
  }, [isSearchFocused, showPanel]);
  const flushPendingResultsSheetReveal = React.useCallback(() => {
    if (!pendingResultsSheetRevealRef.current) {
      return;
    }
    pendingResultsSheetRevealRef.current = false;
    requestAnimationFrame(() => {
      requestResultsSheetReveal();
    });
  }, [requestResultsSheetReveal]);
  React.useEffect(() => {
    if (!pendingResultsSheetRevealRef.current) {
      return;
    }
    if (!isSearchSessionActive && !isSearchLoading) {
      return;
    }
    const isEditingNow =
      Boolean(inputRef.current?.isFocused?.()) || isSearchEditingRef.current || isSearchFocused;
    if (isEditingNow) {
      return;
    }
    flushPendingResultsSheetReveal();
  }, [flushPendingResultsSheetReveal, isSearchLoading, isSearchFocused, isSearchSessionActive]);
  React.useEffect(() => {
    if (sheetState !== 'hidden') {
      lastVisibleSheetStateRef.current = sheetState;
    }
  }, [sheetState]);
  React.useEffect(() => {
    if (shouldRenderSheet) {
      return;
    }
    pendingResultsSheetSnapRef.current = null;
    resetResultsSheetInteraction();
  }, [resetResultsSheetInteraction, shouldRenderSheet]);
  const shouldRenderResultsSheet = shouldRenderSheet;
  const shouldRenderResultsSheetRef = React.useRef(shouldRenderResultsSheet);
  shouldRenderResultsSheetRef.current = shouldRenderResultsSheet;
  const previousSearchSessionActiveRef = React.useRef(isSearchSessionActive);
  const didSearchSessionJustActivate =
    isSearchSessionActive && !previousSearchSessionActiveRef.current;
  const [isInitialResultsLoadPending, setIsInitialResultsLoadPending] = React.useState(false);
  React.useLayoutEffect(() => {
    previousSearchSessionActiveRef.current = isSearchSessionActive;
  }, [isSearchSessionActive]);
  React.useEffect(() => {
    if (didSearchSessionJustActivate) {
      setIsInitialResultsLoadPending(true);
      return;
    }
    if (!isSearchSessionActive) {
      setIsInitialResultsLoadPending(false);
      return;
    }
    if (isInitialResultsLoadPending && !isSearchLoading) {
      setIsInitialResultsLoadPending(false);
    }
  }, [
    didSearchSessionJustActivate,
    isInitialResultsLoadPending,
    isSearchLoading,
    isSearchSessionActive,
  ]);
  const shouldRenderRestaurantOverlay = Boolean(restaurantProfile);
  const shouldShowRestaurantOverlay = shouldRenderRestaurantOverlay && isRestaurantOverlayVisible;
  const shouldSuspendResultsSheet =
    shouldShowRestaurantOverlay &&
    (profileTransitionStatus === 'opening' || profileTransitionStatus === 'open');
  const shouldDimResultsSheet =
    (isSuggestionPanelActive || isSuggestionPanelVisible) &&
    (panelVisible || sheetState !== 'hidden');
  const shouldDisableResultsSheetInteraction =
    shouldSuspendResultsSheet ||
    (isSuggestionPanelActive && (panelVisible || sheetState !== 'hidden'));
  const resultsWashOpacity = useSharedValue(0);
  const resultsWashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: resultsWashOpacity.value,
  }));
  const resultsSheetVisibilityAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: shouldDimResultsSheet ? 1 - suggestionProgress.value : 1,
    }),
    [shouldDimResultsSheet]
  );
  const bottomNavItemVisibilityAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: isSuggestionOverlayVisible ? 1 - suggestionProgress.value : 1,
    }),
    [isSuggestionOverlayVisible]
  );
  React.useEffect(() => {
    resultsWashOpacity.value = withTiming(shouldSuspendResultsSheet ? 1 : 0, {
      duration: RESULTS_WASH_FADE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [resultsWashOpacity, shouldSuspendResultsSheet]);
  const pollsChromeSnaps = useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const hidden = SCREEN_HEIGHT + 80;
    const clampedMiddle = Math.min(middle, hidden - 120);
    return { expanded, middle: clampedMiddle };
  }, [insets.top, searchBarTop]);
  const bookmarksChromeSnaps = useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const hidden = SCREEN_HEIGHT + 80;
    const clampedMiddle = Math.min(middle, hidden - 120);
    return { expanded, middle: clampedMiddle };
  }, [insets.top, searchBarTop]);
  const profileChromeSnaps = useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const hidden = SCREEN_HEIGHT + 80;
    const clampedMiddle = Math.min(middle, hidden - 120);
    return { expanded, middle: clampedMiddle };
  }, [insets.top, searchBarTop]);
  const saveChromeSnaps = useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.5);
    return { expanded, middle };
  }, [insets.top, searchBarTop]);
  const shouldUsePollsChrome =
    showPollsOverlay ||
    (isSearchOverlay &&
      !isSuggestionPanelActive &&
      !isSearchSessionActive &&
      !isSearchLoading &&
      !shouldRenderSheet);
  const chromeTransitionConfig = useMemo(() => {
    if (showSaveListOverlay) {
      return {
        sheetY: sheetTranslateY,
        expanded: saveChromeSnaps.expanded,
        middle: saveChromeSnaps.middle,
      };
    }
    if (showProfileOverlay) {
      return {
        sheetY: sheetTranslateY,
        expanded: profileChromeSnaps.expanded,
        middle: profileChromeSnaps.middle,
      };
    }
    if (showBookmarksOverlay) {
      return {
        sheetY: sheetTranslateY,
        expanded: bookmarksChromeSnaps.expanded,
        middle: bookmarksChromeSnaps.middle,
      };
    }
    if (shouldUsePollsChrome) {
      return {
        sheetY: sheetTranslateY,
        expanded: pollsChromeSnaps.expanded,
        middle: pollsChromeSnaps.middle,
      };
    }
    return {
      sheetY: sheetTranslateY,
      expanded: snapPoints.expanded,
      middle: snapPoints.middle,
    };
  }, [
    bookmarksChromeSnaps.expanded,
    bookmarksChromeSnaps.middle,
    pollsChromeSnaps.expanded,
    pollsChromeSnaps.middle,
    profileChromeSnaps.expanded,
    profileChromeSnaps.middle,
    saveChromeSnaps.expanded,
    saveChromeSnaps.middle,
    sheetTranslateY,
    shouldUsePollsChrome,
    showBookmarksOverlay,
    showProfileOverlay,
    showSaveListOverlay,
    snapPoints.expanded,
    snapPoints.middle,
  ]);
  const {
    inputAnimatedStyle: searchBarInputAnimatedStyle,
    chromeOpacity: searchChromeOpacity,
    chromeScale: searchChromeScale,
  } = useSearchChromeTransition({
    sheetY: chromeTransitionConfig.sheetY,
    expanded: chromeTransitionConfig.expanded,
    middle: chromeTransitionConfig.middle,
  });
  const [scoreInfo, setScoreInfo] = React.useState<ScoreInfoPayload | null>(null);
  const [isScoreInfoVisible, setScoreInfoVisible] = React.useState(false);
  const [filtersHeaderHeight, setFiltersHeaderHeight] = React.useState(0);
  const {
    layout: resultsHeaderLayout,
    onLayout: onResultsHeaderLayout,
    measureNow: measureResultsHeaderNow,
  } = useDebouncedLayoutMeasurement({
    debounceMs: 50,
    deferInitial: true,
  });
  const {
    layout: filtersHeaderLayout,
    onLayout: onFiltersHeaderLayout,
    measureNow: measureFiltersHeaderNow,
  } = useDebouncedLayoutMeasurement({
    debounceMs: 50,
    deferInitial: true,
  });
  React.useEffect(() => {
    if (!resultsHeaderLayout) {
      return;
    }
    const nextHeight = resultsHeaderLayout.height;
    setResultsSheetHeaderHeight((prev) => (Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight));
  }, [resultsHeaderLayout]);
  const resultsSheetHeaderHeightRef = React.useRef(resultsSheetHeaderHeight);
  resultsSheetHeaderHeightRef.current = resultsSheetHeaderHeight;
  React.useEffect(() => {
    if (!filtersHeaderLayout) {
      return;
    }
    const nextHeight = filtersHeaderLayout.height;
    setFiltersHeaderHeight((prev) => (Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight));
  }, [filtersHeaderLayout]);
  const filtersHeaderHeightRef = React.useRef(filtersHeaderHeight);
  filtersHeaderHeightRef.current = filtersHeaderHeight;
  const openScoreInfo = React.useCallback((payload: ScoreInfoPayload) => {
    setScoreInfo(payload);
    setScoreInfoVisible(true);
  }, []);
  const closeScoreInfo = React.useCallback(() => {
    setScoreInfoVisible(false);
  }, []);
  const handleResultsSheetDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      setResultsSheetDragging(isDragging);
    },
    [setResultsSheetDragging]
  );
  const applyResultsSheetSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      handleSheetSnapChange(snap);
      if (snap === 'hidden') {
        flushPendingSearchOriginRestore();
      }
    },
    [flushPendingSearchOriginRestore, handleSheetSnapChange]
  );
  const handleResultsSheetSnapStart = React.useCallback(
    (snap: OverlaySheetSnap | 'hidden') => {
      if (snap === 'hidden') {
        return;
      }
      pendingResultsSheetSnapRef.current = null;
      applyResultsSheetSnapChange(snap);
    },
    [applyResultsSheetSnapChange]
  );
  const handleResultsSheetSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      if (resultsSheetSettlingRef.current) {
        pendingResultsSheetSnapRef.current = snap;
        return;
      }
      applyResultsSheetSnapChange(snap);
    },
    [applyResultsSheetSnapChange]
  );
  const handleRestaurantOverlaySnapStart = React.useCallback(
    (snap: OverlaySheetSnap | 'hidden') => {
      if (snap === 'hidden') {
        return;
      }
    },
    []
  );
  const handleRestaurantOverlaySnapChange = React.useCallback(
    (snap: OverlaySheetSnap | 'hidden') => {
      if (snap === 'hidden') {
        return;
      }
      const request = restaurantSnapRequest;
      if (request && request.snap === snap) {
        setRestaurantSnapRequest(null);
      }
    },
    [restaurantSnapRequest]
  );
  const handleResultsSheetSettlingChange = React.useCallback(
    (isSettling: boolean) => {
      setResultsSheetSettlingState(isSettling);
      if (!isSettling && pendingResultsSheetSnapRef.current) {
        const pending = pendingResultsSheetSnapRef.current;
        pendingResultsSheetSnapRef.current = null;
        applyResultsSheetSnapChange(pending);
      }
    },
    [applyResultsSheetSnapChange, setResultsSheetSettlingState]
  );
  const handleSearchFiltersLayoutCache = React.useCallback(
    (cache: SearchFiltersLayoutCache) => {
      searchFiltersLayoutCacheRef.current = cache;
      if (cache.rowHeight > 0) {
        setFiltersHeaderHeight((prev) =>
          Math.abs(prev - cache.rowHeight) < 0.5 ? prev : cache.rowHeight
        );
      }
    },
    [setFiltersHeaderHeight]
  );
  const handleResultsListScrollBegin = React.useCallback(() => {
    if (resultsScrollingTimeoutRef.current) {
      clearTimeout(resultsScrollingTimeoutRef.current);
      resultsScrollingTimeoutRef.current = null;
    }
    hasUserScrolledResultsRef.current = true;
    allowLoadMoreForCurrentScrollRef.current = true;
    setResultsListScrolling(true);
  }, [setResultsListScrolling]);
  const handleResultsListScrollEnd = React.useCallback(() => {
    if (resultsMomentum.value) {
      return;
    }
    if (resultsScrollingTimeoutRef.current) {
      clearTimeout(resultsScrollingTimeoutRef.current);
    }
    resultsScrollingTimeoutRef.current = setTimeout(() => {
      setResultsListScrolling(false);
      resultsScrollingTimeoutRef.current = null;
    }, 100);
  }, [resultsMomentum, setResultsListScrolling]);
  const handleResultsListMomentumBegin = React.useCallback(() => {
    if (resultsScrollingTimeoutRef.current) {
      clearTimeout(resultsScrollingTimeoutRef.current);
      resultsScrollingTimeoutRef.current = null;
    }
    hasUserScrolledResultsRef.current = true;
    allowLoadMoreForCurrentScrollRef.current = true;
    setResultsListScrolling(true);
  }, [setResultsListScrolling]);
  const handleResultsListMomentumEnd = React.useCallback(() => {
    if (resultsScrollingTimeoutRef.current) {
      clearTimeout(resultsScrollingTimeoutRef.current);
    }
    resultsScrollingTimeoutRef.current = setTimeout(() => {
      setResultsListScrolling(false);
      resultsScrollingTimeoutRef.current = null;
    }, 100);
  }, [setResultsListScrolling]);

  const handleOverlaySelect = React.useCallback(
    (target: OverlayKey) => {
      dismissTransientOverlays();
      const shouldDeferSuggestionClear = beginSuggestionCloseHold();
      setIsSuggestionPanelActive(false);
      if (target === 'search') {
        overlaySwitchInFlightRef.current = true;
        unstable_batchedUpdates(() => {
          overlayRuntimeController.switchToSearchRootWithDockedPolls(restoreDockedPolls);
          setIsSearchFocused(false);
          setIsAutocompleteSuppressed(true);
          if (!shouldDeferSuggestionClear) {
            setShowSuggestions(false);
            setSuggestions([]);
          }
        });
        inputRef.current?.blur();
        requestAnimationFrame(() => {
          overlaySwitchInFlightRef.current = false;
        });
        return;
      }

      const overlaySheetPositionState = useOverlaySheetPositionStore.getState();
      const desiredTabSnap = overlaySheetPositionState.hasUserSharedSnap
        ? overlaySheetPositionState.sharedSnap
        : 'expanded';
      const shouldRequestTabSnap = rootOverlay === 'search';

      setTabOverlaySnapRequest(shouldRequestTabSnap ? desiredTabSnap : null);
      if (isRestaurantOverlayVisible) {
        closeRestaurantProfileRef.current?.();
      }

      overlaySwitchInFlightRef.current = true;
      overlayRuntimeController.setRootOverlay(target);
      inputRef.current?.blur();
      requestAnimationFrame(() => {
        overlaySwitchInFlightRef.current = false;
      });
    },
    [
      beginSuggestionCloseHold,
      dismissTransientOverlays,
      isRestaurantOverlayVisible,
      overlayRuntimeController,
      rootOverlay,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setShowSuggestions,
      setSuggestions,
      setTabOverlaySnapRequest,
      restoreDockedPolls,
    ]
  );
  const {
    requestReturnToSearchFromPolls,
    handlePollsSnapStart,
    handlePollsSnapChange,
    requestPollCreationExpand,
    handlePollCreationSnapChange,
    handleBookmarksSnapStart,
    handleBookmarksSnapChange,
    handleProfileSnapStart,
    handleProfileSnapChange,
  } = useOverlaySnapOrchestration({
    handleOverlaySelect,
    setPollsSheetSnap,
    setPollsDockedSnapRequest,
    setTabOverlaySnapRequest,
    setIsDockedPollsDismissed,
    setPollCreationSnapRequest,
    setBookmarksSheetSnap,
    setProfileSheetSnap,
    pollsDockedSnapRequest,
    tabOverlaySnapRequest,
    pollCreationSnapRequest,
    pollsSheetSnap,
    hasUserSharedSnap,
    sharedSnap,
    rootOverlay,
    overlaySwitchInFlightRef,
    dockedPollsRestoreInFlightRef,
    ignoreDockedPollsHiddenUntilMsRef,
    overlayRuntimeController,
    restoreDockedPolls,
  });
  const { runAutocomplete, runSearch, cancelAutocomplete, cancelSearch, isAutocompleteLoading } =
    useSearchRequests();
  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);
  const navIconRenderers = SEARCH_BOTTOM_NAV_ICON_RENDERERS;
  const openNow = useSearchStore((state) => state.openNow);
  const setOpenNow = useSearchStore((state) => state.setOpenNow);
  const priceLevels = useSearchStore((state) => state.priceLevels);
  const setPriceLevels = useSearchStore((state) => state.setPriceLevels);
  const votes100Plus = useSearchStore((state) => state.votes100Plus);
  const setVotes100Plus = useSearchStore((state) => state.setVotes100Plus);
  const resetFilters = useSearchStore((state) => state.resetFilters);
  const scoreMode = useSearchStore((state) => state.scoreMode);
  const setPreferredScoreMode = useSearchStore((state) => state.setPreferredScoreMode);
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const hasSystemStatusBanner = useSystemStatusStore(
    (state) => state.isOffline || Boolean(state.serviceIssue)
  );
  const [pendingPriceRange, setPendingPriceRange] = React.useState<PriceRangeTuple>(() =>
    getRangeFromLevels(priceLevels)
  );
  const [pendingScoreMode, setPendingScoreMode] = React.useState<typeof scoreMode>(() => scoreMode);
  const {
    priceFiltersActive,
    priceButtonLabelText,
    priceSheetSummary,
    priceSummaryPillWidth,
    measureSummaryCandidateWidth,
    priceSliderLowValue,
    priceSliderHighValue,
    handlePriceSliderCommit,
    summaryCandidates: priceSummaryCandidates,
    summaryPillPaddingX: priceSummaryPillPaddingX,
    summaryReelItems,
  } = useSearchPriceSheetController({
    priceLevels,
    pendingPriceRange,
    setPendingPriceRange,
    isPriceSelectorVisible,
  });
  const trimmedQuery = query.trim();
  const hasSearchChromeRawQuery = trimmedQuery.length > 0;
  const isSuggestionScreenActive = isSuggestionPanelActive;
  const { suppressAutocompleteResults, allowAutocompleteResults, showCachedSuggestionsIfFresh } =
    useAutocompleteController({
      query,
      isSuggestionScreenActive,
      isSuggestionScreenVisible: isSuggestionPanelVisible,
      isAutocompleteSuppressed,
      runAutocomplete,
      cancelAutocomplete,
      setSuggestions,
      setShowSuggestions,
      autocompleteMinChars: AUTOCOMPLETE_MIN_CHARS,
      autocompleteCacheTtlMs: AUTOCOMPLETE_CACHE_TTL_MS,
    });
  const isSuggestionScreenVisible = isSuggestionPanelVisible;
  const { isSuggestionLayoutWarm, setIsSuggestionLayoutWarm } = useSuggestionLayoutWarmth({
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    holdMs: SUGGESTION_PANEL_LAYOUT_HOLD_MS,
  });
  const shouldDriveSuggestionLayout =
    isSuggestionPanelActive || isSuggestionPanelVisible || isSuggestionLayoutWarm;
  const {
    submitTransitionHold,
    beginSubmitTransition: beginSubmitTransitionHold,
    beginSuggestionCloseHold: beginSuggestionCloseTransitionHold,
    resetSubmitTransitionHold,
    resetSubmitTransitionHoldIfQueryChanged,
  } = useSuggestionTransitionHold({
    query,
    suggestions,
    recentSearches,
    recentlyViewedRestaurants,
    recentlyViewedFoods,
    isRecentLoading,
    isRecentlyViewedLoading,
    isRecentlyViewedFoodsLoading,
    setSearchTransitionVariant,
    shortcutContentFadeMode,
    shortcutFadeDefault: SHORTCUT_CONTENT_FADE_DEFAULT,
    shortcutFadeOut: SHORTCUT_CONTENT_FADE_OUT,
  });
  React.useEffect(() => {
    if (!isSuggestionPanelActive) {
      return;
    }
    setSearchTransitionVariant('default');
    const didReset = resetSubmitTransitionHoldIfQueryChanged(query);
    if (!didReset) {
      return;
    }
    setSuggestions([]);
    setShowSuggestions(false);
  }, [
    isSuggestionPanelActive,
    query,
    resetSubmitTransitionHoldIfQueryChanged,
    setSearchTransitionVariant,
    setSuggestions,
    setShowSuggestions,
  ]);
  const {
    isSuggestionClosing,
    shouldInstantSuggestionSpacing,
    suggestionDisplayQuery,
    suggestionDisplaySuggestions,
    recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay,
    isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay,
    hasRecentSearchesDisplay,
    hasRecentlyViewedRestaurantsDisplay,
    hasRecentlyViewedFoodsDisplay,
    hasTypedQuery,
    hasRawQuery,
    shouldHoldAutocomplete,
    shouldHoldRecent,
    shouldHoldSuggestionPanel,
    shouldHoldSuggestionBackground,
    shouldHoldShortcuts,
    shouldForceHideShortcuts,
    shouldFreezeSuggestionHeader,
    shouldRenderRecentSection,
    shouldRenderAutocompleteSection,
    shouldRenderSuggestionPanel,
    shouldShowAutocompleteSpinnerInBar,
    shouldShowSuggestionBackground,
    shouldShowSuggestionSurface,
    shouldLockSearchChromeTransform,
  } = useSuggestionDisplayModel({
    shouldDriveSuggestionLayout,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    hasSearchChromeRawQuery,
    isSearchSessionActive,
    isAutocompleteSuppressed,
    isAutocompleteLoading,
    query,
    suggestions,
    recentSearches,
    recentlyViewedRestaurants,
    recentlyViewedFoods,
    isRecentLoading,
    isRecentlyViewedLoading,
    isRecentlyViewedFoodsLoading,
    submitTransitionHold,
    autocompleteMinChars: AUTOCOMPLETE_MIN_CHARS,
  });
  // Restaurant profile sheet should remain draggable even while the suggestion panel is
  // animating out (isSuggestionPanelVisible). We only suppress interaction while suggestions are
  // actively open.
  const shouldSuppressRestaurantOverlay = isRestaurantOverlayVisible && isSuggestionPanelActive;
  const shouldEnableRestaurantOverlayInteraction = !shouldSuppressRestaurantOverlay;
  React.useEffect(() => {
    if (!isSuggestionPanelVisible) {
      shortcutContentFadeMode.value = SHORTCUT_CONTENT_FADE_DEFAULT;
      suggestionScrollOffset.value = 0;
    }
  }, [isSuggestionPanelVisible, shortcutContentFadeMode, suggestionScrollOffset]);
  React.useEffect(() => {
    if (shouldDriveSuggestionLayout) {
      return;
    }
    resetSubmitTransitionHold();
    setSuggestions([]);
    setShowSuggestions(false);
  }, [resetSubmitTransitionHold, setSuggestions, setShowSuggestions, shouldDriveSuggestionLayout]);
  const handleSuggestionContentSizeChange = React.useCallback(
    (_width: number, height: number) => {
      if (!shouldDriveSuggestionLayout || !shouldRenderSuggestionPanel) {
        return;
      }
      if (searchInteractionRef.current.isInteracting) {
        return;
      }
      const nextHeight = Math.max(0, height);
      if (Math.abs(nextHeight - suggestionContentHeightRef.current) < 1) {
        return;
      }
      suggestionContentHeightRef.current = nextHeight;
      setSuggestionContentHeight(nextHeight);
    },
    [shouldDriveSuggestionLayout, shouldRenderSuggestionPanel]
  );
  const showDockedPolls = shouldShowDockedPolls;
  const shouldShowPollsSheet = showPollsOverlay || showDockedPolls;
  const pollsOverlayMode = showPollsOverlay ? 'overlay' : 'docked';
  const lastShowDockedPollsRef = React.useRef(showDockedPolls);
  React.useEffect(() => {
    const wasShowing = lastShowDockedPollsRef.current;
    lastShowDockedPollsRef.current = showDockedPolls;
    if (showDockedPolls && !wasShowing) {
      restoreDockedPolls();
    }
  }, [restoreDockedPolls, showDockedPolls]);
  const pollsOverlaySnapPoint = showPollsOverlay
    ? hasUserSharedSnap
      ? sharedSnap
      : 'expanded'
    : 'collapsed';
  const shouldRenderSearchOverlay =
    isSearchOverlay ||
    shouldShowPollsSheet ||
    showBookmarksOverlay ||
    showProfileOverlay ||
    showSaveListOverlay;
  const shouldShowSearchShortcuts =
    !shouldDisableSearchShortcuts &&
    shouldRenderSearchOverlay &&
    (isSearchOverlay ? isSuggestionPanelActive || !isSearchSessionActive : true);
  const shouldRenderSearchShortcuts =
    (shouldShowSearchShortcuts || shouldHoldShortcuts) && !shouldForceHideShortcuts;
  const { progress: searchShortcutsFadeProgress, isVisible: shouldRenderSearchShortcutsRow } =
    useTransitionDriver({
      enabled: true,
      target: shouldRenderSearchShortcuts ? 1 : 0,
      getDurationMs: () => SEARCH_SHORTCUTS_FADE_MS,
      getEasing: () => Easing.linear,
      resetOnShowKey: searchShortcutsFadeResetKey,
    });
  const shouldMountSearchShortcuts =
    !shouldForceHideShortcuts && (shouldRenderSearchShortcuts || shouldRenderSearchShortcutsRow);
  const shouldUseSearchShortcutFrames =
    shouldDriveSuggestionLayout ||
    shouldMountSearchShortcuts ||
    shouldRenderSearchShortcuts ||
    shouldShowSearchShortcuts;
  const cachedSearchShortcutsFrame = searchShortcutsLayoutCacheRef.current.frame;
  const cachedSearchShortcutChipFrames = searchShortcutsLayoutCacheRef.current.chipFrames;
  const cachedSearchContainerFrame = searchContainerLayoutCacheRef.current;
  const resolvedSearchShortcutsFrame = useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return null;
    }
    if (searchShortcutsFrame) {
      return searchShortcutsFrame;
    }
    return cachedSearchShortcutsFrame;
  }, [cachedSearchShortcutsFrame, searchShortcutsFrame, shouldUseSearchShortcutFrames]);
  const resolvedSearchShortcutChipFrames = useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return {};
    }
    return { ...cachedSearchShortcutChipFrames, ...searchShortcutChipFrames };
  }, [cachedSearchShortcutChipFrames, searchShortcutChipFrames, shouldUseSearchShortcutFrames]);
  const hasResolvedSearchShortcutsFrame = Boolean(resolvedSearchShortcutsFrame);
  const shouldIncludeShortcutCutout =
    shouldDriveSuggestionLayout &&
    !shouldForceHideShortcuts &&
    (shouldRenderSearchShortcuts ||
      shouldRenderSearchShortcutsRow ||
      shouldHoldShortcuts ||
      hasResolvedSearchShortcutsFrame);
  const shouldIncludeShortcutHoles = shouldIncludeShortcutCutout;
  const shouldIncludeShortcutLayout = shouldIncludeShortcutCutout;
  const resolvedSearchContainerFrame = useMemo(() => {
    const isUsable = (frame: LayoutRectangle | null) =>
      Boolean(frame && frame.width > 0 && frame.height > SEARCH_CONTAINER_PADDING_TOP + 0.5);

    if (isUsable(searchContainerFrame)) {
      return searchContainerFrame;
    }
    if (isUsable(cachedSearchContainerFrame)) {
      return cachedSearchContainerFrame;
    }
    return null;
  }, [cachedSearchContainerFrame, searchContainerFrame]);
  const buildSuggestionTransitionHoldCapture = React.useCallback(
    (holdShortcuts: boolean) => ({
      enabled: shouldDriveSuggestionLayout,
      flags: {
        holdAutocomplete: shouldRenderAutocompleteSection,
        holdRecent: shouldRenderRecentSection,
        holdSuggestionPanel: shouldRenderSuggestionPanel,
        holdSuggestionBackground: shouldShowSuggestionBackground,
        holdShortcuts,
      },
    }),
    [
      shouldDriveSuggestionLayout,
      shouldRenderAutocompleteSection,
      shouldRenderRecentSection,
      shouldRenderSuggestionPanel,
      shouldShowSuggestionBackground,
    ]
  );
  const beginSubmitTransition = React.useCallback(() => {
    return beginSubmitTransitionHold(
      buildSuggestionTransitionHoldCapture(shouldShowSearchShortcuts)
    );
  }, [beginSubmitTransitionHold, buildSuggestionTransitionHoldCapture, shouldShowSearchShortcuts]);
  const beginSuggestionCloseHold = React.useCallback(
    (variant: 'default' | 'submitting' = 'default') => {
      return beginSuggestionCloseTransitionHold({
        ...buildSuggestionTransitionHoldCapture(false),
        variant,
      });
    },
    [beginSuggestionCloseTransitionHold, buildSuggestionTransitionHoldCapture]
  );
  const fallbackHeaderContentBottom = useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    if (searchLayout.height <= 0) {
      return 0;
    }
    return searchLayout.top + searchLayout.height + SEARCH_BAR_HOLE_PADDING + CUTOUT_EDGE_SLOP;
  }, [searchLayout.height, searchLayout.top, shouldDriveSuggestionLayout]);
  const searchContainerContentBottom = useMemo(() => {
    if (resolvedSearchContainerFrame) {
      return (
        resolvedSearchContainerFrame.y +
        resolvedSearchContainerFrame.height +
        SEARCH_BAR_HOLE_PADDING +
        CUTOUT_EDGE_SLOP
      );
    }
    return fallbackHeaderContentBottom;
  }, [fallbackHeaderContentBottom, resolvedSearchContainerFrame]);
  const frozenSuggestionHeaderContentBottom = suggestionHeaderContentBottomRef.current;
  const suggestionHeaderContentBottom = useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    if (shouldFreezeSuggestionHeader && frozenSuggestionHeaderContentBottom > 0) {
      return frozenSuggestionHeaderContentBottom;
    }
    if (
      shouldIncludeShortcutLayout &&
      !resolvedSearchShortcutsFrame &&
      frozenSuggestionHeaderContentBottom > 0
    ) {
      return frozenSuggestionHeaderContentBottom;
    }

    if (shouldIncludeShortcutLayout && resolvedSearchShortcutsFrame) {
      return (
        resolvedSearchShortcutsFrame.y +
        resolvedSearchShortcutsFrame.height +
        SHORTCUT_CHIP_HOLE_PADDING +
        CUTOUT_EDGE_SLOP
      );
    }
    if (shouldIncludeShortcutLayout && !resolvedSearchShortcutsFrame) {
      if (searchContainerContentBottom <= 0) {
        return 0;
      }
      // Hot reload can briefly clear shortcut layout measurements. Keep a stable strip behind
      // shortcut chips until the next onLayout arrives so the cutout surface doesn't collapse.
      return searchContainerContentBottom + SEARCH_SHORTCUTS_STRIP_FALLBACK_HEIGHT;
    }
    return searchContainerContentBottom;
  }, [
    frozenSuggestionHeaderContentBottom,
    resolvedSearchShortcutsFrame,
    searchContainerContentBottom,
    shouldDriveSuggestionLayout,
    shouldFreezeSuggestionHeader,
    shouldIncludeShortcutLayout,
  ]);
  React.useEffect(() => {
    if (!shouldFreezeSuggestionHeader && suggestionHeaderContentBottom > 0) {
      suggestionHeaderContentBottomRef.current = suggestionHeaderContentBottom;
    }
  }, [shouldFreezeSuggestionHeader, suggestionHeaderContentBottom]);
  const suggestionHeaderContentBottomFallback = suggestionHeaderContentBottomRef.current;
  const suggestionHeaderHeightTarget = useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    const contentBottom =
      suggestionHeaderContentBottom > 0
        ? suggestionHeaderContentBottom
        : suggestionHeaderContentBottomFallback;
    if (contentBottom <= 0) {
      return 0;
    }
    const paddedBottom = contentBottom + SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM;
    return Math.max(0, ceilToPixel(paddedBottom));
  }, [
    shouldDriveSuggestionLayout,
    suggestionHeaderContentBottom,
    suggestionHeaderContentBottomFallback,
  ]);
  const headerPaddingOverlap = SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP;
  const suggestionScrollTopTarget = useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }

    const fallback = searchLayout.top + searchLayout.height + 8;
    const overlap = suggestionHeaderHeightTarget > 0 ? headerPaddingOverlap : 0;
    const headerBottom =
      suggestionHeaderHeightTarget > 0
        ? suggestionHeaderHeightTarget - overlap + SEARCH_SUGGESTION_HEADER_PANEL_GAP
        : fallback;
    return Math.max(0, headerBottom);
  }, [
    headerPaddingOverlap,
    searchLayout.height,
    searchLayout.top,
    shouldDriveSuggestionLayout,
    suggestionHeaderHeightTarget,
  ]);
  const suggestionScrollMaxHeightTarget = useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return undefined;
    }
    const available =
      SCREEN_HEIGHT - suggestionScrollTopTarget - SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM;
    return available > 0 ? available : undefined;
  }, [shouldDriveSuggestionLayout, suggestionScrollTopTarget]);
  const suggestionTopFillHeight = useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    if (!shouldShowSuggestionBackground) {
      return 0;
    }
    const fallbackHeight = SEARCH_SUGGESTION_EMPTY_FILL_HEIGHT;
    const maxHeight = suggestionScrollMaxHeightTarget ?? fallbackHeight;
    if (maxHeight <= 0) {
      return 0;
    }
    const desiredHeight = suggestionContentHeight > 0 ? suggestionContentHeight : fallbackHeight;
    return Math.min(desiredHeight, maxHeight);
  }, [
    shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground,
    suggestionContentHeight,
    suggestionScrollMaxHeightTarget,
  ]);
  const suggestionSpacingDuration = SUGGESTION_PANEL_FADE_MS;
  const suggestionSpacingEasing = isSuggestionPanelActive
    ? Easing.out(Easing.cubic)
    : Easing.in(Easing.cubic);
  const shouldFreezeSuggestionSpacing = isSuggestionClosing;
  React.useEffect(() => {
    if (!shouldDriveSuggestionLayout) {
      return;
    }
    const nextHeaderHeight = suggestionHeaderHeightTarget;
    const nextScrollTop = suggestionScrollTopTarget;
    const nextMaxHeight = suggestionScrollMaxHeightTarget ?? 0;

    if (!suggestionSpacingInitializedRef.current) {
      suggestionHeaderHeightValue.value = nextHeaderHeight;
      suggestionScrollTopValue.value = nextScrollTop;
      suggestionScrollMaxHeightValue.value = nextMaxHeight;
      suggestionSpacingInitializedRef.current = true;
      return;
    }

    if (shouldFreezeSuggestionSpacing) {
      return;
    }

    if (shouldInstantSuggestionSpacing) {
      suggestionHeaderHeightValue.value = nextHeaderHeight;
      suggestionScrollTopValue.value = nextScrollTop;
      suggestionScrollMaxHeightValue.value = nextMaxHeight;
      return;
    }

    suggestionHeaderHeightValue.value = withTiming(nextHeaderHeight, {
      duration: suggestionSpacingDuration,
      easing: suggestionSpacingEasing,
    });
    suggestionScrollTopValue.value = withTiming(nextScrollTop, {
      duration: suggestionSpacingDuration,
      easing: suggestionSpacingEasing,
    });
    suggestionScrollMaxHeightValue.value = withTiming(nextMaxHeight, {
      duration: suggestionSpacingDuration,
      easing: suggestionSpacingEasing,
    });
  }, [
    isSuggestionPanelActive,
    shouldDriveSuggestionLayout,
    suggestionHeaderHeightTarget,
    suggestionScrollTopTarget,
    suggestionScrollMaxHeightTarget,
    suggestionSpacingDuration,
    suggestionSpacingEasing,
    suggestionHeaderHeightValue,
    suggestionScrollTopValue,
    suggestionScrollMaxHeightValue,
    shouldFreezeSuggestionSpacing,
    shouldInstantSuggestionSpacing,
  ]);
  const suggestionHeaderHeightAnimatedStyle = useAnimatedStyle(() => ({
    height: suggestionHeaderHeightValue.value,
  }));
  const suggestionScrollTopAnimatedStyle = useAnimatedStyle(() => ({
    marginTop: suggestionScrollTopValue.value,
  }));
  const suggestionScrollMaxHeightAnimatedStyle = useAnimatedStyle(() => ({
    maxHeight: suggestionScrollMaxHeightValue.value,
  }));
  const suggestionScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      suggestionScrollOffset.value = event.contentOffset.y;
    },
  });
  const suggestionHeaderDividerAnimatedStyle = useScrollDividerStyle(suggestionScrollOffset, 16);
  const suggestionHeaderSearchHoleCandidate = React.useMemo<MaskedHole | null>(() => {
    if (!shouldDriveSuggestionLayout) {
      return null;
    }
    if (!resolvedSearchContainerFrame) {
      return null;
    }

    const x = resolvedSearchContainerFrame.x + SEARCH_HORIZONTAL_PADDING - SEARCH_BAR_HOLE_PADDING;
    const y =
      resolvedSearchContainerFrame.y + SEARCH_CONTAINER_PADDING_TOP - SEARCH_BAR_HOLE_PADDING;
    const width =
      resolvedSearchContainerFrame.width -
      SEARCH_HORIZONTAL_PADDING * 2 +
      SEARCH_BAR_HOLE_PADDING * 2;
    const height = resolvedSearchContainerFrame.height - SEARCH_CONTAINER_PADDING_TOP;

    if (width <= 0 || height <= 0) {
      return null;
    }

    const paddedX = Math.max(0, floorToPixel(x - CUTOUT_EDGE_SLOP));
    const paddedY = Math.max(0, floorToPixel(y - CUTOUT_EDGE_SLOP));
    const paddedWidth = ceilToPixel(width + CUTOUT_EDGE_SLOP * 2);
    const paddedHeight = ceilToPixel(height + SEARCH_BAR_HOLE_PADDING * 2 + CUTOUT_EDGE_SLOP * 2);

    return {
      x: paddedX,
      y: paddedY,
      width: paddedWidth,
      height: paddedHeight,
      borderRadius: SEARCH_BAR_HOLE_RADIUS + SEARCH_BAR_HOLE_PADDING,
    };
  }, [shouldDriveSuggestionLayout, resolvedSearchContainerFrame]);
  React.useEffect(() => {
    if (shouldFreezeSuggestionHeader) {
      return;
    }
    if (suggestionHeaderSearchHoleCandidate) {
      suggestionHeaderSearchHoleRef.current = suggestionHeaderSearchHoleCandidate;
    }
  }, [shouldFreezeSuggestionHeader, suggestionHeaderSearchHoleCandidate]);
  const suggestionHeaderSearchHole = React.useMemo(() => {
    if (shouldFreezeSuggestionHeader) {
      return suggestionHeaderSearchHoleRef.current;
    }
    return suggestionHeaderSearchHoleCandidate ?? suggestionHeaderSearchHoleRef.current;
  }, [shouldFreezeSuggestionHeader, suggestionHeaderSearchHoleCandidate]);
  const suggestionHeaderShortcutHoleCandidates = React.useMemo(() => {
    if (
      !shouldDriveSuggestionLayout ||
      !shouldIncludeShortcutHoles ||
      !resolvedSearchShortcutsFrame
    ) {
      return { restaurants: null, dishes: null };
    }

    const buildHole = (chip: LayoutRectangle | undefined): MaskedHole | null => {
      if (!chip || chip.width <= 0 || chip.height <= 0) {
        return null;
      }
      const x = resolvedSearchShortcutsFrame.x + chip.x - SHORTCUT_CHIP_HOLE_PADDING;
      const y = resolvedSearchShortcutsFrame.y + chip.y - SHORTCUT_CHIP_HOLE_PADDING;
      const width = chip.width + SHORTCUT_CHIP_HOLE_PADDING * 2;
      const height = chip.height + SHORTCUT_CHIP_HOLE_PADDING * 2;
      if (width <= 0 || height <= 0) {
        return null;
      }
      const paddedX = Math.max(0, floorToPixel(x - CUTOUT_EDGE_SLOP));
      const paddedY = Math.max(0, floorToPixel(y - CUTOUT_EDGE_SLOP));
      const paddedWidth = ceilToPixel(width + CUTOUT_EDGE_SLOP * 2);
      const paddedHeight = ceilToPixel(height + CUTOUT_EDGE_SLOP * 2);
      return {
        x: paddedX,
        y: paddedY,
        width: paddedWidth,
        height: paddedHeight,
        borderRadius: SHORTCUT_CHIP_HOLE_RADIUS + SHORTCUT_CHIP_HOLE_PADDING,
      };
    };

    return {
      restaurants: buildHole(resolvedSearchShortcutChipFrames.restaurants),
      dishes: buildHole(resolvedSearchShortcutChipFrames.dishes),
    };
  }, [
    shouldDriveSuggestionLayout,
    shouldIncludeShortcutHoles,
    resolvedSearchShortcutsFrame,
    resolvedSearchShortcutChipFrames.dishes,
    resolvedSearchShortcutChipFrames.restaurants,
  ]);
  React.useEffect(() => {
    if (shouldFreezeSuggestionHeader) {
      return;
    }
    const { restaurants, dishes } = suggestionHeaderShortcutHoleCandidates;
    if (restaurants) {
      suggestionHeaderShortcutHolesRef.current.restaurants = restaurants;
    }
    if (dishes) {
      suggestionHeaderShortcutHolesRef.current.dishes = dishes;
    }
  }, [shouldFreezeSuggestionHeader, suggestionHeaderShortcutHoleCandidates]);
  const suggestionHeaderShortcutHoles = React.useMemo(() => {
    if (!shouldIncludeShortcutHoles) {
      return { restaurants: null, dishes: null };
    }
    const cached = suggestionHeaderShortcutHolesRef.current;
    if (shouldFreezeSuggestionHeader) {
      return cached;
    }
    return {
      restaurants: suggestionHeaderShortcutHoleCandidates.restaurants ?? cached.restaurants,
      dishes: suggestionHeaderShortcutHoleCandidates.dishes ?? cached.dishes,
    };
  }, [
    shouldFreezeSuggestionHeader,
    suggestionHeaderShortcutHoleCandidates,
    shouldIncludeShortcutHoles,
  ]);
  const suggestionHeaderHoles = React.useMemo<MaskedHole[]>(() => {
    if (!shouldDriveSuggestionLayout) {
      return [];
    }

    const holes: MaskedHole[] = [];

    if (suggestionHeaderSearchHole) {
      holes.push(suggestionHeaderSearchHole);
    }

    if (suggestionHeaderShortcutHoles.restaurants) {
      holes.push(suggestionHeaderShortcutHoles.restaurants);
    }
    if (suggestionHeaderShortcutHoles.dishes) {
      holes.push(suggestionHeaderShortcutHoles.dishes);
    }

    return holes;
  }, [shouldDriveSuggestionLayout, suggestionHeaderSearchHole, suggestionHeaderShortcutHoles]);
  const resolvedSuggestionHeaderHoles = React.useMemo(() => {
    if (shouldFreezeSuggestionHeader) {
      return suggestionHeaderHolesRef.current;
    }
    if (suggestionHeaderHoles.length) {
      suggestionHeaderHolesRef.current = suggestionHeaderHoles;
      return suggestionHeaderHoles;
    }
    return suggestionHeaderHolesRef.current;
  }, [shouldFreezeSuggestionHeader, suggestionHeaderHoles]);
  const searchSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: suggestionProgress.value,
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    elevation: 0,
  }));
  const searchHeaderFocusProgress = useSharedValue(0);
  const searchBarContainerAnimatedStyle = useAnimatedStyle(() => {
    const progress = suggestionProgress.value;
    const backgroundAlpha = 1 - progress;
    const chromeOpacity = searchChromeOpacity.value;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity: chromeOpacity,
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      ...shadowFadeStyle(
        SEARCH_BAR_BASE_SHADOW_OPACITY,
        SEARCH_BAR_BASE_ELEVATION,
        backgroundAlpha
      ),
      borderWidth: 0,
      transform: [{ scale: chromeScale }],
      display: chromeOpacity < 0.02 ? 'none' : 'flex',
    };
  }, [shouldLockSearchChromeTransform]);
  const searchShortcutChipAnimatedStyle = useAnimatedStyle(() => {
    const progress = suggestionProgress.value;
    const backgroundAlpha = searchTransitionVariant === 'submitting' ? 0 : 1 - progress;
    return {
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      ...shadowFadeStyle(
        SEARCH_SHORTCUT_BASE_SHADOW_OPACITY,
        SEARCH_SHORTCUT_BASE_ELEVATION,
        backgroundAlpha
      ),
    };
  }, [searchTransitionVariant]);
  const searchShortcutContentAnimatedStyle = useAnimatedStyle(() => {
    const progress = suggestionProgress.value;
    if (isSuggestionClosing) {
      if (shortcutContentFadeMode.value === SHORTCUT_CONTENT_FADE_OUT) {
        return { opacity: progress };
      }
      if (shortcutContentFadeMode.value === SHORTCUT_CONTENT_FADE_HOLD) {
        return { opacity: 1 };
      }
      return {
        opacity: 1 - progress,
      };
    }
    return { opacity: 1 };
  }, [isSuggestionClosing]);
  const searchShortcutsAnimatedStyle = useAnimatedStyle(() => {
    const sheetTop = sheetTranslateY.value;
    const expandedY = chromeTransitionConfig.expanded;
    const middleY = chromeTransitionConfig.middle;
    const fadeEndY = Math.min(middleY, expandedY + SEARCH_CHROME_FADE_ZONE_PX);
    const uncoverProgress =
      fadeEndY > expandedY
        ? interpolate(sheetTop, [expandedY, fadeEndY], [0, 1], Extrapolation.CLAMP)
        : middleY <= expandedY
        ? 1
        : 0;
    const visibility = Math.min(searchShortcutsFadeProgress.value, uncoverProgress);
    const submitOpacity = searchTransitionVariant === 'submitting' ? suggestionProgress.value : 1;
    const progress = suggestionProgress.value;
    const backgroundAlpha = 1 - progress;
    const revealOpacity =
      searchTransitionVariant === 'submitting' || isSuggestionPanelVisible ? 1 : backgroundAlpha;
    const opacity = searchChromeOpacity.value * visibility * submitOpacity * revealOpacity;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity,
      transform: [{ scale: chromeScale }],
    };
  }, [
    chromeTransitionConfig.expanded,
    chromeTransitionConfig.middle,
    isSuggestionPanelVisible,
    searchTransitionVariant,
    shouldLockSearchChromeTransform,
  ]);
  const suggestionPanelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 0 }],
  }));
  const restaurantOverlayAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: shouldSuppressRestaurantOverlay ? 1 - suggestionProgress.value : 1,
    }),
    [shouldSuppressRestaurantOverlay]
  );
  const priceButtonIsActive = priceFiltersActive;
  const rankButtonIsActive = scoreMode === 'global_quality';
  const rankButtonLabelText = rankButtonIsActive ? 'Global' : 'Rank';
  const votesFilterActive = votes100Plus;
  const canLoadMore =
    Boolean(results) && !isPaginationExhausted && (hasMoreFood || hasMoreRestaurants);
  const shouldShowSearchThisArea =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    isSearchSessionActive &&
    mapMovedSinceSearch &&
    !isSearchLoading &&
    !isLoadingMore &&
    Boolean(results);

  const searchThisAreaRevealProgress = useDerivedValue(() => {
    const target = shouldShowSearchThisArea ? 1 : 0;
    return withTiming(target, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [shouldShowSearchThisArea]);
  const searchThisAreaAnimatedStyle = useAnimatedStyle(() => {
    const opacity = searchChromeOpacity.value * searchThisAreaRevealProgress.value;
    const chromeScale = shouldLockSearchChromeTransform ? 1 : searchChromeScale.value;
    return {
      opacity,
      transform: [{ scale: chromeScale }],
      display: opacity < 0.02 ? 'none' : 'flex',
    };
  }, [shouldLockSearchChromeTransform]);
  const primaryFoodTerm = React.useMemo(() => {
    const term = results?.metadata?.primaryFoodTerm;
    if (typeof term === 'string') {
      const normalized = term.trim();
      if (normalized.length) {
        return normalized;
      }
    }
    return null;
  }, [results?.metadata?.primaryFoodTerm]);
  React.useEffect(() => {
    if (!shouldShowPollsSheet) {
      setPollsSheetSnap('hidden');
    }
  }, [shouldShowPollsSheet]);

  React.useEffect(() => {
    if (!showBookmarksOverlay) {
      setBookmarksSheetSnap('hidden');
    }
  }, [showBookmarksOverlay]);

  React.useEffect(() => {
    if (!showProfileOverlay) {
      setProfileSheetSnap('hidden');
    }
  }, [showProfileOverlay]);

  React.useEffect(() => {
    if (!showSaveListOverlay) {
      setSaveSheetSnap('hidden');
    }
  }, [showSaveListOverlay]);

  React.useEffect(() => {
    if (!shouldShowPollsSheet) {
      return;
    }
    if (latestBoundsRef.current) {
      pollBoundsRef.current = latestBoundsRef.current;
      setPollBounds(latestBoundsRef.current);
      return;
    }
    void resolveCurrentMapBounds().then((bounds) => {
      if (!bounds) {
        return;
      }
      pollBoundsRef.current = bounds;
      setPollBounds(bounds);
    });
  }, [resolveCurrentMapBounds, shouldShowPollsSheet]);
  const { deferRecentSearchUpsert, deferRecentlyViewedTrack } = useSuggestionHistoryBuffer({
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    updateLocalRecentSearches,
    trackRecentlyViewedRestaurant,
  });
  const captureSearchSessionQuery = React.useCallback(() => {
    if (!isSearchSessionActive || isSuggestionPanelActive) {
      return;
    }
    searchSessionQueryRef.current = submittedQuery || query;
  }, [isSearchSessionActive, isSuggestionPanelActive, submittedQuery, query]);
  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      return;
    }
    if (isSearchFocused || isSuggestionPanelActive) {
      return;
    }
    const nextQuery = submittedQuery.trim();
    if (!nextQuery || nextQuery === query) {
      return;
    }
    if (shortcutQuerySyncTaskRef.current) {
      shortcutQuerySyncTaskRef.current.cancel();
      shortcutQuerySyncTaskRef.current = null;
    }
    setQuery(nextQuery);
    return () => {
      if (shortcutQuerySyncTaskRef.current) {
        shortcutQuerySyncTaskRef.current.cancel();
        shortcutQuerySyncTaskRef.current = null;
      }
    };
  }, [isSearchFocused, isSuggestionPanelActive, query, searchMode, setQuery, submittedQuery]);
  const focusSearchInput = React.useCallback(() => {
    isSearchEditingRef.current = true;
    allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    dismissTransientOverlays();
    allowAutocompleteResults();
    setIsAutocompleteSuppressed(false);
    setIsSearchFocused(true);
    setIsSuggestionPanelActive(true);
    const trimmed = query.trim();
    if (trimmed.length >= AUTOCOMPLETE_MIN_CHARS) {
      const usedCache = showCachedSuggestionsIfFresh(trimmed);
      if (!usedCache) {
        cancelAutocomplete();
      }
    }
    inputRef.current?.focus();
  }, [
    allowAutocompleteResults,
    captureSearchSessionQuery,
    cancelAutocomplete,
    dismissTransientOverlays,
    query,
    showCachedSuggestionsIfFresh,
  ]);
  const handleSearchPressIn = React.useCallback(() => {
    isSearchEditingRef.current = true;
    allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    dismissTransientOverlays();
    allowAutocompleteResults();
    setIsAutocompleteSuppressed(false);
    setIsSearchFocused(true);
    setIsSuggestionPanelActive(true);
  }, [
    allowAutocompleteResults,
    captureSearchSessionQuery,
    dismissTransientOverlays,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
  ]);
  const handleQueryChange = React.useCallback((value: string) => {
    setIsAutocompleteSuppressed(false);
    setQuery(value);
  }, []);
  const restaurants = results?.restaurants ?? EMPTY_RESTAURANTS;
  const dishes = results?.dishes ?? EMPTY_DISHES;
  const { canonicalRestaurantRankById, restaurantsById } = useSearchResultsReadModel({
    restaurants,
    dishes,
    searchRequestId: results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? null,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
  });
  const {
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickClosestLocationToCenter,
    pickPreferredRestaurantMapLocation,
  } = useRestaurantLocationSelection({
    viewportBoundsService,
    userLocation,
    userLocationRef,
  });
  const overlaySelectedRestaurantId = isRestaurantOverlayVisible
    ? restaurantProfile?.restaurant.restaurantId ?? null
    : null;
  const [mapHighlightedRestaurantId, setMapHighlightedRestaurantId] = React.useState<string | null>(
    null
  );
  const pendingMarkerOpenAnimationFrameRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      const pendingFrame = pendingMarkerOpenAnimationFrameRef.current;
      if (pendingFrame != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingFrame);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    };
  }, []);
  const resultsHydrationCandidate = React.useMemo(() => {
    if (!results) {
      return null;
    }
    const requestKey = resultsRequestKey ?? 'no-request';
    const totalFoodResults =
      typeof results.metadata?.totalFoodResults === 'number'
        ? results.metadata.totalFoodResults
        : 'na';
    const totalRestaurantResults =
      typeof results.metadata?.totalRestaurantResults === 'number'
        ? results.metadata.totalRestaurantResults
        : 'na';
    return `${requestKey}:page:${resultsPage}:dishes:${dishes.length}:restaurants:${restaurants.length}:totalFood:${totalFoodResults}:totalRestaurants:${totalRestaurantResults}`;
  }, [
    dishes.length,
    restaurants.length,
    results,
    results?.metadata?.totalFoodResults,
    results?.metadata?.totalRestaurantResults,
    resultsPage,
    resultsRequestKey,
  ]);
  const storedResultsScrollOffset = useOverlayStore(
    (state) => state.overlayScrollOffsets.search ?? 0
  );
  const [markerRestaurants, setMarkerRestaurants] =
    React.useState<RestaurantResult[]>(EMPTY_RESTAURANTS);
  const [hydratedResultsKey, setHydratedResultsKey] = React.useState<string | null>(null);
  const hydratedResultsKeyRef = React.useRef<string | null>(null);
  hydratedResultsKeyRef.current = hydratedResultsKey;
  const setHydratedResultsKeySync = React.useCallback((next: string | null) => {
    hydratedResultsKeyRef.current = next;
    if (typeof React.startTransition === 'function') {
      React.startTransition(() => {
        setHydratedResultsKey(next);
      });
      return;
    }
    setHydratedResultsKey(next);
  }, []);
  const resultsHydrationKey =
    results == null ? null : resultsPage === 1 ? resultsHydrationCandidate : hydratedResultsKey;
  const needsResultsHydration =
    resultsHydrationKey != null &&
    resultsHydrationKey !== (hydratedResultsKeyRef.current ?? hydratedResultsKey);
  const shouldHydrateResultsForRender =
    needsResultsHydration &&
    activeOverlay === 'search' &&
    storedResultsScrollOffset <= 0.5 &&
    !hasUserScrolledResultsRef.current;
  const markerUpdateSeqRef = React.useRef(0);
  const markerUpdateTaskRef = React.useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const shortcutQuerySyncTaskRef = React.useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const shouldDisableSearchBlur = false;
  const forceDisableMarkerViews = false;
  const shouldDisableMarkerViews = forceDisableMarkerViews;
  const shouldUsePlaceholderRows = false;
  const shouldDisableFiltersHeader = false;
  const shouldDisableResultsHeader = false;
  const shouldDisableSearchShortcuts = false;
  const shouldLogJsStalls = false;
  const jsStallMinMs = Number.POSITIVE_INFINITY;
  const shouldLogMapEventRates = false;
  const mapEventLogIntervalMs = 0;
  const shouldLogSearchComputes = false;
  const searchComputeMinMs = Number.POSITIVE_INFINITY;
  const shouldLogSearchStateChanges = false;
  const shouldLogSearchStateWhenSettlingOnly = false;
  const shouldLogSuggestionOverlayState = false;
  const shouldLogResultsViewability = false;
  const shouldLogProfiler = false;
  const profilerMinMs = Number.POSITIVE_INFINITY;
  const getPerfNow = React.useCallback(() => {
    if (typeof performance?.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }, []);
  const readRuntimeMemoryDiagnostics = React.useCallback(() => null, []);
  const logSearchCompute = React.useCallback(
    (label: string, duration: number) => {
      if (!shouldLogSearchComputes || duration < searchComputeMinMs) {
        return;
      }
      const interactionState = searchInteractionRef.current;
      // eslint-disable-next-line no-console
      logger.debug(
        `[SearchPerf] compute ${label} ${duration.toFixed(1)}ms drag=${
          interactionState.isResultsSheetDragging
        } scroll=${interactionState.isResultsListScrolling} settle=${
          interactionState.isResultsSheetSettling
        }`
      );
    },
    [searchComputeMinMs, shouldLogSearchComputes]
  );
  React.useEffect(() => {
    if (markerUpdateTaskRef.current) {
      markerUpdateTaskRef.current.cancel();
      markerUpdateTaskRef.current = null;
    }

    const nextSeq = markerUpdateSeqRef.current + 1;
    markerUpdateSeqRef.current = nextSeq;

    if (shouldDisableMarkerViews) {
      setMarkerRestaurants(EMPTY_RESTAURANTS);
      return;
    }

    if (restaurants.length === 0) {
      setMarkerRestaurants(EMPTY_RESTAURANTS);
      return;
    }

    if (shouldHydrateResultsForRender || isVisualSyncPending) {
      return;
    }

    const apply = () => {
      if (markerUpdateSeqRef.current !== nextSeq) {
        return;
      }
      if (typeof React.startTransition === 'function') {
        React.startTransition(() => {
          setMarkerRestaurants(restaurants);
        });
        return;
      }
      setMarkerRestaurants(restaurants);
    };

    if (searchInteractionRef.current.isInteracting) {
      markerUpdateTaskRef.current = InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(apply);
      });
      return;
    }

    requestAnimationFrame(apply);
  }, [isVisualSyncPending, restaurants, shouldDisableMarkerViews, shouldHydrateResultsForRender]);
  const handleProfilerRender = React.useCallback<React.ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      if (shouldLogProfiler && actualDuration >= profilerMinMs) {
        // eslint-disable-next-line no-console
        logger.debug(
          `[SearchPerf] Profiler ${id} ${phase} actual=${actualDuration.toFixed(
            1
          )}ms base=${baseDuration.toFixed(1)}ms`
        );
      }
      const shouldRecordProfilerAttribution =
        JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MODE && searchMode === 'shortcut';
      const shouldEmitProfilerSpanLog =
        JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MODE && searchMode === 'shortcut';
      const shouldCaptureProfilerSpanForHarness = isShortcutPerfHarnessScenario;
      if (
        !shouldRecordProfilerAttribution &&
        !shouldEmitProfilerSpanLog &&
        !shouldCaptureProfilerSpanForHarness
      ) {
        return;
      }
      const activeRunNumber = getActiveShortcutRunNumber();
      if (activeRunNumber == null) {
        return;
      }
      const contributorBase = normalizeProfilerContributorId(id);
      if (
        shouldRecordProfilerAttribution &&
        actualDuration >= JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS
      ) {
        mapQueryBudget.recordRuntimeAttributionDurationMs(
          `profiler_render_${contributorBase}`,
          actualDuration
        );
      }
      if (Number.isFinite(startTime) && Number.isFinite(commitTime)) {
        const commitSpanMs = Math.max(0, commitTime - startTime);
        const stageHint = shouldHydrateResultsForRender
          ? 'results_hydration_commit'
          : isVisualSyncPending
          ? 'visual_sync_state'
          : isLoading
          ? 'results_list_materialization'
          : 'post_visual';
        recordProfilerSpan({
          id,
          phase,
          stageHint,
          actualDurationMs: Number(actualDuration.toFixed(3)),
          commitSpanMs: Number(commitSpanMs.toFixed(3)),
          startTimeMs: Number(startTime.toFixed(3)),
          commitTimeMs: Number(commitTime.toFixed(3)),
          nowMs: Number(getPerfNow().toFixed(3)),
          runNumber: activeRunNumber,
        });
        if (
          shouldRecordProfilerAttribution &&
          commitSpanMs >= JS_FLOOR_PROBE_PROFILER_ATTRIBUTION_MIN_MS
        ) {
          mapQueryBudget.recordRuntimeAttributionDurationMs(
            `profiler_commit_span_${contributorBase}`,
            commitSpanMs
          );
        }
        if (
          activeRunNumber === 1 &&
          commitSpanMs >= RUN_ONE_COMMIT_SPAN_PRESSURE_THRESHOLD_MS &&
          RUN_ONE_COMMIT_SPAN_PRESSURE_COMPONENT_IDS.has(id)
        ) {
          const handoffSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
          const operationId = handoffSnapshot.operationId;
          if (operationId && handoffSnapshot.phase !== 'idle') {
            const previousMaxCommitSpanMs =
              runOneCommitSpanPressureByOperationRef.current.get(operationId) ?? 0;
            const nextMaxCommitSpanMs = Math.max(previousMaxCommitSpanMs, commitSpanMs);
            if (nextMaxCommitSpanMs > previousMaxCommitSpanMs) {
              runOneCommitSpanPressureByOperationRef.current.set(operationId, nextMaxCommitSpanMs);
            }
            // Latch pressure once per operation to avoid coordinator churn during hot commit windows.
            if (previousMaxCommitSpanMs <= 0) {
              runOneHandoffCoordinatorRef.current.advancePhase(handoffSnapshot.phase, {
                operationId,
                commitSpanPressure: true,
                maxRun1CommitSpanMs: Number(nextMaxCommitSpanMs.toFixed(1)),
                commitSpanPressureComponent: id,
                commitSpanPressureDetectedAtMs: Number(getPerfNow().toFixed(1)),
              });
            }
          }
        }
        if (
          shouldEmitProfilerSpanLog &&
          (actualDuration >= JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS ||
            commitSpanMs >= JS_FLOOR_PROBE_PROFILER_SPAN_LOG_MIN_MS)
        ) {
          // eslint-disable-next-line no-console
          console.log(
            `[SearchPerf][Profiler] ${JSON.stringify({
              event: 'profiler_span',
              id,
              phase,
              stageHint,
              actualDurationMs: Number(actualDuration.toFixed(1)),
              commitSpanMs: Number(commitSpanMs.toFixed(1)),
              nowMs: Number(getPerfNow().toFixed(1)),
              runNumber: activeRunNumber,
              harnessRunId: shortcutHarnessRunId,
            })}`
          );
        }
      }
    },
    [
      getPerfNow,
      getActiveShortcutRunNumber,
      isShortcutPerfHarnessScenario,
      isLoading,
      isVisualSyncPending,
      mapQueryBudget,
      profilerMinMs,
      recordProfilerSpan,
      runOneHandoffCoordinatorRef,
      searchMode,
      shortcutHarnessRunId,
      shouldHydrateResultsForRender,
      shouldLogProfiler,
    ]
  );
  const resultsListKey = 'results';
  const searchStateSnapshot = React.useMemo(() => {
    const pollBoundsKey = (() => {
      if (!pollBounds) {
        return null;
      }
      const ne = pollBounds.northEast;
      const sw = pollBounds.southWest;
      if (!ne || !sw) {
        return null;
      }
      const parts = [ne.lat, ne.lng, sw.lat, sw.lng];
      if (parts.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        return null;
      }
      return `${ne.lat.toFixed(3)}:${ne.lng.toFixed(3)}:${sw.lat.toFixed(3)}:${sw.lng.toFixed(3)}`;
    })();
    return {
      overlay: activeOverlay,
      overlayParamsPollKey: overlayParams.polls
        ? `${overlayParams.polls.pollId ?? 'none'}:${overlayParams.polls.coverageKey ?? 'none'}`
        : null,
      panelVisible,
      sheetState,
      snapTo: resultsSheetSnapTo,
      shouldRenderSheet,
      isSearchOverlay,
      isSuggestionPanelActive,
      isSuggestionScreenActive,
      isSearchFocused,
      isSearchSessionActive,
      isLoading,
      isLoadingMore,
      isPaginationExhausted,
      currentPage,
      hasMoreFood,
      hasMoreRestaurants,
      activeTab,
      openNow,
      priceLevelsKey: priceLevels.join(','),
      votes100Plus,
      query,
      submittedQuery,
      mapCenterKey: mapCenter ? `${mapCenter[0].toFixed(4)},${mapCenter[1].toFixed(4)}` : null,
      mapZoom,
      mapMovedSinceSearch,
      resultsCounts: `${restaurants.length}:${dishes.length}`,
      resultsRequestId: results?.metadata?.requestId ?? null,
      resultsKey: resultsListKey,
      resultsSheetHeaderHeight,
      filtersHeaderHeight,
      pollBoundsKey,
      searchLayoutKey: `${searchLayout.top.toFixed(1)}:${searchLayout.height.toFixed(1)}`,
      bottomNavKey: `${navBarTop.toFixed(1)}:${navBarHeight.toFixed(1)}`,
      searchContainerKey: searchContainerFrame
        ? `${searchContainerFrame.x.toFixed(1)}:${searchContainerFrame.y.toFixed(
            1
          )}:${searchContainerFrame.width.toFixed(1)}:${searchContainerFrame.height.toFixed(1)}`
        : null,
      searchBarKey: searchBarFrame
        ? `${searchBarFrame.x.toFixed(1)}:${searchBarFrame.y.toFixed(
            1
          )}:${searchBarFrame.width.toFixed(1)}:${searchBarFrame.height.toFixed(1)}`
        : null,
      searchShortcutsKey:
        !shouldDisableSearchShortcuts && searchShortcutsFrame
          ? `${searchShortcutsFrame.x.toFixed(1)}:${searchShortcutsFrame.y.toFixed(
              1
            )}:${searchShortcutsFrame.width.toFixed(1)}:${searchShortcutsFrame.height.toFixed(1)}`
          : null,
      searchShortcutChipCount: shouldDisableSearchShortcuts
        ? 0
        : Object.keys(searchShortcutChipFrames).length,
      suggestionContentHeight,
      isSuggestionPanelVisible,
      pollsSheetSnap,
      pollsDockedSnapRequest,
      tabOverlaySnapRequest,
      bookmarksSheetSnap,
      profileSheetSnap,
      hasUserSharedSnap,
      sharedSnap: hasUserSharedSnap ? sharedSnap : null,
      saveSheetSnap,
      saveSheetVisible: saveSheetState.visible,
      saveSheetType: saveSheetState.listType,
      saveSheetTargetKey: saveSheetState.target
        ? `${saveSheetState.target.connectionId ?? 'none'}:${
            saveSheetState.target.restaurantId ?? 'none'
          }`
        : null,
      isFilterTogglePending,
      shouldSuspendResultsSheet,
    };
  }, [
    activeOverlay,
    overlayParams.polls,
    activeTab,
    bookmarksSheetSnap,
    currentPage,
    dishes.length,
    filtersHeaderHeight,
    hasMoreFood,
    hasMoreRestaurants,
    hasUserSharedSnap,
    isFilterTogglePending,
    isLoading,
    isLoadingMore,
    isPaginationExhausted,
    isSearchFocused,
    isSearchOverlay,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionScreenActive,
    isSuggestionPanelVisible,
    mapCenter,
    mapMovedSinceSearch,
    mapZoom,
    openNow,
    panelVisible,
    priceLevels,
    pollBounds,
    pollsSheetSnap,
    pollsDockedSnapRequest,
    tabOverlaySnapRequest,
    query,
    restaurants.length,
    results?.metadata?.requestId,
    resultsSheetHeaderHeight,
    resultsListKey,
    resultsSheetSnapTo,
    saveSheetSnap,
    saveSheetState.listType,
    saveSheetState.target,
    saveSheetState.visible,
    navBarHeight,
    navBarTop,
    searchBarFrame,
    searchContainerFrame,
    searchLayout.height,
    searchLayout.top,
    searchShortcutChipFrames,
    searchShortcutsFrame,
    sharedSnap,
    suggestionContentHeight,
    shouldRenderSheet,
    shouldSuspendResultsSheet,
    sheetState,
    submittedQuery,
    votes100Plus,
  ]);
  const searchStateRef = React.useRef(searchStateSnapshot);
  const suggestionOverlayDebugSnapshotRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!shouldLogSearchStateChanges) {
      searchStateRef.current = searchStateSnapshot;
      return;
    }
    const interactionState = searchInteractionRef.current;
    if (shouldLogSearchStateWhenSettlingOnly && !interactionState.isResultsSheetSettling) {
      searchStateRef.current = searchStateSnapshot;
      return;
    }
    const prev = searchStateRef.current;
    const next = searchStateSnapshot;
    const changed: string[] = [];
    (Object.keys(next) as Array<keyof typeof next>).forEach((key) => {
      if (!Object.is(prev[key], next[key])) {
        changed.push(key);
      }
    });
    if (changed.length) {
      // eslint-disable-next-line no-console
      logger.debug(
        `[SearchPerf] state changes ${changed.join(', ')} settle=${
          interactionState.isResultsSheetSettling
        }`
      );
    }
    searchStateRef.current = next;
  }, [searchStateSnapshot, shouldLogSearchStateChanges, shouldLogSearchStateWhenSettlingOnly]);
  const suggestionOverlayDebugSnapshot = React.useMemo(() => {
    if (!shouldLogSuggestionOverlayState) {
      return null;
    }
    const round = (value: number) => Math.round(value * 10) / 10;
    const roundMaybe = (value?: number) =>
      typeof value === 'number' ? Math.round(value * 10) / 10 : null;
    const formatFrame = (frame: LayoutRectangle | null) =>
      frame
        ? {
            x: round(frame.x),
            y: round(frame.y),
            width: round(frame.width),
            height: round(frame.height),
          }
        : null;
    const formatHole = (hole: MaskedHole) => ({
      x: round(hole.x),
      y: round(hole.y),
      width: round(hole.width),
      height: round(hole.height),
      borderRadius: roundMaybe(hole.borderRadius) ?? 0,
    });
    return {
      overlay: {
        isSearchOverlay,
        isSearchSessionActive,
        isSuggestionPanelActive,
        isSuggestionPanelVisible,
        isSuggestionClosing,
        isSuggestionLayoutWarm,
        isSuggestionScreenActive,
        isSuggestionScreenVisible,
        shouldDriveSuggestionLayout,
        shouldFreezeSuggestionHeader,
      },
      restaurantOverlay: {
        isRestaurantOverlayVisible,
        shouldRenderRestaurantOverlay,
        shouldShowRestaurantOverlay,
        shouldSuppressRestaurantOverlay,
        hasProfile: Boolean(restaurantProfile),
        restaurantId: restaurantProfile?.restaurant.restaurantId ?? null,
        profileTransitionStatus,
      },
      render: {
        shouldRenderSuggestionPanel,
        shouldShowSuggestionSurface,
        shouldShowSuggestionBackground,
        shouldRenderRecentSection,
        shouldRenderAutocompleteSection,
        shouldShowSearchShortcuts,
        shouldRenderSearchShortcuts,
        shouldUseSearchShortcutFrames,
        shouldForceHideShortcuts,
        shouldLockSearchChromeTransform,
      },
      holds: {
        shouldHoldAutocomplete,
        shouldHoldRecent,
        shouldHoldSuggestionPanel,
        shouldHoldSuggestionBackground,
      },
      query: {
        value: suggestionDisplayQuery,
        hasRawQuery,
        hasTypedQuery,
        hasSearchChromeRawQuery,
        rawValue: query,
      },
      layout: {
        searchLayout: {
          top: round(searchLayout.top),
          height: round(searchLayout.height),
        },
        searchContainerFrame: formatFrame(searchContainerFrame),
        searchBarFrame: formatFrame(searchBarFrame),
        searchShortcutsFrame: formatFrame(searchShortcutsFrame),
        resolvedSearchShortcutsFrame: formatFrame(resolvedSearchShortcutsFrame),
        suggestionHeaderContentBottom: roundMaybe(suggestionHeaderContentBottom),
        suggestionHeaderHeightTarget: roundMaybe(suggestionHeaderHeightTarget),
        suggestionScrollTopTarget: roundMaybe(suggestionScrollTopTarget),
        suggestionScrollMaxHeightTarget: roundMaybe(suggestionScrollMaxHeightTarget),
        suggestionTopFillHeight: roundMaybe(suggestionTopFillHeight),
        suggestionContentHeight: roundMaybe(suggestionContentHeight),
      },
      shortcuts: {
        chipFrameKeys: Object.keys(searchShortcutChipFrames),
        resolvedChipFrameKeys: Object.keys(resolvedSearchShortcutChipFrames),
      },
      holes: {
        suggestionHeaderHolesCount: suggestionHeaderHoles.length,
        resolvedSuggestionHeaderHolesCount: resolvedSuggestionHeaderHoles.length,
        suggestionHeaderHoles: suggestionHeaderHoles.map(formatHole),
        resolvedSuggestionHeaderHoles: resolvedSuggestionHeaderHoles.map(formatHole),
      },
      transition: {
        searchTransitionVariant,
      },
    };
  }, [
    hasRawQuery,
    hasSearchChromeRawQuery,
    hasTypedQuery,
    isSearchOverlay,
    isSearchSessionActive,
    isSuggestionLayoutWarm,
    isSuggestionClosing,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    isSuggestionScreenActive,
    isSuggestionScreenVisible,
    isRestaurantOverlayVisible,
    profileTransitionStatus,
    resolvedSearchShortcutChipFrames,
    resolvedSearchShortcutsFrame,
    resolvedSuggestionHeaderHoles,
    restaurantProfile,
    searchBarFrame,
    searchContainerFrame,
    searchLayout.height,
    searchLayout.top,
    searchShortcutChipFrames,
    searchShortcutsFrame,
    searchTransitionVariant,
    shouldDriveSuggestionLayout,
    shouldFreezeSuggestionHeader,
    shouldHoldAutocomplete,
    shouldHoldRecent,
    shouldHoldSuggestionBackground,
    shouldHoldSuggestionPanel,
    shouldLockSearchChromeTransform,
    shouldLogSuggestionOverlayState,
    shouldRenderRestaurantOverlay,
    shouldRenderAutocompleteSection,
    shouldRenderRecentSection,
    shouldRenderSearchShortcuts,
    shouldRenderSuggestionPanel,
    shouldShowSearchShortcuts,
    shouldShowSuggestionBackground,
    shouldShowSuggestionSurface,
    shouldForceHideShortcuts,
    shouldShowRestaurantOverlay,
    shouldSuppressRestaurantOverlay,
    shouldUseSearchShortcutFrames,
    suggestionContentHeight,
    suggestionDisplayQuery,
    suggestionHeaderContentBottom,
    suggestionHeaderHeightTarget,
    suggestionHeaderHoles,
    suggestionScrollMaxHeightTarget,
    suggestionScrollTopTarget,
    suggestionTopFillHeight,
    query,
  ]);
  React.useEffect(() => {
    if (!shouldLogSuggestionOverlayState || !suggestionOverlayDebugSnapshot) {
      suggestionOverlayDebugSnapshotRef.current = null;
      return;
    }
    const next = JSON.stringify(suggestionOverlayDebugSnapshot);
    if (next === suggestionOverlayDebugSnapshotRef.current) {
      return;
    }
    suggestionOverlayDebugSnapshotRef.current = next;
    // eslint-disable-next-line no-console
    logger.debug('[SearchOverlayDebug]', suggestionOverlayDebugSnapshot);
  }, [shouldLogSuggestionOverlayState, suggestionOverlayDebugSnapshot]);
  React.useEffect(() => {
    const shouldRunJsStallTicker = shouldLogJsStalls || JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE;
    if (!shouldRunJsStallTicker) {
      return;
    }
    const intervalMs = 100;
    const logIntervalMs = 500;
    let lastTick = getPerfNow();
    let lastLog = lastTick;
    let maxDrift = 0;
    let stallCount = 0;
    const activeStallMinMs = shouldLogJsStalls
      ? jsStallMinMs
      : JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MIN_MS;
    const handle = setInterval(() => {
      const now = getPerfNow();
      const drift = now - lastTick - intervalMs;
      if (drift > activeStallMinMs) {
        maxDrift = Math.max(maxDrift, drift);
        stallCount += 1;
      }
      if (stallCount > 0 && now - lastLog >= logIntervalMs) {
        const interactionState = searchInteractionRef.current;
        const runtimeMemory = readRuntimeMemoryDiagnostics();
        if (shouldLogJsStalls) {
          // eslint-disable-next-line no-console
          logger.debug(
            `[SearchPerf] JS stall max=${maxDrift.toFixed(1)}ms count=${stallCount} drag=${
              interactionState.isResultsSheetDragging
            } scroll=${interactionState.isResultsListScrolling} settle=${
              interactionState.isResultsSheetSettling
            }`,
            runtimeMemory ? { runtimeMemory } : undefined
          );
        }
        if (JS_FLOOR_PROBE_STALL_CONSOLE_LOG_MODE) {
          const activeRunNumber = getActiveShortcutRunNumber();
          const stageHint = shouldHydrateResultsForRender
            ? 'results_hydration_commit'
            : isVisualSyncPending
            ? 'visual_sync_state'
            : isLoading
            ? 'results_list_materialization'
            : 'post_visual';
          if (activeRunNumber != null) {
            // eslint-disable-next-line no-console
            console.log(
              `[SearchPerf][StallProbe] ${JSON.stringify({
                event: 'js_stall_probe',
                nowMs: Number(now.toFixed(1)),
                maxDriftMs: Number(maxDrift.toFixed(1)),
                stallCount,
                stageHint,
                isResultsSheetDragging: interactionState.isResultsSheetDragging,
                isResultsListScrolling: interactionState.isResultsListScrolling,
                isResultsSheetSettling: interactionState.isResultsSheetSettling,
                runtimeMemory,
                runNumber: activeRunNumber,
                harnessRunId: shortcutHarnessRunId,
              })}`
            );
          }
        }
        lastLog = now;
        maxDrift = 0;
        stallCount = 0;
      }
      lastTick = now;
    }, intervalMs);
    return () => clearInterval(handle);
  }, [
    getPerfNow,
    getActiveShortcutRunNumber,
    isLoading,
    isVisualSyncPending,
    jsStallMinMs,
    readRuntimeMemoryDiagnostics,
    shortcutHarnessRunId,
    shouldHydrateResultsForRender,
    shouldLogJsStalls,
  ]);
  const formatOnDemandEta = React.useCallback((etaMs?: number): string | null => {
    if (!etaMs || !Number.isFinite(etaMs) || etaMs <= 0) {
      return null;
    }
    const totalMinutes = Math.round(etaMs / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }
    const hours = Math.ceil(totalMinutes / 60);
    return hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
  }, []);
  const onDemandMessage = useMemo(() => {
    if (!results?.metadata?.onDemandQueued) {
      return null;
    }
    const term = submittedQuery?.trim() || results?.metadata?.sourceQuery?.trim() || '';
    const etaText = formatOnDemandEta(results?.metadata?.onDemandEtaMs);
    const prefix = term ? `We're expanding results for ${term}.` : `We're expanding results.`;
    const suffix = etaText ? ` Check back in ${etaText}.` : ' Check back soon.';
    return `${prefix}${suffix}`;
  }, [
    formatOnDemandEta,
    results?.metadata?.onDemandEtaMs,
    results?.metadata?.onDemandQueued,
    results?.metadata?.sourceQuery,
    submittedQuery,
  ]);
  const onDemandNotice = useMemo(() => {
    if (!onDemandMessage) {
      return null;
    }
    return (
      <View style={styles.onDemandNotice}>
        <Text variant="body" style={styles.onDemandNoticeText}>
          {onDemandMessage}
        </Text>
      </View>
    );
  }, [onDemandMessage]);

  const buildMarkerKey = React.useCallback(
    (feature: Feature<Point, RestaurantFeatureProperties>) =>
      feature.id?.toString() ?? `${feature.properties.restaurantId}-${feature.properties.rank}`,
    []
  );
  const markerCatalogReadModel = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const nextModel = buildMarkerCatalogReadModel({
      activeTab,
      dishes,
      markerRestaurants,
      scoreMode,
      restaurantOnlyId,
      selectedRestaurantId: overlaySelectedRestaurantId,
      canonicalRestaurantRankById,
      locationSelectionAnchor: resolveRestaurantLocationSelectionAnchor(),
      resolveRestaurantMapLocations,
      pickPreferredRestaurantMapLocation,
      getQualityColorFromScore,
    });
    if (shouldLogSearchComputes) {
      logSearchCompute(
        `markerCatalog total=${nextModel.catalog.length} primary=${nextModel.primaryCount} mode=${
          activeTab === 'dishes' ? 'dishes' : 'restaurants'
        }`,
        getPerfNow() - start
      );
    }
    return nextModel;
  }, [
    activeTab,
    canonicalRestaurantRankById,
    dishes,
    getPerfNow,
    getQualityColorFromScore,
    logSearchCompute,
    markerRestaurants,
    overlaySelectedRestaurantId,
    pickPreferredRestaurantMapLocation,
    resolveRestaurantLocationSelectionAnchor,
    resolveRestaurantMapLocations,
    restaurantOnlyId,
    scoreMode,
    shouldLogSearchComputes,
  ]);
  const markerCatalogEntries = markerCatalogReadModel.catalog;
  const selectedRestaurantId = overlaySelectedRestaurantId;
  const highlightedRestaurantId = mapHighlightedRestaurantId;
  const restaurantLabelStyle = React.useMemo<MapboxGL.SymbolLayerStyle>(() => {
    const secondaryTextSize = LABEL_TEXT_SIZE * 0.85;
    return {
      // For dish pins: show dish name + restaurant name on two lines
      // For restaurant pins: show just restaurant name
      textField: [
        'case',
        ['==', ['get', 'isDishPin'], true],
        // Dish pin: two-line label using format for different sizes
        [
          'format',
          ['coalesce', ['get', 'dishName'], ''],
          { 'font-scale': 1.0 },
          '\n',
          {},
          ['coalesce', ['get', 'restaurantName'], ''],
          { 'font-scale': secondaryTextSize / LABEL_TEXT_SIZE },
        ],
        // Restaurant pin: single line
        ['coalesce', ['get', 'restaurantName'], ''],
      ],
      textJustify: 'auto',
      textAllowOverlap: false,
      textOptional: false,
      textIgnorePlacement: false,
      textSize: LABEL_TEXT_SIZE,
      textFont: ['Open Sans Semibold', 'Arial Unicode MS Regular'],
      textColor: [
        'case',
        ['==', ['get', 'restaurantId'], highlightedRestaurantId ?? ''],
        ACTIVE_TAB_COLOR_DARK,
        '#374151',
      ],
      textHaloColor: 'rgba(255, 255, 255, 0.9)',
      textHaloWidth: 1.2,
      textHaloBlur: 0.9,
      symbolZOrder: 'viewport-y',
    };
    // Depend on the exported geometry constants so Fast Refresh picks up tuning changes without
    // requiring a full app reload.
  }, [ACTIVE_TAB_COLOR_DARK, LABEL_TEXT_SIZE, highlightedRestaurantId]);

  const {
    mapQueryBudget,
    markerCandidatesRef,
    visibleMarkerCandidates,
    recomputeVisibleCandidates,
  } = useMapPresentationController({
    markerCatalogEntries,
    searchMode,
    selectedRestaurantId,
    viewportBoundsService,
    buildMarkerKey,
    shouldLogSearchComputes,
    getPerfNow,
    logSearchCompute,
  });
  const {
    handleShortcutSearchCoverageSnapshot,
    resetShortcutCoverageState,
    isShortcutCoverageLoading,
    shortcutCoverageDotFeatures,
    anchoredShortcutCoverageFeatures,
    rankedShortcutCoverageFeatures,
    shortcutCoverageRankedRef,
  } = useShortcutCoverageOwner({
    searchMode,
    activeTab,
    scoreMode,
    isVisualSyncPending,
    searchRequestId: results?.metadata?.searchRequestId ?? null,
    viewportBoundsService,
    restaurantsById,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    getQualityColorFromScore,
  });
  const { lodPinnedMarkerMeta, lodPinnedMarkersRef, recomputeLodPinnedMarkers } = useMapDiffApplier(
    {
      searchMode,
      activeTab,
      selectedRestaurantId,
      scoreMode,
      markerCandidatesRef,
      shortcutCoverageRankedRef,
      mapGestureActiveRef,
      buildMarkerKey,
      mapQueryBudget,
      shouldLogSearchComputes,
      getPerfNow,
      logSearchCompute,
      maxPins: MAX_FULL_PINS,
      visibleCandidateBuffer: LOD_VISIBLE_CANDIDATE_BUFFER,
      stableMsMoving: LOD_PIN_TOGGLE_STABLE_MS_MOVING,
      stableMsIdle: LOD_PIN_TOGGLE_STABLE_MS_IDLE,
      offscreenStableMsMoving: LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING,
    }
  );

  React.useEffect(() => {
    recomputeLodPinnedMarkers(viewportBoundsService.getBounds());
  }, [
    activeTab,
    results?.metadata?.searchRequestId,
    searchMode,
    selectedRestaurantId,
    scoreMode,
    recomputeLodPinnedMarkers,
    viewportBoundsService,
  ]);
  React.useEffect(() => {
    if (searchMode !== 'shortcut' || selectedRestaurantId !== null) {
      return;
    }
    recomputeVisibleCandidates(viewportBoundsService.getBounds());
  }, [
    results?.metadata?.requestId,
    results?.metadata?.searchRequestId,
    searchMode,
    selectedRestaurantId,
    recomputeVisibleCandidates,
    viewportBoundsService,
  ]);

  const lodPinnedMarkerFeatureByKey = React.useMemo(() => {
    const map = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
    visibleMarkerCandidates.forEach((entry) => {
      map.set(buildMarkerKey(entry.feature), entry.feature);
    });
    if (searchMode === 'shortcut') {
      const shortcutFeatures = shortcutCoverageDotFeatures?.features ?? [];
      shortcutFeatures.forEach((feature) => {
        map.set(buildMarkerKey(feature), feature);
      });
    }
    return map;
  }, [buildMarkerKey, searchMode, shortcutCoverageDotFeatures?.features, visibleMarkerCandidates]);

  const lodSortedRestaurantMarkers = React.useMemo(() => {
    if (!lodPinnedMarkerMeta.length) {
      return [];
    }
    const fallbackByKey = new Map<string, Feature<Point, RestaurantFeatureProperties>>();
    lodPinnedMarkersRef.current.forEach((feature) => {
      fallbackByKey.set(buildMarkerKey(feature), feature);
    });

    return lodPinnedMarkerMeta
      .map(({ markerKey, lodZ }) => {
        const feature =
          fallbackByKey.get(markerKey) ?? lodPinnedMarkerFeatureByKey.get(markerKey) ?? null;
        if (!feature) {
          return null;
        }
        return {
          ...feature,
          properties: {
            ...feature.properties,
            lodZ,
          },
        };
      })
      .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;
  }, [buildMarkerKey, lodPinnedMarkerFeatureByKey, lodPinnedMarkerMeta]);

  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      return;
    }
    recomputeLodPinnedMarkers(viewportBoundsService.getBounds());
  }, [
    rankedShortcutCoverageFeatures,
    recomputeLodPinnedMarkers,
    searchMode,
    viewportBoundsService,
  ]);

  const dotRestaurantFeatures = React.useMemo<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(() => {
    if (searchMode === 'shortcut') {
      const coverageFeatureCollection =
        anchoredShortcutCoverageFeatures ?? shortcutCoverageDotFeatures;
      const shortcutFeatures = coverageFeatureCollection?.features ?? [];
      if (shortcutFeatures.length > 0) {
        if (shortcutFeatures.length <= MAX_SHORTCUT_DOT_FEATURES) {
          return coverageFeatureCollection;
        }
        return {
          ...coverageFeatureCollection,
          features: shortcutFeatures.slice(0, MAX_SHORTCUT_DOT_FEATURES),
        };
      }
      return null;
    }
    const features = visibleMarkerCandidates.map((entry) => entry.feature);
    return features.length ? { type: 'FeatureCollection', features } : null;
  }, [
    anchoredShortcutCoverageFeatures,
    searchMode,
    shortcutCoverageDotFeatures,
    visibleMarkerCandidates,
  ]);
  const hasAnySearchResults =
    (results?.dishes?.length ?? 0) > 0 || (results?.restaurants?.length ?? 0) > 0;
  const shouldHoldMapMarkerReveal =
    searchMode === 'shortcut' && (isVisualSyncPending || isShortcutCoverageLoading);
  const areSearchVisualsSettled = !isLoading && !isShortcutCoverageLoading;
  const shouldSignalMapVisualReady =
    isVisualSyncPending &&
    resultsVisualSyncCandidate != null &&
    (!hasAnySearchResults || areSearchVisualsSettled);
  const pinsRenderKey = React.useMemo(() => {
    const markerKeys = lodSortedRestaurantMarkers.map((feature) => buildMarkerKey(feature));
    return buildStableKeyFingerprint(markerKeys);
  }, [buildMarkerKey, lodSortedRestaurantMarkers]);
  const heldSortedRestaurantMarkersRef = React.useRef<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >(EMPTY_SORTED_RESTAURANT_MARKERS);
  const heldDotRestaurantFeaturesRef = React.useRef<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(null);
  const heldPinsRenderKeyRef = React.useRef('0:empty:empty:0');
  React.useEffect(() => {
    if (shouldHoldMapMarkerReveal) {
      return;
    }
    heldSortedRestaurantMarkersRef.current = lodSortedRestaurantMarkers;
    heldDotRestaurantFeaturesRef.current = dotRestaurantFeatures;
    heldPinsRenderKeyRef.current = pinsRenderKey;
  }, [dotRestaurantFeatures, lodSortedRestaurantMarkers, pinsRenderKey, shouldHoldMapMarkerReveal]);
  const visibleSortedRestaurantMarkers = shouldHoldMapMarkerReveal
    ? heldSortedRestaurantMarkersRef.current
    : lodSortedRestaurantMarkers;
  const visibleDotRestaurantFeatures = shouldHoldMapMarkerReveal
    ? heldDotRestaurantFeaturesRef.current
    : dotRestaurantFeatures;
  const visibleRestaurantFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(
    () => ({
      type: 'FeatureCollection',
      features: visibleSortedRestaurantMarkers,
    }),
    [visibleSortedRestaurantMarkers]
  );
  const visiblePinsRenderKeyBase = shouldHoldMapMarkerReveal
    ? heldPinsRenderKeyRef.current
    : pinsRenderKey;
  const visiblePinsRenderKey = shouldHoldMapMarkerReveal
    ? `hold::${visiblePinsRenderKeyBase}`
    : visiblePinsRenderKeyBase;
  const visibleDotRenderKey = React.useMemo(() => {
    const dotFeatures = visibleDotRestaurantFeatures?.features ?? [];
    if (dotFeatures.length === 0) {
      return '0:empty:empty:0';
    }
    const dotKeys = dotFeatures.map((feature) => buildMarkerKey(feature));
    return buildStableKeyFingerprint(dotKeys);
  }, [buildMarkerKey, visibleDotRestaurantFeatures?.features]);
  const markersRenderKey = React.useMemo(
    () =>
      `${
        searchMode ?? 'none'
      }::${activeTab}::${scoreMode}::pins:${visiblePinsRenderKey}::dots:${visibleDotRenderKey}`,
    [activeTab, scoreMode, searchMode, visibleDotRenderKey, visiblePinsRenderKey]
  );
  // No sticky anchors; keep labels relative to pin geometry only.

  // Intentionally avoid auto-fitting the map when results change; keep user camera position.

  React.useEffect(() => {
    if (isSearchOverlay) {
      return;
    }
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
  }, [isSearchOverlay]);

  React.useEffect(() => {
    if (isSuggestionScreenActive) {
      dismissTransientOverlays();
    }
  }, [dismissTransientOverlays, isSuggestionScreenActive]);

  React.useEffect(() => {
    if (!results) {
      resetMapMoveFlag();
    }
  }, [resetMapMoveFlag, results]);
  React.useEffect(() => {
    if (!results) {
      setRestaurantOnlyId(null);
      return;
    }
    const intent = restaurantOnlySearchRef.current;
    if (!intent) {
      setRestaurantOnlyId(null);
      return;
    }
    const hasMatch = results.restaurants?.some((restaurant) => restaurant.restaurantId === intent);
    setRestaurantOnlyId(hasMatch ? intent : null);
  }, [results]);

  React.useEffect(() => {
    if (!panelVisible && isPriceSelectorVisible) {
      setIsPriceSelectorVisible(false);
    }
  }, [panelVisible, isPriceSelectorVisible]);

  React.useEffect(() => {
    if (!panelVisible && isRankSelectorVisible) {
      setIsRankSelectorVisible(false);
    }
  }, [panelVisible, isRankSelectorVisible]);

  React.useEffect(() => {
    if (!isPriceSelectorVisible) {
      setIsPriceSheetContentReady(false);
      return;
    }

    setIsPriceSheetContentReady(false);
    const raf = requestAnimationFrame(() => {
      setIsPriceSheetContentReady(true);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isPriceSelectorVisible]);

  const scrollResultsToTop = React.useCallback(() => {
    const listRef = resultsScrollRef.current;
    if (!listRef?.scrollToOffset) {
      return;
    }
    hasUserScrolledResultsRef.current = false;
    listRef.clearLayoutCacheOnUpdate?.();
    resultsScrollOffset.value = 0;
    requestAnimationFrame(() => {
      listRef.scrollToOffset({ offset: 0, animated: false });
    });
  }, [resultsScrollOffset]);
  const submitSearchRef = React.useRef<
    (
      options?: {
        preserveSheetState?: boolean;
        transitionFromDockedPolls?: boolean;
        scoreMode?: NaturalSearchRequest['scoreMode'];
        shortcutTargetTab?: 'dishes' | 'restaurants';
      },
      overrideQuery?: string
    ) => Promise<void>
  >(async () => undefined);
  const {
    isShortcutPerfHarnessScenario,
    emitRuntimeMechanismEvent,
    shortcutHarnessRunId,
    getActiveShortcutRunNumber,
    recordProfilerSpan,
  } = useShortcutHarnessObserver({
    getPerfNow,
    roundPerfValue,
    searchSessionController,
    submitSearchRef,
    scoreMode,
    setPreferredScoreMode,
    mapQueryBudget,
    searchMode,
    isSearchLoading,
    isLoadingMore,
    isVisualSyncPending,
    isShortcutCoverageLoading,
    shouldHoldMapMarkerReveal,
    shouldHydrateResultsForRender,
    isRunOneHandoffActive: isRun1HandoffActive,
    results,
    resultsRequestKey,
    visibleSortedRestaurantMarkersCount: visibleSortedRestaurantMarkers.length,
    visibleDotRestaurantFeaturesCount: visibleDotRestaurantFeatures?.features?.length ?? 0,
    searchInteractionRef,
    isSearchOverlay,
    isInitialCameraReady,
    runTimeoutMs: SHORTCUT_HARNESS_RUN_TIMEOUT_MS,
    settleQuietPeriodMs: SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS,
    profileHydrateRestaurantByIdRef,
    runtimeWorkSchedulerRef,
  });

  React.useEffect(() => {
    const activeRunNumber = getActiveShortcutRunNumber();
    if (activeRunNumber == null) {
      return;
    }
    emitRuntimeMechanismEvent('run_one_handoff_phase', {
      source: 'coordinator_snapshot',
      phase: runOneHandoffPhase,
      operationId: runOneHandoffSnapshotForRender.operationId,
      seq: runOneHandoffSnapshotForRender.seq,
      page: runOneHandoffSnapshotForRender.page,
      isRun1HandoffActive,
      isChromeDeferred,
      harnessRunId: shortcutHarnessRunId,
    });
  }, [
    emitRuntimeMechanismEvent,
    getActiveShortcutRunNumber,
    isChromeDeferred,
    isRun1HandoffActive,
    runOneHandoffPhase,
    runOneHandoffSnapshotForRender.operationId,
    runOneHandoffSnapshotForRender.page,
    runOneHandoffSnapshotForRender.seq,
    shortcutHarnessRunId,
  ]);
  const rootStateCommitSnapshotRef = React.useRef<{
    searchMode: 'natural' | 'shortcut' | null;
    isSearchSessionActive: boolean;
    isLoading: boolean;
    isAutocompleteSuppressed: boolean;
    rootOverlay: OverlayKey;
    activeOverlay: OverlayKey;
    isSearchOverlay: boolean;
    resultsRequestKey: string | null;
    resultsPage: number | null;
    shouldHydrateResultsForRender: boolean;
    isVisualSyncPending: boolean;
    shouldHoldMapMarkerReveal: boolean;
  } | null>(null);
  React.useEffect(() => {
    const snapshot = {
      searchMode,
      isSearchSessionActive,
      isLoading,
      isAutocompleteSuppressed,
      rootOverlay,
      activeOverlay,
      isSearchOverlay,
      resultsRequestKey,
      resultsPage,
      shouldHydrateResultsForRender,
      isVisualSyncPending,
      shouldHoldMapMarkerReveal,
    };
    const previous = rootStateCommitSnapshotRef.current;
    rootStateCommitSnapshotRef.current = snapshot;

    const activeRunNumber = getActiveShortcutRunNumber();
    if (activeRunNumber == null || previous == null) {
      return;
    }

    const changedKeys: string[] = [];
    (Object.keys(snapshot) as Array<keyof typeof snapshot>).forEach((key) => {
      if (snapshot[key] !== previous[key]) {
        changedKeys.push(key);
      }
    });
    if (changedKeys.length === 0) {
      return;
    }
    emitRuntimeMechanismEvent('runtime_write_span', {
      domain: 'root_state_commit',
      label: 'search_root_state_commit',
      operationId: runOneHandoffSnapshotForRender.operationId,
      phase: runOneHandoffSnapshotForRender.phase,
      changedKeys,
      snapshot,
    });
  }, [
    activeOverlay,
    emitRuntimeMechanismEvent,
    getActiveShortcutRunNumber,
    isAutocompleteSuppressed,
    isLoading,
    isSearchOverlay,
    isSearchSessionActive,
    isVisualSyncPending,
    resultsPage,
    resultsRequestKey,
    rootOverlay,
    runOneHandoffSnapshotForRender.operationId,
    runOneHandoffSnapshotForRender.phase,
    searchMode,
    shouldHoldMapMarkerReveal,
    shouldHydrateResultsForRender,
  ]);
  const visualSyncCommitSnapshotRef = React.useRef<{
    resultsVisualSyncCandidate: string | null;
    visualReadyRequestKey: string | null;
    markerRevealCommitId: number | null;
    isVisualSyncPending: boolean;
  } | null>(null);
  React.useEffect(() => {
    const snapshot = {
      resultsVisualSyncCandidate,
      visualReadyRequestKey,
      markerRevealCommitId,
      isVisualSyncPending,
    };
    const previous = visualSyncCommitSnapshotRef.current;
    visualSyncCommitSnapshotRef.current = snapshot;
    const activeRunNumber = getActiveShortcutRunNumber();
    if (activeRunNumber == null || previous == null) {
      return;
    }
    const operationId = runOneHandoffSnapshotForRender.operationId;
    const phase = runOneHandoffSnapshotForRender.phase;
    if (snapshot.resultsVisualSyncCandidate !== previous.resultsVisualSyncCandidate) {
      emitRuntimeMechanismEvent('runtime_write_span', {
        domain: 'visual_sync_state',
        label: 'visual_sync_candidate_commit',
        operationId,
        phase,
        source: visualSyncCandidateWriteSourceRef.current,
        requestKey: snapshot.resultsVisualSyncCandidate,
        previousRequestKey: previous.resultsVisualSyncCandidate,
        markerRevealCommitId: snapshot.markerRevealCommitId,
      });
      visualSyncCandidateWriteSourceRef.current = 'unknown';
    }
    if (snapshot.visualReadyRequestKey !== previous.visualReadyRequestKey) {
      emitRuntimeMechanismEvent('runtime_write_span', {
        domain: 'visual_sync_state',
        label: 'visual_ready_request_commit',
        operationId,
        phase,
        source: visualReadyWriteSourceRef.current,
        requestKey: snapshot.visualReadyRequestKey,
        previousRequestKey: previous.visualReadyRequestKey,
      });
      visualReadyWriteSourceRef.current = 'unknown';
    }
    if (snapshot.isVisualSyncPending !== previous.isVisualSyncPending) {
      emitRuntimeMechanismEvent('runtime_write_span', {
        domain: 'visual_sync_state',
        label: 'visual_sync_pending_flip',
        operationId,
        phase,
        isVisualSyncPending: snapshot.isVisualSyncPending,
        resultsVisualSyncCandidate: snapshot.resultsVisualSyncCandidate,
        visualReadyRequestKey: snapshot.visualReadyRequestKey,
      });
    }
  }, [
    emitRuntimeMechanismEvent,
    getActiveShortcutRunNumber,
    isVisualSyncPending,
    markerRevealCommitId,
    resultsVisualSyncCandidate,
    runOneHandoffSnapshotForRender.operationId,
    runOneHandoffSnapshotForRender.phase,
    visualReadyRequestKey,
  ]);

  const {
    submitSearch,
    runRestaurantEntitySearch,
    rerunActiveSearch,
    loadMoreResults,
    cancelActiveSearchRequest,
  } = useSearchSubmit({
    query,
    setQuery,
    isLoading,
    setIsLoading,
    isLoadingMore,
    setIsLoadingMore,
    results,
    setResults,
    submittedQuery,
    setSubmittedQuery,
    activeTab,
    preferredActiveTab,
    setActiveTab,
    hasActiveTabPreference,
    scoreMode,
    setHasMoreFood,
    setHasMoreRestaurants,
    currentPage,
    setCurrentPage,
    isPaginationExhausted,
    setIsPaginationExhausted,
    canLoadMore,
    setError,
    setIsSearchSessionActive,
    setSearchMode,
    setIsAutocompleteSuppressed,
    setShowSuggestions,
    showPanel: requestResultsSheetReveal,
    resetSheetToHidden,
    scrollResultsToTop,
    isSearchEditingRef,
    lastSearchRequestIdRef,
    lastAutoOpenKeyRef,
    openNow,
    priceLevels,
    votes100Plus,
    runSearch,
    cancelSearch,
    mapRef,
    latestBoundsRef,
    ensureUserLocation,
    userLocationRef,
    resetMapMoveFlag,
    loadRecentHistory,
    updateLocalRecentSearches: deferRecentSearchUpsert,
    isRestaurantOverlayVisibleRef,
    prepareShortcutSheetTransition,
    onPageOneResultsCommitted: handlePageOneResultsCommitted,
    onShortcutSearchCoverageSnapshot: handleShortcutSearchCoverageSnapshot,
    mapQueryBudget,
    runtimeSessionController: searchSessionController,
    runOneHandoffCoordinatorRef,
    runtimeWorkSchedulerRef,
    onRuntimeMechanismEvent: emitRuntimeMechanismEvent,
  });
  submitSearchRef.current = submitSearch;

  const loadMoreResultsRef = React.useRef(loadMoreResults);
  const canLoadMoreRef = React.useRef(canLoadMore);
  const searchModeRef = React.useRef(searchMode);
  const currentPageRef = React.useRef(currentPage);
  const isLoadingRef = React.useRef(isLoading);
  const isLoadingMoreRef = React.useRef(isLoadingMore);
  const lastLoadMorePageRef = React.useRef<number | null>(null);
  loadMoreResultsRef.current = loadMoreResults;
  canLoadMoreRef.current = canLoadMore;
  searchModeRef.current = searchMode;
  currentPageRef.current = currentPage;
  isLoadingRef.current = isLoading;
  isLoadingMoreRef.current = isLoadingMore;

  React.useEffect(() => {
    if (isLoadingMore) {
      return;
    }
    const lastRequestedPage = lastLoadMorePageRef.current;
    if (lastRequestedPage !== null && currentPage < lastRequestedPage) {
      lastLoadMorePageRef.current = null;
    }
  }, [currentPage, isLoadingMore]);

  const handleResultsEndReached = React.useCallback(
    (info?: { distanceFromEnd: number }) => {
      if (!hasUserScrolledResultsRef.current) {
        return;
      }
      if (
        info &&
        typeof info.distanceFromEnd === 'number' &&
        Number.isFinite(info.distanceFromEnd) &&
        info.distanceFromEnd > 0
      ) {
        return;
      }
      if (!allowLoadMoreForCurrentScrollRef.current) {
        return;
      }
      if (!canLoadMoreRef.current || isLoadingRef.current || isLoadingMoreRef.current) {
        return;
      }
      const nextPage = currentPageRef.current + 1;
      if (lastLoadMorePageRef.current === nextPage) {
        return;
      }
      allowLoadMoreForCurrentScrollRef.current = false;
      lastLoadMorePageRef.current = nextPage;
      if (shouldLogSearchStateChanges) {
        // eslint-disable-next-line no-console
        logger.debug(
          `[SearchPerf] endReached page=${currentPageRef.current} next=${nextPage} mode=${
            searchModeRef.current ?? 'none'
          }`
        );
      }
      loadMoreResultsRef.current(searchModeRef.current);
    },
    [shouldLogSearchStateChanges]
  );

  const shouldRetrySearchOnReconnectRef = React.useRef(false);
  React.useEffect(() => {
    if (!isOffline) {
      return;
    }
    if (!isSearchSessionActive || results || isLoading || isLoadingMore) {
      return;
    }
    shouldRetrySearchOnReconnectRef.current = true;
  }, [isOffline, isLoading, isLoadingMore, isSearchSessionActive, results]);

  React.useEffect(() => {
    if (isOffline) {
      return;
    }
    if (!shouldRetrySearchOnReconnectRef.current) {
      return;
    }
    if (!isSearchSessionActive || results || isLoading || isLoadingMore) {
      return;
    }

    const retryQuery = (submittedQuery || query).trim();
    if (!retryQuery) {
      shouldRetrySearchOnReconnectRef.current = false;
      return;
    }

    shouldRetrySearchOnReconnectRef.current = false;
    void submitSearch({ preserveSheetState: true }, retryQuery);
  }, [
    isOffline,
    isLoading,
    isLoadingMore,
    isSearchSessionActive,
    query,
    results,
    submitSearch,
    submittedQuery,
  ]);

  const handleTabChange = React.useCallback(
    (value: 'restaurants' | 'dishes') => {
      setPreferredActiveTab(value);
    },
    [setPreferredActiveTab]
  );

  const dismissSearchKeyboard = React.useCallback(() => {
    runOnUI(() => {
      'worklet';
      searchHeaderFocusProgress.value = 0;
    })();
    const input = inputRef.current;
    const wasFocused = Boolean(input?.isFocused?.());
    if (wasFocused) {
      input.blur();
    }
    requestAnimationFrame(() => {
      const stillFocused = Boolean(inputRef.current?.isFocused?.());
      if (stillFocused) {
        Keyboard.dismiss();
      }
    });
  }, [inputRef, searchHeaderFocusProgress]);

  const {
    isSuggestionScrollDismissing,
    handleSuggestionInteractionStart,
    handleSuggestionTouchStart,
    handleSuggestionInteractionEnd,
  } = useSuggestionInteractionController({
    inputRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    setIsSearchFocused,
    dismissSearchKeyboard,
    shouldLogPerf: false,
  });

  const handleSubmit = React.useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      captureSearchSessionOrigin();
    }
    ensureSearchOverlay();
    isSearchEditingRef.current = false;
    pendingResultsSheetRevealRef.current = false;
    allowSearchBlurExitRef.current = true;
    ignoreNextSearchBlurRef.current = true;
    suppressAutocompleteResults();
    if (isSuggestionPanelActive) {
      beginSubmitTransition();
    }
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    setIsAutocompleteSuppressed(true);
    dismissSearchKeyboard();
    resetFocusedMapState();
    setRestaurantOnlyIntent(null);
    void submitSearch({ transitionFromDockedPolls: shouldShowDockedPolls });
  }, [
    captureSearchSessionOrigin,
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    query,
    resetFocusedMapState,
    setRestaurantOnlyIntent,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    shouldShowDockedPolls,
    beginSubmitTransition,
    suppressAutocompleteResults,
    submitSearch,
  ]);

  const handleBestDishesHere = React.useCallback(() => {
    captureSearchSessionOrigin();
    ensureSearchOverlay();
    isSearchEditingRef.current = false;
    pendingResultsSheetRevealRef.current = false;
    allowSearchBlurExitRef.current = true;
    if (isSuggestionPanelActive) {
      beginSubmitTransition();
    }
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    dismissSearchKeyboard();
    resetFocusedMapState();
    setRestaurantOnlyIntent(null);
    void submitSearch(
      {
        transitionFromDockedPolls: shouldShowDockedPolls,
      },
      'Best dishes'
    );
  }, [
    captureSearchSessionOrigin,
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    resetFocusedMapState,
    submitSearch,
    setRestaurantOnlyIntent,
    setIsSuggestionPanelActive,
    setIsSearchFocused,
    shouldShowDockedPolls,
    beginSubmitTransition,
  ]);

  const handleBestRestaurantsHere = React.useCallback(() => {
    captureSearchSessionOrigin();
    ensureSearchOverlay();
    isSearchEditingRef.current = false;
    pendingResultsSheetRevealRef.current = false;
    allowSearchBlurExitRef.current = true;
    if (isSuggestionPanelActive) {
      beginSubmitTransition();
    }
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    dismissSearchKeyboard();
    resetFocusedMapState();
    setRestaurantOnlyIntent(null);
    void submitSearch(
      {
        transitionFromDockedPolls: shouldShowDockedPolls,
      },
      'Best restaurants'
    );
  }, [
    captureSearchSessionOrigin,
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    resetFocusedMapState,
    submitSearch,
    setRestaurantOnlyIntent,
    setIsSuggestionPanelActive,
    setIsSearchFocused,
    shouldShowDockedPolls,
    beginSubmitTransition,
  ]);

  const handleSearchThisArea = React.useCallback(() => {
    if (isSearchLoading || isLoadingMore || !results) {
      return;
    }
    resetFocusedMapState();
    setRestaurantOnlyIntent(null);
    resetMapMoveFlag();
    void rerunActiveSearch({
      searchMode,
      activeTab,
      submittedQuery,
      query,
      isSearchSessionActive,
      preserveSheetState: true,
    });
  }, [
    activeTab,
    isSearchLoading,
    isLoadingMore,
    isSearchSessionActive,
    query,
    results,
    resetFocusedMapState,
    resetMapMoveFlag,
    rerunActiveSearch,
    searchMode,
    setRestaurantOnlyIntent,
    submittedQuery,
  ]);

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
      captureSearchSessionOrigin();
      ensureSearchOverlay();
      isSearchEditingRef.current = false;
      pendingResultsSheetRevealRef.current = false;
      allowSearchBlurExitRef.current = true;
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      const typedPrefix = query;
      const nextQuery = match.name;
      const shouldDeferSuggestionClear = beginSubmitTransition();
      cancelAutocomplete();
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      setQuery(nextQuery);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      const matchType =
        match.matchType === 'query' || match.entityType === 'query' ? 'query' : 'entity';
      const submissionContext: Record<string, unknown> = {
        typedPrefix,
        matchType,
      };
      if (matchType === 'entity' && match.entityId && match.entityType) {
        submissionContext.selectedEntityId = match.entityId;
        submissionContext.selectedEntityType = match.entityType;
      }
      if (match.entityType === 'restaurant' && match.entityId) {
        pendingRestaurantSelectionRef.current = {
          restaurantId: match.entityId,
        };
        openRestaurantProfilePreviewRef.current?.(match.entityId, match.name);
      } else {
        pendingRestaurantSelectionRef.current = null;
      }
      setRestaurantOnlyIntent(
        match.entityType === 'restaurant' && match.entityId ? match.entityId : null
      );
      void submitSearch(
        { submission: { source: 'autocomplete', context: submissionContext } },
        nextQuery
      );
    },
    [
      cancelAutocomplete,
      captureSearchSessionOrigin,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      query,
      submitSearch,
      beginSubmitTransition,
      setRestaurantOnlyIntent,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      suppressAutocompleteResults,
    ]
  );

  const handleCloseResultsUiReset = React.useCallback(() => {
    setIsNavRestorePending(true);
    setSearchHeaderActionModeOverride('follow-collapse');
    setPollsHeaderActionAnimationToken((current) => current + 1);
  }, []);

  const cancelPendingMutationWorkRef = React.useRef<() => void>(() => {});
  const handleCancelPendingMutationWork = React.useCallback(() => {
    cancelPendingMutationWorkRef.current();
  }, []);

  const { clearSearchState, handleClear, handleCloseResults } = useSearchClearController({
    isRestaurantOverlayVisible,
    isSearchSessionActive,
    results,
    submittedQuery,
    isSearchLoading,
    isLoadingMore,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    inputRef,
    ignoreNextSearchBlurRef,
    profileDismissBehaviorRef,
    shouldClearSearchOnProfileDismissRef,
    isClearingSearchRef,
    closeRestaurantProfileRef,
    lodPinnedMarkersRef,
    lastAutoOpenKeyRef,
    restaurantFocusSessionRef,
    searchSessionQueryRef,
    beginSearchCloseRestore,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
    cancelActiveSearchRequest,
    cancelAutocomplete,
    cancelPendingMutationWork: handleCancelPendingMutationWork,
    resetSubmitTransitionHold,
    resetFilters,
    resetFocusedMapState,
    resetMapMoveFlag,
    resetSheetToHidden,
    recomputeLodPinnedMarkers,
    scrollResultsToTop,
    setRestaurantOnlyIntent,
    setSearchTransitionVariant,
    shortcutContentFadeMode,
    shortcutFadeDefault: SHORTCUT_CONTENT_FADE_DEFAULT,
    setSearchShortcutsFadeResetKey,
    setIsFilterTogglePending,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed,
    setShowSuggestions,
    setQuery,
    setResults,
    setMarkerRestaurants,
    setSubmittedQuery,
    setError,
    setSuggestions,
    setIsSearchSessionActive,
    setSearchMode,
    setHasMoreFood,
    setHasMoreRestaurants,
    setCurrentPage,
    setIsLoadingMore,
    setIsPaginationExhausted,
    resetShortcutCoverageState,
    onCloseResultsUiReset: handleCloseResultsUiReset,
    emptyRestaurants: EMPTY_RESTAURANTS,
  });
  clearSearchStateRef.current = clearSearchState;

  const { handleSearchFocus, handleSearchBlur, handleSearchBack } = useSearchFocusController({
    inputRef,
    isSuggestionPanelActive,
    isSearchSessionActive,
    isRestaurantOverlayVisible,
    isSearchLoading,
    showPollsOverlay,
    query,
    shouldShowSearchShortcuts,
    isSearchEditingRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    cancelSearchEditOnBackRef,
    restoreHomeOnSearchBackRef,
    searchSessionQueryRef,
    pendingResultsSheetRevealRef,
    shortcutContentFadeMode,
    shortcutFadeDefault: SHORTCUT_CONTENT_FADE_DEFAULT,
    shortcutFadeHold: SHORTCUT_CONTENT_FADE_HOLD,
    captureSearchSessionQuery,
    dismissTransientOverlays,
    allowAutocompleteResults,
    suppressAutocompleteResults,
    beginSuggestionCloseHold,
    flushPendingResultsSheetReveal,
    cancelAutocomplete,
    restoreDockedPolls,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed,
    setShowSuggestions,
    setSuggestions,
    setQuery,
  });

  const {
    handleRecentSearchPress,
    handleRecentlyViewedRestaurantPress,
    handleRecentlyViewedFoodPress,
  } = useRecentSearchActions({
    isSearchEditingRef,
    pendingResultsSheetRevealRef,
    allowSearchBlurExitRef,
    ignoreNextSearchBlurRef,
    pendingRestaurantSelectionRef,
    openRestaurantProfilePreviewRef,
    beginSubmitTransition,
    captureSearchSessionOrigin,
    ensureSearchOverlay,
    suppressAutocompleteResults,
    cancelAutocomplete,
    dismissSearchKeyboard,
    resetFocusedMapState,
    setRestaurantOnlyIntent,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setQuery,
    deferRecentSearchUpsert,
    runRestaurantEntitySearch,
    submitSearch,
  });

  const resetSearchHeaderFocusProgress = React.useCallback(() => {
    runOnUI(() => {
      'worklet';
      searchHeaderFocusProgress.value = 0;
    })();
  }, [searchHeaderFocusProgress]);

  const { handleRecentViewMorePress, handleRecentlyViewedMorePress } = useSearchViewMoreController({
    inputRef,
    ignoreNextSearchBlurRef,
    allowSearchBlurExitRef,
    cancelAutocomplete,
    resetSubmitTransitionHold,
    resetSearchHeaderFocusProgress,
    searchIntentFromParams: route.params?.searchIntent ?? null,
    clearSearchIntentParam: () => {
      navigation.setParams({ searchIntent: undefined });
    },
    openRecentSearches: () => {
      navigation.push('RecentSearches', { userLocation });
    },
    openRecentlyViewed: () => {
      navigation.push('RecentlyViewed', { userLocation });
    },
    onRecentSearchPress: handleRecentSearchPress,
    onRecentlyViewedRestaurantPress: handleRecentlyViewedRestaurantPress,
    onRecentlyViewedFoodPress: handleRecentlyViewedFoodPress,
    setSearchTransitionVariant,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setIsSuggestionLayoutWarm,
    setShowSuggestions,
    setSuggestions,
  });

  const {
    handleMapPress,
    handleCameraChanged,
    handleMapIdle,
    handleMapTouchStart,
    handleMapTouchEnd,
  } = useMapInteractionController({
    shouldLogMapEventRates,
    mapEventLogIntervalMs,
    shouldLogSearchStateChanges,
    lodCameraThrottleMs: LOD_CAMERA_THROTTLE_MS,
    searchInteractionRef,
    anySheetDraggingRef,
    mapGestureActiveRef,
    suppressMapMovedRef,
    shouldRenderResultsSheetRef,
    pendingMarkerOpenAnimationFrameRef,
    allowSearchBlurExitRef,
    suppressAutocompleteResults,
    dismissSearchKeyboard,
    beginSuggestionCloseHold,
    isSearchSessionActive,
    isRestaurantOverlayVisible,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setMapHighlightedRestaurantId,
    cancelAutocomplete,
    cameraIntentArbiter,
    viewportBoundsService,
    recomputeLodPinnedMarkers,
    cancelMapUpdateTimeouts,
    markMapMovedIfNeeded,
    scheduleMapIdleReveal,
    sheetState,
    isSearchOverlay,
    hasResults: Boolean(results),
    shouldDisableResultsSheetInteraction,
    animateSheetTo,
    shouldShowPollsSheet,
    schedulePollBoundsUpdate,
    commitCameraViewport,
    lastCameraStateRef,
    lastPersistedCameraRef,
  });

  const {
    togglePriceSelector,
    toggleVotesFilter,
    toggleOpenNow,
    closePriceSelector,
    dismissPriceSelector,
    commitRankSelection,
    closeRankSelector,
    dismissRankSelector,
    toggleRankSelector,
    handlePriceDone,
    cancelPendingMutationWork,
  } = useQueryMutationOrchestrator({
    searchMode,
    activeTab,
    submittedQuery,
    query,
    isSearchSessionActive,
    scoreMode,
    pendingPriceRange,
    setPendingPriceRange,
    pendingScoreMode,
    setPendingScoreMode,
    isPriceSelectorVisible,
    setIsPriceSelectorVisible,
    isRankSelectorVisible,
    setIsRankSelectorVisible,
    priceLevels,
    setVotes100Plus,
    setOpenNow,
    setPriceLevels,
    setPreferredScoreMode,
    setIsFilterTogglePending,
    rerunActiveSearch,
    priceSheetRef,
    rankSheetRef,
    minimumVotesFilter: MINIMUM_VOTES_FILTER,
    onMechanismEvent: emitRuntimeMechanismEvent,
  });
  cancelPendingMutationWorkRef.current = cancelPendingMutationWork;

  React.useEffect(() => {
    return registerTransientDismissor(() => {
      closePriceSelector();
      closeRankSelector();
      closeScoreInfo();
    });
  }, [closePriceSelector, closeRankSelector, closeScoreInfo, registerTransientDismissor]);

  const handleRankDone = React.useCallback(() => {
    commitRankSelection();
  }, [commitRankSelection]);

  const recordRestaurantView = React.useCallback(
    async (
      restaurantId: string,
      source: 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete' | 'dish_card'
    ) => {
      if (!isSignedIn) {
        return;
      }
      if (source === 'autocomplete' || source === 'dish_card') {
        return;
      }
      try {
        await searchService.recordRestaurantView({
          restaurantId,
          searchRequestId: lastSearchRequestIdRef.current ?? undefined,
          source,
        });
      } catch (err) {
        logger.warn('Unable to record restaurant view', {
          message: err instanceof Error ? err.message : 'unknown error',
          restaurantId,
          source,
        });
      }
    },
    [isSignedIn]
  );

  const {
    clearCameraPersistTimeout,
    clearCameraStateSync,
    scheduleCameraCommand,
    commitCameraState,
    scheduleCameraStateCommit,
    clearProfileTransitionLock,
    setProfileTransitionStatus,
    ensureProfileTransitionSnapshot,
    resolveProfileCameraPadding,
  } = useProfileCameraOrchestration({
    cameraPersistTimeoutRef,
    cameraStateSyncTimeoutRef,
    cameraCommandFrameRef,
    profileTransitionTimeoutRef,
    profileTransitionRef,
    lastVisibleSheetStateRef,
    lastCameraStateRef,
    resultsScrollOffset,
    sheetTranslateY,
    snapPoints,
    sheetState,
    mapCenter,
    mapZoom,
    mapCameraPadding,
    setMapCameraPadding,
    setProfileTransitionStatusState,
    commitCameraViewport,
    searchBarTop,
    searchBarHeight: searchBarFrame?.height ?? 0,
    insetsTop: insets.top,
    navBarTop,
    screenHeight: SCREEN_HEIGHT,
    profilePinTargetCenterRatio: PROFILE_PIN_TARGET_CENTER_RATIO,
    profilePinMinVisibleHeight: PROFILE_PIN_MIN_VISIBLE_HEIGHT,
    profileTransitionLockMs: PROFILE_TRANSITION_LOCK_MS,
    profileCameraAnimationMs: PROFILE_CAMERA_ANIMATION_MS,
    fitBoundsSyncBufferMs: FIT_BOUNDS_SYNC_BUFFER_MS,
    fallbackCenter: USA_FALLBACK_CENTER,
    fallbackZoom: USA_FALLBACK_ZOOM,
  });

  const profileRuntimeController = useProfileRuntimeController({
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
    fitBoundsSyncBufferMs: FIT_BOUNDS_SYNC_BUFFER_MS,
    profileCameraAnimationMs: PROFILE_CAMERA_ANIMATION_MS,
    profileRestoreAnimationMs: PROFILE_RESTORE_ANIMATION_MS,
    profileMultiLocationZoomOutDelta: PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA,
    profileMultiLocationMinZoom: PROFILE_MULTI_LOCATION_MIN_ZOOM,
    restaurantFocusCenterEpsilon: RESTAURANT_FOCUS_CENTER_EPSILON,
    restaurantFocusZoomEpsilon: RESTAURANT_FOCUS_ZOOM_EPSILON,
  });
  profileHydrateRestaurantByIdRef.current = profileRuntimeController.hydrateRestaurantProfileById;
  openRestaurantProfilePreviewRef.current = profileRuntimeController.openRestaurantProfilePreview;
  closeRestaurantProfileRef.current = profileRuntimeController.closeRestaurantProfile;

  const profileOpenRestaurantFromResultsRef = React.useRef(
    profileRuntimeController.openRestaurantProfileFromResults
  );
  profileOpenRestaurantFromResultsRef.current =
    profileRuntimeController.openRestaurantProfileFromResults;

  const stableOpenRestaurantProfileFromResults = React.useCallback(
    (
      restaurant: RestaurantResult,
      foodResultsOverride?: FoodResult[],
      source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
    ) => {
      profileOpenRestaurantFromResultsRef.current(restaurant, foodResultsOverride, source);
    },
    []
  );
  const { handleMarkerPress } = useMarkerInteractionController({
    anchoredShortcutCoverageFeatures,
    restaurants,
    setMapHighlightedRestaurantId,
    pendingMarkerOpenAnimationFrameRef,
    forceRestaurantProfileMiddleSnapRef,
    profileRuntimeController,
  });
  const handleMapVisualReady = React.useCallback(
    (requestKey: string) => {
      markVisualRequestReady(requestKey, 'map_visual_ready');
    },
    [markVisualRequestReady]
  );
  type MarkerRevealSettledPayload = {
    requestKey: string;
    markerRevealCommitId: number | null;
    settledAtMs: number;
  };
  const pendingMarkerRevealSettledRef = React.useRef<{
    operationId: string;
    payload: MarkerRevealSettledPayload;
  } | null>(null);
  const flushPendingMarkerRevealSettled = React.useCallback((): boolean => {
    const pending = pendingMarkerRevealSettledRef.current;
    if (!pending) {
      return false;
    }
    const coordinatorSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
    const operationId = coordinatorSnapshot.operationId;
    if (!operationId || coordinatorSnapshot.phase === 'idle') {
      pendingMarkerRevealSettledRef.current = null;
      return false;
    }
    if (operationId !== pending.operationId) {
      pendingMarkerRevealSettledRef.current = null;
      return false;
    }
    if (
      coordinatorSnapshot.phase !== 'h2_marker_reveal' &&
      coordinatorSnapshot.phase !== 'h3_hydration_ramp'
    ) {
      return false;
    }
    // Clear before advancePhase to avoid synchronous subscriber re-entry loops.
    pendingMarkerRevealSettledRef.current = null;
    const accepted = runOneHandoffCoordinatorRef.current.advancePhase(coordinatorSnapshot.phase, {
      operationId,
      markerRevealSettled: true,
      markerRevealSettledAtMs: pending.payload.settledAtMs,
      markerRevealCommitId: pending.payload.markerRevealCommitId,
      requestKey: pending.payload.requestKey,
    });
    if (!accepted) {
      pendingMarkerRevealSettledRef.current = pending;
      return false;
    }
    emitRuntimeMechanismEvent('marker_reveal_settled', {
      operationId,
      seq: coordinatorSnapshot.seq,
      page: coordinatorSnapshot.page,
      phase: coordinatorSnapshot.phase,
      requestKey: pending.payload.requestKey,
      markerRevealCommitId: pending.payload.markerRevealCommitId,
    });
    return true;
  }, [emitRuntimeMechanismEvent, runOneHandoffCoordinatorRef]);
  React.useEffect(() => {
    return runOneHandoffCoordinatorRef.current.subscribe(() => {
      flushPendingMarkerRevealSettled();
    });
  }, [flushPendingMarkerRevealSettled, runOneHandoffCoordinatorRef]);
  const handleMarkerRevealSettled = React.useCallback(
    (payload: MarkerRevealSettledPayload) => {
      // Keep visual-sync from stalling behind map transition churn once reveal is settled.
      const shouldAcknowledgeVisualReady =
        payload.requestKey.length > 0 &&
        isVisualSyncPending &&
        resultsVisualSyncCandidate === payload.requestKey;
      if (shouldAcknowledgeVisualReady) {
        const scheduleVisualReadyAck = () => {
          markVisualRequestReady(payload.requestKey, 'marker_reveal_settled_raf');
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            scheduleVisualReadyAck();
          });
        } else {
          setTimeout(() => {
            scheduleVisualReadyAck();
          }, 0);
        }
      }
      const coordinatorSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
      const operationId = coordinatorSnapshot.operationId;
      if (!operationId || coordinatorSnapshot.phase === 'idle') {
        pendingMarkerRevealSettledRef.current = null;
        return;
      }
      pendingMarkerRevealSettledRef.current = {
        operationId,
        payload,
      };
      flushPendingMarkerRevealSettled();
    },
    [
      flushPendingMarkerRevealSettled,
      isVisualSyncPending,
      markVisualRequestReady,
      resultsVisualSyncCandidate,
      runOneHandoffCoordinatorRef,
    ]
  );
  React.useEffect(() => {
    if (visualReadyFallbackTimeoutRef.current) {
      clearTimeout(visualReadyFallbackTimeoutRef.current);
      visualReadyFallbackTimeoutRef.current = null;
    }
    if (!shouldSignalMapVisualReady || !resultsVisualSyncCandidate) {
      return;
    }
    visualReadyFallbackTimeoutRef.current = setTimeout(() => {
      handleMarkerRevealSettled({
        requestKey: resultsVisualSyncCandidate,
        markerRevealCommitId,
        settledAtMs: getPerfNow(),
      });
      markVisualRequestReady(resultsVisualSyncCandidate, 'fallback_timeout');
      visualReadyFallbackTimeoutRef.current = null;
    }, RESULTS_VISUAL_READY_FALLBACK_MS);
  }, [
    getPerfNow,
    handleMarkerRevealSettled,
    markVisualRequestReady,
    markerRevealCommitId,
    resultsVisualSyncCandidate,
    shouldSignalMapVisualReady,
  ]);

  const stableMapHandlers = useStableMapHandlers({
    handleMapPress,
    handleCameraChanged,
    handleMapIdle,
    handleMapLoaded,
    handleMarkerPress,
    handleMapVisualReady,
    handleMarkerRevealSettled,
  });
  const stableHandleMapPress = stableMapHandlers.onMapPress;
  const stableHandleCameraChanged = stableMapHandlers.onCameraChanged;
  const stableHandleMapIdle = stableMapHandlers.onMapIdle;
  const stableHandleMapLoaded = stableMapHandlers.onMapLoaded;
  const stableHandleMarkerPress = stableMapHandlers.onMarkerPress;
  const stableHandleMapVisualReady = stableMapHandlers.onMapVisualReady;
  const stableHandleMarkerRevealSettled = stableMapHandlers.onMarkerRevealSettled;

  useProfileAutoOpenController({
    results,
    isSuggestionPanelActive,
    isSearchFocused,
    pendingRestaurantSelectionRef,
    submittedQuery,
    trimmedQuery,
    isRestaurantOverlayVisible,
    restaurantProfile,
    restaurantProfileCacheRef,
    restaurantOverlayDismissHandledRef,
    setRestaurantProfile,
    setRestaurantOverlayVisible,
    profileRuntimeController,
    lastAutoOpenKeyRef,
  });

  React.useEffect(() => {
    if (!isSearchOverlay && saveSheetState.visible) {
      handleCloseSaveSheet();
    }
  }, [handleCloseSaveSheet, isSearchOverlay, saveSheetState.visible]);

  const primaryCoverageKey = results?.metadata?.coverageKey ?? null;
  const hasCrossCoverage = React.useMemo(() => {
    const coverageKeys = new Set<string>();
    dishes.forEach((dish) => {
      if (dish.coverageKey) {
        coverageKeys.add(dish.coverageKey);
      }
    });
    restaurants.forEach((restaurant) => {
      if (restaurant.coverageKey) {
        coverageKeys.add(restaurant.coverageKey);
      }
    });
    return coverageKeys.size > 1;
  }, [dishes, restaurants]);

  const restaurantQualityColorByIdRef = React.useRef<Map<string, string>>(new Map());
  const dishQualityColorByConnectionIdRef = React.useRef<Map<string, string>>(new Map());
  const restaurantQualityColorById = React.useMemo(() => {
    const map = new Map<string, string>();
    restaurants.forEach((restaurant) => {
      map.set(restaurant.restaurantId, getMarkerColorForRestaurant(restaurant, scoreMode));
    });
    return map;
  }, [restaurants, scoreMode]);
  const dishQualityColorByConnectionId = React.useMemo(() => {
    const map = new Map<string, string>();
    dishes.forEach((dish) => {
      map.set(dish.connectionId, getMarkerColorForDish(dish, scoreMode));
    });
    return map;
  }, [dishes, scoreMode]);
  restaurantQualityColorByIdRef.current = restaurantQualityColorById;
  dishQualityColorByConnectionIdRef.current = dishQualityColorByConnectionId;

  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => {
      const restaurantForDish = restaurantsById.get(item.restaurantId);
      const isLiked = false;
      const qualityColor =
        dishQualityColorByConnectionIdRef.current.get(item.connectionId) ??
        getMarkerColorForDish(item, scoreMode);
      return (
        <DishResultCard
          item={item}
          index={index}
          qualityColor={qualityColor}
          isLiked={isLiked}
          scoreMode={scoreMode}
          primaryCoverageKey={primaryCoverageKey}
          showCoverageLabel={hasCrossCoverage}
          restaurantForDish={restaurantForDish}
          onSavePress={getDishSaveHandler(item.connectionId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
        />
      );
    },
    [
      getDishSaveHandler,
      hasCrossCoverage,
      scoreMode,
      stableOpenRestaurantProfileFromResults,
      openScoreInfo,
      primaryCoverageKey,
      restaurantsById,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (restaurant: RestaurantResult, index: number) => {
      const isLiked = false;
      const rank = canonicalRestaurantRankById.get(restaurant.restaurantId);
      if (typeof rank !== 'number') {
        return null;
      }
      const qualityColor =
        restaurantQualityColorByIdRef.current.get(restaurant.restaurantId) ??
        getMarkerColorForRestaurant(restaurant, scoreMode);
      return (
        <RestaurantResultCard
          restaurant={restaurant}
          index={index}
          rank={rank}
          qualityColor={qualityColor}
          isLiked={isLiked}
          scoreMode={scoreMode}
          primaryCoverageKey={primaryCoverageKey}
          showCoverageLabel={hasCrossCoverage}
          onSavePress={getRestaurantSaveHandler(restaurant.restaurantId)}
          openRestaurantProfile={stableOpenRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
          primaryFoodTerm={primaryFoodTerm}
        />
      );
    },
    [
      getRestaurantSaveHandler,
      hasCrossCoverage,
      scoreMode,
      stableOpenRestaurantProfileFromResults,
      openScoreInfo,
      primaryFoodTerm,
      primaryCoverageKey,
      canonicalRestaurantRankById,
    ]
  );

  const shouldRetrySearchOnReconnect = shouldRetrySearchOnReconnectRef.current;
  const runOneCommitSpanPressureActive =
    isRun1HandoffActive && runOneHandoffSnapshotForRender.metadata.commitSpanPressure === true;
  const isRunOneHeavyFinalizeDeferred =
    isRunOneChromeFreezeActive || (isRun1HandoffActive && runOneCommitSpanPressureActive);
  const searchResultsPanelSpecArgs = {
    results,
    resultsHydrationKey,
    hydratedResultsKey,
    activeTab,
    rankButtonLabelText,
    rankButtonIsActive,
    priceButtonLabelText,
    priceButtonIsActive,
    openNow,
    votesFilterActive,
    isRankSelectorVisible,
    isPriceSelectorVisible,
    handleTabChange,
    toggleRankSelector,
    toggleOpenNow,
    toggleVotesFilter,
    togglePriceSelector,
    shouldDisableSearchBlur,
    searchFiltersLayoutCacheRef,
    handleSearchFiltersLayoutCache,
    didSearchSessionJustActivate,
    isInitialResultsLoadPending,
    isSearchLoading,
    isFilterTogglePending,
    shouldDisableFiltersHeader,
    shouldDisableResultsHeader,
    resultsSheetHeaderHeight,
    filtersHeaderHeight,
    searchInteractionRef,
    resultsSheetHeaderHeightRef,
    filtersHeaderHeightRef,
    measureResultsHeaderNow,
    onResultsHeaderLayout,
    measureFiltersHeaderNow,
    onFiltersHeaderLayout,
    shouldRetrySearchOnReconnect,
    hasSystemStatusBanner,
    shouldUsePlaceholderRows,
    dishes,
    restaurants,
    shouldHydrateResultsForRender,
    isVisualSyncPending,
    runOneCommitSpanPressureActive,
    hydrationOperationId,
    allowHydrationFinalizeCommit: allowRunOneHydrationFinalizeCommit,
    isRunOneChromeDeferred: isRunOneHeavyFinalizeDeferred,
    mapQueryBudget,
    canLoadMore,
    isLoadingMore,
    onDemandNotice,
    snapPointsMiddle: snapPoints.middle,
    submittedQuery,
    handleCloseResults,
    overlayHeaderActionProgress,
    headerDividerAnimatedStyle,
    shouldLogResultsViewability,
    renderDishCard,
    renderRestaurantCard,
    activeOverlay,
    onRuntimeMechanismEvent: emitRuntimeMechanismEvent,
    setHydratedResultsKeySync,
    phaseBMaterializerRef,
    resultsWashAnimatedStyle,
    resultsContainerAnimatedStyle,
    resultsSheetVisibilityAnimatedStyle,
    shouldRenderResultsSheet,
    shouldDisableResultsSheetInteraction,
    snapPoints,
    sheetState,
    resultsSheetSnapTo,
    handleResultsSheetSnapStart,
    handleResultsListScrollBegin,
    handleResultsListScrollEnd,
    handleResultsListMomentumBegin,
    handleResultsListMomentumEnd,
    handleResultsSheetDragStateChange,
    handleResultsSheetSettlingChange,
    handleResultsEndReached,
    handleResultsSheetSnapChange,
    resetSheetToHidden,
    resultsScrollRef,
  };
  const searchThisAreaTop = Math.max(searchLayout.top + searchLayout.height + 12, insets.top + 12);
  const statusBarFadeHeightFallback = Math.max(0, insets.top + 16);
  const statusBarFadeHeight = Math.max(
    0,
    searchLayout.top > 0 ? searchLayout.top + 8 : statusBarFadeHeightFallback
  );

  const pollCreationParams = overlayParams.pollCreation;
  const { shouldShowPollCreationPanel, pollCreationPanelSpec } = usePollCreationPanelController({
    activeOverlay,
    pollCreationParams,
    setPollCreationSnapRequest,
    overlayRuntimeController,
    searchBarTop,
    snapPoints,
    pollCreationSnapRequest,
    handlePollCreationSnapChange,
  });

  const searchOverlayPanelsArgs = {
    pollCreationPanelSpec,
    shouldShowPollCreationPanel,
    showSaveListOverlay,
    shouldShowRestaurantOverlay,
    showProfileOverlay,
    showBookmarksOverlay,
    shouldShowPollsSheet,
    shouldRenderResultsSheet,
    isSearchOverlay,
    isSuggestionPanelActive,
    searchHeaderActionModeOverride,
    setSearchHeaderActionModeOverride,
    handleResultsSheetDragStateChange,
    handleResultsSheetSettlingChange,
    pollsPanelOptions: {
      visible: shouldShowPollsSheet,
      bounds: pollBounds,
      params: pollOverlayParams,
      initialSnapPoint: pollsOverlaySnapPoint,
      mode: pollsOverlayMode,
      currentSnap: pollsSheetSnap,
      navBarTop: navBarTopForSnaps,
      navBarHeight,
      searchBarTop,
      snapPoints,
      onSnapStart: handlePollsSnapStart,
      onSnapChange: handlePollsSnapChange,
      snapTo:
        pollsOverlayMode === 'overlay'
          ? tabOverlaySnapRequest
          : pollsDockedSnapRequest?.snap ?? null,
      snapToToken: pollsOverlayMode === 'overlay' ? undefined : pollsDockedSnapRequest?.token,
      onRequestReturnToSearch: requestReturnToSearchFromPolls,
      onRequestPollCreationExpand: requestPollCreationExpand,
      sheetY: sheetTranslateY,
      headerActionAnimationToken: pollsHeaderActionAnimationToken,
      headerActionProgress: overlayHeaderActionProgress,
      interactionRef: searchInteractionRef,
    },
    bookmarksPanelOptions: {
      visible: showBookmarksOverlay,
      navBarTop: navBarTopForSnaps,
      searchBarTop,
      snapPoints,
      sheetY: sheetTranslateY,
      headerActionProgress: overlayHeaderActionProgress,
      onSnapStart: handleBookmarksSnapStart,
      onSnapChange: handleBookmarksSnapChange,
      snapTo: tabOverlaySnapRequest,
    },
    profilePanelOptions: {
      visible: showProfileOverlay,
      navBarTop: navBarTopForSnaps,
      searchBarTop,
      snapPoints,
      sheetY: sheetTranslateY,
      headerActionProgress: overlayHeaderActionProgress,
      onSnapStart: handleProfileSnapStart,
      onSnapChange: handleProfileSnapChange,
      snapTo: tabOverlaySnapRequest,
    },
    restaurantPanelBaseOptions: {
      data: restaurantProfile,
      onDismiss: profileRuntimeController.handleRestaurantOverlayDismissed,
      onRequestClose: profileRuntimeController.handleRestaurantOverlayRequestClose,
      onToggleFavorite: handleRestaurantSavePress,
      navBarTop: navBarTopForSnaps,
      searchBarTop,
      interactionEnabled: shouldEnableRestaurantOverlayInteraction,
      containerStyle: restaurantOverlayAnimatedStyle,
    },
    restaurantSnapRequest,
    handleRestaurantOverlaySnapStart,
    handleRestaurantOverlaySnapChange,
    saveListPanelOptions: {
      visible: saveSheetState.visible,
      listType: saveSheetState.listType,
      target: saveSheetState.target,
      searchBarTop,
      onClose: handleCloseSaveSheet,
      onSnapChange: setSaveSheetSnap,
    },
  };
  const shouldFreezeRunOneChromeProps = isRunOneChromeFreezeActive || isRunOnePreflightFreezeActive;
  const shouldFreezeDeferredChromeProps = shouldFreezeRunOneChromeProps;
  const markerRevealCommitIdForRender =
    resultsVisualSyncCandidate != null ? markerRevealCommitId : null;
  const frozenMapTreePropsRef = React.useRef<{
    selectedRestaurantId: string | null;
    sortedRestaurantMarkers: typeof visibleSortedRestaurantMarkers;
    dotRestaurantFeatures: typeof visibleDotRestaurantFeatures;
    markersRenderKey: string;
    pinsRenderKey: string;
    markerRevealCommitId: number | null;
    visualReadyRequestKey: string | null;
    shouldSignalVisualReady: boolean;
    requireMarkerVisualsForVisualReady: boolean;
    restaurantFeatures: typeof visibleRestaurantFeatures;
  } | null>(null);
  const nextMapTreeProps = {
    selectedRestaurantId: highlightedRestaurantId,
    sortedRestaurantMarkers: visibleSortedRestaurantMarkers,
    dotRestaurantFeatures: visibleDotRestaurantFeatures,
    markersRenderKey,
    pinsRenderKey: visiblePinsRenderKey,
    markerRevealCommitId: markerRevealCommitIdForRender,
    visualReadyRequestKey: resultsVisualSyncCandidate,
    shouldSignalVisualReady: shouldSignalMapVisualReady,
    requireMarkerVisualsForVisualReady: !shouldHoldMapMarkerReveal,
    restaurantFeatures: visibleRestaurantFeatures,
  };
  if (!isRunOnePreflightFreezeActive) {
    frozenMapTreePropsRef.current = nextMapTreeProps;
  }
  const mapTreePropsForRender =
    isRunOnePreflightFreezeActive && frozenMapTreePropsRef.current
      ? frozenMapTreePropsRef.current
      : nextMapTreeProps;
  const frozenSuggestionSurfacePropsRef = React.useRef<{
    suggestionDisplaySuggestions: typeof suggestionDisplaySuggestions;
    recentSearchesDisplay: typeof recentSearchesDisplay;
    recentlyViewedRestaurantsDisplay: typeof recentlyViewedRestaurantsDisplay;
    recentlyViewedFoodsDisplay: typeof recentlyViewedFoodsDisplay;
    hasRecentSearchesDisplay: typeof hasRecentSearchesDisplay;
    hasRecentlyViewedRestaurantsDisplay: typeof hasRecentlyViewedRestaurantsDisplay;
    hasRecentlyViewedFoodsDisplay: typeof hasRecentlyViewedFoodsDisplay;
    isRecentLoadingDisplay: typeof isRecentLoadingDisplay;
    isRecentlyViewedLoadingDisplay: typeof isRecentlyViewedLoadingDisplay;
    isRecentlyViewedFoodsLoadingDisplay: typeof isRecentlyViewedFoodsLoadingDisplay;
  } | null>(null);
  const nextSuggestionSurfaceProps = {
    suggestionDisplaySuggestions,
    recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay,
    hasRecentSearchesDisplay,
    hasRecentlyViewedRestaurantsDisplay,
    hasRecentlyViewedFoodsDisplay,
    isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay,
  };
  if (!shouldFreezeDeferredChromeProps) {
    frozenSuggestionSurfacePropsRef.current = nextSuggestionSurfaceProps;
  }
  const suggestionSurfacePropsForRender = shouldFreezeDeferredChromeProps
    ? frozenSuggestionSurfacePropsRef.current ?? nextSuggestionSurfaceProps
    : nextSuggestionSurfaceProps;
  const shouldFreezeBottomNavDuringShortcutLoad =
    searchMode === 'shortcut' && (resultsPage == null || resultsPage === 1) && isSearchLoading;
  const shouldFreezeDeferredBottomNavProps =
    isRun1HandoffActive || shouldFreezeBottomNavDuringShortcutLoad;
  const frozenBottomNavPropsRef = React.useRef<{
    shouldHideBottomNav: boolean;
    shouldDisableSearchBlur: boolean;
    rootOverlay: OverlayKey | null;
    handleProfilePress: typeof handleProfilePress;
    handleOverlaySelect: typeof handleOverlaySelect;
  } | null>(null);
  const nextBottomNavProps = {
    shouldHideBottomNav,
    shouldDisableSearchBlur,
    rootOverlay,
    handleProfilePress,
    handleOverlaySelect,
  };
  if (!shouldFreezeDeferredBottomNavProps) {
    frozenBottomNavPropsRef.current = nextBottomNavProps;
  }
  const bottomNavPropsForRender = shouldFreezeDeferredBottomNavProps
    ? frozenBottomNavPropsRef.current ?? nextBottomNavProps
    : nextBottomNavProps;
  const frozenOverlayHeaderChromePropsRef = React.useRef<{
    shouldMountSearchShortcuts: typeof shouldMountSearchShortcuts;
    shouldRenderSearchShortcuts: typeof shouldRenderSearchShortcuts;
    searchShortcutsAnimatedStyle: typeof searchShortcutsAnimatedStyle;
    searchShortcutChipAnimatedStyle: typeof searchShortcutChipAnimatedStyle;
    searchShortcutContentAnimatedStyle: typeof searchShortcutContentAnimatedStyle;
    shouldShowSearchThisArea: typeof shouldShowSearchThisArea;
    searchThisAreaTop: typeof searchThisAreaTop;
    searchThisAreaAnimatedStyle: typeof searchThisAreaAnimatedStyle;
  } | null>(null);
  const nextOverlayHeaderChromeProps = {
    shouldMountSearchShortcuts,
    shouldRenderSearchShortcuts,
    searchShortcutsAnimatedStyle,
    searchShortcutChipAnimatedStyle,
    searchShortcutContentAnimatedStyle,
    shouldShowSearchThisArea,
    searchThisAreaTop,
    searchThisAreaAnimatedStyle,
  };
  if (!shouldFreezeDeferredChromeProps) {
    frozenOverlayHeaderChromePropsRef.current = nextOverlayHeaderChromeProps;
  }
  const overlayHeaderChromePropsForRender = shouldFreezeDeferredChromeProps
    ? frozenOverlayHeaderChromePropsRef.current ?? nextOverlayHeaderChromeProps
    : nextOverlayHeaderChromeProps;
  return (
    <React.Profiler id="SearchScreen" onRender={handleProfilerRender}>
      <View style={styles.container}>
        {isInitialCameraReady ? (
          <React.Profiler id="SearchMapTree" onRender={handleProfilerRender}>
            <SearchMap
              mapRef={mapRef}
              cameraRef={cameraRef}
              styleURL={mapStyleURL}
              scoreMode={scoreMode}
              mapCenter={mapCenter}
              mapZoom={mapZoom ?? USA_FALLBACK_ZOOM}
              cameraPadding={mapCameraPadding}
              isFollowingUser={isFollowingUser}
              onPress={stableHandleMapPress}
              onTouchStart={handleMapTouchStart}
              onTouchEnd={handleMapTouchEnd}
              onCameraChanged={stableHandleCameraChanged}
              onMapIdle={stableHandleMapIdle}
              onMapLoaded={stableHandleMapLoaded}
              onMarkerPress={stableHandleMarkerPress}
              onVisualReady={stableHandleMapVisualReady}
              onMarkerRevealSettled={stableHandleMarkerRevealSettled}
              selectedRestaurantId={mapTreePropsForRender.selectedRestaurantId}
              sortedRestaurantMarkers={mapTreePropsForRender.sortedRestaurantMarkers}
              dotRestaurantFeatures={mapTreePropsForRender.dotRestaurantFeatures}
              markersRenderKey={mapTreePropsForRender.markersRenderKey}
              pinsRenderKey={mapTreePropsForRender.pinsRenderKey}
              markerRevealCommitId={mapTreePropsForRender.markerRevealCommitId}
              visualReadyRequestKey={mapTreePropsForRender.visualReadyRequestKey}
              shouldSignalVisualReady={mapTreePropsForRender.shouldSignalVisualReady}
              requireMarkerVisualsForVisualReady={
                mapTreePropsForRender.requireMarkerVisualsForVisualReady
              }
              buildMarkerKey={buildMarkerKey}
              markerRevealChunk={MARKER_REVEAL_CHUNK}
              markerRevealStaggerMs={MARKER_REVEAL_STAGGER_MS}
              restaurantFeatures={mapTreePropsForRender.restaurantFeatures}
              restaurantLabelStyle={restaurantLabelStyle}
              isMapStyleReady={isMapStyleReady}
              userLocation={userLocation}
              locationPulse={locationPulse}
              disableMarkers={shouldDisableMarkerViews}
              disableBlur={shouldDisableSearchBlur}
              onProfilerRender={handleProfilerRender}
              mapQueryBudget={mapQueryBudget}
              runtimeWorkSchedulerRef={runtimeWorkSchedulerRef}
              selectionFeedbackOperationId={runOneSelectionFeedbackOperationId}
              isRunOneHandoffActive={isRun1HandoffActive}
              isRunOneChromeDeferred={isRunOneHeavyFinalizeDeferred || isChromeDeferred}
              onRuntimeMechanismEvent={emitRuntimeMechanismEvent}
            />
          </React.Profiler>
        ) : (
          <React.Profiler id="SearchMapPlaceholder" onRender={handleProfilerRender}>
            <View pointerEvents="none" style={styles.mapPlaceholder} />
          </React.Profiler>
        )}
        <SearchMapLoadingGrid mapLoadingAnimatedStyle={mapLoadingAnimatedStyle} />
        <SearchStatusBarFade statusBarFadeHeight={statusBarFadeHeight} />
        {shouldRenderSearchOverlay && (
          <>
            <React.Profiler id="SearchOverlayChrome" onRender={handleProfilerRender}>
              <SafeAreaView
                style={[
                  styles.overlay,
                  isSuggestionOverlayVisible ? { zIndex: shouldHideBottomNav ? 200 : 110 } : null,
                ]}
                pointerEvents="box-none"
                edges={['top', 'left', 'right']}
              >
                <View pointerEvents={isSuggestionOverlayVisible ? 'auto' : 'none'}>
                  <SearchSuggestionSurface
                    searchSurfaceAnimatedStyle={searchSurfaceAnimatedStyle}
                    shouldDisableSearchBlur={shouldDisableSearchBlur}
                    shouldShowSuggestionSurface={shouldShowSuggestionSurface}
                    resolvedSuggestionHeaderHoles={resolvedSuggestionHeaderHoles}
                    suggestionHeaderHeightAnimatedStyle={suggestionHeaderHeightAnimatedStyle}
                    suggestionPanelAnimatedStyle={suggestionPanelAnimatedStyle}
                    shouldDriveSuggestionLayout={shouldDriveSuggestionLayout}
                    suggestionScrollTopAnimatedStyle={suggestionScrollTopAnimatedStyle}
                    suggestionScrollMaxHeightTarget={suggestionScrollMaxHeightTarget}
                    suggestionScrollMaxHeightAnimatedStyle={suggestionScrollMaxHeightAnimatedStyle}
                    searchLayoutTop={searchLayout.top}
                    searchLayoutHeight={searchLayout.height}
                    shouldHideBottomNav={shouldHideBottomNav}
                    navBarHeight={navBarHeight}
                    bottomInset={bottomInset}
                    onSuggestionScroll={suggestionScrollHandler}
                    onSuggestionTouchStart={handleSuggestionTouchStart}
                    onSuggestionContentSizeChange={handleSuggestionContentSizeChange}
                    onSuggestionInteractionStart={handleSuggestionInteractionStart}
                    onSuggestionInteractionEnd={handleSuggestionInteractionEnd}
                    isSuggestionScreenActive={isSuggestionScreenActive}
                    shouldRenderSuggestionPanel={shouldRenderSuggestionPanel}
                    shouldRenderAutocompleteSection={shouldRenderAutocompleteSection}
                    shouldRenderRecentSection={shouldRenderRecentSection}
                    suggestionDisplaySuggestions={
                      suggestionSurfacePropsForRender.suggestionDisplaySuggestions
                    }
                    recentSearchesDisplay={suggestionSurfacePropsForRender.recentSearchesDisplay}
                    recentlyViewedRestaurantsDisplay={
                      suggestionSurfacePropsForRender.recentlyViewedRestaurantsDisplay
                    }
                    recentlyViewedFoodsDisplay={
                      suggestionSurfacePropsForRender.recentlyViewedFoodsDisplay
                    }
                    hasRecentSearchesDisplay={
                      suggestionSurfacePropsForRender.hasRecentSearchesDisplay
                    }
                    hasRecentlyViewedRestaurantsDisplay={
                      suggestionSurfacePropsForRender.hasRecentlyViewedRestaurantsDisplay
                    }
                    hasRecentlyViewedFoodsDisplay={
                      suggestionSurfacePropsForRender.hasRecentlyViewedFoodsDisplay
                    }
                    isRecentLoadingDisplay={suggestionSurfacePropsForRender.isRecentLoadingDisplay}
                    isRecentlyViewedLoadingDisplay={
                      suggestionSurfacePropsForRender.isRecentlyViewedLoadingDisplay
                    }
                    isRecentlyViewedFoodsLoadingDisplay={
                      suggestionSurfacePropsForRender.isRecentlyViewedFoodsLoadingDisplay
                    }
                    onSuggestionPress={handleSuggestionPress}
                    onRecentSearchPress={handleRecentSearchPress}
                    onRecentlyViewedRestaurantPress={handleRecentlyViewedRestaurantPress}
                    onRecentlyViewedFoodPress={handleRecentlyViewedFoodPress}
                    onRecentViewMorePress={handleRecentViewMorePress}
                    onRecentlyViewedMorePress={handleRecentlyViewedMorePress}
                    suggestionHeaderDividerAnimatedStyle={suggestionHeaderDividerAnimatedStyle}
                  />
                </View>
                <SearchOverlayHeaderChrome
                  handleSearchContainerLayout={handleSearchContainerLayout}
                  query={query}
                  shouldShowAutocompleteSpinnerInBar={shouldShowAutocompleteSpinnerInBar}
                  handleQueryChange={handleQueryChange}
                  handleSubmit={handleSubmit}
                  handleSearchFocus={handleSearchFocus}
                  handleSearchBlur={handleSearchBlur}
                  handleClear={handleClear}
                  focusSearchInput={focusSearchInput}
                  handleSearchPressIn={handleSearchPressIn}
                  isSuggestionPanelActive={isSuggestionPanelActive}
                  handleSearchBack={handleSearchBack}
                  handleSearchHeaderLayout={handleSearchHeaderLayout}
                  inputRef={inputRef}
                  searchBarInputAnimatedStyle={searchBarInputAnimatedStyle}
                  searchBarContainerAnimatedStyle={searchBarContainerAnimatedStyle}
                  isSuggestionScrollDismissing={isSuggestionScrollDismissing}
                  isSearchSessionActive={isSearchSessionActive}
                  searchHeaderFocusProgress={searchHeaderFocusProgress}
                  shouldMountSearchShortcuts={
                    overlayHeaderChromePropsForRender.shouldMountSearchShortcuts
                  }
                  shouldRenderSearchShortcuts={
                    overlayHeaderChromePropsForRender.shouldRenderSearchShortcuts
                  }
                  searchShortcutsAnimatedStyle={
                    overlayHeaderChromePropsForRender.searchShortcutsAnimatedStyle
                  }
                  searchShortcutChipAnimatedStyle={
                    overlayHeaderChromePropsForRender.searchShortcutChipAnimatedStyle
                  }
                  searchShortcutContentAnimatedStyle={
                    overlayHeaderChromePropsForRender.searchShortcutContentAnimatedStyle
                  }
                  handleBestRestaurantsHere={handleBestRestaurantsHere}
                  handleBestDishesHere={handleBestDishesHere}
                  handleSearchShortcutsRowLayout={handleSearchShortcutsRowLayout}
                  handleRestaurantsShortcutLayout={handleRestaurantsShortcutLayout}
                  handleDishesShortcutLayout={handleDishesShortcutLayout}
                  shouldShowSearchThisArea={
                    overlayHeaderChromePropsForRender.shouldShowSearchThisArea
                  }
                  searchThisAreaTop={overlayHeaderChromePropsForRender.searchThisAreaTop}
                  searchThisAreaAnimatedStyle={
                    overlayHeaderChromePropsForRender.searchThisAreaAnimatedStyle
                  }
                  handleSearchThisArea={handleSearchThisArea}
                />
              </SafeAreaView>
            </React.Profiler>
            <SearchResultsSheetTree
              searchPanelSpecArgs={searchResultsPanelSpecArgs}
              overlayPanelsArgs={searchOverlayPanelsArgs}
              shouldFreezeOverlaySheetProps={isRunOnePreflightFreezeActive}
              shouldFreezeOverlayHeaderActionMode={shouldFreezeDeferredChromeProps}
              searchInteractionContextValue={searchInteractionContextValue}
              sheetTranslateY={sheetTranslateY}
              resultsScrollOffset={resultsScrollOffset}
              resultsMomentum={resultsMomentum}
              overlayHeaderActionProgress={overlayHeaderActionProgress}
              navBarCutoutHeight={navBarCutoutHeight}
              bottomNavHideProgress={bottomNavHideProgress}
              bottomNavHiddenTranslateY={bottomNavHiddenTranslateY}
              shouldHideBottomNav={shouldHideBottomNav}
              onProfilerRender={handleProfilerRender}
            />
          </>
        )}
        <React.Profiler id="BottomNav" onRender={handleProfilerRender}>
          <SearchBottomNav
            bottomNavAnimatedStyle={bottomNavAnimatedStyle}
            shouldHideBottomNav={bottomNavPropsForRender.shouldHideBottomNav}
            bottomInset={bottomInset}
            handleBottomNavLayout={handleBottomNavLayout}
            shouldDisableSearchBlur={bottomNavPropsForRender.shouldDisableSearchBlur}
            navItems={SEARCH_BOTTOM_NAV_ITEMS}
            rootOverlay={bottomNavPropsForRender.rootOverlay}
            navIconRenderers={navIconRenderers}
            handleProfilePress={bottomNavPropsForRender.handleProfilePress}
            handleOverlaySelect={bottomNavPropsForRender.handleOverlaySelect}
            bottomNavItemVisibilityAnimatedStyle={bottomNavItemVisibilityAnimatedStyle}
          />
        </React.Profiler>
        <React.Profiler id="Overlays" onRender={handleProfilerRender}>
          <>
            <SearchRankAndScoreSheets
              rankSheetRef={rankSheetRef}
              isRankSelectorVisible={isRankSelectorVisible}
              closeRankSelector={closeRankSelector}
              dismissRankSelector={dismissRankSelector}
              pendingScoreMode={pendingScoreMode}
              setPendingScoreMode={setPendingScoreMode}
              handleRankDone={handleRankDone}
              activeTabColor={ACTIVE_TAB_COLOR}
              activeTabColorDark={ACTIVE_TAB_COLOR_DARK}
              isScoreInfoVisible={isScoreInfoVisible}
              scoreInfo={scoreInfo}
              closeScoreInfo={closeScoreInfo}
              setScoreInfo={setScoreInfo}
              scoreInfoMaxHeight={SCORE_INFO_MAX_HEIGHT}
              formatCompactCount={formatCompactCount}
              onProfilerRender={handleProfilerRender}
            />
            <React.Profiler id="PriceSheet" onRender={handleProfilerRender}>
              <SearchPriceSheet
                priceSheetRef={priceSheetRef}
                isPriceSelectorVisible={isPriceSelectorVisible}
                closePriceSelector={closePriceSelector}
                summaryCandidates={priceSummaryCandidates}
                onMeasureSummaryCandidateWidth={measureSummaryCandidateWidth}
                summaryPillPaddingX={priceSummaryPillPaddingX}
                summaryPillWidth={priceSummaryPillWidth}
                summaryLabel={priceSheetSummary}
                summaryReelItems={summaryReelItems}
                isPriceSheetContentReady={isPriceSheetContentReady}
                priceSliderLowValue={priceSliderLowValue}
                priceSliderHighValue={priceSliderHighValue}
                handlePriceSliderCommit={handlePriceSliderCommit}
                dismissPriceSelector={dismissPriceSelector}
                handlePriceDone={handlePriceDone}
                activeTabColor={ACTIVE_TAB_COLOR}
              />
            </React.Profiler>
          </>
        </React.Profiler>
      </View>
    </React.Profiler>
  );
};

export default SearchScreen;
