import React from 'react';
import { Alert, Dimensions, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useQueryClient } from '@tanstack/react-query';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { useOverlayStore } from '../../store/overlayStore';
import { useSystemStatusStore } from '../../store/systemStatusStore';
import {
  OVERLAY_TAB_HEADER_HEIGHT,
  OVERLAY_HORIZONTAL_PADDING,
  overlaySheetStyles,
} from '../overlaySheetStyles';
import type { SnapPoints } from '../BottomSheetWithFlashList';
import { calculateSnapPoints } from '../sheetUtils';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../../hooks/use-favorite-lists';
import type { RootStackParamList } from '../../types/navigation';
import type { OverlayContentSpec, OverlaySheetSnap } from '../types';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACTIVE_TAB_COLOR = themeColors.primary;
const GRID_GAP = 12;
const TILE_RADIUS = 16;
const TILE_BORDER = '#e2e8f0';
const TILE_BG = '#f8fafc';
const TILE_TEXT = '#0f172a';
const TILE_SUBTEXT = themeColors.textBody;
const PREVIEW_DOT = themeColors.textBody;
const SEGMENT_BG = '#f1f5f9';
const SEGMENT_ACTIVE = '#ffffff';
const SEGMENT_TEXT = themeColors.textBody;
const SEGMENT_ACTIVE_TEXT = '#0f172a';
const FORM_BG = '#ffffff';
const FORM_BORDER = '#e2e8f0';
const FORM_PLACEHOLDER = themeColors.textBody;
const FORM_TOGGLE_BG = '#f1f5f9';
const FORM_TOGGLE_ACTIVE = '#0f172a';
const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://crave-search.app';

const resolveRankColor = (score?: number | null) => {
  if (score == null) {
    return PREVIEW_DOT;
  }
  if (score >= 8) {
    return '#10b981';
  }
  if (score >= 6) {
    return '#f59e0b';
  }
  return '#fb7185';
};

type UseBookmarksPanelSpecOptions = {
  visible: boolean;
  navBarTop?: number;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  sheetY: SharedValue<number>;
  headerActionProgress?: SharedValue<number>;
  onSnapChange?: (snap: OverlaySheetSnap) => void;
  snapTo?: OverlaySheetSnap | null;
};

type Navigation = StackNavigationProp<RootStackParamList>;

type ListFormState = {
  mode: 'hidden' | 'create' | 'edit';
  list?: FavoriteListSummary | null;
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

export const useBookmarksPanelSpec = ({
  visible,
  navBarTop = 0,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  sheetY: _sheetY,
  headerActionProgress: headerActionProgressProp,
  onSnapChange,
  snapTo,
}: UseBookmarksPanelSpecOptions): OverlayContentSpec<FavoriteListSummary> => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const [listType, setListType] = React.useState<FavoriteListType>('restaurant');
  const [formState, setFormState] = React.useState<ListFormState>({
    mode: 'hidden',
    name: '',
    description: '',
    visibility: 'private',
  });
  const listsQuery = useFavoriteLists({ listType, enabled: visible && !isSystemUnavailable });
  const lists = listsQuery.data ?? [];

  const headerPaddingTop = 0;
  const headerHeight = OVERLAY_TAB_HEADER_HEIGHT;
  const navBarOffset = Math.max(navBarTop, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = React.useMemo<SnapPoints>(
    () =>
      snapPointsOverride ??
      calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarOffset, headerHeight),
    [headerHeight, insets.top, navBarOffset, searchBarTop, snapPointsOverride]
  );

  const localHeaderActionProgress = useSharedValue(0);
  const headerActionProgress = headerActionProgressProp ?? localHeaderActionProgress;

  const handleClose = React.useCallback(() => {
    setOverlay('search');
  }, [setOverlay]);

  const resetForm = React.useCallback(() => {
    setFormState({
      mode: 'hidden',
      name: '',
      description: '',
      visibility: 'private',
      list: null,
    });
  }, []);

  const openCreateForm = React.useCallback(() => {
    setFormState({
      mode: 'create',
      name: '',
      description: '',
      visibility: 'private',
      list: null,
    });
  }, []);

  const openEditForm = React.useCallback((list: FavoriteListSummary) => {
    setFormState({
      mode: 'edit',
      name: list.name,
      description: list.description ?? '',
      visibility: list.visibility,
      list,
    });
  }, []);

  const handleFormSave = React.useCallback(async () => {
    if (!formState.name.trim()) {
      return;
    }
    if (formState.mode === 'create') {
      await favoriteListsService.create({
        name: formState.name,
        description: formState.description,
        listType,
        visibility: formState.visibility,
      });
    }
    if (formState.mode === 'edit' && formState.list) {
      await favoriteListsService.update(formState.list.listId, {
        name: formState.name,
        description: formState.description,
        visibility: formState.visibility,
      });
    }
    await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    resetForm();
  }, [formState, listType, queryClient, resetForm]);

  const handleListPress = React.useCallback(
    (listId: string) => {
      navigation.navigate('FavoritesListDetail', { listId });
    },
    [navigation]
  );

  const handleShare = React.useCallback(async (list: FavoriteListSummary) => {
    try {
      const result = await favoriteListsService.enableShare(list.listId);
      const shareUrl = `${SHARE_BASE_URL}/l/${result.shareSlug}`;
      await Share.share({
        message: `${list.name} · View on Crave Search\n${shareUrl}`,
      });
    } catch {
      // ignore share errors
    }
  }, []);

  const handleToggleVisibility = React.useCallback(
    async (list: FavoriteListSummary) => {
      const nextVisibility = list.visibility === 'public' ? 'private' : 'public';
      await favoriteListsService.update(list.listId, { visibility: nextVisibility });
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    },
    [queryClient]
  );

  const handleDelete = React.useCallback(
    async (list: FavoriteListSummary) => {
      await favoriteListsService.remove(list.listId);
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    },
    [queryClient]
  );

  const openListMenu = React.useCallback(
    (list: FavoriteListSummary) => {
      Alert.alert(list.name, undefined, [
        {
          text: 'Edit',
          onPress: () => openEditForm(list),
        },
        {
          text: 'Share',
          onPress: () => void handleShare(list),
        },
        {
          text: list.visibility === 'public' ? 'Make Private' : 'Make Public',
          onPress: () => void handleToggleVisibility(list),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void handleDelete(list),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    },
    [handleDelete, handleShare, handleToggleVisibility, openEditForm]
  );

  const renderPreviewRow = React.useCallback(
    (item: FavoriteListSummary['previewItems'][number]) => (
      <View key={item.itemId} style={styles.previewRow}>
        <View style={[styles.previewDot, { backgroundColor: resolveRankColor(item.score) }]} />
        <Text variant="caption" numberOfLines={1} style={styles.previewText}>
          {item.label}
          {item.subLabel ? ` • ${item.subLabel}` : ''}
        </Text>
      </View>
    ),
    []
  );

  const renderListTile = React.useCallback(
    ({ item }: { item: FavoriteListSummary }) => (
      <Pressable
        onPress={() => handleListPress(item.listId)}
        style={({ pressed }) => [styles.tileWrapper, pressed && styles.tilePressed]}
      >
        <View style={styles.tile}>
          <View style={styles.tileContent}>
            {item.previewItems.length > 0 ? (
              item.previewItems.map(renderPreviewRow)
            ) : (
              <Text variant="caption" style={styles.previewEmpty}>
                No items yet
              </Text>
            )}
          </View>
        </View>
        <View style={styles.tileFooter}>
          <Text variant="body" weight="semibold" style={styles.tileTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Pressable
            onPress={() => openListMenu(item)}
            accessibilityRole="button"
            accessibilityLabel="List actions"
            hitSlop={8}
            style={styles.tileMenuButton}
          >
            <Feather name="more-horizontal" size={18} color={SEGMENT_TEXT} />
          </Pressable>
        </View>
      </Pressable>
    ),
    [handleListPress, openListMenu, renderPreviewRow]
  );

  const renderFormPanel = () => {
    if (formState.mode === 'hidden') {
      return (
        <Pressable onPress={openCreateForm} style={styles.newListCard}>
          <View style={styles.newListIcon}>
            <Feather name="plus" size={20} color={SEGMENT_TEXT} />
          </View>
          <Text variant="caption" style={styles.newListText}>
            New list
          </Text>
        </Pressable>
      );
    }

    return (
      <View style={styles.formPanel}>
        <Text variant="subtitle" weight="semibold" style={styles.formTitle}>
          {formState.mode === 'create' ? 'Create list' : 'Edit list'}
        </Text>
        <TextInput
          value={formState.name}
          onChangeText={(value) => setFormState((prev) => ({ ...prev, name: value }))}
          placeholder="List name"
          placeholderTextColor={FORM_PLACEHOLDER}
          style={styles.formInput}
        />
        <TextInput
          value={formState.description}
          onChangeText={(value) => setFormState((prev) => ({ ...prev, description: value }))}
          placeholder="Description (optional)"
          placeholderTextColor={FORM_PLACEHOLDER}
          style={[styles.formInput, styles.formInputMultiline]}
          multiline
        />
        <View style={styles.visibilityRow}>
          <Text variant="caption" style={styles.visibilityLabel}>
            Visibility
          </Text>
          <View style={styles.visibilityToggle}>
            {(['private', 'public'] as FavoriteListVisibility[]).map((value) => {
              const isActive = formState.visibility === value;
              return (
                <Pressable
                  key={value}
                  onPress={() =>
                    setFormState((prev) => ({
                      ...prev,
                      visibility: value,
                    }))
                  }
                  style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
                >
                  <Text
                    variant="caption"
                    weight="semibold"
                    style={[
                      styles.visibilityOptionText,
                      isActive && styles.visibilityOptionTextActive,
                    ]}
                  >
                    {value === 'private' ? 'Private' : 'Public'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.formActions}>
          <Pressable onPress={resetForm} style={styles.formCancel}>
            <Text variant="caption" weight="semibold" style={styles.formCancelText}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={() => void handleFormSave()} style={styles.formSave}>
            <Text variant="caption" weight="semibold" style={styles.formSaveText}>
              Save
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const headerComponent = (
    <OverlaySheetHeaderChrome
      onGrabHandlePress={handleClose}
      grabHandleAccessibilityLabel="Close favorites"
      paddingTop={headerPaddingTop}
      title={
        <View style={styles.headerTextGroup}>
          <Text
            variant="title"
            weight="semibold"
            style={styles.headerTitle}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Favorites
          </Text>
        </View>
      }
      actionButton={
        <OverlayHeaderActionButton
          progress={headerActionProgress}
          onPress={handleClose}
          accessibilityLabel="Close favorites"
          accentColor={ACTIVE_TAB_COLOR}
          closeColor="#000000"
        />
      }
    />
  );

  const listHeaderComponent = (
    <View>
      <View style={styles.segmentRow}>
        {(['restaurant', 'dish'] as FavoriteListType[]).map((value) => {
          const isActive = listType === value;
          return (
            <Pressable
              key={value}
              onPress={() => setListType(value)}
              style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
            >
              <Text
                variant="caption"
                weight="semibold"
                style={[styles.segmentText, isActive && styles.segmentTextActive]}
              >
                {value === 'restaurant' ? 'Restaurants' : 'Dishes'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {renderFormPanel()}
    </View>
  );

  return {
    overlayKey: 'bookmarks',
    snapPoints,
    initialSnapPoint: 'expanded',
    snapTo,
    data: lists,
    renderItem: renderListTile,
    keyExtractor: (item) => item.listId,
    estimatedItemSize: 220,
    contentContainerStyle: [
      styles.scrollContent,
      {
        paddingBottom: contentBottomPadding,
      },
    ],
    ListHeaderComponent: listHeaderComponent,
    ListEmptyComponent: (
      <View style={styles.emptyState}>
        <Text variant="body" style={styles.emptyText}>
          No lists yet
        </Text>
      </View>
    ),
    bounces: false,
    alwaysBounceVertical: false,
    overScrollMode: 'never',
    backgroundComponent: <FrostedGlassBackground />,
    contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
    headerComponent: headerComponent,
    style: overlaySheetStyles.container,
    onSnapChange,
    dismissThreshold,
    preventSwipeDismiss: true,
    flashListProps: {
      numColumns: 2,
      columnWrapperStyle: styles.columnWrapper,
    },
  };
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingTop: 12,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: SEGMENT_BG,
    borderRadius: 999,
    padding: 4,
    marginTop: 8,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  segmentButtonActive: {
    backgroundColor: SEGMENT_ACTIVE,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentText: {
    color: SEGMENT_TEXT,
  },
  segmentTextActive: {
    color: SEGMENT_ACTIVE_TEXT,
  },
  columnWrapper: {
    gap: GRID_GAP,
  },
  tileWrapper: {
    flex: 1,
    marginBottom: GRID_GAP,
  },
  tilePressed: {
    opacity: 0.85,
  },
  tile: {
    backgroundColor: TILE_BG,
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    padding: 12,
    minHeight: 140,
  },
  tileContent: {
    gap: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewText: {
    color: TILE_TEXT,
    flex: 1,
  },
  previewEmpty: {
    color: TILE_SUBTEXT,
  },
  tileFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileTitle: {
    color: TILE_TEXT,
    flex: 1,
  },
  tileMenuButton: {
    paddingLeft: 8,
  },
  newListCard: {
    backgroundColor: '#ffffff',
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: GRID_GAP,
  },
  newListIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  newListText: {
    color: SEGMENT_TEXT,
  },
  formPanel: {
    backgroundColor: FORM_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: FORM_BORDER,
    padding: 16,
    marginBottom: GRID_GAP,
  },
  formTitle: {
    color: TILE_TEXT,
    marginBottom: 12,
  },
  formInput: {
    borderWidth: 1,
    borderColor: FORM_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TILE_TEXT,
    marginBottom: 10,
  },
  formInputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  visibilityRow: {
    marginTop: 4,
    marginBottom: 12,
  },
  visibilityLabel: {
    color: TILE_SUBTEXT,
    marginBottom: 6,
  },
  visibilityToggle: {
    flexDirection: 'row',
    backgroundColor: FORM_TOGGLE_BG,
    borderRadius: 999,
    padding: 4,
  },
  visibilityOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  visibilityOptionActive: {
    backgroundColor: FORM_TOGGLE_ACTIVE,
  },
  visibilityOptionText: {
    color: TILE_SUBTEXT,
  },
  visibilityOptionTextActive: {
    color: '#ffffff',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  formCancel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  formCancelText: {
    color: TILE_SUBTEXT,
  },
  formSave: {
    backgroundColor: TILE_TEXT,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  formSaveText: {
    color: '#ffffff',
  },
  emptyState: {
    paddingVertical: 24,
  },
  emptyText: {
    color: TILE_SUBTEXT,
  },
});
