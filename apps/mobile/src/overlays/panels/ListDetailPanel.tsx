import React from 'react';

import { STRIP_BAND_BOTTOM_SPACER_HEIGHT } from '../../toggles/toggle-strip-metrics';
import { Pressable, StyleSheet, View } from 'react-native';
import { setClipboardString } from '../../utils/clipboard';
import {
  Eye,
  EyeOff,
  Images,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { Text } from '../../components';
import { FilterChip } from '../../components/FilterChip';
import { SelectorChip } from '../../components/SelectorChip';
import {
  toggleOptionSelector,
  useOptionSelectorOpenKey,
} from '../../components/option-selector-store';
import { ToggleStrip } from '../../toggles/ToggleStrip';
import { createToggleStripCacheSeat } from '../../toggles/toggle-strip-layout-cache';
import { useContentToggle } from '../../toggles/use-content-toggle';
import { buildEditModeActionRow } from '../../toggles/EditModeActionRow';
import { PRICE_LEVEL_SYMBOLS } from '../../constants/pricing';
import { announceFailureIfOnline, showAppModal } from '../../components/app-modal-store';
import { openPostPhotosFunnel } from '../PostPhotosFunnelHost';
import { showShareModal } from '../../components/share-modal-store';
import {
  ReorderableRows,
  useIsScreenReaderEnabled,
  type ReorderScrollAdapter,
} from '../../components/reorder';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { getOverlaySceneScrollHandle } from '../sceneScrollStateRegistry';
import { useEditModeSession } from '../edit-mode-session';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import { CutoutSkeletonShape } from '../../components/skeletons';
import {
  registerPersistentHeaderDescriptor,
  type PersistentHeaderExtrasProps,
} from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useRouteAuthoritySelector } from '../../navigation/runtime/use-route-authority-selector';
import type { OverlayRouteEntry } from '../../navigation/runtime/app-overlay-route-types';
import { areOverlayRoutesEqual } from '../../navigation/runtime/app-overlay-route-stack-algebra';
import type { RouteOverlayNavigationSnapshot } from '../../navigation/runtime/route-overlay-navigation-snapshot-contract';
import { favoriteListKeys } from '../../hooks/use-favorite-lists';
import {
  getSearchSurfaceRuntime,
  selectSearchSurfaceVisualPolicy,
} from '../../screens/Search/runtime/surface/search-surface-runtime';
import {
  getSearchMountedResultsDataSnapshot,
  subscribeSearchMountedResultsDataSnapshot,
} from '../../screens/Search/runtime/shared/search-mounted-results-data-store';
import { serializeDesireLinkToPath } from '../../navigation/runtime/desire-url-codec';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useAppRouteCoordinator } from '../../navigation/runtime/AppRouteCoordinator';
import {
  favoriteListsService,
  type FavoriteListCollaborators,
  type FavoriteListDetail,
  type FavoriteListSort,
  type FavoriteListType,
  type FavoriteListViewerRole,
} from '../../services/favorite-lists';
import { usersService } from '../../services/users';
import type { FoodResult, RestaurantResult, SearchResponse } from '../../types';
// The person atoms + the modal itself live with the ROOT host (leg 12) — the panel
// only mounts the chip and syncs the imperative store.
import { PersonAvatar } from '../../components/CollaboratorModalHost';
import {
  closeCollaboratorModal,
  showCollaboratorModal,
  type CollaboratorModalPayload,
} from '../../components/collaborator-modal-store';
import { showListEdit } from '../../components/list-edit-store';
import { resolvePageContentBodyState, type PageContentBodySpec } from '../page-body-contract';
import { PageBodyShell } from '../PageBodyShell';
import { ChromeTitleText, toSingleLineText } from '../ChromeTitleText';
import SquircleSpinner from '../../components/SquircleSpinner';
// Leg 11 (§2d): rows ARE the ResultCard primitive — the results card with the
// listDetail/read-only slot bundles (note · add-photo); ListDetailRow is deleted.
import { DishResultCard, RestaurantResultCard } from '../../components/cards/ResultCard';
import type { ScoreInfoPayload } from '../../screens/Search/components/SearchRankAndScoreSheets';
import { showScoreInfo } from '../../components/score-info-store';
import {
  getMarkerColorForDish,
  getMarkerColorForRestaurant,
} from '../../screens/Search/utils/marker-lod';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';

// ─── listDetail — the REAL page body (W1 slices 4/8/9;
// plans/w1-listdetail-structural-spec.md §A.3 / §C.4 / §C.8 / §C.9) ──────────────────────────
// The pattern copy of UserProfilePanel (the reference child page): entry BY PROP (C2 — never
// useTopMostRouteEntryForScene), page data on the react-query CACHE keyed by DATA identity
// (['listDetail', listId] — two stacked entries of one list share the row, C3), persistent
// header descriptor, and an honest failure/empty/dead-slug body set (§5.6).
//
// Identity (spec D.5 adjudication): params = {listId | virtual 'all:restaurants'/'all:dishes',
// shareSlug?, targetUserId?, joinIntent?} — the Desire list arm; shareSlug is RT-18 ACCESS
// MATERIAL, presented on every server read (meta + results), never identity. joinIntent marks
// an entry that came from an invite link (crave://l/<slug>?join=1) — the ONLY entry that
// offers "Join as collaborator" (§8.1).
//
// Rows are CLEAN SIMPLE ROWS v1 (name, score dot, LIVE photo strip, note): the
// results-sheet renderer (restaurant-result-card) is search-surface-entangled (descriptor +
// world plumbing), and the spec's fallback names exactly this shape. No FlashList — rows ride
// the leg's shared mounted-scroll container (the MVCP law is moot without a virtualized list).
//
// EDIT MODE (leg 10 step 6 — charter §6 child-page semantics, DECLARED): owner/collaborator
// on a CONCRETE list, while sort = the saver's ranking, gets an Edit chip; the mode session
// (order/history/undo/redo, sheet edit lock, header X = CANCEL w/ discard-confirm, action-row
// morph progress) is the useEditModeSession PRIMITIVE — ListDetail only declares it. Rows
// stay RICH in place: the same ListDetailRow renders inside ReorderableRows' variable-height
// slot map (measured per-row heights; the bare-row swap + EDIT_ROW_HEIGHT are DELETED).
// Save = ONE batch PATCH /items/order, re-queries on custom — persistence stays surface-owned.

type ListDetailParams = {
  listId?: string | null;
  shareSlug?: string | null;
  targetUserId?: string | null;
  joinIntent?: boolean | null;
  /** Leg 9 (§2a): header warm-seed — the tap label paints the name at frame 1. */
  title?: string | null;
  /** Wave-4 §3 panel world-read: TRUE when the entry rode the listWorld composite —
   *  the presented world's results ARE this list's default slice; the panel reads
   *  them instead of re-fetching (the resolver already fetched getListResults). */
  worldBacked?: boolean | null;
};

const VIRTUAL_LIST_TYPE_BY_ID: Record<string, FavoriteListType> = {
  'all:restaurants': 'restaurant',
  'all:dishes': 'dish',
};

const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://crave-search.app';

const isPrivateGoneError = (error: unknown): boolean =>
  axios.isAxiosError(error) &&
  (error.response?.status === 410 ||
    (error.response?.data as { state?: string } | undefined)?.state === 'private');

const SORT_LABELS: Record<Exclude<FavoriteListSort, 'custom'>, string> = {
  best: 'Best',
  recent: 'Recently added',
};

const resolveCustomSortLabel = (viewerRole: FavoriteListViewerRole | undefined): string =>
  viewerRole === 'owner' || viewerRole === 'collaborator' ? 'My ranking' : 'Their ranking';

/** Pre-measure estimate for the variable-height edit rows (rich row ≈ header + strip + note). */
const EDIT_ROW_HEIGHT_ESTIMATE = 128;

// ─── Header seat (leg 9, listdetail-ideal §2a): the LIST NAME is the header text ─────────────
// The body of each live listDetail entry publishes its resolved name + ellipsis-menu opener
// here, keyed by entryId; the persistent-header Title/Extras read the TOPMOST listDetail
// entry's seat. Warm seed: the push params carry `title` (the tap label), so the name paints
// at frame 1; slug opens resolve it at meta time and the seat updates.
type ListDetailHeaderSeat = {
  name: string | null;
  /** Null = no menu for this entry (virtual All / meta unresolved) — Extras renders nothing. */
  openMenu: (() => void) | null;
};

const listDetailHeaderSeats = new Map<string, ListDetailHeaderSeat>();
const listDetailHeaderSeatListeners = new Set<() => void>();
const emitListDetailHeaderSeats = (): void => {
  listDetailHeaderSeatListeners.forEach((listener) => listener());
};
const publishListDetailHeaderSeat = (entryId: string, seat: ListDetailHeaderSeat): (() => void) => {
  listDetailHeaderSeats.set(entryId, seat);
  emitListDetailHeaderSeats();
  return () => {
    if (listDetailHeaderSeats.get(entryId) === seat) {
      listDetailHeaderSeats.delete(entryId);
      emitListDetailHeaderSeats();
    }
  };
};
const subscribeListDetailHeaderSeats = (listener: () => void): (() => void) => {
  listDetailHeaderSeatListeners.add(listener);
  return () => listDetailHeaderSeatListeners.delete(listener);
};

/** Topmost listDetail entry — for the SINGLETON header chrome this is the truth by
 *  definition (the header always describes the top of the stack), unlike leg bodies where
 *  topmost-per-key is the warned anti-pattern (use-top-most-route-entry-for-scene). */
const useTopMostListDetailEntryForHeader = (): OverlayRouteEntry<'listDetail'> | null => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const selector = React.useCallback(
    (snapshot: RouteOverlayNavigationSnapshot): OverlayRouteEntry<'listDetail'> | null => {
      for (let index = snapshot.overlayRouteStack.length - 1; index >= 0; index -= 1) {
        const entry = snapshot.overlayRouteStack[index];
        if (entry?.key === 'listDetail') {
          return entry as OverlayRouteEntry<'listDetail'>;
        }
      }
      return null;
    },
    []
  );
  return useRouteAuthoritySelector({
    subscribe: (listener, attributionLabel) =>
      routeSceneRuntime.routeOverlayNavigationAuthority.registerTarget({
        selector,
        syncNavigationSnapshot: () => listener(),
        isEqual: (left, right) => areOverlayRoutesEqual(left, right),
        attributionLabel: attributionLabel ?? 'listDetailHeaderSeat',
      }),
    getSnapshot: () => routeSceneRuntime.routeOverlayNavigationAuthority.getSnapshot(),
    selector,
    isEqual: (left, right) => areOverlayRoutesEqual(left, right),
    attributionOwner: 'useTopMostListDetailEntryForHeader',
    attributionOperation: 'listDetail',
  });
};

const useTopMostListDetailHeaderSeat = (): {
  entry: OverlayRouteEntry<'listDetail'> | null;
  seat: ListDetailHeaderSeat | null;
} => {
  const entry = useTopMostListDetailEntryForHeader();
  const entryId = entry?.entryId ?? null;
  const seat = React.useSyncExternalStore(
    subscribeListDetailHeaderSeats,
    () => (entryId != null ? (listDetailHeaderSeats.get(entryId) ?? null) : null),
    () => (entryId != null ? (listDetailHeaderSeats.get(entryId) ?? null) : null)
  );
  return { entry, seat };
};

// ─── Collaborator stack chip (§8.1): [plus] [owner] [collab…≤3] [+N] ─────────────────────────
const CHIP_AVATAR_SIZE = 28;
const MAX_VISIBLE_COLLABORATORS = 3;

const CollaboratorStackChip = ({
  roster,
  onPress,
}: {
  roster: FavoriteListCollaborators;
  onPress: () => void;
}) => {
  const visible = roster.collaborators.slice(0, MAX_VISIBLE_COLLABORATORS);
  const overflow = roster.collaborators.length - visible.length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="List collaborators"
      testID="list-detail-collaborator-chip"
      style={styles.collabChip}
    >
      <View style={[styles.avatarCircle, styles.plusCircle]}>
        <Plus size={14} color="#0f172a" strokeWidth={2.5} />
      </View>
      <View style={styles.collabOverlap}>
        <PersonAvatar person={roster.owner} size={CHIP_AVATAR_SIZE} />
      </View>
      {visible.map((person) => (
        <View key={person.userId} style={styles.collabOverlap}>
          <PersonAvatar person={person} size={CHIP_AVATAR_SIZE} />
        </View>
      ))}
      {overflow > 0 ? (
        <Text variant="caption" style={styles.collabOverflowText}>
          and {overflow} {overflow === 1 ? 'other' : 'others'}
        </Text>
      ) : null}
    </Pressable>
  );
};

// ─── Toggle strip (leg 9, listdetail-ideal §2b): the PRIMITIVE's in-list mount ───────────────
// The hand-rolled SortChips + two-row morph are DELETED — ListDetail declares the ToggleStrip
// engine (frost cutouts, edge bleed, physics, warm restore, citizen entry/exit, action-row
// slot all inherited). Inventory: [Edit] · Sort (value-displayed SelectorChip) · Open now ·
// City (virtual All only, honest-disabled). Edit rides the ENGINE action-row slot.
const listDetailStripCacheSeat = createToggleStripCacheSeat();
const LIST_DETAIL_SORT_SELECTOR_KEY = 'list-detail-sort';
const LIST_DETAIL_PRICE_SELECTOR_KEY = 'list-detail-price';
const LIST_DETAIL_CITY_SELECTOR_KEY = 'list-detail-city';
// v1 Price vocabulary: any, or exactly one level (the API takes the full 0–4 array —
// range selection is a strip-parity follow-up with the results Price sheet).
const PRICE_OPTIONS = [
  { value: 'any', label: 'Any price' },
  ...[1, 2, 3, 4].map((level) => ({ value: String(level), label: PRICE_LEVEL_SYMBOLS[level] })),
];

const ListDetailEditChip = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="Edit list order"
    style={styles.editChip}
    testID="list-detail-edit-toggle"
  >
    <Pencil size={14} color="#0f172a" strokeWidth={2} />
    <Text variant="caption" weight="semibold" style={styles.editChipText}>
      Edit
    </Text>
  </Pressable>
);

// The edit action row is the SHARED buildEditModeActionRow (toggles/EditModeActionRow) —
// wave-3 §1.1 re-declared the same primitive on the Lists home, so the row is built once.

// Page-local retry is BANNED (wave-4 §1 load-failure law) — generic load failures go
// through the shell's failure chokepoint (shared modal + pop). StateBody remains
// only for HONEST terminal states like the revoked-share 410 body.
const StateBody = ({ message, testID }: { message: string; testID: string }) => (
  <View style={styles.stateBody} testID={testID}>
    <Text variant="body" style={styles.stateText}>
      {message}
    </Text>
  </View>
);

// ─── Rich row model (leg 10 step 6; leg 11 §2d): ONE descriptor renders read AND edit ───────
// The row IS the ResultCard primitive now (full results look + the listDetail slot bundle:
// note under the gallery, add-photo lead tile). The edit surface renders the SAME cards
// inside the variable-height reorder slot map — rows stay rich while dragging.
type ListDetailRichRow = {
  /** The row's stable entity key (restaurantId / connectionId). */
  key: string;
  /** The FavoriteListItem id backing the row (the reorder PATCH vocabulary). */
  itemId: string | null;
} & ({ kind: 'restaurant'; restaurant: RestaurantResult } | { kind: 'dish'; dish: FoodResult });

// ─── THE CONTENT SLOT (THE PAGE L2 — the listDetail split, edit map 2026-07-19) ─────
// Receives the RESOLVED composite from the controller below; the query edge, slice
// state, world reads, and collaborator/list commands live controller-side and arrive
// as data + commands. A pending/failed branch has no state left to express here.
type ListDetailSliceData = {
  effectiveSort: FavoriteListSort;
  openNow: boolean;
  priceLevel: number | null;
  cityPlaceId: string | null;
  cityOptions: Array<{ value: string; label: string }>;
  cityChipLabel: string;
  applySlice: (
    patch: {
      sort?: FavoriteListSort;
      openNow?: boolean;
      priceLevel?: number | null;
      cityPlaceId?: string | null;
    },
    kind: 'sort' | 'open_now' | 'price' | 'city'
  ) => void;
  contentPhase: string;
};

type ListDetailReadyData = {
  kind: 'ready';
  resolvedListId: string;
  listType: FavoriteListType;
  viewerRole: FavoriteListViewerRole | undefined;
  defaultSort: FavoriteListSort;
  isVirtualAll: boolean;
  canEdit: boolean;
  canAddPhoto: boolean;
  response: SearchResponse;
  roster: FavoriteListCollaborators | null;
  entryId: string | null;
  showJoinAffordance: boolean;
  isJoining: boolean;
  onJoin: () => Promise<void>;
  openCollaboratorRoster: () => void;
  onOrderSaved: () => Promise<void>;
  slice: ListDetailSliceData;
};

/** Private-gone (410 sharing revoked) is a RESOLVED answer, not a load failure. */
type ListDetailPageData = { kind: 'privateGone' } | ListDetailReadyData;

// Hook-free dispatcher: data.kind can flip live (revocation mid-view), so the ready
// half is its own component — no conditional hooks.
const ListDetailContent = ({ data }: { data: ListDetailPageData }) =>
  data.kind === 'privateGone' ? (
    <StateBody message="This list is no longer shared." testID="list-detail-private" />
  ) : (
    <ListDetailReadyContent data={data} />
  );

const ListDetailReadyContent = React.memo(({ data }: { data: ListDetailReadyData }) => {
  const { promoteActiveSheet } = useAppOverlayRouteController();
  const optionSelectorOpenKey = useOptionSelectorOpenKey();
  const [isSavingOrder, setIsSavingOrder] = React.useState(false);
  const isScreenReaderEnabled = useIsScreenReaderEnabled();

  const restaurantRows: RestaurantResult[] =
    data.listType === 'restaurant' ? (data.response?.restaurants ?? []) : [];
  const dishRows: FoodResult[] = data.listType === 'dish' ? (data.response?.dishes ?? []) : [];

  // The ONE rich-row model — read mode maps it directly; edit mode reorders its keys.
  const richRows = React.useMemo<ListDetailRichRow[]>(
    () =>
      data.listType === 'restaurant'
        ? restaurantRows.map((restaurant) => ({
            key: restaurant.restaurantId,
            itemId: restaurant.favoriteListItemId ?? null,
            kind: 'restaurant' as const,
            restaurant,
          }))
        : dishRows.map((dish) => ({
            key: dish.connectionId,
            itemId: dish.favoriteListItemId ?? null,
            kind: 'dish' as const,
            dish,
          })),
    [dishRows, data.listType, restaurantRows]
  );
  const richRowsByKey = React.useMemo(() => {
    const byKey = new Map<string, ListDetailRichRow>();
    for (const row of richRows) {
      byKey.set(row.key, row);
    }
    return byKey;
  }, [richRows]);

  // ─── ResultCard wiring (leg 11 §2d): the primitive's environment on this surface ───────────
  // Heart = the house save sheet (the SAME command-controller handlers results use);
  // card press = the entity-ref executor's restaurantWorld lane; score-info = a panel-owned
  // instance of the ONE score sheet (the search-scene copy is scene-focused chrome).
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { getRestaurantSaveHandler, getDishSaveHandler } =
    routeSceneRuntime.routeOverlayCommandActions;
  const executeEntityRef = useEntityRefActionExecutor();
  const openRestaurantProfileFromList = React.useCallback(
    (restaurant: RestaurantResult) => {
      executeEntityRef({
        entityId: restaurant.restaurantId,
        entityType: 'restaurant',
        label: restaurant.restaurantName,
      });
    },
    [executeEntityRef]
  );
  // Dish cards resolve their restaurant from the data.response's restaurant axis (a dish-list
  // results data.response carries it for the map pins — same source results uses).
  const restaurantsByIdForDishRows = React.useMemo(() => {
    const byId = new Map<string, RestaurantResult>();
    for (const restaurant of data.response?.restaurants ?? []) {
      byId.set(restaurant.restaurantId, restaurant);
    }
    return byId;
  }, [data.response]);
  // Score info rides the ROOT ScoreInfoHost (imperative store): a panel-local
  // OverlayModalSheet mount anchors to the scrollable body's content box and
  // lands offscreen (leg-11 sim RED).
  const openScoreInfo = React.useCallback((payload: ScoreInfoPayload) => {
    showScoreInfo(payload);
  }, []);

  // ─── Edit = the DECLARED mode session (leg 10 step 6; useEditModeSession owns the
  // order/history session, the sheet edit lock, the header X = CANCEL discard-confirm and
  // the action-row morph progress; §8.11 promote-to-top rides onEnter).
  const editSession = useEditModeSession({
    sceneKey: 'listDetail',
    entryId: data.entryId,
    onEnter: () => promoteActiveSheet({ snap: 'expanded' }),
  });
  const isEditing = editSession.isEditing;

  const enterEditMode = React.useCallback(() => {
    editSession.enter(richRows.map((row) => row.key));
  }, [editSession, richRows]);

  const exitEditMode = React.useCallback(() => {
    editSession.exit();
    setIsSavingOrder(false);
  }, [editSession]);

  // The primitive can end the session itself (header X = Cancel) — clear the local
  // save flag on ANY session end, not just the strip's Cancel path.
  React.useEffect(() => {
    if (!isEditing) {
      setIsSavingOrder(false);
    }
  }, [isEditing]);

  const handleSaveOrder = React.useCallback(async () => {
    if (editSession.order == null || isSavingOrder || data.resolvedListId == null) {
      return;
    }
    // Batch order PATCH vocabulary = itemIds, built from the RENDERED rows — which can be
    // a SUBSET of full membership (the executor drops score-less items). The API accepts a
    // subset (reordered rows are placed, unlisted members keep relative order after them),
    // so we send the rendered order as-is. A row missing its itemId projection is still a
    // loud local failure — that id can't be expressed at all.
    const orderedItemIds = editSession.order.map((key) => richRowsByKey.get(key)?.itemId ?? null);
    if (orderedItemIds.some((itemId) => itemId == null)) {
      announceFailureIfOnline();
      return;
    }
    setIsSavingOrder(true);
    try {
      await favoriteListsService.reorderItems(data.resolvedListId, orderedItemIds as string[]);
    } catch {
      setIsSavingOrder(false);
      // Honest copy: the visible rows can be a subset of the list's membership, so a
      // failed save may have left the order partially applied — say so, and that
      // retrying is safe (the PATCH is idempotent over the same ordered subset).
      announceFailureIfOnline({
        message:
          "We couldn't save the new order — it may have only partially applied. It's safe to try saving again.",
      });
      return;
    }
    // Re-query on the saver's ranking (CONTROLLER command — invalidations + the
    // sort-override flip live with the slice state): the custom order is now the
    // list's default.
    await data.onOrderSaved();
    exitEditMode();
  }, [data, editSession.order, exitEditMode, isSavingOrder, richRowsByKey]);

  // Edge auto-scroll drives the SHARED sheet scroll container through the
  // scene-scroll-handle registry seam (the mounted body does not own its scroller).
  const scrollAdapter = React.useMemo<ReorderScrollAdapter | null>(() => {
    if (!isEditing) {
      return null;
    }
    const handle = getOverlaySceneScrollHandle('listDetail');
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

  // Rich rows stay rich WHILE DRAGGING (listdetail-ideal §2c): the edit surface renders
  // the SAME ResultCard rows inside the variable-height slot map; the lifted row gets a
  // white card treatment so it reads as picked up over its siblings.
  const canAddPhotoRef = React.useRef(data.canAddPhoto);
  canAddPhotoRef.current = data.canAddPhoto;
  const renderRichRowCard = React.useCallback(
    (row: ListDetailRichRow, index: number) => {
      const canAdd = canAddPhotoRef.current;
      if (row.kind === 'restaurant') {
        const { restaurant } = row;
        return (
          <View testID={`list-detail-row-${row.key}`}>
            <RestaurantResultCard
              restaurant={restaurant}
              index={index}
              rank={index + 1}
              qualityColor={getMarkerColorForRestaurant(restaurant)}
              isLiked={false}
              onSavePress={getRestaurantSaveHandler(
                restaurant.restaurantId,
                restaurant.restaurantLocationId ?? restaurant.displayLocation?.locationId ?? null
              )}
              openRestaurantProfile={openRestaurantProfileFromList}
              openScoreInfo={openScoreInfo}
              primaryFoodTerm={null}
              note={restaurant.note ?? null}
              onAddPhoto={
                canAdd
                  ? () =>
                      openPostPhotosFunnel({
                        restaurantId: restaurant.restaurantId,
                        restaurantName: restaurant.restaurantName,
                      })
                  : undefined
              }
            />
          </View>
        );
      }
      const { dish } = row;
      return (
        <View testID={`list-detail-row-${row.key}`}>
          <DishResultCard
            item={dish}
            index={index}
            qualityColor={getMarkerColorForDish(dish)}
            isLiked={false}
            restaurantForDish={restaurantsByIdForDishRows.get(dish.restaurantId)}
            onSavePress={getDishSaveHandler(dish.connectionId, dish.restaurantLocationId ?? null)}
            openRestaurantProfile={openRestaurantProfileFromList}
            openScoreInfo={openScoreInfo}
            note={dish.note ?? null}
            onAddPhoto={
              canAdd
                ? () =>
                    openPostPhotosFunnel({
                      restaurantId: dish.restaurantId,
                      restaurantName: dish.restaurantName,
                      dishId: dish.connectionId,
                      dishName: dish.foodName,
                    })
                : undefined
            }
          />
        </View>
      );
    },
    [
      getDishSaveHandler,
      getRestaurantSaveHandler,
      openRestaurantProfileFromList,
      openScoreInfo,
      restaurantsByIdForDishRows,
    ]
  );
  // The reorder shell renders by ITEM (no index in its render context) — the live rank
  // badge derives from the session's current order.
  const editIndexByKey = React.useMemo(() => {
    const byKey = new Map<string, number>();
    (editSession.order ?? []).forEach((key, index) => byKey.set(key, index));
    return byKey;
  }, [editSession.order]);
  const renderEditRowContent = React.useCallback(
    (row: ListDetailRichRow, context: { isDraggable: boolean; isActiveDrag: boolean }) => (
      <View style={context.isActiveDrag ? styles.richRowActive : null}>
        {renderRichRowCard(row, editIndexByKey.get(row.key) ?? 0)}
      </View>
    ),
    [editIndexByKey, renderRichRowCard]
  );

  const orderedEditRows = React.useMemo<ListDetailRichRow[]>(() => {
    if (editSession.order == null) {
      return [];
    }
    return editSession.order
      .map((key) => richRowsByKey.get(key))
      .filter((row): row is ListDetailRichRow => row != null);
  }, [editSession.order, richRowsByKey]);

  const rowCount = data.listType === 'restaurant' ? restaurantRows.length : dishRows.length;
  const hasCustomSortOption = !data.isVirtualAll && (data.defaultSort === 'custom' || data.canEdit);
  const customSortLabel = resolveCustomSortLabel(data.viewerRole);
  const sortChipLabel =
    data.slice.effectiveSort === 'custom' ? customSortLabel : SORT_LABELS[data.slice.effectiveSort];
  const sortOptions: Array<{ value: FavoriteListSort; label: string }> = [
    ...(hasCustomSortOption ? [{ value: 'custom' as const, label: customSortLabel }] : []),
    { value: 'best' as const, label: SORT_LABELS.best },
    { value: 'recent' as const, label: SORT_LABELS.recent },
  ];
  // §2a: username · metadata dot · TYPED count ("N dishes"/"N restaurants").
  const countLabel =
    data.listType === 'restaurant'
      ? `${rowCount} ${rowCount === 1 ? 'restaurant' : 'restaurants'}`
      : `${rowCount} ${rowCount === 1 ? 'dish' : 'dishes'}`;
  const ownerHandle = data.roster?.owner
    ? data.roster.owner.username?.trim() || data.roster.owner.displayName?.trim() || null
    : null;

  return (
    <View style={styles.body} testID="list-detail-body">
      {/* §2a meta block — avatar stack FLUSH under the header, username · dot · typed count. */}
      <View style={styles.pageBlock}>
        <View style={styles.metaRow}>
          {data.roster != null ? (
            <CollaboratorStackChip roster={data.roster} onPress={data.openCollaboratorRoster} />
          ) : null}
          <Text
            variant="caption"
            style={styles.metaText}
            numberOfLines={1}
            testID="list-detail-meta-line"
          >
            {ownerHandle ? `${ownerHandle} · ${countLabel}` : countLabel}
          </Text>
        </View>

        {data.showJoinAffordance ? (
          <Pressable
            onPress={() => void data.onJoin()}
            disabled={data.isJoining}
            accessibilityRole="button"
            accessibilityLabel="Join this list as a collaborator"
            testID="list-detail-join"
            style={styles.joinBanner}
          >
            {data.isJoining ? (
              <SquircleSpinner size={16} color="#ffffff" />
            ) : (
              <Text variant="caption" weight="semibold" style={styles.joinBannerText}>
                Join as collaborator
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {/* §2b: the strip PRIMITIVE's in-list mount — full-bleed band, content aligned by
          contentInset (the transport carries no horizontal inset for this scene). */}
      <View style={styles.stripBlock}>
        <ToggleStrip
          placement="in-list"
          backdrop="plated-body"
          cacheSeat={listDetailStripCacheSeat}
          contentInset={OVERLAY_HORIZONTAL_PADDING}
          actionRow={
            isEditing
              ? buildEditModeActionRow({
                  onCancelEdit: exitEditMode,
                  onUndo: editSession.undo,
                  onRedo: editSession.redo,
                  onSaveEdit: () => void handleSaveOrder(),
                  canUndo: editSession.canUndo,
                  canRedo: editSession.canRedo,
                  hasEverEdited: editSession.hasEverEdited,
                  isSaving: isSavingOrder,
                  testIDPrefix: 'list-detail',
                })
              : null
          }
          actionProgress={editSession.actionProgress}
          testID="list-detail-strip"
        >
          {data.canEdit && rowCount > 0 && data.slice.effectiveSort === 'custom' ? (
            <ListDetailEditChip key="edit" onPress={enterEditMode} />
          ) : null}
          <SelectorChip
            key="sort"
            label={sortChipLabel}
            active={data.slice.effectiveSort !== data.defaultSort}
            expanded={optionSelectorOpenKey === LIST_DETAIL_SORT_SELECTOR_KEY}
            onPress={() =>
              toggleOptionSelector({
                key: LIST_DETAIL_SORT_SELECTOR_KEY,
                title: 'Sort',
                options: sortOptions,
                value: data.slice.effectiveSort,
                onSelect: (value) => data.slice.applySlice({ sort: value }, 'sort'),
                testID: 'list-detail-sort-sheet',
              })
            }
            testID="list-detail-sort-chip"
          />
          <FilterChip
            key="open-now"
            label="Open now"
            active={data.slice.openNow}
            onPress={() => data.slice.applySlice({ openNow: !data.slice.openNow }, 'open_now')}
            testID="list-detail-open-now-chip"
          />
          {/* Leg 10 (defect #4): Price — VALUE-displayed when overridden (§2 chip law). */}
          <SelectorChip
            key="price"
            label={
              data.slice.priceLevel != null
                ? (PRICE_LEVEL_SYMBOLS[data.slice.priceLevel] ?? 'Price')
                : 'Price'
            }
            active={data.slice.priceLevel != null}
            expanded={optionSelectorOpenKey === LIST_DETAIL_PRICE_SELECTOR_KEY}
            onPress={() =>
              toggleOptionSelector({
                key: LIST_DETAIL_PRICE_SELECTOR_KEY,
                title: 'Price',
                options: PRICE_OPTIONS,
                value: data.slice.priceLevel == null ? 'any' : String(data.slice.priceLevel),
                onSelect: (value) =>
                  data.slice.applySlice(
                    { priceLevel: value === 'any' ? null : Number(value) },
                    'price'
                  ),
                testID: 'list-detail-price-sheet',
              })
            }
            testID="list-detail-price-chip"
          />

          {data.isVirtualAll ? (
            // §8.16 "sliced by city": City — VALUE-displayed when overridden
            // (§2 chip law); options derived from the unsliced rows (self-provisioning).
            <SelectorChip
              key="city"
              label={data.slice.cityChipLabel}
              active={data.slice.cityPlaceId != null}
              expanded={optionSelectorOpenKey === LIST_DETAIL_CITY_SELECTOR_KEY}
              onPress={() =>
                toggleOptionSelector({
                  key: LIST_DETAIL_CITY_SELECTOR_KEY,
                  title: 'City',
                  options: [{ value: 'any', label: 'All cities' }, ...data.slice.cityOptions],
                  value: data.slice.cityPlaceId ?? 'any',
                  onSelect: (value) =>
                    data.slice.applySlice({ cityPlaceId: value === 'any' ? null : value }, 'city'),
                  testID: 'list-detail-city-sheet',
                })
              }
              testID="list-detail-city-chip"
            />
          ) : null}
        </ToggleStrip>
      </View>

      {/* Wave-3 §2.8 root fix: the rows are the ResultCard primitive, which carries its
          own 20px gutter (styles.resultItem) — wrapping them in pageBlock DOUBLED the
          inset (20+20) and edit mode narrowed further. Rows ride full-bleed in BOTH
          modes; the card's own padding is THE single gutter (results parity), and the
          reorder handle overlays center-right instead of narrowing the content. */}
      <View>
        {isEditing ? (
          // In-place rich-row edit: the SAME rows, now inside the variable-height slot
          // map (measured per-row heights; the drag handle is the shell affordance).
          <ReorderableRows
            items={orderedEditRows}
            keyExtractor={(row) => row.key}
            rowHeight={EDIT_ROW_HEIGHT_ESTIMATE}
            variableHeights
            renderRowContent={renderEditRowContent}
            onReorder={
              isScreenReaderEnabled
                ? editSession.handleAccessibleReorder
                : editSession.handleReorder
            }
            onDragStateChange={editSession.handleDragStateChange}
            accessibilityMode={isScreenReaderEnabled}
            scrollAdapter={scrollAdapter}
            testIDPrefix="list-detail-edit"
          />
        ) : data.slice.contentPhase === 'awaiting' ? null : rowCount === 0 ? (
          <StateBody message="Nothing saved here yet." testID="list-detail-empty" />
        ) : (
          richRows.map((row, index) => (
            <React.Fragment key={row.key}>{renderRichRowCard(row, index)}</React.Fragment>
          ))
        )}
      </View>

      {/* The collaborator modal renders through the ROOT CollaboratorModalHost
          (collaborator-modal-store sync above) — no panel-local mount. */}
    </View>
  );
});
ListDetailReadyContent.displayName = 'ListDetailReadyContent';

// THE DECLARATION (L2): listDetail is a query+world-backed CONTENT body.
const LIST_DETAIL_PAGE_BODY: PageContentBodySpec<ListDetailPageData> = {
  kind: 'content',
  scene: 'listDetail',
  Content: ListDetailContent,
};

// W1 slice 1 (C2): the ENTRY arrives as a prop from the entry-keyed mount unit — with two
// live listDetail entries (list A → profile → list B) the topmost-per-key read is wrong.
export const ListDetailPanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const queryClient = useQueryClient();
  const { pushRoute, closeActiveRoute } = useAppOverlayRouteController();
  const params: ListDetailParams | null =
    entry?.key === 'listDetail' ? ((entry.params ?? {}) as ListDetailParams) : null;
  const listIdParam = typeof params?.listId === 'string' ? params.listId : null;
  const shareSlug = typeof params?.shareSlug === 'string' ? params.shareSlug : null;
  const targetUserId = typeof params?.targetUserId === 'string' ? params.targetUserId : null;
  const joinIntent = params?.joinIntent === true;
  const worldBackedParam = params?.worldBacked === true;
  // Mouth 5 (wave-4 §3, slug lane): a slug open pushes WITHOUT the world (the listId is
  // unknown until the share meta resolves). Once meta yields the concrete list, dispatch
  // the world half through the SAME launch channel the executor uses — the world then
  // presents under this already-open page exactly like a tap-mouth entry.
  const { dispatchLaunchIntent } = useAppRouteCoordinator();
  const [slugWorldLaunched, setSlugWorldLaunched] = React.useState(false);
  const worldBacked = worldBackedParam || slugWorldLaunched;
  // Leg 4 (design §1.3): the world-bearing X-is-session-close law now DERIVES in the
  // host's close default from entry.desire (stamped at the launch chokepoint) — the
  // per-panel registration this file briefly carried is deleted.
  const warmTitle = typeof params?.title === 'string' && params.title.trim() ? params.title : null;
  const virtualListType =
    listIdParam != null ? (VIRTUAL_LIST_TYPE_BY_ID[listIdParam] ?? null) : null;
  const isVirtualAll = virtualListType != null;
  const hasIdentity = listIdParam != null || shareSlug != null;

  // META — data identity is the LIST (C3: two entries of one list SHARE the cache row; a
  // rename in B must show in A on pop). A slug-only entry (the /l/<slug> lane) resolves the
  // meta through the share endpoint, which also yields the concrete listId for results.
  // Virtual All lists have no stored row: meta is synthesized below, the query stays off.
  const metaQuery = useQuery({
    queryKey: ['listDetail', listIdParam ?? `slug:${shareSlug}`],
    enabled: hasIdentity && !isVirtualAll,
    staleTime: 60_000,
    retry: (failureCount, error) => !isPrivateGoneError(error) && failureCount < 2,
    queryFn: async (): Promise<FavoriteListDetail> =>
      listIdParam != null
        ? favoriteListsService.get(listIdParam, { shareSlug })
        : favoriteListsService.getShared(shareSlug as string),
  });

  const resolvedListId = isVirtualAll
    ? listIdParam
    : (listIdParam ?? metaQuery.data?.list.listId ?? null);
  const listType: FavoriteListType | null =
    virtualListType ?? metaQuery.data?.list.listType ?? null;
  const viewerRole: FavoriteListViewerRole | undefined = isVirtualAll
    ? 'owner'
    : metaQuery.data?.viewerRole;
  const defaultSort: FavoriteListSort = isVirtualAll
    ? 'best'
    : (metaQuery.data?.defaultSort ?? 'best');

  const slugResolvedListId = !worldBackedParam && shareSlug != null ? resolvedListId : null;
  const slugResolvedListType = slugResolvedListId != null ? listType : null;
  const slugResolvedTitle =
    slugResolvedListId != null ? (metaQuery.data?.list.name ?? warmTitle) : null;
  React.useEffect(() => {
    if (
      slugWorldLaunched ||
      slugResolvedListId == null ||
      slugResolvedListType == null ||
      slugResolvedTitle == null
    ) {
      return;
    }
    setSlugWorldLaunched(true);
    dispatchLaunchIntent({
      type: 'entityAction',
      action: {
        kind: 'listWorld',
        listId: slugResolvedListId,
        listType: slugResolvedListType,
        title: slugResolvedTitle,
        shareSlug,
      },
    });
  }, [
    dispatchLaunchIntent,
    shareSlug,
    slugResolvedListId,
    slugResolvedListType,
    slugResolvedTitle,
    slugWorldLaunched,
  ]);

  // Sort strip (§8.14, role-gated): everyone gets the Sort control — the saver's ranking
  // ('custom') is offered when a custom order exists AND, for owner/collaborator, always
  // (selecting it with no custom order yet = insertion order, the edit mode's entry point).
  const [sortOverride, setSortOverride] = React.useState<FavoriteListSort | null>(null);
  const effectiveSort: FavoriteListSort = sortOverride ?? defaultSort;
  // Leg 9 (§2b): Open now joins the strip — already plumbed through the list results read.
  const [openNow, setOpenNow] = React.useState(false);
  // Leg 10 (defect #4 closed): Price joins the strip — the list-results API now takes
  // priceLevels (openNow pattern). v1 vocabulary = exactly-one-level ($ · $$ · $$$ · $$$$)
  // through the option-selector seat; null = any price.
  const [priceLevel, setPriceLevel] = React.useState<number | null>(null);
  // City joins the strip on All lists (§8.16 "sliced by city") — the
  // list-results API takes cityPlaceId (a catalog place id; ground-containment
  // pre-filter). null = all cities. Vocabulary = the cities present in the
  // list (listCities endpoint).
  const [cityPlaceId, setCityPlaceId] = React.useState<string | null>(null);

  // ─── Panel world-read (wave-4 §3): a world-backed entry reads ALL slices from the
  // presented world — the resolver fetched getListResults for this identity, and the
  // strip 'world' flip routes every slice chip through the tuple's filterVariant so the
  // world re-resolves (map pins + cards together). The panel's own query survives only
  // for non-world entries (defensive; slug + tap both world-back today).
  const worldResults = React.useSyncExternalStore(
    subscribeSearchMountedResultsDataSnapshot,
    (): SearchResponse | null => {
      if (!worldBacked || resolvedListId == null) {
        return null;
      }
      const snapshot = getSearchMountedResultsDataSnapshot();
      // Presenter dissolution: match the mounted world by its STRUCTURED identity (the
      // same vocabulary as entry.desire) — the old `favorites:<id>:<ts>` key-prefix
      // parse is dead. Guards the mismatch window (previous world's data still mounted
      // under this panel while its own world resolves).
      const identity = snapshot.resultsQueryIdentity;
      return identity?.kind === 'list' && identity.listId === resolvedListId
        ? snapshot.results
        : null;
    }
  );
  // §Q redo T4 (the JOINT, N-2/P-13) — REBUILT keyless (the first cut kept a SECOND
  // admission store keyed by request strings, and the two sides minted DIFFERENT key
  // vocabularies — presentation keys vs the API's `favorites:<id>:<ts>` — so the gate
  // could only ever resolve via escape hatches and a 900ms fallback; attributed live).
  // The ONE admission truth is the search surface's own reveal collector: a live
  // redraw transaction admits its results body when {cards, nativeMarkerFrame, sheet}
  // readiness joins (canAdmitResultsBody — the exact same gate the results cards and
  // the native enter-start ride). The panel holds its rows while THE live world redraw
  // is unjoined; there is exactly one world surface, so no identity key is needed.
  const worldRevealAdmitted = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => getSearchSurfaceRuntime().subscribe(listener), []),
    () => {
      if (!worldBacked) {
        return true;
      }
      const policy = selectSearchSurfaceVisualPolicy(getSearchSurfaceRuntime().getSnapshot());
      return policy.phase !== 'results_redrawing' || policy.canAdmitResultsBody;
    }
  );
  // LOUD RED instrument (never a mechanism): with the shared seam a hold can only
  // outlive the redraw if the surface itself is stuck — bark so it gets attributed.
  React.useEffect(() => {
    if (!worldBacked || worldResults == null || worldRevealAdmitted) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error(
          `[JOINT] world reveal hold exceeded 1500ms for list ${resolvedListId ?? 'unknown'} — the live redraw transaction never joined (attribute the surface readiness, not this gate)`
        );
      }
    }, 1500);
    return () => clearTimeout(timeout);
  }, [worldBacked, worldResults, worldRevealAdmitted, resolvedListId]);
  // Strip 'world' flip (wave-4 §3): a world-backed list serves ALL slices from the
  // presented world — a strip chip re-slices the WORLD (map pins + cards together),
  // not just the panel's card list. The panel's own query survives only for
  // non-world entries (defensive; slug + tap both world-back today).
  const worldServesResults = worldBacked;
  const resultsQuery = useQuery({
    queryKey: [
      'listDetailResults',
      resolvedListId,
      effectiveSort,
      openNow,
      priceLevel,
      cityPlaceId,
      targetUserId,
    ],
    enabled: resolvedListId != null && !worldServesResults,
    staleTime: 60_000,
    // A slice flip (sort / open-now) keeps the PAGE mounted: previous data rides as
    // placeholder while the content-toggle phase hides the stale rows — the full-page
    // gate below fires only on the true first load (no placeholder yet).
    placeholderData: (previous: SearchResponse | undefined) => previous,
    retry: (failureCount, error) => !isPrivateGoneError(error) && failureCount < 2,
    queryFn: async (): Promise<SearchResponse> =>
      favoriteListsService.getListResults(resolvedListId as string, {
        shareSlug,
        sort: effectiveSort,
        openNow: openNow || undefined,
        priceLevels: priceLevel != null ? [priceLevel] : undefined,
        cityPlaceId,
        targetUserId,
      }),
  });

  // ─── Content-toggle seam (leg 9 §2b): press-up choreography for the strip's slices ────────
  // Content-consequence while the body owns its data fetch; flips to the WORLD class when the
  // §1 trigger rewire lands (the body then reads the presented world and toggles re-slice
  // map + cards through the reconciler).
  const sliceRef = React.useRef({ sort: effectiveSort, openNow, priceLevel, cityPlaceId });
  sliceRef.current = { sort: effectiveSort, openNow, priceLevel, cityPlaceId };
  const { seam: contentSeam, phase: contentPhase } = useContentToggle<
    'sort' | 'open_now' | 'price' | 'city'
  >({
    surfaceName: 'list-detail',
    captureControlBaseline: () => {
      const snapshot = sliceRef.current;
      return () => {
        setSortOverride(snapshot.sort);
        setOpenNow(snapshot.openNow);
        setPriceLevel(snapshot.priceLevel);
        setCityPlaceId(snapshot.cityPlaceId);
      };
    },
  });
  const applySlice = React.useCallback(
    (
      patch: {
        sort?: FavoriteListSort;
        openNow?: boolean;
        priceLevel?: number | null;
        cityPlaceId?: string | null;
      },
      kind: 'sort' | 'open_now' | 'price' | 'city'
    ) => {
      if (resolvedListId == null) {
        return;
      }
      if (patch.sort !== undefined) {
        setSortOverride(patch.sort);
      }
      if (patch.openNow !== undefined) {
        setOpenNow(patch.openNow);
      }
      if (patch.priceLevel !== undefined) {
        setPriceLevel(patch.priceLevel);
      }
      if (patch.cityPlaceId !== undefined) {
        setCityPlaceId(patch.cityPlaceId);
      }
      contentSeam.scheduleCommit(
        async () => {
          // Read the SETTLED control values at run time (the burst's last state), never
          // the press closure — coalesced bursts commit once against the final slice.
          const slice = sliceRef.current;
          if (worldServesResults && listType != null) {
            // Strip 'world' flip: re-slice the WORLD. The launch consumer writes the
            // new filterVariant (cause list_reslice) → the reconciler re-resolves the
            // same list identity as a variant_rerun → map pins + cards re-slice
            // together; the world-read seam updates `response` reactively.
            dispatchLaunchIntent({
              type: 'entityAction',
              action: {
                kind: 'listWorld',
                listId: resolvedListId,
                listType,
                title: metaQuery.data?.list.name ?? warmTitle ?? '',
                ...(targetUserId != null ? { targetUserId } : {}),
                ...(shareSlug != null ? { shareSlug } : {}),
                slice: {
                  // Carry sort ONLY when it's an explicit non-default choice — a sort
                  // equal to the list's own defaultSort is the ABSENCE of a choice, and
                  // keying it would mint a redundant world distinct from the initial
                  // enter (same members), the same key-pollution class as the bounds fix.
                  ...(slice.sort !== defaultSort ? { sort: slice.sort } : {}),
                  openNow: slice.openNow,
                  priceLevels: slice.priceLevel != null ? [slice.priceLevel] : [],
                  cityPlaceId: slice.cityPlaceId,
                },
              },
            });
            return;
          }
          await queryClient.fetchQuery({
            queryKey: [
              'listDetailResults',
              resolvedListId,
              slice.sort,
              slice.openNow,
              slice.priceLevel,
              slice.cityPlaceId,
              targetUserId,
            ],
            staleTime: 60_000,
            queryFn: async (): Promise<SearchResponse> =>
              favoriteListsService.getListResults(resolvedListId, {
                shareSlug,
                sort: slice.sort,
                openNow: slice.openNow || undefined,
                priceLevels: slice.priceLevel != null ? [slice.priceLevel] : undefined,
                cityPlaceId: slice.cityPlaceId,
                targetUserId,
              }),
          });
        },
        { kind }
      );
    },
    [
      contentSeam,
      defaultSort,
      dispatchLaunchIntent,
      listType,
      metaQuery.data?.list.name,
      queryClient,
      resolvedListId,
      shareSlug,
      targetUserId,
      warmTitle,
      worldServesResults,
    ]
  );

  // ─── Collaborators (§8.1): roster query + chip + modal state ──────────────────────────────
  const canReadCollaborators = !isVirtualAll && resolvedListId != null && metaQuery.data != null;
  const collaboratorsQuery = useQuery({
    queryKey: ['listCollaborators', resolvedListId],
    enabled: canReadCollaborators,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<FavoriteListCollaborators> =>
      favoriteListsService.getCollaborators(resolvedListId as string, { shareSlug }),
  });
  const meQuery = useQuery({
    queryKey: ['me'],
    enabled: canReadCollaborators,
    staleTime: 300_000,
    queryFn: () => usersService.getMe(),
  });
  const [collaboratorModalVisible, setCollaboratorModalVisible] = React.useState(false);
  const [inviteState, setInviteState] = React.useState<'idle' | 'copied' | 'unavailable'>('idle');
  const [isJoining, setIsJoining] = React.useState(false);

  const handleCopyInvite = React.useCallback(async () => {
    if (resolvedListId == null) {
      return;
    }
    try {
      // v1 invite = the list's share URL with the join intent marker
      // (<share-base>/l/<slug>?join=1); the universal share modal replaces this in W3.
      let slug = metaQuery.data?.list.shareEnabled ? (metaQuery.data.list.shareSlug ?? null) : null;
      if (slug == null) {
        if (viewerRole !== 'owner') {
          // Only the owner can (re)enable sharing — surface the honest state.
          setInviteState('unavailable');
          return;
        }
        const enabled = await favoriteListsService.enableShare(resolvedListId);
        slug = enabled.shareSlug;
        await queryClient.invalidateQueries({ queryKey: ['listDetail', resolvedListId] });
      }
      const inviteUrl = `${SHARE_BASE_URL}${serializeDesireLinkToPath({
        kind: 'sharedList',
        shareSlug: slug,
        joinIntent: true,
      })}`;
      setClipboardString(inviteUrl);
      setInviteState('copied');
    } catch {
      announceFailureIfOnline();
    }
  }, [metaQuery.data, queryClient, resolvedListId, viewerRole]);

  const handleOpenProfile = React.useCallback(
    (userId: string) => {
      setCollaboratorModalVisible(false);
      pushRoute('userProfile', { userId });
    },
    [pushRoute]
  );

  const invalidateRoster = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['listCollaborators', resolvedListId] }),
      queryClient.invalidateQueries({
        queryKey: ['listDetail', listIdParam ?? `slug:${shareSlug}`],
      }),
    ]);
  }, [listIdParam, queryClient, resolvedListId, shareSlug]);

  const handleKick = React.useCallback(
    async (userId: string) => {
      if (resolvedListId == null) {
        return;
      }
      try {
        await favoriteListsService.removeCollaborator(resolvedListId, userId);
      } catch {
        announceFailureIfOnline();
        return;
      }
      await invalidateRoster();
    },
    [invalidateRoster, resolvedListId]
  );

  const handleLeave = React.useCallback(async () => {
    const myUserId = meQuery.data?.userId;
    if (resolvedListId == null || myUserId == null) {
      return;
    }
    try {
      await favoriteListsService.removeCollaborator(resolvedListId, myUserId);
    } catch {
      announceFailureIfOnline();
      return;
    }
    setCollaboratorModalVisible(false);
    await invalidateRoster();
  }, [invalidateRoster, meQuery.data, resolvedListId]);

  // ─── The collaborator modal rides the ROOT CollaboratorModalHost (leg 12) ──────────────────
  // A panel-local OverlayModalSheet mount is WRONG by construction: absoluteFill inside the
  // scrollable body anchors to the CONTENT box, so on a long list the sheet lands at
  // content-bottom, offscreen (sim RED: dimmed backdrop, no sheet in the viewport). The panel
  // keeps visible/inviteState authority and SYNCS the store — show() is idempotent, so roster
  // refetches (kick) and inviteState flips update the OPEN modal in place. Effects DO fire
  // here (this is the mounted panel body, not a scene body-spec hook).
  const roster = collaboratorsQuery.data ?? null;
  const closeCollaboratorRosterModal = React.useCallback(() => {
    setCollaboratorModalVisible(false);
    setInviteState('idle');
  }, []);
  const handleShareListFromRoster = React.useCallback(() => {
    if (resolvedListId == null) {
      return;
    }
    closeCollaboratorRosterModal();
    showShareModal({
      kind: 'list',
      id: resolvedListId,
      title: metaQuery.data?.list.name,
      listShareSlug: metaQuery.data?.list.shareEnabled
        ? (metaQuery.data.list.shareSlug ?? null)
        : null,
      listOwnedByViewer: viewerRole === 'owner',
    });
  }, [closeCollaboratorRosterModal, metaQuery.data, resolvedListId, viewerRole]);
  const collaboratorModalPayload = React.useMemo<CollaboratorModalPayload | null>(
    () =>
      collaboratorModalVisible && roster != null
        ? {
            roster,
            viewerRole,
            myUserId: meQuery.data?.userId ?? null,
            inviteState,
            onCopyInvite: () => void handleCopyInvite(),
            onShareList: handleShareListFromRoster,
            onOpenProfile: handleOpenProfile,
            onKick: (userId: string) => void handleKick(userId),
            onLeave: () => void handleLeave(),
            onRequestClose: closeCollaboratorRosterModal,
          }
        : null,
    [
      closeCollaboratorRosterModal,
      collaboratorModalVisible,
      handleCopyInvite,
      handleKick,
      handleLeave,
      handleOpenProfile,
      handleShareListFromRoster,
      inviteState,
      meQuery.data,
      roster,
      viewerRole,
    ]
  );
  React.useEffect(() => {
    if (collaboratorModalPayload != null) {
      showCollaboratorModal(collaboratorModalPayload);
    } else {
      closeCollaboratorModal();
    }
  }, [collaboratorModalPayload]);
  // Panel unmount (dismiss/nav-out) takes the modal with it.
  React.useEffect(() => () => closeCollaboratorModal(), []);

  // JOIN flow (§8.1): offered ONLY when the entry came from an invite-intent link
  // (crave://l/<slug>?join=1) and the viewer holds no role yet.
  const showJoinAffordance =
    joinIntent && shareSlug != null && resolvedListId != null && viewerRole === 'viewer';
  const handleJoin = React.useCallback(async () => {
    if (resolvedListId == null || shareSlug == null || isJoining) {
      return;
    }
    setIsJoining(true);
    try {
      await favoriteListsService.joinCollaborators(resolvedListId, shareSlug);
    } catch {
      setIsJoining(false);
      announceFailureIfOnline();
      return;
    }
    // Re-query meta: viewerRole flips collaborator, unlocking the edit affordances.
    await invalidateRoster();
    setIsJoining(false);
  }, [invalidateRoster, isJoining, resolvedListId, shareSlug]);

  // ─── Edit mode (§8.11 within-list half) ────────────────────────────────────────────────────
  const canEdit = !isVirtualAll && (viewerRole === 'owner' || viewerRole === 'collaborator');
  // §7.1: add-tile on the photo strip exists only in the viewer's OWN lists —
  // role-based, and the virtual All list (role 'owner') qualifies too.
  const canAddPhoto = viewerRole === 'owner' || viewerRole === 'collaborator';

  const response = worldServesResults ? worldResults : (resultsQuery.data ?? null);

  // City vocabulary (markets extermination leg 3): the CITIES PRESENT IN THE
  // LIST — distinct catalog places whose ground covers the list's restaurant
  // locations (§8.16 "sliced by city"; self-provisioning from the list's own
  // rows, no market table).
  const listCitiesQuery = useQuery({
    queryKey: ['listDetailCities', resolvedListId, targetUserId],
    enabled: isVirtualAll && resolvedListId != null,
    staleTime: 300_000,
    queryFn: () =>
      favoriteListsService.listCities(resolvedListId as string, {
        shareSlug,
        targetUserId,
      }),
  });
  const cityOptions = React.useMemo(
    () =>
      (listCitiesQuery.data ?? []).map((city) => ({
        value: city.placeId,
        label: city.name,
      })),
    [listCitiesQuery.data]
  );
  const cityChipLabel =
    cityPlaceId != null
      ? (cityOptions.find((option) => option.value === cityPlaceId)?.label ?? 'City')
      : 'City';
  // ─── Header seat (leg 9 §2a/§2 charter): name-as-header + the ellipsis menu ────────────────
  const resolvedName = isVirtualAll
    ? listType === 'restaurant'
      ? 'All restaurants'
      : 'All dishes'
    : (metaQuery.data?.list.name ?? warmTitle);

  const invalidateListReads = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['listDetail', listIdParam ?? `slug:${shareSlug}`],
      }),
      queryClient.invalidateQueries({ queryKey: favoriteListKeys.all }),
    ]);
  }, [listIdParam, queryClient, shareSlug]);

  const runListUpdate = React.useCallback(
    async (payload: Parameters<typeof favoriteListsService.update>[1]) => {
      if (resolvedListId == null) {
        return;
      }
      try {
        await favoriteListsService.update(resolvedListId, payload);
      } catch {
        announceFailureIfOnline();
        return;
      }
      await invalidateListReads();
    },
    [invalidateListReads, resolvedListId]
  );

  // Wave-3 §4: the metadata seat is the ONE listEdit panel — the old "Rename" prompt
  // row is renamed "Edit" and opens listEdit(edit, prefilled) (name / description /
  // visibility together), same surface the home plus opens in create mode.
  const openListEdit = React.useCallback(() => {
    const list = metaQuery.data?.list;
    if (list == null) {
      return;
    }
    showListEdit({
      mode: 'edit',
      listId: list.listId,
      name: list.name,
      description: list.description ?? null,
      visibility: list.visibility,
    });
  }, [metaQuery.data]);

  const handleDeleteList = React.useCallback(async () => {
    if (resolvedListId == null) {
      return;
    }
    try {
      await favoriteListsService.remove(resolvedListId);
    } catch {
      announceFailureIfOnline();
      return;
    }
    await queryClient.invalidateQueries({ queryKey: favoriteListKeys.all });
    closeActiveRoute();
  }, [closeActiveRoute, queryClient, resolvedListId]);

  // The §2 ellipsis menu (AppModal 'menu' variant — the restyled list modal), plus the
  // leg-9 Rename seat. Share for every role; the curation rows are owner-only.
  const openHeaderMenu = React.useCallback(() => {
    const detail = metaQuery.data;
    if (detail == null || resolvedListId == null) {
      return;
    }
    const list = detail.list;
    const isOwner = viewerRole === 'owner';
    const isPublic = list.visibility === 'public';
    const usesOwnPhotos = list.useOwnPhotos === true;
    const isPinned = list.pinned === true;
    showAppModal({
      title: list.name,
      variant: 'menu',
      actions: [
        {
          label: 'Share',
          icon: <Share2 size={19} color="#0f172a" strokeWidth={2} />,
          onPress: () =>
            showShareModal({
              kind: 'list',
              id: resolvedListId,
              title: list.name,
              listShareSlug: list.shareEnabled ? (list.shareSlug ?? null) : null,
              listOwnedByViewer: isOwner,
            }),
        },
        ...(isOwner
          ? [
              {
                label: 'Edit',
                icon: <Pencil size={19} color="#0f172a" strokeWidth={2} />,
                onPress: openListEdit,
              },
              {
                label: 'Delete',
                style: 'destructive' as const,
                icon: <Trash2 size={19} color="#ef4444" strokeWidth={2} />,
                onPress: () => void handleDeleteList(),
              },
              {
                label: isPublic ? 'Remove from profile' : 'Add to profile',
                icon: isPublic ? (
                  <EyeOff size={19} color="#0f172a" strokeWidth={2} />
                ) : (
                  <Eye size={19} color="#0f172a" strokeWidth={2} />
                ),
                onPress: () => void runListUpdate({ visibility: isPublic ? 'private' : 'public' }),
              },
              {
                label: usesOwnPhotos ? 'Use Crave photos' : 'Use your photos',
                icon: <Images size={19} color="#0f172a" strokeWidth={2} />,
                onPress: () => void runListUpdate({ useOwnPhotos: !usesOwnPhotos }),
              },
              {
                label: isPinned ? 'Unpin from profile' : 'Pin on profile',
                icon: isPinned ? (
                  <PinOff size={19} color="#0f172a" strokeWidth={2} />
                ) : (
                  <Pin size={19} color="#0f172a" strokeWidth={2} />
                ),
                onPress: () => void runListUpdate({ pinned: !isPinned }),
              },
            ]
          : []),
      ],
    });
  }, [handleDeleteList, metaQuery.data, openListEdit, resolvedListId, runListUpdate, viewerRole]);

  // Publish the header seat for THIS entry (Title + Extras read the topmost entry's seat).
  const openHeaderMenuRef = React.useRef(openHeaderMenu);
  openHeaderMenuRef.current = openHeaderMenu;
  const entryId = entry?.entryId ?? null;
  const hasHeaderMenu = !isVirtualAll && metaQuery.data != null;
  React.useEffect(() => {
    if (entryId == null) {
      return undefined;
    }
    return publishListDetailHeaderSeat(entryId, {
      name: resolvedName,
      openMenu: hasHeaderMenu ? () => openHeaderMenuRef.current() : null,
    });
  }, [entryId, hasHeaderMenu, resolvedName]);

  // ─── Controller commands crossing the data seam ────────────────────────────────────
  const openCollaboratorRoster = React.useCallback(() => {
    setCollaboratorModalVisible(true);
  }, []);
  const onOrderSaved = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['listDetailResults', resolvedListId] });
    await queryClient.invalidateQueries({
      queryKey: ['listDetail', listIdParam ?? `slug:${shareSlug}`],
    });
    setSortOverride('custom');
  }, [listIdParam, queryClient, resolvedListId, shareSlug]);
  // Dead slug (sharing revoked — the only way link access dies): 410 {state:'private'}
  // on either read → a RESOLVED private-gone answer, excluded from the error edge.
  const isPrivateGone =
    isPrivateGoneError(metaQuery.error) || isPrivateGoneError(resultsQuery.error);

  const isMetaPending = !isVirtualAll && metaQuery.isPending;
  // World-backed default slice: "pending" = the world hasn't presented yet (a failed
  // enter pops the page via the §1 failure policy before this ever strands).
  const isResultsPending =
    resolvedListId != null &&
    (worldServesResults ? worldResults == null || !worldRevealAdmitted : resultsQuery.isPending);
  const listDetailData: ListDetailPageData | null = isPrivateGone
    ? { kind: 'privateGone' }
    : listType != null && response != null && resolvedListId != null
      ? {
          kind: 'ready',
          resolvedListId,
          listType,
          viewerRole,
          defaultSort,
          isVirtualAll,
          canEdit,
          canAddPhoto,
          response,
          roster,
          entryId,
          showJoinAffordance,
          isJoining,
          onJoin: handleJoin,
          openCollaboratorRoster,
          onOrderSaved,
          slice: {
            effectiveSort,
            openNow,
            priceLevel,
            cityPlaceId,
            cityOptions,
            cityChipLabel,
            applySlice,
            contentPhase,
          },
        }
      : null;
  const bodyState = resolvePageContentBodyState<ListDetailPageData>({
    isPending: isMetaPending || isResultsPending,
    isError:
      !hasIdentity ||
      (metaQuery.isError && !isPrivateGone) ||
      (resultsQuery.isError && !isPrivateGone),
    what: 'this list',
    data: listDetailData,
  });
  return <PageBodyShell spec={LIST_DETAIL_PAGE_BODY} state={bodyState} />;
});
ListDetailPanelBody.displayName = 'ListDetailPanelBody';

// ─── Persistent header (leg 9 §2a): the LIST NAME is the title; ellipsis = Extras ───────────
// Title paints synchronously from the entry's warm-seeded `title` param (tap label) or the
// body-published seat (slug opens resolve at meta time); only a cold slug open with no seed
// skeletonizes the title (the restaurant pattern).
const ListDetailPersistentHeaderTitle = React.memo(() => {
  const { entry, seat } = useTopMostListDetailHeaderSeat();
  const entryParams = (entry?.params ?? null) as ListDetailParams | null;
  const warmTitle =
    typeof entryParams?.title === 'string' && entryParams.title.trim() ? entryParams.title : null;
  const name = seat?.name ?? warmTitle;
  if (!name) {
    return <CutoutSkeletonShape width={150} height={18} />;
  }
  return <ChromeTitleText testID="list-detail-name">{toSingleLineText(name)}</ChromeTitleText>;
});
ListDetailPersistentHeaderTitle.displayName = 'ListDetailPersistentHeaderTitle';

// Leg 9 §2a: the header ellipsis fades in LEFT of the host-owned plus→X control, riding the
// SAME transition-progress SV as the rotation (starts on press-up by construction — the
// leg-6 extras seam). Opens the §2 list menu (Share · Rename · Delete · profile visibility ·
// photos source · pin) published by the topmost entry's body.
const ListDetailPersistentHeaderExtras = React.memo(
  ({ transitionProgress }: PersistentHeaderExtrasProps) => {
    const { seat } = useTopMostListDetailHeaderSeat();
    const revealStyle = useAnimatedStyle(
      () => ({ opacity: transitionProgress.value }),
      [transitionProgress]
    );
    const openMenu = seat?.openMenu ?? null;
    if (openMenu == null) {
      return null;
    }
    return (
      <Animated.View style={revealStyle}>
        <Pressable
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="List options"
          hitSlop={8}
          style={styles.headerEllipsisButton}
          testID="list-detail-header-ellipsis"
        >
          <MoreHorizontal size={20} color="#0f172a" strokeWidth={2.5} />
        </Pressable>
      </Animated.View>
    );
  }
);
ListDetailPersistentHeaderExtras.displayName = 'ListDetailPersistentHeaderExtras';

registerPersistentHeaderDescriptor('listDetail', {
  Title: ListDetailPersistentHeaderTitle,
  Extras: ListDetailPersistentHeaderExtras,
});

const styles = StyleSheet.create({
  body: {
    paddingBottom: 16,
  },
  // Leg 9: the transport carries NO horizontal inset (full-bleed strip law) — every
  // non-strip block pads itself to the page gutter.
  pageBlock: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  // Bottom edge = the ONE band-block seam (strip-band seam law §1); top stays scene
  // content spacing.
  stripBlock: {
    marginTop: 14,
    marginBottom: STRIP_BAND_BOTTOM_SPACER_HEIGHT,
  },
  // §2a meta row: avatar stack flush under the header + username · dot · typed count.
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaText: {
    flexShrink: 1,
    color: '#64748b',
  },
  headerEllipsisButton: {
    padding: 6,
  },
  // Collaborator chip
  collabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  avatarCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  plusCircle: {
    width: CHIP_AVATAR_SIZE,
    height: CHIP_AVATAR_SIZE,
    borderRadius: CHIP_AVATAR_SIZE / 2,
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    zIndex: 2,
  },
  collabOverlap: {
    marginLeft: -8,
  },
  collabOverflowText: {
    color: '#64748b',
    marginLeft: 8,
  },
  // Join banner
  joinBanner: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 160,
    alignItems: 'center',
  },
  joinBannerText: {
    color: '#ffffff',
  },
  // Strip citizens. Wave-3 §2.1 restyle: the Edit chip is a CLEAN CUTOUT — no border,
  // no white pill-in-a-window; the frosted cutout window itself is the button shape
  // (exactly the FilterChip composition its siblings use).
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  editChipText: {
    color: '#0f172a',
  },
  // Edit rows — the lifted RICH row's picked-up treatment (rows otherwise render
  // exactly as in read mode; spacing lives inside the row so measured heights are true).
  richRowActive: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  stateBody: {
    paddingBottom: 48,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
  },
});
