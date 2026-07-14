import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Sparkles, MessageCircle, Users, Clock } from 'lucide-react-native';
import {
  SegmentedToggle,
  SelectorChip,
  toggleOptionSelector,
  useOptionSelectorOpenKey,
  showAppModal,
  Text,
} from '../../components';
import { ToggleStrip } from '../../toggles/ToggleStrip';
import {
  clearToggleStripCacheScrollX,
  createToggleStripCacheSeat,
} from '../../toggles/toggle-strip-layout-cache';
import type {
  Poll,
  PollCreator,
  PollFeedSort,
  PollFeedTime,
  PollFeedType,
} from '../../services/polls';
import { colors as themeColors } from '../../constants/theme';
import { useAppRouteSceneRuntime } from '../../navigation/runtime/AppRouteSceneRuntimeProvider';
import {
  arePollsSceneHeaderModelsEqual,
  type AppRoutePollsSceneBodySnapshot,
  type AppRoutePollsSceneHeaderModel,
} from '../../navigation/runtime/app-route-polls-scene-runtime';
import { useRouteAuthoritySelector } from '../../navigation/runtime/use-route-authority-selector';
import { OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
} from '../../navigation/runtime/app-route-scene-descriptor-contract';
import SquircleSpinner from '../../components/SquircleSpinner';
import { SceneLoadingSurface } from '../../components/skeletons';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { registerHeaderCreateAction } from '../../navigation/runtime/header-nav-action-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { PollCandidateBars } from './PollCandidateBars';
import { usePollsFeedControlsStore } from './runtime/polls-feed-controls-store';
import { usePollsPanelFeedRuntime } from './runtime/polls-panel-feed-runtime';
import { usePollsPanelHeaderModelPublication } from './runtime/polls-panel-header-model-runtime';
import { PollsHeaderTitleText } from './pollsHeaderVisuals';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioSearchRequestLifecycle } from '../../perf/perf-scenario-attribution';
import { MonogramAvatar } from '../../components/MonogramAvatar';

const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

// Feed primary split (wave-2 §3): Live (open polls, with the live count in the
// segment) <-> Closed (state-word symmetry; every poll has results, so "Results"
// read ambiguously).
const FEED_STATE_VALUES = ['active', 'closed'] as const;

// Type filter (§6): exclusive, always one active (default All). Chips display the
// VALUE, never the axis name (§3) — 'All' at rest, accented value when overridden.
const TYPE_OPTIONS: ReadonlyArray<{ label: string; value: PollFeedType }> = [
  { label: 'All', value: 'all' },
  { label: 'Polls', value: 'polls' },
  { label: 'Discussions', value: 'discussions' },
];
const TYPE_LABEL_BY_VALUE: Record<PollFeedType, string> = {
  all: 'All',
  polls: 'Polls',
  discussions: 'Discussions',
};

// MASTER sort (wave-2 §3): New (default — chronological; what the API always did
// when the old "Default" omitted the param) | Trending | Top. Time folds INTO Top:
// the period chip exists only while Top is the sort (a conditional strip citizen).
const SORT_SELECTOR_OPTIONS: ReadonlyArray<{ label: string; value: PollFeedSort }> = [
  { label: 'New', value: 'new' },
  { label: 'Trending', value: 'trending' },
  { label: 'Top', value: 'top' },
];
const SORT_LABEL_BY_VALUE: Record<PollFeedSort, string> = {
  new: 'New',
  top: 'Top',
  trending: 'Trending',
};

// Top's time period (§3): Today + This month join the set; only rendered under Top.
const TIME_OPTIONS: ReadonlyArray<{ label: string; value: PollFeedTime }> = [
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'this_week' },
  { label: 'This month', value: 'this_month' },
  { label: 'All time', value: 'all_time' },
];
const TIME_LABEL_BY_VALUE: Record<PollFeedTime, string> = {
  all_time: 'All time',
  today: 'Today',
  this_week: 'This week',
  this_month: 'This month',
};

// The polls feed is RE-SORTABLE. FlashList's maintain-visible-content-position
// (chat-style, on by default) anchors the old top row when the Live/Results split or
// sort re-orders the rows, scrolling the filter strip off-screen. A re-sortable feed
// wants the opposite — stay at the top and show the new #1 — so MVCP is disabled here
// (per-scene via the transport's flashListProps; search/restaurant keep the default).
const POLLS_FEED_FLASH_LIST_PROPS = {
  maintainVisibleContentPosition: { disabled: true },
} as const;

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
  if (creator?.origin === 'user') {
    return (
      <MonogramAvatar
        seed={creator.username ?? resolveCreatorName(creator)}
        avatarUrl={creator.avatarUrl}
        title={resolveCreatorName(creator)}
        size={22}
        textVariant="caption"
        textStyle={styles.avatarInitial}
      />
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
      <Text
        variant="subtitle"
        weight="semibold"
        style={styles.pollQuestion}
        testID={`poll-card-title-${poll.pollId}`}
      >
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

// P3 persistent header (page-switch-master-plan.md §6-P3): the polls header CONTENT mounts inside
// the hoisted PersistentSheetHeaderHost, NOT inside this panel — the title comes from the
// header-model authority and the close action from the overlay route controller (both reachable
// anywhere under the app providers). The grab-handle tap is the shared promote handler.

const PollsPersistentHeaderTitle = React.memo(() => {
  usePollsHeaderCreateActionRegistration();
  const headerModel = usePollsSceneHeaderModel();
  // Title renders SYNCHRONOUSLY — 'Polls' seeds the first frame when the header model is late.
  const headerTitle = headerModel?.title ?? 'Polls';

  // Perf-contract attribution: scripts/perf-scenario-market-demand-contracts.js matches
  // source 'polls.mountedHeader' + phase 'poll_header_rendered' — keep the strings stable.
  React.useEffect(() => {
    logPerfScenarioSearchRequestLifecycle({
      source: 'polls.mountedHeader',
      phase: 'poll_header_rendered',
      renderedPollHeaderAction: headerModel?.headerAction ?? null,
      renderedPollHeaderCandidateLocalityName: headerModel?.candidateLocalityName ?? null,
      renderedPollHeaderMarketKey: headerModel?.marketKey ?? null,
      renderedPollHeaderMarketName: headerModel?.marketName ?? null,
      renderedPollHeaderMarketOverride: headerModel?.marketOverride ?? null,
      renderedPollHeaderTitle: headerTitle,
    });
  }, [
    headerModel?.candidateLocalityName,
    headerModel?.headerAction,
    headerModel?.marketKey,
    headerModel?.marketName,
    headerModel?.marketOverride,
    headerTitle,
  ]);

  return (
    <View style={styles.persistentHeaderTitleGroup}>
      <PollsHeaderTitleText title={headerTitle} />
    </View>
  );
});

PollsPersistentHeaderTitle.displayName = 'PollsPersistentHeaderTitle';

// §4 header plus (leg 7): the host-owned HeaderNavAction fires the CREATE lane for parents;
// polls' create is MARKET-GATED (market params + the "Pick a market" modal), so it registers on
// the header-create registry from the header Title mount (a real committed component under the
// app providers — the scene body-spec hooks never commit effects). Snapshots read at PRESS time.
const usePollsHeaderCreateActionRegistration = () => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { pushRoute } = useAppOverlayRouteController();
  React.useEffect(
    () =>
      registerHeaderCreateAction('polls', () => {
        const sceneState = routeSceneRuntime.routePollsSceneRuntime.sceneAuthority.getSnapshot();
        const headerModel =
          routeSceneRuntime.routePollsSceneRuntime.headerModelAuthority.getSnapshot();
        const params = sceneState.params;
        const pinnedMarketOverride =
          params?.pinnedMarket === true || Boolean(params?.pollId)
            ? params?.marketKey?.trim() || null
            : null;
        const marketOverride = headerModel?.marketOverride ?? pinnedMarketOverride;
        const marketKey = headerModel?.marketKey ?? params?.marketKey?.trim() ?? null;

        if (!sceneState.bounds && !marketKey && !marketOverride) {
          showAppModal({
            title: 'Pick a market',
            message: 'Move the map to a local market before creating a poll.',
          });
          return;
        }

        sceneState.onRequestPollCreationExpand?.();
        pushRoute('pollCreation', {
          marketKey: marketOverride ?? marketKey ?? null,
          marketName:
            headerModel?.marketName ??
            params?.marketName ??
            headerModel?.candidateLocalityName ??
            null,
          bounds: sceneState.bounds ?? null,
        });
      }),
    [pushRoute, routeSceneRuntime]
  );
};

// THE POLLS FEED STRIP — HEADER-EXTENSION MOUNT (leg 3, audit D4.2). Mounted by the
// persistent header host in the SAME committed frame as the title, so the strip exists
// from the page's first paint by construction — the old snap gate (ListHeaderComponent
// null until resolvedSnap reached middle/expanded — THE audited snap-in defect) is
// deleted, not moved. Control state lives in the module store (chrome writes, the feed
// runtime reads); the store write is the optimistic flip and the feed controller's
// store subscription owns the network consequence.
const pollsFeedStripCacheSeat = createToggleStripCacheSeat();

const PollsFeedStrip = React.memo(() => {
  const feedState = usePollsFeedControlsStore((state) => state.feedState);
  const feedSort = usePollsFeedControlsStore((state) => state.feedSort);
  const feedType = usePollsFeedControlsStore((state) => state.feedType);
  const feedTime = usePollsFeedControlsStore((state) => state.feedTime);
  const liveCount = usePollsFeedControlsStore((state) => state.liveCount);
  const setFeedState = usePollsFeedControlsStore((state) => state.setFeedState);
  const setFeedSort = usePollsFeedControlsStore((state) => state.setFeedSort);
  const setFeedType = usePollsFeedControlsStore((state) => state.setFeedType);
  const setFeedTime = usePollsFeedControlsStore((state) => state.setFeedTime);
  // §3 "Live · N": dynamic live-poll count (metadata dot) inside the segment itself.
  const feedStateOptions = React.useMemo(
    () =>
      FEED_STATE_VALUES.map((value) => ({
        value,
        label: value === 'active' ? (liveCount != null ? `Live · ${liveCount}` : 'Live') : 'Closed',
      })),
    [liveCount]
  );
  // Dropdown toggles ride the ROOT OptionSelectorHost (imperative store) — no local
  // sheet mounting inside the header chrome.
  const optionSelectorOpenKey = useOptionSelectorOpenKey();
  // Owner decision (leg 3): scrollX RESETS on re-present. A header-mounted strip
  // unmounts exactly when its scene stops being presented, so unmount IS the
  // presentation-end chokepoint; the layout half stays warm for the next present.
  React.useEffect(() => () => clearToggleStripCacheScrollX(pollsFeedStripCacheSeat), []);
  return (
    <ToggleStrip
      placement="header"
      backdrop="chrome-frost"
      cacheSeat={pollsFeedStripCacheSeat}
      testID="poll-feed-strip"
    >
      <SegmentedToggle
        key="feed-state"
        options={feedStateOptions}
        value={feedState}
        onChange={setFeedState}
        accentColor={ACCENT}
        accessibilityLabel="Toggle between live and closed polls"
        testID="poll-feed-state-toggle"
      />
      {/* DROPDOWN toggles (toggle-strip primitive, owner spec 2026-07-12): each chip
          group collapsed into one SelectorChip + OptionSelectorSheet — noun label at
          the default, value + accent fill when overridden. */}
      <SelectorChip
        key="type"
        label={TYPE_LABEL_BY_VALUE[feedType]}
        active={feedType !== 'all'}
        expanded={optionSelectorOpenKey === 'poll-feed-type'}
        onPress={() =>
          toggleOptionSelector({
            key: 'poll-feed-type',
            title: 'Type',
            options: TYPE_OPTIONS,
            value: feedType,
            onSelect: (value) => setFeedType(value),
            accentColor: ACCENT,
            testID: 'poll-feed-type-sheet',
          })
        }
        accentColor={ACCENT}
        accessibilityLabel="Select feed type"
        testID="poll-feed-type-toggle"
      />
      <SelectorChip
        key="sort"
        label={SORT_LABEL_BY_VALUE[feedSort]}
        active={feedSort !== 'new'}
        expanded={optionSelectorOpenKey === 'poll-feed-sort'}
        onPress={() =>
          toggleOptionSelector({
            key: 'poll-feed-sort',
            title: 'Sort',
            options: SORT_SELECTOR_OPTIONS,
            value: feedSort,
            onSelect: (value) => setFeedSort(value),
            accentColor: ACCENT,
            testID: 'poll-feed-sort-sheet',
          })
        }
        accentColor={ACCENT}
        accessibilityLabel="Select feed sort"
        testID="poll-feed-sort-toggle"
      />
      {feedSort === 'top' ? (
        // §3: the period belongs to Top — a CONDITIONAL strip citizen (the engine
        // animates its width-grow entry / collapse exit and pushes siblings).
        <SelectorChip
          key="time"
          label={TIME_LABEL_BY_VALUE[feedTime]}
          active={feedTime !== 'all_time'}
          expanded={optionSelectorOpenKey === 'poll-feed-time'}
          onPress={() =>
            toggleOptionSelector({
              key: 'poll-feed-time',
              title: 'Top period',
              options: TIME_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              })),
              value: feedTime,
              onSelect: (value) => setFeedTime(value),
              accentColor: ACCENT,
              testID: 'poll-feed-time-sheet',
            })
          }
          accentColor={ACCENT}
          accessibilityLabel="Select Top time period"
          testID="poll-feed-time-toggle"
        />
      ) : null}
    </ToggleStrip>
  );
});

PollsFeedStrip.displayName = 'PollsFeedStrip';

// Module-scope registration (house pattern — origin-scene-live-state-registry). The docked lane presents
// 'polls' on the search root, so this one registration covers the polls page AND search-home.
registerPersistentHeaderDescriptor('polls', {
  Title: PollsPersistentHeaderTitle,
  Strip: PollsFeedStrip,
});

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
    isSystemUnavailable,
    polls,
    visiblePolls,
    resolvedSnap,
    shouldHoldFreshLiveContent,
    pollFeedFreshnessError,
    marketStatus,
    candidateLocalityName,
    marketName,
    isFeedSliceAwaiting,
  } = pollsPanelFeedRuntime;

  const shouldShowCollapsedSpinner = loading || (isSystemUnavailable && polls.length === 0);
  const hasVisiblePolls = visiblePolls.length > 0;
  const isExpandedSurface = resolvedSnap === 'middle' || resolvedSnap === 'expanded';

  const renderItem = React.useCallback(
    ({ item }: { item: unknown }) => <PollCard poll={item as Poll} onPress={handleOpenPoll} />,
    [handleOpenPoll]
  );
  const keyExtractor = React.useCallback((item: unknown) => (item as Poll).pollId, []);

  // Leg 4 content choreography (useContentToggle): between a strip press-up and the
  // new slice's arrival the OLD CARDS ARE OUT — the list is empty AND the empty
  // component is suppressed below (bare white under the header strip; never a
  // skeleton, never a "create the first poll" message mid-toggle).
  const listData: readonly Poll[] =
    hasVisiblePolls &&
    !isFeedSliceAwaiting &&
    !shouldHoldFreshLiveContent &&
    !shouldShowCollapsedSpinner
      ? visiblePolls
      : EMPTY_POLL_LIST;

  // Leg 3: the feed toggle strip is HEADER CHROME now (PollsFeedStrip, mounted by the
  // persistent header host from the page's first committed frame) — the list renders
  // no header and the old snap gate is gone.

  const ListEmptyComponent = React.useMemo(() => {
    if (isFeedSliceAwaiting) {
      // The content-toggle gap: NOTHING renders — the gap is bare white under the
      // strip by design (charter Part 3; Spotify/Reddit never show a skeleton
      // between toggle slices). The new cards snap in on the seam's ready edge.
      return null;
    }
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
      // Expanded surface: paint the structure-matched skeleton (poll cards ≈ restaurant rows)
      // so the loading frame reads as content, not a bare spinner. Collapsed: keep the compact
      // spinner — a full skeleton list would overflow the small collapsed sheet.
      if (isExpandedSurface) {
        return <SceneLoadingSurface rowType="restaurant" frostBacking />;
      }
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
    isFeedSliceAwaiting,
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
      ListEmptyComponent,
    }),
    [ListEmptyComponent, keyExtractor, listData, renderItem]
  );

  const sceneBodyTransport = React.useMemo<AppRouteSceneBodyTransportSpec>(
    () => ({
      contentContainerStyle: {
        paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
        // 0 like the result sheet (was 2): the 2px pushed the toggle strip's top edge out from
        // under the header plate's 3px overlap (HEADER_FOREGROUND_PLATE_OVERLAP_PX), exposing the
        // strip's -1px mask bleed as a clipped top seam. At 0 the plate covers the strip top.
        paddingTop: 0,
        paddingBottom: contentBottomPadding,
      },
      keyboardShouldPersistTaps: 'handled',
      // Over-scroll is enforced no-bounce structurally by BottomSheetScrollContainer (see
      // SHEET_BODY_NO_OVERSCROLL) so the continuous down-handoff works — no per-scene config.
      flashListProps: POLLS_FEED_FLASH_LIST_PROPS,
    }),
    [contentBottomPadding]
  );

  return { sceneBodyContent, sceneBodyTransport };
};

export const POLLS_SCENE_LIST_BODY_ADMISSION_POLICY = POLLS_LIST_BODY_ADMISSION_POLICY;

const styles = StyleSheet.create({
  // Parity shim for the pre-hoist polls header rowStyle ({ gap: 10 } between title and action):
  // the persistent chrome owns the row now, so the 10px lives as paddingRight on the title group
  // (12px title marginRight + 10px = the same 22px title→button spacing as before).
  persistentHeaderTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    paddingRight: 10,
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
  avatarInitial: {
    // 22px chip — the caption glyph needs a nudge smaller; color stays the
    // MonogramAvatar white-on-deterministic-color default.
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
