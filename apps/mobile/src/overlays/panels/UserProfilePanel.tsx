import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components';
import { usersService, type FollowEdge, type PublicUserProfile } from '../../services/users';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useTopMostRouteEntryForScene } from '../../navigation/runtime/use-top-most-route-entry-for-scene';

// ─── userProfile — the REAL page body (trigger-nav pages; plans/page-registry.md) ───────────
// Replaces the S-B drill-in practice body. Data = the public profile payload
// (GET /users/:id/profile — identity card + stats) + the viewer follow edge
// (GET /users/:id/follow). The follow button toggles optimistically and reconciles on
// failure. Failure/empty is the eighth scene-contract member (§5.6): a failed load renders
// the retry body, never a permanent blank. Drill rows push followList — the same-key
// nesting loop (userProfile → followList → userProfile) S-B proved stays live here.

type LoadState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; profile: PublicUserProfile; edge: FollowEdge };

const AVATAR_SIZE = 64;

const resolveDisplayTitle = (profile: PublicUserProfile): string =>
  profile.displayName?.trim() || profile.username?.trim() || 'Crave member';

const AvatarCircle = ({ profile }: { profile: PublicUserProfile }) => {
  const title = resolveDisplayTitle(profile);
  if (profile.avatarUrl) {
    return <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text variant="title" weight="semibold" style={styles.avatarInitial}>
        {title.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
};

const StatCell = ({
  label,
  value,
  testID,
  onPress,
}: {
  label: string;
  value: number;
  testID: string;
  onPress?: () => void;
}) => {
  const content = (
    <>
      <Text variant="title" weight="semibold" style={styles.statValue}>
        {value}
      </Text>
      <Text variant="caption" style={styles.statLabel}>
        {label}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.statCell} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
      style={styles.statCell}
    >
      {content}
    </Pressable>
  );
};

export const UserProfilePanelBody = React.memo(() => {
  const entry = useTopMostRouteEntryForScene('userProfile');
  const { pushRoute } = useAppOverlayRouteController();
  const userId = typeof entry?.params?.userId === 'string' ? entry.params.userId : null;

  const [loadState, setLoadState] = React.useState<LoadState>({ kind: 'loading' });
  const [isFollowedByMe, setIsFollowedByMe] = React.useState(false);
  const [followBusy, setFollowBusy] = React.useState(false);
  const loadSeqRef = React.useRef(0);

  const load = React.useCallback(() => {
    if (!userId) {
      setLoadState({ kind: 'failed' });
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoadState({ kind: 'loading' });
    void Promise.all([usersService.getPublicProfile(userId), usersService.getFollowEdge(userId)])
      .then(([profile, edge]) => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setIsFollowedByMe(edge.isFollowedByMe);
        setLoadState({ kind: 'ready', profile, edge });
      })
      .catch(() => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setLoadState({ kind: 'failed' });
      });
  }, [userId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleToggleFollow = React.useCallback(() => {
    if (!userId || followBusy) {
      return;
    }
    const next = !isFollowedByMe;
    // Optimistic flip; reconcile on failure (the value is the server's — we only preview it).
    setIsFollowedByMe(next);
    setFollowBusy(true);
    void (next ? usersService.followUser(userId) : usersService.unfollowUser(userId))
      .catch(() => {
        setIsFollowedByMe(!next);
      })
      .finally(() => {
        setFollowBusy(false);
      });
  }, [followBusy, isFollowedByMe, userId]);

  if (loadState.kind === 'loading') {
    return (
      <View style={styles.stateBody} testID="user-profile-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (loadState.kind === 'failed') {
    return (
      <View style={styles.stateBody} testID="user-profile-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t load this profile.
        </Text>
        <Pressable
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Retry loading profile"
          testID="user-profile-retry"
          style={styles.retryButton}
        >
          <Text variant="body" weight="semibold" style={styles.retryText}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const { profile, edge } = loadState;
  const title = resolveDisplayTitle(profile);

  return (
    <View style={styles.body} testID="stub-scene-userProfile">
      <View style={styles.identityRow}>
        <AvatarCircle profile={profile} />
        <View style={styles.identityText}>
          <Text
            variant="title"
            weight="semibold"
            numberOfLines={1}
            style={styles.displayName}
            testID="user-profile-user-id"
          >
            {title}
          </Text>
          {profile.username ? (
            <Text variant="caption" style={styles.username}>
              @{profile.username}
            </Text>
          ) : null}
        </View>
        {!edge.isMe ? (
          <Pressable
            onPress={handleToggleFollow}
            disabled={followBusy}
            accessibilityRole="button"
            accessibilityLabel={isFollowedByMe ? 'Unfollow' : 'Follow'}
            testID="user-profile-follow-button"
            style={[styles.followButton, isFollowedByMe && styles.followButtonActive]}
          >
            <Text
              variant="body"
              weight="semibold"
              style={isFollowedByMe ? styles.followTextActive : styles.followText}
            >
              {isFollowedByMe ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatCell
          label="Followers"
          value={profile.stats.followersCount}
          testID="user-profile-followers"
          onPress={() => pushRoute('followList', { userId: profile.userId, mode: 'followers' })}
        />
        <StatCell
          label="Following"
          value={profile.stats.followingCount}
          testID="user-profile-following"
          onPress={() => pushRoute('followList', { userId: profile.userId, mode: 'following' })}
        />
        <StatCell
          label="Polls"
          value={profile.stats.pollsCreatedCount}
          testID="user-profile-polls"
        />
        <StatCell
          label="Lists"
          value={profile.stats.favoriteListsCount}
          testID="user-profile-lists"
        />
      </View>
    </View>
  );
});
UserProfilePanelBody.displayName = 'UserProfilePanelBody';

const styles = StyleSheet.create({
  body: {
    paddingVertical: 24,
  },
  stateBody: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  retryText: {
    color: '#0f172a',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#f1f5f9',
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#0f172a',
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    color: '#0f172a',
  },
  username: {
    color: '#64748b',
  },
  followButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#0f172a',
  },
  followButtonActive: {
    backgroundColor: '#f1f5f9',
  },
  followText: {
    color: '#ffffff',
  },
  followTextActive: {
    color: '#0f172a',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 16,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: '#0f172a',
  },
  statLabel: {
    color: '#64748b',
  },
});
