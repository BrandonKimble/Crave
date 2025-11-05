import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../components';
import { logger } from '../../utils';
import { searchService } from '../../services/search';
import type { SearchResponse, FoodResult, RestaurantResult } from '../../types';

const DEFAULT_STYLE_URL = 'mapbox://styles/brandonkimble/cmhjzgs6i00cl01s69ff1fsmf';
const AUSTIN_COORDINATE: [number, number] = [-97.7431, 30.2672];
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CONTENT_HORIZONTAL_PADDING = 20;
const CARD_GAP = 4;
const ACTIVE_TAB_COLOR = '#f97384';

MapboxGL.setTelemetryEnabled(false);

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const accessToken = React.useMemo(() => process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '', []);

  React.useEffect(() => {
    if (accessToken) {
      MapboxGL.setAccessToken(accessToken);
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
  const [searchBottom, setSearchBottom] = React.useState(0);
  const [segmentWidth, setSegmentWidth] = React.useState(0);
  const segmentAnim = React.useRef(new Animated.Value(activeTab === 'restaurants' ? 0 : 1)).current;
  const panelAnim = React.useRef(new Animated.Value(0)).current;
  const inputRef = React.useRef<TextInput | null>(null);
  const tabBarBasePadding = insets.bottom > 0 ? insets.bottom : 6;
  const tabBarHeight = Math.max(60, 44 + tabBarBasePadding * 2);
  const floatingSegmentBottom = tabBarHeight - tabBarBasePadding + 8;

  React.useEffect(() => {
    Animated.spring(segmentAnim, {
      toValue: activeTab === 'restaurants' ? 0 : 1,
      useNativeDriver: true,
      bounciness: 10,
      speed: 14,
    }).start();
  }, [activeTab, segmentAnim]);

  const dishes = results?.food ?? [];
  const restaurants = results?.restaurants ?? [];

  const showPanel = React.useCallback(() => {
    if (!panelVisible) {
      setPanelVisible(true);
      requestAnimationFrame(() => {
        Animated.spring(panelAnim, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 2,
          speed: 12,
        }).start();
      });
    } else {
      Animated.spring(panelAnim, {
        toValue: 1,
        useNativeDriver: true,
        bounciness: 2,
        speed: 12,
      }).start();
    }
  }, [panelVisible, panelAnim]);

  const hidePanel = React.useCallback(() => {
    Animated.spring(panelAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 12,
    }).start(() => {
      setPanelVisible(false);
    });
  }, [panelAnim]);

  const handleSubmit = React.useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isLoading) {
      return;
    }

    showPanel();
    try {
      setIsLoading(true);
      setError(null);
      logger.info('Submitting search request', { query: trimmed });

      const response = await searchService.naturalSearch({
        query: trimmed,
        pagination: { page: 1, pageSize: 10 },
      });

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
  }, [query, isLoading, showPanel]);

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

  // Calculate panel position: should start just below search bar
  const panelTopOffset = React.useMemo(() => {
    // searchBottom is the Y coordinate where the search bar ends
    // Add a visual gap to ensure panel doesn't cover search
    const gap = 12;
    return searchBottom ? searchBottom + gap : 120;
  }, [searchBottom]);

  // Bottom sheet animation: slides up from off-screen (SCREEN_HEIGHT) to natural position (0)
  // When visible (anim=1): translateY=0, panel sits at top:panelTopOffset, bottom:0
  // When hidden (anim=0): translateY=SCREEN_HEIGHT, panel is completely off-screen below
  const panelTranslateY = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });
  const floatingSegmentTranslate = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 0],
  });

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
        <Metric label="Mentions" value={item.mentionCount} />
        <Metric label="Recent" value={item.recentMentionCount} />
        <Metric label="Upvotes" value={item.totalUpvotes} />
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
        style={styles.map}
        styleURL={mapStyleURL}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
      >
        <MapboxGL.Camera centerCoordinate={AUSTIN_COORDINATE} zoomLevel={12} pitch={32} />
      </MapboxGL.MapView>

      <SafeAreaView
        style={styles.overlay}
        pointerEvents="box-none"
        edges={['top', 'left', 'right']}
      >
        <View
          style={styles.searchContainer}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            const bottom = y + height;
            if (bottom !== searchBottom) {
              setSearchBottom(bottom);
            }
          }}
        >
          <View style={styles.promptCard}>
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
        </View>

        {panelVisible && (
          <Animated.View
            style={[
              styles.resultsContainer,
              {
                top: panelTopOffset,
                transform: [{ translateY: panelTranslateY }],
              },
            ]}
          >
            <View pointerEvents="none" style={styles.glassHighlightLarge} />
            <View style={styles.resultsHeader}>
              <View style={styles.grabHandleWrapper}>
                <Pressable
                  onPress={hidePanel}
                  accessibilityRole="button"
                  accessibilityLabel="Hide results"
                >
                  <View style={styles.grabHandle} />
                </Pressable>
              </View>
              {submittedQuery ? (
                <Text variant="body" weight="semibold" style={styles.submittedQueryLabel}>
                  {submittedQuery}
                </Text>
              ) : null}
            </View>

            {error ? (
              <View style={styles.resultsCard}>
                <Text variant="caption" style={styles.textRed600}>
                  {error}
                </Text>
              </View>
            ) : isLoading && !results ? (
              <View style={[styles.resultsCard, styles.resultsCardCentered]}>
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
        )}
        {panelVisible ? (
          <Animated.View
            pointerEvents={panelVisible ? 'auto' : 'none'}
            style={[
              styles.floatingSegmentWrapper,
              {
                bottom: floatingSegmentBottom,
                opacity: panelAnim,
                transform: [{ translateY: floatingSegmentTranslate }],
              },
            ]}
          >
            <View style={styles.floatingSegment}>
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
    backgroundColor: 'rgba(248, 250, 252, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.74)',
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
    paddingTop: 4,
    paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
    paddingBottom: 16,
  },
  grabHandleWrapper: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 2,
    backgroundColor: '#ffffff',
  },
  grabHandle: {
    width: 68,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  floatingSegmentWrapper: {
    position: 'absolute',
    left: CONTENT_HORIZONTAL_PADDING,
    right: CONTENT_HORIZONTAL_PADDING,
    alignItems: 'center',
  },
  floatingSegment: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    padding: 4,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
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
    color: ACTIVE_TAB_COLOR,
  },
  segmentedIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 20,
    backgroundColor: 'rgba(249, 115, 132, 0.18)',
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
  resultsCardCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  resultsScroll: {
    flex: 1,
  },
  resultsScrollContent: {
    paddingBottom: 100,
    paddingTop: 0,
  },
  submittedQueryLabel: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    color: '#0f172a',
    fontSize: 16,
    marginLeft: 0,
    width: '100%',
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
