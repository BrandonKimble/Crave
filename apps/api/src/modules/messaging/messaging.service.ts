import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Conversation,
  ConversationParticipant,
  Message,
  MessageKind,
  Prisma,
  SharedEntityKind,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClosenessService } from '../identity/closeness.service';
import { UserBlockService } from '../identity/user-block.service';
import { SharePackageResolverService } from './share-package-resolver.service';
import {
  ConversationDto,
  ConversationPeerDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  MessageDto,
  SendMessageDto,
  ShareFanOutDto,
} from './dto/messaging.dto';

const DEFAULT_CONVERSATION_PAGE = 20;
const DEFAULT_MESSAGE_PAGE = 30;
const UNREAD_DISPLAY_CAP = 100;
const SHARE_TARGETS_CAP = 50;

type ParticipantWithUser = ConversationParticipant & {
  user: {
    userId: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

type ConversationWithParticipants = Conversation & {
  participants: ParticipantWithUser[];
};

/**
 * W3 messaging core (plans/w3-messaging-design.md).
 *
 * Single authorities (the resolveIsPersistentPollLane lesson — one function,
 * never re-derived by consumers):
 * - pairKey: `pairKeyFor` is THE 1:1 uniqueness contract.
 * - isRequest: `isRequestFor` (§1.1 rule).
 * - frozen: derived EXISTS over user_blocks at read time — no isFrozen column
 *   to drift (delete-not-guard).
 * - unread: derived from the participant read cursor (§2.4) — no counter.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: UserBlockService,
    private readonly sharePackages: SharePackageResolverService,
    private readonly closeness: ClosenessService,
  ) {}

  /** THE canonical pair key (design §2.1): uuid-string order, colon-joined. */
  static pairKeyFor(userIdA: string, userIdB: string): string {
    return userIdA < userIdB
      ? `${userIdA}:${userIdB}`
      : `${userIdB}:${userIdA}`;
  }

  /** §1.1: request ⇔ never replied AND not following AND not accepted. */
  private isRequestFor(
    viewerParticipant: ConversationParticipant,
    viewerHasSentMessage: boolean,
    viewerFollowsOther: boolean,
  ): boolean {
    return (
      viewerParticipant.acceptedAt == null &&
      !viewerHasSentMessage &&
      !viewerFollowsOther
    );
  }

  private frozenError(): ForbiddenException {
    return new ForbiddenException({
      code: 'CONVERSATION_FROZEN',
      message: "You can't reply to this conversation",
    });
  }

  // ---------------------------------------------------------------- create

  async getOrCreateConversation(
    viewerUserId: string,
    otherUserId: string,
  ): Promise<ConversationDto> {
    if (viewerUserId === otherUserId) {
      throw new BadRequestException('Cannot message yourself');
    }
    const pairKey = MessagingService.pairKeyFor(viewerUserId, otherUserId);

    const existing = await this.prisma.conversation.findUnique({
      where: { pairKey },
      include: { participants: { include: { user: this.peerSelect() } } },
    });
    if (existing) {
      return (await this.decorateConversations(viewerUserId, [existing]))[0];
    }

    // Starting a NEW conversation with a blocked pair fails with the same
    // typed error as a frozen send (§1.4).
    if (await this.blocks.isBlockedPair(viewerUserId, otherUserId)) {
      throw this.frozenError();
    }

    const other = await this.prisma.user.findUnique({
      where: { userId: otherUserId },
      select: { userId: true, deletedAt: true },
    });
    if (!other || other.deletedAt) {
      throw new NotFoundException('User not found');
    }

    try {
      const created = await this.prisma.conversation.create({
        data: {
          pairKey,
          // No messages yet: the conversation sorts by its creation moment.
          lastMessageAt: new Date(),
          participants: {
            create: [{ userId: viewerUserId }, { userId: otherUserId }],
          },
        },
        include: { participants: { include: { user: this.peerSelect() } } },
      });
      return (await this.decorateConversations(viewerUserId, [created]))[0];
    } catch (error) {
      // Concurrent get-or-create: the pairKey unique makes the loser's
      // create a P2002 → idempotent success via the winner's row.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.conversation.findUniqueOrThrow({
          where: { pairKey },
          include: { participants: { include: { user: this.peerSelect() } } },
        });
        return (await this.decorateConversations(viewerUserId, [winner]))[0];
      }
      throw error;
    }
  }

  // ------------------------------------------------------------------ read

  async listConversations(
    viewerUserId: string,
    query: ListConversationsQueryDto,
  ): Promise<{ conversations: ConversationDto[]; nextCursor: string | null }> {
    const limit = query.limit ?? DEFAULT_CONVERSATION_PAGE;
    const filter = query.filter ?? 'inbox';

    const cursorWhere = this.parseConversationCursor(query.cursor);
    const rows = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId: viewerUserId } },
        ...(cursorWhere ?? {}),
      },
      orderBy: [{ lastMessageAt: 'desc' }, { conversationId: 'desc' }],
      take: limit + 1,
      include: { participants: { include: { user: this.peerSelect() } } },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const decorated = await this.decorateConversations(viewerUserId, page);
    // Request-lane split is a FILTER of the same list (§1.1); the cursor
    // walks the underlying list so pagination stays total-ordered.
    const filtered = decorated.filter((c) =>
      filter === 'requests' ? c.isRequest : !c.isRequest,
    );
    const last = page[page.length - 1];
    return {
      conversations: filtered,
      nextCursor:
        hasMore && last
          ? `${last.lastMessageAt.toISOString()}|${last.conversationId}`
          : null,
    };
  }

  async getConversation(
    viewerUserId: string,
    conversationId: string,
  ): Promise<ConversationDto> {
    const row = await this.requireMembership(viewerUserId, conversationId);
    return (await this.decorateConversations(viewerUserId, [row]))[0];
  }

  async listMessages(
    viewerUserId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ): Promise<{ messages: MessageDto[]; nextCursor: string | null }> {
    await this.requireMembership(viewerUserId, conversationId);
    const limit = query.limit ?? DEFAULT_MESSAGE_PAGE;

    if (query.after != null) {
      // Poll mode: everything newer, oldest-first so the client appends.
      const rows = await this.prisma.message.findMany({
        where: { conversationId, createdAt: { gt: new Date(query.after) } },
        orderBy: [{ createdAt: 'asc' }, { messageId: 'asc' }],
        take: limit,
      });
      return {
        messages: await this.toMessageDtos(viewerUserId, rows),
        nextCursor: null,
      };
    }

    // History mode: newest-first pages walking older via the total-ordered
    // (createdAt, messageId) cursor.
    const cursor = this.parseMessageCursor(query.cursor);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  messageId: { lt: cursor.messageId },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { messageId: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      messages: await this.toMessageDtos(viewerUserId, page),
      nextCursor:
        hasMore && last
          ? `${last.createdAt.toISOString()}|${last.messageId}`
          : null,
    };
  }

  async unreadCount(viewerUserId: string): Promise<{ total: number }> {
    // Total badge (§2.4): accepted, non-request, non-frozen conversations
    // with at least one unseen inbound message. Launch scale: the viewer's
    // conversation list is small; derived, no counter to drift.
    const rows = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId: viewerUserId } } },
      include: { participants: { include: { user: this.peerSelect() } } },
    });
    const decorated = await this.decorateConversations(viewerUserId, rows);
    return {
      total: decorated.filter(
        (c) => !c.isRequest && !c.frozen && c.unreadCount > 0,
      ).length,
    };
  }

  // ----------------------------------------------------------------- write

  async sendMessage(
    viewerUserId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageDto> {
    const conversation = await this.requireMembership(
      viewerUserId,
      conversationId,
    );
    const other = conversation.participants.find(
      (p) => p.userId !== viewerUserId,
    );
    if (!other) {
      throw new NotFoundException('Conversation not found');
    }

    // §1.4 frozen = derived EXISTS at the write seam. 403 typed; reads
    // stay open (honest frozen state, no hidden history).
    if (await this.blocks.isBlockedPair(viewerUserId, other.userId)) {
      throw this.frozenError();
    }

    const body = dto.body?.trim() || null;
    // Loud kind-shape contract — mirrors the DB CHECK so the app error is
    // a 400 with a reason, not a raw constraint violation.
    if (dto.kind === MessageKind.text) {
      if (!body) {
        throw new BadRequestException('text message requires a body');
      }
      if (dto.sharedEntityKind != null || dto.sharedEntityId != null) {
        throw new BadRequestException(
          'text message cannot carry a shared entity',
        );
      }
    } else {
      if (dto.sharedEntityKind == null || dto.sharedEntityId == null) {
        throw new BadRequestException(
          'entity_share requires sharedEntityKind and sharedEntityId',
        );
      }
    }

    try {
      const [message] = await this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            conversationId,
            senderUserId: viewerUserId,
            kind: dto.kind,
            body,
            sharedEntityKind:
              dto.kind === MessageKind.entity_share
                ? dto.sharedEntityKind
                : null,
            sharedEntityId:
              dto.kind === MessageKind.entity_share ? dto.sharedEntityId : null,
            clientDedupeId: dto.clientDedupeId ?? null,
          },
        });
        // Single-writer denorm (§2.1): only this tx touches the hot columns.
        await tx.conversation.update({
          where: { conversationId },
          data: {
            lastMessageAt: created.createdAt,
            lastMessageId: created.messageId,
          },
        });
        // Sender has obviously seen the thread through their own send.
        await tx.conversationParticipant.updateMany({
          where: {
            conversationId,
            userId: viewerUserId,
            OR: [
              { lastReadMessageAt: null },
              { lastReadMessageAt: { lt: created.createdAt } },
            ],
          },
          data: { lastReadMessageAt: created.createdAt },
        });
        return [created];
      });
      return (await this.toMessageDtos(viewerUserId, [message]))[0];
    } catch (error) {
      // Dedupe replay: the (conversation, sender, clientDedupeId) unique
      // makes a retried send return the ORIGINAL row, not a duplicate.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        dto.clientDedupeId
      ) {
        const original = await this.prisma.message.findUniqueOrThrow({
          where: {
            conversationId_senderUserId_clientDedupeId: {
              conversationId,
              senderUserId: viewerUserId,
              clientDedupeId: dto.clientDedupeId,
            },
          },
        });
        return (await this.toMessageDtos(viewerUserId, [original]))[0];
      }
      throw error;
    }
  }

  async advanceReadCursor(
    viewerUserId: string,
    conversationId: string,
    lastReadMessageAt: string,
  ): Promise<{ lastReadMessageAt: string }> {
    await this.requireMembership(viewerUserId, conversationId);
    const next = new Date(lastReadMessageAt);
    // Monotonic: backward moves clamp to a no-op (server-side, not client honor).
    await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId: viewerUserId,
        OR: [{ lastReadMessageAt: null }, { lastReadMessageAt: { lt: next } }],
      },
      data: { lastReadMessageAt: next },
    });
    const row = await this.prisma.conversationParticipant.findUniqueOrThrow({
      where: {
        conversationId_userId: { conversationId, userId: viewerUserId },
      },
      select: { lastReadMessageAt: true },
    });
    return {
      lastReadMessageAt: (row.lastReadMessageAt ?? next).toISOString(),
    };
  }

  async acceptRequest(
    viewerUserId: string,
    conversationId: string,
  ): Promise<ConversationDto> {
    await this.requireMembership(viewerUserId, conversationId);
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, userId: viewerUserId, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    return this.getConversation(viewerUserId, conversationId);
  }

  async shareFanOut(
    viewerUserId: string,
    dto: ShareFanOutDto,
  ): Promise<{
    results: {
      recipientUserId: string;
      conversationId: string | null;
      messageId: string | null;
      error: 'CONVERSATION_FROZEN' | 'NOT_FOUND' | null;
    }[];
  }> {
    const results = [] as {
      recipientUserId: string;
      conversationId: string | null;
      messageId: string | null;
      error: 'CONVERSATION_FROZEN' | 'NOT_FOUND' | null;
    }[];
    for (const recipientUserId of new Set(dto.recipientUserIds)) {
      if (recipientUserId === viewerUserId) {
        continue;
      }
      try {
        const conversation = await this.getOrCreateConversation(
          viewerUserId,
          recipientUserId,
        );
        const message = await this.sendMessage(
          viewerUserId,
          conversation.conversationId,
          {
            kind: MessageKind.entity_share,
            sharedEntityKind: dto.sharedEntityKind,
            sharedEntityId: dto.sharedEntityId,
            body: dto.body,
          },
        );
        results.push({
          recipientUserId,
          conversationId: conversation.conversationId,
          messageId: message.messageId,
          error: null,
        });
      } catch (error) {
        // Per-recipient honesty: one frozen pair doesn't fail the fan-out.
        if (error instanceof ForbiddenException) {
          results.push({
            recipientUserId,
            conversationId: null,
            messageId: null,
            error: 'CONVERSATION_FROZEN',
          });
        } else if (error instanceof NotFoundException) {
          results.push({
            recipientUserId,
            conversationId: null,
            messageId: null,
            error: 'NOT_FOUND',
          });
        } else {
          throw error;
        }
      }
    }
    return { results };
  }

  /** W3 universal share modal "Send to" row: the viewer's follow graph
   *  (both directions, deduped), blocked pairs excluded, ranked by
   *  ClosenessService (its stable sort preserves the follow-recency
   *  pre-order wherever closeness has no signal). */
  async shareTargets(
    viewerUserId: string,
  ): Promise<{ targets: ConversationPeerDto[] }> {
    const [outbound, inbound, blockedPeers] = await Promise.all([
      this.prisma.userFollow.findMany({
        where: { followerUserId: viewerUserId },
        select: { followingUserId: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userFollow.findMany({
        where: { followingUserId: viewerUserId },
        select: { followerUserId: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.blocks.blockedPeerIds(viewerUserId),
    ]);

    // Pre-order = follow recency, people I follow first (the fallback where
    // closeness scores tie).
    const ordered: string[] = [];
    const seen = new Set<string>();
    const push = (id: string) => {
      if (!seen.has(id) && !blockedPeers.has(id) && id !== viewerUserId) {
        seen.add(id);
        ordered.push(id);
      }
    };
    for (const f of outbound) push(f.followingUserId);
    for (const f of inbound) push(f.followerUserId);
    if (ordered.length === 0) {
      return { targets: [] };
    }

    const ranked = (
      await this.closeness.rankByCloseness(viewerUserId, ordered)
    ).slice(0, SHARE_TARGETS_CAP);

    const users = await this.prisma.user.findMany({
      where: { userId: { in: ranked }, deletedAt: null },
      ...this.peerSelect(),
    });
    const byId = new Map(users.map((u) => [u.userId, u]));
    return {
      targets: ranked
        .map((id) => byId.get(id))
        .filter((u): u is NonNullable<typeof u> => u != null),
    };
  }

  // -------------------------------------------------------------- internals

  private peerSelect() {
    return {
      select: {
        userId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    } as const;
  }

  private async requireMembership(
    viewerUserId: string,
    conversationId: string,
  ): Promise<ConversationWithParticipants> {
    const row = await this.prisma.conversation.findUnique({
      where: { conversationId },
      include: { participants: { include: { user: this.peerSelect() } } },
    });
    if (!row || !row.participants.some((p) => p.userId === viewerUserId)) {
      // Non-member gets the same 404 as nonexistent — no membership oracle.
      throw new NotFoundException('Conversation not found');
    }
    return row;
  }

  private parseConversationCursor(
    cursor: string | undefined,
  ): Prisma.ConversationWhereInput | null {
    if (!cursor) return null;
    const idx = cursor.lastIndexOf('|');
    if (idx < 0) throw new BadRequestException('Malformed cursor');
    const at = new Date(cursor.slice(0, idx));
    const id = cursor.slice(idx + 1);
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('Malformed cursor');
    }
    return {
      OR: [
        { lastMessageAt: { lt: at } },
        { lastMessageAt: at, conversationId: { lt: id } },
      ],
    };
  }

  private parseMessageCursor(
    cursor: string | undefined,
  ): { createdAt: Date; messageId: string } | null {
    if (!cursor) return null;
    const idx = cursor.lastIndexOf('|');
    if (idx < 0) throw new BadRequestException('Malformed cursor');
    const createdAt = new Date(cursor.slice(0, idx));
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Malformed cursor');
    }
    return { createdAt, messageId: cursor.slice(idx + 1) };
  }

  private async toMessageDtos(
    viewerUserId: string,
    rows: Message[],
  ): Promise<MessageDto[]> {
    return Promise.all(
      rows.map(async (m) => ({
        messageId: m.messageId,
        senderUserId: m.senderUserId,
        kind: m.kind,
        body: m.body,
        sharedEntity:
          m.kind === MessageKind.entity_share &&
          m.sharedEntityKind != null &&
          m.sharedEntityId != null
            ? await this.sharePackages.resolve(
                m.sharedEntityKind,
                m.sharedEntityId,
                viewerUserId,
              )
            : null,
        createdAt: m.createdAt.toISOString(),
        clientDedupeId: m.clientDedupeId,
      })),
    );
  }

  /** Computes the derived DTO flags for a page of conversations in four
   *  batched reads (blocks, follows, viewer-sent, last messages) + one
   *  capped unread count per row. */
  private async decorateConversations(
    viewerUserId: string,
    rows: ConversationWithParticipants[],
  ): Promise<ConversationDto[]> {
    if (rows.length === 0) return [];
    const conversationIds = rows.map((r) => r.conversationId);
    const otherIds = rows
      .map((r) => r.participants.find((p) => p.userId !== viewerUserId)?.userId)
      .filter((id): id is string => id != null);

    const [blockedPeers, follows, viewerSentRows, lastMessages] =
      await Promise.all([
        this.blocks.blockedPeerIds(viewerUserId),
        this.prisma.userFollow.findMany({
          where: {
            followerUserId: viewerUserId,
            followingUserId: { in: otherIds },
          },
          select: { followingUserId: true },
        }),
        this.prisma.message.findMany({
          where: {
            conversationId: { in: conversationIds },
            senderUserId: viewerUserId,
          },
          distinct: ['conversationId'],
          select: { conversationId: true },
        }),
        this.prisma.message.findMany({
          where: {
            messageId: {
              in: rows
                .map((r) => r.lastMessageId)
                .filter((id): id is string => id != null),
            },
          },
        }),
      ]);
    const followsSet = new Set(follows.map((f) => f.followingUserId));
    const viewerSentSet = new Set(viewerSentRows.map((m) => m.conversationId));
    const lastMessageById = new Map(
      lastMessages.map((m) => [m.messageId, m] as const),
    );

    return Promise.all(
      rows.map(async (row) => {
        const viewerParticipant = row.participants.find(
          (p) => p.userId === viewerUserId,
        );
        const otherParticipant = row.participants.find(
          (p) => p.userId !== viewerUserId,
        );
        if (!viewerParticipant || !otherParticipant) {
          throw new NotFoundException('Conversation not found');
        }
        // §2.4 unread derivation: inbound messages newer than the cursor,
        // capped for display.
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: row.conversationId,
            senderUserId: { not: viewerUserId },
            ...(viewerParticipant.lastReadMessageAt
              ? { createdAt: { gt: viewerParticipant.lastReadMessageAt } }
              : {}),
          },
          take: UNREAD_DISPLAY_CAP,
        });
        const lastMessageRow = row.lastMessageId
          ? (lastMessageById.get(row.lastMessageId) ?? null)
          : null;
        return {
          conversationId: row.conversationId,
          otherUser: otherParticipant.user,
          lastMessage: lastMessageRow
            ? (await this.toMessageDtos(viewerUserId, [lastMessageRow]))[0]
            : null,
          lastMessageAt: row.lastMessageAt.toISOString(),
          unreadCount,
          isRequest: this.isRequestFor(
            viewerParticipant,
            viewerSentSet.has(row.conversationId),
            followsSet.has(otherParticipant.userId),
          ),
          frozen: blockedPeers.has(otherParticipant.userId),
        };
      }),
    );
  }
}

export { SharedEntityKind };
