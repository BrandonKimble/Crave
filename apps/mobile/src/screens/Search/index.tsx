import React from 'react';
import {
  Animated,
  AppState,
  InteractionManager,
  Keyboard,
  PixelRatio,
  Pressable,
  TouchableOpacity,
  unstable_batchedUpdates,
  View,
  Easing as RNEasing,
} from 'react-native';
import type { LayoutChangeEvent, LayoutRectangle, TextInput } from 'react-native';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated, {
  Easing,
  runOnUI,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Text } from '../../components';
import AppBlurView from '../../components/app-blur-view';
import { ChartNoAxesColumn, HandPlatter, Heart, Store, X as LucideX } from 'lucide-react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { colors as themeColors } from '../../constants/theme';
import {
  overlaySheetStyles,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
} from '../../overlays/overlaySheetStyles';
import OverlaySheetShell from '../../overlays/OverlaySheetShell';
import OverlayHeaderActionButton from '../../overlays/OverlayHeaderActionButton';
import OverlayModalSheet from '../../overlays/OverlayModalSheet';
import OverlaySheetHeaderChrome from '../../overlays/OverlaySheetHeaderChrome';
import { createOverlayRegistry } from '../../overlays/OverlayRegistry';
import { calculateSnapPoints, resolveExpandedTop } from '../../overlays/sheetUtils';
import { logger } from '../../utils';
import {
  searchService,
  type RecentSearch,
  type RecentlyViewedFood,
  type RecentlyViewedRestaurant,
} from '../../services/search';
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
import type { MainSearchIntent, RootStackParamList } from '../../types/navigation';
import * as Location from 'expo-location';
import { useBookmarksPanelSpec } from '../../overlays/panels/BookmarksPanel';
import { usePollCreationPanelSpec } from '../../overlays/panels/PollCreationPanel';
import { usePollsPanelSpec } from '../../overlays/panels/PollsPanel';
import { useProfilePanelSpec } from '../../overlays/panels/ProfilePanel';
import {
  useRestaurantPanelSpec,
  type RestaurantOverlayData,
} from '../../overlays/panels/RestaurantPanel';
import { useSaveListPanelSpec } from '../../overlays/panels/SaveListPanel';
import { useSearchPanelSpec } from '../../overlays/panels/SearchPanel';
import { buildMapStyleURL } from '../../constants/map';
import { useOverlayStore, type OverlayKey } from '../../store/overlayStore';
import { useOverlaySheetPositionStore } from '../../overlays/useOverlaySheetPositionStore';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import MaskedHoleOverlay, { type MaskedHole } from '../../components/MaskedHoleOverlay';
import { useSearchRequests } from '../../hooks/useSearchRequests';
import { useKeyedCallback } from '../../hooks/useCallbackFactory';
import { useDebouncedLayoutMeasurement } from '../../hooks/useDebouncedLayoutMeasurement';
import SquircleSpinner from '../../components/SquircleSpinner';
import SearchHeader from './components/SearchHeader';
import SearchSuggestions from './components/SearchSuggestions';
import SearchFilters, { type SearchFiltersLayoutCache } from './components/SearchFilters';
import DishResultCard from './components/dish-result-card';
import EmptyState from './components/empty-state';
import RestaurantResultCard from './components/restaurant-result-card';
import { PollIcon, VoteIcon } from './components/metric-icons';
import PriceRangeSlider from './components/price-range-slider';
import SearchMap, {
  type MapboxMapRef,
  type RestaurantFeatureProperties,
} from './components/search-map';
import useSearchChromeTransition from './hooks/use-search-chrome-transition';
import useSearchHistory from './hooks/use-search-history';
import useSearchSheet from './hooks/use-search-sheet';
import useSearchSubmit from './hooks/use-search-submit';
import useSearchTransition from './hooks/use-search-transition';
import { SearchInteractionProvider } from './context/SearchInteractionContext';
import searchPerfDebug from './search-perf-debug';
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
  AUTOCOMPLETE_CACHE_TTL_MS,
  AUTOCOMPLETE_MIN_CHARS,
  CAMERA_STORAGE_KEY,
  CONTENT_HORIZONTAL_PADDING,
  DEFAULT_SEGMENT,
  LABEL_RADIAL_OFFSET_EM,
  LABEL_TEXT_SIZE,
  LABEL_TRANSLATE_Y,
  LOCATION_STORAGE_KEY,
  MINIMUM_VOTES_FILTER,
  NAV_TOP_PADDING,
  NAV_BOTTOM_PADDING,
  RESULTS_BOTTOM_PADDING,
  SCORE_INFO_MAX_HEIGHT,
  SCREEN_HEIGHT,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_BAR_HOLE_PADDING,
  SEARCH_BAR_HOLE_RADIUS,
  SEARCH_HORIZONTAL_PADDING,
  SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM,
  SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP,
  SEARCH_SUGGESTION_HEADER_PANEL_GAP,
  SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM,
  SECONDARY_METRIC_ICON_SIZE,
  SHORTCUT_CHIP_HOLE_PADDING,
  SHORTCUT_CHIP_HOLE_RADIUS,
  SINGLE_LOCATION_ZOOM_LEVEL,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
  type SegmentValue,
} from './constants/search';

const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const EMPTY_RESULTS: Array<FoodResult | RestaurantResult> = [];

import {
  buildLevelsFromRange,
  formatPriceRangeSummary,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceRangeValues,
  type PriceRangeTuple,
} from './utils/price';
import { getMarkerColorForRestaurant } from './utils/marker-lod';
import { getQualityColorFromPercentile } from './utils/quality';
import { formatCompactCount } from './utils/format';
import { resolveSingleRestaurantCandidate } from './utils/response';
import {
  boundsFromPairs,
  getBoundsCenter,
  hasBoundsMovedSignificantly,
  haversineDistanceMiles,
  isLngLatTuple,
  mapStateBoundsToMapBounds,
} from './utils/geo';

MapboxGL.setTelemetryEnabled(false);

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

const memoizeHiddenOverlay = <P extends { visible: boolean }>(Component: React.ComponentType<P>) =>
  React.memo(Component, (prev, next) => !prev.visible && !next.visible);

const MemoOverlayModalSheet = memoizeHiddenOverlay(OverlayModalSheet);

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';
const PIXEL_SCALE = PixelRatio.get();
const CUTOUT_EDGE_SLOP = 1 / PIXEL_SCALE;
const floorToPixel = (value: number) => Math.floor(value * PIXEL_SCALE) / PIXEL_SCALE;
const ceilToPixel = (value: number) => Math.ceil(value * PIXEL_SCALE) / PIXEL_SCALE;
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
const SUGGESTION_PANEL_FADE_IN_MS = 200;
const SUGGESTION_PANEL_FADE_OUT_MS = 180;
const SUGGESTION_PANEL_LAYOUT_HOLD_MS = 200;
const SUGGESTION_PANEL_KEYBOARD_DELAY_MS = 0;
const SUGGESTION_PANEL_MIN_MS = 160;
const SUGGESTION_PANEL_MAX_MS = 320;
const FILTER_TOGGLE_DEBOUNCE_MS = 600;
const MARKER_REVEAL_CHUNK = 4;
const MARKER_REVEAL_STAGGER_MS = 12;
const MARKER_REVEAL_ANIM_MS = 2000;
const MARKER_REVEAL_WINDOW_MS =
  MARKER_REVEAL_ANIM_MS + (MARKER_REVEAL_CHUNK - 1) * MARKER_REVEAL_STAGGER_MS + 60;
const MARKER_DOT_HEAVY_ZOOM_ENTER = 12.0;
const MARKER_DOT_HEAVY_ZOOM_EXIT = 12.4;
const MARKER_DOT_HEAVY_COUNT_ENTER = 180;
const MARKER_DOT_HEAVY_COUNT_EXIT = 150;
const MAX_FULL_MARKERS = 100;
const MAP_GRID_MINOR_SIZE = 32;
const MAP_GRID_MAJOR_SIZE = 128;
const SUGGESTION_SCROLL_WHITE_OVERSCROLL_BUFFER = SCREEN_HEIGHT;
const MAP_GRID_MINOR_STROKE = 'rgba(15, 23, 42, 0.05)';
const MAP_GRID_MAJOR_STROKE = 'rgba(15, 23, 42, 0.08)';
const PROFILE_PIN_TARGET_CENTER_RATIO = 0.25;
const PROFILE_PIN_MIN_VISIBLE_HEIGHT = 160;
const SHORTCUT_CONTENT_FADE_DEFAULT = 0;
const SHORTCUT_CONTENT_FADE_OUT = 1;
const SHORTCUT_CONTENT_FADE_HOLD = 2;
const PROFILE_CAMERA_ANIMATION_MS = 800;
const PROFILE_RESTORE_ANIMATION_MS = 650;
const PROFILE_TRANSITION_LOCK_MS = 750;
const FIT_BOUNDS_SYNC_BUFFER_MS = 160;
const RESULTS_WASH_FADE_MS = 220;
const RESULTS_LOADING_SPINNER_OFFSET = 96;
const CAMERA_CENTER_PRECISION = 1e5;
const CAMERA_ZOOM_PRECISION = 1e2;

const roundCameraCenterValue = (value: number) =>
  Math.round(value * CAMERA_CENTER_PRECISION) / CAMERA_CENTER_PRECISION;
const roundCameraZoomValue = (value: number) =>
  Math.round(value * CAMERA_ZOOM_PRECISION) / CAMERA_ZOOM_PRECISION;

type MapCameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

type SearchShortcutsLayoutCache = {
  frame: LayoutRectangle | null;
  chipFrames: Record<string, LayoutRectangle>;
};

type ProfileTransitionStatus = 'idle' | 'opening' | 'open' | 'closing';

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
  const accessToken = React.useMemo(() => process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '', []);
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const latestBoundsRef = React.useRef<MapBounds | null>(null);
  const lastSearchBoundsRef = React.useRef<MapBounds | null>(null);
  const lastSearchBoundsCaptureSeqRef = React.useRef(0);
  const hasPrimedInitialBoundsRef = React.useRef(false);
  const [mapCenter, setMapCenter] = React.useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = React.useState<number | null>(null);
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
    ((restaurantId: string, restaurantName: string) => void) | null
  >(null);
  const mapLoadingOpacity = useSharedValue(1);

  React.useLayoutEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);

  React.useEffect(() => {
    logger.info('Mapbox config', {
      hasToken: accessToken.length > 0,
      hasStyleUrl: typeof process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL === 'string',
    });
  }, [accessToken]);

  React.useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  React.useEffect(() => {
    if (!userLocation || userLocationIsCachedRef.current) {
      return;
    }
    void AsyncStorage.setItem(
      LOCATION_STORAGE_KEY,
      JSON.stringify({
        lat: userLocation.lat,
        lng: userLocation.lng,
        updatedAt: Date.now(),
      })
    ).catch(() => undefined);
  }, [userLocation]);

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
    void InteractionManager.runAfterInteractions(() => {
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
            latestBoundsRef.current = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
          }
        } catch {
          // ignore
        }
      })();
    });
  }, []);

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
          setMapCenter(center);
          setMapZoom(zoom);
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
  }, []);

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
    setMapCenter(fallbackCenter);
    setMapZoom(fallbackZoom);
    lastCameraStateRef.current = { center: fallbackCenter, zoom: fallbackZoom };
    setIsFollowingUser(false);
    setIsInitialCameraReady(true);
  }, [
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
      setMapCenter(fallbackCenter);
      setMapZoom(fallbackZoom);
      lastCameraStateRef.current = { center: fallbackCenter, zoom: fallbackZoom };
      setIsFollowingUser(false);
      setIsInitialCameraReady(true);
    }, 600);

    return () => clearTimeout(timeout);
  }, [isInitialCameraHydrated, isInitialCameraReady, locationPermissionDenied, mapCenter, mapZoom, setIsFollowingUser]);

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
    setMapCenter(center);
    setMapZoom(zoom);
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
  }, [isInitialCameraHydrated, userLocation]);

  const mapStyleURL = React.useMemo(() => buildMapStyleURL(accessToken), [accessToken]);
  const restaurantLabelStyle = React.useMemo<MapboxGL.SymbolLayerStyle>(() => {
    const radialEm = LABEL_RADIAL_OFFSET_EM;
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
      textVariableAnchor: ['literal', ['top', 'right', 'left', 'bottom']],
      textAnchor: 'center',
      textRadialOffset: radialEm,
      textTranslate: [0, LABEL_TRANSLATE_Y],
      textTranslateAnchor: 'viewport',
      textJustify: 'auto',
      textAllowOverlap: false,
      textOptional: false,
      textIgnorePlacement: false,
      textSize: LABEL_TEXT_SIZE,
      textFont: ['Open Sans Semibold', 'Arial Unicode MS Regular'],
      textColor: '#374151', // dark gray
      textHaloColor: 'rgba(255, 255, 255, 0.9)',
      textHaloWidth: 1.2,
      textHaloBlur: 0.9,
      textOffset: [0, 0],
      symbolZOrder: 'viewport-y',
    };
  }, []);

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = React.useState('');
  const [isSearchSessionActive, setIsSearchSessionActive] = React.useState(false);
  const [restaurantOnlyId, setRestaurantOnlyId] = React.useState<string | null>(null);
  const [searchMode, setSearchMode] = React.useState<'natural' | 'shortcut' | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFilterTogglePending, setIsFilterTogglePending] = React.useState(false);
  const [, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [, setShowSuggestions] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressed] = React.useState(false);
  const lastAutocompleteQueryRef = React.useRef<string>('');
  const lastAutocompleteResultsRef = React.useRef<AutocompleteMatch[]>([]);
  const lastAutocompleteTimestampRef = React.useRef<number>(0);
  const autocompleteRequestSeqRef = React.useRef(0);
  const suppressAutocompleteResultsRef = React.useRef(false);
  const suppressAutocompleteResults = React.useCallback(() => {
    suppressAutocompleteResultsRef.current = true;
    autocompleteRequestSeqRef.current += 1;
  }, []);
  const allowAutocompleteResults = React.useCallback(() => {
    suppressAutocompleteResultsRef.current = false;
  }, []);
  const [activeTab, setActiveTab] = React.useState<SegmentValue>(DEFAULT_SEGMENT);
  const [searchLayout, setSearchLayout] = React.useState({ top: 0, height: 0 });
  const [searchContainerFrame, setSearchContainerFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const searchContainerLayoutCacheRef = React.useRef<LayoutRectangle | null>(null);
  const [searchBarFrame, setSearchBarFrame] = React.useState<LayoutRectangle | null>(null);
  const [searchShortcutsFrame, setSearchShortcutsFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const [searchShortcutChipFrames, setSearchShortcutChipFrames] = React.useState<
    Record<string, LayoutRectangle>
  >({});
  const [suggestionContentHeight, setSuggestionContentHeight] = React.useState(0);
  const suggestionContentHeightRef = React.useRef(0);
  const searchShortcutsLayoutCacheRef = React.useRef<SearchShortcutsLayoutCache>({
    frame: null,
    chipFrames: {},
  });
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
  const [isSuggestionLayoutWarm, setIsSuggestionLayoutWarm] = React.useState(false);
  const [isSuggestionScrollDismissing, setIsSuggestionScrollDismissing] = React.useState(false);
  const suggestionScrollDismissTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [searchTransitionVariant, setSearchTransitionVariant] = React.useState<
    'default' | 'submitting'
  >('default');
  const submitTransitionHoldRef = React.useRef({
    active: false,
    query: '',
    suggestions: [] as AutocompleteMatch[],
    recentSearches: [] as RecentSearch[],
    recentlyViewedRestaurants: [] as RecentlyViewedRestaurant[],
    recentlyViewedFoods: [] as RecentlyViewedFood[],
    isRecentLoading: false,
    isRecentlyViewedLoading: false,
    isRecentlyViewedFoodsLoading: false,
    holdShortcuts: false,
    holdSuggestionPanel: false,
    holdSuggestionBackground: false,
    holdAutocomplete: false,
    holdRecent: false,
  });
  const [pollsSheetSnap, setPollsSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [pollsDockedSnapRequest, setPollsDockedSnapRequest] =
    React.useState<OverlaySheetSnap | null>(null);
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
  const [bookmarksSheetSnap, setBookmarksSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [profileSheetSnap, setProfileSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const overlaySwitchInFlightRef = React.useRef(false);
  const ignoreDockedPollsHiddenUntilMsRef = React.useRef(0);

  const requestDockedPollsRestore = React.useCallback(() => {
    ignoreDockedPollsHiddenUntilMsRef.current = Date.now() + 650;
    setIsDockedPollsDismissed(false);
    setPollsDockedSnapRequest(pollsSheetSnap === 'collapsed' ? null : 'collapsed');
  }, [pollsSheetSnap, setIsDockedPollsDismissed, setPollsDockedSnapRequest]);
  const [saveSheetSnap, setSaveSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [saveSheetState, setSaveSheetState] = React.useState<{
    visible: boolean;
    listType: FavoriteListType;
    target: { restaurantId?: string; connectionId?: string } | null;
  }>({ visible: false, listType: 'restaurant', target: null });

  // Stable callback factories for save handlers - prevents inline closures from breaking React.memo
  const getDishSaveHandler = useKeyedCallback(
    (connectionId: string) =>
      setSaveSheetState({
        visible: true,
        listType: 'dish',
        target: { connectionId },
      }),
    []
  );

  const getRestaurantSaveHandler = useKeyedCallback(
    (restaurantId: string) =>
      setSaveSheetState({
        visible: true,
        listType: 'restaurant',
        target: { restaurantId },
      }),
    []
  );

  const [restaurantProfile, setRestaurantProfile] = React.useState<RestaurantOverlayData | null>(
    null
  );
  const [isRestaurantOverlayVisible, setRestaurantOverlayVisible] = React.useState(false);
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
  const [userLocation, setUserLocation] = React.useState<Coordinate | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = React.useState(false);
  const [pollBounds, setPollBounds] = React.useState<MapBounds | null>(null);
  const [mapMovedSinceSearch, setMapMovedSinceSearch] = React.useState(false);
  const resultsSheetDraggingRef = React.useRef(false);
  const resultsListScrollingRef = React.useRef(false);
  const resultsSheetSettlingRef = React.useRef(false);
  const pendingResultsSheetSnapRef = React.useRef<OverlaySheetSnap | null>(null);
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);
  const mapMovedSinceSearchRef = React.useRef(false);
  const pendingMapMovedRevealRef = React.useRef(false);
  const mapGestureActiveRef = React.useRef(false);
  const mapTouchActiveRef = React.useRef(false);
  const mapTouchStartedWithResultsSheetOpenRef = React.useRef(false);
  const mapGestureSessionRef = React.useRef<{
    startBounds: MapBounds;
    startZoom: number | null;
    eventCount: number;
    didCollapse: boolean;
    startedWithResultsSheetOpen: boolean;
  } | null>(null);
  const lastCameraChangedHandledRef = React.useRef(0);
  const mapIdleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollBoundsRef = React.useRef<MapBounds | null>(null);
  const pollBoundsTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapEventStatsRef = React.useRef({
    cameraChanged: 0,
    mapIdle: 0,
    lastLog: 0,
  });
  const anySheetDraggingRef = React.useRef(false);

  const searchInteractionRef = React.useRef({
    isInteracting: false,
    isResultsSheetDragging: false,
    isResultsListScrolling: false,
    isResultsSheetSettling: false,
  });
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
    const boundsSnapshot = latestBoundsRef.current;
    if (boundsSnapshot) {
      lastSearchBoundsRef.current = boundsSnapshot;
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
          latestBoundsRef.current = bounds;
          lastSearchBoundsRef.current = bounds;
        });
      }
    }
    mapMovedSinceSearchRef.current = false;
    setMapMovedSinceSearch(false);
  }, []);
  const markMapMovedIfNeeded = React.useCallback((bounds: MapBounds) => {
    if (mapMovedSinceSearchRef.current) {
      return true;
    }
    const baseline = lastSearchBoundsRef.current;
    if (!baseline) {
      return false;
    }
    if (!hasBoundsMovedSignificantly(baseline, bounds)) {
      return false;
    }
    mapMovedSinceSearchRef.current = true;
    return true;
  }, []);
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
    if (latestBoundsRef.current) {
      return latestBoundsRef.current;
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
    latestBoundsRef.current = bounds;
    return bounds;
  }, []);

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
  const suggestionLayoutHoldTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsScrollRef = React.useRef<FlashListRef<FoodResult | RestaurantResult> | null>(null);
  const resultsScrollingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserScrolledResultsRef = React.useRef(false);
  const searchFiltersLayoutCacheRef = React.useRef<SearchFiltersLayoutCache | null>(null);
  const locationRequestInFlightRef = React.useRef(false);
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
  const userLocationRef = React.useRef<Coordinate | null>(null);
  const userLocationIsCachedRef = React.useRef(false);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const locationPulse = React.useRef(new Animated.Value(0)).current;
  const locationPulseAnimationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const hasCenteredOnLocationRef = React.useRef(false);
  const filterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleFilterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterToggleRequestRef = React.useRef(0);
  const activeOverlay = useOverlayStore((state) => state.activeOverlay);
  const overlayStack = useOverlayStore((state) => state.overlayStack);
  const overlayParams = useOverlayStore((state) => state.overlayParams);
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const setOverlayParams = useOverlayStore((state) => state.setOverlayParams);
  const popOverlay = useOverlayStore((state) => state.popOverlay);
  const popToRootOverlay = useOverlayStore((state) => state.popToRootOverlay);
  const registerTransientDismissor = useOverlayStore((state) => state.registerTransientDismissor);
  const dismissTransientOverlays = useOverlayStore((state) => state.dismissTransientOverlays);
  const hasUserSharedSnap = useOverlaySheetPositionStore((state) => state.hasUserSharedSnap);
  const sharedSnap = useOverlaySheetPositionStore((state) => state.sharedSnap);
  const rootOverlay = overlayStack[0] ?? activeOverlay;
  const isSearchOverlay = rootOverlay === 'search';
  const showBookmarksOverlay = rootOverlay === 'bookmarks';
  const showPollsOverlay = rootOverlay === 'polls';
  const showProfileOverlay = rootOverlay === 'profile';
  const showSaveListOverlay = saveSheetState.visible;
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
      setTabOverlaySnapRequest(null);
      requestDockedPollsRestore();
    });
  }, [requestDockedPollsRestore, rootOverlay, setTabOverlaySnapRequest]);
  const pollOverlayParams = overlayParams.polls;
  const { progress: suggestionProgress, isVisible: isSuggestionPanelVisible } = useSearchTransition(
    {
      enabled: true,
      active: isSuggestionPanelActive,
      showMs: SUGGESTION_PANEL_FADE_IN_MS,
      hideMs: SUGGESTION_PANEL_FADE_OUT_MS,
      minMs: SUGGESTION_PANEL_MIN_MS,
      maxMs: SUGGESTION_PANEL_MAX_MS,
      delayMs: SUGGESTION_PANEL_KEYBOARD_DELAY_MS,
    }
  );
  const isSuggestionOverlayVisible = isSuggestionPanelActive || isSuggestionPanelVisible;
  const searchBarTop = React.useMemo(() => {
    const rawTop = searchBarFrame
      ? searchLayout.top + searchBarFrame.y
      : searchLayout.top + SEARCH_CONTAINER_PADDING_TOP;
    return Math.max(rawTop, 0);
  }, [searchBarFrame, searchLayout.top]);
  const ensureSearchOverlay = React.useCallback(() => {
    if (rootOverlay !== 'search') {
      unstable_batchedUpdates(() => {
        requestDockedPollsRestore();
        setTabOverlaySnapRequest(null);
        setOverlay('search');
      });
      return;
    }
    if (activeOverlay !== 'search') {
      popToRootOverlay();
    }
  }, [
    activeOverlay,
    popToRootOverlay,
    requestDockedPollsRestore,
    rootOverlay,
    setOverlay,
    setTabOverlaySnapRequest,
  ]);

  const bottomInset = Math.max(insets.bottom, 12);
  // Hide the bottom nav only while the search tab is actively in use.
  const shouldHideBottomNav =
    isSearchOverlay && (isSearchSessionActive || isSuggestionPanelActive || isLoading);
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
  // Snap points should behave as if the nav bar is present (even when it isn't rendered).
  const navBarTopForSnaps = SCREEN_HEIGHT - fallbackNavBarHeight;
  const navBarTop = shouldHideBottomNav ? SCREEN_HEIGHT : navBarTopForSnaps;
  const navBarHeight = shouldHideBottomNav ? 0 : fallbackNavBarHeight;

  const [resultsSheetHeaderHeight, setResultsSheetHeaderHeight] = React.useState(0);
  const shouldShowDockedPolls =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    !isSearchSessionActive &&
    !isLoading &&
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
    if (!isSearchSessionActive && !isLoading) {
      return;
    }
    const isEditingNow =
      Boolean(inputRef.current?.isFocused?.()) || isSearchEditingRef.current || isSearchFocused;
    if (isEditingNow) {
      return;
    }
    flushPendingResultsSheetReveal();
  }, [flushPendingResultsSheetReveal, isLoading, isSearchFocused, isSearchSessionActive]);
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
  React.useEffect(() => {
    resultsWashOpacity.value = withTiming(shouldSuspendResultsSheet ? 1 : 0, {
      duration: RESULTS_WASH_FADE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [resultsWashOpacity, shouldSuspendResultsSheet]);
  const pollsChromeSnaps = React.useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const hidden = SCREEN_HEIGHT + 80;
    const clampedMiddle = Math.min(middle, hidden - 120);
    return { expanded, middle: clampedMiddle };
  }, [insets.top, searchBarTop]);
  const bookmarksChromeSnaps = React.useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const hidden = SCREEN_HEIGHT + 80;
    const clampedMiddle = Math.min(middle, hidden - 120);
    return { expanded, middle: clampedMiddle };
  }, [insets.top, searchBarTop]);
  const profileChromeSnaps = React.useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const hidden = SCREEN_HEIGHT + 80;
    const clampedMiddle = Math.min(middle, hidden - 120);
    return { expanded, middle: clampedMiddle };
  }, [insets.top, searchBarTop]);
  const saveChromeSnaps = React.useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.5);
    return { expanded, middle };
  }, [insets.top, searchBarTop]);
  const shouldUsePollsChrome =
    showPollsOverlay ||
    (isSearchOverlay &&
      !isSuggestionPanelActive &&
      !isSearchSessionActive &&
      !isLoading &&
      !shouldRenderSheet);
  const chromeTransitionConfig = React.useMemo(() => {
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
    profileChromeSnaps.expanded,
    profileChromeSnaps.middle,
    saveChromeSnaps.expanded,
    saveChromeSnaps.middle,
    pollsChromeSnaps.expanded,
    pollsChromeSnaps.middle,
    shouldUsePollsChrome,
    sheetTranslateY,
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
  const [scoreInfo, setScoreInfo] = React.useState<{
    type: 'dish' | 'restaurant';
    title: string;
    score: number | null | undefined;
    votes: number | null | undefined;
    polls: number | null | undefined;
  } | null>(null);
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
  React.useEffect(() => {
    resultsSheetHeaderHeightRef.current = resultsSheetHeaderHeight;
  }, [resultsSheetHeaderHeight]);
  React.useEffect(() => {
    if (!filtersHeaderLayout) {
      return;
    }
    const nextHeight = filtersHeaderLayout.height;
    setFiltersHeaderHeight((prev) => (Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight));
  }, [filtersHeaderLayout]);
  const filtersHeaderHeightRef = React.useRef(filtersHeaderHeight);
  React.useEffect(() => {
    filtersHeaderHeightRef.current = filtersHeaderHeight;
  }, [filtersHeaderHeight]);
  const focusPadding = React.useMemo(() => {
    const topPadding = Math.max(searchLayout.top + searchLayout.height + 16, insets.top + 16);
    const visibleSheetHeight = Math.max(0, SCREEN_HEIGHT - snapPoints.middle);
    const bottomPadding = Math.max(visibleSheetHeight + 24, insets.bottom + 140);
    return [topPadding, 64, bottomPadding, 64] as const;
  }, [insets.bottom, insets.top, searchLayout.height, searchLayout.top, snapPoints.middle]);
  const focusPaddingObject = React.useMemo<MapCameraPadding>(
    () => ({
      paddingTop: focusPadding[0],
      paddingRight: focusPadding[1],
      paddingBottom: focusPadding[2],
      paddingLeft: focusPadding[3],
    }),
    [focusPadding]
  );
  const openScoreInfo = React.useCallback(
    (payload: {
      type: 'dish' | 'restaurant';
      title: string;
      score: number | null | undefined;
      votes: number | null | undefined;
      polls: number | null | undefined;
    }) => {
      setScoreInfo(payload);
      setScoreInfoVisible(true);
    },
    []
  );
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
    },
    [handleSheetSnapChange]
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
          requestDockedPollsRestore();
          setTabOverlaySnapRequest(null);
          setOverlay('search');
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

      overlaySwitchInFlightRef.current = true;
      setOverlay(target);
      inputRef.current?.blur();
      requestAnimationFrame(() => {
        overlaySwitchInFlightRef.current = false;
      });
    },
    [
      beginSuggestionCloseHold,
      dismissTransientOverlays,
      requestDockedPollsRestore,
      rootOverlay,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setOverlay,
      setShowSuggestions,
      setSuggestions,
      setTabOverlaySnapRequest,
    ]
  );
  const requestReturnToSearchFromPolls = React.useCallback(
    () => handleOverlaySelect('search'),
    [handleOverlaySelect]
  );
  const handlePollsSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setPollsSheetSnap(snap);
      if (pollsDockedSnapRequest && pollsDockedSnapRequest === snap) {
        setPollsDockedSnapRequest(null);
      }
      if (tabOverlaySnapRequest && tabOverlaySnapRequest === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden') {
        if (rootOverlay === 'search') {
          if (Date.now() < ignoreDockedPollsHiddenUntilMsRef.current) {
            return;
          }
          setIsDockedPollsDismissed(true);
          return;
        }
        setTabOverlaySnapRequest(null);
        // Immediately switch to search when polls overlay is dismissed (unless we're switching tabs).
        if (rootOverlay === 'polls' && !overlaySwitchInFlightRef.current) {
          unstable_batchedUpdates(() => {
            requestDockedPollsRestore();
            setOverlay('search');
          });
        }
      }
    },
    [
      ignoreDockedPollsHiddenUntilMsRef,
      overlaySwitchInFlightRef,
      pollsDockedSnapRequest,
      tabOverlaySnapRequest,
      rootOverlay,
      requestDockedPollsRestore,
      setIsDockedPollsDismissed,
      setOverlay,
      setPollsSheetSnap,
      setPollsDockedSnapRequest,
      setTabOverlaySnapRequest,
    ]
  );

  const requestPollCreationExpand = React.useCallback(() => {
    if (pollsSheetSnap !== 'collapsed') {
      return;
    }
    const desired = hasUserSharedSnap ? sharedSnap : 'expanded';
    setPollCreationSnapRequest(desired);
  }, [hasUserSharedSnap, pollsSheetSnap, sharedSnap]);

  const handlePollCreationSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setPollsSheetSnap(snap);
      if (pollCreationSnapRequest && pollCreationSnapRequest === snap) {
        setPollCreationSnapRequest(null);
      }
    },
    [pollCreationSnapRequest]
  );

  const handleBookmarksSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setBookmarksSheetSnap(snap);
      if (tabOverlaySnapRequest && tabOverlaySnapRequest === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden' && rootOverlay === 'bookmarks' && !overlaySwitchInFlightRef.current) {
        setTabOverlaySnapRequest(null);
        unstable_batchedUpdates(() => {
          requestDockedPollsRestore();
          setOverlay('search');
        });
      }
    },
    [
      overlaySwitchInFlightRef,
      requestDockedPollsRestore,
      rootOverlay,
      setOverlay,
      tabOverlaySnapRequest,
    ]
  );
  const handleProfileSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setProfileSheetSnap(snap);
      if (tabOverlaySnapRequest && tabOverlaySnapRequest === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden' && rootOverlay === 'profile' && !overlaySwitchInFlightRef.current) {
        setTabOverlaySnapRequest(null);
        unstable_batchedUpdates(() => {
          requestDockedPollsRestore();
          setOverlay('search');
        });
      }
    },
    [
      overlaySwitchInFlightRef,
      requestDockedPollsRestore,
      rootOverlay,
      setOverlay,
      tabOverlaySnapRequest,
    ]
  );
  const { runAutocomplete, runSearch, cancelAutocomplete, cancelSearch, isAutocompleteLoading } =
    useSearchRequests();
  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);
  const navItems = React.useMemo(
    () =>
      [
        { key: 'search', label: 'Search' },
        { key: 'polls', label: 'Polls' },
        { key: 'bookmarks', label: 'Favorites' },
        { key: 'profile', label: 'Profile' },
      ] as const,
    []
  );
  type NavItemKey = (typeof navItems)[number]['key'];
  const navIconRenderers = React.useMemo<
    Record<NavItemKey, (color: string, active: boolean) => React.ReactNode>
  >(
    () => ({
      search: (color: string, active: boolean) => {
        const holeRadius = active ? 4.2 : 3.2;
        const pinPath =
          'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';
        const holePath = `M12 10m-${holeRadius},0a${holeRadius},${holeRadius} 0 1,0 ${
          holeRadius * 2
        },0a${holeRadius},${holeRadius} 0 1,0 -${holeRadius * 2},0`;
        return (
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d={`${pinPath} ${holePath}`}
              fill={active ? color : 'none'}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fillRule="evenodd"
              clipRule="evenodd"
            />
          </Svg>
        );
      },
      bookmarks: (color: string, active: boolean) => (
        <Heart
          size={24}
          color={color}
          strokeWidth={active ? 0 : 2}
          fill={active ? color : 'none'}
        />
      ),
      polls: (color: string, active: boolean) => (
        <View
          style={{
            width: 24,
            height: 24,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-90deg' }, { scaleY: -1 }],
          }}
        >
          <ChartNoAxesColumn size={24} color={color} strokeWidth={active ? 2.5 : 2} />
        </View>
      ),
      profile: (color: string, active: boolean) => {
        if (active) {
          return (
            <Svg width={24} height={24} viewBox="0 0 24 24" fill={color} stroke="none">
              <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
              />
            </Svg>
          );
        }
        return (
          <Svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={2}
          >
            <Path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </Svg>
        );
      },
    }),
    []
  );
  const handleSearchHeaderLayout = React.useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      if (searchInteractionRef.current.isInteracting && searchBarFrame) {
        return;
      }
      const { layout } = nativeEvent;
      setSearchBarFrame((prev) => {
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
    },
    [searchBarFrame]
  );
  const handleSearchContainerLayout = React.useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      if (
        searchInteractionRef.current.isInteracting &&
        searchLayout.height > 0 &&
        searchContainerFrame
      ) {
        return;
      }
      const { layout } = nativeEvent;
      if (layout.height > 0) {
        setSearchLayout((prev) => {
          if (prev.top === layout.y && prev.height === layout.height) {
            return prev;
          }
          return { top: layout.y, height: layout.height };
        });
      }

      const isUsableLayout = layout.width > 0 && layout.height > SEARCH_CONTAINER_PADDING_TOP + 0.5;
      if (isUsableLayout) {
        searchContainerLayoutCacheRef.current = layout;
        setSearchContainerFrame((prev) => {
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
      }
    },
    [searchContainerFrame, searchLayout.height]
  );
  const openNow = useSearchStore((state) => state.openNow);
  const setOpenNow = useSearchStore((state) => state.setOpenNow);
  const priceLevels = useSearchStore((state) => state.priceLevels);
  const setPriceLevels = useSearchStore((state) => state.setPriceLevels);
  const votes100Plus = useSearchStore((state) => state.votes100Plus);
  const setVotes100Plus = useSearchStore((state) => state.setVotes100Plus);
  const resetFilters = useSearchStore((state) => state.resetFilters);
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const hasSystemStatusBanner = useSystemStatusStore(
    (state) => state.isOffline || Boolean(state.serviceIssue)
  );
  const [pendingPriceRange, setPendingPriceRange] = React.useState<PriceRangeTuple>(() =>
    getRangeFromLevels(priceLevels)
  );
  const priceFiltersActive = priceLevels.length > 0;
  const priceButtonSummary = React.useMemo(() => {
    if (!priceLevels.length) {
      return 'Any price';
    }
    return formatPriceRangeSummary(getRangeFromLevels(priceLevels));
  }, [priceLevels]);
  const priceButtonLabelText = priceFiltersActive ? priceButtonSummary : 'Price';
  const priceSheetSummary = React.useMemo(
    () => formatPriceRangeSummary(pendingPriceRange),
    [pendingPriceRange]
  );
  const priceSheetHeadline = React.useMemo(
    () => `${priceSheetSummary} per person`,
    [priceSheetSummary]
  );
  const hasRecentSearches = recentSearches.length > 0;
  const hasRecentlyViewedRestaurants = recentlyViewedRestaurants.length > 0;
  const hasRecentlyViewedFoods = recentlyViewedFoods.length > 0;
  const trimmedQuery = query.trim();
  const hasSearchChromeRawQuery = trimmedQuery.length > 0;
  const isSuggestionScreenActive = isSuggestionPanelActive;
  React.useEffect(() => {
    if (isSuggestionPanelActive) {
      setSearchTransitionVariant('default');
      if (
        submitTransitionHoldRef.current.active &&
        submitTransitionHoldRef.current.query !== query
      ) {
        submitTransitionHoldRef.current = {
          active: false,
          query: '',
          suggestions: [] as AutocompleteMatch[],
          recentSearches: [] as RecentSearch[],
          recentlyViewedRestaurants: [] as RecentlyViewedRestaurant[],
          recentlyViewedFoods: [] as RecentlyViewedFood[],
          isRecentLoading: false,
          isRecentlyViewedLoading: false,
          isRecentlyViewedFoodsLoading: false,
          holdShortcuts: false,
          holdSuggestionPanel: false,
          holdSuggestionBackground: false,
          holdAutocomplete: false,
          holdRecent: false,
        };
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }
  }, [
    isSuggestionPanelActive,
    query,
    setSearchTransitionVariant,
    setSuggestions,
    setShowSuggestions,
  ]);
  const isSuggestionScreenVisible = isSuggestionPanelVisible;
  React.useEffect(() => {
    if (suggestionLayoutHoldTimeoutRef.current) {
      clearTimeout(suggestionLayoutHoldTimeoutRef.current);
      suggestionLayoutHoldTimeoutRef.current = null;
    }
    if (isSuggestionPanelActive || isSuggestionPanelVisible) {
      if (!isSuggestionLayoutWarm) {
        setIsSuggestionLayoutWarm(true);
      }
      return;
    }
    if (!isSuggestionLayoutWarm) {
      return;
    }
    suggestionLayoutHoldTimeoutRef.current = setTimeout(() => {
      setIsSuggestionLayoutWarm(false);
    }, SUGGESTION_PANEL_LAYOUT_HOLD_MS);
    return () => {
      if (suggestionLayoutHoldTimeoutRef.current) {
        clearTimeout(suggestionLayoutHoldTimeoutRef.current);
        suggestionLayoutHoldTimeoutRef.current = null;
      }
    };
  }, [isSuggestionLayoutWarm, isSuggestionPanelActive, isSuggestionPanelVisible]);
  const shouldDriveSuggestionLayout =
    isSuggestionPanelActive || isSuggestionPanelVisible || isSuggestionLayoutWarm;
  const submitTransitionHold = submitTransitionHoldRef.current;
  const isSuggestionClosing = isSuggestionPanelVisible && !isSuggestionPanelActive;
  const prevHasSearchChromeRawQueryRef = React.useRef(hasSearchChromeRawQuery);
  const shouldInstantSuggestionSpacing =
    isSuggestionPanelActive &&
    !isSuggestionClosing &&
    prevHasSearchChromeRawQueryRef.current !== hasSearchChromeRawQuery;
  React.useEffect(() => {
    prevHasSearchChromeRawQueryRef.current = hasSearchChromeRawQuery;
  }, [hasSearchChromeRawQuery]);
  const isSuggestionHoldActive = isSuggestionClosing && submitTransitionHold.active;
  const suggestionDisplayQuery = isSuggestionHoldActive ? submitTransitionHold.query : query;
  const suggestionDisplaySuggestions = isSuggestionHoldActive
    ? submitTransitionHold.suggestions
    : suggestions;
  const recentSearchesDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentSearches
    : recentSearches;
  const recentlyViewedRestaurantsDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentlyViewedRestaurants
    : recentlyViewedRestaurants;
  const recentlyViewedFoodsDisplay = isSuggestionHoldActive
    ? submitTransitionHold.recentlyViewedFoods
    : recentlyViewedFoods;
  const isRecentLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentLoading
    : isRecentLoading;
  const isRecentlyViewedLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentlyViewedLoading
    : isRecentlyViewedLoading;
  const isRecentlyViewedFoodsLoadingDisplay = isSuggestionHoldActive
    ? submitTransitionHold.isRecentlyViewedFoodsLoading
    : isRecentlyViewedFoodsLoading;
  const hasRecentSearchesDisplay = recentSearchesDisplay.length > 0;
  const hasRecentlyViewedRestaurantsDisplay = recentlyViewedRestaurantsDisplay.length > 0;
  const hasRecentlyViewedFoodsDisplay = recentlyViewedFoodsDisplay.length > 0;
  const suggestionDisplayTrimmedQuery = suggestionDisplayQuery.trim();
  const hasTypedQuery = suggestionDisplayTrimmedQuery.length > 0;
  const hasRawQuery = suggestionDisplayQuery.length > 0;
  const shouldHoldAutocomplete = isSuggestionHoldActive && submitTransitionHold.holdAutocomplete;
  const shouldHoldRecent = isSuggestionHoldActive && submitTransitionHold.holdRecent;
  const shouldHoldSuggestionPanel =
    isSuggestionHoldActive && submitTransitionHold.holdSuggestionPanel;
  const shouldHoldSuggestionBackground =
    isSuggestionHoldActive && submitTransitionHold.holdSuggestionBackground;
  const shouldHoldShortcuts = isSuggestionHoldActive && submitTransitionHold.holdShortcuts;
  const shouldForceHideShortcuts =
    shouldDriveSuggestionLayout &&
    hasSearchChromeRawQuery &&
    isSearchSessionActive &&
    !isSuggestionHoldActive;
  const shouldSuppressRestaurantOverlay =
    isRestaurantOverlayVisible && (isSuggestionPanelActive || isSuggestionPanelVisible);
  const shouldEnableRestaurantOverlayInteraction = !shouldSuppressRestaurantOverlay;
  const shouldFreezeSuggestionHeader =
    shouldDriveSuggestionLayout && !isSuggestionPanelActive && hasSearchChromeRawQuery;
  const baseShouldShowRecentSection = shouldDriveSuggestionLayout && !hasTypedQuery;
  const baseShouldRenderRecentSection =
    baseShouldShowRecentSection &&
    (hasRecentSearches ||
      hasRecentlyViewedRestaurants ||
      hasRecentlyViewedFoods ||
      isRecentLoading ||
      isRecentlyViewedLoading ||
      isRecentlyViewedFoodsLoading);
  const baseShouldRenderAutocompleteSection =
    shouldDriveSuggestionLayout &&
    !isAutocompleteSuppressed &&
    suggestionDisplayTrimmedQuery.length >= AUTOCOMPLETE_MIN_CHARS;
  const shouldRenderRecentSection =
    shouldHoldRecent || (!isSuggestionClosing && baseShouldRenderRecentSection);
  const shouldSuppressAutocompletePanelWhileLoading =
    !isSuggestionClosing &&
    baseShouldRenderAutocompleteSection &&
    isAutocompleteLoading &&
    suggestions.length === 0;
  const shouldRenderAutocompleteSection =
    shouldHoldAutocomplete ||
    (!isSuggestionClosing &&
      baseShouldRenderAutocompleteSection &&
      !shouldSuppressAutocompletePanelWhileLoading);
  const shouldRenderSuggestionPanel =
    shouldHoldSuggestionPanel || shouldRenderAutocompleteSection || shouldRenderRecentSection;
  const shouldShowAutocompleteSpinnerInBar =
    baseShouldRenderAutocompleteSection && isAutocompleteLoading;
  const shouldShowSuggestionBackground =
    shouldDriveSuggestionLayout || shouldHoldSuggestionBackground;
  const shouldShowSuggestionSurface = shouldDriveSuggestionLayout;
  const shouldLockSearchChromeTransform = isSuggestionPanelActive || isSuggestionPanelVisible;
  React.useEffect(() => {
    if (!isSuggestionPanelVisible) {
      shortcutContentFadeMode.value = SHORTCUT_CONTENT_FADE_DEFAULT;
    }
  }, [isSuggestionPanelVisible, shortcutContentFadeMode]);
  React.useEffect(() => {
    if (shouldDriveSuggestionLayout) {
      return;
    }
    if (submitTransitionHoldRef.current.active) {
      submitTransitionHoldRef.current = {
        active: false,
        query: '',
        suggestions: [] as AutocompleteMatch[],
        recentSearches: [] as RecentSearch[],
        recentlyViewedRestaurants: [] as RecentlyViewedRestaurant[],
        recentlyViewedFoods: [] as RecentlyViewedFood[],
        isRecentLoading: false,
        isRecentlyViewedLoading: false,
        isRecentlyViewedFoodsLoading: false,
        holdShortcuts: false,
        holdSuggestionPanel: false,
        holdSuggestionBackground: false,
        holdAutocomplete: false,
        holdRecent: false,
      };
    }
    setSuggestions([]);
    setShowSuggestions(false);
  }, [setSuggestions, setShowSuggestions, shouldDriveSuggestionLayout]);
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
      requestDockedPollsRestore();
    }
  }, [requestDockedPollsRestore, showDockedPolls]);
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
    (isSearchOverlay ? isSuggestionPanelActive || !isSearchSessionActive : true) &&
    !hasSearchChromeRawQuery;
  const shouldRenderSearchShortcuts =
    (shouldShowSearchShortcuts || shouldHoldShortcuts) && !shouldForceHideShortcuts;
  const shouldUseSearchShortcutFrames = shouldRenderSearchShortcuts || shouldShowSearchShortcuts;
  const shouldIncludeShortcutHoles = shouldRenderSearchShortcuts;
  const shouldIncludeShortcutLayout = shouldRenderSearchShortcuts;
  const resolvedSearchShortcutsFrame = React.useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return null;
    }
    if (searchShortcutsFrame) {
      return searchShortcutsFrame;
    }
    return searchShortcutsLayoutCacheRef.current.frame;
  }, [searchShortcutsFrame, shouldUseSearchShortcutFrames]);
  const resolvedSearchShortcutChipFrames = React.useMemo(() => {
    if (!shouldUseSearchShortcutFrames) {
      return {};
    }
    const cachedFrames = searchShortcutsLayoutCacheRef.current.chipFrames;
    return { ...cachedFrames, ...searchShortcutChipFrames };
  }, [searchShortcutChipFrames, shouldUseSearchShortcutFrames]);
  const resolvedSearchContainerFrame = React.useMemo(() => {
    const isUsable = (frame: LayoutRectangle | null) =>
      Boolean(frame && frame.width > 0 && frame.height > SEARCH_CONTAINER_PADDING_TOP + 0.5);

    if (isUsable(searchContainerFrame)) {
      return searchContainerFrame;
    }
    const cached = searchContainerLayoutCacheRef.current;
    if (isUsable(cached)) {
      return cached;
    }
    return null;
  }, [searchContainerFrame]);
  const captureSuggestionTransitionHold = React.useCallback(
    (overrides?: {
      holdAutocomplete?: boolean;
      holdRecent?: boolean;
      holdSuggestionPanel?: boolean;
      holdSuggestionBackground?: boolean;
      holdShortcuts?: boolean;
    }) => {
      if (!shouldDriveSuggestionLayout) {
        return false;
      }
      const holdAutocomplete = overrides?.holdAutocomplete ?? shouldRenderAutocompleteSection;
      const holdRecent = overrides?.holdRecent ?? shouldRenderRecentSection;
      const holdSuggestionPanel = overrides?.holdSuggestionPanel ?? shouldRenderSuggestionPanel;
      const holdSuggestionBackground =
        overrides?.holdSuggestionBackground ?? shouldShowSuggestionBackground;
      const holdShortcuts = overrides?.holdShortcuts ?? false;
      submitTransitionHoldRef.current = {
        active: true,
        query,
        suggestions: suggestions.slice(),
        recentSearches,
        recentlyViewedRestaurants,
        recentlyViewedFoods,
        isRecentLoading,
        isRecentlyViewedLoading,
        isRecentlyViewedFoodsLoading,
        holdShortcuts,
        holdSuggestionPanel,
        holdSuggestionBackground,
        holdAutocomplete,
        holdRecent,
      };
      return true;
    },
    [
      shouldDriveSuggestionLayout,
      query,
      suggestions,
      recentSearches,
      recentlyViewedRestaurants,
      recentlyViewedFoods,
      isRecentLoading,
      isRecentlyViewedLoading,
      isRecentlyViewedFoodsLoading,
      shouldRenderAutocompleteSection,
      shouldRenderRecentSection,
      shouldRenderSuggestionPanel,
      shouldShowSuggestionBackground,
    ]
  );
  const beginSubmitTransition = React.useCallback(() => {
    const didHold = captureSuggestionTransitionHold({
      holdShortcuts: shouldShowSearchShortcuts,
    });
    if (didHold) {
      shortcutContentFadeMode.value = shouldShowSearchShortcuts
        ? SHORTCUT_CONTENT_FADE_OUT
        : SHORTCUT_CONTENT_FADE_DEFAULT;
      setSearchTransitionVariant('submitting');
    } else {
      shortcutContentFadeMode.value = SHORTCUT_CONTENT_FADE_DEFAULT;
    }
    return didHold;
  }, [
    captureSuggestionTransitionHold,
    setSearchTransitionVariant,
    shouldShowSearchShortcuts,
    shortcutContentFadeMode,
  ]);
  const beginSuggestionCloseHold = React.useCallback(
    (variant: 'default' | 'submitting' = 'default') => {
      const didHold = captureSuggestionTransitionHold();
      if (didHold) {
        setSearchTransitionVariant(variant);
      }
      return didHold;
    },
    [captureSuggestionTransitionHold, setSearchTransitionVariant]
  );
  const fallbackHeaderContentBottom = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    if (searchLayout.height <= 0) {
      return 0;
    }
    return searchLayout.top + searchLayout.height + SEARCH_BAR_HOLE_PADDING + CUTOUT_EDGE_SLOP;
  }, [shouldDriveSuggestionLayout, searchLayout.height, searchLayout.top]);
  const suggestionHeaderContentBottom = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    if (shouldFreezeSuggestionHeader && suggestionHeaderContentBottomRef.current > 0) {
      return suggestionHeaderContentBottomRef.current;
    }
    if (
      shouldIncludeShortcutLayout &&
      !resolvedSearchShortcutsFrame &&
      suggestionHeaderContentBottomRef.current > 0
    ) {
      return suggestionHeaderContentBottomRef.current;
    }

    if (shouldIncludeShortcutLayout && resolvedSearchShortcutsFrame) {
      return (
        resolvedSearchShortcutsFrame.y +
        resolvedSearchShortcutsFrame.height +
        SHORTCUT_CHIP_HOLE_PADDING +
        CUTOUT_EDGE_SLOP
      );
    }
    if (resolvedSearchContainerFrame) {
      return (
        resolvedSearchContainerFrame.y +
        resolvedSearchContainerFrame.height +
        SEARCH_BAR_HOLE_PADDING +
        CUTOUT_EDGE_SLOP
      );
    }
    return fallbackHeaderContentBottom;
  }, [
    fallbackHeaderContentBottom,
    resolvedSearchShortcutsFrame,
    resolvedSearchContainerFrame,
    shouldDriveSuggestionLayout,
    shouldIncludeShortcutLayout,
    shouldFreezeSuggestionHeader,
  ]);
  React.useEffect(() => {
    if (!shouldFreezeSuggestionHeader && suggestionHeaderContentBottom > 0) {
      suggestionHeaderContentBottomRef.current = suggestionHeaderContentBottom;
    }
  }, [shouldFreezeSuggestionHeader, suggestionHeaderContentBottom]);
  const suggestionHeaderHeightTarget = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return 0;
    }
    const contentBottom =
      suggestionHeaderContentBottom > 0
        ? suggestionHeaderContentBottom
        : suggestionHeaderContentBottomRef.current;
    if (contentBottom <= 0) {
      return 0;
    }
    const paddedBottom = contentBottom + SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM;
    return Math.max(0, ceilToPixel(paddedBottom));
  }, [shouldDriveSuggestionLayout, suggestionHeaderContentBottom]);
  const headerPaddingOverlap = SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP;
  const suggestionScrollTopTarget = React.useMemo(() => {
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
    shouldDriveSuggestionLayout,
    searchLayout.height,
    searchLayout.top,
    headerPaddingOverlap,
    suggestionHeaderHeightTarget,
    SEARCH_SUGGESTION_HEADER_PANEL_GAP,
  ]);
  const suggestionScrollMaxHeightTarget = React.useMemo(() => {
    if (!shouldDriveSuggestionLayout) {
      return undefined;
    }
    const available =
      SCREEN_HEIGHT - suggestionScrollTopTarget - SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM;
    return available > 0 ? available : undefined;
  }, [shouldDriveSuggestionLayout, suggestionScrollTopTarget]);
  const suggestionTopFillHeight = React.useMemo(() => {
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
  const suggestionSpacingDuration = isSuggestionPanelActive
    ? SUGGESTION_PANEL_FADE_IN_MS
    : SUGGESTION_PANEL_FADE_OUT_MS;
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
    const visibility = shouldRenderSearchShortcuts ? 1 : 0;
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
    isSuggestionPanelVisible,
    searchTransitionVariant,
    shouldLockSearchChromeTransform,
    shouldRenderSearchShortcuts,
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
  const priceButtonIsActive = priceFiltersActive || isPriceSelectorVisible;
  const votesFilterActive = votes100Plus;
  const canLoadMore =
    Boolean(results) && !isPaginationExhausted && (hasMoreFood || hasMoreRestaurants);
  const shouldShowSearchThisArea =
    isSearchOverlay &&
    !isSuggestionPanelActive &&
    isSearchSessionActive &&
    mapMovedSinceSearch &&
    !isLoading &&
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
  const showCachedSuggestionsIfFresh = React.useCallback(
    (trimmed: string) => {
      const now = Date.now();
      const cachedQuery = lastAutocompleteQueryRef.current;
      const cachedResults = lastAutocompleteResultsRef.current;
      const cachedAt = lastAutocompleteTimestampRef.current;
      const cacheIsFresh = cachedQuery === trimmed && now - cachedAt <= AUTOCOMPLETE_CACHE_TTL_MS;

      if (cacheIsFresh) {
        setSuggestions(cachedResults);
        setShowSuggestions(cachedResults.length > 0);
        cancelAutocomplete();
        return true;
      }
      return false;
    },
    [cancelAutocomplete]
  );
  const pendingRecentSearchUpsertsRef = React.useRef<
    Array<Parameters<typeof updateLocalRecentSearches>[0]>
  >([]);
  const flushPendingRecentSearchUpserts = React.useCallback(() => {
    if (pendingRecentSearchUpsertsRef.current.length === 0) {
      return;
    }
    const pending = pendingRecentSearchUpsertsRef.current.splice(0);
    pending.forEach((value) => updateLocalRecentSearches(value));
  }, [updateLocalRecentSearches]);
  React.useEffect(() => {
    if (isSuggestionPanelActive || isSuggestionPanelVisible) {
      return;
    }
    flushPendingRecentSearchUpserts();
  }, [flushPendingRecentSearchUpserts, isSuggestionPanelActive, isSuggestionPanelVisible]);
  const deferRecentSearchUpsert = React.useCallback(
    (value: Parameters<typeof updateLocalRecentSearches>[0]) => {
      if (isSuggestionPanelActive || isSuggestionPanelVisible) {
        pendingRecentSearchUpsertsRef.current.push(value);
        return;
      }
      updateLocalRecentSearches(value);
    },
    [isSuggestionPanelActive, isSuggestionPanelVisible, updateLocalRecentSearches]
  );

  const pendingRecentlyViewedTrackRef = React.useRef<
    Array<{ restaurantId: string; restaurantName: string }>
  >([]);
  const flushPendingRecentlyViewedTrack = React.useCallback(() => {
    if (pendingRecentlyViewedTrackRef.current.length === 0) {
      return;
    }
    const pending = pendingRecentlyViewedTrackRef.current.splice(0);
    pending.forEach(({ restaurantId, restaurantName }) =>
      trackRecentlyViewedRestaurant(restaurantId, restaurantName)
    );
  }, [trackRecentlyViewedRestaurant]);
  React.useEffect(() => {
    if (isSuggestionPanelActive || isSuggestionPanelVisible) {
      return;
    }
    flushPendingRecentlyViewedTrack();
  }, [flushPendingRecentlyViewedTrack, isSuggestionPanelActive, isSuggestionPanelVisible]);
  const deferRecentlyViewedTrack = React.useCallback(
    (restaurantId: string, restaurantName: string) => {
      if (isSuggestionPanelActive || isSuggestionPanelVisible) {
        pendingRecentlyViewedTrackRef.current.push({ restaurantId, restaurantName });
        return;
      }
      trackRecentlyViewedRestaurant(restaurantId, restaurantName);
    },
    [isSuggestionPanelActive, isSuggestionPanelVisible, trackRecentlyViewedRestaurant]
  );
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
    shortcutQuerySyncTaskRef.current = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        setQuery(nextQuery);
      });
    });
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
  React.useEffect(
    () => () => {
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current);
      }
      if (toggleFilterDebounceRef.current) {
        clearTimeout(toggleFilterDebounceRef.current);
      }
      if (suggestionScrollDismissTimeoutRef.current) {
        clearTimeout(suggestionScrollDismissTimeoutRef.current);
        suggestionScrollDismissTimeoutRef.current = null;
      }
    },
    []
  );
  const startLocationWatch = React.useCallback(async () => {
    if (locationWatchRef.current) {
      return;
    }
    try {
      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 20_000,
          distanceInterval: 50,
        },
        (update) => {
          const nextCoords: Coordinate = {
            lat: update.coords.latitude,
            lng: update.coords.longitude,
          };
          userLocationIsCachedRef.current = false;
          userLocationRef.current = nextCoords;
          setUserLocation(nextCoords);
        }
      );
    } catch (watchError) {
      logger.warn('Failed to start location watcher', {
        message: watchError instanceof Error ? watchError.message : 'unknown',
      });
    }
  }, []);
  const ensureUserLocation = React.useCallback(async (): Promise<Coordinate | null> => {
    if (userLocationRef.current && !userLocationIsCachedRef.current) {
      return userLocationRef.current;
    }
    if (locationRequestInFlightRef.current) {
      return userLocationRef.current;
    }

    locationRequestInFlightRef.current = true;
    try {
      const existingPermission = await Location.getForegroundPermissionsAsync();
      let status = existingPermission.status;
      if (status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        status = requested.status;
      }

      if (status !== 'granted') {
        setLocationPermissionDenied(true);
        return null;
      }
      setLocationPermissionDenied(false);

      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          const coords: Coordinate = {
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
          };
          userLocationIsCachedRef.current = false;
          setUserLocation(coords);
          userLocationRef.current = coords;
        }
      } catch {
        // ignore
      }

      await startLocationWatch();

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: 60_000,
      });

      const coords: Coordinate = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      userLocationIsCachedRef.current = false;
      setUserLocation(coords);
      userLocationRef.current = coords;

      return coords;
    } catch (locationError) {
      logger.warn('Failed to capture user location', {
        message: locationError instanceof Error ? locationError.message : 'unknown',
      });
      return userLocationRef.current;
    } finally {
      locationRequestInFlightRef.current = false;
    }
  }, [startLocationWatch]);
  React.useEffect(() => {
    void ensureUserLocation();
  }, [ensureUserLocation]);
  React.useEffect(() => {
    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  const handleQueryChange = React.useCallback((value: string) => {
    setIsAutocompleteSuppressed(false);
    setQuery(value);
  }, []);
  const restaurants = results?.restaurants ?? EMPTY_RESTAURANTS;
  const dishes = results?.dishes ?? EMPTY_DISHES;
  const resultsHydrationCandidate =
    results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? null;
  const [shouldAnimateMarkerReveal, setShouldAnimateMarkerReveal] = React.useState(false);
  const lastMarkerRevealKeyRef = React.useRef<string | null>(null);
  const markerRevealTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!results) {
      setShouldAnimateMarkerReveal(false);
      lastMarkerRevealKeyRef.current = null;
      if (markerRevealTimeoutRef.current) {
        clearTimeout(markerRevealTimeoutRef.current);
        markerRevealTimeoutRef.current = null;
      }
      return;
    }
    if (results.metadata.page !== 1) {
      return;
    }
    if (
      !resultsHydrationCandidate ||
      lastMarkerRevealKeyRef.current === resultsHydrationCandidate
    ) {
      return;
    }
    lastMarkerRevealKeyRef.current = resultsHydrationCandidate;
    setShouldAnimateMarkerReveal(true);
    if (markerRevealTimeoutRef.current) {
      clearTimeout(markerRevealTimeoutRef.current);
      markerRevealTimeoutRef.current = null;
    }
  }, [results, resultsHydrationCandidate]);
  const [markerRestaurants, setMarkerRestaurants] =
    React.useState<RestaurantResult[]>(EMPTY_RESTAURANTS);
  const [isMarkerDotHeavyMode, setIsMarkerDotHeavyMode] = React.useState(false);
  const [hydratedResultsKey, setHydratedResultsKey] = React.useState<string | null>(null);
  const resultsHydrationKey = results
    ? results.metadata.page === 1
      ? resultsHydrationCandidate
      : hydratedResultsKey
    : null;
  const shouldHydrateResults =
    resultsHydrationKey != null && resultsHydrationKey !== hydratedResultsKey;
  const markerUpdateSeqRef = React.useRef(0);
  const markerUpdateTaskRef = React.useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const resultsHydrationTaskRef = React.useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const shortcutQuerySyncTaskRef = React.useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const isPerfDebugEnabled = searchPerfDebug.enabled;
  const shouldDisableSearchBlur = isPerfDebugEnabled && searchPerfDebug.disableBlur;
  const forceDisableMarkerViews = false;
  const shouldDisableMarkerViews =
    forceDisableMarkerViews || (isPerfDebugEnabled && searchPerfDebug.disableMarkerViews);
  const shouldUsePlaceholderRows = isPerfDebugEnabled && searchPerfDebug.usePlaceholderRows;
  const shouldDisableFiltersHeader = isPerfDebugEnabled && searchPerfDebug.disableFiltersHeader;
  const shouldDisableResultsHeader = isPerfDebugEnabled && searchPerfDebug.disableResultsHeader;
  const shouldDisableSearchShortcuts = isPerfDebugEnabled && searchPerfDebug.disableSearchShortcuts;
  const shouldLogJsStalls = isPerfDebugEnabled && searchPerfDebug.logJsStalls;
  const jsStallMinMs = searchPerfDebug.logJsStallMinMs;
  const shouldLogMapEventRates = isPerfDebugEnabled && searchPerfDebug.logMapEventRates;
  const mapEventLogIntervalMs = searchPerfDebug.logMapEventIntervalMs;
  const shouldLogSearchComputes = isPerfDebugEnabled && searchPerfDebug.logSearchComputes;
  const searchComputeMinMs = searchPerfDebug.logSearchComputeMinMs;
  const shouldLogSearchStateChanges = isPerfDebugEnabled && searchPerfDebug.logSearchStateChanges;
  const shouldLogSearchStateWhenSettlingOnly =
    isPerfDebugEnabled && searchPerfDebug.logSearchStateWhenSettlingOnly;
  const shouldLogSuggestionOverlayState = searchPerfDebug.logSuggestionOverlayState;
  const shouldLogResultsViewability = isPerfDebugEnabled && searchPerfDebug.logResultsViewability;
  const shouldLogProfiler = isPerfDebugEnabled && searchPerfDebug.logCommitInfo;
  const profilerMinMs = searchPerfDebug.logCommitMinMs;
  const getPerfNow = React.useCallback(() => {
    if (typeof performance?.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }, []);
  const logSearchCompute = React.useCallback(
    (label: string, duration: number) => {
      if (!shouldLogSearchComputes || duration < searchComputeMinMs) {
        return;
      }
      const interactionState = searchInteractionRef.current;
      // eslint-disable-next-line no-console
      console.log(
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

    const apply = () => {
      if (markerUpdateSeqRef.current !== nextSeq) {
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
  }, [restaurants, shouldDisableMarkerViews]);
  const handleProfilerRender = React.useCallback(
    (id: string, phase: 'mount' | 'update', actualDuration: number, baseDuration: number) => {
      if (!shouldLogProfiler || actualDuration < profilerMinMs) {
        return;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[SearchPerf] Profiler ${id} ${phase} actual=${actualDuration.toFixed(
          1
        )}ms base=${baseDuration.toFixed(1)}ms`
      );
    },
    [profilerMinMs, shouldLogProfiler]
  );
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
      isPriceSelectorVisible,
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
    isPriceSelectorVisible,
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
      console.log(
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
    console.log('[SearchOverlayDebug]', suggestionOverlayDebugSnapshot);
  }, [shouldLogSuggestionOverlayState, suggestionOverlayDebugSnapshot]);
  React.useEffect(() => {
    if (!shouldLogJsStalls) {
      return;
    }
    const intervalMs = 100;
    const logIntervalMs = 500;
    let lastTick = getPerfNow();
    let lastLog = lastTick;
    let maxDrift = 0;
    let stallCount = 0;
    const handle = setInterval(() => {
      const now = getPerfNow();
      const drift = now - lastTick - intervalMs;
      if (drift > jsStallMinMs) {
        maxDrift = Math.max(maxDrift, drift);
        stallCount += 1;
      }
      if (stallCount > 0 && now - lastLog >= logIntervalMs) {
        const interactionState = searchInteractionRef.current;
        // eslint-disable-next-line no-console
        console.log(
          `[SearchPerf] JS stall max=${maxDrift.toFixed(1)}ms count=${stallCount} drag=${
            interactionState.isResultsSheetDragging
          } scroll=${interactionState.isResultsListScrolling} settle=${
            interactionState.isResultsSheetSettling
          }`
        );
        lastLog = now;
        maxDrift = 0;
        stallCount = 0;
      }
      lastTick = now;
    }, intervalMs);
    return () => clearInterval(handle);
  }, [getPerfNow, jsStallMinMs, shouldLogJsStalls]);
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
  const onDemandMessage = React.useMemo(() => {
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
  const onDemandNotice = React.useMemo(() => {
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

  const restaurantsById = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const map = new Map<string, RestaurantResult>();

    restaurants.forEach((restaurant) => {
      const locationList: Array<{ latitude?: number | null; longitude?: number | null }> =
        Array.isArray(restaurant.locations) ? restaurant.locations : [];
      const displayLocation =
        restaurant.displayLocation ??
        locationList.find(
          (loc) => typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
        );
      if (
        !displayLocation ||
        typeof displayLocation.latitude !== 'number' ||
        typeof displayLocation.longitude !== 'number'
      ) {
        logger.error('Restaurant missing coordinates', {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
        });
        return;
      }
      map.set(restaurant.restaurantId, restaurant);
    });

    dishes.forEach((dish) => {
      // With dual queries, dishes may reference restaurants not in top 20 restaurants list.
      // Dishes now have their own coordinates (restaurantLatitude/restaurantLongitude).
      // Only log if the dish itself lacks coordinates.
      if (
        !map.has(dish.restaurantId) &&
        (typeof dish.restaurantLatitude !== 'number' ||
          typeof dish.restaurantLongitude !== 'number')
      ) {
        logger.warn('Dish lacks restaurant coordinates', {
          dishId: dish.connectionId,
          restaurantId: dish.restaurantId,
          restaurantName: dish.restaurantName,
        });
      }
    });

    if (shouldLogSearchComputes) {
      logSearchCompute('restaurantsById', getPerfNow() - start);
    }
    return map;
  }, [dishes, getPerfNow, logSearchCompute, restaurants, shouldLogSearchComputes]);

  React.useEffect(() => {
    if (!isSuggestionScreenActive || isAutocompleteSuppressed) {
      if (!isSuggestionScreenVisible) {
        setSuggestions([]);
        setShowSuggestions(false);
      }
      cancelAutocomplete();
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < AUTOCOMPLETE_MIN_CHARS) {
      setSuggestions([]);
      setShowSuggestions(false);
      cancelAutocomplete();
      return;
    }

    const usedCache = showCachedSuggestionsIfFresh(trimmed);
    if (usedCache) {
      return;
    }

    const requestSeq = (autocompleteRequestSeqRef.current += 1);
    let isActive = true;
    runAutocomplete(trimmed, {
      debounceMs: 250,
      bounds: latestBoundsRef.current,
      userLocation: userLocationRef.current,
    })
      .then((matches) => {
        if (!isActive) {
          return;
        }
        if (suppressAutocompleteResultsRef.current) {
          return;
        }
        if (requestSeq !== autocompleteRequestSeqRef.current) {
          return;
        }
        setSuggestions(matches);
        setShowSuggestions(matches.length > 0);
        lastAutocompleteQueryRef.current = trimmed;
        lastAutocompleteResultsRef.current = matches;
        lastAutocompleteTimestampRef.current = Date.now();
      })
      .catch((err) => {
        if (!isActive) {
          return;
        }
        if (suppressAutocompleteResultsRef.current) {
          return;
        }
        if (requestSeq !== autocompleteRequestSeqRef.current) {
          return;
        }
        logger.warn('Autocomplete request failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        setSuggestions([]);
        setShowSuggestions(false);
      });
    return () => {
      isActive = false;
      cancelAutocomplete();
    };
  }, [
    isSuggestionScreenActive,
    isSuggestionScreenVisible,
    isAutocompleteSuppressed,
    query,
    showCachedSuggestionsIfFresh,
    cancelAutocomplete,
    runAutocomplete,
  ]);

  const resolveRestaurantMapLocations = React.useCallback((restaurant: RestaurantResult) => {
    const fallbackLocation =
      typeof restaurant.latitude === 'number' && typeof restaurant.longitude === 'number'
        ? {
            locationId: restaurant.restaurantLocationId ?? restaurant.restaurantId,
            latitude: restaurant.latitude,
            longitude: restaurant.longitude,
          }
        : null;
    const displayLocation = restaurant.displayLocation ?? null;
    const listLocations =
      Array.isArray(restaurant.locations) && restaurant.locations.length > 0
        ? restaurant.locations
        : [];
    const primaryLocation =
      displayLocation ?? (listLocations.length > 0 ? listLocations[0] : fallbackLocation);
    const seen = new Set<string>();
    const resolved: Array<{
      locationId: string;
      latitude: number;
      longitude: number;
      isPrimary: boolean;
      locationIndex: number;
    }> = [];

    const addLocation = (
      location: { latitude: number; longitude: number; locationId?: string } | null,
      options: { isPrimary: boolean; locationIndex: number }
    ) => {
      if (
        !location ||
        typeof location.latitude !== 'number' ||
        !Number.isFinite(location.latitude) ||
        typeof location.longitude !== 'number' ||
        !Number.isFinite(location.longitude)
      ) {
        return;
      }
      const dedupeKey = `${Math.round(location.latitude * 1e5)}:${Math.round(
        location.longitude * 1e5
      )}`;
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      const locationId =
        location.locationId ?? `${restaurant.restaurantId}-loc-${options.locationIndex}`;
      resolved.push({
        locationId,
        latitude: location.latitude,
        longitude: location.longitude,
        isPrimary: options.isPrimary,
        locationIndex: options.locationIndex,
      });
    };

    if (primaryLocation) {
      addLocation(primaryLocation, { isPrimary: true, locationIndex: 0 });
    }

    listLocations.forEach((location, index) => {
      addLocation(location, { isPrimary: false, locationIndex: index + 1 });
    });

    return resolved;
  }, []);

  const buildMarkerKey = React.useCallback(
    (feature: Feature<Point, RestaurantFeatureProperties>) =>
      feature.id?.toString() ?? `${feature.properties.restaurantId}-${feature.properties.rank}`,
    []
  );
  const markerCatalog = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const entries: Array<{
      feature: Feature<Point, RestaurantFeatureProperties>;
      rank: number;
      locationIndex: number;
    }> = [];
    let primaryCount = 0;
    const isDishesTab = activeTab === 'dishes';

    if (isDishesTab) {
      // Dish mode: generate pins from dishes, grouped by restaurant location
      // Each restaurant location shows only the highest-ranked dish
      const dishesByLocation = new Map<string, { dish: FoodResult; rank: number }>();

      dishes.forEach((dish, dishIndex) => {
        if (restaurantOnlyId && dish.restaurantId !== restaurantOnlyId) {
          return;
        }
        // Skip dishes without coordinates
        if (
          typeof dish.restaurantLatitude !== 'number' ||
          typeof dish.restaurantLongitude !== 'number'
        ) {
          return;
        }

        const locationKey = `${dish.restaurantId}-${dish.restaurantLatitude.toFixed(
          6
        )}-${dish.restaurantLongitude.toFixed(6)}`;
        const rank = dishIndex + 1;

        // Keep only the highest-ranked dish at each location
        if (!dishesByLocation.has(locationKey)) {
          dishesByLocation.set(locationKey, { dish, rank });
        }
      });

      // Convert grouped dishes to features
      dishesByLocation.forEach(({ dish, rank }, _locationKey) => {
        const pinColor = getQualityColorFromPercentile(dish.displayPercentile);
        const featureId = `dish-${dish.connectionId}`;
        const feature: Feature<Point, RestaurantFeatureProperties> = {
          type: 'Feature',
          id: featureId,
          geometry: {
            type: 'Point',
            coordinates: [dish.restaurantLongitude!, dish.restaurantLatitude!],
          },
          properties: {
            restaurantId: dish.restaurantId,
            restaurantName: dish.restaurantName,
            contextualScore: dish.qualityScore,
            rank,
            pinColor,
            isDishPin: true,
            dishName: dish.foodName,
            connectionId: dish.connectionId,
          },
        };
        entries.push({
          feature,
          rank,
          locationIndex: 0, // All dish pins are primary
        });
        primaryCount += 1;
      });
    } else {
      // Restaurant mode: existing logic
      markerRestaurants.forEach((restaurant, restaurantIndex) => {
        if (restaurantOnlyId && restaurant.restaurantId !== restaurantOnlyId) {
          return;
        }
        const rank = restaurantIndex + 1;
        const pinColor = getMarkerColorForRestaurant(restaurant);
        const locations = resolveRestaurantMapLocations(restaurant);
        locations.forEach((location) => {
          const featureId = `${restaurant.restaurantId}-${location.locationId}`;
          const feature: Feature<Point, RestaurantFeatureProperties> = {
            type: 'Feature',
            id: featureId,
            geometry: {
              type: 'Point',
              coordinates: [location.longitude, location.latitude],
            },
            properties: {
              restaurantId: restaurant.restaurantId,
              restaurantName: restaurant.restaurantName,
              contextualScore: restaurant.contextualScore,
              rank,
              pinColor,
            },
          };
          entries.push({
            feature,
            rank,
            locationIndex: location.locationIndex,
          });
          if (location.isPrimary) {
            primaryCount += 1;
          }
        });
      });
    }

    const orderByRank = (
      left: {
        feature: Feature<Point, RestaurantFeatureProperties>;
        rank: number;
        locationIndex: number;
      },
      right: {
        feature: Feature<Point, RestaurantFeatureProperties>;
        rank: number;
        locationIndex: number;
      }
    ) => {
      const rankDiff = left.rank - right.rank;
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const locationDiff = left.locationIndex - right.locationIndex;
      if (locationDiff !== 0) {
        return locationDiff;
      }
      const leftId = left.feature.id?.toString() ?? '';
      const rightId = right.feature.id?.toString() ?? '';
      return leftId.localeCompare(rightId);
    };

    entries.sort(orderByRank);
    const catalog = entries;
    if (shouldLogSearchComputes) {
      logSearchCompute(
        `markerCatalog total=${catalog.length} primary=${primaryCount} mode=${
          isDishesTab ? 'dishes' : 'restaurants'
        }`,
        getPerfNow() - start
      );
    }
    return { catalog, primaryCount };
  }, [
    activeTab,
    dishes,
    getPerfNow,
    logSearchCompute,
    markerRestaurants,
    resolveRestaurantMapLocations,
    restaurantOnlyId,
    shouldLogSearchComputes,
  ]);
  const markerCatalogEntries = markerCatalog.catalog;
  const selectedRestaurantId = isRestaurantOverlayVisible
    ? restaurantProfile?.restaurant.restaurantId ?? null
    : null;
  const effectiveMapZoom = mapZoom ?? USA_FALLBACK_ZOOM;

  const visibleMarkerCandidates = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    if (shouldLogSearchComputes) {
      logSearchCompute(
        `visibleMarkerCandidates count=${markerCatalogEntries.length}`,
        getPerfNow() - start
      );
    }
    return markerCatalogEntries;
  }, [getPerfNow, logSearchCompute, markerCatalogEntries, shouldLogSearchComputes]);

  React.useEffect(() => {
    const visibleCount = visibleMarkerCandidates.length;
    const zoom = effectiveMapZoom;
    setIsMarkerDotHeavyMode((previous) => {
      const shouldEnter =
        zoom <= MARKER_DOT_HEAVY_ZOOM_ENTER || visibleCount >= MARKER_DOT_HEAVY_COUNT_ENTER;
      const shouldExit =
        zoom >= MARKER_DOT_HEAVY_ZOOM_EXIT && visibleCount <= MARKER_DOT_HEAVY_COUNT_EXIT;
      if (previous) {
        return shouldExit ? false : true;
      }
      return shouldEnter ? true : false;
    });
  }, [effectiveMapZoom, visibleMarkerCandidates.length]);

  const fullMarkerCandidates = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const base = isMarkerDotHeavyMode
      ? visibleMarkerCandidates.slice(0, MAX_FULL_MARKERS)
      : visibleMarkerCandidates;

    if (!isMarkerDotHeavyMode || !selectedRestaurantId) {
      if (shouldLogSearchComputes) {
        logSearchCompute(
          `fullMarkerCandidates count=${base.length} mode=${isMarkerDotHeavyMode ? 'lod' : 'full'}`,
          getPerfNow() - start
        );
      }
      return base;
    }

    const selectedAlreadyIncluded = base.some(
      (entry) => entry.feature.properties.restaurantId === selectedRestaurantId
    );
    if (selectedAlreadyIncluded) {
      if (shouldLogSearchComputes) {
        logSearchCompute(
          `fullMarkerCandidates count=${base.length} mode=lod+selected`,
          getPerfNow() - start
        );
      }
      return base;
    }

    const selectedEntry =
      visibleMarkerCandidates.find(
        (entry) => entry.feature.properties.restaurantId === selectedRestaurantId
      ) ?? null;
    if (!selectedEntry) {
      if (shouldLogSearchComputes) {
        logSearchCompute(
          `fullMarkerCandidates count=${base.length} mode=lod`,
          getPerfNow() - start
        );
      }
      return base;
    }

    if (base.length < MAX_FULL_MARKERS) {
      const next = [...base, selectedEntry];
      if (shouldLogSearchComputes) {
        logSearchCompute(
          `fullMarkerCandidates count=${next.length} mode=lod+selected`,
          getPerfNow() - start
        );
      }
      return next;
    }

    const next = base.slice(0, Math.max(0, MAX_FULL_MARKERS - 1));
    next.push(selectedEntry);
    if (shouldLogSearchComputes) {
      logSearchCompute(
        `fullMarkerCandidates count=${next.length} mode=lod+selected`,
        getPerfNow() - start
      );
    }
    return next;
  }, [
    getPerfNow,
    isMarkerDotHeavyMode,
    logSearchCompute,
    selectedRestaurantId,
    shouldLogSearchComputes,
    visibleMarkerCandidates,
  ]);

  const sortedRestaurantMarkers = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const sorted = fullMarkerCandidates.map((entry) => entry.feature);
    if (shouldLogSearchComputes) {
      logSearchCompute(`sortedRestaurantMarkers count=${sorted.length}`, getPerfNow() - start);
    }
    return sorted;
  }, [fullMarkerCandidates, getPerfNow, logSearchCompute, shouldLogSearchComputes]);

  const dotRestaurantMarkers = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    if (!isMarkerDotHeavyMode) {
      return [];
    }
    if (visibleMarkerCandidates.length === 0) {
      return [];
    }
    if (sortedRestaurantMarkers.length === 0) {
      return visibleMarkerCandidates.map((entry) => entry.feature);
    }
    const fullKeys = new Set(sortedRestaurantMarkers.map((feature) => buildMarkerKey(feature)));
    const dots = visibleMarkerCandidates
      .filter((entry) => !fullKeys.has(buildMarkerKey(entry.feature)))
      .map((entry) => entry.feature);
    if (shouldLogSearchComputes) {
      logSearchCompute(`dotRestaurantMarkers count=${dots.length}`, getPerfNow() - start);
    }
    return dots;
  }, [
    buildMarkerKey,
    getPerfNow,
    isMarkerDotHeavyMode,
    logSearchCompute,
    shouldLogSearchComputes,
    sortedRestaurantMarkers,
    visibleMarkerCandidates,
  ]);
  const dotRestaurantFeatures = React.useMemo<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(() => {
    if (!isMarkerDotHeavyMode || dotRestaurantMarkers.length === 0) {
      return null;
    }
    return {
      type: 'FeatureCollection',
      features: dotRestaurantMarkers,
    };
  }, [dotRestaurantMarkers, isMarkerDotHeavyMode]);
  const restaurantFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const collection = {
      type: 'FeatureCollection',
      features: sortedRestaurantMarkers,
    };
    if (shouldLogSearchComputes) {
      logSearchCompute(
        `restaurantFeatures markers=${sortedRestaurantMarkers.length}`,
        getPerfNow() - start
      );
    }
    return collection;
  }, [getPerfNow, logSearchCompute, shouldLogSearchComputes, sortedRestaurantMarkers]);
  const markersRenderKey = React.useMemo(() => {
    const start = shouldLogSearchComputes ? getPerfNow() : 0;
    const key = sortedRestaurantMarkers
      .map((feature) => {
        const id = feature.id ?? feature.properties.restaurantId;
        const name = feature.properties.restaurantName ?? '';
        const color = feature.properties.pinColor ?? '';
        const coordinates = feature.geometry.coordinates as [number, number];
        const lng = Math.round(coordinates[0] * CAMERA_CENTER_PRECISION);
        const lat = Math.round(coordinates[1] * CAMERA_CENTER_PRECISION);
        return `${id}-${feature.properties.rank}-${name}-${color}-${lng}-${lat}`;
      })
      .join('|');
    if (shouldLogSearchComputes) {
      logSearchCompute('markersRenderKey', getPerfNow() - start);
    }
    return key;
  }, [getPerfNow, logSearchCompute, shouldLogSearchComputes, sortedRestaurantMarkers]);

  React.useEffect(() => {
    return () => {
      if (markerRevealTimeoutRef.current) {
        clearTimeout(markerRevealTimeoutRef.current);
        markerRevealTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!shouldAnimateMarkerReveal) {
      return;
    }
    if (!results || results.metadata.page !== 1) {
      return;
    }
    if (sortedRestaurantMarkers.length === 0) {
      return;
    }
    if (markerRevealTimeoutRef.current) {
      return;
    }
    markerRevealTimeoutRef.current = setTimeout(() => {
      markerRevealTimeoutRef.current = null;
      setShouldAnimateMarkerReveal(false);
    }, MARKER_REVEAL_WINDOW_MS);
  }, [results, shouldAnimateMarkerReveal, sortedRestaurantMarkers.length]);

  // No sticky anchors; keep labels relative to pin geometry only.

  // Intentionally avoid auto-fitting the map when results change; keep user camera position.

  React.useEffect(() => {
    if (!isSearchOverlay && isRestaurantOverlayVisible) {
      setRestaurantOverlayVisible(false);
    }
  }, [isSearchOverlay, isRestaurantOverlayVisible]);

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
    if (!isPriceSelectorVisible) {
      setPendingPriceRange(getRangeFromLevels(priceLevels));
    }
  }, [isPriceSelectorVisible, priceLevels]);

  const hidePanel = React.useCallback(() => {
    if (!panelVisible) {
      return;
    }
    setIsPriceSelectorVisible(false);
    animateSheetTo('hidden');
  }, [panelVisible, animateSheetTo]);

  const togglePriceSelector = React.useCallback(() => {
    if (isPriceSelectorVisible) {
      commitPriceSelection();
      return;
    }
    setPendingPriceRange(getRangeFromLevels(priceLevels));
    setIsPriceSelectorVisible(true);
  }, [isPriceSelectorVisible, commitPriceSelection, priceLevels]);

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

  const {
    submitSearch,
    runRestaurantEntitySearch,
    runBestHere,
    loadMoreResults,
    cancelActiveSearchRequest,
  } = useSearchSubmit({
    query,
    isLoading,
    setIsLoading,
    isLoadingMore,
    setIsLoadingMore,
    results,
    setResults,
    submittedQuery,
    setSubmittedQuery,
    activeTab,
    setActiveTab,
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
  });

  const loadMoreResultsRef = React.useRef(loadMoreResults);
  const canLoadMoreRef = React.useRef(canLoadMore);
  const searchModeRef = React.useRef(searchMode);
  const currentPageRef = React.useRef(currentPage);
  const isLoadingRef = React.useRef(isLoading);
  const isLoadingMoreRef = React.useRef(isLoadingMore);
  const lastLoadMorePageRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    loadMoreResultsRef.current = loadMoreResults;
  }, [loadMoreResults]);

  React.useEffect(() => {
    canLoadMoreRef.current = canLoadMore;
  }, [canLoadMore]);

  React.useEffect(() => {
    searchModeRef.current = searchMode;
  }, [searchMode]);

  React.useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  React.useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  React.useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  React.useEffect(() => {
    if (isLoadingMore) {
      return;
    }
    const lastRequestedPage = lastLoadMorePageRef.current;
    if (lastRequestedPage !== null && currentPage < lastRequestedPage) {
      lastLoadMorePageRef.current = null;
    }
  }, [currentPage, isLoadingMore]);

  const handleResultsEndReached = React.useCallback(() => {
    if (!hasUserScrolledResultsRef.current) {
      return;
    }
    if (!canLoadMoreRef.current || isLoadingRef.current || isLoadingMoreRef.current) {
      return;
    }
    const nextPage = currentPageRef.current + 1;
    if (lastLoadMorePageRef.current === nextPage) {
      return;
    }
    lastLoadMorePageRef.current = nextPage;
    if (shouldLogSearchStateChanges) {
      // eslint-disable-next-line no-console
      console.log(
        `[SearchPerf] endReached page=${currentPageRef.current} next=${nextPage} mode=${
          searchModeRef.current ?? 'none'
        }`
      );
    }
    loadMoreResultsRef.current(searchModeRef.current);
  }, [shouldLogSearchStateChanges]);

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

  const scheduleFilterToggleSearch = React.useCallback((runSearch: () => Promise<void>) => {
    setIsFilterTogglePending(true);
    const requestId = (filterToggleRequestRef.current += 1);
    if (toggleFilterDebounceRef.current) {
      clearTimeout(toggleFilterDebounceRef.current);
    }
    toggleFilterDebounceRef.current = setTimeout(() => {
      toggleFilterDebounceRef.current = null;
      const execute = async () => {
        try {
          await runSearch();
        } finally {
          if (filterToggleRequestRef.current === requestId) {
            setIsFilterTogglePending(false);
          }
        }
      };
      void execute();
    }, FILTER_TOGGLE_DEBOUNCE_MS);
  }, []);

  const toggleVotesFilter = React.useCallback(() => {
    const currentVotes = useSearchStore.getState().votes100Plus;
    const nextValue = !currentVotes;
    setVotes100Plus(nextValue);
    const shouldRunShortcut = searchMode === 'shortcut';
    const committedQuery = (isSearchSessionActive ? submittedQuery : query).trim();
    const shouldRunNatural = !shouldRunShortcut && Boolean(committedQuery);
    if (!shouldRunShortcut && !shouldRunNatural) {
      return;
    }
    const minimumVotes = nextValue ? MINIMUM_VOTES_FILTER : null;
    scheduleFilterToggleSearch(async () => {
      if (shouldRunShortcut) {
        const fallbackLabel = activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
        const label = submittedQuery || fallbackLabel;
        await runBestHere(activeTab, label, {
          preserveSheetState: true,
          filters: { minimumVotes },
        });
        return;
      }
      await submitSearch({ minimumVotes, preserveSheetState: true }, committedQuery);
    });
  }, [
    activeTab,
    isSearchSessionActive,
    query,
    runBestHere,
    scheduleFilterToggleSearch,
    searchMode,
    setVotes100Plus,
    submitSearch,
    submittedQuery,
  ]);

  const dismissSearchKeyboard = React.useCallback(() => {
    const shouldLog = searchPerfDebug.enabled;
    runOnUI(() => {
      'worklet';
      searchHeaderFocusProgress.value = 0;
    })();
    const input = inputRef.current;
    const wasFocused = Boolean(input?.isFocused?.());
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf] dismissSearchKeyboard start focused=${wasFocused}`);
    }
    if (wasFocused) {
      input.blur();
    }
    requestAnimationFrame(() => {
      const stillFocused = Boolean(inputRef.current?.isFocused?.());
      if (shouldLog) {
        // eslint-disable-next-line no-console
        console.log(`[SearchPerf] dismissSearchKeyboard raf focused=${stillFocused}`);
      }
      if (stillFocused) {
        Keyboard.dismiss();
        if (shouldLog) {
          // eslint-disable-next-line no-console
          console.log('[SearchPerf] dismissSearchKeyboard forced Keyboard.dismiss()');
        }
      }
    });
  }, [inputRef, searchHeaderFocusProgress]);

  const handleSuggestionInteractionStart = React.useCallback(() => {
    const shouldLog = searchPerfDebug.enabled;
    const focused = Boolean(inputRef.current?.isFocused?.());
    if (shouldLog) {
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf] suggestionInteractionStart focused=${focused}`);
    }
    if (!focused) {
      return;
    }
    allowSearchBlurExitRef.current = true;
    ignoreNextSearchBlurRef.current = true;
    setIsSearchFocused(false);
    setIsSuggestionScrollDismissing(true);
    if (suggestionScrollDismissTimeoutRef.current) {
      clearTimeout(suggestionScrollDismissTimeoutRef.current);
    }
    dismissSearchKeyboard();
    suggestionScrollDismissTimeoutRef.current = setTimeout(() => {
      suggestionScrollDismissTimeoutRef.current = null;
      setIsSuggestionScrollDismissing(false);
    }, 450);
  }, [dismissSearchKeyboard, inputRef, setIsSearchFocused]);

  const handleSuggestionTouchStart = React.useCallback(() => {
    const focused = Boolean(inputRef.current?.isFocused?.());
    if (!focused) {
      return;
    }
    allowSearchBlurExitRef.current = true;
    ignoreNextSearchBlurRef.current = true;
    setIsSearchFocused(false);
    dismissSearchKeyboard();
  }, [dismissSearchKeyboard, inputRef, setIsSearchFocused]);

  const handleSuggestionInteractionEnd = React.useCallback(() => {
    if (suggestionScrollDismissTimeoutRef.current) {
      clearTimeout(suggestionScrollDismissTimeoutRef.current);
      suggestionScrollDismissTimeoutRef.current = null;
    }
    setIsSuggestionScrollDismissing(false);
  }, []);

  const handleSubmit = React.useCallback(() => {
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

    const trimmed = query.trim();
    const normalized = trimmed.toLowerCase();
    if (normalized === 'best dishes') {
      void runBestHere('dishes', 'Best dishes');
      return;
    }
    if (normalized === 'best restaurants') {
      void runBestHere('restaurants', 'Best restaurants');
      return;
    }
    if (normalized === 'food') {
      void runBestHere('dishes', 'Food');
      return;
    }

    void submitSearch();
  }, [
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    query,
    resetFocusedMapState,
    runBestHere,
    setRestaurantOnlyIntent,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    beginSubmitTransition,
    suppressAutocompleteResults,
    submitSearch,
  ]);

  const handleBestDishesHere = React.useCallback(() => {
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
    void runBestHere('dishes', 'Best dishes');
  }, [
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    resetFocusedMapState,
    runBestHere,
    setRestaurantOnlyIntent,
    setIsSuggestionPanelActive,
    setIsSearchFocused,
    beginSubmitTransition,
  ]);

  const handleBestRestaurantsHere = React.useCallback(() => {
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
    void runBestHere('restaurants', 'Best restaurants');
  }, [
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    resetFocusedMapState,
    runBestHere,
    setRestaurantOnlyIntent,
    setIsSuggestionPanelActive,
    setIsSearchFocused,
    beginSubmitTransition,
  ]);

  const handleSearchThisArea = React.useCallback(() => {
    if (isLoading || isLoadingMore || !results) {
      return;
    }
    resetFocusedMapState();
    setRestaurantOnlyIntent(null);
    resetMapMoveFlag();

    if (searchMode === 'shortcut') {
      const fallbackLabel = activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
      const label = submittedQuery || fallbackLabel;
      void runBestHere(activeTab, label, { preserveSheetState: true });
      return;
    }

    const committedQuery = (isSearchSessionActive ? submittedQuery : query).trim();
    void submitSearch({ preserveSheetState: true }, committedQuery);
  }, [
    activeTab,
    isLoading,
    isLoadingMore,
    isSearchSessionActive,
    query,
    results,
    resetFocusedMapState,
    resetMapMoveFlag,
    runBestHere,
    searchMode,
    setRestaurantOnlyIntent,
    submitSearch,
    submittedQuery,
  ]);

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
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

  const clearSearchState = React.useCallback(
    ({
      shouldRefocusInput = false,
      skipSheetAnimation = false,
      deferSuggestionClear = false,
      skipProfileDismissWait = false,
    }: {
      shouldRefocusInput?: boolean;
      skipSheetAnimation?: boolean;
      deferSuggestionClear?: boolean;
      skipProfileDismissWait?: boolean;
    } = {}) => {
      if (isRestaurantOverlayVisible && !isClearingSearchRef.current) {
        profileDismissBehaviorRef.current = 'clear';
        shouldClearSearchOnProfileDismissRef.current = !skipProfileDismissWait;
        resetSheetToHidden();
        closeRestaurantProfileRef.current?.();
        if (!skipProfileDismissWait) {
          return;
        }
      }
      isClearingSearchRef.current = true;
      cancelActiveSearchRequest();
      cancelAutocomplete();
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current);
        filterDebounceRef.current = null;
      }
      if (toggleFilterDebounceRef.current) {
        clearTimeout(toggleFilterDebounceRef.current);
        toggleFilterDebounceRef.current = null;
      }
      if (submitTransitionHoldRef.current.active && !deferSuggestionClear) {
        submitTransitionHoldRef.current = {
          active: false,
          query: '',
          suggestions: [] as AutocompleteMatch[],
          recentSearches: [] as RecentSearch[],
          recentlyViewedRestaurants: [] as RecentlyViewedRestaurant[],
          recentlyViewedFoods: [] as RecentlyViewedFood[],
          isRecentLoading: false,
          isRecentlyViewedLoading: false,
          isRecentlyViewedFoodsLoading: false,
          holdShortcuts: false,
          holdSuggestionPanel: false,
          holdSuggestionBackground: false,
          holdAutocomplete: false,
          holdRecent: false,
        };
      }
      resetFilters();
      setIsFilterTogglePending(false);
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      setIsAutocompleteSuppressed(true);
      if (!deferSuggestionClear) {
        setShowSuggestions(false);
      }
      setQuery('');
      setResults(null);
      resetMapMoveFlag();
      setSubmittedQuery('');
      setError(null);
      if (!deferSuggestionClear) {
        setSuggestions([]);
      }
      if (skipSheetAnimation) {
        resetSheetToHidden();
      } else {
        hidePanel();
      }
      setIsSearchSessionActive(false);
      setSearchMode(null);
      // Reactivate persistent polls when search is cleared
      setIsDockedPollsDismissed(false);
      setHasMoreFood(false);
      setHasMoreRestaurants(false);
      setCurrentPage(1);
      setIsLoadingMore(false);
      setIsPaginationExhausted(false);
      lastAutoOpenKeyRef.current = null;
      resetFocusedMapState();
      setRestaurantOnlyIntent(null);
      searchSessionQueryRef.current = '';
      setSearchTransitionVariant('default');
      shortcutContentFadeMode.value = SHORTCUT_CONTENT_FADE_DEFAULT;
      profileDismissBehaviorRef.current = 'restore';
      shouldClearSearchOnProfileDismissRef.current = false;
      Keyboard.dismiss();
      inputRef.current?.blur();
      scrollResultsToTop();
      isClearingSearchRef.current = false;
      if (shouldRefocusInput) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    },
    [
      cancelActiveSearchRequest,
      cancelAutocomplete,
      hidePanel,
      isRestaurantOverlayVisible,
      resetSheetToHidden,
      resetFilters,
      resetFocusedMapState,
      resetMapMoveFlag,
      setRestaurantOnlyIntent,
      setIsDockedPollsDismissed,
      setIsSearchSessionActive,
      setSearchMode,
      setSearchTransitionVariant,
      scrollResultsToTop,
      shortcutContentFadeMode,
    ]
  );
  clearSearchStateRef.current = clearSearchState;

  const clearTypedQuery = React.useCallback(() => {
    cancelAutocomplete();
    setIsAutocompleteSuppressed(false);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  }, [cancelAutocomplete, setIsAutocompleteSuppressed]);

  const handleClear = React.useCallback(() => {
    const shouldCloseSuggestions = isSuggestionPanelActive || isSuggestionPanelVisible;
    if (isSuggestionPanelActive) {
      clearTypedQuery();
      return;
    }
    if (!isSearchSessionActive && !shouldCloseSuggestions && !isRestaurantOverlayVisible) {
      clearTypedQuery();
      return;
    }
    ignoreNextSearchBlurRef.current = true;
    clearSearchState({
      shouldRefocusInput: !isSearchSessionActive && !isLoading && !isLoadingMore,
      skipProfileDismissWait: true,
    });
  }, [
    clearSearchState,
    clearTypedQuery,
    isLoading,
    isLoadingMore,
    isRestaurantOverlayVisible,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
  ]);

  const handleCloseResults = React.useCallback(() => {
    ignoreNextSearchBlurRef.current = true;
    setSearchHeaderActionModeOverride('follow-collapse');
    setPollsHeaderActionAnimationToken((current) => current + 1);
    setPollsDockedSnapRequest('collapsed');
    clearSearchState({
      skipProfileDismissWait: true,
    });
  }, [
    clearSearchState,
    setPollsDockedSnapRequest,
    setPollsHeaderActionAnimationToken,
    setSearchHeaderActionModeOverride,
  ]);

  const handleSearchFocus = React.useCallback(() => {
    isSearchEditingRef.current = true;
    allowSearchBlurExitRef.current = false;
    captureSearchSessionQuery();
    dismissTransientOverlays();
    allowAutocompleteResults();
    setIsSearchFocused(true);
    setIsSuggestionPanelActive(true);
    setIsAutocompleteSuppressed(false);
  }, [allowAutocompleteResults, captureSearchSessionQuery, dismissTransientOverlays]);

  const handleSearchBlur = React.useCallback(() => {
    if (!allowSearchBlurExitRef.current && isSuggestionPanelActive) {
      ignoreNextSearchBlurRef.current = true;
      requestAnimationFrame(() => {
        inputRef.current?.focus?.();
      });
      return;
    }
    allowSearchBlurExitRef.current = false;
    setIsSearchFocused(false);
    if (cancelSearchEditOnBackRef.current) {
      isSearchEditingRef.current = false;
      cancelSearchEditOnBackRef.current = false;
      ignoreNextSearchBlurRef.current = false;
      const shouldDeferSuggestionClear = beginSuggestionCloseHold(
        isSearchSessionActive || isRestaurantOverlayVisible ? 'submitting' : 'default'
      );
      setIsAutocompleteSuppressed(true);
      setIsSuggestionPanelActive(false);
      const nextQuery = searchSessionQueryRef.current.trim();
      if (isSearchSessionActive && nextQuery && nextQuery !== query) {
        setQuery(nextQuery);
      }
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      if (isSearchSessionActive) {
        flushPendingResultsSheetReveal();
      }
      return;
    }
    if (ignoreNextSearchBlurRef.current) {
      ignoreNextSearchBlurRef.current = false;
      return;
    }
    isSearchEditingRef.current = false;
    const shouldRestoreHome = restoreHomeOnSearchBackRef.current;
    restoreHomeOnSearchBackRef.current = false;
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      isSearchSessionActive || isRestaurantOverlayVisible ? 'submitting' : 'default'
    );
    setIsSuggestionPanelActive(false);
    if (!shouldDeferSuggestionClear && !shouldRestoreHome) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
    if (shouldRestoreHome && !isSearchSessionActive) {
      cancelAutocomplete();
      setIsAutocompleteSuppressed(false);
      setQuery('');
      setIsDockedPollsDismissed(false);
      if (!showPollsOverlay && !isLoading) {
        setPollsDockedSnapRequest('collapsed');
      }
      pendingResultsSheetRevealRef.current = false;
      return;
    }
    if (isSearchSessionActive) {
      flushPendingResultsSheetReveal();
    }
  }, [
    beginSuggestionCloseHold,
    cancelAutocomplete,
    flushPendingResultsSheetReveal,
    isRestaurantOverlayVisible,
    isLoading,
    isSearchSessionActive,
    query,
    setIsDockedPollsDismissed,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    setPollsDockedSnapRequest,
    showPollsOverlay,
  ]);

  const handleSearchBack = React.useCallback(() => {
    suppressAutocompleteResults();
    if (!isSearchSessionActive) {
      ignoreNextSearchBlurRef.current = false;
      cancelSearchEditOnBackRef.current = false;
      restoreHomeOnSearchBackRef.current = true;
      allowSearchBlurExitRef.current = true;
      shortcutContentFadeMode.value = shouldShowSearchShortcuts
        ? SHORTCUT_CONTENT_FADE_HOLD
        : SHORTCUT_CONTENT_FADE_DEFAULT;
      if (inputRef.current?.isFocused?.()) {
        inputRef.current?.blur();
        return;
      }
      handleSearchBlur();
      return;
    }
    ignoreNextSearchBlurRef.current = false;
    cancelSearchEditOnBackRef.current = true;
    allowSearchBlurExitRef.current = true;
    if (inputRef.current?.isFocused?.()) {
      inputRef.current?.blur();
      return;
    }
    handleSearchBlur();
  }, [
    handleSearchBlur,
    isSearchSessionActive,
    shortcutContentFadeMode,
    shouldShowSearchShortcuts,
    suppressAutocompleteResults,
  ]);

  const handleRecentSearchPress = React.useCallback(
    (entry: RecentSearch) => {
      const trimmedValue = entry.queryText.trim();
      if (!trimmedValue) {
        return;
      }
      ensureSearchOverlay();
      isSearchEditingRef.current = false;
      pendingResultsSheetRevealRef.current = false;
      allowSearchBlurExitRef.current = true;
      const shouldDeferSuggestionClear = beginSubmitTransition();
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      cancelAutocomplete();
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      setQuery(trimmedValue);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      resetFocusedMapState();
      const restaurantId =
        entry.selectedEntityType === 'restaurant' ? entry.selectedEntityId ?? null : null;
      if (restaurantId) {
        pendingRestaurantSelectionRef.current = { restaurantId };
        openRestaurantProfilePreviewRef.current?.(restaurantId, trimmedValue);
        setRestaurantOnlyIntent(restaurantId);
        deferRecentSearchUpsert({
          queryText: trimmedValue,
          selectedEntityId: restaurantId,
          selectedEntityType: 'restaurant',
          statusPreview: entry.statusPreview ?? null,
        });
        void runRestaurantEntitySearch({
          restaurantId,
          restaurantName: trimmedValue,
          submissionSource: 'recent',
          typedPrefix: trimmedValue,
        });
        return;
      }
      deferRecentSearchUpsert(trimmedValue);
      setRestaurantOnlyIntent(null);
      void submitSearch({ submission: { source: 'recent' } }, trimmedValue);
    },
    [
      cancelAutocomplete,
      deferRecentSearchUpsert,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      resetFocusedMapState,
      runRestaurantEntitySearch,
      submitSearch,
      beginSubmitTransition,
      setRestaurantOnlyIntent,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      suppressAutocompleteResults,
    ]
  );

  const handleRecentlyViewedRestaurantPress = React.useCallback(
    (item: RecentlyViewedRestaurant) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }
      ensureSearchOverlay();
      isSearchEditingRef.current = false;
      pendingResultsSheetRevealRef.current = false;
      allowSearchBlurExitRef.current = true;
      const shouldDeferSuggestionClear = beginSubmitTransition();
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      cancelAutocomplete();
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      setQuery(trimmedValue);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      resetFocusedMapState();
      pendingRestaurantSelectionRef.current = { restaurantId: item.restaurantId };
      openRestaurantProfilePreviewRef.current?.(item.restaurantId, trimmedValue);
      setRestaurantOnlyIntent(item.restaurantId);
      deferRecentSearchUpsert({
        queryText: trimmedValue,
        selectedEntityId: item.restaurantId,
        selectedEntityType: 'restaurant',
        statusPreview: item.statusPreview ?? null,
      });
      void runRestaurantEntitySearch({
        restaurantId: item.restaurantId,
        restaurantName: trimmedValue,
        submissionSource: 'recent',
        typedPrefix: trimmedValue,
      });
    },
    [
      cancelAutocomplete,
      deferRecentSearchUpsert,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      resetFocusedMapState,
      runRestaurantEntitySearch,
      beginSubmitTransition,
      setRestaurantOnlyIntent,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      suppressAutocompleteResults,
    ]
  );

  const handleRecentlyViewedFoodPress = React.useCallback(
    (item: RecentlyViewedFood) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }
      ensureSearchOverlay();
      isSearchEditingRef.current = false;
      pendingResultsSheetRevealRef.current = false;
      allowSearchBlurExitRef.current = true;
      const shouldDeferSuggestionClear = beginSubmitTransition();
      ignoreNextSearchBlurRef.current = true;
      suppressAutocompleteResults();
      cancelAutocomplete();
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      dismissSearchKeyboard();
      setQuery(trimmedValue);
      if (!shouldDeferSuggestionClear) {
        setShowSuggestions(false);
        setSuggestions([]);
      }
      resetFocusedMapState();
      pendingRestaurantSelectionRef.current = { restaurantId: item.restaurantId };
      openRestaurantProfilePreviewRef.current?.(item.restaurantId, trimmedValue);
      setRestaurantOnlyIntent(item.restaurantId);
      deferRecentSearchUpsert({
        queryText: trimmedValue,
        selectedEntityId: item.restaurantId,
        selectedEntityType: 'restaurant',
        statusPreview: item.statusPreview ?? null,
      });
      void runRestaurantEntitySearch({
        restaurantId: item.restaurantId,
        restaurantName: trimmedValue,
        submissionSource: 'recent',
        typedPrefix: item.foodName,
      });
    },
    [
      cancelAutocomplete,
      deferRecentSearchUpsert,
      dismissSearchKeyboard,
      ensureSearchOverlay,
      resetFocusedMapState,
      runRestaurantEntitySearch,
      beginSubmitTransition,
      setRestaurantOnlyIntent,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      suppressAutocompleteResults,
    ]
  );

  const resetSuggestionUiForExternalSubmit = React.useCallback(() => {
    ignoreNextSearchBlurRef.current = true;
    runOnUI(() => {
      'worklet';
      searchHeaderFocusProgress.value = 0;
    })();
    const input = inputRef.current;
    if (input?.isFocused?.()) {
      input.blur();
    }
    Keyboard.dismiss();

    if (submitTransitionHoldRef.current.active) {
      submitTransitionHoldRef.current = {
        active: false,
        query: '',
        suggestions: [] as AutocompleteMatch[],
        recentSearches: [] as RecentSearch[],
        recentlyViewedRestaurants: [] as RecentlyViewedRestaurant[],
        recentlyViewedFoods: [] as RecentlyViewedFood[],
        isRecentLoading: false,
        isRecentlyViewedLoading: false,
        isRecentlyViewedFoodsLoading: false,
        holdShortcuts: false,
        holdSuggestionPanel: false,
        holdSuggestionBackground: false,
        holdAutocomplete: false,
        holdRecent: false,
      };
    }

    setSearchTransitionVariant('default');
    setIsAutocompleteSuppressed(true);
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    setIsSuggestionLayoutWarm(false);
    setShowSuggestions(false);
    setSuggestions([]);
    cancelAutocomplete();
  }, [
    cancelAutocomplete,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionLayoutWarm,
    setIsSuggestionPanelActive,
    setSearchTransitionVariant,
    setShowSuggestions,
    setSuggestions,
    searchHeaderFocusProgress,
  ]);

  const runViewMoreIntent = React.useCallback(
    (intent: MainSearchIntent) => {
      if (intent.type === 'recentSearch') {
        handleRecentSearchPress(intent.entry);
        return;
      }
      if (intent.type === 'recentlyViewed') {
        handleRecentlyViewedRestaurantPress(intent.restaurant);
        return;
      }
      handleRecentlyViewedFoodPress(intent.food);
    },
    [handleRecentSearchPress, handleRecentlyViewedFoodPress, handleRecentlyViewedRestaurantPress]
  );

  React.useLayoutEffect(() => {
    const intentFromParams: MainSearchIntent | null = route.params?.searchIntent ?? null;
    if (!intentFromParams) {
      return;
    }

    resetSuggestionUiForExternalSubmit();
    navigation.setParams({ searchIntent: undefined });
    runViewMoreIntent(intentFromParams);
  }, [
    navigation,
    resetSuggestionUiForExternalSubmit,
    route.params?.searchIntent,
    runViewMoreIntent,
  ]);

  const prepareForViewMoreNavigation = React.useCallback(() => {
    const input = inputRef.current;
    if (input?.isFocused?.()) {
      ignoreNextSearchBlurRef.current = true;
      allowSearchBlurExitRef.current = true;
      input.blur();
    }
    Keyboard.dismiss();
  }, []);

  const handleRecentViewMorePress = React.useCallback(() => {
    prepareForViewMoreNavigation();
    navigation.push('RecentSearches', { userLocation });
  }, [navigation, prepareForViewMoreNavigation, userLocation]);

  const handleRecentlyViewedMorePress = React.useCallback(() => {
    prepareForViewMoreNavigation();
    navigation.push('RecentlyViewed', { userLocation });
  }, [navigation, prepareForViewMoreNavigation, userLocation]);

  const handleMapPress = React.useCallback(() => {
    allowSearchBlurExitRef.current = true;
    suppressAutocompleteResults();
    // Fully exit autocomplete: blur input, suppress suggestions, and clear loading state.
    dismissSearchKeyboard();
    const shouldDeferSuggestionClear = beginSuggestionCloseHold(
      isSearchSessionActive || isRestaurantOverlayVisible ? 'submitting' : 'default'
    );
    setIsAutocompleteSuppressed(true);
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    if (!shouldDeferSuggestionClear) {
      setShowSuggestions(false);
      setSuggestions([]);
    }
    cancelAutocomplete();
  }, [
    beginSuggestionCloseHold,
    cancelAutocomplete,
    dismissSearchKeyboard,
    isRestaurantOverlayVisible,
    isSearchSessionActive,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    suppressAutocompleteResults,
  ]);
  const logMapEventRates = React.useCallback(() => {
    if (!shouldLogMapEventRates) {
      return;
    }
    const now = Date.now();
    const stats = mapEventStatsRef.current;
    if (stats.lastLog === 0) {
      stats.lastLog = now;
      return;
    }
    if (now - stats.lastLog < mapEventLogIntervalMs) {
      return;
    }
    const interactionState = searchInteractionRef.current;
    // eslint-disable-next-line no-console
    console.log(
      `[SearchPerf] Map events ${mapEventLogIntervalMs}ms cameraChanged=${stats.cameraChanged} mapIdle=${stats.mapIdle} drag=${interactionState.isResultsSheetDragging} scroll=${interactionState.isResultsListScrolling} settle=${interactionState.isResultsSheetSettling}`
    );
    stats.cameraChanged = 0;
    stats.mapIdle = 0;
    stats.lastLog = now;
  }, [mapEventLogIntervalMs, shouldLogMapEventRates]);
  const handleCameraChanged = React.useCallback(
    (state: MapboxMapState) => {
      if (shouldLogMapEventRates) {
        mapEventStatsRef.current.cameraChanged += 1;
        logMapEventRates();
      }
      const isGestureActive = Boolean(state?.gestures?.isGestureActive);
      mapGestureActiveRef.current = isGestureActive;

      const now = Date.now();
      const throttleMs = 120;
      if (now - lastCameraChangedHandledRef.current < throttleMs) {
        return;
      }
      lastCameraChangedHandledRef.current = now;

      const bounds = mapStateBoundsToMapBounds(state);
      if (!bounds) {
        return;
      }
      latestBoundsRef.current = bounds;

      if (searchInteractionRef.current.isInteracting || anySheetDraggingRef.current) {
        cancelMapUpdateTimeouts();
        if (isSearchOverlay && isSearchSessionActive && markMapMovedIfNeeded(bounds)) {
          scheduleMapIdleReveal();
        }
        return;
      }
      const zoomCandidate = state?.properties?.zoom as unknown;
      const zoom =
        typeof zoomCandidate === 'number' && Number.isFinite(zoomCandidate) ? zoomCandidate : null;

      if (suppressMapMovedRef.current) {
        latestBoundsRef.current = bounds;
        mapGestureSessionRef.current = null;
        return;
      }

      if (isGestureActive) {
        if (!mapTouchActiveRef.current) {
          mapGestureSessionRef.current = null;
          return;
        }
        const session = mapGestureSessionRef.current;
        if (!session) {
          mapGestureSessionRef.current = {
            startBounds: bounds,
            startZoom: zoom,
            eventCount: 1,
            didCollapse: false,
            startedWithResultsSheetOpen: mapTouchStartedWithResultsSheetOpenRef.current,
          };
          return;
        }

        session.eventCount += 1;
        const startCenter = getBoundsCenter(session.startBounds);
        const nextCenter = getBoundsCenter(bounds);
        const movedMiles = haversineDistanceMiles(startCenter, nextCenter);
        const zoomDelta =
          zoom !== null && session.startZoom !== null ? Math.abs(zoom - session.startZoom) : 0;

        const didMoveEnoughForGesture = movedMiles >= 0.0015 || zoomDelta >= 0.01;
        if (session.eventCount < 2 || !didMoveEnoughForGesture) {
          return;
        }

        if (
          !session.didCollapse &&
          session.startedWithResultsSheetOpen &&
          sheetState !== 'hidden' &&
          sheetState !== 'collapsed' &&
          isSearchOverlay &&
          results &&
          isSearchSessionActive &&
          !shouldDisableResultsSheetInteraction
        ) {
          if (shouldLogSearchStateChanges) {
            // eslint-disable-next-line no-console
            console.log(
              `[SearchPerf] AutoSnap collapsed reason=mapGesture movedMiles=${movedMiles.toFixed(
                4
              )} zoomDelta=${zoomDelta.toFixed(3)} eventCount=${
                session.eventCount
              } sheetState=${sheetState} touchActive=${mapTouchActiveRef.current} startedOpen=${
                session.startedWithResultsSheetOpen
              }`
            );
          }
          animateSheetTo('collapsed');
          session.didCollapse = true;
        }

        if (isSearchOverlay && isSearchSessionActive && markMapMovedIfNeeded(bounds)) {
          scheduleMapIdleReveal();
        }
        return;
      }

      mapGestureSessionRef.current = null;

      if (!isSearchOverlay || !isSearchSessionActive) {
        return;
      }

      if (markMapMovedIfNeeded(bounds)) {
        scheduleMapIdleReveal();
      }
    },
    [
      animateSheetTo,
      cancelMapUpdateTimeouts,
      isSearchOverlay,
      isSearchSessionActive,
      logMapEventRates,
      markMapMovedIfNeeded,
      results,
      scheduleMapIdleReveal,
      sheetState,
      shouldLogSearchStateChanges,
      shouldLogMapEventRates,
      shouldDisableResultsSheetInteraction,
    ]
  );

  const handleMapIdle = React.useCallback(
    (state: MapboxMapState) => {
      if (shouldLogMapEventRates) {
        mapEventStatsRef.current.mapIdle += 1;
        logMapEventRates();
      }
      const isBusy = searchInteractionRef.current.isInteracting || anySheetDraggingRef.current;
      if (isBusy) {
        cancelMapUpdateTimeouts();
      }
      const bounds = mapStateBoundsToMapBounds(state);
      if (bounds) {
        if (!isBusy && shouldShowPollsSheet) {
          schedulePollBoundsUpdate(bounds);
        }
        if (isSearchOverlay && isSearchSessionActive && markMapMovedIfNeeded(bounds)) {
          scheduleMapIdleReveal();
        }
        latestBoundsRef.current = bounds;
      }

      if (isBusy) {
        return;
      }

      const nextCenter = state?.properties?.center as unknown;
      const nextZoom = state?.properties?.zoom as unknown;
      if (
        !isLngLatTuple(nextCenter) ||
        typeof nextZoom !== 'number' ||
        !Number.isFinite(nextZoom)
      ) {
        return;
      }
      const roundedCenter: [number, number] = [
        roundCameraCenterValue(nextCenter[0]),
        roundCameraCenterValue(nextCenter[1]),
      ];
      const roundedZoom = roundCameraZoomValue(nextZoom);
      const payload = JSON.stringify({ center: roundedCenter, zoom: roundedZoom });
      if (payload === lastPersistedCameraRef.current) {
        return;
      }
      lastPersistedCameraRef.current = payload;
      lastCameraStateRef.current = { center: roundedCenter, zoom: roundedZoom };
      setMapCenter(roundedCenter);
      setMapZoom(roundedZoom);
      void AsyncStorage.setItem(CAMERA_STORAGE_KEY, payload).catch(() => undefined);
    },
    [
      cancelMapUpdateTimeouts,
      isSearchOverlay,
      isSearchSessionActive,
      logMapEventRates,
      markMapMovedIfNeeded,
      scheduleMapIdleReveal,
      schedulePollBoundsUpdate,
      shouldShowPollsSheet,
      shouldLogMapEventRates,
    ]
  );

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    const currentOpenNow = useSearchStore.getState().openNow;
    const nextValue = !currentOpenNow;
    setOpenNow(nextValue);
    const shouldRunShortcut = searchMode === 'shortcut';
    const committedQuery = (isSearchSessionActive ? submittedQuery : query).trim();
    const shouldRunNatural = !shouldRunShortcut && Boolean(committedQuery);
    if (!shouldRunShortcut && !shouldRunNatural) {
      return;
    }
    scheduleFilterToggleSearch(async () => {
      if (shouldRunShortcut) {
        const fallbackLabel = activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
        const label = submittedQuery || fallbackLabel;
        await runBestHere(activeTab, label, {
          preserveSheetState: true,
          filters: { openNow: nextValue },
        });
        return;
      }
      await submitSearch({ openNow: nextValue, preserveSheetState: true }, committedQuery);
    });
  }, [
    activeTab,
    isSearchSessionActive,
    query,
    runBestHere,
    scheduleFilterToggleSearch,
    searchMode,
    setOpenNow,
    submitSearch,
    submittedQuery,
  ]);

  const commitPriceSelection = React.useCallback(() => {
    const normalizedRange = normalizePriceRangeValues(pendingPriceRange);
    setPendingPriceRange(normalizedRange);
    const shouldClear = isFullPriceRange(normalizedRange);
    const nextLevels = shouldClear ? [] : buildLevelsFromRange(normalizedRange);
    const hasChanged =
      nextLevels.length !== priceLevels.length ||
      nextLevels.some((value, index) => value !== priceLevels[index]);
    setIsPriceSelectorVisible(false);
    if (!hasChanged) {
      return;
    }
    setPriceLevels(nextLevels);
    const shouldRunShortcut = searchMode === 'shortcut';
    const committedQuery = (isSearchSessionActive ? submittedQuery : query).trim();
    const shouldRunNatural = !shouldRunShortcut && Boolean(committedQuery);
    if (!shouldRunShortcut && !shouldRunNatural) {
      return;
    }
    if (filterDebounceRef.current) {
      clearTimeout(filterDebounceRef.current);
    }
    filterDebounceRef.current = setTimeout(() => {
      filterDebounceRef.current = null;
      if (shouldRunShortcut) {
        const fallbackLabel = activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
        const label = submittedQuery || fallbackLabel;
        void runBestHere(activeTab, label, {
          preserveSheetState: true,
          filters: { priceLevels: nextLevels },
        });
        return;
      }
      void submitSearch(
        { priceLevels: nextLevels, page: 1, preserveSheetState: true },
        committedQuery
      );
    }, 150);
  }, [
    activeTab,
    isSearchSessionActive,
    pendingPriceRange,
    priceLevels,
    query,
    runBestHere,
    searchMode,
    setPriceLevels,
    submitSearch,
    submittedQuery,
  ]);

  const closePriceSelector = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
  }, []);

  React.useEffect(() => {
    return registerTransientDismissor(() => {
      if (!isSuggestionPanelActive && !isSuggestionPanelVisible) {
        setRestaurantOverlayVisible(false);
      }
      closePriceSelector();
      closeScoreInfo();
    });
  }, [
    closePriceSelector,
    closeScoreInfo,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    registerTransientDismissor,
  ]);

  const handlePriceDone = React.useCallback(() => {
    commitPriceSelection();
  }, [commitPriceSelection]);

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

  const clearCameraPersistTimeout = React.useCallback(() => {
    if (cameraPersistTimeoutRef.current) {
      clearTimeout(cameraPersistTimeoutRef.current);
      cameraPersistTimeoutRef.current = null;
    }
  }, []);

  const clearCameraStateSync = React.useCallback(() => {
    if (cameraStateSyncTimeoutRef.current) {
      clearTimeout(cameraStateSyncTimeoutRef.current);
      cameraStateSyncTimeoutRef.current = null;
    }
  }, []);

  const commitCameraState = React.useCallback(
    (payload: { center: [number, number]; zoom: number; padding?: MapCameraPadding | null }) => {
      setMapCenter(payload.center);
      setMapZoom(payload.zoom);
      setMapCameraPadding(payload.padding ?? null);
      lastCameraStateRef.current = { center: payload.center, zoom: payload.zoom };
    },
    [setMapCameraPadding, setMapCenter, setMapZoom]
  );

  const scheduleCameraStateCommit = React.useCallback(
    (
      payload: { center: [number, number]; zoom: number; padding?: MapCameraPadding | null },
      delayMs = PROFILE_CAMERA_ANIMATION_MS + FIT_BOUNDS_SYNC_BUFFER_MS
    ) => {
      clearCameraStateSync();
      cameraStateSyncTimeoutRef.current = setTimeout(() => {
        cameraStateSyncTimeoutRef.current = null;
        commitCameraState(payload);
      }, delayMs);
    },
    [clearCameraStateSync, commitCameraState]
  );

  const clearProfileTransitionLock = React.useCallback(() => {
    if (profileTransitionTimeoutRef.current) {
      clearTimeout(profileTransitionTimeoutRef.current);
      profileTransitionTimeoutRef.current = null;
    }
  }, []);

  const setProfileTransitionStatus = React.useCallback(
    (status: ProfileTransitionStatus, settleTo?: ProfileTransitionStatus) => {
      profileTransitionRef.current.status = status;
      setProfileTransitionStatusState(status);
      clearProfileTransitionLock();
      if (settleTo) {
        profileTransitionTimeoutRef.current = setTimeout(() => {
          profileTransitionRef.current.status = settleTo;
          setProfileTransitionStatusState(settleTo);
        }, PROFILE_TRANSITION_LOCK_MS);
      }
    },
    [clearProfileTransitionLock]
  );

  const captureCameraSnapshot = React.useCallback((): CameraSnapshot | null => {
    const current = lastCameraStateRef.current;
    const center = current?.center ?? mapCenter ?? USA_FALLBACK_CENTER;
    const zoom = current?.zoom ?? mapZoom ?? USA_FALLBACK_ZOOM;
    if (!center || typeof zoom !== 'number' || !Number.isFinite(zoom)) {
      return null;
    }
    return {
      center: [center[0], center[1]],
      zoom,
      padding: mapCameraPadding ? { ...mapCameraPadding } : null,
    };
  }, [mapCameraPadding, mapCenter, mapZoom]);

  const ensureProfileTransitionSnapshot = React.useCallback(() => {
    const transition = profileTransitionRef.current;
    if (!transition.savedSheetSnap) {
      const candidate = sheetState === 'hidden' ? lastVisibleSheetStateRef.current : sheetState;
      transition.savedSheetSnap =
        candidate === 'hidden' ? lastVisibleSheetStateRef.current : candidate;
    }
    if (!transition.savedCamera) {
      const snapshot = captureCameraSnapshot();
      if (snapshot) {
        transition.savedCamera = snapshot;
      }
    }
    if (transition.savedResultsScrollOffset === null) {
      transition.savedResultsScrollOffset = resultsScrollOffset.value;
    }
  }, [captureCameraSnapshot, sheetState]);

  const resolveProfileCameraPadding = React.useCallback((): MapCameraPadding => {
    const snaps = calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarTop, 0);
    const topPadding = Math.max(searchBarTop + (searchBarFrame?.height ?? 0), snaps.expanded);
    const desiredCenter = SCREEN_HEIGHT * PROFILE_PIN_TARGET_CENTER_RATIO;
    const minCenter = topPadding + PROFILE_PIN_MIN_VISIBLE_HEIGHT / 2;
    const targetCenter = Math.max(desiredCenter, minCenter);
    const bottomPadding = Math.max(SCREEN_HEIGHT + topPadding - 2 * targetCenter, 0);
    return {
      paddingTop: topPadding,
      paddingBottom: bottomPadding,
      paddingLeft: 0,
      paddingRight: 0,
    };
  }, [insets.top, navBarTop, searchBarFrame?.height, searchBarTop]);

  const buildFitBoundsPadding = React.useCallback(
    (padding: MapCameraPadding) =>
      [
        padding.paddingTop,
        padding.paddingRight,
        padding.paddingBottom,
        padding.paddingLeft,
      ] as const,
    []
  );

  const syncCameraStateFromMap = React.useCallback(async () => {
    if (!mapRef.current?.getCenter || !mapRef.current?.getZoom) {
      return;
    }
    try {
      const [center, zoom] = await Promise.all([
        mapRef.current.getCenter(),
        mapRef.current.getZoom(),
      ]);
      if (!isLngLatTuple(center) || typeof zoom !== 'number' || !Number.isFinite(zoom)) {
        return;
      }
      clearCameraPersistTimeout();
      const nextCenter: [number, number] = [center[0], center[1]];
      setMapCenter(nextCenter);
      setMapZoom(zoom);
      lastCameraStateRef.current = { center: nextCenter, zoom };
    } catch {
      // ignore
    }
  }, [clearCameraPersistTimeout]);

  const scheduleFitBoundsCameraSync = React.useCallback(
    (
      delayMs = PROFILE_CAMERA_ANIMATION_MS + FIT_BOUNDS_SYNC_BUFFER_MS,
      paddingToApply?: MapCameraPadding | null
    ) => {
      if (fitBoundsSyncTimeoutRef.current) {
        clearTimeout(fitBoundsSyncTimeoutRef.current);
      }
      fitBoundsSyncTimeoutRef.current = setTimeout(() => {
        fitBoundsSyncTimeoutRef.current = null;
        if (paddingToApply !== undefined) {
          setMapCameraPadding(paddingToApply);
        }
        void syncCameraStateFromMap();
      }, delayMs);
    },
    [setMapCameraPadding, syncCameraStateFromMap]
  );

  const focusRestaurantLocations = React.useCallback(
    (
      restaurant: RestaurantResult,
      options?: { padding?: MapCameraPadding; animationDuration?: number }
    ) => {
      const locations = resolveRestaurantMapLocations(restaurant);
      if (locations.length < 2) {
        return false;
      }

      const lats = locations.map((location) => location.latitude);
      const lngs = locations.map((location) => location.longitude);
      const bounds = {
        northEast: {
          lat: Math.max(...lats),
          lng: Math.max(...lngs),
        },
        southWest: {
          lat: Math.min(...lats),
          lng: Math.min(...lngs),
        },
      };

      clearCameraStateSync();
      setIsFollowingUser(false);
      clearCameraPersistTimeout();
      if (cameraRef.current?.fitBounds) {
        const padding = options?.padding ?? focusPaddingObject;
        const paddingArray = buildFitBoundsPadding(padding);
        const animationDuration = options?.animationDuration ?? PROFILE_CAMERA_ANIMATION_MS;
        suppressMapMoved();
        cameraRef.current.fitBounds(
          [bounds.northEast.lng, bounds.northEast.lat],
          [bounds.southWest.lng, bounds.southWest.lat],
          paddingArray,
          animationDuration
        );
        scheduleFitBoundsCameraSync(animationDuration + FIT_BOUNDS_SYNC_BUFFER_MS, padding);
      }
      return true;
    },
    [
      buildFitBoundsPadding,
      clearCameraPersistTimeout,
      clearCameraStateSync,
      focusPaddingObject,
      resolveRestaurantMapLocations,
      scheduleFitBoundsCameraSync,
      setIsFollowingUser,
      suppressMapMoved,
    ]
  );

  const openRestaurantProfilePreview = React.useCallback(
    (restaurantId: string, restaurantName: string) => {
      const trimmedName = restaurantName.trim();
      if (!restaurantId || !trimmedName) {
        return;
      }
      const transition = profileTransitionRef.current;
      if (transition.status === 'opening' || transition.status === 'closing') {
        return;
      }
      profileDismissBehaviorRef.current = 'clear';
      shouldClearSearchOnProfileDismissRef.current = false;
      ensureProfileTransitionSnapshot();
      transition.savedSheetSnap = 'hidden';
      setProfileTransitionStatus('open');
      setRestaurantProfile({
        restaurant: {
          restaurantId,
          restaurantName: trimmedName,
          restaurantAliases: [],
          contextualScore: 0,
          topFood: [],
        },
        dishes: [],
        queryLabel: trimmedName,
        isFavorite: false,
        isLoading: true,
      });
      setRestaurantOverlayVisible(true);
    },
    [ensureProfileTransitionSnapshot, setProfileTransitionStatus]
  );
  openRestaurantProfilePreviewRef.current = openRestaurantProfilePreview;

  const openRestaurantProfile = React.useCallback(
    (
      restaurant: RestaurantResult,
      foodResultsOverride?: FoodResult[],
      source:
        | 'results_sheet'
        | 'auto_open_single_candidate'
        | 'autocomplete'
        | 'dish_card' = 'results_sheet'
    ) => {
      const transition = profileTransitionRef.current;
      if (transition.status === 'opening' || transition.status === 'closing') {
        return;
      }
      const shouldClearOnDismiss =
        source === 'auto_open_single_candidate' ||
        restaurantOnlySearchRef.current === restaurant.restaurantId;
      profileDismissBehaviorRef.current = shouldClearOnDismiss ? 'clear' : 'restore';
      shouldClearSearchOnProfileDismissRef.current = shouldClearOnDismiss;
      const sourceDishes = foodResultsOverride ?? dishes;
      const restaurantDishes = sourceDishes
        .filter((dish) => dish.restaurantId === restaurant.restaurantId)
        .sort((a, b) => {
          const scoreA = a.displayScore ?? a.qualityScore;
          const scoreB = b.displayScore ?? b.qualityScore;
          return scoreB - scoreA;
        });
      const label = (submittedQuery || trimmedQuery || 'Search').trim();
      ensureProfileTransitionSnapshot();
      hasRestoredProfileMapRef.current = false;
      hasCenteredOnLocationRef.current = true;
      if (!isInitialCameraReady) {
        setIsInitialCameraReady(true);
      }
      setProfileTransitionStatus('opening', 'open');
      if (isSearchOverlay && sheetState !== 'hidden') {
        if (shouldLogSearchStateChanges) {
          // eslint-disable-next-line no-console
          console.log(
            `[SearchPerf] AutoSnap collapsed reason=openRestaurantProfile source=${source} restaurantId=${restaurant.restaurantId} sheetState=${sheetState}`
          );
        }
        animateSheetTo('collapsed');
      }
      clearCameraPersistTimeout();
      clearCameraStateSync();
      if (fitBoundsSyncTimeoutRef.current) {
        clearTimeout(fitBoundsSyncTimeoutRef.current);
        fitBoundsSyncTimeoutRef.current = null;
      }
      // Store and hide save sheet if visible
      if (saveSheetState.visible && !previousSaveSheetStateRef.current) {
        previousSaveSheetStateRef.current = saveSheetState;
        setSaveSheetState((prev) => ({ ...prev, visible: false }));
      }

      const profilePadding = resolveProfileCameraPadding();
      const didFitBounds = focusRestaurantLocations(restaurant, {
        padding: profilePadding,
        animationDuration: PROFILE_CAMERA_ANIMATION_MS,
      });
      if (!didFitBounds) {
        const [location] = resolveRestaurantMapLocations(restaurant);
        if (location) {
          const nextCenter: [number, number] = [location.longitude, location.latitude];
          const currentZoom =
            lastCameraStateRef.current?.zoom ?? (typeof mapZoom === 'number' ? mapZoom : null);
          if (typeof currentZoom === 'number' && Number.isFinite(currentZoom)) {
            clearCameraPersistTimeout();
            setIsFollowingUser(false);
            suppressMapMoved();
            if (!cameraRef.current?.setCamera) {
              commitCameraState({
                center: nextCenter,
                zoom: currentZoom,
                padding: profilePadding,
              });
            } else {
              cameraRef.current.setCamera({
                centerCoordinate: nextCenter,
                zoomLevel: currentZoom,
                padding: profilePadding,
                animationDuration: PROFILE_CAMERA_ANIMATION_MS,
                animationMode: 'easeTo',
              });
              scheduleCameraStateCommit(
                {
                  center: nextCenter,
                  zoom: currentZoom,
                  padding: profilePadding,
                },
                PROFILE_CAMERA_ANIMATION_MS + FIT_BOUNDS_SYNC_BUFFER_MS
              );
            }
          } else if (lastCameraStateRef.current) {
            lastCameraStateRef.current = { ...lastCameraStateRef.current, center: nextCenter };
          }
        }
      }

      setRestaurantProfile({
        restaurant,
        dishes: restaurantDishes,
        queryLabel: label,
        isFavorite: false,
        isLoading: false,
      });
      setRestaurantOverlayVisible(true);

      if (source !== 'autocomplete' && source !== 'dish_card') {
        deferRecentlyViewedTrack(restaurant.restaurantId, restaurant.restaurantName);
        void recordRestaurantView(restaurant.restaurantId, source);
      }
    },
    [
      animateSheetTo,
      commitCameraState,
      clearCameraStateSync,
      clearCameraPersistTimeout,
      dishes,
      ensureProfileTransitionSnapshot,
      focusRestaurantLocations,
      isSearchOverlay,
      isInitialCameraReady,
      mapZoom,
      resolveRestaurantMapLocations,
      resolveProfileCameraPadding,
      saveSheetState,
      scheduleCameraStateCommit,
      setIsInitialCameraReady,
      setProfileTransitionStatus,
      sheetState,
      shouldLogSearchStateChanges,
      submittedQuery,
      suppressMapMoved,
      trimmedQuery,
      trackRecentlyViewedRestaurant,
      recordRestaurantView,
    ]
  );

  const openRestaurantProfileFromResults = React.useCallback(
    (
      restaurant: RestaurantResult,
      foodResultsOverride?: FoodResult[],
      source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
    ) => {
      openRestaurantProfile(restaurant, foodResultsOverride, source ?? 'results_sheet');
    },
    [openRestaurantProfile]
  );

  // Stable wrapper for openRestaurantProfileFromResults using ref pattern
  // This prevents render callback dependencies from changing when openRestaurantProfile changes
  const openRestaurantProfileFromResultsRef = React.useRef(openRestaurantProfileFromResults);
  openRestaurantProfileFromResultsRef.current = openRestaurantProfileFromResults;

  const stableOpenRestaurantProfileFromResults = React.useCallback(
    (
      restaurant: RestaurantResult,
      foodResultsOverride?: FoodResult[],
      source?: 'results_sheet' | 'auto_open_single_candidate' | 'dish_card'
    ) => {
      openRestaurantProfileFromResultsRef.current(restaurant, foodResultsOverride, source);
    },
    []
  );

  const handleMapTouchStart = React.useCallback(() => {
    mapTouchActiveRef.current = true;
    mapTouchStartedWithResultsSheetOpenRef.current = shouldRenderResultsSheetRef.current;
    mapGestureSessionRef.current = null;
  }, []);

  const handleMapTouchEnd = React.useCallback(() => {
    mapTouchActiveRef.current = false;
    mapTouchStartedWithResultsSheetOpenRef.current = false;
    mapGestureSessionRef.current = null;
  }, []);

  const handleMarkerPress = React.useCallback(
    (restaurantId: string) => {
      const restaurant = restaurants.find((r) => r.restaurantId === restaurantId);
      if (!restaurant) {
        return;
      }
      openRestaurantProfile(restaurant, undefined, 'results_sheet');
    },
    [openRestaurantProfile, restaurants]
  );

  const handleMapPressRef = React.useRef(handleMapPress);
  const handleCameraChangedRef = React.useRef(handleCameraChanged);
  const handleMapIdleRef = React.useRef(handleMapIdle);
  const handleMapLoadedRef = React.useRef(handleMapLoaded);
  const handleMarkerPressRef = React.useRef(handleMarkerPress);

  handleMapPressRef.current = handleMapPress;
  handleCameraChangedRef.current = handleCameraChanged;
  handleMapIdleRef.current = handleMapIdle;
  handleMapLoadedRef.current = handleMapLoaded;
  handleMarkerPressRef.current = handleMarkerPress;

  const stableHandleMapPress = React.useCallback(() => {
    handleMapPressRef.current();
  }, []);
  const stableHandleCameraChanged = React.useCallback((state: MapboxMapState) => {
    handleCameraChangedRef.current(state);
  }, []);
  const stableHandleMapIdle = React.useCallback((state: MapboxMapState) => {
    handleMapIdleRef.current(state);
  }, []);
  const stableHandleMapLoaded = React.useCallback(() => {
    handleMapLoadedRef.current();
  }, []);
  const stableHandleMarkerPress = React.useCallback((restaurantId: string) => {
    handleMarkerPressRef.current(restaurantId);
  }, []);

  const getShouldDeferMarkerMount = React.useCallback(() => {
    const interactionState = searchInteractionRef.current;
    return interactionState.isInteracting || isLoadingRef.current || isLoadingMoreRef.current;
  }, []);

  React.useEffect(() => {
    if (!results) {
      return;
    }
    if (isSuggestionPanelActive || isSearchFocused) {
      return;
    }
    const pendingSelection = pendingRestaurantSelectionRef.current;
    if (pendingSelection) {
      const targetRestaurant = results.restaurants?.find(
        (restaurant) => restaurant.restaurantId === pendingSelection.restaurantId
      );
      if (!targetRestaurant) {
        pendingRestaurantSelectionRef.current = null;
        return;
      }
      pendingRestaurantSelectionRef.current = null;
      openRestaurantProfile(targetRestaurant, results.dishes ?? [], 'autocomplete');
      const queryKey = (submittedQuery || trimmedQuery).trim();
      if (queryKey) {
        lastAutoOpenKeyRef.current = `${queryKey.toLowerCase()}::${targetRestaurant.restaurantId}`;
      }
      return;
    }
    const targetRestaurant = resolveSingleRestaurantCandidate(results);
    if (!targetRestaurant) {
      return;
    }
    const queryKey = (submittedQuery || trimmedQuery).trim();
    if (!queryKey) {
      return;
    }
    const autoOpenKey = `${queryKey.toLowerCase()}::${targetRestaurant.restaurantId}`;
    if (lastAutoOpenKeyRef.current === autoOpenKey) {
      return;
    }
    openRestaurantProfile(targetRestaurant, results.dishes ?? [], 'auto_open_single_candidate');
    lastAutoOpenKeyRef.current = autoOpenKey;
  }, [
    isSearchFocused,
    isSuggestionPanelActive,
    openRestaurantProfile,
    results,
    submittedQuery,
    trimmedQuery,
  ]);

  const handleRestaurantSavePress = React.useCallback((restaurantId: string) => {
    setSaveSheetState({
      visible: true,
      listType: 'restaurant',
      target: { restaurantId },
    });
  }, []);

  const handleCloseSaveSheet = React.useCallback(() => {
    setSaveSheetState((prev) => ({ ...prev, visible: false, target: null }));
  }, []);

  React.useEffect(() => {
    if (!isSearchOverlay && saveSheetState.visible) {
      handleCloseSaveSheet();
    }
  }, [handleCloseSaveSheet, isSearchOverlay, saveSheetState.visible]);

  const applyCameraSnapshot = React.useCallback(
    (snapshot: CameraSnapshot, options?: { animationDuration?: number }) => {
      const padding = snapshot.padding ?? {
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
      };
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
      const animationDuration = options?.animationDuration ?? PROFILE_RESTORE_ANIMATION_MS;
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
        animationDuration + FIT_BOUNDS_SYNC_BUFFER_MS
      );
    },
    [
      clearCameraStateSync,
      clearCameraPersistTimeout,
      commitCameraState,
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
    applyCameraSnapshot(snapshot, { animationDuration: PROFILE_RESTORE_ANIMATION_MS });
  }, [applyCameraSnapshot, clearCameraStateSync, setMapCameraPadding]);

  const restoreSearchSheetState = React.useCallback(() => {
    const transition = profileTransitionRef.current;
    const fallbackState = lastVisibleSheetStateRef.current;
    const targetState = transition.savedSheetSnap ?? fallbackState;
    if (targetState && targetState !== 'hidden' && targetState !== sheetState) {
      animateSheetTo(targetState);
    }
    transition.savedSheetSnap = null;
  }, [animateSheetTo, sheetState]);

  const closeRestaurantProfile = React.useCallback(() => {
    // Guard against calling close when already closed or nothing to close
    if (!restaurantProfile && !isRestaurantOverlayVisible) {
      return;
    }
    const transition = profileTransitionRef.current;
    if (transition.status !== 'closing') {
      setProfileTransitionStatus('closing');
    }
    if (profileDismissBehaviorRef.current === 'clear') {
      resetSheetToHidden();
    }
    handleRestaurantOverlayDismissed();
  }, [
    handleRestaurantOverlayDismissed,
    isRestaurantOverlayVisible,
    restaurantProfile,
    resetSheetToHidden,
    setProfileTransitionStatus,
  ]);
  closeRestaurantProfileRef.current = closeRestaurantProfile;

  const handleRestaurantOverlayRequestClose = React.useCallback(() => {
    closeRestaurantProfile();
  }, [closeRestaurantProfile]);

  const handleRestaurantOverlayDismissed = React.useCallback(() => {
    const shouldRestoreSearchSheet = profileDismissBehaviorRef.current !== 'clear';
    const shouldClearSearch = shouldClearSearchOnProfileDismissRef.current;
    setRestaurantProfile(null);
    setRestaurantOverlayVisible(false);
    restoreRestaurantProfileMap();
    if (isSearchOverlay && shouldRestoreSearchSheet) {
      restoreSearchSheetState();
    }
    // Restore the save sheet if it was visible
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
    isSearchOverlay,
    restoreRestaurantProfileMap,
    restoreSearchSheetState,
    setProfileTransitionStatusState,
  ]);
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
      map.set(restaurant.restaurantId, getMarkerColorForRestaurant(restaurant));
    });
    return map;
  }, [restaurants]);
  const dishQualityColorByConnectionId = React.useMemo(() => {
    const map = new Map<string, string>();
    dishes.forEach((dish) => {
      map.set(dish.connectionId, getQualityColorFromPercentile(dish.displayPercentile));
    });
    return map;
  }, [dishes]);
  restaurantQualityColorByIdRef.current = restaurantQualityColorById;
  dishQualityColorByConnectionIdRef.current = dishQualityColorByConnectionId;

  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => {
      const restaurantForDish = restaurantsById.get(item.restaurantId);
      const isLiked = false;
      const qualityColor =
        dishQualityColorByConnectionIdRef.current.get(item.connectionId) ??
        getQualityColorFromPercentile(item.displayPercentile);
      return (
        <DishResultCard
          item={item}
          index={index}
          qualityColor={qualityColor}
          isLiked={isLiked}
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
      stableOpenRestaurantProfileFromResults,
      openScoreInfo,
      primaryCoverageKey,
      restaurantsById,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (restaurant: RestaurantResult, index: number) => {
      const isLiked = false;
      const qualityColor =
        restaurantQualityColorByIdRef.current.get(restaurant.restaurantId) ??
        getMarkerColorForRestaurant(restaurant);
      return (
        <RestaurantResultCard
          restaurant={restaurant}
          index={index}
          qualityColor={qualityColor}
          isLiked={isLiked}
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
      stableOpenRestaurantProfileFromResults,
      openScoreInfo,
      primaryFoodTerm,
      primaryCoverageKey,
    ]
  );

  const filtersHeader = React.useMemo(
    () => (
      <SearchFilters
        activeTab={activeTab}
        onTabChange={setActiveTab}
        openNow={openNow}
        onToggleOpenNow={toggleOpenNow}
        votesFilterActive={votesFilterActive}
        onToggleVotesFilter={toggleVotesFilter}
        priceButtonLabel={priceButtonLabelText}
        priceButtonActive={priceButtonIsActive}
        onTogglePriceSelector={togglePriceSelector}
        isPriceSelectorVisible={isPriceSelectorVisible}
        contentHorizontalPadding={CONTENT_HORIZONTAL_PADDING}
        accentColor={ACTIVE_TAB_COLOR}
        disableBlur={shouldDisableSearchBlur}
        initialLayoutCache={searchFiltersLayoutCacheRef.current}
        onLayoutCacheChange={handleSearchFiltersLayoutCache}
      />
    ),
    [
      activeTab,
      openNow,
      votesFilterActive,
      priceButtonLabelText,
      priceButtonIsActive,
      isPriceSelectorVisible,
      toggleOpenNow,
      toggleVotesFilter,
      togglePriceSelector,
      handleSearchFiltersLayoutCache,
      shouldDisableSearchBlur,
    ]
  );

  const resultsKeyExtractor = React.useCallback(
    (item: FoodResult | RestaurantResult, index: number) => {
      if (item && 'foodId' in item) {
        if (item.connectionId) {
          return item.connectionId;
        }
        if (item.foodId && item.restaurantId) {
          return `${item.foodId}-${item.restaurantId}`;
        }
        return `dish-${index}`;
      }
      if (item && 'restaurantId' in item) {
        return item.restaurantId || `restaurant-${index}`;
      }
      return `result-${index}`;
    },
    []
  );

  const isDishesTab = activeTab === 'dishes';
  const resultsData = React.useMemo(() => {
    const source = isDishesTab ? dishes : restaurants;
    if (!Array.isArray(source)) {
      logger.error('resultsData not array', { tab: activeTab, type: typeof source });
      return isDishesTab ? EMPTY_DISHES : EMPTY_RESTAURANTS;
    }
    return source;
  }, [activeTab, dishes, restaurants, isDishesTab]);
  const safeResultsData = React.useMemo(() => {
    if (!Array.isArray(resultsData) || resultsData.length === 0) {
      return EMPTY_RESULTS;
    }
    const filtered = resultsData.filter(
      (item): item is FoodResult | RestaurantResult => item !== null && item !== undefined
    );
    return filtered.length > 0 ? filtered : EMPTY_RESULTS;
  }, [resultsData]);
  const shouldShowResultsOverlay = isFilterTogglePending && safeResultsData.length > 0;
  const estimatedDishItemSize = 240;
  const estimatedRestaurantItemSize = 270;
  const estimatedItemSize = isDishesTab ? estimatedDishItemSize : estimatedRestaurantItemSize;
  const placeholderItemStyle = React.useMemo(
    () => ({ minHeight: estimatedItemSize }),
    [estimatedItemSize]
  );
  const renderPlaceholderItem = React.useCallback(
    (index: number) => (
      <View
        style={[styles.resultItem, index === 0 && styles.firstResultItem, placeholderItemStyle]}
      />
    ),
    [placeholderItemStyle]
  );
  const getResultItemType = React.useCallback<
    FlashListProps<FoodResult | RestaurantResult>['getItemType']
  >((item) => ('foodId' in item ? 'dish' : 'restaurant'), []);

  const renderPlaceholderFlashListItem = React.useCallback<
    NonNullable<FlashListProps<FoodResult | RestaurantResult>['renderItem']>
  >(({ index }) => renderPlaceholderItem(index), [renderPlaceholderItem]);
  const renderResultsFlashListItem = React.useCallback<
    NonNullable<FlashListProps<FoodResult | RestaurantResult>['renderItem']>
  >(
    ({ item, index }) => {
      if (item === undefined || item === null) {
        logger.error('FlashList renderItem received nullish item', { index });
        return null;
      }
      return 'foodId' in item
        ? renderDishCard(item as FoodResult, index)
        : renderRestaurantCard(item as RestaurantResult, index);
    },
    [renderDishCard, renderRestaurantCard]
  );
  const resultsRenderItem = shouldUsePlaceholderRows
    ? renderPlaceholderFlashListItem
    : renderResultsFlashListItem;
  const resultsListKey = React.useMemo(() => 'results', []);
  const resultsListData = React.useMemo(() => {
    if (!shouldHydrateResults) {
      return safeResultsData;
    }
    const targetCount = Math.min(6, safeResultsData.length);
    return targetCount > 0 ? safeResultsData.slice(0, targetCount) : safeResultsData;
  }, [shouldHydrateResults, safeResultsData]);
  React.useEffect(() => {
    if (!resultsHydrationKey) {
      if (hydratedResultsKey !== null) {
        setHydratedResultsKey(null);
      }
      return;
    }
    if (resultsHydrationKey === hydratedResultsKey) {
      return;
    }
    if (resultsHydrationTaskRef.current) {
      resultsHydrationTaskRef.current.cancel();
      resultsHydrationTaskRef.current = null;
    }
    resultsHydrationTaskRef.current = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        setHydratedResultsKey(resultsHydrationKey);
      });
    });
    return () => {
      if (resultsHydrationTaskRef.current) {
        resultsHydrationTaskRef.current.cancel();
        resultsHydrationTaskRef.current = null;
      }
    };
  }, [hydratedResultsKey, resultsHydrationKey]);
  const listHeader = React.useMemo(() => {
    if (shouldDisableFiltersHeader) {
      return null;
    }
    return (
      <View style={styles.resultsListHeader} onLayout={handleFiltersHeaderLayout}>
        {filtersHeader}
      </View>
    );
  }, [filtersHeader, handleFiltersHeaderLayout, shouldDisableFiltersHeader]);
  const shouldRetrySearchOnReconnect = shouldRetrySearchOnReconnectRef.current;
  const shouldShowResultsLoadingState =
    (isLoading || hasSystemStatusBanner || shouldRetrySearchOnReconnect || isFilterTogglePending) &&
    !results;
  const shouldShowResultsSurface =
    shouldShowResultsLoadingState ||
    shouldUsePlaceholderRows ||
    safeResultsData.length > 0 ||
    Boolean(results);
  const effectiveFiltersHeaderHeight = shouldDisableFiltersHeader ? 0 : filtersHeaderHeight;
  const effectiveResultsHeaderHeight = shouldDisableResultsHeader ? 0 : resultsSheetHeaderHeight;
  const resultsListBackground = React.useMemo(() => {
    if (!shouldShowResultsSurface) {
      return null;
    }
    if (shouldDisableSearchBlur) {
      return <View style={[styles.resultsListBackground, { top: 0 }]} />;
    }
    return <FrostedGlassBackground />;
  }, [shouldDisableSearchBlur, shouldShowResultsSurface]);
  const resultsLoadingOverlay = React.useMemo(() => {
    if (!shouldShowResultsOverlay) {
      return null;
    }
    const topOffset = Math.max(0, effectiveResultsHeaderHeight + effectiveFiltersHeaderHeight);
    const pointerEvents = topOffset > 0 ? 'auto' : 'none';
    return (
      <View
        pointerEvents={pointerEvents}
        style={[styles.resultsLoadingOverlay, { top: topOffset }]}
      >
        <View style={styles.resultsLoadingOverlayBackdrop} />
        <View style={styles.resultsLoadingOverlaySpinner}>
          <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
        </View>
      </View>
    );
  }, [effectiveFiltersHeaderHeight, effectiveResultsHeaderHeight, shouldShowResultsOverlay]);
  const resultsWashTopOffset = Math.max(
    0,
    effectiveResultsHeaderHeight + effectiveFiltersHeaderHeight
  );
  const resultsOverlayComponent = React.useMemo(
    () => (
      <>
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.resultsWashOverlay,
            { top: resultsWashTopOffset },
            resultsWashAnimatedStyle,
          ]}
        />
        {resultsLoadingOverlay}
      </>
    ),
    [resultsLoadingOverlay, resultsWashAnimatedStyle, resultsWashTopOffset]
  );

  const ResultItemSeparator = React.useCallback(
    () => <View style={styles.resultItemSeparator} />,
    []
  );

  const resultsListFooterComponent = React.useMemo(() => {
    const shouldShowNotice = Boolean(onDemandNotice && safeResultsData.length > 0);
    return (
      <View style={styles.loadMoreSpacer}>
        {shouldShowNotice ? onDemandNotice : null}
        {isLoadingMore && canLoadMore ? (
          <View style={styles.loadMoreSpinner}>
            <SquircleSpinner size={18} color={ACTIVE_TAB_COLOR} />
          </View>
        ) : null}
      </View>
    );
  }, [canLoadMore, isLoadingMore, onDemandNotice, safeResultsData.length]);

  const resultsListEmptyComponent = React.useMemo(() => {
    const visibleSheetHeight = Math.max(0, SCREEN_HEIGHT - snapPoints.middle);
    const emptyAreaMinHeight = Math.max(
      0,
      visibleSheetHeight - effectiveResultsHeaderHeight - effectiveFiltersHeaderHeight
    );
    const emptyAreaStyle = { minHeight: emptyAreaMinHeight };
    const emptyYOffset = -Math.min(44, Math.max(20, emptyAreaMinHeight * 0.18));
    const emptyContentOffsetStyle = { transform: [{ translateY: emptyYOffset }] };
    const emptySubtitle =
      results?.metadata?.emptyQueryMessage ?? 'Try moving the map or adjusting your search.';

    if (shouldShowResultsLoadingState || isFilterTogglePending) {
      return (
        <View
          style={[
            styles.resultsEmptyArea,
            emptyAreaStyle,
            { justifyContent: 'flex-start', paddingTop: RESULTS_LOADING_SPINNER_OFFSET },
          ]}
        >
          <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
        </View>
      );
    }
    return (
      <View style={[styles.resultsEmptyArea, emptyAreaStyle]}>
        <View style={emptyContentOffsetStyle}>
          {onDemandNotice}
          <EmptyState
            title={activeTab === 'dishes' ? 'No dishes found.' : 'No restaurants found.'}
            subtitle={emptySubtitle}
          />
        </View>
      </View>
    );
  }, [
    activeTab,
    effectiveFiltersHeaderHeight,
    effectiveResultsHeaderHeight,
    isFilterTogglePending,
    onDemandNotice,
    results,
    shouldShowResultsLoadingState,
    snapPoints.middle,
  ]);
  const searchThisAreaTop = Math.max(searchLayout.top + searchLayout.height + 12, insets.top + 12);
  const statusBarFadeHeightFallback = Math.max(0, insets.top + 16);
  const statusBarFadeHeight = Math.max(
    0,
    searchLayout.top > 0 ? searchLayout.top + 8 : statusBarFadeHeightFallback
  );
  const handleResultsHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (shouldDisableResultsHeader) {
        return;
      }
      const isInteracting = searchInteractionRef.current.isInteracting;
      if (isInteracting) {
        if (resultsSheetHeaderHeightRef.current === 0) {
          measureResultsHeaderNow(event);
        }
        return;
      }
      onResultsHeaderLayout(event);
    },
    [
      measureResultsHeaderNow,
      onResultsHeaderLayout,
      searchInteractionRef,
      resultsSheetHeaderHeightRef,
      shouldDisableResultsHeader,
    ]
  );
  const handleFiltersHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (shouldDisableFiltersHeader) {
        return;
      }
      if (searchInteractionRef.current.isInteracting) {
        if (filtersHeaderHeightRef.current === 0) {
          measureFiltersHeaderNow(event);
        }
        return;
      }
      onFiltersHeaderLayout(event);
    },
    [
      filtersHeaderHeightRef,
      measureFiltersHeaderNow,
      onFiltersHeaderLayout,
      searchInteractionRef,
      shouldDisableFiltersHeader,
    ]
  );
  const shouldUseResultsHeaderBlur = !shouldDisableSearchBlur;
  const resultsHeaderComponent = React.useMemo(() => {
    if (shouldDisableResultsHeader) {
      return null;
    }
    return (
      <OverlaySheetHeaderChrome
        onLayout={handleResultsHeaderLayout}
        onGrabHandlePress={hidePanel}
        grabHandleAccessibilityLabel="Hide results"
        paddingHorizontal={CONTENT_HORIZONTAL_PADDING}
        transparent={shouldUseResultsHeaderBlur}
        style={[
          styles.resultsHeaderSurface,
          shouldUseResultsHeaderBlur ? null : styles.resultsHeaderSurfaceSolid,
        ]}
        title={
          <Text
            variant="title"
            weight="semibold"
            style={styles.submittedQueryLabel}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {submittedQuery || 'Results'}
          </Text>
        }
        actionButton={
          <OverlayHeaderActionButton
            progress={overlayHeaderActionProgress}
            onPress={handleCloseResults}
            accessibilityLabel="Close results"
            accentColor={ACTIVE_TAB_COLOR}
            closeColor="#000000"
          />
        }
        showDivider={false}
        afterRow={
          <Reanimated.View
            style={[
              overlaySheetStyles.headerDivider,
              styles.resultsHeaderBottomSeparator,
              headerDividerAnimatedStyle,
            ]}
          />
        }
      />
    );
  }, [
    handleCloseResults,
    handleResultsHeaderLayout,
    headerDividerAnimatedStyle,
    hidePanel,
    overlayHeaderActionProgress,
    shouldDisableResultsHeader,
    shouldUseResultsHeaderBlur,
    submittedQuery,
  ]);
  const resultsContentContainerStyle = React.useMemo(
    () => ({
      paddingBottom: safeResultsData.length > 0 ? RESULTS_BOTTOM_PADDING : 0,
    }),
    [safeResultsData.length]
  );
  const resultsDrawDistance = shouldHydrateResults ? 360 : 900;
  const resultsInitialDrawBatchSize = shouldHydrateResults ? 2 : 8;
  const viewabilityLogIntervalMs = 250;
  const lastResultsViewabilityLogRef = React.useRef(0);
  const resultsViewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 1, minimumViewTime: 16 }),
    []
  );
  const handleResultsViewableItemsChanged = React.useCallback<
    NonNullable<FlashListProps<FoodResult | RestaurantResult>['onViewableItemsChanged']>
  >(
    (info) => {
      if (!shouldLogResultsViewability || safeResultsData.length === 0) {
        return;
      }
      const viewableCount = info.viewableItems.filter((token) => token.isViewable).length;
      if (viewableCount > 0 || !searchInteractionRef.current.isResultsListScrolling) {
        return;
      }
      const now = Date.now();
      if (now - lastResultsViewabilityLogRef.current < viewabilityLogIntervalMs) {
        return;
      }
      lastResultsViewabilityLogRef.current = now;
      // eslint-disable-next-line no-console
      console.log(
        `[SearchPerf] viewable=0 data=${
          safeResultsData.length
        } tab=${activeTab} page=${currentPage} loading=${isLoading} loadingMore=${isLoadingMore} hydrate=${shouldHydrateResults} offset=${Math.round(
          resultsScrollOffset.value
        )}`
      );
    },
    [
      activeTab,
      currentPage,
      isLoading,
      isLoadingMore,
      resultsScrollOffset,
      safeResultsData.length,
      searchInteractionRef,
      shouldHydrateResults,
      shouldLogResultsViewability,
    ]
  );
  const resultsFlashListProps = React.useMemo(
    () => ({
      drawDistance: resultsDrawDistance,
      overrideProps: {
        initialDrawBatchSize: resultsInitialDrawBatchSize,
      },
      ...(shouldLogResultsViewability
        ? {
            viewabilityConfig: resultsViewabilityConfig,
            onViewableItemsChanged: handleResultsViewableItemsChanged,
          }
        : null),
    }),
    [
      handleResultsViewableItemsChanged,
      resultsDrawDistance,
      resultsInitialDrawBatchSize,
      resultsViewabilityConfig,
      shouldLogResultsViewability,
    ]
  );
  const resultsSheetContainerStyle = React.useMemo(
    () => [styles.resultsSheetContainer, resultsSheetVisibilityAnimatedStyle],
    [resultsSheetVisibilityAnimatedStyle]
  );
  const resultsSheetContainerAnimatedStyle = React.useMemo(
    () => [resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle],
    [resultsContainerAnimatedStyle, resultsSheetVisibilityAnimatedStyle]
  );

  const pollCreationParams = overlayParams.pollCreation;
  const shouldShowPollCreationPanel = activeOverlay === 'pollCreation';
  const handleClosePollCreation = React.useCallback(() => {
    setPollCreationSnapRequest(null);
    popOverlay();
  }, [popOverlay]);
  const handlePollCreated = React.useCallback(
    (poll: { pollId: string; coverageKey?: string | null }) => {
      setPollCreationSnapRequest(null);
      setOverlayParams('polls', {
        pollId: poll.pollId,
        coverageKey: poll.coverageKey ?? pollCreationParams?.coverageKey ?? null,
      });
      popOverlay();
    },
    [pollCreationParams?.coverageKey, popOverlay, setOverlayParams]
  );

  const pollCreationPanelSpec = usePollCreationPanelSpec({
    visible: shouldShowPollCreationPanel,
    coverageKey: pollCreationParams?.coverageKey ?? null,
    coverageName: pollCreationParams?.coverageName ?? null,
    searchBarTop,
    snapPoints,
    snapTo: pollCreationSnapRequest,
    onClose: handleClosePollCreation,
    onCreated: handlePollCreated,
    onSnapChange: handlePollCreationSnapChange,
  });

  const searchPanelSpec = useSearchPanelSpec<FoodResult | RestaurantResult>({
    visible: shouldRenderResultsSheet,
    listScrollEnabled:
      !isPriceSelectorVisible && !isFilterTogglePending && !shouldDisableResultsSheetInteraction,
    snapPoints,
    initialSnapPoint: sheetState === 'hidden' ? 'middle' : sheetState,
    snapTo: resultsSheetSnapTo,
    onScrollBeginDrag: handleResultsListScrollBegin,
    onScrollEndDrag: handleResultsListScrollEnd,
    onMomentumBeginJS: handleResultsListMomentumBegin,
    onMomentumEndJS: handleResultsListMomentumEnd,
    onDragStateChange: handleResultsSheetDragStateChange,
    onSettleStateChange: handleResultsSheetSettlingChange,
    interactionEnabled: !shouldDisableResultsSheetInteraction,
    onEndReached: handleResultsEndReached,
    scrollIndicatorInsets: { top: effectiveResultsHeaderHeight, bottom: RESULTS_BOTTOM_PADDING },
    data: resultsListData,
    renderItem: resultsRenderItem,
    keyExtractor: resultsKeyExtractor,
    estimatedItemSize,
    getItemType: getResultItemType,
    listKey: resultsListKey,
    contentContainerStyle: resultsContentContainerStyle,
    ListHeaderComponent: listHeader,
    ListFooterComponent: resultsListFooterComponent,
    ListEmptyComponent: resultsListEmptyComponent,
    ItemSeparatorComponent: ResultItemSeparator,
    headerComponent: resultsHeaderComponent,
    backgroundComponent: resultsListBackground,
    overlayComponent: resultsOverlayComponent,
    listRef: resultsScrollRef,
    resultsContainerAnimatedStyle: resultsSheetContainerAnimatedStyle,
    flashListProps: resultsFlashListProps,
    onHidden: resetSheetToHidden,
    onSnapChange: handleResultsSheetSnapChange,
    style: resultsSheetContainerStyle,
  });

  const pollsPanelSpec = usePollsPanelSpec({
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
    onSnapChange: handlePollsSnapChange,
    snapTo: pollsOverlayMode === 'overlay' ? tabOverlaySnapRequest : pollsDockedSnapRequest,
    onRequestReturnToSearch: requestReturnToSearchFromPolls,
    onRequestPollCreationExpand: requestPollCreationExpand,
    sheetY: sheetTranslateY,
    headerActionAnimationToken: pollsHeaderActionAnimationToken,
    headerActionProgress: overlayHeaderActionProgress,
    interactionRef: searchInteractionRef,
  });

  const bookmarksPanelSpec = useBookmarksPanelSpec({
    visible: showBookmarksOverlay,
    navBarTop: navBarTopForSnaps,
    searchBarTop,
    snapPoints,
    sheetY: sheetTranslateY,
    headerActionProgress: overlayHeaderActionProgress,
    onSnapChange: handleBookmarksSnapChange,
    snapTo: tabOverlaySnapRequest,
  });

  const profilePanelSpec = useProfilePanelSpec({
    visible: showProfileOverlay,
    navBarTop: navBarTopForSnaps,
    searchBarTop,
    snapPoints,
    sheetY: sheetTranslateY,
    headerActionProgress: overlayHeaderActionProgress,
    onSnapChange: handleProfileSnapChange,
    snapTo: tabOverlaySnapRequest,
  });

  const restaurantPanelSpec = useRestaurantPanelSpec({
    data: restaurantProfile,
    onDismiss: handleRestaurantOverlayDismissed,
    onRequestClose: handleRestaurantOverlayRequestClose,
    onToggleFavorite: handleRestaurantSavePress,
    navBarTop: navBarTopForSnaps,
    searchBarTop,
    interactionEnabled: shouldEnableRestaurantOverlayInteraction,
    containerStyle: restaurantOverlayAnimatedStyle,
  });

  const saveListPanelSpec = useSaveListPanelSpec({
    visible: saveSheetState.visible,
    listType: saveSheetState.listType,
    target: saveSheetState.target,
    searchBarTop,
    onClose: handleCloseSaveSheet,
    onSnapChange: setSaveSheetSnap,
  });

  const overlayRegistry = React.useMemo(
    () =>
      createOverlayRegistry({
        search: searchPanelSpec,
        polls: pollsPanelSpec,
        bookmarks: bookmarksPanelSpec,
        profile: profilePanelSpec,
        restaurant: restaurantPanelSpec,
        saveList: saveListPanelSpec,
        price: null,
        scoreInfo: null,
        pollCreation: pollCreationPanelSpec,
      }),
    [
      bookmarksPanelSpec,
      pollCreationPanelSpec,
      pollsPanelSpec,
      profilePanelSpec,
      restaurantPanelSpec,
      saveListPanelSpec,
      searchPanelSpec,
    ]
  );

  const activeOverlayKey = React.useMemo<OverlayKey | null>(() => {
    if (shouldShowPollCreationPanel) {
      return 'pollCreation';
    }
    if (showSaveListOverlay) {
      return 'saveList';
    }
    if (shouldShowRestaurantOverlay && restaurantPanelSpec) {
      return 'restaurant';
    }
    if (showProfileOverlay) {
      return 'profile';
    }
    if (showBookmarksOverlay) {
      return 'bookmarks';
    }
    if (shouldShowPollsSheet) {
      return 'polls';
    }
    if (shouldRenderResultsSheet) {
      return 'search';
    }
    return null;
  }, [
    restaurantPanelSpec,
    shouldRenderResultsSheet,
    shouldShowPollCreationPanel,
    shouldShowPollsSheet,
    shouldShowRestaurantOverlay,
    showBookmarksOverlay,
    showProfileOverlay,
    showSaveListOverlay,
  ]);

  const overlaySheetKey = activeOverlayKey;
  const overlaySheetSpecBase = overlaySheetKey ? overlayRegistry[overlaySheetKey] : null;
  const overlaySheetSpec = overlaySheetSpecBase
    ? {
        ...overlaySheetSpecBase,
        onDragStateChange: handleResultsSheetDragStateChange,
        onSettleStateChange: handleResultsSheetSettlingChange,
      }
    : null;
  const overlaySheetVisible = Boolean(overlaySheetSpec && overlaySheetKey);
  const overlaySheetApplyNavBarCutout = overlaySheetVisible && !shouldHideBottomNav;

  React.useEffect(() => {
    if (overlaySheetKey === 'search') {
      return;
    }
    if (searchHeaderActionModeOverride !== null) {
      setSearchHeaderActionModeOverride(null);
    }
  }, [overlaySheetKey, searchHeaderActionModeOverride]);

  const overlayHeaderActionMode = React.useMemo<OverlayHeaderActionMode>(() => {
    if (overlaySheetKey === 'polls') {
      return 'follow-collapse';
    }
    if (overlaySheetKey === 'search') {
      return searchHeaderActionModeOverride ?? 'fixed-close';
    }
    return 'fixed-close';
  }, [overlaySheetKey, searchHeaderActionModeOverride]);

  return (
    <React.Profiler id="SearchScreen" onRender={handleProfilerRender}>
      <View style={styles.container}>
        {isInitialCameraReady ? (
          <React.Profiler id="SearchMapTree" onRender={handleProfilerRender}>
            <SearchMap
              mapRef={mapRef}
              cameraRef={cameraRef}
              styleURL={mapStyleURL}
              mapCenter={mapCenter}
              mapZoom={mapZoom ?? USA_FALLBACK_ZOOM}
              cameraPadding={mapCameraPadding}
              isFollowingUser={isFollowingUser}
              onPress={stableHandleMapPress}
              onTouchStart={handleMapTouchStart}
              onTouchEnd={handleMapTouchEnd}
              getShouldDeferMarkerMount={getShouldDeferMarkerMount}
              onCameraChanged={stableHandleCameraChanged}
              onMapIdle={stableHandleMapIdle}
              onMapLoaded={stableHandleMapLoaded}
              onMarkerPress={stableHandleMarkerPress}
              selectedRestaurantId={selectedRestaurantId}
              sortedRestaurantMarkers={sortedRestaurantMarkers}
              dotRestaurantFeatures={dotRestaurantFeatures}
              markersRenderKey={markersRenderKey}
              buildMarkerKey={buildMarkerKey}
              shouldAnimateMarkerReveal={shouldAnimateMarkerReveal}
              markerRevealChunk={MARKER_REVEAL_CHUNK}
              markerRevealStaggerMs={MARKER_REVEAL_STAGGER_MS}
              markerRevealAnimMs={MARKER_REVEAL_ANIM_MS}
              restaurantFeatures={restaurantFeatures}
              restaurantLabelStyle={restaurantLabelStyle}
              isMapStyleReady={isMapStyleReady}
              userLocation={userLocation}
              locationPulse={locationPulse}
              disableMarkers={shouldDisableMarkerViews}
              disableBlur={shouldDisableSearchBlur}
              onProfilerRender={handleProfilerRender}
            />
          </React.Profiler>
        ) : (
          <React.Profiler id="SearchMapPlaceholder" onRender={handleProfilerRender}>
            <View pointerEvents="none" style={styles.mapPlaceholder} />
          </React.Profiler>
        )}
        <Reanimated.View
          pointerEvents="none"
          style={[styles.mapLoadingGrid, mapLoadingAnimatedStyle]}
        >
          <Svg width="100%" height="100%" style={styles.mapLoadingGridSvg}>
            <Defs>
              <Pattern
                id="map-grid-minor"
                width={MAP_GRID_MINOR_SIZE}
                height={MAP_GRID_MINOR_SIZE}
                patternUnits="userSpaceOnUse"
              >
                <Path
                  d={`M ${MAP_GRID_MINOR_SIZE} 0 L 0 0 0 ${MAP_GRID_MINOR_SIZE}`}
                  fill="none"
                  stroke={MAP_GRID_MINOR_STROKE}
                  strokeWidth={1}
                />
              </Pattern>
              <Pattern
                id="map-grid-major"
                width={MAP_GRID_MAJOR_SIZE}
                height={MAP_GRID_MAJOR_SIZE}
                patternUnits="userSpaceOnUse"
              >
                <Path
                  d={`M ${MAP_GRID_MAJOR_SIZE} 0 L 0 0 0 ${MAP_GRID_MAJOR_SIZE}`}
                  fill="none"
                  stroke={MAP_GRID_MAJOR_STROKE}
                  strokeWidth={1}
                />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#map-grid-minor)" />
            <Rect width="100%" height="100%" fill="url(#map-grid-major)" />
          </Svg>
        </Reanimated.View>
        <View pointerEvents="none" style={[styles.statusBarFade, { height: statusBarFadeHeight }]}>
          <MaskedView
            style={styles.statusBarFadeLayer}
            maskElement={
              <LinearGradient
                colors={[
                  'rgba(0, 0, 0, 1)',
                  'rgba(0, 0, 0, 1)',
                  'rgba(0, 0, 0, 0.99)',
                  'rgba(0, 0, 0, 0.97)',
                  'rgba(0, 0, 0, 0.9)',
                  'rgba(0, 0, 0, 0.7)',
                  'rgba(0, 0, 0, 0.35)',
                  'rgba(0, 0, 0, 0.12)',
                  'rgba(0, 0, 0, 0.04)',
                  'rgba(0, 0, 0, 0)',
                ]}
                locations={[0, 0.6, 0.63, 0.66, 0.7, 0.8, 0.88, 0.945, 0.965, 0.985]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.statusBarFadeLayer}
              />
            }
          >
            <AppBlurView intensity={12} tint="default" style={styles.statusBarFadeLayer} />
          </MaskedView>
        </View>
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
                <Reanimated.View
                  pointerEvents={isSuggestionOverlayVisible ? 'auto' : 'none'}
                  style={[
                    styles.searchSurface,
                    searchSurfaceAnimatedStyle,
                    {
                      top: 0,
                    },
                  ]}
                >
                  {!shouldDisableSearchBlur && <FrostedGlassBackground />}
                  {shouldShowSuggestionSurface ? (
                    <MaskedHoleOverlay
                      holes={resolvedSuggestionHeaderHoles}
                      backgroundColor="#ffffff"
                      style={[
                        styles.searchSuggestionHeaderSurface,
                        suggestionHeaderHeightAnimatedStyle,
                      ]}
                      pointerEvents="none"
                    />
                  ) : null}
                  <Reanimated.ScrollView
                    style={[
                      styles.searchSurfaceScroll,
                      suggestionPanelAnimatedStyle,
                      shouldDriveSuggestionLayout
                        ? [
                            styles.searchSuggestionScrollSurface,
                            suggestionScrollTopAnimatedStyle,
                            suggestionScrollMaxHeightTarget
                              ? suggestionScrollMaxHeightAnimatedStyle
                              : null,
                          ]
                        : null,
                    ]}
                    contentContainerStyle={[
                      styles.searchSurfaceContent,
                      {
                        paddingTop: shouldDriveSuggestionLayout
                          ? 0
                          : searchLayout.top + searchLayout.height + 8,
                        paddingBottom: shouldDriveSuggestionLayout
                          ? shouldHideBottomNav
                            ? SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM
                            : navBarHeight + 16
                          : bottomInset + 32,
                        paddingHorizontal: shouldDriveSuggestionLayout
                          ? CONTENT_HORIZONTAL_PADDING
                          : 0,
                        backgroundColor: 'transparent',
                      },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onTouchStart={handleSuggestionTouchStart}
                    onContentSizeChange={handleSuggestionContentSizeChange}
                    onScrollBeginDrag={handleSuggestionInteractionStart}
                    onScrollEndDrag={handleSuggestionInteractionEnd}
                    onMomentumScrollEnd={handleSuggestionInteractionEnd}
                    scrollEnabled={Boolean(isSuggestionScreenActive && shouldRenderSuggestionPanel)}
                    showsVerticalScrollIndicator={false}
                  >
                    {shouldRenderSuggestionPanel ? (
                      <View style={styles.searchSuggestionScrollContent}>
                        <View
                          pointerEvents="none"
                          style={[
                            styles.searchSuggestionScrollBackground,
                            {
                              left: -CONTENT_HORIZONTAL_PADDING,
                              right: -CONTENT_HORIZONTAL_PADDING,
                            },
                            { top: -SUGGESTION_SCROLL_WHITE_OVERSCROLL_BUFFER },
                          ]}
                        />
                        <SearchSuggestions
                          visible={shouldRenderSuggestionPanel}
                          showAutocomplete={shouldRenderAutocompleteSection}
                          showRecent={shouldRenderRecentSection}
                          suggestions={suggestionDisplaySuggestions}
                          recentSearches={recentSearchesDisplay}
                          recentlyViewedRestaurants={recentlyViewedRestaurantsDisplay}
                          recentlyViewedFoods={recentlyViewedFoodsDisplay}
                          hasRecentSearches={hasRecentSearchesDisplay}
                          hasRecentlyViewedRestaurants={hasRecentlyViewedRestaurantsDisplay}
                          hasRecentlyViewedFoods={hasRecentlyViewedFoodsDisplay}
                          isRecentLoading={isRecentLoadingDisplay}
                          isRecentlyViewedLoading={isRecentlyViewedLoadingDisplay}
                          isRecentlyViewedFoodsLoading={isRecentlyViewedFoodsLoadingDisplay}
                          onSelectSuggestion={handleSuggestionPress}
                          onSelectRecent={handleRecentSearchPress}
                          onSelectRecentlyViewed={handleRecentlyViewedRestaurantPress}
                          onSelectRecentlyViewedFood={handleRecentlyViewedFoodPress}
                          onPressRecentViewMore={handleRecentViewMorePress}
                          onPressRecentlyViewedMore={handleRecentlyViewedMorePress}
                        />
                      </View>
                    ) : null}
                  </Reanimated.ScrollView>
                </Reanimated.View>
                <View
                  pointerEvents="box-none"
                  style={styles.searchContainer}
                  onLayout={handleSearchContainerLayout}
                >
                  <SearchHeader
                    value={query}
                    placeholder="What are you craving?"
                    loading={shouldShowAutocompleteSpinnerInBar}
                    onChangeText={handleQueryChange}
                    onSubmit={handleSubmit}
                    onFocus={handleSearchFocus}
                    onBlur={handleSearchBlur}
                    onClear={handleClear}
                    onPress={focusSearchInput}
                    onPressIn={handleSearchPressIn}
                    onInputTouchStart={handleSearchPressIn}
                    accentColor={ACTIVE_TAB_COLOR}
                    showBack={Boolean(isSearchOverlay && isSuggestionPanelActive)}
                    onBackPress={handleSearchBack}
                    onLayout={handleSearchHeaderLayout}
                    inputRef={inputRef}
                    inputAnimatedStyle={searchBarInputAnimatedStyle}
                    containerAnimatedStyle={searchBarContainerAnimatedStyle}
                    editable={!isSuggestionScrollDismissing}
                    showInactiveSearchIcon={!isSuggestionPanelActive && !isSearchSessionActive}
                    isSearchSessionActive={isSearchSessionActive && !isSuggestionPanelActive}
                    focusProgress={searchHeaderFocusProgress}
                  />
                </View>
                {shouldRenderSearchShortcuts && (
                  <Reanimated.View
                    style={[styles.searchShortcutsRow, searchShortcutsAnimatedStyle]}
                    pointerEvents={shouldShowSearchShortcuts ? 'box-none' : 'none'}
                    onLayout={({ nativeEvent: { layout } }) => {
                      searchShortcutsLayoutCacheRef.current.frame = layout;
                      setSearchShortcutsFrame((prev) => {
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
                    }}
                  >
                    <AnimatedPressable
                      onPress={handleBestRestaurantsHere}
                      style={[styles.searchShortcutChip, searchShortcutChipAnimatedStyle]}
                      accessibilityRole="button"
                      accessibilityLabel="Show best restaurants here"
                      hitSlop={8}
                      onLayout={({ nativeEvent: { layout } }) => {
                        setSearchShortcutChipFrames((prev) => {
                          const prevLayout = prev.restaurants;
                          if (
                            prevLayout &&
                            Math.abs(prevLayout.x - layout.x) < 0.5 &&
                            Math.abs(prevLayout.y - layout.y) < 0.5 &&
                            Math.abs(prevLayout.width - layout.width) < 0.5 &&
                            Math.abs(prevLayout.height - layout.height) < 0.5
                          ) {
                            return prev;
                          }
                          const next = { ...prev, restaurants: layout };
                          searchShortcutsLayoutCacheRef.current.chipFrames = {
                            ...searchShortcutsLayoutCacheRef.current.chipFrames,
                            restaurants: layout,
                          };
                          return next;
                        });
                      }}
                    >
                      <Reanimated.View
                        style={[styles.searchShortcutContent, searchShortcutContentAnimatedStyle]}
                      >
                        <Store size={18} color="#0f172a" strokeWidth={2} />
                        <Text
                          variant="body"
                          weight="semibold"
                          style={styles.searchShortcutChipText}
                        >
                          Best restaurants
                        </Text>
                      </Reanimated.View>
                    </AnimatedPressable>
                    <AnimatedPressable
                      onPress={handleBestDishesHere}
                      style={[styles.searchShortcutChip, searchShortcutChipAnimatedStyle]}
                      accessibilityRole="button"
                      accessibilityLabel="Show best dishes here"
                      hitSlop={8}
                      onLayout={({ nativeEvent: { layout } }) => {
                        setSearchShortcutChipFrames((prev) => {
                          const prevLayout = prev.dishes;
                          if (
                            prevLayout &&
                            Math.abs(prevLayout.x - layout.x) < 0.5 &&
                            Math.abs(prevLayout.y - layout.y) < 0.5 &&
                            Math.abs(prevLayout.width - layout.width) < 0.5 &&
                            Math.abs(prevLayout.height - layout.height) < 0.5
                          ) {
                            return prev;
                          }
                          const next = { ...prev, dishes: layout };
                          searchShortcutsLayoutCacheRef.current.chipFrames = {
                            ...searchShortcutsLayoutCacheRef.current.chipFrames,
                            dishes: layout,
                          };
                          return next;
                        });
                      }}
                    >
                      <Reanimated.View
                        style={[styles.searchShortcutContent, searchShortcutContentAnimatedStyle]}
                      >
                        <HandPlatter size={18} color="#0f172a" strokeWidth={2} />
                        <Text
                          variant="body"
                          weight="semibold"
                          style={styles.searchShortcutChipText}
                        >
                          Best dishes
                        </Text>
                      </Reanimated.View>
                    </AnimatedPressable>
                  </Reanimated.View>
                )}
                <Reanimated.View
                  pointerEvents={shouldShowSearchThisArea ? 'auto' : 'none'}
                  style={[
                    styles.searchThisAreaContainer,
                    { top: searchThisAreaTop },
                    searchThisAreaAnimatedStyle,
                  ]}
                >
                  <Pressable
                    onPress={handleSearchThisArea}
                    style={styles.searchThisAreaButton}
                    accessibilityRole="button"
                    accessibilityLabel="Search this area"
                    hitSlop={8}
                  >
                    <Text variant="subtitle" weight="semibold" style={styles.searchThisAreaText}>
                      Search this area
                    </Text>
                  </Pressable>
                </Reanimated.View>
              </SafeAreaView>
            </React.Profiler>
            <SearchInteractionProvider value={searchInteractionContextValue}>
              <React.Profiler id="SearchResultsSheetTree" onRender={handleProfilerRender}>
                {overlaySheetSpec && overlaySheetKey ? (
                  <OverlaySheetShell
                    visible={overlaySheetVisible}
                    activeOverlayKey={overlaySheetKey}
                    spec={overlaySheetSpec}
                    sheetY={sheetTranslateY}
                    scrollOffset={resultsScrollOffset}
                    momentumFlag={resultsMomentum}
                    headerActionProgress={overlayHeaderActionProgress}
                    headerActionMode={overlayHeaderActionMode}
                    navBarHeight={navBarHeight}
                    applyNavBarCutout={overlaySheetApplyNavBarCutout}
                  />
                ) : null}
              </React.Profiler>
            </SearchInteractionProvider>
          </>
        )}
        {!shouldHideBottomNav && (
          <React.Profiler id="BottomNav" onRender={handleProfilerRender}>
            <View style={styles.bottomNavWrapper} pointerEvents="box-none">
              <View
                style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_BOTTOM_PADDING }]}
                onLayout={handleBottomNavLayout}
              >
                <View style={styles.bottomNavBackground} pointerEvents="none">
                  {!shouldDisableSearchBlur && (
                    <>
                      <FrostedGlassBackground />
                      <FrostedGlassBackground />
                    </>
                  )}
                </View>
                {navItems.map((item) => {
                  const active = rootOverlay === item.key;
                  const iconColor = active ? ACTIVE_TAB_COLOR : themeColors.textBody;
                  const renderIcon = navIconRenderers[item.key];
                  if (item.key === 'profile') {
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={styles.navButton}
                        onPress={handleProfilePress}
                      >
                        <View style={styles.navIcon}>{renderIcon(iconColor, active)}</View>
                        <Text
                          variant="body"
                          weight={active ? 'semibold' : 'regular'}
                          style={[styles.navLabel, active && styles.navLabelActive]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={styles.navButton}
                      onPress={() => handleOverlaySelect(item.key)}
                    >
                      <View style={styles.navIcon}>{renderIcon(iconColor, active)}</View>
                      <Text
                        variant="body"
                        weight={active ? 'semibold' : 'regular'}
                        style={[styles.navLabel, active && styles.navLabelActive]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </React.Profiler>
        )}
        <React.Profiler id="Overlays" onRender={handleProfilerRender}>
          <>
            <React.Profiler id="PriceSheet" onRender={handleProfilerRender}>
              <MemoOverlayModalSheet
                visible={isPriceSelectorVisible}
                onRequestClose={closePriceSelector}
                paddingHorizontal={OVERLAY_HORIZONTAL_PADDING}
                paddingTop={12}
              >
                <View style={styles.priceSheetHeaderRow}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    variant="body"
                    weight="semibold"
                    style={styles.priceSheetHeadline}
                  >
                    {priceSheetHeadline}
                  </Text>
                  <Pressable
                    onPress={handlePriceDone}
                    accessibilityRole="button"
                    accessibilityLabel="Apply price filters"
                    style={[styles.priceSheetDoneButton, { backgroundColor: ACTIVE_TAB_COLOR }]}
                  >
                    <Text variant="caption" weight="semibold" style={styles.priceSheetDoneText}>
                      Done
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.priceSheetSliderWrapper}>
                  <PriceRangeSlider
                    range={pendingPriceRange}
                    onRangePreview={setPendingPriceRange}
                    onRangeCommit={setPendingPriceRange}
                  />
                </View>
              </MemoOverlayModalSheet>
            </React.Profiler>
            <React.Profiler id="ScoreInfoSheet" onRender={handleProfilerRender}>
              <MemoOverlayModalSheet
                visible={Boolean(isScoreInfoVisible && scoreInfo)}
                onRequestClose={closeScoreInfo}
                onDismiss={() => setScoreInfo(null)}
                paddingHorizontal={CONTENT_HORIZONTAL_PADDING}
                paddingTop={12}
                sheetStyle={{ height: SCORE_INFO_MAX_HEIGHT }}
              >
                {scoreInfo ? (
                  <View style={styles.scoreInfoContent}>
                    <View style={styles.scoreInfoHeaderRow}>
                      <View style={styles.scoreInfoTitleRow}>
                        {scoreInfo.type === 'dish' ? (
                          <HandPlatter
                            size={SECONDARY_METRIC_ICON_SIZE + 2}
                            color={themeColors.textPrimary}
                            strokeWidth={2}
                          />
                        ) : (
                          <Store
                            size={SECONDARY_METRIC_ICON_SIZE + 2}
                            color={themeColors.textPrimary}
                            strokeWidth={2}
                          />
                        )}
                        <Text variant="body" weight="semibold" style={styles.scoreInfoTitle}>
                          {scoreInfo.type === 'dish' ? 'Dish score' : 'Restaurant score'}
                        </Text>
                        <Text variant="body" weight="semibold" style={styles.scoreInfoValue}>
                          {scoreInfo.score != null ? scoreInfo.score.toFixed(1) : '—'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={closeScoreInfo}
                        style={styles.scoreInfoClose}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Close score details"
                      >
                        <LucideX size={18} color={themeColors.textBody} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                    <Text variant="body" style={styles.scoreInfoSubtitle} numberOfLines={1}>
                      {scoreInfo.title}
                    </Text>
                    <View style={styles.scoreInfoMetricsRow}>
                      <View style={styles.scoreInfoMetricItem}>
                        <VoteIcon color={themeColors.textPrimary} size={14} />
                        <Text variant="body" weight="medium" style={styles.scoreInfoMetricText}>
                          {scoreInfo.votes == null ? '—' : formatCompactCount(scoreInfo.votes)}
                        </Text>
                        <Text variant="body" style={styles.scoreInfoMetricLabel}>
                          Votes
                        </Text>
                      </View>
                      <View style={styles.scoreInfoMetricItem}>
                        <PollIcon color={themeColors.textPrimary} size={14} />
                        <Text variant="body" weight="medium" style={styles.scoreInfoMetricText}>
                          {scoreInfo.polls == null ? '—' : formatCompactCount(scoreInfo.polls)}
                        </Text>
                        <Text variant="body" style={styles.scoreInfoMetricLabel}>
                          Polls
                        </Text>
                      </View>
                    </View>
                    <View style={styles.scoreInfoDivider} />
                    <Text variant="body" style={styles.scoreInfoDescription}>
                      {scoreInfo.type === 'dish'
                        ? 'Dish score is a rank-based 0–100 index within this city. It reflects mention and upvote signals (time-decayed) plus restaurant context. 100 is the top dish in this coverage area.'
                        : 'Restaurant score is a rank-based 0–100 index within this city. It reflects the strength of its best dishes, overall menu consistency, and general praise. 100 is the top restaurant in this coverage area.'}
                    </Text>
                  </View>
                ) : null}
              </MemoOverlayModalSheet>
            </React.Profiler>
          </>
        </React.Profiler>
      </View>
    </React.Profiler>
  );
};

export default SearchScreen;
