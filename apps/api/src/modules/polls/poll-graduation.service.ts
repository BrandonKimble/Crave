import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PollState,
  PollCommentModerationStatus,
  PollCommentExtractionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ExtractionPipelineService } from '../content-processing/reddit-collector/extraction-pipeline.service';
import { LLMComment, LLMPost } from '../external-integrations/llm/llm.types';
import { PollsService } from './polls.service';

/**
 * Phase 5C — close-time poll graduation (master plan §6.3).
 *
 * When a poll closes, its discussion thread is the authoritative evidence: we run
 * the full thread through the EXISTING content-collection pipeline as a
 * `poll-thread` source (Gemini extraction -> entity resolution -> new-entity
 * discovery + Google enrichment -> evidence ledger -> projection rebuild). This is
 * what turns poll discussion into real global entities + Crave Score movement.
 *
 * The live gazetteer (Phase 5 core) only highlights entities that ALREADY exist;
 * graduation is where brand-new spots/dishes mentioned in comments enter the
 * global graph. After the pipeline runs we re-highlight every comment (so the
 * newly-created entities become tappable) and finalize the leaderboard.
 *
 * Idempotent via `poll.graduatedAt`: set only after a successful pass, so the
 * normal path never graduates a poll twice. Even a forced re-graduation can't
 * double-count into Crave Score: the projection rebuild only counts evidence
 * whose `extractionRunId` matches the source document's *active* run, and each
 * comment document is stable (deduped by commentId), so re-pointing it to the
 * new run orphans the prior run's events rather than summing them. (Note: the
 * `collection_processed_sources` ledger does NOT filter already-seen mentions —
 * it only short-circuits when a thread has zero mentions — so don't rely on it
 * for dedupe; the active-run projection is what guarantees no double-count.)
 */
@Injectable()
export class PollGraduationService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionPipeline: ExtractionPipelineService,
    private readonly pollsService: PollsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollGraduationService');
  }

  /**
   * Close (if still open) and graduate a single poll. Safe to call repeatedly:
   * returns early once `graduatedAt` is set.
   */
  async closeAndGraduate(pollId: string): Promise<void> {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        pollId: true,
        state: true,
        question: true,
        marketKey: true,
        launchedAt: true,
        createdAt: true,
        graduatedAt: true,
        metadata: true,
        // §2 Option A: the creator's description is an extractable creator-authored
        // unit at graduation (today only `question` is sent, as non-extracted
        // framing). Attribute it to the creator so closure counts it like Reddit
        // collection counts a post body.
        createdByUserId: true,
        topic: { select: { description: true } },
      },
    });
    if (!poll) {
      return;
    }
    if (poll.graduatedAt) {
      return;
    }
    if (poll.state !== PollState.active && poll.state !== PollState.closed) {
      // draft / scheduled / archived never graduate.
      return;
    }

    // 1. Ensure the poll is closed (stamp closedAt only on the active->closed flip).
    if (poll.state === PollState.active) {
      await this.prisma.poll.update({
        where: { pollId },
        data: { state: PollState.closed, closedAt: new Date() },
      });
    }

    // 2. Load the authoritative thread (approved, non-deleted), oldest-first so the
    //    flattened document reads like the discussion unfolded.
    const comments = await this.prisma.pollComment.findMany({
      where: {
        pollId,
        deletedAt: null,
        moderationStatus: PollCommentModerationStatus.approved,
      },
      orderBy: { loggedAt: 'asc' },
      select: {
        commentId: true,
        parentCommentId: true,
        body: true,
        score: true,
        loggedAt: true,
        user: { select: { userId: true, username: true } },
      },
    });

    // §2 Option A: the creator's description is an extractable creator-authored
    // unit (the post body in Reddit terms). The poll question is non-extracted
    // framing (`extract_from_post: false`), so we carry the description as the
    // first comment-shaped unit instead — attributed to the creator, oldest so it
    // leads the flattened thread like a post body.
    const description = poll.topic?.description?.trim();
    let descriptionUnit: LLMComment | null = null;
    if (description && poll.createdByUserId) {
      const creator = await this.prisma.user.findUnique({
        where: { userId: poll.createdByUserId },
        select: { userId: true, username: true },
      });
      descriptionUnit = {
        id: `poll-${pollId}-description`,
        content: description,
        author: creator?.username ?? poll.createdByUserId,
        score: 0,
        created_at: (poll.launchedAt ?? poll.createdAt).toISOString(),
        parent_id: null,
        url: `crave://poll/${pollId}`,
      };
    }

    if (!comments.length && !descriptionUnit) {
      // Nothing to extract — mark graduated so the cron stops revisiting it.
      await this.markGraduated(pollId, poll.metadata, {
        commentsProcessed: 0,
      });
      return;
    }

    // 3. Flatten the thread into the collection pipeline's post+comments shape.
    //    The poll question is context only (`extract_from_post: false`) — it frames
    //    the discussion but is a prompt, not an endorsement.
    const marketKey = poll.marketKey ?? 'global';
    const llmComments: LLMComment[] = [
      ...(descriptionUnit ? [descriptionUnit] : []),
      ...comments.map((comment) => ({
        id: comment.commentId,
        content: comment.body,
        author: comment.user.username ?? comment.user.userId,
        score: comment.score,
        created_at: comment.loggedAt.toISOString(),
        parent_id: comment.parentCommentId ?? null,
        url: `crave://poll/${pollId}/comment/${comment.commentId}`,
      })),
    ];
    const llmPost: LLMPost = {
      id: `poll-${pollId}`,
      title: poll.question,
      content: poll.question,
      subreddit: marketKey,
      author: 'crave-poll',
      url: `crave://poll/${pollId}`,
      score: 0,
      created_at: (poll.launchedAt ?? poll.createdAt).toISOString(),
      comments: llmComments,
      extract_from_post: false,
    };

    // 4. Run the authoritative collection pass.
    const batchId = `poll-${pollId}-${Date.now()}`;
    const result = await this.extractionPipeline.processPosts({
      pipeline: 'poll-thread',
      // Synchronous consumer: the gazetteer backfill right below expects the
      // graduated entities to already exist — never defer this to a batch job.
      llmMode: 'interactive',
      platform: 'poll',
      community: marketKey,
      llmPosts: [llmPost],
      batchId,
      collectionRunScopeKey: `poll:${pollId}`,
      activateDocumentsBeforeProcessing: true,
      runMetadata: { pollId, marketKey },
    });

    // 5. Backfill highlights: re-run the gazetteer now that graduated entities
    //    exist, so newly-created spots/dishes become tappable in-thread, and flip
    //    each comment to `collected`.
    for (const comment of comments) {
      const spans = await this.pollsService.highlightCommentSpans(
        comment.body,
        poll.marketKey,
      );
      await this.prisma.pollComment.update({
        where: { commentId: comment.commentId },
        data: {
          entitySpans: spans,
          extractionStatus: PollCommentExtractionStatus.collected,
        },
      });
    }

    // 6. Finalize the leaderboard from the backfilled spans.
    await this.pollsService.refreshPollLeaderboard(pollId);

    // 7. Mark graduated.
    await this.markGraduated(pollId, poll.metadata, {
      commentsProcessed: comments.length,
      batchId,
      extractionRunId: result.extractionRunId,
      entitiesCreated: result.dbResult.entitiesCreated,
      connectionsCreated: result.dbResult.connectionsCreated,
    });

    this.logger.info('Graduated poll thread', {
      pollId,
      commentsProcessed: comments.length,
      entitiesCreated: result.dbResult.entitiesCreated,
      connectionsCreated: result.dbResult.connectionsCreated,
    });
  }

  private async markGraduated(
    pollId: string,
    existingMetadata: Prisma.JsonValue,
    graduation: Record<string, unknown>,
  ): Promise<void> {
    const base =
      existingMetadata &&
      typeof existingMetadata === 'object' &&
      !Array.isArray(existingMetadata)
        ? (existingMetadata as Record<string, unknown>)
        : {};
    const graduatedAt = new Date();
    await this.prisma.poll.update({
      where: { pollId },
      data: {
        graduatedAt,
        metadata: {
          ...base,
          graduation: { graduatedAt: graduatedAt.toISOString(), ...graduation },
        } as Prisma.InputJsonValue,
      },
    });
  }
}
