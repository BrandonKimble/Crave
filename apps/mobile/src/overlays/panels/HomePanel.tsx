import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MapPin } from 'lucide-react-native';

import { Text } from '../../components';
import CutoutBandMaterial from '../../components/CutoutBandMaterial';
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
  noteCatalogWatermark,
  useViewportSubjectVerdict,
} from '../../store/viewport-subject-store';
import { subscribeSettledBoundsCoalesced } from '../../store/settled-bounds-coalesced-edge';
import type { MapBounds } from '../../types';
import { scheduleHomeFeedRetryRung } from './runtime/home-feed-retry-rung';
import { logger } from '../../utils';
import type { TrackSheetListProps } from '../../tracksheet/TrackSheetPage';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
import { resolveCuratedListType } from '../../services/curated-list-adapter';
import { useHomeFeedStore, useHomeSceneStateStore } from './runtime/home-feed-store';
import { shouldRefetchFeedForSettledBounds } from './runtime/polls-feed-refetch-edge';
import {
  buildHomeShelfRows,
  composeHomeShelfCardSubline,
  homeShelfRowItemType,
  homeShelfRowKeyExtractor,
  type HomeShelfRow,
} from './runtime/home-shelf-rows';
import { PollsHeaderTitleText } from './pollsHeaderVisuals';
import { requestMapCameraFlyToBbox } from '../../store/map-camera-command-store';
import { resolveSceneLoadingMaterial } from '../../navigation/runtime/scene-foundation-spec';

// OA2/G-SKEL (R8): the loading material comes from the scene's foundation
// row through the ONE resolver — never a call-site rowType literal.
// Non-null by construction: 'home' has a foundation row.
const HOME_LOADING_MATERIAL = resolveSceneLoadingMaterial('home')!;

const SURFACE = themeColors.surface;

// ─── Persistent header — ONE TITLE AUTHORITY (owner ruling 2026-08-01, header
// red-team): the client subject store names EVERY surface's title, exactly as
// polls does — the same §2 law run on-device against the sliding catalog
// slice, committed via settle+dwell hysteresis, so the title tracks the LIVE
// camera instead of freezing to the last feed response. The feed's
// resolvedCity survives ONLY as the initial-paint fallback until the store's
// first commit (verdict null) — and it still scopes CONTENT (which curated
// city's shelves render); a title/content lag window is accepted and honest.
// 'this-area' / null → 'Explore' (owner note: reads as a page, not a splash).
const HomePersistentHeaderTitle = React.memo(() => {
  const resolvedCityName = useHomeFeedStore((state) => state.feed?.resolvedCity?.name ?? null);
  const verdict = useViewportSubjectVerdict();
  const liveTitle =
    verdict != null ? (verdict.kind === 'place' ? verdict.placeName : null) : resolvedCityName;
  return (
    <View style={styles.persistentHeaderTitleGroup}>
      <PollsHeaderTitleText title={liveTitle ?? 'Explore'} />
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
//   2. The row paints its OWN white material as a `CutoutBandMaterial` INSIDE the
//      horizontal scroll content (so it scrolls WITH the cards), with one rounded
//      mask hole per card well — frost shows through the wells.
//   3. INFINITE-EDGE ILLUSION (the strip's mechanism, SHARED — CutoutBandMaterial):
//      the material runs a full viewport width past both ends of the content
//      (masked plate over the content extent + plain flanking panes), so no
//      rubber-band overscroll can ever reveal a hard white edge. Native ScrollView
//      `alwaysBounceHorizontal` = the strip's rubber-band feel.
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

/** Cards mounted with the switch, per shelf; the tail follows one beat later. */
const HOME_SHELF_STAGE_HEAD_COUNT = 3;
/** How long that beat is. See the staging block in HomeShelfRowView before changing
 *  either of these — both are un-measured today (F4512). */
const HOME_SHELF_STAGE_DELAY_MS = 160;

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
  }) => {
    // F4512: THE RECT IS MEASURED NOW, ALL FOUR FIELDS. It used to report `x`/`y`
    // from the real layout event beside `width`/`height` from the style constants —
    // half instrument, half assertion, in one object. The mask punched from it is a
    // hole in a real material: if the rendered well ever diverged from the constant
    // (a style edit, a font/scale change, a platform rounding), the hole misaligned
    // on screen and nothing in code or test objected. Both boxes are read from their
    // own onLayout and composed: the cell gives the origin in content coordinates,
    // the well gives its offset and its true size.
    const cellOriginRef = React.useRef<{ x: number; y: number } | null>(null);
    const wellBoxRef = React.useRef<HomeWellRect | null>(null);
    const publishWellRect = React.useCallback(() => {
      const origin = cellOriginRef.current;
      const well = wellBoxRef.current;
      if (origin == null || well == null) {
        return;
      }
      onWellLayout(wellKey, {
        x: origin.x + well.x,
        y: origin.y + well.y,
        width: well.width,
        height: well.height,
      });
    }, [onWellLayout, wellKey]);
    return (
      <View
        style={styles.cardCell}
        onLayout={(event) => {
          const { x, y } = event.nativeEvent.layout;
          cellOriginRef.current = { x, y };
          publishWellRect();
        }}
      >
        <Pressable
          style={({ pressed }) => [styles.cardWell, pressed && styles.cardPressed]}
          onPress={onPress}
          onLayout={(event) => {
            const { x, y, width, height } = event.nativeEvent.layout;
            wellBoxRef.current = { x, y, width, height };
            publishWellRect();
          }}
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
    );
  }
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

    // THE STAGED SHELF MOUNT (attributed 2026-07-31: [PERF] switch ->home =
    // ~500ms JS stall). The shelves are plain horizontal ScrollViews that
    // .map EVERY card, so each return to home mounted every card in every
    // shelf in one commit. Stage it: the visible head of each shelf mounts
    // with the switch; the off-screen tail mounts one beat later, off the
    // transition's critical frames. Card count, not a redesign — the shelf
    // composition (wells, cutouts, seam) is untouched and re-measures as the
    // tail lands via the existing rAF-collapsed sweep.
    //
    // F4512, HONEST ACCOUNTING: the ~500ms figure above was a real attribution on
    // 2026-07-31, but nothing MEASURES it now — there is no live sampler that would
    // fire if the stall came back, so neither the claim nor the remedy can currently
    // show RED. The two magic numbers are NAMED below (step 1 of the row's three),
    // which is the precondition for the rest and is free. Step 2 — re-measuring the
    // switch-to-home stall with the samplers under src/perf/ — needs a running app
    // and is NOT done here. Under the no-fake-estimates law that means: do NOT
    // re-tune either value until that measurement exists. Naming them is not
    // permission to guess at them.
    //
    // KNOWN AND UNADDRESSED: this timer is per-HomeShelfRowView INSTANCE, so N
    // shelves arm N independent unsynchronized delays — not the single "one beat
    // later" the comment above describes. Left alone deliberately; changing the
    // staging shape is exactly the change that needs step 2 first.
    const [shelvesWarm, setShelvesWarm] = React.useState(false);
    React.useEffect(() => {
      const timer = setTimeout(() => setShelvesWarm(true), HOME_SHELF_STAGE_DELAY_MS);
      return () => clearTimeout(timer);
    }, []);
    const stageLimit = shelvesWarm ? undefined : HOME_SHELF_STAGE_HEAD_COUNT;
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

    // The infinite-edge illusion — the strip's shared mechanism (CutoutBandMaterial):
    // masked plate over the content extent + plain flanking panes running a full
    // viewport width past both content ends.
    const maskHeight = bandSize.height > 0 ? bandSize.height + HOME_MASK_OVERSHOOT : 0;
    const maskedHoles = React.useMemo(
      () =>
        cardKeys
          .map((key) => wellMap[key])
          .filter((rect): rect is HomeWellRect => rect != null)
          .map((rect) => ({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            borderRadius: HOME_CARD_WELL_RADIUS + HOME_WELL_RADIUS_BOOST,
          })),
      [cardKeys, wellMap]
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
                  <CutoutBandMaterial
                    holes={maskedHoles}
                    contentExtent={bandSize.width}
                    viewportWidth={viewportWidth}
                    edgeInset={OVERLAY_HORIZONTAL_PADDING}
                    height={maskHeight}
                    surfaceColor={SURFACE}
                    zIndex={1}
                  />
                ) : null}
                <View style={styles.shelfCardRow}>
                  {row.kind === 'shelf'
                    ? row.shelf.lists.slice(0, stageLimit).map((list) => {
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
                    : row.cities
                        .slice(0, stageLimit)
                        .map((city) => (
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
// §9.4 parity with the polls controller: on a failed load, retry quietly with
// backoff; any fresh settle/pick/reconnect-triggered refresh supersedes the
// pending retry and resets the ladder.

const useHomeFeedRuntime = (): void => {
  const visible = useHomeSceneStateStore((state) => state.visible);
  const lastRequestedBoundsRef = React.useRef<MapBounds | null>(null);
  const fetchSeqRef = React.useRef(0);
  const retryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = React.useRef<((retryAttempt?: number) => Promise<void>) | null>(null);

  const clearScheduledRetry = React.useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // F4510: ONE rung scheduler for both failure paths — the exhaustion bound lives
  // in the ladder alone now (home-feed-retry-rung.ts explains what the two
  // hand-maintained copies and their `?? 0` could have cost).
  const armRetryRung = React.useCallback(
    (retryAttempt: number, cause?: unknown) =>
      scheduleHomeFeedRetryRung({
        retryAttempt,
        isVisible: () => useHomeSceneStateStore.getState().visible,
        runRung: (nextRetryAttempt) => {
          retryTimeoutRef.current = null;
          void refreshRef.current?.(nextRetryAttempt);
        },
        // The ladder's 429 clause reads the failure: a rate-limited fetch
        // waits at least the longest rung (Retry-After honored) — never 2s.
        cause,
      }),
    []
  );

  const refreshHomeFeed = React.useCallback(
    async (retryAttempt = 0) => {
      const bounds = getViewportSubjectState().settledBounds;
      if (!bounds) {
        // F926: a call that CANNOT fetch must never silently kill a live retry ladder — the
        // polls controller documents this exact failure (a rung arriving while bounds are
        // momentarily null returning without rescheduling silently ends the ladder). If THIS
        // call is itself a scheduled retry rung (retryAttempt > 0), keep the ladder alive by
        // scheduling the next rung instead of dropping it.
        if (retryAttempt > 0) {
          retryTimeoutRef.current = armRetryRung(retryAttempt);
        }
        return;
      }
      // A fresh call (any trigger) owns recovery now — drop any pending retry.
      clearScheduledRetry();
      lastRequestedBoundsRef.current = bounds;
      const seq = ++fetchSeqRef.current;
      const store = useHomeFeedStore.getState();
      if (store.feed == null) {
        store.setStatus('loading');
      }
      try {
        const feed = await fetchHomeFeed(bounds, {
          pickedCityId: useHomeFeedStore.getState().pickedCityId,
        });
        if (seq !== fetchSeqRef.current) {
          return; // superseded by a newer settle
        }
        useHomeFeedStore.getState().setFeed(feed);
        // Header ideal 2026-08-01: report the response's catalog revision —
        // the subject store re-cuts its slice when this differs from the
        // slice's own watermark (change, never clock).
        noteCatalogWatermark(feed.catalogWatermark ?? null);
      } catch (error) {
        if (seq !== fetchSeqRef.current) {
          return;
        }
        logger.warn('Failed to load home feed', {
          message: error instanceof Error ? error.message : 'unknown',
          retryAttempt,
        });
        // Header red-team 2026-08-01: a failed fetch must NOT hold its bounds
        // as "requested" — that made a re-settle on the IDENTICAL bounds a
        // non-edge, so the stale resolvedCity title served indefinitely with
        // no retry path. Clearing the ref makes the next settle (even on the
        // same camera) an honest retry edge.
        lastRequestedBoundsRef.current = null;
        // §9.4 ladder (polls parity): quiet backoff retries; a newer refresh
        // (settle / pick / reconnect) supersedes via clearScheduledRetry.
        retryTimeoutRef.current = armRetryRung(retryAttempt, error);
        // Honest failure only when there is nothing to show; a stale feed stands.
        if (useHomeFeedStore.getState().feed == null) {
          useHomeFeedStore.getState().setStatus('failed');
        }
      }
    },
    [armRetryRung, clearScheduledRetry]
  );
  refreshRef.current = refreshHomeFeed;

  // The ladder must not outlive the surface: leaving home cancels any pending
  // retry (the activation-diff on return refetches if bounds moved, and the
  // cleared lastRequestedBounds makes even same-bounds return an edge).
  React.useEffect(() => {
    if (!visible) {
      clearScheduledRetry();
    }
    return clearScheduledRetry;
  }, [clearScheduledRetry, visible]);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const refetchIfSettledBoundsDiffer = () => {
      const settledBounds = getViewportSubjectState().settledBounds;
      if (
        !shouldRefetchFeedForSettledBounds({
          settledBounds,
          lastRequestedBounds: lastRequestedBoundsRef.current,
        })
      ) {
        return;
      }
      void refreshHomeFeed();
    };
    refetchIfSettledBoundsDiffer(); // activation-diff
    // THE COALESCED SETTLE EDGE (F-429-storm, shared with the polls feed): at
    // most one tick per interval during continuous settles, trailing tick for
    // the final rest position; the diff above re-reads the LATEST bounds each
    // tick. The effect's cleanup (hide/unmount) disarms any pending tick.
    return subscribeSettledBoundsCoalesced(() => refetchIfSettledBoundsDiffer()); // settle-edge
  }, [refreshHomeFeed, visible]);

  // An explicit city pick refetches immediately — the camera jump usually
  // also lands a settle-edge refetch (seq guard supersedes), but the pick
  // must not depend on it (the jump is skipped when the catalog has no bbox).
  React.useEffect(
    () =>
      useHomeFeedStore.subscribe((state, prev) => {
        if (state.pickSeq !== prev.pickSeq && visible) {
          void refreshHomeFeed();
        }
      }),
    [refreshHomeFeed, visible]
  );

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
// F929: not exported — the only consumer is this file. A module-local hook that
// looks public invites a second consumer to bind to it by accident.
const useHomeShelfListProps = (): TrackSheetListProps<HomeShelfRow> => {
  const feed = useHomeFeedStore((state) => state.feed);
  const status = useHomeFeedStore((state) => state.status);
  const executeEntityRefAction = useEntityRefActionExecutor();

  const handleOpenList = React.useCallback(
    (list: HomeShelfList) => {
      // List-detail choreography leg: a curated open rides THE listWorld composite
      // (push + the list's search world — pins, fitAll, reveal), exactly the path
      // own-list and profile-list taps take; only the fetch seam differs (source).
      executeEntityRefAction({
        entityId: list.listId,
        entityType: 'list',
        label: list.title,
        listType: resolveCuratedListType(list.listType),
        listSource: 'curated',
      });
    },
    [executeEntityRefAction]
  );
  const handlePickCity = React.useCallback((city: HomeFeedCity) => {
    // Pick-a-city = explicit intent + a map jump. The pick is recorded as the
    // feed's soft fallback FIRST (a city-bbox fit leaves the city under the ⅔
    // header law, so the landing viewport alone would bounce back to
    // pick-a-city); the camera jump follows when the catalog knows the bbox.
    useHomeFeedStore.getState().setPickedCity(city.placeId);
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
      return <SceneLoadingSurface rowType={HOME_LOADING_MATERIAL.rowType} />;
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
  // The row's white material (CutoutBandMaterial) renders absolute INSIDE the
  // scroll content so it rides the horizontal scroll; the infinite-edge illusion
  // (material past both ends) is owned by the shared primitive.
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
