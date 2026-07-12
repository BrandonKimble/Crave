import { serializeDesireLinkToPath } from '../../navigation/runtime/desire-url-codec';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  ReorderableRows,
  useIsScreenReaderEnabled,
  type ReorderScrollAdapter,
} from '../../components/reorder';
import { getOverlaySceneScrollHandle } from '../sceneScrollStateRegistry';
import { acquireOverlaySheetEditLock } from '../overlaySheetEditLockRuntime';
import { Text } from '../../components';
import { announceFailureIfOnline, showAppModal } from '../../components/app-modal-store';
import { SegmentedToggle } from '../../components/SegmentedToggle';
import { colors as themeColors } from '../../constants/theme';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
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
const SEGMENT_TEXT = themeColors.textBody;
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

const BOOKMARK_LIST_TYPE_OPTIONS = [
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'dish', label: 'Dishes' },
] as const satisfies readonly { value: FavoriteListType; label: string }[];

// ─── Edit mode (page-registry §8.11 — home half) ────────────────────────────────────
type BookmarksSortMode = 'recent' | 'custom';

const BOOKMARK_SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'custom', label: 'Custom' },
] as const satisfies readonly { value: BookmarksSortMode; label: string }[];

const EDIT_ROW_HEIGHT = 64;
const STRIP_MORPH_MS = 240;

/** System default lists (§8.7) sort FIRST and are pinned (not draggable) in edit mode. */
const sortListsForDisplay = (
  lists: readonly FavoriteListSummary[],
  sortMode: BookmarksSortMode
): FavoriteListSummary[] => {
  const system = lists
    .filter((list) => list.systemKind != null)
    .sort((a, b) => a.position - b.position);
  const user = lists.filter((list) => list.systemKind == null);
  const sortedUser =
    sortMode === 'custom'
      ? [...user].sort((a, b) => a.position - b.position)
      : [...user].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return [...system, ...sortedUser];
};

type BookmarksEditSession = {
  /** Full ordered listIds (system rows first — the pinned prefix). */
  order: readonly string[];
  /** Undo/Redo — in-memory order-history stack for THIS edit session. */
  history: readonly (readonly string[])[];
  historyIndex: number;
};

const applyMove = (order: readonly string[], from: number, to: number): string[] => {
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

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

// ─── §8.14: the pinned synthetic ALL tile (one per side, above the system lists) ─────
// Virtual union of every list on this side — opens listDetail with the virtual id
// ('all:restaurants' / 'all:dishes'); no stored row, never editable, never draggable.
type BookmarksAllTileProps = {
  listType: FavoriteListType;
  onPress: (listType: FavoriteListType) => void;
};

const BookmarksAllTile = React.memo(({ listType, onPress }: BookmarksAllTileProps) => (
  <Pressable
    onPress={() => onPress(listType)}
    accessibilityRole="button"
    accessibilityLabel={listType === 'restaurant' ? 'All restaurants' : 'All dishes'}
    testID="bookmarks-all-tile"
    style={({ pressed }) => [styles.allTile, pressed && styles.tilePressed]}
  >
    <View style={styles.allTileIcon}>
      <Feather name="layers" size={18} color={TILE_TEXT} />
    </View>
    <View style={styles.allTileText}>
      <Text variant="body" weight="semibold" style={styles.tileTitle} numberOfLines={1}>
        {listType === 'restaurant' ? 'All restaurants' : 'All dishes'}
      </Text>
      <Text variant="caption" style={styles.previewEmpty}>
        Everything you saved, in one place
      </Text>
    </View>
    <Feather name="chevron-right" size={18} color={SEGMENT_TEXT} />
  </Pressable>
));

BookmarksAllTile.displayName = 'BookmarksAllTile';

// ─── §8.11: the toggle strip IS the edit chrome ─────────────────────────────────────
// Two layered strips in one clipped viewport. Tapping Edit slides the normal strip
// fully out RIGHT while the edit-mode strip [Cancel | Undo Redo | Save] slides in
// under it; leaving edit reverses the morph. The Edit chip itself slides in
// immediately LEFT of the sort toggle when (and only when) sort = Custom.
type BookmarksToggleStripProps = {
  listType: FavoriteListType;
  onSelectListType: (value: FavoriteListType) => void;
  sortMode: BookmarksSortMode;
  onSortModeChange: (value: BookmarksSortMode) => void;
  isEditing: boolean;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveEdit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSaving: boolean;
};

const BookmarksToggleStrip = React.memo(
  ({
    listType,
    onSelectListType,
    sortMode,
    onSortModeChange,
    isEditing,
    onEnterEdit,
    onCancelEdit,
    onUndo,
    onRedo,
    onSaveEdit,
    canUndo,
    canRedo,
    isSaving,
  }: BookmarksToggleStripProps) => {
    const { width: windowWidth } = useWindowDimensions();
    const [stripWidth, setStripWidth] = React.useState(windowWidth);
    const morphProgress = useSharedValue(0);
    React.useEffect(() => {
      morphProgress.value = withTiming(isEditing ? 1 : 0, { duration: STRIP_MORPH_MS });
    }, [isEditing, morphProgress]);

    const normalStripStyle = useAnimatedStyle(
      () => ({
        transform: [{ translateX: morphProgress.value * stripWidth }],
      }),
      [stripWidth]
    );
    const editStripStyle = useAnimatedStyle(
      () => ({
        transform: [{ translateX: (morphProgress.value - 1) * stripWidth }],
      }),
      [stripWidth]
    );

    return (
      <View
        style={styles.stripViewport}
        onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[styles.stripRow, normalStripStyle]}
          pointerEvents={isEditing ? 'none' : 'auto'}
        >
          {sortMode === 'custom' ? (
            <Animated.View
              entering={FadeIn.duration(STRIP_MORPH_MS)}
              exiting={FadeOut.duration(120)}
              layout={LinearTransition.duration(STRIP_MORPH_MS)}
            >
              <Pressable
                onPress={onEnterEdit}
                accessibilityRole="button"
                accessibilityLabel="Edit list order"
                style={styles.editChip}
                testID="bookmarks-edit-toggle"
              >
                <Feather name="edit-2" size={14} color="#0f172a" />
                <Text variant="caption" weight="semibold" style={styles.editChipText}>
                  Edit
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}
          <Animated.View
            style={styles.stripSegment}
            layout={LinearTransition.duration(STRIP_MORPH_MS)}
          >
            <SegmentedToggle
              options={BOOKMARK_SORT_OPTIONS}
              value={sortMode}
              onChange={onSortModeChange}
              accessibilityLabel="Sort lists"
              testID="bookmarks-sort-toggle"
            />
          </Animated.View>
          <Animated.View
            style={styles.stripSegment}
            layout={LinearTransition.duration(STRIP_MORPH_MS)}
          >
            <SegmentedToggle
              options={BOOKMARK_LIST_TYPE_OPTIONS}
              value={listType}
              onChange={onSelectListType}
              accessibilityLabel="Toggle between restaurant and dish lists"
              testID="bookmarks-list-type-toggle"
            />
          </Animated.View>
        </Animated.View>
        <Animated.View
          style={[styles.stripRow, styles.stripRowOverlay, editStripStyle]}
          pointerEvents={isEditing ? 'auto' : 'none'}
        >
          <Pressable
            onPress={onCancelEdit}
            accessibilityRole="button"
            accessibilityLabel="Cancel reordering"
            style={styles.editStripButton}
            testID="bookmarks-edit-cancel"
          >
            <Text variant="caption" weight="semibold" style={styles.editStripCancelText}>
              Cancel
            </Text>
          </Pressable>
          <View style={styles.editStripMiddle}>
            <Pressable
              onPress={onUndo}
              disabled={!canUndo}
              accessibilityRole="button"
              accessibilityLabel="Undo move"
              hitSlop={6}
              style={styles.editStripIconButton}
              testID="bookmarks-edit-undo"
            >
              <Feather name="rotate-ccw" size={18} color={canUndo ? '#0f172a' : '#cbd5e1'} />
            </Pressable>
            <Pressable
              onPress={onRedo}
              disabled={!canRedo}
              accessibilityRole="button"
              accessibilityLabel="Redo move"
              hitSlop={6}
              style={styles.editStripIconButton}
              testID="bookmarks-edit-redo"
            >
              <Feather name="rotate-cw" size={18} color={canRedo ? '#0f172a' : '#cbd5e1'} />
            </Pressable>
          </View>
          <Pressable
            onPress={onSaveEdit}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save list order"
            style={styles.editStripSave}
            testID="bookmarks-edit-save"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text variant="caption" weight="semibold" style={styles.editStripSaveText}>
                Save
              </Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    );
  }
);

BookmarksToggleStrip.displayName = 'BookmarksToggleStrip';

// ─── §8.11: the 2-column grid LINEARIZES to one column in edit mode ─────────────────
type BookmarksEditListProps = {
  rows: readonly FavoriteListSummary[];
  pinnedCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange: (isDragging: boolean) => void;
  accessibilityMode: boolean;
};

const BookmarksEditList = React.memo(
  ({
    rows,
    pinnedCount,
    onReorder,
    onDragStateChange,
    accessibilityMode,
  }: BookmarksEditListProps) => {
    // Edge auto-scroll drives the SHARED sheet scroll container through the
    // scene-scroll-handle registry seam (the mounted body does not own its scroller).
    const scrollAdapter = React.useMemo<ReorderScrollAdapter | null>(() => {
      const handle = getOverlaySceneScrollHandle('bookmarks');
      if (handle == null) {
        return null;
      }
      return {
        scrollOffset: handle.scrollOffset,
        scrollBy: (dy: number) => {
          handle.scrollTo(Math.max(0, handle.scrollOffset.value + dy), false);
        },
      };
    }, []);

    const renderRowContent = React.useCallback(
      (item: FavoriteListSummary, context: { isDraggable: boolean; isActiveDrag: boolean }) => (
        <View
          style={[
            styles.editRow,
            !context.isDraggable && styles.editRowPinned,
            context.isActiveDrag && styles.editRowActive,
          ]}
        >
          <View style={styles.editRowText}>
            <Text variant="body" weight="semibold" style={styles.tileTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="caption" style={styles.previewEmpty}>
              {item.itemCount === 1 ? '1 item' : `${item.itemCount} items`}
            </Text>
          </View>
          {!context.isDraggable ? (
            <Feather name="lock" size={14} color="#94a3b8" style={styles.editRowLock} />
          ) : null}
        </View>
      ),
      []
    );

    return (
      <ReorderableRows
        items={rows}
        keyExtractor={(item) => item.listId}
        rowHeight={EDIT_ROW_HEIGHT}
        pinnedLeadingCount={pinnedCount}
        renderRowContent={renderRowContent}
        onReorder={onReorder}
        onDragStateChange={onDragStateChange}
        accessibilityMode={accessibilityMode}
        scrollAdapter={scrollAdapter}
        testIDPrefix="bookmarks-edit"
      />
    );
  }
);

BookmarksEditList.displayName = 'BookmarksEditList';

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
  stripProps: BookmarksToggleStripProps;
};

const BookmarksListHeader = React.memo(
  ({
    sceneReady,
    formState,
    onOpenCreateForm,
    onResetForm,
    onNameChange,
    onDescriptionChange,
    onVisibilityChange,
    onSave,
    stripProps,
  }: BookmarksListHeaderProps) =>
    sceneReady ? (
      <View>
        <View style={styles.segmentRow}>
          <BookmarksToggleStrip {...stripProps} />
        </View>
        {stripProps.isEditing ? null : (
          <BookmarksFormPanel
            formState={formState}
            onOpenCreateForm={onOpenCreateForm}
            onResetForm={onResetForm}
            onNameChange={onNameChange}
            onDescriptionChange={onDescriptionChange}
            onVisibilityChange={onVisibilityChange}
            onSave={onSave}
          />
        )}
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
  onOpenAll: (listType: FavoriteListType) => void;
  stripProps: BookmarksToggleStripProps;
  editListProps: BookmarksEditListProps | null;
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
    onOpenAll,
    stripProps,
    editListProps,
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
        stripProps={stripProps}
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
      editListProps != null ? (
        // §8.11 edit mode: the 2-up grid linearizes to ONE draggable column.
        <BookmarksEditList {...editListProps} />
      ) : !sceneReady || isListsLoading ? (
        // The real grid inherits its 20px horizontal inset from the body transport's
        // contentContainer, so the skeleton holes must NOT re-inset (insetX={0}).
        <SceneLoadingSurface rowType="tile" insetX={0} />
      ) : lists.length ? (
        <View style={styles.gridList}>
          <BookmarksAllTile listType={listType} onPress={onOpenAll} />
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
    const executeEntityRefAction = useEntityRefActionExecutor();
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

    // ─── §8.11 edit mode state ────────────────────────────────────────────────────
    const { promoteActiveSheet, pushRoute } = useAppOverlayRouteController();
    const [sortMode, setSortMode] = React.useState<BookmarksSortMode>('recent');
    const [editSession, setEditSession] = React.useState<BookmarksEditSession | null>(null);
    const [isSavingOrder, setIsSavingOrder] = React.useState(false);
    const isScreenReaderEnabled = useIsScreenReaderEnabled();
    const isEditing = editSession != null;

    const sortedLists = React.useMemo(
      () => sortListsForDisplay(lists, sortMode),
      [lists, sortMode]
    );
    const listsById = React.useMemo(() => {
      const byId = new Map<string, FavoriteListSummary>();
      for (const list of lists) {
        byId.set(list.listId, list);
      }
      return byId;
    }, [lists]);

    const enterEditMode = React.useCallback(() => {
      const baseline = sortListsForDisplay(lists, 'custom').map((list) => list.listId);
      setEditSession({ order: baseline, history: [baseline], historyIndex: 0 });
      // §8.11: simultaneously the sheet auto-glides to the TOP snap if not there.
      promoteActiveSheet({ snap: 'expanded' });
    }, [lists, promoteActiveSheet]);

    // §8.11: while editing, the sheet is edit-LOCKED to expanded — swipe-down rubber-bands
    // and springs back instead of collapsing. Acquired from this effect so the cleanup
    // clears the lock on BOTH edit-exit (Save/Cancel) and scene unmount.
    React.useEffect(() => {
      if (!isEditing) {
        return undefined;
      }
      return acquireOverlaySheetEditLock('bookmarks-edit');
    }, [isEditing]);

    const exitEditMode = React.useCallback(() => {
      setEditSession(null);
      setIsSavingOrder(false);
    }, []);

    // LIVE reorder (fires per slot-crossing during a drag, and per-press in the
    // accessibility path). Applies the move but does NOT push history — history
    // commits once per completed gesture (drag end / a11y press below).
    const handleReorder = React.useCallback((fromIndex: number, toIndex: number) => {
      setEditSession((session) => {
        if (session == null || fromIndex === toIndex) {
          return session;
        }
        return { ...session, order: applyMove(session.order, fromIndex, toIndex) };
      });
    }, []);

    const commitHistoryEntry = React.useCallback(() => {
      setEditSession((session) => {
        if (session == null) {
          return session;
        }
        const settled = session.history[session.historyIndex];
        if (settled != null && settled.join(' ') === session.order.join(' ')) {
          return session; // no net change — nothing to record
        }
        const truncated = session.history.slice(0, session.historyIndex + 1);
        return {
          ...session,
          history: [...truncated, session.order],
          historyIndex: truncated.length,
        };
      });
    }, []);

    const handleDragStateChange = React.useCallback(
      (isDragging: boolean) => {
        if (isDragging) {
          // The edit-lock (acquired above) pins the sheet at expanded for the whole edit
          // session, so no promote-on-lift re-assert is needed — the sheet cannot drift.
          return;
        }
        commitHistoryEntry();
      },
      [commitHistoryEntry]
    );

    // Accessibility path: each button press is one complete move — commit immediately.
    const handleAccessibleReorder = React.useCallback(
      (fromIndex: number, toIndex: number) => {
        handleReorder(fromIndex, toIndex);
        commitHistoryEntry();
      },
      [commitHistoryEntry, handleReorder]
    );

    const handleUndo = React.useCallback(() => {
      setEditSession((session) => {
        if (session == null || session.historyIndex === 0) {
          return session;
        }
        const nextIndex = session.historyIndex - 1;
        return { ...session, historyIndex: nextIndex, order: session.history[nextIndex] };
      });
    }, []);

    const handleRedo = React.useCallback(() => {
      setEditSession((session) => {
        if (session == null || session.historyIndex >= session.history.length - 1) {
          return session;
        }
        const nextIndex = session.historyIndex + 1;
        return { ...session, historyIndex: nextIndex, order: session.history[nextIndex] };
      });
    }, []);

    const handleSaveOrder = React.useCallback(async () => {
      if (editSession == null || isSavingOrder) {
        return;
      }
      setIsSavingOrder(true);
      try {
        // Persist via the existing home-order path (no batch endpoint exists for list
        // positions): one PATCH per USER list whose position changed, in parallel.
        // System lists keep their pinned server positions untouched.
        const updates = editSession.order
          .map((listId, index) => ({ list: listsById.get(listId), position: index }))
          .filter(
            (entry): entry is { list: FavoriteListSummary; position: number } =>
              entry.list != null &&
              entry.list.systemKind == null &&
              entry.list.position !== entry.position
          );
        await Promise.all(
          updates.map(({ list, position }) =>
            favoriteListsService.updatePosition(list.listId, position)
          )
        );
      } catch {
        setIsSavingOrder(false);
        announceFailureIfOnline();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      setSortMode('custom');
      exitEditMode();
    }, [editSession, exitEditMode, isSavingOrder, listsById, queryClient]);

    const stripProps = React.useMemo<BookmarksToggleStripProps>(
      () => ({
        listType,
        onSelectListType: (value: FavoriteListType) => setListType(value),
        sortMode,
        onSortModeChange: setSortMode,
        isEditing,
        onEnterEdit: enterEditMode,
        onCancelEdit: exitEditMode, // Cancel restores the pre-edit order by discarding the session
        onUndo: handleUndo,
        onRedo: handleRedo,
        onSaveEdit: () => void handleSaveOrder(),
        canUndo: editSession != null && editSession.historyIndex > 0,
        canRedo: editSession != null && editSession.historyIndex < editSession.history.length - 1,
        isSaving: isSavingOrder,
      }),
      [
        editSession,
        enterEditMode,
        exitEditMode,
        handleRedo,
        handleSaveOrder,
        handleUndo,
        isEditing,
        isSavingOrder,
        listType,
        sortMode,
      ]
    );

    const editListProps = React.useMemo<BookmarksEditListProps | null>(() => {
      if (editSession == null) {
        return null;
      }
      const rows = editSession.order
        .map((listId) => listsById.get(listId))
        .filter((list): list is FavoriteListSummary => list != null);
      return {
        rows,
        pinnedCount: rows.filter((list) => list.systemKind != null).length,
        onReorder: isScreenReaderEnabled ? handleAccessibleReorder : handleReorder,
        onDragStateChange: handleDragStateChange,
        accessibilityMode: isScreenReaderEnabled,
      };
    }, [
      editSession,
      handleAccessibleReorder,
      handleDragStateChange,
      handleReorder,
      isScreenReaderEnabled,
      listsById,
    ]);

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
      try {
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
      } catch {
        // The form stays open with the user's input intact — the uniform modal announces.
        announceFailureIfOnline();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      resetForm();
    }, [formState, listType, queryClient, resetForm]);

    const handleOpenAll = React.useCallback(
      (side: FavoriteListType) => {
        pushRoute('listDetail', {
          listId: side === 'restaurant' ? 'all:restaurants' : 'all:dishes',
        });
      },
      [pushRoute]
    );

    const handleListPress = React.useCallback(
      (list: FavoriteListSummary) => {
        // S-D.2: the tap's meaning resolves through THE entity policy (list tap = the
        // listDetail child push). The byte-identical profile-panel copy routes the same way.
        executeEntityRefAction({
          entityId: list.listId,
          entityType: 'list',
          label: list.name,
        });
      },
      [executeEntityRefAction]
    );

    const handleShare = React.useCallback(async (list: FavoriteListSummary) => {
      try {
        const result = await favoriteListsService.enableShare(list.listId);
        const shareUrl = `${SHARE_BASE_URL}${serializeDesireLinkToPath({ kind: 'sharedList', shareSlug: result.shareSlug })}`;
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
        try {
          await favoriteListsService.update(list.listId, { visibility: nextVisibility });
        } catch {
          announceFailureIfOnline();
          return;
        }
        await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      },
      [queryClient]
    );

    const handleDelete = React.useCallback(
      async (list: FavoriteListSummary) => {
        try {
          await favoriteListsService.remove(list.listId);
        } catch {
          announceFailureIfOnline();
          return;
        }
        await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      },
      [queryClient]
    );

    const openListMenu = React.useCallback(
      (list: FavoriteListSummary) => {
        showAppModal({
          title: list.name,
          actions: [
            {
              label: 'Edit',
              onPress: () => openEditForm(list),
            },
            {
              label: 'Share',
              onPress: () => void handleShare(list),
            },
            {
              label: list.visibility === 'public' ? 'Make Private' : 'Make Public',
              onPress: () => void handleToggleVisibility(list),
            },
            {
              label: 'Delete',
              style: 'destructive',
              onPress: () => void handleDelete(list),
            },
            {
              label: 'Cancel',
              style: 'cancel',
            },
          ],
        });
      },
      [handleDelete, handleShare, handleToggleVisibility, openEditForm]
    );

    const dataSurface = (
      <BookmarksSceneBody
        sceneReady={sceneReady}
        listType={listType}
        formState={formState}
        lists={sortedLists}
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
        onOpenAll={handleOpenAll}
        stripProps={stripProps}
        editListProps={editListProps}
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

// Module-scope registration (house pattern — origin-scene-live-state-registry).
registerPersistentHeaderDescriptor('bookmarks', {
  Title: BookmarksPersistentHeaderTitle,
  Action: BookmarksPersistentHeaderAction,
});

const styles = StyleSheet.create({
  // FLUSH LAW (2026-07-11): content starts at the header's bottom edge — no top padding.
  sceneBody: {},
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
  segmentRow: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 12,
  },
  stripViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stripRowOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  stripSegment: {
    flex: 1,
  },
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    backgroundColor: '#ffffff',
  },
  editChipText: {
    color: TILE_TEXT,
  },
  editStripButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  editStripCancelText: {
    color: TILE_SUBTEXT,
  },
  editStripMiddle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  editStripIconButton: {
    padding: 6,
  },
  editStripSave: {
    backgroundColor: TILE_TEXT,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    minWidth: 64,
    alignItems: 'center',
  },
  editStripSaveText: {
    color: '#ffffff',
  },
  editRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TILE_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    paddingHorizontal: 12,
    marginVertical: 4,
    minHeight: EDIT_ROW_HEIGHT - 8,
  },
  editRowPinned: {
    backgroundColor: '#f1f5f9',
    borderStyle: 'dashed',
  },
  editRowActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  editRowText: {
    flex: 1,
    gap: 2,
  },
  editRowLock: {
    marginLeft: 8,
  },
  gridList: {
    gap: GRID_GAP,
  },
  allTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: TILE_BG,
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  allTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  allTileText: {
    flex: 1,
    gap: 2,
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
