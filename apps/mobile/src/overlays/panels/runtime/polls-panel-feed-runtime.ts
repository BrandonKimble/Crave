import React from 'react';
import { Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Poll, PollFeedSort, PollFeedTime, PollFeedType } from '../../../services/polls';
import { useCityStore } from '../../../store/cityStore';
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
import { usePollsFeedControlsStore } from './polls-feed-controls-store';
import { usePollsFeedRuntimeController } from './polls-feed-runtime-controller';
import { buildPollsHeaderVisualModel } from '../pollsHeaderVisuals';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const EMPTY_VISIBLE_POLLS: Poll[] = [];

type UsePollsPanelFeedRuntimeArgs = Pick<
  UsePollsPanelSpecOptions,
  | 'visible'
  | 'bounds'
  | 'bootstrapSnapshot'
  | 'userLocation'
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
  candidateLocalityName: string | null;
  contentBottomPadding: number;
  createPollPrompt: string | null;
  dismissThreshold: number | undefined;
  headerAction: 'create' | 'close';
  headerVisualModel: ReturnType<typeof buildPollsHeaderVisualModel>;
  initialSnap: PollsPanelInitialSnapPoint;
  isPollFeedRefreshing: boolean;
  isSystemUnavailable: boolean;
  loading: boolean;
  marketKey: string | null;
  marketName: string | null;
  marketOverride: string | null;
  marketStatus: 'resolved' | 'multi_market' | 'no_market' | 'error' | null;
  pollFeedFreshnessError: boolean;
  polls: Poll[];
  resolvedSnap: UsePollsPanelSpecOptions['currentSnap'] | PollsPanelInitialSnapPoint;
  shouldHoldFreshLiveContent: boolean;
  snapPoints: SnapPoints;
  visiblePolls: Poll[];
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
  bounds,
  bootstrapSnapshot,
  userLocation,
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
  const setPersistedCity = useCityStore((state) => state.setSelectedCity);
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const headerHeight = OVERLAY_TAB_HEADER_HEIGHT;
  const estimatedNavBarHeight = resolveSearchBottomNavHeight(
    resolveSearchBottomInset(insets.bottom)
  );
  const navBarInset = Math.max(navBarHeight > 0 ? navBarHeight : estimatedNavBarHeight, 0);
  const navBarOffset = Math.max(navBarTop > 0 ? navBarTop : SCREEN_HEIGHT - navBarInset, 0);
  const [polls, setPolls] = React.useState<Poll[]>(() => bootstrapSnapshot?.polls ?? []);
  const [marketKey, setMarketKey] = React.useState<string | null>(
    () => bootstrapSnapshot?.marketKey ?? null
  );
  const [marketName, setMarketName] = React.useState<string | null>(
    () => bootstrapSnapshot?.marketName ?? null
  );
  const [marketStatus, setMarketStatus] = React.useState<
    'resolved' | 'multi_market' | 'no_market' | 'error' | null
  >(() =>
    bootstrapSnapshot?.marketStatus === 'resolved' ||
    bootstrapSnapshot?.marketStatus === 'multi_market' ||
    bootstrapSnapshot?.marketStatus === 'no_market' ||
    bootstrapSnapshot?.marketStatus === 'error'
      ? bootstrapSnapshot.marketStatus
      : null
  );
  const [candidateLocalityName, setCandidateLocalityName] = React.useState<string | null>(
    () => bootstrapSnapshot?.candidateLocalityName ?? null
  );
  const [createPollPrompt, setCreatePollPrompt] = React.useState<string | null>(
    () => bootstrapSnapshot?.cta?.prompt ?? bootstrapSnapshot?.cta?.label ?? null
  );
  const [isPollFeedRefreshing, setIsPollFeedRefreshing] = React.useState<boolean>(() =>
    bootstrapSnapshot ? bootstrapSnapshot.source !== 'network' : false
  );
  const [pollFeedRequiresFreshNetwork, setPollFeedRequiresFreshNetwork] = React.useState<boolean>(
    () => (bootstrapSnapshot ? bootstrapSnapshot.source !== 'network' : false)
  );
  const [pollFeedFreshnessError, setPollFeedFreshnessError] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  // Feed control state (Live/Results split, Type, Sort, Time) lives in the module
  // store since leg 3 — the header-mounted strip (chrome) writes it, this runtime
  // (body/query) reads it. See polls-feed-controls-store.ts for the write protocol.
  const feedState = usePollsFeedControlsStore((state) => state.feedState);
  const feedSort = usePollsFeedControlsStore((state) => state.feedSort);
  const feedType = usePollsFeedControlsStore((state) => state.feedType);
  const feedTime = usePollsFeedControlsStore((state) => state.feedTime);

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
  const isExpandedPollsView = resolvedSnap === 'middle' || resolvedSnap === 'expanded';
  const shouldHoldFreshLiveContent = isExpandedPollsView && pollFeedRequiresFreshNetwork;
  const visiblePolls = shouldHoldFreshLiveContent ? EMPTY_VISIBLE_POLLS : polls;
  const isPinnedMarket = params?.pinnedMarket === true || Boolean(params?.pollId);
  const marketOverride = isPinnedMarket ? params?.marketKey?.trim() || null : null;
  const hasMarketKey = Boolean(marketOverride ?? marketKey);
  const showResolvingLocation = loading && !marketName && !hasMarketKey;
  const headerVisualModel = React.useMemo(
    () =>
      buildPollsHeaderVisualModel({
        marketName,
        marketKey: marketOverride ?? marketKey,
        marketStatus,
        candidateLocalityName,
        pollCount: polls.length,
        isUpdating: shouldHoldFreshLiveContent,
        isResolvingMarket: showResolvingLocation,
      }),
    [
      candidateLocalityName,
      marketKey,
      marketName,
      marketOverride,
      marketStatus,
      polls.length,
      shouldHoldFreshLiveContent,
      showResolvingLocation,
    ]
  );

  const { isFeedSliceAwaiting } = usePollsFeedRuntimeController({
    visible,
    bounds,
    bootstrapSnapshot,
    userLocation,
    marketOverride,
    pollFeedRequiresFreshNetwork,
    feedState,
    feedSort,
    feedType,
    feedTime,
    setPolls,
    setMarketKey,
    setMarketName,
    setMarketStatus,
    setCandidateLocalityName,
    setCreatePollPrompt,
    setLoading,
    setPollFeedRefreshing: setIsPollFeedRefreshing,
    setPollFeedRequiresFreshNetwork,
    setPollFeedFreshnessError,
    setPersistedCity,
    isSystemUnavailable,
    pollIdParam: params?.pollId,
    interactionRef,
  });

  // Feed-query toggle presses (toggle-system v2.1, leg-3 shape): the header strip's
  // store write IS the optimistic flip; the network consequence is wired inside the
  // feed controller, which subscribes to the store's control keys and hands the
  // refresh to the shared toggle engine (one quiet refresh per press burst). No
  // setter wrappers remain here — any writer of the store inherits the protocol.

  const appliedBootstrapSnapshotAtRef = React.useRef<number>(bootstrapSnapshot?.resolvedAtMs ?? 0);

  React.useEffect(() => {
    if (
      !bootstrapSnapshot ||
      bootstrapSnapshot.resolvedAtMs <= appliedBootstrapSnapshotAtRef.current
    ) {
      return;
    }
    appliedBootstrapSnapshotAtRef.current = bootstrapSnapshot.resolvedAtMs;
    setPolls(bootstrapSnapshot.polls);
    setMarketKey(bootstrapSnapshot.marketKey);
    setMarketName(bootstrapSnapshot.marketName);
    setMarketStatus(
      bootstrapSnapshot.marketStatus === 'resolved' ||
        bootstrapSnapshot.marketStatus === 'multi_market' ||
        bootstrapSnapshot.marketStatus === 'no_market' ||
        bootstrapSnapshot.marketStatus === 'error'
        ? bootstrapSnapshot.marketStatus
        : null
    );
    setCandidateLocalityName(bootstrapSnapshot.candidateLocalityName ?? null);
    setCreatePollPrompt(bootstrapSnapshot.cta?.prompt ?? bootstrapSnapshot.cta?.label ?? null);
    setIsPollFeedRefreshing(bootstrapSnapshot.source !== 'network');
    setPollFeedRequiresFreshNetwork(bootstrapSnapshot.source !== 'network');
    setPollFeedFreshnessError(false);
    setLoading(false);
  }, [bootstrapSnapshot]);

  return React.useMemo(
    () => ({
      candidateLocalityName,
      contentBottomPadding,
      createPollPrompt,
      dismissThreshold,
      headerAction,
      headerVisualModel,
      initialSnap,
      isPollFeedRefreshing,
      isSystemUnavailable,
      loading,
      marketKey,
      marketName,
      marketOverride,
      marketStatus,
      pollFeedFreshnessError,
      polls,
      resolvedSnap,
      shouldHoldFreshLiveContent,
      snapPoints,
      visiblePolls,
      isFeedSliceAwaiting,
      feedState,
      feedSort,
      feedType,
      feedTime,
    }),
    [
      candidateLocalityName,
      contentBottomPadding,
      createPollPrompt,
      dismissThreshold,
      headerAction,
      headerVisualModel,
      initialSnap,
      isPollFeedRefreshing,
      isSystemUnavailable,
      loading,
      marketKey,
      marketName,
      marketOverride,
      marketStatus,
      pollFeedFreshnessError,
      polls,
      resolvedSnap,
      shouldHoldFreshLiveContent,
      snapPoints,
      visiblePolls,
      isFeedSliceAwaiting,
      feedState,
      feedSort,
      feedType,
      feedTime,
    ]
  );
};
