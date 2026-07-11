import { RestaurantMentionsService } from './restaurant-mentions.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { UserBlockService } from '../identity/user-block.service';

/**
 * Contract tests for GET /polls/restaurants/:id/mentions (page-registry §8.4):
 * - mention cards = approved, non-deleted comments whose entitySpans contain
 *   the restaurant, framed by their poll question;
 * - THREAD-MERGE: a matched reply nests under its nearest matched ancestor,
 *   skipping non-matched intermediate comments;
 * - ancestor resolution is BOUNDED: one recursive-CTE raw query over the
 *   matched replies' parent chains — never whole-poll comment fetches;
 * - blocking: an authed viewer never sees a blocked peer's cards or replies;
 * - totalCount = matched ROOT cards (honest, pre-cap; replies never counted);
 * - tags come from core_restaurant_entity_signals (name + count);
 * - tag filter = any-match over span entityIds.
 */

const RESTAURANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TAG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VIEWER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const user = (id: string) => ({
  userId: id,
  username: `user-${id}`,
  displayName: null,
  avatarUrl: null,
});

const comment = (over: Partial<Record<string, unknown>>) => ({
  commentId: 'c1',
  pollId: 'poll-1',
  parentCommentId: null,
  body: 'great birria here',
  score: 5,
  entitySpans: [{ entityId: RESTAURANT_ID }],
  loggedAt: new Date('2026-07-01T00:00:00Z'),
  user: user('u1'),
  poll: { pollId: 'poll-1', question: 'Best tacos in Austin?' },
  ...over,
});

function makeService(params: {
  comments?: unknown[];
  edges?: Array<{ commentId: string; parentCommentId: string | null }>;
  signals?: unknown[];
  blockedPeers?: string[];
}) {
  const prisma = {
    restaurantEntitySignal: {
      findMany: jest.fn().mockResolvedValue(params.signals ?? []),
    },
    pollComment: {
      findMany: jest.fn().mockResolvedValue(params.comments ?? []),
    },
    // Bounded parent-chain resolution (recursive CTE) rides $queryRaw.
    $queryRaw: jest.fn().mockResolvedValue(params.edges ?? []),
  } as unknown as PrismaService;
  const blocksMock = {
    blockedPeerIds: jest
      .fn()
      .mockResolvedValue(new Set(params.blockedPeers ?? [])),
  };
  return {
    service: new RestaurantMentionsService(
      prisma,
      blocksMock as unknown as UserBlockService,
    ),
    prisma,
    blocks: blocksMock,
  };
}

describe('RestaurantMentionsService', () => {
  it('returns mention cards framed by their poll question', async () => {
    const { service } = makeService({
      comments: [comment({})],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      commentId: 'c1',
      pollQuestion: 'Best tacos in Austin?',
      replies: [],
    });
    expect(result.totalCount).toBe(1);
  });

  it('thread-merges a matched reply under its nearest matched ancestor, skipping non-matched intermediates', async () => {
    const { service } = makeService({
      comments: [
        comment({ commentId: 'root', score: 10 }),
        comment({
          commentId: 'grandchild',
          parentCommentId: 'middle',
          body: 'and the best tofu',
          score: 2,
        }),
      ],
      edges: [
        { commentId: 'grandchild', parentCommentId: 'middle' },
        // 'middle' is NOT a mention of this restaurant — it must be skipped.
        { commentId: 'middle', parentCommentId: 'root' },
        { commentId: 'root', parentCommentId: null },
      ],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].commentId).toBe('root');
    expect(result.cards[0].replies).toHaveLength(1);
    expect(result.cards[0].replies[0].commentId).toBe('grandchild');
  });

  it('resolves parent chains via ONE bounded raw query — never whole-poll comment fetches', async () => {
    const { service, prisma } = makeService({
      comments: [
        comment({ commentId: 'root' }),
        comment({ commentId: 'reply', parentCommentId: 'root', score: 1 }),
      ],
      edges: [
        { commentId: 'reply', parentCommentId: 'root' },
        { commentId: 'root', parentCommentId: null },
      ],
    });
    await service.getRestaurantMentions(RESTAURANT_ID);
    // Exactly ONE pollComment.findMany (the matched-candidate scan) — the old
    // shape issued a second findMany loading EVERY comment of matched polls.
    expect((prisma.pollComment.findMany as jest.Mock).mock.calls).toHaveLength(
      1,
    );
    expect((prisma.$queryRaw as unknown as jest.Mock).mock.calls).toHaveLength(
      1,
    );
  });

  it('skips the raw ancestor query entirely when every match is a root', async () => {
    const { service, prisma } = makeService({
      comments: [comment({ commentId: 'root-only' })],
    });
    await service.getRestaurantMentions(RESTAURANT_ID);
    expect((prisma.$queryRaw as unknown as jest.Mock).mock.calls).toHaveLength(
      0,
    );
  });

  it('filters out cards AND replies authored by the viewer’s blocked peers', async () => {
    const { service, blocks } = makeService({
      comments: [
        comment({ commentId: 'kept-root', user: user('friendly') }),
        comment({ commentId: 'blocked-root', user: user('enemy') }),
        comment({
          commentId: 'blocked-reply',
          parentCommentId: 'kept-root',
          user: user('enemy'),
          score: 1,
        }),
      ],
      edges: [
        { commentId: 'blocked-reply', parentCommentId: 'kept-root' },
        { commentId: 'kept-root', parentCommentId: null },
      ],
      blockedPeers: ['enemy'],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID, {
      viewerUserId: VIEWER_ID,
    });
    expect(blocks.blockedPeerIds).toHaveBeenCalledWith(VIEWER_ID);
    expect(result.cards.map((c) => c.commentId)).toEqual(['kept-root']);
    expect(result.cards[0].replies).toEqual([]);
  });

  it('does not consult the block service for anonymous viewers', async () => {
    const { service, blocks } = makeService({
      comments: [comment({ commentId: 'root', user: user('enemy') })],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID);
    expect(blocks.blockedPeerIds).not.toHaveBeenCalled();
    expect(result.cards).toHaveLength(1);
  });

  it('totalCount counts matched ROOT cards only — replies never inflate it', async () => {
    const { service } = makeService({
      comments: [
        comment({ commentId: 'root' }),
        comment({ commentId: 'reply-a', parentCommentId: 'root', score: 1 }),
        comment({ commentId: 'reply-b', parentCommentId: 'root', score: 1 }),
      ],
      edges: [
        { commentId: 'reply-a', parentCommentId: 'root' },
        { commentId: 'reply-b', parentCommentId: 'root' },
        { commentId: 'root', parentCommentId: null },
      ],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID);
    expect(result.totalCount).toBe(1);
    expect(result.cards[0].replies).toHaveLength(2);
  });

  it('caps CARDS at 200 roots while totalCount stays the honest root count', async () => {
    const roots = Array.from({ length: 250 }, (_, i) =>
      comment({ commentId: `root-${i}` }),
    );
    const { service } = makeService({ comments: roots });
    const result = await service.getRestaurantMentions(RESTAURANT_ID);
    expect(result.cards).toHaveLength(200);
    expect(result.totalCount).toBe(250);
  });

  it('maps entity-signal tags (name, type, count)', async () => {
    const { service } = makeService({
      comments: [],
      signals: [
        {
          entityId: TAG_ID,
          mentionCount: 7,
          entity: { name: 'birria', type: 'food' },
        },
      ],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID);
    expect(result.tags).toEqual([
      { entityId: TAG_ID, name: 'birria', type: 'food', mentionCount: 7 },
    ]);
  });

  it('tag filter keeps only cards whose spans contain a selected entity', async () => {
    const { service } = makeService({
      comments: [
        comment({
          commentId: 'with-tag',
          entitySpans: [{ entityId: RESTAURANT_ID }, { entityId: TAG_ID }],
        }),
        comment({ commentId: 'without-tag' }),
      ],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID, {
      tagEntityIds: [TAG_ID],
    });
    expect(result.cards.map((c) => c.commentId)).toEqual(['with-tag']);
  });
});
