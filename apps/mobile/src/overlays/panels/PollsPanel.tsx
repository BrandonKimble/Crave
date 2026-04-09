import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Plus } from 'lucide-react-native';
import { Text } from '../../components';
import type { AutocompleteMatch } from '../../services/autocomplete';
import type { Poll } from '../../services/polls';
import { colors as themeColors } from '../../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import {
  overlaySheetStyles,
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
  OVERLAY_HORIZONTAL_PADDING,
} from '../overlaySheetStyles';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import SquircleSpinner from '../../components/SquircleSpinner';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';
import { type UsePollsPanelSpecOptions } from './runtime/polls-panel-runtime-contract';
import { usePollsPanelInteractionRuntime } from './runtime/polls-panel-interaction-runtime';
import { usePollsPanelStateRuntime } from './runtime/polls-panel-state-runtime';
import { PollsHeaderBadge, PollsHeaderTitleText } from './pollsHeaderVisuals';
import { CONTROL_HEIGHT, CONTROL_RADIUS } from '../../screens/Search/constants/ui';
import type { OverlayContentSpec } from '../types';

const OPTION_COLORS = ['#f97316', '#fb7185', '#c084fc', '#38bdf8', '#facc15', '#34d399'] as const;
const CARD_GAP = 4;
const LIVE_BADGE_HEIGHT = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;

const ACCENT = themeColors.primary;
const ACCENT_DARK = themeColors.primaryDark;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

export const usePollsPanelSpec = ({
  visible,
  bounds,
  bootstrapSnapshot,
  params,
  initialSnapPoint,
  mode = 'docked',
  currentSnap,
  navBarTop = 0,
  navBarHeight = 0,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  onSnapStart,
  onSnapChange,
  shellSnapRequest,
  onRequestPollCreationExpand,
  onRequestReturnToSearch,
  sheetY,
  headerActionAnimationToken: _headerActionAnimationToken,
  headerActionProgress: headerActionProgressProp,
  interactionRef,
}: UsePollsPanelSpecOptions): OverlayContentSpec<Poll> => {
  const pollsPanelState = usePollsPanelStateRuntime({
    visible,
    bounds,
    bootstrapSnapshot,
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
  const pollsPanelInteraction = usePollsPanelInteractionRuntime({
    mode,
    shellSnapRequest,
    sheetY,
    headerActionProgress: headerActionProgressProp,
    onSnapStart,
    onSnapChange,
    onRequestPollCreationExpand,
    onRequestReturnToSearch,
    snapPoints: pollsPanelState.snapPoints,
    headerAction: pollsPanelState.headerAction,
    coverageKey: pollsPanelState.coverageKey,
    coverageName: pollsPanelState.coverageName,
    coverageOverride: pollsPanelState.coverageOverride,
    activePoll: pollsPanelState.activePoll,
    activePollType: pollsPanelState.activePollType,
    selectedPollId: pollsPanelState.selectedPollId,
    restaurantQuery: pollsPanelState.restaurantQuery,
    setRestaurantQuery: pollsPanelState.setRestaurantQuery,
    dishQuery: pollsPanelState.dishQuery,
    setDishQuery: pollsPanelState.setDishQuery,
    restaurantSelection: pollsPanelState.restaurantSelection,
    setRestaurantSelection: pollsPanelState.setRestaurantSelection,
    dishSelection: pollsPanelState.dishSelection,
    setDishSelection: pollsPanelState.setDishSelection,
    needsRestaurantInput: pollsPanelState.needsRestaurantInput,
    needsDishInput: pollsPanelState.needsDishInput,
    hideRestaurantSuggestions: pollsPanelState.hideRestaurantSuggestions,
    hideDishSuggestions: pollsPanelState.hideDishSuggestions,
    submitPollOption: pollsPanelState.submitPollOption,
  });

  const renderSuggestionList = (
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
            Searching…
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
  );

  const renderPoll = React.useCallback(
    ({ item }: { item: Poll }) => (
      <TouchableOpacity
        style={[
          styles.pollCard,
          item.pollId === pollsPanelState.selectedPollId && styles.pollCardActive,
        ]}
        onPress={() => pollsPanelState.setSelectedPollId(item.pollId)}
      >
        <Text variant="subtitle" weight="semibold" style={styles.pollQuestion}>
          {item.question}
        </Text>
        {item.topic?.description ? (
          <Text variant="body" style={styles.pollDescription}>
            {item.topic.description}
          </Text>
        ) : null}
        <Text variant="body" style={styles.pollMeta}>
          {item.options.length} options
        </Text>
      </TouchableOpacity>
    ),
    [pollsPanelState.selectedPollId, pollsPanelState.setSelectedPollId]
  );

  const headerComponent = (
    <OverlaySheetHeaderChrome
      onGrabHandlePress={pollsPanelInteraction.handleClose}
      grabHandleAccessibilityLabel="Close polls"
      rowStyle={styles.headerRow}
      title={<PollsHeaderTitleText title={pollsPanelState.headerVisualModel.title} />}
      badge={
        <PollsHeaderBadge
          count={pollsPanelState.headerVisualModel.badgeCount}
          label={pollsPanelState.headerVisualModel.badgeLabel}
          muted={pollsPanelState.headerVisualModel.isBadgeMuted}
        />
      }
      badgeRadius={LIVE_BADGE_HEIGHT / 2}
      actionButton={
        <OverlayHeaderActionButton
          progress={pollsPanelInteraction.headerActionProgress}
          onPress={pollsPanelInteraction.handleHeaderActionPress}
          accessibilityLabel={
            pollsPanelState.headerAction === 'close' ? 'Close polls' : 'Create a new poll'
          }
          accentColor={ACCENT}
          closeColor="#000000"
        />
      }
    />
  );

  const listHeaderComponent = (
    <View style={styles.listHeader}>
      <TouchableOpacity
        onPress={pollsPanelInteraction.handleOpenCreate}
        style={styles.createButton}
        accessibilityRole="button"
        accessibilityLabel="Create a new poll"
      >
        <Plus size={16} color="#ffffff" strokeWidth={2.5} />
        <Text variant="body" weight="semibold" style={styles.createButtonText}>
          new poll
        </Text>
      </TouchableOpacity>
      {(pollsPanelState.loading || pollsPanelState.isPollFeedRefreshing) &&
      pollsPanelState.polls.length > 0 ? (
        <View style={styles.loader}>
          <SquircleSpinner size={18} color={ACCENT} />
        </View>
      ) : null}
    </View>
  );

  const listEmptyComponent = React.useCallback(() => {
    if (pollsPanelState.shouldHoldFreshLiveContent) {
      return (
        <View style={styles.loaderCentered}>
          {pollsPanelState.pollFeedFreshnessError ? null : (
            <SquircleSpinner size={22} color={ACCENT} />
          )}
          <Text variant="body" style={styles.emptyState}>
            {pollsPanelState.pollFeedFreshnessError
              ? 'Unable to refresh live polls.'
              : 'Updating live polls...'}
          </Text>
        </View>
      );
    }
    if (
      pollsPanelState.loading ||
      (pollsPanelState.isSystemUnavailable && pollsPanelState.polls.length === 0)
    ) {
      return (
        <View style={styles.loaderCentered}>
          <SquircleSpinner size={22} color={ACCENT} />
        </View>
      );
    }
    return (
      <Text variant="body" style={styles.emptyState}>
        No polls available yet.
      </Text>
    );
  }, [pollsPanelState]);

  const listFooterComponent =
    !pollsPanelState.shouldHoldFreshLiveContent && pollsPanelState.activePoll ? (
      <View style={styles.detailCard}>
        <Text variant="title" weight="semibold" style={styles.detailQuestion}>
          {pollsPanelState.activePoll.question}
        </Text>
        {pollsPanelState.activePoll.topic?.description ? (
          <Text variant="body" style={styles.detailDescription}>
            {pollsPanelState.activePoll.topic.description}
          </Text>
        ) : null}
        {pollsPanelState.activePoll.options.map((option, index) => {
          const color = OPTION_COLORS[index % OPTION_COLORS.length];
          const rawFill =
            pollsPanelState.totalVotes > 0
              ? (option.voteCount / pollsPanelState.totalVotes) * 100
              : 0;
          const minFill = option.voteCount > 0 ? 10 : 2;
          const fillWidth = Math.min(Math.max(rawFill, minFill), 100);
          return (
            <TouchableOpacity
              key={option.optionId}
              style={styles.optionBarWrapper}
              onPress={() => {
                void pollsPanelState.castVote(pollsPanelState.activePoll!.pollId, option.optionId);
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
        {pollsPanelState.activePollType === 'what_to_order' ? (
          <Text variant="body" style={styles.topicNote}>
            Votes apply to dishes at this restaurant.
          </Text>
        ) : null}
        <View style={styles.addOptionBlock}>
          {pollsPanelState.needsRestaurantInput ? (
            <View style={styles.inputGroup}>
              <Text variant="body" weight="semibold" style={styles.fieldLabel}>
                Restaurant
              </Text>
              <TextInput
                value={pollsPanelState.restaurantQuery}
                onChangeText={(text) => {
                  pollsPanelState.setRestaurantQuery(text);
                  pollsPanelState.setRestaurantSelection(null);
                }}
                placeholder="Search for a restaurant"
                style={styles.optionInput}
                autoCapitalize="none"
              />
              {(pollsPanelState.showRestaurantSuggestions || pollsPanelState.restaurantLoading) &&
                renderSuggestionList(
                  pollsPanelState.restaurantLoading,
                  pollsPanelState.restaurantSuggestions,
                  'Keep typing to add a restaurant',
                  pollsPanelInteraction.onRestaurantSuggestionPick
                )}
            </View>
          ) : null}
          {pollsPanelState.needsDishInput ? (
            <View style={styles.inputGroup}>
              <Text variant="body" weight="semibold" style={styles.fieldLabel}>
                Dish
              </Text>
              <TextInput
                value={pollsPanelState.dishQuery}
                onChangeText={(text) => {
                  pollsPanelState.setDishQuery(text);
                  pollsPanelState.setDishSelection(null);
                }}
                placeholder="Search for a dish"
                style={styles.optionInput}
                autoCapitalize="none"
              />
              {(pollsPanelState.showDishSuggestions || pollsPanelState.dishLoading) &&
                renderSuggestionList(
                  pollsPanelState.dishLoading,
                  pollsPanelState.dishSuggestions,
                  'Keep typing to add a dish',
                  pollsPanelInteraction.onDishSuggestionPick
                )}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              void pollsPanelInteraction.submitOptionFromPanel();
            }}
            style={styles.submitButton}
          >
            <Text variant="body" weight="semibold" style={styles.submitButtonText}>
              Submit option
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null;

  const itemSeparator = React.useCallback(() => <View style={{ height: CARD_GAP }} />, []);

  return {
    overlayKey: 'polls',
    surfaceKind: 'list',
    snapPoints: pollsPanelState.snapPoints,
    initialSnapPoint: pollsPanelState.initialSnap,
    shellSnapRequest: pollsPanelInteraction.activeShellSnapRequest,
    data: pollsPanelState.visiblePolls,
    renderItem: renderPoll,
    keyExtractor: (item) => item.pollId,
    estimatedItemSize: 108,
    ItemSeparatorComponent: itemSeparator,
    contentContainerStyle: [
      styles.scrollContent,
      { paddingBottom: pollsPanelState.contentBottomPadding },
    ],
    ListHeaderComponent: listHeaderComponent,
    ListFooterComponent: listFooterComponent,
    ListEmptyComponent: listEmptyComponent,
    keyboardShouldPersistTaps: 'handled',
    bounces: false,
    alwaysBounceVertical: false,
    overScrollMode: 'never',
    backgroundComponent: <FrostedGlassBackground />,
    contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
    headerComponent,
    style: overlaySheetStyles.container,
    onSnapStart: pollsPanelInteraction.handleSnapStart,
    onSnapChange: pollsPanelInteraction.handleSnapChange,
    dismissThreshold: pollsPanelState.dismissThreshold,
    preventSwipeDismiss: mode === 'overlay',
  };
};

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
