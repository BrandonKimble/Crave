import React from 'react';
import {
  Alert,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Plus } from 'lucide-react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import type { AutocompleteMatch } from '../../services/autocomplete';
import type { Poll } from '../../services/polls';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import {
  arePollsSceneHeaderModelsEqual,
  type AppRoutePollsSceneBodySnapshot,
  type AppRoutePollsSceneHeaderModel,
  type AppRoutePollsSceneState,
} from '../../navigation/runtime/app-route-polls-scene-runtime';
import { useRouteAuthoritySelector } from '../../navigation/runtime/use-route-authority-selector';
import {
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
  OVERLAY_HORIZONTAL_PADDING,
} from '../overlaySheetStyles';
import SquircleSpinner from '../../components/SquircleSpinner';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { usePollsPanelComposerSubmitRuntime } from './runtime/polls-panel-composer-submit-runtime';
import { usePollsPanelComposerRuntime } from './runtime/polls-panel-composer-runtime';
import {
  usePollsPanelFeedRuntime,
  type PollsPanelFeedRuntime,
} from './runtime/polls-panel-feed-runtime';
import { usePollsPanelHeaderModelPublication } from './runtime/polls-panel-header-model-runtime';
import { PollsHeaderBadge, PollsHeaderTitleText } from './pollsHeaderVisuals';
import { CONTROL_HEIGHT, CONTROL_RADIUS } from '../../screens/Search/constants/ui';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioSearchRequestLifecycle } from '../../perf/perf-scenario-attribution';

const OPTION_COLORS = ['#f97316', '#fb7185', '#c084fc', '#38bdf8', '#facc15', '#34d399'] as const;
const CARD_GAP = 4;
const LIVE_BADGE_HEIGHT = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;

const ACCENT = themeColors.primary;
const ACCENT_DARK = themeColors.primaryDark;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

type PollCardProps = {
  poll: Poll;
  selected: boolean;
  onPress: (pollId: string) => void;
};

const PollCard = React.memo(({ poll, selected, onPress }: PollCardProps) => (
  <TouchableOpacity
    style={[styles.pollCard, selected && styles.pollCardActive]}
    onPress={() => onPress(poll.pollId)}
  >
    <Text variant="subtitle" weight="semibold" style={styles.pollQuestion}>
      {poll.question}
    </Text>
    {poll.topic?.description ? (
      <Text variant="body" style={styles.pollDescription}>
        {poll.topic.description}
      </Text>
    ) : null}
    <Text variant="body" style={styles.pollMeta}>
      {poll.options.length} options
    </Text>
  </TouchableOpacity>
));

PollCard.displayName = 'PollCard';

type PollsSceneBodyState = AppRoutePollsSceneBodySnapshot;

type PollsSceneBodyRenderState = Pick<
  AppRoutePollsSceneBodySnapshot,
  'bounds' | 'bootstrapSnapshot' | 'userLocation' | 'params' | 'currentSnap' | 'interactionRef'
>;

const arePollsSceneBodyRenderStatesEqual = (
  left: PollsSceneBodyRenderState,
  right: PollsSceneBodyRenderState
): boolean =>
  left.bounds === right.bounds &&
  left.bootstrapSnapshot === right.bootstrapSnapshot &&
  left.userLocation === right.userLocation &&
  left.params === right.params &&
  left.currentSnap === right.currentSnap &&
  left.interactionRef === right.interactionRef;

const selectPollsSceneBodyRenderState = (
  snapshot: AppRoutePollsSceneBodySnapshot
): PollsSceneBodyRenderState => ({
  bounds: snapshot.bounds,
  bootstrapSnapshot: snapshot.bootstrapSnapshot,
  userLocation: snapshot.userLocation,
  params: snapshot.params,
  currentSnap: snapshot.currentSnap,
  interactionRef: snapshot.interactionRef,
});

const usePollsSceneBodyState = (): PollsSceneBodyState => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const sceneBodyAuthority = routeSceneRuntime.routePollsSceneRuntime.sceneBodyAuthority;
  useRouteAuthoritySelector({
    subscribe: React.useCallback(
      (listener: () => void) => sceneBodyAuthority.subscribe(listener),
      [sceneBodyAuthority]
    ),
    getSnapshot: sceneBodyAuthority.getSnapshot,
    selector: React.useCallback(selectPollsSceneBodyRenderState, []),
    isEqual: arePollsSceneBodyRenderStatesEqual,
    attributionOwner: 'PollsMountedSceneBody',
    attributionOperation: 'sceneBodySelector',
  });
  return sceneBodyAuthority.getSnapshot();
};

const usePollsSceneHeaderModel = (): AppRoutePollsSceneHeaderModel => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const headerModelAuthority = routeSceneRuntime.routePollsSceneRuntime.headerModelAuthority;
  return useRouteAuthoritySelector({
    subscribe: React.useCallback(
      (listener: () => void) => headerModelAuthority.subscribe(listener),
      [headerModelAuthority]
    ),
    getSnapshot: headerModelAuthority.getSnapshot,
    selector: React.useCallback((snapshot: AppRoutePollsSceneHeaderModel) => snapshot, []),
    isEqual: arePollsSceneHeaderModelsEqual,
  });
};

type PollsMountedSceneHeaderActionRuntime = {
  headerActionProgress: SharedValue<number>;
  handleClose: () => void;
  handleHeaderActionPress: () => void;
};

const resolvePollsHeaderAction = ({
  headerModel,
  sceneState,
}: {
  headerModel: AppRoutePollsSceneHeaderModel;
  sceneState: AppRoutePollsSceneState;
}): 'create' | 'close' =>
  headerModel?.headerAction ??
  (sceneState.currentSnap === 'collapsed' || sceneState.currentSnap === 'hidden'
    ? 'create'
    : 'close');

const usePollsMountedSceneHeaderActionRuntime = (): PollsMountedSceneHeaderActionRuntime => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { pushRoute } = useAppOverlayRouteController();
  const fallbackHeaderActionProgress = useSharedValue(0);
  const headerActionProgress =
    routeSceneRuntime.routeSheetVisualAuthority.getSnapshot().chromeVisualState
      ?.overlayHeaderActionProgress ?? fallbackHeaderActionProgress;

  const handleClose = React.useCallback(() => {
    const sceneState = routeSceneRuntime.routePollsSceneRuntime.sceneAuthority.getSnapshot();
    if ((sceneState.mode ?? 'docked') === 'overlay') {
      sceneState.onRequestReturnToSearch?.();
      return;
    }
    routeSceneRuntime.routeSceneSwitchRuntime.requestOverlaySwitch({
      targetSceneKey: 'polls',
      sheetTransitionKind: 'gesture',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap: 'collapsed' },
      snapPersistence: 'sharedOnly',
    });
  }, [routeSceneRuntime]);

  const handleHeaderActionPress = React.useCallback(() => {
    const sceneState = routeSceneRuntime.routePollsSceneRuntime.sceneAuthority.getSnapshot();
    const headerModel = routeSceneRuntime.routePollsSceneRuntime.headerModelAuthority.getSnapshot();
    const headerAction = resolvePollsHeaderAction({ headerModel, sceneState });

    if (headerAction !== 'create') {
      handleClose();
      return;
    }

    const params = sceneState.params;
    const pinnedMarketOverride =
      params?.pinnedMarket === true || Boolean(params?.pollId)
        ? params?.marketKey?.trim() || null
        : null;
    const marketOverride = headerModel?.marketOverride ?? pinnedMarketOverride;
    const marketKey = headerModel?.marketKey ?? params?.marketKey?.trim() ?? null;

    if (!sceneState.bounds && !marketKey && !marketOverride) {
      Alert.alert('Pick a market', 'Move the map to a local market before creating a poll.');
      return;
    }

    sceneState.onRequestPollCreationExpand?.();
    pushRoute('pollCreation', {
      marketKey: marketOverride ?? marketKey ?? null,
      marketName:
        headerModel?.marketName ?? params?.marketName ?? headerModel?.candidateLocalityName ?? null,
      bounds: sceneState.bounds ?? null,
    });
  }, [handleClose, pushRoute, routeSceneRuntime]);

  return React.useMemo(
    () => ({
      headerActionProgress,
      handleClose,
      handleHeaderActionPress,
    }),
    [handleClose, handleHeaderActionPress, headerActionProgress]
  );
};

export const PollsMountedSceneHeader = React.memo(() => {
  const headerModel = usePollsSceneHeaderModel();
  const pollsHeaderActionRuntime = usePollsMountedSceneHeaderActionRuntime();
  return (
    <PollsSceneHeader
      headerModel={headerModel}
      headerActionProgress={pollsHeaderActionRuntime.headerActionProgress}
      handleClose={pollsHeaderActionRuntime.handleClose}
      handleHeaderActionPress={pollsHeaderActionRuntime.handleHeaderActionPress}
    />
  );
});

PollsMountedSceneHeader.displayName = 'PollsMountedSceneHeader';

type PollsSceneHeaderProps = {
  headerModel: AppRoutePollsSceneHeaderModel;
  headerActionProgress: SharedValue<number>;
  handleClose: () => void;
  handleHeaderActionPress: () => void;
};

const PollsSceneHeader = React.memo(
  ({
    headerModel,
    headerActionProgress,
    handleClose,
    handleHeaderActionPress,
  }: PollsSceneHeaderProps) => {
    const headerTitle = headerModel?.title ?? 'Polls';
    const badgeCount = headerModel?.badgeCount ?? '0';
    const badgeLabel = headerModel?.badgeLabel ?? 'live';
    const isBadgeMuted = headerModel?.isBadgeMuted ?? true;

    React.useEffect(() => {
      logPerfScenarioSearchRequestLifecycle({
        source: 'polls.mountedHeader',
        phase: 'poll_header_rendered',
        renderedPollHeaderAction: headerModel?.headerAction ?? null,
        renderedPollHeaderBadgeCount: badgeCount,
        renderedPollHeaderBadgeLabel: badgeLabel,
        renderedPollHeaderCandidateLocalityName: headerModel?.candidateLocalityName ?? null,
        renderedPollHeaderMarketKey: headerModel?.marketKey ?? null,
        renderedPollHeaderMarketName: headerModel?.marketName ?? null,
        renderedPollHeaderMarketOverride: headerModel?.marketOverride ?? null,
        renderedPollHeaderTitle: headerTitle,
      });
    }, [
      badgeCount,
      badgeLabel,
      headerModel?.candidateLocalityName,
      headerModel?.headerAction,
      headerModel?.marketKey,
      headerModel?.marketName,
      headerModel?.marketOverride,
      headerTitle,
    ]);

    return (
      <OverlaySheetHeaderChrome
        onGrabHandlePress={handleClose}
        grabHandleAccessibilityLabel="Close polls"
        rowStyle={styles.headerRow}
        title={<PollsHeaderTitleText title={headerTitle} />}
        badge={<PollsHeaderBadge count={badgeCount} label={badgeLabel} muted={isBadgeMuted} />}
        badgeRadius={LIVE_BADGE_HEIGHT / 2}
        actionButton={
          <OverlayHeaderActionButton
            progress={headerActionProgress}
            onPress={handleHeaderActionPress}
            accessibilityLabel="Create or close polls"
            accentColor={ACCENT}
            closeColor="#000000"
          />
        }
      />
    );
  }
);

PollsSceneHeader.displayName = 'PollsSceneHeader';

type PollsExpandedDetailProps = {
  activePoll: Poll;
  activePollType: PollsPanelFeedRuntime['activePollType'];
  castVote: PollsPanelFeedRuntime['castVote'];
  interactionRef: AppRoutePollsSceneState['interactionRef'];
  needsDishInput: boolean;
  needsRestaurantInput: boolean;
  selectedPollId: string | null;
  submitPollOption: PollsPanelFeedRuntime['submitPollOption'];
  totalVotes: number;
};

const PollsExpandedDetail = React.memo(
  ({
    activePoll,
    activePollType,
    castVote,
    interactionRef,
    needsDishInput,
    needsRestaurantInput,
    selectedPollId,
    submitPollOption,
    totalVotes,
  }: PollsExpandedDetailProps) => {
    const pollsPanelComposerRuntime = usePollsPanelComposerRuntime({
      activePoll,
      interactionRef,
      needsDishInput,
      needsRestaurantInput,
      selectedPollId,
    });
    const pollsPanelComposerSubmitRuntime = usePollsPanelComposerSubmitRuntime({
      activePoll,
      activePollType,
      selectedPollId,
      restaurantQuery: pollsPanelComposerRuntime.restaurantQuery,
      setRestaurantQuery: pollsPanelComposerRuntime.setRestaurantQuery,
      dishQuery: pollsPanelComposerRuntime.dishQuery,
      setDishQuery: pollsPanelComposerRuntime.setDishQuery,
      restaurantSelection: pollsPanelComposerRuntime.restaurantSelection,
      setRestaurantSelection: pollsPanelComposerRuntime.setRestaurantSelection,
      dishSelection: pollsPanelComposerRuntime.dishSelection,
      setDishSelection: pollsPanelComposerRuntime.setDishSelection,
      needsRestaurantInput,
      needsDishInput,
      hideRestaurantSuggestions: pollsPanelComposerRuntime.hideRestaurantSuggestions,
      hideDishSuggestions: pollsPanelComposerRuntime.hideDishSuggestions,
      submitPollOption,
    });
    const renderSuggestionList = React.useCallback(
      (
        loading: boolean,
        matches: AutocompleteMatch[],
        emptyText: string,
        onSelect: (match: AutocompleteMatch) => void
      ) => (
        <View style={styles.autocompleteBox}>
          {loading ? (
            <View style={styles.autocompleteLoadingRow}>
              <ActivityIndicator size="small" color={ACCENT} />
              <Text variant="body" style={styles.autocompleteLoadingText}>
                Searching...
              </Text>
            </View>
          ) : matches.length === 0 ? (
            <Text variant="body" style={styles.autocompleteEmptyText}>
              {emptyText}
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {matches.map((match) => (
                <TouchableOpacity
                  key={match.entityId}
                  style={styles.autocompleteItem}
                  onPress={() => onSelect(match)}
                >
                  <Text variant="subtitle" weight="semibold" style={styles.autocompletePrimary}>
                    {match.name}
                  </Text>
                  <Text variant="body" style={styles.autocompleteSecondary}>
                    {match.entityType.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      ),
      []
    );

    return (
      <View style={styles.detailCard}>
        <Text variant="title" weight="semibold" style={styles.detailQuestion}>
          {activePoll.question}
        </Text>
        {activePoll.topic?.description ? (
          <Text variant="body" style={styles.detailDescription}>
            {activePoll.topic.description}
          </Text>
        ) : null}
        {activePoll.options.map((option, index) => {
          const color = OPTION_COLORS[index % OPTION_COLORS.length];
          const rawFill = totalVotes > 0 ? (option.voteCount / totalVotes) * 100 : 0;
          const minFill = option.voteCount > 0 ? 10 : 2;
          const fillWidth = Math.min(Math.max(rawFill, minFill), 100);

          return (
            <TouchableOpacity
              key={option.optionId}
              style={styles.optionBarWrapper}
              onPress={() => {
                void castVote(activePoll.pollId, option.optionId);
              }}
            >
              <View style={styles.optionBarTrack}>
                <View
                  style={[
                    styles.optionBarFill,
                    {
                      width: `${fillWidth}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
                <View style={styles.optionLabelBubble}>
                  <Text variant="body" weight="semibold" style={styles.optionLabelText}>
                    {option.label}
                  </Text>
                  <Text variant="body" style={styles.optionVoteCount}>
                    {option.voteCount} votes
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
        {activePollType === 'what_to_order' ? (
          <Text variant="body" style={styles.topicNote}>
            Votes apply to dishes at this restaurant.
          </Text>
        ) : null}
        <View style={styles.addOptionBlock}>
          {needsRestaurantInput ? (
            <View style={styles.inputGroup}>
              <Text variant="body" weight="semibold" style={styles.fieldLabel}>
                Restaurant
              </Text>
              <TextInput
                value={pollsPanelComposerRuntime.restaurantQuery}
                onChangeText={(text) => {
                  pollsPanelComposerRuntime.setRestaurantQuery(text);
                  pollsPanelComposerRuntime.setRestaurantSelection(null);
                }}
                placeholder="Search for a restaurant"
                style={styles.optionInput}
                autoCapitalize="none"
              />
              {(pollsPanelComposerRuntime.showRestaurantSuggestions ||
                pollsPanelComposerRuntime.restaurantLoading) &&
                renderSuggestionList(
                  pollsPanelComposerRuntime.restaurantLoading,
                  pollsPanelComposerRuntime.restaurantSuggestions,
                  'Keep typing to add a restaurant',
                  pollsPanelComposerSubmitRuntime.onRestaurantSuggestionPick
                )}
            </View>
          ) : null}
          {needsDishInput ? (
            <View style={styles.inputGroup}>
              <Text variant="body" weight="semibold" style={styles.fieldLabel}>
                Dish
              </Text>
              <TextInput
                value={pollsPanelComposerRuntime.dishQuery}
                onChangeText={(text) => {
                  pollsPanelComposerRuntime.setDishQuery(text);
                  pollsPanelComposerRuntime.setDishSelection(null);
                }}
                placeholder="Search for a dish"
                style={styles.optionInput}
                autoCapitalize="none"
              />
              {(pollsPanelComposerRuntime.showDishSuggestions ||
                pollsPanelComposerRuntime.dishLoading) &&
                renderSuggestionList(
                  pollsPanelComposerRuntime.dishLoading,
                  pollsPanelComposerRuntime.dishSuggestions,
                  'Keep typing to add a dish',
                  pollsPanelComposerSubmitRuntime.onDishSuggestionPick
                )}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              void pollsPanelComposerSubmitRuntime.submitOptionFromPanel();
            }}
            style={styles.submitButton}
          >
            <Text variant="body" weight="semibold" style={styles.submitButtonText}>
              Submit option
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

PollsExpandedDetail.displayName = 'PollsExpandedDetail';

export const PollsMountedSceneBody = React.memo(() => {
  useSearchNavSwitchCommitAttribution('PollsMountedSceneBody');
  const { pushRoute } = useAppOverlayRouteController();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const pollsSceneActions = routeSceneRuntime.routePollsSceneRuntime.sceneActions;
  const {
    bounds,
    bootstrapSnapshot,
    userLocation,
    params,
    initialSnapPoint,
    mode = 'docked',
    currentSnap,
    navBarTop = 0,
    navBarHeight = 0,
    searchBarTop = 0,
    snapPoints: snapPointsOverride,
    interactionRef,
  } = usePollsSceneBodyState();
  const shouldSubscribeDataLane = currentSnap !== 'hidden';

  const pollsPanelFeedRuntime = usePollsPanelFeedRuntime({
    visible: shouldSubscribeDataLane,
    bounds,
    bootstrapSnapshot,
    userLocation,
    params,
    mode,
    currentSnap,
    initialSnapPoint,
    navBarTop,
    navBarHeight,
    searchBarTop,
    snapPoints: snapPointsOverride,
    interactionRef,
  });
  usePollsPanelHeaderModelPublication({
    pollsSceneActions,
    pollsPanelFeedRuntime,
  });

  const handleOpenCreate = React.useCallback(() => {
    const marketKey = pollsPanelFeedRuntime.marketOverride ?? pollsPanelFeedRuntime.marketKey;
    if (!bounds && !marketKey) {
      Alert.alert('Pick a market', 'Move the map to a local market before creating a poll.');
      return;
    }
    pushRoute('pollCreation', {
      marketKey: marketKey ?? null,
      marketName: pollsPanelFeedRuntime.marketName ?? pollsPanelFeedRuntime.candidateLocalityName,
      bounds: bounds ?? null,
    });
  }, [
    bounds,
    pollsPanelFeedRuntime.candidateLocalityName,
    pollsPanelFeedRuntime.marketKey,
    pollsPanelFeedRuntime.marketName,
    pollsPanelFeedRuntime.marketOverride,
    pushRoute,
  ]);

  const bodyContentStyle = React.useMemo(
    () => [styles.collapsedContent, { paddingBottom: pollsPanelFeedRuntime.contentBottomPadding }],
    [pollsPanelFeedRuntime.contentBottomPadding]
  );

  const listHeaderComponent = React.useMemo(() => {
    return (
      <View style={styles.listHeader}>
        <TouchableOpacity
          onPress={handleOpenCreate}
          style={styles.createButton}
          accessibilityRole="button"
          accessibilityLabel="Create a new poll"
        >
          <Plus size={16} color="#ffffff" strokeWidth={2.5} />
          <Text variant="body" weight="semibold" style={styles.createButtonText}>
            new poll
          </Text>
        </TouchableOpacity>
        {(pollsPanelFeedRuntime.loading || pollsPanelFeedRuntime.isPollFeedRefreshing) &&
        pollsPanelFeedRuntime.polls.length > 0 ? (
          <View style={styles.loader}>
            <SquircleSpinner size={18} color={ACCENT} />
          </View>
        ) : null}
      </View>
    );
  }, [
    pollsPanelFeedRuntime.isPollFeedRefreshing,
    pollsPanelFeedRuntime.loading,
    pollsPanelFeedRuntime.polls.length,
    handleOpenCreate,
  ]);

  const shouldShowCollapsedSpinner =
    pollsPanelFeedRuntime.loading ||
    (pollsPanelFeedRuntime.isSystemUnavailable && pollsPanelFeedRuntime.polls.length === 0);
  const hasVisiblePolls = pollsPanelFeedRuntime.visiblePolls.length > 0;
  const isExpandedSurface =
    pollsPanelFeedRuntime.resolvedSnap === 'middle' ||
    pollsPanelFeedRuntime.resolvedSnap === 'expanded';
  const maybeListHeaderComponent = isExpandedSurface ? listHeaderComponent : null;

  let emptyMessage = 'No polls available yet.';
  if (
    pollsPanelFeedRuntime.marketStatus === 'no_market' &&
    pollsPanelFeedRuntime.candidateLocalityName
  ) {
    emptyMessage = `Create the first poll in ${pollsPanelFeedRuntime.candidateLocalityName} and start surfacing local favorites.`;
  } else if (pollsPanelFeedRuntime.marketName) {
    emptyMessage = `Create the first poll in ${pollsPanelFeedRuntime.marketName} and start surfacing local favorites.`;
  }

  const pollCards = hasVisiblePolls ? (
    <View style={styles.collapsedCards}>
      {pollsPanelFeedRuntime.visiblePolls.map((poll) => (
        <View key={poll.pollId} style={styles.collapsedCardRow}>
          <PollCard
            poll={poll}
            selected={poll.pollId === pollsPanelFeedRuntime.selectedPollId}
            onPress={pollsPanelFeedRuntime.setSelectedPollId}
          />
        </View>
      ))}
    </View>
  ) : null;

  const shouldRenderExpandedDetail =
    !pollsPanelFeedRuntime.shouldHoldFreshLiveContent &&
    isExpandedSurface &&
    pollsPanelFeedRuntime.activePoll != null;
  const activePollForDetail = shouldRenderExpandedDetail ? pollsPanelFeedRuntime.activePoll : null;

  if (pollsPanelFeedRuntime.shouldHoldFreshLiveContent) {
    return (
      <View style={bodyContentStyle}>
        {maybeListHeaderComponent}
        <View style={styles.loaderCentered}>
          {pollsPanelFeedRuntime.pollFeedFreshnessError ? null : (
            <SquircleSpinner size={22} color={ACCENT} />
          )}
          <Text variant="body" style={styles.emptyState}>
            {pollsPanelFeedRuntime.pollFeedFreshnessError
              ? 'Unable to refresh live polls.'
              : 'Updating live polls...'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={bodyContentStyle}>
      {maybeListHeaderComponent}
      {shouldShowCollapsedSpinner ? (
        <View style={styles.loaderCentered}>
          <SquircleSpinner size={22} color={ACCENT} />
        </View>
      ) : (
        pollCards ?? (
          <Text variant="body" style={styles.emptyState}>
            {isExpandedSurface ? emptyMessage : 'No polls available yet.'}
          </Text>
        )
      )}
      {activePollForDetail ? (
        <PollsExpandedDetail
          activePoll={activePollForDetail}
          activePollType={pollsPanelFeedRuntime.activePollType}
          castVote={pollsPanelFeedRuntime.castVote}
          interactionRef={interactionRef}
          needsDishInput={pollsPanelFeedRuntime.needsDishInput}
          needsRestaurantInput={pollsPanelFeedRuntime.needsRestaurantInput}
          selectedPollId={pollsPanelFeedRuntime.selectedPollId}
          submitPollOption={pollsPanelFeedRuntime.submitPollOption}
          totalVotes={pollsPanelFeedRuntime.totalVotes}
        />
      ) : null}
    </View>
  );
});

PollsMountedSceneBody.displayName = 'PollsMountedSceneBody';

const styles = StyleSheet.create({
  headerRow: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingTop: 16,
  },
  listHeader: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  collapsedContent: {
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    backgroundColor: 'transparent',
  },
  collapsedCards: {
    gap: CARD_GAP,
  },
  collapsedCardRow: {
    minHeight: 0,
  },
  createButton: {
    height: CONTROL_HEIGHT,
    borderRadius: CONTROL_RADIUS,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  createButtonText: {
    color: '#ffffff',
  },
  loader: {
    marginTop: 12,
  },
  loaderCentered: {
    marginTop: 12,
    alignSelf: 'center',
  },
  pollCard: {
    paddingVertical: 16,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    borderRadius: 0,
    backgroundColor: '#ffffff',
    width: '100%',
    alignSelf: 'stretch',
  },
  pollCardActive: {
    borderWidth: 2,
    borderColor: ACCENT,
  },
  pollQuestion: {
    color: ACCENT_DARK,
  },
  pollDescription: {
    marginTop: 6,
    color: themeColors.textBody,
  },
  pollMeta: {
    marginTop: 6,
    color: ACCENT,
  },
  detailCard: {
    flex: 1,
    marginTop: CARD_GAP,
    paddingVertical: 16,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    borderRadius: 0,
    backgroundColor: '#ffffff',
    alignSelf: 'stretch',
    width: '100%',
  },
  detailQuestion: {
    color: ACCENT_DARK,
    marginBottom: 8,
  },
  detailDescription: {
    color: themeColors.textBody,
    marginBottom: 12,
  },
  optionBarWrapper: {
    marginTop: 12,
  },
  optionBarTrack: {
    position: 'relative',
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(249, 115, 131, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 131, 0.2)',
    justifyContent: 'center',
  },
  optionBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
  },
  optionLabelBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  optionLabelText: {
    color: '#1f2937',
  },
  optionVoteCount: {
    color: ACCENT_DARK,
  },
  addOptionBlock: {
    marginTop: 16,
  },
  inputGroup: {
    marginTop: 8,
  },
  optionInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    backgroundColor: SURFACE,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 6,
    color: ACCENT,
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
  },
  autocompleteBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    maxHeight: 200,
    overflow: 'hidden',
  },
  autocompleteLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 8,
  },
  autocompleteLoadingText: {
    color: themeColors.textBody,
  },
  autocompleteEmptyText: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: themeColors.textBody,
  },
  autocompleteItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  autocompletePrimary: {
    color: '#111827',
  },
  autocompleteSecondary: {
    color: themeColors.textBody,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  topicNote: {
    marginTop: 12,
    color: ACCENT,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
    color: ACCENT,
  },
});
