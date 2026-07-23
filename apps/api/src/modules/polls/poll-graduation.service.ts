import { Injectable, OnModuleInit } from '@nestjs/common';
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
import { PollBallotMentionService } from './supply/poll-ballot-mention.service';
import {
  PollSurfaceSourceService,
  pollSurfaceHandle,
} from './supply/poll-surface-source.service';

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
export class PollGraduationService implements OnModuleInit {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionPipeline: ExtractionPipelineService,
    private readonly pollsService: PollsService,
    private readonly ballotMentions: PollBallotMentionService,
    private readonly pollSurfaceSources: PollSurfaceSourceService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollGraduationService');
  }

  onModuleInit(): void {
    // The post-extraction half of graduation (gazetteer backfill so new
    // entities become tappable, span-based leaderboard, graduatedAt stamp)
    // runs as the pipeline's completion continuation: inline when the LLM ran
    // interactively, at batch-ingest time when it was deferred. One code path
    // either way; idempotent via the graduatedAt guard.
    this.extractionPipeline.registerCompletionHandler(
      'poll-thread',
      async (result, baseParams) => {
        const pollId = (baseParams.runMetadata as { pollId?: string })?.pollId;
        if (!pollId) {
          this.logger.warn('poll-thread run missing pollId in runMetadata', {
            extractionRunId: result.extractionRunId,
          });
          return;
        }
        await this.finalizeGraduation(pollId, {
          batchId: baseParams.batchId,
          extractionRunId: result.extractionRunId,
          entitiesCreated: result.dbResult.entitiesCreated,
          connectionsCreated: result.dbResult.connectionsCreated,
        });
      },
    );
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
        placeId: true,
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
    // A batch job is already in flight for this thread — don't resubmit.
    // (Recovers automatically if that job failed: we clear the stamp and fall
    // through to a fresh pass.)
    const pendingJobId = (
      poll.metadata as { graduationPendingBatchJobId?: string } | null
    )?.graduationPendingBatchJobId;
    if (pendingJobId) {
      const job = await this.prisma.llmBatchJob.findUnique({
        where: { jobId: pendingJobId },
        select: { status: true },
      });
      // Still live (pending/submitted/succeeded/ingesting) — wait. Two states
      // mean the job will never graduate this poll and we must retry:
      // 'failed' (job-level failure), and 'ingested' while we are still here
      // ungraduated — ingest runs the graduation completion handler BEFORE
      // the job flips to 'ingested', so reaching this line with an ingested
      // job means the run failed (e.g. chunk failures) or the handler was
      // skipped; without this the poll wedges forever.
      if (job && job.status !== 'failed' && job.status !== 'ingested') {
        return;
      }
      this.logger.warn(
        'Pending graduation batch job terminal without graduating — retrying',
        {
          pollId,
          batchJobId: pendingJobId,
          jobStatus: job?.status ?? 'missing',
        },
      );
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

    // 1b. K6 vote→mention (§4, definitional): the BALLOT bypasses LLM
    // extraction — each distinct voter mints ONE structured mention for
    // their choice. Idempotent; a failure THROWS so the daily lifecycle
    // cron retries the whole graduation (graduatedAt is still unset) —
    // ballot mentions can never be silently lost.
    await this.ballotMentions.mintForPoll(pollId);

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
    //
    //    §5 source law: a place-keyed poll's thread is a document of the
    //    place's poll_surface SOURCE (lazily created, NO engineId). The
    //    source handle stamps the documents' community. Every poll row is
    //    place-keyed (legacy-poll expiry); a null placeId is the degenerate
    //    'global' community, never a market key.
    let community = 'global';
    let pollSurfaceSourceId: string | null = null;
    if (poll.placeId) {
      const source = await this.pollSurfaceSources.ensureForPlace(poll.placeId);
      community = pollSurfaceHandle(poll.placeId);
      pollSurfaceSourceId = source.sourceId;
    }
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
      subreddit: community,
      author: 'crave-poll',
      url: `crave://poll/${pollId}`,
      score: 0,
      created_at: (poll.launchedAt ?? poll.createdAt).toISOString(),
      comments: llmComments,
      extract_from_post: false,
    };

    // 4. Run the authoritative collection pass. Everything the user SEES at
    //    close (vote results, projections, live-gazetteer highlights of
    //    already-known entities, discussion) is untouched by this — collection
    //    only feeds scores/new entities in the background — so the LLM work
    //    follows COLLECTION_LLM_MODE like every other collection type. The
    //    post-extraction half (backfill + leaderboard + graduatedAt) runs via
    //    the pipeline's 'poll-thread' completion handler: inline when
    //    interactive, at batch-ingest when deferred.
    const batchId = `poll-${pollId}-${Date.now()}`;
    const result = await this.extractionPipeline.processPosts({
      pipeline: 'poll-thread',
      platform: 'poll',
      community,
      llmPosts: [llmPost],
      batchId,
      collectionRunScopeKey: `poll:${pollId}`,
      activateDocumentsBeforeProcessing: true,
      runMetadata: {
        pollId,
        ...(poll.placeId ? { placeId: poll.placeId, pollSurfaceSourceId } : {}),
      },
    });

    if (result.deferredBatchJobId) {
      // Stamp the pending job so the graduation cron doesn't resubmit the
      // thread while the batch is in flight (graduatedAt is still unset).
      await this.prisma.poll.update({
        where: { pollId },
        data: {
          metadata: {
            ...((poll.metadata as Record<string, unknown>) ?? {}),
            graduationPendingBatchJobId: result.deferredBatchJobId,
          } as Prisma.InputJsonValue,
        },
      });
      this.logger.info('Poll graduation deferred to batch', {
        pollId,
        batchJobId: result.deferredBatchJobId,
        commentsProcessed: comments.length,
      });
    }
  }

  /**
   * Post-extraction half of graduation — invoked by the pipeline completion
   * handler (inline for interactive runs, at ingest for batch runs).
   * Idempotent via the graduatedAt guard in markGraduated's caller path.
   */
  async finalizeGraduation(
    pollId: string,
    stats: {
      batchId: string;
      extractionRunId: string;
      entitiesCreated: number;
      connectionsCreated: number;
    },
  ): Promise<void> {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        pollId: true,
        placeId: true,
        metadata: true,
        graduatedAt: true,
      },
    });
    if (!poll || poll.graduatedAt) {
      return;
    }

    const comments = await this.prisma.pollComment.findMany({
      where: {
        pollId,
        deletedAt: null,
        moderationStatus: PollCommentModerationStatus.approved,
      },
      select: { commentId: true, body: true },
    });

    // 5. Backfill highlights: re-run the gazetteer now that graduated entities
    //    exist, so newly-created spots/dishes become tappable in-thread, and flip
    //    each comment to `collected`.
    for (const comment of comments) {
      const spans = await this.pollsService.highlightCommentSpans(
        comment.body,
        poll.placeId,
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

    // 7. Mark graduated (also clears the pending-batch stamp by overwrite).
    const cleanedMetadata = {
      ...((poll.metadata as Record<string, unknown>) ?? {}),
    };
    delete cleanedMetadata.graduationPendingBatchJobId;
    await this.markGraduated(pollId, cleanedMetadata as Prisma.JsonValue, {
      commentsProcessed: comments.length,
      batchId: stats.batchId,
      extractionRunId: stats.extractionRunId,
      entitiesCreated: stats.entitiesCreated,
      connectionsCreated: stats.connectionsCreated,
    });

    this.logger.info('Graduated poll thread', {
      pollId,
      commentsProcessed: comments.length,
      entitiesCreated: stats.entitiesCreated,
      connectionsCreated: stats.connectionsCreated,
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
