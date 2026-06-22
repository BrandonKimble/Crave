import React from 'react';
import { Alert, View, Pressable, StyleSheet, Image } from 'react-native';
import { Sparkles, MessageCircle, Users, Clock } from 'lucide-react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import type { Poll, PollCreator } from '../../services/polls';
import { colors as themeColors } from '../../constants/theme';
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
  overlaySheetStyles,
} from '../overlaySheetStyles';
import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
} from '../../navigation/runtime/app-route-scene-descriptor-contract';
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

const LIVE_BADGE_HEIGHT = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;

const ACCENT = themeColors.primary;
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
    <Pressable
      style={({ pressed }) => [
        styles.pollCard,
        isActive && styles.pollCardActive,
        pressed && styles.pollCardPressed,
      ]}
      onPress={() => onPress(poll)}
      accessibilityRole="button"
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
            previewRows={3}
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
        <View style={styles.pollCardHeaderSpacer} />
        {isActive ? (
          daysLeft ? (
            <View style={styles.metric}>
              <Clock size={13} color={themeColors.textMuted} strokeWidth={2} />
              <Text variant="caption" style={styles.metricText}>
                {daysLeft}
              </Text>
            </View>
          ) : null
        ) : (
          <Text variant="caption" weight="semibold" style={styles.finalResults}>
            Final results
          </Text>
        )}
      </View>
    </Pressable>
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

const POLLS_LIST_ESTIMATED_ITEM_SIZE = 190;
const EMPTY_POLL_LIST: readonly Poll[] = [];

const POLLS_LIST_BODY_ADMISSION_POLICY = {
  retainMountedBodyDuringTransition: true,
  keepDataSubscribedAfterActivation: true,
} as const;

/**
 * Builds the polls feed as a `'list'` scene body — the SAME gesture-aware
 * FlashList surface the results sheet uses (sheet-drag → list-scroll handoff in
 * one gesture, and card taps that actually fire). Published by the polls
 * scene-input writer (see use-app-route-polls-scene-input-writer-runtime). The
 * feed data + header-model publication live here, mounted independent of body
 * surface kind so the chicken-and-egg of "mounted body owns the data" is gone.
 */
export const usePollsPanelListSceneParts = (): {
  sceneBodyContent: AppRouteSceneBodyContentSpec;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec;
} => {
  useSearchNavSwitchCommitAttribution('PollsSceneInputWriter');
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

  const {
    contentBottomPadding,
    loading,
    isPollFeedRefreshing,
    isSystemUnavailable,
    polls,
    visiblePolls,
    resolvedSnap,
    shouldHoldFreshLiveContent,
    pollFeedFreshnessError,
    marketStatus,
    candidateLocalityName,
    marketName,
  } = pollsPanelFeedRuntime;

  const shouldShowCollapsedSpinner = loading || (isSystemUnavailable && polls.length === 0);
  const hasVisiblePolls = visiblePolls.length > 0;
  const isExpandedSurface = resolvedSnap === 'middle' || resolvedSnap === 'expanded';

  const renderItem = React.useCallback(
    ({ item }: { item: unknown }) => <PollCard poll={item as Poll} onPress={handleOpenPoll} />,
    [handleOpenPoll]
  );
  const keyExtractor = React.useCallback((item: unknown) => (item as Poll).pollId, []);

  const listData: readonly Poll[] =
    hasVisiblePolls && !shouldHoldFreshLiveContent && !shouldShowCollapsedSpinner
      ? visiblePolls
      : EMPTY_POLL_LIST;

  // Quiet refresh indicator above an existing list while the live feed updates.
  const ListHeaderComponent = React.useMemo(() => {
    if (
      !isExpandedSurface ||
      listData.length === 0 ||
      !(loading || isPollFeedRefreshing) ||
      polls.length === 0
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
  }, [isExpandedSurface, isPollFeedRefreshing, listData.length, loading, polls.length]);

  const ListEmptyComponent = React.useMemo(() => {
    if (shouldHoldFreshLiveContent) {
      return (
        <View style={styles.loaderCentered}>
          {pollFeedFreshnessError ? null : <SquircleSpinner size={22} color={ACCENT} />}
          <Text variant="body" style={styles.emptyState}>
            {pollFeedFreshnessError ? 'Unable to refresh live polls.' : 'Updating live polls...'}
          </Text>
        </View>
      );
    }
    if (shouldShowCollapsedSpinner) {
      return (
        <View style={styles.loaderCentered}>
          <SquircleSpinner size={22} color={ACCENT} />
        </View>
      );
    }
    let emptyMessage = 'No polls available yet.';
    if (marketStatus === 'no_market' && candidateLocalityName) {
      emptyMessage = `Create the first poll in ${candidateLocalityName} and start surfacing local favorites.`;
    } else if (marketName) {
      emptyMessage = `Create the first poll in ${marketName} and start surfacing local favorites.`;
    }
    return (
      <Text variant="body" style={styles.emptyState}>
        {isExpandedSurface ? emptyMessage : 'No polls available yet.'}
      </Text>
    );
  }, [
    candidateLocalityName,
    isExpandedSurface,
    marketName,
    marketStatus,
    pollFeedFreshnessError,
    shouldHoldFreshLiveContent,
    shouldShowCollapsedSpinner,
  ]);

  const sceneBodyContent = React.useMemo<AppRouteSceneBodyContentSpec>(
    () => ({
      surfaceKind: 'list',
      data: listData,
      renderItem,
      keyExtractor,
      estimatedItemSize: POLLS_LIST_ESTIMATED_ITEM_SIZE,
      ListHeaderComponent,
      ListEmptyComponent,
    }),
    [ListEmptyComponent, ListHeaderComponent, keyExtractor, listData, renderItem]
  );

  const sceneBodyTransport = React.useMemo<AppRouteSceneBodyTransportSpec>(
    () => ({
      contentContainerStyle: {
        paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
        paddingTop: 2,
        paddingBottom: contentBottomPadding,
      },
      keyboardShouldPersistTaps: 'handled',
      bounces: false,
      alwaysBounceVertical: false,
      overScrollMode: 'never',
      contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
    }),
    [contentBottomPadding]
  );

  return { sceneBodyContent, sceneBodyTransport };
};

export const POLLS_SCENE_LIST_BODY_ADMISSION_POLICY = POLLS_LIST_BODY_ADMISSION_POLICY;

const styles = StyleSheet.create({
  headerRow: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  listHeader: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
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
  pollCardPressed: { opacity: 0.85 },
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
  finalResults: {
    color: ACCENT,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
    color: ACCENT,
  },
});
