import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Feather } from '@expo/vector-icons';
import {
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useOverlayStore } from '../../store/overlayStore';
import { logger } from '../../utils';
import { notificationsService } from '../../services/notifications';
import { usersService } from '../../services/users';
import { fetchUserPolls, type Poll } from '../../services/polls';
import { useFavoriteLists } from '../../hooks/use-favorite-lists';
import type { FavoriteListSummary } from '../../services/favorite-lists';
import type { RootStackParamList } from '../../types/navigation';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from '../overlaySheetStyles';
import { calculateSnapPoints, clampValue } from '../sheetUtils';
import { useHeaderCloseCutout } from '../useHeaderCloseCutout';
import type { OverlayContentSpec, OverlaySheetSnap } from '../types';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import OverlaySheetHeader from '../OverlaySheetHeader';

type ProfileSegment = 'created' | 'contributed' | 'favorites';

type UseProfilePanelSpecOptions = {
  visible: boolean;
  navBarTop?: number;
  searchBarTop?: number;
  sheetY: SharedValue<number>;
  onSnapChange?: (snap: OverlaySheetSnap) => void;
  snapTo?: Exclude<OverlaySheetSnap, 'hidden'> | null;
};

type Navigation = StackNavigationProp<RootStackParamList>;

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SEGMENT_BG = '#f1f5f9';
const SEGMENT_ACTIVE = '#ffffff';
const SEGMENT_TEXT = themeColors.textBody;
const SEGMENT_ACTIVE_TEXT = '#0f172a';
const USER_POLLS_STALE_MS = 1000 * 60; // 1 minute
const USER_POLLS_GC_MS = 1000 * 60 * 10; // 10 minutes

const shouldRetryUserPollsQuery = (failureCount: number, error: unknown) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < 2;
};

const resolveRankColor = (score?: number | null) => {
  if (score == null) {
    return themeColors.textBody;
  }
  if (score >= 8) {
    return '#10b981';
  }
  if (score >= 6) {
    return '#f59e0b';
  }
  return '#fb7185';
};

export const useProfilePanelSpec = ({
  visible,
  navBarTop = 0,
  searchBarTop = 0,
  sheetY,
  onSnapChange,
  snapTo,
}: UseProfilePanelSpecOptions): OverlayContentSpec<unknown> => {
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut, isSignedIn } = useAuth();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const previousOverlay = useOverlayStore((state) => state.previousOverlay);
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const pushToken = useNotificationStore((state) => state.pushToken);
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const [activeSegment, setActiveSegment] = React.useState<ProfileSegment>('created');

  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => usersService.getMe(),
    enabled: isSignedIn && visible,
  });
  const profile = profileQuery.data;
  const userId = profile?.userId ?? null;

  const createdPollsQuery = useQuery({
    queryKey: ['user-polls', userId, 'created'],
    queryFn: () => fetchUserPolls({ activity: 'created', limit: 50 }),
    enabled: isSignedIn && visible && Boolean(userId) && activeSegment === 'created',
    staleTime: USER_POLLS_STALE_MS,
    gcTime: USER_POLLS_GC_MS,
    retry: shouldRetryUserPollsQuery,
  });
  const contributedPollsQuery = useQuery({
    queryKey: ['user-polls', userId, 'contributed'],
    queryFn: () => fetchUserPolls({ activity: 'participated', limit: 50 }),
    enabled: isSignedIn && visible && Boolean(userId) && activeSegment === 'contributed',
    staleTime: USER_POLLS_STALE_MS,
    gcTime: USER_POLLS_GC_MS,
    retry: shouldRetryUserPollsQuery,
  });
  const contributedPolls = React.useMemo(() => {
    const polls = contributedPollsQuery.data?.polls ?? [];
    if (!userId) {
      return polls;
    }
    return polls.filter((poll) => poll.createdByUserId !== userId);
  }, [contributedPollsQuery.data, userId]);

  const restaurantListsQuery = useFavoriteLists({
    listType: 'restaurant',
    visibility: 'public',
    enabled: isSignedIn && visible && activeSegment === 'favorites',
  });
  const dishListsQuery = useFavoriteLists({
    listType: 'dish',
    visibility: 'public',
    enabled: isSignedIn && visible && activeSegment === 'favorites',
  });

  const unregisterPushToken = React.useCallback(async () => {
    if (!pushToken) {
      return;
    }
    try {
      await notificationsService.unregisterDevice(pushToken);
    } catch (error) {
      logger.warn('Failed to unregister push token', error);
    } finally {
      setPushToken(null);
    }
  }, [pushToken, setPushToken]);

  const handleSignOut = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
      Alert.alert('Signed out', 'Sign in again the next time you open the app.');
    } catch (error) {
      logger.error('Sign out failed', error);
      Alert.alert(
        'Unable to sign out',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }, [signOut, unregisterPushToken]);

  const handleReplayOnboarding = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
    } catch (error) {
      logger.warn('Replay onboarding sign-out failed', error);
    } finally {
      resetOnboarding();
      Alert.alert('Onboarding reset', 'Restart the app to walk through onboarding again.');
    }
  }, [resetOnboarding, signOut, unregisterPushToken]);

  const handleOpenSettings = React.useCallback(() => {
    Alert.alert('Settings', undefined, [
      {
        text: 'Edit profile',
        onPress: () => Alert.alert('Coming soon', 'Profile editing will land next.'),
      },
      {
        text: 'Replay onboarding',
        onPress: () => void handleReplayOnboarding(),
      },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void handleSignOut(),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleReplayOnboarding, handleSignOut]);

  const handlePollPress = React.useCallback(
    (poll: Poll) => {
      setOverlay('polls', {
        pollId: poll.pollId,
        coverageKey: poll.coverageKey ?? null,
      });
    },
    [setOverlay]
  );

  const handleListPress = React.useCallback(
    (listId: string) => {
      navigation.navigate('FavoritesListDetail', { listId });
    },
    [navigation]
  );

  const handleClose = React.useCallback(() => {
    setOverlay('search');
  }, [setOverlay]);

  const displayName = profile?.displayName?.trim() || profile?.username || 'Crave Explorer';
  const usernameLabel = profile?.username ? `@${profile.username}` : 'Pick a username';
  const initials = React.useMemo(() => {
    const base = profile?.displayName || profile?.username || profile?.email || 'You';
    const cleaned = base.replace('@', '').trim();
    if (!cleaned) {
      return 'C';
    }
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return cleaned[0].toUpperCase();
  }, [profile?.displayName, profile?.email, profile?.username]);

  const stats = profile?.stats;
  const createdPolls = createdPollsQuery.data?.polls ?? [];
  const activePolls =
    activeSegment === 'created'
      ? createdPolls
      : activeSegment === 'contributed'
      ? contributedPolls
      : [];
  const isActivePollListLoading =
    activeSegment === 'created'
      ? createdPollsQuery.isLoading
      : activeSegment === 'contributed'
      ? contributedPollsQuery.isLoading
      : false;

  const renderPollCard = (poll: Poll) => {
    const totalVotes = poll.options.reduce((sum, option) => sum + option.voteCount, 0);
    return (
      <Pressable key={poll.pollId} style={styles.pollCard} onPress={() => handlePollPress(poll)}>
        <Text variant="subtitle" weight="semibold" style={styles.pollQuestion}>
          {poll.question}
        </Text>
        {poll.topic?.description ? (
          <Text variant="body" style={styles.pollDescription}>
            {poll.topic.description}
          </Text>
        ) : null}
        <Text variant="caption" style={styles.pollMeta}>
          {poll.coverageName ?? 'Local'} - {poll.options.length} options - {totalVotes} votes
        </Text>
      </Pressable>
    );
  };

  const renderPreviewRow = React.useCallback(
    (item: FavoriteListSummary['previewItems'][number]) => (
      <View key={item.itemId} style={styles.previewRow}>
        <View style={[styles.previewDot, { backgroundColor: resolveRankColor(item.score) }]} />
        <Text variant="caption" numberOfLines={1} style={styles.previewText}>
          {item.label}
          {item.subLabel ? ` • ${item.subLabel}` : ''}
        </Text>
      </View>
    ),
    []
  );

  const renderListTile = (list: FavoriteListSummary) => (
    <Pressable
      key={list.listId}
      onPress={() => handleListPress(list.listId)}
      style={styles.listTileWrapper}
    >
      <View style={styles.listTile}>
        {list.previewItems.length ? (
          list.previewItems.map(renderPreviewRow)
        ) : (
          <Text variant="caption" style={styles.previewEmpty}>
            No items yet
          </Text>
        )}
      </View>
      <Text variant="body" weight="semibold" style={styles.listTitle} numberOfLines={1}>
        {list.name}
      </Text>
    </Pressable>
  );

  const closeCutout = useHeaderCloseCutout();
  const headerHeight = closeCutout.headerHeight;
  const navBarOffset = Math.max(navBarTop, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;
  const contentBottomPadding = Math.max(insets.bottom + 140, 160);
  const snapPoints = React.useMemo(
    () => calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarOffset, headerHeight),
    [headerHeight, insets.top, navBarOffset, searchBarTop]
  );
  const hiddenSnap = snapPoints.hidden ?? snapPoints.collapsed;

  const headerActionProgress = useSharedValue(0);
  const headerActionOverride = useSharedValue(false);

  useAnimatedReaction(
    () => {
      const range = hiddenSnap - snapPoints.collapsed;
      const rawProgress = range !== 0 ? (sheetY.value - snapPoints.collapsed) / range : 0;
      return clampValue(rawProgress, 0, 1);
    },
    (nextProgress) => {
      if (headerActionOverride.value) {
        return;
      }
      headerActionProgress.value = nextProgress;
    },
    [headerActionOverride, headerActionProgress, hiddenSnap, sheetY, snapPoints.collapsed]
  );

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const shouldStartAsPlus = sheetY.value > snapPoints.middle + 0.5;
    const shouldAnimateFromPlus =
      shouldStartAsPlus && (previousOverlay === 'polls' || previousOverlay === 'search');
    if (!shouldAnimateFromPlus) {
      headerActionProgress.value = 0;
      return;
    }

    headerActionOverride.value = true;
    headerActionProgress.value = 1;
    headerActionProgress.value = withTiming(0, { duration: 220 }, (finished) => {
      'worklet';
      if (finished) {
        headerActionOverride.value = false;
      }
    });
  }, [
    headerActionOverride,
    headerActionProgress,
    previousOverlay,
    sheetY,
    snapPoints.middle,
    visible,
  ]);

  const headerComponent = (
    <OverlaySheetHeader
      cutoutBackground={closeCutout.background}
      onHeaderLayout={closeCutout.onHeaderLayout}
      onHeaderRowLayout={closeCutout.onHeaderRowLayout}
      onGrabHandlePress={handleClose}
      grabHandleAccessibilityLabel="Close profile"
      title={
        <Text variant="title" weight="semibold" style={styles.sheetTitle}>
          Profile
        </Text>
      }
      actionButton={
        <OverlayHeaderActionButton
          progress={headerActionProgress}
          onPress={handleClose}
          accessibilityLabel="Close profile"
          accentColor={themeColors.primary}
          closeColor="#000000"
          onLayout={closeCutout.onCloseLayout}
        />
      }
    />
  );

  const listHeaderComponent = (
    <View style={styles.contentContainer}>
      <View style={styles.header}>
        <View style={styles.avatarWrapper}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text variant="title" weight="bold" style={styles.avatarInitials}>
                {initials}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerText}>
          <Text variant="title" weight="bold" style={styles.displayName}>
            {displayName}
          </Text>
          <Text variant="caption" style={styles.username}>
            {usernameLabel}
          </Text>
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={handleOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Profile settings"
        >
          <Feather name="settings" size={20} color={themeColors.primary} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {stats?.pollsCreatedCount ?? 0}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Polls created
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {stats?.pollsContributedCount ?? 0}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Polls contributed
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {stats?.followersCount ?? 0}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Followers
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {stats?.followingCount ?? 0}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Following
          </Text>
        </View>
      </View>

      <View style={styles.segmentRow}>
        {(
          [
            { id: 'created', label: 'Created' },
            { id: 'contributed', label: 'Contributed' },
            { id: 'favorites', label: 'Favorites' },
          ] as const
        ).map((segment) => {
          const isActive = activeSegment === segment.id;
          return (
            <Pressable
              key={segment.id}
              onPress={() => setActiveSegment(segment.id)}
              style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
            >
              <Text
                variant="caption"
                weight="semibold"
                style={[styles.segmentText, isActive && styles.segmentTextActive]}
              >
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeSegment === 'favorites' ? (
        <View style={styles.section}>
          <Text variant="subtitle" weight="semibold" style={styles.sectionTitle}>
            Restaurant lists
          </Text>
          {restaurantListsQuery.isLoading ? (
            <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
          ) : restaurantListsQuery.data?.length ? (
            <View style={styles.listGrid}>{restaurantListsQuery.data.map(renderListTile)}</View>
          ) : (
            <Text variant="caption" style={styles.emptyText}>
              No public restaurant lists yet.
            </Text>
          )}

          <Text variant="subtitle" weight="semibold" style={styles.sectionTitle}>
            Dish lists
          </Text>
          {dishListsQuery.isLoading ? (
            <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
          ) : dishListsQuery.data?.length ? (
            <View style={styles.listGrid}>{dishListsQuery.data.map(renderListTile)}</View>
          ) : (
            <Text variant="caption" style={styles.emptyText}>
              No public dish lists yet.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          {profileQuery.isLoading || isActivePollListLoading ? (
            <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
          ) : activePolls.length ? (
            <View style={styles.pollList}>{activePolls.map(renderPollCard)}</View>
          ) : (
            <Text variant="caption" style={styles.emptyText}>
              {activeSegment === 'created' ? 'No polls created yet.' : 'No poll contributions yet.'}
            </Text>
          )}
        </View>
      )}
    </View>
  );

  return {
    overlayKey: 'profile',
    snapPoints,
    initialSnapPoint: 'expanded',
    snapTo,
    data: [],
    renderItem: () => null,
    estimatedItemSize: 720,
    contentContainerStyle: [styles.scrollContent, { paddingBottom: contentBottomPadding }],
    ListHeaderComponent: listHeaderComponent,
    backgroundComponent: <FrostedGlassBackground />,
    headerComponent: headerComponent,
    onSnapChange,
    dismissThreshold,
    preventSwipeDismiss: true,
    keyboardShouldPersistTaps: 'handled',
    style: overlaySheetStyles.container,
  };
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingTop: 16,
  },
  contentContainer: {
    gap: 20,
  },
  sheetTitle: {
    color: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fde2e7',
  },
  avatarInitials: {
    color: themeColors.primary,
  },
  headerText: {
    flex: 1,
  },
  displayName: {
    color: '#0f172a',
  },
  username: {
    color: themeColors.textBody,
    marginTop: 4,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#0f172a',
  },
  statLabel: {
    color: themeColors.textBody,
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: SEGMENT_BG,
    borderRadius: 999,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 999,
  },
  segmentButtonActive: {
    backgroundColor: SEGMENT_ACTIVE,
  },
  segmentText: {
    color: SEGMENT_TEXT,
  },
  segmentTextActive: {
    color: SEGMENT_ACTIVE_TEXT,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    color: '#0f172a',
  },
  sectionSpinner: {
    marginTop: 12,
  },
  pollList: {
    gap: 12,
  },
  pollCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  pollQuestion: {
    color: '#0f172a',
  },
  pollDescription: {
    color: themeColors.textBody,
    marginTop: 6,
  },
  pollMeta: {
    color: themeColors.textBody,
    marginTop: 8,
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  listTileWrapper: {
    width: '48%',
  },
  listTile: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    minHeight: 140,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  listTitle: {
    color: '#0f172a',
    marginTop: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewText: {
    color: '#0f172a',
    flex: 1,
  },
  previewEmpty: {
    color: themeColors.textBody,
  },
  emptyText: {
    color: themeColors.textBody,
  },
});
