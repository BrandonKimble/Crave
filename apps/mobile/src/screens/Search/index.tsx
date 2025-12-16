import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  Easing as RNEasing,
} from 'react-native';
import type { LayoutRectangle, TextInput } from 'react-native';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import Reanimated, {
  Extrapolation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import MapboxGL, { type MapState as MapboxMapState } from '@rnmapbox/maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '@clerk/clerk-expo';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Text } from '../../components';
import { HandPlatter, Heart, Store, X as LucideX } from 'lucide-react-native';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';
import { colors as themeColors } from '../../constants/theme';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from '../../overlays/overlaySheetStyles';
import RestaurantOverlay, { type RestaurantOverlayData } from '../../overlays/RestaurantOverlay';
import SecondaryBottomSheet from '../../overlays/SecondaryBottomSheet';
import { useHeaderCloseCutout } from '../../overlays/useHeaderCloseCutout';
import { SHEET_SPRING_CONFIG, type SheetPosition } from '../../overlays/sheetUtils';
import { logger } from '../../utils';
import {
  searchService,
  type StructuredSearchRequest,
  type RecentlyViewedRestaurant,
} from '../../services/search';
import type { AutocompleteMatch } from '../../services/autocomplete';
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
import type { SnapPoints } from '../../overlays/BottomSheetWithFlashList';
import { buildMapStyleURL } from '../../constants/map';
import { useOverlayStore, type OverlayKey } from '../../store/overlayStore';
import type { RootStackParamList } from '../../types/navigation';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import MaskedHoleOverlay, { type MaskedHole } from '../../components/MaskedHoleOverlay';
import { useSearchRequests } from '../../hooks/useSearchRequests';
import { useFavorites } from '../../hooks/use-favorites';
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
import useSearchHistory from './hooks/use-search-history';
import useSearchSheet from './hooks/use-search-sheet';
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
  MINIMUM_VOTES_FILTER,
  NAV_BOTTOM_PADDING,
  SCORE_INFO_MAX_HEIGHT,
  SCREEN_HEIGHT,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_HORIZONTAL_PADDING,
  SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM,
  SEARCH_SUGGESTION_HEADER_PANEL_GAP,
  SEARCH_SUGGESTION_PANEL_OVERLAP,
  SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM,
  SEARCH_SUGGESTION_PANEL_PADDING_TOP,
  SECONDARY_METRIC_ICON_SIZE,
  SHARED_SECTION_GAP,
  SHORTCUT_CHIP_HOLE_PADDING,
  SHORTCUT_CHIP_HOLE_RADIUS,
  USA_FALLBACK_CENTER,
  USA_FALLBACK_ZOOM,
  type SegmentValue,
} from './constants/search';
import {
  buildLevelsFromRange,
  formatPriceRangeSummary,
  getRangeFromLevels,
  isFullPriceRange,
  normalizePriceFilter,
  normalizePriceRangeValues,
  type PriceRangeTuple,
} from './utils/price';
import { mergeSearchResponses } from './utils/merge';
import { getQualityColor } from './utils/quality';
import { formatCompactCount } from './utils/format';
import { resolveSingleRestaurantCandidate } from './utils/response';
import {
  boundsFromPairs,
  hasBoundsMovedSignificantly,
  isLngLatTuple,
  mapStateBoundsToMapBounds,
} from './utils/geo';

type SubmitSearchOptions = {
  openNow?: boolean;
  priceLevels?: number[] | null;
  minimumVotes?: number | null;
  page?: number;
  append?: boolean;
  preserveSheetState?: boolean;
  submission?: {
    source: NaturalSearchRequest['submissionSource'];
    context?: NaturalSearchRequest['submissionContext'];
  };
};

MapboxGL.setTelemetryEnabled(false);

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { favoriteMap, favoritesVersion, toggleFavorite } = useFavorites({
    enabled: !!isSignedIn,
  });
  const accessToken = React.useMemo(() => process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '', []);
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const latestBoundsRef = React.useRef<MapBounds | null>(null);
  const [mapCenter, setMapCenter] = React.useState<[number, number]>(USA_FALLBACK_CENTER);
  const [mapZoom, setMapZoom] = React.useState<number>(USA_FALLBACK_ZOOM);
  const [isFollowingUser, setIsFollowingUser] = React.useState(true);

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
    void (async () => {
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
  const [searchLayout, setSearchLayout] = React.useState({ top: 0, height: 0 });
  const [searchContainerFrame, setSearchContainerFrame] = React.useState<LayoutRectangle | null>(
    null
  );
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
    loadRecentlyViewedRestaurants,
    updateLocalRecentSearches,
    trackRecentlyViewedRestaurant,
  } = useSearchHistory({ isSignedIn: !!isSignedIn });
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [topFoodInlineWidths, setTopFoodInlineWidths] = React.useState<Record<string, number>>({});
  const [topFoodItemWidths, setTopFoodItemWidths] = React.useState<
    Record<string, Record<string, number>>
  >({});
  const [topFoodMoreWidths, setTopFoodMoreWidths] = React.useState<
    Record<string, Record<number, number>>
  >({});
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
  const searchThisAreaVisibility = useSharedValue(0);
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);
  const mapMovedSinceSearchRef = React.useRef(false);
  const mapGestureActiveRef = React.useRef(false);
  const mapIdleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateTopFoodInlineWidth = React.useCallback((restaurantId: string, width: number) => {
    setTopFoodInlineWidths((prev) => {
      if (prev[restaurantId] && Math.abs(prev[restaurantId] - width) < 0.5) {
        return prev;
      }
      return { ...prev, [restaurantId]: width };
    });
  }, []);
  const updateTopFoodItemWidth = React.useCallback(
    (restaurantId: string, connectionId: string, width: number) => {
      setTopFoodItemWidths((prev) => {
        const existing = prev[restaurantId] ?? {};
        if (existing[connectionId] && Math.abs(existing[connectionId] - width) < 0.5) {
          return prev;
        }
        return { ...prev, [restaurantId]: { ...existing, [connectionId]: width } };
      });
    },
    []
  );
  const updateTopFoodMoreWidth = React.useCallback(
    (restaurantId: string, hiddenCount: number, width: number) => {
      setTopFoodMoreWidths((prev) => {
        const existing = prev[restaurantId] ?? {};
        if (existing[hiddenCount] && Math.abs(existing[hiddenCount] - width) < 0.5) {
          return prev;
        }
        return { ...prev, [restaurantId]: { ...existing, [hiddenCount]: width } };
      });
    },
    []
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
  const lastSearchRequestIdRef = React.useRef<string | null>(null);
  const searchSurfaceAnim = useSharedValue(0);
  const suggestionTransition = useSharedValue(0);
  const inputRef = React.useRef<TextInput | null>(null);
  const resultsScrollRef = React.useRef<FlashList<FoodResult | RestaurantResult> | null>(null);
  const locationRequestInFlightRef = React.useRef(false);
  const userLocationRef = React.useRef<Coordinate | null>(null);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const locationPulse = React.useRef(new Animated.Value(0)).current;
  const hasCenteredOnLocationRef = React.useRef(false);
  const filterDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestSeqRef = React.useRef(0);
  const activeSearchRequestRef = React.useRef(0);
  const activeOverlay = useOverlayStore((state) => state.activeOverlay);
  const overlayParams = useOverlayStore((state) => state.overlayParams);
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const registerTransientDismissor = useOverlayStore((state) => state.registerTransientDismissor);
  const dismissTransientOverlays = useOverlayStore((state) => state.dismissTransientOverlays);
  const isSearchOverlay = activeOverlay === 'search';
  const showBookmarksOverlay = activeOverlay === 'bookmarks';
  const showPollsOverlay = activeOverlay === 'polls';
  const pollOverlayParams = overlayParams.polls;
  const {
    panelVisible,
    setPanelVisible,
    sheetState,
    setSheetState,
    snapPoints,
    shouldRenderSheet,
    sheetTranslateY,
    sheetStateShared,
    resetSheetToHidden,
    animateSheetTo,
    showPanel,
    hideSheet,
    handleSheetSnapChange,
    searchBarInputAnimatedStyle,
    searchBarSheetAnimatedStyle,
    resultsContainerAnimatedStyle,
    resultsScrollOffset,
    resultsMomentum,
    onResultsScroll,
    onResultsScrollBeginDrag: handleResultsScrollBeginDrag,
    onResultsScrollEndDrag: handleResultsScrollEndDrag,
    headerDividerAnimatedStyle,
  } = useSearchSheet({
    isSearchOverlay,
    isSearchFocused,
    searchLayoutTop: searchLayout.top,
  });
  const [scoreInfo, setScoreInfo] = React.useState<{
    type: 'dish' | 'restaurant';
    title: string;
    score: number | null | undefined;
    votes: number | null | undefined;
    polls: number | null | undefined;
  } | null>(null);
  const [isScoreInfoVisible, setScoreInfoVisible] = React.useState(false);
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

  const handleOverlaySelect = React.useCallback(
    (target: OverlayKey) => {
      dismissTransientOverlays();
      setOverlay(target);
      if (target === 'search') {
        inputRef.current?.focus();
      } else {
        inputRef.current?.blur();
      }
    },
    [dismissTransientOverlays, setOverlay]
  );
  const { runAutocomplete, runSearch, cancelAutocomplete, cancelSearch, isAutocompleteLoading } =
    useSearchRequests();
  const handleProfilePress = React.useCallback(() => {
    dismissTransientOverlays();
    navigation.navigate('Profile');
  }, [dismissTransientOverlays, navigation]);
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
            r={active ? 4.2 : 3.2}
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
      polls: (color: string, active: boolean) => (
        <PollIcon color={color} size={20} strokeWidth={active ? 2.5 : 2} />
      ),
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
  const resetFilters = useSearchStore((state) => state.resetFilters);
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
  const trimmedQuery = query.trim();
  const hasTypedQuery = trimmedQuery.length > 0;
  const shouldShowRecentSection = isSearchOverlay && isSearchFocused && !hasTypedQuery;
  const shouldRenderAutocompleteSection =
    isSearchOverlay &&
    isSearchFocused &&
    !isAutocompleteSuppressed &&
    trimmedQuery.length >= AUTOCOMPLETE_MIN_CHARS;
  const shouldRenderSuggestionPanel = shouldRenderAutocompleteSection || shouldShowRecentSection;
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
      return searchShortcutsFrame.y + searchShortcutsFrame.height;
    }
    if (searchContainerFrame) {
      return searchContainerFrame.y + searchContainerFrame.height;
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
    return Math.max(0, contentBottom + SEARCH_SUGGESTION_HEADER_PADDING_BOTTOM);
  }, [isSuggestionScreenActive, suggestionHeaderContentBottom]);
  const suggestionScrollTop = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return 0;
    }

    const fallback = searchLayout.top + searchLayout.height + 8;
    const headerBottom =
      suggestionHeaderHeight > 0
        ? suggestionHeaderHeight + SEARCH_SUGGESTION_HEADER_PANEL_GAP
        : fallback;
    return Math.max(0, headerBottom + SHARED_SECTION_GAP);
  }, [isSuggestionScreenActive, searchLayout.height, searchLayout.top, suggestionHeaderHeight]);
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
        holes.push({
          x,
          y,
          width,
          height: height + SEARCH_BAR_HOLE_PADDING * 2,
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
        holes.push({
          x,
          y,
          width,
          height,
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
    const shadowOpacity = 0.2 * backgroundAlpha;
    const borderAlpha = 0.35 * backgroundAlpha;
    return {
      backgroundColor: `rgba(255, 255, 255, ${backgroundAlpha})`,
      shadowOpacity,
      shadowRadius: 2 + 2 * shadowOpacity,
      borderColor: `rgba(226, 232, 240, ${borderAlpha})`,
      borderWidth: backgroundAlpha > 0 ? StyleSheet.hairlineWidth : 0,
      elevation: backgroundAlpha > 0 ? 1 : 0,
    };
  });
  const suggestionMaskAnimatedStyle = useAnimatedStyle(() => ({
    opacity: suggestionTransition.value,
  }));
  const hasRecentSearches = recentSearches.length > 0;
  const hasRecentlyViewedRestaurants = recentlyViewedRestaurants.length > 0;
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
  const suggestionPanelTopMargin = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return 0;
    }
    return Math.max(0, suggestionScrollTop - SEARCH_SUGGESTION_PANEL_OVERLAP);
  }, [isSuggestionScreenActive, suggestionScrollTop]);
  const suggestionPanelOverlap = React.useMemo(
    () =>
      isSuggestionScreenActive ? Math.min(SEARCH_SUGGESTION_PANEL_OVERLAP, suggestionScrollTop) : 0,
    [isSuggestionScreenActive, suggestionScrollTop]
  );
  const suggestionScrollMaxHeight = React.useMemo(() => {
    if (!isSuggestionScreenActive) {
      return undefined;
    }
    const available =
      SCREEN_HEIGHT -
      suggestionPanelTopMargin -
      bottomInset -
      SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM;
    return available > 0 ? available : undefined;
  }, [bottomInset, isSuggestionScreenActive, suggestionPanelTopMargin]);
  const suggestionPanelMaxHeight = React.useMemo(() => {
    if (!suggestionScrollMaxHeight) {
      return undefined;
    }
    return Math.max(
      0,
      suggestionScrollMaxHeight -
        (SEARCH_SUGGESTION_PANEL_PADDING_TOP +
          SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM +
          suggestionPanelOverlap)
    );
  }, [suggestionPanelOverlap, suggestionScrollMaxHeight]);
  // Hide the bottom nav only while search is in use (focused/suggestions) or mid-session.
  const shouldHideBottomNav =
    isSearchOverlay && (isSearchSessionActive || isSearchFocused || isLoading);
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
  }, [cancelAutocomplete, dismissTransientOverlays, query, showCachedSuggestionsIfFresh]);
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
        lastSearchRequestIdRef.current = response.metadata.searchRequestId ?? null;
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
          const hasEntityTargets = [
            ...(response.plan?.restaurantFilters ?? []),
            ...(response.plan?.connectionFilters ?? []),
          ].some((filter) => Array.isArray(filter.entityIds) && filter.entityIds.length > 0);

          if (hasEntityTargets) {
            updateLocalRecentSearches(submittedLabel);
          }

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

  const handleQueryChange = React.useCallback((value: string) => {
    setIsAutocompleteSuppressed(false);
    setQuery(value);
  }, []);
  const restaurants = results?.restaurants ?? [];
  const dishes = results?.food ?? [];

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
  const handleSheetSnapChange = React.useCallback(
    (nextSnap: SheetPosition | 'hidden') => {
      const nextState: SheetPosition = nextSnap === 'hidden' ? 'hidden' : nextSnap;
      setSheetState(nextState);
      sheetStateShared.value = nextState;
      setPanelVisible(nextSnap !== 'hidden');
    },
    [setPanelVisible, sheetStateShared]
  );
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
  }, [isPriceSelectorVisible, commitPriceSelection, priceLevels]);

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

        if (!append) {
          payload.submissionSource = options?.submission?.source ?? 'manual';
          if (options?.submission?.context) {
            payload.submissionContext = options.submission.context;
          }
        }

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
      void submitSearch(
        { submission: { source: 'autocomplete', context: submissionContext } },
        nextQuery
      );
    },
    [query, submitSearch, setIsAutocompleteSuppressed, setIsSearchFocused]
  );

  const clearSearchState = React.useCallback(
    ({ shouldRefocusInput = false }: { shouldRefocusInput?: boolean } = {}) => {
      cancelSearch();
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
      resetFilters,
      resetMapMoveFlag,
      setIsSearchSessionActive,
      setSearchMode,
      scrollResultsToTop,
    ]
  );

  const handleClear = React.useCallback(() => {
    clearSearchState({ shouldRefocusInput: true });
  }, [clearSearchState]);

  const handleCloseResults = React.useCallback(() => {
    clearSearchState();
  }, [clearSearchState]);

  const handleSearchFocus = React.useCallback(() => {
    dismissTransientOverlays();
    setIsSearchFocused(true);
    setIsAutocompleteSuppressed(false);
    void loadRecentHistory();
    void loadRecentlyViewedRestaurants();
  }, [dismissTransientOverlays, loadRecentHistory, loadRecentlyViewedRestaurants]);

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
      void submitSearch({ submission: { source: 'recent' } }, trimmedValue);
    },
    [submitSearch, updateLocalRecentSearches, setIsAutocompleteSuppressed, setIsSearchFocused]
  );

  const handleRecentlyViewedRestaurantPress = React.useCallback(
    (item: RecentlyViewedRestaurant) => {
      const trimmedValue = item.restaurantName.trim();
      if (!trimmedValue) {
        return;
      }
      setQuery(trimmedValue);
      setShowSuggestions(false);
      setSuggestions([]);
      updateLocalRecentSearches(trimmedValue);
      setIsAutocompleteSuppressed(true);
      setIsSearchFocused(false);
      void submitSearch({ submission: { source: 'recent' } }, trimmedValue);
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

  const openRestaurantProfile = React.useCallback(
    (
      restaurant: RestaurantResult,
      foodResultsOverride?: FoodResult[],
      source: 'results_sheet' | 'auto_open_single_candidate' = 'results_sheet'
    ) => {
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
      trackRecentlyViewedRestaurant(restaurant.restaurantId, restaurant.restaurantName);

      void recordRestaurantView(restaurant.restaurantId, source);
    },
    [
      dishes,
      favoriteMap,
      submittedQuery,
      trimmedQuery,
      trackRecentlyViewedRestaurant,
      recordRestaurantView,
    ]
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
    openRestaurantProfile(targetRestaurant, results.food ?? [], 'auto_open_single_candidate');
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
      void toggleFavorite(restaurantId, 'restaurant');
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
  const dishesCount = dishes.length;
  const restaurantsCount = restaurants.length;

  const renderDishCard = React.useCallback(
    (item: FoodResult, index: number) => (
      <DishResultCard
        item={item}
        index={index}
        dishesCount={dishesCount}
        favoriteMap={favoriteMap}
        restaurantsById={restaurantsById}
        toggleFavorite={toggleFavorite}
        openRestaurantProfile={openRestaurantProfile}
        openScoreInfo={openScoreInfo}
      />
    ),
    [
      dishesCount,
      favoriteMap,
      openRestaurantProfile,
      openScoreInfo,
      restaurantsById,
      toggleFavorite,
    ]
  );

  const renderRestaurantCard = React.useCallback(
    (restaurant: RestaurantResult, index: number) => (
      <RestaurantResultCard
        restaurant={restaurant}
        index={index}
        restaurantsCount={restaurantsCount}
        favoriteMap={favoriteMap}
        toggleFavorite={toggleFavorite}
        openRestaurantProfile={openRestaurantProfile}
        openScoreInfo={openScoreInfo}
        primaryFoodTerm={primaryFoodTerm}
        topFoodInlineWidths={topFoodInlineWidths}
        topFoodItemWidths={topFoodItemWidths}
        topFoodMoreWidths={topFoodMoreWidths}
        updateTopFoodInlineWidth={updateTopFoodInlineWidth}
        updateTopFoodItemWidth={updateTopFoodItemWidth}
        updateTopFoodMoreWidth={updateTopFoodMoreWidth}
      />
    ),
    [
      favoriteMap,
      openRestaurantProfile,
      openScoreInfo,
      primaryFoodTerm,
      restaurantsCount,
      toggleFavorite,
      topFoodInlineWidths,
      topFoodItemWidths,
      topFoodMoreWidths,
      updateTopFoodInlineWidth,
      updateTopFoodItemWidth,
      updateTopFoodMoreWidth,
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
    () => (Array.isArray(resultsData) ? resultsData : []),
    [resultsData]
  );
  const flatListDebugData = React.useMemo(() => {
    const length = safeResultsData.length;
    const sample = length > 0 ? safeResultsData[0] : null;
    return {
      isDishesTab,
      length,
      sampleType: sample ? typeof sample : 'nullish',
      favoritesVersion,
    };
  }, [favoritesVersion, isDishesTab, safeResultsData]);

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

  const resultsListFooterComponent = React.useMemo(
    () => (
      <View style={styles.loadMoreSpacer}>
        {isLoadingMore && canLoadMore ? (
          <ActivityIndicator size="small" color={ACTIVE_TAB_COLOR} />
        ) : null}
      </View>
    ),
    [canLoadMore, isLoadingMore]
  );

  const resultsListEmptyComponent = React.useMemo(() => {
    if (error) {
      return (
        <View style={[styles.resultsCard, styles.resultsCardSurface]}>
          <Text variant="caption" style={styles.textRed600}>
            {error}
          </Text>
        </View>
      );
    }
    if (isLoading && !results) {
      return (
        <View style={[styles.resultsCard, styles.resultsCardSurface, styles.resultsCardCentered]}>
          <ActivityIndicator size="large" color="#FB923C" />
          <Text variant="body" style={[styles.textSlate600, styles.loadingText]}>
            Looking for the best matches...
          </Text>
        </View>
      );
    }
    return (
      <EmptyState
        message={
          activeTab === 'dishes'
            ? 'No dishes found. Try adjusting your search.'
            : 'No restaurants found. Try adjusting your search.'
        }
      />
    );
  }, [activeTab, error, isLoading, results]);
  const searchThisAreaTop = Math.max(searchLayout.top + searchLayout.height + 12, insets.top + 12);
  const resultsHeaderComponent = (
    <Reanimated.View
      style={[overlaySheetStyles.header, overlaySheetStyles.headerTransparent]}
      onLayout={resultsHeaderCutout.onHeaderLayout}
    >
      {resultsHeaderCutout.background}
      <View style={overlaySheetStyles.grabHandleWrapper}>
        <Pressable onPress={hidePanel} accessibilityRole="button" accessibilityLabel="Hide results">
          <View style={overlaySheetStyles.grabHandle} />
        </Pressable>
      </View>
      <View
        onLayout={resultsHeaderCutout.onHeaderRowLayout}
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}
      >
        <Text variant="title" weight="semibold" style={styles.submittedQueryLabel}>
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
      <Animated.View style={[overlaySheetStyles.headerDivider, headerDividerAnimatedStyle]} />
    </Reanimated.View>
  );

  return (
    <View style={styles.container}>
      <SearchMap
        mapRef={mapRef}
        cameraRef={cameraRef}
        styleURL={mapStyleURL}
        mapCenter={mapCenter}
        mapZoom={mapZoom}
        isFollowingUser={isFollowingUser}
        onPress={handleMapPress}
        onCameraChanged={handleCameraChanged}
        sortedRestaurantMarkers={sortedRestaurantMarkers}
        markersRenderKey={markersRenderKey}
        buildMarkerKey={buildMarkerKey}
        restaurantFeatures={restaurantFeatures}
        restaurantLabelStyle={restaurantLabelStyle}
        userLocation={userLocation}
        locationPulse={locationPulse}
      />

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
            <View
              style={[
                styles.searchSurfaceScroll,
                isSuggestionScreenActive
                  ? [
                      styles.searchSuggestionScrollSurface,
                      {
                        marginTop: suggestionPanelTopMargin,
                        maxHeight: suggestionScrollMaxHeight,
                      },
                    ]
                  : null,
              ]}
            >
              <View
                style={[
                  styles.searchSurfaceContent,
                  {
                    paddingTop: isSuggestionScreenActive
                      ? 0
                      : searchLayout.top + searchLayout.height + 8,
                    paddingBottom: bottomInset + 32,
                  },
                ]}
              >
                {shouldRenderSuggestionPanel ? (
                  <View
                    style={[
                      styles.searchMiddlePanel,
                      {
                        marginTop: SEARCH_SUGGESTION_PANEL_PADDING_TOP + suggestionPanelOverlap,
                        paddingBottom: SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM,
                        paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
                      },
                      suggestionScrollMaxHeight ? { maxHeight: suggestionScrollMaxHeight } : null,
                    ]}
                  >
                    <SearchSuggestions
                      visible={shouldRenderSuggestionPanel}
                      showAutocomplete={shouldRenderAutocompleteSection}
                      showRecent={shouldShowRecentSection}
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
                      panelMaxHeight={suggestionPanelMaxHeight}
                    />
                  </View>
                ) : null}
              </View>
            </View>
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
              containerAnimatedStyle={[
                isSuggestionScreenActive ? null : searchBarSheetAnimatedStyle,
                searchBarAnimatedStyle,
                searchBarTransparencyAnimatedStyle,
              ]}
              editable
              showInactiveSearchIcon={!isSearchFocused && !isSearchSessionActive}
              isSearchSessionActive={isSearchSessionActive}
              surfaceVariant={isSuggestionScreenActive ? 'transparent' : 'solid'}
            />
          </View>
          {!isSearchSessionActive && (
            <View
              style={styles.searchShortcutsRow}
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
                  <Store size={16} color="#0f172a" strokeWidth={2} />
                  <Text variant="caption" weight="regular" style={styles.searchShortcutChipText}>
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
                  <HandPlatter size={16} color="#0f172a" strokeWidth={2} />
                  <Text variant="caption" weight="regular" style={styles.searchShortcutChipText}>
                    Best dishes
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
          <SearchResultsSheet
            visible={shouldRenderSheet}
            listScrollEnabled={!isPriceSelectorVisible}
            snapPoints={snapPoints}
            initialSnapPoint={sheetState === 'hidden' ? 'collapsed' : sheetState}
            sheetYValue={sheetTranslateY}
            scrollOffsetValue={resultsScrollOffset}
            momentumFlag={resultsMomentum}
            onScrollOffsetChange={onResultsScroll}
            onScrollBeginDrag={handleResultsScrollBeginDrag}
            onScrollEndDrag={handleResultsScrollEndDrag}
            onEndReached={canLoadMore ? loadMoreResults : undefined}
            extraData={flatListDebugData}
            data={safeResultsData}
            renderItem={renderSafeItem}
            keyExtractor={isDishesTab ? dishKeyExtractor : restaurantKeyExtractor}
            estimatedItemSize={240}
            ListHeaderComponent={listHeader}
            ListFooterComponent={resultsListFooterComponent}
            ListEmptyComponent={resultsListEmptyComponent}
            headerComponent={resultsHeaderComponent}
            listRef={resultsScrollRef}
            resultsContainerAnimatedStyle={resultsContainerAnimatedStyle}
            onHidden={() => {
              setPanelVisible(false);
              setSheetState('hidden');
              sheetStateShared.value = 'hidden';
            }}
            onSnapChange={handleSheetSnapChange}
          />
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
                <Text variant="caption" weight="semibold" style={styles.scoreInfoTitle}>
                  {scoreInfo.type === 'dish' ? 'Dish score' : 'Restaurant score'}
                </Text>
                <Text variant="caption" weight="semibold" style={styles.scoreInfoValue}>
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
            <Text variant="caption" style={styles.scoreInfoSubtitle} numberOfLines={1}>
              {scoreInfo.title}
            </Text>
            <View style={styles.scoreInfoMetricsRow}>
              <View style={styles.scoreInfoMetricItem}>
                <VoteIcon color={themeColors.textPrimary} size={14} />
                <Text variant="caption" weight="medium" style={styles.scoreInfoMetricText}>
                  {scoreInfo.votes == null ? '—' : formatCompactCount(scoreInfo.votes)}
                </Text>
                <Text variant="caption" style={styles.scoreInfoMetricLabel}>
                  Votes
                </Text>
              </View>
              <View style={styles.scoreInfoMetricItem}>
                <PollIcon color={themeColors.textPrimary} size={14} />
                <Text variant="caption" weight="medium" style={styles.scoreInfoMetricText}>
                  {scoreInfo.polls == null ? '—' : formatCompactCount(scoreInfo.polls)}
                </Text>
                <Text variant="caption" style={styles.scoreInfoMetricLabel}>
                  Polls
                </Text>
              </View>
            </View>
            <View style={styles.scoreInfoDivider} />
            <Text variant="caption" style={styles.scoreInfoDescription}>
              {scoreInfo.type === 'dish'
                ? "Dish score blends recent mentions and upvotes (time-decayed) with a small boost from the restaurant's overall quality, scaled 0–100."
                : 'Restaurant score weights its best dishes most, adds overall menu consistency, and factors in general praise upvotes with time decay, scaled 0–100.'}
            </Text>
          </View>
        ) : null}
      </SecondaryBottomSheet>
    </View>
  );
};

export default SearchScreen;
