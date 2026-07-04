import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import { colors as themeColors } from '../../constants/theme';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useAppRouteCoordinator } from '../../navigation/runtime/AppRouteCoordinator';
import { useSystemStatusStore } from '../../store/systemStatusStore';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../../hooks/use-favorite-lists';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useBottomSheetSceneStackBodyRenderActivity } from '../BottomSheetSceneStackBodyActivityContext';
import { useSearchOverlayProfilerRender } from '../SearchOverlayProfilerContext';
import { useOriginSceneScrollPublication } from '../useOriginSceneScrollPublication';
import { SceneLoadingSurface } from '../../components/skeletons';
import { getCraveScoreColorFromScore } from '../../utils/quality-color';

const ACTIVE_TAB_COLOR = themeColors.primary;
const GRID_GAP = 12;
const TILE_RADIUS = 16;
const TILE_BORDER = '#e2e8f0';
const TILE_BG = '#f8fafc';
const TILE_TEXT = '#0f172a';
const TILE_SUBTEXT = themeColors.textBody;
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
const EMPTY_FAVORITE_LISTS: ReadonlyArray<FavoriteListSummary> = [];

type ListFormState = {
  mode: 'hidden' | 'create' | 'edit';
  list?: FavoriteListSummary | null;
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

const BOOKMARK_LIST_TYPES = [
  { id: 'restaurant', label: 'Restaurants' },
  { id: 'dish', label: 'Dishes' },
] as const;

const chunkFavoriteLists = (
  lists: readonly FavoriteListSummary[]
): readonly (readonly FavoriteListSummary[])[] => {
  const rows: FavoriteListSummary[][] = [];
  for (let index = 0; index < lists.length; index += 2) {
    rows.push(lists.slice(index, index + 2));
  }
  return rows;
};

type BookmarkPreviewRowProps = {
  item: FavoriteListSummary['previewItems'][number];
};

const BookmarkPreviewRow = React.memo(({ item }: BookmarkPreviewRowProps) => (
  <View style={styles.previewRow}>
    <View
      style={[styles.previewDot, { backgroundColor: getCraveScoreColorFromScore(item.craveScore) }]}
    />
    <Text variant="caption" numberOfLines={1} style={styles.previewText}>
      {item.label}
      {item.subLabel ? ` • ${item.subLabel}` : ''}
    </Text>
  </View>
));

BookmarkPreviewRow.displayName = 'BookmarkPreviewRow';

type BookmarksListTileProps = {
  item: FavoriteListSummary;
  onPress: (list: FavoriteListSummary) => void;
  onOpenMenu: (list: FavoriteListSummary) => void;
};

const BookmarksListTile = React.memo(({ item, onPress, onOpenMenu }: BookmarksListTileProps) => (
  <Pressable
    onPress={() => onPress(item)}
    style={({ pressed }) => [styles.tileWrapper, pressed && styles.tilePressed]}
  >
    <View style={styles.tile}>
      <View style={styles.tileContent}>
        {item.previewItems.length > 0 ? (
          item.previewItems.map((previewItem) => (
            <BookmarkPreviewRow key={previewItem.itemId} item={previewItem} />
          ))
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
        onPress={() => onOpenMenu(item)}
        accessibilityRole="button"
        accessibilityLabel="List actions"
        hitSlop={8}
        style={styles.tileMenuButton}
      >
        <Feather name="more-horizontal" size={18} color={SEGMENT_TEXT} />
      </Pressable>
    </View>
  </Pressable>
));

BookmarksListTile.displayName = 'BookmarksListTile';

type BookmarksFormPanelProps = {
  formState: ListFormState;
  onOpenCreateForm: () => void;
  onResetForm: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: FavoriteListVisibility) => void;
  onSave: () => void;
};

const BookmarksFormPanel = React.memo(
  ({
    formState,
    onOpenCreateForm,
    onResetForm,
    onNameChange,
    onDescriptionChange,
    onVisibilityChange,
    onSave,
  }: BookmarksFormPanelProps) => {
    if (formState.mode === 'hidden') {
      return (
        <Pressable onPress={onOpenCreateForm} style={styles.newListCard}>
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
          onChangeText={onNameChange}
          placeholder="List name"
          placeholderTextColor={FORM_PLACEHOLDER}
          style={styles.formInput}
        />
        <TextInput
          value={formState.description}
          onChangeText={onDescriptionChange}
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
                  onPress={() => onVisibilityChange(value)}
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
          <Pressable onPress={onResetForm} style={styles.formCancel}>
            <Text variant="caption" weight="semibold" style={styles.formCancelText}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={onSave} style={styles.formSave}>
            <Text variant="caption" weight="semibold" style={styles.formSaveText}>
              Save
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
);

BookmarksFormPanel.displayName = 'BookmarksFormPanel';

type BookmarksListHeaderProps = {
  sceneReady: boolean;
  listType: FavoriteListType;
  formState: ListFormState;
  onSelectListType: (value: FavoriteListType) => void;
  onOpenCreateForm: () => void;
  onResetForm: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: FavoriteListVisibility) => void;
  onSave: () => void;
};

const BookmarksListHeader = React.memo(
  ({
    sceneReady,
    listType,
    formState,
    onSelectListType,
    onOpenCreateForm,
    onResetForm,
    onNameChange,
    onDescriptionChange,
    onVisibilityChange,
    onSave,
  }: BookmarksListHeaderProps) =>
    sceneReady ? (
      <View>
        <View style={styles.segmentRow}>
          {BOOKMARK_LIST_TYPES.map(({ id, label }) => {
            const isActive = listType === id;
            return (
              <Pressable
                key={id}
                onPress={() => onSelectListType(id)}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
              >
                <Text
                  variant="caption"
                  weight="semibold"
                  style={[styles.segmentText, isActive && styles.segmentTextActive]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <BookmarksFormPanel
          formState={formState}
          onOpenCreateForm={onOpenCreateForm}
          onResetForm={onResetForm}
          onNameChange={onNameChange}
          onDescriptionChange={onDescriptionChange}
          onVisibilityChange={onVisibilityChange}
          onSave={onSave}
        />
      </View>
    ) : (
      <View style={styles.loadingState}>
        <ActivityIndicator color={ACTIVE_TAB_COLOR} size="small" />
      </View>
    )
);

BookmarksListHeader.displayName = 'BookmarksListHeader';

type BookmarksSceneBodyProps = {
  sceneReady: boolean;
  listType: FavoriteListType;
  formState: ListFormState;
  lists: readonly FavoriteListSummary[];
  isListsLoading: boolean;
  isListsError: boolean;
  onSelectListType: (value: FavoriteListType) => void;
  onOpenCreateForm: () => void;
  onResetForm: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: FavoriteListVisibility) => void;
  onSave: () => void;
  onListPress: (list: FavoriteListSummary) => void;
  onOpenMenu: (list: FavoriteListSummary) => void;
};

const BookmarksSceneBody = React.memo(
  ({
    sceneReady,
    listType,
    formState,
    lists,
    isListsLoading,
    isListsError,
    onSelectListType,
    onOpenCreateForm,
    onResetForm,
    onNameChange,
    onDescriptionChange,
    onVisibilityChange,
    onSave,
    onListPress,
    onOpenMenu,
  }: BookmarksSceneBodyProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const listRows = React.useMemo(() => chunkFavoriteLists(lists), [lists]);
    const listHeader = (
      <BookmarksListHeader
        sceneReady={sceneReady}
        listType={listType}
        formState={formState}
        onSelectListType={onSelectListType}
        onOpenCreateForm={onOpenCreateForm}
        onResetForm={onResetForm}
        onNameChange={onNameChange}
        onDescriptionChange={onDescriptionChange}
        onVisibilityChange={onVisibilityChange}
        onSave={onSave}
      />
    );
    const profiledListHeader = onProfilerRender ? (
      <React.Profiler id="BookmarksSceneBody:header" onRender={onProfilerRender}>
        {listHeader}
      </React.Profiler>
    ) : (
      listHeader
    );
    const listContent =
      !sceneReady || isListsLoading ? (
        // The real grid inherits its 20px horizontal inset from the body transport's
        // contentContainer, so the skeleton holes must NOT re-inset (insetX={0}).
        <SceneLoadingSurface rowType="tile" insetX={0} />
      ) : lists.length ? (
        <View style={styles.gridList}>
          {listRows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {row.map((item) => (
                <View key={item.listId} style={styles.gridCell}>
                  <BookmarksListTile item={item} onPress={onListPress} onOpenMenu={onOpenMenu} />
                </View>
              ))}
              {row.length === 1 ? <View style={styles.gridCell} /> : null}
            </View>
          ))}
        </View>
      ) : isListsError ? (
        // A fetch error resolved to empty — don't claim 'No lists yet'; surface the failure.
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            Couldn&apos;t load your lists
          </Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            No lists yet
          </Text>
        </View>
      );
    const profiledListContent = onProfilerRender ? (
      <React.Profiler id="BookmarksSceneBody:list" onRender={onProfilerRender}>
        {listContent}
      </React.Profiler>
    ) : (
      listContent
    );

    return (
      <View style={styles.sceneBody}>
        {profiledListHeader}
        {profiledListContent}
      </View>
    );
  }
);

BookmarksSceneBody.displayName = 'BookmarksSceneBody';

const BookmarksTransitionShell = React.memo(() => (
  <View style={styles.sceneBody}>
    {/* Bookmarks content is always a 2-up tile grid — match it so the shell→body loading transition
        doesn't reflow restaurant rows into tiles. Full-width here (sceneBody, no transport inset),
        so the default insetX=20 aligns these holes with the inset body-loading tiles. */}
    <SceneLoadingSurface rowType="tile" />
  </View>
));

BookmarksTransitionShell.displayName = 'BookmarksTransitionShell';

type BookmarksDataSurfaceProps = {
  shouldSubscribeDataLane: boolean;
  sceneReady: boolean;
};

const BookmarksDataSurface = React.memo(
  ({ shouldSubscribeDataLane, sceneReady }: BookmarksDataSurfaceProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const { dispatchLaunchIntent } = useAppRouteCoordinator();
    const queryClient = useQueryClient();
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
    const queryEnabled = !isSystemUnavailable && shouldSubscribeDataLane;
    const listsQuery = useFavoriteLists({
      listType,
      enabled: queryEnabled,
      subscribed: queryEnabled,
    });
    const retainedListsRef = React.useRef<Partial<Record<FavoriteListType, FavoriteListSummary[]>>>(
      {}
    );
    const cachedLists = queryClient.getQueryData<FavoriteListSummary[]>(
      favoriteListKeys.list(listType)
    );
    const lists =
      listsQuery.data ?? cachedLists ?? retainedListsRef.current[listType] ?? EMPTY_FAVORITE_LISTS;
    React.useEffect(() => {
      if (listsQuery.data != null) {
        retainedListsRef.current[listType] = listsQuery.data;
      }
    }, [listType, listsQuery.data]);
    // Hard-swap + skeleton (mirror of SaveListPanel's gate): while the data lane is held off
    // (queryEnabled false) or the favorites fetch is in flight with no data to show yet, paint
    // the tile-grid skeleton — NOT the 'No lists yet' empty state, which is only correct once
    // the query RESOLVES empty. A fetch error with no data is reported separately so an errored
    // query does not falsely claim the user has no lists.
    const isListsLoading = !queryEnabled || (listsQuery.isLoading && lists.length === 0);
    const isListsError = listsQuery.isError && lists.length === 0;

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

    const handleListTypeChange = React.useCallback((value: FavoriteListType) => {
      setListType(value);
    }, []);

    const handleFormNameChange = React.useCallback((value: string) => {
      setFormState((prev) => ({ ...prev, name: value }));
    }, []);

    const handleFormDescriptionChange = React.useCallback((value: string) => {
      setFormState((prev) => ({ ...prev, description: value }));
    }, []);

    const handleFormVisibilityChange = React.useCallback((value: FavoriteListVisibility) => {
      setFormState((prev) => ({ ...prev, visibility: value }));
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
      (list: FavoriteListSummary) => {
        // Launch the favorites list as a search-sourced results surface (same
        // list + toggle strip + map pins + staged reveal as a real search). The
        // launch-intent runtime captures the bookmarks origin so the search
        // dismisses back here. (Replaced the standalone favoriteListDetail
        // route, now deleted.)
        dispatchLaunchIntent({
          type: 'favorites',
          listId: list.listId,
          listType: list.listType,
          submittedLabel: list.name,
        });
      },
      [dispatchLaunchIntent]
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

    const dataSurface = (
      <BookmarksSceneBody
        sceneReady={sceneReady}
        listType={listType}
        formState={formState}
        lists={lists}
        isListsLoading={isListsLoading}
        isListsError={isListsError}
        onSelectListType={handleListTypeChange}
        onOpenCreateForm={openCreateForm}
        onResetForm={resetForm}
        onNameChange={handleFormNameChange}
        onDescriptionChange={handleFormDescriptionChange}
        onVisibilityChange={handleFormVisibilityChange}
        onSave={() => void handleFormSave()}
        onListPress={handleListPress}
        onOpenMenu={openListMenu}
      />
    );

    return onProfilerRender ? (
      <React.Profiler id="BookmarksDataSurface" onRender={onProfilerRender}>
        {dataSurface}
      </React.Profiler>
    ) : (
      dataSurface
    );
  }
);

BookmarksDataSurface.displayName = 'BookmarksDataSurface';

export const BookmarksMountedSceneBody = React.memo(() => {
  const onProfilerRender = useSearchOverlayProfilerRender();
  // P3 return-to-origin: publish the bookmarks scene's live scroll lane so a favorites-from-
  // bookmarks reveal captures the scroll offset to return to on dismiss.
  useOriginSceneScrollPublication('bookmarks');
  const { shouldSubscribeDataLane, hasActivatedExpandedContent } =
    useBottomSheetSceneStackBodyRenderActivity();

  const mountedBody = (
    <>
      {hasActivatedExpandedContent ? null : <BookmarksTransitionShell />}
      <View style={hasActivatedExpandedContent ? null : styles.prewarmedMountedBodyHidden}>
        <BookmarksDataSurface
          shouldSubscribeDataLane={shouldSubscribeDataLane}
          sceneReady={hasActivatedExpandedContent}
        />
      </View>
    </>
  );

  return onProfilerRender ? (
    <React.Profiler id="BookmarksMountedSceneBody" onRender={onProfilerRender}>
      {mountedBody}
    </React.Profiler>
  ) : (
    mountedBody
  );
});

BookmarksMountedSceneBody.displayName = 'BookmarksMountedSceneBody';

// P3 persistent header (page-switch-master-plan.md §6-P3): the bookmarks header CONTENT mounts
// inside the hoisted PersistentSheetHeaderHost, NOT inside this panel — the close (X) semantics
// come from the overlay route controller (reachable anywhere under the app providers). The
// grab-handle tap is the shared promote handler.
const BookmarksPersistentHeaderTitle = React.memo(() => (
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
));

BookmarksPersistentHeaderTitle.displayName = 'BookmarksPersistentHeaderTitle';

const BookmarksPersistentHeaderAction = React.memo(() => {
  const { setRootRoute } = useAppOverlayRouteController();
  const localHeaderActionProgress = useSharedValue(0);

  const handleClose = React.useCallback(() => {
    setRootRoute('search');
  }, [setRootRoute]);

  return (
    <OverlayHeaderActionButton
      progress={localHeaderActionProgress}
      onPress={handleClose}
      accessibilityLabel="Close favorites"
      accentColor={ACTIVE_TAB_COLOR}
      closeColor="#000000"
    />
  );
});

BookmarksPersistentHeaderAction.displayName = 'BookmarksPersistentHeaderAction';

// Module-scope registration (house pattern — origin-capture-registry).
registerPersistentHeaderDescriptor('bookmarks', {
  Title: BookmarksPersistentHeaderTitle,
  Action: BookmarksPersistentHeaderAction,
});

const styles = StyleSheet.create({
  sceneBody: {
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
  loadingState: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prewarmedMountedBodyHidden: {
    display: 'none',
  },
  emptyText: {
    color: TILE_SUBTEXT,
  },
});
