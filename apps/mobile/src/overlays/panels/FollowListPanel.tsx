import React from 'react';
import { useShellLiveness } from '../ShellVisibilityBoundary';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components';
import { usersService, type FollowListUser } from '../../services/users';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useQuery } from '@tanstack/react-query';
import { useOriginSceneScrollPublication } from '../useOriginSceneScrollPublication';
import { MonogramAvatar } from '../../components/MonogramAvatar';
import { SceneBodyReadyGate } from '../SceneBodyReadyGate';

// ─── followList — the REAL page body (trigger-nav pages) ────────────────────────────────────
// Replaces the S-B drill-in practice body. Rows push userProfile — the same-key nesting loop
// stays live. Origin scroll publication stays (this scene remains a return-to-origin source;
// the S-B standing rig proof rode this page's scroll). Failure/empty per §5.6.

const AVATAR_SIZE = 40;

const resolveRowTitle = (user: FollowListUser): string =>
  user.displayName?.trim() || user.username?.trim() || 'Crave member';

const RowAvatar = ({ user }: { user: FollowListUser }) => (
  <MonogramAvatar
    seed={user.userId}
    avatarUrl={user.avatarUrl}
    title={resolveRowTitle(user)}
    size={AVATAR_SIZE}
  />
);

// W1 slice 1 (C2): the ENTRY arrives as a prop from the entry-keyed mount unit — with two
// live followList entries the topmost-per-key read would render the wrong one.
export const FollowListPanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const { pushRoute } = useAppOverlayRouteController();
  const params =
    entry?.key === 'followList'
      ? (entry.params as import('../../navigation/runtime/app-overlay-route-types').OverlayRouteParamsMap['followList'])
      : null;
  const mode = params?.mode === 'following' ? 'following' : 'followers';
  const ownerUserId = typeof params?.userId === 'string' ? params.userId : null;
  useOriginSceneScrollPublication('followList');

  // RT-19 (state-loss half): cache-keyed by (mode, userId) — the drill loop's pop back
  // re-renders instantly from cache instead of a spinner refetch.
  // A#9 (residency): see UserProfilePanel — hidden resident units stay quiet.
  const followListLive = useShellLiveness();
  const listQuery = useQuery({
    queryKey: ['followList', mode, ownerUserId],
    enabled: ownerUserId != null,
    subscribed: followListLive,
    staleTime: 60_000,
    queryFn: () =>
      mode === 'following'
        ? usersService.listFollowing(ownerUserId as string)
        : usersService.listFollowers(ownerUserId as string),
  });
  // Load-failure law (wave-4 §1): shared modal + pop; no page-local retry.
  const isLoadFailed =
    ownerUserId == null || listQuery.isError || (!listQuery.isPending && listQuery.data == null);
  if ((ownerUserId != null && listQuery.isPending) || isLoadFailed || listQuery.data == null) {
    return (
      <View testID={isLoadFailed ? 'follow-list-failed' : 'follow-list-loading'}>
        <SceneBodyReadyGate
          pending={ownerUserId != null && listQuery.isPending}
          failure={{ isError: isLoadFailed, what: 'this list' }}
        />
      </View>
    );
  }

  const users = listQuery.data;

  return (
    <View style={styles.body} testID="stub-scene-followList">
      <Text variant="caption" style={styles.contextLabel} testID="follow-list-context">
        {mode === 'following' ? 'Following' : 'Followers'}
      </Text>
      {users.length === 0 ? (
        <View style={styles.stateBody} testID="follow-list-empty">
          <Text variant="body" style={styles.stateText}>
            {mode === 'following' ? 'Not following anyone yet.' : 'No followers yet.'}
          </Text>
        </View>
      ) : (
        users.map((user) => (
          <Pressable
            key={user.userId}
            onPress={() => pushRoute('userProfile', { userId: user.userId })}
            accessibilityRole="button"
            accessibilityLabel={`View ${resolveRowTitle(user)}`}
            testID={`follow-list-user-${user.userId}`}
            style={styles.row}
          >
            <RowAvatar user={user} />
            <View style={styles.rowText}>
              <Text variant="body" weight="semibold" numberOfLines={1} style={styles.rowTitle}>
                {resolveRowTitle(user)}
              </Text>
              {user.username ? (
                <Text variant="caption" style={styles.rowSubtitle}>
                  @{user.username}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
});
FollowListPanelBody.displayName = 'FollowListPanelBody';

const styles = StyleSheet.create({
  body: {
    paddingBottom: 16,
  },
  stateBody: {
    paddingBottom: 48,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
  },
  contextLabel: {
    color: '#64748b',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: '#0f172a',
  },
  rowSubtitle: {
    color: '#64748b',
  },
});
