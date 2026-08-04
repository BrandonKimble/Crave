import React from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import {
  ChevronRight,
  Ellipsis,
  Eye,
  EyeOff,
  GripVertical,
  Heart,
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
  useListsHomeControlsStore,
  type ListsEditSeat,
  type ListsSortMode,
} from './runtime/lists-home-controls-store';
// F933a: the lists content-toggle seam subscribes to the controls store, so the press
// edge fires from the store write itself — importing this module is what wires it.
import './runtime/lists-home-content-toggle';
import { announceFailureIfOnline, showAppModal } from '../../components/app-modal-store';
import { showShareModal } from '../../components/share-modal-store';
import { SegmentedToggle } from '../../components/SegmentedToggle';
import { showListEdit } from '../../components/list-edit-store';
import { colors as themeColors } from '../../constants/theme';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
import { useSystemStatusStore } from '../../store/systemStatusStore';
import {
  userListsService,
  type UserListSummary,
  type UserListType,
} from '../../services/user-lists';
import { useUserLists, userListKeys } from '../../hooks/use-user-lists';
import { sortListsForDisplay } from './lists-display-order';
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
import { ChromeTitleText, toSingleLineText } from '../ChromeTitleText';
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
/** The height a tile paints for the ONE pre-measure frame, before onLayout hands the
 *  grid its width (F931b). Not a design value and not a fallback anything settles on —
 *  purely what occupies the row until the real geometry arrives on the next frame.
 *  Kept at the value that shipped so this change is pixel-identical. */
const UNMEASURED_TILE_HEIGHT_PX = 160;
const TILE_GALLERY_CELL_GAP = 2;
const TILE_PLACEHOLDER_BG = '#eef1f5';

const BOOKMARK_LIST_TYPE_OPTIONS = [
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'dish', label: 'Dishes' },
] as const satisfies readonly { value: UserListType; label: string }[];

// ─── Edit mode (page-registry §8.11 — home half; wave-3 §1.1 RESTORED) ──────────────
// The owner never wanted home edit deleted — list CONTENTS aren't editable from home,
// but reordering the LISTS THEMSELVES is. The session is the useEditModeSession
// PRIMITIVE re-declared here with 2-col tile-grid geometry (ReorderableGrid); the
// data surface declares it and publishes the edit seat the header strip renders.

// Wave-3 §1.1 vocabulary: "My ranking" replaces "Custom rank" EVERYWHERE.
const BOOKMARK_SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'custom', label: 'My ranking' },
] as const satisfies readonly { value: ListsSortMode; label: string }[];
const BOOKMARK_SORT_LABEL_BY_VALUE: Record<ListsSortMode, string> = {
  recent: 'Recent',
  custom: 'My ranking',
};

// Display ordering (incl. the pinned favorites-kind law) lives in
// lists-display-order.ts — pure, spec-covered.

const chunkUserLists = (
  lists: readonly UserListSummary[]
): readonly (readonly UserListSummary[])[] => {
  const rows: UserListSummary[][] = [];
  for (let index = 0; index < lists.length; index += 2) {
    rows.push(lists.slice(index, index + 2));
  }
  return rows;
};

// ─── §1.2: the home-tile 2x2 GALLERY (tileImages, TL(0)→TR(1)→BL(2)→BR(3)) ──────────
// Sparse slots render as quiet placeholders; the API fills from the top-left.
const TILE_GALLERY_SLOTS = [0, 1, 2, 3] as const;

const ListsTileGallery = React.memo(({ item }: { item: UserListSummary }) => {
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

ListsTileGallery.displayName = 'ListsTileGallery';

type ListsListTileProps = {
  item: UserListSummary;
  onPress: (list: UserListSummary) => void;
  onOpenMenu: (list: UserListSummary) => void;
  /** Fixed tile height (uniform grid geometry — read AND edit render the same tile).
   *  NULL = NOT YET MEASURED (F931b): the grid's width arrives from onLayout, so the
   *  very first frame has no geometry at all. That state used to be smuggled through
   *  as the number 0 and papered over at one of the two call sites with a bare `: 160`
   *  — a magic number standing in for "unknown". The type carries the state now, and
   *  the placeholder is named once, below. */
  tileHeight: number | null;
  /** Edit mode: the instant-lift handle gesture seated where the ellipsis lives. */
  editHandleGesture?: ReorderGridRenderContext['handleGesture'];
  isActiveDrag?: boolean;
};

const ListsListTile = React.memo(
  ({
    item,
    onPress,
    onOpenMenu,
    tileHeight,
    editHandleGesture = null,
    isActiveDrag = false,
  }: ListsListTileProps) => {
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
            testID={`lists-tile-handle-${item.listId}`}
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
          { height: tileHeight ?? UNMEASURED_TILE_HEIGHT_PX },
          pressed && !isEditingTile && styles.tilePressed,
          isActiveDrag && styles.tileActiveDrag,
        ]}
      >
        <ListsTileGallery item={item} />
        <View style={styles.tileFooter}>
          {item.kind === 'favorites' ? (
            <Heart size={16} color={SEGMENT_TEXT} style={styles.tileHeartGlyph} />
          ) : null}
          <Text variant="body" weight="semibold" style={styles.tileTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {affordance}
        </View>
      </Pressable>
    );
  }
);

ListsListTile.displayName = 'ListsListTile';

// ─── §8.14: the pinned synthetic ALL tile (one per side, above the system lists) ─────
type ListsAllTileProps = {
  listType: UserListType;
  onPress: (listType: UserListType) => void;
  /** Edit mode: rendered and pinned in place, but not a navigation target. */
  disabled?: boolean;
};

const ListsAllTile = React.memo(({ listType, onPress, disabled }: ListsAllTileProps) => (
  <Pressable
    onPress={() => onPress(listType)}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={listType === 'restaurant' ? 'All restaurants' : 'All dishes'}
    testID="lists-all-tile"
    style={({ pressed }) => [styles.allTile, pressed && !disabled && styles.tilePressed]}
  >
    <Text variant="body" weight="semibold" style={styles.allTileTitle} numberOfLines={1}>
      {listType === 'restaurant' ? 'All restaurants' : 'All dishes'}
    </Text>
    <ChevronRight size={18} color={SEGMENT_TEXT} />
  </Pressable>
));

ListsAllTile.displayName = 'ListsAllTile';

// ─── The home strip (leg 3 header mount): [Edit] · Sort · Restaurants/Dishes ────────
// Wave-3 §1.1/§2.1: the Edit chip is BACK as a STRIP CITIZEN — a keyed conditional
// child, so the engine's late-mount width-grow entry animates it in (pushing its
// siblings by real layout — the snap was the chip not being a citizen at all), and
// it reads as a CLEAN CUTOUT (no pill-in-a-window). The action row while editing is
// the shared edit action row against the body-published seat.
const listsStripCacheSeat = createToggleStripCacheSeat();

const ListsEditChip = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="Edit list order"
    style={styles.editChip}
    testID="lists-edit-toggle"
  >
    <Pencil size={14} color={TILE_TEXT} strokeWidth={2} />
    <Text variant="caption" weight="semibold" style={styles.editChipText}>
      Edit
    </Text>
  </Pressable>
);

const ListsHomeStrip = React.memo(() => {
  const listType = useListsHomeControlsStore((state) => state.listType);
  const sortMode = useListsHomeControlsStore((state) => state.sortMode);
  const setListType = useListsHomeControlsStore((state) => state.setListType);
  const setSortMode = useListsHomeControlsStore((state) => state.setSortMode);
  const editSeat = useListsHomeControlsStore((state) => state.editSeat);

  // Owner decision (leg 3): scrollX resets on re-present — the header strip unmounts
  // exactly when the scene stops being presented; layout stays warm.
  React.useEffect(() => () => clearToggleStripCacheScrollX(listsStripCacheSeat), []);

  const optionSelectorOpenKey = useOptionSelectorOpenKey();

  return (
    <ToggleStrip
      placement="header"
      backdrop="chrome-frost"
      cacheSeat={listsStripCacheSeat}
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
              testIDPrefix: 'lists',
            })
          : null
      }
      actionProgress={editSeat?.actionProgress}
      testID="lists-strip"
    >
      {editSeat != null && editSeat.canEnterEdit && sortMode === 'custom' ? (
        <ListsEditChip key="edit" onPress={editSeat.enterEdit} />
      ) : null}
      <SelectorChip
        key="sort"
        label={BOOKMARK_SORT_LABEL_BY_VALUE[sortMode]}
        active={sortMode !== 'recent'}
        expanded={optionSelectorOpenKey === 'lists-sort'}
        onPress={() =>
          toggleOptionSelector({
            key: 'lists-sort',
            title: 'Sort',
            options: BOOKMARK_SORT_OPTIONS,
            value: sortMode,
            // Leg 4: the store write IS the synchronous re-slice, and it is ALSO the
            // seam's press edge — lists-home-content-toggle subscribes to the store
            // (F933a), so there is no companion commit call to remember here.
            onSelect: (value) => setSortMode(value),
            testID: 'lists-sort-sheet',
          })
        }
        accessibilityLabel="Sort lists"
        testID="lists-sort-toggle"
      />
      <SegmentedToggle
        key="list-type"
        options={BOOKMARK_LIST_TYPE_OPTIONS}
        value={listType}
        onChange={(value) => setListType(value)}
        accessibilityLabel="Toggle between restaurant and dish lists"
        testID="lists-list-type-toggle"
      />
    </ToggleStrip>
  );
});

ListsHomeStrip.displayName = 'ListsHomeStrip';

type ListsSceneBodyProps = {
  listType: UserListType;
  lists: readonly UserListSummary[];
  isEditing: boolean;
  editOrderedLists: readonly UserListSummary[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange: (isDragging: boolean) => void;
  isScreenReaderEnabled: boolean;
  scrollAdapter: ReorderScrollAdapter | null;
  onOpenCreate: () => void;
  onListPress: (list: UserListSummary) => void;
  onOpenMenu: (list: UserListSummary) => void;
  onOpenAll: (listType: UserListType) => void;
};

const ListsSceneBody = React.memo(
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
  }: ListsSceneBodyProps) => {
    const onProfilerRender = useSearchOverlayProfilerRender();
    const listRows = React.useMemo(() => chunkUserLists(lists), [lists]);

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
      cellWidth > 0 ? Math.round(cellWidth * TILE_GALLERY_RATIO) + TILE_FOOTER_HEIGHT : null;

    const renderEditTile = React.useCallback(
      (item: UserListSummary, context: ReorderGridRenderContext) => (
        <ListsListTile
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
        <ListsAllTile listType={listType} onPress={onOpenAll} disabled={isEditing} />
        {isEditing && tileHeight != null ? (
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
              testIDPrefix="lists-edit"
            />
          </View>
        ) : (
          <View style={styles.gridList}>
            {listRows.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.gridRow}>
                {row.map((item) => (
                  <View key={item.listId} style={styles.gridCell}>
                    <ListsListTile
                      item={item}
                      onPress={onListPress}
                      onOpenMenu={onOpenMenu}
                      tileHeight={tileHeight}
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
            testID="lists-new-list"
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
      <React.Profiler id="ListsSceneBody:list" onRender={onProfilerRender}>
        {listContent}
      </React.Profiler>
    ) : (
      listContent
    );

    return <View style={styles.sceneBody}>{profiledListContent}</View>;
  }
);

ListsSceneBody.displayName = 'ListsSceneBody';

// THE CONTENT SLOT (THE PAGE L2 collection body): receives the RESOLVED lists — the
// query edge never reaches here. Interaction machinery (edit session, menus, create)
// operates on resolved data by construction.
const ListsContent = React.memo(({ items }: { items: readonly UserListSummary[] }) => {
  const lists = items;
  const onProfilerRender = useSearchOverlayProfilerRender();
  const executeEntityRefAction = useEntityRefActionExecutor();
  const queryClient = useQueryClient();
  // Leg 3: control state (listType / sortMode) lives in the module store — the
  // header strip (chrome) writes it, this body reads it.
  const listType = useListsHomeControlsStore((state) => state.listType);
  const sortMode = useListsHomeControlsStore((state) => state.sortMode);
  const setSortMode = useListsHomeControlsStore((state) => state.setSortMode);
  const setEditSeat = useListsHomeControlsStore((state) => state.setEditSeat);

  const { promoteActiveSheet } = useAppOverlayRouteController();
  const sortedLists = React.useMemo(() => sortListsForDisplay(lists, sortMode), [lists, sortMode]);
  const listsById = React.useMemo(() => {
    const byId = new Map<string, UserListSummary>();
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
    sceneKey: 'lists',
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
          (entry): entry is { list: UserListSummary; position: number } =>
            entry.list != null && entry.list.position !== entry.position
        );
      await Promise.all(
        updates.map(({ list, position }) => userListsService.updatePosition(list.listId, position))
      );
    } catch {
      setIsSavingOrder(false);
      announceFailureIfOnline();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: userListKeys.all });
    setSortMode('custom');
    exitEditMode();
  }, [exitEditMode, isSavingOrder, queryClient, setSortMode]);

  // Publish the EDIT SEAT the header strip renders (body writes, chrome reads).
  React.useEffect(() => {
    const seat: ListsEditSeat = {
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
    const handle = getOverlaySceneScrollHandle('lists');
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

  const editOrderedLists = React.useMemo<UserListSummary[]>(() => {
    if (editSession.order == null) {
      return [];
    }
    return editSession.order
      .map((listId) => listsById.get(listId))
      .filter((list): list is UserListSummary => list != null);
  }, [editSession.order, listsById]);

  // §4: EVERY create path opens the ONE listEdit panel (create mode carries the
  // active side). The header plus routes here via the header-create registry.
  const openCreate = React.useCallback(() => {
    showListEdit({
      mode: 'create',
      listType: useListsHomeControlsStore.getState().listType,
    });
  }, []);
  React.useEffect(() => registerHeaderCreateAction('lists', openCreate), [openCreate]);

  const handleOpenAll = React.useCallback(
    (side: UserListType) => {
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
    (list: UserListSummary) => {
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

  const handleShare = React.useCallback((list: UserListSummary) => {
    // One share surface app-wide: the universal share modal (it handles the
    // not-yet-shared case by minting the slug itself).
    showShareModal({
      kind: 'list',
      id: list.listId,
      title: list.name,
      listShareSlug: list.shareEnabled ? (list.shareSlug ?? null) : null,
      listOwnedByViewer: true,
    });
  }, []);

  const handleToggleVisibility = React.useCallback(
    async (list: UserListSummary) => {
      const nextVisibility = list.visibility === 'public' ? 'private' : 'public';
      try {
        await userListsService.update(list.listId, { visibility: nextVisibility });
      } catch {
        announceFailureIfOnline();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: userListKeys.all });
    },
    [queryClient]
  );

  const handleToggleUseOwnPhotos = React.useCallback(
    async (list: UserListSummary) => {
      try {
        await userListsService.update(list.listId, {
          useOwnPhotos: list.useOwnPhotos !== true,
        });
      } catch {
        announceFailureIfOnline();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: userListKeys.all });
    },
    [queryClient]
  );

  const handleTogglePin = React.useCallback(
    async (list: UserListSummary) => {
      try {
        await userListsService.update(list.listId, { pinned: list.pinned !== true });
      } catch {
        announceFailureIfOnline();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: userListKeys.all });
    },
    [queryClient]
  );

  const handleDelete = React.useCallback(
    async (list: UserListSummary) => {
      try {
        await userListsService.remove(list.listId);
      } catch {
        announceFailureIfOnline();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: userListKeys.all });
    },
    [queryClient]
  );

  // Wave-2 §2 ellipsis-menu restyle: left-aligned title; lucide icon + text rows,
  // no color blocks, no separators, no Cancel row (swipe/backdrop dismisses).
  // Wave-3 §4: the "Edit" row (list metadata) opens the ONE listEdit panel.
  const openListMenu = React.useCallback(
    (list: UserListSummary) => {
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
          // Favorites-as-kind: the one-per-user favorites list is UNDELETABLE
          // (server-guarded) — the menu doesn't offer what the API refuses.
          ...(list.kind === 'favorites'
            ? []
            : [
                {
                  label: 'Delete',
                  style: 'destructive' as const,
                  icon: <Trash2 size={19} color="#ef4444" />,
                  onPress: () => void handleDelete(list),
                },
              ]),
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
    <ListsSceneBody
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
    <React.Profiler id="ListsContent" onRender={onProfilerRender}>
      {dataSurface}
    </React.Profiler>
  ) : (
    dataSurface
  );
});

ListsContent.displayName = 'ListsContent';

// The DECLARED empty view — only correct once the collection RESOLVES empty.
const ListsEmpty = () => (
  <View style={styles.emptyState}>
    <Text variant="body" style={styles.emptyText}>
      No lists yet
    </Text>
  </View>
);

// THE DECLARATION (L2): lists is a COLLECTION body — the full closed enum over
// the favorites collection; the grid/edit composition owns only resolved items.
const LISTS_PAGE_BODY: PageCollectionBodySpec<UserListSummary> = {
  kind: 'collection',
  scene: 'lists',
  Content: ListsContent,
  // insetX 0: the mounted body renders inside the transport's 20px-inset container —
  // the holes must not re-inset (the double-inset jump class).
  placeholder: { count: 3, insetX: 0 },
  Empty: ListsEmpty,
};

// THE PAGE CONTROLLER — the query + the state derivation; slots never see the edge.
const useListsPageBody = (): PageBodyState<UserListSummary> => {
  const queryClient = useQueryClient();
  const { shouldSubscribeDataLane, hasActivatedExpandedContent } =
    useBottomSheetSceneStackBodyRenderActivity();
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const listType = useListsHomeControlsStore((state) => state.listType);
  const queryEnabled = !isSystemUnavailable && shouldSubscribeDataLane;
  const listsQuery = useUserLists({
    listType,
    enabled: queryEnabled,
    subscribed: queryEnabled,
  });
  // Retained-data law (kept from the old surface): an in-flight refetch or an errored
  // refetch with RETAINED data keeps presenting the data — pending/error only with
  // nothing to show; 'No lists yet' only once the query RESOLVES empty.
  const retainedListsRef = React.useRef<Partial<Record<UserListType, UserListSummary[]>>>({});
  const cachedLists = queryClient.getQueryData<UserListSummary[]>(userListKeys.list(listType));
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
  return resolvePageBodyListState<UserListSummary>({
    // Activation (hasActivatedExpandedContent) is a STATE input: until the scene
    // expands the body paints the material — never a tree swap (the old dual-tree).
    isPending: !hasActivatedExpandedContent || !queryEnabled || (listsQuery.isLoading && !hasData),
    isError: listsQuery.isError && !hasData,
    what: 'your lists',
    retry: refetchLists,
    items: hasData ? lists : listsQuery.data != null ? [] : null,
  });
};

export const ListsMountedSceneBody = React.memo(() => {
  const onProfilerRender = useSearchOverlayProfilerRender();
  // P3 return-to-origin: publish the lists scene's live scroll lane so a favorites-from-
  // lists reveal captures the scroll offset to return to on dismiss.
  useOriginSceneScrollPublication('lists');
  // THE PAGE L2: ONE tree, always visible — the dual-tree (full-body transition
  // skeleton OVER a display:none prewarmed body) is DELETED; the shell paints the
  // closed states in place.
  const mountedBody = <PageBodyShell spec={LISTS_PAGE_BODY} state={useListsPageBody()} />;

  return onProfilerRender ? (
    <React.Profiler id="ListsMountedSceneBody" onRender={onProfilerRender}>
      {mountedBody}
    </React.Profiler>
  ) : (
    mountedBody
  );
});

ListsMountedSceneBody.displayName = 'ListsMountedSceneBody';

// P3 persistent header (page-switch-master-plan.md §6-P3): the lists header CONTENT mounts
// inside the hoisted PersistentSheetHeaderHost, NOT inside this panel — the close (X) semantics
// come from the overlay route controller (reachable anywhere under the app providers). The
// grab-handle tap is the shared promote handler.
const ListsPersistentHeaderTitle = React.memo(() => (
  <View style={styles.headerTextGroup}>
    <ChromeTitleText>{toSingleLineText('Lists')}</ChromeTitleText>
  </View>
));

ListsPersistentHeaderTitle.displayName = 'ListsPersistentHeaderTitle';

// Module-scope registration (house pattern — origin-scene-live-state-registry). The header
// action is the HOST-OWNED HeaderNavAction (leg 6 §4) — no per-scene Action slot.
registerPersistentHeaderDescriptor('lists', {
  Title: ListsPersistentHeaderTitle,
  Strip: ListsHomeStrip,
});

const styles = StyleSheet.create({
  // FLUSH LAW (2026-07-11): content starts at the header's bottom edge — no top padding.
  sceneBody: {},
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
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
  tileHeartGlyph: {
    marginRight: 6,
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
