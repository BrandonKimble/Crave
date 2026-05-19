import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListVisibility,
} from '../../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../../hooks/use-favorite-lists';
import { useBottomSheetSceneStackBodyDataActivity } from '../BottomSheetSceneStackBodyActivityContext';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useRouteAuthoritySelector } from '../../navigation/runtime/use-route-authority-selector';
import type { AppRouteOverlayCommandSnapshot } from '../../navigation/runtime/app-route-overlay-command-controller';
import { useDeferredSceneDataLane } from './useDeferredSceneDataLane';
import { getCraveScoreColorFromScore } from '../../utils/quality-color';

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

type ListFormState = {
  mode: 'hidden' | 'create';
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

const selectSaveSheetListType = (snapshot: AppRouteOverlayCommandSnapshot) =>
  snapshot.saveSheetState.listType;

const selectSaveSheetState = (snapshot: AppRouteOverlayCommandSnapshot) => snapshot.saveSheetState;

export const SaveListMountedSceneHeader = React.memo(() => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const listType = useRouteAuthoritySelector({
    subscribe: routeSceneRuntime.routeOverlayCommandAuthority.subscribe,
    getSnapshot: routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot,
    selector: selectSaveSheetListType,
  });
  const { handleCloseSaveSheet } = routeSceneRuntime.routeOverlayCommandActions;
  const headerPaddingTop = 0;
  const headerActionProgress = useSharedValue(0);

  const onClose = React.useCallback(() => {
    handleCloseSaveSheet();
  }, [handleCloseSaveSheet]);

  return (
    <OverlaySheetHeaderChrome
      onGrabHandlePress={onClose}
      grabHandleAccessibilityLabel="Close save sheet"
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
            Save to {listType === 'restaurant' ? 'Restaurants' : 'Dishes'}
          </Text>
        </View>
      }
      actionButton={
        <OverlayHeaderActionButton
          progress={headerActionProgress}
          onPress={onClose}
          accessibilityLabel="Close save sheet"
          accentColor={ACTIVE_TAB_COLOR}
          closeColor="#000000"
        />
      }
    />
  );
});

SaveListMountedSceneHeader.displayName = 'SaveListMountedSceneHeader';

const chunkFavoriteLists = (
  lists: readonly FavoriteListSummary[]
): readonly (readonly FavoriteListSummary[])[] => {
  const rows: FavoriteListSummary[][] = [];
  for (let index = 0; index < lists.length; index += 2) {
    rows.push(lists.slice(index, index + 2));
  }
  return rows;
};

type SaveListTileProps = {
  item: FavoriteListSummary;
  onPress: (listId: string) => void;
};

const SaveListTile = React.memo(({ item, onPress }: SaveListTileProps) => (
  <Pressable
    onPress={() => void onPress(item.listId)}
    style={({ pressed }) => [styles.tileWrapper, pressed && styles.tilePressed]}
  >
    <View style={styles.tile}>
      <View style={styles.tileContent}>
        {item.previewItems.length > 0 ? (
          item.previewItems.map((previewItem) => (
            <View key={previewItem.itemId} style={styles.previewRow}>
              <View
                style={[
                  styles.previewDot,
                  { backgroundColor: getCraveScoreColorFromScore(previewItem.craveScore) },
                ]}
              />
              <Text variant="caption" numberOfLines={1} style={styles.previewText}>
                {previewItem.label}
                {previewItem.subLabel ? ` • ${previewItem.subLabel}` : ''}
              </Text>
            </View>
          ))
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
));

SaveListTile.displayName = 'SaveListTile';

export const SaveListMountedSceneBody = React.memo(() => {
  const { shouldRunDataLane } = useBottomSheetSceneStackBodyDataActivity();
  const queryClient = useQueryClient();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const saveSheetState = useRouteAuthoritySelector({
    subscribe: routeSceneRuntime.routeOverlayCommandAuthority.subscribe,
    getSnapshot: routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot,
    selector: selectSaveSheetState,
  });
  const { handleCloseSaveSheet } = routeSceneRuntime.routeOverlayCommandActions;
  const [formState, setFormState] = React.useState<ListFormState>({
    mode: 'hidden',
    name: '',
    description: '',
    visibility: 'private',
  });
  const listType = saveSheetState.listType;
  const target = saveSheetState.target;
  const queryEnabled = useDeferredSceneDataLane(shouldRunDataLane);
  const listsQuery = useFavoriteLists({
    listType,
    enabled: queryEnabled,
    subscribed: queryEnabled,
  });
  const lists = listsQuery.data ?? [];
  const listRows = React.useMemo(() => chunkFavoriteLists(lists), [lists]);

  const onClose = React.useCallback(() => {
    handleCloseSaveSheet();
  }, [handleCloseSaveSheet]);

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

  return (
    <View style={styles.sceneBody}>
      {formState.mode === 'hidden' ? (
        <Pressable onPress={handleOpenCreateForm} style={styles.newListCard}>
          <View style={styles.newListIcon}>
            <Feather name="plus" size={20} color={TILE_SUBTEXT} />
          </View>
          <Text variant="caption" style={styles.newListText}>
            New list
          </Text>
        </Pressable>
      ) : (
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
                const isSelected = formState.visibility === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => handleVisibilityChange(value)}
                    style={[styles.visibilityOption, isSelected && styles.visibilityOptionActive]}
                  >
                    <Text
                      variant="caption"
                      weight="semibold"
                      style={[
                        styles.visibilityOptionText,
                        isSelected && styles.visibilityOptionTextActive,
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
      )}
      {lists.length ? (
        <View style={styles.gridList}>
          {listRows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {row.map((item) => (
                <View key={item.listId} style={styles.gridCell}>
                  <SaveListTile item={item} onPress={handlePickList} />
                </View>
              ))}
              {row.length === 1 ? <View style={styles.gridCell} /> : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            No lists yet
          </Text>
        </View>
      )}
    </View>
  );
});

SaveListMountedSceneBody.displayName = 'SaveListMountedSceneBody';

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingTop: 12,
  },
  sceneBody: {
    gap: GRID_GAP,
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
  gridList: {
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  gridCell: {
    flex: 1,
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
