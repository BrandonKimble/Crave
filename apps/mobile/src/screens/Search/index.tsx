import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PanGestureHandler, type PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Text } from '../../components';
import { colors as themeColors, shadows as shadowStyles } from '../../constants/theme';
import { getPriceRangeLabel } from '../../constants/pricing';
import {
  overlaySheetStyles,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_CORNER_RADIUS,
} from '../../overlays/overlaySheetStyles';
import RestaurantOverlay, {
  type RestaurantOverlayData,
} from '../../overlays/RestaurantOverlay';
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
  NaturalSearchRequest,
} from '../../types';
import restaurantPinImage from '../../assets/pins/restaurant-pin.png';
import BookmarksOverlay from '../../overlays/BookmarksOverlay';
import PollsOverlay from '../../overlays/PollsOverlay';
import { DEFAULT_MAP_CENTER, buildMapStyleURL } from '../../constants/map';
import { useOverlayStore, type OverlayKey } from '../../store/overlayStore';
import type { RootStackParamList } from '../../types/navigation';
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CONTENT_HORIZONTAL_PADDING = OVERLAY_HORIZONTAL_PADDING;
const SEARCH_HORIZONTAL_PADDING = Math.max(8, CONTENT_HORIZONTAL_PADDING - 2);
const CARD_GAP = 4;
const ACTIVE_TAB_COLOR = themeColors.primary;
const TAB_BUTTON_COLOR = themeColors.accentDark;
const QUALITY_COLOR = '#fbbf24';
const MINIMUM_VOTES_FILTER = 100;
type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  contextualScore: number;
};

type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
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

const PRICE_LEVEL_OPTIONS = [
  { label: '$5-20', value: 1 },
  { label: '$20-40', value: 2 },
  { label: '$40-70', value: 3 },
  { label: '$70+', value: 4 },
] as const;

const PRICE_RANGE_LABELS: Record<number, string> = {
  1: '$5-20',
  2: '$20-40',
  3: '$40-70',
  4: '$70+',
};

const SEGMENT_OPTIONS = [
  { label: 'Restaurants', value: 'restaurants' as const },
  { label: 'Dishes', value: 'dishes' as const },
] as const;
type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];
const TOGGLE_BORDER_RADIUS = 8;
const TOGGLE_HORIZONTAL_PADDING = 7;
const TOGGLE_VERTICAL_PADDING = 5;
const TOGGLE_STACK_GAP = 8;
const NAV_VERTICAL_PADDING = 8;

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

const getPriceRangeLabel = (priceLevel?: number | null): string | null => {
  if (priceLevel === null || priceLevel === undefined) {
    return null;
  }
  const rounded = Math.round(priceLevel);
  return PRICE_RANGE_LABELS[rounded] ?? null;
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

  React.useEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);

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
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const resultsScrollY = React.useRef(new Animated.Value(0)).current;
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
        { key: 'search' as OverlayKey, label: 'Search', icon: 'search' },
        { key: 'bookmarks' as OverlayKey, label: 'Bookmarks', icon: 'bookmark' },
        { key: 'polls' as OverlayKey, label: 'Polls', icon: 'bar-chart-2' },
      ] as const,
    []
  );
  const openNow = useSearchStore((state) => state.openNow);
  const setOpenNow = useSearchStore((state) => state.setOpenNow);
  const priceLevels = useSearchStore((state) => state.priceLevels);
  const setPriceLevels = useSearchStore((state) => state.setPriceLevels);
  const votes100Plus = useSearchStore((state) => state.votes100Plus);
  const setVotes100Plus = useSearchStore((state) => state.setVotes100Plus);
  const priceFiltersActive = priceLevels.length > 0;
  const priceButtonSummary = React.useMemo(() => {
    if (!priceLevels.length) {
      return 'Any price';
    }
    return priceLevels
      .map((level) => PRICE_RANGE_LABELS[level] ?? null)
      .filter((label): label is string => Boolean(label))
      .join(' · ');
  }, [priceLevels]);
  const trimmedQuery = query.trim();
  const hasTypedQuery = trimmedQuery.length > 0;
  const shouldShowRecentSection = isSearchOverlay && isSearchFocused && !hasTypedQuery;
  const shouldRenderAutocompleteSection =
    isSearchOverlay && !isAutocompleteSuppressed && trimmedQuery.length >= 2;
  const shouldRenderSuggestionPanel = shouldRenderAutocompleteSection || shouldShowRecentSection;
  const hasRecentSearches = recentSearches.length > 0;
  const priceButtonIsActive = priceFiltersActive || isPriceSelectorVisible;
  const votesFilterActive = votes100Plus;
  const bottomInset = Math.max(insets.bottom, 12);
  const shouldHideBottomNav = isSearchOverlay && (isSearchSessionActive || isLoading);
  const focusSearchInput = React.useCallback(() => {
    inputRef.current?.focus();
  }, []);
  const handleResultsScroll = React.useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: resultsScrollY } } }], {
        useNativeDriver: true,
      }),
    [resultsScrollY]
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

  const activeList = activeTab === 'dishes' ? dishes : restaurants;

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

  const sheetPanGesture = useAnimatedGestureHandler<PanGestureHandlerGestureEvent, SheetGestureContext>(
    {
      onStart: (_, context) => {
        context.startY = sheetTranslateY.value;
        const currentState = sheetStateShared.value === 'hidden' ? 'collapsed' : sheetStateShared.value;
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
        } else if (
          event.translationY < -SMALL_MOVEMENT_THRESHOLD &&
          context.startStateIndex > 0
        ) {
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
    setIsPriceSelectorVisible((visible) => !visible);
  }, [isLoading]);

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

  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions, overrideQuery?: string) => {
      if (isLoading) {
        return;
      }

      const baseQuery = overrideQuery ?? query;
      const trimmed = baseQuery.trim();
      if (!trimmed) {
        setResults(null);
        setSubmittedQuery('');
        setError(null);
        return;
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

      setIsSearchSessionActive(true);
      showPanel();
      setIsAutocompleteSuppressed(true);
      setShowSuggestions(false);

      try {
        setIsLoading(true);
        setError(null);

        const payload: NaturalSearchRequest = {
          query: trimmed,
          pagination: { page: 1, pageSize: 10 },
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

        if (mapRef.current?.getVisibleBounds) {
          try {
            const visibleBounds = await mapRef.current.getVisibleBounds();
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

        const response = await searchService.naturalSearch(payload);

        logger.info('Search response payload', response);

        setResults(response);
        setSubmittedQuery(trimmed);
        setActiveTab(
          response?.format === 'dual_list' || response?.food?.length ? 'dishes' : 'restaurants'
        );

        updateLocalRecentSearches(trimmed);
        void loadRecentHistory();

        Keyboard.dismiss();
      } catch (err) {
        logger.error('Search request failed', { message: (err as Error).message });
        setError('Unable to fetch results. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [
      query,
      isLoading,
      showPanel,
      openNow,
      priceLevels,
      votes100Plus,
      loadRecentHistory,
      updateLocalRecentSearches,
      setIsSearchSessionActive,
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
      if (shouldRefocusInput) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    },
    [hidePanel, setIsSearchSessionActive]
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

  const togglePriceLevel = React.useCallback(
    (level: number) => {
      if (isLoading) {
        return;
      }

      const normalizedLevel = Math.max(0, Math.min(4, Math.round(level)));
      const nextSet = new Set(priceLevels);
      if (nextSet.has(normalizedLevel)) {
        nextSet.delete(normalizedLevel);
      } else {
        nextSet.add(normalizedLevel);
      }
      const nextLevels = Array.from(nextSet).sort((a, b) => a - b);
      setPriceLevels(nextLevels);

      if (query.trim()) {
        void submitSearch({ priceLevels: nextLevels });
      }
    },
    [isLoading, priceLevels, query, setPriceLevels, submitSearch]
  );

  const clearPriceLevels = React.useCallback(() => {
    if (isLoading || priceLevels.length === 0) {
      return;
    }

    setPriceLevels([]);
    if (query.trim()) {
      void submitSearch({ priceLevels: [] });
    }
  }, [isLoading, priceLevels.length, query, setPriceLevels, submitSearch]);

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
          <Feather
            name="dollar-sign"
            size={14}
            color={priceButtonIsActive ? '#ffffff' : '#475569'}
            style={styles.priceButtonIcon}
          />
          <Text
            variant="caption"
            weight="semibold"
            style={[styles.priceButtonLabel, priceButtonIsActive && styles.priceButtonLabelActive]}
          >
            Price
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
            <Text variant="caption" style={styles.priceFilterLabel}>
              Select price range
            </Text>
            <Pressable
              onPress={clearPriceLevels}
              disabled={isLoading || priceLevels.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Clear selected price filters"
              accessibilityState={{
                disabled: isLoading || priceLevels.length === 0,
              }}
              style={[
                styles.clearPriceButton,
                (isLoading || priceLevels.length === 0) && styles.clearPriceButtonDisabled,
              ]}
            >
              <Text
                variant="caption"
                style={[
                  styles.clearPriceButtonText,
                  (isLoading || priceLevels.length === 0) && styles.clearPriceButtonTextDisabled,
                ]}
              >
                Clear
              </Text>
            </Pressable>
          </View>
          <View style={styles.priceFilterChips}>
            {PRICE_LEVEL_OPTIONS.map((option) => {
              const selected = priceLevels.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  onPress={() => togglePriceLevel(option.value)}
                  disabled={isLoading}
                  style={[
                    styles.priceChip,
                    selected && styles.priceChipSelected,
                    isLoading && styles.priceChipDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle ${option.label} price level`}
                  accessibilityState={{ selected, disabled: isLoading }}
                >
                  <Text
                    variant="caption"
                    style={[styles.priceChipText, selected && styles.priceChipTextSelected]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={clearPriceLevels}
              disabled={isLoading || priceLevels.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Clear selected price filters"
              accessibilityState={{
                disabled: isLoading,
                selected: priceLevels.length === 0,
              }}
              style={[
                styles.priceChip,
                priceLevels.length === 0 && styles.priceChipSelected,
                isLoading && styles.priceChipDisabled,
              ]}
            >
              <Text
                variant="caption"
                style={[
                  styles.priceChipText,
                  priceLevels.length === 0 && styles.priceChipTextSelected,
                ]}
              >
                All
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );

const renderDishCard = (item: FoodResult, index: number, options?: ResultCardOptions) => {
  const isLiked = favoriteMap.has(item.foodId);
  const qualityColor = getQualityColor(index, dishes.length);
  const restaurantForDish = restaurantsById.get(item.restaurantId);
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
      {options?.showFilters ? renderFiltersSection() : null}
      <Pressable
        style={styles.resultPressable}
        onPress={handleDishPress}
        accessibilityRole={restaurantForDish ? 'button' : undefined}
        accessibilityLabel={restaurantForDish ? `View ${item.restaurantName}` : undefined}
        disabled={!restaurantForDish}
      >
        <View style={styles.resultHeader}>
          <View style={[styles.rankBadge, styles.rankBadgeLifted]}>
            <Text variant="body" weight="bold" style={styles.rankBadgeText}>
              {index + 1}
            </Text>
          </View>
        <View style={styles.resultTitleContainer}>
          <Text variant="body" weight="bold" style={[styles.textSlate900, styles.dishCardTitle]}>
            {item.foodName}
          </Text>
          <Text variant="body" weight="medium" style={[styles.textSlate600, styles.dishCardTitle]}>
            {' '}
            • {item.restaurantName}
          </Text>
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
              Score
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
  const handleShare = () => {
    void Share.share({
      message: `${restaurant.restaurantName} · View on Crave Search`,
    }).catch(() => undefined);
  };
  return (
    <View key={restaurant.restaurantId} style={styles.resultItem}>
      {options?.showFilters ? renderFiltersSection() : null}
      <Pressable
        style={styles.resultPressable}
        onPress={() => openRestaurantProfile(restaurant)}
        accessibilityRole="button"
        accessibilityLabel={`View ${restaurant.restaurantName}`}
      >
        <View style={styles.resultHeader}>
          <View style={styles.rankBadge}>
            <Text variant="body" weight="bold" style={styles.rankBadgeText}>
              {index + 1}
            </Text>
          </View>
        <View style={styles.resultTitleContainer}>
          <Text variant="subtitle" weight="bold" style={[styles.textSlate900, styles.dishTitle]}>
            {restaurant.restaurantName}
          </Text>
          {priceRangeLabel ? (
            <Text style={styles.priceInlineLabel}> · {priceRangeLabel}</Text>
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
          <View style={styles.metricsContainer}>
            <View style={styles.primaryMetric}>
              <Text variant="caption" style={styles.primaryMetricLabel}>
                Context
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
                    Quality
                  </Text>
                  <Text variant="body" weight="semibold" style={styles.secondaryMetricValue}>
                    {restaurant.restaurantQualityScore.toFixed(1)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
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
      </View>
      </Pressable>
    </View>
  );
};

  const renderDishResults = () => {
    if (!dishes.length) {
      return <EmptyState message="No dishes found. Try adjusting your search." />;
    }

    return dishes.map((dish, index) =>
      renderDishCard(dish, index, { showFilters: index === 0 })
    );
  };

  const renderRestaurantResults = () => {
    if (!restaurants.length) {
      return <EmptyState message="No restaurants found. Try adjusting your search." />;
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
          centerCoordinate={DEFAULT_MAP_CENTER}
          zoomLevel={12}
          pitch={32}
        />
        <MapboxGL.Images images={{ restaurantPin: restaurantPinImage }} />
        {restaurantFeatures.features.length ? (
          <MapboxGL.ShapeSource id="restaurant-results" shape={restaurantFeatures}>
            <MapboxGL.SymbolLayer
              id="restaurant-pins"
              style={{
                iconImage: 'restaurantPin',
                iconAllowOverlap: true,
                iconAnchor: 'bottom',
                iconSize: 0.05,
                iconOffset: [0, -1],
                textField: ['get', 'restaurantName'],
                textSize: 12,
                textColor: '#0f172a',
                textHaloColor: '#ffffff',
                textHaloWidth: 1.2,
                textOffset: [0, -1.6],
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}
      </MapboxGL.MapView>

      {isSearchOverlay && (
        <SafeAreaView style={styles.overlay} pointerEvents="box-none" edges={['top', 'left', 'right']}>
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
                  >
                    <Feather name="search" size={20} color="#6b7280" style={styles.searchIcon} />
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
                  <Reanimated.View style={[styles.trailingContainer, searchBarInputAnimatedStyle]}>
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
                        <Feather name="x" size={24} color={ACTIVE_TAB_COLOR} />
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
                            <Text style={styles.autocompleteLoadingText}>Looking for matches…</Text>
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
              <PanGestureHandler onGestureEvent={sheetPanGesture}>
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
                  <View style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}>
                    <Text variant="body" weight="semibold" style={styles.submittedQueryLabel}>
                      {submittedQuery || 'Results'}
                    </Text>
                    <Pressable
                      onPress={handleCloseResults}
                      accessibilityRole="button"
                      accessibilityLabel="Close results"
                      style={overlaySheetStyles.closeButton}
                      hitSlop={8}
                    >
                      <Feather name="x" size={24} color={ACTIVE_TAB_COLOR} />
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
                  style={[styles.resultsCard, styles.resultsCardSurface, styles.resultsCardCentered]}
                >
                  <ActivityIndicator size="large" color="#FB923C" />
                  <Text variant="body" style={[styles.textSlate600, styles.loadingText]}>
                    Looking for the best matches...
                  </Text>
                </View>
              ) : (
                <View style={styles.resultsCard}>
                  <Animated.ScrollView
                    style={styles.resultsScroll}
                    contentContainerStyle={styles.resultsScrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    onScroll={handleResultsScroll}
                    scrollEventThrottle={16}
                  >
                    <View style={styles.resultsInner}>
                      {activeTab === 'dishes' ? renderDishResults() : renderRestaurantResults()}
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
          <View
            style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_VERTICAL_PADDING }]}
          >
            {navItems.map((item) => {
              const active = activeOverlay === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={styles.navButton}
                  onPress={() => handleOverlaySelect(item.key)}
                >
                  <Feather
                    name={item.icon}
                    size={20}
                    color={active ? ACTIVE_TAB_COLOR : '#94a3b8'}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.navButton} onPress={handleProfilePress}>
              <Feather name="user" size={20} color="#94a3b8" />
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
  priceButtonIcon: {
    marginRight: 6,
  },
  priceButtonTextWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    gap: 8,
  },
  priceButtonLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  priceButtonLabelActive: {
    color: '#ffffff',
  },
  priceButtonSummary: {
    color: ACTIVE_TAB_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  priceButtonSummaryActive: {
    color: '#ffffff',
  },
  priceButtonChevron: {
    marginLeft: 8,
  },
  priceSelector: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  priceSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  priceFilterLabel: {
    color: '#475569',
  },
  clearPriceButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clearPriceButtonDisabled: {
    opacity: 0.5,
  },
  clearPriceButtonText: {
    color: '#475569',
  },
  clearPriceButtonTextDisabled: {
    color: '#94a3b8',
  },
  priceFilterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  priceChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
    backgroundColor: '#ffffff',
  },
  priceChipSelected: {
    backgroundColor: '#f97384',
    borderColor: '#f97384',
  },
  priceChipDisabled: {
    opacity: 0.5,
  },
  priceChipText: {
    color: '#475569',
  },
  priceChipTextSelected: {
    color: '#ffffff',
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
  navLabel: {
    fontSize: 12,
    marginTop: 4,
    color: '#94a3b8',
    fontWeight: '600',
  },
  navLabelActive: {
    color: ACTIVE_TAB_COLOR,
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
    paddingBottom: 500,
    paddingTop: 0,
  },
  submittedQueryLabel: {
    flexShrink: 1,
    marginRight: 12,
    color: '#0f172a',
    fontSize: 16,
    marginBottom: 0,
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
  resultFiltersWrapper: {
    marginBottom: 16,
    gap: 12,
  },
  resultItem: {
    paddingVertical: 12,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    backgroundColor: '#ffffff',
    marginBottom: CARD_GAP,
    alignSelf: 'stretch',
    borderRadius: 14,
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
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeLifted: {
    marginTop: -4,
  },
  rankBadgeText: {
    color: ACTIVE_TAB_COLOR,
    fontSize: 15,
    fontWeight: '700',
  },
  rankBadgeMuted: {
    backgroundColor: '#f1f5f9',
    shadowOpacity: 0,
    elevation: 0,
  },
  rankBadgeTextMuted: {
    color: '#94a3b8',
  },
  resultTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    minHeight: 32,
    paddingTop: 2,
  },
  priceInlineLabel: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
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
    marginLeft: 40,
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
    fontSize: 15,
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
