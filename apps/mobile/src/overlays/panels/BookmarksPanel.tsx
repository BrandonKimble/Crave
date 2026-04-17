import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  InteractionManager,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useQueryClient } from '@tanstack/react-query';
import { useSharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import {
  getActiveSearchNavSwitchPerfProbe,
  getActiveSearchNavSwitchProbeAgeMs,
} from '../../screens/Search/runtime/shared/search-nav-switch-perf-probe';
import { useSystemStatusStore } from '../../store/systemStatusStore';
import { logger } from '../../utils';
import {
  OVERLAY_TAB_HEADER_HEIGHT,
  OVERLAY_HORIZONTAL_PADDING,
  overlaySheetStyles,
} from '../overlaySheetStyles';
import type { SnapPoints } from '../bottomSheetMotionTypes';
import { calculateSnapPoints } from '../sheetUtils';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
  type FavoriteListVisibility,
} from '../../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../../hooks/use-favorite-lists';
import type { RootStackParamList } from '../../types/navigation';
import type { BottomSheetSceneSurfaceProps } from '../bottomSheetWithFlashListContract';
import type { OverlayContentSpec, OverlaySheetSnap, OverlaySheetSnapRequest } from '../types';
import type { SearchRouteSceneDefinition } from '../searchOverlayRouteHostContract';
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
const EMPTY_FAVORITE_LISTS: ReadonlyArray<FavoriteListSummary> = [];
const FAVORITES_QUERY_STALE_MS = 1000 * 20;

const createFavoriteListsQueryDescriptor = ({
  listType,
  visibility,
}: {
  listType?: FavoriteListType;
  visibility?: FavoriteListVisibility;
}) => ({
  queryKey: favoriteListKeys.list(listType, visibility),
  queryFn: () => favoriteListsService.list({ listType, visibility }),
  staleTime: FAVORITES_QUERY_STALE_MS,
});

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
  mounted?: boolean;
  visible: boolean;
  navBarTop?: number;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onSnapStart?: (snap: OverlaySheetSnap) => void;
  onSnapChange?: (snap: OverlaySheetSnap) => void;
  shellSnapRequest?: OverlaySheetSnapRequest | null;
};

type Navigation = StackNavigationProp<RootStackParamList>;

type ListFormState = {
  mode: 'hidden' | 'create' | 'edit';
  list?: FavoriteListSummary | null;
  name: string;
  description: string;
  visibility: FavoriteListVisibility;
};

const diffSceneSnapshots = (
  previousSnapshot: Record<string, unknown>,
  nextSnapshot: Record<string, unknown>
) =>
  Object.assign(
    {},
    ...Object.keys({ ...previousSnapshot, ...nextSnapshot }).flatMap((key) => {
      const previousValue = previousSnapshot[key];
      const nextValue = nextSnapshot[key];
      return JSON.stringify(previousValue) === JSON.stringify(nextValue)
        ? []
        : [{ [key]: { previous: previousValue, next: nextValue } }];
    })
  );

const BOOKMARK_LIST_TYPES = [
  { id: 'restaurant', label: 'Restaurants' },
  { id: 'dish', label: 'Dishes' },
] as const;

type BookmarkPreviewRowProps = {
  item: FavoriteListSummary['previewItems'][number];
};

const BookmarkPreviewRow = React.memo(({ item }: BookmarkPreviewRowProps) => (
  <View style={styles.previewRow}>
    <View style={[styles.previewDot, { backgroundColor: resolveRankColor(item.score) }]} />
    <Text variant="caption" numberOfLines={1} style={styles.previewText}>
      {item.label}
      {item.subLabel ? ` • ${item.subLabel}` : ''}
    </Text>
  </View>
));

BookmarkPreviewRow.displayName = 'BookmarkPreviewRow';

type BookmarksListTileProps = {
  item: FavoriteListSummary;
  onPress: (listId: string) => void;
  onOpenMenu: (list: FavoriteListSummary) => void;
};

const BookmarksListTile = React.memo(({ item, onPress, onOpenMenu }: BookmarksListTileProps) => (
  <Pressable
    onPress={() => onPress(item.listId)}
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

export const useBookmarksSceneDefinition = ({
  mounted,
  visible,
  navBarTop = 0,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  onSnapStart,
  onSnapChange,
  shellSnapRequest,
}: UseBookmarksPanelSpecOptions): SearchRouteSceneDefinition => {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const navigation = useNavigation<Navigation>();
  const queryClient = useQueryClient();
  const { setRootRoute } = useAppOverlayRouteController();
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
  const [sceneReady, setSceneReady] = React.useState(false);
  const perfStartRef = React.useRef<number | null>(null);
  const isMounted = mounted ?? visible;

  React.useEffect(() => {
    if (!isMounted || sceneReady) {
      return;
    }
    perfStartRef.current = Date.now();
    logger.debug('[NAV-SWITCH-SCENE-PERF] bookmarksMount');
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (activeProbe) {
      logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        ageMs: getActiveSearchNavSwitchProbeAgeMs(),
        scene: 'bookmarks',
        event: 'scene_mount',
      });
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }
      setSceneReady(true);
      logger.debug('[NAV-SWITCH-SCENE-PERF] bookmarksReady', {
        elapsedMs: perfStartRef.current == null ? null : Date.now() - perfStartRef.current,
      });
      const readyProbe = getActiveSearchNavSwitchPerfProbe();
      if (readyProbe) {
        logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
          seq: readyProbe.seq,
          from: readyProbe.from,
          to: readyProbe.to,
          ageMs: getActiveSearchNavSwitchProbeAgeMs(),
          scene: 'bookmarks',
          event: 'scene_ready',
        });
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [isMounted, sceneReady]);

  const queryEnabled = visible && sceneReady && !isSystemUnavailable;
  const listsQuery = useFavoriteLists({
    listType,
    enabled: queryEnabled,
  });
  const lists = sceneReady ? (listsQuery.data ?? EMPTY_FAVORITE_LISTS) : EMPTY_FAVORITE_LISTS;
  const sceneCauseSnapshot = React.useMemo(
    () => ({
      mounted: isMounted,
      visible,
      sceneReady,
      listType,
      formMode: formState.mode,
      formVisibility: formState.visibility,
      isSystemUnavailable,
      queryLoading: listsQuery.isLoading,
      queryFetching: listsQuery.isFetching,
      queryEnabled,
      listCount: lists.length,
      shellSnapRequest: shellSnapRequest?.snap ?? null,
    }),
    [
      formState.mode,
      formState.visibility,
      isMounted,
      isSystemUnavailable,
      listType,
      lists.length,
      listsQuery.isFetching,
      listsQuery.isLoading,
      sceneReady,
      shellSnapRequest,
      queryEnabled,
      visible,
    ]
  );
  const previousSceneCauseRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (!activeProbe) {
      previousSceneCauseRef.current = null;
      return;
    }

    const nextSnapshotKey = JSON.stringify(sceneCauseSnapshot);
    const previousSnapshotKey = previousSceneCauseRef.current;
    if (!previousSnapshotKey) {
      logger.debug('[NAV-SWITCH-CAUSE] bookmarksSceneSnapshot', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        snapshot: sceneCauseSnapshot,
      });
    } else if (previousSnapshotKey !== nextSnapshotKey) {
      logger.debug('[NAV-SWITCH-CAUSE] bookmarksSceneDelta', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        changes: diffSceneSnapshots(JSON.parse(previousSnapshotKey), sceneCauseSnapshot),
      });
    }
    previousSceneCauseRef.current = nextSnapshotKey;
  }, [sceneCauseSnapshot]);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (!activeProbe) {
      return;
    }

    if (isMounted && !visible) {
      logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        ageMs: getActiveSearchNavSwitchProbeAgeMs(),
        scene: 'bookmarks',
        event: 'mounted_hidden',
      });
    }
  }, [isMounted, visible]);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (!activeProbe) {
      return;
    }

    logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
      seq: activeProbe.seq,
      from: activeProbe.from,
      to: activeProbe.to,
      ageMs: getActiveSearchNavSwitchProbeAgeMs(),
      scene: 'bookmarks',
      event: listsQuery.isFetching ? 'query_fetch_start' : 'query_fetch_end',
      queryEnabled,
    });
  }, [listsQuery.isFetching, queryEnabled]);

  React.useEffect(() => {
    if (!isSignedIn || !isMounted || visible || isSystemUnavailable) {
      return;
    }

    let cancelled = false;
    void Promise.all([
      queryClient.prefetchQuery(
        createFavoriteListsQueryDescriptor({
          listType: 'restaurant',
        })
      ),
      queryClient.prefetchQuery(
        createFavoriteListsQueryDescriptor({
          listType: 'dish',
        })
      ),
    ]).catch(() => {
      if (cancelled) {
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isMounted, isSignedIn, isSystemUnavailable, queryClient, visible]);

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

  const handleClose = React.useCallback(() => {
    setRootRoute('search');
  }, [setRootRoute]);

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

  const renderListTile = React.useCallback(
    ({ item }: { item: FavoriteListSummary }) => (
      <BookmarksListTile item={item} onPress={handleListPress} onOpenMenu={openListMenu} />
    ),
    [handleListPress, openListMenu]
  );

  const headerComponent = React.useMemo(
    () => (
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
            progress={localHeaderActionProgress}
            onPress={handleClose}
            accessibilityLabel="Close favorites"
            accentColor={ACTIVE_TAB_COLOR}
            closeColor="#000000"
          />
        }
      />
    ),
    [handleClose, headerPaddingTop, localHeaderActionProgress]
  );

  const listHeaderComponent = React.useMemo(
    () => (
      <BookmarksListHeader
        sceneReady={sceneReady}
        listType={listType}
        formState={formState}
        onSelectListType={handleListTypeChange}
        onOpenCreateForm={openCreateForm}
        onResetForm={resetForm}
        onNameChange={handleFormNameChange}
        onDescriptionChange={handleFormDescriptionChange}
        onVisibilityChange={handleFormVisibilityChange}
        onSave={() => void handleFormSave()}
      />
    ),
    [
      formState,
      handleFormDescriptionChange,
      handleFormNameChange,
      handleFormSave,
      handleFormVisibilityChange,
      handleListTypeChange,
      listType,
      openCreateForm,
      resetForm,
      sceneReady,
    ]
  );

  const listEmptyComponent = React.useMemo(
    () => (
      <View style={sceneReady ? styles.emptyState : styles.loadingState}>
        {sceneReady ? (
          <Text variant="body" style={styles.emptyText}>
            No lists yet
          </Text>
        ) : (
          <ActivityIndicator color={ACTIVE_TAB_COLOR} size="small" />
        )}
      </View>
    ),
    [sceneReady]
  );

  const keyExtractor = React.useCallback((item: FavoriteListSummary) => item.listId, []);
  const backgroundComponent = React.useMemo(() => <FrostedGlassBackground />, []);
  const flashListProps = React.useMemo(() => ({ numColumns: 2 }), []);

  const shellSpec = React.useMemo(
    () => ({
      overlayKey: 'bookmarks' as const,
      snapPoints,
      initialSnapPoint: 'expanded' as const,
      style: overlaySheetStyles.container,
      onSnapStart,
      onSnapChange,
      dismissThreshold,
      preventSwipeDismiss: true,
    }),
    [dismissThreshold, onSnapChange, onSnapStart, snapPoints]
  );

  const sceneSurface = React.useMemo(
    () =>
      ({
        surfaceKind: 'list' as const,
        data: lists,
        renderItem: renderListTile,
        keyExtractor,
        estimatedItemSize: 220,
        contentContainerStyle: [
          styles.scrollContent,
          {
            paddingBottom: contentBottomPadding,
          },
        ],
        ListHeaderComponent: listHeaderComponent,
        ListEmptyComponent: listEmptyComponent,
        bounces: false,
        alwaysBounceVertical: false,
        overScrollMode: 'never' as const,
        backgroundComponent,
        contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
        headerComponent,
        flashListProps,
      }) as BottomSheetSceneSurfaceProps<unknown>,
    [
      backgroundComponent,
      contentBottomPadding,
      flashListProps,
      headerComponent,
      keyExtractor,
      listEmptyComponent,
      listHeaderComponent,
      lists,
      renderListTile,
    ]
  );

  return React.useMemo(
    () => ({
      shellSpec,
      shellSnapRequest,
      sceneSurface,
    }),
    [sceneSurface, shellSnapRequest, shellSpec]
  );
};

export const useBookmarksPanelSpec = (
  options: UseBookmarksPanelSpecOptions
): OverlayContentSpec<FavoriteListSummary> => {
  const sceneDefinition = useBookmarksSceneDefinition(options);
  return React.useMemo(
    () => ({
      ...sceneDefinition.shellSpec,
      ...sceneDefinition.sceneSurface,
    }),
    [sceneDefinition]
  ) as OverlayContentSpec<FavoriteListSummary>;
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
  loadingState: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: TILE_SUBTEXT,
  },
});
