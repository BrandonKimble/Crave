import React from 'react';
import { Alert, Dimensions, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import type { ListRenderItem } from '@shopify/flash-list';
import { X as LucideX } from 'lucide-react-native';

import { Text } from '../components';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { colors as themeColors } from '../constants/theme';
import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from '../navigation/runtime/app-route-scene-descriptor-contract';
import type { AppOverlayTopLevelProductRouteKey } from '../navigation/runtime/app-overlay-route-types';
import { normalizeSearchRouteSceneStackShellSpec } from '../overlays/searchOverlayRouteHostContract';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from '../overlays/overlaySheetStyles';
import { createRestaurantRoutePanelDraft } from '../overlays/restaurantRoutePanelContract';
import { useRestaurantRouteProducer } from '../overlays/useRestaurantRouteProducer';
import type { SearchRouteSceneLayoutState } from '../overlays/searchRouteSceneLayoutContract';
import { useFavoriteListDetail, favoriteListKeys } from '../hooks/use-favorite-lists';
import { favoriteListsService } from '../services/favorite-lists';
import { searchService } from '../services/search';
import { RestaurantResult, FoodResult } from '../types';
import RestaurantResultCard from './Search/components/restaurant-result-card';
import DishResultCard from './Search/components/dish-result-card';
import { getMarkerColorForDish, getMarkerColorForRestaurant } from './Search/utils/marker-lod';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://crave-search.app';

type FavoriteListDetailItem = RestaurantResult | FoodResult;

export type FavoriteListDetailRouteSceneDescriptor = {
  shellSpec: AppRouteSceneStackShellSpec;
  sceneChrome: AppRouteSceneChromePublication;
  sceneBodyContent: AppRouteSceneBodyContentSpec;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec;
};

type FavoriteListDetailRouteSceneArgs = {
  listId: string | null;
  ownerSceneKey: AppOverlayTopLevelProductRouteKey | null;
  sceneLayout: SearchRouteSceneLayoutState;
  isActive: boolean;
  onClose: () => void;
};

const buildRestaurantRouteSeedFromFoodResult = (
  foodResult: FoodResult
): RestaurantResult | undefined => {
  if (typeof foodResult.restaurantCraveScore !== 'number') {
    return undefined;
  }

  return {
    restaurantId: foodResult.restaurantId,
    restaurantName: foodResult.restaurantName,
    restaurantAliases: foodResult.restaurantAliases,
    scoreSubjectType: 'restaurant',
    scoreSubjectId: foodResult.restaurantId,
    craveScore: foodResult.restaurantCraveScore,
    marketKey: foodResult.marketKey,
    marketName: foodResult.marketName ?? null,
    latitude: foodResult.restaurantLatitude ?? null,
    longitude: foodResult.restaurantLongitude ?? null,
    restaurantLocationId: foodResult.restaurantLocationId ?? null,
    priceLevel: foodResult.restaurantPriceLevel ?? null,
    priceSymbol: foodResult.restaurantPriceSymbol ?? null,
    topFood: [],
    totalDishCount: 0,
    operatingStatus: foodResult.restaurantOperatingStatus ?? null,
    distanceMiles: foodResult.restaurantDistanceMiles ?? null,
  };
};

const createFavoriteListDetailShellSpec = ({
  sceneLayout,
}: {
  sceneLayout: SearchRouteSceneLayoutState;
}): AppRouteSceneStackShellSpec =>
  normalizeSearchRouteSceneStackShellSpec({
    overlayKey: 'favoriteListDetail',
    snapPoints: sceneLayout.snapPoints,
    style: overlaySheetStyles.container,
  });

type FavoriteListDetailHeaderProps = {
  title: string;
  description: string | null;
  visibility: string | null;
  isEditing: boolean;
  draftName: string;
  draftDescription: string;
  isSaving: boolean;
  onClose: () => void;
  onMenu: () => void;
  onShare: () => void;
  onSave: () => void;
  onDraftNameChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
};

const FavoriteListDetailHeader = React.memo(
  ({
    title,
    description,
    visibility,
    isEditing,
    draftName,
    draftDescription,
    isSaving,
    onClose,
    onMenu,
    onShare,
    onSave,
    onDraftNameChange,
    onDraftDescriptionChange,
  }: FavoriteListDetailHeaderProps) => (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
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
              onChangeText={onDraftNameChange}
              placeholder="List name"
              placeholderTextColor={themeColors.textBody}
              style={styles.editTitleInput}
            />
            <TextInput
              value={draftDescription}
              onChangeText={onDraftDescriptionChange}
              placeholder="Description"
              placeholderTextColor={themeColors.textBody}
              style={styles.editDescriptionInput}
              multiline
            />
          </>
        ) : (
          <>
            <Text variant="subtitle" weight="semibold" style={styles.headerTitle}>
              {title}
            </Text>
            {description ? (
              <Text variant="caption" style={styles.headerSubtitle} numberOfLines={1}>
                {description}
              </Text>
            ) : null}
            {visibility ? (
              <View style={styles.visibilityBadge}>
                <Text variant="caption" style={styles.visibilityText}>
                  {visibility === 'public' ? 'Public' : 'Private'}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>
      <View style={styles.headerActions}>
        {isEditing ? (
          <Pressable
            onPress={onSave}
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
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel="Share list"
              hitSlop={8}
              style={styles.headerIcon}
            >
              <Feather name="share" size={20} color={themeColors.primary} />
            </Pressable>
            <Pressable
              onPress={onMenu}
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
  )
);

FavoriteListDetailHeader.displayName = 'FavoriteListDetailHeader';

export const useFavoriteListDetailRouteSceneDescriptor = ({
  listId,
  ownerSceneKey,
  sceneLayout,
  isActive,
  onClose,
}: FavoriteListDetailRouteSceneArgs): FavoriteListDetailRouteSceneDescriptor | null => {
  const queryClient = useQueryClient();
  const {
    closeRestaurantRoute,
    getActiveRestaurantRouteSessionToken,
    openRestaurantRoute: openProducedRestaurantRoute,
    updateRestaurantRoutePanel,
  } = useRestaurantRouteProducer();
  const { data, isLoading } = useFavoriteListDetail(listId, isActive);
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

  const openRestaurantProfileRoute = React.useCallback(
    ({
      restaurant,
      queryLabel,
      initialDishes = [],
      isFavorite,
      onToggleFavorite,
    }: {
      restaurant: RestaurantResult;
      queryLabel: string;
      initialDishes?: FoodResult[];
      isFavorite: boolean;
      onToggleFavorite?: (id: string) => void;
    }) => {
      const sessionToken = openProducedRestaurantRoute({
        restaurantId: restaurant.restaurantId,
        parentSceneKey: ownerSceneKey,
        ownerSceneKey,
        openerRouteKey: 'favoriteListDetail',
        panel: createRestaurantRoutePanelDraft({
          data: {
            restaurant,
            dishes: initialDishes,
            queryLabel,
            isFavorite,
            isLoading: true,
          },
          onToggleFavorite: onToggleFavorite ?? (() => undefined),
        }),
      });

      void searchService
        .restaurantProfile(restaurant.restaurantId, {
          marketKey: restaurant.marketKey ?? null,
        })
        .then((profile) => {
          if (getActiveRestaurantRouteSessionToken() !== sessionToken || !profile?.restaurant) {
            return;
          }
          updateRestaurantRoutePanel(
            sessionToken,
            createRestaurantRoutePanelDraft({
              data: {
                restaurant: profile.restaurant,
                dishes: profile.dishes ?? [],
                queryLabel,
                isFavorite,
              },
              onToggleFavorite: onToggleFavorite ?? (() => undefined),
            })
          );
        })
        .catch(() => {
          if (getActiveRestaurantRouteSessionToken() !== sessionToken) {
            return;
          }
          updateRestaurantRoutePanel(
            sessionToken,
            createRestaurantRoutePanelDraft({
              data: {
                restaurant,
                dishes: initialDishes,
                queryLabel,
                isFavorite,
                isLoading: false,
              },
              onToggleFavorite: onToggleFavorite ?? (() => undefined),
            })
          );
        });
    },
    [
      getActiveRestaurantRouteSessionToken,
      openProducedRestaurantRoute,
      ownerSceneKey,
      updateRestaurantRoutePanel,
    ]
  );

  React.useEffect(
    () => () => {
      closeRestaurantRoute();
    },
    [closeRestaurantRoute]
  );

  const handleShare = React.useCallback(async () => {
    if (!list) {
      return;
    }
    try {
      const result = await favoriteListsService.enableShare(list.listId);
      const shareUrl = `${SHARE_BASE_URL}/l/${result.shareSlug}`;
      await Share.share({
        message: `${list.name} - View on Crave Search\n${shareUrl}`,
      });
    } catch {
      // ignore
    }
  }, [list]);

  const handleToggleVisibility = React.useCallback(async () => {
    if (!list || !listId) {
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
    onClose();
  }, [list, onClose, queryClient]);

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
    if (!list || !listId) {
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

  const renderRestaurant = React.useCallback<ListRenderItem<FavoriteListDetailItem>>(
    ({ item, index }) => {
      if ('connectionId' in item) {
        return null;
      }
      return (
        <RestaurantResultCard
          restaurant={item}
          index={index}
          rank={index + 1}
          qualityColor={getMarkerColorForRestaurant(item)}
          isLiked={false}
          primaryMarketKey={null}
          showMarketLabel={false}
          onSavePress={() => undefined}
          openRestaurantProfile={(restaurant) => {
            openRestaurantProfileRoute({
              restaurant,
              queryLabel: list?.name ?? 'Favorites',
              isFavorite: true,
            });
          }}
          openScoreInfo={() => undefined}
          primaryFoodTerm={null}
        />
      );
    },
    [list?.name, openRestaurantProfileRoute]
  );

  const renderDish = React.useCallback<ListRenderItem<FavoriteListDetailItem>>(
    ({ item, index }) => {
      if (!('connectionId' in item)) {
        return null;
      }
      return (
        <DishResultCard
          item={item}
          index={index}
          qualityColor={getMarkerColorForDish(item)}
          isLiked={false}
          primaryMarketKey={null}
          showMarketLabel={false}
          restaurantForDish={buildRestaurantRouteSeedFromFoodResult(item)}
          onSavePress={() => undefined}
          openRestaurantProfile={(restaurant) => {
            openRestaurantProfileRoute({
              restaurant,
              queryLabel: list?.name ?? 'Favorites',
              initialDishes: [item],
              isFavorite: true,
            });
          }}
          openScoreInfo={() => undefined}
        />
      );
    },
    [list?.name, openRestaurantProfileRoute]
  );

  const headerComponent = React.useMemo(
    () => (
      <FavoriteListDetailHeader
        title={list?.name ?? 'Favorites'}
        description={list?.description ?? null}
        visibility={list?.visibility ?? null}
        isEditing={isEditing}
        draftName={draftName}
        draftDescription={draftDescription}
        isSaving={isSaving}
        onClose={onClose}
        onMenu={handleMenu}
        onShare={() => void handleShare()}
        onSave={() => void handleSave()}
        onDraftNameChange={setDraftName}
        onDraftDescriptionChange={setDraftDescription}
      />
    ),
    [
      draftDescription,
      draftName,
      handleMenu,
      handleSave,
      handleShare,
      isEditing,
      isSaving,
      list?.description,
      list?.name,
      list?.visibility,
      onClose,
    ]
  );

  const listEmptyComponent = React.useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text variant="body" style={styles.emptyText}>
          {isLoading ? 'Loading list...' : 'No items yet'}
        </Text>
      </View>
    ),
    [isLoading]
  );

  return React.useMemo(() => {
    if (!isActive || listId == null || ownerSceneKey == null) {
      return null;
    }
    const data = (isRestaurantList ? restaurants : dishes) as FavoriteListDetailItem[];
    const sceneBodyContent: AppRouteSceneBodyContentSpec = {
      surfaceKind: 'list',
      data,
      renderItem: (isRestaurantList ? renderRestaurant : renderDish) as ListRenderItem<unknown>,
      keyExtractor: (item: unknown) => {
        const favoriteListItem = item as FavoriteListDetailItem;
        return 'connectionId' in favoriteListItem
          ? favoriteListItem.connectionId
          : favoriteListItem.restaurantId;
      },
      estimatedItemSize: isRestaurantList ? 168 : 188,
      ListEmptyComponent: listEmptyComponent,
      listKey: `favorite-list-detail-${listId}`,
    };
    return {
      shellSpec: createFavoriteListDetailShellSpec({ sceneLayout }),
      sceneChrome: {
        surfaceKind: 'inline',
        underlayComponent: null,
        backgroundComponent: <FrostedGlassBackground intensity={60} />,
        headerComponent,
        overlayComponent: null,
      },
      sceneBodyContent,
      sceneBodyTransport: {
        contentContainerStyle: [styles.listContent, { paddingBottom: SCREEN_HEIGHT * 0.15 }],
        keyboardShouldPersistTaps: 'handled',
        contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
      },
    };
  }, [
    dishes,
    headerComponent,
    isActive,
    isRestaurantList,
    listEmptyComponent,
    listId,
    ownerSceneKey,
    renderDish,
    renderRestaurant,
    restaurants,
    sceneLayout,
  ]);
};

const styles = StyleSheet.create({
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
  listContent: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: themeColors.textBody,
  },
});
