import React from 'react';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components';
import { notificationsService, type NotificationFeedItem } from '../../services/notifications';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useOriginSceneScrollPublication } from '../useOriginSceneScrollPublication';
import { PageBodyShell } from '../PageBodyShell';
import {
  resolvePageBodyListState,
  type PageBodyState,
  type PageListBodySpec,
} from '../page-body-contract';

// ─── notifications — THE PAGE L2's first migrated list body ─────────────────────────
// The in-app feed over GET /notifications/feed. Opening the page marks the feed read
// (the page-open behavior — the unread badge lives upstream). Rows are type-dispatched;
// today's producer set = follower_added; poll/movement producers land per the product
// doc's extension point.
//
// L2 shape: the PAGE CONTROLLER (useNotificationsPageBody) owns the query and returns
// the closed PageBodyState; the spec below is the immutable declaration (row slot,
// empty view, placeholder template); PageBodyShell is the one interpreter. The old
// panel-local load-state machine, in-body ready gate, and hand-rolled empty/failed
// views are DELETED — a pending/error/empty branch has no state left to express here.

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

// The ROW SLOT — receives a resolved item; interaction is in-slot, queries are not.
const NotificationRow = React.memo(({ item }: { item: NotificationFeedItem }) => {
  const { pushRoute } = useAppOverlayRouteController();
  const handlePress = React.useCallback(() => {
    if (item.type === 'follower_added' && item.actor?.userId) {
      pushRoute('userProfile', { userId: item.actor.userId });
    }
  }, [item, pushRoute]);
  return (
    <Pressable
      onPress={handlePress}
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
  );
});
NotificationRow.displayName = 'NotificationRow';

// The DECLARED empty view (§5.6) — an L2 spec slot, not a panel branch.
const NotificationsEmpty = () => (
  <View style={styles.stateBody} testID="notifications-empty">
    <Text variant="body" style={styles.stateText}>
      Nothing yet — activity on your polls, lists, and follows lands here.
    </Text>
  </View>
);

// THE PAGE CONTROLLER — the query lives here, structurally unreachable from the slots.
const useNotificationsPageBody = (): PageBodyState<NotificationFeedItem> => {
  const [edge, setEdge] = React.useState<{
    isPending: boolean;
    isError: boolean;
    items: NotificationFeedItem[] | null;
  }>({ isPending: true, isError: false, items: null });
  const loadSeqRef = React.useRef(0);

  React.useEffect(() => {
    const seq = ++loadSeqRef.current;
    void notificationsService
      .getFeed()
      .then(({ items }) => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setEdge({ isPending: false, isError: false, items });
        // Page-open marks read — fire-and-forget; the rows still show their unread dot
        // for THIS visit (readAt is the fetched value).
        void notificationsService.markFeedRead().catch(() => {});
      })
      .catch(() => {
        if (loadSeqRef.current !== seq) {
          return;
        }
        setEdge({ isPending: false, isError: true, items: null });
      });
  }, []);

  return resolvePageBodyListState({
    isPending: edge.isPending,
    isError: edge.isError,
    what: 'your notifications',
    items: edge.items,
  });
};

// THE DECLARATION — immutable module-scope spec with its slots inline (no registry to
// disagree with; "declared but not registered" is unconstructable).
const NOTIFICATIONS_PAGE_BODY: PageListBodySpec<NotificationFeedItem> = {
  kind: 'list',
  scene: 'notifications',
  row: {
    Component: NotificationRow,
    keyOf: (item) => item.userNotificationId,
  },
  placeholder: { count: 8 },
  Empty: NotificationsEmpty,
};

export const NotificationsPanelBody = React.memo((_props: MountedSceneBodyProps) => {
  useOriginSceneScrollPublication('notifications');
  return <PageBodyShell spec={NOTIFICATIONS_PAGE_BODY} state={useNotificationsPageBody()} />;
});
NotificationsPanelBody.displayName = 'NotificationsPanelBody';

const styles = StyleSheet.create({
  stateBody: {
    paddingBottom: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 16,
  },
  stateText: {
    color: '#0f172a',
    textAlign: 'center',
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
