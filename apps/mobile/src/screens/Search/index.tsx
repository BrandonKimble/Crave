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
  Extrapolation,
  interpolate,
  runOnUI,
  useAnimatedScrollHandler,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  LinearTransition,
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
import {
  Building2,
  ChartNoAxesColumn,
  Earth,
  HandPlatter,
  Heart,
  Store,
  X as LucideX,
} from 'lucide-react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { colors as themeColors } from '../../constants/theme';
import {
  overlaySheetStyles,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
} from '../../overlays/overlaySheetStyles';
import OverlaySheetShell from '../../overlays/OverlaySheetShell';
import OverlayHeaderActionButton from '../../overlays/OverlayHeaderActionButton';
import OverlayModalSheet, { type OverlayModalSheetHandle } from '../../overlays/OverlayModalSheet';
import OverlaySheetHeaderChrome from '../../overlays/OverlaySheetHeaderChrome';
import { createOverlayRegistry } from '../../overlays/OverlayRegistry';
import { calculateSnapPoints, resolveExpandedTop } from '../../overlays/sheetUtils';
import { logger } from '../../utils';
import {
  searchService,
  type RecentSearch,
  type RecentlyViewedFood,
  type RecentlyViewedRestaurant,
  type StructuredSearchRequest,
} from '../../services/search';
import type { FavoriteListType } from '../../services/favorite-lists';
import type { AutocompleteMatch } from '../../services/autocomplete';
import { useSearchStore } from '../../store/searchStore';
import { useSystemStatusStore } from '../../store/systemStatusStore';
import type {
  SearchResponse,
  FoodResult,
  RestaurantResult,
  RestaurantProfile,
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
import useTransitionDriver from '../../hooks/use-transition-driver';
import { useKeyedCallback } from '../../hooks/useCallbackFactory';
import { useDebouncedLayoutMeasurement } from '../../hooks/useDebouncedLayoutMeasurement';
import perfHarnessConfig from '../../perf/harness-config';
import { startJsFrameSampler } from '../../perf/js-frame-sampler';
import { startUiFrameSampler } from '../../perf/ui-frame-sampler';
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
import useScrollDividerStyle from './hooks/use-scroll-divider-style';
import useSearchSubmit from './hooks/use-search-submit';
import useSearchTransition from './hooks/use-search-transition';
import { SearchInteractionProvider } from './context/SearchInteractionContext';
import { useSearchSessionCoordinator } from './session/use-search-session-coordinator';
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
  ACTIVE_TAB_COLOR_DARK,
  AUTOCOMPLETE_CACHE_TTL_MS,
  AUTOCOMPLETE_MIN_CHARS,
  CAMERA_STORAGE_KEY,
  CONTENT_HORIZONTAL_PADDING,
  LABEL_TEXT_SIZE,
  LOCATION_STORAGE_KEY,
  MINIMUM_VOTES_FILTER,
  NAV_TOP_PADDING,
  NAV_BOTTOM_PADDING,
  RESULTS_BOTTOM_PADDING,
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
  SECONDARY_METRIC_ICON_SIZE,
  SHORTCUT_CHIP_HOLE_PADDING,
  SHORTCUT_CHIP_HOLE_RADIUS,
  SINGLE_LOCATION_ZOOM_LEVEL,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
} from './constants/search';

const RANK_MODE_OPTIONS = [
  { value: 'coverage_display', label: 'Local' },
  { value: 'global_quality', label: 'Global' },
] as const;

const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const EMPTY_RESULTS: Array<FoodResult | RestaurantResult> = [];
const EMPTY_MARKERS: Array<Feature<Point, RestaurantFeatureProperties>> = [];

import {
  buildLevelsFromRange,
  formatPriceRangeSummary,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceRangeValues,
  type PriceRangeTuple,
} from './utils/price';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from './utils/marker-lod';
import { buildMarkerRenderModel } from './utils/map-render-model';
import { getQualityColorFromScore } from './utils/quality';
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

const MemoOverlayModalSheet = React.memo(
  OverlayModalSheet,
  (prev, next) => !prev.visible && !next.visible
);

type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';
const PIXEL_SCALE = PixelRatio.get();
const CUTOUT_EDGE_SLOP = 1 / PIXEL_SCALE;
const floorToPixel = (value: number) => Math.floor(value * PIXEL_SCALE) / PIXEL_SCALE;
const ceilToPixel = (value: number) => Math.ceil(value * PIXEL_SCALE) / PIXEL_SCALE;
const roundPerfValue = (value: number): number => Math.round(value * 10) / 10;
const SHORTCUT_HARNESS_RUN_TIMEOUT_MS = 45000;
const SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS = 320;
const arePriceRangesEqual = (a: PriceRangeTuple, b: PriceRangeTuple) =>
  a[0] === b[0] && a[1] === b[1];
const PRICE_SUMMARY_REEL_RANGES: PriceRangeTuple[] = [
  [1, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [2, 4],
  [1, 5],
  [2, 5],
  [3, 4],
  [3, 5],
  [4, 5],
];
const PRICE_SUMMARY_REEL_ENTRIES = PRICE_SUMMARY_REEL_RANGES.map((range) => ({
  key: `${range[0]}-${range[1]}`,
  range,
  label: formatPriceRangeSummary(range),
}));
const PRICE_SUMMARY_REEL_INDEX_BY_KEY = PRICE_SUMMARY_REEL_ENTRIES.reduce<Record<string, number>>(
  (indexByKey, entry, index) => {
    indexByKey[entry.key] = index;
    return indexByKey;
  },
  {}
);
const PRICE_SUMMARY_REEL_LABELS = PRICE_SUMMARY_REEL_ENTRIES.map((entry) => entry.label);
const PRICE_SUMMARY_CANDIDATES = PRICE_SUMMARY_REEL_LABELS;
const PRICE_SUMMARY_PILL_PADDING_X = 12;
const PRICE_SUMMARY_REEL_STEP_Y = 16;
const PRICE_SUMMARY_REEL_ROTATE_DEG = 82;
const PRICE_SUMMARY_REEL_PERSPECTIVE = 900;
const PRICE_SUMMARY_REEL_DEFAULT_INDEX = PRICE_SUMMARY_REEL_INDEX_BY_KEY['1-5'] ?? 0;
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

type PriceSummaryReelItemProps = {
  label: string;
  index: number;
  reelPosition: SharedValue<number>;
  nearestIndex: SharedValue<number>;
  neighborVisibility: SharedValue<number>;
};

const PriceSummaryReelItem: React.FC<PriceSummaryReelItemProps> = React.memo(
  ({ label, index, reelPosition, nearestIndex, neighborVisibility }) => {
    const animatedStyle = useAnimatedStyle(() => {
      const distance = index - reelPosition.value;
      const absDistance = Math.abs(distance);
      if (absDistance > 1.1) {
        return {
          opacity: 0,
          zIndex: 0,
          backfaceVisibility: 'hidden',
          transform: [{ translateY: 0 }],
        };
      }
      const isNearest = index === nearestIndex.value;
      const clampedAbsDistance = Math.min(absDistance, 1.1);
      const baseOpacity = interpolate(
        absDistance,
        [0, 0.55, 0.9, 1.1],
        [1, 0.8, 0.12, 0],
        Extrapolation.CLAMP
      );
      const opacity = isNearest ? baseOpacity : baseOpacity * neighborVisibility.value * 0.85;
      const spacingCompensation = 1 - Math.min(absDistance, 1.5) * 0.1;

      return {
        opacity,
        zIndex: Math.round(200 - clampedAbsDistance * 90),
        backfaceVisibility: 'hidden',
        transform: [
          { perspective: PRICE_SUMMARY_REEL_PERSPECTIVE },
          { translateY: distance * PRICE_SUMMARY_REEL_STEP_Y * spacingCompensation },
          { rotateX: `${-distance * PRICE_SUMMARY_REEL_ROTATE_DEG}deg` },
        ],
      };
    }, [index, nearestIndex, neighborVisibility, reelPosition]);

    return (
      <Reanimated.View
        pointerEvents="none"
        renderToHardwareTextureAndroid
        shouldRasterizeIOS
        style={[styles.priceSheetHeadlineAnimatedLayer, animatedStyle]}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          variant="subtitle"
          weight="semibold"
          style={styles.priceSheetSummaryText}
        >
          {label}
        </Text>
      </Reanimated.View>
    );
  }
);

PriceSummaryReelItem.displayName = 'PriceSummaryReelItem';

const getPriceSummaryReelIndexFromBoundaries = (
  lowBoundary: number,
  highBoundary: number
): number => {
  'worklet';
  const low = Math.min(4, Math.max(1, lowBoundary));
  const high = Math.min(5, Math.max(low + 1, highBoundary));
  const lowFloor = Math.floor(low);
  const lowCeil = Math.min(4, lowFloor + 1);
  const highFloor = Math.floor(high);
  const highCeil = Math.min(5, highFloor + 1);
  const lowFraction = low - lowFloor;
  const highFraction = high - highFloor;

  let weightedIndex = 0;
  let totalWeight = 0;

  const applyCorner = (cornerLow: number, cornerHigh: number, weight: number) => {
    'worklet';
    if (weight <= 0 || cornerLow >= cornerHigh) {
      return;
    }
    const key = `${cornerLow}-${cornerHigh}`;
    const cornerIndex = PRICE_SUMMARY_REEL_INDEX_BY_KEY[key];
    const resolvedIndex = cornerIndex == null ? PRICE_SUMMARY_REEL_DEFAULT_INDEX : cornerIndex;
    weightedIndex += resolvedIndex * weight;
    totalWeight += weight;
  };

  applyCorner(lowFloor, highFloor, (1 - lowFraction) * (1 - highFraction));
  applyCorner(lowCeil, highFloor, lowFraction * (1 - highFraction));
  applyCorner(lowFloor, highCeil, (1 - lowFraction) * highFraction);
  applyCorner(lowCeil, highCeil, lowFraction * highFraction);

  if (totalWeight <= 0.000001) {
    return PRICE_SUMMARY_REEL_DEFAULT_INDEX;
  }
  return weightedIndex / totalWeight;
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
const FILTER_TOGGLE_DEBOUNCE_MS = 600;
const MARKER_REVEAL_CHUNK = 4;
const MARKER_REVEAL_STAGGER_MS = 12;
const MAX_FULL_PINS = 30;
const LOD_CAMERA_THROTTLE_MS = 80;
const LOD_PIN_TOGGLE_STABLE_MS_MOVING = 190;
const LOD_PIN_TOGGLE_STABLE_MS_IDLE = 0;
const LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING = 120;
const LOD_VISIBLE_CANDIDATE_BUFFER = 16;
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
const PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA = 0.55;
const PROFILE_MULTI_LOCATION_MIN_ZOOM = 3.5;
const RESTAURANT_FOCUS_CENTER_EPSILON = 1e-5;
const RESTAURANT_FOCUS_ZOOM_EPSILON = 0.01;
const PROFILE_TRANSITION_LOCK_MS = 750;
const FIT_BOUNDS_SYNC_BUFFER_MS = 160;
const RESULTS_WASH_FADE_MS = 220;
const STATUS_BAR_FADE_RAISE_PX = 4;
const RESULTS_VISUAL_READY_FALLBACK_MS = 1200;
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
    | ((
        restaurantId: string,
        restaurantName: string,
        pressedCoordinate?: Coordinate | null
      ) => void)
    | null
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
      hasStyleUrl: true,
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

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = React.useState('');
  const [isSearchSessionActive, setIsSearchSessionActive] = React.useState(false);
  const [restaurantOnlyId, setRestaurantOnlyId] = React.useState<string | null>(null);
  const [searchMode, setSearchMode] = React.useState<'natural' | 'shortcut' | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [visualReadyRequestKey, setVisualReadyRequestKey] = React.useState<string | null>(null);
  const visualReadyFallbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const resultsRequestKey =
    results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? null;
  const resultsPage = resolveResultsPage(results);
  const [resultsVisualSyncCandidate, setResultsVisualSyncCandidate] = React.useState<string | null>(
    null
  );
  const [markerRevealCommitId, setMarkerRevealCommitId] = React.useState<number | null>(null);
  const markerRevealCommitSeqRef = React.useRef(0);
  const isVisualSyncPending =
    resultsVisualSyncCandidate != null && resultsVisualSyncCandidate !== visualReadyRequestKey;
  const isSearchLoading = isLoading || isVisualSyncPending;
  const markVisualRequestReady = React.useCallback((requestKey: string | null) => {
    if (!requestKey) {
      return;
    }
    setVisualReadyRequestKey((prev) => (prev === requestKey ? prev : requestKey));
  }, []);
  const handlePageOneResultsCommitted = React.useCallback(() => {
    markerRevealCommitSeqRef.current += 1;
    const commitId = markerRevealCommitSeqRef.current;
    setMarkerRevealCommitId(commitId);
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
  const activeTab = useSearchStore((state) => state.activeTab);
  const preferredActiveTab = useSearchStore((state) => state.preferredActiveTab);
  const setActiveTab = useSearchStore((state) => state.setActiveTab);
  const hasActiveTabPreference = useSearchStore((state) => state.hasActiveTabPreference);
  const setPreferredActiveTab = useSearchStore((state) => state.setPreferredActiveTab);
  const [searchLayout, setSearchLayout] = React.useState({ top: 0, height: 0 });
  const [searchContainerFrame, setSearchContainerFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const searchContainerLayoutCacheRef = React.useRef<LayoutRectangle | null>(null);
  const [searchBarFrame, setSearchBarFrame] = React.useState<LayoutRectangle | null>(null);
  const [searchShortcutsFrame, setSearchShortcutsFrame] = React.useState<LayoutRectangle | null>(
    null
  );
  const [searchShortcutsFadeResetKey, setSearchShortcutsFadeResetKey] = React.useState(0);
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
  const [userLocation, setUserLocation] = React.useState<Coordinate | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = React.useState(false);
  const [pollBounds, setPollBounds] = React.useState<MapBounds | null>(null);
  React.useEffect(() => {
    isRestaurantOverlayVisibleRef.current = isRestaurantOverlayVisible;
  }, [isRestaurantOverlayVisible]);
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
  const suggestionLayoutHoldTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  type ResultsSectionRow = {
    kind: 'section';
    key: string;
    label: string;
  };

  type ResultsShowMoreRow = {
    kind: 'show_more_exact';
    key: string;
    hiddenCount: number;
  };

  type ResultsListItem = FoodResult | RestaurantResult | ResultsSectionRow | ResultsShowMoreRow;

  const resultsScrollRef = React.useRef<FlashListRef<ResultsListItem> | null>(null);
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
  const cameraCommandFrameRef = React.useRef<number | null>(null);
  const userLocationRef = React.useRef<Coordinate | null>(null);
  const userLocationIsCachedRef = React.useRef(false);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const locationPulse = React.useRef(new Animated.Value(0)).current;
  const locationPulseAnimationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const hasCenteredOnLocationRef = React.useRef(false);
  const restaurantFocusSessionRef = React.useRef<RestaurantFocusSession>({
    restaurantId: null,
    locationKey: null,
    hasAppliedInitialMultiLocationZoomOut: false,
  });
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
  const switchToSearchRootWithDockedPolls = React.useCallback(
    ({
      snap,
      clearTabSnapRequest = true,
    }: {
      snap?: Exclude<OverlaySheetSnap, 'hidden'>;
      clearTabSnapRequest?: boolean;
    } = {}) => {
      restoreDockedPolls({ snap, clearTabSnapRequest });
      setOverlay('search');
    },
    [restoreDockedPolls, setOverlay]
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
  const searchBarTop = React.useMemo(() => {
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
    setOverlay,
  });
  const ensureSearchOverlay = React.useCallback(() => {
    if (rootOverlay !== 'search') {
      unstable_batchedUpdates(() => {
        switchToSearchRootWithDockedPolls();
      });
      return;
    }
    if (activeOverlay !== 'search') {
      popToRootOverlay();
    }
  }, [activeOverlay, popToRootOverlay, rootOverlay, switchToSearchRootWithDockedPolls]);

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
      !isSearchLoading &&
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
          switchToSearchRootWithDockedPolls();
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
      setOverlay(target);
      inputRef.current?.blur();
      requestAnimationFrame(() => {
        overlaySwitchInFlightRef.current = false;
      });
    },
    [
      beginSuggestionCloseHold,
      dismissTransientOverlays,
      isRestaurantOverlayVisible,
      rootOverlay,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setOverlay,
      setShowSuggestions,
      setSuggestions,
      setTabOverlaySnapRequest,
      switchToSearchRootWithDockedPolls,
    ]
  );
  const requestReturnToSearchFromPolls = React.useCallback(
    () => handleOverlaySelect('search'),
    [handleOverlaySelect]
  );
  const handlePollsSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setPollsSheetSnap(snap);
    },
    [setPollsSheetSnap]
  );
  const handlePollsSnapChange = React.useCallback(
    (snap: OverlaySheetSnap, meta?: { source: 'gesture' | 'programmatic' }) => {
      setPollsSheetSnap(snap);
      if (snap === 'collapsed') {
        dockedPollsRestoreInFlightRef.current = false;
      }
      if (pollsDockedSnapRequest && pollsDockedSnapRequest.snap === snap) {
        setPollsDockedSnapRequest(null);
      }
      if (tabOverlaySnapRequest && tabOverlaySnapRequest === snap) {
        setTabOverlaySnapRequest(null);
      }
      if (snap === 'hidden') {
        if (rootOverlay === 'search') {
          const isGestureHidden = meta?.source === 'gesture';
          if (!isGestureHidden) {
            return;
          }
          if (
            dockedPollsRestoreInFlightRef.current ||
            pollsDockedSnapRequest?.snap === 'collapsed'
          ) {
            return;
          }
          if (Date.now() < ignoreDockedPollsHiddenUntilMsRef.current) {
            return;
          }
          dockedPollsRestoreInFlightRef.current = false;
          setIsDockedPollsDismissed(true);
          return;
        }
        setTabOverlaySnapRequest(null);
        // Immediately switch to search when polls overlay is dismissed (unless we're switching tabs).
        if (rootOverlay === 'polls' && !overlaySwitchInFlightRef.current) {
          unstable_batchedUpdates(() => {
            switchToSearchRootWithDockedPolls();
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
      setIsDockedPollsDismissed,
      setPollsSheetSnap,
      setPollsDockedSnapRequest,
      setTabOverlaySnapRequest,
      switchToSearchRootWithDockedPolls,
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
  const handleBookmarksSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setBookmarksSheetSnap(snap);
    },
    [setBookmarksSheetSnap]
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
          switchToSearchRootWithDockedPolls();
        });
      }
    },
    [
      overlaySwitchInFlightRef,
      rootOverlay,
      tabOverlaySnapRequest,
      switchToSearchRootWithDockedPolls,
    ]
  );
  const handleProfileSnapStart = React.useCallback(
    (snap: OverlaySheetSnap) => {
      setProfileSheetSnap(snap);
    },
    [setProfileSheetSnap]
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
          switchToSearchRootWithDockedPolls();
        });
      }
    },
    [
      overlaySwitchInFlightRef,
      rootOverlay,
      tabOverlaySnapRequest,
      switchToSearchRootWithDockedPolls,
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
  const pendingPriceRangeRef = React.useRef<PriceRangeTuple>(pendingPriceRange);
  const pendingScoreModeRef = React.useRef<typeof scoreMode>(pendingScoreMode);
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
  const [priceSummaryPillWidth, setPriceSummaryPillWidth] = React.useState<number | null>(null);
  const priceSliderLowValue = useSharedValue(pendingPriceRange[0]);
  const priceSliderHighValue = useSharedValue(pendingPriceRange[1]);
  const priceSheetSummaryReelPosition = useDerivedValue(() =>
    getPriceSummaryReelIndexFromBoundaries(priceSliderLowValue.value, priceSliderHighValue.value)
  );
  const priceSheetSummaryReelNearestIndex = useDerivedValue(() =>
    Math.round(priceSheetSummaryReelPosition.value)
  );
  const priceSheetSummaryNeighborVisibility = useDerivedValue(() => {
    const centerOffset = Math.abs(
      priceSheetSummaryReelPosition.value - priceSheetSummaryReelNearestIndex.value
    );
    if (centerOffset < 0.001) {
      return 0;
    }
    return interpolate(centerOffset, [0, 0.03, 0.2], [0, 0.3, 1], Extrapolation.CLAMP);
  });
  const wasPriceSelectorVisibleRef = React.useRef(false);

  const handlePriceSliderCommit = React.useCallback((range: PriceRangeTuple) => {
    const applyUpdate = () => {
      setPendingPriceRange((prev) => (arePriceRangesEqual(prev, range) ? prev : range));
    };
    if (typeof React.startTransition === 'function') {
      React.startTransition(applyUpdate);
    } else {
      applyUpdate();
    }
  }, []);

  React.useEffect(() => {
    if (isPriceSelectorVisible && !wasPriceSelectorVisibleRef.current) {
      priceSliderLowValue.value = pendingPriceRange[0];
      priceSliderHighValue.value = pendingPriceRange[1];
    }
    wasPriceSelectorVisibleRef.current = isPriceSelectorVisible;
  }, [isPriceSelectorVisible, pendingPriceRange, priceSliderHighValue, priceSliderLowValue]);
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

  React.useEffect(() => {
    pendingPriceRangeRef.current = pendingPriceRange;
  }, [pendingPriceRange]);

  React.useEffect(() => {
    pendingScoreModeRef.current = pendingScoreMode;
  }, [pendingScoreMode]);
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
  // Restaurant profile sheet should remain draggable even while the suggestion panel is
  // animating out (isSuggestionPanelVisible). We only suppress interaction while suggestions are
  // actively open.
  const shouldSuppressRestaurantOverlay = isRestaurantOverlayVisible && isSuggestionPanelActive;
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
      suggestionScrollOffset.value = 0;
    }
  }, [isSuggestionPanelVisible, shortcutContentFadeMode, suggestionScrollOffset]);
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
  const searchContainerContentBottom = React.useMemo(() => {
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
    resolvedSearchShortcutsFrame,
    searchContainerContentBottom,
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
  const missingRestaurantRankByIdRef = React.useRef<Set<string>>(new Set());
  const canonicalRestaurantRankById = React.useMemo(() => {
    const map = new Map<string, number>();
    restaurants.forEach((restaurant) => {
      if (
        typeof restaurant.rank === 'number' &&
        Number.isFinite(restaurant.rank) &&
        restaurant.rank >= 1
      ) {
        map.set(restaurant.restaurantId, restaurant.rank);
        return;
      }
      if (!missingRestaurantRankByIdRef.current.has(restaurant.restaurantId)) {
        missingRestaurantRankByIdRef.current.add(restaurant.restaurantId);
        logger.error('Restaurant missing canonical rank in search results', {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
          searchRequestId:
            results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? null,
        });
      }
    });
    return map;
  }, [restaurants, results?.metadata?.requestId, results?.metadata?.searchRequestId]);
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
  const resultsHydrationCandidate = resultsRequestKey;
  const storedResultsScrollOffset = useOverlayStore(
    (state) => state.overlayScrollOffsets.search ?? 0
  );
  const [markerRestaurants, setMarkerRestaurants] =
    React.useState<RestaurantResult[]>(EMPTY_RESTAURANTS);
  const [hydratedResultsKey, setHydratedResultsKey] = React.useState<string | null>(null);
  const hydratedResultsKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    hydratedResultsKeyRef.current = hydratedResultsKey;
  }, [hydratedResultsKey]);
  const setHydratedResultsKeySync = React.useCallback((next: string | null) => {
    hydratedResultsKeyRef.current = next;
    setHydratedResultsKey(next);
  }, []);
  const resultsHydrationKey =
    results == null ? null : resultsPage === 1 ? resultsHydrationCandidate : hydratedResultsKey;
  const needsResultsHydration =
    resultsHydrationKey != null &&
    resultsHydrationKey !== (hydratedResultsKeyRef.current ?? hydratedResultsKey);
  const shouldHydrateResultsForRender =
    needsResultsHydration &&
    activeOverlayKey === 'search' &&
    storedResultsScrollOffset <= 0.5 &&
    !hasUserScrolledResultsRef.current;
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
    const displayLocation = restaurant.displayLocation ?? null;
    const listLocations =
      Array.isArray(restaurant.locations) && restaurant.locations.length > 0
        ? restaurant.locations
        : [];

    const isValidMapLocation = (
      location: {
        latitude?: number | null;
        longitude?: number | null;
        googlePlaceId?: string | null;
      } | null
    ) => {
      if (
        !location ||
        typeof location.latitude !== 'number' ||
        !Number.isFinite(location.latitude) ||
        typeof location.longitude !== 'number' ||
        !Number.isFinite(location.longitude)
      ) {
        return false;
      }
      // Guardrail: don't render pins for unresolved placeholder locations.
      return typeof location.googlePlaceId === 'string' && location.googlePlaceId.length > 0;
    };

    const primaryLocation =
      (isValidMapLocation(displayLocation) ? displayLocation : null) ??
      listLocations.find((location) => isValidMapLocation(location)) ??
      null;
    const seen = new Set<string>();
    const resolved: Array<{
      locationId: string;
      latitude: number;
      longitude: number;
      googlePlaceId: string;
      isPrimary: boolean;
      locationIndex: number;
    }> = [];

    const addLocation = (
      location: {
        latitude?: number | null;
        longitude?: number | null;
        locationId?: string | null;
        googlePlaceId?: string | null;
      } | null,
      options: { isPrimary: boolean; locationIndex: number }
    ) => {
      if (!isValidMapLocation(location)) {
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
        latitude: location.latitude as number,
        longitude: location.longitude as number,
        googlePlaceId: location.googlePlaceId as string,
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

  type ResolvedRestaurantMapLocation = {
    locationId: string;
    latitude: number;
    longitude: number;
    googlePlaceId: string;
    isPrimary: boolean;
    locationIndex: number;
  };

  const resolveSearchViewportBounds = React.useCallback(
    (): MapBounds | null => lastSearchBoundsRef.current ?? latestBoundsRef.current ?? null,
    []
  );
  const isCoordinateWithinBounds = React.useCallback(
    (coordinate: Coordinate, bounds: MapBounds): boolean => {
      const minLat = Math.min(bounds.southWest.lat, bounds.northEast.lat);
      const maxLat = Math.max(bounds.southWest.lat, bounds.northEast.lat);
      const latWithinRange = coordinate.lat >= minLat && coordinate.lat <= maxLat;
      const minLng = bounds.southWest.lng;
      const maxLng = bounds.northEast.lng;
      const lngWithinRange =
        minLng <= maxLng
          ? coordinate.lng >= minLng && coordinate.lng <= maxLng
          : coordinate.lng >= minLng || coordinate.lng <= maxLng;
      return latWithinRange && lngWithinRange;
    },
    []
  );
  const resolveRestaurantLocationSelectionAnchor = React.useCallback((): Coordinate | null => {
    const bounds = resolveSearchViewportBounds();
    if (!bounds) {
      return null;
    }
    const currentUserLocation = userLocation ?? userLocationRef.current;
    if (currentUserLocation && isCoordinateWithinBounds(currentUserLocation, bounds)) {
      return currentUserLocation;
    }
    return getBoundsCenter(bounds);
  }, [isCoordinateWithinBounds, resolveSearchViewportBounds, userLocation]);

  const pickClosestLocationToCenter = React.useCallback(
    (
      locations: ResolvedRestaurantMapLocation[],
      center: Coordinate | null
    ): ResolvedRestaurantMapLocation | null => {
      if (!locations.length) {
        return null;
      }
      if (!center) {
        return locations.find((location) => location.isPrimary) ?? locations[0] ?? null;
      }

      let best = locations[0];
      let bestDistance = haversineDistanceMiles(center, {
        lat: best.latitude,
        lng: best.longitude,
      });
      for (let i = 1; i < locations.length; i += 1) {
        const candidate = locations[i];
        const candidateDistance = haversineDistanceMiles(center, {
          lat: candidate.latitude,
          lng: candidate.longitude,
        });
        if (candidateDistance < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
          continue;
        }
        if (candidateDistance === bestDistance && candidate.isPrimary && !best.isPrimary) {
          best = candidate;
        }
      }
      return best;
    },
    []
  );
  const pickPreferredRestaurantMapLocation = React.useCallback(
    (
      restaurant: RestaurantResult,
      anchor: Coordinate | null
    ): ResolvedRestaurantMapLocation | null => {
      const locations = resolveRestaurantMapLocations(restaurant);
      return pickClosestLocationToCenter(locations, anchor) ?? locations[0] ?? null;
    },
    [pickClosestLocationToCenter, resolveRestaurantMapLocations]
  );

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
    const selectedRestaurantId = overlaySelectedRestaurantId;
    const locationSelectionAnchor = resolveRestaurantLocationSelectionAnchor();

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
        const pinColorGlobal = getQualityColorFromScore(dish.qualityScore);
        const pinColorLocal = getQualityColorFromScore(dish.displayScore);
        const pinColor = scoreMode === 'coverage_display' ? pinColorLocal : pinColorGlobal;
        const contextualScore =
          scoreMode === 'coverage_display'
            ? typeof dish.displayScore === 'number' && Number.isFinite(dish.displayScore)
              ? dish.displayScore
              : 0
            : dish.qualityScore;
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
            contextualScore,
            rank,
            pinColor,
            pinColorGlobal,
            pinColorLocal,
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
      markerRestaurants.forEach((restaurant) => {
        if (restaurantOnlyId && restaurant.restaurantId !== restaurantOnlyId) {
          return;
        }
        const rank = canonicalRestaurantRankById.get(restaurant.restaurantId);
        if (typeof rank !== 'number') {
          return;
        }
        const pinColorGlobal = getQualityColorFromScore(restaurant.restaurantQualityScore);
        const pinColorLocal = getQualityColorFromScore(restaurant.displayScore);
        const pinColor = scoreMode === 'coverage_display' ? pinColorLocal : pinColorGlobal;
        const locations = resolveRestaurantMapLocations(restaurant);
        const shouldRenderAllLocations =
          selectedRestaurantId !== null && restaurant.restaurantId === selectedRestaurantId;
        const closestLocation = shouldRenderAllLocations
          ? null
          : pickPreferredRestaurantMapLocation(restaurant, locationSelectionAnchor);
        const locationsToRender = shouldRenderAllLocations
          ? locations
          : closestLocation
          ? [closestLocation]
          : [];

        locationsToRender.forEach((location) => {
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
              pinColorGlobal,
              pinColorLocal,
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
    scoreMode,
    resolveRestaurantMapLocations,
    resolveRestaurantLocationSelectionAnchor,
    pickPreferredRestaurantMapLocation,
    canonicalRestaurantRankById,
    restaurantOnlyId,
    overlaySelectedRestaurantId,
    shouldLogSearchComputes,
  ]);
  const markerCatalogEntries = markerCatalog.catalog;
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

  const markerCandidatesRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  React.useEffect(() => {
    markerCandidatesRef.current = visibleMarkerCandidates.map((entry) => entry.feature);
  }, [visibleMarkerCandidates]);

  const shortcutCoverageRankedRef = React.useRef<
    Array<Feature<Point, RestaurantFeatureProperties>>
  >([]);
  const [lodPinnedMarkerMeta, setLodPinnedMarkerMeta] = React.useState<
    Array<{ markerKey: string; lodZ: number }>
  >([]);
  const lodPinnedMarkersRef = React.useRef<Array<Feature<Point, RestaurantFeatureProperties>>>([]);
  const lodPinnedKeyRef = React.useRef<string>('');
  const lodPinProposedPromoteSinceByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const lodPinProposedDemoteSinceByMarkerKeyRef = React.useRef<Map<string, number>>(new Map());
  const lodPinnedResetKeyRef = React.useRef<string>('');
  const lodContextRef = React.useRef({
    searchMode,
    activeTab,
    selectedRestaurantId,
  });
  React.useEffect(() => {
    lodContextRef.current = { searchMode, activeTab, selectedRestaurantId };
  }, [activeTab, searchMode, selectedRestaurantId]);
  React.useEffect(() => {
    const resetKey = `${searchMode ?? 'none'}::${activeTab}::${
      results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? 'no-request'
    }::${scoreMode}`;
    if (lodPinnedResetKeyRef.current === resetKey) {
      return;
    }
    lodPinnedResetKeyRef.current = resetKey;
    // Force the next LOD refresh to re-emit pinned features even if the set of pinned keys is
    // unchanged (e.g. scoreMode toggles can change pin colors without changing membership).
    lodPinnedKeyRef.current = '';
    lodPinProposedPromoteSinceByMarkerKeyRef.current.clear();
    lodPinProposedDemoteSinceByMarkerKeyRef.current.clear();
  }, [
    activeTab,
    results?.metadata?.requestId,
    results?.metadata?.searchRequestId,
    scoreMode,
    searchMode,
  ]);

  const updateLodPinnedMarkers = React.useCallback(
    (bounds: MapBounds | null) => {
      const start = shouldLogSearchComputes ? getPerfNow() : 0;
      if (!bounds) {
        if (lodPinnedKeyRef.current !== '') {
          lodPinnedKeyRef.current = '';
          lodPinnedMarkersRef.current = [];
          setLodPinnedMarkerMeta([]);
        }
        return;
      }

      const context = lodContextRef.current;
      const rankedCandidates =
        context.searchMode === 'shortcut' && shortcutCoverageRankedRef.current.length
          ? shortcutCoverageRankedRef.current
          : markerCandidatesRef.current;
      const selectedId = context.selectedRestaurantId;
      const selectedRestaurantCandidates = selectedId
        ? [...markerCandidatesRef.current, ...rankedCandidates]
        : rankedCandidates;

      if (!rankedCandidates.length && !selectedRestaurantCandidates.length) {
        if (lodPinnedKeyRef.current !== '') {
          lodPinnedKeyRef.current = '';
          lodPinnedMarkersRef.current = [];
          setLodPinnedMarkerMeta([]);
        }
        return;
      }

      const stableMs = mapGestureActiveRef.current
        ? LOD_PIN_TOGGLE_STABLE_MS_MOVING
        : LOD_PIN_TOGGLE_STABLE_MS_IDLE;
      const offscreenStableMs = mapGestureActiveRef.current
        ? LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING
        : 0;
      const now = Date.now();
      const nextModel = buildMarkerRenderModel({
        bounds,
        rankedCandidates,
        selectedRestaurantCandidates,
        currentPinnedMarkers: lodPinnedMarkersRef.current,
        selectedRestaurantId: selectedId,
        buildMarkerKey,
        maxPins: MAX_FULL_PINS,
        visibleCandidateBuffer: LOD_VISIBLE_CANDIDATE_BUFFER,
        stableMs,
        offscreenStableMs,
        nowMs: now,
        proposedPromoteSinceByMarkerKey: lodPinProposedPromoteSinceByMarkerKeyRef.current,
        proposedDemoteSinceByMarkerKey: lodPinProposedDemoteSinceByMarkerKeyRef.current,
      });
      lodPinProposedPromoteSinceByMarkerKeyRef.current =
        nextModel.nextProposedPromoteSinceByMarkerKey;
      lodPinProposedDemoteSinceByMarkerKeyRef.current =
        nextModel.nextProposedDemoteSinceByMarkerKey;

      const nextKey = nextModel.nextPinnedKey;
      if (nextKey === lodPinnedKeyRef.current) {
        return;
      }
      lodPinnedKeyRef.current = nextKey;
      lodPinnedMarkersRef.current = nextModel.nextPinnedMarkers;
      setLodPinnedMarkerMeta(nextModel.nextPinnedMeta);

      if (shouldLogSearchComputes) {
        logSearchCompute(
          `lodPinnedMarkers pins=${nextModel.nextPinnedMarkers.length}`,
          getPerfNow() - start
        );
      }
    },
    [buildMarkerKey, getPerfNow, logSearchCompute, shouldLogSearchComputes]
  );

  React.useEffect(() => {
    updateLodPinnedMarkers(latestBoundsRef.current);
  }, [
    activeTab,
    results?.metadata?.searchRequestId,
    searchMode,
    selectedRestaurantId,
    scoreMode,
    updateLodPinnedMarkers,
    visibleMarkerCandidates.length,
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

  const sortedRestaurantMarkers = React.useMemo(() => {
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

  const shortcutCoverageSnapshotByRequestIdRef = React.useRef<
    Map<
      string,
      {
        bounds: MapBounds;
        entities: StructuredSearchRequest['entities'];
      }
    >
  >(new Map());
  const handleShortcutSearchCoverageSnapshot = React.useCallback(
    (snapshot: {
      searchRequestId: string;
      bounds: MapBounds | null;
      entities: StructuredSearchRequest['entities'];
    }) => {
      if (!snapshot.bounds) {
        return;
      }
      shortcutCoverageSnapshotByRequestIdRef.current.set(snapshot.searchRequestId, {
        bounds: snapshot.bounds,
        entities: snapshot.entities,
      });
    },
    []
  );

  const shortcutCoverageFetchKeyRef = React.useRef<string | null>(null);
  const shortcutCoverageFetchSeqRef = React.useRef(0);
  const [isShortcutCoverageLoading, setIsShortcutCoverageLoading] = React.useState(false);
  const [shortcutCoverageDotFeatures, setShortcutCoverageDotFeatures] =
    React.useState<FeatureCollection<Point, RestaurantFeatureProperties> | null>(null);
  React.useEffect(() => {
    if (searchMode !== 'shortcut') {
      shortcutCoverageFetchKeyRef.current = null;
      shortcutCoverageSnapshotByRequestIdRef.current.clear();
      setShortcutCoverageDotFeatures(null);
      shortcutCoverageRankedRef.current = [];
      setIsShortcutCoverageLoading(false);
      return;
    }
    const requestId = results?.metadata?.searchRequestId ?? null;
    if (!requestId) {
      setShortcutCoverageDotFeatures(null);
      shortcutCoverageRankedRef.current = [];
      setIsShortcutCoverageLoading(false);
      return;
    }
    const snapshot = shortcutCoverageSnapshotByRequestIdRef.current.get(requestId) ?? null;
    const boundsSnapshot = snapshot?.bounds ?? null;
    const entitiesSnapshot = snapshot?.entities ?? undefined;
    if (!boundsSnapshot) {
      setShortcutCoverageDotFeatures(null);
      shortcutCoverageRankedRef.current = [];
      setIsShortcutCoverageLoading(false);
      return;
    }
    const includeTopDish = activeTab === 'dishes';
    const boundsKey = boundsSnapshot
      ? `${boundsSnapshot.northEast.lat.toFixed(4)},${boundsSnapshot.northEast.lng.toFixed(
          4
        )},${boundsSnapshot.southWest.lat.toFixed(4)},${boundsSnapshot.southWest.lng.toFixed(4)}`
      : 'no-bounds';
    const fetchKey = `${requestId}::${boundsKey}::${
      includeTopDish ? 'dishes' : 'restaurants'
    }::${scoreMode}`;
    if (shortcutCoverageFetchKeyRef.current === fetchKey) {
      return;
    }
    shortcutCoverageFetchKeyRef.current = fetchKey;

    const fetchSeq = ++shortcutCoverageFetchSeqRef.current;
    setIsShortcutCoverageLoading(true);
    let cancelled = false;
    void searchService
      .shortcutCoverage({
        entities: entitiesSnapshot,
        bounds: boundsSnapshot,
        includeTopDish,
        scoreMode,
      })
      .then((collection) => {
        if (cancelled || fetchSeq !== shortcutCoverageFetchSeqRef.current) {
          return;
        }
        setIsShortcutCoverageLoading(false);
        const features = (collection?.features ?? [])
          .map((feature) => {
            const properties =
              feature?.properties && typeof feature.properties === 'object'
                ? (feature.properties as Record<string, unknown>)
                : {};
            const restaurantId = (properties.restaurantId as string) ?? '';
            const restaurantName = (properties.restaurantName as string) ?? '';
            if (!restaurantId || !restaurantName) {
              return null;
            }
            const rank = properties['rank'];
            if (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 1) {
              logger.error('Shortcut coverage feature missing canonical rank', {
                restaurantId,
                restaurantName,
                searchRequestId: requestId,
              });
              return null;
            }
            const contextualScore =
              typeof properties['contextualScore'] === 'number'
                ? (properties['contextualScore'] as number)
                : 0;
            const restaurantQualityScore =
              typeof properties['restaurantQualityScore'] === 'number'
                ? (properties['restaurantQualityScore'] as number)
                : null;
            const displayScore =
              typeof properties['displayScore'] === 'number'
                ? (properties['displayScore'] as number)
                : null;
            const displayPercentile =
              typeof properties['displayPercentile'] === 'number'
                ? (properties['displayPercentile'] as number)
                : null;
            const topDishDisplayPercentile =
              includeTopDish && typeof properties['topDishDisplayPercentile'] === 'number'
                ? (properties['topDishDisplayPercentile'] as number)
                : null;
            const topDishDisplayScore =
              includeTopDish && typeof properties['topDishDisplayScore'] === 'number'
                ? (properties['topDishDisplayScore'] as number)
                : null;
            const scoreForColor =
              scoreMode === 'coverage_display'
                ? includeTopDish
                  ? topDishDisplayScore
                  : displayScore
                : includeTopDish
                ? contextualScore
                : typeof restaurantQualityScore === 'number'
                ? restaurantQualityScore
                : null;
            const globalScoreForColor = includeTopDish
              ? contextualScore
              : typeof restaurantQualityScore === 'number'
              ? restaurantQualityScore
              : null;
            const localScoreForColor = includeTopDish ? topDishDisplayScore : displayScore;
            const pinColorGlobal = getQualityColorFromScore(globalScoreForColor);
            const pinColorLocal = getQualityColorFromScore(localScoreForColor);
            const pinColor = getQualityColorFromScore(scoreForColor);
            const isDishPin = includeTopDish ? true : false;
            const dishName =
              includeTopDish && typeof properties['dishName'] === 'string'
                ? (properties['dishName'] as string)
                : undefined;
            const connectionId =
              includeTopDish && typeof properties['connectionId'] === 'string'
                ? (properties['connectionId'] as string)
                : undefined;
            return {
              ...feature,
              id: feature.id ?? restaurantId,
              properties: {
                restaurantId,
                restaurantName,
                contextualScore,
                rank,
                displayScore,
                displayPercentile,
                restaurantQualityScore:
                  typeof restaurantQualityScore === 'number' ? restaurantQualityScore : null,
                pinColor,
                pinColorGlobal,
                pinColorLocal,
                ...(isDishPin
                  ? {
                      isDishPin: true,
                      dishName,
                      connectionId,
                      topDishDisplayPercentile,
                      topDishDisplayScore,
                    }
                  : null),
              },
            } as Feature<Point, RestaurantFeatureProperties>;
          })
          .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;

        const next: FeatureCollection<Point, RestaurantFeatureProperties> = {
          type: 'FeatureCollection',
          features,
        };
        setShortcutCoverageDotFeatures(next);
      })
      .catch((err) => {
        if (cancelled || fetchSeq !== shortcutCoverageFetchSeqRef.current) {
          return;
        }
        setIsShortcutCoverageLoading(false);
        logger.warn('Shortcut coverage dot fetch failed', {
          message: err instanceof Error ? err.message : 'unknown error',
          requestId,
        });
        setShortcutCoverageDotFeatures(null);
        shortcutCoverageRankedRef.current = [];
      });
    return () => {
      cancelled = true;
      if (fetchSeq === shortcutCoverageFetchSeqRef.current) {
        setIsShortcutCoverageLoading(false);
      }
    };
  }, [activeTab, results?.metadata?.searchRequestId, scoreMode, searchMode]);

  const projectShortcutFeatureToSelectedLocation = React.useCallback(
    (
      feature: Feature<Point, RestaurantFeatureProperties>,
      anchor: Coordinate | null
    ): Feature<Point, RestaurantFeatureProperties> => {
      const restaurantId = feature.properties.restaurantId;
      const restaurant = restaurantsById.get(restaurantId);
      if (!restaurant) {
        return feature;
      }
      const selectedLocation = pickPreferredRestaurantMapLocation(restaurant, anchor);
      if (!selectedLocation) {
        return feature;
      }
      const [currentLng, currentLat] = feature.geometry.coordinates;
      if (
        Math.abs(currentLng - selectedLocation.longitude) < 1e-6 &&
        Math.abs(currentLat - selectedLocation.latitude) < 1e-6
      ) {
        return feature;
      }
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: [selectedLocation.longitude, selectedLocation.latitude],
        },
      };
    },
    [pickPreferredRestaurantMapLocation, restaurantsById]
  );
  const shortcutCoverageAnchoredDotFeatures = React.useMemo<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(() => {
    const collection = shortcutCoverageDotFeatures;
    const features = collection?.features ?? [];
    if (!features.length) {
      return null;
    }
    const anchor = resolveRestaurantLocationSelectionAnchor();
    let hasCoordinateOverrides = false;
    const projectedFeatures = features.map((feature) => {
      const projectedFeature = projectShortcutFeatureToSelectedLocation(feature, anchor);
      if (projectedFeature !== feature) {
        hasCoordinateOverrides = true;
      }
      return projectedFeature;
    });
    if (!hasCoordinateOverrides) {
      return collection;
    }
    return {
      type: 'FeatureCollection',
      features: projectedFeatures,
    };
  }, [
    projectShortcutFeatureToSelectedLocation,
    resolveRestaurantLocationSelectionAnchor,
    shortcutCoverageDotFeatures,
  ]);
  const shortcutCoverageAnchoredRankedFeatures = React.useMemo(() => {
    const features = shortcutCoverageAnchoredDotFeatures?.features ?? [];
    return [...features].sort((left, right) => {
      const leftRank = left.properties.rank ?? 9999;
      const rightRank = right.properties.rank ?? 9999;
      const rankDiff = leftRank - rightRank;
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.properties.restaurantId.localeCompare(right.properties.restaurantId);
    });
  }, [shortcutCoverageAnchoredDotFeatures?.features]);
  React.useEffect(() => {
    shortcutCoverageRankedRef.current =
      searchMode === 'shortcut' ? shortcutCoverageAnchoredRankedFeatures : [];
    if (searchMode !== 'shortcut') {
      return;
    }
    lodPinnedKeyRef.current = '';
    updateLodPinnedMarkers(latestBoundsRef.current);
  }, [searchMode, shortcutCoverageAnchoredRankedFeatures, updateLodPinnedMarkers]);

  const dotRestaurantFeatures = React.useMemo<FeatureCollection<
    Point,
    RestaurantFeatureProperties
  > | null>(() => {
    if (searchMode === 'shortcut') {
      return shortcutCoverageAnchoredDotFeatures?.features?.length
        ? shortcutCoverageAnchoredDotFeatures
        : null;
    }
    const features = visibleMarkerCandidates.map((entry) => entry.feature);
    return features.length ? { type: 'FeatureCollection', features } : null;
  }, [searchMode, shortcutCoverageAnchoredDotFeatures, visibleMarkerCandidates]);
  const hasRenderableMarkerVisuals =
    sortedRestaurantMarkers.length > 0 || (dotRestaurantFeatures?.features?.length ?? 0) > 0;
  const hasAnySearchResults =
    (results?.dishes?.length ?? 0) > 0 || (results?.restaurants?.length ?? 0) > 0;
  const shouldHoldMapMarkerReveal =
    isVisualSyncPending &&
    hasAnySearchResults &&
    (isLoading || isShortcutCoverageLoading || !hasRenderableMarkerVisuals);
  const areSearchVisualsSettled = !isLoading && !isShortcutCoverageLoading;
  const shouldSignalMapVisualReady =
    isVisualSyncPending &&
    resultsVisualSyncCandidate != null &&
    (!hasAnySearchResults || areSearchVisualsSettled);
  const visibleSortedRestaurantMarkers = shouldHoldMapMarkerReveal
    ? EMPTY_MARKERS
    : sortedRestaurantMarkers;
  const visibleDotRestaurantFeatures = shouldHoldMapMarkerReveal ? null : dotRestaurantFeatures;
  const visibleRestaurantFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(
    () => ({
      type: 'FeatureCollection',
      features: visibleSortedRestaurantMarkers,
    }),
    [visibleSortedRestaurantMarkers]
  );
  const markersRenderKey = React.useMemo(() => {
    const requestId =
      results?.metadata?.searchRequestId ?? results?.metadata?.requestId ?? 'no-request';
    return `${requestId}::${searchMode ?? 'none'}::${activeTab}::${scoreMode}`;
  }, [
    activeTab,
    results?.metadata?.requestId,
    results?.metadata?.searchRequestId,
    searchMode,
    scoreMode,
  ]);

  const pinsRenderKey = React.useMemo(
    () => sortedRestaurantMarkers.map((feature) => buildMarkerKey(feature)).join('|'),
    [buildMarkerKey, sortedRestaurantMarkers]
  );
  const visibleMarkersRenderKey = `${markersRenderKey}::${
    shouldHoldMapMarkerReveal ? 'hold' : 'show'
  }`;
  const visiblePinsRenderKey = React.useMemo(
    () => `${shouldHoldMapMarkerReveal ? 'hold' : 'show'}::${pinsRenderKey}`,
    [pinsRenderKey, shouldHoldMapMarkerReveal]
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
      markVisualRequestReady(resultsVisualSyncCandidate);
      visualReadyFallbackTimeoutRef.current = null;
    }, RESULTS_VISUAL_READY_FALLBACK_MS);
  }, [
    areSearchVisualsSettled,
    markVisualRequestReady,
    resultsVisualSyncCandidate,
    shouldSignalMapVisualReady,
  ]);

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
      const nextRange = getRangeFromLevels(priceLevels);
      setPendingPriceRange((prev) => (arePriceRangesEqual(prev, nextRange) ? prev : nextRange));
    }
  }, [isPriceSelectorVisible, priceLevels]);

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

  React.useEffect(() => {
    if (!isRankSelectorVisible) {
      setPendingScoreMode(scoreMode);
    }
  }, [isRankSelectorVisible, scoreMode]);

  const togglePriceSelector = React.useCallback(() => {
    setIsRankSelectorVisible(false);
    if (isPriceSelectorVisible) {
      commitPriceSelection();
      return;
    }
    setIsPriceSelectorVisible(true);
  }, [isPriceSelectorVisible, commitPriceSelection]);

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
  });

  const isShortcutPerfHarnessScenario =
    perfHarnessConfig.enabled && perfHarnessConfig.scenario === 'search_shortcut_loop';
  const shortcutHarnessRunId = perfHarnessConfig.runId ?? 'shortcut-loop-no-run-id';
  const emitSearchPerfEvent = React.useCallback(
    (
      channel: 'Harness' | 'JsFrameSampler' | 'UiFrameSampler',
      payload: Record<string, unknown>
    ) => {
      // eslint-disable-next-line no-console
      console.log(`[SearchPerf][${channel}] ${JSON.stringify(payload)}`);
    },
    []
  );
  const runBestHereRef = React.useRef(runBestHere);
  React.useEffect(() => {
    runBestHereRef.current = runBestHere;
  }, [runBestHere]);
  const shortcutPerfTraceRef = React.useRef<{
    sessionId: number | null;
    sessionStartedAtMs: number | null;
    stage: string | null;
    stageStartedAtMs: number | null;
  }>({
    sessionId: null,
    sessionStartedAtMs: null,
    stage: null,
    stageStartedAtMs: null,
  });
  const shortcutHarnessLifecycleRef = React.useRef<{
    bootstrapped: boolean;
    loopCompleteEmitted: boolean;
    runNumber: number;
    completedRuns: number;
    runStartedAtMs: number;
    settleCandidateAtMs: number;
    settleCandidateRequestKey: string | null;
    settleCandidateVisibleCount: number;
    settleCandidateVisiblePinCount: number;
    settleCandidateVisibleDotCount: number;
    observedLoading: boolean;
    inProgress: boolean;
    launchHandle: ReturnType<typeof setTimeout> | null;
    cooldownHandle: ReturnType<typeof setTimeout> | null;
    runTimeoutHandle: ReturnType<typeof setTimeout> | null;
    settleCheckHandle: ReturnType<typeof setTimeout> | null;
  }>({
    bootstrapped: false,
    loopCompleteEmitted: false,
    runNumber: 0,
    completedRuns: 0,
    runStartedAtMs: 0,
    settleCandidateAtMs: 0,
    settleCandidateRequestKey: null,
    settleCandidateVisibleCount: 0,
    settleCandidateVisiblePinCount: 0,
    settleCandidateVisibleDotCount: 0,
    observedLoading: false,
    inProgress: false,
    launchHandle: null,
    cooldownHandle: null,
    runTimeoutHandle: null,
    settleCheckHandle: null,
  });
  const shortcutHarnessSnapshotRef = React.useRef<{
    isSearchLoading: boolean;
    isVisualSyncPending: boolean;
    finalStage: string | null;
    finalVisibleCount: number;
    finalSectionedCount: number;
    finalVisiblePinCount: number;
    finalVisibleDotCount: number;
    finalRequestKey: string | null;
  }>({
    isSearchLoading,
    isVisualSyncPending,
    finalStage: null,
    finalVisibleCount: 0,
    finalSectionedCount: 0,
    finalVisiblePinCount: 0,
    finalVisibleDotCount: 0,
    finalRequestKey: resultsRequestKey,
  });
  const shortcutDerivedStage = React.useMemo(() => {
    if (searchMode !== 'shortcut') {
      return null;
    }
    if (shouldHoldMapMarkerReveal) {
      return 'marker_reveal_state';
    }
    if (isVisualSyncPending) {
      return 'visual_sync_state';
    }
    if (shouldHydrateResultsForRender) {
      return 'results_hydration_commit';
    }
    if (isShortcutCoverageLoading) {
      return 'coverage_loading';
    }
    if (isLoading) {
      return 'results_list_materialization';
    }
    if (results) {
      return 'results_list_ramp';
    }
    return null;
  }, [
    isLoading,
    isShortcutCoverageLoading,
    isVisualSyncPending,
    results,
    searchMode,
    shouldHoldMapMarkerReveal,
    shouldHydrateResultsForRender,
  ]);
  React.useEffect(() => {
    const trace = shortcutPerfTraceRef.current;
    if (trace.stage === shortcutDerivedStage) {
      return;
    }
    trace.stage = shortcutDerivedStage;
    trace.stageStartedAtMs = shortcutDerivedStage ? getPerfNow() : null;
  }, [getPerfNow, shortcutDerivedStage]);
  React.useEffect(() => {
    const finalVisibleCount = (results?.dishes?.length ?? 0) + (results?.restaurants?.length ?? 0);
    shortcutHarnessSnapshotRef.current = {
      isSearchLoading,
      isVisualSyncPending,
      finalStage: shortcutPerfTraceRef.current.stage,
      finalVisibleCount,
      finalSectionedCount: finalVisibleCount,
      finalVisiblePinCount: visibleSortedRestaurantMarkers.length,
      finalVisibleDotCount: visibleDotRestaurantFeatures?.features?.length ?? 0,
      finalRequestKey: resultsRequestKey,
    };
  }, [
    isSearchLoading,
    isVisualSyncPending,
    results?.dishes?.length,
    results?.restaurants?.length,
    resultsRequestKey,
    visibleDotRestaurantFeatures?.features?.length,
    visibleSortedRestaurantMarkers.length,
  ]);
  const completeShortcutHarnessRunRef = React.useRef<(settleStatus: string) => void>(
    () => undefined
  );
  const startShortcutHarnessRun = React.useCallback(
    (runNumber: number) => {
      if (!isShortcutPerfHarnessScenario) {
        return;
      }
      const lifecycle = shortcutHarnessLifecycleRef.current;
      if (lifecycle.loopCompleteEmitted) {
        return;
      }
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
        lifecycle.runTimeoutHandle = null;
      }
      if (lifecycle.settleCheckHandle) {
        clearTimeout(lifecycle.settleCheckHandle);
        lifecycle.settleCheckHandle = null;
      }
      const now = getPerfNow();
      lifecycle.runNumber = runNumber;
      lifecycle.runStartedAtMs = now;
      lifecycle.settleCandidateAtMs = 0;
      lifecycle.settleCandidateRequestKey = null;
      lifecycle.settleCandidateVisibleCount = 0;
      lifecycle.settleCandidateVisiblePinCount = 0;
      lifecycle.settleCandidateVisibleDotCount = 0;
      lifecycle.observedLoading = false;
      lifecycle.inProgress = true;
      const trace = shortcutPerfTraceRef.current;
      trace.sessionId = runNumber;
      trace.sessionStartedAtMs = now;
      trace.stage = 'submit_intent';
      trace.stageStartedAtMs = now;
      emitSearchPerfEvent('Harness', {
        event: 'shortcut_loop_run_start',
        harnessRunId: shortcutHarnessRunId,
        nowMs: roundPerfValue(now),
        runNumber,
        totalRuns: perfHarnessConfig.runs,
      });
      lifecycle.runTimeoutHandle = setTimeout(() => {
        completeShortcutHarnessRunRef.current('timeout');
      }, SHORTCUT_HARNESS_RUN_TIMEOUT_MS);
      if (scoreMode !== perfHarnessConfig.shortcutLoop.scoreMode) {
        setPreferredScoreMode(perfHarnessConfig.shortcutLoop.scoreMode);
      }
      void runBestHereRef
        .current(
          perfHarnessConfig.shortcutLoop.targetTab,
          perfHarnessConfig.shortcutLoop.label,
          {
            preserveSheetState: perfHarnessConfig.shortcutLoop.preserveSheetState,
            transitionFromDockedPolls: perfHarnessConfig.shortcutLoop.transitionFromDockedPolls,
            scoreMode: perfHarnessConfig.shortcutLoop.scoreMode,
          }
        )
        .catch((error) => {
          emitSearchPerfEvent('Harness', {
            event: 'shortcut_loop_run_error',
            harnessRunId: shortcutHarnessRunId,
            nowMs: roundPerfValue(getPerfNow()),
            runNumber,
            message: error instanceof Error ? error.message : 'unknown error',
          });
        });
    },
    [
      emitSearchPerfEvent,
      getPerfNow,
      isShortcutPerfHarnessScenario,
      runBestHereRef,
      scoreMode,
      setPreferredScoreMode,
      shortcutHarnessRunId,
    ]
  );
  const completeShortcutHarnessRun = React.useCallback(
    (settleStatus: string) => {
      const lifecycle = shortcutHarnessLifecycleRef.current;
      if (!lifecycle.inProgress) {
        return;
      }
      lifecycle.inProgress = false;
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
        lifecycle.runTimeoutHandle = null;
      }
      if (lifecycle.settleCheckHandle) {
        clearTimeout(lifecycle.settleCheckHandle);
        lifecycle.settleCheckHandle = null;
      }
      const trace = shortcutPerfTraceRef.current;
      trace.sessionId = null;
      trace.sessionStartedAtMs = null;
      trace.stage = null;
      trace.stageStartedAtMs = null;
      const now = getPerfNow();
      const snapshot = shortcutHarnessSnapshotRef.current;
      const runNumber = lifecycle.runNumber;
      const durationMs = Math.max(0, now - lifecycle.runStartedAtMs);
      lifecycle.completedRuns = runNumber;
      lifecycle.settleCandidateAtMs = 0;
      lifecycle.settleCandidateRequestKey = null;
      lifecycle.settleCandidateVisibleCount = 0;
      lifecycle.settleCandidateVisiblePinCount = 0;
      lifecycle.settleCandidateVisibleDotCount = 0;
      emitSearchPerfEvent('Harness', {
        event: 'shortcut_loop_run_complete',
        harnessRunId: shortcutHarnessRunId,
        nowMs: roundPerfValue(now),
        runNumber,
        durationMs: roundPerfValue(durationMs),
        settleStatus,
        settleWaitMs: roundPerfValue(durationMs),
        finalStage: snapshot.finalStage,
        finalVisualSyncPending: snapshot.isVisualSyncPending,
        finalVisibleCount: snapshot.finalVisibleCount,
        finalSectionedCount: snapshot.finalSectionedCount,
        finalVisiblePinCount: snapshot.finalVisiblePinCount,
        finalVisibleDotCount: snapshot.finalVisibleDotCount,
        finalRequestKey: snapshot.finalRequestKey,
      });
      if (lifecycle.completedRuns >= perfHarnessConfig.runs) {
        if (!lifecycle.loopCompleteEmitted) {
          lifecycle.loopCompleteEmitted = true;
          emitSearchPerfEvent('Harness', {
            event: 'shortcut_loop_complete',
            harnessRunId: shortcutHarnessRunId,
            nowMs: roundPerfValue(now),
            completedRuns: lifecycle.completedRuns,
          });
        }
        return;
      }
      if (lifecycle.cooldownHandle) {
        clearTimeout(lifecycle.cooldownHandle);
      }
      lifecycle.cooldownHandle = setTimeout(() => {
        startShortcutHarnessRun(lifecycle.completedRuns + 1);
      }, perfHarnessConfig.cooldownMs);
    },
    [emitSearchPerfEvent, getPerfNow, shortcutHarnessRunId, startShortcutHarnessRun]
  );
  completeShortcutHarnessRunRef.current = completeShortcutHarnessRun;
  React.useEffect(() => {
    if (!isShortcutPerfHarnessScenario) {
      return;
    }
    const lifecycle = shortcutHarnessLifecycleRef.current;
    if (!lifecycle.inProgress) {
      return;
    }
    const clearSettleCheckHandle = () => {
      if (lifecycle.settleCheckHandle) {
        clearTimeout(lifecycle.settleCheckHandle);
        lifecycle.settleCheckHandle = null;
      }
    };
    const resetSettleCandidate = () => {
      clearSettleCheckHandle();
      lifecycle.settleCandidateAtMs = 0;
      lifecycle.settleCandidateRequestKey = null;
      lifecycle.settleCandidateVisibleCount = 0;
      lifecycle.settleCandidateVisiblePinCount = 0;
      lifecycle.settleCandidateVisibleDotCount = 0;
    };
    const scheduleSettleCheck = () => {
      clearSettleCheckHandle();
      lifecycle.settleCheckHandle = setTimeout(() => {
        lifecycle.settleCheckHandle = null;
        if (!lifecycle.inProgress || lifecycle.settleCandidateAtMs <= 0) {
          return;
        }
        const now = getPerfNow();
        if (now - lifecycle.settleCandidateAtMs < SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS) {
          scheduleSettleCheck();
          return;
        }
        completeShortcutHarnessRunRef.current('settled');
      }, SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS);
    };
    if (isSearchLoading) {
      lifecycle.observedLoading = true;
      resetSettleCandidate();
      return;
    }
    if (!lifecycle.observedLoading || searchMode !== 'shortcut') {
      resetSettleCandidate();
      return;
    }
    if (isVisualSyncPending || shouldHoldMapMarkerReveal || shouldHydrateResultsForRender) {
      resetSettleCandidate();
      return;
    }
    if (shortcutPerfTraceRef.current.stage !== 'results_list_ramp') {
      resetSettleCandidate();
      return;
    }
    const interactionState = searchInteractionRef.current;
    if (interactionState.isInteracting || isLoadingMore) {
      resetSettleCandidate();
      return;
    }
    const snapshot = shortcutHarnessSnapshotRef.current;
    if (!snapshot.finalRequestKey) {
      resetSettleCandidate();
      return;
    }
    const now = getPerfNow();
    if (lifecycle.settleCandidateAtMs <= 0) {
      lifecycle.settleCandidateAtMs = now;
      lifecycle.settleCandidateRequestKey = snapshot.finalRequestKey;
      lifecycle.settleCandidateVisibleCount = snapshot.finalVisibleCount;
      lifecycle.settleCandidateVisiblePinCount = snapshot.finalVisiblePinCount;
      lifecycle.settleCandidateVisibleDotCount = snapshot.finalVisibleDotCount;
      scheduleSettleCheck();
      return;
    }
    if (
      lifecycle.settleCandidateRequestKey !== snapshot.finalRequestKey ||
      lifecycle.settleCandidateVisibleCount !== snapshot.finalVisibleCount ||
      lifecycle.settleCandidateVisiblePinCount !== snapshot.finalVisiblePinCount ||
      lifecycle.settleCandidateVisibleDotCount !== snapshot.finalVisibleDotCount
    ) {
      lifecycle.settleCandidateAtMs = now;
      lifecycle.settleCandidateRequestKey = snapshot.finalRequestKey;
      lifecycle.settleCandidateVisibleCount = snapshot.finalVisibleCount;
      lifecycle.settleCandidateVisiblePinCount = snapshot.finalVisiblePinCount;
      lifecycle.settleCandidateVisibleDotCount = snapshot.finalVisibleDotCount;
      scheduleSettleCheck();
      return;
    }
    if (now - lifecycle.settleCandidateAtMs < SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS) {
      scheduleSettleCheck();
      return;
    }
    clearSettleCheckHandle();
    completeShortcutHarnessRunRef.current('settled');
  }, [
    getPerfNow,
    isLoadingMore,
    isSearchLoading,
    isShortcutPerfHarnessScenario,
    isVisualSyncPending,
    searchMode,
    shouldHoldMapMarkerReveal,
    shouldHydrateResultsForRender,
  ]);
  React.useEffect(() => {
    if (!isShortcutPerfHarnessScenario || !isSearchOverlay || !isInitialCameraReady) {
      return;
    }
    const lifecycle = shortcutHarnessLifecycleRef.current;
    if (lifecycle.bootstrapped || lifecycle.loopCompleteEmitted) {
      return;
    }
    lifecycle.bootstrapped = true;
    lifecycle.runNumber = 0;
    lifecycle.completedRuns = 0;
    lifecycle.settleCandidateAtMs = 0;
    lifecycle.settleCandidateRequestKey = null;
    lifecycle.settleCandidateVisibleCount = 0;
    lifecycle.settleCandidateVisiblePinCount = 0;
    lifecycle.settleCandidateVisibleDotCount = 0;
    lifecycle.observedLoading = false;
    lifecycle.inProgress = false;
    const now = getPerfNow();
    emitSearchPerfEvent('Harness', {
      event: 'shortcut_loop_start',
      harnessRunId: shortcutHarnessRunId,
      nowMs: roundPerfValue(now),
      scenario: perfHarnessConfig.scenario,
      runs: perfHarnessConfig.runs,
      startDelayMs: perfHarnessConfig.startDelayMs,
      cooldownMs: perfHarnessConfig.cooldownMs,
      signature: perfHarnessConfig.signature,
    });
    lifecycle.launchHandle = setTimeout(() => {
      startShortcutHarnessRun(1);
    }, perfHarnessConfig.startDelayMs);
    return () => {
      if (lifecycle.launchHandle) {
        clearTimeout(lifecycle.launchHandle);
        lifecycle.launchHandle = null;
      }
      if (lifecycle.cooldownHandle) {
        clearTimeout(lifecycle.cooldownHandle);
        lifecycle.cooldownHandle = null;
      }
      if (lifecycle.runTimeoutHandle) {
        clearTimeout(lifecycle.runTimeoutHandle);
        lifecycle.runTimeoutHandle = null;
      }
      if (lifecycle.settleCheckHandle) {
        clearTimeout(lifecycle.settleCheckHandle);
        lifecycle.settleCheckHandle = null;
      }
      if (!lifecycle.loopCompleteEmitted) {
        lifecycle.bootstrapped = false;
        lifecycle.inProgress = false;
        lifecycle.settleCandidateAtMs = 0;
        lifecycle.settleCandidateRequestKey = null;
        lifecycle.settleCandidateVisibleCount = 0;
        lifecycle.settleCandidateVisiblePinCount = 0;
        lifecycle.settleCandidateVisibleDotCount = 0;
        lifecycle.observedLoading = false;
      }
    };
  }, [
    emitSearchPerfEvent,
    getPerfNow,
    isInitialCameraReady,
    isSearchOverlay,
    isShortcutPerfHarnessScenario,
    shortcutHarnessRunId,
    startShortcutHarnessRun,
  ]);
  React.useEffect(() => {
    if (!perfHarnessConfig.jsFrameSampler.enabled) {
      return;
    }
    const stop = startJsFrameSampler({
      windowMs: perfHarnessConfig.jsFrameSampler.windowMs,
      stallFrameMs: perfHarnessConfig.jsFrameSampler.stallFrameMs,
      logOnlyBelowFps: perfHarnessConfig.jsFrameSampler.logOnlyBelowFps,
      getNow: getPerfNow,
      onWindow: (summary) => {
        const trace = shortcutPerfTraceRef.current;
        const interactionState = searchInteractionRef.current;
        const traceNowMs = getPerfNow();
        emitSearchPerfEvent('JsFrameSampler', {
          ...summary,
          harnessRunId: isShortcutPerfHarnessScenario ? shortcutHarnessRunId : null,
          shortcutSessionId: trace.sessionId,
          shortcutStage: trace.stage,
          shortcutElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.sessionStartedAtMs),
          shortcutStageAgeMs:
            trace.stageStartedAtMs == null ? null : roundPerfValue(traceNowMs - trace.stageStartedAtMs),
          drag: interactionState.isResultsSheetDragging,
          scroll: interactionState.isResultsListScrolling,
          settle: interactionState.isResultsSheetSettling,
        });
      },
      onStall: (event) => {
        const trace = shortcutPerfTraceRef.current;
        const traceNowMs = getPerfNow();
        emitSearchPerfEvent('JsFrameSampler', {
          ...event,
          harnessRunId: isShortcutPerfHarnessScenario ? shortcutHarnessRunId : null,
          shortcutSessionId: trace.sessionId,
          shortcutStage: trace.stage,
          shortcutElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.sessionStartedAtMs),
          shortcutStageAgeMs:
            trace.stageStartedAtMs == null ? null : roundPerfValue(traceNowMs - trace.stageStartedAtMs),
        });
      },
    });
    return stop;
  }, [emitSearchPerfEvent, getPerfNow, isShortcutPerfHarnessScenario, shortcutHarnessRunId]);
  React.useEffect(() => {
    if (!perfHarnessConfig.uiFrameSampler.enabled) {
      return;
    }
    const stop = startUiFrameSampler({
      windowMs: perfHarnessConfig.uiFrameSampler.windowMs,
      stallFrameMs: perfHarnessConfig.uiFrameSampler.stallFrameMs,
      logOnlyBelowFps: perfHarnessConfig.uiFrameSampler.logOnlyBelowFps,
      onWindow: (summary) => {
        const trace = shortcutPerfTraceRef.current;
        const traceNowMs = getPerfNow();
        emitSearchPerfEvent('UiFrameSampler', {
          ...summary,
          harnessRunId: isShortcutPerfHarnessScenario ? shortcutHarnessRunId : null,
          shortcutSessionId: trace.sessionId,
          shortcutStage: trace.stage,
          shortcutElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.sessionStartedAtMs),
          shortcutStageAgeMs:
            trace.stageStartedAtMs == null ? null : roundPerfValue(traceNowMs - trace.stageStartedAtMs),
        });
      },
      onStall: (event) => {
        const trace = shortcutPerfTraceRef.current;
        const traceNowMs = getPerfNow();
        emitSearchPerfEvent('UiFrameSampler', {
          ...event,
          harnessRunId: isShortcutPerfHarnessScenario ? shortcutHarnessRunId : null,
          shortcutSessionId: trace.sessionId,
          shortcutStage: trace.stage,
          shortcutElapsedMs:
            trace.sessionStartedAtMs == null
              ? null
              : roundPerfValue(traceNowMs - trace.sessionStartedAtMs),
          shortcutStageAgeMs:
            trace.stageStartedAtMs == null ? null : roundPerfValue(traceNowMs - trace.stageStartedAtMs),
        });
      },
    });
    return stop;
  }, [emitSearchPerfEvent, getPerfNow, isShortcutPerfHarnessScenario, shortcutHarnessRunId]);

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

  const scheduleFilterToggleSearch = React.useCallback(
    (runSearch: () => Promise<void>, options?: { showOverlay?: boolean }) => {
      const shouldShowOverlay = options?.showOverlay !== false;
      if (shouldShowOverlay) {
        setIsFilterTogglePending(true);
      }
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
            if (shouldShowOverlay && filterToggleRequestRef.current === requestId) {
              setIsFilterTogglePending(false);
            }
          }
        };
        void execute();
      }, FILTER_TOGGLE_DEBOUNCE_MS);
    },
    []
  );

  const toggleVotesFilter = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    setIsRankSelectorVisible(false);
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

  const handleScoreModeChange = React.useCallback(
    (nextMode: typeof scoreMode) => {
      if (nextMode === scoreMode) {
        return;
      }
      setPreferredScoreMode(nextMode);

      const shouldRunShortcut = searchMode === 'shortcut';
      const committedQuery = (isSearchSessionActive ? submittedQuery : query).trim();
      const shouldRunNatural = !shouldRunShortcut && Boolean(committedQuery);
      if (!shouldRunShortcut && !shouldRunNatural) {
        return;
      }
      scheduleFilterToggleSearch(
        async () => {
          if (shouldRunShortcut) {
            const fallbackLabel = activeTab === 'restaurants' ? 'Best restaurants' : 'Best dishes';
            const label = submittedQuery || fallbackLabel;
            await runBestHere(activeTab, label, { preserveSheetState: true, scoreMode: nextMode });
            return;
          }
          await submitSearch({ preserveSheetState: true, scoreMode: nextMode }, committedQuery);
        },
        { showOverlay: false }
      );
    },
    [
      activeTab,
      isSearchSessionActive,
      query,
      runBestHere,
      scheduleFilterToggleSearch,
      scoreMode,
      searchMode,
      setPreferredScoreMode,
      submitSearch,
      submittedQuery,
    ]
  );
  const handleTabChange = React.useCallback(
    (value: 'restaurants' | 'dishes') => {
      setPreferredActiveTab(value);
    },
    [setPreferredActiveTab]
  );

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
    const trimmed = query.trim();
    const normalized = trimmed.toLowerCase();
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
    if (normalized === 'best dishes') {
      void runBestHere('dishes', 'Best dishes', {
        transitionFromDockedPolls: shouldShowDockedPolls,
      });
      return;
    }
    if (normalized === 'best restaurants') {
      void runBestHere('restaurants', 'Best restaurants', {
        transitionFromDockedPolls: shouldShowDockedPolls,
      });
      return;
    }
    if (normalized === 'food') {
      void runBestHere('dishes', 'Food', {
        transitionFromDockedPolls: shouldShowDockedPolls,
      });
      return;
    }

    void submitSearch();
  }, [
    captureSearchSessionOrigin,
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
    void runBestHere('dishes', 'Best dishes', {
      transitionFromDockedPolls: shouldShowDockedPolls,
    });
  }, [
    captureSearchSessionOrigin,
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    resetFocusedMapState,
    runBestHere,
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
    void runBestHere('restaurants', 'Best restaurants', {
      transitionFromDockedPolls: shouldShowDockedPolls,
    });
  }, [
    captureSearchSessionOrigin,
    dismissSearchKeyboard,
    ensureSearchOverlay,
    isSuggestionPanelActive,
    resetFocusedMapState,
    runBestHere,
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
    isSearchLoading,
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
      const hasOriginRestorePending = beginSearchCloseRestore({
        allowFallback: isSearchSessionActive || Boolean(results) || submittedQuery.length > 0,
      });
      isClearingSearchRef.current = true;
      if (isSearchSessionActive || Boolean(results) || submittedQuery.length > 0) {
        setSearchShortcutsFadeResetKey((current) => current + 1);
      }
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
      setMarkerRestaurants(EMPTY_RESTAURANTS);
      setShortcutCoverageDotFeatures(null);
      shortcutCoverageRankedRef.current = [];
      shortcutCoverageSnapshotByRequestIdRef.current.clear();
      shortcutCoverageFetchKeyRef.current = null;
      shortcutCoverageFetchSeqRef.current += 1;
      setIsShortcutCoverageLoading(false);
      lodPinnedKeyRef.current = '';
      lodPinnedMarkersRef.current = [];
      setLodPinnedMarkerMeta([]);
      resetMapMoveFlag();
      setSubmittedQuery('');
      setError(null);
      if (!deferSuggestionClear) {
        setSuggestions([]);
      }
      setIsSearchSessionActive(false);
      setSearchMode(null);
      if (skipSheetAnimation) {
        resetSheetToHidden();
      }
      if (hasOriginRestorePending) {
        flushPendingSearchOriginRestore();
      } else {
        requestDefaultPostSearchRestore();
      }
      setHasMoreFood(false);
      setHasMoreRestaurants(false);
      setCurrentPage(1);
      setIsLoadingMore(false);
      setIsPaginationExhausted(false);
      lastAutoOpenKeyRef.current = null;
      restaurantFocusSessionRef.current = {
        restaurantId: null,
        locationKey: null,
        hasAppliedInitialMultiLocationZoomOut: false,
      };
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
      beginSearchCloseRestore,
      flushPendingSearchOriginRestore,
      isRestaurantOverlayVisible,
      isSearchSessionActive,
      results,
      resetSheetToHidden,
      resetFilters,
      resetFocusedMapState,
      resetMapMoveFlag,
      requestDefaultPostSearchRestore,
      setRestaurantOnlyIntent,
      setIsSearchSessionActive,
      setSearchMode,
      setSearchTransitionVariant,
      setSearchShortcutsFadeResetKey,
      scrollResultsToTop,
      shortcutContentFadeMode,
      submittedQuery,
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
      shouldRefocusInput: !isSearchSessionActive && !isSearchLoading && !isLoadingMore,
      skipProfileDismissWait: true,
    });
  }, [
    clearSearchState,
    clearTypedQuery,
    isSearchLoading,
    isLoadingMore,
    isRestaurantOverlayVisible,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
  ]);

  const handleCloseResults = React.useCallback(() => {
    ignoreNextSearchBlurRef.current = true;
    setIsNavRestorePending(true);
    setSearchHeaderActionModeOverride('follow-collapse');
    setPollsHeaderActionAnimationToken((current) => current + 1);
    clearSearchState({
      skipProfileDismissWait: true,
    });
  }, [
    clearSearchState,
    setIsNavRestorePending,
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
      if (!showPollsOverlay && !isSearchLoading) {
        restoreDockedPolls();
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
    isSearchLoading,
    isSearchSessionActive,
    query,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setShowSuggestions,
    setSuggestions,
    restoreDockedPolls,
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
      captureSearchSessionOrigin();
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
      captureSearchSessionOrigin,
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
      captureSearchSessionOrigin();
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
      captureSearchSessionOrigin,
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
      captureSearchSessionOrigin();
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
      captureSearchSessionOrigin,
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
    if (pendingMarkerOpenAnimationFrameRef.current != null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
      }
      pendingMarkerOpenAnimationFrameRef.current = null;
    }
    setMapHighlightedRestaurantId(null);
    cancelAutocomplete();
  }, [
    beginSuggestionCloseHold,
    cancelAutocomplete,
    dismissSearchKeyboard,
    isRestaurantOverlayVisible,
    isSearchSessionActive,
    setMapHighlightedRestaurantId,
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
      const throttleMs = LOD_CAMERA_THROTTLE_MS;
      if (now - lastCameraChangedHandledRef.current < throttleMs) {
        return;
      }
      lastCameraChangedHandledRef.current = now;

      const bounds = mapStateBoundsToMapBounds(state);
      if (!bounds) {
        return;
      }
      latestBoundsRef.current = bounds;
      // Programmatic camera animations (profile open/restore) can emit many camera ticks.
      // Skip per-tick LOD churn there and refresh once on idle instead.
      if (suppressMapMovedRef.current && !isGestureActive) {
        mapGestureSessionRef.current = null;
        return;
      }
      updateLodPinnedMarkers(bounds);

      if (searchInteractionRef.current.isInteracting || anySheetDraggingRef.current) {
        cancelMapUpdateTimeouts();
        return;
      }
      const zoomCandidate = state?.properties?.zoom as unknown;
      const zoom =
        typeof zoomCandidate === 'number' && Number.isFinite(zoomCandidate) ? zoomCandidate : null;

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
      // Do not surface "Search this area" from non-gesture map changes.
      // Programmatic camera moves (pin open/close, restore, autofocus) should not count as
      // user-driven exploration.
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
      updateLodPinnedMarkers,
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
        if (!isBusy) {
          updateLodPinnedMarkers(bounds);
        }
        if (!isBusy && shouldShowPollsSheet) {
          schedulePollBoundsUpdate(bounds);
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
      // Keep the controlled Camera synced with the exact idle state to avoid a visible
      // post-gesture "snap" caused by feeding rounded zoom/center values back into Mapbox.
      const exactCenter: [number, number] = [nextCenter[0], nextCenter[1]];
      const exactZoom = nextZoom;
      lastCameraStateRef.current = { center: exactCenter, zoom: exactZoom };
      setMapCenter(exactCenter);
      setMapZoom(exactZoom);

      // Persist a rounded snapshot only for storage stability/churn control.
      const roundedCenter: [number, number] = [
        roundCameraCenterValue(exactCenter[0]),
        roundCameraCenterValue(exactCenter[1]),
      ];
      const roundedZoom = roundCameraZoomValue(exactZoom);
      const payload = JSON.stringify({ center: roundedCenter, zoom: roundedZoom });
      if (payload === lastPersistedCameraRef.current) {
        return;
      }
      lastPersistedCameraRef.current = payload;
      void AsyncStorage.setItem(CAMERA_STORAGE_KEY, payload).catch(() => undefined);
    },
    [
      cancelMapUpdateTimeouts,
      logMapEventRates,
      schedulePollBoundsUpdate,
      shouldShowPollsSheet,
      shouldLogMapEventRates,
      updateLodPinnedMarkers,
    ]
  );

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    setIsRankSelectorVisible(false);
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
    // Intentionally keep this as a thin wrapper for legacy call sites.
    // Use handlePriceDone for snappy sheet dismissal before applying work.
    const snapshot = pendingPriceRangeRef.current;

    const sheet = priceSheetRef.current;
    if (sheet) {
      sheet.requestClose();
    } else {
      setIsPriceSelectorVisible(false);
    }
    requestAnimationFrame(() => {
      void InteractionManager.runAfterInteractions(() => {
        const normalizedRange = normalizePriceRangeValues(snapshot);
        const shouldClear = isFullPriceRange(normalizedRange);
        const nextLevels = shouldClear ? [] : buildLevelsFromRange(normalizedRange);
        const currentLevels = useSearchStore.getState().priceLevels;
        const hasChanged =
          nextLevels.length !== currentLevels.length ||
          nextLevels.some((value, index) => value !== currentLevels[index]);
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
      });
    });
  }, [
    activeTab,
    isSearchSessionActive,
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

  const dismissPriceSelector = React.useCallback(() => {
    const sheet = priceSheetRef.current;
    if (sheet) {
      sheet.requestClose();
      return;
    }
    closePriceSelector();
  }, [closePriceSelector]);

  const commitRankSelection = React.useCallback(() => {
    const snapshot = pendingScoreModeRef.current;

    const sheet = rankSheetRef.current;
    if (sheet) {
      sheet.requestClose();
    } else {
      setIsRankSelectorVisible(false);
    }
    requestAnimationFrame(() => {
      void InteractionManager.runAfterInteractions(() => {
        handleScoreModeChange(snapshot);
      });
    });
  }, [handleScoreModeChange]);

  const closeRankSelector = React.useCallback(() => {
    setIsRankSelectorVisible(false);
  }, []);

  const dismissRankSelector = React.useCallback(() => {
    const sheet = rankSheetRef.current;
    if (sheet) {
      sheet.requestClose();
      return;
    }
    closeRankSelector();
  }, [closeRankSelector]);

  const toggleRankSelector = React.useCallback(() => {
    if (isRankSelectorVisible) {
      commitRankSelection();
      return;
    }
    setIsPriceSelectorVisible(false);
    setPendingScoreMode(scoreMode);
    setIsRankSelectorVisible(true);
  }, [commitRankSelection, isRankSelectorVisible, scoreMode]);

  React.useEffect(() => {
    return registerTransientDismissor(() => {
      closePriceSelector();
      closeRankSelector();
      closeScoreInfo();
    });
  }, [closePriceSelector, closeRankSelector, closeScoreInfo, registerTransientDismissor]);

  const handlePriceDone = React.useCallback(() => {
    commitPriceSelection();
  }, [commitPriceSelection]);

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
  const scheduleCameraCommand = React.useCallback((command: () => void) => {
    if (cameraCommandFrameRef.current != null) {
      cancelAnimationFrame(cameraCommandFrameRef.current);
      cameraCommandFrameRef.current = null;
    }
    command();
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
    const captureCurrentResultsSheetSnap = (): Exclude<OverlaySheetSnap, 'hidden'> => {
      const y = sheetTranslateY.value;
      if (typeof y === 'number' && Number.isFinite(y)) {
        const candidates: Array<Exclude<OverlaySheetSnap, 'hidden'>> = [
          'expanded',
          'middle',
          'collapsed',
        ];
        let bestSnap: Exclude<OverlaySheetSnap, 'hidden'> = lastVisibleSheetStateRef.current;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of candidates) {
          const targetY = snapPoints[candidate];
          const distance = Math.abs(y - targetY);
          if (distance < bestDistance) {
            bestSnap = candidate;
            bestDistance = distance;
          }
        }
        return bestSnap;
      }
      if (sheetState !== 'hidden') {
        return sheetState;
      }
      return lastVisibleSheetStateRef.current;
    };
    if (!transition.savedSheetSnap) {
      transition.savedSheetSnap = captureCurrentResultsSheetSnap();
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
  }, [captureCameraSnapshot, resultsScrollOffset, sheetState, sheetTranslateY, snapPoints]);

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

  const loadRestaurantProfileData = React.useCallback((restaurantId: string) => {
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
  }, []);

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
    []
  );

  const hydrateRestaurantProfileById = React.useCallback(
    (restaurantId: string) => {
      if (!restaurantId) {
        return;
      }
      const requestSeq = (restaurantProfileRequestSeqRef.current += 1);
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
        });
    },
    [loadRestaurantProfileData]
  );

  const focusRestaurantProfileCamera = React.useCallback(
    (
      restaurant: RestaurantResult,
      source: 'results_sheet' | 'auto_open_single_candidate' | 'autocomplete' | 'dish_card',
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
          ? Math.max(
              currentZoom - PROFILE_MULTI_LOCATION_ZOOM_OUT_DELTA,
              PROFILE_MULTI_LOCATION_MIN_ZOOM
            )
          : currentZoom;
        const isSameFocusedLocation =
          isSameRestaurantFocusSession && previousFocusSession.locationKey === focusLocationKey;
        const currentCenter = lastCameraStateRef.current?.center ?? null;
        const isAlreadyCenteredOnTarget =
          currentCenter != null &&
          Math.abs(currentCenter[0] - nextCenter[0]) <= RESTAURANT_FOCUS_CENTER_EPSILON &&
          Math.abs(currentCenter[1] - nextCenter[1]) <= RESTAURANT_FOCUS_CENTER_EPSILON;
        const isAlreadyAtTargetZoom =
          Math.abs(currentZoom - nextZoom) <= RESTAURANT_FOCUS_ZOOM_EPSILON;
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
            animationDuration: PROFILE_CAMERA_ANIMATION_MS,
            animationMode: 'easeTo',
          });
          scheduleCameraStateCommit(
            {
              center: nextCenter,
              zoom: nextZoom,
              padding: profilePadding,
            },
            PROFILE_CAMERA_ANIMATION_MS + FIT_BOUNDS_SYNC_BUFFER_MS
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
      clearCameraPersistTimeout,
      commitCameraState,
      mapZoom,
      pickClosestLocationToCenter,
      pickPreferredRestaurantMapLocation,
      resolveRestaurantMapLocations,
      resolveRestaurantLocationSelectionAnchor,
      resolveProfileCameraPadding,
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
      clearCameraStateSync,
      clearCameraPersistTimeout,
      commitCameraState,
      dismissTransientOverlays,
      ensureSearchOverlay,
      ensureProfileTransitionSnapshot,
      hydrateRestaurantProfileById,
      mapZoom,
      resolveProfileCameraPadding,
      scheduleCameraCommand,
      scheduleCameraStateCommit,
      seedRestaurantProfile,
      setIsFollowingUser,
      setRestaurantSnapRequest,
      setIsSearchFocused,
      setProfileTransitionStatus,
      setShowSuggestions,
      setSuggestions,
      suppressMapMoved,
      setMapHighlightedRestaurantId,
    ]
  );
  openRestaurantProfilePreviewRef.current = openRestaurantProfilePreview;

  const openRestaurantProfile = React.useCallback(
    (
      restaurant: RestaurantResult,
      _foodResultsOverride?: FoodResult[],
      pressedCoordinate?: Coordinate | null,
      source:
        | 'results_sheet'
        | 'auto_open_single_candidate'
        | 'autocomplete'
        | 'dish_card' = 'results_sheet'
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
      // Store and hide save sheet if visible
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
      commitCameraState,
      clearCameraStateSync,
      clearCameraPersistTimeout,
      dismissTransientOverlays,
      ensureSearchOverlay,
      ensureProfileTransitionSnapshot,
      focusRestaurantProfileCamera,
      hydrateRestaurantProfileById,
      isInitialCameraReady,
      isRestaurantOverlayVisible,
      restaurantOnlyId,
      restaurantProfile,
      saveSheetState,
      seedRestaurantProfile,
      setIsSearchFocused,
      setIsInitialCameraReady,
      setRestaurantSnapRequest,
      setProfileTransitionStatus,
      setShowSuggestions,
      setSuggestions,
      setMapHighlightedRestaurantId,
      submittedQuery,
      trimmedQuery,
      recordRestaurantView,
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

  const shortcutCoverageRestaurantNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    const features = shortcutCoverageAnchoredDotFeatures?.features ?? [];
    for (const feature of features) {
      const props = feature.properties;
      const restaurantId = props?.restaurantId;
      const restaurantName = props?.restaurantName;
      if (typeof restaurantId === 'string' && restaurantId && typeof restaurantName === 'string') {
        map.set(restaurantId, restaurantName);
      }
    }
    return map;
  }, [shortcutCoverageAnchoredDotFeatures?.features]);

  const handleMarkerPress = React.useCallback(
    (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      setMapHighlightedRestaurantId((prev) => (prev === restaurantId ? prev : restaurantId));
      if (pendingMarkerOpenAnimationFrameRef.current != null) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
        }
        pendingMarkerOpenAnimationFrameRef.current = null;
      }
      const restaurant = restaurants.find((r) => r.restaurantId === restaurantId);
      const openProfile = () => {
        if (!restaurant) {
          const fallbackName = shortcutCoverageRestaurantNameById.get(restaurantId);
          if (fallbackName) {
            forceRestaurantProfileMiddleSnapRef.current = true;
            openRestaurantProfilePreview(restaurantId, fallbackName, pressedCoordinate ?? null);
          }
          return;
        }
        forceRestaurantProfileMiddleSnapRef.current = true;
        openRestaurantProfile(restaurant, undefined, pressedCoordinate, 'results_sheet');
      };
      if (typeof requestAnimationFrame === 'function') {
        pendingMarkerOpenAnimationFrameRef.current = requestAnimationFrame(() => {
          pendingMarkerOpenAnimationFrameRef.current = null;
          openProfile();
        });
        return;
      }
      openProfile();
    },
    [
      openRestaurantProfile,
      openRestaurantProfilePreview,
      restaurants,
      setMapHighlightedRestaurantId,
      shortcutCoverageRestaurantNameById,
    ]
  );
  const handleMapVisualReady = React.useCallback(
    (requestKey: string) => {
      markVisualRequestReady(requestKey);
    },
    [markVisualRequestReady]
  );

  const handleMapPressRef = React.useRef(handleMapPress);
  const handleCameraChangedRef = React.useRef(handleCameraChanged);
  const handleMapIdleRef = React.useRef(handleMapIdle);
  const handleMapLoadedRef = React.useRef(handleMapLoaded);
  const handleMarkerPressRef = React.useRef(handleMarkerPress);
  const handleMapVisualReadyRef = React.useRef(handleMapVisualReady);

  handleMapPressRef.current = handleMapPress;
  handleCameraChangedRef.current = handleCameraChanged;
  handleMapIdleRef.current = handleMapIdle;
  handleMapLoadedRef.current = handleMapLoaded;
  handleMarkerPressRef.current = handleMarkerPress;
  handleMapVisualReadyRef.current = handleMapVisualReady;

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
  const stableHandleMarkerPress = React.useCallback(
    (restaurantId: string, pressedCoordinate?: Coordinate | null) => {
      handleMarkerPressRef.current(restaurantId, pressedCoordinate);
    },
    []
  );
  const stableHandleMapVisualReady = React.useCallback((requestKey: string) => {
    handleMapVisualReadyRef.current(requestKey);
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
      const queryKey = (submittedQuery || trimmedQuery).trim();
      const isTargetProfileAlreadyOpen =
        isRestaurantOverlayVisible &&
        restaurantProfile?.restaurant.restaurantId === targetRestaurant.restaurantId;
      if (isTargetProfileAlreadyOpen) {
        const queryLabel = queryKey || targetRestaurant.restaurantName || 'Search';
        const cachedProfile = restaurantProfileCacheRef.current.get(targetRestaurant.restaurantId);
        setRestaurantProfile((prev) => {
          if (!prev || prev.restaurant.restaurantId !== targetRestaurant.restaurantId) {
            return prev;
          }
          const nextDishes = cachedProfile?.dishes ?? prev.dishes;
          const nextRestaurant = cachedProfile
            ? {
                ...cachedProfile.restaurant,
                contextualScore: targetRestaurant.contextualScore,
              }
            : targetRestaurant;
          return {
            ...prev,
            restaurant: nextRestaurant,
            queryLabel,
            dishes: nextDishes,
            isLoading: !cachedProfile && nextDishes.length === 0,
          };
        });
        restaurantOverlayDismissHandledRef.current = false;
        setRestaurantOverlayVisible(true);
        focusRestaurantProfileCamera(targetRestaurant, 'autocomplete');
        hydrateRestaurantProfileById(targetRestaurant.restaurantId);
      } else {
        openRestaurantProfile(targetRestaurant, results.dishes ?? [], null, 'autocomplete');
      }
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
    openRestaurantProfile(
      targetRestaurant,
      results.dishes ?? [],
      null,
      'auto_open_single_candidate'
    );
    lastAutoOpenKeyRef.current = autoOpenKey;
  }, [
    focusRestaurantProfileCamera,
    hydrateRestaurantProfileById,
    isSearchFocused,
    isRestaurantOverlayVisible,
    isSuggestionPanelActive,
    openRestaurantProfile,
    restaurantProfile,
    results,
    setRestaurantProfile,
    setRestaurantOverlayVisible,
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
      });
    },
    [
      clearCameraStateSync,
      clearCameraPersistTimeout,
      commitCameraState,
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
    applyCameraSnapshot(snapshot, { animationDuration: PROFILE_RESTORE_ANIMATION_MS });
  }, [applyCameraSnapshot, clearCameraStateSync, setMapCameraPadding]);

  const restoreSearchSheetState = React.useCallback(() => {
    const transition = profileTransitionRef.current;
    const fallbackState = lastVisibleSheetStateRef.current;
    const targetState = transition.savedSheetSnap ?? fallbackState;
    if (targetState && targetState !== 'hidden') {
      animateSheetTo(targetState);
    }
    transition.savedSheetSnap = null;
  }, [animateSheetTo]);

  const closeRestaurantProfile = React.useCallback(() => {
    // Guard against calling close when already closed or nothing to close
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
      if (resultsHydrationTaskRef.current) {
        resultsHydrationTaskRef.current.cancel();
        resultsHydrationTaskRef.current = null;
      }
      setHydratedResultsKeySync(resultsHydrationKey);
    }
    if (profileDismissBehaviorRef.current === 'clear') {
      resetSheetToHidden();
    }
    handleRestaurantOverlayDismissed();
  }, [
    handleRestaurantOverlayDismissed,
    hydratedResultsKey,
    isRestaurantOverlayVisible,
    restaurantProfile,
    resetSheetToHidden,
    resultsHydrationKey,
    setProfileTransitionStatus,
    setMapHighlightedRestaurantId,
  ]);
  closeRestaurantProfileRef.current = closeRestaurantProfile;

  const handleRestaurantOverlayRequestClose = React.useCallback(() => {
    setMapHighlightedRestaurantId(null);
    closeRestaurantProfile();
  }, [closeRestaurantProfile, setMapHighlightedRestaurantId]);

  const handleRestaurantOverlayDismissed = React.useCallback(() => {
    if (restaurantOverlayDismissHandledRef.current) {
      return;
    }
    if (!restaurantProfile && !isRestaurantOverlayVisible) {
      return;
    }
    restaurantOverlayDismissHandledRef.current = true;
    restaurantProfileRequestSeqRef.current += 1;
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
    isRestaurantOverlayVisible,
    restaurantProfile,
    restoreRestaurantProfileMap,
    restoreSearchSheetState,
    sheetState,
    setMapHighlightedRestaurantId,
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

  const filtersHeader = React.useMemo(
    () => (
      <SearchFilters
        activeTab={activeTab}
        onTabChange={handleTabChange}
        rankButtonLabel={rankButtonLabelText}
        rankButtonActive={rankButtonIsActive}
        onToggleRankSelector={toggleRankSelector}
        isRankSelectorVisible={isRankSelectorVisible}
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
      handleTabChange,
      openNow,
      votesFilterActive,
      priceButtonLabelText,
      priceButtonIsActive,
      isPriceSelectorVisible,
      rankButtonLabelText,
      rankButtonIsActive,
      isRankSelectorVisible,
      toggleOpenNow,
      toggleRankSelector,
      toggleVotesFilter,
      togglePriceSelector,
      handleSearchFiltersLayoutCache,
      shouldDisableSearchBlur,
    ]
  );

  const resultsKeyExtractor = React.useCallback((item: ResultsListItem, index: number) => {
    if (item && typeof item === 'object' && 'kind' in item) {
      return item.key || `row-${index}`;
    }
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
  }, []);

  const isDishesTab = activeTab === 'dishes';
  const EXACT_VISIBLE_LIMIT = 5;
  const [sectionedSearchRequestId, setSectionedSearchRequestId] = React.useState<string | null>(
    null
  );
  const [exactDishesOnPage, setExactDishesOnPage] = React.useState<number | null>(null);
  const [exactRestaurantsOnPage, setExactRestaurantsOnPage] = React.useState<number | null>(null);
  const [showAllExactDishes, setShowAllExactDishes] = React.useState(false);
  const [showAllExactRestaurants, setShowAllExactRestaurants] = React.useState(false);

  React.useEffect(() => {
    const searchId = results?.metadata?.searchRequestId ?? null;
    const nextExactDishes =
      typeof results?.metadata?.exactDishCountOnPage === 'number'
        ? results.metadata.exactDishCountOnPage
        : null;
    const nextExactRestaurants =
      typeof results?.metadata?.exactRestaurantCountOnPage === 'number'
        ? results.metadata.exactRestaurantCountOnPage
        : null;

    if (!searchId) {
      setSectionedSearchRequestId(null);
      setExactDishesOnPage(null);
      setExactRestaurantsOnPage(null);
      setShowAllExactDishes(false);
      setShowAllExactRestaurants(false);
      return;
    }

    if (searchId !== sectionedSearchRequestId) {
      setSectionedSearchRequestId(searchId);
      setExactDishesOnPage(nextExactDishes);
      setExactRestaurantsOnPage(nextExactRestaurants);
      setShowAllExactDishes(false);
      setShowAllExactRestaurants(false);
      return;
    }

    if (nextExactDishes !== null && exactDishesOnPage === null) {
      setExactDishesOnPage(nextExactDishes);
    }
    if (nextExactRestaurants !== null && exactRestaurantsOnPage === null) {
      setExactRestaurantsOnPage(nextExactRestaurants);
    }
  }, [
    exactDishesOnPage,
    exactRestaurantsOnPage,
    results?.metadata?.exactDishCountOnPage,
    results?.metadata?.exactRestaurantCountOnPage,
    results?.metadata?.searchRequestId,
    sectionedSearchRequestId,
  ]);

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

  const sectionedResultsData = React.useMemo<ResultsListItem[]>(() => {
    const exactCountRaw = isDishesTab ? exactDishesOnPage : exactRestaurantsOnPage;
    const exactCount =
      typeof exactCountRaw === 'number' && Number.isFinite(exactCountRaw) && exactCountRaw > 0
        ? Math.floor(exactCountRaw)
        : 0;

    if (exactCount <= 0 || safeResultsData.length <= exactCount) {
      return safeResultsData;
    }

    const exactAll = safeResultsData.slice(0, exactCount);
    const relaxedAll = safeResultsData.slice(exactCount);

    const showAllExact = isDishesTab ? showAllExactDishes : showAllExactRestaurants;
    const exactVisible = showAllExact ? exactAll : exactAll.slice(0, EXACT_VISIBLE_LIMIT);
    const hiddenCount = Math.max(0, exactAll.length - exactVisible.length);

    const rows: ResultsListItem[] = [
      { kind: 'section', key: `${activeTab}-section-exact`, label: 'Exact matches' },
      ...exactVisible,
    ];

    if (hiddenCount > 0 && !showAllExact) {
      rows.push({
        kind: 'show_more_exact',
        key: `${activeTab}-show-more-exact`,
        hiddenCount,
      });
    }

    if (relaxedAll.length > 0) {
      rows.push({
        kind: 'section',
        key: `${activeTab}-section-broader`,
        label: 'Broader matches',
      });
      rows.push(...relaxedAll);
    }

    return rows;
  }, [
    EXACT_VISIBLE_LIMIT,
    activeTab,
    exactDishesOnPage,
    exactRestaurantsOnPage,
    isDishesTab,
    safeResultsData,
    showAllExactDishes,
    showAllExactRestaurants,
  ]);

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
  const getResultItemType = React.useCallback<FlashListProps<ResultsListItem>['getItemType']>(
    (item) => {
      if (item && typeof item === 'object' && 'kind' in item) {
        return item.kind;
      }
      return 'foodId' in item ? 'dish' : 'restaurant';
    },
    []
  );

  const renderPlaceholderFlashListItem = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['renderItem']>
  >(({ index }) => renderPlaceholderItem(index), [renderPlaceholderItem]);
  const renderResultsFlashListItem = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['renderItem']>
  >(
    ({ item, index }) => {
      if (item === undefined || item === null) {
        logger.error('FlashList renderItem received nullish item', { index });
        return null;
      }
      if (item && typeof item === 'object' && 'kind' in item) {
        if (item.kind === 'section') {
          return (
            <View style={[styles.resultItem, index === 0 && styles.firstResultItem]}>
              <Text style={[styles.resultMetaText, { color: themeColors.textMuted }]}>
                {item.label}
              </Text>
            </View>
          );
        }
        if (item.kind === 'show_more_exact') {
          const hiddenCount = item.hiddenCount;
          const onPress = isDishesTab
            ? () => setShowAllExactDishes(true)
            : () => setShowAllExactRestaurants(true);
          const label =
            hiddenCount === 1
              ? 'Show 1 more exact match'
              : `Show ${hiddenCount} more exact matches`;
          return (
            <Pressable
              onPress={onPress}
              style={[styles.resultItem, index === 0 && styles.firstResultItem]}
            >
              <Text style={[styles.resultMetaText, { color: themeColors.secondaryAccent }]}>
                {label}
              </Text>
            </Pressable>
          );
        }
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
    if (!shouldHydrateResultsForRender) {
      return sectionedResultsData;
    }
    const targetCount = Math.min(6, sectionedResultsData.length);
    return targetCount > 0 ? sectionedResultsData.slice(0, targetCount) : sectionedResultsData;
  }, [shouldHydrateResultsForRender, sectionedResultsData]);
  const resultsListDataForRender =
    isFilterTogglePending || isVisualSyncPending ? EMPTY_RESULTS : resultsListData;
  React.useEffect(() => {
    if (!resultsHydrationKey) {
      if (hydratedResultsKey !== null) {
        setHydratedResultsKeySync(null);
      }
      return;
    }
    if (resultsHydrationKey === hydratedResultsKey) {
      return;
    }
    // If the results sheet isn't active (e.g. the user opened a restaurant profile), complete
    // hydration immediately so returning to the list doesn't briefly show only the first items.
    if (activeOverlayKey !== 'search') {
      setHydratedResultsKeySync(resultsHydrationKey);
      return;
    }
    if (resultsHydrationTaskRef.current) {
      resultsHydrationTaskRef.current.cancel();
      resultsHydrationTaskRef.current = null;
    }
    resultsHydrationTaskRef.current = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        setHydratedResultsKeySync(resultsHydrationKey);
      });
    });
    return () => {
      if (resultsHydrationTaskRef.current) {
        resultsHydrationTaskRef.current.cancel();
        resultsHydrationTaskRef.current = null;
      }
    };
  }, [activeOverlayKey, hydratedResultsKey, resultsHydrationKey, setHydratedResultsKeySync]);
  const shouldShowInitialResultsLoadingPhase =
    (didSearchSessionJustActivate || isInitialResultsLoadPending) &&
    isSearchLoading &&
    !isFilterTogglePending;
  const shouldHideFiltersHeaderDuringInitialLoad =
    !shouldDisableFiltersHeader && shouldShowInitialResultsLoadingPhase;
  const listHeader = React.useMemo(() => {
    if (shouldDisableFiltersHeader) {
      return null;
    }
    return (
      <View
        style={[
          styles.resultsListHeader,
          shouldHideFiltersHeaderDuringInitialLoad ? styles.resultsListHeaderHidden : null,
        ]}
        onLayout={handleFiltersHeaderLayout}
      >
        {filtersHeader}
        <View style={styles.resultsListHeaderBottomStrip} />
      </View>
    );
  }, [
    filtersHeader,
    handleFiltersHeaderLayout,
    shouldDisableFiltersHeader,
    shouldHideFiltersHeaderDuringInitialLoad,
  ]);
  const shouldRetrySearchOnReconnect = shouldRetrySearchOnReconnectRef.current;
  const shouldShowResultsLoadingState =
    (isSearchLoading ||
      hasSystemStatusBanner ||
      shouldRetrySearchOnReconnect ||
      isFilterTogglePending) &&
    (!results || isVisualSyncPending);
  const shouldShowResultsSurface =
    shouldShowResultsLoadingState ||
    shouldUsePlaceholderRows ||
    safeResultsData.length > 0 ||
    Boolean(results);
  const effectiveFiltersHeaderHeight =
    shouldDisableFiltersHeader || shouldHideFiltersHeaderDuringInitialLoad
      ? 0
      : filtersHeaderHeight;
  const effectiveResultsHeaderHeight = shouldDisableResultsHeader ? 0 : resultsSheetHeaderHeight;
  const resultsWashTopOffset = Math.max(
    0,
    effectiveResultsHeaderHeight + effectiveFiltersHeaderHeight
  );
  const initialResultsLoadingFillTopOffset = Math.max(
    resultsWashTopOffset,
    shouldDisableResultsHeader ? 0 : OVERLAY_TAB_HEADER_HEIGHT + effectiveFiltersHeaderHeight
  );
  const shouldRenderInitialResultsLoadingFill =
    shouldShowInitialResultsLoadingPhase && shouldShowResultsLoadingState;
  const resultsListBackground = React.useMemo(() => {
    if (!shouldShowResultsSurface) {
      return null;
    }
    if (shouldDisableSearchBlur) {
      return <View style={[styles.resultsListBackground, { top: 0 }]} />;
    }
    return (
      <>
        <FrostedGlassBackground />
        {shouldRenderInitialResultsLoadingFill ? (
          <View
            style={[
              styles.resultsListBackground,
              styles.resultsListBackgroundLoading,
              { top: initialResultsLoadingFillTopOffset },
            ]}
          />
        ) : null}
      </>
    );
  }, [
    initialResultsLoadingFillTopOffset,
    resultsWashTopOffset,
    shouldDisableSearchBlur,
    shouldRenderInitialResultsLoadingFill,
    shouldShowResultsSurface,
  ]);
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
      </>
    ),
    [resultsWashAnimatedStyle, resultsWashTopOffset]
  );

  const ResultItemSeparator = React.useCallback(
    () => <View style={styles.resultItemSeparator} />,
    []
  );

  const resultsListFooterComponent = React.useMemo(() => {
    const shouldShowNotice = Boolean(
      onDemandNotice && safeResultsData.length > 0 && !isFilterTogglePending
    );
    return (
      <View style={styles.loadMoreSpacer}>
        {shouldShowNotice ? onDemandNotice : null}
        {!isFilterTogglePending && isLoadingMore && canLoadMore ? (
          <View style={styles.loadMoreSpinner}>
            <SquircleSpinner size={18} color={ACTIVE_TAB_COLOR} />
          </View>
        ) : null}
      </View>
    );
  }, [canLoadMore, isFilterTogglePending, isLoadingMore, onDemandNotice, safeResultsData.length]);

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
        onGrabHandlePress={handleCloseResults}
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
    overlayHeaderActionProgress,
    shouldDisableResultsHeader,
    shouldUseResultsHeaderBlur,
    submittedQuery,
  ]);
  const resultsContentContainerStyle = React.useMemo(
    () => ({
      paddingBottom: resultsListDataForRender.length > 0 ? RESULTS_BOTTOM_PADDING : 0,
    }),
    [resultsListDataForRender.length]
  );
  const shouldHydrateResults = shouldHydrateResultsForRender;
  const resultsDrawDistance = shouldHydrateResults ? 360 : 900;
  const resultsInitialDrawBatchSize = shouldHydrateResults ? 2 : 8;
  const viewabilityLogIntervalMs = 250;
  const lastResultsViewabilityLogRef = React.useRef(0);
  const resultsViewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 1, minimumViewTime: 16 }),
    []
  );
  const handleResultsViewableItemsChanged = React.useCallback<
    NonNullable<FlashListProps<ResultsListItem>['onViewableItemsChanged']>
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

  const searchPanelSpec = useSearchPanelSpec<ResultsListItem>({
    visible: shouldRenderResultsSheet,
    listScrollEnabled: !isFilterTogglePending && !shouldDisableResultsSheetInteraction,
    snapPoints,
    initialSnapPoint: sheetState === 'hidden' ? 'middle' : sheetState,
    snapTo: resultsSheetSnapTo,
    onSnapStart: handleResultsSheetSnapStart,
    onScrollBeginDrag: handleResultsListScrollBegin,
    onScrollEndDrag: handleResultsListScrollEnd,
    onMomentumBeginJS: handleResultsListMomentumBegin,
    onMomentumEndJS: handleResultsListMomentumEnd,
    onDragStateChange: handleResultsSheetDragStateChange,
    onSettleStateChange: handleResultsSheetSettlingChange,
    interactionEnabled: !shouldDisableResultsSheetInteraction,
    onEndReached: handleResultsEndReached,
    scrollIndicatorInsets: { top: effectiveResultsHeaderHeight, bottom: RESULTS_BOTTOM_PADDING },
    data: resultsListDataForRender,
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
    onSnapStart: handlePollsSnapStart,
    onSnapChange: handlePollsSnapChange,
    snapTo:
      pollsOverlayMode === 'overlay' ? tabOverlaySnapRequest : pollsDockedSnapRequest?.snap ?? null,
    snapToToken: pollsOverlayMode === 'overlay' ? undefined : pollsDockedSnapRequest?.token,
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
    onSnapStart: handleBookmarksSnapStart,
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
    onSnapStart: handleProfileSnapStart,
    onSnapChange: handleProfileSnapChange,
    snapTo: tabOverlaySnapRequest,
  });

  const restaurantPanelSpecBase = useRestaurantPanelSpec({
    data: restaurantProfile,
    onDismiss: handleRestaurantOverlayDismissed,
    onRequestClose: handleRestaurantOverlayRequestClose,
    onToggleFavorite: handleRestaurantSavePress,
    navBarTop: navBarTopForSnaps,
    searchBarTop,
    interactionEnabled: shouldEnableRestaurantOverlayInteraction,
    containerStyle: restaurantOverlayAnimatedStyle,
  });
  const restaurantPanelSpec = React.useMemo(() => {
    if (!restaurantPanelSpecBase) {
      return null;
    }
    return {
      ...restaurantPanelSpecBase,
      snapTo: restaurantSnapRequest?.snap ?? null,
      snapToToken: restaurantSnapRequest?.token,
      onSnapStart: handleRestaurantOverlaySnapStart,
      onSnapChange: handleRestaurantOverlaySnapChange,
    };
  }, [
    handleRestaurantOverlaySnapChange,
    handleRestaurantOverlaySnapStart,
    restaurantPanelSpecBase,
    restaurantSnapRequest?.snap,
    restaurantSnapRequest?.token,
  ]);

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
  const shouldSuppressTabOverlaySheetForSuggestions =
    !isSearchOverlay &&
    isSuggestionPanelActive &&
    (overlaySheetKey === 'polls' ||
      overlaySheetKey === 'bookmarks' ||
      overlaySheetKey === 'profile');
  const overlaySheetSpec = React.useMemo(() => {
    if (!overlaySheetSpecBase || !overlaySheetKey) {
      return null;
    }
    if (shouldSuppressTabOverlaySheetForSuggestions) {
      return null;
    }
    if (overlaySheetKey !== 'search') {
      return overlaySheetSpecBase;
    }
    return {
      ...overlaySheetSpecBase,
      onDragStateChange: handleResultsSheetDragStateChange,
      onSettleStateChange: handleResultsSheetSettlingChange,
    };
  }, [
    handleResultsSheetDragStateChange,
    handleResultsSheetSettlingChange,
    overlaySheetKey,
    overlaySheetSpecBase,
    shouldSuppressTabOverlaySheetForSuggestions,
  ]);
  const overlaySheetVisible = Boolean(overlaySheetSpec && overlaySheetKey);
  const overlaySheetApplyNavBarCutout = overlaySheetVisible;

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
              selectedRestaurantId={highlightedRestaurantId}
              sortedRestaurantMarkers={visibleSortedRestaurantMarkers}
              dotRestaurantFeatures={visibleDotRestaurantFeatures}
              markersRenderKey={visibleMarkersRenderKey}
              pinsRenderKey={visiblePinsRenderKey}
              markerRevealCommitId={
                resultsVisualSyncCandidate != null ? markerRevealCommitId : null
              }
              visualReadyRequestKey={resultsVisualSyncCandidate}
              shouldSignalVisualReady={shouldSignalMapVisualReady}
              requireMarkerVisualsForVisualReady={hasAnySearchResults}
              buildMarkerKey={buildMarkerKey}
              markerRevealChunk={MARKER_REVEAL_CHUNK}
              markerRevealStaggerMs={MARKER_REVEAL_STAGGER_MS}
              restaurantFeatures={visibleRestaurantFeatures}
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
        <View
          pointerEvents="none"
          style={[
            styles.statusBarFade,
            { top: -STATUS_BAR_FADE_RAISE_PX, height: statusBarFadeHeight },
          ]}
        >
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
                    <>
                      <MaskedHoleOverlay
                        holes={resolvedSuggestionHeaderHoles}
                        backgroundColor="#ffffff"
                        renderWhenEmpty
                        style={[
                          styles.searchSuggestionHeaderSurface,
                          suggestionHeaderHeightAnimatedStyle,
                        ]}
                        pointerEvents="none"
                      />
                    </>
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
                    onScroll={suggestionScrollHandler}
                    scrollEventThrottle={16}
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
                  {shouldShowSuggestionSurface ? (
                    <Reanimated.View
                      pointerEvents="none"
                      style={[
                        styles.searchSuggestionHeaderBottomSeparatorContainer,
                        suggestionHeaderHeightAnimatedStyle,
                      ]}
                    >
                      <Reanimated.View
                        style={[
                          styles.searchSuggestionHeaderBottomSeparator,
                          suggestionHeaderDividerAnimatedStyle,
                        ]}
                      />
                    </Reanimated.View>
                  ) : null}
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
                    showBack={Boolean(isSuggestionPanelActive)}
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
                {shouldMountSearchShortcuts ? (
                  <Reanimated.View
                    style={[styles.searchShortcutsRow, searchShortcutsAnimatedStyle]}
                    pointerEvents={shouldRenderSearchShortcuts ? 'box-none' : 'none'}
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
                ) : null}
                <Reanimated.View
                  pointerEvents={shouldShowSearchThisArea ? 'box-none' : 'none'}
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
                    navBarHeight={navBarCutoutHeight}
                    applyNavBarCutout={overlaySheetApplyNavBarCutout}
                    navBarCutoutProgress={bottomNavHideProgress}
                    navBarHiddenTranslateY={bottomNavHiddenTranslateY}
                    navBarCutoutIsHiding={shouldHideBottomNav}
                  />
                ) : null}
              </React.Profiler>
            </SearchInteractionProvider>
          </>
        )}
        <React.Profiler id="BottomNav" onRender={handleProfilerRender}>
          <Reanimated.View
            style={[styles.bottomNavWrapper, bottomNavAnimatedStyle]}
            pointerEvents={shouldHideBottomNav ? 'none' : 'box-none'}
          >
            <View
              style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_BOTTOM_PADDING }]}
              onLayout={handleBottomNavLayout}
            >
              <View style={styles.bottomNavBackground} pointerEvents="none">
                {!shouldDisableSearchBlur && <FrostedGlassBackground />}
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
                      <Reanimated.View
                        style={[
                          { alignItems: 'center', justifyContent: 'center' },
                          bottomNavItemVisibilityAnimatedStyle,
                        ]}
                      >
                        <View style={styles.navIcon}>{renderIcon(iconColor, active)}</View>
                        <Text
                          variant="body"
                          weight={active ? 'semibold' : 'regular'}
                          style={[styles.navLabel, active && styles.navLabelActive]}
                        >
                          {item.label}
                        </Text>
                      </Reanimated.View>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.navButton}
                    onPress={() => handleOverlaySelect(item.key)}
                  >
                    <Reanimated.View
                      style={[
                        { alignItems: 'center', justifyContent: 'center' },
                        bottomNavItemVisibilityAnimatedStyle,
                      ]}
                    >
                      <View style={styles.navIcon}>{renderIcon(iconColor, active)}</View>
                      <Text
                        variant="body"
                        weight={active ? 'semibold' : 'regular'}
                        style={[styles.navLabel, active && styles.navLabelActive]}
                      >
                        {item.label}
                      </Text>
                    </Reanimated.View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Reanimated.View>
        </React.Profiler>
        <React.Profiler id="Overlays" onRender={handleProfilerRender}>
          <>
            <React.Profiler id="RankSheet" onRender={handleProfilerRender}>
              <MemoOverlayModalSheet
                ref={rankSheetRef}
                visible={isRankSelectorVisible}
                onRequestClose={closeRankSelector}
                maxBackdropOpacity={0.42}
                paddingHorizontal={OVERLAY_HORIZONTAL_PADDING}
                paddingTop={12}
              >
                <View style={styles.rankSheetHeaderRow}>
                  <Text variant="subtitle" weight="semibold" style={styles.rankSheetHeadline}>
                    Rank
                  </Text>
                </View>
                <View style={styles.rankSheetOptions}>
                  {RANK_MODE_OPTIONS.map((option, index) => {
                    const selected = pendingScoreMode === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setPendingScoreMode(option.value)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${option.label.toLowerCase()} ranking`}
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.rankSheetOption,
                          index === 0 && { marginRight: 10 },
                          selected && styles.rankSheetOptionSelected,
                          pressed && { opacity: 0.92 },
                        ]}
                      >
                        {selected ? (
                          <LinearGradient
                            pointerEvents="none"
                            colors={[
                              `${themeColors.primary}1f`,
                              `${themeColors.primary}0a`,
                              'transparent',
                            ]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: 0,
                              right: 0,
                              borderRadius: 12,
                            }}
                          />
                        ) : null}
                        {option.value === 'coverage_display' ? (
                          <Building2
                            size={16}
                            strokeWidth={2.5}
                            color={selected ? themeColors.primary : themeColors.textPrimary}
                          />
                        ) : (
                          <Earth
                            size={16}
                            strokeWidth={2.5}
                            color={selected ? themeColors.primary : themeColors.textPrimary}
                          />
                        )}
                        <Text
                          variant="body"
                          weight="semibold"
                          style={[
                            styles.rankSheetOptionText,
                            selected && styles.rankSheetOptionTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.sheetActionsRow}>
                  <Pressable
                    onPress={dismissRankSelector}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel rank mode changes"
                    style={styles.sheetCancelButton}
                  >
                    <Text
                      variant="caption"
                      weight="semibold"
                      style={[styles.sheetCancelText, { color: ACTIVE_TAB_COLOR_DARK }]}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleRankDone}
                    accessibilityRole="button"
                    accessibilityLabel="Apply rank mode"
                    style={[styles.priceSheetDoneButton, { backgroundColor: ACTIVE_TAB_COLOR }]}
                  >
                    <Text variant="caption" weight="semibold" style={styles.priceSheetDoneText}>
                      Done
                    </Text>
                  </Pressable>
                </View>
              </MemoOverlayModalSheet>
            </React.Profiler>
            <React.Profiler id="PriceSheet" onRender={handleProfilerRender}>
              <MemoOverlayModalSheet
                ref={priceSheetRef}
                visible={isPriceSelectorVisible}
                onRequestClose={closePriceSelector}
                maxBackdropOpacity={0.42}
                paddingHorizontal={OVERLAY_HORIZONTAL_PADDING}
                paddingTop={12}
              >
                <View style={styles.priceSheetHeaderRow}>
                  <View style={styles.priceSheetSummaryMeasureContainer} pointerEvents="none">
                    {PRICE_SUMMARY_CANDIDATES.map((label) => (
                      <Text
                        key={label}
                        variant="subtitle"
                        weight="semibold"
                        style={styles.priceSheetSummaryText}
                        onLayout={(event) => {
                          const next =
                            Math.ceil(event.nativeEvent.layout.width) +
                            PRICE_SUMMARY_PILL_PADDING_X * 2;
                          setPriceSummaryPillWidth((prev) =>
                            prev != null && prev >= next ? prev : next
                          );
                        }}
                      >
                        {label}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.priceSheetHeaderContentRow} pointerEvents="none">
                    <Reanimated.View
                      style={[
                        styles.priceSheetSummaryPill,
                        priceSummaryPillWidth ? { width: priceSummaryPillWidth } : null,
                      ]}
                      layout={LinearTransition.duration(180)}
                      pointerEvents="none"
                    >
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        variant="subtitle"
                        weight="semibold"
                        style={[styles.priceSheetSummaryText, styles.priceSheetSummaryMeasureText]}
                      >
                        {priceSheetSummary}
                      </Text>
                      {PRICE_SUMMARY_REEL_ENTRIES.map((entry, index) => (
                        <PriceSummaryReelItem
                          key={entry.key}
                          label={entry.label}
                          index={index}
                          reelPosition={priceSheetSummaryReelPosition}
                          nearestIndex={priceSheetSummaryReelNearestIndex}
                          neighborVisibility={priceSheetSummaryNeighborVisibility}
                        />
                      ))}
                    </Reanimated.View>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      variant="subtitle"
                      weight="semibold"
                      style={styles.priceSheetHeadlineSuffix}
                    >
                      per person
                    </Text>
                  </View>
                </View>
                <View style={styles.priceSheetSliderWrapper}>
                  {isPriceSheetContentReady ? (
                    <PriceRangeSlider
                      motionLow={priceSliderLowValue}
                      motionHigh={priceSliderHighValue}
                      onRangeCommit={handlePriceSliderCommit}
                    />
                  ) : (
                    <View style={styles.priceTrackContainer} pointerEvents="none" />
                  )}
                </View>
                <View style={styles.sheetActionsRow}>
                  <Pressable
                    onPress={dismissPriceSelector}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel price changes"
                    style={styles.sheetCancelButton}
                  >
                    <Text
                      variant="caption"
                      weight="semibold"
                      style={[styles.sheetCancelText, { color: ACTIVE_TAB_COLOR_DARK }]}
                    >
                      Cancel
                    </Text>
                  </Pressable>
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
