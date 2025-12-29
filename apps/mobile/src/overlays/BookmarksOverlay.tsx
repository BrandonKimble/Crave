import React from 'react';
import { Alert, Dimensions, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { SharedValue } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '../components';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { colors as themeColors } from '../constants/theme';
import { useOverlayStore } from '../store/overlayStore';
import { useSystemStatusStore } from '../store/systemStatusStore';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import BottomSheetWithFlashList, { type SnapPoints } from './BottomSheetWithFlashList';
import { resolveExpandedTop } from './sheetUtils';
import { useHeaderCloseCutout } from './useHeaderCloseCutout';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../hooks/use-favorite-lists';
import type { RootStackParamList } from '../types/navigation';

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

type BookmarksOverlayProps = {
  visible: boolean;
  navBarTop?: number;
  searchBarTop?: number;
  onSnapChange?: (snap: 'expanded' | 'middle' | 'collapsed' | 'hidden') => void;
  onDragStateChange?: (isDragging: boolean) => void;
  sheetYObserver?: SharedValue<number>;
  snapTo?: 'expanded' | 'middle' | 'collapsed' | 'hidden' | null;
};

type Navigation = StackNavigationProp<RootStackParamList>;

type ListFormState = {
  mode: 'hidden' | 'create' | 'edit';
  list?: FavoriteListSummary | null;
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

const BookmarksOverlay: React.FC<BookmarksOverlayProps> = ({
  visible,
  navBarTop = 0,
  searchBarTop = 0,
  onSnapChange,
  onDragStateChange,
  sheetYObserver,
  snapTo,
}) => {
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
  const closeCutout = useHeaderCloseCutout();
  const headerHeight = closeCutout.headerHeight;
  const navBarOffset = Math.max(navBarTop, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = React.useMemo<SnapPoints>(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const rawMiddle = SCREEN_HEIGHT * 0.5;
    const middle = Math.max(expanded + 96, rawMiddle);
    const hidden = SCREEN_HEIGHT + 80;
    const clampedMiddle = Math.min(middle, hidden - 120);
    const fallbackCollapsed = SCREEN_HEIGHT - 160;
    const navAlignedCollapsed =
      navBarOffset > 0 && headerHeight > 0 ? navBarOffset - headerHeight : fallbackCollapsed;
    const collapsed = Math.max(navAlignedCollapsed, clampedMiddle + 24);
    return {
      expanded,
      middle: clampedMiddle,
      collapsed,
      hidden,
    };
  }, [headerHeight, insets.top, navBarOffset, searchBarTop]);

  const handleClose = React.useCallback(() => {
    setOverlay('search');
  }, [setOverlay]);
  const handleHidden = React.useCallback(() => {
    if (!visible) {
      return;
    }
    setOverlay('search');
  }, [setOverlay, visible]);

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
    <View
      style={[
        overlaySheetStyles.header,
        overlaySheetStyles.headerTransparent,
        { paddingTop: headerPaddingTop },
      ]}
      onLayout={closeCutout.onHeaderLayout}
    >
      {closeCutout.background}
      <View style={overlaySheetStyles.grabHandleWrapper}>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close favorites"
          hitSlop={10}
        >
          <View style={overlaySheetStyles.grabHandle} />
        </Pressable>
      </View>
      <View
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}
        onLayout={closeCutout.onHeaderRowLayout}
      >
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
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close favorites"
          style={overlaySheetStyles.closeButton}
          onLayout={closeCutout.onCloseLayout}
          hitSlop={8}
        >
          <View style={overlaySheetStyles.closeIcon}>
            <Feather name="x" size={20} color={ACTIVE_TAB_COLOR} />
          </View>
        </Pressable>
      </View>
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
      <View style={overlaySheetStyles.headerDivider} />
    </View>
  );

  return (
    <BottomSheetWithFlashList
      visible={visible}
      snapPoints={snapPoints}
      initialSnapPoint="expanded"
      data={lists}
      renderItem={renderListTile}
      keyExtractor={(item) => item.listId}
      estimatedItemSize={220}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom: contentBottomPadding,
        },
      ]}
      ListHeaderComponent={renderFormPanel}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            No lists yet
          </Text>
        </View>
      }
      backgroundComponent={<FrostedGlassBackground />}
      headerComponent={headerComponent}
      style={overlaySheetStyles.container}
      onHidden={handleHidden}
      onSnapChange={onSnapChange}
      onDragStateChange={onDragStateChange}
      sheetYObserver={sheetYObserver}
      snapTo={snapTo}
      dismissThreshold={dismissThreshold}
      preventSwipeDismiss
      flashListProps={{
        numColumns: 2,
        columnWrapperStyle: styles.columnWrapper,
      }}
    />
  );
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
    marginTop: 12,
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

export default BookmarksOverlay;
