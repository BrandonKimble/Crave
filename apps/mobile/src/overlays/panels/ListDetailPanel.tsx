import React from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { X as LucideX } from 'lucide-react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '../../components';
import { PhotoStrip } from '../../components/photos/PhotoStrip';
import { announceFailureIfOnline } from '../../components/app-modal-store';
import {
  ReorderableRows,
  useIsScreenReaderEnabled,
  type ReorderScrollAdapter,
} from '../../components/reorder';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import OverlayModalSheet from '../OverlayModalSheet';
import { getOverlaySceneScrollHandle } from '../overlaySceneScrollHandleRegistry';
import { acquireOverlaySheetEditLock } from '../overlaySheetEditLockRuntime';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { serializeDesireLinkToPath } from '../../navigation/runtime/desire-url-codec';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import {
  favoriteListsService,
  type FavoriteListCollaborators,
  type FavoriteListDetail,
  type FavoriteListPerson,
  type FavoriteListSort,
  type FavoriteListType,
  type FavoriteListViewerRole,
} from '../../services/favorite-lists';
import { usersService } from '../../services/users';
import type { FoodResult, RestaurantResult, SearchResponse } from '../../types';

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
// Rows are CLEAN SIMPLE ROWS v1 (name, score dot, note under a PhotoStrip placeholder): the
// results-sheet renderer (restaurant-result-card) is search-surface-entangled (descriptor +
// world plumbing), and the spec's fallback names exactly this shape. No FlashList — rows ride
// the leg's shared mounted-scroll container (the MVCP law is moot without a virtualized list).
//
// EDIT MODE (§8.11 within-list half — the BookmarksPanel morph, mirrored): owner/collaborator
// on a CONCRETE list, while sort = the saver's ranking, gets an Edit chip; entering morphs the
// strip to [Cancel | Undo Redo | Save], glides the sheet to top + acquires the edit lock, and
// linearizes the rows into ReorderableRows (compact fixed-height rows — the drag primitive
// requires uniform slots). Save = ONE batch PATCH /items/order with orderedItemIds (each
// results row carries its favoriteListItemId projection), then re-queries on sort=custom.

type ListDetailParams = {
  listId?: string | null;
  shareSlug?: string | null;
  targetUserId?: string | null;
  joinIntent?: boolean | null;
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

const STRIP_MORPH_MS = 240;
const EDIT_ROW_HEIGHT = 64;

// ─── Monogram avatar (§8.1: first-letter on a DETERMINISTIC-random color) ───────────────────
const MONOGRAM_COLORS = [
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#6366f1',
  '#14b8a6',
] as const;

const monogramColorFor = (userId: string): string => {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length];
};

const personDisplayName = (person: FavoriteListPerson): string =>
  person.displayName?.trim() || person.username?.trim() || 'Crave member';

const PersonAvatar = ({ person, size }: { person: FavoriteListPerson; size: number }) => {
  const title = personDisplayName(person);
  // NOTE: avatarUrl renders would use Image; every roster read supplies the monogram
  // fallback, and v1 keeps the chip Image-free (roster avatars are rare pre-launch).
  return (
    <View
      style={[
        styles.avatarCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: monogramColorFor(person.userId),
        },
      ]}
    >
      <Text variant="caption" weight="semibold" style={styles.avatarInitial}>
        {title.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
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
        <Feather name="plus" size={14} color="#0f172a" />
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

// ─── The ONE collaborator modal (§8.1, scrollable OverlayModalSheet) ─────────────────────────
type CollaboratorModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  roster: FavoriteListCollaborators;
  viewerRole: FavoriteListViewerRole | undefined;
  myUserId: string | null;
  inviteState: 'idle' | 'copied' | 'unavailable';
  onCopyInvite: () => void;
  onOpenProfile: (userId: string) => void;
  onKick: (userId: string) => void;
  onLeave: () => void;
};

const CollaboratorPersonRow = ({
  person,
  badge,
  canKick,
  canLeave,
  onOpenProfile,
  onKick,
  onLeave,
}: {
  person: FavoriteListPerson;
  badge: string | null;
  canKick: boolean;
  canLeave: boolean;
  onOpenProfile: (userId: string) => void;
  onKick: (userId: string) => void;
  onLeave: () => void;
}) => {
  // Owner kick affordance = ellipsis-reveal (§8.1: "swipe-left or ellipsis-reveal delete";
  // v1 ships the ellipsis path — no swipeable dependency on the modal surface).
  const [revealKick, setRevealKick] = React.useState(false);
  return (
    <View style={styles.personRow} testID={`collaborator-row-${person.userId}`}>
      <Pressable
        onPress={() => onOpenProfile(person.userId)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${personDisplayName(person)}'s profile`}
        style={styles.personRowMain}
      >
        <PersonAvatar person={person} size={36} />
        <View style={styles.personRowText}>
          <Text variant="body" weight="semibold" numberOfLines={1} style={styles.personName}>
            {personDisplayName(person)}
          </Text>
          {badge ? (
            <Text variant="caption" style={styles.personBadge}>
              {badge}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {canLeave ? (
        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel="Leave this list"
          testID="collaborator-leave"
          style={styles.leaveButton}
        >
          <Text variant="caption" weight="semibold" style={styles.leaveText}>
            Leave
          </Text>
        </Pressable>
      ) : null}
      {canKick ? (
        revealKick ? (
          <Pressable
            onPress={() => onKick(person.userId)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${personDisplayName(person)}`}
            testID={`collaborator-kick-${person.userId}`}
            style={styles.kickButton}
          >
            <Text variant="caption" weight="semibold" style={styles.kickText}>
              Remove
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setRevealKick(true)}
            accessibilityRole="button"
            accessibilityLabel="Collaborator actions"
            hitSlop={8}
            testID={`collaborator-ellipsis-${person.userId}`}
            style={styles.personEllipsis}
          >
            <Feather name="more-horizontal" size={18} color="#64748b" />
          </Pressable>
        )
      ) : null}
    </View>
  );
};

const CollaboratorModal = ({
  visible,
  onRequestClose,
  roster,
  viewerRole,
  myUserId,
  inviteState,
  onCopyInvite,
  onOpenProfile,
  onKick,
  onLeave,
}: CollaboratorModalProps) => (
  <OverlayModalSheet
    visible={visible}
    onRequestClose={onRequestClose}
    scrollable
    paddingTop={26}
    paddingHorizontal={24}
    minBottomPadding={18}
  >
    <Text variant="subtitle" weight="semibold" style={styles.modalTitle}>
      Collaborators
    </Text>
    {/* Row 1 — Add collaborator. v1 = copy the invite link (the universal share modal
        replaces this in W3); recipients open the link and join as collaborators. */}
    <Pressable
      onPress={onCopyInvite}
      accessibilityRole="button"
      accessibilityLabel="Add collaborator"
      testID="collaborator-add"
      style={styles.personRow}
    >
      <View style={styles.personRowMain}>
        <View style={[styles.avatarCircle, styles.plusCircleLarge]}>
          <Feather name="plus" size={18} color="#0f172a" />
        </View>
        <View style={styles.personRowText}>
          <Text variant="body" weight="semibold" style={styles.personName}>
            Add collaborator
          </Text>
          <Text variant="caption" style={styles.personBadge}>
            {inviteState === 'copied'
              ? 'Invite link copied'
              : inviteState === 'unavailable'
                ? 'Ask the owner to turn on sharing'
                : 'Copy an invite link — anyone with it can join'}
          </Text>
        </View>
      </View>
      <Feather
        name={inviteState === 'copied' ? 'check' : 'link'}
        size={18}
        color={inviteState === 'copied' ? '#16a34a' : '#64748b'}
      />
    </Pressable>
    <CollaboratorPersonRow
      person={roster.owner}
      badge="Owner"
      canKick={false}
      canLeave={false}
      onOpenProfile={onOpenProfile}
      onKick={onKick}
      onLeave={onLeave}
    />
    {roster.collaborators.map((person) => (
      <CollaboratorPersonRow
        key={person.userId}
        person={person}
        badge="Collaborator"
        canKick={viewerRole === 'owner'}
        canLeave={viewerRole === 'collaborator' && person.userId === myUserId}
        onOpenProfile={onOpenProfile}
        onKick={onKick}
        onLeave={onLeave}
      />
    ))}
  </OverlayModalSheet>
);

// ─── Sort/edit toggle strip (§8.11 within-list half — the Bookmarks morph, mirrored) ────────
const SortChip = ({
  label,
  isSelected,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  isSelected: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID: string;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected, disabled: Boolean(disabled) }}
    accessibilityLabel={`Sort: ${label}`}
    testID={testID}
    style={[
      styles.sortChip,
      isSelected && styles.sortChipSelected,
      disabled && styles.sortChipDisabled,
    ]}
  >
    <Text
      variant="caption"
      weight="semibold"
      style={isSelected ? styles.sortChipTextSelected : styles.sortChipText}
    >
      {label}
    </Text>
  </Pressable>
);

type ListDetailStripProps = {
  effectiveSort: FavoriteListSort;
  onSelectSort: (sort: FavoriteListSort) => void;
  hasCustomSortOption: boolean;
  customSortLabel: string;
  showMarketChip: boolean;
  canEdit: boolean;
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

const ListDetailToggleStrip = ({
  effectiveSort,
  onSelectSort,
  hasCustomSortOption,
  customSortLabel,
  showMarketChip,
  canEdit,
  isEditing,
  onEnterEdit,
  onCancelEdit,
  onUndo,
  onRedo,
  onSaveEdit,
  canUndo,
  canRedo,
  isSaving,
}: ListDetailStripProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const [stripWidth, setStripWidth] = React.useState(windowWidth);
  const morphProgress = useSharedValue(0);
  React.useEffect(() => {
    morphProgress.value = withTiming(isEditing ? 1 : 0, { duration: STRIP_MORPH_MS });
  }, [isEditing, morphProgress]);

  const normalStripStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: morphProgress.value * stripWidth }] }),
    [stripWidth]
  );
  const editStripStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: (morphProgress.value - 1) * stripWidth }] }),
    [stripWidth]
  );

  return (
    <View
      style={styles.stripViewport}
      onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
      testID="list-detail-sort-strip"
    >
      <Animated.View
        style={[styles.stripRow, normalStripStyle]}
        pointerEvents={isEditing ? 'none' : 'auto'}
      >
        {canEdit && effectiveSort === 'custom' ? (
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
              testID="list-detail-edit-toggle"
            >
              <Feather name="edit-2" size={14} color="#0f172a" />
              <Text variant="caption" weight="semibold" style={styles.editChipText}>
                Edit
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
        {hasCustomSortOption ? (
          <Animated.View layout={LinearTransition.duration(STRIP_MORPH_MS)}>
            <SortChip
              label={customSortLabel}
              isSelected={effectiveSort === 'custom'}
              onPress={() => onSelectSort('custom')}
              testID="list-detail-sort-custom"
            />
          </Animated.View>
        ) : null}
        <Animated.View layout={LinearTransition.duration(STRIP_MORPH_MS)}>
          <SortChip
            label={SORT_LABELS.best}
            isSelected={effectiveSort === 'best'}
            onPress={() => onSelectSort('best')}
            testID="list-detail-sort-best"
          />
        </Animated.View>
        <Animated.View layout={LinearTransition.duration(STRIP_MORPH_MS)}>
          <SortChip
            label={SORT_LABELS.recent}
            isSelected={effectiveSort === 'recent'}
            onPress={() => onSelectSort('recent')}
            testID="list-detail-sort-recent"
          />
        </Animated.View>
        {showMarketChip ? (
          // §8.14 virtual-All market filter — HONEST disabled state: the favorites results
          // rows carry no marketKey (server projects `marketKey: undefined`) and the results
          // DTO takes no market param, so there is no data path to filter on yet.
          <Animated.View layout={LinearTransition.duration(STRIP_MORPH_MS)}>
            <SortChip
              label="Market · soon"
              isSelected={false}
              disabled
              testID="list-detail-market-chip"
            />
          </Animated.View>
        ) : null}
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
          testID="list-detail-edit-cancel"
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
            testID="list-detail-edit-undo"
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
            testID="list-detail-edit-redo"
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
          testID="list-detail-edit-save"
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
};

// ─── Rows ────────────────────────────────────────────────────────────────────────────────────
const ScoreDot = ({ score }: { score: number | null | undefined }) => (
  <View style={styles.scoreGroup}>
    <View style={styles.scoreDot} />
    <Text variant="caption" weight="semibold" style={styles.scoreText}>
      {typeof score === 'number' ? score.toFixed(1) : '–'}
    </Text>
  </View>
);

const ListDetailRow = ({
  title,
  subtitle,
  score,
  note,
  testID,
}: {
  title: string;
  subtitle?: string | null;
  score: number | null | undefined;
  note?: string | null;
  testID: string;
}) => (
  <View style={styles.row} testID={testID}>
    <View style={styles.rowHeader}>
      <View style={styles.rowTitleGroup}>
        <Text variant="body" weight="semibold" numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ScoreDot score={score} />
    </View>
    <PhotoStrip photos={[]} height={56} />
    {note ? (
      <Text variant="caption" style={styles.rowNote} testID={`${testID}-note`}>
        {note}
      </Text>
    ) : null}
  </View>
);

const StateBody = ({
  message,
  testID,
  onRetry,
}: {
  message: string;
  testID: string;
  onRetry?: () => void;
}) => (
  <View style={styles.stateBody} testID={testID}>
    <Text variant="body" style={styles.stateText}>
      {message}
    </Text>
    {onRetry ? (
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading list"
        testID="list-detail-retry"
        style={styles.retryButton}
      >
        <Text variant="body" weight="semibold" style={styles.retryText}>
          Retry
        </Text>
      </Pressable>
    ) : null}
  </View>
);

// ─── Edit session (§8.11 — order history mirrors the BookmarksPanel session) ────────────────
type ListDetailEditRow = {
  /** The row's stable entity key (restaurantId / connectionId). */
  key: string;
  /** The FavoriteListItem id backing the row (the reorder PATCH vocabulary). */
  itemId: string | null;
  title: string;
  subtitle: string | null;
};

type ListDetailEditSession = {
  order: readonly string[];
  history: readonly (readonly string[])[];
  historyIndex: number;
};

const applyMove = (order: readonly string[], from: number, to: number): string[] => {
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

// W1 slice 1 (C2): the ENTRY arrives as a prop from the entry-keyed mount unit — with two
// live listDetail entries (list A → profile → list B) the topmost-per-key read is wrong.
export const ListDetailPanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const queryClient = useQueryClient();
  const { pushRoute, promoteActiveSheet } = useAppOverlayRouteController();
  const params: ListDetailParams | null =
    entry?.key === 'listDetail' ? ((entry.params ?? {}) as ListDetailParams) : null;
  const listIdParam = typeof params?.listId === 'string' ? params.listId : null;
  const shareSlug = typeof params?.shareSlug === 'string' ? params.shareSlug : null;
  const targetUserId = typeof params?.targetUserId === 'string' ? params.targetUserId : null;
  const joinIntent = params?.joinIntent === true;
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

  // Sort strip (§8.14, role-gated): everyone gets the Sort control — the saver's ranking
  // ('custom') is offered when a custom order exists AND, for owner/collaborator, always
  // (selecting it with no custom order yet = insertion order, the edit mode's entry point).
  const [sortOverride, setSortOverride] = React.useState<FavoriteListSort | null>(null);
  const effectiveSort: FavoriteListSort = sortOverride ?? defaultSort;

  const resultsQuery = useQuery({
    queryKey: ['listDetailResults', resolvedListId, effectiveSort, targetUserId],
    enabled: resolvedListId != null,
    staleTime: 60_000,
    retry: (failureCount, error) => !isPrivateGoneError(error) && failureCount < 2,
    queryFn: async (): Promise<SearchResponse> =>
      favoriteListsService.getListResults(resolvedListId as string, {
        shareSlug,
        sort: effectiveSort,
        targetUserId,
      }),
  });

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
      Clipboard.setString(inviteUrl);
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
  const [editSession, setEditSession] = React.useState<ListDetailEditSession | null>(null);
  const [isSavingOrder, setIsSavingOrder] = React.useState(false);
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const isEditing = editSession != null;

  const response = resultsQuery.data ?? null;
  const restaurantRows: RestaurantResult[] =
    listType === 'restaurant' ? (response?.restaurants ?? []) : [];
  const dishRows: FoodResult[] = listType === 'dish' ? (response?.dishes ?? []) : [];

  // The edit surface's row model: compact fixed-height rows (the drag primitive needs
  // uniform slots), keyed by entity id, each carrying its favoriteListItemId projection.
  const editRows = React.useMemo<ListDetailEditRow[]>(
    () =>
      listType === 'restaurant'
        ? restaurantRows.map((restaurant) => ({
            key: restaurant.restaurantId,
            itemId: restaurant.favoriteListItemId ?? null,
            title: restaurant.restaurantName,
            subtitle: restaurant.address ?? null,
          }))
        : dishRows.map((dish) => ({
            key: dish.connectionId,
            itemId: dish.favoriteListItemId ?? null,
            title: dish.foodName,
            subtitle: dish.restaurantName,
          })),
    [dishRows, listType, restaurantRows]
  );
  const editRowsByKey = React.useMemo(() => {
    const byKey = new Map<string, ListDetailEditRow>();
    for (const row of editRows) {
      byKey.set(row.key, row);
    }
    return byKey;
  }, [editRows]);

  const enterEditMode = React.useCallback(() => {
    const baseline = editRows.map((row) => row.key);
    setEditSession({ order: baseline, history: [baseline], historyIndex: 0 });
    // §8.11: simultaneously the sheet auto-glides to the TOP snap if not there.
    promoteActiveSheet({ snap: 'expanded' });
  }, [editRows, promoteActiveSheet]);

  // §8.11: while editing, the sheet is edit-LOCKED to expanded — swipe-down rubber-bands
  // and springs back instead of collapsing. Acquired from this effect so the cleanup
  // clears the lock on BOTH edit-exit (Save/Cancel) and scene unmount.
  React.useEffect(() => {
    if (!isEditing) {
      return undefined;
    }
    return acquireOverlaySheetEditLock('list-detail-edit');
  }, [isEditing]);

  const exitEditMode = React.useCallback(() => {
    setEditSession(null);
    setIsSavingOrder(false);
  }, []);

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
      if (settled != null && settled.join(' ') === session.order.join(' ')) {
        return session;
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
        return; // the edit lock pins the sheet — no re-assert needed
      }
      commitHistoryEntry();
    },
    [commitHistoryEntry]
  );

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
    if (editSession == null || isSavingOrder || resolvedListId == null) {
      return;
    }
    // Batch order PATCH vocabulary = itemIds. The API enforces set equality against the
    // full membership — if any rendered row lost its itemId projection (or the render is
    // a partial page), fail LOUD here rather than send a request that 400s.
    const orderedItemIds = editSession.order.map((key) => editRowsByKey.get(key)?.itemId ?? null);
    if (orderedItemIds.some((itemId) => itemId == null)) {
      announceFailureIfOnline();
      return;
    }
    setIsSavingOrder(true);
    try {
      await favoriteListsService.reorderItems(resolvedListId, orderedItemIds as string[]);
    } catch {
      setIsSavingOrder(false);
      announceFailureIfOnline();
      return;
    }
    // Re-query on the saver's ranking: the custom order is now the list's default.
    await queryClient.invalidateQueries({ queryKey: ['listDetailResults', resolvedListId] });
    await queryClient.invalidateQueries({
      queryKey: ['listDetail', listIdParam ?? `slug:${shareSlug}`],
    });
    setSortOverride('custom');
    exitEditMode();
  }, [
    editRowsByKey,
    editSession,
    exitEditMode,
    isSavingOrder,
    listIdParam,
    queryClient,
    resolvedListId,
    shareSlug,
  ]);

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

  const renderEditRowContent = React.useCallback(
    (row: ListDetailEditRow, context: { isDraggable: boolean; isActiveDrag: boolean }) => (
      <View style={[styles.editRow, context.isActiveDrag && styles.editRowActive]}>
        <View style={styles.editRowText}>
          <Text variant="body" weight="semibold" numberOfLines={1} style={styles.rowTitle}>
            {row.title}
          </Text>
          {row.subtitle ? (
            <Text variant="caption" numberOfLines={1} style={styles.rowSubtitle}>
              {row.subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    ),
    []
  );

  const orderedEditRows = React.useMemo<ListDetailEditRow[]>(() => {
    if (editSession == null) {
      return [];
    }
    return editSession.order
      .map((key) => editRowsByKey.get(key))
      .filter((row): row is ListDetailEditRow => row != null);
  }, [editRowsByKey, editSession]);

  const retry = React.useCallback(() => {
    if (!isVirtualAll) {
      void metaQuery.refetch();
    }
    void resultsQuery.refetch();
  }, [isVirtualAll, metaQuery, resultsQuery]);

  // Dead slug / list flipped private (RT-18): 410 {state:'private'} on either read → the
  // honest "this list is private" body — distinct from the generic failure (§5.6).
  if (isPrivateGoneError(metaQuery.error) || isPrivateGoneError(resultsQuery.error)) {
    return <StateBody message="This list is private." testID="list-detail-private" />;
  }

  if (!hasIdentity) {
    return (
      <StateBody
        message="We couldn’t load this list."
        testID="list-detail-failed"
        onRetry={retry}
      />
    );
  }

  const isMetaPending = !isVirtualAll && metaQuery.isPending;
  const isResultsPending = resolvedListId != null && resultsQuery.isPending;
  if (isMetaPending || isResultsPending) {
    return (
      <View style={styles.stateBody} testID="list-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (metaQuery.isError || resultsQuery.isError || listType == null || response == null) {
    return (
      <StateBody
        message="We couldn’t load this list."
        testID="list-detail-failed"
        onRetry={retry}
      />
    );
  }

  const listName = isVirtualAll
    ? listType === 'restaurant'
      ? 'All restaurants'
      : 'All dishes'
    : (metaQuery.data?.list.name ?? 'List');
  const rowCount = listType === 'restaurant' ? restaurantRows.length : dishRows.length;
  const hasCustomSortOption = !isVirtualAll && (defaultSort === 'custom' || canEdit);
  const roster = collaboratorsQuery.data ?? null;

  return (
    <View style={styles.body} testID="list-detail-body">
      <View style={styles.titleRow}>
        <Text
          variant="title"
          weight="semibold"
          numberOfLines={1}
          style={styles.listName}
          testID="list-detail-name"
        >
          {listName}
        </Text>
        <Text variant="caption" style={styles.countText}>
          {rowCount} {rowCount === 1 ? 'item' : 'items'}
        </Text>
      </View>

      {roster != null ? (
        <CollaboratorStackChip roster={roster} onPress={() => setCollaboratorModalVisible(true)} />
      ) : null}

      {showJoinAffordance ? (
        <Pressable
          onPress={() => void handleJoin()}
          disabled={isJoining}
          accessibilityRole="button"
          accessibilityLabel="Join this list as a collaborator"
          testID="list-detail-join"
          style={styles.joinBanner}
        >
          {isJoining ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text variant="caption" weight="semibold" style={styles.joinBannerText}>
              Join as collaborator
            </Text>
          )}
        </Pressable>
      ) : null}

      <View style={styles.sortStripRow}>
        <ListDetailToggleStrip
          effectiveSort={effectiveSort}
          onSelectSort={setSortOverride}
          hasCustomSortOption={hasCustomSortOption}
          customSortLabel={resolveCustomSortLabel(viewerRole)}
          showMarketChip={isVirtualAll}
          canEdit={canEdit && rowCount > 0}
          isEditing={isEditing}
          onEnterEdit={enterEditMode}
          onCancelEdit={exitEditMode}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSaveEdit={() => void handleSaveOrder()}
          canUndo={editSession != null && editSession.historyIndex > 0}
          canRedo={editSession != null && editSession.historyIndex < editSession.history.length - 1}
          isSaving={isSavingOrder}
        />
      </View>

      {isEditing ? (
        <ReorderableRows
          items={orderedEditRows}
          keyExtractor={(row) => row.key}
          rowHeight={EDIT_ROW_HEIGHT}
          renderRowContent={renderEditRowContent}
          onReorder={isScreenReaderEnabled ? handleAccessibleReorder : handleReorder}
          onDragStateChange={handleDragStateChange}
          accessibilityMode={isScreenReaderEnabled}
          scrollAdapter={scrollAdapter}
          testIDPrefix="list-detail-edit"
        />
      ) : rowCount === 0 ? (
        <StateBody message="Nothing saved here yet." testID="list-detail-empty" />
      ) : listType === 'restaurant' ? (
        restaurantRows.map((restaurant) => (
          <ListDetailRow
            key={restaurant.restaurantId}
            title={restaurant.restaurantName}
            subtitle={restaurant.address ?? null}
            score={restaurant.craveScore}
            note={restaurant.note}
            testID={`list-detail-row-${restaurant.restaurantId}`}
          />
        ))
      ) : (
        dishRows.map((dish) => (
          <ListDetailRow
            key={dish.connectionId}
            title={dish.foodName}
            subtitle={dish.restaurantName}
            score={dish.craveScore}
            note={dish.note}
            testID={`list-detail-row-${dish.connectionId}`}
          />
        ))
      )}

      {roster != null ? (
        <CollaboratorModal
          visible={collaboratorModalVisible}
          onRequestClose={() => {
            setCollaboratorModalVisible(false);
            setInviteState('idle');
          }}
          roster={roster}
          viewerRole={viewerRole}
          myUserId={meQuery.data?.userId ?? null}
          inviteState={inviteState}
          onCopyInvite={() => void handleCopyInvite()}
          onOpenProfile={handleOpenProfile}
          onKick={(userId) => void handleKick(userId)}
          onLeave={() => void handleLeave()}
        />
      ) : null}
    </View>
  );
});
ListDetailPanelBody.displayName = 'ListDetailPanelBody';

// ─── Persistent header (house pattern: static synchronous title + fixed-close action) ───────
const ListDetailPersistentHeaderTitle = React.memo(() => (
  <View style={styles.headerTextGroup}>
    <Text
      variant="title"
      weight="semibold"
      style={styles.headerTitle}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      List
    </Text>
  </View>
));
ListDetailPersistentHeaderTitle.displayName = 'ListDetailPersistentHeaderTitle';

const ListDetailPersistentHeaderAction = React.memo(() => {
  const { closeActiveRoute } = useAppOverlayRouteController();
  return (
    <Pressable
      onPress={closeActiveRoute}
      accessibilityRole="button"
      accessibilityLabel="Close list"
      style={overlaySheetStyles.closeButton}
      hitSlop={8}
    >
      <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
        <LucideX size={20} color="#000000" strokeWidth={2.5} />
      </View>
    </Pressable>
  );
});
ListDetailPersistentHeaderAction.displayName = 'ListDetailPersistentHeaderAction';

registerPersistentHeaderDescriptor('listDetail', {
  Title: ListDetailPersistentHeaderTitle,
  Action: ListDetailPersistentHeaderAction,
});

const styles = StyleSheet.create({
  body: {
    paddingVertical: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  listName: {
    flex: 1,
    color: '#0f172a',
  },
  countText: {
    color: '#64748b',
  },
  // Collaborator chip
  collabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 12,
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
  plusCircleLarge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    borderWidth: 1,
  },
  collabOverlap: {
    marginLeft: -8,
  },
  collabOverflowText: {
    color: '#64748b',
    marginLeft: 8,
  },
  avatarInitial: {
    color: '#ffffff',
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
  // Collaborator modal
  modalTitle: {
    textAlign: 'center',
    color: '#0f172a',
    fontSize: 18,
    marginBottom: 14,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  personRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personRowText: {
    flex: 1,
    gap: 2,
  },
  personName: {
    color: '#0f172a',
  },
  personBadge: {
    color: '#64748b',
  },
  personEllipsis: {
    padding: 6,
  },
  leaveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  leaveText: {
    color: '#0f172a',
  },
  kickButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  kickText: {
    color: '#dc2626',
  },
  // Sort/edit strip
  sortStripRow: {
    flexDirection: 'row',
    marginTop: 14,
    marginBottom: 6,
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
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  editChipText: {
    color: '#0f172a',
  },
  editStripButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  editStripCancelText: {
    color: '#64748b',
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
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    minWidth: 64,
    alignItems: 'center',
  },
  editStripSaveText: {
    color: '#ffffff',
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  sortChipSelected: {
    backgroundColor: '#0f172a',
  },
  sortChipDisabled: {
    opacity: 0.45,
  },
  sortChipText: {
    color: '#0f172a',
  },
  sortChipTextSelected: {
    color: '#ffffff',
  },
  // Edit rows
  editRow: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    marginVertical: 4,
    minHeight: EDIT_ROW_HEIGHT - 8,
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
    gap: 2,
  },
  // Read rows
  row: {
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTitleGroup: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: '#0f172a',
  },
  rowSubtitle: {
    color: '#64748b',
  },
  scoreGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16a34a',
  },
  scoreText: {
    color: '#0f172a',
  },
  rowNote: {
    color: '#475569',
  },
  stateBody: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  retryText: {
    color: '#0f172a',
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
});
