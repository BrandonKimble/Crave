/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MessagingService } from './messaging.service';
import { ClosenessService } from '../identity/closeness.service';
import { UserBlockService } from '../identity/user-block.service';

/**
 * W3 messaging contracts (plans/w3-messaging-design.md §5 M1 gate):
 * pairKey canonical order + concurrent-create idempotency, cursor-unread
 * math, request-lane rule table, frozen send 403, dedupe replay,
 * read-cursor monotonicity, kind-shape validation.
 */

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MSG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });

const peer = (userId: string) => ({
  userId,
  username: 'u',
  displayName: 'U',
  avatarUrl: null,
});

const participant = (userId: string, over: Record<string, unknown> = {}) => ({
  conversationId: CONVO,
  userId,
  lastReadMessageAt: null,
  acceptedAt: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  user: peer(userId),
  ...over,
});

const conversation = (over: Record<string, unknown> = {}) => ({
  conversationId: CONVO,
  pairKey: MessagingService.pairKeyFor(ME, THEM),
  lastMessageAt: new Date('2026-07-02T00:00:00Z'),
  lastMessageId: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  participants: [participant(ME), participant(THEM)],
  ...over,
});

function makePrisma() {
  const prisma: any = {
    conversation: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    conversationParticipant: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    userFollow: { findMany: jest.fn().mockResolvedValue([]) },
    pollCommentLike: { findMany: jest.fn().mockResolvedValue([]) },
    pollComment: { findMany: jest.fn().mockResolvedValue([]) },
    userBlock: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ userId: THEM, deletedAt: null }),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return prisma;
}

function makeService(prisma: any) {
  const blocks = new UserBlockService(prisma);
  const sharePackages = { resolve: jest.fn() } as any;
  const closeness = new ClosenessService(prisma);
  return new MessagingService(prisma, blocks, sharePackages, closeness);
}

const textMessage = (over: Record<string, unknown> = {}) => ({
  messageId: MSG,
  conversationId: CONVO,
  senderUserId: ME,
  kind: 'text',
  body: 'hi',
  sharedEntityKind: null,
  sharedEntityId: null,
  clientDedupeId: null,
  createdAt: new Date('2026-07-02T00:00:00Z'),
  ...over,
});

describe('MessagingService.pairKeyFor (§2.1)', () => {
  it('is order-agnostic and canonical (min:max)', () => {
    expect(MessagingService.pairKeyFor(ME, THEM)).toBe(`${ME}:${THEM}`);
    expect(MessagingService.pairKeyFor(THEM, ME)).toBe(`${ME}:${THEM}`);
  });
});

describe('getOrCreateConversation', () => {
  let prisma: any;
  let service: MessagingService;
  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('rejects self-conversation', async () => {
    await expect(
      service.getOrCreateConversation(ME, ME),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the existing conversation without creating', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(conversation());
    const dto = await service.getOrCreateConversation(ME, THEM);
    expect(dto.conversationId).toBe(CONVO);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('concurrent create: P2002 on pairKey resolves to the winner row', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(null);
    prisma.conversation.create.mockRejectedValueOnce(p2002());
    prisma.conversation.findUniqueOrThrow.mockResolvedValueOnce(conversation());
    const dto = await service.getOrCreateConversation(ME, THEM);
    expect(dto.conversationId).toBe(CONVO);
    expect(prisma.conversation.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pairKey: MessagingService.pairKeyFor(ME, THEM) },
      }),
    );
  });

  it('starting a NEW conversation with a blocked pair is the frozen 403', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(null);
    prisma.userBlock.findFirst.mockResolvedValueOnce({ blockerUserId: THEM });
    await expect(
      service.getOrCreateConversation(ME, THEM),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('an EXISTING conversation with a blocked pair still reads (frozen: true)', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(conversation());
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerUserId: THEM, blockedUserId: ME },
    ]);
    const dto = await service.getOrCreateConversation(ME, THEM);
    expect(dto.frozen).toBe(true);
  });
});

describe('sendMessage', () => {
  let prisma: any;
  let service: MessagingService;
  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    prisma.conversation.findUnique.mockResolvedValue(conversation());
    prisma.message.create.mockResolvedValue(textMessage());
  });

  it('frozen pair → typed CONVERSATION_FROZEN 403, nothing written', async () => {
    prisma.userBlock.findFirst.mockResolvedValueOnce({ blockerUserId: ME });
    const err = await service
      .sendMessage(ME, CONVO, { kind: 'text' as any, body: 'hi' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse().code).toBe('CONVERSATION_FROZEN');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('kind-shape: text with a shared entity is a loud 400', async () => {
    await expect(
      service.sendMessage(ME, CONVO, {
        kind: 'text' as any,
        body: 'hi',
        sharedEntityKind: 'dish' as any,
        sharedEntityId: MSG,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kind-shape: entity_share without the ref is a loud 400', async () => {
    await expect(
      service.sendMessage(ME, CONVO, { kind: 'entity_share' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kind-shape: empty text body is a loud 400', async () => {
    await expect(
      service.sendMessage(ME, CONVO, { kind: 'text' as any, body: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('send updates the conversation denorm in the same transaction', async () => {
    await service.sendMessage(ME, CONVO, { kind: 'text' as any, body: 'hi' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastMessageId: MSG }),
      }),
    );
  });

  it('dedupe replay: P2002 on clientDedupeId returns the ORIGINAL message', async () => {
    prisma.message.create.mockRejectedValueOnce(p2002());
    prisma.message.findUniqueOrThrow.mockResolvedValueOnce(
      textMessage({ clientDedupeId: 'dupe-1' }),
    );
    const dto = await service.sendMessage(ME, CONVO, {
      kind: 'text' as any,
      body: 'hi',
      clientDedupeId: 'dupe-1',
    });
    expect(dto.messageId).toBe(MSG);
    expect(dto.clientDedupeId).toBe('dupe-1');
  });

  it('non-member gets 404, not a membership oracle', async () => {
    prisma.conversation.findUnique.mockResolvedValue(
      conversation({ participants: [participant(THEM)] }),
    );
    await expect(
      service.sendMessage(ME, CONVO, { kind: 'text' as any, body: 'hi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('unread + request derivation (§1.1/§2.4)', () => {
  let prisma: any;
  let service: MessagingService;
  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
  });

  it('unread counts only inbound messages newer than the cursor', async () => {
    const cursor = new Date('2026-07-02T00:00:00Z');
    prisma.conversation.findMany.mockResolvedValueOnce([
      conversation({
        participants: [
          participant(ME, { lastReadMessageAt: cursor, acceptedAt: cursor }),
          participant(THEM),
        ],
      }),
    ]);
    prisma.message.count.mockResolvedValueOnce(3);
    const { conversations } = await service.listConversations(ME, {});
    expect(conversations[0].unreadCount).toBe(3);
    const where = prisma.message.count.mock.calls[0][0].where;
    expect(where.senderUserId).toEqual({ not: ME });
    expect(where.createdAt).toEqual({ gt: cursor });
  });

  it('request-lane rule table', () => {
    const svc: any = service;
    const cases: Array<[Date | null, boolean, boolean, boolean]> = [
      // [acceptedAt, viewerSent, viewerFollows, expectedIsRequest]
      [null, false, false, true],
      [null, true, false, false], // first reply promotes
      [null, false, true, false], // following promotes
      [new Date(), false, false, false], // explicit accept promotes
    ];
    for (const [acceptedAt, sent, follows, expected] of cases) {
      expect(
        svc.isRequestFor(participant(ME, { acceptedAt }), sent, follows),
      ).toBe(expected);
    }
  });

  it('filter=requests returns only request rows; inbox excludes them', async () => {
    const rows = [
      conversation(), // ME never sent, no follow, not accepted → request
      conversation({
        conversationId: MSG,
        participants: [
          participant(ME, { acceptedAt: new Date() }),
          participant(THEM),
        ],
      }),
    ];
    prisma.conversation.findMany.mockResolvedValue(rows);
    const requests = await service.listConversations(ME, {
      filter: 'requests',
    });
    expect(requests.conversations.map((c) => c.conversationId)).toEqual([
      CONVO,
    ]);
    const inbox = await service.listConversations(ME, { filter: 'inbox' });
    expect(inbox.conversations.map((c) => c.conversationId)).toEqual([MSG]);
  });

  it('unread-count badge excludes requests and frozen conversations', async () => {
    prisma.conversation.findMany.mockResolvedValueOnce([
      conversation(), // request (unread would not count)
    ]);
    prisma.message.count.mockResolvedValue(5);
    await expect(service.unreadCount(ME)).resolves.toEqual({ total: 0 });
  });
});

describe('cursor pagination (§2.2 total order)', () => {
  let prisma: any;
  let service: MessagingService;
  beforeEach(() => {
    prisma = makePrisma();
    service = makeService(prisma);
    prisma.conversation.findUnique.mockResolvedValue(conversation());
  });

  it('history cursor is (createdAt, messageId) total-ordered', async () => {
    const at = '2026-07-02T00:00:00.000Z';
    await service.listMessages(ME, CONVO, { cursor: `${at}|${MSG}` });
    const where = prisma.message.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { createdAt: { lt: new Date(at) } },
      { createdAt: new Date(at), messageId: { lt: MSG } },
    ]);
  });

  it('after mode fetches newer, oldest-first', async () => {
    const at = '2026-07-02T00:00:00.000Z';
    await service.listMessages(ME, CONVO, { after: at });
    const call = prisma.message.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toEqual({ gt: new Date(at) });
    expect(call.orderBy[0]).toEqual({ createdAt: 'asc' });
  });

  it('malformed cursor is a loud 400', async () => {
    await expect(
      service.listMessages(ME, CONVO, { cursor: 'garbage' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('read cursor (monotonic §2.1)', () => {
  it('backward moves clamp to a no-op', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.conversation.findUnique.mockResolvedValue(conversation());
    const existing = new Date('2026-07-05T00:00:00Z');
    prisma.conversationParticipant.findUniqueOrThrow.mockResolvedValue({
      lastReadMessageAt: existing,
    });
    const res = await service.advanceReadCursor(
      ME,
      CONVO,
      '2026-07-01T00:00:00.000Z',
    );
    // The guard clause only updates rows with an OLDER cursor…
    const where =
      prisma.conversationParticipant.updateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { lastReadMessageAt: null },
      { lastReadMessageAt: { lt: new Date('2026-07-01T00:00:00.000Z') } },
    ]);
    // …and the response reflects the SETTLED (newer) cursor.
    expect(res.lastReadMessageAt).toBe(existing.toISOString());
  });
});

describe('shareFanOut (§3.2)', () => {
  it('one frozen recipient does not fail the fan-out', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const spy = jest.spyOn(service, 'getOrCreateConversation');
    spy
      .mockResolvedValueOnce({ conversationId: CONVO } as any)
      .mockRejectedValueOnce(
        new ForbiddenException({ code: 'CONVERSATION_FROZEN' }),
      );
    jest
      .spyOn(service, 'sendMessage')
      .mockResolvedValue({ messageId: MSG } as any);
    const { results } = await service.shareFanOut(ME, {
      recipientUserIds: [THEM, MSG],
      sharedEntityKind: 'dish' as any,
      sharedEntityId: CONVO,
    });
    expect(results).toEqual([
      {
        recipientUserId: THEM,
        conversationId: CONVO,
        messageId: MSG,
        error: null,
      },
      {
        recipientUserId: MSG,
        conversationId: null,
        messageId: null,
        error: 'CONVERSATION_FROZEN',
      },
    ]);
  });
});

describe('shareTargets (universal share modal "Send to")', () => {
  const FRIEND = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const BLOCKED = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const userRow = (userId: string) => ({
    userId,
    username: `u-${userId.slice(0, 4)}`,
    displayName: null,
    avatarUrl: null,
  });

  it('ranks mutual follows first and excludes blocked pairs', async () => {
    const prisma = makePrisma();
    // outbound follows (viewer → them): THEM (older), FRIEND (newer), BLOCKED
    prisma.userFollow.findMany.mockImplementation(({ where }: any) => {
      if (where.followerUserId === ME) {
        return Promise.resolve([
          { followingUserId: FRIEND, createdAt: new Date('2026-07-01') },
          { followingUserId: THEM, createdAt: new Date('2026-06-01') },
          { followingUserId: BLOCKED, createdAt: new Date('2026-07-02') },
        ]);
      }
      if (where.followingUserId === ME) {
        // THEM follows back → mutual; ClosenessService reads this same mock.
        return Promise.resolve([{ followerUserId: THEM }]);
      }
      // ClosenessService outbound read ({ followerUserId: ME, followingUserId: { in } })
      return Promise.resolve([]);
    });
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerUserId: ME, blockedUserId: BLOCKED },
    ]);
    prisma.user.findMany = jest
      .fn()
      .mockResolvedValue([userRow(THEM), userRow(FRIEND)]);

    const service = makeService(prisma);
    const { targets } = await service.shareTargets(ME);

    // mutual (THEM) outranks one-way (FRIEND); BLOCKED never appears.
    expect(targets.map((t) => t.userId)).toEqual([THEM, FRIEND]);
    // blocked id never reaches the user hydration query
    const inIds = (prisma.user.findMany as jest.Mock).mock.calls[0][0].where
      .userId.in;
    expect(inIds).not.toContain(BLOCKED);
  });

  it('returns empty with no follow graph', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await expect(service.shareTargets(ME)).resolves.toEqual({ targets: [] });
  });
});
