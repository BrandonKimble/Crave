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
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Easing,
} from 'react-native';
import {
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import MapboxGL from '@rnmapbox/maps';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Text } from '../../components';
import type { OperatingStatus } from '../../types';
import {
  BookmarkIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  UserIcon,
  XCircleIcon,
  XMarkIcon,
  ChartBarIcon,
} from '../../components/icons/HeroIcons';
import { colors as themeColors, shadows as shadowStyles } from '../../constants/theme';
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
  SMALL_MOVEMENT_THRESHOLD,
  type SheetPosition,
  type SheetGestureContext,
} from '../../overlays/sheetUtils';
import { logger } from '../../utils';
import { searchService } from '../../services/search';
import { autocompleteService, type AutocompleteMatch } from '../../services/autocomplete';
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
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CONTENT_HORIZONTAL_PADDING = OVERLAY_HORIZONTAL_PADDING;
const SEARCH_HORIZONTAL_PADDING = Math.max(8, CONTENT_HORIZONTAL_PADDING - 2);
const CARD_GAP = 4;
const ACTIVE_TAB_COLOR = themeColors.primary;
const QUALITY_COLOR = '#fbbf24';
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
const META_FONT_SIZE = 15;
const DISTANCE_MIN_DECIMALS = 1;
const DISTANCE_MAX_DECIMALS = 0;
const USA_FALLBACK_CENTER: [number, number] = [-98.5795, 39.8283];
const USA_FALLBACK_ZOOM = 3.2;

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
};
type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
  page?: number;
  append?: boolean;
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

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;
type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];
const SHEET_STATE_ORDER: SheetPosition[] = ['expanded', 'middle', 'collapsed', 'hidden'];
const getNextSheetState = (state: SheetPosition): SheetPosition | null => {
  const index = SHEET_STATE_ORDER.indexOf(state);
  if (index < 0 || index >= SHEET_STATE_ORDER.length - 1) {
    return null;
  }
  return SHEET_STATE_ORDER[index + 1];
};

const parseTimeDisplayToMinutes = (value?: string | null): number | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const match = value.trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
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
const NAV_VERTICAL_PADDING = 8;
const RESULT_HEADER_ICON_SIZE = 35;
const RESULT_CLOSE_ICON_SIZE = RESULT_HEADER_ICON_SIZE;

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
  const [mapCenter, setMapCenter] = React.useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = React.useState(12);

  React.useEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);

  React.useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

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
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(locationPulse, {
          toValue: 0,
          duration: 1000,
          easing: Easing.in(Easing.quad),
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
    if (cameraRef.current?.setCamera) {
      cameraRef.current.setCamera({
      centerCoordinate: center,
      zoomLevel: 13,
      animationDuration: 800,
    });
  }
}, [userLocation]);

  const mapStyleURL = React.useMemo(() => buildMapStyleURL(accessToken), [accessToken]);

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = React.useState('');
  const [isSearchSessionActive, setIsSearchSessionActive] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressed] = React.useState(false);
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
  const [resultsScrollEnabled, setResultsScrollEnabled] = React.useState(true);
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const resultsScrollY = React.useRef(new Animated.Value(0)).current;
  const resultsScrollEnabledRef = React.useRef(true);
  const lastScrollYRef = React.useRef(0);
  const scrollLockTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
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
  const snapPointExpanded = useSharedValue(0);
  const snapPointMiddle = useSharedValue(SCREEN_HEIGHT * 0.4);
  const snapPointCollapsed = useSharedValue(SCREEN_HEIGHT - 160);
  const snapPointHidden = useSharedValue(SCREEN_HEIGHT + 80);
  const sheetStateShared = useSharedValue<SheetPosition>('hidden');
  const recentHistoryRequest = React.useRef<Promise<void> | null>(null);
  const searchContainerAnim = React.useRef(new Animated.Value(0)).current;
  const inputRef = React.useRef<TextInput | null>(null);
  const resultsScrollRef = React.useRef<ScrollView | null>(null);
  const draggingFromTopRef = React.useRef(false);
  const locationRequestInFlightRef = React.useRef(false);
  const userLocationRef = React.useRef<Coordinate | null>(null);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const locationPulse = React.useRef(new Animated.Value(0)).current;
  const hasCenteredOnLocationRef = React.useRef(false);
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
  const handleProfilePress = React.useCallback(() => {
    navigation.navigate('Profile');
  }, [navigation]);
  const navItems = React.useMemo(
    () =>
      [
        { key: 'search' as OverlayKey, label: 'Search' },
        { key: 'bookmarks' as OverlayKey, label: 'Bookmarks' },
        { key: 'polls' as OverlayKey, label: 'Polls' },
      ] as const,
    []
  );
  const navIconRenderers = React.useMemo<Record<OverlayKey, (color: string) => React.ReactNode>>(
    () => ({
      search: (color: string) => <MagnifyingGlassIcon size={20} color={color} />,
      bookmarks: (color: string) => <BookmarkIcon size={20} color={color} />,
      polls: (color: string) => (
        <ChartBarIcon size={20} color={color} style={styles.pollsIcon} />
      ),
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
    isSearchOverlay && !isAutocompleteSuppressed && trimmedQuery.length >= 2;
  const shouldRenderSuggestionPanel = shouldRenderAutocompleteSection || shouldShowRecentSection;
  const hasRecentSearches = recentSearches.length > 0;
  const priceButtonIsActive = priceFiltersActive || isPriceSelectorVisible;
  const votesFilterActive = votes100Plus;
  const canLoadMore =
    Boolean(results) && !isPaginationExhausted && (hasMoreFood || hasMoreRestaurants);
  const primaryFoodTerm = React.useMemo(() => {
    const term = results?.metadata?.primaryFoodTerm;
    if (typeof term === 'string') {
      const normalized = term.trim();
      if (normalized.length) {
        return normalized;
      }
    }
    const fallbackDish = results?.food?.[0]?.foodName;
    if (typeof fallbackDish === 'string') {
      const normalizedDish = fallbackDish.trim();
      if (normalizedDish.length) {
        return normalizedDish;
      }
    }
    return null;
  }, [results?.metadata?.primaryFoodTerm, results?.food?.[0]?.foodName]);
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
    align: 'left' | 'right' = 'left'
  ): React.ReactNode => {
    const segments: React.ReactNode[] = [];
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
      if (isClosingSoon) {
        segments.push(
          <Text key="status-closing-soon" variant="caption" style={{ fontSize: META_FONT_SIZE }}>
            <Text variant="caption" style={[styles.resultMetaClosingSoon, { fontSize: META_FONT_SIZE }]}>
              Closes
            </Text>
            {status.closesAtDisplay ? (
              <Text
                variant="caption"
                style={[styles.resultMetaSuffix, { fontSize: META_FONT_SIZE }]}
              >{` at ${status.closesAtDisplay}`}</Text>
            ) : null}
          </Text>
        );
      } else if (status.isOpen) {
        segments.push(
          <Text key="status-open" variant="caption" style={{ fontSize: META_FONT_SIZE }}>
            <Text variant="caption" style={[styles.resultMetaOpen, { fontSize: META_FONT_SIZE }]}>
              Open
            </Text>
            {status.closesAtDisplay ? (
              <Text
                variant="caption"
                style={[styles.resultMetaSuffix, { fontSize: META_FONT_SIZE }]}
              >{` until ${status.closesAtDisplay}`}</Text>
            ) : null}
          </Text>
        );
      } else if (status.isOpen === false) {
        segments.push(
          <Text
            key="status-closed"
            variant="caption"
            style={[styles.resultMetaClosed, { fontSize: META_FONT_SIZE }]}
          >
            Closed
          </Text>
        );
      }
    }

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
        <Text
          key="price"
          variant="caption"
          style={[styles.resultMetaPrice, { fontSize: META_FONT_SIZE }]}
        >
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
    if (!segments.length) {
      return null;
    }
    return (
      <Text
        variant="caption"
        style={[
          styles.resultMetaText,
          { fontSize: META_FONT_SIZE },
          align === 'right' && styles.resultMetaTextRight,
        ]}
        numberOfLines={1}
      >
        {segments}
      </Text>
    );
  };
  const bottomInset = Math.max(insets.bottom, 12);
  const shouldHideBottomNav = isSearchOverlay && (isSearchSessionActive || isLoading);
  const focusSearchInput = React.useCallback(() => {
    inputRef.current?.focus();
  }, []);
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
      if (scrollLockTimeoutRef.current) {
        clearTimeout(scrollLockTimeoutRef.current);
      }
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  const enableResultsScroll = React.useCallback(() => {
    resultsScrollEnabledRef.current = true;
    setResultsScrollEnabled(true);
    if (scrollLockTimeoutRef.current) {
      clearTimeout(scrollLockTimeoutRef.current);
      scrollLockTimeoutRef.current = null;
    }
  }, []);

  const temporarilyDisableResultsScroll = React.useCallback(() => {
    resultsScrollEnabledRef.current = false;
    setResultsScrollEnabled(false);
    if (scrollLockTimeoutRef.current) {
      clearTimeout(scrollLockTimeoutRef.current);
    }
    scrollLockTimeoutRef.current = setTimeout(() => {
      enableResultsScroll();
    }, 300);
  }, [enableResultsScroll]);

  const collapseSheetFromTop = React.useCallback(() => {
    if (!resultsScrollEnabledRef.current) {
      return;
    }
    const nextState = getNextSheetState(sheetState);
    if (!nextState) {
      return;
    }
    temporarilyDisableResultsScroll();
    animateSheetTo(nextState);
  }, [sheetState, animateSheetTo, temporarilyDisableResultsScroll]);

  const onResultsScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const offsetY = contentOffset?.y ?? 0;
      resultsScrollY.setValue(offsetY);

      const isPullingDown = offsetY < lastScrollYRef.current;
      lastScrollYRef.current = offsetY;

      if (offsetY < 0) {
        draggingFromTopRef.current = true;
        resultsScrollRef.current?.scrollTo({ y: 0, animated: false });
        collapseSheetFromTop();
        return;
      }

      if (offsetY === 0 && isPullingDown) {
        draggingFromTopRef.current = true;
        collapseSheetFromTop();
        return;
      }

      if (offsetY > 2 && draggingFromTopRef.current) {
        draggingFromTopRef.current = false;
      }

      if (!canLoadMore || isLoading || isLoadingMore || isPaginationExhausted) {
        return;
      }

      const layoutHeight = layoutMeasurement?.height ?? 0;
      const contentHeight = contentSize?.height ?? 0;
      const distanceFromBottom = contentHeight - (offsetY + layoutHeight);
      if (distanceFromBottom < 200) {
        loadMoreResults();
      }
    },
    [
      resultsScrollY,
      canLoadMore,
      isLoading,
      isLoadingMore,
      isPaginationExhausted,
      loadMoreResults,
      collapseSheetFromTop,
    ]
  );

  const handleResultsScrollBeginDrag = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
      draggingFromTopRef.current = offsetY <= 0.5;
    },
    []
  );

  const handleResultsScrollEndDrag = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset?.y ?? 0;
      const velocityY = event.nativeEvent.velocity?.y ?? 0;
      const isPullingDown = velocityY < -25;
      if (offsetY <= 0.5 && isPullingDown) {
        draggingFromTopRef.current = false;
        resultsScrollRef.current?.scrollTo({ y: 0, animated: false });
        collapseSheetFromTop();
        return;
      }
      if (offsetY > 1 && draggingFromTopRef.current) {
        draggingFromTopRef.current = false;
      }
    },
    [collapseSheetFromTop]
  );
  const handleQueryChange = React.useCallback((value: string) => {
    setIsAutocompleteSuppressed(false);
    setQuery(value);
  }, []);
  const restaurants = results?.restaurants ?? [];
  const dishes = results?.food ?? [];
  React.useEffect(() => {
    Animated.spring(searchContainerAnim, {
      toValue: shouldRenderSuggestionPanel ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
    }).start();
  }, [searchContainerAnim, shouldRenderSuggestionPanel]);

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
      if (typeof restaurant.latitude !== 'number' || typeof restaurant.longitude !== 'number') {
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
    if (!isSearchOverlay) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsAutocompleteLoading(false);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsAutocompleteLoading(false);
      return;
    }

    setIsAutocompleteLoading(true);
    let isActive = true;
    const debounceHandle = setTimeout(() => {
      autocompleteService
        .fetchEntities(trimmed)
        .then((response) => {
          if (!isActive) {
            return;
          }
          setSuggestions(response.matches);
          setShowSuggestions(response.matches.length > 0);
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
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsAutocompleteLoading(false);
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(debounceHandle);
    };
  }, [isSearchOverlay, query]);

  const restaurantFeatures = React.useMemo<
    FeatureCollection<Point, RestaurantFeatureProperties>
  >(() => {
    const features: Feature<Point, RestaurantFeatureProperties>[] = [];

    restaurantsById.forEach((restaurant) => {
      const { latitude, longitude } = restaurant;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        logger.error('Restaurant coordinates became invalid after indexing', {
          restaurantId: restaurant.restaurantId,
        });
        return;
      }

      features.push({
        type: 'Feature',
        id: restaurant.restaurantId,
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        properties: {
          restaurantId: restaurant.restaurantId,
          restaurantName: restaurant.restaurantName,
          contextualScore: restaurant.contextualScore,
        },
      });
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [restaurantsById]);

  const openNowNotice = React.useMemo<OpenNowNotice | null>(() => {
    if (!openNow || !results?.metadata) {
      return null;
    }

    const {
      openNowApplied,
      openNowUnsupportedRestaurants = 0,
      openNowFilteredOut = 0,
    } = results.metadata;

    if (!openNowApplied) {
      return {
        variant: 'warning',
        message: 'Open-now filtering could not run because these spots are missing hours.',
      };
    }

    if (openNowUnsupportedRestaurants > 0) {
      return {
        variant: 'info',
        message: `${openNowUnsupportedRestaurants} places without hours were skipped.`,
      };
    }

    if (openNowFilteredOut > 0) {
      return {
        variant: 'success',
        message: `${openNowFilteredOut} closed places were filtered out.`,
      };
    }

    return null;
  }, [openNow, results]);

  React.useEffect(() => {
    const features = restaurantFeatures.features;
    if (!features.length) {
      return;
    }

    const longitudes = features.map((feature) => feature.geometry.coordinates[0]);
    const latitudes = features.map((feature) => feature.geometry.coordinates[1]);

    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);

    if (
      Number.isFinite(west) &&
      Number.isFinite(east) &&
      Number.isFinite(south) &&
      Number.isFinite(north)
    ) {
      cameraRef.current?.fitBounds([east, north], [west, south], 40, 600);
    }
  }, [restaurantFeatures]);

  const snapPoints = React.useMemo<Record<SheetPosition, number>>(() => {
    const expanded = Math.max(searchLayout.top, 0);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const collapsed = SCREEN_HEIGHT - 160;
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle: Math.min(middle, hidden - 120),
      collapsed,
      hidden,
    };
  }, [insets.top, searchLayout]);
  const shouldRenderSheet = isSearchOverlay && (panelVisible || sheetState !== 'hidden');

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
      onStart: (_, context) => {
        context.startY = sheetTranslateY.value;
        const currentState =
          sheetStateShared.value === 'hidden' ? 'collapsed' : sheetStateShared.value;
        const startIndex = SHEET_STATES.indexOf(currentState);
        context.startStateIndex = startIndex >= 0 ? startIndex : SHEET_STATES.length - 1;
      },
      onActive: (event, context) => {
        const minY = snapPointExpanded.value;
        const maxY = snapPointHidden.value;
        sheetTranslateY.value = clampValue(context.startY + event.translationY, minY, maxY);
      },
      onEnd: (event, context) => {
        const minY = snapPointExpanded.value;
        const maxY = snapPointHidden.value;
        const collapsed = snapPointCollapsed.value;
        const projected = clampValue(sheetTranslateY.value + event.velocityY * 0.05, minY, maxY);
        let targetIndex = context.startStateIndex;
        if (
          event.translationY > SMALL_MOVEMENT_THRESHOLD &&
          context.startStateIndex < SHEET_STATES.length - 1
        ) {
          targetIndex = context.startStateIndex + 1;
        } else if (event.translationY < -SMALL_MOVEMENT_THRESHOLD && context.startStateIndex > 0) {
          targetIndex = context.startStateIndex - 1;
        } else {
          const distances = SHEET_STATES.map((state) => {
            return Math.abs(
              projected -
                snapPointForState(
                  state,
                  snapPointExpanded.value,
                  snapPointMiddle.value,
                  snapPointCollapsed.value,
                  snapPointHidden.value
                )
            );
          });
          const smallest = Math.min(...distances);
          targetIndex = Math.max(distances.indexOf(smallest), 0);
        }

        let targetState: SheetPosition = SHEET_STATES[targetIndex];
        if (event.velocityY > 1200 || sheetTranslateY.value > collapsed + 40) {
          targetState = 'hidden';
        } else if (event.velocityY < -1200) {
          targetState = 'expanded';
        }

        const clampedVelocity = Math.max(Math.min(event.velocityY, 2500), -2500);
        runOnJS(animateSheetTo)(targetState, clampedVelocity);
      },
    },
    [animateSheetTo]
  );

  const searchBarInputAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      sheetTranslateY.value,
      [snapPointExpanded.value, snapPointMiddle.value],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });
  const searchBarSolidAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      sheetTranslateY.value,
      [snapPointExpanded.value, snapPointMiddle.value],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
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
    if (isLoading) {
      return;
    }
    if (isPriceSelectorVisible) {
      commitPriceSelection();
      return;
    }
    setPendingPriceRange(getRangeFromLevels(priceLevels));
    setIsPriceSelectorVisible(true);
  }, [isLoading, isPriceSelectorVisible, commitPriceSelection, priceLevels]);

  const toggleVotesFilter = React.useCallback(() => {
    if (isLoading) {
      return;
    }
    const nextValue = !votes100Plus;
    setVotes100Plus(nextValue);
    if (query.trim()) {
      void submitSearch({ minimumVotes: nextValue ? MINIMUM_VOTES_FILTER : null });
    }
  }, [isLoading, votes100Plus, setVotes100Plus, query, submitSearch]);

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
    if (resultsScrollRef.current?.scrollTo) {
      resultsScrollRef.current.scrollTo({ y: 0, animated: false });
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

      if (!append) {
        setIsSearchSessionActive(true);
        showPanel();
        setIsAutocompleteSuppressed(true);
        setShowSuggestions(false);
        setHasMoreFood(false);
        setHasMoreRestaurants(false);
        setCurrentPage(targetPage);
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

        const resolvedLocation =
          userLocationRef.current ?? (await ensureUserLocation());
        if (resolvedLocation) {
          payload.userLocation = resolvedLocation;
        }

        const response = await searchService.naturalSearch(payload);
        logger.info('Search response payload', response);

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

        if (!append) {
          setSubmittedQuery(trimmed);
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
          updateLocalRecentSearches(trimmed);
          void loadRecentHistory();
          Keyboard.dismiss();
          setIsPaginationExhausted(false);
          scrollResultsToTop();
        }
      } catch (err) {
        logger.error('Search request failed', { message: (err as Error).message });
        setError(
          append
            ? 'Unable to load more results. Please try again.'
            : 'Unable to fetch results. Please try again.'
        );
      } finally {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
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
      searchService,
      canLoadMore,
      scrollResultsToTop,
      ensureUserLocation,
    ]
  );

  const handleSubmit = React.useCallback(() => {
    void submitSearch();
  }, [submitSearch]);

  const handleSuggestionPress = React.useCallback(
    (match: AutocompleteMatch) => {
      const nextQuery = match.name;
      setQuery(nextQuery);
      setShowSuggestions(false);
      setSuggestions([]);
      void submitSearch(undefined, nextQuery);
    },
    [submitSearch]
  );

  const clearSearchState = React.useCallback(
    ({ shouldRefocusInput = false }: { shouldRefocusInput?: boolean } = {}) => {
      setQuery('');
      setResults(null);
      setSubmittedQuery('');
      setError(null);
      setSuggestions([]);
      setShowSuggestions(false);
      hidePanel();
      setIsSearchSessionActive(false);
      setHasMoreFood(false);
      setHasMoreRestaurants(false);
      setCurrentPage(1);
      setIsLoadingMore(false);
      setIsPaginationExhausted(false);
      scrollResultsToTop();
      if (shouldRefocusInput) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    },
    [hidePanel, setIsSearchSessionActive, scrollResultsToTop]
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
      void submitSearch(undefined, trimmedValue);
    },
    [submitSearch, updateLocalRecentSearches]
  );

  const handleMapPress = React.useCallback(() => {
    Keyboard.dismiss();
    if (isSearchFocused) {
      setIsSearchFocused(false);
    }
    if (showSuggestions) {
      setShowSuggestions(false);
    }
  }, [isSearchFocused, showSuggestions]);

  const loadMoreResults = React.useCallback(() => {
    if (isLoading || isLoadingMore || !results || !canLoadMore || isPaginationExhausted) {
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
    currentPage,
    submittedQuery,
    query,
    submitSearch,
    isPaginationExhausted,
  ]);

  const toggleOpenNow = React.useCallback(() => {
    if (isLoading) {
      return;
    }

    setIsPriceSelectorVisible(false);
    const nextValue = !openNow;
    setOpenNow(nextValue);

    if (query.trim()) {
      void submitSearch({ openNow: nextValue });
    }
  }, [isLoading, openNow, query, setOpenNow, submitSearch]);

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
      void submitSearch({ priceLevels: nextLevels, page: 1 });
    }
  }, [pendingPriceRange, priceLevels, query, setPriceLevels, submitSearch]);

  const handlePriceDone = React.useCallback(() => {
    if (isLoading) {
      return;
    }
    commitPriceSelection();
  }, [commitPriceSelection, isLoading]);

  const toggleFavorite = React.useCallback(
    async (entityId: string) => {
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
          await favoritesService.remove(existing.favoriteId);
        } catch (error) {
          logger.error('Failed to remove favorite', error);
          setFavoriteMap((prev) => {
            const next = new Map(prev);
            next.set(entityId, existing);
            return next;
          });
        }
        return;
      }

      const optimistic: Favorite = {
        favoriteId: `temp-${entityId}`,
        entityId,
        entityType: 'restaurant',
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
        const saved = await favoritesService.add(entityId);
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
    (restaurant: RestaurantResult) => {
      const restaurantDishes = dishes
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

  const getQualityColor = (index: number, total: number): string => {
    const ratio = index / Math.max(total - 1, 1);
    // Warmer light green: #a3e635 to lighter warm orange: #fb923c
    const green = {
      r: 163,
      g: 230,
      b: 53,
    };
    const orange = {
      r: 251,
      g: 146,
      b: 60,
    };

    const r = Math.round(green.r + (orange.r - green.r) * ratio);
    const g = Math.round(green.g + (orange.g - green.g) * ratio);
    const b = Math.round(green.b + (orange.b - green.b) * ratio);

    return `rgb(${r}, ${g}, ${b})`;
  };

  type ResultCardOptions = {
    showFilters?: boolean;
  };

  const renderFiltersSection = (): React.ReactElement => (
    <View style={styles.resultFiltersWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterButtonsContent}
        style={styles.filterButtonsScroll}
      >
        <View style={styles.inlineSegmentWrapper}>
          <View style={styles.segmentedControl}>
            {SEGMENT_OPTIONS.map((option) => {
              const selected = activeTab === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.segmentedOption, selected && styles.segmentedOptionActive]}
                  onPress={() => setActiveTab(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${option.label.toLowerCase()}`}
                  accessibilityState={{ selected }}
                >
                  <Text
                    numberOfLines={1}
                    variant="caption"
                    weight="semibold"
                    style={[styles.segmentedLabel, selected && styles.segmentedLabelActive]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Pressable
          onPress={toggleOpenNow}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Toggle open now results"
          accessibilityState={{ disabled: isLoading, selected: openNow }}
          style={[
            styles.openNowButton,
            openNow && styles.openNowButtonActive,
            isLoading && styles.openNowButtonDisabled,
          ]}
        >
          <Feather
            name="clock"
            size={14}
            color={openNow ? '#ffffff' : '#475569'}
            style={styles.openNowIcon}
          />
          <Text
            variant="caption"
            weight="semibold"
            style={[styles.openNowText, openNow && styles.openNowTextActive]}
          >
            Open now
          </Text>
        </Pressable>
        <Pressable
          onPress={togglePriceSelector}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Select price filters"
          accessibilityState={{
            disabled: isLoading,
            expanded: isPriceSelectorVisible,
            selected: priceFiltersActive,
          }}
          style={[
            styles.priceButton,
            priceButtonIsActive && styles.priceButtonActive,
            isLoading && styles.priceButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.priceButtonBullet,
              priceButtonIsActive && styles.priceButtonBulletActive,
            ]}
          >
            ·
          </Text>
          <Text
            variant="caption"
            weight="semibold"
            style={[styles.priceButtonLabel, priceButtonIsActive && styles.priceButtonLabelActive]}
          >
            {priceButtonLabelText}
          </Text>
          <Feather
            name={isPriceSelectorVisible ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={priceButtonIsActive ? '#ffffff' : '#475569'}
            style={styles.priceButtonChevron}
          />
        </Pressable>
        <Pressable
          onPress={toggleVotesFilter}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Toggle 100 plus votes filter"
          accessibilityState={{ disabled: isLoading, selected: votesFilterActive }}
          style={[
            styles.votesButton,
            votesFilterActive && styles.votesButtonActive,
            isLoading && styles.votesButtonDisabled,
          ]}
        >
          <Feather
            name="thumbs-up"
            size={14}
            color={votesFilterActive ? '#ffffff' : '#475569'}
            style={styles.votesIcon}
          />
          <Text
            variant="caption"
            weight="semibold"
            style={[styles.votesText, votesFilterActive && styles.votesTextActive]}
          >
            100+ votes
          </Text>
        </Pressable>
      </ScrollView>
      {isPriceSelectorVisible ? (
        <View style={styles.priceSelector}>
          <View style={styles.priceSelectorHeader}>
            <View>
              <Text variant="caption" style={styles.priceFilterLabel}>
                Price per person
              </Text>
              <Text style={styles.priceSelectorValue}>{pendingPriceSummary}</Text>
            </View>
            <Pressable
              onPress={handlePriceDone}
              accessibilityRole="button"
              accessibilityLabel="Apply price filters"
              style={styles.priceDoneButton}
              disabled={isLoading}
            >
              <Text style={styles.priceDoneButtonText}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.priceSliderWrapper} onLayout={handlePriceSliderLayout}>
            {priceSliderWidth > 0 ? (
              <MultiSlider
                min={PRICE_SLIDER_MIN}
                max={PRICE_SLIDER_MAX}
                step={1}
                values={pendingPriceRange}
                sliderLength={priceSliderWidth}
                onValuesChange={handlePriceSliderChange}
                allowOverlap={false}
                snapped
                markerStyle={styles.priceSliderMarker}
                pressedMarkerStyle={styles.priceSliderMarkerActive}
                selectedStyle={styles.priceSliderSelected}
                unselectedStyle={styles.priceSliderUnselected}
                containerStyle={styles.priceSlider}
                trackStyle={styles.priceSliderTrack}
              />
            ) : null}
          </View>
          <View style={styles.priceSliderLabelsRow}>
            {PRICE_LEVEL_VALUES.map((value) => (
              <Text key={value} style={styles.priceSliderLabel}>
                {PRICE_LEVEL_TICK_LABELS[value]}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderDishCard = (item: FoodResult, index: number, options?: ResultCardOptions) => {
    const isLiked = favoriteMap.has(item.foodId);
    const qualityColor = getQualityColor(index, dishes.length);
    const restaurantForDish = restaurantsById.get(item.restaurantId);
    const dishPriceLabel = getPriceRangeLabel(item.restaurantPriceLevel);
    const dishMetaLine = renderMetaDetailLine(
      item.restaurantOperatingStatus,
      dishPriceLabel,
      item.restaurantDistanceMiles,
      'left'
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
      <View
        key={item.connectionId}
        style={[styles.resultItem, options?.showFilters && styles.resultItemWithFilters]}
      >
        {options?.showFilters ? renderFiltersSection() : null}
        <Pressable
          style={styles.resultPressable}
          onPress={handleDishPress}
          accessibilityRole={restaurantForDish ? 'button' : undefined}
          accessibilityLabel={restaurantForDish ? `View ${item.restaurantName}` : undefined}
          disabled={!restaurantForDish}
        >
          <View style={styles.resultHeader}>
            <View style={styles.resultTitleContainer}>
              <Text
                variant="body"
                weight="bold"
                style={[styles.textSlate900, styles.dishCardTitle]}
              >
                {item.foodName}
              </Text>
              <Text
                variant="body"
                weight="medium"
                style={[styles.textSlate600, styles.dishRestaurantName]}
                numberOfLines={1}
              >
                {item.restaurantName}
              </Text>
              {dishMetaLine ? (
                <View style={styles.resultMetaLine}>{dishMetaLine}</View>
              ) : null}
            </View>
            <View style={styles.resultActions}>
              <Pressable
                onPress={() => toggleFavorite(item.foodId)}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                style={styles.likeButton}
                hitSlop={8}
              >
                {isLiked ? (
                  <Feather name="heart" size={20} color="#ef4444" fill="#ef4444" />
                ) : (
                  <Feather name="heart" size={20} color="#cbd5e1" />
                )}
              </Pressable>
              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Share"
                style={styles.shareButton}
                hitSlop={8}
              >
                <Feather name="share-2" size={18} color="#cbd5e1" />
              </Pressable>
            </View>
          </View>
          <View style={styles.resultContent}>
            <View style={styles.metricsContainer}>
              <View style={styles.primaryMetric}>
                <Text variant="caption" style={styles.primaryMetricLabel}>
                  Dish score
                </Text>
                <Text
                  variant="title"
                  weight="bold"
                  style={[styles.primaryMetricValue, { color: qualityColor }]}
                >
                  {item.qualityScore.toFixed(1)}
                </Text>
              </View>
              <View style={styles.secondaryMetrics}>
                <View style={styles.secondaryMetric}>
                  <Text variant="caption" style={styles.secondaryMetricLabel}>
                    Poll Count
                  </Text>
                  <Text variant="body" weight="semibold" style={styles.secondaryMetricValue}>
                    {item.mentionCount}
                  </Text>
                </View>
                <View style={styles.secondaryMetric}>
                  <Text variant="caption" style={styles.secondaryMetricLabel}>
                    Total Votes
                  </Text>
                  <Text variant="body" weight="semibold" style={styles.secondaryMetricValue}>
                    {item.totalUpvotes}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const renderRestaurantCard = (
    restaurant: RestaurantResult,
    index: number,
    options?: ResultCardOptions
  ) => {
    const isLiked = favoriteMap.has(restaurant.restaurantId);
    const qualityColor = getQualityColor(index, restaurants.length);
    const priceRangeLabel = getPriceRangeLabel(restaurant.priceLevel);
    const restaurantMetaLine = renderMetaDetailLine(
      restaurant.operatingStatus,
      priceRangeLabel ?? null,
      restaurant.distanceMiles
    );
    const handleShare = () => {
      void Share.share({
        message: `${restaurant.restaurantName} · View on Crave Search`,
      }).catch(() => undefined);
    };
    return (
      <View
        key={restaurant.restaurantId}
        style={[styles.resultItem, options?.showFilters && styles.resultItemWithFilters]}
      >
        {options?.showFilters ? renderFiltersSection() : null}
        <Pressable
          style={styles.resultPressable}
          onPress={() => openRestaurantProfile(restaurant)}
          accessibilityRole="button"
          accessibilityLabel={`View ${restaurant.restaurantName}`}
        >
          <View style={styles.resultHeader}>
            <View style={styles.resultTitleContainer}>
              <Text
                variant="subtitle"
                weight="bold"
                style={[styles.textSlate900, styles.dishTitle]}
              >
                {restaurant.restaurantName}
              </Text>
              {restaurantMetaLine ? (
                <View style={styles.resultMetaLine}>{restaurantMetaLine}</View>
              ) : null}
            </View>
            <View style={styles.resultActions}>
              <Pressable
                onPress={() => toggleFavorite(restaurant.restaurantId)}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                style={styles.likeButton}
                hitSlop={8}
              >
                {isLiked ? (
                  <Feather name="heart" size={20} color="#ef4444" fill="#ef4444" />
                ) : (
                  <Feather name="heart" size={20} color="#cbd5e1" />
                )}
              </Pressable>
              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Share"
                style={styles.shareButton}
                hitSlop={8}
              >
                <Feather name="share-2" size={18} color="#cbd5e1" />
              </Pressable>
            </View>
          </View>
          <View style={styles.resultContent}>
            {restaurant.topFood?.length ? (
              <View style={styles.topFoodSection}>
                {restaurant.topFood.map((food) => (
                  <Text
                    key={food.connectionId}
                    variant="caption"
                    style={[styles.textSlate700, styles.topFoodText]}
                  >
                    • {food.foodName} ({food.qualityScore.toFixed(1)})
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.metricsContainer}>
              <View style={styles.primaryMetric}>
                <Text variant="caption" style={styles.primaryMetricLabel}>
                  {restaurantScoreLabel}
                </Text>
                <Text
                  variant="title"
                  weight="bold"
                  style={[styles.primaryMetricValue, { color: qualityColor }]}
                >
                  {restaurant.contextualScore.toFixed(1)}
                </Text>
              </View>
              {restaurant.restaurantQualityScore !== null &&
              restaurant.restaurantQualityScore !== undefined ? (
                <View style={styles.secondaryMetrics}>
                  <View style={styles.secondaryMetric}>
                    <Text variant="caption" style={styles.secondaryMetricLabel}>
                      Overall
                    </Text>
                    <Text variant="body" weight="semibold" style={styles.secondaryMetricValue}>
                      {restaurant.restaurantQualityScore.toFixed(1)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const renderFilterWrapper = (key: string) => (
    <View key={key} style={styles.resultItem}>
      {renderFiltersSection()}
    </View>
  );

  const renderDishResults = () => {
    if (!dishes.length) {
      return (
        <>
          {renderFilterWrapper('filters-dishes')}
          <EmptyState message="No dishes found. Try adjusting your search." />
        </>
      );
    }

    return dishes.map((dish, index) => renderDishCard(dish, index, { showFilters: index === 0 }));
  };

  const renderRestaurantResults = () => {
    if (!restaurants.length) {
      return (
        <>
          {renderFilterWrapper('filters-restaurants')}
          <EmptyState message="No restaurants found. Try adjusting your search." />
        </>
      );
    }

    return restaurants.map((restaurant, index) =>
      renderRestaurantCard(restaurant, index, { showFilters: index === 0 })
    );
  };

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
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={mapCenter ?? USA_FALLBACK_CENTER}
          zoomLevel={mapCenter ? mapZoom : USA_FALLBACK_ZOOM}
          pitch={32}
        />
        {userLocation ? (
          <MapboxGL.MarkerView
            id="user-location"
            coordinate={[userLocation.lng, userLocation.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
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
                            outputRange: [1.3, 1.6],
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
        {restaurantFeatures.features.map((feature) => {
          const coordinates = feature.geometry.coordinates as [number, number];
          const name = feature.properties?.restaurantName ?? feature.id?.toString() ?? 'Pin';
          const markerId = feature.properties?.restaurantId ?? String(feature.id);
          return (
            <MapboxGL.MarkerView
              key={markerId}
              id={`restaurant-${markerId}`}
              coordinate={coordinates}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={styles.mapMarker}>
                <View style={styles.mapMarkerIconWrapper}>
                  <MapPinIcon size={44} color={themeColors.primary} />
                </View>
                <Text style={styles.mapMarkerLabel} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            </MapboxGL.MarkerView>
          );
        })}
      </MapboxGL.MapView>

      {isSearchOverlay && (
        <SafeAreaView
          style={styles.overlay}
          pointerEvents="box-none"
          edges={['top', 'left', 'right']}
        >
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
            <View style={styles.promptCardTopShadow}>
              <View style={styles.promptCardWrapper}>
                <View style={styles.promptCard}>
                  <BlurView
                    pointerEvents="none"
                    intensity={45}
                    tint="light"
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Reanimated.View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        backgroundColor: 'rgba(255, 255, 255, 1)',
                        borderRadius: 16,
                      },
                      searchBarSolidAnimatedStyle,
                    ]}
                  />
                  <View pointerEvents="none" style={styles.glassHighlightSmall} />
                  <Pressable style={styles.promptRow} onPress={focusSearchInput}>
                    <Reanimated.View
                      style={[
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          flex: 1,
                        },
                        searchBarInputAnimatedStyle,
                      ]}
                      scrollEnabled={resultsScrollEnabled}
                      bounces={false}
                      alwaysBounceVertical={false}
                      scrollEnabled={resultsScrollEnabled}
                    >
                      <View style={styles.searchIcon}>
                        <MagnifyingGlassIcon size={20} color="#6b7280" />
                      </View>
                      <TextInput
                        ref={inputRef}
                        value={query}
                        onChangeText={handleQueryChange}
                        placeholder="What are you craving?"
                        placeholderTextColor="#6b7280"
                        style={styles.promptInput}
                        returnKeyType="search"
                        onSubmitEditing={handleSubmit}
                        onFocus={handleSearchFocus}
                        onBlur={handleSearchBlur}
                        editable={!isLoading}
                        autoCapitalize="none"
                        autoCorrect={false}
                        clearButtonMode="never"
                      />
                    </Reanimated.View>
                    <Reanimated.View
                      style={[styles.trailingContainer, searchBarInputAnimatedStyle]}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color="#FB923C" />
                      ) : query.length > 0 ? (
                        <Pressable
                          onPress={handleClear}
                          accessibilityRole="button"
                          accessibilityLabel="Clear search"
                          style={styles.trailingButton}
                          hitSlop={8}
                        >
                          <XMarkIcon size={24} color={ACTIVE_TAB_COLOR} />
                        </Pressable>
                      ) : (
                        <View style={styles.trailingPlaceholder} />
                      )}
                    </Reanimated.View>
                  </Pressable>

                  {shouldRenderSuggestionPanel && (
                    <Animated.View
                      style={[
                        styles.autocompletePanel,
                        {
                          opacity: searchContainerAnim,
                          transform: [
                            {
                              translateY: searchContainerAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-6, 0],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      {shouldRenderAutocompleteSection && (
                        <View style={styles.autocompleteSection}>
                          {isAutocompleteLoading && (
                            <View style={styles.autocompleteLoadingRow}>
                              <ActivityIndicator size="small" color="#6366f1" />
                              <Text style={styles.autocompleteLoadingText}>
                                Looking for matches…
                              </Text>
                            </View>
                          )}
                          {!isAutocompleteLoading && suggestions.length === 0 ? (
                            <Text style={styles.autocompleteEmptyText}>
                              Keep typing to add a dish or spot
                            </Text>
                          ) : (
                            suggestions.map((match, index) => {
                              const secondaryLabel =
                                match.matchType === 'query'
                                  ? 'Recent search'
                                  : match.entityType.replace(/_/g, ' ');
                              const itemKey = match.entityId
                                ? `${match.entityId}-${index}`
                                : `${match.name}-${index}`;
                              return (
                                <TouchableOpacity
                                  key={itemKey}
                                  onPress={() => handleSuggestionPress(match)}
                                  style={[
                                    styles.autocompleteItem,
                                    index === suggestions.length - 1 && !shouldShowRecentSection
                                      ? styles.autocompleteItemLast
                                      : null,
                                  ]}
                                >
                                  <Text style={styles.autocompletePrimaryText}>{match.name}</Text>
                                  <Text style={styles.autocompleteSecondaryText}>
                                    {secondaryLabel}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </View>
                      )}
                      {shouldShowRecentSection && (
                        <View
                          style={[
                            styles.recentSection,
                            !shouldRenderAutocompleteSection && styles.recentSectionFirst,
                          ]}
                        >
                          <View style={styles.recentHeaderRow}>
                            <Text style={styles.recentHeaderText}>Recent searches</Text>
                            {isRecentLoading && <ActivityIndicator size="small" color="#9ca3af" />}
                          </View>
                          {!isRecentLoading && !hasRecentSearches ? (
                            <Text style={styles.autocompleteEmptyText}>
                              Start exploring to build your history
                            </Text>
                          ) : (
                            recentSearches.map((term, index) => (
                              <TouchableOpacity
                                key={`${term}-${index}`}
                                onPress={() => handleRecentSearchPress(term)}
                                style={[styles.recentRow, index === 0 && styles.recentRowFirst]}
                              >
                                <Feather
                                  name="clock"
                                  size={16}
                                  color="#6b7280"
                                  style={styles.recentIcon}
                                />
                                <Text style={styles.recentText}>{term}</Text>
                              </TouchableOpacity>
                            ))
                          )}
                        </View>
                      )}
                    </Animated.View>
                  )}
                </View>
              </View>
            </View>
          </View>
          {shouldRenderSheet ? (
            <>
              <Reanimated.View
                pointerEvents="none"
                style={[styles.resultsShadow, resultsContainerAnimatedStyle]}
              />
              <Reanimated.View
                style={[overlaySheetStyles.container, resultsContainerAnimatedStyle]}
                pointerEvents={panelVisible ? 'auto' : 'none'}
              >
                {/* BlurView must remain the first child inside this absolute container.
                  Wrappers placed above it (even for shadows) cause the frost effect to vanish. */}
                <BlurView
                  pointerEvents="none"
                  intensity={45}
                  tint="light"
                  style={StyleSheet.absoluteFillObject}
                />
                <View pointerEvents="none" style={overlaySheetStyles.surfaceTint} />
                <View pointerEvents="none" style={overlaySheetStyles.highlight} />
                <PanGestureHandler ref={sheetPanRef} onGestureEvent={sheetPanGesture}>
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
                      <Text variant="body" weight="semibold" style={styles.submittedQueryLabel}>
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
                    {openNowNotice ? (
                      <View
                        style={[
                          styles.openNowNotice,
                          openNowNotice.variant === 'warning' && styles.openNowNoticeWarning,
                          openNowNotice.variant === 'info' && styles.openNowNoticeInfo,
                          openNowNotice.variant === 'success' && styles.openNowNoticeSuccess,
                        ]}
                      >
                        <Text variant="caption" style={styles.openNowNoticeText}>
                          {openNowNotice.message}
                        </Text>
                      </View>
                    ) : null}
                  </Reanimated.View>
                </PanGestureHandler>

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
                    <Animated.ScrollView
                      ref={(ref) => {
                        resultsScrollRef.current = ref as unknown as ScrollView | null;
                      }}
                      simultaneousHandlers={sheetPanRef}
                      style={styles.resultsScroll}
                      contentContainerStyle={styles.resultsScrollContent}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      onScroll={onResultsScroll}
                      onScrollBeginDrag={handleResultsScrollBeginDrag}
                      onScrollEndDrag={handleResultsScrollEndDrag}
                      scrollEventThrottle={16}
                      bounces={false}
                      alwaysBounceVertical={false}
                      overScrollMode="never"
                      scrollEnabled={resultsScrollEnabled && sheetState === 'expanded'}
                    >
                      <View style={styles.resultsInner}>
                        {activeTab === 'dishes' ? renderDishResults() : renderRestaurantResults()}
                        <View style={styles.loadMoreSpacer}>
                          {isLoadingMore && canLoadMore ? (
                            <ActivityIndicator size="small" color={ACTIVE_TAB_COLOR} />
                          ) : null}
                        </View>
                      </View>
                    </Animated.ScrollView>
                  </View>
                )}
              </Reanimated.View>
            </>
          ) : null}
        </SafeAreaView>
      )}
      {!shouldHideBottomNav && (
        <View style={styles.bottomNavWrapper} pointerEvents="box-none">
          <View style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_VERTICAL_PADDING }]}>
            {navItems.map((item) => {
              const active = activeOverlay === item.key;
              const iconColor = active ? ACTIVE_TAB_COLOR : '#94a3b8';
              const renderIcon = navIconRenderers[item.key];
              return (
                <TouchableOpacity
                  key={item.key}
                  style={styles.navButton}
                  onPress={() => handleOverlaySelect(item.key)}
                >
                  <View style={styles.navIcon}>{renderIcon(iconColor)}</View>
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.navButton} onPress={handleProfilePress}>
              <View style={styles.navIcon}>
                <UserIcon size={20} color="#94a3b8" />
              </View>
              <Text style={styles.navLabel}>Profile</Text>
            </TouchableOpacity>
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
  mapMarker: {
    alignItems: 'center',
  },
  mapMarkerIconWrapper: {
    ...shadowStyles.floatingControl,
    borderRadius: 999,
    padding: 2,
    backgroundColor: 'transparent',
  },
  mapMarkerLabel: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 140,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingBottom: 24,
  },
  searchContainer: {
    paddingHorizontal: SEARCH_HORIZONTAL_PADDING,
    paddingTop: 6,
  },
  promptCardTopShadow: {
    borderRadius: 16,
    ...shadowStyles.surfaceTopLight,
  },
  promptCardWrapper: {
    borderRadius: 16,
    ...shadowStyles.surfaceBottomHeavy,
  },
  promptCard: {
    position: 'relative',
    borderRadius: 16,
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 52,
  },
  autocompletePanel: {
    marginTop: 6,
    backgroundColor: 'transparent',
  },
  autocompleteSection: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
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
    color: '#64748b',
    textTransform: 'capitalize',
  },
  recentSection: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  recentSectionFirst: {
    borderTopWidth: 0,
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
    color: '#1f2937',
    flex: 1,
  },
  searchIcon: {
    marginRight: 12,
  },
  promptInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
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
    justifyContent: 'space-evenly',
    paddingHorizontal: 24,
    paddingTop: NAV_VERTICAL_PADDING,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
    paddingHorizontal: 4,
  },
  navIcon: {
    marginBottom: 4,
  },
  navLabel: {
    fontSize: 12,
    marginTop: 0,
    color: '#94a3b8',
    fontWeight: '600',
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
    ...shadowStyles.resultsPanelEdge,
  },
  resultsCard: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
  submittedQueryLabel: {
    flexShrink: 1,
    marginRight: 12,
    color: '#0f172a',
    fontSize: 21,
    lineHeight: RESULT_HEADER_ICON_SIZE,
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
    color: '#475569',
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
    color: '#475569',
  },
  votesTextActive: {
    color: '#ffffff',
  },
  openNowNotice: {
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  openNowNoticeWarning: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  openNowNoticeInfo: {
    backgroundColor: '#f8fafc',
    borderColor: '#c7d2fe',
  },
  openNowNoticeSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  openNowNoticeText: {
    color: '#0f172a',
    fontSize: 12,
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
    paddingTop: 12,
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
  resultMetaLine: {
    marginTop: 2,
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
    color: '#6b7280',
    fontSize: META_FONT_SIZE,
    fontWeight: '400',
    flexShrink: 1,
  },
  resultMetaTextRight: {
    textAlign: 'right',
  },
  resultMetaOpen: {
    color: '#16a34a',
    fontWeight: '600',
  },
  resultMetaClosingSoon: {
    color: '#f59e0b',
    fontSize: META_FONT_SIZE,
    fontWeight: '600',
  },
  resultMetaSuffix: {
    color: '#6b7280',
    fontWeight: '400',
  },
  resultMetaClosed: {
    color: '#dc2626',
    fontSize: META_FONT_SIZE,
    fontWeight: '600',
  },
  resultMetaSeparator: {
    color: '#6b7280',
    fontWeight: '400',
  },
  resultMetaPrice: {
    color: '#6b7280',
    fontSize: META_FONT_SIZE,
    fontWeight: '400',
  },
  resultMetaDistance: {
    color: '#6b7280',
    fontSize: META_FONT_SIZE,
    fontWeight: '400',
  },
  dishMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginTop: 2,
  },
  userLocationWrapper: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationHaloWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  userLocationShadow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.45)',
    shadowOpacity: 0.65,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 2.5,
    elevation: 4,
  },
  userLocationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5c5bff',
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
  metricsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    paddingBottom: 2,
  },
  primaryMetric: {
    gap: 4,
  },
  primaryMetricLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  primaryMetricValue: {
    fontSize: 32,
    color: QUALITY_COLOR,
  },
  secondaryMetrics: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
    paddingTop: 4,
  },
  secondaryMetric: {
    gap: 2,
  },
  secondaryMetricLabel: {
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  secondaryMetricValue: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 14,
  },
  metric: {
    minWidth: 70,
    gap: 4,
  },
  topFoodSection: {
    marginTop: 8,
  },
  textSlate900: {
    color: '#0f172a',
  },
  textSlate700: {
    color: '#334155',
  },
  textSlate600: {
    color: '#475569',
  },
  textSlate500: {
    color: '#64748b',
  },
  textRed600: {
    color: '#dc2626',
  },
  dishTitle: {
    fontSize: 17,
  },
  dishCardTitle: {
    fontSize: 18,
  },
  dishRestaurantName: {
    marginTop: 4,
    fontSize: 16,
    color: '#475569',
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
  topFoodText: {
    fontSize: 13,
    marginTop: 4,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    textAlign: 'center',
  },
  metricValue: {
    color: '#fb923c',
  },
  glassHighlightSmall: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -60,
    right: -30,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    opacity: 0.35,
    transform: [{ rotate: '25deg' }],
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
