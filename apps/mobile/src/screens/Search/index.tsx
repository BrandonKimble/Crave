import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
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
import { Text } from '../../components';
import { logger } from '../../utils';
import { searchService } from '../../services/search';
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
const CONTENT_HORIZONTAL_PADDING = 20;
const CARD_GAP = 4;
const ACTIVE_TAB_COLOR = '#f97384';
type SheetPosition = 'hidden' | 'collapsed' | 'middle' | 'expanded';
type RestaurantFeatureProperties = {
  restaurantId: string;
  restaurantName: string;
  contextualScore: number;
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

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const FloatingSegmentBackground: React.FC = () => (
  <BlurView pointerEvents="none" intensity={90} tint="light" style={styles.floatingSegmentBlur} />
);

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
  const [segmentWidth, setSegmentWidth] = React.useState(0);
  const [openNowOnly, setOpenNowOnly] = React.useState(false);
  const segmentAnim = React.useRef(new Animated.Value(activeTab === 'restaurants' ? 0 : 1)).current;
  const sheetTranslateY = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const panOffset = React.useRef(0);
  const isAnimating = React.useRef(false);
  const tabBarBasePadding = insets.bottom > 0 ? insets.bottom : 6;
  const tabBarHeight = Math.max(60, 44 + tabBarBasePadding * 2);
  const floatingSegmentBottom = tabBarHeight - tabBarBasePadding + 8;
  const inputRef = React.useRef<TextInput | null>(null);
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

  const restaurantFeatures = React.useMemo<FeatureCollection<Point, RestaurantFeatureProperties>>(() => {
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
    const rawCollapsed = searchLayout.top + searchLayout.height + 12;
    const collapsed = Math.max(rawCollapsed, middle + 80);
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle: Math.min(middle, hidden - 120),
      collapsed: Math.min(Math.max(collapsed, middle + 40), hidden - 40),
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
    [sheetTranslateY, snapPoints],
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
    [animateSheetTo, snapPoints, sheetTranslateY],
  );

  const blurFadeThreshold = snapPoints.expanded + (snapPoints.middle - snapPoints.expanded) * 0.35;
  const searchBarOpacity = sheetTranslateY.interpolate({
    inputRange: [snapPoints.expanded, blurFadeThreshold, snapPoints.middle],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });
  const searchBarBlurIntensity = sheetTranslateY.interpolate({
    inputRange: [snapPoints.expanded, blurFadeThreshold, snapPoints.middle],
    outputRange: [60, 40, 10],
    extrapolate: 'clamp',
  });
  const searchBarBlurOpacity = sheetTranslateY.interpolate({
    inputRange: [snapPoints.expanded, snapPoints.middle],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const searchBarTintOpacity = sheetTranslateY.interpolate({
    inputRange: [snapPoints.expanded, blurFadeThreshold, snapPoints.middle],
    outputRange: [0.55, 0.4, 0],
    extrapolate: 'clamp',
  });
  const floatingSegmentOpacity = sheetTranslateY.interpolate({
    inputRange: [snapPoints.collapsed, snapPoints.hidden],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const floatingSegmentTranslate = sheetTranslateY.interpolate({
    inputRange: [snapPoints.expanded, snapPoints.hidden],
    outputRange: [0, 28],
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

  const handleSubmit = React.useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isLoading) {
      return;
    }

    showPanel();
    try {
      setIsLoading(true);
      setError(null);

      const payload: NaturalSearchRequest = {
        query: trimmed,
        pagination: { page: 1, pageSize: 10 },
      };

      if (openNowOnly) {
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

      logger.info('Submitting search request', {
        query: trimmed,
        openNow: openNowOnly,
        hasBounds: Boolean(payload.bounds),
      });

      const response = await searchService.naturalSearch(payload);

      setResults(response);
      setSubmittedQuery(trimmed);
      setActiveTab(
        response?.format === 'dual_list' || response?.food?.length ? 'dishes' : 'restaurants'
      );
      Keyboard.dismiss();
    } catch (err) {
      logger.error('Search request failed', { message: (err as Error).message });
      setError('Unable to fetch results. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [query, isLoading, showPanel, openNowOnly]);

  const handleClear = React.useCallback(() => {
    setQuery('');
    setResults(null);
    setSubmittedQuery('');
    setError(null);
    hidePanel();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [hidePanel]);
  const toggleOpenNow = React.useCallback(() => {
    setOpenNowOnly((prev) => !prev);
  }, []);

  const renderDishCard = (item: FoodResult) => (
    <View key={item.connectionId} style={styles.resultItem}>
      <Text variant="body" weight="semibold" style={[styles.textSlate900, styles.dishCardTitle]}>
        {item.foodName}
      </Text>
      <Text variant="caption" style={[styles.textSlate600, styles.dishSubtitle]}>
        {item.restaurantName}
      </Text>
      <View style={styles.metricRow}>
        <Metric label="Quality" value={item.qualityScore.toFixed(1)} />
        <Metric label="Whole Volume" value={item.mentionCount} />
        <Metric label="Consensus Votes" value={item.totalUpvotes} />
      </View>
    </View>
  );

  const renderRestaurantCard = (restaurant: RestaurantResult) => (
    <View key={restaurant.restaurantId} style={styles.resultItem}>
      <Text variant="subtitle" weight="bold" style={[styles.textSlate900, styles.dishTitle]}>
        {restaurant.restaurantName}
      </Text>
      {restaurant.address ? (
        <Text variant="caption" style={[styles.textSlate600, styles.dishSubtitle]}>
          {restaurant.address}
        </Text>
      ) : null}
      <View style={styles.metricRow}>
        <Metric label="Context" value={restaurant.contextualScore.toFixed(1)} />
        {restaurant.restaurantQualityScore !== null &&
        restaurant.restaurantQualityScore !== undefined ? (
          <Metric label="Quality" value={restaurant.restaurantQualityScore.toFixed(1)} />
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
  );

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
        <MapboxGL.Camera ref={cameraRef} centerCoordinate={AUSTIN_COORDINATE} zoomLevel={12} pitch={32} />
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
        <Animated.View
          pointerEvents={sheetState === 'expanded' ? 'none' : 'auto'}
          style={[styles.searchContainer, { opacity: searchBarOpacity }]}
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
            <AnimatedBlurView
              pointerEvents="none"
              tint="light"
              style={[styles.searchBlurOverlay, { opacity: searchBarBlurOpacity }]}
              intensity={searchBarBlurIntensity}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.searchFrostOverlay, { opacity: searchBarTintOpacity }]}
            />
            <View pointerEvents="none" style={styles.glassHighlightSmall} />
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
                <Feather name="x" size={20} color={ACTIVE_TAB_COLOR} />
              </Pressable>
            ) : (
              <View style={styles.trailingPlaceholder} />
            )}
          </View>
        </Animated.View>
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
                  onPress={toggleOpenNow}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle open now results"
                  style={[
                    styles.openNowButton,
                    openNowOnly && styles.openNowButtonActive,
                  ]}
                >
                  <Feather
                    name="clock"
                    size={14}
                    color={openNowOnly ? '#ffffff' : '#475569'}
                    style={styles.openNowIcon}
                  />
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[
                      styles.openNowText,
                      openNowOnly && styles.openNowTextActive,
                    ]}
                  >
                    Open now
                  </Text>
                </Pressable>
              </View>
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
                    {activeTab === 'dishes' ? (
                      dishes.length ? (
                        dishes.map(renderDishCard)
                      ) : (
                        <EmptyState message="No dishes found. Try adjusting your search." />
                      )
                    ) : restaurants.length ? (
                      restaurants.map(renderRestaurantCard)
                    ) : (
                      <EmptyState message="No restaurants found. Try adjusting your search." />
                    )}
                  </View>
                </ScrollView>
              </View>
            )}
          </Animated.View>
        ) : null}
        {shouldRenderSheet ? (
          <Animated.View
            pointerEvents={panelVisible ? 'auto' : 'none'}
            style={[
              styles.floatingSegmentWrapper,
              {
                bottom: floatingSegmentBottom,
                opacity: floatingSegmentOpacity,
                transform: [{ translateY: floatingSegmentTranslate }],
              },
            ]}
          >
            <View style={styles.floatingSegment}>
              <FloatingSegmentBackground />
              <View
                style={styles.segmentedControl}
                onLayout={(event) => setSegmentWidth(event.nativeEvent.layout.width)}
              >
                {segmentWidth > 0 && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.segmentedIndicator,
                      {
                        width: Math.max(segmentWidth / 2 - 8, 0),
                        marginHorizontal: 4,
                        transform: [
                          {
                            translateX: segmentAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, segmentWidth / 2],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                )}
                <Pressable
                  style={styles.segmentedOption}
                  onPress={() => setActiveTab('restaurants')}
                  accessibilityRole="button"
                  accessibilityLabel="View restaurants"
                >
                  <Text
                    variant="body"
                    weight={activeTab === 'restaurants' ? 'semibold' : 'medium'}
                    style={[
                      styles.segmentedLabel,
                      activeTab === 'restaurants' && styles.segmentedLabelActive,
                    ]}
                  >
                    Restaurants
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.segmentedOption}
                  onPress={() => setActiveTab('dishes')}
                  accessibilityRole="button"
                  accessibilityLabel="View dishes"
                >
                  <Text
                    variant="body"
                    weight={activeTab === 'dishes' ? 'semibold' : 'medium'}
                    style={[
                      styles.segmentedLabel,
                      activeTab === 'dishes' && styles.segmentedLabelActive,
                    ]}
                  >
                    Dishes
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </SafeAreaView>
    </View>
  );
};

interface MetricProps {
  label: string;
  value: string | number;
}

const Metric: React.FC<MetricProps> = ({ label, value }) => (
  <View style={styles.metric}>
    <Text variant="caption" style={styles.textSlate500}>
      {label}
    </Text>
    <Text variant="body" weight="bold" style={styles.metricValue}>
      {value}
    </Text>
  </View>
);

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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffffff',
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
    paddingTop: 2,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingBottom: CARD_GAP * 2,
    marginBottom: CARD_GAP,
  },
  grabHandleWrapper: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 3,
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
    gap: 12,
    marginTop: 2,
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
    backgroundColor: 'transparent',
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
    paddingBottom: 100,
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  resultsInner: {
    width: '100%',
  },
  resultItem: {
    paddingVertical: 18,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    backgroundColor: '#ffffff',
    marginBottom: CARD_GAP,
    alignSelf: 'stretch',
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
    fontSize: 14,
  },
  dishSubtitle: {
    fontSize: 14,
    marginTop: 4,
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
  searchBlurOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
  },
  searchFrostOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
