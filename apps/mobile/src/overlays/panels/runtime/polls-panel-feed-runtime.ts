import React from 'react';
import { Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  Poll,
  PollFeedPromise,
  PollFeedSort,
  PollFeedTime,
  PollFeedType,
} from '../../../services/polls';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import {
  resolveSearchBottomInset,
  resolveSearchBottomNavHeight,
} from '../../../screens/Search/runtime/shared/search-startup-geometry';
import type { SnapPoints } from '../../bottomSheetMotionTypes';
import { OVERLAY_TAB_HEADER_HEIGHT } from '../../overlaySheetStyles';
import { calculateSnapPoints } from '../../sheetUtils';
import type {
  PollsPanelInitialSnapPoint,
  UsePollsPanelSpecOptions,
} from './polls-panel-runtime-contract';
import { POLL_FEED_PLACE_FILTER_ALL, usePollsFeedControlsStore } from './polls-feed-controls-store';
import { usePollsFeedRuntimeController } from './polls-feed-runtime-controller';
import { buildPollsHeaderVisualModel } from '../pollsHeaderVisuals';
import { useViewportSubjectState } from '../../../store/viewport-subject-store';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type UsePollsPanelFeedRuntimeArgs = Pick<
  UsePollsPanelSpecOptions,
  | 'visible'
  | 'params'
  | 'mode'
  | 'currentSnap'
  | 'initialSnapPoint'
  | 'navBarTop'
  | 'navBarHeight'
  | 'searchBarTop'
  | 'snapPoints'
  | 'interactionRef'
>;

export type PollsPanelFeedRuntime = {
  contentBottomPadding: number;
  dismissThreshold: number | undefined;
  headerAction: 'create' | 'close';
  headerVisualModel: ReturnType<typeof buildPollsHeaderVisualModel>;
  /** §2 header verdict for this viewport (null = "Polls in this area"). */
  headerPlaceName: string | null;
  initialSnap: PollsPanelInitialSnapPoint;
  isPollFeedRefreshing: boolean;
  isSystemUnavailable: boolean;
  loading: boolean;
  /** Final give-up of the retry ladder — the body may surface a quiet failure note. */
  pollFeedLoadFailed: boolean;
  polls: Poll[];
  /** §6 cold-start promise state (weekly drop pending on an empty seeded town). */
  promise: PollFeedPromise | null;
  resolvedSnap: UsePollsPanelSpecOptions['currentSnap'] | PollsPanelInitialSnapPoint;
  snapPoints: SnapPoints;
  /** The loaded pages, sliced by the §6 place filter (client-side this leg). */
  visiblePolls: Poll[];
  /** Cursor pagination: append the next keyset page (single-flight; no-op at end). */
  loadMorePolls: () => void;
  /**
   * Leg 4 content choreography: true between a feed-toggle press-up (old cards out)
   * and the new slice's arrival — the list body renders NOTHING (bare white under
   * the header strip; no skeleton, no empty-state message).
   */
  isFeedSliceAwaiting: boolean;
  feedState: 'active' | 'closed';
  feedSort: PollFeedSort;
  feedType: PollFeedType;
  feedTime: PollFeedTime;
};

export const usePollsPanelFeedRuntime = ({
  visible,
  params,
  mode = 'docked',
  currentSnap,
  initialSnapPoint,
  navBarTop = 0,
  navBarHeight = 0,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  interactionRef,
}: UsePollsPanelFeedRuntimeArgs): PollsPanelFeedRuntime => {
  const insets = useSafeAreaInsets();
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const headerHeight = OVERLAY_TAB_HEADER_HEIGHT;
  const estimatedNavBarHeight = resolveSearchBottomNavHeight(
    resolveSearchBottomInset(insets.bottom)
  );
  const navBarInset = Math.max(navBarHeight > 0 ? navBarHeight : estimatedNavBarHeight, 0);
  const navBarOffset = Math.max(navBarTop > 0 ? navBarTop : SCREEN_HEIGHT - navBarInset, 0);
  const [polls, setPolls] = React.useState<Poll[]>([]);
  const [headerPlaceName, setHeaderPlaceName] = React.useState<string | null>(null);
  const [promise, setPromise] = React.useState<PollFeedPromise | null>(null);
  const [isPollFeedRefreshing, setPollFeedRefreshing] = React.useState(false);
  const [pollFeedLoadFailed, setPollFeedLoadFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  // Feed control state (Live/Results split, Type, Sort, Time, place slicer) lives in
  // the module store since leg 3 — the header-mounted strip (chrome) writes it, this
  // runtime (body/query) reads it. See polls-feed-controls-store.ts for the protocol.
  const feedState = usePollsFeedControlsStore((state) => state.feedState);
  const feedSort = usePollsFeedControlsStore((state) => state.feedSort);
  const feedType = usePollsFeedControlsStore((state) => state.feedType);
  const feedTime = usePollsFeedControlsStore((state) => state.feedTime);
  const placeFilter = usePollsFeedControlsStore((state) => state.placeFilter);

  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = React.useMemo<SnapPoints>(
    () =>
      snapPointsOverride ??
      calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarOffset, headerHeight),
    [headerHeight, insets.top, navBarOffset, searchBarTop, snapPointsOverride]
  );
  const dismissThreshold =
    mode === 'docked' ? snapPoints.collapsed + 1 : navBarOffset > 0 ? navBarOffset : undefined;
  const initialSnap: PollsPanelInitialSnapPoint =
    initialSnapPoint ?? (mode === 'overlay' ? 'middle' : 'collapsed');
  const resolvedSnap = currentSnap ?? initialSnap;
  const headerAction: 'create' | 'close' =
    resolvedSnap === 'collapsed' || resolvedSnap === 'hidden' ? 'create' : 'close';
  // §6 place slicer — CLIENT-SIDE slice of the loaded pages (render-time; server-side
  // slicing is a later leg — see polls-feed-controls-store.placeFilter).
  const visiblePolls = React.useMemo(
    () =>
      placeFilter === POLL_FEED_PLACE_FILTER_ALL
        ? polls
        : polls.filter((poll) => poll.placeId === placeFilter),
    [placeFilter, polls]
  );
  // HEADER SUBJECT-STORE (ratified 2026-07-21): the client subject store is the
  // TITLE AUTHORITY — the same §2 law run on-device against the sliding catalog
  // slice, committed via settle+dwell hysteresis. The feed response's
  // header.placeName survives ONLY as the initial-paint fallback until the
  // store's first commit (verdict null); after that the store wins, so the
  // title tracks the live viewport instead of the last-fetched feed bounds.
  const viewportSubject = useViewportSubjectState();
  const effectivePlaceName =
    viewportSubject.verdict != null
      ? viewportSubject.verdict.kind === 'place'
        ? viewportSubject.verdict.placeName
        : null
      : headerPlaceName;
  const headerVisualModel = React.useMemo(
    () =>
      buildPollsHeaderVisualModel({
        placeName: effectivePlaceName,
        isResolvingPlace:
          viewportSubject.verdict == null && loading && !effectivePlaceName && polls.length === 0,
      }),
    [effectivePlaceName, loading, polls.length, viewportSubject.verdict]
  );

  const { loadMorePolls, isFeedSliceAwaiting } = usePollsFeedRuntimeController({
    visible,
    feedState,
    feedSort,
    feedType,
    feedTime,
    setPolls,
    setHeaderPlaceName,
    setPromise,
    setLoading,
    setPollFeedRefreshing,
    setPollFeedLoadFailed,
    isSystemUnavailable,
    pollIdParam: params?.pollId,
    interactionRef,
  });

  // Feed-query toggle presses (toggle-system v2.1, leg-3 shape): the header strip's
  // store write IS the optimistic flip; the network consequence is wired inside the
  // feed controller, which subscribes to the store's control keys and hands the
  // refresh to the shared toggle engine (one quiet refresh per press burst).

  return React.useMemo(
    () => ({
      contentBottomPadding,
      dismissThreshold,
      headerAction,
      headerVisualModel,
      // The published place verdict is the STORE's once committed (see above);
      // downstream mouths (header model → creation label) read one authority.
      headerPlaceName: effectivePlaceName,
      initialSnap,
      isPollFeedRefreshing,
      isSystemUnavailable,
      loading,
      pollFeedLoadFailed,
      polls,
      promise,
      resolvedSnap,
      snapPoints,
      visiblePolls,
      loadMorePolls,
      isFeedSliceAwaiting,
      feedState,
      feedSort,
      feedType,
      feedTime,
    }),
    [
      contentBottomPadding,
      dismissThreshold,
      headerAction,
      headerVisualModel,
      effectivePlaceName,
      initialSnap,
      isPollFeedRefreshing,
      isSystemUnavailable,
      loading,
      pollFeedLoadFailed,
      polls,
      promise,
      resolvedSnap,
      snapPoints,
      visiblePolls,
      loadMorePolls,
      isFeedSliceAwaiting,
      feedState,
      feedSort,
      feedType,
      feedTime,
    ]
  );
};
