import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  InteractionManager,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Feather } from '@expo/vector-icons';
import { useSharedValue } from 'react-native-reanimated';
import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { openSearchRoutePollsHome } from '../searchRouteOverlayCommandStore';
import {
  getActiveSearchNavSwitchPerfProbe,
  getActiveSearchNavSwitchProbeAgeMs,
} from '../../screens/Search/runtime/shared/search-nav-switch-perf-probe';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useNotificationStore } from '../../store/notificationStore';
import { logger } from '../../utils';
import { notificationsService } from '../../services/notifications';
import { usersService } from '../../services/users';
import { fetchUserPolls, type Poll } from '../../services/polls';
import { useFavoriteLists } from '../../hooks/use-favorite-lists';
import { favoriteListsService, type FavoriteListSummary } from '../../services/favorite-lists';
import type { RootStackParamList } from '../../types/navigation';
import {
  OVERLAY_TAB_HEADER_HEIGHT,
  OVERLAY_HORIZONTAL_PADDING,
  overlaySheetStyles,
} from '../overlaySheetStyles';
import type { BottomSheetSceneSurfaceProps } from '../bottomSheetWithFlashListContract';
import type { SnapPoints } from '../bottomSheetMotionTypes';
import { calculateSnapPoints } from '../sheetUtils';
import type { OverlayContentSpec, OverlaySheetSnap, OverlaySheetSnapRequest } from '../types';
import type { SearchRouteSceneDefinition } from '../searchOverlayRouteHostContract';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import OverlaySheetHeaderChrome from '../OverlaySheetHeaderChrome';
import { useOverlayStore } from '../../store/overlayStore';

type ProfileSegment = 'created' | 'contributed' | 'favorites';

type UseProfilePanelSpecOptions = {
  mounted?: boolean;
  visible: boolean;
  navBarTop?: number;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onSnapStart?: (snap: OverlaySheetSnap) => void;
  onSnapChange?: (snap: OverlaySheetSnap) => void;
  shellSnapRequest?: OverlaySheetSnapRequest | null;
};

type Navigation = StackNavigationProp<RootStackParamList>;

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SEGMENT_BG = '#f1f5f9';
const SEGMENT_ACTIVE = '#ffffff';
const SEGMENT_TEXT = themeColors.textBody;
const SEGMENT_ACTIVE_TEXT = '#0f172a';
const USER_POLLS_STALE_MS = 1000 * 60; // 1 minute
const USER_POLLS_GC_MS = 1000 * 60 * 10; // 10 minutes
const USER_PROFILE_STALE_MS = 1000 * 60; // 1 minute
const USER_PROFILE_GC_MS = 1000 * 60 * 10; // 10 minutes
const PROFILE_DEFAULT_SEGMENT: ProfileSegment = 'created';

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

const diffSceneSnapshots = (
  previousSnapshot: Record<string, unknown>,
  nextSnapshot: Record<string, unknown>
) =>
  Object.assign(
    {},
    ...Object.keys({ ...previousSnapshot, ...nextSnapshot }).flatMap((key) => {
      const previousValue = previousSnapshot[key];
      const nextValue = nextSnapshot[key];
      return JSON.stringify(previousValue) === JSON.stringify(nextValue)
        ? []
        : [{ [key]: { previous: previousValue, next: nextValue } }];
    })
  );

const PROFILE_SEGMENTS = [
  { id: 'created', label: 'Created' },
  { id: 'contributed', label: 'Contributed' },
  { id: 'favorites', label: 'Favorites' },
] as const;

const profileQueryKey = ['user-profile'] as const;

const createProfileQueryOptions = () => ({
  queryKey: profileQueryKey,
  queryFn: () => usersService.getMe(),
  staleTime: USER_PROFILE_STALE_MS,
  gcTime: USER_PROFILE_GC_MS,
});

const getUserPollsQueryKey = (
  userId: string | null | undefined,
  activity: 'created' | 'participated'
) => ['user-polls', userId ?? 'none', activity] as const;

const createUserPollsQueryDescriptor = ({
  userId,
  activity,
}: {
  userId: string | null | undefined;
  activity: 'created' | 'participated';
}) => ({
  queryKey: getUserPollsQueryKey(userId, activity),
  queryFn: () => fetchUserPolls({ activity, limit: 50 }),
  staleTime: USER_POLLS_STALE_MS,
  gcTime: USER_POLLS_GC_MS,
  retry: shouldRetryUserPollsQuery,
});

const createPublicFavoriteListsQueryDescriptor = ({
  listType,
}: {
  listType: 'restaurant' | 'dish';
}) => ({
  queryKey: ['favorite-lists', listType, 'public'] as const,
  queryFn: () => favoriteListsService.list({ listType, visibility: 'public' }),
  staleTime: 1000 * 20,
});

type ProfilePreviewRowProps = {
  item: FavoriteListSummary['previewItems'][number];
};

const ProfilePreviewRow = React.memo(({ item }: ProfilePreviewRowProps) => (
  <View style={styles.previewRow}>
    <View style={[styles.previewDot, { backgroundColor: resolveRankColor(item.score) }]} />
    <Text variant="caption" numberOfLines={1} style={styles.previewText}>
      {item.label}
      {item.subLabel ? ` • ${item.subLabel}` : ''}
    </Text>
  </View>
));

ProfilePreviewRow.displayName = 'ProfilePreviewRow';

type ProfileFavoriteListTileProps = {
  list: FavoriteListSummary;
  onPress: (listId: string) => void;
};

const ProfileFavoriteListTile = React.memo(({ list, onPress }: ProfileFavoriteListTileProps) => (
  <Pressable onPress={() => onPress(list.listId)} style={styles.listTileWrapper}>
    <View style={styles.listTile}>
      {list.previewItems.length ? (
        list.previewItems.map((item) => <ProfilePreviewRow key={item.itemId} item={item} />)
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
));

ProfileFavoriteListTile.displayName = 'ProfileFavoriteListTile';

type ProfilePollCardProps = {
  poll: Poll;
  onPress: (poll: Poll) => void;
};

const ProfilePollCard = React.memo(({ poll, onPress }: ProfilePollCardProps) => {
  const totalVotes = poll.options.reduce((sum, option) => sum + option.voteCount, 0);

  return (
    <Pressable style={styles.pollCard} onPress={() => onPress(poll)}>
      <Text variant="subtitle" weight="semibold" style={styles.pollQuestion}>
        {poll.question}
      </Text>
      {poll.topic?.description ? (
        <Text variant="body" style={styles.pollDescription}>
          {poll.topic.description}
        </Text>
      ) : null}
      <Text variant="caption" style={styles.pollMeta}>
        {[poll.marketName, `${poll.options.length} options`, `${totalVotes} votes`]
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .join(' - ')}
      </Text>
    </Pressable>
  );
});

ProfilePollCard.displayName = 'ProfilePollCard';

type ProfileSceneContentProps = {
  avatarUrl?: string | null;
  initials: string;
  displayName: string;
  usernameLabel: string;
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  activeSegment: ProfileSegment;
  activePolls: readonly Poll[];
  isProfileLoading: boolean;
  isActivePollListLoading: boolean;
  restaurantLists: readonly FavoriteListSummary[];
  restaurantListsLoading: boolean;
  dishLists: readonly FavoriteListSummary[];
  dishListsLoading: boolean;
  onOpenSettings: () => void;
  onSelectSegment: (segment: ProfileSegment) => void;
  onPollPress: (poll: Poll) => void;
  onListPress: (listId: string) => void;
};

type ProfileIdentityChromeProps = {
  avatarUrl?: string | null;
  initials: string;
  displayName: string;
  usernameLabel: string;
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  onOpenSettings: () => void;
};

const ProfileIdentityChrome = React.memo(
  ({
    avatarUrl,
    initials,
    displayName,
    usernameLabel,
    pollsCreatedCount,
    pollsContributedCount,
    followersCount,
    followingCount,
    onOpenSettings,
  }: ProfileIdentityChromeProps) => (
    <>
      <View style={styles.header}>
        <View style={styles.avatarWrapper}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
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
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Profile settings"
        >
          <Feather name="settings" size={20} color={themeColors.primary} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {pollsCreatedCount}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Polls created
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {pollsContributedCount}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Polls contributed
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {followersCount}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Followers
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text variant="subtitle" weight="bold" style={styles.statValue}>
            {followingCount}
          </Text>
          <Text variant="caption" style={styles.statLabel}>
            Following
          </Text>
        </View>
      </View>
    </>
  )
);

ProfileIdentityChrome.displayName = 'ProfileIdentityChrome';

type ProfileSegmentSwitcherProps = {
  activeSegment: ProfileSegment;
  onSelectSegment: (segment: ProfileSegment) => void;
};

const ProfileSegmentSwitcher = React.memo(
  ({ activeSegment, onSelectSegment }: ProfileSegmentSwitcherProps) => (
    <View style={styles.segmentRow}>
      {PROFILE_SEGMENTS.map((segment) => {
        const isActive = activeSegment === segment.id;
        return (
          <Pressable
            key={segment.id}
            onPress={() => onSelectSegment(segment.id)}
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
  )
);

ProfileSegmentSwitcher.displayName = 'ProfileSegmentSwitcher';

type ProfileFavoriteListsSectionProps = {
  restaurantLists: readonly FavoriteListSummary[];
  restaurantListsLoading: boolean;
  dishLists: readonly FavoriteListSummary[];
  dishListsLoading: boolean;
  onListPress: (listId: string) => void;
};

const ProfileFavoriteListsSection = React.memo(
  ({
    restaurantLists,
    restaurantListsLoading,
    dishLists,
    dishListsLoading,
    onListPress,
  }: ProfileFavoriteListsSectionProps) => (
    <View style={styles.section}>
      <Text variant="subtitle" weight="semibold" style={styles.sectionTitle}>
        Restaurant lists
      </Text>
      {restaurantListsLoading ? (
        <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
      ) : restaurantLists.length ? (
        <View style={styles.listGrid}>
          {restaurantLists.map((list) => (
            <ProfileFavoriteListTile key={list.listId} list={list} onPress={onListPress} />
          ))}
        </View>
      ) : (
        <Text variant="caption" style={styles.emptyText}>
          No public restaurant lists yet.
        </Text>
      )}

      <Text variant="subtitle" weight="semibold" style={styles.sectionTitle}>
        Dish lists
      </Text>
      {dishListsLoading ? (
        <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
      ) : dishLists.length ? (
        <View style={styles.listGrid}>
          {dishLists.map((list) => (
            <ProfileFavoriteListTile key={list.listId} list={list} onPress={onListPress} />
          ))}
        </View>
      ) : (
        <Text variant="caption" style={styles.emptyText}>
          No public dish lists yet.
        </Text>
      )}
    </View>
  )
);

ProfileFavoriteListsSection.displayName = 'ProfileFavoriteListsSection';

type ProfilePollsSectionProps = {
  activeSegment: Exclude<ProfileSegment, 'favorites'>;
  activePolls: readonly Poll[];
  isProfileLoading: boolean;
  isActivePollListLoading: boolean;
  onPollPress: (poll: Poll) => void;
};

const ProfilePollsSection = React.memo(
  ({
    activeSegment,
    activePolls,
    isProfileLoading,
    isActivePollListLoading,
    onPollPress,
  }: ProfilePollsSectionProps) => (
    <View style={styles.section}>
      {isProfileLoading || isActivePollListLoading ? (
        <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
      ) : activePolls.length ? (
        <View style={styles.pollList}>
          {activePolls.map((poll) => (
            <ProfilePollCard key={poll.pollId} poll={poll} onPress={onPollPress} />
          ))}
        </View>
      ) : (
        <Text variant="caption" style={styles.emptyText}>
          {activeSegment === 'created' ? 'No polls created yet.' : 'No poll contributions yet.'}
        </Text>
      )}
    </View>
  )
);

ProfilePollsSection.displayName = 'ProfilePollsSection';

const ProfileSceneContent = React.memo(
  ({
    avatarUrl,
    initials,
    displayName,
    usernameLabel,
    pollsCreatedCount,
    pollsContributedCount,
    followersCount,
    followingCount,
    activeSegment,
    activePolls,
    isProfileLoading,
    isActivePollListLoading,
    restaurantLists,
    restaurantListsLoading,
    dishLists,
    dishListsLoading,
    onOpenSettings,
    onSelectSegment,
    onPollPress,
    onListPress,
  }: ProfileSceneContentProps) => (
    <View style={styles.contentContainer}>
      <ProfileIdentityChrome
        avatarUrl={avatarUrl}
        initials={initials}
        displayName={displayName}
        usernameLabel={usernameLabel}
        pollsCreatedCount={pollsCreatedCount}
        pollsContributedCount={pollsContributedCount}
        followersCount={followersCount}
        followingCount={followingCount}
        onOpenSettings={onOpenSettings}
      />

      <ProfileSegmentSwitcher activeSegment={activeSegment} onSelectSegment={onSelectSegment} />

      {activeSegment === 'favorites' ? (
        <ProfileFavoriteListsSection
          restaurantLists={restaurantLists}
          restaurantListsLoading={restaurantListsLoading}
          dishLists={dishLists}
          dishListsLoading={dishListsLoading}
          onListPress={onListPress}
        />
      ) : (
        <ProfilePollsSection
          activeSegment={activeSegment}
          activePolls={activePolls}
          isProfileLoading={isProfileLoading}
          isActivePollListLoading={isActivePollListLoading}
          onPollPress={onPollPress}
        />
      )}
    </View>
  )
);

ProfileSceneContent.displayName = 'ProfileSceneContent';

const ProfileSceneRuntime = React.memo(() => {
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut, isSignedIn } = useAuth();
  const navigation = useNavigation<Navigation>();
  const pushToken = useNotificationStore((state) => state.pushToken);
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const visible = useOverlayStore(
    (state) => (state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key) === 'profile'
  );
  const [activeSegment, setActiveSegment] = React.useState<ProfileSegment>(PROFILE_DEFAULT_SEGMENT);

  const profileQuery = useQuery({
    ...createProfileQueryOptions(),
    enabled: isSignedIn && visible,
  });
  const profile = profileQuery.data;
  const userId = profile?.userId ?? null;

  const createdPollsQuery = useQuery({
    ...createUserPollsQueryDescriptor({
      userId,
      activity: 'created',
    }),
    enabled: isSignedIn && visible && activeSegment === 'created' && Boolean(userId),
  });
  const contributedPollsQuery = useQuery({
    ...createUserPollsQueryDescriptor({
      userId,
      activity: 'participated',
    }),
    enabled: isSignedIn && visible && activeSegment === 'contributed' && Boolean(userId),
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

  const handlePollPress = React.useCallback((poll: Poll) => {
    openSearchRoutePollsHome({
      params: {
        pollId: poll.pollId,
        marketKey: poll.marketKey ?? null,
        marketName: poll.marketName ?? null,
        pinnedMarket: true,
      },
      snap: 'expanded',
    });
  }, []);

  const handleListPress = React.useCallback(
    (listId: string) => {
      navigation.navigate('FavoritesListDetail', { listId });
    },
    [navigation]
  );

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

  const sceneCauseSnapshot = React.useMemo(
    () => ({
      mounted: true,
      visible,
      sceneReady: true,
      activeSegment,
      profileLoading: profileQuery.isLoading,
      profileFetching: profileQuery.isFetching,
      createdLoading: createdPollsQuery.isLoading,
      createdFetching: createdPollsQuery.isFetching,
      contributedLoading: contributedPollsQuery.isLoading,
      contributedFetching: contributedPollsQuery.isFetching,
      restaurantListsLoading: restaurantListsQuery.isLoading,
      restaurantListsFetching: restaurantListsQuery.isFetching,
      dishListsLoading: dishListsQuery.isLoading,
      dishListsFetching: dishListsQuery.isFetching,
      createdCount: createdPolls.length,
      contributedCount: contributedPolls.length,
      restaurantListCount: restaurantListsQuery.data?.length ?? 0,
      dishListCount: dishListsQuery.data?.length ?? 0,
      shellSnapRequest: null,
    }),
    [
      activeSegment,
      contributedPolls.length,
      contributedPollsQuery.isFetching,
      contributedPollsQuery.isLoading,
      createdPolls.length,
      createdPollsQuery.isFetching,
      createdPollsQuery.isLoading,
      dishListsQuery.data?.length,
      dishListsQuery.isFetching,
      dishListsQuery.isLoading,
      profileQuery.isFetching,
      profileQuery.isLoading,
      restaurantListsQuery.data?.length,
      restaurantListsQuery.isFetching,
      restaurantListsQuery.isLoading,
      visible,
    ]
  );
  const previousSceneCauseRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (!activeProbe) {
      previousSceneCauseRef.current = null;
      return;
    }

    const nextSnapshotKey = JSON.stringify(sceneCauseSnapshot);
    const previousSnapshotKey = previousSceneCauseRef.current;
    if (!previousSnapshotKey) {
      logger.debug('[NAV-SWITCH-CAUSE] profileSceneSnapshot', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        snapshot: sceneCauseSnapshot,
      });
    } else if (previousSnapshotKey !== nextSnapshotKey) {
      logger.debug('[NAV-SWITCH-CAUSE] profileSceneDelta', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        changes: diffSceneSnapshots(JSON.parse(previousSnapshotKey), sceneCauseSnapshot),
      });
    }
    previousSceneCauseRef.current = nextSnapshotKey;
  }, [sceneCauseSnapshot]);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (!activeProbe) {
      return;
    }

    const events: string[] = [];
    if (profileQuery.isFetching) {
      events.push('profile_fetch_start');
    }
    if (createdPollsQuery.isFetching) {
      events.push('created_fetch_start');
    }
    if (contributedPollsQuery.isFetching) {
      events.push('contributed_fetch_start');
    }
    if (restaurantListsQuery.isFetching) {
      events.push('restaurant_lists_fetch_start');
    }
    if (dishListsQuery.isFetching) {
      events.push('dish_lists_fetch_start');
    }
    if (events.length === 0) {
      events.push('fetch_settled');
    }

    logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
      seq: activeProbe.seq,
      from: activeProbe.from,
      to: activeProbe.to,
      ageMs: getActiveSearchNavSwitchProbeAgeMs(),
      scene: 'profile',
      event: events.join(','),
      activeSegment,
    });
  }, [
    activeSegment,
    contributedPollsQuery.isFetching,
    createdPollsQuery.isFetching,
    dishListsQuery.isFetching,
    profileQuery.isFetching,
    restaurantListsQuery.isFetching,
  ]);

  return (
    <ProfileSceneContent
      avatarUrl={profile?.avatarUrl}
      initials={initials}
      displayName={displayName}
      usernameLabel={usernameLabel}
      pollsCreatedCount={stats?.pollsCreatedCount ?? 0}
      pollsContributedCount={stats?.pollsContributedCount ?? 0}
      followersCount={stats?.followersCount ?? 0}
      followingCount={stats?.followingCount ?? 0}
      activeSegment={activeSegment}
      activePolls={activePolls}
      isProfileLoading={profileQuery.isLoading}
      isActivePollListLoading={isActivePollListLoading}
      restaurantLists={restaurantListsQuery.data ?? []}
      restaurantListsLoading={restaurantListsQuery.isLoading}
      dishLists={dishListsQuery.data ?? []}
      dishListsLoading={dishListsQuery.isLoading}
      onOpenSettings={handleOpenSettings}
      onSelectSegment={setActiveSegment}
      onPollPress={handlePollPress}
      onListPress={handleListPress}
    />
  );
});

ProfileSceneRuntime.displayName = 'ProfileSceneRuntime';

export const useProfileSceneDefinition = ({
  mounted,
  visible,
  navBarTop = 0,
  searchBarTop = 0,
  snapPoints: snapPointsOverride,
  onSnapStart,
  onSnapChange,
  shellSnapRequest,
}: UseProfilePanelSpecOptions): SearchRouteSceneDefinition => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { setRootRoute } = useAppOverlayRouteController();
  const [sceneReady, setSceneReady] = React.useState(false);
  const perfStartRef = React.useRef<number | null>(null);
  const isMounted = mounted ?? visible;

  React.useEffect(() => {
    if (!isMounted || sceneReady) {
      return;
    }
    perfStartRef.current = Date.now();
    logger.debug('[NAV-SWITCH-SCENE-PERF] profileMount');
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (activeProbe) {
      logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        ageMs: getActiveSearchNavSwitchProbeAgeMs(),
        scene: 'profile',
        event: 'scene_mount',
      });
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }
      setSceneReady(true);
      logger.debug('[NAV-SWITCH-SCENE-PERF] profileReady', {
        elapsedMs: perfStartRef.current == null ? null : Date.now() - perfStartRef.current,
      });
      const readyProbe = getActiveSearchNavSwitchPerfProbe();
      if (readyProbe) {
        logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
          seq: readyProbe.seq,
          from: readyProbe.from,
          to: readyProbe.to,
          ageMs: getActiveSearchNavSwitchProbeAgeMs(),
          scene: 'profile',
          event: 'scene_ready',
        });
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [isMounted, sceneReady]);

  const handleClose = React.useCallback(() => {
    setRootRoute('search');
  }, [setRootRoute]);

  React.useEffect(() => {
    const activeProbe = getActiveSearchNavSwitchPerfProbe();
    if (!activeProbe) {
      return;
    }

    if (isMounted && !visible) {
      logger.debug('[NAV-SWITCH-ATTRIBUTION] sceneEvent', {
        seq: activeProbe.seq,
        from: activeProbe.from,
        to: activeProbe.to,
        ageMs: getActiveSearchNavSwitchProbeAgeMs(),
        scene: 'profile',
        event: 'mounted_hidden',
      });
    }
  }, [isMounted, visible]);

  React.useEffect(() => {
    if (!isSignedIn || !isMounted || visible) {
      return;
    }

    let cancelled = false;
    void queryClient
      .ensureQueryData(createProfileQueryOptions())
      .then((profile) => {
        if (cancelled) {
          return;
        }

        const userId = profile?.userId ?? null;
        if (!userId) {
          return;
        }

        return Promise.all([
          queryClient.prefetchQuery(
            createUserPollsQueryDescriptor({
              userId,
              activity: PROFILE_DEFAULT_SEGMENT,
            })
          ),
          queryClient.prefetchQuery(
            createPublicFavoriteListsQueryDescriptor({
              listType: 'restaurant',
            })
          ),
          queryClient.prefetchQuery(
            createPublicFavoriteListsQueryDescriptor({
              listType: 'dish',
            })
          ),
        ]);
      })
      .catch(() => {
        // keep hidden-scene prewarm best-effort
      });

    return () => {
      cancelled = true;
    };
  }, [isMounted, isSignedIn, queryClient, visible]);

  const headerHeight = OVERLAY_TAB_HEADER_HEIGHT;
  const navBarOffset = Math.max(navBarTop, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;
  const contentBottomPadding = Math.max(insets.bottom + 140, 160);
  const snapPoints = React.useMemo(
    () =>
      snapPointsOverride ??
      calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarOffset, headerHeight),
    [headerHeight, insets.top, navBarOffset, searchBarTop, snapPointsOverride]
  );

  const localHeaderActionProgress = useSharedValue(0);

  const headerComponent = React.useMemo(
    () => (
      <OverlaySheetHeaderChrome
        onGrabHandlePress={handleClose}
        grabHandleAccessibilityLabel="Close profile"
        title={
          <Text variant="title" weight="semibold" style={styles.sheetTitle}>
            Profile
          </Text>
        }
        actionButton={
          <OverlayHeaderActionButton
            progress={localHeaderActionProgress}
            onPress={handleClose}
            accessibilityLabel="Close profile"
            accentColor={themeColors.primary}
            closeColor="#000000"
          />
        }
      />
    ),
    [handleClose, localHeaderActionProgress]
  );

  const contentComponent = React.useMemo(
    () =>
      sceneReady ? (
        <ProfileSceneRuntime />
      ) : (
        <View style={styles.loadingState}>
          <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
        </View>
      ),
    [sceneReady]
  );

  const backgroundComponent = React.useMemo(() => <FrostedGlassBackground />, []);

  const shellSpec = React.useMemo(
    () => ({
      overlayKey: 'profile' as const,
      snapPoints,
      initialSnapPoint: 'expanded' as const,
      onSnapStart,
      onSnapChange,
      dismissThreshold,
      preventSwipeDismiss: true,
      style: overlaySheetStyles.container,
    }),
    [dismissThreshold, onSnapChange, onSnapStart, snapPoints]
  );

  const sceneSurface = React.useMemo(
    () =>
      ({
        surfaceKind: 'content' as const,
        contentComponent,
        inactiveRenderMode: 'freeze' as const,
        contentContainerStyle: [styles.scrollContent, { paddingBottom: contentBottomPadding }],
        bounces: false,
        alwaysBounceVertical: false,
        overScrollMode: 'never' as const,
        backgroundComponent,
        contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
        headerComponent,
        keyboardShouldPersistTaps: 'handled' as const,
      }) as BottomSheetSceneSurfaceProps<unknown>,
    [backgroundComponent, contentComponent, contentBottomPadding, headerComponent]
  );

  return React.useMemo(
    () => ({
      shellSpec,
      shellSnapRequest,
      sceneSurface,
    }),
    [sceneSurface, shellSnapRequest, shellSpec]
  );
};

export const useProfilePanelSpec = (
  options: UseProfilePanelSpecOptions
): OverlayContentSpec<unknown> => {
  const sceneDefinition = useProfileSceneDefinition(options);
  return React.useMemo(
    () => ({
      ...sceneDefinition.shellSpec,
      ...sceneDefinition.sceneSurface,
    }),
    [sceneDefinition]
  ) as OverlayContentSpec<unknown>;
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
  loadingState: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
