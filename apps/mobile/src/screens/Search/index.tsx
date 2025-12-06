import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
  Image,
  Easing as RNEasing,
} from 'react-native';
import type { TextInput } from 'react-native';
import {
  PanGestureHandler,
  NativeViewGestureHandler,
  type PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import Reanimated, {
  Extrapolation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Share as LucideShare, Heart as LucideHeart } from 'lucide-react-native';
import { useAuth } from '@clerk/clerk-expo';
import type { Feature, FeatureCollection, Point } from 'geojson';
import pinAsset from '../../assets/pin.png';
import pinFillAsset from '../../assets/pin-fill.png';
import { Text } from '../../components';
import type { OperatingStatus } from '@crave-search/shared';
import { XCircleIcon, ChartBarIcon } from '../../components/icons/HeroIcons';
import { HandPlatter, Store, Heart } from 'lucide-react-native';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { colors as themeColors } from '../../constants/theme';
import { getPriceRangeLabel, PRICE_LEVEL_RANGE_LABELS } from '../../constants/pricing';
import {
  overlaySheetStyles,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_CORNER_RADIUS,
} from '../../overlays/overlaySheetStyles';
import RestaurantOverlay, { type RestaurantOverlayData } from '../../overlays/RestaurantOverlay';
import {
  SHEET_STATES,
  clampValue,
  snapPointForState,
  SHEET_SPRING_CONFIG,
  type SheetPosition,
  type SheetGestureContext,
} from '../../overlays/sheetUtils';
import { logger } from '../../utils';
import { searchService, type StructuredSearchRequest } from '../../services/search';
import type { AutocompleteMatch } from '../../services/autocomplete';
import { favoritesService, type Favorite } from '../../services/favorites';
import { useSearchStore } from '../../store/searchStore';
import type {
  SearchResponse,
  FoodResult,
  RestaurantResult,
  MapBounds,
  Coordinate,
  NaturalSearchRequest,
} from '../../types';
import * as Location from 'expo-location';
import BookmarksOverlay from '../../overlays/BookmarksOverlay';
import PollsOverlay from '../../overlays/PollsOverlay';
import { buildMapStyleURL } from '../../constants/map';
import { useOverlayStore, type OverlayKey } from '../../store/overlayStore';
import type { RootStackParamList } from '../../types/navigation';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import type { QueryPlan } from '../../types';
import { useSearchRequests } from '../../hooks/useSearchRequests';
import SearchHeader from './components/SearchHeader';
import SearchSuggestions from './components/SearchSuggestions';
import SearchFilters from './components/SearchFilters';
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CONTENT_HORIZONTAL_PADDING = OVERLAY_HORIZONTAL_PADDING;
const SEARCH_HORIZONTAL_PADDING = Math.max(8, CONTENT_HORIZONTAL_PADDING - 2);
const CARD_GAP = 4;
const ACTIVE_TAB_COLOR = themeColors.primary;
const MINIMUM_VOTES_FILTER = 100;
const DEFAULT_PAGE_SIZE = 20;
const RESULTS_BOTTOM_PADDING = 375;
const PRICE_LEVEL_VALUES = [0, 1, 2, 3, 4] as const;
type PriceLevelValue = (typeof PRICE_LEVEL_VALUES)[number];
type PriceRangeTuple = [PriceLevelValue, PriceLevelValue];
const PRICE_SLIDER_MIN: PriceLevelValue = PRICE_LEVEL_VALUES[0];
const PRICE_SLIDER_MAX: PriceLevelValue = PRICE_LEVEL_VALUES[PRICE_LEVEL_VALUES.length - 1];
const PRICE_LEVEL_TICK_LABELS: Record<PriceLevelValue, string> = {
  0: 'Free',
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};
const META_FONT_SIZE = 14;
const DISTANCE_MIN_DECIMALS = 1;
const DISTANCE_MAX_DECIMALS = 0;
const USA_FALLBACK_CENTER: [number, number] = [-98.5795, 39.8283];
const USA_FALLBACK_ZOOM = 3.2;
const TOP_FOOD_RENDER_LIMIT = 2;
const SINGLE_LOCATION_ZOOM_LEVEL = 13;
const TIGHT_BOUNDS_THRESHOLD_DEGREES = 0.002;
const RESTAURANT_FIT_BOUNDS_PADDING = 80;
const LABEL_TEXT_SIZE = 12;
const PIN_MARKER_SIZE = 28;
const PIN_MARKER_SCALE = 1;
const PIN_MARKER_RENDER_SIZE = PIN_MARKER_SIZE * PIN_MARKER_SCALE;
const LABEL_RADIAL_OFFSET_EM = 1.3; // keep labels close to pins
const LABEL_TRANSLATE_Y = -PIN_MARKER_RENDER_SIZE * 0.45; // raise labels relative to pin center
const PIN_BASE_WIDTH = 96;
const PIN_BASE_HEIGHT = 96;
const PIN_FILL_WIDTH = 80;
const PIN_FILL_HEIGHT = 72;
const PIN_FILL_SCALE = 0.97;
const PIN_BASE_SCALE = PIN_MARKER_RENDER_SIZE / PIN_BASE_HEIGHT; // single scale applied to base and fill to preserve proportions
const PIN_FILL_VERTICAL_BIAS = -4.8; // nudge up to account for pin tip area
const PIN_FILL_HORIZONTAL_BIAS = -0.1; // tweak left/right centering if asset padding looks uneven
const PIN_FILL_RENDER_WIDTH = PIN_FILL_WIDTH * PIN_BASE_SCALE * PIN_FILL_SCALE;
const PIN_FILL_RENDER_HEIGHT = PIN_FILL_HEIGHT * PIN_BASE_SCALE * PIN_FILL_SCALE;
const PIN_FILL_LEFT_OFFSET =
  (PIN_BASE_WIDTH * PIN_BASE_SCALE - PIN_FILL_RENDER_WIDTH) / 2 +
  PIN_FILL_HORIZONTAL_BIAS * PIN_BASE_SCALE;
const PIN_FILL_TOP_OFFSET =
  (PIN_BASE_HEIGHT * PIN_BASE_SCALE - PIN_FILL_RENDER_HEIGHT) / 2 +
  PIN_FILL_VERTICAL_BIAS * PIN_BASE_SCALE;
const PIN_RANK_TEXT_OFFSET_Y = -1; // lift rank text slightly toward the top of the fill
const AUTOCOMPLETE_MIN_CHARS = 1;
const MARKER_SHADOW_STYLE = {
  shadowColor: 'rgba(0, 0, 0, 0.35)',
  shadowOpacity: 0.45,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 4,
  elevation: 8,
};
const AUTOCOMPLETE_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_THIS_AREA_COLOR = '#0ea5e9';
const MAP_MOVE_MIN_DISTANCE_MILES = 0.1;
const MAP_MOVE_DISTANCE_RATIO = 0.08;

const extractTargetRestaurantId = (
  restaurantFilters?: QueryPlan['restaurantFilters']
): string | null => {
  if (!restaurantFilters?.length) {
    return null;
  }
  const ids = new Set<string>();
  for (const filter of restaurantFilters) {
    if (filter.entityType !== 'restaurant') {
      continue;
    }
    for (const id of filter.entityIds || []) {
      if (typeof id === 'string' && id.trim()) {
        ids.add(id);
      }
    }
  }
  return ids.size === 1 ? Array.from(ids)[0] : null;
};

const resolveSingleRestaurantCandidate = (
  response: SearchResponse | null
): RestaurantResult | null => {
  if (!response?.restaurants?.length) {
    return null;
  }
  const targetedId = extractTargetRestaurantId(response.plan?.restaurantFilters);
  if (targetedId) {
    const match = response.restaurants.find((restaurant) => restaurant.restaurantId === targetedId);
    if (match) {
      return match;
    }
  }
  if (response.format === 'single_list' && response.restaurants.length === 1) {
    return response.restaurants[0];
  }
  return null;
};

const clampPriceLevelValue = (value: number): PriceLevelValue => {
  if (!Number.isFinite(value)) {
    return PRICE_SLIDER_MIN;
  }
  return Math.min(
    PRICE_SLIDER_MAX,
    Math.max(PRICE_SLIDER_MIN, Math.round(value))
  ) as PriceLevelValue;
};

const normalizePriceRangeValues = (range: PriceRangeTuple): PriceRangeTuple => {
  const [rawMin, rawMax] = range;
  const min = clampPriceLevelValue(rawMin);
  const max = clampPriceLevelValue(rawMax);
  return min <= max ? [min, max] : [max, min];
};

const buildLevelsFromRange = (range: PriceRangeTuple): number[] => {
  const [start, end] = normalizePriceRangeValues(range);
  const values: number[] = [];
  for (let value = start; value <= end; value += 1) {
    values.push(value);
  }
  return values;
};

const getRangeFromLevels = (levels: number[]): PriceRangeTuple => {
  if (!levels.length) {
    return [PRICE_SLIDER_MIN, PRICE_SLIDER_MAX];
  }
  const sorted = [...levels].sort((a, b) => a - b);
  return [clampPriceLevelValue(sorted[0]), clampPriceLevelValue(sorted[sorted.length - 1])];
};

const isFullPriceRange = (range: PriceRangeTuple): boolean => {
  const [min, max] = normalizePriceRangeValues(range);
  return min === PRICE_SLIDER_MIN && max === PRICE_SLIDER_MAX;
};

type RgbTuple = [number, number, number];

const QUALITY_GRADIENT_STOPS: Array<{ t: number; color: RgbTuple }> = [
  { t: 0, color: [40, 186, 130] }, // crisp jade green (top rank)
  { t: 0.18, color: [68, 200, 120] }, // steady green, avoids minty drift
  { t: 0.45, color: [255, 201, 94] }, // golden yellow midpoint
  { t: 0.7, color: [255, 157, 75] }, // bright orange transition
  { t: 1, color: [255, 110, 82] }, // warm red-orange (lowest rank)
];

const formatPriceRangeText = (range: PriceRangeTuple): string => {
  const normalized = normalizePriceRangeValues(range);
  if (isFullPriceRange(normalized)) {
    return 'Any price';
  }
  const [min, max] = normalized;
  const minLabel = PRICE_LEVEL_RANGE_LABELS[min] ?? `Level ${min}`;
  const maxLabel = PRICE_LEVEL_RANGE_LABELS[max] ?? `Level ${max}`;
  return min === max ? minLabel : `${minLabel} – ${maxLabel}`;
};

const getQualityColor = (index: number, total: number): string => {
  const t = Math.max(0, Math.min(1, total <= 1 ? 0 : index / Math.max(total - 1, 1)));
  const next =
    QUALITY_GRADIENT_STOPS.find((stop) => stop.t >= t) ??
    QUALITY_GRADIENT_STOPS[QUALITY_GRADIENT_STOPS.length - 1];
  const prev =
    [...QUALITY_GRADIENT_STOPS].reverse().find((stop) => stop.t <= t) ?? QUALITY_GRADIENT_STOPS[0];
  const span = Math.max(next.t - prev.t, 0.0001);
  const localT = (t - prev.t) / span;
  const mix = prev.color.map((channel, channelIndex) =>
    Math.round(channel + (next.color[channelIndex] - channel) * localT)
  ) as RgbTuple;
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
};

const getMarkerZIndex = (rank: unknown, total: number): number => {
  if (typeof rank !== 'number' || !Number.isFinite(rank) || rank <= 0) {
    return 0;
  }
  return Math.max(0, total - rank + 1);
};

const mergeById = <T extends Record<string, unknown>>(
  existing: T[],
  incoming: T[],
  getKey: (item: T) => string
): T[] => {
  if (!existing.length) {
    return incoming.slice();
  }
  const seen = new Set(existing.map((item) => getKey(item)));
  const merged = existing.slice();
  for (const item of incoming) {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }
  return merged;
};

const mergeSearchResponses = (
  previous: SearchResponse | null,
  incoming: SearchResponse,
  append: boolean
): SearchResponse => {
  if (!append || !previous) {
    return incoming;
  }

  const mergedFood = mergeById(
    previous.food ?? [],
    incoming.food ?? [],
    (item) => item.connectionId
  );
  const mergedRestaurants = mergeById(
    previous.restaurants ?? [],
    incoming.restaurants ?? [],
    (item) => item.restaurantId
  );

  return {
    ...incoming,
    food: mergedFood,
    restaurants: mergedRestaurants,
    metadata: {
      ...previous.metadata,
      ...incoming.metadata,
    },
  };
};
type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  contextualScore: number;
  rank: number;
  pinColor: string;
  anchor?: 'top' | 'bottom' | 'left' | 'right';
};
type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
  page?: number;
  append?: boolean;
  preserveSheetState?: boolean;
};

type OpenNowNotice = {
  variant: 'warning' | 'info' | 'success';
  message: string;
};
type MapboxMapRef = InstanceType<typeof MapboxGL.MapView> & {
  getVisibleBounds?: () => Promise<[number[], number[]]>;
};

const isLngLatTuple = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  Number.isFinite(value[0]) &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[1]);

const boundsFromPairs = (first: [number, number], second: [number, number]): MapBounds => {
  const lngs = [first[0], second[0]];
  const lats = [first[1], second[1]];
  return {
    northEast: {
      lat: Math.max(lats[0], lats[1]),
      lng: Math.max(lngs[0], lngs[1]),
    },
    southWest: {
      lat: Math.min(lats[0], lats[1]),
      lng: Math.min(lngs[0], lngs[1]),
    },
  };
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const haversineDistanceMiles = (a: Coordinate, b: Coordinate): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const earthRadiusMiles = 3958.8;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(1 - haversine, 0)));
  return earthRadiusMiles * c;
};

const getBoundsCenter = (bounds: MapBounds): Coordinate => ({
  lat: (bounds.northEast.lat + bounds.southWest.lat) / 2,
  lng: (bounds.northEast.lng + bounds.southWest.lng) / 2,
});

const getBoundsDiagonalMiles = (bounds: MapBounds): number =>
  haversineDistanceMiles(bounds.northEast, bounds.southWest);

const mapStateBoundsToMapBounds = (state?: MapboxMapState | null): MapBounds | null => {
  const bounds = state?.properties?.bounds;
  if (!bounds || !isLngLatTuple(bounds.ne as unknown) || !isLngLatTuple(bounds.sw as unknown)) {
    return null;
  }
  return boundsFromPairs(bounds.ne as [number, number], bounds.sw as [number, number]);
};

const capitalizeFirst = (value: string): string =>
  value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const hasBoundsMovedSignificantly = (previous: MapBounds, next: MapBounds): boolean => {
  const centerShift = haversineDistanceMiles(getBoundsCenter(previous), getBoundsCenter(next));
  const previousDiagonal = Math.max(getBoundsDiagonalMiles(previous), 0.01);
  const nextDiagonal = Math.max(getBoundsDiagonalMiles(next), 0.01);
  const normalizedShift = centerShift / previousDiagonal;
  const sizeDeltaRatio = Math.abs(nextDiagonal - previousDiagonal) / previousDiagonal;
  return (
    centerShift >= MAP_MOVE_MIN_DISTANCE_MILES &&
    (normalizedShift >= MAP_MOVE_DISTANCE_RATIO || sizeDeltaRatio >= MAP_MOVE_DISTANCE_RATIO)
  );
};

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;
type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];

const parseTimeDisplayToMinutes = (value?: string | null): number | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const match = value
    .trim()
    .toLowerCase()
    .match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) {
    return null;
  }
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3];

  if (period === 'pm' && hour < 12) {
    hour += 12;
  } else if (period === 'am' && hour === 12) {
    hour = 0;
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
};

const minutesUntilCloseFromDisplay = (closesAtDisplay?: string | null): number | null => {
  const closeMinutes = parseTimeDisplayToMinutes(closesAtDisplay);
  if (closeMinutes === null) {
    return null;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let diff = closeMinutes - currentMinutes;

  // Handle cross-midnight times (e.g., 1:00 AM close when it's 11:30 PM).
  if (diff < -60) {
    diff += 24 * 60;
  }

  return diff >= 0 ? diff : null;
};

const formatDistanceMiles = (distance?: number | null): string | null => {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
    return null;
  }
  const decimals = distance >= 10 ? DISTANCE_MAX_DECIMALS : DISTANCE_MIN_DECIMALS;
  return `${distance.toFixed(decimals)} mi`;
};
const TOGGLE_BORDER_RADIUS = 8;
const TOGGLE_HORIZONTAL_PADDING = 7;
const TOGGLE_VERTICAL_PADDING = 5;
const TOGGLE_STACK_GAP = 8;
const NAV_TOP_PADDING = 8;
const NAV_BOTTOM_PADDING = 0;
const RESULT_HEADER_ICON_SIZE = 35;
const RESULT_CLOSE_ICON_SIZE = RESULT_HEADER_ICON_SIZE;
const SECONDARY_METRIC_ICON_SIZE = 14;
const VOTE_ICON_SIZE = SECONDARY_METRIC_ICON_SIZE;
const CAMERA_STORAGE_KEY = 'search:lastCamera';
const PollIcon = ({
  color,
  size = SECONDARY_METRIC_ICON_SIZE,
}: {
  color: string;
  size?: number;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: [{ rotate: '90deg' }] }}
  >
    <Path d="M5 21v-6" />
    <Path d="M12 21V3" />
    <Path d="M19 21V9" />
  </Svg>
);
const VoteIcon = ({ color, size = VOTE_ICON_SIZE }: { color: string; size?: number }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344" />
    <Path d="m9 11 3 3L22 4" />
  </Svg>
);

const RECENT_HISTORY_LIMIT = 8;

const normalizePriceFilter = (levels?: number[] | null): number[] => {
  if (!Array.isArray(levels) || levels.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      levels
        .map((level) => Math.round(level))
        .filter((level) => Number.isInteger(level) && level >= 0 && level <= 4)
    )
  ).sort((a, b) => a - b);
};

MapboxGL.setTelemetryEnabled(false);

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const accessToken = React.useMemo(() => process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '', []);
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const latestBoundsRef = React.useRef<MapBounds | null>(null);
  const [mapCenter, setMapCenter] = React.useState<[number, number]>(USA_FALLBACK_CENTER);
  const [mapZoom, setMapZoom] = React.useState<number>(USA_FALLBACK_ZOOM);
  const [isFollowingUser, setIsFollowingUser] = React.useState(true);
  const [cameraHydrated, setCameraHydrated] = React.useState(false);

  React.useEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);

  React.useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Hydrate last camera position to avoid globe spin before we get user location
  React.useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CAMERA_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed &&
            Array.isArray(parsed.center) &&
            parsed.center.length === 2 &&
            typeof parsed.center[0] === 'number' &&
            typeof parsed.center[1] === 'number' &&
            typeof parsed.zoom === 'number'
          ) {
            setMapCenter([parsed.center[0], parsed.center[1]]);
            setMapZoom(parsed.zoom);
          }
        }
      } catch {
        // ignore
      } finally {
        setCameraHydrated(true);
      }
    })();
  }, []);

  React.useEffect(() => {
    void ensureUserLocation();
  }, [ensureUserLocation]);

  React.useEffect(() => {
    if (!userLocation) {
      locationPulse.setValue(0);
      return;
    }
    const pulseAnimation = Animated.loop(
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
    pulseAnimation.start();
    return () => {
      pulseAnimation.stop();
      locationPulse.setValue(0);
    };
  }, [locationPulse, userLocation]);

  React.useEffect(() => {
    if (!userLocation || hasCenteredOnLocationRef.current) {
      return;
    }
    const center: [number, number] = [userLocation.lng, userLocation.lat];
    setMapCenter(center);
    setMapZoom(13);
    hasCenteredOnLocationRef.current = true;
    setIsFollowingUser(false);
    if (cameraRef.current?.setCamera) {
      cameraRef.current.setCamera({
        centerCoordinate: center,
        zoomLevel: 13,
        animationDuration: 0,
        animationMode: 'none',
        pitch: 0,
        heading: 0,
      });
    }
    // persist last camera
    void AsyncStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ center, zoom: 13 })).catch(
      () => undefined
    );
  }, [userLocation]);

  const mapStyleURL = React.useMemo(() => buildMapStyleURL(accessToken), [accessToken]);
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
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [, setShowSuggestions] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressed] = React.useState(false);
  const lastAutocompleteQueryRef = React.useRef<string>('');
  const lastAutocompleteResultsRef = React.useRef<AutocompleteMatch[]>([]);
  const lastAutocompleteTimestampRef = React.useRef<number>(0);
  const [activeTab, setActiveTab] = React.useState<SegmentValue>('dishes');
  const [panelVisible, setPanelVisible] = React.useState(false);
  const [sheetState, setSheetState] = React.useState<SheetPosition>('hidden');
  const [searchLayout, setSearchLayout] = React.useState({ top: 0, height: 0 });
  const [favoriteMap, setFavoriteMap] = React.useState<Map<string, Favorite>>(new Map());
  const [isPriceSelectorVisible, setIsPriceSelectorVisible] = React.useState(false);
  const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
  const [isRecentLoading, setIsRecentLoading] = React.useState(false);
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [restaurantProfile, setRestaurantProfile] = React.useState<RestaurantOverlayData | null>(
    null
  );
  const [isRestaurantOverlayVisible, setRestaurantOverlayVisible] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [hasMoreFood, setHasMoreFood] = React.useState(false);
  const [hasMoreRestaurants, setHasMoreRestaurants] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [isPaginationExhausted, setIsPaginationExhausted] = React.useState(false);
  const [userLocation, setUserLocation] = React.useState<Coordinate | null>(null);
  const [mapMovedSinceSearch, setMapMovedSinceSearch] = React.useState(false);
  const resultsScrollEnabled = sheetState === 'expanded';
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const searchThisAreaVisibility = useSharedValue(0);
  const resultsScrollY = React.useRef(new Animated.Value(0)).current;
  const resultsScrollOffset = useSharedValue(0);
  const draggingFromTop = useSharedValue(false);
  const lastScrollYRef = React.useRef(0);
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);
  const mapMovedSinceSearchRef = React.useRef(false);
  const mapGestureActiveRef = React.useRef(false);
  const mapIdleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetPanRef = React.useRef<PanGestureHandler>(null);
  const headerDividerAnimatedStyle = React.useMemo(
    () => ({
      opacity: resultsScrollY.interpolate({
        inputRange: [0, 12],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    }),
    [resultsScrollY]
  );
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
  const snapPointExpanded = useSharedValue(0);
  const snapPointMiddle = useSharedValue(SCREEN_HEIGHT * 0.4);
  const snapPointCollapsed = useSharedValue(SCREEN_HEIGHT - 160);
  const snapPointHidden = useSharedValue(SCREEN_HEIGHT + 80);
  const sheetStateShared = useSharedValue<SheetPosition>('hidden');
  const recentHistoryRequest = React.useRef<Promise<void> | null>(null);
  const searchSurfaceAnim = useSharedValue(0);
  const inputRef = React.useRef<TextInput | null>(null);
  const resultsScrollRef = React.useRef<FlashList<FoodResult | RestaurantResult> | null>(null);
  const scrollGestureRef = React.useRef<NativeViewGestureHandler | null>(null);
  const locationRequestInFlightRef = React.useRef(false);
  const userLocationRef = React.useRef<Coordinate | null>(null);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const locationPulse = React.useRef(new Animated.Value(0)).current;
  const hasCenteredOnLocationRef = React.useRef(false);
  const filterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestSeqRef = React.useRef(0);
  const activeSearchRequestRef = React.useRef(0);
  const { activeOverlay, overlayParams, setOverlay } = useOverlayStore();
  const isSearchOverlay = activeOverlay === 'search';
  const showBookmarksOverlay = activeOverlay === 'bookmarks';
  const showPollsOverlay = activeOverlay === 'polls';
  const pollOverlayParams = overlayParams.polls;
  const handleOverlaySelect = React.useCallback(
    (target: OverlayKey) => {
      setOverlay(target);
      if (target === 'search') {
        inputRef.current?.focus();
      } else {
        inputRef.current?.blur();
      }
    },
    [setOverlay]
  );
  const { runAutocomplete, runSearch, cancelAutocomplete, cancelSearch, isAutocompleteLoading } =
    useSearchRequests();
  const handleProfilePress = React.useCallback(() => {
    navigation.navigate('Profile');
  }, [navigation]);
  const navItems = React.useMemo(
    () =>
      [
        { key: 'search' as OverlayKey, label: 'Search' },
        { key: 'bookmarks' as OverlayKey, label: 'Saves' },
        { key: 'polls' as OverlayKey, label: 'Polls' },
        { key: 'profile' as OverlayKey, label: 'Profile' },
      ] as const,
    []
  );
  const navIconRenderers = React.useMemo<
    Record<OverlayKey, (color: string, active: boolean) => React.ReactNode>
  >(
    () => ({
      search: (color: string, active: boolean) => (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
            fill={active ? color : 'none'}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <SvgCircle
            cx="12"
            cy="10"
            r="4"
            fill={active ? '#ffffff' : 'none'}
            stroke={color}
            strokeWidth={2}
          />
        </Svg>
      ),
      bookmarks: (color: string, active: boolean) => (
        <Heart
          size={20}
          color={color}
          strokeWidth={active ? 0 : 2}
          fill={active ? color : 'none'}
        />
      ),
      polls: (color: string, active: boolean) => <PollIcon color={color} size={20} />,
      profile: (color: string, active: boolean) => {
        if (active) {
          return (
            <Svg width={20} height={20} viewBox="0 0 24 24" fill={color} stroke="none">
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
            width={20}
            height={20}
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
  const openNow = useSearchStore((state) => state.openNow);
  const setOpenNow = useSearchStore((state) => state.setOpenNow);
  const priceLevels = useSearchStore((state) => state.priceLevels);
  const setPriceLevels = useSearchStore((state) => state.setPriceLevels);
  const votes100Plus = useSearchStore((state) => state.votes100Plus);
  const setVotes100Plus = useSearchStore((state) => state.setVotes100Plus);
  const [pendingPriceRange, setPendingPriceRange] = React.useState<PriceRangeTuple>(() =>
    getRangeFromLevels(priceLevels)
  );
  const [priceSliderWidth, setPriceSliderWidth] = React.useState(0);
  const priceFiltersActive = priceLevels.length > 0;
  const priceButtonSummary = React.useMemo(() => {
    if (!priceLevels.length) {
      return 'Any price';
    }
    return formatPriceRangeText(getRangeFromLevels(priceLevels));
  }, [priceLevels]);
  const priceButtonLabelText = priceFiltersActive ? priceButtonSummary : 'Price';
  const pendingPriceSummary = React.useMemo(
    () => formatPriceRangeText(pendingPriceRange),
    [pendingPriceRange]
  );
  const trimmedQuery = query.trim();
  const hasTypedQuery = trimmedQuery.length > 0;
  const shouldShowRecentSection = isSearchOverlay && isSearchFocused && !hasTypedQuery;
  const shouldRenderAutocompleteSection =
    isSearchOverlay &&
    isSearchFocused &&
    !isAutocompleteSuppressed &&
    trimmedQuery.length >= AUTOCOMPLETE_MIN_CHARS;
  const shouldRenderSuggestionPanel = shouldRenderAutocompleteSection || shouldShowRecentSection;
  const searchSurfaceAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchSurfaceAnim.value,
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    elevation: 0,
  }));
  const searchBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 }],
  }));
  const hasRecentSearches = recentSearches.length > 0;
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
  const restaurantScoreLabel = React.useMemo(() => {
    if (primaryFoodTerm) {
      return `${primaryFoodTerm.toLowerCase()} score`;
    }
    return 'Dish score';
  }, [primaryFoodTerm]);
  const renderMetaDetailLine = (
    status: OperatingStatus | null | undefined,
    priceLabel?: string | null,
    distanceMiles?: number | null,
    align: 'left' | 'right' = 'left',
    prefix?: React.ReactNode,
    showLocationDetails = true
  ): React.ReactNode => {
    const segments: React.ReactNode[] = [];
    if (prefix) {
      segments.push(
        <Text
          key="meta-prefix"
          variant="caption"
          weight="regular"
          style={[styles.resultMetaText, styles.resultMetaPrefix]}
          numberOfLines={1}
        >
          {prefix}
        </Text>
      );
    }
    const normalizedPriceLabel = priceLabel ?? null;
    const distanceLabel = formatDistanceMiles(distanceMiles);
    const effectiveMinutesUntilClose =
      status?.isOpen && typeof status.closesInMinutes === 'number'
        ? status.closesInMinutes
        : status?.isOpen
          ? minutesUntilCloseFromDisplay(status?.closesAtDisplay)
          : null;
    const isClosingSoon =
      status?.isOpen &&
      typeof effectiveMinutesUntilClose === 'number' &&
      effectiveMinutesUntilClose <= 45;

    if (status) {
      if (segments.length) {
        segments.push(
          <Text
            key={`separator-${segments.length}`}
            variant="caption"
            style={[styles.resultMetaSeparator, { fontSize: META_FONT_SIZE }]}
          >
            {' · '}
          </Text>
        );
      }
      if (isClosingSoon) {
        segments.push(
          <Text key="status-closing-soon" variant="caption" weight="semibold">
            <Text variant="caption" weight="semibold" style={styles.resultMetaClosingSoon}>
              Closes
            </Text>
            {status.closesAtDisplay ? (
              <Text
                variant="caption"
                style={styles.resultMetaSuffix}
              >{` at ${status.closesAtDisplay}`}</Text>
            ) : null}
          </Text>
        );
      } else if (status.isOpen) {
        segments.push(
          <Text key="status-open" variant="caption" weight="semibold">
            <Text variant="caption" weight="semibold" style={styles.resultMetaOpen}>
              Open
            </Text>
            {status.closesAtDisplay ? (
              <Text
                variant="caption"
                style={styles.resultMetaSuffix}
              >{` until ${status.closesAtDisplay}`}</Text>
            ) : null}
          </Text>
        );
      } else if (status.isOpen === false) {
        segments.push(
          <Text key="status-closed" variant="caption" weight="semibold">
            <Text variant="caption" weight="semibold" style={styles.resultMetaClosed}>
              Closed
            </Text>
            {status.nextOpenDisplay ? (
              <Text
                variant="caption"
                style={styles.resultMetaSuffix}
              >{` until ${status.nextOpenDisplay}`}</Text>
            ) : null}
          </Text>
        );
      }
    }

    if (showLocationDetails) {
      if (normalizedPriceLabel) {
        if (segments.length) {
          segments.push(
            <Text
              key={`separator-${segments.length}`}
              variant="caption"
              style={[styles.resultMetaSeparator, { fontSize: META_FONT_SIZE }]}
            >
              {' · '}
            </Text>
          );
        }
        segments.push(
          <Text key="price" variant="caption" style={styles.resultMetaPrice}>
            {normalizedPriceLabel}
          </Text>
        );
      }
      if (distanceLabel) {
        if (segments.length) {
          segments.push(
            <Text
              key={`separator-${segments.length}`}
              variant="caption"
              style={[styles.resultMetaSeparator, { fontSize: META_FONT_SIZE }]}
            >
              {' · '}
            </Text>
          );
        }
        segments.push(
          <Text
            key="distance"
            variant="caption"
            style={[styles.resultMetaDistance, { fontSize: META_FONT_SIZE }]}
          >
            {distanceLabel}
          </Text>
        );
      }
    }
    if (!segments.length) {
      return null;
    }
    return (
      <Text
        variant="caption"
        weight="regular"
        style={[
          styles.resultMetaText,
          { fontSize: META_FONT_SIZE },
          align === 'right' && styles.resultMetaTextRight,
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {segments}
      </Text>
    );
  };
  const bottomInset = Math.max(insets.bottom, 12);
  const shouldHideBottomNav = isSearchOverlay && (isSearchSessionActive || isLoading);
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
  }, [cancelAutocomplete, query, showCachedSuggestionsIfFresh]);
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
  const ensureUserLocation = React.useCallback(async (): Promise<Coordinate | null> => {
    if (userLocationRef.current) {
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
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: 60_000,
      });

      const coords: Coordinate = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setUserLocation(coords);
      userLocationRef.current = coords;

      if (!locationWatchRef.current) {
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
              userLocationRef.current = nextCoords;
              setUserLocation(nextCoords);
            }
          );
        } catch (watchError) {
          logger.warn('Failed to start location watcher', {
            message: watchError instanceof Error ? watchError.message : 'unknown',
          });
        }
      }

      return coords;
    } catch (locationError) {
      logger.warn('Failed to capture user location', {
        message: locationError instanceof Error ? locationError.message : 'unknown',
      });
      return null;
    } finally {
      locationRequestInFlightRef.current = false;
    }
  }, []);
  React.useEffect(() => {
    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  const handleSearchResponse = React.useCallback(
    (
      response: SearchResponse,
      options: {
        append: boolean;
        targetPage: number;
        submittedLabel?: string;
        pushToHistory?: boolean;
      }
    ) => {
      const { append, targetPage, submittedLabel, pushToHistory } = options;

      let previousFoodCountSnapshot = 0;
      let previousRestaurantCountSnapshot = 0;
      let mergedFoodCount = response.food?.length ?? 0;
      let mergedRestaurantCount = response.restaurants?.length ?? 0;

      setResults((prev) => {
        const base = append ? prev : null;
        previousFoodCountSnapshot = base?.food?.length ?? 0;
        previousRestaurantCountSnapshot = base?.restaurants?.length ?? 0;
        const merged = mergeSearchResponses(base, response, append);
        mergedFoodCount = merged.food?.length ?? 0;
        mergedRestaurantCount = merged.restaurants?.length ?? 0;
        return merged;
      });

      const singleRestaurantCandidate = resolveSingleRestaurantCandidate(response);

      if (!singleRestaurantCandidate) {
        const totalFoodAvailable = response.metadata.totalFoodResults ?? mergedFoodCount;
        const totalRestaurantAvailable =
          response.metadata.totalRestaurantResults ?? mergedRestaurantCount;

        const nextHasMoreFood = mergedFoodCount < totalFoodAvailable;
        const nextHasMoreRestaurants =
          response.format === 'dual_list'
            ? mergedRestaurantCount < totalRestaurantAvailable
            : false;

        setHasMoreFood(nextHasMoreFood);
        setHasMoreRestaurants(nextHasMoreRestaurants);
        setCurrentPage(targetPage);

        if (
          append &&
          (!(
            mergedFoodCount > previousFoodCountSnapshot ||
            mergedRestaurantCount > previousRestaurantCountSnapshot
          ) ||
            (!nextHasMoreFood && !nextHasMoreRestaurants))
        ) {
          setIsPaginationExhausted(true);
        }
      }

      if (!append) {
        if (submittedLabel) {
          setSubmittedQuery(submittedLabel);
        } else {
          setSubmittedQuery('');
        }

        const singleRestaurant = resolveSingleRestaurantCandidate(response);

        if (!singleRestaurant) {
          const hasFoodResults = response?.food?.length > 0;
          const hasRestaurantsResults =
            (response?.restaurants?.length ?? 0) > 0 || response?.format === 'single_list';

          setActiveTab((prevTab) => {
            if (prevTab === 'dishes' && hasFoodResults) {
              return 'dishes';
            }
            if (prevTab === 'restaurants' && hasRestaurantsResults) {
              return 'restaurants';
            }
            return hasFoodResults ? 'dishes' : 'restaurants';
          });
        }

        if (submittedLabel && pushToHistory) {
          updateLocalRecentSearches(submittedLabel);
          void loadRecentHistory();
        }

        Keyboard.dismiss();
        setIsPaginationExhausted(false);
        scrollResultsToTop();

        if (singleRestaurant) {
          setPanelVisible(false);
          setSheetState('hidden');
          sheetStateShared.value = 'hidden';
        } else {
          showPanel();
        }
      }
    },
    [
      setResults,
      setHasMoreFood,
      setHasMoreRestaurants,
      setCurrentPage,
      setSubmittedQuery,
      setActiveTab,
      updateLocalRecentSearches,
      loadRecentHistory,
      scrollResultsToTop,
      setPanelVisible,
      setSheetState,
      sheetStateShared,
      showPanel,
    ]
  );

  const buildStructuredSearchPayload = React.useCallback(
    async (page: number): Promise<StructuredSearchRequest> => {
      const pagination = { page, pageSize: DEFAULT_PAGE_SIZE };
      const payload: StructuredSearchRequest = {
        entities: {},
        pagination,
      };

      const effectiveOpenNow = openNow;
      const normalizedPriceLevels = normalizePriceFilter(priceLevels);
      const effectiveMinimumVotes = votes100Plus ? MINIMUM_VOTES_FILTER : null;

      if (effectiveOpenNow) {
        payload.openNow = true;
      }

      if (normalizedPriceLevels.length > 0) {
        payload.priceLevels = normalizedPriceLevels;
      }

      if (typeof effectiveMinimumVotes === 'number' && effectiveMinimumVotes > 0) {
        payload.minimumVotes = effectiveMinimumVotes;
      }

      const shouldCaptureBounds = page === 1 && mapRef.current?.getVisibleBounds;
      if (shouldCaptureBounds) {
        try {
          const visibleBounds = await mapRef.current!.getVisibleBounds();
          if (
            Array.isArray(visibleBounds) &&
            visibleBounds.length >= 2 &&
            isLngLatTuple(visibleBounds[0]) &&
            isLngLatTuple(visibleBounds[1])
          ) {
            payload.bounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
            latestBoundsRef.current = payload.bounds;
          }
        } catch (boundsError) {
          logger.warn('Unable to determine map bounds before submitting structured search', {
            message: boundsError instanceof Error ? boundsError.message : 'unknown error',
          });
        }
      }

      if (!payload.bounds && latestBoundsRef.current) {
        payload.bounds = latestBoundsRef.current;
      }

      const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
      if (resolvedLocation) {
        payload.userLocation = resolvedLocation;
      }

      return payload;
    },
    [
      openNow,
      priceLevels,
      votes100Plus,
      ensureUserLocation,
      mapRef,
      latestBoundsRef,
      userLocationRef,
    ]
  );

  const onResultsScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = event.nativeEvent;
      const offsetY = contentOffset?.y ?? 0;
      resultsScrollOffset.value = offsetY;
      if (draggingFromTop.value && offsetY > 0.5) {
        draggingFromTop.value = false;
      }
      resultsScrollY.setValue(offsetY);
      lastScrollYRef.current = offsetY;
    },
    [draggingFromTop, resultsScrollY]
  );

  const handleResultsScrollBeginDrag = React.useCallback(() => {
    // Track whether the list drag began at the very top so we can hand off to the sheet pan.
    draggingFromTop.value = resultsScrollOffset.value <= 0.5;
  }, [draggingFromTop, resultsScrollOffset]);

  const handleResultsScrollEndDrag = React.useCallback(() => {
    draggingFromTop.value = false;
  }, [draggingFromTop]);
  const handleQueryChange = React.useCallback((value: string) => {
    setIsAutocompleteSuppressed(false);
    setQuery(value);
  }, []);
  const restaurants = results?.restaurants ?? [];
  const dishes = results?.food ?? [];
  const loadFavorites = React.useCallback(async () => {
    try {
      const data = await favoritesService.list();
      setFavoriteMap(new Map(data.map((favorite) => [favorite.entityId, favorite])));
    } catch (favoriteError) {
      logger.warn('Failed to load favorites', {
        error: favoriteError instanceof Error ? favoriteError.message : 'unknown',
      });
    }
  }, []);

  React.useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

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
    runAutocomplete(trimmed, { debounceMs: 250 })
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

  const restaurantFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const features: Feature<Point, RestaurantFeatureProperties>[] = [];

    restaurants.forEach((restaurant, restaurantIndex) => {
      const rank = restaurantIndex + 1;
      const pinColor = getQualityColor(restaurantIndex, restaurants.length);
      const locationCandidates: Array<{
        locationId?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        isPrimary?: boolean | null;
      }> =
        Array.isArray(restaurant.locations) && restaurant.locations.length > 0
          ? restaurant.locations
          : restaurant.displayLocation
            ? [restaurant.displayLocation]
            : typeof restaurant.latitude === 'number' && typeof restaurant.longitude === 'number'
              ? [
                  {
                    locationId: restaurant.restaurantLocationId ?? restaurant.restaurantId,
                    latitude: restaurant.latitude,
                    longitude: restaurant.longitude,
                    isPrimary: true,
                  },
                ]
              : [];

      locationCandidates.forEach((location, locationIndex) => {
        if (
          typeof location?.latitude !== 'number' ||
          !Number.isFinite(location.latitude) ||
          typeof location?.longitude !== 'number' ||
          !Number.isFinite(location.longitude)
        ) {
          return;
        }

        const locationId =
          (location as { locationId?: string }).locationId ??
          `${restaurant.restaurantId}-loc-${locationIndex}`;

        const featureId = `${restaurant.restaurantId}-${locationId}`;
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
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [restaurants]);

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

  // No sticky anchors; keep labels relative to pin geometry only.

  const openNowNotice = null;

  // Intentionally avoid auto-fitting the map when results change; keep user camera position.

  const snapPoints = React.useMemo<Record<SheetPosition, number>>(() => {
    const expanded = Math.max(searchLayout.top, 0);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const collapsed = SCREEN_HEIGHT - 130;
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle: Math.min(middle, hidden - 120),
      collapsed,
      hidden,
    };
  }, [insets.top, searchLayout]);
  const shouldRenderSheet =
    isSearchOverlay && !isSearchFocused && (panelVisible || sheetState !== 'hidden');

  React.useEffect(() => {
    if (!isSearchOverlay) {
      setPanelVisible(false);
      setSheetState('hidden');
      sheetStateShared.value = 'hidden';
      sheetTranslateY.value = snapPoints.hidden;
    }
  }, [isSearchOverlay, snapPoints.hidden, sheetStateShared, sheetTranslateY]);

  React.useEffect(() => {
    snapPointExpanded.value = snapPoints.expanded;
    snapPointMiddle.value = snapPoints.middle;
    snapPointCollapsed.value = snapPoints.collapsed;
    snapPointHidden.value = snapPoints.hidden;
  }, [snapPoints, snapPointCollapsed, snapPointExpanded, snapPointHidden, snapPointMiddle]);

  React.useEffect(() => {
    if (!isSearchOverlay && isRestaurantOverlayVisible) {
      setRestaurantOverlayVisible(false);
    }
  }, [isSearchOverlay, isRestaurantOverlayVisible]);

  React.useEffect(() => {
    sheetStateShared.value = sheetState;
  }, [sheetState, sheetStateShared]);

  React.useEffect(() => {
    if (!results) {
      resetMapMoveFlag();
    }
  }, [resetMapMoveFlag, results]);

  React.useEffect(() => {
    if (!panelVisible) {
      sheetTranslateY.value = snapPoints.hidden;
    }
  }, [panelVisible, sheetTranslateY, snapPoints.hidden]);
  const animateSheetTo = React.useCallback(
    (position: SheetPosition, velocity = 0) => {
      const target = snapPoints[position];
      setSheetState(position);
      sheetStateShared.value = position;
      if (position !== 'hidden') {
        setPanelVisible(true);
      }
      sheetTranslateY.value = withSpring(
        target,
        {
          ...SHEET_SPRING_CONFIG,
          velocity,
        },
        (finished) => {
          if (finished && position === 'hidden') {
            runOnJS(setPanelVisible)(false);
          }
        }
      );
    },
    [snapPoints, setPanelVisible, sheetStateShared, sheetTranslateY]
  );

  const sheetPanGesture = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    SheetGestureContext
  >(
    {
      onStart: (event, context) => {
        context.startY = sheetTranslateY.value;
        const currentState =
          sheetStateShared.value === 'hidden' ? 'collapsed' : sheetStateShared.value;
        const startIndex = SHEET_STATES.indexOf(currentState);
        context.startStateIndex = startIndex >= 0 ? startIndex : SHEET_STATES.length - 1;
        context.isHeaderDrag = typeof event.absoluteY === 'number' ? event.absoluteY <= 200 : true;
        context.canDriveSheet = false;
        context.isExpandedAtStart = sheetStateShared.value === 'expanded';
      },
      onActive: (event, context) => {
        const isListAtTop = resultsScrollOffset.value <= 0.5;
        const pullingDown = event.translationY > 0;
        const isExpandedStart = context.isExpandedAtStart;
        const startedAtTop = draggingFromTop.value;

        if (!context.isHeaderDrag && isExpandedStart) {
          // When expanded, allow pull-down from anywhere in the list as long as we're at the top.
          if (!pullingDown || (!startedAtTop && !isListAtTop)) {
            return;
          }
        }

        context.canDriveSheet = true;
        const minY = snapPointExpanded.value;
        const maxY = snapPointHidden.value;
        sheetTranslateY.value = clampValue(context.startY + event.translationY, minY, maxY);
      },
      onEnd: (event, context) => {
        if (!context.canDriveSheet) {
          return;
        }

        const allowedStates: SheetPosition[] = ['expanded', 'middle', 'collapsed'];
        const snapFor = (state: SheetPosition) =>
          snapPointForState(
            state,
            snapPointExpanded.value,
            snapPointMiddle.value,
            snapPointCollapsed.value,
            snapPointHidden.value
          );

        const projected = context.startY + event.translationY;

        const startStateRaw = SHEET_STATES[context.startStateIndex] ?? 'collapsed';
        let startAllowedIndex = allowedStates.indexOf(startStateRaw as SheetPosition);
        if (startAllowedIndex < 0) {
          const distancesToAllowed = allowedStates.map((state) =>
            Math.abs(snapFor(state) - context.startY)
          );
          const minDist = Math.min(...distancesToAllowed);
          startAllowedIndex = Math.max(distancesToAllowed.indexOf(minDist), 0);
        }

        let candidateIndex = startAllowedIndex;
        const translationY = event.translationY;

        if (translationY > 0) {
          let remaining = translationY;
          for (let i = startAllowedIndex; i < allowedStates.length - 1; i += 1) {
            const segment = snapFor(allowedStates[i + 1]) - snapFor(allowedStates[i]);
            if (remaining >= segment * 0.4) {
              candidateIndex = i + 1;
              remaining -= segment;
            } else {
              break;
            }
          }
        } else if (translationY < 0) {
          let remaining = Math.abs(translationY);
          for (let i = startAllowedIndex; i > 0; i -= 1) {
            const segment = snapFor(allowedStates[i]) - snapFor(allowedStates[i - 1]);
            if (remaining >= segment * 0.4) {
              candidateIndex = i - 1;
              remaining -= segment;
            } else {
              break;
            }
          }
        }

        const distancesToProjected = allowedStates.map((state) =>
          Math.abs(snapFor(state) - projected)
        );
        const nearestIndex = Math.max(
          distancesToProjected.indexOf(Math.min(...distancesToProjected)),
          0
        );

        const targetIndex = candidateIndex !== startAllowedIndex ? candidateIndex : nearestIndex;
        const targetState: SheetPosition =
          allowedStates[targetIndex] ?? allowedStates[allowedStates.length - 1];

        runOnJS(animateSheetTo)(targetState, Math.max(Math.min(event.velocityY, 2500), -2500));
      },
    },
    [animateSheetTo]
  );

  const searchBarInputAnimatedStyle = useAnimatedStyle(() => {
    const visibility = interpolate(
      sheetTranslateY.value,
      [snapPointExpanded.value, snapPointMiddle.value],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity: visibility };
  });
  const searchBarSheetAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      sheetTranslateY.value,
      [snapPointExpanded.value, snapPointMiddle.value],
      [0, 1],
      Extrapolation.CLAMP
    );
    // Keep the bar solid briefly, then fade quickly so it's gone before overlap.
    const opacity = interpolate(
      progress,
      [0, 0.3, 0.5, 0.7, 1],
      [0, 0, 0.15, 0.9, 1],
      Extrapolation.CLAMP
    );
    const borderAlpha = interpolate(
      progress,
      [0, 0.3, 0.6, 0.85, 1],
      [0.1, 0.25, 0.5, 0.75, 0.95],
      Extrapolation.CLAMP
    );
    const scale = interpolate(progress, [0, 1], [0.96, 1], Extrapolation.CLAMP);

    return {
      opacity,
      backgroundColor: '#ffffff',
      borderColor: `rgba(229, 231, 235, ${borderAlpha})`,
      transform: [{ scale }],
      display: opacity < 0.02 ? 'none' : 'flex',
    };
  });
  const resultsContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));
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

  const showPanel = React.useCallback(() => {
    if (!panelVisible) {
      setPanelVisible(true);
    }
    requestAnimationFrame(() => {
      animateSheetTo('middle');
    });
  }, [panelVisible, animateSheetTo]);

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
  }, [isLoading, isPriceSelectorVisible, commitPriceSelection, priceLevels]);

  const toggleVotesFilter = React.useCallback(() => {
    const nextValue = !votes100Plus;
    setVotes100Plus(nextValue);
    if (query.trim()) {
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current);
      }
      filterDebounceRef.current = setTimeout(() => {
        filterDebounceRef.current = null;
        void submitSearch({
          minimumVotes: nextValue ? MINIMUM_VOTES_FILTER : null,
          preserveSheetState: true,
        });
      }, 150);
    }
  }, [votes100Plus, setVotes100Plus, query, submitSearch]);

  const loadRecentHistory = React.useCallback(async () => {
    if (!isSignedIn) {
      setIsRecentLoading(false);
      setRecentSearches([]);
      return;
    }

    if (recentHistoryRequest.current) {
      return recentHistoryRequest.current;
    }

    const request = (async () => {
      setIsRecentLoading(true);
      try {
        const history = await searchService.recentHistory(RECENT_HISTORY_LIMIT);
        setRecentSearches(history);
      } catch (err) {
        logger.warn('Unable to load recent searches', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
      } finally {
        setIsRecentLoading(false);
        recentHistoryRequest.current = null;
      }
    })();

    recentHistoryRequest.current = request;
    return request;
  }, [isSignedIn]);

  const updateLocalRecentSearches = React.useCallback((value: string) => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }
    const normalized = trimmedValue.toLowerCase();
    setRecentSearches((prev) => {
      const withoutMatch = prev.filter((entry) => entry.toLowerCase() !== normalized);
      return [trimmedValue, ...withoutMatch].slice(0, RECENT_HISTORY_LIMIT);
    });
  }, []);

  const scrollResultsToTop = React.useCallback(() => {
    if (resultsScrollRef.current?.scrollToOffset) {
      resultsScrollRef.current.scrollToOffset({ offset: 0, animated: false });
    }
  }, []);

  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions, overrideQuery?: string) => {
      const append = Boolean(options?.append);
      if (!append && isLoading) {
        return;
      }
      if (append && (isLoading || isLoadingMore)) {
        return;
      }
      if (!append) {
        resetMapMoveFlag();
      }

      const targetPage = options?.page && options.page > 0 ? options.page : 1;
      const baseQuery = overrideQuery ?? query;
      const trimmed = baseQuery.trim();
      if (!trimmed) {
        if (!append) {
          setResults(null);
          setSubmittedQuery('');
          setError(null);
          setHasMoreFood(false);
          setHasMoreRestaurants(false);
          setCurrentPage(1);
        }
        return;
      }
      const requestId = ++searchRequestSeqRef.current;
      activeSearchRequestRef.current = requestId;

      if (!append) {
        const preserveSheetState = Boolean(options?.preserveSheetState);
        if (!preserveSheetState) {
          setPanelVisible(false);
          setSheetState('hidden');
          sheetStateShared.value = 'hidden';
          sheetTranslateY.value = snapPoints.hidden;
        }
        setSearchMode('natural');
        setIsSearchSessionActive(true);
        setIsAutocompleteSuppressed(true);
        setShowSuggestions(false);
        setHasMoreFood(false);
        setHasMoreRestaurants(false);
        setCurrentPage(targetPage);
        lastAutoOpenKeyRef.current = null;
      }

      const effectiveOpenNow = options?.openNow ?? openNow;
      const effectivePriceLevels =
        options?.priceLevels !== undefined ? options.priceLevels : priceLevels;
      const normalizedPriceLevels = normalizePriceFilter(effectivePriceLevels);
      const effectiveMinimumVotes =
        options?.minimumVotes !== undefined
          ? options.minimumVotes
          : votes100Plus
            ? MINIMUM_VOTES_FILTER
            : null;

      try {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
          setError(null);
        }

        const payload: NaturalSearchRequest = {
          query: trimmed,
          pagination: { page: targetPage, pageSize: DEFAULT_PAGE_SIZE },
        };

        if (effectiveOpenNow) {
          payload.openNow = true;
        }

        if (normalizedPriceLevels.length > 0) {
          payload.priceLevels = normalizedPriceLevels;
        }

        if (typeof effectiveMinimumVotes === 'number' && effectiveMinimumVotes > 0) {
          payload.minimumVotes = effectiveMinimumVotes;
        }

        const shouldCaptureBounds = !append && mapRef.current?.getVisibleBounds;
        if (shouldCaptureBounds) {
          try {
            const visibleBounds = await mapRef.current!.getVisibleBounds();
            if (
              Array.isArray(visibleBounds) &&
              visibleBounds.length >= 2 &&
              isLngLatTuple(visibleBounds[0]) &&
              isLngLatTuple(visibleBounds[1])
            ) {
              payload.bounds = boundsFromPairs(visibleBounds[0], visibleBounds[1]);
              latestBoundsRef.current = payload.bounds;
            }
          } catch (boundsError) {
            logger.warn('Unable to determine map bounds before submitting search', {
              message: boundsError instanceof Error ? boundsError.message : 'unknown error',
            });
          }
        }

        if (!payload.bounds && latestBoundsRef.current) {
          payload.bounds = latestBoundsRef.current;
        }

        const resolvedLocation = userLocationRef.current ?? (await ensureUserLocation());
        if (resolvedLocation) {
          payload.userLocation = resolvedLocation;
        }

        const response = await runSearch({ kind: 'natural', payload });
        if (response && requestId === activeSearchRequestRef.current) {
          logger.info('Search response payload', response);

          handleSearchResponse(response, {
            append,
            targetPage,
            submittedLabel: trimmed,
            pushToHistory: !append,
          });
        }
      } catch (err) {
        logger.error('Search request failed', { message: (err as Error).message });
        if (requestId === activeSearchRequestRef.current) {
          if (!append) {
            showPanel();
          }
          setError(
            append
              ? 'Unable to load more results. Please try again.'
              : 'Unable to fetch results. Please try again.'
          );
        }
      } finally {
        if (requestId === activeSearchRequestRef.current) {
          if (append) {
            setIsLoadingMore(false);
          } else {
            setIsLoading(false);
          }
        }
      }
    },
    [
      isLoading,
      isLoadingMore,
      query,
      openNow,
      priceLevels,
      votes100Plus,
      showPanel,
      loadRecentHistory,
      updateLocalRecentSearches,
      setIsSearchSessionActive,
      setIsAutocompleteSuppressed,
      setShowSuggestions,
      setHasMoreFood,
      setHasMoreRestaurants,
      setCurrentPage,
      setSubmittedQuery,
      setActiveTab,
      runSearch,
      canLoadMore,
      scrollResultsToTop,
      handleSearchResponse,
      ensureUserLocation,
      snapPoints.hidden,
      sheetStateShared,
      sheetTranslateY,
      setPanelVisible,
      setSheetState,
      setSearchMode,
      resetMapMoveFlag,
    ]
  );

  const handleSubmit = React.useCallback(() => {
    setIsSearchFocused(false);
    setIsAutocompleteSuppressed(true);
    Keyboard.dismiss();
    void submitSearch();
  }, [setIsAutocompleteSuppressed, setIsSearchFocused, submitSearch]);

  const runBestHere = React.useCallback(
    async (
      targetTab: SegmentValue,
      submittedLabel: string,
      options?: { preserveSheetState?: boolean }
    ) => {
      if (isLoading || isLoadingMore) {
        return;
      }

      resetMapMoveFlag();
      const preserveSheetState = Boolean(options?.preserveSheetState);
      setSearchMode('shortcut');
      setIsSearchSessionActive(true);
      setActiveTab(targetTab);
      setError(null);
      if (!preserveSheetState) {
        setPanelVisible(false);
        setSheetState('hidden');
        sheetStateShared.value = 'hidden';
        sheetTranslateY.value = snapPoints.hidden;
      }
      setHasMoreFood(false);
      setHasMoreRestaurants(false);
      setIsPaginationExhausted(false);
      setCurrentPage(1);
      lastAutoOpenKeyRef.current = null;
      setIsAutocompleteSuppressed(true);
      setShowSuggestions(false);
      Keyboard.dismiss();

      try {
        setIsLoading(true);
        const payload = await buildStructuredSearchPayload(1);
        const response = await runSearch({ kind: 'structured', payload });
        if (response) {
          logger.info('Structured search response payload', response);
          handleSearchResponse(response, {
            append: false,
            targetPage: 1,
            submittedLabel,
            pushToHistory: false,
          });
        }
      } catch (err) {
        logger.error('Best here request failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        setError('Unable to fetch results. Please try again.');
        showPanel();
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      isLoadingMore,
      setIsSearchSessionActive,
      setActiveTab,
      setError,
      setPanelVisible,
      setSheetState,
      sheetStateShared,
      sheetTranslateY,
      setHasMoreFood,
      setHasMoreRestaurants,
      setIsPaginationExhausted,
      setCurrentPage,
      setIsAutocompleteSuppressed,
      setShowSuggestions,
      buildStructuredSearchPayload,
      handleSearchResponse,
      showPanel,
      snapPoints.hidden,
      lastAutoOpenKeyRef,
      setSearchMode,
      runSearch,
      resetMapMoveFlag,
    ]
  );

  const handleBestDishesHere = React.useCallback(() => {
    setQuery('Best dishes');
    void runBestHere('dishes', 'Best dishes');
  }, [runBestHere, setQuery]);

  const handleBestRestaurantsHere = React.useCallback(() => {
    setQuery('Best restaurants');
    void runBestHere('restaurants', 'Best restaurants');
  }, [runBestHere, setQuery]);

  const handleSearchThisArea = React.useCallback(() => {
    if (isLoading || isLoadingMore || !results) {
      return;
    }

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
    runBestHere,
    searchMode,
    submitSearch,
    submittedQuery,
  ]);

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
      const nextQuery = match.name;
      setQuery(nextQuery);
      setShowSuggestions(false);
      setSuggestions([]);
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      void submitSearch(undefined, nextQuery);
    },
    [submitSearch, setIsAutocompleteSuppressed, setIsSearchFocused]
  );

  const clearSearchState = React.useCallback(
    ({ shouldRefocusInput = false }: { shouldRefocusInput?: boolean } = {}) => {
      cancelSearch();
      cancelAutocomplete();
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
      setHasMoreFood(false);
      setHasMoreRestaurants(false);
      setCurrentPage(1);
      setIsLoadingMore(false);
      setIsPaginationExhausted(false);
      lastAutoOpenKeyRef.current = null;
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
      cancelAutocomplete,
      cancelSearch,
      hidePanel,
      setIsSearchSessionActive,
      setSearchMode,
      scrollResultsToTop,
      resetMapMoveFlag,
    ]
  );

  const handleClear = React.useCallback(() => {
    clearSearchState({ shouldRefocusInput: true });
  }, [clearSearchState]);

  const handleCloseResults = React.useCallback(() => {
    clearSearchState();
  }, [clearSearchState]);

  const handleSearchFocus = React.useCallback(() => {
    setIsSearchFocused(true);
    setIsAutocompleteSuppressed(false);
    void loadRecentHistory();
  }, [loadRecentHistory]);

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
      setQuery(trimmedValue);
      setShowSuggestions(false);
      setSuggestions([]);
      updateLocalRecentSearches(trimmedValue);
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      void submitSearch(undefined, trimmedValue);
    },
    [submitSearch, updateLocalRecentSearches, setIsAutocompleteSuppressed, setIsSearchFocused]
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
      if (!isSearchOverlay || !results || !isSearchSessionActive) {
        return;
      }

      const bounds = mapStateBoundsToMapBounds(state);
      if (!bounds) {
        return;
      }

      if (!latestBoundsRef.current) {
        latestBoundsRef.current = bounds;
      }

      const isGestureActive = Boolean(state?.gestures?.isGestureActive);
      mapGestureActiveRef.current = isGestureActive;

      if (isGestureActive) {
        if (sheetState !== 'hidden' && sheetState !== 'collapsed' && !isLoading && !isLoadingMore) {
          animateSheetTo('collapsed');
        }
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
      animateSheetTo,
      isLoading,
      isLoadingMore,
      isSearchOverlay,
      isSearchSessionActive,
      markMapMoved,
      results,
      scheduleMapIdleReveal,
      sheetState,
    ]
  );
  const loadMoreShortcutResults = React.useCallback(() => {
    if (isLoading || isLoadingMore || !results || !canLoadMore || isPaginationExhausted) {
      return;
    }

    const nextPage = currentPage + 1;

    const run = async () => {
      try {
        setIsLoadingMore(true);
        const payload = await buildStructuredSearchPayload(nextPage);
        const response = await runSearch({ kind: 'structured', payload });
        if (response) {
          logger.info('Structured search pagination payload', response);
          handleSearchResponse(response, {
            append: true,
            targetPage: nextPage,
            submittedLabel: submittedQuery || 'Best dishes here',
            pushToHistory: false,
          });
        }
      } catch (err) {
        logger.error('Best dishes here pagination failed', {
          message: err instanceof Error ? err.message : 'unknown error',
        });
        setError('Unable to load more results. Please try again.');
      } finally {
        setIsLoadingMore(false);
      }
    };

    void run();
  }, [
    isLoading,
    isLoadingMore,
    results,
    canLoadMore,
    isPaginationExhausted,
    currentPage,
    buildStructuredSearchPayload,
    handleSearchResponse,
    submittedQuery,
    setIsLoadingMore,
    setError,
    runSearch,
  ]);

  const loadMoreResults = React.useCallback(() => {
    if (isLoading || isLoadingMore || !results || !canLoadMore || isPaginationExhausted) {
      return;
    }
    if (searchMode === 'shortcut') {
      loadMoreShortcutResults();
      return;
    }
    const nextPage = currentPage + 1;
    const activeQuery = submittedQuery || query;
    if (!activeQuery.trim()) {
      return;
    }
    void submitSearch({ page: nextPage, append: true }, activeQuery);
  }, [
    isLoading,
    isLoadingMore,
    results,
    canLoadMore,
    isPaginationExhausted,
    searchMode,
    loadMoreShortcutResults,
    currentPage,
    submittedQuery,
    query,
    submitSearch,
  ]);

  const toggleOpenNow = React.useCallback(() => {
    setIsPriceSelectorVisible(false);
    const nextValue = !openNow;
    setOpenNow(nextValue);

    if (query.trim()) {
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current);
      }
      filterDebounceRef.current = setTimeout(() => {
        filterDebounceRef.current = null;
        void submitSearch({ openNow: nextValue, preserveSheetState: true });
      }, 150);
    }
  }, [openNow, query, setOpenNow, submitSearch]);

  const handlePriceSliderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { width } = event.nativeEvent.layout;
      if (Math.abs(width - priceSliderWidth) > 2) {
        setPriceSliderWidth(width);
      }
    },
    [priceSliderWidth]
  );

  const handlePriceSliderChange = React.useCallback((values: number[]) => {
    if (!Array.isArray(values) || values.length === 0) {
      return;
    }
    const nextRange: PriceRangeTuple = [
      clampPriceLevelValue(values[0]),
      clampPriceLevelValue(values[values.length - 1] ?? values[0]),
    ];
    setPendingPriceRange(normalizePriceRangeValues(nextRange));
  }, []);

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
    if (query.trim()) {
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current);
      }
      filterDebounceRef.current = setTimeout(() => {
        filterDebounceRef.current = null;
        void submitSearch({ priceLevels: nextLevels, page: 1, preserveSheetState: true });
      }, 150);
    }
  }, [pendingPriceRange, priceLevels, query, setPriceLevels, submitSearch]);

  const handlePriceDone = React.useCallback(() => {
    commitPriceSelection();
  }, [commitPriceSelection]);

  const toggleFavorite = React.useCallback(
    async (entityId: string, entityType: FavoriteEntityType) => {
      if (!entityId) {
        return;
      }
      const existing = favoriteMap.get(entityId);
      if (existing) {
        setFavoriteMap((prev) => {
          const next = new Map(prev);
          next.delete(entityId);
          return next;
        });
        try {
          if (!existing.favoriteId.startsWith('temp-')) {
            await favoritesService.remove(existing.favoriteId);
          }
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status === 404) {
            logger.warn('Favorite already removed remotely; syncing local state', { entityId });
          } else {
            logger.error('Failed to remove favorite', error);
            setFavoriteMap((prev) => {
              const next = new Map(prev);
              next.set(entityId, existing);
              return next;
            });
          }
        }
        return;
      }

      const optimistic: Favorite = {
        favoriteId: `temp-${entityId}`,
        entityId,
        entityType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entity: null,
      };

      setFavoriteMap((prev) => {
        const next = new Map(prev);
        next.set(entityId, optimistic);
        return next;
      });

      try {
        const saved = await favoritesService.add(entityId, entityType);
        setFavoriteMap((prev) => {
          const next = new Map(prev);
          next.set(entityId, saved);
          return next;
        });
      } catch (error) {
        logger.error('Failed to add favorite', error);
        setFavoriteMap((prev) => {
          const next = new Map(prev);
          if (next.get(entityId)?.favoriteId === optimistic.favoriteId) {
            next.delete(entityId);
          }
          return next;
        });
      }
    },
    [favoriteMap]
  );

  const openRestaurantProfile = React.useCallback(
    (restaurant: RestaurantResult, foodResultsOverride?: FoodResult[]) => {
      const sourceDishes = foodResultsOverride ?? dishes;
      const restaurantDishes = sourceDishes
        .filter((dish) => dish.restaurantId === restaurant.restaurantId)
        .sort((a, b) => b.qualityScore - a.qualityScore);
      const label = (submittedQuery || trimmedQuery || 'Search').trim();
      setRestaurantProfile({
        restaurant,
        dishes: restaurantDishes,
        queryLabel: label,
        isFavorite: favoriteMap.has(restaurant.restaurantId),
      });
      setRestaurantOverlayVisible(true);
    },
    [dishes, favoriteMap, submittedQuery, trimmedQuery]
  );

  React.useEffect(() => {
    if (!results) {
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
    openRestaurantProfile(targetRestaurant, results.food ?? []);
    lastAutoOpenKeyRef.current = autoOpenKey;
  }, [openRestaurantProfile, results, submittedQuery, trimmedQuery]);

  React.useEffect(() => {
    if (!restaurantProfile) {
      return;
    }
    const isFavorite = favoriteMap.has(restaurantProfile.restaurant.restaurantId);
    if (isFavorite !== restaurantProfile.isFavorite) {
      setRestaurantProfile((prev) => (prev ? { ...prev, isFavorite } : prev));
    }
  }, [favoriteMap, restaurantProfile]);

  const handleRestaurantFavoriteToggle = React.useCallback(
    (restaurantId: string) => {
      void toggleFavorite(restaurantId);
    },
    [toggleFavorite]
  );

  const closeRestaurantProfile = React.useCallback(() => {
    setRestaurantOverlayVisible(false);
  }, []);

  const handleRestaurantOverlayDismissed = React.useCallback(() => {
    setRestaurantProfile(null);
    setRestaurantOverlayVisible(false);
  }, []);
  const renderDishCard = (item: FoodResult, index: number) => {
    const isLiked = favoriteMap.has(item.foodId);
    const qualityColor = getQualityColor(index, dishes.length);
    const restaurantForDish = restaurantsById.get(item.restaurantId);
    const dishPriceLabel = getPriceRangeLabel(item.restaurantPriceLevel);
    const dishNameLine = renderMetaDetailLine(
      null,
      dishPriceLabel,
      null,
      'left',
      item.restaurantName
    );
    const dishDetailsLine = renderMetaDetailLine(
      item.restaurantOperatingStatus,
      null,
      item.restaurantDistanceMiles,
      'left',
      undefined,
      true
    );
    const handleShare = () => {
      void Share.share({
        message: `${item.foodName} at ${item.restaurantName} · View on Crave Search`,
      }).catch(() => undefined);
    };
    const handleDishPress = () => {
      if (restaurantForDish) {
        openRestaurantProfile(restaurantForDish);
      }
    };
    return (
      <View key={item.connectionId} style={styles.resultItem}>
        <Pressable
          style={styles.resultPressable}
          onPress={handleDishPress}
          accessibilityRole={restaurantForDish ? 'button' : undefined}
          accessibilityLabel={restaurantForDish ? `View ${item.restaurantName}` : undefined}
          disabled={!restaurantForDish}
        >
          <View style={styles.resultHeader}>
            <View style={styles.resultTitleContainer}>
              <View style={styles.titleRow}>
                <View style={[styles.rankBadge, { backgroundColor: qualityColor }]}>
                  <Text style={styles.rankBadgeText}>{index + 1}</Text>
                </View>
                <Text
                  variant="subtitle"
                  weight="semibold"
                  style={styles.textSlate900}
                  numberOfLines={1}
                >
                  {item.foodName}
                </Text>
              </View>
              {dishNameLine ? (
                <View style={[styles.resultMetaLine, styles.dishMetaLineFirst]}>
                  {dishNameLine}
                </View>
              ) : null}
              {dishDetailsLine ? (
                <View style={[styles.resultMetaLine, styles.dishMetaLineSpacing]}>
                  {dishDetailsLine}
                </View>
              ) : null}
              <View style={styles.metricBlock}>
                <View style={[styles.metricStripe, { backgroundColor: qualityColor }]} />
                <View style={styles.metricValueRow}>
                  <Text variant="body" weight="semibold" style={styles.metricValue}>
                    {item.qualityScore.toFixed(1)}
                  </Text>
                  <Text variant="caption" weight="regular" style={styles.metricLabel}>
                    Dish score
                  </Text>
                </View>
                <View style={[styles.metricCountersInline, styles.metricCountersStacked]}>
                  <View style={styles.metricCounterItem}>
                    <PollIcon color={themeColors.textBody} size={SECONDARY_METRIC_ICON_SIZE} />
                    <Text variant="caption" weight="regular" style={styles.metricCounterText}>
                      {item.mentionCount}
                    </Text>
                  </View>
                  <View style={styles.metricCounterItem}>
                    <VoteIcon color={themeColors.textBody} size={VOTE_ICON_SIZE} />
                    <Text variant="caption" weight="regular" style={styles.metricCounterText}>
                      {item.totalUpvotes}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={styles.resultActions}>
              <Pressable
                onPress={() => toggleFavorite(item.foodId, 'food')}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                style={styles.likeButton}
                hitSlop={8}
              >
                <LucideHeart
                  size={20}
                  color={isLiked ? themeColors.primary : '#cbd5e1'}
                  fill={isLiked ? themeColors.primary : 'none'}
                  strokeWidth={2}
                />
              </Pressable>
              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Share"
                style={styles.shareButton}
                hitSlop={8}
              >
                <LucideShare size={20} color="#cbd5e1" strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const renderRestaurantCard = (restaurant: RestaurantResult, index: number) => {
    const isLiked = favoriteMap.has(restaurant.restaurantId);
    const qualityColor = getQualityColor(index, restaurants.length);
    const priceRangeLabel = getPriceRangeLabel(restaurant.priceLevel);
    const restaurantMetaLine = renderMetaDetailLine(
      restaurant.operatingStatus,
      priceRangeLabel ?? null,
      restaurant.distanceMiles,
      'left',
      undefined,
      true
    );
    const handleShare = () => {
      void Share.share({
        message: `${restaurant.restaurantName} · View on Crave Search`,
      }).catch(() => undefined);
    };
    return (
      <View key={restaurant.restaurantId} style={styles.resultItem}>
        <Pressable
          style={styles.resultPressable}
          onPress={() => openRestaurantProfile(restaurant)}
          accessibilityRole="button"
          accessibilityLabel={`View ${restaurant.restaurantName}`}
        >
          <View style={styles.resultHeader}>
            <View style={styles.resultTitleContainer}>
              <View style={styles.titleRow}>
                <View style={[styles.rankBadge, { backgroundColor: qualityColor }]}>
                  <Text style={styles.rankBadgeText}>{index + 1}</Text>
                </View>
                <Text
                  variant="subtitle"
                  weight="semibold"
                  style={styles.textSlate900}
                  numberOfLines={1}
                >
                  {restaurant.restaurantName}
                </Text>
              </View>
              {restaurantMetaLine ? (
                <View style={styles.resultMetaLine}>{restaurantMetaLine}</View>
              ) : null}
              <View style={styles.metricBlock}>
                <View style={[styles.metricStripe, { backgroundColor: qualityColor }]} />
                <View style={styles.metricValueRow}>
                  <Text variant="body" weight="semibold" style={styles.metricValue}>
                    {restaurant.contextualScore.toFixed(1)}
                  </Text>
                  <Text variant="caption" weight="regular" style={styles.metricLabel}>
                    {capitalizeFirst(restaurantScoreLabel.toLowerCase())}
                  </Text>
                </View>
                {restaurant.restaurantQualityScore !== null &&
                restaurant.restaurantQualityScore !== undefined ? (
                  <View style={styles.metricSupportBlock}>
                    <View style={styles.metricSupportStripe} />
                    <View style={styles.metricSupportRow}>
                      <Text variant="caption" weight="semibold" style={styles.metricSupportValue}>
                        {restaurant.restaurantQualityScore.toFixed(1)}
                      </Text>
                      <Text variant="caption" weight="regular" style={styles.metricSupportLabel}>
                        Overall
                      </Text>
                    </View>
                    <View style={[styles.metricCountersInline, styles.metricCountersStacked]}>
                      {restaurant.mentionCount != null ? (
                        <View style={styles.metricCounterItem}>
                          <PollIcon
                            color={themeColors.textBody}
                            size={SECONDARY_METRIC_ICON_SIZE}
                          />
                          <Text variant="caption" weight="regular" style={styles.metricCounterText}>
                            {restaurant.mentionCount}
                          </Text>
                        </View>
                      ) : null}
                      {restaurant.totalUpvotes != null ? (
                        <View style={styles.metricCounterItem}>
                          <VoteIcon color={themeColors.textBody} size={VOTE_ICON_SIZE} />
                          <Text variant="caption" weight="regular" style={styles.metricCounterText}>
                            {restaurant.totalUpvotes}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.resultActions}>
              <Pressable
                onPress={() => toggleFavorite(restaurant.restaurantId, 'restaurant')}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                style={styles.likeButton}
                hitSlop={8}
              >
                <LucideHeart
                  size={20}
                  color={isLiked ? themeColors.primary : '#cbd5e1'}
                  fill={isLiked ? themeColors.primary : 'none'}
                  strokeWidth={2}
                />
              </Pressable>
              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Share"
                style={styles.shareButton}
                hitSlop={8}
              >
                <LucideShare size={20} color="#cbd5e1" strokeWidth={2} />
              </Pressable>
            </View>
          </View>
          <View style={styles.resultContent}>
            {restaurant.topFood?.length ? (
              <View style={styles.topFoodSection}>
                <View style={styles.topFoodHeader}>
                  <Text variant="caption" weight="semibold" style={styles.topFoodLabel}>
                    Relevant dishes
                  </Text>
                  <View style={styles.topFoodDivider} />
                </View>
                {restaurant.topFood.slice(0, TOP_FOOD_RENDER_LIMIT).map((food, idx) => (
                  <View key={food.connectionId} style={styles.topFoodRow}>
                    <View style={styles.topFoodLeft}>
                      <View style={styles.topFoodRankPill}>
                        <Text variant="caption" weight="semibold" style={styles.topFoodRankText}>
                          {idx + 1}
                        </Text>
                      </View>
                      <Text
                        variant="caption"
                        weight="regular"
                        style={styles.topFoodName}
                        numberOfLines={1}
                      >
                        {food.foodName}
                      </Text>
                    </View>
                    <Text variant="caption" weight="regular" style={styles.topFoodScore}>
                      {food.qualityScore.toFixed(1)}
                    </Text>
                  </View>
                ))}
                {restaurant.topFood.length > TOP_FOOD_RENDER_LIMIT ? (
                  <Text variant="caption" weight="semibold" style={styles.topFoodMore}>
                    +{restaurant.topFood.length - TOP_FOOD_RENDER_LIMIT} more
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
    );
  };

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
      pendingPriceRange={pendingPriceRange}
      onPriceChange={handlePriceSliderChange}
      onPriceDone={handlePriceDone}
      onPriceSliderLayout={handlePriceSliderLayout}
      priceSliderWidth={priceSliderWidth}
      priceLevelValues={Array.from(PRICE_LEVEL_VALUES)}
      priceTickLabels={PRICE_LEVEL_TICK_LABELS}
      pendingPriceSummary={pendingPriceSummary}
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
    () => (Array.isArray(resultsData) ? resultsData : []),
    [resultsData]
  );
  const flatListDebugData = React.useMemo(() => {
    const length = safeResultsData.length;
    const sample = length > 0 ? safeResultsData[0] : null;
    return { isDishesTab, length, sampleType: sample ? typeof sample : 'nullish' };
  }, [isDishesTab, safeResultsData]);

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
  const listHeader = React.useMemo(
    () => <View style={styles.resultsListHeader}>{filtersHeader}</View>,
    [filtersHeader]
  );
  const renderFlashListScrollComponent = React.useMemo(
    () =>
      React.forwardRef<any, any>((scrollProps, scrollRef) => {
        const { contentContainerStyle, style, ...restProps } = scrollProps ?? {};
        return (
          <NativeViewGestureHandler ref={scrollGestureRef} simultaneousHandlers={[sheetPanRef]}>
            <Animated.ScrollView
              {...restProps}
              ref={scrollRef}
              style={[styles.resultsScroll, style]}
              contentContainerStyle={[styles.resultsScrollContent, contentContainerStyle]}
              bounces={false}
              alwaysBounceVertical={false}
              overScrollMode="never"
              scrollEnabled={resultsScrollEnabled}
            />
          </NativeViewGestureHandler>
        );
      }),
    [resultsScrollEnabled, scrollGestureRef, sheetPanRef]
  );

  const flatListProps: FlashListProps<FoodResult | RestaurantResult> = React.useMemo(
    () => ({
      data: safeResultsData,
      renderItem: renderSafeItem,
      keyExtractor: isDishesTab ? dishKeyExtractor : restaurantKeyExtractor,
      ListHeaderComponent: listHeader,
      ListFooterComponent: (
        <View style={styles.loadMoreSpacer}>
          {isLoadingMore && canLoadMore ? (
            <ActivityIndicator size="small" color={ACTIVE_TAB_COLOR} />
          ) : null}
        </View>
      ),
      ListEmptyComponent: (
        <EmptyState
          message={
            activeTab === 'dishes'
              ? 'No dishes found. Try adjusting your search.'
              : 'No restaurants found. Try adjusting your search.'
          }
        />
      ),
      contentContainerStyle: styles.resultsScrollContent,
      testID: 'search-results-flatlist',
      extraData: flatListDebugData,
      estimatedItemSize: 240,
      showsVerticalScrollIndicator: false,
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'on-drag',
      onScroll: onResultsScroll,
      onScrollBeginDrag: handleResultsScrollBeginDrag,
      onScrollEndDrag: handleResultsScrollEndDrag,
      scrollEventThrottle: 16,
      bounces: false,
      alwaysBounceVertical: false,
      overScrollMode: 'never',
      scrollEnabled: resultsScrollEnabled,
      onEndReached: canLoadMore ? loadMoreResults : undefined,
      onEndReachedThreshold: 0.2,
      renderScrollComponent: renderFlashListScrollComponent,
    }),
    [
      activeTab,
      canLoadMore,
      dishKeyExtractor,
      flatListDebugData,
      filtersHeader,
      handleResultsScrollBeginDrag,
      handleResultsScrollEndDrag,
      isDishesTab,
      isLoadingMore,
      listHeader,
      loadMoreResults,
      onResultsScroll,
      renderSafeItem,
      restaurantKeyExtractor,
      renderFlashListScrollComponent,
      resultsScrollEnabled,
      safeResultsData,
    ]
  );
  const searchThisAreaTop = Math.max(searchLayout.top + searchLayout.height + 12, insets.top + 12);
  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={mapStyleURL}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onPress={handleMapPress}
        onCameraChanged={handleCameraChanged}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={mapCenter ?? USA_FALLBACK_CENTER}
          zoomLevel={mapZoom}
          followUserLocation={isFollowingUser}
          followZoomLevel={13}
          followPitch={0}
          followHeading={0}
          animationMode="none"
          animationDuration={0}
          pitch={32}
        />
        {sortedRestaurantMarkers.length ? (
          <React.Fragment key={`markers-${markersRenderKey}`}>
            {sortedRestaurantMarkers.map((feature) => {
              const coordinates = feature.geometry.coordinates as [number, number];
              const markerKey = buildMarkerKey(feature);
              const zIndex = getMarkerZIndex(
                feature.properties.rank,
                sortedRestaurantMarkers.length
              );
              return (
                <MapboxGL.MarkerView
                  key={markerKey}
                  id={`restaurant-marker-${markerKey}`}
                  coordinate={coordinates}
                  anchor={{ x: 0.5, y: 1 }}
                  allowOverlap
                  style={[styles.markerView, { zIndex }]}
                >
                  <View style={[styles.pinWrapper, styles.pinShadow]}>
                    <Image source={pinAsset} style={styles.pinBase} />
                    <Image
                      source={pinFillAsset}
                      style={[
                        styles.pinFill,
                        {
                          tintColor: feature.properties.pinColor,
                        },
                      ]}
                    />
                    <Text style={styles.pinRank}>{feature.properties.rank}</Text>
                  </View>
                </MapboxGL.MarkerView>
              );
            })}
          </React.Fragment>
        ) : null}
        {restaurantFeatures.features.length ? (
          <MapboxGL.ShapeSource id="restaurant-source" shape={restaurantFeatures}>
            <MapboxGL.SymbolLayer id="restaurant-labels" style={restaurantLabelStyle} />
          </MapboxGL.ShapeSource>
        ) : null}
        {userLocation ? (
          <MapboxGL.MarkerView
            id="user-location"
            coordinate={[userLocation.lng, userLocation.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
          >
            <View style={styles.userLocationWrapper}>
              <View style={styles.userLocationShadow}>
                <BlurView intensity={25} tint="light" style={styles.userLocationHaloWrapper}>
                  <Animated.View
                    style={[
                      styles.userLocationDot,
                      {
                        transform: [
                          {
                            scale: locationPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1.4, 1.8],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                </BlurView>
              </View>
            </View>
          </MapboxGL.MarkerView>
        ) : null}
      </MapboxGL.MapView>

      {isSearchOverlay && (
        <SafeAreaView
          style={styles.overlay}
          pointerEvents="box-none"
          edges={['top', 'left', 'right']}
        >
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
            <Animated.ScrollView
              style={styles.searchSurfaceScroll}
              contentContainerStyle={[
                styles.searchSurfaceContent,
                {
                  paddingTop: searchLayout.top + searchLayout.height + 8,
                  paddingBottom: bottomInset + 32,
                },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <SearchSuggestions
                visible={shouldRenderSuggestionPanel}
                showAutocomplete={shouldRenderAutocompleteSection}
                showRecent={shouldShowRecentSection}
                suggestions={suggestions}
                recentSearches={recentSearches}
                hasRecentSearches={hasRecentSearches}
                isAutocompleteLoading={isAutocompleteLoading}
                isRecentLoading={isRecentLoading}
                onSelectSuggestion={handleSuggestionPress}
                onSelectRecent={handleRecentSearchPress}
                contentHorizontalPadding={CONTENT_HORIZONTAL_PADDING}
              />
            </Animated.ScrollView>
          </Reanimated.View>
          <View
            pointerEvents={sheetState === 'expanded' ? 'none' : 'auto'}
            style={styles.searchContainer}
            onLayout={({ nativeEvent: { layout } }) => {
              setSearchLayout((prev) => {
                if (prev.top === layout.y && prev.height === layout.height) {
                  return prev;
                }

                return { top: layout.y, height: layout.height };
              });
            }}
          >
            <SearchHeader
              value={query}
              placeholder="What are you craving?"
              loading={isLoading}
              onChangeText={handleQueryChange}
              onSubmit={handleSubmit}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              onClear={handleClear}
              onPress={focusSearchInput}
              accentColor={ACTIVE_TAB_COLOR}
              showBack={Boolean(isSearchOverlay && isSearchFocused)}
              onBackPress={handleCloseResults}
              inputRef={inputRef}
              inputAnimatedStyle={searchBarInputAnimatedStyle}
              containerAnimatedStyle={[searchBarSheetAnimatedStyle, searchBarAnimatedStyle]}
              editable
              showInactiveSearchIcon={!isSearchFocused && !isSearchSessionActive}
            />
          </View>
          {!isSearchFocused && !isSearchSessionActive && (
            <View style={styles.searchShortcutsRow} pointerEvents="box-none">
              <Pressable
                onPress={handleBestDishesHere}
                style={styles.searchShortcutChip}
                accessibilityRole="button"
                accessibilityLabel="Show best dishes here"
                hitSlop={8}
              >
                <View style={styles.searchShortcutContent}>
                  <HandPlatter size={16} color="#0f172a" strokeWidth={2} />
                  <Text variant="caption" weight="regular" style={styles.searchShortcutChipText}>
                    Best dishes
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={handleBestRestaurantsHere}
                style={styles.searchShortcutChip}
                accessibilityRole="button"
                accessibilityLabel="Show best restaurants here"
                hitSlop={8}
              >
                <View style={styles.searchShortcutContent}>
                  <Store size={16} color="#0f172a" strokeWidth={2} />
                  <Text variant="caption" weight="regular" style={styles.searchShortcutChipText}>
                    Best restaurants
                  </Text>
                </View>
              </Pressable>
            </View>
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
              <Text variant="caption" weight="semibold" style={styles.searchThisAreaText}>
                Search this area
              </Text>
            </Pressable>
          </Reanimated.View>
          {shouldRenderSheet ? (
            <>
              <Reanimated.View
                pointerEvents="none"
                style={[styles.resultsShadow, resultsContainerAnimatedStyle]}
              />
              <PanGestureHandler
                ref={sheetPanRef}
                onGestureEvent={sheetPanGesture}
                simultaneousHandlers={[scrollGestureRef]}
              >
                <Reanimated.View
                  style={[overlaySheetStyles.container, resultsContainerAnimatedStyle]}
                  pointerEvents={panelVisible ? 'auto' : 'none'}
                >
                  <FrostedGlassBackground />

                  <Reanimated.View style={overlaySheetStyles.header}>
                    <View style={overlaySheetStyles.grabHandleWrapper}>
                      <Pressable
                        onPress={hidePanel}
                        accessibilityRole="button"
                        accessibilityLabel="Hide results"
                      >
                        <View style={overlaySheetStyles.grabHandle} />
                      </Pressable>
                    </View>
                    <View
                      style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}
                    >
                      <Text variant="subtitle" weight="semibold" style={styles.submittedQueryLabel}>
                        {submittedQuery || 'Results'}
                      </Text>
                      <Pressable
                        onPress={handleCloseResults}
                        accessibilityRole="button"
                        accessibilityLabel="Close results"
                        style={styles.resultsCloseButton}
                        hitSlop={8}
                      >
                        <XCircleIcon size={RESULT_CLOSE_ICON_SIZE} color={ACTIVE_TAB_COLOR} />
                      </Pressable>
                    </View>
                    <Animated.View
                      style={[overlaySheetStyles.headerDivider, headerDividerAnimatedStyle]}
                    />
                  </Reanimated.View>

                  {error ? (
                    <View style={[styles.resultsCard, styles.resultsCardSurface]}>
                      <Text variant="caption" style={styles.textRed600}>
                        {error}
                      </Text>
                    </View>
                  ) : isLoading && !results ? (
                    <View
                      style={[
                        styles.resultsCard,
                        styles.resultsCardSurface,
                        styles.resultsCardCentered,
                      ]}
                    >
                      <ActivityIndicator size="large" color="#FB923C" />
                      <Text variant="body" style={[styles.textSlate600, styles.loadingText]}>
                        Looking for the best matches...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.resultsCard}>
                      <FlashList ref={resultsScrollRef} {...flatListProps} />
                    </View>
                  )}
                </Reanimated.View>
              </PanGestureHandler>
            </>
          ) : null}
        </SafeAreaView>
      )}
      {!shouldHideBottomNav && (
        <View style={styles.bottomNavWrapper} pointerEvents="box-none">
          <View style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_BOTTOM_PADDING }]}>
            {navItems.map((item) => {
              const active = activeOverlay === item.key;
              const iconColor = active ? ACTIVE_TAB_COLOR : '#94a3b8';
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
                      variant="caption"
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
                    variant="caption"
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
      <BookmarksOverlay visible={showBookmarksOverlay} />
      <PollsOverlay visible={showPollsOverlay} params={pollOverlayParams} />
      <RestaurantOverlay
        visible={isRestaurantOverlayVisible && Boolean(restaurantProfile)}
        data={restaurantProfile}
        onRequestClose={closeRestaurantProfile}
        onDismiss={handleRestaurantOverlayDismissed}
        onToggleFavorite={handleRestaurantFavoriteToggle}
      />
    </View>
  );
};

const toggleContentPaddingStyle = {
  paddingHorizontal: TOGGLE_HORIZONTAL_PADDING,
  paddingVertical: TOGGLE_VERTICAL_PADDING,
};

const toggleBaseStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: TOGGLE_BORDER_RADIUS,
  borderWidth: 1,
  borderColor: '#cbd5e1',
  backgroundColor: '#ffffff',
  ...toggleContentPaddingStyle,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  map: StyleSheet.absoluteFillObject,
  markerView: {
    flex: 0,
    alignSelf: 'flex-start',
  },
  pinWrapper: {
    width: PIN_MARKER_RENDER_SIZE,
    height: PIN_MARKER_RENDER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pinShadow: {
    ...MARKER_SHADOW_STYLE,
  },
  pinBase: {
    position: 'absolute',
    width: PIN_BASE_WIDTH * PIN_BASE_SCALE,
    height: PIN_BASE_HEIGHT * PIN_BASE_SCALE,
    resizeMode: 'contain',
  },
  pinFill: {
    position: 'absolute',
    width: PIN_FILL_RENDER_WIDTH,
    height: PIN_FILL_RENDER_HEIGHT,
    resizeMode: 'contain',
    left: PIN_FILL_LEFT_OFFSET,
    top: PIN_FILL_TOP_OFFSET,
  },
  pinRank: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    transform: [{ translateY: PIN_RANK_TEXT_OFFSET_Y }],
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingBottom: 24,
  },
  searchContainer: {
    paddingHorizontal: SEARCH_HORIZONTAL_PADDING,
    paddingTop: 10,
    zIndex: 20,
  },
  searchShortcutsRow: {
    paddingHorizontal: SEARCH_HORIZONTAL_PADDING,
    marginBottom: 8,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    zIndex: 25,
  },
  searchShortcutChip: {
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginRight: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.5,
    elevation: 2,
  },
  searchShortcutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  searchThisAreaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  searchThisAreaButton: {
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.5,
    elevation: 2,
  },
  searchThisAreaText: {
    color: SEARCH_THIS_AREA_COLOR,
  },
  searchShortcutChipText: {
    color: '#0f172a',
  },
  promptCardTopShadow: {
    borderRadius: 0,
  },
  promptCardWrapper: {
    borderRadius: 0,
  },
  promptCard: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 52,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  promptInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 8,
  },
  searchBarTint: {
    backgroundColor: 'transparent',
  },
  searchSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
    zIndex: 10,
  },
  searchSurfaceScroll: {
    flex: 1,
  },
  searchSurfaceContent: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingVertical: 12,
  },
  autocompleteSectionSurface: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(241, 245, 249, 0.8)',
  },
  recentSectionSurface: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(241, 245, 249, 0.8)',
  },
  autocompleteLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompleteLoadingText: {
    fontSize: 13,
    color: '#475569',
    marginLeft: 8,
  },
  autocompleteEmptyText: {
    paddingHorizontal: 0,
    paddingVertical: 10,
    fontSize: 13,
    color: '#94a3b8',
  },
  autocompleteItem: {
    paddingHorizontal: 0,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompleteItemLast: {
    borderBottomWidth: 0,
  },
  autocompletePrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  autocompleteSecondaryText: {
    fontSize: 12,
    color: themeColors.textBody,
    textTransform: 'capitalize',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recentHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  recentRowFirst: {
    borderTopWidth: 0,
  },
  recentIcon: {
    marginRight: 10,
  },
  recentText: {
    fontSize: 14,
    color: themeColors.textPrimary,
    flex: 1,
  },
  searchIcon: {
    marginRight: 12,
  },
  promptInput: {
    flex: 1,
    fontSize: 16,
    color: themeColors.textPrimary,
    textAlign: 'left',
    paddingVertical: 0,
    height: '100%',
  },
  trailingContainer: {
    marginLeft: 'auto',
    minWidth: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  trailingButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingPlaceholder: {
    width: 24,
    height: 24,
  },
  filterButtonsScroll: {
    flexGrow: 0,
    marginHorizontal: -CONTENT_HORIZONTAL_PADDING,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
  },
  filterButtonsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: TOGGLE_STACK_GAP,
    paddingRight: 4,
  },
  priceButton: {
    ...toggleBaseStyle,
  },
  priceButtonActive: {
    borderRadius: TOGGLE_BORDER_RADIUS,
    backgroundColor: ACTIVE_TAB_COLOR,
    borderColor: ACTIVE_TAB_COLOR,
  },
  priceButtonDisabled: {
    opacity: 0.6,
  },
  priceButtonBullet: {
    marginRight: 6,
    fontSize: 18,
    color: '#94a3b8',
    marginTop: -2,
  },
  priceButtonBulletActive: {
    color: '#ffffff',
  },
  priceButtonLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  priceButtonLabelActive: {
    color: '#ffffff',
  },
  priceButtonChevron: {
    marginLeft: 8,
  },
  priceSelector: {
    marginTop: TOGGLE_STACK_GAP,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: TOGGLE_STACK_GAP,
    backgroundColor: '#ffffff',
  },
  priceSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priceFilterLabel: {
    color: '#475569',
  },
  priceSelectorValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  priceDoneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: ACTIVE_TAB_COLOR,
  },
  priceDoneButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  priceSliderWrapper: {
    width: '100%',
    paddingHorizontal: 4,
  },
  priceSlider: {
    height: 30,
  },
  priceSliderTrack: {
    height: 6,
    borderRadius: 999,
  },
  priceSliderSelected: {
    backgroundColor: ACTIVE_TAB_COLOR,
  },
  priceSliderUnselected: {
    backgroundColor: '#e2e8f0',
  },
  priceSliderMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: ACTIVE_TAB_COLOR,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  priceSliderMarkerActive: {
    backgroundColor: '#fff7ed',
  },
  priceSliderLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  priceSliderLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  bottomNavWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    zIndex: 120,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: NAV_TOP_PADDING,
    backgroundColor: '#ffffff',
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
    paddingHorizontal: 4,
  },
  navIcon: {
    marginBottom: 2,
  },
  navLabel: {
    marginTop: 0,
    color: '#94a3b8',
  },
  navLabelActive: {
    color: ACTIVE_TAB_COLOR,
  },
  pollsIcon: {
    transform: [{ rotate: '90deg' }, { scaleX: -1 }],
  },
  inlineSegmentWrapper: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'flex-start',
  },
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: TOGGLE_STACK_GAP,
    padding: 0,
    borderRadius: TOGGLE_BORDER_RADIUS + 3,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  segmentedOption: {
    ...toggleBaseStyle,
    justifyContent: 'center',
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  segmentedOptionActive: {
    backgroundColor: ACTIVE_TAB_COLOR,
    borderColor: ACTIVE_TAB_COLOR,
  },
  segmentedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  segmentedLabelActive: {
    color: '#ffffff',
  },
  resultsCloseButton: {
    marginRight: -4,
  },
  resultsShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
    backgroundColor: 'transparent',
  },
  resultsCard: {
    flex: 1,
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
  },
  resultsCardSurface: {
    backgroundColor: '#ffffff',
  },
  resultsCardCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  resultsScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  resultsScrollContent: {
    paddingBottom: RESULTS_BOTTOM_PADDING,
    paddingTop: 0,
  },
  resultsListHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingTop: 8,
    paddingBottom: 8,
  },
  submittedQueryLabel: {
    flexShrink: 1,
    marginRight: 12,
    color: '#0f172a',
    marginBottom: 0,
    paddingLeft: 0,
  },
  openNowButton: {
    ...toggleBaseStyle,
  },
  openNowButtonActive: {
    borderRadius: TOGGLE_BORDER_RADIUS,
    borderColor: ACTIVE_TAB_COLOR,
    backgroundColor: ACTIVE_TAB_COLOR,
    shadowColor: ACTIVE_TAB_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  openNowButtonDisabled: {
    opacity: 0.6,
  },
  openNowIcon: {
    marginRight: 6,
  },
  openNowText: {
    color: themeColors.textBody,
    fontSize: 13,
  },
  openNowTextActive: {
    color: '#ffffff',
  },
  votesButton: {
    ...toggleBaseStyle,
    flexDirection: 'row',
  },
  votesButtonActive: {
    borderColor: ACTIVE_TAB_COLOR,
    backgroundColor: ACTIVE_TAB_COLOR,
    shadowColor: ACTIVE_TAB_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  votesButtonDisabled: {
    opacity: 0.6,
  },
  votesIcon: {
    marginRight: 6,
  },
  votesText: {
    color: themeColors.textBody,
  },
  votesTextActive: {
    color: '#ffffff',
  },
  resultsInner: {
    width: '100%',
  },
  loadMoreSpacer: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultFiltersWrapper: {
    marginTop: -3,
    marginBottom: 14,
    gap: 0,
  },
  resultItem: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    backgroundColor: '#ffffff',
    marginBottom: CARD_GAP,
    alignSelf: 'stretch',
    borderRadius: 0,
  },
  resultItemWithFilters: {
    paddingTop: 8,
  },
  resultPressable: {
    width: '100%',
  },
  resultHeader: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    marginBottom: 4,
  },
  resultActions: {
    position: 'absolute',
    top: 0,
    right: -(CONTENT_HORIZONTAL_PADDING / 2),
    width: 32,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  resultTitleContainer: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    minHeight: 0,
    paddingTop: 0,
    paddingRight: 48,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  rankBadge: {
    minWidth: 26,
    height: 24,
    borderRadius: 12,
    backgroundColor: themeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rankBadgeText: {
    color: '#ffffff',
  },
  resultMetaLine: {
    marginTop: 6,
  },
  dishMetaLineFirst: {
    marginTop: 6,
  },
  dishMetaLineSpacing: {
    marginTop: 2,
  },
  metricBlock: {
    marginTop: 8,
    gap: 4,
    paddingLeft: 11,
    position: 'relative',
    marginLeft: 11,
  },
  metricStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
  metricLabel: {
    color: themeColors.textBody,
    letterSpacing: 0.2,
    textTransform: 'none',
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    color: '#0f172a',
  },
  metricCountersInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricCounterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricCounterText: {
    color: themeColors.textBody,
  },
  metricCountersStacked: {
    marginTop: 2,
  },
  metricSupportBlock: {
    marginTop: 8,
    gap: 4,
    paddingLeft: 12,
    position: 'relative',
  },
  metricSupportStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 1.5,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  metricSupportLabel: {
    color: themeColors.textBody,
    letterSpacing: 0.1,
  },
  metricSupportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricSupportValue: {
    color: themeColors.textBody,
  },
  resultMetaLineRight: {
    marginTop: 0,
    marginLeft: 'auto',
    alignItems: 'flex-end',
    maxWidth: '65%',
    flexShrink: 1,
  },
  resultMetaLineInline: {
    marginTop: 0,
    flexShrink: 1,
  },
  resultMetaText: {
    color: themeColors.textBody,
    flexShrink: 1,
  },
  resultMetaPrefix: {
    color: themeColors.textBody,
  },
  resultMetaTextRight: {
    textAlign: 'right',
  },
  resultMetaOpen: {
    color: '#16a34a',
  },
  resultMetaClosingSoon: {
    color: '#f59e0b',
  },
  resultMetaSuffix: {
    color: themeColors.textBody,
  },
  resultMetaClosed: {
    color: '#dc2626',
  },
  resultMetaSeparator: {
    color: themeColors.textBody,
  },
  resultMetaPrice: {
    color: themeColors.textBody,
  },
  resultMetaDistance: {
    color: themeColors.textBody,
  },
  dishMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginTop: 0,
  },
  userLocationWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  userLocationHaloWrapper: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  userLocationShadow: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...MARKER_SHADOW_STYLE,
  },
  userLocationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: themeColors.secondaryAccent,
  },
  userLocationHalo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  shareButton: {
    padding: 4,
    borderRadius: 999,
  },
  likeButton: {
    padding: 4,
    borderRadius: 999,
  },
  resultContent: {
    marginLeft: 0,
    marginTop: 0,
    paddingBottom: 2,
  },
  secondaryMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  secondaryMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryMetricInline: {
    color: themeColors.textBody,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSlate900: {
    color: themeColors.textPrimary,
  },
  textSlate700: {
    color: themeColors.textBody,
  },
  textSlate600: {
    color: themeColors.textBody,
  },
  textSlate500: {
    color: themeColors.textMuted,
  },
  textRed600: {
    color: '#dc2626',
  },
  dishTitle: {
    fontSize: 17,
    flexShrink: 1,
    minWidth: 0,
  },
  dishCardTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  dishRestaurantName: {
    color: themeColors.textMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  dishSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  dishSubtitleSmall: {
    fontSize: 12,
  },
  topFoodSection: {
    marginTop: 2,
    marginBottom: 6,
    gap: 4,
  },
  topFoodLabel: {
    color: themeColors.textBody,
    letterSpacing: 0.6,
    textTransform: 'none',
  },
  topFoodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topFoodDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
  },
  topFoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 2,
  },
  topFoodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  topFoodRankPill: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: themeColors.secondaryAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topFoodRankText: {
    color: '#ffffff',
  },
  topFoodName: {
    color: themeColors.textBody,
    flexShrink: 1,
    minWidth: 0,
  },
  topFoodScore: {
    color: themeColors.textBody,
  },
  topFoodMore: {
    color: themeColors.secondaryAccent,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    textAlign: 'center',
  },
  glassHighlightSmall: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
});

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <View style={styles.emptyState}>
    <Text variant="caption" style={styles.textSlate500}>
      {message}
    </Text>
  </View>
);

export default SearchScreen;
