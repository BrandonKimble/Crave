import React from 'react';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { Pressable, StyleSheet, View } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { Text } from '../../components';
import { showAppModal } from '../../components/app-modal-store';
import { showShareModal } from '../../components/share-modal-store';
import { usersService, type PublicUserProfile, type UserReportReason } from '../../services/users';
import { messagingService } from '../../services/messaging';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MonogramAvatar } from '../../components/MonogramAvatar';
import { SceneBodyReadyGate } from '../SceneBodyReadyGate';
import {
  ProfileSectionsBody,
  PROFILE_DEFAULT_SECTION,
  type ProfileSectionKey,
} from './ProfileSectionsBody';

// ─── userProfile — the REAL page body (trigger-nav pages; plans/page-registry.md) ───────────
// W3: the §7.3 dynamic single-page shape — persistent identity header + the FOUR-section body
// (Polls / Comments / Lists / Photos) which is now the SHARED ProfileSectionsBody, rendered by
// BOTH this child page and the root profile TAB. This panel owns only the FOREIGN chrome around
// it: the follow / message / share identity row, the stats row, and the Block / Report rows.
// Blocking (§8.6): the authed follow edge carries the block flags; either direction renders the
// "unavailable" body.

const AVATAR_SIZE = 64;

const resolveDisplayTitle = (profile: PublicUserProfile): string =>
  profile.displayName?.trim() || profile.username?.trim() || 'Crave member';

const AvatarCircle = ({ profile }: { profile: PublicUserProfile }) => (
  <MonogramAvatar
    seed={profile.userId}
    avatarUrl={profile.avatarUrl}
    title={resolveDisplayTitle(profile)}
    size={AVATAR_SIZE}
    textVariant="title"
  />
);

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

// W1 slice 1 (C2): the ENTRY arrives as a prop from the entry-keyed mount unit — with two
// live userProfile entries (the drill loop) the topmost-per-key read renders the wrong one.
export const UserProfilePanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const { pushRoute } = useAppOverlayRouteController();
  const queryClient = useQueryClient();
  const params =
    entry?.key === 'userProfile'
      ? (entry.params as import('../../navigation/runtime/app-overlay-route-types').OverlayRouteParamsMap['userProfile'])
      : null;
  const userId = typeof params?.userId === 'string' ? params.userId : null;

  // RT-19 (state-loss half): page data rides the query CACHE keyed by userId — the drill
  // loop's pop back to A re-renders instantly from cache instead of a spinner refetch.
  const profileQuery = useQuery({
    queryKey: ['userProfile', userId],
    enabled: userId != null,
    staleTime: 60_000,
    queryFn: async () => {
      const [profile, edge] = await Promise.all([
        usersService.getPublicProfile(userId as string),
        usersService.getFollowEdge(userId as string),
      ]);
      return { profile, edge };
    },
  });
  const [followOverride, setFollowOverride] = React.useState<{
    forUserId: string;
    value: boolean;
  } | null>(null);
  const [followBusy, setFollowBusy] = React.useState(false);
  const [blockBusy, setBlockBusy] = React.useState(false);
  const [activeSection, setActiveSection] =
    React.useState<ProfileSectionKey>(PROFILE_DEFAULT_SECTION);
  const serverFollowed = profileQuery.data?.edge.isFollowedByMe ?? false;
  React.useEffect(() => {
    if (followOverride != null && followOverride.value === serverFollowed) {
      setFollowOverride(null);
    }
  }, [followOverride, serverFollowed]);
  const isFollowedByMe =
    followOverride != null && followOverride.forUserId === userId
      ? followOverride.value
      : serverFollowed;

  const edge = profileQuery.data?.edge ?? null;
  // §8.6: either direction of block renders the unavailable body.
  const isBlockedByMe = edge?.isBlockedByMe === true;
  const hasBlockedMe = edge?.hasBlockedMe === true;
  // The server-side profile read is also honest now (unavailable: true on a
  // blocked pair) — fold it in so the body can never render leaked data.
  const blockedEitherWay =
    isBlockedByMe || hasBlockedMe || profileQuery.data?.profile.unavailable === true;

  // Sections gate: a loaded, unblocked profile (the shared body fetches its own per-section data).
  const sectionsEnabled = userId != null && profileQuery.data != null && !blockedEitherWay;

  // ── §8.14 owner long-press modal + §7.4 add-photos live inside ProfileSectionsBody now;
  //    isOwnProfile unlocks them there.
  const isOwnProfile = edge?.isMe === true;

  const handleToggleFollow = React.useCallback(() => {
    if (!userId || followBusy) {
      return;
    }
    const next = !isFollowedByMe;
    setFollowOverride({ forUserId: userId, value: next });
    setFollowBusy(true);
    void (next ? usersService.followUser(userId) : usersService.unfollowUser(userId))
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['followList'] });
        void queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      })
      .catch(() => {
        setFollowOverride({ forUserId: userId, value: !next });
      })
      .finally(() => {
        setFollowBusy(false);
      });
  }, [followBusy, isFollowedByMe, userId, queryClient]);

  // W3 messaging (§4.4 entry 1): Message = Follow's pair. Idempotent
  // get-or-create by peer, then push the entry-keyed dmSession child.
  const [messageBusy, setMessageBusy] = React.useState(false);
  const handleMessage = React.useCallback(() => {
    if (!userId || messageBusy) {
      return;
    }
    setMessageBusy(true);
    void messagingService
      .getOrCreateConversation(userId)
      .then((conversation) => {
        pushRoute('dmSession', {
          conversationId: conversation.conversationId,
          peerName: conversation.otherUser.displayName ?? conversation.otherUser.username ?? null,
        });
      })
      .catch(() => {
        // Blocked pair / offline: the server said no — nothing to fake locally.
      })
      .finally(() => {
        setMessageBusy(false);
      });
  }, [messageBusy, pushRoute, userId]);

  const runBlockChange = React.useCallback(
    (block: boolean) => {
      if (!userId || blockBusy) {
        return;
      }
      setBlockBusy(true);
      void (block ? usersService.blockUser(userId) : usersService.unblockUser(userId))
        .then(() => {
          // The edge + every follow surface changed (block severs follows).
          void queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
          void queryClient.invalidateQueries({ queryKey: ['followList'] });
        })
        .catch(() => {
          showAppModal({
            title: 'Something went wrong',
            message: 'Please try again.',
            actions: [{ label: 'OK', style: 'default' }],
          });
        })
        .finally(() => {
          setBlockBusy(false);
        });
    },
    [blockBusy, queryClient, userId]
  );

  // ── §9b profileActions (Apple 1.2 UGC): report user — the ONE app modal
  // with reasons, quiet-by-design submit (mirrors the photo/comment flows).
  const handleReportPress = React.useCallback(() => {
    if (!userId) {
      return;
    }
    const submit = (reason: UserReportReason): void => {
      void usersService
        .reportUser(userId, reason)
        .then(() => {
          showAppModal({
            title: 'Report received',
            message: "Thanks — we'll take a look.",
            actions: [{ label: 'OK', style: 'default' }],
          });
        })
        .catch(() => {
          // Reports are quiet-by-design: a duplicate/failed report simply doesn't confirm.
        });
    };
    const reasons: Array<{ label: string; reason: UserReportReason }> = [
      { label: 'Spam', reason: 'spam' },
      { label: 'Harassment', reason: 'harassment' },
      { label: 'Impersonation', reason: 'impersonation' },
      { label: 'Other', reason: 'other' },
    ];
    showAppModal({
      title: 'Report user',
      message: "What's wrong?",
      actions: [
        ...reasons.map(({ label, reason }) => ({
          label,
          onPress: () => submit(reason),
        })),
        { label: 'Cancel', style: 'cancel' as const },
      ],
    });
  }, [userId]);

  const handleBlockPress = React.useCallback(() => {
    if (isBlockedByMe) {
      runBlockChange(false);
      return;
    }
    showAppModal({
      title: 'Block this user?',
      message:
        'They will no longer be able to follow you, and you will not see each other in follow lists.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Block',
          style: 'destructive',
          onPress: () => runBlockChange(true),
          testID: 'user-profile-block-confirm',
        },
      ],
    });
  }, [isBlockedByMe, runBlockChange]);

  // Load-failure law (wave-4 §1): shared modal + pop; no page-local retry.
  const isLoadFailed =
    userId == null ||
    profileQuery.isError ||
    (!profileQuery.isPending && profileQuery.data == null);
  if ((userId != null && profileQuery.isPending) || isLoadFailed || profileQuery.data == null) {
    return (
      <View testID={isLoadFailed ? 'user-profile-failed' : 'user-profile-loading'}>
        <SceneBodyReadyGate
          pending={userId != null && profileQuery.isPending}
          failure={{ isError: isLoadFailed, what: 'this profile' }}
        />
      </View>
    );
  }

  const { profile } = profileQuery.data;
  const followersDelta =
    edge != null && !edge.isMe && isFollowedByMe !== serverFollowed ? (isFollowedByMe ? 1 : -1) : 0;
  const title = resolveDisplayTitle(profile);

  // §8.6: blocked-either-way = the minimal "unavailable" body (they blocked
  // me → nothing else at all; I blocked them → plus the Unblock affordance).
  if (blockedEitherWay) {
    return (
      <View style={styles.stateBody} testID="user-profile-unavailable">
        <Text variant="body" style={styles.stateText}>
          This profile is unavailable.
        </Text>
        {isBlockedByMe ? (
          <Pressable
            onPress={handleBlockPress}
            disabled={blockBusy}
            accessibilityRole="button"
            accessibilityLabel="Unblock user"
            testID="user-profile-unblock"
            style={styles.actionPillButton}
          >
            <Text variant="body" weight="semibold" style={styles.actionPillText}>
              Unblock
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

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
        {edge != null && !edge.isMe ? (
          <Pressable
            onPress={handleMessage}
            disabled={messageBusy}
            accessibilityRole="button"
            accessibilityLabel="Message"
            testID="user-profile-message-button"
            style={styles.messageButton}
          >
            <Text variant="body" weight="semibold" style={styles.messageText}>
              Message
            </Text>
          </Pressable>
        ) : null}
        {edge != null && !edge.isMe ? (
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
        {/* W3 universal share modal — profiles are a shareable kind (§9b). */}
        <Pressable
          onPress={() => showShareModal({ kind: 'user_profile', id: profile.userId, title })}
          accessibilityRole="button"
          accessibilityLabel="Share profile"
          testID="user-profile-share-button"
          style={styles.shareIconButton}
          hitSlop={8}
        >
          <Feather name="share-2" size={18} color="#1f2937" />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <StatCell
          label="Followers"
          value={profile.stats.followersCount + followersDelta}
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

      {/* Shared four-section body (Polls / Comments / Lists / Photos). isOwnProfile unlocks the
          §8.14 list long-press curation modal + the §7.4 "Add photos" entry. */}
      <View style={styles.sectionsWrapper}>
        <ProfileSectionsBody
          userId={profile.userId}
          isOwnProfile={isOwnProfile}
          enabled={sectionsEnabled}
          activeSection={activeSection}
          onSelectSection={setActiveSection}
        />
      </View>

      {edge != null && !edge.isMe ? (
        <>
          <Pressable
            onPress={handleBlockPress}
            disabled={blockBusy}
            accessibilityRole="button"
            accessibilityLabel="Block user"
            testID="user-profile-block-row"
            style={styles.blockRow}
          >
            <Text variant="body" weight="semibold" style={styles.blockRowText}>
              Block user
            </Text>
          </Pressable>
          <Pressable
            onPress={handleReportPress}
            accessibilityRole="button"
            accessibilityLabel="Report user"
            testID="user-profile-report-row"
            style={styles.reportRow}
          >
            <Text variant="body" weight="semibold" style={styles.blockRowText}>
              Report user
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
});
UserProfilePanelBody.displayName = 'UserProfilePanelBody';

const styles = StyleSheet.create({
  body: {
    paddingBottom: 24,
  },
  stateBody: {
    paddingBottom: 48,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
  },
  actionPillButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  actionPillText: {
    color: '#0f172a',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  shareIconButton: {
    padding: 6,
  },
  messageButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  messageText: {
    color: '#0f172a',
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
  sectionsWrapper: {
    marginTop: 20,
  },
  blockRow: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  blockRowText: {
    color: '#dc2626',
  },
  reportRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});
