import React from 'react';
import { Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Poll, PollTopicType } from '../../../services/polls';
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
import { usePollsFeedRuntimeController } from './polls-feed-runtime-controller';
import { usePollsVoteMutationRuntime } from './polls-vote-mutation-runtime';
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
  activePoll: Poll | undefined;
  activePollType: PollTopicType;
  candidateLocalityName: string | null;
  castVote: ReturnType<typeof usePollsVoteMutationRuntime>['castVote'];
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
  needsDishInput: boolean;
  needsRestaurantInput: boolean;
  pollFeedFreshnessError: boolean;
  polls: Poll[];
  resolvedSnap: UsePollsPanelSpecOptions['currentSnap'] | PollsPanelInitialSnapPoint;
  selectedPollId: string | null;
  setSelectedPollId: React.Dispatch<React.SetStateAction<string | null>>;
  shouldHoldFreshLiveContent: boolean;
  snapPoints: SnapPoints;
  submitPollOption: ReturnType<typeof usePollsVoteMutationRuntime>['submitPollOption'];
  totalVotes: number;
  visiblePolls: Poll[];
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
  const [selectedPollId, setSelectedPollId] = React.useState<string | null>(
    () => params?.pollId ?? bootstrapSnapshot?.polls[0]?.pollId ?? null
  );
  const [loading, setLoading] = React.useState(false);

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
  const activePoll = visiblePolls.find((poll) => poll.pollId === selectedPollId);
  const activePollType = (activePoll?.topic?.topicType ?? 'best_dish') as PollTopicType;
  const totalVotes = activePoll?.options.reduce((sum, option) => sum + option.voteCount, 0) ?? 0;
  const isPinnedMarket = params?.pinnedMarket === true || Boolean(params?.pollId);
  const marketOverride = isPinnedMarket ? params?.marketKey?.trim() || null : null;
  const needsRestaurantInput =
    activePollType === 'best_dish' ||
    activePollType === 'best_restaurant_attribute' ||
    activePollType === 'best_dish_attribute';
  const needsDishInput =
    activePollType === 'what_to_order' || activePollType === 'best_dish_attribute';
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

  const { refreshPollFeed } = usePollsFeedRuntimeController({
    visible,
    bounds,
    bootstrapSnapshot,
    userLocation,
    marketOverride,
    pollFeedRequiresFreshNetwork,
    setSelectedPollId,
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
  const { castVote, submitPollOption } = usePollsVoteMutationRuntime({
    refreshPollFeed,
  });

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
    setSelectedPollId((current) => {
      if (params?.pollId && bootstrapSnapshot.polls.some((poll) => poll.pollId === params.pollId)) {
        return params.pollId;
      }
      if (current && bootstrapSnapshot.polls.some((poll) => poll.pollId === current)) {
        return current;
      }
      return bootstrapSnapshot.polls[0]?.pollId ?? null;
    });
  }, [bootstrapSnapshot, params?.pollId]);

  return React.useMemo(
    () => ({
      activePoll,
      activePollType,
      candidateLocalityName,
      castVote,
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
      needsDishInput,
      needsRestaurantInput,
      pollFeedFreshnessError,
      polls,
      resolvedSnap,
      selectedPollId,
      setSelectedPollId,
      shouldHoldFreshLiveContent,
      snapPoints,
      submitPollOption,
      totalVotes,
      visiblePolls,
    }),
    [
      activePoll,
      activePollType,
      candidateLocalityName,
      castVote,
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
      needsDishInput,
      needsRestaurantInput,
      pollFeedFreshnessError,
      polls,
      resolvedSnap,
      selectedPollId,
      shouldHoldFreshLiveContent,
      snapPoints,
      submitPollOption,
      totalVotes,
      visiblePolls,
    ]
  );
};
