import React from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Keyboard,
  PixelRatio,
  Pressable,
  TouchableOpacity,
  View,
  Easing as RNEasing,
} from 'react-native';
import type { LayoutChangeEvent, LayoutRectangle, TextInput } from 'react-native';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import Reanimated, {
  Extrapolation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Text } from '../../components';
import AppBlurView from '../../components/app-blur-view';
import { HandPlatter, Heart, Store, X as LucideX } from 'lucide-react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { colors as themeColors } from '../../constants/theme';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from '../../overlays/overlaySheetStyles';
import RestaurantOverlay, { type RestaurantOverlayData } from '../../overlays/RestaurantOverlay';
import SecondaryBottomSheet from '../../overlays/SecondaryBottomSheet';
import { useHeaderCloseCutout } from '../../overlays/useHeaderCloseCutout';
import { calculateSnapPoints, resolveExpandedTop } from '../../overlays/sheetUtils';
import { logger } from '../../utils';
import { searchService, type RecentlyViewedRestaurant } from '../../services/search';
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
import * as Location from 'expo-location';
import BookmarksOverlay from '../../overlays/BookmarksOverlay';
import ProfileOverlay from '../../overlays/ProfileOverlay';
import SaveListOverlay from '../../overlays/SaveListOverlay';
import PollsOverlay from '../../overlays/PollsOverlay';
import { buildMapStyleURL } from '../../constants/map';
import { useOverlayStore, type OverlayKey } from '../../store/overlayStore';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import MaskedHoleOverlay, { type MaskedHole } from '../../components/MaskedHoleOverlay';
import { useSearchRequests } from '../../hooks/useSearchRequests';
import SquircleSpinner from '../../components/SquircleSpinner';
import SearchHeader from './components/SearchHeader';
import SearchSuggestions from './components/SearchSuggestions';
import SearchFilters from './components/SearchFilters';
import DishResultCard from './components/dish-result-card';
import EmptyState from './components/empty-state';
import RestaurantResultCard from './components/restaurant-result-card';
import { PollIcon, VoteIcon } from './components/metric-icons';
import PriceRangeSlider from './components/price-range-slider';
import SearchMap, {
  type MapboxMapRef,
  type RestaurantFeatureProperties,
} from './components/search-map';
import SearchResultsSheet from './components/search-results-sheet';
import useSearchChromeTransition from './hooks/use-search-chrome-transition';
import useSearchHistory from './hooks/use-search-history';
import useSearchSheet from './hooks/use-search-sheet';
import useSearchSubmit from './hooks/use-search-submit';
import styles from './styles';
import {
  ACTIVE_TAB_COLOR,
  AUTOCOMPLETE_CACHE_TTL_MS,
  AUTOCOMPLETE_MIN_CHARS,
  CAMERA_STORAGE_KEY,
  CONTENT_HORIZONTAL_PADDING,
  DEFAULT_PAGE_SIZE,
  LABEL_RADIAL_OFFSET_EM,
  LABEL_TEXT_SIZE,
  LABEL_TRANSLATE_Y,
  LOCATION_STORAGE_KEY,
  MINIMUM_VOTES_FILTER,
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
  SEARCH_SUGGESTION_TOP_FILL_HEIGHT,
  SECONDARY_METRIC_ICON_SIZE,
  SHORTCUT_CHIP_HOLE_PADDING,
  SHORTCUT_CHIP_HOLE_RADIUS,
  SINGLE_LOCATION_ZOOM_LEVEL,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
  type SegmentValue,
} from './constants/search';
import {
  buildLevelsFromRange,
  formatPriceRangeSummary,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceRangeValues,
  type PriceRangeTuple,
} from './utils/price';
import { getQualityColor } from './utils/quality';
import { formatCompactCount } from './utils/format';
import { resolveSingleRestaurantCandidate } from './utils/response';
import {
  boundsFromPairs,
  hasBoundsMovedSignificantly,
  isLngLatTuple,
  mapStateBoundsToMapBounds,
} from './utils/geo';

MapboxGL.setTelemetryEnabled(false);

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';
const PIXEL_SCALE = PixelRatio.get();
const CUTOUT_EDGE_SLOP = 1 / PIXEL_SCALE;
const floorToPixel = (value: number) => Math.floor(value * PIXEL_SCALE) / PIXEL_SCALE;
const ceilToPixel = (value: number) => Math.ceil(value * PIXEL_SCALE) / PIXEL_SCALE;
const SEARCH_BAR_SHADOW_OPACITY = 0.36;
const SEARCH_BAR_SHADOW_RADIUS = 2.5;
const SEARCH_BAR_SHADOW_ELEVATION = 2;
const CAMERA_PERSIST_DELAY_MS = 700;
const MAP_GRID_MINOR_SIZE = 32;
const MAP_GRID_MAJOR_SIZE = 128;
const MAP_GRID_MINOR_STROKE = 'rgba(15, 23, 42, 0.05)';
const MAP_GRID_MAJOR_STROKE = 'rgba(15, 23, 42, 0.08)';
const PROFILE_PIN_TARGET_CENTER_RATIO = 0.25;
const PROFILE_PIN_MIN_VISIBLE_HEIGHT = 160;

type MapCameraPadding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const accessToken = React.useMemo(() => process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '', []);
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const latestBoundsRef = React.useRef<MapBounds | null>(null);
  const [mapCenter, setMapCenter] = React.useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = React.useState<number | null>(null);
  const [mapCameraPadding, setMapCameraPadding] = React.useState<MapCameraPadding | null>(null);
  const [isInitialCameraHydrated, setIsInitialCameraHydrated] = React.useState(false);
  const [isInitialCameraReady, setIsInitialCameraReady] = React.useState(false);
  const [isMapStyleReady, setIsMapStyleReady] = React.useState(false);
  const [isFollowingUser, setIsFollowingUser] = React.useState(false);
  const [focusedRestaurantId, setFocusedRestaurantId] = React.useState<string | null>(null);
  const previousMapBoundsRef = React.useRef<MapBounds | null>(null);
  const shouldRestoreBoundsRef = React.useRef(false);
  const suppressMapMovedRef = React.useRef(false);
  const suppressMapMovedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRestaurantSelectionRef = React.useRef<{
    restaurantId: string;
    preserveBounds: boolean;
  } | null>(null);
  const mapLoadingOpacity = useSharedValue(1);

  React.useEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
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
        const applyInitialCamera = (center: [number, number], zoom: number) => {
          setMapCenter(center);
          setMapZoom(zoom);
          lastCameraStateRef.current = { center, zoom };
          lastPersistedCameraRef.current = JSON.stringify({ center, zoom });
          setIsFollowingUser(false);
          hasCenteredOnLocationRef.current = true;
          hydrated = true;
        };
        if (storedCamera) {
          const parsedCamera = JSON.parse(storedCamera);
          if (
            parsedCamera &&
            Array.isArray(parsedCamera.center) &&
            parsedCamera.center.length === 2 &&
            typeof parsedCamera.center[0] === 'number' &&
            typeof parsedCamera.center[1] === 'number' &&
            typeof parsedCamera.zoom === 'number'
          ) {
            applyInitialCamera([parsedCamera.center[0], parsedCamera.center[1]], parsedCamera.zoom);
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
            userLocationIsCachedRef.current = true;
            setUserLocation({ lat: parsedLocation.lat, lng: parsedLocation.lng });
            applyInitialCamera(
              [parsedLocation.lng, parsedLocation.lat],
              SINGLE_LOCATION_ZOOM_LEVEL
            );
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
  const isMapFrozen = isResultsSheetDragging || isResultsListScrolling;
  const mapPreferredFramesPerSecond = isMapFrozen ? 1 : undefined;
  const resultsBlurIntensity = isMapFrozen ? 18 : undefined;
  const restaurantLabelStyle = React.useMemo<MapboxGL.SymbolLayerStyle>(() => {
    const radialEm = LABEL_RADIAL_OFFSET_EM;
    return {
      textField: ['coalesce', ['get', 'restaurantName'], ''],
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
  const [searchMode, setSearchMode] = React.useState<'natural' | 'shortcut' | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [, setShowSuggestions] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressed] = React.useState(false);
  const lastAutocompleteQueryRef = React.useRef<string>('');
  const lastAutocompleteResultsRef = React.useRef<AutocompleteMatch[]>([]);
  const lastAutocompleteTimestampRef = React.useRef<number>(0);
  const [activeTab, setActiveTab] = React.useState<SegmentValue>('dishes');
  const [searchLayout, setSearchLayout] = React.useState({ top: 0, height: 0 });
  const [bottomNavFrame, setBottomNavFrame] = React.useState({ top: 0, height: 0 });
  const [searchContainerFrame, setSearchContainerFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const [searchBarFrame, setSearchBarFrame] = React.useState<LayoutRectangle | null>(null);
  const [searchShortcutsFrame, setSearchShortcutsFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const [searchShortcutChipFrames, setSearchShortcutChipFrames] = React.useState<
    Record<string, LayoutRectangle>
  >({});
  const resultsHeaderCutout = useHeaderCloseCutout();
  const [isPriceSelectorVisible, setIsPriceSelectorVisible] = React.useState(false);
  const {
    recentSearches,
    isRecentLoading,
    recentlyViewedRestaurants,
    isRecentlyViewedLoading,
    loadRecentHistory,
    updateLocalRecentSearches,
    trackRecentlyViewedRestaurant,
  } = useSearchHistory({ isSignedIn: !!isSignedIn });
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [pollsSheetSnap, setPollsSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [pollsSnapRequest, setPollsSnapRequest] = React.useState<OverlaySheetSnap | null>(null);
  const [isDockedPollsDismissed, setIsDockedPollsDismissed] = React.useState(false);
  const [bookmarksSheetSnap, setBookmarksSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [bookmarksSnapRequest, setBookmarksSnapRequest] = React.useState<OverlaySheetSnap | null>(
    null
  );
  const [profileSheetSnap, setProfileSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [saveSheetSnap, setSaveSheetSnap] = React.useState<OverlaySheetSnap>('hidden');
  const [saveSheetState, setSaveSheetState] = React.useState<{
    visible: boolean;
    listType: FavoriteListType;
    target: { restaurantId?: string; connectionId?: string } | null;
  }>({ visible: false, listType: 'restaurant', target: null });
  const [restaurantProfile, setRestaurantProfile] = React.useState<RestaurantOverlayData | null>(
    null
  );
  const [isRestaurantOverlayVisible, setRestaurantOverlayVisible] = React.useState(false);
  const previousSheetStateRef = React.useRef<'expanded' | 'middle' | 'collapsed' | 'hidden' | null>(
    null
  );
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
  const [isResultsSheetDragging, setIsResultsSheetDragging] = React.useState(false);
  const [isResultsListScrolling, setIsResultsListScrolling] = React.useState(false);
  const [isPollsSheetDragging, setIsPollsSheetDragging] = React.useState(false);
  const [isBookmarksSheetDragging, setIsBookmarksSheetDragging] = React.useState(false);
  const [isProfileSheetDragging, setIsProfileSheetDragging] = React.useState(false);
  const [isSaveSheetDragging, setIsSaveSheetDragging] = React.useState(false);
  const searchThisAreaVisibility = useSharedValue(0);
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);
  const mapMovedSinceSearchRef = React.useRef(false);
  const mapGestureActiveRef = React.useRef(false);
  const mapIdleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollBoundsRef = React.useRef<MapBounds | null>(null);
  const pollBoundsTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnySheetDragging =
    isResultsSheetDragging ||
    isPollsSheetDragging ||
    isBookmarksSheetDragging ||
    isProfileSheetDragging ||
    isSaveSheetDragging;
  const resetMapMoveFlag = React.useCallback(() => {
    if (mapIdleTimeoutRef.current) {
      clearTimeout(mapIdleTimeoutRef.current);
      mapIdleTimeoutRef.current = null;
    }
    mapMovedSinceSearchRef.current = false;
    setMapMovedSinceSearch(false);
  }, []);
  const markMapMoved = React.useCallback(() => {
    mapMovedSinceSearchRef.current = true;
  }, []);
  const scheduleMapIdleReveal = React.useCallback(() => {
    if (mapIdleTimeoutRef.current) {
      clearTimeout(mapIdleTimeoutRef.current);
    }
    mapIdleTimeoutRef.current = setTimeout(() => {
      mapIdleTimeoutRef.current = null;
      if (mapMovedSinceSearchRef.current) {
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
    setFocusedRestaurantId(null);
    previousMapBoundsRef.current = null;
    shouldRestoreBoundsRef.current = false;
    pendingRestaurantSelectionRef.current = null;
  }, []);
  const lastSearchRequestIdRef = React.useRef<string | null>(null);
  const searchSurfaceAnim = useSharedValue(0);
  const suggestionTransition = useSharedValue(0);
  const pollsSheetY = useSharedValue(SCREEN_HEIGHT + 80);
  const bookmarksSheetY = useSharedValue(SCREEN_HEIGHT + 80);
  const profileSheetY = useSharedValue(SCREEN_HEIGHT + 80);
  const saveSheetY = useSharedValue(SCREEN_HEIGHT + 80);
  const inputRef = React.useRef<TextInput | null>(null);
  const resultsScrollRef = React.useRef<FlashListRef<FoodResult | RestaurantResult> | null>(null);
  const locationRequestInFlightRef = React.useRef(false);
  const cameraPersistTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraStateRef = React.useRef<{ center: [number, number]; zoom: number } | null>(null);
  const lastPersistedCameraRef = React.useRef<string | null>(null);
  const previousRestaurantProfileCameraRef = React.useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const userLocationRef = React.useRef<Coordinate | null>(null);
  const userLocationIsCachedRef = React.useRef(false);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const locationPulse = React.useRef(new Animated.Value(0)).current;
  const locationPulseAnimationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const hasCenteredOnLocationRef = React.useRef(false);
  const filterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeOverlay = useOverlayStore((state) => state.activeOverlay);
  const overlayParams = useOverlayStore((state) => state.overlayParams);
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const registerTransientDismissor = useOverlayStore((state) => state.registerTransientDismissor);
  const dismissTransientOverlays = useOverlayStore((state) => state.dismissTransientOverlays);
  const isSearchOverlay = activeOverlay === 'search';
  const showBookmarksOverlay = activeOverlay === 'bookmarks';
  const showPollsOverlay = activeOverlay === 'polls';
  const showProfileOverlay = activeOverlay === 'profile';
  const showSaveListOverlay = saveSheetState.visible;
  const pollOverlayParams = overlayParams.polls;
  const searchBarTop = React.useMemo(() => {
    const rawTop = searchBarFrame
      ? searchLayout.top + searchBarFrame.y
      : searchLayout.top + SEARCH_CONTAINER_PADDING_TOP;
    return Math.max(rawTop, 0);
  }, [searchBarFrame, searchLayout.top]);
  const ensureSearchOverlay = React.useCallback(() => {
    if (activeOverlay !== 'search') {
      setOverlay('search');
    }
  }, [activeOverlay, setOverlay]);
  const {
    panelVisible,
    sheetState,
    snapPoints,
    shouldRenderSheet,
    sheetTranslateY,
    resetSheetToHidden,
    animateSheetTo,
    showPanel,
    handleSheetSnapChange,
    resultsContainerAnimatedStyle,
    resultsScrollOffset,
    resultsMomentum,
    onResultsScrollBeginDrag: handleResultsScrollBeginDrag,
    onResultsScrollEndDrag: handleResultsScrollEndDrag,
    headerDividerAnimatedStyle,
  } = useSearchSheet({
    isSearchOverlay,
    isSearchFocused,
    searchBarTop,
  });
  const pollsChromeSnaps = React.useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.45);
    return { expanded, middle };
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
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.5);
    return { expanded, middle };
  }, [insets.top, searchBarTop]);
  const saveChromeSnaps = React.useMemo(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.5);
    return { expanded, middle };
  }, [insets.top, searchBarTop]);
  const shouldUsePollsChrome =
    showPollsOverlay ||
    (isSearchOverlay &&
      !isSearchFocused &&
      !isSearchSessionActive &&
      !isLoading &&
      !shouldRenderSheet);
  const chromeTransitionConfig = React.useMemo(() => {
    if (showSaveListOverlay) {
      return {
        sheetY: saveSheetY,
        expanded: saveChromeSnaps.expanded,
        middle: saveChromeSnaps.middle,
      };
    }
    if (showProfileOverlay) {
      return {
        sheetY: profileSheetY,
        expanded: profileChromeSnaps.expanded,
        middle: profileChromeSnaps.middle,
      };
    }
    if (showBookmarksOverlay) {
      return {
        sheetY: bookmarksSheetY,
        expanded: bookmarksChromeSnaps.expanded,
        middle: bookmarksChromeSnaps.middle,
      };
    }
    if (shouldUsePollsChrome) {
      return {
        sheetY: pollsSheetY,
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
    bookmarksSheetY,
    profileChromeSnaps.expanded,
    profileChromeSnaps.middle,
    profileSheetY,
    saveChromeSnaps.expanded,
    saveChromeSnaps.middle,
    saveSheetY,
    pollsChromeSnaps.expanded,
    pollsChromeSnaps.middle,
    pollsSheetY,
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
    containerAnimatedStyle: searchBarSheetAnimatedStyle,
    chromeAnimatedStyle: searchChromeAnimatedStyle,
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
  const [resultsSheetHeaderHeight, setResultsSheetHeaderHeight] = React.useState(0);
  const [filtersHeaderHeight, setFiltersHeaderHeight] = React.useState(0);
  const focusPadding = React.useMemo(() => {
    const topPadding = Math.max(searchLayout.top + searchLayout.height + 16, insets.top + 16);
    const visibleSheetHeight = Math.max(0, SCREEN_HEIGHT - snapPoints.middle);
    const bottomPadding = Math.max(visibleSheetHeight + 24, insets.bottom + 140);
    return [topPadding, 64, bottomPadding, 64] as const;
  }, [insets.bottom, insets.top, searchLayout.height, searchLayout.top, snapPoints.middle]);
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
  const handleResultsSheetDragStateChange = React.useCallback((isDragging: boolean) => {
    setIsResultsSheetDragging(isDragging);
  }, []);
  const handlePollsSheetDragStateChange = React.useCallback((isDragging: boolean) => {
    setIsPollsSheetDragging(isDragging);
  }, []);
  const handleBookmarksSheetDragStateChange = React.useCallback((isDragging: boolean) => {
    setIsBookmarksSheetDragging(isDragging);
  }, []);
  const handleProfileSheetDragStateChange = React.useCallback((isDragging: boolean) => {
    setIsProfileSheetDragging(isDragging);
  }, []);
  const handleSaveSheetDragStateChange = React.useCallback((isDragging: boolean) => {
    setIsSaveSheetDragging(isDragging);
  }, []);
  const handleResultsListScrollBegin = React.useCallback(() => {
    handleResultsScrollBeginDrag();
    setIsResultsListScrolling(true);
  }, [handleResultsScrollBeginDrag]);
  const handleResultsListScrollEnd = React.useCallback(() => {
    handleResultsScrollEndDrag();
    if (!resultsMomentum.value) {
      setIsResultsListScrolling(false);
    }
  }, [handleResultsScrollEndDrag, resultsMomentum]);
  const handleResultsListMomentumBegin = React.useCallback(() => {
    setIsResultsListScrolling(true);
  }, []);
  const handleResultsListMomentumEnd = React.useCallback(() => {
    setIsResultsListScrolling(false);
  }, []);

  const handleOverlaySelect = React.useCallback(
    (target: OverlayKey) => {
      dismissTransientOverlays();
      if (target === 'search') {
        setOverlay('search');
        setIsSearchFocused(false);
        setIsAutocompleteSuppressed(true);
        setShowSuggestions(false);
        inputRef.current?.blur();
        // When switching to search, keep polls at collapsed (don't dismiss)
        if (!isSearchSessionActive && !isLoading) {
          setIsDockedPollsDismissed(false);
          // If polls is hidden, bring it back to collapsed
          if (pollsSheetSnap === 'hidden') {
            setPollsSnapRequest('collapsed');
          } else if (pollsSheetSnap !== 'collapsed') {
            // If polls is expanded/middle, collapse it
            setPollsSnapRequest('collapsed');
          }
        }
        return;
      }

      if (target === 'polls') {
        // Always expand polls fully when polls nav is clicked
        setPollsSnapRequest('expanded');
      }

      if (target === 'bookmarks') {
        // Request bookmarks to expand fully when opened
        setBookmarksSnapRequest('expanded');
      }

      setOverlay(target);
      inputRef.current?.blur();
    },
    [
      dismissTransientOverlays,
      isLoading,
      isSearchSessionActive,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsDockedPollsDismissed,
      setOverlay,
      setPollsSnapRequest,
      setShowSuggestions,
    ]
  );
  const handlePollsSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setPollsSheetSnap(snap);
      if (pollsSnapRequest && pollsSnapRequest === snap) {
        setPollsSnapRequest(null);
      }
      if (snap === 'hidden') {
        setIsDockedPollsDismissed(true);
        // Immediately switch to search when polls overlay is dismissed
        if (activeOverlay === 'polls') {
          setOverlay('search');
        }
      }
    },
    [
      activeOverlay,
      pollsSnapRequest,
      setIsDockedPollsDismissed,
      setOverlay,
      setPollsSheetSnap,
      setPollsSnapRequest,
    ]
  );
  const handleBookmarksSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setBookmarksSheetSnap(snap);
      // Clear snap request when fulfilled
      if (bookmarksSnapRequest && bookmarksSnapRequest === snap) {
        setBookmarksSnapRequest(null);
      }
      if (snap === 'hidden') {
        // Immediately switch to search when bookmarks overlay is dismissed
        if (activeOverlay === 'bookmarks') {
          setOverlay('search');
        }
      }
    },
    [activeOverlay, bookmarksSnapRequest, setOverlay]
  );
  const handleProfileSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setProfileSheetSnap(snap);
      if (snap === 'hidden') {
        // Immediately switch to search when profile overlay is dismissed
        if (activeOverlay === 'profile') {
          setOverlay('search');
        }
      }
    },
    [activeOverlay, setOverlay]
  );
  const { runAutocomplete, runSearch, cancelAutocomplete, cancelSearch, isAutocompleteLoading } =
    useSearchRequests();
  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);
  const navItems = React.useMemo(
    () =>
      [
        { key: 'search' as OverlayKey, label: 'Search' },
        { key: 'polls' as OverlayKey, label: 'Polls' },
        { key: 'bookmarks' as OverlayKey, label: 'Favorites' },
        { key: 'profile' as OverlayKey, label: 'Profile' },
      ] as const,
    []
  );
  const navIconRenderers = React.useMemo<
    Record<OverlayKey, (color: string, active: boolean) => React.ReactNode>
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
        <PollIcon color={color} size={24} strokeWidth={active ? 2.5 : 2} />
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
  const handleBottomNavLayout = React.useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const { y, height } = nativeEvent.layout;
    setBottomNavFrame((prev) => {
      if (Math.abs(prev.top - y) < 0.5 && Math.abs(prev.height - height) < 0.5) {
        return prev;
      }
      return { top: y, height };
    });
  }, []);
  const handleSearchHeaderLayout = React.useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
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
    [setSearchBarFrame]
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
  const trimmedQuery = query.trim();
  const hasTypedQuery = trimmedQuery.length > 0;
  const shouldShowRecentSection = isSearchOverlay && isSearchFocused && !hasTypedQuery;
  const shouldRenderRecentSection =
    shouldShowRecentSection && (hasRecentSearches || hasRecentlyViewedRestaurants);
  const shouldRenderAutocompleteSection =
    isSearchOverlay &&
    isSearchFocused &&
    !isAutocompleteSuppressed &&
    trimmedQuery.length >= AUTOCOMPLETE_MIN_CHARS;
  const shouldRenderSuggestionPanel = shouldRenderAutocompleteSection || shouldRenderRecentSection;
  const isSuggestionScreenActive = isSearchOverlay && isSearchFocused;
  React.useEffect(() => {
    const target = isSuggestionScreenActive ? 1 : 0;
    suggestionTransition.value = withTiming(target, {
      duration: isSuggestionScreenActive ? 140 : 100,
      easing: isSuggestionScreenActive ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [isSuggestionScreenActive, suggestionTransition]);
  const suggestionHeaderContentBottom = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return 0;
    }

    if (searchShortcutsFrame) {
      return (
        searchShortcutsFrame.y +
        searchShortcutsFrame.height +
        SHORTCUT_CHIP_HOLE_PADDING +
        CUTOUT_EDGE_SLOP
      );
    }
    if (searchContainerFrame) {
      return (
        searchContainerFrame.y +
        searchContainerFrame.height +
        SEARCH_BAR_HOLE_PADDING +
        CUTOUT_EDGE_SLOP
      );
    }
    return 0;
  }, [isSuggestionScreenActive, searchContainerFrame, searchShortcutsFrame]);
  const suggestionHeaderHeight = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return 0;
    }
    const contentBottom = suggestionHeaderContentBottom;
    if (contentBottom <= 0) {
      return 0;
    }
    const paddedBottom = contentBottom + SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM;
    return Math.max(0, ceilToPixel(paddedBottom));
  }, [isSuggestionScreenActive, suggestionHeaderContentBottom]);
  const headerPaddingOverlap = SEARCH_SUGGESTION_HEADER_PADDING_OVERLAP;
  const suggestionScrollTop = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return 0;
    }

    const fallback = searchLayout.top + searchLayout.height + 8;
    const overlap = suggestionHeaderHeight > 0 ? headerPaddingOverlap : 0;
    const headerBottom =
      suggestionHeaderHeight > 0
        ? suggestionHeaderHeight - overlap + SEARCH_SUGGESTION_HEADER_PANEL_GAP
        : fallback;
    return Math.max(0, headerBottom);
  }, [
    isSuggestionScreenActive,
    searchLayout.height,
    searchLayout.top,
    headerPaddingOverlap,
    suggestionHeaderHeight,
    SEARCH_SUGGESTION_HEADER_PANEL_GAP,
  ]);
  const suggestionTopFillHeight = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return 0;
    }
    const maxHeight = suggestionScrollMaxHeight ?? 0;
    if (maxHeight <= 0) {
      return SEARCH_SUGGESTION_TOP_FILL_HEIGHT;
    }
    const maxFill = Math.max(0, maxHeight - 48);
    if (maxFill <= 0) {
      return Math.min(SEARCH_SUGGESTION_TOP_FILL_HEIGHT, maxHeight);
    }
    return Math.min(SEARCH_SUGGESTION_TOP_FILL_HEIGHT, maxFill);
  }, [isSuggestionScreenActive, suggestionScrollMaxHeight]);
  const suggestionHeaderHoles = React.useMemo<MaskedHole[]>(() => {
    if (!isSuggestionScreenActive) {
      return [];
    }

    const holes: MaskedHole[] = [];

    if (searchContainerFrame) {
      const x = searchContainerFrame.x + SEARCH_HORIZONTAL_PADDING - SEARCH_BAR_HOLE_PADDING;
      const y = searchContainerFrame.y + SEARCH_CONTAINER_PADDING_TOP - SEARCH_BAR_HOLE_PADDING;
      const width =
        searchContainerFrame.width - SEARCH_HORIZONTAL_PADDING * 2 + SEARCH_BAR_HOLE_PADDING * 2;
      const height = searchContainerFrame.height - SEARCH_CONTAINER_PADDING_TOP;

      if (width > 0 && height > 0) {
        const paddedX = Math.max(0, floorToPixel(x - CUTOUT_EDGE_SLOP));
        const paddedY = Math.max(0, floorToPixel(y - CUTOUT_EDGE_SLOP));
        const paddedWidth = ceilToPixel(width + CUTOUT_EDGE_SLOP * 2);
        const paddedHeight = ceilToPixel(
          height + SEARCH_BAR_HOLE_PADDING * 2 + CUTOUT_EDGE_SLOP * 2
        );
        holes.push({
          x: paddedX,
          y: paddedY,
          width: paddedWidth,
          height: paddedHeight,
          borderRadius: SEARCH_BAR_HOLE_RADIUS + SEARCH_BAR_HOLE_PADDING,
        });
      }
    }

    if (searchShortcutsFrame) {
      Object.values(searchShortcutChipFrames).forEach((chip) => {
        const x = searchShortcutsFrame.x + chip.x - SHORTCUT_CHIP_HOLE_PADDING;
        const y = searchShortcutsFrame.y + chip.y - SHORTCUT_CHIP_HOLE_PADDING;
        const width = chip.width + SHORTCUT_CHIP_HOLE_PADDING * 2;
        const height = chip.height + SHORTCUT_CHIP_HOLE_PADDING * 2;
        if (width <= 0 || height <= 0) {
          return;
        }
        const paddedX = Math.max(0, floorToPixel(x - CUTOUT_EDGE_SLOP));
        const paddedY = Math.max(0, floorToPixel(y - CUTOUT_EDGE_SLOP));
        const paddedWidth = ceilToPixel(width + CUTOUT_EDGE_SLOP * 2);
        const paddedHeight = ceilToPixel(height + CUTOUT_EDGE_SLOP * 2);
        holes.push({
          x: paddedX,
          y: paddedY,
          width: paddedWidth,
          height: paddedHeight,
          borderRadius: SHORTCUT_CHIP_HOLE_RADIUS + SHORTCUT_CHIP_HOLE_PADDING,
        });
      });
    }

    return holes;
  }, [
    isSuggestionScreenActive,
    searchContainerFrame,
    searchShortcutChipFrames,
    searchShortcutsFrame,
  ]);
  const searchSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchSurfaceAnim.value,
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    elevation: 0,
  }));
  const searchBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 }],
  }));
  const searchBarTransparencyAnimatedStyle = useAnimatedStyle(() => {
    const progress = suggestionTransition.value;
    const backgroundAlpha = 1 - progress;
    const shadowOpacity = SEARCH_BAR_SHADOW_OPACITY * backgroundAlpha;
    return {
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      shadowOpacity,
      shadowRadius: SEARCH_BAR_SHADOW_RADIUS * backgroundAlpha,
      borderWidth: 0,
      elevation: backgroundAlpha > 0 ? SEARCH_BAR_SHADOW_ELEVATION : 0,
    };
  });
  const suggestionMaskAnimatedStyle = useAnimatedStyle(() => ({
    opacity: suggestionTransition.value,
  }));
  const priceButtonIsActive = priceFiltersActive || isPriceSelectorVisible;
  const votesFilterActive = votes100Plus;
  const canLoadMore =
    Boolean(results) && !isPaginationExhausted && (hasMoreFood || hasMoreRestaurants);
  const shouldShowSearchThisArea =
    isSearchOverlay &&
    !isSearchFocused &&
    sheetState === 'collapsed' &&
    mapMovedSinceSearch &&
    !isLoading &&
    !isLoadingMore &&
    Boolean(results);

  React.useEffect(() => {
    if (!isSearchSessionActive) {
      return;
    }
    setSearchShortcutsFrame(null);
    setSearchShortcutChipFrames({});
  }, [isSearchSessionActive]);

  React.useEffect(() => {
    const target = shouldShowSearchThisArea ? 1 : 0;
    searchThisAreaVisibility.value = withTiming(target, { duration: 200 });
  }, [searchThisAreaVisibility, shouldShowSearchThisArea]);
  const searchThisAreaAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchThisAreaVisibility.value,
    transform: [
      {
        translateY: interpolate(
          searchThisAreaVisibility.value,
          [0, 1],
          [-8, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
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
  const bottomInset = Math.max(insets.bottom, 12);
  const suggestionScrollMaxHeight = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return undefined;
    }
    const available =
      SCREEN_HEIGHT - suggestionScrollTop - bottomInset - SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM;
    return available > 0 ? available : undefined;
  }, [bottomInset, isSuggestionScreenActive, suggestionScrollTop]);
  // Hide the bottom nav only while search is in use (focused/suggestions) or mid-session.
  const shouldHideBottomNav =
    isSearchOverlay && (isSearchSessionActive || isSearchFocused || isLoading);
  const showDockedPolls =
    isSearchOverlay &&
    !isSearchFocused &&
    !isSearchSessionActive &&
    !isLoading &&
    !isDockedPollsDismissed;
  const shouldShowPollsSheet = showPollsOverlay || showDockedPolls;
  const pollsOverlayMode = showPollsOverlay ? 'overlay' : 'docked';
  const pollsOverlaySnapPoint = showPollsOverlay ? 'expanded' : 'collapsed';
  const isPollsExpanded = pollsSheetSnap === 'expanded';
  const isBookmarksExpanded = bookmarksSheetSnap === 'expanded';
  const isProfileExpanded = profileSheetSnap === 'expanded';
  const isAnySheetExpanded =
    sheetState === 'expanded' ||
    isPollsExpanded ||
    isBookmarksExpanded ||
    isProfileExpanded ||
    saveSheetSnap === 'expanded';
  const shouldRenderSearchOverlay =
    isSearchOverlay ||
    shouldShowPollsSheet ||
    showBookmarksOverlay ||
    showProfileOverlay ||
    showSaveListOverlay;
  const shouldShowSearchChrome = shouldRenderSearchOverlay && !isAnySheetExpanded;

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
  const focusSearchInput = React.useCallback(() => {
    ensureSearchOverlay();
    dismissTransientOverlays();
    setIsAutocompleteSuppressed(false);
    setIsSearchFocused(true);
    const trimmed = query.trim();
    if (trimmed.length >= AUTOCOMPLETE_MIN_CHARS) {
      const usedCache = showCachedSuggestionsIfFresh(trimmed);
      if (!usedCache) {
        cancelAutocomplete();
      }
    }
    inputRef.current?.focus();
  }, [
    cancelAutocomplete,
    dismissTransientOverlays,
    ensureSearchOverlay,
    query,
    showCachedSuggestionsIfFresh,
  ]);
  React.useEffect(() => {
    searchSurfaceAnim.value = withTiming(isSearchFocused ? 1 : 0, {
      duration: isSearchFocused ? 200 : 160,
      easing: isSearchFocused ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [isSearchFocused, searchSurfaceAnim]);
  React.useEffect(
    () => () => {
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current);
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
  const restaurants = results?.restaurants ?? [];
  const dishes = results?.food ?? [];
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
      if (!map.has(dish.restaurantId)) {
        logger.error('Dish references restaurant without coordinates', {
          dishId: dish.connectionId,
          restaurantId: dish.restaurantId,
          restaurantName: dish.restaurantName,
        });
      }
    });

    return map;
  }, [restaurants, dishes]);

  React.useEffect(() => {
    if (!isSearchOverlay || !isSearchFocused || isAutocompleteSuppressed) {
      setSuggestions([]);
      setShowSuggestions(false);
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
    isSearchOverlay,
    isSearchFocused,
    isAutocompleteSuppressed,
    query,
    showCachedSuggestionsIfFresh,
    cancelAutocomplete,
    runAutocomplete,
  ]);

  const getLocationCount = React.useCallback((restaurant: RestaurantResult): number => {
    if (typeof restaurant.locationCount === 'number' && Number.isFinite(restaurant.locationCount)) {
      return restaurant.locationCount;
    }
    if (Array.isArray(restaurant.locations)) {
      return restaurant.locations.length;
    }
    return 0;
  }, []);

  const resolveRestaurantMapLocations = React.useCallback(
    (restaurant: RestaurantResult, includeAllLocations: boolean) => {
      const fallbackLocation =
        typeof restaurant.latitude === 'number' && typeof restaurant.longitude === 'number'
          ? {
              locationId: restaurant.restaurantLocationId ?? restaurant.restaurantId,
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
            }
          : null;
      const displayLocation = restaurant.displayLocation ?? null;
      const fullLocations =
        Array.isArray(restaurant.locations) && restaurant.locations.length > 0
          ? restaurant.locations
          : displayLocation
          ? [displayLocation]
          : fallbackLocation
          ? [fallbackLocation]
          : [];
      const singleLocation = displayLocation
        ? [displayLocation]
        : fallbackLocation
        ? [fallbackLocation]
        : [];
      const source = includeAllLocations ? fullLocations : singleLocation;
      const seen = new Set<string>();
      return source.flatMap((location, locationIndex) => {
        if (
          typeof location?.latitude !== 'number' ||
          !Number.isFinite(location.latitude) ||
          typeof location?.longitude !== 'number' ||
          !Number.isFinite(location.longitude)
        ) {
          return [];
        }
        const locationId =
          (location as { locationId?: string }).locationId ??
          `${restaurant.restaurantId}-loc-${locationIndex}`;
        if (seen.has(locationId)) {
          return [];
        }
        seen.add(locationId);
        return [
          {
            locationId,
            latitude: location.latitude,
            longitude: location.longitude,
          },
        ];
      });
    },
    []
  );

  const restaurantFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const features: Feature<Point, RestaurantFeatureProperties>[] = [];
    const focusedRestaurant = focusedRestaurantId
      ? restaurants.find((restaurant) => restaurant.restaurantId === focusedRestaurantId)
      : null;

    const addFeatures = (
      restaurant: RestaurantResult,
      restaurantIndex: number,
      includeAllLocations: boolean
    ) => {
      const rank = restaurantIndex + 1;
      const pinColor = getQualityColor(
        restaurantIndex,
        restaurants.length,
        restaurant.displayPercentile ?? null
      );
      const locationCandidates = resolveRestaurantMapLocations(restaurant, includeAllLocations);

      locationCandidates.forEach((location) => {
        const featureId = `${restaurant.restaurantId}-${location.locationId}`;
        features.push({
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
        });
      });
    };

    if (focusedRestaurant) {
      const index = Math.max(
        0,
        restaurants.findIndex(
          (restaurant) => restaurant.restaurantId === focusedRestaurant.restaurantId
        )
      );
      addFeatures(focusedRestaurant, index, true);
    } else {
      restaurants.forEach((restaurant, restaurantIndex) => {
        addFeatures(restaurant, restaurantIndex, false);
      });
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [focusedRestaurantId, resolveRestaurantMapLocations, restaurants]);

  const buildMarkerKey = React.useCallback(
    (feature: Feature<Point, RestaurantFeatureProperties>) =>
      feature.id?.toString() ?? `${feature.properties.restaurantId}-${feature.properties.rank}`,
    []
  );
  const sortedRestaurantMarkers = React.useMemo(() => {
    const getRank = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
    return restaurantFeatures.features.slice().sort((a, b) => {
      const rankDiff = getRank(b.properties.rank) - getRank(a.properties.rank);
      if (rankDiff !== 0) {
        return rankDiff; // render higher rank numbers first so rank 1 renders last (on top)
      }
      const aId = a.id?.toString() ?? '';
      const bId = b.id?.toString() ?? '';
      return aId.localeCompare(bId); // deterministic tie-breaker for equal ranks
    });
  }, [restaurantFeatures.features]);
  const markersRenderKey = React.useMemo(
    () =>
      restaurantFeatures.features
        .map(
          (feature) => `${feature.id ?? feature.properties.restaurantId}-${feature.properties.rank}`
        )
        .join('|'),
    [restaurantFeatures.features]
  );

  React.useEffect(() => {
    if (!focusedRestaurantId) {
      return;
    }
    const hasMatch = restaurants.some(
      (restaurant) => restaurant.restaurantId === focusedRestaurantId
    );
    if (!hasMatch) {
      setFocusedRestaurantId(null);
      shouldRestoreBoundsRef.current = false;
      previousMapBoundsRef.current = null;
    }
  }, [focusedRestaurantId, restaurants]);

  // No sticky anchors; keep labels relative to pin geometry only.

  // Intentionally avoid auto-fitting the map when results change; keep user camera position.

  React.useEffect(() => {
    if (!isSearchOverlay && isRestaurantOverlayVisible) {
      setRestaurantOverlayVisible(false);
    }
  }, [isSearchOverlay, isRestaurantOverlayVisible]);

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
    listRef.clearLayoutCacheOnUpdate?.();
    resultsScrollOffset.value = 0;
    requestAnimationFrame(() => {
      listRef.scrollToOffset({ offset: 0, animated: false });
    });
  }, [resultsScrollOffset]);

  const { submitSearch, runBestHere, loadMoreResults, cancelActiveSearchRequest } = useSearchSubmit(
    {
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
      showPanel,
      resetSheetToHidden,
      scrollResultsToTop,
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
      updateLocalRecentSearches,
    }
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

  const toggleVotesFilter = React.useCallback(() => {
    const nextValue = !votes100Plus;
    setVotes100Plus(nextValue);
    const shouldRunShortcut = searchMode === 'shortcut';
    const shouldRunNatural = !shouldRunShortcut && Boolean(query.trim());
    if (!shouldRunShortcut && !shouldRunNatural) {
      return;
    }
    if (filterDebounceRef.current) {
      clearTimeout(filterDebounceRef.current);
    }
    filterDebounceRef.current = setTimeout(() => {
      filterDebounceRef.current = null;
      const minimumVotes = nextValue ? MINIMUM_VOTES_FILTER : null;
      if (shouldRunShortcut) {
        const fallbackLabel = activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
        const label = submittedQuery || fallbackLabel;
        void runBestHere(activeTab, label, {
          preserveSheetState: true,
          filters: { minimumVotes },
        });
        return;
      }
      void submitSearch({ minimumVotes, preserveSheetState: true });
    }, 150);
  }, [
    activeTab,
    query,
    runBestHere,
    searchMode,
    setVotes100Plus,
    submitSearch,
    submittedQuery,
    votes100Plus,
  ]);

  const dismissSearchKeyboard = React.useCallback(() => {
    Keyboard.dismiss();
    inputRef.current?.blur?.();
  }, [inputRef]);

  const handleSubmit = React.useCallback(() => {
    ensureSearchOverlay();
    setIsSearchFocused(false);
    setIsAutocompleteSuppressed(true);
    dismissSearchKeyboard();
    resetFocusedMapState();
    void submitSearch();
  }, [
    dismissSearchKeyboard,
    ensureSearchOverlay,
    resetFocusedMapState,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    submitSearch,
  ]);

  const handleBestDishesHere = React.useCallback(() => {
    ensureSearchOverlay();
    setQuery('Best dishes');
    resetFocusedMapState();
    void runBestHere('dishes', 'Best dishes');
  }, [ensureSearchOverlay, resetFocusedMapState, runBestHere, setQuery]);

  const handleBestRestaurantsHere = React.useCallback(() => {
    ensureSearchOverlay();
    setQuery('Best restaurants');
    resetFocusedMapState();
    void runBestHere('restaurants', 'Best restaurants');
  }, [ensureSearchOverlay, resetFocusedMapState, runBestHere, setQuery]);

  const handleSearchThisArea = React.useCallback(() => {
    if (isLoading || isLoadingMore || !results) {
      return;
    }
    resetFocusedMapState();

    if (searchMode === 'shortcut') {
      const fallbackLabel = activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
      const label = submittedQuery || fallbackLabel;
      void runBestHere(activeTab, label, { preserveSheetState: true });
      return;
    }

    void submitSearch({ preserveSheetState: true });
  }, [
    activeTab,
    isLoading,
    isLoadingMore,
    results,
    resetFocusedMapState,
    runBestHere,
    searchMode,
    submitSearch,
    submittedQuery,
  ]);

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
      dismissSearchKeyboard();
      const typedPrefix = query;
      const nextQuery = match.name;
      setQuery(nextQuery);
      setShowSuggestions(false);
      setSuggestions([]);
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
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
          preserveBounds: false,
        };
      } else {
        pendingRestaurantSelectionRef.current = null;
      }
      void submitSearch(
        { submission: { source: 'autocomplete', context: submissionContext } },
        nextQuery
      );
    },
    [dismissSearchKeyboard, query, submitSearch, setIsAutocompleteSuppressed, setIsSearchFocused]
  );

  const clearSearchState = React.useCallback(
    ({ shouldRefocusInput = false }: { shouldRefocusInput?: boolean } = {}) => {
      cancelActiveSearchRequest();
      cancelAutocomplete();
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current);
        filterDebounceRef.current = null;
      }
      resetFilters();
      setIsSearchFocused(false);
      setIsAutocompleteSuppressed(true);
      setShowSuggestions(false);
      setQuery('');
      setResults(null);
      resetMapMoveFlag();
      setSubmittedQuery('');
      setError(null);
      setSuggestions([]);
      hidePanel();
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
      Keyboard.dismiss();
      inputRef.current?.blur();
      scrollResultsToTop();
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
      resetFilters,
      resetFocusedMapState,
      resetMapMoveFlag,
      setIsDockedPollsDismissed,
      setIsSearchSessionActive,
      setSearchMode,
      scrollResultsToTop,
    ]
  );

  const clearTypedQuery = React.useCallback(() => {
    cancelAutocomplete();
    setIsAutocompleteSuppressed(false);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  }, [cancelAutocomplete, setIsAutocompleteSuppressed]);

  const handleClear = React.useCallback(() => {
    if (!isSearchSessionActive) {
      clearTypedQuery();
      return;
    }
    clearSearchState({
      shouldRefocusInput: !isSearchSessionActive && !isLoading && !isLoadingMore,
    });
  }, [clearSearchState, clearTypedQuery, isLoading, isLoadingMore, isSearchSessionActive]);

  const handleCloseResults = React.useCallback(() => {
    clearSearchState();
  }, [clearSearchState]);

  const handleSearchFocus = React.useCallback(() => {
    ensureSearchOverlay();
    dismissTransientOverlays();
    setIsSearchFocused(true);
    setIsAutocompleteSuppressed(false);
  }, [dismissTransientOverlays, ensureSearchOverlay]);

  const handleSearchBlur = React.useCallback(() => {
    setIsSearchFocused(false);
    setShowSuggestions(false);
  }, []);

  const handleRecentSearchPress = React.useCallback(
    (value: string) => {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return;
      }
      dismissSearchKeyboard();
      setQuery(trimmedValue);
      setShowSuggestions(false);
      setSuggestions([]);
      updateLocalRecentSearches(trimmedValue);
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      resetFocusedMapState();
      void submitSearch({ submission: { source: 'recent' } }, trimmedValue);
    },
    [
      dismissSearchKeyboard,
      resetFocusedMapState,
      submitSearch,
      updateLocalRecentSearches,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
    ]
  );

  const handleRecentlyViewedRestaurantPress = React.useCallback(
    (item: RecentlyViewedRestaurant) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }
      dismissSearchKeyboard();
      setQuery(trimmedValue);
      setShowSuggestions(false);
      setSuggestions([]);
      updateLocalRecentSearches(trimmedValue);
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      resetFocusedMapState();
      void submitSearch({ submission: { source: 'recent' } }, trimmedValue);
    },
    [
      dismissSearchKeyboard,
      resetFocusedMapState,
      submitSearch,
      updateLocalRecentSearches,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
    ]
  );

  const handleMapPress = React.useCallback(() => {
    // Fully exit autocomplete: blur input, suppress suggestions, and clear loading state.
    Keyboard.dismiss();
    inputRef.current?.blur?.();
    setIsAutocompleteSuppressed(true);
    setIsSearchFocused(false);
    setShowSuggestions(false);
    setSuggestions([]);
    cancelAutocomplete();
  }, [cancelAutocomplete]);
  const handleCameraChanged = React.useCallback(
    (state: MapboxMapState) => {
      const bounds = mapStateBoundsToMapBounds(state);
      if (!bounds) {
        return;
      }

      if (!latestBoundsRef.current) {
        latestBoundsRef.current = bounds;
      }

      const nextCenter = state?.properties?.center as unknown;
      const nextZoom = state?.properties?.zoom as unknown;
      if (isLngLatTuple(nextCenter) && typeof nextZoom === 'number' && Number.isFinite(nextZoom)) {
        const center: [number, number] = [nextCenter[0], nextCenter[1]];
        lastCameraStateRef.current = { center, zoom: nextZoom };
        if (cameraPersistTimeoutRef.current) {
          clearTimeout(cameraPersistTimeoutRef.current);
        }
        cameraPersistTimeoutRef.current = setTimeout(() => {
          const snapshot = lastCameraStateRef.current;
          if (!snapshot) {
            return;
          }
          const payload = JSON.stringify({ center: snapshot.center, zoom: snapshot.zoom });
          if (payload === lastPersistedCameraRef.current) {
            return;
          }
          lastPersistedCameraRef.current = payload;
          setMapCenter(snapshot.center);
          setMapZoom(snapshot.zoom);
          void AsyncStorage.setItem(CAMERA_STORAGE_KEY, payload).catch(() => undefined);
        }, CAMERA_PERSIST_DELAY_MS);
      }

      if (shouldShowPollsSheet) {
        schedulePollBoundsUpdate(bounds);
      }

      const isGestureActive = Boolean(state?.gestures?.isGestureActive);
      mapGestureActiveRef.current = isGestureActive;

      if (isAnySheetDragging) {
        return;
      }

      if (!isSearchOverlay || !results || !isSearchSessionActive) {
        return;
      }

      if (suppressMapMovedRef.current && !isGestureActive) {
        latestBoundsRef.current = bounds;
        return;
      }

      if (isGestureActive) {
        markMapMoved();
        scheduleMapIdleReveal();
        return;
      }

      if (hasBoundsMovedSignificantly(latestBoundsRef.current, bounds)) {
        markMapMoved();
      }
      scheduleMapIdleReveal();
    },
    [
      isAnySheetDragging,
      isSearchOverlay,
      isSearchSessionActive,
      markMapMoved,
      results,
      schedulePollBoundsUpdate,
      scheduleMapIdleReveal,
      shouldShowPollsSheet,
    ]
  );

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    const nextValue = !openNow;
    setOpenNow(nextValue);
    const shouldRunShortcut = searchMode === 'shortcut';
    const shouldRunNatural = !shouldRunShortcut && Boolean(query.trim());
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
          filters: { openNow: nextValue },
        });
        return;
      }
      void submitSearch({ openNow: nextValue, preserveSheetState: true });
    }, 150);
  }, [
    activeTab,
    openNow,
    query,
    runBestHere,
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
    const shouldRunNatural = !shouldRunShortcut && Boolean(query.trim());
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
      void submitSearch({ priceLevels: nextLevels, page: 1, preserveSheetState: true });
    }, 150);
  }, [
    activeTab,
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
      setRestaurantOverlayVisible(false);
      closePriceSelector();
      closeScoreInfo();
    });
  }, [closePriceSelector, closeScoreInfo, registerTransientDismissor]);

  const handlePriceDone = React.useCallback(() => {
    commitPriceSelection();
  }, [commitPriceSelection]);

  const recordRestaurantView = React.useCallback(
    async (restaurantId: string, source: 'results_sheet' | 'auto_open_single_candidate') => {
      if (!isSignedIn) {
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

  const focusRestaurantLocations = React.useCallback(
    async (restaurant: RestaurantResult, options: { preserveBounds: boolean }) => {
      const locations = resolveRestaurantMapLocations(restaurant, true);
      if (locations.length < 2) {
        setFocusedRestaurantId(null);
        shouldRestoreBoundsRef.current = false;
        previousMapBoundsRef.current = null;
        return;
      }

      if (options.preserveBounds) {
        if (!shouldRestoreBoundsRef.current) {
          const currentBounds = await resolveCurrentMapBounds();
          if (currentBounds) {
            previousMapBoundsRef.current = currentBounds;
            shouldRestoreBoundsRef.current = true;
          }
        }
      } else {
        previousMapBoundsRef.current = null;
        shouldRestoreBoundsRef.current = false;
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

      setFocusedRestaurantId(restaurant.restaurantId);
      setIsFollowingUser(false);
      if (cameraRef.current?.fitBounds) {
        suppressMapMoved();
        cameraRef.current.fitBounds(
          [bounds.northEast.lng, bounds.northEast.lat],
          [bounds.southWest.lng, bounds.southWest.lat],
          focusPadding,
          500
        );
      }
    },
    [focusPadding, resolveCurrentMapBounds, resolveRestaurantMapLocations, suppressMapMoved]
  );

  const restoreFocusedMapView = React.useCallback(() => {
    setFocusedRestaurantId(null);
    if (
      shouldRestoreBoundsRef.current &&
      previousMapBoundsRef.current &&
      cameraRef.current?.fitBounds
    ) {
      setIsFollowingUser(false);
      suppressMapMoved();
      const bounds = previousMapBoundsRef.current;
      cameraRef.current.fitBounds(
        [bounds.northEast.lng, bounds.northEast.lat],
        [bounds.southWest.lng, bounds.southWest.lat],
        focusPadding,
        500
      );
    }
    shouldRestoreBoundsRef.current = false;
    previousMapBoundsRef.current = null;
  }, [focusPadding, suppressMapMoved]);

  const openRestaurantProfile = React.useCallback(
    (
      restaurant: RestaurantResult,
      foodResultsOverride?: FoodResult[],
      source: 'results_sheet' | 'auto_open_single_candidate' = 'results_sheet'
    ) => {
      const sourceDishes = foodResultsOverride ?? dishes;
      const restaurantDishes = sourceDishes
        .filter((dish) => dish.restaurantId === restaurant.restaurantId)
        .sort((a, b) => {
          const scoreA = a.displayScore ?? a.qualityScore;
          const scoreB = b.displayScore ?? b.qualityScore;
          return scoreB - scoreA;
        });
      const label = (submittedQuery || trimmedQuery || 'Search').trim();
      // Store current sheet state and hide results sheet
      previousSheetStateRef.current = sheetState;
      animateSheetTo('hidden');
      // Store and hide save sheet if visible
      if (saveSheetState.visible) {
        previousSaveSheetStateRef.current = saveSheetState;
        setSaveSheetState((prev) => ({ ...prev, visible: false }));
      }

      const shouldCenterPin = !shouldRestoreBoundsRef.current && getLocationCount(restaurant) <= 1;
      if (lastCameraStateRef.current) {
        previousRestaurantProfileCameraRef.current = { ...lastCameraStateRef.current };
      }
      if (shouldCenterPin && cameraRef.current?.setCamera) {
        const [location] = resolveRestaurantMapLocations(restaurant, false);
        if (location) {
          const nextCenter: [number, number] = [location.longitude, location.latitude];
          const currentZoom =
            lastCameraStateRef.current?.zoom ?? (typeof mapZoom === 'number' ? mapZoom : null);
          setMapCenter(nextCenter);
          if (typeof currentZoom === 'number' && Number.isFinite(currentZoom)) {
            setMapZoom(currentZoom);
            lastCameraStateRef.current = { center: nextCenter, zoom: currentZoom };
          } else if (lastCameraStateRef.current) {
            lastCameraStateRef.current = { ...lastCameraStateRef.current, center: nextCenter };
          }
          const snaps = calculateSnapPoints(
            SCREEN_HEIGHT,
            searchBarTop,
            insets.top,
            bottomNavFrame.top,
            0
          );
          const topPadding = Math.max(searchBarTop + (searchBarFrame?.height ?? 0), snaps.expanded);
          const desiredCenter = SCREEN_HEIGHT * PROFILE_PIN_TARGET_CENTER_RATIO;
          const minCenter = topPadding + PROFILE_PIN_MIN_VISIBLE_HEIGHT / 2;
          const targetCenter = Math.max(desiredCenter, minCenter);
          const bottomPadding = Math.max(SCREEN_HEIGHT + topPadding - 2 * targetCenter, 0);
          const padding = {
            paddingTop: topPadding,
            paddingBottom: bottomPadding,
            paddingLeft: 0,
            paddingRight: 0,
          };
          setMapCameraPadding(padding);
          setIsFollowingUser(false);
          suppressMapMoved();
          cameraRef.current.setCamera({
            centerCoordinate: nextCenter,
            padding,
            animationDuration: 300,
            animationMode: 'easeTo',
          });
        } else {
          setMapCameraPadding(null);
        }
      } else {
        setMapCameraPadding(null);
      }

      setRestaurantProfile({
        restaurant,
        dishes: restaurantDishes,
        queryLabel: label,
        isFavorite: false,
      });
      setRestaurantOverlayVisible(true);
      trackRecentlyViewedRestaurant(restaurant.restaurantId, restaurant.restaurantName);

      void recordRestaurantView(restaurant.restaurantId, source);
    },
    [
      animateSheetTo,
      bottomNavFrame.top,
      dishes,
      getLocationCount,
      insets.top,
      mapZoom,
      resolveRestaurantMapLocations,
      saveSheetState,
      setMapCameraPadding,
      setMapCenter,
      setMapZoom,
      searchBarFrame,
      searchBarTop,
      sheetState,
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
      _source?: 'results_sheet' | 'auto_open_single_candidate'
    ) => {
      const locationCount = getLocationCount(restaurant);
      if (locationCount > 1) {
        void focusRestaurantLocations(restaurant, { preserveBounds: true });
      } else {
        setFocusedRestaurantId(null);
        shouldRestoreBoundsRef.current = false;
        previousMapBoundsRef.current = null;
      }
      openRestaurantProfile(restaurant, foodResultsOverride, 'results_sheet');
    },
    [focusRestaurantLocations, getLocationCount, openRestaurantProfile]
  );

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

  React.useEffect(() => {
    if (!results) {
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
      const locationCount = getLocationCount(targetRestaurant);
      if (locationCount > 1) {
        void focusRestaurantLocations(targetRestaurant, {
          preserveBounds: pendingSelection.preserveBounds,
        });
      } else {
        setFocusedRestaurantId(null);
        shouldRestoreBoundsRef.current = false;
        previousMapBoundsRef.current = null;
      }
      openRestaurantProfile(targetRestaurant, results.food ?? [], 'results_sheet');
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
    openRestaurantProfile(targetRestaurant, results.food ?? [], 'auto_open_single_candidate');
    lastAutoOpenKeyRef.current = autoOpenKey;
  }, [
    focusRestaurantLocations,
    getLocationCount,
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

  const restoreRestaurantProfileMap = React.useCallback(() => {
    const hadFocusedBounds = shouldRestoreBoundsRef.current;
    restoreFocusedMapView();
    setMapCameraPadding(null);
    const snapshot = previousRestaurantProfileCameraRef.current;
    previousRestaurantProfileCameraRef.current = null;
    if (!hadFocusedBounds && snapshot && cameraRef.current?.setCamera) {
      setIsFollowingUser(false);
      suppressMapMoved();
      setMapCenter(snapshot.center);
      setMapZoom(snapshot.zoom);
      lastCameraStateRef.current = { center: snapshot.center, zoom: snapshot.zoom };
      cameraRef.current.setCamera({
        centerCoordinate: snapshot.center,
        zoomLevel: snapshot.zoom,
        padding: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
        animationDuration: 280,
        animationMode: 'easeTo',
      });
    }
  }, [restoreFocusedMapView, setMapCameraPadding, setMapCenter, setMapZoom, suppressMapMoved]);

  const restoreSearchSheetState = React.useCallback(() => {
    const previousState = previousSheetStateRef.current;
    if (previousState && previousState !== 'hidden') {
      animateSheetTo(previousState);
    }
    previousSheetStateRef.current = null;
  }, [animateSheetTo]);

  const closeRestaurantProfile = React.useCallback(() => {
    restoreRestaurantProfileMap();
    restoreSearchSheetState();
    setRestaurantOverlayVisible(false);
  }, [restoreRestaurantProfileMap, restoreSearchSheetState]);

  const handleRestaurantOverlayDismissed = React.useCallback(() => {
    setRestaurantProfile(null);
    setRestaurantOverlayVisible(false);
    restoreRestaurantProfileMap();
    if (isSearchOverlay) {
      restoreSearchSheetState();
    } else {
      previousSheetStateRef.current = null;
    }
    // Restore the save sheet if it was visible
    if (previousSaveSheetStateRef.current?.visible) {
      setSaveSheetState(previousSaveSheetStateRef.current);
    }
    previousSaveSheetStateRef.current = null;
  }, [isSearchOverlay, restoreRestaurantProfileMap, restoreSearchSheetState]);
  const dishesCount = dishes.length;
  const restaurantsCount = restaurants.length;
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

  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => {
      const restaurantForDish = restaurantsById.get(item.restaurantId);
      const isLiked = false;
      return (
        <DishResultCard
          item={item}
          index={index}
          dishesCount={dishesCount}
          isLiked={isLiked}
          primaryCoverageKey={primaryCoverageKey}
          showCoverageLabel={hasCrossCoverage}
          restaurantForDish={restaurantForDish}
          onSavePress={() =>
            setSaveSheetState({
              visible: true,
              listType: 'dish',
              target: { connectionId: item.connectionId },
            })
          }
          openRestaurantProfile={openRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
        />
      );
    },
    [
      dishesCount,
      hasCrossCoverage,
      openRestaurantProfileFromResults,
      openScoreInfo,
      primaryCoverageKey,
      restaurantsById,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (restaurant: RestaurantResult, index: number) => {
      const isLiked = false;
      return (
        <RestaurantResultCard
          restaurant={restaurant}
          index={index}
          restaurantsCount={restaurantsCount}
          isLiked={isLiked}
          primaryCoverageKey={primaryCoverageKey}
          showCoverageLabel={hasCrossCoverage}
          onSavePress={() =>
            setSaveSheetState({
              visible: true,
              listType: 'restaurant',
              target: { restaurantId: restaurant.restaurantId },
            })
          }
          openRestaurantProfile={openRestaurantProfileFromResults}
          openScoreInfo={openScoreInfo}
          primaryFoodTerm={primaryFoodTerm}
        />
      );
    },
    [
      hasCrossCoverage,
      openRestaurantProfileFromResults,
      openScoreInfo,
      primaryFoodTerm,
      primaryCoverageKey,
      restaurantsCount,
    ]
  );

  const filtersHeader = (
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
    />
  );

  const dishKeyExtractor = React.useCallback((item: FoodResult, index: number) => {
    if (item?.connectionId) {
      return item.connectionId;
    }
    if (item?.foodId && item?.restaurantId) {
      return `${item.foodId}-${item.restaurantId}`;
    }
    return `dish-${index}`;
  }, []);
  const restaurantKeyExtractor = React.useCallback((item: RestaurantResult, index: number) => {
    if (item?.restaurantId) {
      return item.restaurantId;
    }
    return `restaurant-${index}`;
  }, []);

  const isDishesTab = activeTab === 'dishes';
  const resultsData = React.useMemo(() => {
    const source = isDishesTab ? dishes : restaurants;
    if (!Array.isArray(source)) {
      logger.error('resultsData not array', { tab: activeTab, type: typeof source });
      return [];
    }
    return source;
  }, [activeTab, dishes, restaurants, isDishesTab]);
  const safeResultsData = React.useMemo(
    () =>
      Array.isArray(resultsData)
        ? resultsData.filter(
            (item): item is FoodResult | RestaurantResult => item !== null && item !== undefined
          )
        : [],
    [resultsData]
  );
  const estimatedDishItemSize = 240;
  const estimatedRestaurantItemSize = 270;
  const estimatedItemSize = isDishesTab ? estimatedDishItemSize : estimatedRestaurantItemSize;
  const getResultItemType = React.useCallback<
    FlashListProps<FoodResult | RestaurantResult>['getItemType']
  >((item) => ('foodId' in item ? 'dish' : 'restaurant'), []);
  const overrideResultItemLayout = React.useCallback<
    FlashListProps<FoodResult | RestaurantResult>['overrideItemLayout']
  >(
    (layout, item) => {
      if (!item) {
        layout.size = estimatedItemSize;
        return;
      }
      layout.size = 'foodId' in item ? estimatedDishItemSize : estimatedRestaurantItemSize;
    },
    [estimatedDishItemSize, estimatedItemSize, estimatedRestaurantItemSize]
  );

  const renderSafeItem = React.useCallback<
    NonNullable<FlashListProps<FoodResult | RestaurantResult>['renderItem']>
  >(
    ({ item, index }) => {
      if (item === undefined || item === null) {
        logger.error('FlashList renderItem received nullish item', { index, tab: activeTab });
        return null;
      }
      return isDishesTab
        ? renderDishCard(item as FoodResult, index)
        : renderRestaurantCard(item as RestaurantResult, index);
    },
    [activeTab, isDishesTab, renderDishCard, renderRestaurantCard]
  );
  const resultsListKey = React.useMemo(() => {
    const meta = results?.metadata;
    const parts = [
      meta?.searchRequestId ?? 'no-request',
      activeTab,
      meta?.openNowApplied ? 'open' : 'all',
      meta?.priceFilterApplied ? 'price' : 'allprice',
      meta?.minimumVotesApplied ? 'votes' : 'allvotes',
      meta?.page ?? 1,
      meta?.pageSize ?? DEFAULT_PAGE_SIZE,
      dishes.length,
      restaurants.length,
    ];
    return parts.join(':');
  }, [
    activeTab,
    dishes.length,
    restaurants.length,
    results?.metadata?.minimumVotesApplied,
    results?.metadata?.openNowApplied,
    results?.metadata?.page,
    results?.metadata?.pageSize,
    results?.metadata?.priceFilterApplied,
    results?.metadata?.searchRequestId,
  ]);
  const listHeader = React.useMemo(
    () => (
      <View
        style={styles.resultsListHeader}
        onLayout={(event: LayoutChangeEvent) => {
          const nextHeight = event.nativeEvent.layout.height;
          setFiltersHeaderHeight((prev) => (Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight));
        }}
      >
        <FrostedGlassBackground intensity={resultsBlurIntensity} />
        {filtersHeader}
      </View>
    ),
    [filtersHeader, resultsBlurIntensity]
  );
  const shouldRetrySearchOnReconnect = shouldRetrySearchOnReconnectRef.current;
  const shouldShowResultsLoadingState =
    (isLoading || hasSystemStatusBanner || shouldRetrySearchOnReconnect) && !results;
  const resultsListBackground = React.useMemo(() => {
    const topOffset = Math.max(0, resultsSheetHeaderHeight + filtersHeaderHeight);
    return (
      <View
        style={[
          styles.resultsListBackground,
          { top: topOffset },
          shouldShowResultsLoadingState && styles.resultsListBackgroundLoading,
        ]}
      />
    );
  }, [filtersHeaderHeight, resultsSheetHeaderHeight, shouldShowResultsLoadingState]);

  const ResultItemSeparator = React.useCallback(() => {
    return <View style={styles.resultItemSeparator} />;
  }, []);

  const resultsListFooterComponent = React.useMemo(() => {
    const shouldShowNotice = Boolean(onDemandNotice && safeResultsData.length > 0);
    return (
      <View style={styles.loadMoreSpacer}>
        {shouldShowNotice ? onDemandNotice : null}
        {isLoadingMore && canLoadMore ? (
          <View style={styles.loadMoreSpinner}>
            <ActivityIndicator size="small" color={ACTIVE_TAB_COLOR} />
          </View>
        ) : null}
      </View>
    );
  }, [canLoadMore, isLoadingMore, onDemandNotice, safeResultsData.length]);

  const resultsListEmptyComponent = React.useMemo(() => {
    const visibleSheetHeight = Math.max(0, SCREEN_HEIGHT - snapPoints.middle);
    const emptyAreaMinHeight = Math.max(
      0,
      visibleSheetHeight - resultsSheetHeaderHeight - filtersHeaderHeight
    );
    const emptyAreaStyle = { minHeight: emptyAreaMinHeight };
    const emptyYOffset = -Math.min(24, Math.max(12, emptyAreaMinHeight * 0.12));
    const emptyContentOffsetStyle = { transform: [{ translateY: emptyYOffset }] };
    const emptySubtitle =
      results?.metadata?.emptyQueryMessage ?? 'Try moving the map or adjusting your search.';

    if (shouldShowResultsLoadingState) {
      return (
        <View style={[styles.resultsEmptyArea, emptyAreaStyle]}>
          <View style={emptyContentOffsetStyle}>
            <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
          </View>
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
    filtersHeaderHeight,
    onDemandNotice,
    results,
    resultsSheetHeaderHeight,
    shouldShowResultsLoadingState,
    snapPoints.middle,
  ]);
  const searchThisAreaTop = Math.max(searchLayout.top + searchLayout.height + 12, insets.top + 12);
  const statusBarFadeHeight = Math.max(0, insets.top + 16);
  const resultsHeaderComponent = (
    <Reanimated.View
      style={[
        overlaySheetStyles.header,
        overlaySheetStyles.headerTransparent,
        styles.resultsHeaderSurface,
      ]}
      onLayout={(event: LayoutChangeEvent) => {
        resultsHeaderCutout.onHeaderLayout(event);
        const nextHeight = event.nativeEvent.layout.height;
        setResultsSheetHeaderHeight((prev) =>
          Math.abs(prev - nextHeight) < 0.5 ? prev : nextHeight
        );
      }}
    >
      <FrostedGlassBackground intensity={resultsBlurIntensity} />
      {resultsHeaderCutout.background}
      <View style={[overlaySheetStyles.grabHandleWrapper, styles.resultsHeaderHandle]}>
        <Pressable onPress={hidePanel} accessibilityRole="button" accessibilityLabel="Hide results">
          <View style={overlaySheetStyles.grabHandle} />
        </Pressable>
      </View>
      <View
        onLayout={resultsHeaderCutout.onHeaderRowLayout}
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}
      >
        <Text
          variant="title"
          weight="semibold"
          style={styles.submittedQueryLabel}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {submittedQuery || 'Results'}
        </Text>
        <Pressable
          onPress={handleCloseResults}
          accessibilityRole="button"
          accessibilityLabel="Close results"
          style={overlaySheetStyles.closeButton}
          onLayout={resultsHeaderCutout.onCloseLayout}
          hitSlop={8}
        >
          <View style={overlaySheetStyles.closeIcon}>
            <LucideX size={18} color="#0f172a" strokeWidth={2} />
          </View>
        </Pressable>
      </View>
      <Reanimated.View style={[overlaySheetStyles.headerDivider, headerDividerAnimatedStyle]} />
    </Reanimated.View>
  );

  return (
    <View style={styles.container}>
      {isInitialCameraReady ? (
        <SearchMap
          mapRef={mapRef}
          cameraRef={cameraRef}
          styleURL={mapStyleURL}
          mapCenter={mapCenter}
          mapZoom={mapZoom ?? USA_FALLBACK_ZOOM}
          cameraPadding={mapCameraPadding}
          isFollowingUser={isFollowingUser}
          onPress={handleMapPress}
          onCameraChanged={handleCameraChanged}
          onMapLoaded={handleMapLoaded}
          onMarkerPress={handleMarkerPress}
          selectedRestaurantId={
            isRestaurantOverlayVisible ? restaurantProfile?.restaurant.restaurantId : null
          }
          preferredFramesPerSecond={mapPreferredFramesPerSecond}
          sortedRestaurantMarkers={sortedRestaurantMarkers}
          markersRenderKey={markersRenderKey}
          buildMarkerKey={buildMarkerKey}
          restaurantFeatures={restaurantFeatures}
          restaurantLabelStyle={restaurantLabelStyle}
          userLocation={userLocation}
          locationPulse={locationPulse}
        />
      ) : (
        <View pointerEvents="none" style={styles.mapPlaceholder} />
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
                'rgba(0, 0, 0, 0.85)',
                'rgba(0, 0, 0, 0.6)',
                'rgba(0, 0, 0, 0.3)',
                'rgba(0, 0, 0, 0)',
              ]}
              locations={[0, 0.5, 0.65, 0.78, 0.9, 1]}
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
        <SafeAreaView
          style={styles.overlay}
          pointerEvents="box-none"
          edges={['top', 'left', 'right']}
        >
          {isSearchOverlay ? (
            <Reanimated.View
              pointerEvents={isSearchFocused ? 'auto' : 'none'}
              style={[
                styles.searchSurface,
                searchSurfaceAnimatedStyle,
                {
                  top: 0,
                },
              ]}
            >
              <FrostedGlassBackground />
              {isSuggestionScreenActive && suggestionHeaderHeight > 0 ? (
                <MaskedHoleOverlay
                  holes={suggestionHeaderHoles}
                  backgroundColor="#ffffff"
                  style={[
                    styles.searchSuggestionHeaderSurface,
                    { height: suggestionHeaderHeight },
                    suggestionMaskAnimatedStyle,
                  ]}
                  pointerEvents="none"
                />
              ) : null}
              {suggestionTopFillHeight > 0 ? (
                <Reanimated.View
                  pointerEvents="none"
                  style={[
                    styles.searchSuggestionTopFill,
                    { top: suggestionScrollTop, height: suggestionTopFillHeight },
                    suggestionMaskAnimatedStyle,
                  ]}
                />
              ) : null}
              <Animated.ScrollView
                style={[
                  styles.searchSurfaceScroll,
                  isSuggestionScreenActive
                    ? [
                        styles.searchSuggestionScrollSurface,
                        { marginTop: suggestionScrollTop },
                        suggestionScrollMaxHeight ? { maxHeight: suggestionScrollMaxHeight } : null,
                      ]
                    : null,
                ]}
                contentContainerStyle={[
                  styles.searchSurfaceContent,
                  {
                    paddingTop: isSuggestionScreenActive
                      ? 0
                      : searchLayout.top + searchLayout.height + 8,
                    paddingBottom: isSuggestionScreenActive
                      ? SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM
                      : bottomInset + 32,
                    paddingHorizontal: isSuggestionScreenActive ? CONTENT_HORIZONTAL_PADDING : 0,
                    backgroundColor:
                      isSuggestionScreenActive && shouldRenderSuggestionPanel
                        ? '#ffffff'
                        : 'transparent',
                  },
                ]}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={Boolean(isSuggestionScreenActive && shouldRenderSuggestionPanel)}
                showsVerticalScrollIndicator={false}
              >
                {shouldRenderSuggestionPanel ? (
                  <SearchSuggestions
                    visible={shouldRenderSuggestionPanel}
                    showAutocomplete={shouldRenderAutocompleteSection}
                    showRecent={shouldRenderRecentSection}
                    suggestions={suggestions}
                    recentSearches={recentSearches}
                    recentlyViewedRestaurants={recentlyViewedRestaurants}
                    hasRecentSearches={hasRecentSearches}
                    hasRecentlyViewedRestaurants={hasRecentlyViewedRestaurants}
                    isAutocompleteLoading={isAutocompleteLoading}
                    isRecentLoading={isRecentLoading}
                    isRecentlyViewedLoading={isRecentlyViewedLoading}
                    onSelectSuggestion={handleSuggestionPress}
                    onSelectRecent={handleRecentSearchPress}
                    onSelectRecentlyViewed={handleRecentlyViewedRestaurantPress}
                  />
                ) : null}
              </Animated.ScrollView>
            </Reanimated.View>
          ) : null}
          <View
            pointerEvents={shouldShowSearchChrome ? 'auto' : 'none'}
            style={[
              styles.searchContainer,
              !shouldShowSearchChrome ? styles.searchChromeHidden : null,
            ]}
            onLayout={({ nativeEvent: { layout } }) => {
              setSearchLayout((prev) => {
                if (prev.top === layout.y && prev.height === layout.height) {
                  return prev;
                }

                return { top: layout.y, height: layout.height };
              });

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
            }}
          >
            <SearchHeader
              value={query}
              placeholder="What are you craving?"
              onChangeText={handleQueryChange}
              onSubmit={handleSubmit}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              onClear={handleClear}
              onPress={focusSearchInput}
              accentColor={ACTIVE_TAB_COLOR}
              showBack={Boolean(isSearchOverlay && isSearchFocused)}
              onBackPress={handleCloseResults}
              onLayout={handleSearchHeaderLayout}
              inputRef={inputRef}
              inputAnimatedStyle={searchBarInputAnimatedStyle}
              containerAnimatedStyle={[
                searchBarSheetAnimatedStyle,
                searchBarAnimatedStyle,
                searchBarTransparencyAnimatedStyle,
              ]}
              editable
              showInactiveSearchIcon={!isSearchFocused && !isSearchSessionActive}
              isSearchSessionActive={isSearchSessionActive}
              surfaceVariant={isSuggestionScreenActive ? 'transparent' : 'solid'}
            />
          </View>
          {shouldShowSearchChrome && !isSearchSessionActive && (
            <Reanimated.View
              style={[
                styles.searchShortcutsRow,
                isSuggestionScreenActive ? styles.searchShortcutsRowSuggestion : null,
                searchChromeAnimatedStyle,
              ]}
              pointerEvents="box-none"
              onLayout={({ nativeEvent: { layout } }) => {
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
              <Pressable
                onPress={handleBestRestaurantsHere}
                style={[
                  styles.searchShortcutChip,
                  isSuggestionScreenActive ? styles.searchShortcutChipTransparent : null,
                ]}
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
                    return { ...prev, restaurants: layout };
                  });
                }}
              >
                <View style={styles.searchShortcutContent}>
                  <Store size={18} color="#0f172a" strokeWidth={2} />
                  <Text variant="body" weight="semibold" style={styles.searchShortcutChipText}>
                    Best restaurants
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={handleBestDishesHere}
                style={[
                  styles.searchShortcutChip,
                  isSuggestionScreenActive ? styles.searchShortcutChipTransparent : null,
                ]}
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
                    return { ...prev, dishes: layout };
                  });
                }}
              >
                <View style={styles.searchShortcutContent}>
                  <HandPlatter size={18} color="#0f172a" strokeWidth={2} />
                  <Text variant="body" weight="semibold" style={styles.searchShortcutChipText}>
                    Best dishes
                  </Text>
                </View>
              </Pressable>
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
          <SearchResultsSheet
            visible={shouldRenderSheet}
            listScrollEnabled={!isPriceSelectorVisible}
            snapPoints={snapPoints}
            initialSnapPoint={sheetState === 'hidden' ? 'collapsed' : sheetState}
            sheetYValue={sheetTranslateY}
            scrollOffsetValue={resultsScrollOffset}
            momentumFlag={resultsMomentum}
            onScrollBeginDrag={handleResultsListScrollBegin}
            onScrollEndDrag={handleResultsListScrollEnd}
            onMomentumBeginJS={handleResultsListMomentumBegin}
            onMomentumEndJS={handleResultsListMomentumEnd}
            onDragStateChange={handleResultsSheetDragStateChange}
            onEndReached={canLoadMore ? () => loadMoreResults(searchMode) : undefined}
            data={safeResultsData}
            renderItem={renderSafeItem}
            keyExtractor={isDishesTab ? dishKeyExtractor : restaurantKeyExtractor}
            estimatedItemSize={estimatedItemSize}
            getItemType={getResultItemType}
            overrideItemLayout={overrideResultItemLayout}
            listKey={resultsListKey}
            contentContainerStyle={{
              paddingBottom: safeResultsData.length > 0 ? RESULTS_BOTTOM_PADDING : 0,
            }}
            ListHeaderComponent={listHeader}
            ListFooterComponent={resultsListFooterComponent}
            ListEmptyComponent={resultsListEmptyComponent}
            ItemSeparatorComponent={ResultItemSeparator}
            headerComponent={resultsHeaderComponent}
            backgroundComponent={resultsListBackground}
            listRef={resultsScrollRef}
            resultsContainerAnimatedStyle={resultsContainerAnimatedStyle}
            onHidden={resetSheetToHidden}
            onSnapChange={handleSheetSnapChange}
          />
        </SafeAreaView>
      )}
      {!shouldHideBottomNav && (
        <View style={styles.bottomNavWrapper} pointerEvents="box-none">
          <View
            style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_BOTTOM_PADDING }]}
            onLayout={handleBottomNavLayout}
          >
            <View style={styles.bottomNavBackground} pointerEvents="none">
              <FrostedGlassBackground />
            </View>
            {navItems.map((item) => {
              const active = activeOverlay === item.key;
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
      )}
      <BookmarksOverlay
        visible={showBookmarksOverlay}
        navBarTop={bottomNavFrame.top}
        searchBarTop={searchBarTop}
        onSnapChange={handleBookmarksSnapChange}
        onDragStateChange={handleBookmarksSheetDragStateChange}
        sheetYObserver={bookmarksSheetY}
        snapTo={bookmarksSnapRequest}
      />
      <ProfileOverlay
        visible={showProfileOverlay}
        navBarTop={bottomNavFrame.top}
        navBarHeight={bottomNavFrame.height}
        searchBarTop={searchBarTop}
        onSnapChange={handleProfileSnapChange}
        onDragStateChange={handleProfileSheetDragStateChange}
        sheetYObserver={profileSheetY}
      />
      <SaveListOverlay
        visible={saveSheetState.visible}
        listType={saveSheetState.listType}
        target={saveSheetState.target}
        searchBarTop={searchBarTop}
        onClose={handleCloseSaveSheet}
        onSnapChange={setSaveSheetSnap}
        onDragStateChange={handleSaveSheetDragStateChange}
        sheetYObserver={saveSheetY}
      />
      <PollsOverlay
        visible={shouldShowPollsSheet}
        bounds={pollBounds}
        params={pollOverlayParams}
        initialSnapPoint={pollsOverlaySnapPoint}
        mode={pollsOverlayMode}
        navBarTop={bottomNavFrame.top}
        navBarHeight={bottomNavFrame.height}
        searchBarTop={searchBarTop}
        onSnapChange={handlePollsSnapChange}
        onDragStateChange={handlePollsSheetDragStateChange}
        sheetYObserver={pollsSheetY}
        snapTo={pollsSnapRequest}
      />
      <RestaurantOverlay
        visible={isRestaurantOverlayVisible && Boolean(restaurantProfile)}
        data={restaurantProfile}
        onRequestClose={closeRestaurantProfile}
        onDismiss={handleRestaurantOverlayDismissed}
        onToggleFavorite={handleRestaurantSavePress}
        navBarTop={bottomNavFrame.top}
        searchBarTop={searchBarTop}
      />
      <SecondaryBottomSheet
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
      </SecondaryBottomSheet>
      <SecondaryBottomSheet
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
      </SecondaryBottomSheet>
    </View>
  );
};

export default SearchScreen;
