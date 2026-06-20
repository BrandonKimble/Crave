import React from 'react';
import { Alert, View, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Sparkles, MessageCircle, Users, Clock } from 'lucide-react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import type { Poll, PollCreator } from '../../services/polls';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import {
  arePollsSceneHeaderModelsEqual,
  type AppRoutePollsSceneBodySnapshot,
  type AppRoutePollsSceneHeaderModel,
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
import { PollCandidateBars } from './PollCandidateBars';
import { usePollsPanelFeedRuntime } from './runtime/polls-panel-feed-runtime';
import { usePollsPanelHeaderModelPublication } from './runtime/polls-panel-header-model-runtime';
import { PollsHeaderBadge, PollsHeaderTitleText } from './pollsHeaderVisuals';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioSearchRequestLifecycle } from '../../perf/perf-scenario-attribution';

const CARD_GAP = 0;
const LIVE_BADGE_HEIGHT = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;

const ACCENT = themeColors.primary;
const ACCENT_DARK = themeColors.primaryDark;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

type PollCardProps = {
  poll: Poll;
  onPress: (poll: Poll) => void;
};

const formatClosedDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** "today", "1d left", "3d left" — null when there's no valid future close. */
const formatDaysLeft = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const closesAt = new Date(iso);
  if (Number.isNaN(closesAt.getTime())) return null;
  const msLeft = closesAt.getTime() - Date.now();
  if (msLeft <= 0) return null;
  const daysLeft = Math.ceil(msLeft / 86_400_000);
  return daysLeft <= 1 ? 'last day' : `${daysLeft}d left`;
};

const resolveCreatorName = (creator: PollCreator | undefined): string =>
  creator?.origin === 'user' ? (creator.displayName ?? creator.username ?? 'Member') : 'Crave';

const PollCreatorBadge = ({ creator }: { creator?: PollCreator }) => {
  if (creator?.origin === 'user' && creator.avatarUrl) {
    return <Image source={{ uri: creator.avatarUrl }} style={styles.avatar} />;
  }
  if (creator?.origin === 'user') {
    const initial = resolveCreatorName(creator).trim().charAt(0).toUpperCase();
    return (
      <View style={styles.avatarFallback}>
        <Text variant="caption" weight="semibold" style={styles.avatarInitial}>
          {initial || 'M'}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.avatarApp}>
      <Sparkles size={13} color={ACCENT} strokeWidth={2.2} />
    </View>
  );
};

const PollCard = React.memo(({ poll, onPress }: PollCardProps) => {
  const isActive = poll.state === 'active';
  const closedOn = formatClosedDate(poll.closedAt);
  const daysLeft = isActive ? formatDaysLeft(poll.closesAt) : null;
  return (
    <TouchableOpacity
      style={[styles.pollCard, isActive && styles.pollCardActive]}
      onPress={() => onPress(poll)}
      accessibilityRole="button"
      activeOpacity={0.85}
    >
      <View style={styles.pollCardHeader}>
        <PollCreatorBadge creator={poll.creator} />
        <Text variant="caption" weight="semibold" style={styles.pollCreator} numberOfLines={1}>
          {resolveCreatorName(poll.creator)}
        </Text>
        <View style={styles.pollCardHeaderSpacer} />
        {isActive ? (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text variant="caption" weight="semibold" style={styles.liveText}>
              live
            </Text>
          </View>
        ) : (
          <Text variant="caption" style={styles.pollMeta}>
            {closedOn ? `closed · ${closedOn}` : 'closed'}
          </Text>
        )}
      </View>
      <Text variant="subtitle" weight="semibold" style={styles.pollQuestion}>
        {poll.question}
      </Text>
      {poll.topCandidates && poll.topCandidates.length > 0 ? (
        <View style={styles.pollBars}>
          <PollCandidateBars
            pollId={poll.pollId}
            candidates={poll.topCandidates}
            interactive={isActive}
          />
        </View>
      ) : null}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <MessageCircle size={13} color={themeColors.textMuted} strokeWidth={2} />
          <Text variant="caption" style={styles.metricText}>
            {poll.commentCount ?? 0}
          </Text>
        </View>
        <View style={styles.metric}>
          <Users size={13} color={themeColors.textMuted} strokeWidth={2} />
          <Text variant="caption" style={styles.metricText}>
            {poll.endorserCount ?? 0}
          </Text>
        </View>
        {daysLeft ? (
          <>
            <View style={styles.pollCardHeaderSpacer} />
            <View style={styles.metric}>
              <Clock size={13} color={themeColors.textMuted} strokeWidth={2} />
              <Text variant="caption" style={styles.metricText}>
                {daysLeft}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

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

const usePollsMountedSceneHeaderActionRuntime = (): PollsMountedSceneHeaderActionRuntime => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { collapseActiveSheet, pushRoute } = useAppOverlayRouteController();
  // The poll header action is ALWAYS the "+" create button (progress pinned to 1),
  // regardless of sheet height — no dynamic close↔plus morph.
  const headerActionProgress = useSharedValue(1);

  const handleClose = React.useCallback(() => {
    const sceneState = routeSceneRuntime.routePollsSceneRuntime.sceneAuthority.getSnapshot();
    if ((sceneState.mode ?? 'docked') === 'overlay') {
      sceneState.onRequestReturnToSearch?.();
      return;
    }
    collapseActiveSheet();
  }, [collapseActiveSheet, routeSceneRuntime]);

  const handleHeaderActionPress = React.useCallback(() => {
    const sceneState = routeSceneRuntime.routePollsSceneRuntime.sceneAuthority.getSnapshot();
    const headerModel = routeSceneRuntime.routePollsSceneRuntime.headerModelAuthority.getSnapshot();
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

export const PollsMountedSceneBody = React.memo(() => {
  useSearchNavSwitchCommitAttribution('PollsMountedSceneBody');
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { pushRoute } = useAppOverlayRouteController();
  const pollsSceneActions = routeSceneRuntime.routePollsSceneRuntime.sceneActions;
  const handleOpenPoll = React.useCallback(
    (poll: Poll) => {
      pushRoute('pollDetail', { pollId: poll.pollId, poll });
    },
    [pushRoute]
  );
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

  const bodyContentStyle = React.useMemo(
    () => [styles.collapsedContent, { paddingBottom: pollsPanelFeedRuntime.contentBottomPadding }],
    [pollsPanelFeedRuntime.contentBottomPadding]
  );

  // Poll creation is launched from the header "+" button; the body header is just a
  // quiet refresh indicator when the live feed updates over an existing list.
  const listHeaderComponent = React.useMemo(() => {
    if (
      !(pollsPanelFeedRuntime.loading || pollsPanelFeedRuntime.isPollFeedRefreshing) ||
      pollsPanelFeedRuntime.polls.length === 0
    ) {
      return null;
    }
    return (
      <View style={styles.listHeader}>
        <View style={styles.loader}>
          <SquircleSpinner size={18} color={ACCENT} />
        </View>
      </View>
    );
  }, [
    pollsPanelFeedRuntime.isPollFeedRefreshing,
    pollsPanelFeedRuntime.loading,
    pollsPanelFeedRuntime.polls.length,
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
          <PollCard poll={poll} onPress={handleOpenPoll} />
        </View>
      ))}
    </View>
  ) : null;

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
        (pollCards ?? (
          <Text variant="body" style={styles.emptyState}>
            {isExpandedSurface ? emptyMessage : 'No polls available yet.'}
          </Text>
        ))
      )}
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
  loader: {
    marginTop: 12,
  },
  loaderCentered: {
    marginTop: 12,
    alignSelf: 'center',
  },
  pollCard: {
    paddingVertical: 15,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginHorizontal: -OVERLAY_HORIZONTAL_PADDING,
    backgroundColor: SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    alignSelf: 'stretch',
  },
  pollCardActive: {},
  pollCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 9,
  },
  pollCardHeaderSpacer: {
    flex: 1,
  },
  pollCreator: {
    color: themeColors.textBody,
    maxWidth: '55%',
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f1f5f9',
  },
  avatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e9eef5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: themeColors.textBody,
    fontSize: 11,
  },
  avatarApp: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fdeaf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  liveText: {
    color: ACCENT,
  },
  pollQuestion: {
    color: themeColors.textPrimary,
    lineHeight: 23,
  },
  pollBars: {
    marginTop: 12,
  },
  pollMeta: {
    color: themeColors.textMuted,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 11,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricText: {
    color: themeColors.textMuted,
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
