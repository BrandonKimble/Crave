import { RestaurantMentionsService } from './restaurant-mentions.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Contract tests for GET /polls/restaurants/:id/mentions (page-registry §8.4):
 * - mention cards = approved, non-deleted comments whose entitySpans contain
 *   the restaurant, framed by their poll question;
 * - THREAD-MERGE: a matched reply nests under its nearest matched ancestor,
 *   skipping non-matched intermediate comments;
 * - tags come from core_restaurant_entity_signals (name + count);
 * - tag filter = any-match over span entityIds.
 */

const RESTAURANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TAG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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
}) {
  const prisma = {
    restaurantEntitySignal: {
      findMany: jest.fn().mockResolvedValue(params.signals ?? []),
    },
    pollComment: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(params.comments ?? [])
        .mockResolvedValueOnce(params.edges ?? []),
    },
  } as unknown as PrismaService;
  return {
    service: new RestaurantMentionsService(prisma),
    prisma,
  };
}

describe('RestaurantMentionsService', () => {
  it('returns mention cards framed by their poll question', async () => {
    const { service } = makeService({
      comments: [comment({})],
      edges: [{ commentId: 'c1', parentCommentId: null }],
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
        { commentId: 'root', parentCommentId: null },
        // 'middle' is NOT a mention of this restaurant — it must be skipped.
        { commentId: 'middle', parentCommentId: 'root' },
        { commentId: 'grandchild', parentCommentId: 'middle' },
      ],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].commentId).toBe('root');
    expect(result.cards[0].replies).toHaveLength(1);
    expect(result.cards[0].replies[0].commentId).toBe('grandchild');
  });

  it('maps entity-signal tags (name, type, count)', async () => {
    const { service } = makeService({
      comments: [],
      edges: [],
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
      edges: [
        { commentId: 'with-tag', parentCommentId: null },
        { commentId: 'without-tag', parentCommentId: null },
      ],
    });
    const result = await service.getRestaurantMentions(RESTAURANT_ID, {
      tagEntityIds: [TAG_ID],
    });
    expect(result.cards.map((c) => c.commentId)).toEqual(['with-tag']);
  });
});
