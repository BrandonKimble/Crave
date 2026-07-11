import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Social-closeness ranking (registry W0 item 8; plans/page-registry.md §8.2).
 *
 * STABLE INTERFACE, v1 HEURISTIC. Consumers (W1 followers-first surfaces,
 * W3 share targets) call `rankByCloseness` and never see the formula, so the
 * scorer can be replaced (interaction graph, embeddings, whatever) without a
 * single call-site change.
 *
 * v1 formula (existing tables only — user_follows, poll_comments,
 * poll_comment_likes):
 *
 *   score(candidate) =
 *       1000 · mutualFollow                       (both directions exist)
 *     +  500 · viewerFollowsCandidate             (one-way still beats none)
 *     + up to 100 · followRecency                 (linear decay over 365 days
 *                                                  from the viewer→candidate
 *                                                  follow's createdAt)
 *     +   10 · min(interactions, 20)              (comment-like edges between
 *                                                  the pair, both directions,
 *                                                  + replies to each other's
 *                                                  poll comments)
 *
 * Ordering contract (unit-tested): mutual > one-way > non-follow; among
 * one-way follows, more recent wins; interactions break remaining ties.
 * Final tie-break is the input order (stable sort), so callers can pass a
 * pre-ordered fallback (e.g. recency) and closeness only reorders where it
 * has signal.
 */
@Injectable()
export class ClosenessService {
  constructor(private readonly prisma: PrismaService) {}

  async rankByCloseness(
    viewerUserId: string,
    candidateUserIds: string[],
  ): Promise<string[]> {
    if (candidateUserIds.length <= 1) return [...candidateUserIds];
    const candidates = [...new Set(candidateUserIds)].filter(
      (id) => id !== viewerUserId,
    );
    if (candidates.length === 0) return [];

    const [outbound, inbound, likeEdges, replyEdges] = await Promise.all([
      // viewer → candidate follows (with createdAt for recency)
      this.prisma.userFollow.findMany({
        where: {
          followerUserId: viewerUserId,
          followingUserId: { in: candidates },
        },
        select: { followingUserId: true, createdAt: true },
      }),
      // candidate → viewer follows (mutuality)
      this.prisma.userFollow.findMany({
        where: {
          followerUserId: { in: candidates },
          followingUserId: viewerUserId,
        },
        select: { followerUserId: true },
      }),
      // comment-like edges between the pair, both directions
      this.prisma.pollCommentLike.findMany({
        where: {
          OR: [
            {
              userId: viewerUserId,
              comment: { userId: { in: candidates } },
            },
            {
              userId: { in: candidates },
              comment: { userId: viewerUserId },
            },
          ],
        },
        select: { userId: true, comment: { select: { userId: true } } },
      }),
      // reply edges between the pair, both directions
      this.prisma.pollComment.findMany({
        where: {
          OR: [
            {
              userId: viewerUserId,
              parent: { userId: { in: candidates } },
            },
            {
              userId: { in: candidates },
              parent: { userId: viewerUserId },
            },
          ],
        },
        select: { userId: true, parent: { select: { userId: true } } },
      }),
    ]);

    const followedAt = new Map<string, Date>(
      outbound.map((f) => [f.followingUserId, f.createdAt]),
    );
    const followsViewer = new Set(inbound.map((f) => f.followerUserId));

    const interactions = new Map<string, number>();
    const bump = (id: string | null | undefined) => {
      if (id && id !== viewerUserId) {
        interactions.set(id, (interactions.get(id) ?? 0) + 1);
      }
    };
    for (const like of likeEdges) {
      bump(like.userId === viewerUserId ? like.comment.userId : like.userId);
    }
    for (const reply of replyEdges) {
      bump(reply.userId === viewerUserId ? reply.parent?.userId : reply.userId);
    }

    const now = Date.now();
    const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const score = (id: string): number => {
      const followed = followedAt.get(id);
      const viewerFollows = followed !== undefined;
      const mutual = viewerFollows && followsViewer.has(id);
      let s = 0;
      if (mutual) s += 1000;
      if (viewerFollows) {
        s += 500;
        const age = Math.max(0, now - followed.getTime());
        s += 100 * Math.max(0, 1 - age / YEAR_MS);
      }
      s += 10 * Math.min(interactions.get(id) ?? 0, 20);
      return s;
    };

    const scores = new Map(candidates.map((id) => [id, score(id)]));
    // Array.prototype.sort is stable: equal scores keep input order.
    return [...candidates].sort(
      (a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0),
    );
  }
}
