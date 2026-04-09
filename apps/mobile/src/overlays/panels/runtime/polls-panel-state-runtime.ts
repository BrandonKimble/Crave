import React from 'react';
import { Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AutocompleteMatch } from '../../../services/autocomplete';
import type { Poll, PollTopicType } from '../../../services/polls';
import { useCityStore } from '../../../store/cityStore';
import { useSystemStatusStore } from '../../../store/systemStatusStore';
import { LINE_HEIGHTS } from '../../../constants/typography';
import { NAV_BOTTOM_PADDING, NAV_TOP_PADDING } from '../../../screens/Search/constants/search';
import type { SnapPoints } from '../../bottomSheetMotionTypes';
import { OVERLAY_TAB_HEADER_HEIGHT } from '../../overlaySheetStyles';
import { calculateSnapPoints } from '../../sheetUtils';
import type {
  PollsPanelInitialSnapPoint,
  UsePollsPanelSpecOptions,
} from './polls-panel-runtime-contract';
import { usePollsAutocompleteOwner } from './polls-autocomplete-owner';
import { usePollsRuntimeController } from './polls-runtime-controller';
import { buildPollsHeaderVisualModel } from '../pollsHeaderVisuals';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const NAV_ICON_SIZE = 24;
const NAV_ICON_LABEL_GAP = 2;

type UsePollsPanelStateRuntimeArgs = Pick<
  UsePollsPanelSpecOptions,
  | 'visible'
  | 'bounds'
  | 'bootstrapSnapshot'
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

type PollsPanelStateRuntime = {
  polls: Poll[];
  visiblePolls: Poll[];
  coverageKey: string | null;
  coverageName: string | null;
  isPollFeedRefreshing: boolean;
  pollFeedFreshnessError: boolean;
  selectedPollId: string | null;
  setSelectedPollId: React.Dispatch<React.SetStateAction<string | null>>;
  restaurantQuery: string;
  setRestaurantQuery: React.Dispatch<React.SetStateAction<string>>;
  dishQuery: string;
  setDishQuery: React.Dispatch<React.SetStateAction<string>>;
  restaurantSelection: AutocompleteMatch | null;
  setRestaurantSelection: React.Dispatch<React.SetStateAction<AutocompleteMatch | null>>;
  dishSelection: AutocompleteMatch | null;
  setDishSelection: React.Dispatch<React.SetStateAction<AutocompleteMatch | null>>;
  loading: boolean;
  snapPoints: SnapPoints;
  dismissThreshold: number | undefined;
  contentBottomPadding: number;
  initialSnap: PollsPanelInitialSnapPoint;
  resolvedSnap: UsePollsPanelSpecOptions['currentSnap'] | PollsPanelInitialSnapPoint;
  headerAction: 'create' | 'close';
  shouldHoldFreshLiveContent: boolean;
  activePoll: Poll | undefined;
  activePollType: PollTopicType;
  totalVotes: number;
  coverageOverride: string | null;
  needsRestaurantInput: boolean;
  needsDishInput: boolean;
  headerVisualModel: ReturnType<typeof buildPollsHeaderVisualModel>;
  restaurantSuggestions: AutocompleteMatch[];
  dishSuggestions: AutocompleteMatch[];
  showRestaurantSuggestions: boolean;
  showDishSuggestions: boolean;
  restaurantLoading: boolean;
  dishLoading: boolean;
  hideRestaurantSuggestions: () => void;
  hideDishSuggestions: () => void;
  castVote: ReturnType<typeof usePollsRuntimeController>['castVote'];
  submitPollOption: ReturnType<typeof usePollsRuntimeController>['submitPollOption'];
  isSystemUnavailable: boolean;
};

export const usePollsPanelStateRuntime = ({
  visible,
  bounds,
  bootstrapSnapshot,
  params,
  mode = 'docked',
  currentSnap,
  initialSnapPoint,
  navBarTop = 0,
  navBarHeight = 0,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  interactionRef,
}: UsePollsPanelStateRuntimeArgs): PollsPanelStateRuntime => {
  const insets = useSafeAreaInsets();
  const setPersistedCity = useCityStore((state) => state.setSelectedCity);
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const headerHeight = OVERLAY_TAB_HEADER_HEIGHT;
  const estimatedNavBarHeight =
    NAV_TOP_PADDING +
    NAV_BOTTOM_PADDING +
    NAV_ICON_SIZE +
    NAV_ICON_LABEL_GAP +
    LINE_HEIGHTS.body +
    insets.bottom;
  const navBarInset = Math.max(navBarHeight > 0 ? navBarHeight : estimatedNavBarHeight, 0);
  const navBarOffset = Math.max(navBarTop > 0 ? navBarTop : SCREEN_HEIGHT - navBarInset, 0);
  const [polls, setPolls] = React.useState<Poll[]>(() => bootstrapSnapshot?.polls ?? []);
  const [coverageKey, setCoverageKey] = React.useState<string | null>(
    () => bootstrapSnapshot?.coverageKey ?? null
  );
  const [coverageName, setCoverageName] = React.useState<string | null>(
    () => bootstrapSnapshot?.coverageName ?? null
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
  const [restaurantQuery, setRestaurantQuery] = React.useState('');
  const [dishQuery, setDishQuery] = React.useState('');
  const [restaurantSelection, setRestaurantSelection] = React.useState<AutocompleteMatch | null>(
    null
  );
  const [dishSelection, setDishSelection] = React.useState<AutocompleteMatch | null>(null);
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
  const visiblePolls = shouldHoldFreshLiveContent ? [] : polls;
  const activePoll = visiblePolls.find((poll) => poll.pollId === selectedPollId);
  const activePollType = (activePoll?.topic?.topicType ?? 'best_dish') as PollTopicType;
  const totalVotes = activePoll?.options.reduce((sum, option) => sum + option.voteCount, 0) ?? 0;
  const coverageOverride = mode === 'overlay' ? params?.coverageKey?.trim() || null : null;
  const needsRestaurantInput =
    activePollType === 'best_dish' ||
    activePollType === 'best_restaurant_attribute' ||
    activePollType === 'best_dish_attribute';
  const needsDishInput =
    activePollType === 'what_to_order' || activePollType === 'best_dish_attribute';
  const hasCoverageKey = Boolean(coverageOverride ?? coverageKey);
  const showResolvingLocation = loading && !coverageName && !hasCoverageKey;
  const headerVisualModel = buildPollsHeaderVisualModel({
    coverageName,
    coverageKey: coverageOverride ?? coverageKey,
    pollCount: polls.length,
    isUpdating: shouldHoldFreshLiveContent,
    isResolvingLocation: showResolvingLocation,
  });

  const { castVote, submitPollOption } = usePollsRuntimeController({
    visible,
    bounds,
    bootstrapSnapshot,
    coverageOverride,
    pollFeedRequiresFreshNetwork,
    setSelectedPollId,
    setPolls,
    setCoverageKey,
    setCoverageName,
    setLoading,
    setPollFeedRefreshing: setIsPollFeedRefreshing,
    setPollFeedRequiresFreshNetwork,
    setPollFeedFreshnessError,
    setPersistedCity,
    isSystemUnavailable,
    pollIdParam: params?.pollId,
    interactionRef,
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
    setCoverageKey(bootstrapSnapshot.coverageKey);
    setCoverageName(bootstrapSnapshot.coverageName);
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

  const {
    restaurantSuggestions,
    dishSuggestions,
    showRestaurantSuggestions,
    showDishSuggestions,
    restaurantLoading,
    dishLoading,
    hideRestaurantSuggestions,
    hideDishSuggestions,
  } = usePollsAutocompleteOwner({
    activePoll,
    needsRestaurantInput,
    needsDishInput,
    restaurantQuery,
    dishQuery,
    interactionRef,
  });

  React.useEffect(() => {
    setRestaurantQuery('');
    setDishQuery('');
    setRestaurantSelection(null);
    setDishSelection(null);
    hideRestaurantSuggestions();
    hideDishSuggestions();
  }, [hideDishSuggestions, hideRestaurantSuggestions, selectedPollId]);

  return {
    polls,
    visiblePolls,
    coverageKey,
    coverageName,
    isPollFeedRefreshing,
    pollFeedFreshnessError,
    selectedPollId,
    setSelectedPollId,
    restaurantQuery,
    setRestaurantQuery,
    dishQuery,
    setDishQuery,
    restaurantSelection,
    setRestaurantSelection,
    dishSelection,
    setDishSelection,
    loading,
    snapPoints,
    dismissThreshold,
    contentBottomPadding,
    initialSnap,
    resolvedSnap,
    headerAction,
    shouldHoldFreshLiveContent,
    activePoll,
    activePollType,
    totalVotes,
    coverageOverride,
    needsRestaurantInput,
    needsDishInput,
    headerVisualModel,
    restaurantSuggestions,
    dishSuggestions,
    showRestaurantSuggestions,
    showDishSuggestions,
    restaurantLoading,
    dishLoading,
    hideRestaurantSuggestions,
    hideDishSuggestions,
    castVote,
    submitPollOption,
    isSystemUnavailable,
  };
};
