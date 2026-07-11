import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X as LucideX } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Text } from '../../components';
import {
  messagingService,
  type Conversation,
  type DmMessage,
  type SharePackagePreview,
} from '../../services/messaging';
import { usersService } from '../../services/users';
import { overlaySheetStyles } from '../overlaySheetStyles';
import { resolveExpandedTop } from '../sheetUtils';
import { getSearchStartupGeometrySeed } from '../../screens/Search/runtime/shared/search-startup-geometry';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useAppOverlayRouteController } from '../useAppOverlayRouteController';
import { useEntityRefActionExecutor } from '../../navigation/runtime/use-entity-ref-action-executor';
import type { EntityRefType } from '../../navigation/runtime/entity-ref-action-policy';
import type { MountedSceneBodyProps } from '../BottomSheetSceneStackMountedBodyRegistry';
import type { OverlayRouteParamsMap } from '../../navigation/runtime/app-overlay-route-types';

// ─── W3 messaging scenes (plans/w3-messaging-design.md §4) ───────────────────────────────────
// messagesInbox: child SINGLETON (no params); MVCP disabled on its transport (re-sorting list).
// dmSession: ENTRY-KEYED child per conversation — params flow FROM THE ENTRY (C2 contract);
// STATIC body (owns its layout): thread ScrollView flex:1 above a composer bar pinned to the
// sheet's visible bottom edge that rides above the keyboard (PollDetail chin geometry).
// Crude-real per the design's M2 slice: mapped rows in the sheet scroll surface (launch-scale
// threads), 15s/5s polling via React Query intervals — M3 replaces the timers with
// useConversationSync, same cache keys.

const INBOX_QUERY_KEY = ['dm', 'inbox'] as const;
const REQUESTS_QUERY_KEY = ['dm', 'requests'] as const;
const messagesQueryKey = (conversationId: string) => ['dm', 'messages', conversationId] as const;
const conversationQueryKey = (conversationId: string) =>
  ['dm', 'conversation', conversationId] as const;

const peerTitle = (conversation: Conversation): string =>
  conversation.otherUser.displayName?.trim() ||
  conversation.otherUser.username?.trim() ||
  'Crave member';

const relativeTime = (iso: string): string => {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const previewText = (message: DmMessage | null): string => {
  if (!message) return 'Say hi';
  if (message.kind === 'text') return message.body ?? '';
  const shared = message.sharedEntity;
  if (shared == null || shared.unavailable) return 'Shared something';
  return `Shared: ${shared.title}`;
};

const PeerAvatar = ({ conversation }: { conversation: Conversation }) => {
  if (conversation.otherUser.avatarUrl) {
    return <Image source={{ uri: conversation.otherUser.avatarUrl }} style={styles.avatarImage} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text variant="body" weight="semibold" style={styles.avatarInitial}>
        {peerTitle(conversation).slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
};

// ─── messagesInbox body ──────────────────────────────────────────────────────────────────────

const ConversationRow = ({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`Conversation with ${peerTitle(conversation)}`}
    testID={`dm-inbox-row-${conversation.conversationId}`}
    style={styles.inboxRow}
  >
    <PeerAvatar conversation={conversation} />
    <View style={styles.inboxRowText}>
      <Text variant="body" weight="semibold" numberOfLines={1} style={styles.inboxRowTitle}>
        {peerTitle(conversation)}
      </Text>
      <Text variant="caption" numberOfLines={1} style={styles.inboxRowPreview}>
        {previewText(conversation.lastMessage)}
      </Text>
    </View>
    <View style={styles.inboxRowMeta}>
      <Text variant="caption" style={styles.inboxRowTime}>
        {relativeTime(conversation.lastMessageAt)}
      </Text>
      {conversation.unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
    </View>
  </Pressable>
);

export const MessagesInboxPanelBody = React.memo((_props: MountedSceneBodyProps) => {
  const { pushRoute } = useAppOverlayRouteController();
  // §3.1 cadence: 15s inbox poll while on screen; refetchOnMount 'always' is the
  // on-focus refetch until M3's useConversationSync owns the timer.
  const inboxQuery = useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: () => messagingService.listConversations('inbox'),
    refetchInterval: 15_000,
    refetchOnMount: 'always',
  });
  const requestsQuery = useQuery({
    queryKey: REQUESTS_QUERY_KEY,
    queryFn: () => messagingService.listConversations('requests'),
    refetchInterval: 15_000,
    refetchOnMount: 'always',
  });

  const openConversation = React.useCallback(
    (conversation: Conversation) => {
      pushRoute('dmSession', {
        conversationId: conversation.conversationId,
        peerName: peerTitle(conversation),
      });
    },
    [pushRoute]
  );

  if (inboxQuery.isPending) {
    return (
      <View style={styles.stateBody} testID="dm-inbox-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (inboxQuery.isError || inboxQuery.data == null) {
    return (
      <View style={styles.stateBody} testID="dm-inbox-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t load your messages.
        </Text>
        <Pressable
          onPress={() => void inboxQuery.refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading messages"
          testID="dm-inbox-retry"
          style={styles.retryButton}
        >
          <Text variant="body" weight="semibold" style={styles.retryText}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const conversations = inboxQuery.data.conversations;
  const requests = requestsQuery.data?.conversations ?? [];

  return (
    <View style={styles.body} testID="dm-inbox-body">
      {requests.length > 0 ? (
        <>
          <Text variant="caption" weight="semibold" style={styles.sectionLabel}>
            Requests ({requests.length})
          </Text>
          {requests.map((conversation) => (
            <ConversationRow
              key={conversation.conversationId}
              conversation={conversation}
              onPress={() => openConversation(conversation)}
            />
          ))}
          <Text variant="caption" weight="semibold" style={styles.sectionLabel}>
            Messages
          </Text>
        </>
      ) : null}
      {conversations.length === 0 && requests.length === 0 ? (
        <View style={styles.stateBody} testID="dm-inbox-empty">
          <Text variant="body" style={styles.stateText}>
            No messages yet. Say hi from someone’s profile.
          </Text>
        </View>
      ) : (
        conversations.map((conversation) => (
          <ConversationRow
            key={conversation.conversationId}
            conversation={conversation}
            onPress={() => openConversation(conversation)}
          />
        ))
      )}
    </View>
  );
});
MessagesInboxPanelBody.displayName = 'MessagesInboxPanelBody';

// ─── dmSession body ──────────────────────────────────────────────────────────────────────────

type OptimisticState = 'sending' | 'failed';

type OptimisticMessage = {
  clientDedupeId: string;
  body: string;
  state: OptimisticState;
};

const SHARED_KIND_TO_ENTITY_REF_TYPE: Partial<Record<string, EntityRefType>> = {
  list: 'list',
  restaurant: 'restaurant',
  dish: 'food',
  user_profile: 'person',
};

const SharedEntityCard = ({ shared }: { shared: SharePackagePreview }) => {
  const executeEntityRef = useEntityRefActionExecutor();
  const { pushRoute } = useAppOverlayRouteController();
  if (shared.unavailable) {
    return (
      <View style={[styles.sharedCard, styles.sharedCardUnavailable]}>
        <Text variant="caption" style={styles.sharedCardSubtitle}>
          No longer available
        </Text>
      </View>
    );
  }
  const refType = SHARED_KIND_TO_ENTITY_REF_TYPE[shared.kind];
  const onPress =
    shared.kind === 'poll'
      ? () => pushRoute('pollDetail', { pollId: shared.id })
      : shared.kind === 'comment' && shared.pollId != null
        ? // Registry §8.2: a shared comment is a DESTINATION — the resolver
          // ships the parent pollId; anchor the thread on the comment.
          () =>
            pushRoute('pollDetail', {
              pollId: shared.pollId as string,
              commentAnchorId: shared.id,
            })
        : refType != null
          ? () =>
              executeEntityRef({ entityId: shared.id, entityType: refType, label: shared.title })
          : null;
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={onPress == null}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Shared ${shared.kind}: ${shared.title}`}
      style={styles.sharedCard}
    >
      <Text variant="body" weight="semibold" numberOfLines={2} style={styles.sharedCardTitle}>
        {shared.title}
      </Text>
      {shared.subtitle ? (
        <Text variant="caption" numberOfLines={1} style={styles.sharedCardSubtitle}>
          {shared.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
};

const MessageBubble = ({ message, mine }: { message: DmMessage; mine: boolean }) => (
  <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      {message.sharedEntity ? <SharedEntityCard shared={message.sharedEntity} /> : null}
      {message.body ? (
        <Text variant="body" style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>
          {message.body}
        </Text>
      ) : null}
    </View>
  </View>
);

// W1 slice 1 (C2): the ENTRY arrives as a prop from the entry-keyed mount unit — with two
// live dmSession entries (profile → DM → shared profile → DM) a topmost-per-key read would
// render the wrong conversation.
export const DmSessionPanelBody = React.memo(({ entry }: MountedSceneBodyProps) => {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params =
    entry?.key === 'dmSession' ? (entry.params as OverlayRouteParamsMap['dmSession']) : null;
  const conversationId = typeof params?.conversationId === 'string' ? params.conversationId : null;

  const conversationQuery = useQuery({
    queryKey: conversationQueryKey(conversationId ?? 'missing'),
    enabled: conversationId != null,
    queryFn: () => messagingService.getConversation(conversationId as string),
    refetchInterval: 15_000,
  });
  // §3.1 cadence: 5s while the session is open. Crude-real: full-window refetch on the same
  // cache key (launch-scale threads); M3's useConversationSync swaps in `after` deltas.
  const messagesQuery = useQuery({
    queryKey: messagesQueryKey(conversationId ?? 'missing'),
    enabled: conversationId != null,
    queryFn: () => messagingService.listMessages(conversationId as string),
    refetchInterval: 5_000,
    refetchOnMount: 'always',
  });

  const conversation = conversationQuery.data ?? null;
  // History arrives newest-first; the thread renders oldest → newest (chat order).
  const messages = React.useMemo(
    () => [...(messagesQuery.data?.messages ?? [])].reverse(),
    [messagesQuery.data]
  );

  // Read cursor: advance to the newest message whenever the thread is on screen with new
  // content (open + poll ticks). Server clamps backward moves; badge queries refresh after.
  const newestCreatedAt = messages.length > 0 ? messages[messages.length - 1].createdAt : null;
  const lastAdvancedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (conversationId == null || newestCreatedAt == null) return;
    if (lastAdvancedRef.current === newestCreatedAt) return;
    lastAdvancedRef.current = newestCreatedAt;
    void messagingService
      .advanceReadCursor(conversationId, newestCreatedAt)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ['dm', 'unread-count'] });
      })
      .catch(() => {
        lastAdvancedRef.current = null; // retry on the next tick — no silent loss.
      });
  }, [conversationId, newestCreatedAt, queryClient]);

  // Optimistic sends with per-row failed state + tap-to-retry (no silent retry loops).
  const [optimistic, setOptimistic] = React.useState<OptimisticMessage[]>([]);
  const [draft, setDraft] = React.useState('');
  const confirmedDedupeIds = React.useMemo(
    () => new Set(messages.map((m) => m.clientDedupeId).filter((id): id is string => id != null)),
    [messages]
  );
  const pendingRows = optimistic.filter((o) => !confirmedDedupeIds.has(o.clientDedupeId));

  const dispatchSend = React.useCallback(
    (row: OptimisticMessage) => {
      if (conversationId == null) return;
      void messagingService
        .sendText(conversationId, row.body, row.clientDedupeId)
        .then(() => {
          // Prune the confirmed optimistic row NOW: the dedupe-id filter only
          // hides it while the confirmed message is inside the fetched window
          // (last 30) — once >30 newer messages exist, a stale optimistic row
          // would resurrect as a phantom 'Sending…'.
          setOptimistic((rows) => rows.filter((r) => r.clientDedupeId !== row.clientDedupeId));
          void queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
          void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
        })
        .catch(() => {
          setOptimistic((rows) =>
            rows.map((r) =>
              r.clientDedupeId === row.clientDedupeId ? { ...r, state: 'failed' } : r
            )
          );
        });
    },
    [conversationId, queryClient]
  );

  const handleSend = React.useCallback(() => {
    const body = draft.trim();
    if (body.length === 0 || conversationId == null) return;
    const row: OptimisticMessage = {
      clientDedupeId: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      body,
      state: 'sending',
    };
    setDraft('');
    setOptimistic((rows) => [...rows, row]);
    dispatchSend(row);
  }, [conversationId, dispatchSend, draft]);

  const handleRetry = React.useCallback(
    (clientDedupeId: string) => {
      setOptimistic((rows) =>
        rows.map((r) => (r.clientDedupeId === clientDedupeId ? { ...r, state: 'sending' } : r))
      );
      const row = optimistic.find((r) => r.clientDedupeId === clientDedupeId);
      if (row) dispatchSend({ ...row, state: 'sending' });
    },
    [dispatchSend, optimistic]
  );

  const handleAccept = React.useCallback(() => {
    if (conversationId == null) return;
    void messagingService.acceptRequest(conversationId).then((updated) => {
      queryClient.setQueryData(conversationQueryKey(conversationId), updated);
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: REQUESTS_QUERY_KEY });
    });
  }, [conversationId, queryClient]);

  const handleBlock = React.useCallback(() => {
    const peerId = conversation?.otherUser.userId;
    if (peerId == null || conversationId == null) return;
    void usersService.blockUser(peerId).then(() => {
      // frozen is server-derived — refetch, don't fake it locally.
      void queryClient.invalidateQueries({ queryKey: conversationQueryKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: REQUESTS_QUERY_KEY });
    });
  }, [conversation, conversationId, queryClient]);

  // W4 composer geometry (the PollDetail chin on the STATIC body path): the body frame
  // fills the full sheet height but the sheet is translated DOWN by the expanded snap
  // offset, so the frame bottom sits `expandedTop` BELOW the visible screen bottom. The
  // body is a flex column (thread ScrollView flex:1, composer row last) whose base
  // paddingBottom = expandedTop + insets.bottom pins the composer just above the home
  // indicator; the keyboard adds max(0, height − insets.bottom) so the composer rides
  // flush on top of the keyboard (useAnimatedKeyboard measures from the screen bottom)
  // and the thread shrinks above it instead of being covered.
  const expandedTop = resolveExpandedTop(getSearchStartupGeometrySeed().searchBarTop, insets.top);
  const keyboard = useAnimatedKeyboard();
  const bodyBasePaddingBottom = expandedTop + Math.max(insets.bottom, 12);
  const bodyAnimatedStyle = useAnimatedStyle(() => ({
    paddingBottom: bodyBasePaddingBottom + Math.max(0, keyboard.height.value - insets.bottom),
  }));
  const threadScrollRef = React.useRef<ScrollView>(null);

  if (conversationId == null) {
    return (
      <View style={styles.stateBody} testID="dm-session-missing">
        <Text variant="body" style={styles.stateText}>
          This conversation is unavailable.
        </Text>
      </View>
    );
  }

  if (messagesQuery.isPending || conversationQuery.isPending) {
    return (
      <View style={styles.stateBody} testID="dm-session-loading">
        <ActivityIndicator />
      </View>
    );
  }

  if (messagesQuery.isError || conversation == null) {
    return (
      <View style={styles.stateBody} testID="dm-session-failed">
        <Text variant="body" style={styles.stateText}>
          We couldn’t load this conversation.
        </Text>
        <Pressable
          onPress={() => {
            void messagesQuery.refetch();
            void conversationQuery.refetch();
          }}
          accessibilityRole="button"
          accessibilityLabel="Retry loading conversation"
          testID="dm-session-retry"
          style={styles.retryButton}
        >
          <Text variant="body" weight="semibold" style={styles.retryText}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const otherUserId = conversation.otherUser.userId;

  return (
    <Reanimated.View style={[styles.sessionBody, bodyAnimatedStyle]} testID="dm-session-body">
      {/* Crude v1: peer identity rides the body top (the persistent header stays static —
          per-entry header text lands with the shared dynamic-header pass). */}
      <Text variant="caption" weight="semibold" style={styles.peerLabel} numberOfLines={1}>
        {peerTitle(conversation)}
      </Text>
      <ScrollView
        ref={threadScrollRef}
        style={styles.threadScroll}
        contentContainerStyle={styles.threadContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={() =>
          // Chat anchoring: open at (and follow) the newest message.
          threadScrollRef.current?.scrollToEnd({ animated: false })
        }
        testID="dm-session-thread"
      >
        {messagesQuery.data?.nextCursor ? (
          <Pressable
            onPress={() =>
              // Crude-real history paging: M3's sync hook owns proper cursor merge; v1 keeps
              // the whole window in one fetch and this affordance is honest about it.
              void messagesQuery.refetch()
            }
            style={styles.loadOlder}
            accessibilityRole="button"
            accessibilityLabel="Load older messages"
          >
            <Text variant="caption" style={styles.loadOlderText}>
              Older messages exist — history paging lands with the sync hook
            </Text>
          </Pressable>
        ) : null}
        {messages.length === 0 && pendingRows.length === 0 ? (
          <View style={styles.stateBody} testID="dm-session-empty">
            <Text variant="body" style={styles.stateText}>
              Start the conversation.
            </Text>
          </View>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.messageId}
              message={message}
              mine={message.senderUserId !== otherUserId}
            />
          ))
        )}
        {pendingRows.map((row) => (
          <View key={row.clientDedupeId} style={[styles.bubbleRow, styles.bubbleRowMine]}>
            <Pressable
              onPress={row.state === 'failed' ? () => handleRetry(row.clientDedupeId) : undefined}
              disabled={row.state !== 'failed'}
              style={[
                styles.bubble,
                styles.bubbleMine,
                row.state === 'failed' && styles.bubbleFailed,
              ]}
              accessibilityRole={row.state === 'failed' ? 'button' : undefined}
              accessibilityLabel={row.state === 'failed' ? 'Retry sending message' : undefined}
            >
              <Text variant="body" style={styles.bubbleTextMine}>
                {row.body}
              </Text>
              <Text variant="caption" style={styles.bubbleStatusText}>
                {row.state === 'failed' ? 'Failed — tap to retry' : 'Sending…'}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {conversation.isRequest && !conversation.frozen ? (
        <View style={styles.requestBar} testID="dm-session-request-bar">
          <Text variant="caption" style={styles.requestBarText}>
            {peerTitle(conversation)} wants to message you
          </Text>
          <View style={styles.requestBarActions}>
            <Pressable
              onPress={handleAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept message request"
              testID="dm-session-accept"
              style={styles.acceptButton}
            >
              <Text variant="body" weight="semibold" style={styles.acceptButtonText}>
                Accept
              </Text>
            </Pressable>
            <Pressable
              onPress={handleBlock}
              accessibilityRole="button"
              accessibilityLabel="Block user"
              testID="dm-session-block"
              style={styles.blockButton}
            >
              <Text variant="body" weight="semibold" style={styles.blockButtonText}>
                Block
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {conversation.frozen ? (
        // §1.4 honest frozen state: composer REPLACED by the static notice — no silent drop.
        <View style={styles.frozenRow} testID="dm-session-frozen">
          <Text variant="body" style={styles.frozenText}>
            You can’t reply to this conversation
          </Text>
        </View>
      ) : (
        <View style={styles.composerRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor="#94a3b8"
            multiline
            style={styles.composerInput}
            testID="dm-session-input"
          />
          <Pressable
            onPress={handleSend}
            disabled={draft.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            testID="dm-session-send"
            style={[styles.sendButton, draft.trim().length === 0 && styles.sendButtonDisabled]}
          >
            <Text variant="body" weight="semibold" style={styles.sendButtonText}>
              Send
            </Text>
          </Pressable>
        </View>
      )}
    </Reanimated.View>
  );
});
DmSessionPanelBody.displayName = 'DmSessionPanelBody';

// ─── Persistent headers ──────────────────────────────────────────────────────────────────────

const MessagesInboxHeaderTitle = React.memo(() => (
  <View style={styles.headerTextGroup}>
    <Text variant="title" weight="semibold" style={styles.headerTitle} numberOfLines={1}>
      Messages
    </Text>
  </View>
));
MessagesInboxHeaderTitle.displayName = 'MessagesInboxHeaderTitle';

// dmSession persistent header stays STATIC (house synchronous-first-frame contract; the
// C2 entry-keyed rule keeps per-entry reads out of shared chrome) — the peer name renders
// at the body top instead. Per-entry header text = a later shared dynamic-header pass.
const DmSessionHeaderTitle = React.memo(() => (
  <View style={styles.headerTextGroup}>
    <Text variant="title" weight="semibold" style={styles.headerTitle} numberOfLines={1}>
      Chat
    </Text>
  </View>
));
DmSessionHeaderTitle.displayName = 'DmSessionHeaderTitle';

const createCloseHeaderAction = (label: string): React.ComponentType => {
  const CloseHeaderAction = React.memo(() => {
    const { closeActiveRoute } = useAppOverlayRouteController();
    return (
      <Pressable
        onPress={closeActiveRoute}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={overlaySheetStyles.closeButton}
        hitSlop={8}
      >
        <View style={overlaySheetStyles.closeIcon} pointerEvents="none">
          <LucideX size={20} color="#000000" strokeWidth={2.5} />
        </View>
      </Pressable>
    );
  });
  CloseHeaderAction.displayName = `CloseHeaderAction(${label})`;
  return CloseHeaderAction;
};

registerPersistentHeaderDescriptor('messagesInbox', {
  Title: MessagesInboxHeaderTitle,
  Action: createCloseHeaderAction('Close messages'),
});
registerPersistentHeaderDescriptor('dmSession', {
  Title: DmSessionHeaderTitle,
  Action: createCloseHeaderAction('Close conversation'),
});

const styles = StyleSheet.create({
  peerLabel: {
    color: '#64748b',
    marginBottom: 8,
  },
  body: {
    paddingVertical: 16,
  },
  // dmSession static body: flex column filling the frame — thread scrolls,
  // composer pinned at the (visible) bottom; keyboard padding rides on top.
  sessionBody: {
    flex: 1,
    paddingTop: 16,
  },
  threadScroll: {
    flex: 1,
  },
  threadContent: {
    paddingBottom: 12,
  },
  stateBody: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  stateText: {
    color: '#64748b',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  retryText: {
    color: '#0f172a',
  },
  sectionLabel: {
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 4,
  },
  inboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  inboxRowText: {
    flex: 1,
  },
  inboxRowTitle: {
    color: '#0f172a',
  },
  inboxRowPreview: {
    color: '#64748b',
    marginTop: 2,
  },
  inboxRowMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  inboxRowTime: {
    color: '#94a3b8',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563eb',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#475569',
  },
  loadOlder: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadOlderText: {
    color: '#94a3b8',
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 3,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: {
    backgroundColor: '#2563eb',
  },
  bubbleTheirs: {
    backgroundColor: '#f1f5f9',
  },
  bubbleFailed: {
    backgroundColor: '#dc2626',
  },
  bubbleTextMine: {
    color: '#ffffff',
  },
  bubbleTextTheirs: {
    color: '#0f172a',
  },
  bubbleStatusText: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  sharedCard: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
    minWidth: 160,
  },
  sharedCardUnavailable: {
    backgroundColor: '#f8fafc',
  },
  sharedCardTitle: {
    color: '#0f172a',
  },
  sharedCardSubtitle: {
    color: '#64748b',
    marginTop: 2,
  },
  requestBar: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  requestBarText: {
    color: '#475569',
  },
  requestBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0f172a',
  },
  acceptButtonText: {
    color: '#ffffff',
  },
  blockButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  blockButtonText: {
    color: '#dc2626',
  },
  frozenRow: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  frozenText: {
    color: '#64748b',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  sendButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  sendButtonText: {
    color: '#ffffff',
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#0f172a',
  },
});
