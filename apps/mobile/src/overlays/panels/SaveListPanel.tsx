import React from 'react';
import { Dimensions, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import type { SnapPoints } from '../BottomSheetWithFlashList';
import { resolveExpandedTop } from '../sheetUtils';
import { useHeaderCloseCutout } from '../useHeaderCloseCutout';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../../hooks/use-favorite-lists';
import type { OverlayContentSpec, OverlaySheetSnap } from '../types';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACTIVE_TAB_COLOR = themeColors.primary;
const GRID_GAP = 12;
const TILE_RADIUS = 16;
const TILE_BORDER = '#e2e8f0';
const TILE_BG = '#f8fafc';
const TILE_TEXT = '#0f172a';
const TILE_SUBTEXT = themeColors.textBody;
const FORM_BORDER = '#e2e8f0';
const FORM_PLACEHOLDER = themeColors.textBody;
const FORM_TOGGLE_BG = '#f1f5f9';
const FORM_TOGGLE_ACTIVE = '#0f172a';

const resolveRankColor = (score?: number | null) => {
  if (score == null) {
    return themeColors.textBody;
  }
  if (score >= 8) {
    return '#10b981';
  }
  if (score >= 6) {
    return '#f59e0b';
  }
  return '#fb7185';
};

type UseSaveListPanelSpecOptions = {
  visible: boolean;
  listType: FavoriteListType;
  target: { restaurantId?: string; connectionId?: string } | null;
  onClose: () => void;
  searchBarTop?: number;
  onSnapChange?: (snap: OverlaySheetSnap) => void;
};

type ListFormState = {
  mode: 'hidden' | 'create';
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

export const useSaveListPanelSpec = ({
  visible,
  listType,
  target,
  onClose,
  searchBarTop = 0,
  onSnapChange,
}: UseSaveListPanelSpecOptions): OverlayContentSpec<FavoriteListSummary> => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [formState, setFormState] = React.useState<ListFormState>({
    mode: 'hidden',
    name: '',
    description: '',
    visibility: 'private',
  });
  const listsQuery = useFavoriteLists({ listType, enabled: visible });
  const lists = listsQuery.data ?? [];

  const headerPaddingTop = 0;
  const closeCutout = useHeaderCloseCutout();
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = React.useMemo<SnapPoints>(() => {
    const expanded = resolveExpandedTop(searchBarTop, insets.top);
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.5);
    const collapsed = SCREEN_HEIGHT * 0.72;
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle,
      collapsed,
      hidden,
    };
  }, [insets.top, searchBarTop]);

  const resetForm = React.useCallback(() => {
    setFormState({
      mode: 'hidden',
      name: '',
      description: '',
      visibility: 'private',
    });
  }, []);

  const handleNameChange = React.useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, name: value }));
  }, []);

  const handleDescriptionChange = React.useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, description: value }));
  }, []);

  const handleVisibilityChange = React.useCallback((value: FavoriteListVisibility) => {
    setFormState((prev) => ({ ...prev, visibility: value }));
  }, []);

  const handleOpenCreateForm = React.useCallback(() => {
    setFormState((prev) => ({ ...prev, mode: 'create' }));
  }, []);

  const handleCreateList = React.useCallback(async () => {
    if (!target || !formState.name.trim()) {
      return;
    }
    const created = await favoriteListsService.create({
      name: formState.name,
      description: formState.description,
      listType,
      visibility: formState.visibility,
    });
    await favoriteListsService.addItem(created.listId, target);
    await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    resetForm();
    onClose();
  }, [formState, listType, onClose, queryClient, resetForm, target]);

  const handlePickList = React.useCallback(
    async (listId: string) => {
      if (!target) {
        return;
      }
      await favoriteListsService.addItem(listId, target);
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      onClose();
    },
    [onClose, queryClient, target]
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
        onPress={() => void handlePickList(item.listId)}
        style={({ pressed }) => [styles.tileWrapper, pressed && styles.tilePressed]}
      >
        <View style={styles.tile}>
          <View style={styles.tileContent}>
            {item.previewItems.length > 0 ? (
              item.previewItems.map(renderPreviewRow)
            ) : (
              <Text variant="caption" style={styles.previewEmpty}>
                Empty list
              </Text>
            )}
          </View>
        </View>
        <View style={styles.tileFooter}>
          <Text variant="body" weight="semibold" style={styles.tileTitle} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      </Pressable>
    ),
    [handlePickList, renderPreviewRow]
  );

  const renderFormPanel = React.useCallback(() => {
    if (formState.mode === 'hidden') {
      return (
        <Pressable onPress={handleOpenCreateForm} style={styles.newListCard}>
          <View style={styles.newListIcon}>
            <Feather name="plus" size={20} color={TILE_SUBTEXT} />
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
          Create list
        </Text>
        <TextInput
          value={formState.name}
          onChangeText={handleNameChange}
          placeholder="List name"
          placeholderTextColor={FORM_PLACEHOLDER}
          style={styles.formInput}
        />
        <TextInput
          value={formState.description}
          onChangeText={handleDescriptionChange}
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
                  onPress={() => handleVisibilityChange(value)}
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
          <Pressable onPress={() => void handleCreateList()} style={styles.formSave}>
            <Text variant="caption" weight="semibold" style={styles.formSaveText}>
              Save
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }, [
    formState.description,
    formState.mode,
    formState.name,
    formState.visibility,
    handleCreateList,
    handleDescriptionChange,
    handleNameChange,
    handleOpenCreateForm,
    handleVisibilityChange,
    resetForm,
  ]);

  const headerComponent = React.useMemo(
    () => (
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
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close save sheet"
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
              Save to {listType === 'restaurant' ? 'Restaurants' : 'Dishes'}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close save sheet"
            style={overlaySheetStyles.closeButton}
            onLayout={closeCutout.onCloseLayout}
            hitSlop={8}
          >
            <View style={overlaySheetStyles.closeIcon}>
              <Feather name="x" size={20} color={ACTIVE_TAB_COLOR} />
            </View>
          </Pressable>
        </View>
        <View style={overlaySheetStyles.headerDivider} />
      </View>
    ),
    [
      closeCutout.background,
      closeCutout.onCloseLayout,
      closeCutout.onHeaderLayout,
      closeCutout.onHeaderRowLayout,
      headerPaddingTop,
      listType,
      onClose,
    ]
  );

  const contentContainerStyle = React.useMemo(
    () => [
      styles.scrollContent,
      {
        paddingBottom: contentBottomPadding,
      },
    ],
    [contentBottomPadding]
  );

  const listEmptyComponent = React.useMemo(
    () => (
      <View style={styles.emptyState}>
        <Text variant="body" style={styles.emptyText}>
          No lists yet
        </Text>
      </View>
    ),
    []
  );

  const resolvedFlashListProps = React.useMemo(
    () => ({
      numColumns: 2,
      columnWrapperStyle: styles.columnWrapper,
    }),
    []
  );

  return {
    overlayKey: 'saveList',
    snapPoints,
    initialSnapPoint: 'expanded',
    data: lists,
    renderItem: renderListTile,
    keyExtractor: (item) => item.listId,
    estimatedItemSize: 200,
    contentContainerStyle,
    ListHeaderComponent: renderFormPanel,
    ListEmptyComponent: listEmptyComponent,
    backgroundComponent: <FrostedGlassBackground />,
    headerComponent,
    style: overlaySheetStyles.container,
    onHidden: onClose,
    onSnapChange,
    keyboardShouldPersistTaps: 'handled',
    flashListProps: resolvedFlashListProps,
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
    color: TILE_SUBTEXT,
  },
  formPanel: {
    backgroundColor: '#ffffff',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  visibilityLabel: {
    color: TILE_SUBTEXT,
  },
  visibilityToggle: {
    flexDirection: 'row',
    backgroundColor: FORM_TOGGLE_BG,
    borderRadius: 999,
    padding: 2,
  },
  visibilityOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  visibilityOptionActive: {
    backgroundColor: '#ffffff',
  },
  visibilityOptionText: {
    color: TILE_SUBTEXT,
  },
  visibilityOptionTextActive: {
    color: FORM_TOGGLE_ACTIVE,
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
