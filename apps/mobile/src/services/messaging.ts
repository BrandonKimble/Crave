import api, { SILENT } from './api';
import { requestPushPermissionIfEligible } from './push-permission';

// ─── W3 messaging client (plans/w3-messaging-design.md §3.2) ─────────────────────────────────
// isRequest / frozen / unreadCount are SERVER-derived flags shipped on the DTO —
// the client never re-derives them (the resolveIsDockedLane lesson).

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
      /** list kind only: 'curated' ⇒ app-curated — tap runs the curated
       *  fetch seam; absent ⇒ a user list. */
      listSource?: 'curated';
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

// F831 (2026-08-03): THE POLLED READS SPEAK SILENTLY. MessagingPanels refetches these three
// on 15s/15s/5s intervals; before this, every >=500 from a tick re-raised the app-wide
// "Service temporarily unavailable" banner — which the health probe then cleared, which the
// next tick repainted, forever, over unrelated screens. A timer-issued request has no user
// waiting on it and must never speak for the whole app (see USER_INITIATED / SILENT in
// services/api.ts). The panels render their own empty/failed state for these.
export const messagingService = {
  async listConversations(
    filter: 'inbox' | 'requests' = 'inbox'
  ): Promise<{ conversations: Conversation[]; nextCursor: string | null }> {
    const response = await api.get<{ conversations: Conversation[]; nextCursor: string | null }>(
      '/messaging/conversations',
      { ...SILENT, params: { filter } }
    );
    return response.data;
  },
  /** Idempotent get-or-create by peer (server pairKey contract). */
  async getOrCreateConversation(otherUserId: string): Promise<Conversation> {
    const response = await api.post<Conversation>('/messaging/conversations', { otherUserId });
    return response.data;
  },
  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await api.get<Conversation>(
      `/messaging/conversations/${conversationId}`,
      SILENT
    );
    return response.data;
  },
  /**
   * The thread's first page. THE POLL IS A FULL REFETCH, and the signature now says so.
   *
   * F833 (2026-08-03): this accepted `{ cursor?, after? }` and the ONE caller
   * (MessagingPanels' 5s thread poll) passed neither — so both were dead, and worse, `after`
   * ADVERTISED an incremental-poll capability this client structurally cannot use. The
   * server's contract (messaging.dto.ts) is a TUPLE — "partner for `after` … senders should
   * pass both" `after` + `afterMessageId`, so same-millisecond messages get a total order —
   * and mobile's signature had no `afterMessageId` at all. A sender passing `after` alone
   * would silently lose or duplicate messages that share a timestamp.
   *
   * The options are DELETED rather than half-wired: the surface should not imply a
   * capability. Wiring the real delta poll means passing the tuple and merging pages, which
   * is a feature (the plan calls it `useConversationSync`), not a parameter.
   */
  async listMessages(
    conversationId: string
  ): Promise<{ messages: DmMessage[]; nextCursor: string | null }> {
    const response = await api.get<{ messages: DmMessage[]; nextCursor: string | null }>(
      `/messaging/conversations/${conversationId}/messages`,
      SILENT
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
    /**
     * THE CAPABILITY, when the shared thing needs one (F834, 2026-08-03).
     *
     * `ShareFanOutDto.sharedEntitySlug` has always been accepted and PERSISTED by the
     * server (messaging.service.ts writes it onto the message row), and the "slug is the
     * capability" law (commit b34cdbe8d) makes it the thing that grants a recipient
     * access. Mobile's payload type OMITTED it and the share modal could not supply one —
     * so DMing a PRIVATE list sent a preview whose tap carried NO capability, and under
     * that law the recipient's read must fail. A hole in a just-landed law, on the client
     * side of it.
     *
     * Required in practice for a private list; the modal resolves it (minting one via
     * `enableShare` if the owner consents) before fanning out.
     */
    sharedEntitySlug?: string;
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
