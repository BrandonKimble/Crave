import React from 'react';
import { Alert, Dimensions, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import type { StackScreenProps } from '@react-navigation/stack';
import { useQueryClient } from '@tanstack/react-query';
import { X as LucideX } from 'lucide-react-native';
import { Text } from '../components';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { colors as themeColors } from '../constants/theme';
import { useFavoriteListDetail, favoriteListKeys } from '../hooks/use-favorite-lists';
import { favoriteListsService } from '../services/favorite-lists';
import { RestaurantResult, FoodResult } from '../types';
import type { RootStackParamList } from '../types/navigation';
import RestaurantResultCard from './Search/components/restaurant-result-card';
import DishResultCard from './Search/components/dish-result-card';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://crave-search.app';

const FavoritesListDetailScreen: React.FC<
  StackScreenProps<RootStackParamList, 'FavoritesListDetail'>
> = ({ navigation, route }) => {
  const { listId } = route.params;
  const queryClient = useQueryClient();
  const { data, isLoading } = useFavoriteListDetail(listId);
  const list = data?.list;
  const restaurants = data?.restaurants ?? [];
  const dishes = data?.dishes ?? [];
  const isRestaurantList = list?.listType === 'restaurant';
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState('');
  const [draftDescription, setDraftDescription] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!list || isEditing) {
      return;
    }
    setDraftName(list.name);
    setDraftDescription(list.description ?? '');
  }, [isEditing, list]);

  const handleShare = React.useCallback(async () => {
    if (!list) {
      return;
    }
    try {
      const result = await favoriteListsService.enableShare(list.listId);
      const shareUrl = `${SHARE_BASE_URL}/l/${result.shareSlug}`;
      await Share.share({
        message: `${list.name} · View on Crave Search\n${shareUrl}`,
      });
    } catch {
      // ignore
    }
  }, [list]);

  const handleToggleVisibility = React.useCallback(async () => {
    if (!list) {
      return;
    }
    const nextVisibility = list.visibility === 'public' ? 'private' : 'public';
    await favoriteListsService.update(list.listId, { visibility: nextVisibility });
    await queryClient.invalidateQueries({ queryKey: favoriteListKeys.detail(listId) });
    await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
  }, [list, listId, queryClient]);

  const handleDelete = React.useCallback(async () => {
    if (!list) {
      return;
    }
    await favoriteListsService.remove(list.listId);
    await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    navigation.goBack();
  }, [list, navigation, queryClient]);

  const handleMenu = React.useCallback(() => {
    if (!list) {
      return;
    }
    Alert.alert(list.name, undefined, [
      {
        text: 'Edit',
        onPress: () => setIsEditing(true),
      },
      {
        text: 'Share',
        onPress: () => void handleShare(),
      },
      {
        text: list.visibility === 'public' ? 'Make Private' : 'Make Public',
        onPress: () => void handleToggleVisibility(),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void handleDelete(),
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }, [handleDelete, handleShare, handleToggleVisibility, list]);

  const handleSave = React.useCallback(async () => {
    if (!list) {
      return;
    }
    setIsSaving(true);
    try {
      await favoriteListsService.update(list.listId, {
        name: draftName.trim() || list.name,
        description: draftDescription,
      });
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.detail(listId) });
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [draftDescription, draftName, list, listId, queryClient]);

  const renderRestaurant = React.useCallback(
    ({ item, index }: { item: RestaurantResult; index: number }) => (
      <RestaurantResultCard
        restaurant={item}
        index={index}
        restaurantsCount={restaurants.length}
        isLiked={false}
        primaryCoverageKey={null}
        showCoverageLabel={false}
        onSavePress={() => undefined}
        openRestaurantProfile={() => undefined}
        openScoreInfo={() => undefined}
        primaryFoodTerm={null}
      />
    ),
    [restaurants.length]
  );

  const renderDish = React.useCallback(
    ({ item, index }: { item: FoodResult; index: number }) => (
      <DishResultCard
        item={item}
        index={index}
        dishesCount={dishes.length}
        isLiked={false}
        primaryCoverageKey={null}
        showCoverageLabel={false}
        restaurantForDish={undefined}
        onSavePress={() => undefined}
        openRestaurantProfile={() => undefined}
        openScoreInfo={() => undefined}
      />
    ),
    [dishes.length]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.background}>
        <FrostedGlassBackground intensity={60} />
      </View>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close list"
          hitSlop={8}
          style={styles.headerIcon}
        >
          <LucideX size={20} color="#000000" strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerTitleGroup}>
          {isEditing ? (
            <>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="List name"
                placeholderTextColor={themeColors.textBody}
                style={styles.editTitleInput}
              />
              <TextInput
                value={draftDescription}
                onChangeText={setDraftDescription}
                placeholder="Description"
                placeholderTextColor={themeColors.textBody}
                style={styles.editDescriptionInput}
                multiline
              />
            </>
          ) : (
            <>
              <Text variant="subtitle" weight="semibold" style={styles.headerTitle}>
                {list?.name ?? 'Favorites'}
              </Text>
              {list?.description ? (
                <Text variant="caption" style={styles.headerSubtitle} numberOfLines={1}>
                  {list.description}
                </Text>
              ) : null}
              {list?.visibility ? (
                <View style={styles.visibilityBadge}>
                  <Text variant="caption" style={styles.visibilityText}>
                    {list.visibility === 'public' ? 'Public' : 'Private'}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>
        <View style={styles.headerActions}>
          {isEditing ? (
            <Pressable
              onPress={() => void handleSave()}
              accessibilityRole="button"
              accessibilityLabel="Save list"
              hitSlop={8}
              style={styles.headerSaveButton}
              disabled={isSaving}
            >
              <Text variant="caption" weight="semibold" style={styles.headerSaveText}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Share list"
                hitSlop={8}
                style={styles.headerIcon}
              >
                <Feather name="share" size={20} color={themeColors.primary} />
              </Pressable>
              <Pressable
                onPress={handleMenu}
                accessibilityRole="button"
                accessibilityLabel="More options"
                hitSlop={8}
                style={styles.headerIcon}
              >
                <Feather name="more-horizontal" size={20} color={themeColors.primary} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View style={styles.listContainer}>
        <FlashList
          data={isRestaurantList ? restaurants : dishes}
          renderItem={isRestaurantList ? renderRestaurant : renderDish}
          keyExtractor={(item) =>
            isRestaurantList
              ? (item as RestaurantResult).restaurantId
              : (item as FoodResult).connectionId
          }
          estimatedItemSize={160}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text variant="body" style={styles.emptyText}>
                {isLoading ? 'Loading list...' : 'No items yet'}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: SCREEN_HEIGHT * 0.15 }}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitleGroup: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
  headerSubtitle: {
    color: themeColors.textBody,
    marginTop: 2,
  },
  visibilityBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  visibilityText: {
    color: themeColors.textBody,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveButton: {
    backgroundColor: themeColors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  headerSaveText: {
    color: '#ffffff',
  },
  editTitleInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    fontSize: 18,
    color: '#0f172a',
    paddingBottom: 4,
  },
  editDescriptionInput: {
    marginTop: 6,
    fontSize: 14,
    color: themeColors.textBody,
    textAlignVertical: 'top',
  },
  listContainer: {
    flex: 1,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: themeColors.textBody,
  },
});

export default FavoritesListDetailScreen;
