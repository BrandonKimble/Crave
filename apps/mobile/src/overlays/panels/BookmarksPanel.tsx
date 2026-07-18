import { serializeDesireLinkToPath } from '../../navigation/runtime/desire-url-codec';
import React from 'react';
import { type LayoutChangeEvent, Pressable, Share, StyleSheet, View } from 'react-native';
import {
  ChevronRight,
  Ellipsis,
  Eye,
  EyeOff,
  GripVertical,
  Images,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useQueryClient } from '@tanstack/react-query';
import {
  SelectorChip,
  Text,
  toggleOptionSelector,
  useOptionSelectorOpenKey,
} from '../../components';
import { ToggleStrip } from '../../toggles/ToggleStrip';
import {
  clearToggleStripCacheScrollX,
  createToggleStripCacheSeat,
} from '../../toggles/toggle-strip-layout-cache';
import { buildEditModeActionRow } from '../../toggles/EditModeActionRow';
import {
  useBookmarksHomeControlsStore,
  type BookmarksEditSeat,
  type BookmarksSortMode,
} from './runtime/bookmarks-home-controls-store';
import { commitBookmarksHomeSliceToggle } from './runtime/bookmarks-home-content-toggle';
import { announceFailureIfOnline, showAppModal } from '../../components/app-modal-store';
import { SegmentedToggle } from '../../components/SegmentedToggle';
import { showListEdit } from '../../components/list-edit-store';
import { colors as themeColors } from '../../constants/theme';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
import { useSystemStatusStore } from '../../store/systemStatusStore';
import {
  favoriteListsService,
  type FavoriteListSummary,
  type FavoriteListType,
} from '../../services/favorite-lists';
import { useFavoriteLists, favoriteListKeys } from '../../hooks/use-favorite-lists';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { registerHeaderCreateAction } from '../../navigation/runtime/header-nav-action-registry';
import { useBottomSheetSceneStackBodyRenderActivity } from '../BottomSheetSceneStackBodyActivityContext';
import { useSearchOverlayProfilerRender } from '../SearchOverlayProfilerContext';
import { useOriginSceneScrollPublication } from '../useOriginSceneScrollPublication';
import { useEditModeSession } from '../edit-mode-session';
import { getOverlaySceneScrollHandle } from '../sceneScrollStateRegistry';
import {
  ReorderableGrid,
  useIsScreenReaderEnabled,
  type ReorderGridRenderContext,
  type ReorderScrollAdapter,
} from '../../components/reorder';
import { PageBodyShell } from '../PageBodyShell';
import {
  resolvePageBodyListState,
  type PageBodyState,
  type PageCollectionBodySpec,
} from '../page-body-contract';

const GRID_GAP = 12;
const TILE_RADIUS = 16;
const TILE_BORDER = '#e2e8f0';
const TILE_BG = '#f8fafc';
const TILE_TEXT = '#0f172a';
const TILE_SUBTEXT = themeColors.textBody;
const SEGMENT_TEXT = themeColors.textBody;
// §1.2 tile anatomy: 2x2 gallery (overall 4:3) + a fixed footer — a UNIFORM tile
// height by construction, which is exactly what the edit grid's slot math needs.
const TILE_GALLERY_RATIO = 0.75;
const TILE_FOOTER_HEIGHT = 40;
const TILE_GALLERY_CELL_GAP = 2;
const TILE_PLACEHOLDER_BG = '#eef1f5';
const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://crave-search.app';

const BOOKMARK_LIST_TYPE_OPTIONS = [
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'dish', label: 'Dishes' },
] as const satisfies readonly { value: FavoriteListType; label: string }[];

// ─── Edit mode (page-registry §8.11 — home half; wave-3 §1.1 RESTORED) ──────────────
// The owner never wanted home edit deleted — list CONTENTS aren't editable from home,
// but reordering the LISTS THEMSELVES is. The session is the useEditModeSession
// PRIMITIVE re-declared here with 2-col tile-grid geometry (ReorderableGrid); the
// data surface declares it and publishes the edit seat the header strip renders.

// Wave-3 §1.1 vocabulary: "My ranking" replaces "Custom rank" EVERYWHERE.
const BOOKMARK_SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'custom', label: 'My ranking' },
] as const satisfies readonly { value: BookmarksSortMode; label: string }[];
const BOOKMARK_SORT_LABEL_BY_VALUE: Record<BookmarksSortMode, string> = {
  recent: 'Recent',
  custom: 'My ranking',
};

/** Wave-2 §2: system defaults are REGULAR lists — one uniform ordering, no pinned prefix. */
const sortListsForDisplay = (
  lists: readonly FavoriteListSummary[],
  sortMode: BookmarksSortMode
): FavoriteListSummary[] =>
  sortMode === 'custom'
    ? [...lists].sort((a, b) => a.position - b.position)
    : [...lists].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

const chunkFavoriteLists = (
  lists: readonly FavoriteListSummary[]
): readonly (readonly FavoriteListSummary[])[] => {
  const rows: FavoriteListSummary[][] = [];
  for (let index = 0; index < lists.length; index += 2) {
    rows.push(lists.slice(index, index + 2));
  }
  return rows;
};

// ─── §1.2: the home-tile 2x2 GALLERY (tileImages, TL(0)→TR(1)→BL(2)→BR(3)) ──────────
// Sparse slots render as quiet placeholders; the API fills from the top-left.
const TILE_GALLERY_SLOTS = [0, 1, 2, 3] as const;

const BookmarksTileGallery = React.memo(({ item }: { item: FavoriteListSummary }) => {
  const bySlot = new Map((item.tileImages ?? []).map((image) => [image.slot, image]));
  return (
    <View style={styles.tileGallery} accessibilityLabel={`${item.name} photos`}>
      {[TILE_GALLERY_SLOTS.slice(0, 2), TILE_GALLERY_SLOTS.slice(2)].map((row, rowIndex) => (
        <View key={`gallery-row-${rowIndex}`} style={styles.tileGalleryRow}>
          {row.map((slot) => {
            const image = bySlot.get(slot);
            return image ? (
              <Image
                key={`slot-${slot}`}
                source={{ uri: image.thumbUrl }}
                recyclingKey={image.photoId}
                transition={180}
                contentFit="cover"
                style={styles.tileGalleryCell}
              />
            ) : (
              <View
                key={`slot-${slot}`}
                style={[styles.tileGalleryCell, styles.tileGalleryEmpty]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
});

BookmarksTileGallery.displayName = 'BookmarksTileGallery';

type BookmarksListTileProps = {
  item: FavoriteListSummary;
  onPress: (list: FavoriteListSummary) => void;
  onOpenMenu: (list: FavoriteListSummary) => void;
  /** Fixed tile height (uniform grid geometry — read AND edit render the same tile). */
  tileHeight: number;
  /** Edit mode: the instant-lift handle gesture seated where the ellipsis lives. */
  editHandleGesture?: ReorderGridRenderContext['handleGesture'];
  isActiveDrag?: boolean;
};

const BookmarksListTile = React.memo(
  ({
    item,
    onPress,
    onOpenMenu,
    tileHeight,
    editHandleGesture = null,
    isActiveDrag = false,
  }: BookmarksListTileProps) => {
    const isEditingTile = editHandleGesture != null;
    // Edit mode: the ellipsis seat becomes the grab handle (§1.1 — center-right is
    // the handle's home, wave-3 §3.2's freed region on cards).
    // Ellipsis ↔ handle CROSSFADE, synced to the strip morph tempo (240ms — the
    // leg-13 "ellipsis fade sync" item): keyed conditional siblings fade in/out via
    // layout animations, so the seat swap rides the same beat as the action row.
    const affordance = isEditingTile ? (
      <Reanimated.View key="handle" entering={FadeIn.duration(240)} exiting={FadeOut.duration(240)}>
        <GestureDetector gesture={editHandleGesture}>
          <View
            style={styles.tileMenuButton}
            accessibilityLabel="Drag to reorder"
            testID={`bookmarks-tile-handle-${item.listId}`}
          >
            <GripVertical size={18} color={SEGMENT_TEXT} />
          </View>
        </GestureDetector>
      </Reanimated.View>
    ) : (
      <Reanimated.View key="menu" entering={FadeIn.duration(240)} exiting={FadeOut.duration(240)}>
        <Pressable
          onPress={() => onOpenMenu(item)}
          accessibilityRole="button"
          accessibilityLabel="List actions"
          hitSlop={8}
          style={styles.tileMenuButton}
        >
          <Ellipsis size={18} color={SEGMENT_TEXT} />
        </Pressable>
      </Reanimated.View>
    );

    return (
      <Pressable
        onPress={() => onPress(item)}
        disabled={isEditingTile}
        style={({ pressed }) => [
          styles.tileWrapper,
          { height: tileHeight },
          pressed && !isEditingTile && styles.tilePressed,
          isActiveDrag && styles.tileActiveDrag,
        ]}
      >
        <BookmarksTileGallery item={item} />
        <View style={styles.tileFooter}>
          <Text variant="body" weight="semibold" style={styles.tileTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {affordance}
        </View>
      </Pressable>
    );
  }
);

BookmarksListTile.displayName = 'BookmarksListTile';

// ─── §8.14: the pinned synthetic ALL tile (one per side, above the system lists) ─────
type BookmarksAllTileProps = {
  listType: FavoriteListType;
  onPress: (listType: FavoriteListType) => void;
  /** Edit mode: rendered and pinned in place, but not a navigation target. */
  disabled?: boolean;
};

const BookmarksAllTile = React.memo(({ listType, onPress, disabled }: BookmarksAllTileProps) => (
  <Pressable
    onPress={() => onPress(listType)}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={listType === 'restaurant' ? 'All restaurants' : 'All dishes'}
    testID="bookmarks-all-tile"
    style={({ pressed }) => [styles.allTile, pressed && !disabled && styles.tilePressed]}
  >
    <Text variant="body" weight="semibold" style={styles.allTileTitle} numberOfLines={1}>
      {listType === 'restaurant' ? 'All restaurants' : 'All dishes'}
    </Text>
    <ChevronRight size={18} color={SEGMENT_TEXT} />
  </Pressable>
));

BookmarksAllTile.displayName = 'BookmarksAllTile';

// ─── The home strip (leg 3 header mount): [Edit] · Sort · Restaurants/Dishes ────────
// Wave-3 §1.1/§2.1: the Edit chip is BACK as a STRIP CITIZEN — a keyed conditional
// child, so the engine's late-mount width-grow entry animates it in (pushing its
// siblings by real layout — the snap was the chip not being a citizen at all), and
// it reads as a CLEAN CUTOUT (no pill-in-a-window). The action row while editing is
// the shared edit action row against the body-published seat.
const bookmarksStripCacheSeat = createToggleStripCacheSeat();

const BookmarksEditChip = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="Edit list order"
    style={styles.editChip}
    testID="bookmarks-edit-toggle"
  >
    <Pencil size={14} color={TILE_TEXT} strokeWidth={2} />
    <Text variant="caption" weight="semibold" style={styles.editChipText}>
      Edit
    </Text>
  </Pressable>
);

const BookmarksHomeStrip = React.memo(() => {
  const listType = useBookmarksHomeControlsStore((state) => state.listType);
  const sortMode = useBookmarksHomeControlsStore((state) => state.sortMode);
  const setListType = useBookmarksHomeControlsStore((state) => state.setListType);
  const setSortMode = useBookmarksHomeControlsStore((state) => state.setSortMode);
  const editSeat = useBookmarksHomeControlsStore((state) => state.editSeat);

  // Owner decision (leg 3): scrollX resets on re-present — the header strip unmounts
  // exactly when the scene stops being presented; layout stays warm.
  React.useEffect(() => () => clearToggleStripCacheScrollX(bookmarksStripCacheSeat), []);

  const optionSelectorOpenKey = useOptionSelectorOpenKey();

  return (
    <ToggleStrip
      placement="header"
      backdrop="chrome-frost"
      cacheSeat={bookmarksStripCacheSeat}
      actionRow={
        editSeat != null && editSeat.isEditing
          ? buildEditModeActionRow({
              onCancelEdit: editSeat.cancelEdit,
              onUndo: editSeat.undo,
              onRedo: editSeat.redo,
              onSaveEdit: editSeat.saveEdit,
              canUndo: editSeat.canUndo,
              canRedo: editSeat.canRedo,
              hasEverEdited: editSeat.hasEverEdited,
              isSaving: editSeat.isSaving,
              testIDPrefix: 'bookmarks',
            })
          : null
      }
      actionProgress={editSeat?.actionProgress}
      testID="bookmarks-strip"
    >
      {editSeat != null && editSeat.canEnterEdit && sortMode === 'custom' ? (
        <BookmarksEditChip key="edit" onPress={editSeat.enterEdit} />
      ) : null}
      <SelectorChip
        key="sort"
        label={BOOKMARK_SORT_LABEL_BY_VALUE[sortMode]}
        active={sortMode !== 'recent'}
        expanded={optionSelectorOpenKey === 'bookmarks-sort'}
        onPress={() =>
          toggleOptionSelector({
            key: 'bookmarks-sort',
            title: 'Sort',
            options: BOOKMARK_SORT_OPTIONS,
            value: sortMode,
            onSelect: (value) => {
              // Leg 4: the store write IS the synchronous re-slice; the content seam
              // (settleMs 0) adds the uniform declaration + gap instrumentation.
              setSortMode(value);
              commitBookmarksHomeSliceToggle('sort_mode');
            },
            testID: 'bookmarks-sort-sheet',
          })
        }
        accessibilityLabel="Sort lists"
        testID="bookmarks-sort-toggle"
      />
      <SegmentedToggle
        key="list-type"
        options={BOOKMARK_LIST_TYPE_OPTIONS}
        value={listType}
        onChange={(value) => {
          setListType(value);
          commitBookmarksHomeSliceToggle('list_type');
        }}
        accessibilityLabel="Toggle between restaurant and dish lists"
        testID="bookmarks-list-type-toggle"
      />
    </ToggleStrip>
  );
});

BookmarksHomeStrip.displayName = 'BookmarksHomeStrip';

type BookmarksSceneBodyProps = {
  listType: FavoriteListType;
  lists: readonly FavoriteListSummary[];
  isEditing: boolean;
  editOrderedLists: readonly FavoriteListSummary[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange: (isDragging: boolean) => void;
  isScreenReaderEnabled: boolean;
  scrollAdapter: ReorderScrollAdapter | null;
  onOpenCreate: () => void;
  onListPress: (list: FavoriteListSummary) => void;
  onOpenMenu: (list: FavoriteListSummary) => void;
  onOpenAll: (listType: FavoriteListType) => void;
};

const BookmarksSceneBody = React.memo(
  ({
    listType,
    lists,
    isEditing,
    editOrderedLists,
    onReorder,
    onDragStateChange,
    isScreenReaderEnabled,
    scrollAdapter,
    onOpenCreate,
    onListPress,
    onOpenMenu,
    onOpenAll,
  }: BookmarksSceneBodyProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const listRows = React.useMemo(() => chunkFavoriteLists(lists), [lists]);

    // §2.4 bleed + §1.1 grid geometry: the grid bleeds edge-to-edge (the toggle-strip
    // law) and self-measures, so the edit grid's slot math uses the SAME cell rects
    // the read grid renders.
    const [gridWidth, setGridWidth] = React.useState(0);
    const handleGridLayout = React.useCallback((event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      setGridWidth((prev) => (Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth));
    }, []);
    const cellWidth = gridWidth > 0 ? Math.floor((gridWidth - GRID_GAP) / 2) : 0;
    const tileHeight =
      cellWidth > 0 ? Math.round(cellWidth * TILE_GALLERY_RATIO) + TILE_FOOTER_HEIGHT : 0;

    const renderEditTile = React.useCallback(
      (item: FavoriteListSummary, context: ReorderGridRenderContext) => (
        <BookmarksListTile
          item={item}
          onPress={onListPress}
          onOpenMenu={onOpenMenu}
          tileHeight={tileHeight}
          editHandleGesture={context.handleGesture}
          isActiveDrag={context.isActiveDrag}
        />
      ),
      [onListPress, onOpenMenu, tileHeight]
    );

    // THE PAGE L2: no load branches here — the shell owns pending/error/empty; this
    // component renders RESOLVED items only (present/appending by construction).
    const listContent = (
        <View onLayout={handleGridLayout}>
          <BookmarksAllTile listType={listType} onPress={onOpenAll} disabled={isEditing} />
          {isEditing && tileHeight > 0 ? (
            // §1.1: the primitive re-declared with 2-col TILE geometry — the same
            // tiles, now absolutely slotted by the grid's drag math.
            <View style={styles.editGridBlock}>
              <ReorderableGrid
                items={editOrderedLists}
                keyExtractor={(list) => list.listId}
                cellWidth={cellWidth}
                rowHeight={tileHeight}
                gap={GRID_GAP}
                columns={2}
                renderTile={renderEditTile}
                onReorder={onReorder}
                onDragStateChange={onDragStateChange}
                accessibilityMode={isScreenReaderEnabled}
                scrollAdapter={scrollAdapter}
                testIDPrefix="bookmarks-edit"
              />
            </View>
          ) : (
            <View style={styles.gridList}>
              {listRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.gridRow}>
                  {row.map((item) => (
                    <View key={item.listId} style={styles.gridCell}>
                      <BookmarksListTile
                        item={item}
                        onPress={onListPress}
                        onOpenMenu={onOpenMenu}
                        tileHeight={tileHeight > 0 ? tileHeight : 160}
                      />
                    </View>
                  ))}
                  {row.length === 1 ? <View style={styles.gridCell} /> : null}
                </View>
              ))}
            </View>
          )}
          {/* §4: the home popup form is DEAD — every create path opens the ONE
              listEdit panel. This compact row stays as the second entry point
              (owner to ratify the redundancy with the header plus). */}
          {isEditing ? null : (
            <Pressable
              onPress={onOpenCreate}
              style={styles.newListCard}
              accessibilityRole="button"
              testID="bookmarks-new-list"
            >
              <Plus size={18} color={SEGMENT_TEXT} />
              <Text variant="body" style={styles.newListText}>
                New list
              </Text>
            </Pressable>
          )}
        </View>
      );
    const profiledListContent = onProfilerRender ? (
      <React.Profiler id="BookmarksSceneBody:list" onRender={onProfilerRender}>
        {listContent}
      </React.Profiler>
    ) : (
      listContent
    );

    return <View style={styles.sceneBody}>{profiledListContent}</View>;
  }
);

BookmarksSceneBody.displayName = 'BookmarksSceneBody';

// THE CONTENT SLOT (THE PAGE L2 collection body): receives the RESOLVED lists — the
// query edge never reaches here. Interaction machinery (edit session, menus, create)
// operates on resolved data by construction.
const BookmarksContent = React.memo(({ items }: { items: readonly FavoriteListSummary[] }) => {
    const lists = items;
    const onProfilerRender = useSearchOverlayProfilerRender();
    const executeEntityRefAction = useEntityRefActionExecutor();
    const queryClient = useQueryClient();
    // Leg 3: control state (listType / sortMode) lives in the module store — the
    // header strip (chrome) writes it, this body reads it.
    const listType = useBookmarksHomeControlsStore((state) => state.listType);
    const sortMode = useBookmarksHomeControlsStore((state) => state.sortMode);
    const setSortMode = useBookmarksHomeControlsStore((state) => state.setSortMode);
    const setEditSeat = useBookmarksHomeControlsStore((state) => state.setEditSeat);

    const { promoteActiveSheet } = useAppOverlayRouteController();
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

    // ─── Wave-3 §1.1/§1b: the home edit SESSION — the ONE primitive, re-declared ────
    // onEnter promotes the sheet to FULL extension through the sanctioned seat-writing
    // lane (§1b: a NAMED product intent — the posture seat is legitimately written to
    // expanded, and exit performs NO restore; the sheet STAYS extended).
    const editSession = useEditModeSession({
      sceneKey: 'bookmarks',
      entryId: null,
      onEnter: () => promoteActiveSheet({ snap: 'expanded' }),
      discardMessage: 'Your new list order has not been saved.',
    });
    const isEditing = editSession.isEditing;
    const [isSavingOrder, setIsSavingOrder] = React.useState(false);
    const isScreenReaderEnabled = useIsScreenReaderEnabled();

    const enterEditMode = React.useCallback(() => {
      editSession.enter(sortListsForDisplay(lists, 'custom').map((list) => list.listId));
    }, [editSession, lists]);

    const exitEditMode = React.useCallback(() => {
      editSession.exit();
      setIsSavingOrder(false);
    }, [editSession]);

    React.useEffect(() => {
      if (!isEditing) {
        setIsSavingOrder(false);
      }
    }, [isEditing]);

    const editSessionRef = React.useRef(editSession);
    editSessionRef.current = editSession;
    const listsByIdRef = React.useRef(listsById);
    listsByIdRef.current = listsById;
    const handleSaveOrder = React.useCallback(async () => {
      const session = editSessionRef.current;
      if (session.order == null || isSavingOrder) {
        return;
      }
      setIsSavingOrder(true);
      try {
        // Persist via the existing home-order path (no batch endpoint for list
        // positions): one PATCH per list whose position changed, in parallel.
        // Wave-2 §2 canon: system lists are REGULAR — they move like any other.
        const updates = session.order
          .map((listId, index) => ({ list: listsByIdRef.current.get(listId), position: index }))
          .filter(
            (entry): entry is { list: FavoriteListSummary; position: number } =>
              entry.list != null && entry.list.position !== entry.position
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
    }, [exitEditMode, isSavingOrder, queryClient, setSortMode]);

    // Publish the EDIT SEAT the header strip renders (body writes, chrome reads).
    React.useEffect(() => {
      const seat: BookmarksEditSeat = {
        isEditing,
        canEnterEdit: lists.length > 0,
        canUndo: editSession.canUndo,
        canRedo: editSession.canRedo,
        hasEverEdited: editSession.hasEverEdited,
        isSaving: isSavingOrder,
        actionProgress: editSession.actionProgress,
        enterEdit: enterEditMode,
        cancelEdit: exitEditMode,
        undo: editSession.undo,
        redo: editSession.redo,
        saveEdit: () => void handleSaveOrder(),
      };
      setEditSeat(seat);
    }, [
      editSession.actionProgress,
      editSession.canRedo,
      editSession.canUndo,
      editSession.hasEverEdited,
      editSession.redo,
      editSession.undo,
      enterEditMode,
      exitEditMode,
      handleSaveOrder,
      isEditing,
      isSavingOrder,
      lists.length,
      setEditSeat,
    ]);
    React.useEffect(() => () => setEditSeat(null), [setEditSeat]);

    // Edge auto-scroll drives the SHARED sheet scroll container (scene handle seam).
    const scrollAdapter = React.useMemo<ReorderScrollAdapter | null>(() => {
      if (!isEditing) {
        return null;
      }
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
    }, [isEditing]);

    const editOrderedLists = React.useMemo<FavoriteListSummary[]>(() => {
      if (editSession.order == null) {
        return [];
      }
      return editSession.order
        .map((listId) => listsById.get(listId))
        .filter((list): list is FavoriteListSummary => list != null);
    }, [editSession.order, listsById]);

    // §4: EVERY create path opens the ONE listEdit panel (create mode carries the
    // active side). The header plus routes here via the header-create registry.
    const openCreate = React.useCallback(() => {
      showListEdit({
        mode: 'create',
        listType: useBookmarksHomeControlsStore.getState().listType,
      });
    }, []);
    React.useEffect(() => registerHeaderCreateAction('bookmarks', openCreate), [openCreate]);

    const handleOpenAll = React.useCallback(
      (side: FavoriteListType) => {
        // Wave-4 §3 (audit mouth #2): the per-side All opens through THE policy — the
        // listWorld composite (push + the list's search world), no more policy bypass.
        executeEntityRefAction({
          entityId: side === 'restaurant' ? 'all:restaurants' : 'all:dishes',
          entityType: 'list',
          label: side === 'restaurant' ? 'All restaurants' : 'All dishes',
          listType: side,
        });
      },
      [executeEntityRefAction]
    );

    const handleListPress = React.useCallback(
      (list: FavoriteListSummary) => {
        // S-D.2 + wave-4 §3: the tap's meaning resolves through THE entity policy —
        // with listType present this is the listWorld COMPOSITE (push + the list's
        // search world: map pins + choreography), the restored favorites-as-search.
        executeEntityRefAction({
          entityId: list.listId,
          entityType: 'list',
          label: list.name,
          listType: list.listType,
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

    const handleToggleUseOwnPhotos = React.useCallback(
      async (list: FavoriteListSummary) => {
        try {
          await favoriteListsService.update(list.listId, {
            useOwnPhotos: list.useOwnPhotos !== true,
          });
        } catch {
          announceFailureIfOnline();
          return;
        }
        await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
      },
      [queryClient]
    );

    const handleTogglePin = React.useCallback(
      async (list: FavoriteListSummary) => {
        try {
          await favoriteListsService.update(list.listId, { pinned: list.pinned !== true });
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

    // Wave-2 §2 ellipsis-menu restyle: left-aligned title; lucide icon + text rows,
    // no color blocks, no separators, no Cancel row (swipe/backdrop dismisses).
    // Wave-3 §4: the "Edit" row (list metadata) opens the ONE listEdit panel.
    const openListMenu = React.useCallback(
      (list: FavoriteListSummary) => {
        const isPublic = list.visibility === 'public';
        const usesOwnPhotos = list.useOwnPhotos === true;
        const isPinned = list.pinned === true;
        showAppModal({
          title: list.name,
          variant: 'menu',
          actions: [
            {
              label: 'Edit',
              icon: <Pencil size={19} color={TILE_TEXT} />,
              onPress: () =>
                showListEdit({
                  mode: 'edit',
                  listId: list.listId,
                  name: list.name,
                  description: list.description ?? null,
                  visibility: list.visibility,
                }),
            },
            {
              label: 'Share',
              icon: <Share2 size={19} color={TILE_TEXT} />,
              onPress: () => void handleShare(list),
            },
            {
              label: 'Delete',
              style: 'destructive',
              icon: <Trash2 size={19} color="#ef4444" />,
              onPress: () => void handleDelete(list),
            },
            {
              label: isPublic ? 'Remove from profile' : 'Add to profile',
              icon: isPublic ? (
                <EyeOff size={19} color={TILE_TEXT} />
              ) : (
                <Eye size={19} color={TILE_TEXT} />
              ),
              onPress: () => void handleToggleVisibility(list),
            },
            {
              label: usesOwnPhotos ? 'Use Crave photos' : 'Use your photos',
              icon: <Images size={19} color={TILE_TEXT} />,
              onPress: () => void handleToggleUseOwnPhotos(list),
            },
            {
              label: isPinned ? 'Unpin from profile' : 'Pin on profile',
              icon: isPinned ? (
                <PinOff size={19} color={TILE_TEXT} />
              ) : (
                <Pin size={19} color={TILE_TEXT} />
              ),
              onPress: () => void handleTogglePin(list),
            },
          ],
        });
      },
      [handleDelete, handleShare, handleTogglePin, handleToggleUseOwnPhotos, handleToggleVisibility]
    );

    const dataSurface = (
      <BookmarksSceneBody
        listType={listType}
        lists={sortedLists}
        isEditing={isEditing}
        editOrderedLists={editOrderedLists}
        onReorder={
          isScreenReaderEnabled ? editSession.handleAccessibleReorder : editSession.handleReorder
        }
        onDragStateChange={editSession.handleDragStateChange}
        isScreenReaderEnabled={isScreenReaderEnabled}
        scrollAdapter={scrollAdapter}
        onOpenCreate={openCreate}
        onListPress={handleListPress}
        onOpenMenu={openListMenu}
        onOpenAll={handleOpenAll}
      />
    );

    return onProfilerRender ? (
      <React.Profiler id="BookmarksContent" onRender={onProfilerRender}>
        {dataSurface}
      </React.Profiler>
    ) : (
      dataSurface
    );
});

BookmarksContent.displayName = 'BookmarksContent';

// The DECLARED empty view — only correct once the collection RESOLVES empty.
const BookmarksEmpty = () => (
  <View style={styles.emptyState}>
    <Text variant="body" style={styles.emptyText}>
      No lists yet
    </Text>
  </View>
);

// THE DECLARATION (L2): bookmarks is a COLLECTION body — the full closed enum over
// the favorites collection; the grid/edit composition owns only resolved items.
const BOOKMARKS_PAGE_BODY: PageCollectionBodySpec<FavoriteListSummary> = {
  kind: 'collection',
  scene: 'bookmarks',
  Content: BookmarksContent,
  // insetX 0: the mounted body renders inside the transport's 20px-inset container —
  // the holes must not re-inset (the double-inset jump class).
  placeholder: { count: 3, insetX: 0 },
  Empty: BookmarksEmpty,
};

// THE PAGE CONTROLLER — the query + the state derivation; slots never see the edge.
const useBookmarksPageBody = (): PageBodyState<FavoriteListSummary> => {
  const queryClient = useQueryClient();
  const { shouldSubscribeDataLane, hasActivatedExpandedContent } =
    useBottomSheetSceneStackBodyRenderActivity();
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const listType = useBookmarksHomeControlsStore((state) => state.listType);
  const queryEnabled = !isSystemUnavailable && shouldSubscribeDataLane;
  const listsQuery = useFavoriteLists({
    listType,
    enabled: queryEnabled,
    subscribed: queryEnabled,
  });
  // Retained-data law (kept from the old surface): an in-flight refetch or an errored
  // refetch with RETAINED data keeps presenting the data — pending/error only with
  // nothing to show; 'No lists yet' only once the query RESOLVES empty.
  const retainedListsRef = React.useRef<Partial<Record<FavoriteListType, FavoriteListSummary[]>>>(
    {}
  );
  const cachedLists = queryClient.getQueryData<FavoriteListSummary[]>(
    favoriteListKeys.list(listType)
  );
  const lists = listsQuery.data ?? cachedLists ?? retainedListsRef.current[listType] ?? null;
  React.useEffect(() => {
    if (listsQuery.data != null) {
      retainedListsRef.current[listType] = listsQuery.data;
    }
  }, [listType, listsQuery.data]);
  const hasData = lists != null && lists.length > 0;
  const refetchLists = React.useCallback(() => {
    void listsQuery.refetch();
  }, [listsQuery]);
  return resolvePageBodyListState<FavoriteListSummary>({
    // Activation (hasActivatedExpandedContent) is a STATE input: until the scene
    // expands the body paints the material — never a tree swap (the old dual-tree).
    isPending: !hasActivatedExpandedContent || !queryEnabled || (listsQuery.isLoading && !hasData),
    isError: listsQuery.isError && !hasData,
    what: 'your lists',
    retry: refetchLists,
    items: hasData ? lists : listsQuery.data != null ? [] : null,
  });
};

export const BookmarksMountedSceneBody = React.memo(() => {
  const onProfilerRender = useSearchOverlayProfilerRender();
  // P3 return-to-origin: publish the bookmarks scene's live scroll lane so a favorites-from-
  // bookmarks reveal captures the scroll offset to return to on dismiss.
  useOriginSceneScrollPublication('bookmarks');
  // THE PAGE L2: ONE tree, always visible — the dual-tree (full-body transition
  // skeleton OVER a display:none prewarmed body) is DELETED; the shell paints the
  // closed states in place.
  const mountedBody = <PageBodyShell spec={BOOKMARKS_PAGE_BODY} state={useBookmarksPageBody()} />;

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
      Lists
    </Text>
  </View>
));

BookmarksPersistentHeaderTitle.displayName = 'BookmarksPersistentHeaderTitle';

// Module-scope registration (house pattern — origin-scene-live-state-registry). The header
// action is the HOST-OWNED HeaderNavAction (leg 6 §4) — no per-scene Action slot.
registerPersistentHeaderDescriptor('bookmarks', {
  Title: BookmarksPersistentHeaderTitle,
  Strip: BookmarksHomeStrip,
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
  // §2.4 CORRECTION (owner 2026-07-13): the content border applies to EVERYTHING —
  // only SCROLLABLE image strips bleed past it. The grid keeps the transport inset.
  gridList: {
    gap: GRID_GAP,
  },
  editGridBlock: {
    marginBottom: GRID_GAP,
  },
  allTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: TILE_BG,
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: GRID_GAP,
  },
  allTileTitle: {
    color: TILE_TEXT,
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
  tileActiveDrag: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  // §1.2 gallery: 2x2 cells, TL→BR, rounded as one block.
  tileGallery: {
    aspectRatio: 1 / TILE_GALLERY_RATIO,
    borderRadius: TILE_RADIUS,
    overflow: 'hidden',
    gap: TILE_GALLERY_CELL_GAP,
  },
  tileGalleryRow: {
    flex: 1,
    flexDirection: 'row',
    gap: TILE_GALLERY_CELL_GAP,
  },
  tileGalleryCell: {
    flex: 1,
    backgroundColor: TILE_PLACEHOLDER_BG,
  },
  tileGalleryEmpty: {
    backgroundColor: TILE_PLACEHOLDER_BG,
  },
  tileFooter: {
    height: TILE_FOOTER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  tileTitle: {
    color: TILE_TEXT,
    flex: 1,
  },
  tileMenuButton: {
    paddingLeft: 8,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  newListCard: {
    backgroundColor: '#ffffff',
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  newListText: {
    color: SEGMENT_TEXT,
  },
  // Wave-3 §2.1: the Edit chip is a CLEAN CUTOUT — no border, no white pill; the
  // frosted window is the button shape (FilterChip composition).
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  editChipText: {
    color: TILE_TEXT,
  },
  emptyState: {
    paddingVertical: 24,
  },
  emptyText: {
    color: TILE_SUBTEXT,
  },
});
