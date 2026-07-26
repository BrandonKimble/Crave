import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';

import { Text } from '../../components';
import MaskedHoleOverlay from '../../components/MaskedHoleOverlay';
import { SceneLoadingSurface } from '../../components/skeletons';
import { FrostCutout } from '../SceneBodyFoundationSurface';
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
  composeHomeShelfCardSubline,
  homeShelfRowItemType,
  homeShelfRowKeyExtractor,
  type HomeShelfRow,
} from './runtime/home-shelf-rows';
import { PollsHeaderTitleText } from './pollsHeaderVisuals';
import { requestMapCameraFlyToBbox } from '../../store/map-camera-command-store';

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

// ─── Card visual (owner-ratified V2 — TRUE CUTOUTS): each card WELL is a real
// hole punched through the row's white material to the shared frost, the exact
// toggle-strip composition:
//   1. The row band wraps in `FrostCutout` — on this foundation-plated scene it
//      punches a band-height hole in the scene's white plate, so the row's own
//      material sits on honest frost (never white-on-white).
//   2. The row paints its OWN white material as a `MaskedHoleOverlay` INSIDE the
//      horizontal scroll content (so it scrolls WITH the cards), with one rounded
//      hole per card well — frost shows through the wells.
//   3. INFINITE-EDGE ILLUSION (the strip's mechanism, verbatim): the material
//      extends a full viewport width past both ends of the content and sits at
//      `left: -overscrollMargin`, so no rubber-band overscroll can ever reveal a
//      hard white edge. Native ScrollView `alwaysBounceHorizontal` = the strip's
//      rubber-band feel.
// Card text (owner-specified, Spotify pattern): TITLE inside the well,
// bottom-left; SUB-LINE below the well, OUTSIDE it, on the white material —
// caption size (the toggle-strip chip label scale), standard subtext gray,
// middle-dot separated facts. NO photos, no invented facts.
const HOME_CARD_WIDTH = 168;
const HOME_CARD_WELL_HEIGHT = 116;
const HOME_CARD_WELL_RADIUS = 14;
const HOME_CARD_GAP = 10;
// Matches the strip's HOLE_RADIUS_BOOST — the window reads cleanly on frost.
const HOME_WELL_RADIUS_BOOST = 1;
// Vertical mask overshoot past the band (clipped by the band) so the foundation
// plate's punched hole can never show a rounding hairline (the strip's
// rowHeight + STRIP_GAP lesson).
const HOME_MASK_OVERSHOOT = 8;

type HomeWellRect = { x: number; y: number; width: number; height: number };

/** One card cell: the cutout WELL (icon centered, title bottom-left INSIDE) +
 *  the sub-line BELOW the well on the material. Reports its well rect (content
 *  coordinates) so the row can punch the hole. */
const HomeCutoutCard = React.memo(
  ({
    wellKey,
    icon,
    title,
    subline,
    accessibilityLabel,
    testID,
    onPress,
    onWellLayout,
  }: {
    wellKey: string;
    icon: React.ReactNode;
    title: string;
    subline: string | null;
    accessibilityLabel: string;
    testID: string;
    onPress: () => void;
    onWellLayout: (key: string, rect: HomeWellRect) => void;
  }) => (
    <View
      style={styles.cardCell}
      onLayout={(event) => {
        const { x, y } = event.nativeEvent.layout;
        // The well sits at the cell's top; fixed geometry, measured x/y.
        onWellLayout(wellKey, {
          x,
          y,
          width: HOME_CARD_WIDTH,
          height: HOME_CARD_WELL_HEIGHT,
        });
      }}
    >
      <Pressable
        style={({ pressed }) => [styles.cardWell, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <View style={styles.cardWellIcon}>{icon}</View>
        <Text variant="subtitle" weight="semibold" style={styles.cardTitle} numberOfLines={2}>
          {title}
        </Text>
      </Pressable>
      {subline ? (
        <Text variant="caption" style={styles.cardSubline} numberOfLines={1}>
          {subline}
        </Text>
      ) : null}
    </View>
  )
);
HomeCutoutCard.displayName = 'HomeCutoutCard';

const HomeShelfRowView = React.memo(
  ({
    row,
    onOpenList,
    onPickCity,
  }: {
    row: HomeShelfRow;
    onOpenList: (list: HomeShelfList) => void;
    onPickCity: (city: HomeFeedCity) => void;
  }) => {
    const [viewportWidth, setViewportWidth] = React.useState(0);
    const [bandSize, setBandSize] = React.useState({ width: 0, height: 0 });
    const [wellMap, setWellMap] = React.useState<Record<string, HomeWellRect>>({});

    const handleWellLayout = React.useCallback((key: string, rect: HomeWellRect) => {
      setWellMap((prev) => {
        const existing = prev[key];
        if (
          existing != null &&
          Math.abs(existing.x - rect.x) < 0.5 &&
          Math.abs(existing.y - rect.y) < 0.5 &&
          existing.width === rect.width &&
          existing.height === rect.height
        ) {
          return prev;
        }
        return { ...prev, [key]: rect };
      });
    }, []);

    const cardKeys = React.useMemo(
      () =>
        row.kind === 'shelf'
          ? row.shelf.lists.map((list) => list.listId)
          : row.cities.map((city) => city.placeId),
      [row]
    );

    // The infinite-edge illusion, byte-identical to the strip's mask geometry:
    // the material runs a full viewport width past both content ends.
    const overscrollMargin = Math.max(OVERLAY_HORIZONTAL_PADDING, viewportWidth);
    const maskWidth = Math.max(viewportWidth, bandSize.width + overscrollMargin * 2);
    const maskHeight = bandSize.height > 0 ? bandSize.height + HOME_MASK_OVERSHOOT : 0;
    const maskedHoles = React.useMemo(
      () =>
        cardKeys
          .map((key) => wellMap[key])
          .filter((rect): rect is HomeWellRect => rect != null)
          .map((rect) => ({
            x: rect.x + overscrollMargin,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            borderRadius: HOME_CARD_WELL_RADIUS + HOME_WELL_RADIUS_BOOST,
          })),
      [cardKeys, wellMap, overscrollMargin]
    );

    return (
      <View style={styles.shelfSection}>
        <Text variant="subtitle" weight="semibold" style={styles.shelfTitle}>
          {row.title}
        </Text>
        {/* Punches the band out of the scene's foundation white plate — the row's
            material sits on real frost (backdrop honesty, the strip's law). */}
        <FrostCutout>
          <View
            style={styles.shelfBand}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setViewportWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
            }}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              alwaysBounceHorizontal
              directionalLockEnabled
              contentContainerStyle={styles.shelfScrollContent}
            >
              <View
                style={styles.shelfBandContent}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  setBandSize((prev) =>
                    Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
                      ? prev
                      : { width, height }
                  );
                }}
              >
                {bandSize.width > 0 && maskedHoles.length > 0 ? (
                  <MaskedHoleOverlay
                    pointerEvents="none"
                    holes={maskedHoles}
                    backgroundColor={SURFACE}
                    style={[
                      styles.shelfMaterial,
                      { width: maskWidth, height: maskHeight, left: -overscrollMargin },
                    ]}
                  />
                ) : null}
                <View style={styles.shelfCardRow}>
                  {row.kind === 'shelf'
                    ? row.shelf.lists.map((list) => {
                        const Icon = resolveCuratedListIcon(list.iconKey);
                        return (
                          <HomeCutoutCard
                            key={list.listId}
                            wellKey={list.listId}
                            icon={<Icon size={24} color={themeColors.primary} strokeWidth={2} />}
                            title={list.title}
                            subline={composeHomeShelfCardSubline(list)}
                            accessibilityLabel={`Open list ${list.title}`}
                            testID={`home-list-card-${list.listId}`}
                            onPress={() => onOpenList(list)}
                            onWellLayout={handleWellLayout}
                          />
                        );
                      })
                    : row.cities.map((city) => (
                        <HomeCutoutCard
                          key={city.placeId}
                          wellKey={city.placeId}
                          icon={<MapPin size={24} color={themeColors.primary} strokeWidth={2} />}
                          title={city.name}
                          subline={null}
                          accessibilityLabel={`Explore ${city.name}`}
                          testID={`home-city-card-${city.placeId}`}
                          onPress={() => onPickCity(city)}
                          onWellLayout={handleWellLayout}
                        />
                      ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </FrostCutout>
      </View>
    );
  }
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
  // The band clips the material's vertical overshoot (the strip's band pattern).
  shelfBand: {
    width: '100%',
    overflow: 'hidden',
  },
  shelfScrollContent: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  shelfBandContent: {
    position: 'relative',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  // The row's white material (MaskedHoleOverlay) — absolute INSIDE the scroll
  // content so it rides the horizontal scroll; extends `overscrollMargin` past
  // both ends (inline width/left) for the infinite-edge illusion.
  shelfMaterial: {
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
  shelfCardRow: {
    position: 'relative',
    zIndex: 2,
    flexDirection: 'row',
    columnGap: HOME_CARD_GAP,
  },
  cardCell: {
    width: HOME_CARD_WIDTH,
  },
  // The well is a HOLE — no background of its own; frost shows through.
  cardWell: {
    width: HOME_CARD_WIDTH,
    height: HOME_CARD_WELL_HEIGHT,
    borderRadius: HOME_CARD_WELL_RADIUS,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.7,
  },
  // Icon centered in the upper region, clear of the bottom-left title.
  cardWellIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Spotify pattern: title INSIDE the well, pinned bottom-left.
  cardTitle: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 8,
    color: themeColors.textPrimary,
  },
  // The sub-line lives BELOW the well, on the white material: caption scale (the
  // toggle-strip chip label size, TYPE_SCALE.caption 13pt), standard subtext gray.
  cardSubline: {
    marginTop: 6,
    color: themeColors.textMuted,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    color: themeColors.textMuted,
  },
});
