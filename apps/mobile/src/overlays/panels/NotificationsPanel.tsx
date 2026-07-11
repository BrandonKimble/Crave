import React from 'react';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components';
import { notificationsService, type NotificationFeedItem } from '../../services/notifications';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useOriginSceneScrollPublication } from '../useOriginSceneScrollPublication';

// ─── notifications — the REAL page body (trigger-nav pages; product/notifications.md) ───────
// The in-app feed over GET /notifications/feed. Opening the page marks the feed read (the
// page-open behavior — the unread badge lives upstream). Rows are type-dispatched; today's
// producer set = follower_added (rides the live social graph); poll/movement producers land
// per the product doc's extension point. Failure/empty per §5.6.

type LoadState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; items: NotificationFeedItem[] };

const AVATAR_SIZE = 40;

const resolveActorTitle = (item: NotificationFeedItem): string =>
  item.actor?.displayName?.trim() || item.actor?.username?.trim() || 'Someone';

const resolveRowText = (item: NotificationFeedItem): string => {
  switch (item.type) {
    case 'follower_added':
      return `${resolveActorTitle(item)} started following you`;
    case 'poll_release':
      return 'New polls just dropped in your city';
    default:
      return 'Something happened';
  }
};

const RowAvatar = ({ item }: { item: NotificationFeedItem }) => {
  if (item.actor?.avatarUrl) {
    return <Image source={{ uri: item.actor.avatarUrl }} style={styles.avatarImage} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text variant="body" weight="semibold" style={styles.avatarInitial}>
        {resolveActorTitle(item).slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
};

export const NotificationsPanelBody = React.memo((_props: MountedSceneBodyProps) => {
  const { pushRoute } = useAppOverlayRouteController();
  useOriginSceneScrollPublication('notifications');

  const [loadState, setLoadState] = React.useState<LoadState>({ kind: 'loading' });
  const loadSeqRef = React.useRef(0);

  const load = React.useCallback(() => {
    const seq = ++loadSeqRef.current;
    setLoadState({ kind: 'loading' });
    void notificationsService
      .getFeed()
      .then(({ items }) => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setLoadState({ kind: 'ready', items });
        // Page-open marks read — fire-and-forget; the rows still show their unread dot
        // for THIS visit (readAt is the fetched value).
        void notificationsService.markFeedRead().catch(() => {});
      })
      .catch(() => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setLoadState({ kind: 'failed' });
      });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleRowPress = React.useCallback(
    (item: NotificationFeedItem) => {
      if (item.type === 'follower_added' && item.actor?.userId) {
        pushRoute('userProfile', { userId: item.actor.userId });
      }
    },
    [pushRoute]
  );

  if (loadState.kind === 'loading') {
    return (
      <View style={styles.stateBody} testID="notifications-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (loadState.kind === 'failed') {
    return (
      <View style={styles.stateBody} testID="notifications-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t load your notifications.
        </Text>
        <Pressable
          onPress={load}
          accessibilityRole="button"
          accessibilityLabel="Retry loading notifications"
          testID="notifications-retry"
          style={styles.retryButton}
        >
          <Text variant="body" weight="semibold" style={styles.retryText}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const { items } = loadState;

  if (items.length === 0) {
    return (
      <View style={styles.stateBody} testID="notifications-empty">
        <Text variant="body" style={styles.stateText}>
          Nothing yet — activity on your polls, lists, and follows lands here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.body} testID="stub-scene-notifications">
      {items.map((item) => (
        <Pressable
          key={item.userNotificationId}
          onPress={() => handleRowPress(item)}
          accessibilityRole="button"
          accessibilityLabel={resolveRowText(item)}
          testID={`notification-${item.userNotificationId}`}
          style={styles.row}
        >
          <RowAvatar item={item} />
          <View style={styles.rowText}>
            <Text variant="body" numberOfLines={2} style={styles.rowTitle}>
              {resolveRowText(item)}
            </Text>
          </View>
          {item.readAt == null ? <View style={styles.unreadDot} /> : null}
        </Pressable>
      ))}
    </View>
  );
});
NotificationsPanelBody.displayName = 'NotificationsPanelBody';

const styles = StyleSheet.create({
  body: {
    paddingVertical: 16,
  },
  stateBody: {
    paddingVertical: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
    textAlign: 'center',
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
  },
  rowTitle: {
    color: '#0f172a',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3368',
  },
});
