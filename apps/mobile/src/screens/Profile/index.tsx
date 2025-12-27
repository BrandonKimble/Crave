import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Heart } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../components';
import { FrostedGlassBackground } from '../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../constants/theme';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useOverlayStore, type OverlayKey } from '../../store/overlayStore';
import { logger } from '../../utils';
import { notificationsService } from '../../services/notifications';
import { usersService } from '../../services/users';
import { fetchUserPolls, type Poll } from '../../services/polls';
import { useFavoriteLists } from '../../hooks/use-favorite-lists';
import type { FavoriteListSummary } from '../../services/favorite-lists';
import type { RootStackParamList } from '../../types/navigation';
import { PollIcon } from '../Search/components/metric-icons';

type Navigation = StackNavigationProp<RootStackParamList>;
type ProfileSegment = 'created' | 'contributed' | 'favorites';

const NAV_BOTTOM_PADDING = 10;
const SEGMENT_BG = '#f1f5f9';
const SEGMENT_ACTIVE = '#ffffff';
const SEGMENT_TEXT = '#475569';
const SEGMENT_ACTIVE_TEXT = '#0f172a';

const resolveRankColor = (score?: number | null) => {
  if (score == null) {
    return '#94a3b8';
  }
  if (score >= 8) {
    return '#10b981';
  }
  if (score >= 6) {
    return '#f59e0b';
  }
  return '#fb7185';
};

const ProfileScreen: React.FC = () => {
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut, isSignedIn } = useAuth();
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const pushToken = useNotificationStore((state) => state.pushToken);
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const [activeSegment, setActiveSegment] = React.useState<ProfileSegment>('created');

  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => usersService.getMe(),
    enabled: isSignedIn,
  });
  const profile = profileQuery.data;
  const userId = profile?.userId ?? null;

  const createdPollsQuery = useQuery({
    queryKey: ['user-polls', 'created'],
    queryFn: () => fetchUserPolls({ activity: 'created', limit: 50 }),
    enabled: isSignedIn && Boolean(userId),
  });
  const contributedPollsQuery = useQuery({
    queryKey: ['user-polls', 'contributed'],
    queryFn: () => fetchUserPolls({ activity: 'participated', limit: 50 }),
    enabled: isSignedIn && Boolean(userId),
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
    enabled: isSignedIn && activeSegment === 'favorites',
  });
  const dishListsQuery = useFavoriteLists({
    listType: 'dish',
    visibility: 'public',
    enabled: isSignedIn && activeSegment === 'favorites',
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

  const handleNavPress = React.useCallback(
    (target: OverlayKey) => {
      if (target === 'profile') {
        return;
      }
      setOverlay(target);
      navigation.navigate('Main');
    },
    [navigation, setOverlay]
  );

  const handlePollPress = React.useCallback(
    (poll: Poll) => {
      setOverlay('polls', {
        pollId: poll.pollId,
        coverageKey: poll.coverageKey ?? null,
      });
      navigation.navigate('Main');
    },
    [navigation, setOverlay]
  );

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

  const bottomInset = insets.bottom;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomInset + 140 }]}
      >
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
            {profileQuery.isLoading ||
            createdPollsQuery.isLoading ||
            contributedPollsQuery.isLoading ? (
              <ActivityIndicator color={themeColors.primary} style={styles.sectionSpinner} />
            ) : activePolls.length ? (
              <View style={styles.pollList}>{activePolls.map(renderPollCard)}</View>
            ) : (
              <Text variant="caption" style={styles.emptyText}>
                {activeSegment === 'created'
                  ? 'No polls created yet.'
                  : 'No poll contributions yet.'}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomNavWrapper} pointerEvents="box-none">
        <View style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_BOTTOM_PADDING }]}>
          <View style={styles.bottomNavBackground} pointerEvents="none">
            <FrostedGlassBackground />
          </View>
          {(
            [
              { key: 'search' as OverlayKey, label: 'Search' },
              { key: 'polls' as OverlayKey, label: 'Polls' },
              { key: 'bookmarks' as OverlayKey, label: 'Favorites' },
              { key: 'profile' as const, label: 'Profile' },
            ] as const
          ).map((item) => {
            const isActive = item.key === 'profile';
            const iconColor = isActive ? themeColors.primary : '#94a3b8';
            const renderIcon = (color: string, active: boolean) => {
              if (item.key === 'search') {
                const holeRadius = active ? 4.2 : 3.2;
                const pinPath =
                  'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';
                const holePath = `M12 10m-${holeRadius},0a${holeRadius},${holeRadius} 0 1,0 ${
                  holeRadius * 2
                },0a${holeRadius},${holeRadius} 0 1,0 -${holeRadius * 2},0`;
                return (
                  <Svg width={24} height={24} viewBox="0 0 24 24">
                    <Path
                      d={`${pinPath} ${holePath}`}
                      fill={active ? color : 'none'}
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fillRule="evenodd"
                      clipRule="evenodd"
                    />
                  </Svg>
                );
              }
              if (item.key === 'bookmarks') {
                return (
                  <Heart
                    size={24}
                    color={color}
                    strokeWidth={active ? 0 : 2}
                    fill={active ? color : 'none'}
                  />
                );
              }
              if (item.key === 'polls') {
                return <PollIcon color={color} size={24} strokeWidth={active ? 2.5 : 2} />;
              }
              if (active) {
                return (
                  <Svg width={24} height={24} viewBox="0 0 24 24" fill={color} stroke="none">
                    <Path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
                    />
                  </Svg>
                );
              }
              return (
                <Svg
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                >
                  <Path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </Svg>
              );
            };
            return (
              <Pressable
                key={item.key}
                style={styles.navButton}
                onPress={() => handleNavPress(item.key)}
              >
                <View style={styles.navIcon}>{renderIcon(iconColor, isActive)}</View>
                <Text
                  variant="caption"
                  weight={isActive ? 'semibold' : 'regular'}
                  style={[styles.navLabel, isActive && styles.navLabelActive]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
    color: '#64748b',
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
    marginTop: 20,
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
    color: '#64748b',
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: SEGMENT_BG,
    borderRadius: 999,
    marginTop: 20,
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
    marginTop: 20,
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
    color: '#64748b',
    marginTop: 6,
  },
  pollMeta: {
    color: '#94a3b8',
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
    color: '#64748b',
  },
  emptyText: {
    color: '#94a3b8',
  },
  bottomNavWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 12,
    backgroundColor: 'transparent',
  },
  bottomNavBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  navButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
    paddingHorizontal: 4,
  },
  navIcon: {
    marginBottom: 2,
  },
  navLabel: {
    color: '#94a3b8',
  },
  navLabelActive: {
    color: themeColors.primary,
  },
});

export default ProfileScreen;
