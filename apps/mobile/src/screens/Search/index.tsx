import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import MapboxGL from '@rnmapbox/maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { Text, Button } from '../../components';
import { logger } from '../../utils';
import { searchService } from '../../services/search';
import { useSearchStore } from '../../store/searchStore';
import type {
  SearchResponse,
  FoodResult,
  RestaurantResult,
  MapBounds,
  NaturalSearchRequest,
} from '../../types';
import restaurantPinImage from '../../assets/pins/restaurant-pin.png';

const DEFAULT_STYLE_URL = 'mapbox://styles/brandonkimble/cmhjzgs6i00cl01s69ff1fsmf';
const AUSTIN_COORDINATE: [number, number] = [-97.7431, 30.2672];
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CONTENT_HORIZONTAL_PADDING = 15;
const CARD_GAP = 4;
const ACTIVE_TAB_COLOR = '#f97384';
const TAB_BUTTON_COLOR = '#a78bfa';
const QUALITY_COLOR = '#fbbf24';
type SheetPosition = 'hidden' | 'collapsed' | 'middle' | 'expanded';
type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  contextualScore: number;
};

type SubmitSearchOptions = {
  openNow?: boolean;
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

MapboxGL.setTelemetryEnabled(false);

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const accessToken = React.useMemo(() => process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '', []);
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const latestBoundsRef = React.useRef<MapBounds | null>(null);

  React.useEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);

  const mapStyleURL = React.useMemo(() => {
    const styleEnv = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL ?? DEFAULT_STYLE_URL;
    if (!styleEnv.startsWith('mapbox://styles/')) {
      return styleEnv;
    }

    const stylePath = styleEnv.replace('mapbox://styles/', '');
    const params = [`cachebuster=${Date.now()}`];
    if (accessToken) {
      params.push(`access_token=${encodeURIComponent(accessToken)}`);
    }
    return `https://api.mapbox.com/styles/v1/${stylePath}?${params.join('&')}`;
  }, [accessToken]);

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'dishes' | 'restaurants'>('dishes');
  const [panelVisible, setPanelVisible] = React.useState(false);
  const [sheetState, setSheetState] = React.useState<SheetPosition>('hidden');
  const [searchLayout, setSearchLayout] = React.useState({ top: 0, height: 0 });
  const [likedItems, setLikedItems] = React.useState<Set<string>>(new Set());
  const [hasUnlockedFullResults, setHasUnlockedFullResults] = React.useState(false);
  const [hasPreviewedResults, setHasPreviewedResults] = React.useState(false);
  const [previewQuery, setPreviewQuery] = React.useState('');
  const [isPaywallVisible, setIsPaywallVisible] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState<'monthly' | 'annual'>('monthly');
  const segmentAnim = React.useRef(new Animated.Value(activeTab === 'restaurants' ? 0 : 1)).current;
  const sheetTranslateY = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const panOffset = React.useRef(0);
  const isAnimating = React.useRef(false);
  const inputRef = React.useRef<TextInput | null>(null);
  const openNow = useSearchStore((state) => state.openNow);
  const setOpenNow = useSearchStore((state) => state.setOpenNow);
  const restaurants = results?.restaurants ?? [];
  const dishes = results?.food ?? [];

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
  const shouldGateResults = Boolean(
    results && hasPreviewedResults && !hasUnlockedFullResults && activeList.length > 3
  );
  const lockedCount = shouldGateResults ? Math.min(3, activeList.length) : 0;
  const previewItems = React.useMemo<(FoodResult | RestaurantResult)[]>(
    () => activeList.slice(0, lockedCount || 0),
    [activeList, lockedCount]
  );
  const remainingResults = Math.max(activeList.length - lockedCount, 0);
  const shouldShowPreview = shouldGateResults && previewItems.length > 0;

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
  const isDragging = React.useRef(false);
  const shouldRenderSheet = panelVisible || sheetState !== 'hidden';

  React.useEffect(() => {
    if (!panelVisible) {
      sheetTranslateY.setValue(snapPoints.hidden);
    }
  }, [panelVisible, sheetTranslateY, snapPoints.hidden]);

  React.useEffect(() => {
    if (!panelVisible || isDragging.current || isAnimating.current) {
      return;
    }
    sheetTranslateY.setValue(snapPoints[sheetState]);
  }, [panelVisible, searchLayout, sheetState, snapPoints, sheetTranslateY]);

  const animateSheetTo = React.useCallback(
    (position: SheetPosition, velocity = 0) => {
      const target = snapPoints[position];
      setSheetState(position);
      isAnimating.current = true;
      Animated.spring(sheetTranslateY, {
        toValue: target,
        velocity,
        useNativeDriver: true,
        damping: 18,
        stiffness: 180,
      }).start(({ finished }) => {
        isAnimating.current = false;
        if (finished && position === 'hidden') {
          setPanelVisible(false);
        }
      });
    },
    [sheetTranslateY, snapPoints]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            panOffset.current = value;
            isDragging.current = true;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const minY = snapPoints.expanded;
          const maxY = snapPoints.hidden;
          const next = Math.min(Math.max(panOffset.current + gestureState.dy, minY), maxY);
          sheetTranslateY.setValue(next);
        },
        onPanResponderRelease: (_, gestureState) => {
          isDragging.current = false;
          const minY = snapPoints.expanded;
          const maxY = snapPoints.hidden;
          const current = Math.min(Math.max(panOffset.current + gestureState.dy, minY), maxY);
          const velocity = gestureState.vy;
          const snapSequence: SheetPosition[] = ['expanded', 'middle', 'collapsed'];

          let target: SheetPosition = snapSequence.reduce((closest, position) => {
            const diff = Math.abs(current - snapPoints[position]);
            const closestDiff = Math.abs(current - snapPoints[closest]);
            return diff < closestDiff ? position : closest;
          }, 'middle' as SheetPosition);

          if (velocity < -1.1) {
            target = current < snapPoints.middle ? 'expanded' : 'middle';
          } else if (velocity > 1.1) {
            if (current > snapPoints.collapsed + 60) {
              target = 'hidden';
            } else {
              target = current > snapPoints.middle ? 'collapsed' : 'middle';
            }
          } else if (current > snapPoints.collapsed + 80) {
            target = 'hidden';
          }

          if (target !== 'hidden') {
            setPanelVisible(true);
          }

          animateSheetTo(target, velocity);
          panOffset.current = 0;
        },
      }),
    [animateSheetTo, snapPoints, sheetTranslateY]
  );

  const searchBarOpacity = sheetTranslateY.interpolate({
    inputRange: [snapPoints.expanded, snapPoints.middle],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const searchBarSolidBackground = sheetTranslateY.interpolate({
    inputRange: [snapPoints.expanded, snapPoints.middle],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  React.useEffect(() => {
    Animated.spring(segmentAnim, {
      toValue: activeTab === 'restaurants' ? 0 : 1,
      useNativeDriver: true,
      bounciness: 10,
      speed: 14,
    }).start();
  }, [activeTab, segmentAnim]);

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
    animateSheetTo('hidden');
  }, [panelVisible, animateSheetTo]);

  const submitSearch = React.useCallback(
    async (options?: SubmitSearchOptions) => {
      const trimmed = query.trim();
      if (!trimmed || isLoading) {
        return;
      }

      const effectiveOpenNow = options?.openNow ?? openNow;

      showPanel();
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

        const hasAnyResults =
          (response?.food?.length ?? 0) > 0 || (response?.restaurants?.length ?? 0) > 0;
        if (hasAnyResults && !hasUnlockedFullResults) {
          setHasPreviewedResults(true);
          setPreviewQuery(trimmed);
        }

        Keyboard.dismiss();
      } catch (err) {
        logger.error('Search request failed', { message: (err as Error).message });
        setError('Unable to fetch results. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [query, isLoading, showPanel, openNow, hasUnlockedFullResults]
  );

  const handleSubmit = React.useCallback(() => {
    void submitSearch();
  }, [submitSearch]);

  const handleClear = React.useCallback(() => {
    setQuery('');
    setResults(null);
    setSubmittedQuery('');
    setError(null);
    setHasPreviewedResults(false);
    setPreviewQuery('');
    hidePanel();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [hidePanel]);
  const toggleOpenNow = React.useCallback(() => {
    if (isLoading) {
      return;
    }

    const nextValue = !openNow;
    setOpenNow(nextValue);

    if (query.trim()) {
      void submitSearch({ openNow: nextValue });
    }
  }, [isLoading, openNow, query, setOpenNow, submitSearch]);

  const toggleLike = React.useCallback((id: string) => {
    setLikedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openPaywall = React.useCallback(() => {
    setIsPaywallVisible(true);
  }, []);

  const closePaywall = React.useCallback(() => {
    setIsPaywallVisible(false);
  }, []);

  const handleUnlockResults = React.useCallback(() => {
    setHasUnlockedFullResults(true);
    setIsPaywallVisible(false);
  }, []);

  const renderPaywallPreview = () => (
    <View style={styles.previewContainer}>
      <Text variant="body" weight="bold" style={styles.previewTitle}>
        {previewQuery ? `Top ${lockedCount} picks for “${previewQuery}”` : 'Top ranked picks'}
      </Text>
      <Text variant="caption" style={styles.previewSubtitle}>
        Unlock the first {lockedCount} results to see why they lead. The other {remainingResults}{' '}
        spots stay visible below.
      </Text>
      <View style={styles.previewList}>
        {previewItems.map((item, index) => {
          const isDishTab = activeTab === 'dishes';
          const key = isDishTab
            ? (item as FoodResult).connectionId
            : (item as RestaurantResult).restaurantId;
          const primaryText = isDishTab
            ? (item as FoodResult).foodName
            : (item as RestaurantResult).restaurantName;
          const secondaryText = isDishTab
            ? (item as FoodResult).restaurantName
            : (item as RestaurantResult).address ?? 'Neighborhood intel ready';
          return (
            <View key={key} style={styles.previewItem}>
              <View style={[styles.rankBadge, styles.rankBadgeMuted]}>
                <Text
                  variant="body"
                  weight="bold"
                  style={[styles.rankBadgeText, styles.rankBadgeTextMuted]}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={styles.previewItemBody}>
                <Text variant="body" weight="semibold" style={styles.previewItemTitle}>
                  {primaryText}
                </Text>
                <Text variant="caption" style={styles.previewItemMeta}>
                  {secondaryText}
                </Text>
                <Text variant="caption" style={styles.previewBlurText}>
                  Quality score hidden · Unlock to reveal
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.previewOverlayCard}>
        <Text variant="subtitle" weight="bold" style={styles.previewOverlayTitle}>
          Unlock the top {lockedCount} results + live scores
        </Text>
        <Text variant="body" style={styles.previewOverlayDescription}>
          Includes map view, filters, bookmarks, and real-time trend alerts.
        </Text>
        <Button
          label="Unlock full results"
          onPress={openPaywall}
          style={styles.previewPrimaryButton}
        />
        <Button
          label="See pricing options"
          variant="ghost"
          onPress={openPaywall}
          style={styles.previewGhostButton}
        />
      </View>
    </View>
  );

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

  const renderDishCard = (item: FoodResult, index: number) => {
    const isLiked = likedItems.has(item.connectionId);
    const qualityColor = getQualityColor(index, dishes.length);
    return (
      <View key={item.connectionId} style={styles.resultItem}>
        <View style={styles.resultHeader}>
          <View style={styles.rankBadge}>
            <Text variant="body" weight="bold" style={styles.rankBadgeText}>
              {index + 1}
            </Text>
          </View>
          <View style={styles.resultTitleContainer}>
            <Text variant="body" weight="bold" style={[styles.textSlate900, styles.dishCardTitle]}>
              {item.foodName}
            </Text>
            <Text
              variant="body"
              weight="medium"
              style={[styles.textSlate600, styles.dishCardTitle]}
            >
              {' '}
              • {item.restaurantName}
            </Text>
          </View>
          <Pressable
            onPress={() => toggleLike(item.connectionId)}
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
      </View>
    );
  };

  const renderRestaurantCard = (restaurant: RestaurantResult, index: number) => {
    const isLiked = likedItems.has(restaurant.restaurantId);
    const qualityColor = getQualityColor(index, restaurants.length);
    return (
      <View key={restaurant.restaurantId} style={styles.resultItem}>
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
          </View>
          <Pressable
            onPress={() => toggleLike(restaurant.restaurantId)}
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
        </View>
        <View style={styles.resultContent}>
          {restaurant.address ? (
            <Text variant="caption" style={[styles.textSlate600, styles.dishSubtitle]}>
              {restaurant.address}
            </Text>
          ) : null}
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
      </View>
    );
  };

  const renderDishResults = () => {
    if (!dishes.length) {
      return <EmptyState message="No dishes found. Try adjusting your search." />;
    }

    const offset = shouldGateResults ? lockedCount : 0;
    const visibleDishes = shouldGateResults ? dishes.slice(lockedCount) : dishes;

    if (!visibleDishes.length && shouldShowPreview) {
      return (
        <View style={styles.lockedEmptyState}>
          <Text variant="caption" style={styles.lockedEmptyText}>
            Unlock to reveal the top {lockedCount} dishes.
          </Text>
        </View>
      );
    }

    return visibleDishes.map((dish, index) => renderDishCard(dish, index + offset));
  };

  const renderRestaurantResults = () => {
    if (!restaurants.length) {
      return <EmptyState message="No restaurants found. Try adjusting your search." />;
    }

    const offset = shouldGateResults ? lockedCount : 0;
    const visibleRestaurants = shouldGateResults ? restaurants.slice(lockedCount) : restaurants;

    if (!visibleRestaurants.length && shouldShowPreview) {
      return (
        <View style={styles.lockedEmptyState}>
          <Text variant="caption" style={styles.lockedEmptyText}>
            Unlock to reveal the top {lockedCount} restaurants.
          </Text>
        </View>
      );
    }

    return visibleRestaurants.map((restaurant, index) =>
      renderRestaurantCard(restaurant, index + offset)
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
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={AUSTIN_COORDINATE}
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
          <View style={styles.promptCard}>
            <BlurView
              pointerEvents="none"
              intensity={45}
              tint="light"
              style={StyleSheet.absoluteFillObject}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: 'rgba(255, 255, 255, 1)',
                  borderRadius: 16,
                  opacity: searchBarSolidBackground,
                },
              ]}
            />
            <View pointerEvents="none" style={styles.glassHighlightSmall} />
            <Animated.View
              style={{
                opacity: searchBarOpacity,
                flexDirection: 'row',
                alignItems: 'center',
                flex: 1,
              }}
            >
              <Feather name="search" size={20} color="#6b7280" style={styles.searchIcon} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="What are you craving?"
                placeholderTextColor="#6b7280"
                style={styles.promptInput}
                returnKeyType="search"
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="never"
              />
            </Animated.View>
            <Animated.View style={{ opacity: searchBarOpacity }}>
              {isLoading ? (
                <ActivityIndicator style={styles.trailingSpinner} size="small" color="#FB923C" />
              ) : query.length > 0 ? (
                <Pressable
                  onPress={handleClear}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles.trailingAction}
                  hitSlop={8}
                >
                  <Feather name="x" size={24} color={ACTIVE_TAB_COLOR} />
                </Pressable>
              ) : (
                <View style={styles.trailingPlaceholder} />
              )}
            </Animated.View>
          </View>
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0)']}
          locations={[0, 0.8]}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
          style={styles.navigationGradient}
        />

        {shouldRenderSheet ? (
          <Animated.View
            style={[
              styles.resultsContainer,
              {
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
            pointerEvents={panelVisible ? 'auto' : 'none'}
          >
            <BlurView
              pointerEvents="none"
              intensity={45}
              tint="light"
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={styles.glassHighlightLarge} />
            <View style={styles.resultsHeader} {...panResponder.panHandlers}>
              <View style={styles.grabHandleWrapper}>
                <Pressable
                  onPress={hidePanel}
                  accessibilityRole="button"
                  accessibilityLabel="Hide results"
                >
                  <View style={styles.grabHandle} />
                </Pressable>
              </View>
              <View style={styles.headerRow}>
                <Text variant="body" weight="semibold" style={styles.submittedQueryLabel}>
                  {submittedQuery || 'Results'}
                </Text>
                <Pressable
                  onPress={hidePanel}
                  accessibilityRole="button"
                  accessibilityLabel="Close results"
                  style={styles.closeButton}
                  hitSlop={8}
                >
                  <Feather name="x" size={24} color={ACTIVE_TAB_COLOR} />
                </Pressable>
              </View>
              <View style={styles.headerSecondRow}>
                <Pressable
                  onPress={toggleOpenNow}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle open now results"
                  accessibilityState={{ disabled: isLoading }}
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
                <View style={styles.integratedSegmentedControl}>
                  <Pressable
                    style={[
                      styles.integratedTab,
                      activeTab === 'restaurants' && styles.integratedTabActive,
                    ]}
                    onPress={() => setActiveTab('restaurants')}
                    accessibilityRole="button"
                    accessibilityLabel="View restaurants"
                  >
                    <Text
                      variant="caption"
                      weight={activeTab === 'restaurants' ? 'bold' : 'medium'}
                      style={[
                        styles.integratedTabText,
                        activeTab === 'restaurants' && styles.integratedTabTextActive,
                      ]}
                    >
                      Restaurants
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.integratedTab,
                      activeTab === 'dishes' && styles.integratedTabActive,
                    ]}
                    onPress={() => setActiveTab('dishes')}
                    accessibilityRole="button"
                    accessibilityLabel="View dishes"
                  >
                    <Text
                      variant="caption"
                      weight={activeTab === 'dishes' ? 'bold' : 'medium'}
                      style={[
                        styles.integratedTabText,
                        activeTab === 'dishes' && styles.integratedTabTextActive,
                      ]}
                    >
                      Dishes
                    </Text>
                  </Pressable>
                </View>
              </View>
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
            </View>

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
                <ScrollView
                  style={styles.resultsScroll}
                  contentContainerStyle={styles.resultsScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.resultsInner}>
                    {shouldShowPreview ? renderPaywallPreview() : null}
                    {activeTab === 'dishes' ? renderDishResults() : renderRestaurantResults()}
                  </View>
                </ScrollView>
              </View>
            )}
          </Animated.View>
        ) : null}
      </SafeAreaView>
      <Modal
        transparent
        animationType="slide"
        visible={isPaywallVisible}
        onRequestClose={closePaywall}
      >
        <View style={styles.paywallBackdrop}>
          <View style={styles.paywallCard}>
            <View style={styles.paywallHeader}>
              <Text variant="subtitle" weight="bold" style={styles.paywallTitle}>
                Unlock full results
              </Text>
              <Pressable
                onPress={closePaywall}
                accessibilityRole="button"
                accessibilityLabel="Close paywall"
                style={styles.paywallCloseButton}
              >
                <Feather name="x" size={22} color="#475569" />
              </Pressable>
            </View>
            <Text variant="body" style={styles.paywallSubtitle}>
              Reveal the top-ranked spots, live quality scores, and pro tools for every search.
            </Text>
            <View style={styles.planToggle}>
              {(['monthly', 'annual'] as const).map((plan) => (
                <Pressable
                  key={plan}
                  onPress={() => setSelectedPlan(plan)}
                  style={[styles.planOption, selectedPlan === plan && styles.planOptionActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${plan} plan`}
                >
                  <Text variant="body" weight="semibold" style={styles.planOptionLabel}>
                    {plan === 'monthly' ? 'Monthly' : 'Annual'}
                  </Text>
                  <Text variant="title" weight="bold" style={styles.planOptionPrice}>
                    {plan === 'monthly' ? '$9.99' : '$99'}
                  </Text>
                  <Text variant="caption" style={styles.planOptionSubtext}>
                    {plan === 'monthly' ? 'Cancel anytime' : '2 months free'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.paywallFeatureList}>
              {[
                'Unlock the top 3 ranked spots',
                'Live quality & context scores',
                'Bookmarks, filters, and alerts',
              ].map((feature) => (
                <View key={feature} style={styles.paywallFeatureItem}>
                  <View style={styles.paywallFeatureBullet} />
                  <Text variant="body" style={styles.paywallFeatureText}>
                    {feature}
                  </Text>
                </View>
              ))}
            </View>
            <Button
              label={`Continue with ${selectedPlan === 'monthly' ? 'Monthly' : 'Annual'}`}
              onPress={handleUnlockResults}
              style={styles.paywallPrimaryButton}
            />
            <Button
              label="Maybe later"
              variant="ghost"
              onPress={closePaywall}
              style={styles.paywallSecondaryButton}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
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
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingTop: 6,
  },
  promptCard: {
    position: 'relative',
    borderRadius: 16,
    height: 52,
    paddingVertical: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
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
  },
  trailingSpinner: {
    marginLeft: 12,
  },
  trailingAction: {
    marginLeft: 12,
    padding: 8,
  },
  trailingPlaceholder: {
    width: 28,
    marginLeft: 12,
  },
  resultsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 10,
  },
  resultsHeader: {
    backgroundColor: '#ffffff',
    paddingTop: 0,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingBottom: CARD_GAP * 2,
    marginBottom: CARD_GAP,
  },
  grabHandleWrapper: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 2,
    backgroundColor: '#ffffff',
  },
  grabHandle: {
    width: 68,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  headerSecondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  closeButton: {
    padding: 0,
  },
  floatingSegmentWrapper: {
    position: 'absolute',
    left: CONTENT_HORIZONTAL_PADDING,
    right: CONTENT_HORIZONTAL_PADDING,
    alignItems: 'center',
    zIndex: 100,
    elevation: 30,
  },
  navigationGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
    zIndex: 60,
  },
  floatingSegment: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    padding: 4,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  floatingSegmentBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  segmentedControl: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  segmentedOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
  },
  segmentedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  segmentedLabelActive: {
    color: '#c24157',
  },
  segmentedIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 20,
    backgroundColor: '#fecdd3',
    shadowColor: '#f97384',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
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
  },
  openNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
  },
  openNowButtonActive: {
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
  integratedSegmentedControl: {
    flexDirection: 'row',
    gap: 8,
  },
  integratedTab: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  integratedTabActive: {
    backgroundColor: TAB_BUTTON_COLOR,
    borderColor: TAB_BUTTON_COLOR,
    shadowColor: TAB_BUTTON_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  integratedTabText: {
    fontSize: 13,
    color: '#64748b',
  },
  integratedTabTextActive: {
    color: '#ffffff',
  },
  resultsInner: {
    width: '100%',
  },
  previewContainer: {
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  previewTitle: {
    color: '#0f172a',
  },
  previewSubtitle: {
    color: '#475569',
    marginTop: 4,
  },
  previewList: {
    marginTop: 12,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  previewItemBody: {
    flex: 1,
    marginLeft: 12,
  },
  previewItemTitle: {
    color: '#111827',
  },
  previewItemMeta: {
    color: '#94a3b8',
    marginTop: 2,
  },
  previewBlurText: {
    color: '#c026d3',
    marginTop: 4,
  },
  previewOverlayCard: {
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  previewOverlayTitle: {
    color: '#0f172a',
  },
  previewOverlayDescription: {
    color: '#475569',
    marginTop: 6,
  },
  previewPrimaryButton: {
    marginTop: 16,
  },
  previewGhostButton: {
    marginTop: 10,
  },
  resultItem: {
    paddingVertical: 18,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    backgroundColor: '#ffffff',
    marginBottom: CARD_GAP,
    alignSelf: 'stretch',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f97384',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
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
    alignItems: 'baseline',
  },
  likeButton: {
    padding: 4,
  },
  resultContent: {
    marginLeft: 40,
  },
  metricsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
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
  lockedEmptyState: {
    paddingVertical: 32,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedEmptyText: {
    color: '#94a3b8',
    textAlign: 'center',
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
  paywallBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 20,
  },
  paywallCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    backgroundColor: '#ffffff',
  },
  paywallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paywallTitle: {
    color: '#0f172a',
  },
  paywallSubtitle: {
    color: '#475569',
    marginTop: 12,
  },
  paywallCloseButton: {
    padding: 4,
  },
  planToggle: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  planOption: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  planOptionActive: {
    borderColor: ACTIVE_TAB_COLOR,
    backgroundColor: '#fff1f2',
    shadowColor: ACTIVE_TAB_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  planOptionLabel: {
    color: '#0f172a',
    marginBottom: 6,
  },
  planOptionPrice: {
    color: '#0f172a',
  },
  planOptionSubtext: {
    color: '#475569',
    marginTop: 2,
  },
  paywallFeatureList: {
    marginTop: 20,
    gap: 10,
  },
  paywallFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paywallFeatureBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACTIVE_TAB_COLOR,
  },
  paywallFeatureText: {
    color: '#0f172a',
  },
  paywallPrimaryButton: {
    marginTop: 24,
  },
  paywallSecondaryButton: {
    marginTop: 12,
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
  glassHighlightLarge: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: 120,
    left: -40,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    opacity: 0.25,
    transform: [{ rotate: '35deg' }],
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
