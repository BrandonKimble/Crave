import api from './api';
import { requestPushPermissionIfEligible } from './push-permission';

// ─── W3 messaging client (plans/w3-messaging-design.md §3.2) ─────────────────────────────────
// isRequest / frozen / unreadCount are SERVER-derived flags shipped on the DTO —
// the client never re-derives them (the resolveIsPersistentPollLane lesson).

export type SharedEntityKind = 'list' | 'restaurant' | 'dish' | 'poll' | 'comment' | 'user_profile';

export type SharePackagePreview =
  | { unavailable: true; kind: SharedEntityKind; id: string }
  | {
      unavailable: false;
      kind: SharedEntityKind;
      id: string;
      title: string;
      subtitle: string | null;
      imageUrl: string | null;
      /** comment kind only: the parent poll — tap destination is
       *  pollDetail{pollId, commentAnchorId: id}. */
      pollId?: string;
      /** list kind only: the list's side — present ⇒ the tap runs the full
       *  list WORLD (favorites-as-search). */
      listType?: 'restaurant' | 'dish';
    };

export interface DmMessage {
  messageId: string;
  senderUserId: string;
  kind: 'text' | 'entity_share';
  body: string | null;
  sharedEntity: SharePackagePreview | null;
  createdAt: string;
  clientDedupeId: string | null;
}

export interface ConversationPeer {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Conversation {
  conversationId: string;
  otherUser: ConversationPeer;
  lastMessage: DmMessage | null;
  lastMessageAt: string;
  unreadCount: number;
  isRequest: boolean;
  frozen: boolean;
}

export interface ShareFanOutResult {
  recipientUserId: string;
  conversationId: string | null;
  messageId: string | null;
  error: 'CONVERSATION_FROZEN' | 'NOT_FOUND' | 'FAILED' | null;
}

export const messagingService = {
  async listConversations(
    filter: 'inbox' | 'requests' = 'inbox'
  ): Promise<{ conversations: Conversation[]; nextCursor: string | null }> {
    const response = await api.get<{ conversations: Conversation[]; nextCursor: string | null }>(
      '/messaging/conversations',
      { params: { filter } }
    );
    return response.data;
  },
  /** Idempotent get-or-create by peer (server pairKey contract). */
  async getOrCreateConversation(otherUserId: string): Promise<Conversation> {
    const response = await api.post<Conversation>('/messaging/conversations', { otherUserId });
    return response.data;
  },
  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await api.get<Conversation>(`/messaging/conversations/${conversationId}`);
    return response.data;
  },
  async listMessages(
    conversationId: string,
    options: { cursor?: string; after?: string } = {}
  ): Promise<{ messages: DmMessage[]; nextCursor: string | null }> {
    const response = await api.get<{ messages: DmMessage[]; nextCursor: string | null }>(
      `/messaging/conversations/${conversationId}/messages`,
      { params: options }
    );
    return response.data;
  },
  async sendText(conversationId: string, body: string, clientDedupeId: string): Promise<DmMessage> {
    const response = await api.post<DmMessage>(
      `/messaging/conversations/${conversationId}/messages`,
      { kind: 'text', body, clientDedupeId }
    );
    // §8.9 push-permission moment: first contribution (a DM sent) — hooked at
    // the service seam so the panel send path stays untouched.
    requestPushPermissionIfEligible();
    return response.data;
  },
  async advanceReadCursor(conversationId: string, lastReadMessageAt: string): Promise<void> {
    await api.put(`/messaging/conversations/${conversationId}/read`, { lastReadMessageAt });
  },
  async acceptRequest(conversationId: string): Promise<Conversation> {
    const response = await api.post<Conversation>(
      `/messaging/conversations/${conversationId}/accept`
    );
    return response.data;
  },
  /** Ranked "Send to" candidates for the universal share modal (closeness order). */
  async shareTargets(): Promise<{ targets: ConversationPeer[] }> {
    const response = await api.get<{ targets: ConversationPeer[] }>('/messaging/share-targets');
    return response.data;
  },
  /** Share-modal fan-out: get-or-create each conversation + send in one call.
   *  Per-recipient errors come back honestly instead of failing the batch. */
  async shareFanOut(payload: {
    recipientUserIds: string[];
    sharedEntityKind: SharedEntityKind;
    sharedEntityId: string;
    body?: string;
    /** Per-modal-open uuid: the server derives `share:{clientShareId}` as each
     *  message's dedupe id, so a retry after a transport error replays instead
     *  of double-sending to recipients that already succeeded. */
    clientShareId?: string;
  }): Promise<{ results: ShareFanOutResult[] }> {
    const response = await api.post<{ results: ShareFanOutResult[] }>('/messaging/share', payload);
    return response.data;
  },
  async unreadCount(): Promise<{ total: number }> {
    const response = await api.get<{ total: number }>('/messaging/unread-count');
    return response.data;
  },
};
