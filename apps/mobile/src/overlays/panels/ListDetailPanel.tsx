import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { X as LucideX } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { Text } from '../../components';
import { PhotoStrip } from '../../components/photos/PhotoStrip';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import {
  favoriteListsService,
  type FavoriteListDetail,
  type FavoriteListSort,
  type FavoriteListType,
  type FavoriteListViewerRole,
} from '../../services/favorite-lists';
import type { FoodResult, RestaurantResult, SearchResponse } from '../../types';

// ─── listDetail — the REAL page body v1, read-only (W1 slice 4;
// plans/w1-listdetail-structural-spec.md §A.3 / §C.4) ────────────────────────────────────────
// The pattern copy of UserProfilePanel (the reference child page): entry BY PROP (C2 — never
// useTopMostRouteEntryForScene), page data on the react-query CACHE keyed by DATA identity
// (['listDetail', listId] — two stacked entries of one list share the row, C3), persistent
// header descriptor, and an honest failure/empty/dead-slug body set (§5.6).
//
// Identity (spec D.5 adjudication): params = {listId | virtual 'all:restaurants'/'all:dishes',
// shareSlug?, targetUserId?} — the Desire list arm; shareSlug is RT-18 ACCESS MATERIAL,
// presented on every server read (meta + results), never identity.
//
// Rows are CLEAN SIMPLE ROWS v1 (name, score dot, note under a PhotoStrip placeholder): the
// results-sheet renderer (restaurant-result-card) is search-surface-entangled (descriptor +
// world plumbing), and the spec's fallback names exactly this shape. No FlashList — rows ride
// the leg's shared mounted-scroll container (the MVCP law is moot without a virtualized list).

type ListDetailParams = {
  listId?: string | null;
  shareSlug?: string | null;
  targetUserId?: string | null;
};

const VIRTUAL_LIST_TYPE_BY_ID: Record<string, FavoriteListType> = {
  'all:restaurants': 'restaurant',
  'all:dishes': 'dish',
};

const isPrivateGoneError = (error: unknown): boolean =>
  axios.isAxiosError(error) &&
  (error.response?.status === 410 ||
    (error.response?.data as { state?: string } | undefined)?.state === 'private');

const SORT_LABELS: Record<Exclude<FavoriteListSort, 'custom'>, string> = {
  best: 'Best',
  recent: 'Recently added',
};

const resolveCustomSortLabel = (viewerRole: FavoriteListViewerRole | undefined): string =>
  viewerRole === 'owner' ? 'My ranking' : 'Their ranking';

const SortChip = ({
  label,
  isSelected,
  onPress,
  testID,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  testID: string;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: isSelected }}
    accessibilityLabel={`Sort: ${label}`}
    testID={testID}
    style={[styles.sortChip, isSelected && styles.sortChipSelected]}
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

// W1 slice 1 (C2): the ENTRY arrives as a prop from the entry-keyed mount unit — with two
// live listDetail entries (list A → profile → list B) the topmost-per-key read is wrong.
export const ListDetailPanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const params: ListDetailParams | null =
    entry?.key === 'listDetail' ? ((entry.params ?? {}) as ListDetailParams) : null;
  const listIdParam = typeof params?.listId === 'string' ? params.listId : null;
  const shareSlug = typeof params?.shareSlug === 'string' ? params.shareSlug : null;
  const targetUserId = typeof params?.targetUserId === 'string' ? params.targetUserId : null;
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

  // Sort strip v1 (§8.14, role-gated): everyone gets the Sort control — the saver's ranking
  // ('custom') is offered (and default) iff a custom order exists; owner-only edit affordances
  // arrive with the drag slice. Local override state; null = the list's default.
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

  if (metaQuery.isError || resultsQuery.isError || listType == null || resultsQuery.data == null) {
    return (
      <StateBody
        message="We couldn’t load this list."
        testID="list-detail-failed"
        onRetry={retry}
      />
    );
  }

  const response = resultsQuery.data;
  const listName = isVirtualAll
    ? listType === 'restaurant'
      ? 'All restaurants'
      : 'All dishes'
    : (metaQuery.data?.list.name ?? 'List');
  const restaurantRows: RestaurantResult[] =
    listType === 'restaurant' ? (response.restaurants ?? []) : [];
  const dishRows: FoodResult[] = listType === 'dish' ? (response.dishes ?? []) : [];
  const rowCount = listType === 'restaurant' ? restaurantRows.length : dishRows.length;
  const hasCustomSortOption = !isVirtualAll && defaultSort === 'custom';

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

      <View style={styles.sortStrip} testID="list-detail-sort-strip">
        {hasCustomSortOption ? (
          <SortChip
            label={resolveCustomSortLabel(viewerRole)}
            isSelected={effectiveSort === 'custom'}
            onPress={() => setSortOverride('custom')}
            testID="list-detail-sort-custom"
          />
        ) : null}
        <SortChip
          label={SORT_LABELS.best}
          isSelected={effectiveSort === 'best'}
          onPress={() => setSortOverride('best')}
          testID="list-detail-sort-best"
        />
        <SortChip
          label={SORT_LABELS.recent}
          isSelected={effectiveSort === 'recent'}
          onPress={() => setSortOverride('recent')}
          testID="list-detail-sort-recent"
        />
      </View>

      {rowCount === 0 ? (
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
  sortStrip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    marginBottom: 6,
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
  sortChipText: {
    color: '#0f172a',
  },
  sortChipTextSelected: {
    color: '#ffffff',
  },
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
