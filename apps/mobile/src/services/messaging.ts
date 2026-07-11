import api from './api';

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
  async unreadCount(): Promise<{ total: number }> {
    const response = await api.get<{ total: number }>('/messaging/unread-count');
    return response.data;
  },
};
