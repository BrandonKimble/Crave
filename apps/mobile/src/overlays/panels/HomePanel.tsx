import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';

import { Text } from '../../components';
import { SceneLoadingSurface } from '../../components/skeletons';
import { colors as themeColors } from '../../constants/theme';
import { resolveCuratedListIcon } from '../../constants/curated-list-icons';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
} from '../../navigation/runtime/app-route-scene-descriptor-contract';
import { fetchHomeFeed, type HomeFeedCity, type HomeShelfList } from '../../services/home';
import { subscribeToReconnect } from '../../store/systemStatusStore';
import {
  getViewportSubjectState,
  subscribeViewportSubjectState,
} from '../../store/viewport-subject-store';
import type { MapBounds } from '../../types';
import { logger } from '../../utils';
import type { TrackSheetListProps } from '../../tracksheet/TrackSheetPage';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useHomeFeedStore, useHomeSceneStateStore } from './runtime/home-feed-store';
import { shouldRefetchPollsFeedForSettledBounds } from './runtime/polls-feed-refetch-edge';
import {
  buildHomeShelfRows,
  homeShelfRowItemType,
  homeShelfRowKeyExtractor,
  type HomeShelfRow,
} from './runtime/home-shelf-rows';
import { PollsHeaderTitleText } from './pollsHeaderVisuals';
import { requestMapCameraFlyToBbox } from '../../store/map-camera-command-store';

const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

// ─── Persistent header (home-surface-charter §1): the Title renders the SAME feed
// response's resolvedCity — no separate verdict fetch. Null city → 'Explore'
// (owner note: the cleaner of the two sanctioned fallbacks; app name read as a
// brand splash, 'Explore' reads as a page).
const HomePersistentHeaderTitle = React.memo(() => {
  const resolvedCityName = useHomeFeedStore((state) => state.feed?.resolvedCity?.name ?? null);
  return (
    <View style={styles.persistentHeaderTitleGroup}>
      <PollsHeaderTitleText title={resolvedCityName ?? 'Explore'} />
    </View>
  );
});
HomePersistentHeaderTitle.displayName = 'HomePersistentHeaderTitle';

registerPersistentHeaderDescriptor('home', {
  Title: HomePersistentHeaderTitle,
});

// ─── Card visual (owner-ratified V1): cutout-language card — rounded rect, a
// cutout-look icon well (the toggle-strip cutout vocabulary rendered with plain
// Views — the masked machinery is overkill for an opaque card), title, subtitle,
// item count. NO photos.
const HOME_CARD_WIDTH = 168;

const HomeListCard = React.memo(
  ({ list, onPress }: { list: HomeShelfList; onPress: (list: HomeShelfList) => void }) => {
    const Icon = resolveCuratedListIcon(list.iconKey);
    const countLabel = `${list.itemCount} ${
      list.listType === 'dish'
        ? list.itemCount === 1
          ? 'dish'
          : 'dishes'
        : list.itemCount === 1
          ? 'spot'
          : 'spots'
    }`;
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => onPress(list)}
        accessibilityRole="button"
        accessibilityLabel={`Open list ${list.title}`}
        testID={`home-list-card-${list.listId}`}
      >
        <View style={styles.cardIconWell}>
          <Icon size={22} color={themeColors.primary} strokeWidth={2} />
        </View>
        <Text variant="subtitle" weight="semibold" style={styles.cardTitle} numberOfLines={2}>
          {list.title}
        </Text>
        {list.subtitle ? (
          <Text variant="caption" style={styles.cardSubtitle} numberOfLines={2}>
            {list.subtitle}
          </Text>
        ) : null}
        <Text variant="caption" style={styles.cardCount}>
          {countLabel}
        </Text>
      </Pressable>
    );
  }
);
HomeListCard.displayName = 'HomeListCard';

const HomeCityCard = React.memo(
  ({ city, onPress }: { city: HomeFeedCity; onPress: (city: HomeFeedCity) => void }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(city)}
      accessibilityRole="button"
      accessibilityLabel={`Explore ${city.name}`}
      testID={`home-city-card-${city.placeId}`}
    >
      <View style={styles.cardIconWell}>
        <MapPin size={22} color={themeColors.primary} strokeWidth={2} />
      </View>
      <Text variant="subtitle" weight="semibold" style={styles.cardTitle} numberOfLines={2}>
        {city.name}
      </Text>
    </Pressable>
  )
);
HomeCityCard.displayName = 'HomeCityCard';

const HomeShelfRowView = React.memo(
  ({
    row,
    onOpenList,
    onPickCity,
  }: {
    row: HomeShelfRow;
    onOpenList: (list: HomeShelfList) => void;
    onPickCity: (city: HomeFeedCity) => void;
  }) => (
    <View style={styles.shelfSection}>
      <Text variant="subtitle" weight="semibold" style={styles.shelfTitle}>
        {row.title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelfScrollContent}
      >
        {row.kind === 'shelf'
          ? row.shelf.lists.map((list) => (
              <HomeListCard key={list.listId} list={list} onPress={onOpenList} />
            ))
          : row.cities.map((city) => (
              <HomeCityCard key={city.placeId} city={city} onPress={onPickCity} />
            ))}
      </ScrollView>
    </View>
  )
);
HomeShelfRowView.displayName = 'HomeShelfRowView';

// ─── Feed runtime: settled-viewport keyed fetch (the SAME subject-store seam +
// settle-edge/activation-diff pattern the polls feed uses; the settle tick's
// 240ms quiescence IS the debounce).
const useHomeFeedRuntime = (): void => {
  const visible = useHomeSceneStateStore((state) => state.visible);
  const lastRequestedBoundsRef = React.useRef<MapBounds | null>(null);
  const fetchSeqRef = React.useRef(0);

  const refreshHomeFeed = React.useCallback(async () => {
    const bounds = getViewportSubjectState().settledBounds;
    if (!bounds) {
      return;
    }
    lastRequestedBoundsRef.current = bounds;
    const seq = ++fetchSeqRef.current;
    const store = useHomeFeedStore.getState();
    if (store.feed == null) {
      store.setStatus('loading');
    }
    try {
      const feed = await fetchHomeFeed(bounds);
      if (seq !== fetchSeqRef.current) {
        return; // superseded by a newer settle
      }
      useHomeFeedStore.getState().setFeed(feed);
    } catch (error) {
      if (seq !== fetchSeqRef.current) {
        return;
      }
      logger.warn('Failed to load home feed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
      // Honest failure only when there is nothing to show; a stale feed stands.
      if (useHomeFeedStore.getState().feed == null) {
        useHomeFeedStore.getState().setStatus('failed');
      }
    }
  }, []);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const refetchIfSettledBoundsDiffer = () => {
      const settledBounds = getViewportSubjectState().settledBounds;
      if (
        !shouldRefetchPollsFeedForSettledBounds({
          settledBounds,
          lastRequestedBounds: lastRequestedBoundsRef.current,
        })
      ) {
        return;
      }
      void refreshHomeFeed();
    };
    refetchIfSettledBoundsDiffer(); // activation-diff
    let lastSeenSettledBounds = getViewportSubjectState().settledBounds;
    return subscribeViewportSubjectState(() => {
      const settledBounds = getViewportSubjectState().settledBounds;
      if (settledBounds === lastSeenSettledBounds) {
        return;
      }
      lastSeenSettledBounds = settledBounds;
      refetchIfSettledBoundsDiffer(); // settle-edge
    });
  }, [refreshHomeFeed, visible]);

  // Offline resume (foundation §A): reconnect fires one quiet in-place refresh.
  React.useEffect(
    () =>
      subscribeToReconnect(() => {
        if (useHomeSceneStateStore.getState().visible) {
          void refreshHomeFeed();
        }
      }),
    [refreshHomeFeed]
  );
};

const HOME_SHELF_ESTIMATED_ROW_SIZE = 240;
const EMPTY_HOME_ROWS: readonly HomeShelfRow[] = [];

export const HOME_SCENE_LIST_BODY_ADMISSION_POLICY = {
  retainMountedBodyDuringTransition: true,
  keepDataSubscribedAfterActivation: true,
} as const;

/**
 * THE home shelf FlashList prop bag (home-surface-charter Job 2 constraint):
 * exactly the TrackSheetListProps shape (src/tracksheet/TrackSheetPage.tsx) so
 * the body can later become a TrackSheet body unchanged. `getItemType`
 * distinguishes 'shelf' rows from the city-picker row.
 */
export const useHomeShelfListProps = (): TrackSheetListProps<HomeShelfRow> => {
  const feed = useHomeFeedStore((state) => state.feed);
  const status = useHomeFeedStore((state) => state.status);
  const { pushRoute } = useAppOverlayRouteController();

  const handleOpenList = React.useCallback(
    (list: HomeShelfList) => {
      pushRoute('listDetail', {
        listId: list.listId,
        title: list.title,
        source: 'curated',
      });
    },
    [pushRoute]
  );
  const handlePickCity = React.useCallback((city: HomeFeedCity) => {
    // Pick-a-city = a map jump (the feed follows the viewport once the camera
    // lands). The bbox comes from the catalog slice when available; the
    // camera-command store no-ops honestly when the place is unknown.
    const slice = getViewportSubjectState().slice;
    const place = slice?.find((candidate) => candidate.placeId === city.placeId) ?? null;
    if (place != null) {
      requestMapCameraFlyToBbox(place.bbox);
    } else if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[home] no catalog bbox for live city ${city.placeId} — jump skipped`);
    }
  }, []);

  const rows = React.useMemo(() => buildHomeShelfRows(feed), [feed]);
  const listData = status === 'ready' || rows.length > 0 ? rows : EMPTY_HOME_ROWS;

  const renderItem = React.useCallback(
    ({ item }: { item: HomeShelfRow }) => (
      <HomeShelfRowView row={item} onOpenList={handleOpenList} onPickCity={handlePickCity} />
    ),
    [handleOpenList, handlePickCity]
  );

  const ListEmptyComponent = React.useMemo(() => {
    if (status === 'loading' || status === 'idle') {
      return <SceneLoadingSurface rowType="tile" />;
    }
    if (status === 'failed') {
      return (
        <Text variant="body" style={styles.emptyState}>
          Couldn&apos;t load home.
        </Text>
      );
    }
    // status 'ready' with zero rows: honest empty copy — no fake content ever.
    return (
      <Text variant="body" style={styles.emptyState}>
        Nothing curated here yet — lists appear as this area earns them.
      </Text>
    );
  }, [status]);

  return React.useMemo<TrackSheetListProps<HomeShelfRow>>(
    () => ({
      data: listData as HomeShelfRow[],
      renderItem,
      keyExtractor: homeShelfRowKeyExtractor,
      getItemType: homeShelfRowItemType,
      ListEmptyComponent,
    }),
    [ListEmptyComponent, listData, renderItem]
  );
};

/**
 * Builds the home body as a `'list'` scene body (the polls pattern — published
 * by the home scene-input writer at the app shell, where effects fire).
 */
export const useHomePanelListSceneParts = (): {
  sceneBodyContent: AppRouteSceneBodyContentSpec;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec;
} => {
  useHomeFeedRuntime();
  const listProps = useHomeShelfListProps();

  const sceneBodyContent = React.useMemo<AppRouteSceneBodyContentSpec>(
    () => ({
      surfaceKind: 'list',
      data: (listProps.data ?? []) as HomeShelfRow[],
      // The scene body spec is item-untyped (unknown rows) — the prop-bag hook
      // keeps the typed TrackSheet shape; this seam erases the item type only.
      renderItem: listProps.renderItem as unknown as Extract<
        AppRouteSceneBodyContentSpec,
        { surfaceKind: 'list' }
      >['renderItem'],
      keyExtractor: listProps.keyExtractor as unknown as Extract<
        AppRouteSceneBodyContentSpec,
        { surfaceKind: 'list' }
      >['keyExtractor'],
      estimatedItemSize: HOME_SHELF_ESTIMATED_ROW_SIZE,
      ListEmptyComponent: listProps.ListEmptyComponent,
    }),
    [listProps.ListEmptyComponent, listProps.data, listProps.keyExtractor, listProps.renderItem]
  );

  const sceneBodyTransport = React.useMemo<AppRouteSceneBodyTransportSpec>(
    () => ({
      contentContainerStyle: {
        paddingTop: 0, // FLUSH LAW — content edge-to-edge on the header bottom.
        paddingBottom: 72,
      },
      // getItemType rides the transport's flashListProps (the list content spec
      // has no getItemType field); the prop-bag hook stays the TrackSheet shape.
      flashListProps: {
        getItemType: listProps.getItemType as unknown as (
          item: unknown,
          index: number
        ) => string | number | undefined,
      },
    }),
    [listProps.getItemType]
  );

  return { sceneBodyContent, sceneBodyTransport };
};

const styles = StyleSheet.create({
  persistentHeaderTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    paddingRight: 10,
  },
  shelfSection: {
    marginTop: 18,
  },
  shelfTitle: {
    color: themeColors.textPrimary,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginBottom: 10,
  },
  shelfScrollContent: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    gap: 10,
  },
  card: {
    width: HOME_CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    padding: 12,
    gap: 6,
  },
  cardPressed: {
    opacity: 0.85,
  },
  // The cutout-look icon well: the strip-cutout visual vocabulary (a punched
  // rounded window showing the muted ground) rendered as an opaque well.
  cardIconWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: themeColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  cardTitle: {
    color: themeColors.textPrimary,
  },
  cardSubtitle: {
    color: themeColors.textBody,
  },
  cardCount: {
    color: themeColors.textMuted,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    color: themeColors.textMuted,
  },
});
