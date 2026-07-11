import { Injectable } from '@nestjs/common';
import {
  PollCommentModerationStatus,
  Prisma,
  type EntityType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// W3 (page-registry §8.4): the restaurant Discussions/mentions aggregation.
// A "mention" = an approved, non-deleted poll comment whose gazetteer
// entitySpans contain this restaurant's entityId (the same linkage that
// drives leaderboard endorsement projection). Cards are framed by their
// poll question; the THREAD-MERGE rule nests replies that are themselves
// mentions of this restaurant under their nearest mentioning ancestor
// (skipping non-mention intermediate comments).
//
// Tags = core_restaurant_entity_signals (already aggregated mention counts
// of entities discussed around this restaurant); inside Discussions they
// act as multi-select filters (a card passes when it mentions ANY selected
// tag entity).

const MAX_TAGS = 30;
const MAX_MATCHED_COMMENTS = 200;

export type RestaurantMentionSort = 'top' | 'new';

export interface RestaurantMentionUserDto {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RestaurantMentionReplyDto {
  commentId: string;
  body: string;
  score: number;
  loggedAt: Date;
  user: RestaurantMentionUserDto;
}

export interface RestaurantMentionCardDto {
  commentId: string;
  body: string;
  score: number;
  loggedAt: Date;
  user: RestaurantMentionUserDto;
  pollId: string;
  pollQuestion: string;
  replies: RestaurantMentionReplyDto[];
}

export interface RestaurantMentionTagDto {
  entityId: string;
  name: string;
  type: EntityType;
  mentionCount: number;
}

export interface RestaurantMentionsDto {
  restaurantId: string;
  tags: RestaurantMentionTagDto[];
  cards: RestaurantMentionCardDto[];
  totalCount: number;
}

interface SpanLike {
  entityId?: unknown;
}

const spanEntityIds = (entitySpans: unknown): string[] => {
  if (!Array.isArray(entitySpans)) {
    return [];
  }
  return entitySpans
    .map((span) => (span as SpanLike)?.entityId)
    .filter((id): id is string => typeof id === 'string');
};

@Injectable()
export class RestaurantMentionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRestaurantMentions(
    restaurantId: string,
    params: {
      sort?: RestaurantMentionSort;
      search?: string;
      tagEntityIds?: string[];
    } = {},
  ): Promise<RestaurantMentionsDto> {
    const sort = params.sort ?? 'top';
    const search = params.search?.trim() || undefined;
    const tagEntityIds = params.tagEntityIds?.length
      ? new Set(params.tagEntityIds)
      : null;

    const [signals, matched] = await Promise.all([
      this.prisma.restaurantEntitySignal.findMany({
        where: { restaurantId, mentionCount: { gt: 0 } },
        orderBy: { mentionCount: 'desc' },
        take: MAX_TAGS,
        select: {
          entityId: true,
          mentionCount: true,
          entity: { select: { name: true, type: true } },
        },
      }),
      this.prisma.pollComment.findMany({
        where: {
          deletedAt: null,
          moderationStatus: PollCommentModerationStatus.approved,
          // JSONB containment: any span object with this entityId.
          entitySpans: {
            array_contains: [{ entityId: restaurantId }],
          } as Prisma.JsonFilter,
          ...(search
            ? { body: { contains: search, mode: 'insensitive' as const } }
            : {}),
        },
        orderBy:
          sort === 'new'
            ? [{ loggedAt: 'desc' as const }]
            : [{ score: 'desc' as const }, { loggedAt: 'desc' as const }],
        take: MAX_MATCHED_COMMENTS,
        select: {
          commentId: true,
          pollId: true,
          parentCommentId: true,
          body: true,
          score: true,
          entitySpans: true,
          loggedAt: true,
          user: {
            select: {
              userId: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          poll: { select: { pollId: true, question: true } },
        },
      }),
    ]);

    // Multi-select tag filter: keep cards that mention ANY selected entity.
    const filtered = tagEntityIds
      ? matched.filter((comment) =>
          spanEntityIds(comment.entitySpans).some((id) => tagEntityIds.has(id)),
        )
      : matched;

    // ── Thread merge ─────────────────────────────────────────────────────
    // Nearest MENTIONING ancestor wins: walk each matched comment's parent
    // chain (within its poll); if it reaches another matched comment, it
    // nests as a reply of that comment's card — skipping non-mention
    // intermediates. Otherwise it roots its own card.
    const matchedById = new Map(filtered.map((c) => [c.commentId, c]));
    const pollIds = [...new Set(filtered.map((c) => c.pollId))];
    const parentEdges = pollIds.length
      ? await this.prisma.pollComment.findMany({
          where: { pollId: { in: pollIds } },
          select: { commentId: true, parentCommentId: true },
        })
      : [];
    const parentOf = new Map(
      parentEdges.map((row) => [row.commentId, row.parentCommentId]),
    );

    const nearestMatchedAncestor = (commentId: string): string | null => {
      let cursor = parentOf.get(commentId) ?? null;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        if (matchedById.has(cursor)) {
          return cursor;
        }
        cursor = parentOf.get(cursor) ?? null;
      }
      return null;
    };

    const repliesByRoot = new Map<string, RestaurantMentionReplyDto[]>();
    const roots: typeof filtered = [];
    for (const comment of filtered) {
      const ancestorId = nearestMatchedAncestor(comment.commentId);
      if (ancestorId) {
        const bucket = repliesByRoot.get(ancestorId) ?? [];
        bucket.push({
          commentId: comment.commentId,
          body: comment.body,
          score: comment.score,
          loggedAt: comment.loggedAt,
          user: comment.user,
        });
        repliesByRoot.set(ancestorId, bucket);
      } else {
        roots.push(comment);
      }
    }

    // A nested reply may point at an ancestor that itself nested upward —
    // reattach transitively to the true root by resolving each root's bucket
    // only (buckets keyed by non-root ids collapse into their root's card).
    const rootIds = new Set(roots.map((c) => c.commentId));
    const resolveRoot = (commentId: string): string | null => {
      let cursor: string | null = commentId;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        if (rootIds.has(cursor)) {
          return cursor;
        }
        seen.add(cursor);
        cursor = nearestMatchedAncestor(cursor);
      }
      return null;
    };
    const repliesByTrueRoot = new Map<string, RestaurantMentionReplyDto[]>();
    for (const [ancestorId, bucket] of repliesByRoot) {
      const rootId = rootIds.has(ancestorId)
        ? ancestorId
        : resolveRoot(ancestorId);
      if (!rootId) {
        continue;
      }
      const target = repliesByTrueRoot.get(rootId) ?? [];
      target.push(...bucket);
      repliesByTrueRoot.set(rootId, target);
    }

    const cards: RestaurantMentionCardDto[] = roots.map((comment) => ({
      commentId: comment.commentId,
      body: comment.body,
      score: comment.score,
      loggedAt: comment.loggedAt,
      user: comment.user,
      pollId: comment.poll.pollId,
      pollQuestion: comment.poll.question,
      replies: (repliesByTrueRoot.get(comment.commentId) ?? []).sort(
        (a, b) => a.loggedAt.getTime() - b.loggedAt.getTime(),
      ),
    }));

    return {
      restaurantId,
      tags: signals.map((signal) => ({
        entityId: signal.entityId,
        name: signal.entity.name,
        type: signal.entity.type,
        mentionCount: signal.mentionCount,
      })),
      cards,
      totalCount: filtered.length,
    };
  }
}
