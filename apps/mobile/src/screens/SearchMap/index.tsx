import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import clsx from 'clsx';
import { Button, Screen, Text } from '../../components';
import {
  DEFAULT_SEARCH_PAGE_SIZE,
  useSearchQuery,
  usePrefetchSearchQuery,
} from '../../hooks/useSearchQuery';
import { locationPresets } from '../../constants';
import type { FoodResult, RestaurantResult } from '../../types';
import { useSearchStore } from '../../store/searchStore';
import { logger, regionToBounds, boundsToRegion } from '../../utils';

type ExploreListItem =
  | { key: string; type: 'section'; title: string; count: number }
  | { key: string; type: 'food'; item: FoodResult }
  | { key: string; type: 'restaurant'; item: RestaurantResult };

const INITIAL_REGION: Region = {
  latitude: 30.2672,
  longitude: -97.7431,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const styles = StyleSheet.create({
  map: StyleSheet.absoluteFillObject,
  keyboardContainer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
});

const SearchMapScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [draftQuery, setDraftQuery] = useState('');
  const [focusedRestaurantId, setFocusedRestaurantId] = useState<string | null>(null);
  const prefetchSearch = usePrefetchSearchQuery();

  const {
    query,
    setQuery,
    page,
    setPage,
    resetPage,
    openNow,
    setOpenNow,
    bounds,
    boundsPresetId,
    setBounds,
    history,
    recordSearch,
  } = useSearchStore();

  const committedQuery = query.trim();

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  const handleExecuteSearch = useCallback(
    async (nextQuery: string) => {
      const trimmed = nextQuery.trim();
      if (!trimmed) {
        return;
      }

      logger.info('Executing search', { query: trimmed });
      resetPage();
      setQuery(trimmed);
      recordSearch(trimmed);

      try {
        await prefetchSearch({
          query: trimmed,
          page: 1,
          pageSize: DEFAULT_SEARCH_PAGE_SIZE,
          openNow,
          bounds: bounds ?? null,
        });
      } catch (error) {
        logger.warn('Prefetch failed', error);
      }
    },
    [bounds, openNow, prefetchSearch, recordSearch, resetPage, setQuery]
  );

  const handleSubmit = useCallback(() => {
    void handleExecuteSearch(draftQuery);
  }, [draftQuery, handleExecuteSearch]);

  const handleSelectHistory = useCallback(
    (value: string) => {
      setDraftQuery(value);
      void handleExecuteSearch(value);
    },
    [handleExecuteSearch]
  );

  const handleRegionChangeComplete = useCallback(
    (nextRegion: Region) => {
      setRegion(nextRegion);
      const nextBounds = regionToBounds(nextRegion);
      setBounds(nextBounds, {
        label: 'Custom area',
        presetId: 'custom',
      });
      resetPage();
    },
    [resetPage, setBounds]
  );

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const preset = locationPresets.find((item) => item.id === presetId);
      if (!preset) {
        return;
      }

      if (preset.bounds) {
        const targetRegion = boundsToRegion(preset.bounds);
        mapRef.current?.animateToRegion(targetRegion, 300);
      } else {
        mapRef.current?.animateToRegion(INITIAL_REGION, 300);
      }

      setBounds(preset.bounds, {
        label: preset.label,
        presetId: preset.id,
      });
      resetPage();
    },
    [resetPage, setBounds]
  );

  const handleToggleOpenNow = useCallback(() => {
    setOpenNow(!openNow);
    resetPage();
  }, [openNow, resetPage, setOpenNow]);

  const activePresetId = useMemo(() => {
    if (boundsPresetId) {
      return boundsPresetId;
    }
    if (!bounds) {
      return locationPresets[0]?.id ?? 'anywhere';
    }
    return 'custom';
  }, [bounds, boundsPresetId]);

  const trimmedCommittedQuery = committedQuery.trim();
  const searchParams = useMemo(
    () => ({
      query: trimmedCommittedQuery,
      page,
      pageSize: DEFAULT_SEARCH_PAGE_SIZE,
      openNow,
      bounds: bounds ?? undefined,
    }),
    [
      bounds?.northEast.lat,
      bounds?.northEast.lng,
      bounds?.southWest.lat,
      bounds?.southWest.lng,
      openNow,
      page,
      trimmedCommittedQuery,
    ]
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useSearchQuery(searchParams, {
    enabled: trimmedCommittedQuery.length > 0,
  });

  const foodResults = data?.food ?? [];
  const restaurants = data?.restaurants ?? [];
  const metadata = data?.metadata;

  useEffect(() => {
    if (!focusedRestaurantId) {
      return;
    }

    const restaurant = restaurants.find((item) => item.restaurantId === focusedRestaurantId);

    if (
      restaurant &&
      typeof restaurant.latitude === 'number' &&
      typeof restaurant.longitude === 'number'
    ) {
      mapRef.current?.animateToRegion(
        {
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          latitudeDelta: Math.max(region.latitudeDelta * 0.5, 0.01),
          longitudeDelta: Math.max(region.longitudeDelta * 0.5, 0.01),
        },
        250
      );
    }
  }, [focusedRestaurantId, region.latitudeDelta, region.longitudeDelta, restaurants]);

  const totalFoodResults = metadata?.totalFoodResults ?? foodResults.length;
  const totalRestaurantResults = metadata?.totalRestaurantResults ?? restaurants.length;
  const pageSize = metadata?.pageSize ?? DEFAULT_SEARCH_PAGE_SIZE;
  const totalPages =
    metadata && metadata.totalFoodResults > 0
      ? Math.ceil(metadata.totalFoodResults / pageSize)
      : trimmedCommittedQuery
      ? Math.max(1, Math.ceil(foodResults.length / pageSize))
      : 1;
  const resultCount = foodResults.length + restaurants.length;

  const items = useMemo<ExploreListItem[]>(() => {
    const list: ExploreListItem[] = [];
    if (foodResults.length) {
      list.push({
        key: 'section-food',
        type: 'section',
        title: 'Top dishes',
        count: totalFoodResults,
      });
      list.push(
        ...foodResults.map((item) => ({
          key: `food-${item.connectionId}`,
          type: 'food' as const,
          item,
        }))
      );
    }

    if (restaurants.length) {
      list.push({
        key: 'section-restaurants',
        type: 'section',
        title: 'Restaurants',
        count: totalRestaurantResults,
      });
      list.push(
        ...restaurants.map((item) => ({
          key: `restaurant-${item.restaurantId}`,
          type: 'restaurant' as const,
          item,
        }))
      );
    }

    return list;
  }, [foodResults, restaurants, totalFoodResults, totalRestaurantResults]);

  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const handlePrev = useCallback(() => {
    if (canGoPrev) {
      setPage(page - 1);
    }
  }, [canGoPrev, page, setPage]);

  const handleNext = useCallback(() => {
    if (canGoNext) {
      setPage(page + 1);
    }
  }, [canGoNext, page, setPage]);

  const renderItem = useCallback(
    ({ item }: { item: ExploreListItem }) => {
      if (item.type === 'section') {
        return (
          <View className="mt-4 mb-1 flex-row items-center justify-between">
            <Text variant="subtitle" weight="semibold">
              {item.title}
            </Text>
            <Text className="text-muted text-xs uppercase tracking-wide">{item.count} total</Text>
          </View>
        );
      }

      if (item.type === 'food') {
        const { item: food } = item;
        return (
          <Pressable
            onPress={() => setFocusedRestaurantId(food.restaurantId)}
            className="bg-surface border border-border rounded-xl p-3 mb-2 active:opacity-90"
          >
            <View className="flex-row items-center justify-between">
              <Text variant="subtitle" weight="semibold">
                {food.foodName}
              </Text>
              <Text className="text-xs text-muted uppercase">{food.activityLevel}</Text>
            </View>
            <Text className="text-muted text-sm mt-1">{food.restaurantName}</Text>
            <View className="flex-row flex-wrap gap-x-3 gap-y-1 mt-2">
              <Text className="text-xs text-muted">Mentions: {food.mentionCount}</Text>
              <Text className="text-xs text-muted">Score: {food.qualityScore.toFixed(1)}</Text>
              <Text className="text-xs text-muted">Upvotes: {food.totalUpvotes}</Text>
            </View>
            {food.categories.length > 0 && (
              <Text className="text-xs text-muted mt-2">
                Categories: {food.categories.join(', ')}
              </Text>
            )}
          </Pressable>
        );
      }

      const { item: restaurant } = item;
      return (
        <Pressable
          onPress={() => setFocusedRestaurantId(restaurant.restaurantId)}
          className={clsx(
            'bg-surface border border-border rounded-xl p-3 mb-2 active:opacity-95',
            focusedRestaurantId === restaurant.restaurantId ? 'border-primary' : null
          )}
        >
          <View className="flex-row items-center justify-between">
            <Text variant="subtitle" weight="semibold">
              {restaurant.restaurantName}
            </Text>
            {restaurant.contextualScore ? (
              <Text className="text-xs text-muted">
                Score: {restaurant.contextualScore.toFixed(1)}
              </Text>
            ) : null}
          </View>
          {restaurant.address ? (
            <Text className="text-muted text-sm mt-1">{restaurant.address}</Text>
          ) : null}
          {restaurant.topFood.length > 0 && (
            <View className="mt-2 gap-1">
              <Text className="text-sm font-semibold text-text">Highlights</Text>
              {restaurant.topFood.map((food) => (
                <Text key={food.connectionId} className="text-xs text-muted">
                  • {food.foodName} ({food.activityLevel}) · {food.qualityScore.toFixed(1)}
                </Text>
              ))}
            </View>
          )}
        </Pressable>
      );
    },
    [focusedRestaurantId]
  );

  const historyChips = useMemo(() => history.slice(0, 6), [history]);

  return (
    <Screen safeArea={false} fullBleed>
      <View className="flex-1">
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={INITIAL_REGION}
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {restaurants
            .filter(
              (restaurant) =>
                typeof restaurant.latitude === 'number' && typeof restaurant.longitude === 'number'
            )
            .map((restaurant) => (
              <Marker
                key={restaurant.restaurantId}
                coordinate={{
                  latitude: restaurant.latitude as number,
                  longitude: restaurant.longitude as number,
                }}
                title={restaurant.restaurantName}
                description={restaurant.topFood[0]?.foodName ?? restaurant.restaurantName}
                onPress={() => setFocusedRestaurantId(restaurant.restaurantId)}
              />
            ))}
        </MapView>

        <View style={{ paddingTop: insets.top + 12 }} className="px-4" pointerEvents="box-none">
          <View className="gap-3">
            <View className="border border-border rounded-2xl bg-surface/95 px-4 py-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text weight="semibold">Open now</Text>
                  <Text className="text-xs text-muted">Only show restaurants currently open</Text>
                </View>
                <Switch
                  value={openNow}
                  onValueChange={handleToggleOpenNow}
                  trackColor={{ false: '#d1d5db', true: '#FF6B6B' }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {locationPresets.map((preset) => {
                const isActive = preset.id === activePresetId;
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    className={clsx(
                      'px-4 py-2 rounded-full border',
                      isActive ? 'bg-primary/10 border-primary' : 'border-border bg-surface/95'
                    )}
                    onPress={() => handleSelectPreset(preset.id)}
                  >
                    <Text
                      className={clsx(
                        'text-sm',
                        isActive ? 'text-primary font-semibold' : 'text-text'
                      )}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                );
              })}
              {activePresetId === 'custom' && (
                <View className="px-4 py-2 rounded-full border border-primary bg-primary/10">
                  <Text className="text-sm text-primary font-semibold">Custom area</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
          style={styles.keyboardContainer}
        >
          <View className="flex-1 justify-end">
            <View style={{ paddingBottom: insets.bottom + 16 }} className="px-4 gap-4">
              <View className="border border-border rounded-3xl bg-surface/95 p-4">
                <View className="gap-1">
                  <Text variant="subtitle" weight="semibold">
                    {trimmedCommittedQuery
                      ? `Results for “${trimmedCommittedQuery}”`
                      : 'Start with a craving'}
                  </Text>
                  <Text className="text-sm text-muted">
                    {isLoading
                      ? 'Searching for the strongest matches...'
                      : isError
                      ? 'We hit a snag fetching results. Pull to refresh.'
                      : resultCount
                      ? `Showing ${resultCount} items`
                      : trimmedCommittedQuery
                      ? 'No matches yet—try widening your search.'
                      : 'Describe what you are craving to get curated recommendations.'}
                  </Text>
                </View>

                {isError && (
                  <Text className="text-xs text-red-500 mt-2">
                    {(error as Error)?.message ?? 'Unexpected error'}
                  </Text>
                )}

                {metadata && (
                  <View className="border border-border rounded-xl bg-surface px-3 py-2 mt-3 gap-1">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">Foods: {metadata.totalFoodResults}</Text>
                      <Text className="text-xs text-muted">
                        Restaurants: {metadata.totalRestaurantResults}
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">
                        Execution: {metadata.queryExecutionTimeMs} ms
                      </Text>
                      <Text className="text-xs text-muted">
                        Page {metadata.page} · Size {metadata.pageSize}
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-muted">
                        Bounds {metadata.boundsApplied ? 'on' : 'off'}
                      </Text>
                      <Text className="text-xs text-muted">
                        Open now {metadata.openNowApplied ? 'on' : 'off'}
                      </Text>
                    </View>
                  </View>
                )}

                <FlatList
                  data={items}
                  keyExtractor={(item) => item.key}
                  renderItem={renderItem}
                  ListEmptyComponent={
                    !isLoading &&
                    !isError && (
                      <View className="items-center justify-center py-10">
                        <Text className="text-center text-muted text-sm">
                          {trimmedCommittedQuery
                            ? 'Nothing surfaced yet. Try adjusting your filters or map.'
                            : 'Tap the composer below to start exploring local favorites.'}
                        </Text>
                      </View>
                    )
                  }
                  style={{ maxHeight: 280, marginTop: 12 }}
                  onRefresh={refetch}
                  refreshing={isFetching}
                />

                {trimmedCommittedQuery ? (
                  <View className="flex-row gap-3 mt-3">
                    <Button
                      label="Previous"
                      variant="ghost"
                      className="flex-1"
                      onPress={handlePrev}
                      disabled={!canGoPrev || isFetching}
                    />
                    <Button
                      label="Next"
                      className="flex-1"
                      onPress={handleNext}
                      disabled={!canGoNext || isFetching}
                    />
                  </View>
                ) : null}
              </View>

              {historyChips.length > 0 && (
                <View className="bg-surface/95 border border-border rounded-3xl px-4 py-3 gap-2">
                  <Text className="text-sm font-semibold text-text">Recent searches</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {historyChips.map((entry) => (
                      <Pressable
                        key={entry.query}
                        className="px-4 py-2 rounded-full border border-border bg-surface"
                        onPress={() => handleSelectHistory(entry.query)}
                      >
                        <Text className="text-sm text-text">{entry.query}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <View className="bg-surface/95 border border-border rounded-3xl px-4 py-3 flex-row items-center gap-3">
                <TextInput
                  placeholder='Try "tonkotsu ramen near east side"'
                  value={draftQuery}
                  onChangeText={setDraftQuery}
                  returnKeyType="search"
                  onSubmitEditing={handleSubmit}
                  className="flex-1 text-base text-text"
                />
                <Button
                  label="Send"
                  onPress={handleSubmit}
                  disabled={!draftQuery.trim()}
                  isLoading={isFetching && draftQuery.trim() === trimmedCommittedQuery}
                  className="px-5"
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
};

export default SearchMapScreen;
