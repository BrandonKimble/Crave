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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../components';
import { logger } from '../../utils';
import { searchService } from '../../services/search';
import type { SearchResponse, FoodResult, RestaurantResult } from '../../types';

const DEFAULT_STYLE_URL = 'mapbox://styles/brandonkimble/cmhjzgs6i00cl01s69ff1fsmf';
const AUSTIN_COORDINATE: [number, number] = [-97.7431, 30.2672];
const SCREEN_HEIGHT = Dimensions.get('window').height;

MapboxGL.setTelemetryEnabled(false);

const SearchScreen: React.FC = () => {
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
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'dishes' | 'restaurants'>('dishes');
  const [panelVisible, setPanelVisible] = React.useState(false);
  const [searchBottom, setSearchBottom] = React.useState(0);
  const panelAnim = React.useRef(new Animated.Value(0)).current;

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

  const handleVoicePress = () => {
    logger.info('Voice prompt pressed');
  };
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

  const renderDishCard = (item: FoodResult) => (
    <View key={item.connectionId} style={styles.resultItem}>
      <Text variant="subtitle" weight="bold" style={[styles.textSlate900, styles.dishTitle]}>
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
            <Feather name="search" size={20} color="#6b7280" style={styles.searchIcon} />
            <TextInput
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
            />
            {isLoading ? (
              <ActivityIndicator style={styles.micIcon} size="small" color="#FB923C" />
            ) : (
              <Pressable
                onPress={handleVoicePress}
                accessibilityRole="button"
                accessibilityLabel="Search with your voice"
              >
                <Feather name="mic" size={20} color="#FB923C" style={styles.micIcon} />
              </Pressable>
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
            <View style={styles.grabHandleWrapper}>
              <Pressable
                onPress={hidePanel}
                accessibilityRole="button"
                accessibilityLabel="Hide results"
              >
                <View style={styles.grabHandle} />
              </Pressable>
            </View>

            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tabButton, activeTab === 'restaurants' && styles.tabButtonActive]}
                onPress={() => setActiveTab('restaurants')}
              >
                <Text
                  variant="body"
                  weight={activeTab === 'restaurants' ? 'semibold' : 'medium'}
                  style={{ color: activeTab === 'restaurants' ? '#ffffff' : '#64748b' }}
                >
                  Restaurants
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === 'dishes' && styles.tabButtonActive]}
                onPress={() => setActiveTab('dishes')}
              >
                <Text
                  variant="body"
                  weight={activeTab === 'dishes' ? 'semibold' : 'medium'}
                  style={{ color: activeTab === 'dishes' ? '#ffffff' : '#64748b' }}
                >
                  Dishes
                </Text>
              </Pressable>
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
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  promptCard: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 12,
  },
  promptInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  micIcon: {
    marginLeft: 12,
  },
  resultsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  grabHandleWrapper: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  grabHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  tabButtonActive: {
    backgroundColor: '#A78BFA',
  },
  resultsCard: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingVertical: 0,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
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
    paddingTop: 8,
  },
  resultsInner: {
    width: '100%',
  },
  resultItem: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
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
});

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <View style={styles.emptyState}>
    <Text variant="caption" style={styles.textSlate500}>
      {message}
    </Text>
  </View>
);

export default SearchScreen;
