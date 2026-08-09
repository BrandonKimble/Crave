import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Sparkles, MessageCircle, Users, Clock, MapPin } from 'lucide-react-native';
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
import { resolvePollCreatorName } from '../../services/polls';
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
import { getViewportSubjectState } from '../../store/viewport-subject-store';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { PollCandidateBars } from './PollCandidateBars';
import { usePollsFeedControlsStore } from './runtime/polls-feed-controls-store';
import { executePollsPlaceJump } from './runtime/polls-place-jump';
import { usePollsPanelFeedRuntime } from './runtime/polls-panel-feed-runtime';
import { usePollViewerIdentityPublication } from './runtime/use-poll-viewer-identity';
import { usePollsPanelHeaderModelPublication } from './runtime/polls-panel-header-model-runtime';
import { PollsHeaderTitleText } from './pollsHeaderVisuals';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioSearchRequestLifecycle } from '../../perf/perf-scenario-attribution';
import { MonogramAvatar } from '../../components/MonogramAvatar';
import { resolveSceneLoadingMaterial } from '../../navigation/runtime/scene-foundation-spec';
import { reportPollsToggleSeamSlicePainted } from './runtime/polls-toggle-seam';

// OA2/G-SKEL (R8): the loading material comes from the scene's foundation
// row through the ONE resolver — never a call-site rowType literal.
// Non-null by construction: 'polls' has a foundation row.
const POLLS_LOADING_MATERIAL = resolveSceneLoadingMaterial('polls')!;

const ACCENT = themeColors.primary;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

// Feed primary split (wave-2 §3): Live (open polls, with the live count in the
// segment) <-> Closed (state-word symmetry; every poll has results, so "Results"
// read ambiguously).
const FEED_STATE_VALUES = ['active', 'closed'] as const;

// F1468: OPTIONS arrays are DERIVED from the LABEL_BY_VALUE Record, not hand-kept
// beside it. The Record<Union, string> is total (TS forces every union member to be
// present), so deriving the array from it makes the array total too — a new union
// member that isn't given a label fails to compile, instead of silently missing its
// chip in the sheet. Record key ORDER is the array's display order (JS preserves
// string-key insertion order), so the Records below are declared in display order.
function deriveSelectorOptions<TValue extends string>(
  labelByValue: Record<TValue, string>
): ReadonlyArray<{ label: string; value: TValue }> {
  return (Object.keys(labelByValue) as TValue[]).map((value) => ({
    value,
    label: labelByValue[value],
  }));
}

// Type filter (§6): exclusive, always one active (default All). Chips display the
// VALUE, never the axis name (§3) — 'All' at rest, accented value when overridden.
const TYPE_LABEL_BY_VALUE: Record<PollFeedType, string> = {
  all: 'All',
  polls: 'Polls',
  discussions: 'Discussions',
};
const TYPE_OPTIONS = deriveSelectorOptions(TYPE_LABEL_BY_VALUE);

// MASTER sort (wave-2 §3): New (default — chronological; what the API always did
// when the old "Default" omitted the param) | Trending | Top. Time folds INTO Top:
// the period chip exists only while Top is the sort (a conditional strip citizen).
const SORT_LABEL_BY_VALUE: Record<PollFeedSort, string> = {
  new: 'New',
  trending: 'Trending',
  top: 'Top',
};
const SORT_SELECTOR_OPTIONS = deriveSelectorOptions(SORT_LABEL_BY_VALUE);

// Top's time period (§3): Today + This month join the set; only rendered under Top.
const TIME_LABEL_BY_VALUE: Record<PollFeedTime, string> = {
  today: 'Today',
  this_week: 'This week',
  this_month: 'This month',
  all_time: 'All time',
};
const TIME_OPTIONS = deriveSelectorOptions(TIME_LABEL_BY_VALUE);

// The polls feed is RE-SORTABLE, so FlashList's maintain-visible-content-position
// (chat-style anchoring) must stay OFF here — and it is: post-R8 the track's single
// FlashList disables MVCP unconditionally (TrackSheetPage.tsx). (F983 inverted the
// law under the old host's sceneFlashListPropsMerge, now deleted.)
// F2954 deleted the redundant per-scene restatement that lived here — and its
// comment's claim that "search/restaurant keep the default" was false.

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

const PollCreatorBadge = ({ creator }: { creator?: PollCreator }) => {
  if (creator?.origin === 'user') {
    return (
      <MonogramAvatar
        seed={creator.username ?? resolvePollCreatorName(creator)}
        avatarUrl={creator.avatarUrl}
        title={resolvePollCreatorName(creator)}
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
      style={({ pressed }) => [styles.pollCard, pressed && styles.pollCardPressed]}
      onPress={() => onPress(poll)}
      accessibilityRole="button"
    >
      <View style={styles.pollCardHeader}>
        <PollCreatorBadge creator={poll.creator} />
        <Text variant="caption" weight="semibold" style={styles.pollCreator} numberOfLines={1}>
          {resolvePollCreatorName(poll.creator)}
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
        {poll.placeName ? (
          // §6 per-poll place label — the viewport feed spans places, so each card
          // says whose town it is (same metadata-line pattern as the counts).
          <View style={styles.metric}>
            <MapPin size={13} color={themeColors.textMuted} strokeWidth={2} />
            <Text variant="caption" style={styles.metricText} numberOfLines={1}>
              {poll.placeName}
            </Text>
          </View>
        ) : null}
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

const formatPossessivePlace = (value: string): string =>
  value.endsWith('s') ? `${value}'` : `${value}'s`;

/**
 * §6 cold-start promise card — the ratified copy: "Polls drop Sundays — this
 * town's first unlocks as people search and vote." (placeName-aware phrasing).
 * ONE card, matching the feed's card surface language, shown only when the
 * server's typed promise state arrives on an empty seeded town.
 */
const PollFeedPromiseCard = ({
  placeName,
}: {
  /** The CLIENT verdict's name (one naming authority) — null = this-area. */
  placeName: string | null;
}) => (
  <View style={styles.promiseCard}>
    <View style={styles.promiseCardHeader}>
      <Sparkles size={16} color={ACCENT} strokeWidth={2.2} />
      <Text variant="subtitle" weight="semibold" style={styles.promiseCardTitle}>
        Polls drop Sundays
      </Text>
    </View>
    <Text variant="body" style={styles.promiseCardBody}>
      {`${formatPossessivePlace(placeName ?? 'This area')} first poll unlocks as people search and vote.`}
    </Text>
  </View>
);

type PollsSceneBodyState = AppRoutePollsSceneBodySnapshot;

type PollsSceneBodyRenderState = Pick<
  AppRoutePollsSceneBodySnapshot,
  'params' | 'currentSnap' | 'interactionRef'
>;

const arePollsSceneBodyRenderStatesEqual = (
  left: PollsSceneBodyRenderState,
  right: PollsSceneBodyRenderState
): boolean =>
  left.params === right.params &&
  left.currentSnap === right.currentSnap &&
  left.interactionRef === right.interactionRef;

const selectPollsSceneBodyRenderState = (
  snapshot: AppRoutePollsSceneBodySnapshot
): PollsSceneBodyRenderState => ({
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
  // (The market fields died with the §22 item-5 cut; the header verdict is placeName now.)
  React.useEffect(() => {
    logPerfScenarioSearchRequestLifecycle({
      source: 'polls.mountedHeader',
      phase: 'poll_header_rendered',
      renderedPollHeaderAction: headerModel?.headerAction ?? null,
      renderedPollHeaderPlaceName: headerModel?.placeName ?? null,
      renderedPollHeaderTitle: headerTitle,
    });
  }, [headerModel?.headerAction, headerModel?.placeName, headerTitle]);

  return (
    <View style={styles.persistentHeaderTitleGroup}>
      <PollsHeaderTitleText title={headerTitle} />
    </View>
  );
});

PollsPersistentHeaderTitle.displayName = 'PollsPersistentHeaderTitle';

// §4 header plus (leg 7): the host-owned HeaderNavAction fires the CREATE lane for parents;
// polls' create is VIEWPORT-GATED (creation needs bounds to anchor the poll), so it registers
// on the header-create registry from the header Title mount (a real committed component under
// the app providers — the scene body-spec hooks never commit effects). Snapshots read at PRESS
// time. The feed hands the creation flow the §2 place verdict as the display name and the
// SUBJECT STORE's settled viewport as the anchor (leg 3 — the old scene-threaded pollBounds is
// dead; the store's settledBounds is the one bounds authority).
const usePollsHeaderCreateActionRegistration = () => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { pushRoute } = useAppOverlayRouteController();
  React.useEffect(
    () =>
      registerHeaderCreateAction('polls', () => {
        const headerModel =
          routeSceneRuntime.routePollsSceneRuntime.headerModelAuthority.getSnapshot();
        const settledBounds = getViewportSubjectState().settledBounds;

        if (!settledBounds) {
          showAppModal({
            title: 'Move the map',
            message: 'Move the map to a local area before creating a poll.',
          });
          return;
        }

        pushRoute('pollCreation', {
          placeName: headerModel?.placeName ?? null,
          bounds: settledBounds,
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
  const placeOptions = usePollsFeedControlsStore((state) => state.placeOptions);
  const setFeedState = usePollsFeedControlsStore((state) => state.setFeedState);
  const setFeedSort = usePollsFeedControlsStore((state) => state.setFeedSort);
  const setFeedType = usePollsFeedControlsStore((state) => state.setFeedType);
  const setFeedTime = usePollsFeedControlsStore((state) => state.setFeedTime);
  // §6 place options (server truth, kept): the places present under the viewport,
  // ranked by content contribution (the body writes them; chrome only renders).
  const placeSelectorOptions = React.useMemo(
    () => placeOptions.map((option) => ({ value: option.placeId, label: option.placeName })),
    [placeOptions]
  );
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
      {placeOptions.length >= 2 ? (
        // §6 place chip = a JUMP now (owner-ratified Job 4): selecting a place
        // FLIES THE MAP there — the feed follows the viewport naturally (no
        // placeFilterId is sent). Momentary: the chip has no selected state and
        // its label stays at the noun rest presentation.
        <SelectorChip
          key="place"
          label="Place"
          active={false}
          expanded={optionSelectorOpenKey === 'poll-feed-place'}
          onPress={() =>
            toggleOptionSelector({
              key: 'poll-feed-place',
              title: 'Place',
              options: placeSelectorOptions,
              value: '',
              onSelect: (value) =>
                executePollsPlaceJump({
                  placeId: value,
                  slice: getViewportSubjectState().slice,
                }),
              accentColor: ACCENT,
              testID: 'poll-feed-place-sheet',
            })
          }
          accentColor={ACCENT}
          accessibilityLabel="Jump the map to a place"
          testID="poll-feed-place-toggle"
        />
      ) : null}
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
              options: TIME_OPTIONS,
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
  // F1650. The pre-9ad80e338 label was the single string 'Create or close polls' because
  // ONE morphing button carried both meanings; the host-owned control now announces per
  // STATE, so each label says exactly what a press will do.
  navActionLabels: { close: 'Close polls', create: 'Create poll' },
});

const POLLS_LIST_ESTIMATED_ITEM_SIZE = 190;
const EMPTY_POLL_LIST: readonly Poll[] = [];

// §6 pagination trigger thresholds (mirrors the search results load-more runtime):
// a real user scroll takes the offset past the floor (mount/reveal resets sit at
// ~0, so layout-time endReached stays blocked); ~half a viewport from the bottom
// fires the page.
const POLLS_FEED_SCROLL_ACTIVITY_MIN_OFFSET_PX = 100;
const POLLS_FEED_END_PROXIMITY_PX = 400;

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
  // THE VIEWER IDENTITY, RESOLVED ONCE FOR THE WHOLE LEG. This hook runs once
  // per host render; the rows read the projected two-field store. Lifting it
  // here (rather than publishing it on the list spec) keeps the profile OUT of
  // the inputs that decide what the rows are — see the store's own note.
  usePollViewerIdentityPublication();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { pushRoute } = useAppOverlayRouteController();
  const pollsSceneActions = routeSceneRuntime.routePollsSceneRuntime.sceneActions;
  const handleOpenPoll = React.useCallback(
    (poll: Poll) => {
      pushRoute('pollDetail', { pollId: poll.pollId, poll });
    },
    [pushRoute]
  );
  const { params, initialSnapPoint, currentSnap, interactionRef } = usePollsSceneBodyState();
  const shouldSubscribeDataLane = currentSnap !== 'hidden';

  const pollsPanelFeedRuntime = usePollsPanelFeedRuntime({
    visible: shouldSubscribeDataLane,
    params,
    currentSnap,
    initialSnapPoint,
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
    resolvedSnap,
    pollFeedLoadFailed,
    headerPlaceName,
    promise,
    loadMorePolls,
    isFeedSliceAwaiting,
    feedAwaitingFace,
  } = pollsPanelFeedRuntime;

  const shouldShowCollapsedSpinner = loading || (isSystemUnavailable && polls.length === 0);
  const hasVisiblePolls = polls.length > 0;
  const isExpandedSurface = resolvedSnap === 'middle' || resolvedSnap === 'expanded';

  const pollsLengthRef = React.useRef(polls.length);
  pollsLengthRef.current = polls.length;
  const renderItem = React.useCallback(
    ({ item }: { item: unknown }) => {
      const card = <PollCard poll={item as Poll} onPress={handleOpenPoll} />;
      if (!__DEV__) {
        return card;
      }
      // OA9 [PERF] probe report edge: a REAL poll row's committed layout. The
      // skeleton/empty faces never reach this wrapper, and the reporter refuses a
      // zero count — it cannot go green off a skeleton paint. No-op (early return
      // inside) when no press is pending; dev-only wrapper.
      return (
        <View
          collapsable={false}
          onLayout={() => reportPollsToggleSeamSlicePainted(pollsLengthRef.current)}
        >
          {card}
        </View>
      );
    },
    [handleOpenPoll]
  );
  const keyExtractor = React.useCallback((item: unknown) => (item as Poll).pollId, []);

  // Leg 4 content choreography (useContentToggle): between a strip press-up and the
  // new slice's arrival the OLD CARDS ARE OUT — the list is empty and the awaiting
  // window paints the primitive's OA12 face below the live header strip; never a
  // "create the first poll" message mid-toggle, never bare white.
  const listData: readonly Poll[] =
    hasVisiblePolls && !isFeedSliceAwaiting && !shouldShowCollapsedSpinner
      ? polls
      : EMPTY_POLL_LIST;

  // §6 cursor pagination trigger. FlashList's onEndReached never fires under the
  // gesture-handoff scroll container (see searchOverlayRouteHostContract), so the
  // PRIMARY trigger is the transport's live scroll-activity signal: a real user
  // scroll past the offset floor arms it, end proximity fires it. The controller's
  // single-flight + cursor state make redundant calls harmless; onEndReached stays
  // wired as the harmless secondary path (same pattern as search results).
  const loadMorePollsRef = React.useRef(loadMorePolls);
  loadMorePollsRef.current = loadMorePolls;
  const hasUserScrolledFeedRef = React.useRef(false);
  const handleFeedEndReached = React.useCallback(() => {
    if (!hasUserScrolledFeedRef.current) {
      return;
    }
    loadMorePollsRef.current();
  }, []);
  const handleFeedUserScrollActivity = React.useCallback(
    (offsetY: number, distanceFromEnd: number) => {
      if (offsetY >= POLLS_FEED_SCROLL_ACTIVITY_MIN_OFFSET_PX) {
        hasUserScrolledFeedRef.current = true;
      }
      if (distanceFromEnd < POLLS_FEED_END_PROXIMITY_PX) {
        handleFeedEndReached();
      }
    },
    [handleFeedEndReached]
  );

  // Leg 3: the feed toggle strip is HEADER CHROME now (PollsFeedStrip, mounted by the
  // persistent header host from the page's first committed frame) — the list renders
  // no header and the old snap gate is gone.

  const ListEmptyComponent = React.useMemo(() => {
    if (isFeedSliceAwaiting) {
      // OA12 variant A (the law, baked into the primitive): the strip is live header
      // chrome (declared strip: 'header' — mounted by the persistent header host,
      // independent of this body), and the results region paints the primitive's
      // awaiting face — the polls refetch skeleton minted by useContentToggle. The
      // OA9 A/B flag and its bare-white arm are dead; this panel no longer decides
      // (and cannot suppress) the face.
      return feedAwaitingFace;
    }
    if (shouldShowCollapsedSpinner) {
      // Expanded surface: paint the structure-matched skeleton (poll cards ≈ restaurant rows)
      // so the loading frame reads as content, not a bare spinner. Collapsed: keep the compact
      // spinner — a full skeleton list would overflow the small collapsed sheet.
      if (isExpandedSurface) {
        return <SceneLoadingSurface rowType={POLLS_LOADING_MATERIAL.rowType} />;
      }
      return (
        <View style={styles.loaderCentered}>
          <SquircleSpinner size={22} color={ACCENT} />
        </View>
      );
    }
    if (pollFeedLoadFailed && polls.length === 0) {
      // Retry-ladder give-up with nothing loaded: a quiet failure note (the ladder
      // already retried; a toggle press, socket update, reconnect, or map move
      // re-arms a fresh refresh — no dead-end).
      return (
        <Text variant="body" style={styles.emptyState}>
          Couldn&apos;t load polls.
        </Text>
      );
    }
    if (promise && polls.length === 0) {
      // §6 cold-start promise: an empty SEEDED town gets the weekly-drop promise
      // card (ratified copy) instead of a dead-end empty state.
      return <PollFeedPromiseCard placeName={headerPlaceName} />;
    }
    const emptyMessage = headerPlaceName
      ? `Create the first poll in ${headerPlaceName} and start surfacing local favorites.`
      : 'No polls available yet.';
    return (
      <Text variant="body" style={styles.emptyState}>
        {isExpandedSurface ? emptyMessage : 'No polls available yet.'}
      </Text>
    );
  }, [
    feedAwaitingFace,
    headerPlaceName,
    isExpandedSurface,
    isFeedSliceAwaiting,
    pollFeedLoadFailed,
    polls.length,
    promise,
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
      onEndReached: handleFeedEndReached,
      onEndReachedThreshold: 0.5,
    }),
    [ListEmptyComponent, handleFeedEndReached, keyExtractor, listData, renderItem]
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
      // §6 pagination's PRIMARY trigger — the handoff scroll container produces no
      // native drag events and never fires onEndReached (see the contract note).
      onUserListScrollActivity: handleFeedUserScrollActivity,
      // Over-scroll and MVCP-off are owned by the track's single FlashList
      // (TrackSheetPage.tsx, post-R8) — no per-scene flashListProps needed.
    }),
    [contentBottomPadding, handleFeedUserScrollActivity]
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
  promiseCard: {
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  promiseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  promiseCardTitle: {
    color: themeColors.textPrimary,
  },
  promiseCardBody: {
    color: themeColors.textBody,
    lineHeight: 21,
  },
});
