import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components';
import { usersService, type FollowListUser } from '../../services/users';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useTopMostRouteEntryForScene } from '../../navigation/runtime/use-top-most-route-entry-for-scene';
import { useOriginSceneScrollPublication } from '../useOriginSceneScrollPublication';

// ─── followList — the REAL page body (trigger-nav pages) ────────────────────────────────────
// Replaces the S-B drill-in practice body. Rows push userProfile — the same-key nesting loop
// stays live. Origin scroll publication stays (this scene remains a return-to-origin source;
// the S-B standing rig proof rode this page's scroll). Failure/empty per §5.6.

type LoadState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; users: FollowListUser[] };

const AVATAR_SIZE = 40;

const resolveRowTitle = (user: FollowListUser): string =>
  user.displayName?.trim() || user.username?.trim() || 'Crave member';

const RowAvatar = ({ user }: { user: FollowListUser }) => {
  if (user.avatarUrl) {
    return <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text variant="body" weight="semibold" style={styles.avatarInitial}>
        {resolveRowTitle(user).slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
};

export const FollowListPanelBody = React.memo(() => {
  const entry = useTopMostRouteEntryForScene('followList');
  const { pushRoute } = useAppOverlayRouteController();
  const mode = entry?.params?.mode === 'following' ? 'following' : 'followers';
  const ownerUserId = typeof entry?.params?.userId === 'string' ? entry.params.userId : null;
  useOriginSceneScrollPublication('followList');

  const [loadState, setLoadState] = React.useState<LoadState>({ kind: 'loading' });
  const loadSeqRef = React.useRef(0);

  const load = React.useCallback(() => {
    if (!ownerUserId) {
      setLoadState({ kind: 'failed' });
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoadState({ kind: 'loading' });
    void (
      mode === 'following'
        ? usersService.listFollowing(ownerUserId)
        : usersService.listFollowers(ownerUserId)
    )
      .then((users) => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setLoadState({ kind: 'ready', users });
      })
      .catch(() => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setLoadState({ kind: 'failed' });
      });
  }, [mode, ownerUserId]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loadState.kind === 'loading') {
    return (
      <View style={styles.stateBody} testID="follow-list-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (loadState.kind === 'failed') {
    return (
      <View style={styles.stateBody} testID="follow-list-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t load this list.
        </Text>
        <Pressable
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Retry loading list"
          testID="follow-list-retry"
          style={styles.retryButton}
        >
          <Text variant="body" weight="semibold" style={styles.retryText}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const { users } = loadState;

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
    paddingVertical: 16,
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
