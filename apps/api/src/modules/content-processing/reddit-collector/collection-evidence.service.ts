import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { GeminiBatchService } from '../../external-integrations/llm/gemini-batch.service';
import { ChunkProcessingResult } from '../../external-integrations/llm/llm-concurrent-processing.service';
import {
  LLMModelInput,
  LLMPost,
  LLMProcessingInput,
} from '../../external-integrations/llm/llm.types';

export type SourceDocumentKey = `${'post' | 'comment'}:${string}`;

export const buildSourceDocumentKey = (
  sourceType: 'post' | 'comment',
  sourceId: string,
): SourceDocumentKey => `${sourceType}:${sourceId}`;

export interface ExtractionTraceContext {
  extractionRunId: string;
  sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>;
  extractionInputIdByChunkId: Map<string, string>;
}

type CollectionRunStatus = 'running' | 'completed' | 'failed';

@Injectable()
export class CollectionEvidenceService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly geminiBatch: GeminiBatchService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('CollectionEvidenceService');
  }

  async persistSourceDocuments(params: {
    platform?: string;
    community?: string | null;
    posts: LLMPost[];
  }): Promise<Map<SourceDocumentKey, string>> {
    const platform = params.platform?.trim().toLowerCase() || 'reddit';
    const community = params.community?.trim() || null;
    const documents = this.flattenSourceDocuments(
      platform,
      community,
      params.posts,
    );

    if (documents.length === 0) {
      return new Map();
    }

    await this.prismaService.sourceDocument.createMany({
      data: documents,
      skipDuplicates: true,
    });

    const sourceIds = documents.map((document) => document.sourceId);
    const rows = await this.prismaService.sourceDocument.findMany({
      where: {
        platform,
        sourceId: { in: sourceIds },
      },
      select: {
        documentId: true,
        sourceType: true,
        sourceId: true,
      },
    });

    return new Map(
      rows.map((row) => [
        buildSourceDocumentKey(row.sourceType, row.sourceId),
        row.documentId,
      ]),
    );
  }

  async createExtractionRun(params: {
    pipeline: string;
    collectionRunScopeKey?: string | null;
    platform?: string | null;
    community?: string | null;
    model: string;
    systemPrompt: string;
    generationConfig: Record<string, unknown>;
    chunkingConfig: Record<string, unknown>;
    extractionSchemaVersion?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const collectionRunId = params.collectionRunScopeKey?.trim()
      ? await this.ensureCollectionRun({
          scopeKey: params.collectionRunScopeKey,
          pipeline: params.pipeline,
          platform: params.platform ?? null,
          community: params.community ?? null,
          metadata: params.metadata ?? {},
        })
      : null;
    const systemPromptHash = createHash('sha256')
      .update(params.systemPrompt)
      .digest('hex');

    const run = await this.prismaService.extractionRun.create({
      data: {
        collectionRunId,
        pipeline: params.pipeline,
        model: params.model,
        systemPromptHash,
        systemPrompt: params.systemPrompt,
        generationConfig: params.generationConfig as Prisma.InputJsonValue,
        chunkingConfig: params.chunkingConfig as Prisma.InputJsonValue,
        extractionSchemaVersion: params.extractionSchemaVersion ?? 'v1',
        status: 'running',
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
      select: { extractionRunId: true },
    });

    return run.extractionRunId;
  }

  /**
   * PRE-LLM DEDUPE (duplication red-team 2026-07-11): source ids already
   * COVERED by extraction, so the caller can skip them BEFORE chunking and
   * paying Gemini. 68% of the stage-2 load's duplicate spend was posts whose
   * extraction had already COMPLETED being re-submitted by seed re-launches;
   * 29% was posts whose batch job was still IN FLIGHT. Covered =
   *   (a) a COMPLETED run with the SAME prompt hash + schema version whose
   *       input chunk produced output (raw_output present) — prompt/schema
   *       changes intentionally invalidate coverage so re-extraction under a
   *       new contract still happens; or
   *   (b) a RUNNING run with a live (non-terminal) Gemini batch job — the
   *       work is already bought and on its way.
   * A post with ANY uncovered source id (e.g. new comments since last
   * collection) is NOT skipped — coverage is per-source, growth reprocesses.
   */
  async findExtractionCoveredSourceIds(params: {
    platform: string;
    sourceIds: string[];
    systemPromptHash: string;
    extractionSchemaVersion: string;
  }): Promise<Set<string>> {
    if (params.sourceIds.length === 0) {
      return new Set();
    }
    const rows = await this.prismaService.$queryRaw<{ source_id: string }[]>`
      SELECT DISTINCT d.source_id
      FROM collection_source_documents d
      JOIN collection_extraction_input_documents eid
        ON eid.document_id = d.document_id
      JOIN collection_extraction_inputs ei ON ei.input_id = eid.input_id
      JOIN collection_extraction_runs r
        ON r.extraction_run_id = ei.extraction_run_id
      WHERE d.platform = ${params.platform}
        AND d.source_id = ANY(${params.sourceIds})
        AND (
          (
            r.status = 'completed'
            AND r.system_prompt_hash = ${params.systemPromptHash}
            AND r.extraction_schema_version = ${params.extractionSchemaVersion}
            AND ei.raw_output IS NOT NULL
          )
          OR (
            r.status = 'running'
            AND EXISTS (
              SELECT 1 FROM llm_batch_jobs j
              WHERE j.resume_context->>'extractionRunId' = r.extraction_run_id::text
                AND j.status IN ('persisting','pending','submitting','submitted','succeeded','ingesting')
            )
          )
        )
    `;
    return new Set(rows.map((row) => row.source_id));
  }

  /** Batch-mode companion to persistExtractionInputs: the inputs were persisted
   *  BEFORE the LLM ran (rawOutput null); fill in the outputs once the Gemini
   *  batch results land so the evidence trail matches the interactive path. */
  async updateExtractionInputOutputs(params: {
    extractionRunId: string;
    chunkResults: ChunkProcessingResult<LLMProcessingInput>[];
    inputIdByChunkId: Map<string, string>;
  }): Promise<void> {
    for (const chunk of params.chunkResults) {
      const inputId = params.inputIdByChunkId.get(chunk.chunkId);
      if (!inputId || !chunk.result) continue;
      await this.prismaService.extractionInput.update({
        where: { inputId },
        data: {
          rawOutput: chunk.result as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  async persistExtractionInputs(params: {
    extractionRunId: string;
    chunkResults: ChunkProcessingResult<LLMProcessingInput>[];
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>;
  }): Promise<Map<string, string>> {
    if (!params.chunkResults.length) {
      return new Map();
    }

    const sortedChunks = [...params.chunkResults].sort((a, b) => {
      const left =
        typeof a.metadata.postChunkIndex === 'number'
          ? a.metadata.postChunkIndex
          : Number.MAX_SAFE_INTEGER;
      const right =
        typeof b.metadata.postChunkIndex === 'number'
          ? b.metadata.postChunkIndex
          : Number.MAX_SAFE_INTEGER;
      if (left !== right) {
        return left - right;
      }
      return a.chunkId.localeCompare(b.chunkId);
    });

    const inputIdByChunkId = new Map<string, string>();

    for (let index = 0; index < sortedChunks.length; index += 1) {
      const chunk = sortedChunks[index];
      const input = await this.prismaService.extractionInput.create({
        data: {
          extractionRunId: params.extractionRunId,
          inputIndex: index,
          inputPayload: this.toLightweightInputPayload(chunk.input),
          sourceMap: this.toPersistedSourceMap(chunk.input),
          rawOutput:
            chunk.result === null
              ? Prisma.JsonNull
              : (chunk.result as unknown as Prisma.InputJsonValue),
        },
        select: { inputId: true },
      });

      const inputDocumentLinks = this.buildInputDocumentLinks(
        chunk.input,
        params.sourceDocumentIdBySourceKey,
      );
      if (inputDocumentLinks.length > 0) {
        await this.prismaService.extractionInputDocument.createMany({
          data: inputDocumentLinks.map((link) => ({
            inputId: input.inputId,
            documentId: link.documentId,
            ordinal: link.ordinal,
          })),
          skipDuplicates: true,
        });
      }

      inputIdByChunkId.set(chunk.chunkId, input.inputId);
    }

    return inputIdByChunkId;
  }

  async activateRunForDocuments(
    extractionRunId: string,
    documentIds: string[],
  ): Promise<void> {
    if (!documentIds.length) {
      return;
    }

    await this.prismaService.sourceDocument.updateMany({
      where: {
        documentId: { in: Array.from(new Set(documentIds)) },
      },
      data: {
        activeExtractionRunId: extractionRunId,
      },
    });
  }

  async markExtractionRunCompleted(extractionRunId: string): Promise<void> {
    const run = await this.prismaService.extractionRun.update({
      where: { extractionRunId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      select: {
        collectionRunId: true,
      },
    });

    if (run.collectionRunId) {
      await this.refreshCollectionRunStatus(run.collectionRunId);
    }
  }

  /**
   * Lifecycle reconciler — the missing OWNER for stuck state (audit item 2).
   * A worker crash leaves extraction runs 'running' forever and collection-run
   * statuses stale; nothing else ever revisits them. Hourly: first any batch
   * JOB stuck non-terminal past the horizon is failed (with its owning run),
   * then any run still 'running' past the horizon WITHOUT an open Gemini
   * batch job backing it (batch-deferred runs legitimately float for up to
   * ~24h) is failed loudly, and its collection run's status is recomputed.
   * Idempotent.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcileStaleRuns(): Promise<void> {
    const parsedHorizon = Number(process.env.COLLECTION_RUN_STALE_HOURS ?? 30);
    const horizonHours =
      Number.isFinite(parsedHorizon) && parsedHorizon > 0 ? parsedHorizon : 30;
    await this.reconcileStaleBatchJobs(horizonHours);
    const stale = await this.prismaService.$queryRaw<
      { extraction_run_id: string; collection_run_id: string | null }[]
    >(Prisma.sql`
      SELECT r.extraction_run_id, r.collection_run_id
      FROM collection_extraction_runs r
      WHERE r.status = 'running'
        AND r.started_at < now() - (${horizonHours} * interval '1 hour')
        AND NOT EXISTS (
          SELECT 1 FROM llm_batch_jobs j
          WHERE j.status IN ('pending', 'submitted', 'succeeded', 'ingesting')
            AND j.resume_context ->> 'extractionRunId' = r.extraction_run_id::text
        )
      LIMIT 200
    `);
    if (!stale.length) return;
    for (const run of stale) {
      try {
        await this.markExtractionRunFailed(
          run.extraction_run_id,
          `stale: still running after ${horizonHours}h with no live batch job`,
        );
      } catch (error) {
        this.logger.error('Failed to reconcile one stale extraction run', {
          extractionRunId: run.extraction_run_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.warn('Reconciled stale extraction runs to failed', {
      count: stale.length,
      horizonHours,
    });
  }

  /**
   * Stale batch-JOB sweep: a job stuck in a non-terminal status past the
   * horizon means its half of the pipeline is broken (a 'succeeded' job that
   * old means the ingest path never ran — the poller normally ingests within
   * minutes). The run reconciler above treats these statuses as live cover,
   * so without this sweep a stuck job shields its run forever.
   */
  private async reconcileStaleBatchJobs(horizonHours: number): Promise<void> {
    const stale = await this.prismaService.$queryRaw<
      { job_id: string; purpose: string }[]
    >(Prisma.sql`
      SELECT j.job_id, j.purpose
      FROM llm_batch_jobs j
      WHERE j.status IN ('pending', 'submitted', 'succeeded', 'ingesting')
        AND COALESCE(j.submitted_at, j.created_at) < now() - (${horizonHours} * interval '1 hour')
      ORDER BY COALESCE(j.submitted_at, j.created_at) ASC
      LIMIT 200
    `);
    if (!stale.length) return;
    if (stale.length === 200) {
      this.logger.warn('Stale batch-job sweep hit its 200-row cap', {
        horizonHours,
      });
    }
    const errorMessage = `stale: exceeded ${horizonHours}h horizon with no terminal state`;
    const failedJobIds: string[] = [];
    for (const job of stale) {
      try {
        // CAS on the same non-terminal statuses the SELECT matched: the
        // 5-min poller may have claimed/ingested this job since — never
        // stomp a job that progressed to a terminal state.
        const claimed = await this.prismaService.llmBatchJob.updateMany({
          where: {
            jobId: job.job_id,
            status: { in: ['pending', 'submitted', 'succeeded', 'ingesting'] },
          },
          data: {
            status: 'failed',
            error: errorMessage,
            completedAt: new Date(),
          },
        });
        if (claimed.count === 0) continue; // progressed since SELECT
        failedJobIds.push(job.job_id);
        // ONE mechanism for job-level run-failure: route through the
        // purpose's registered failure handler exactly like the poller's
        // provider-failed and ingest-exhausted paths — a richer future
        // handler can't silently diverge from this sweep.
        await this.geminiBatch.notifyJobFailed(
          job.job_id,
          job.purpose,
          errorMessage,
        );
      } catch (error) {
        // One bad job (e.g. its run row deleted) must not abort the sweep —
        // or the stale-RUN pass below it silently skips this hour.
        this.logger.error('Failed to reconcile one stale batch job', {
          jobId: job.job_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (failedJobIds.length) {
      this.logger.warn('Reconciled stale batch jobs to failed', {
        count: failedJobIds.length,
        horizonHours,
        jobIds: failedJobIds,
      });
    }
  }

  async markExtractionRunFailed(
    extractionRunId: string,
    errorMessage: string,
  ): Promise<void> {
    // Merge into existing metadata — replacing it wholesale would erase the
    // run's provenance (batchId, subreddit, ...).
    const existing = await this.prismaService.extractionRun.findUniqueOrThrow({
      where: { extractionRunId },
      select: { metadata: true },
    });
    const run = await this.prismaService.extractionRun.update({
      where: { extractionRunId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        metadata: {
          ...(existing.metadata as Prisma.JsonObject),
          errorMessage,
        } as Prisma.InputJsonValue,
      },
      select: {
        collectionRunId: true,
      },
    });

    if (run.collectionRunId) {
      await this.refreshCollectionRunStatus(run.collectionRunId);
    }
  }

  private async ensureCollectionRun(params: {
    scopeKey: string;
    pipeline: string;
    platform?: string | null;
    community?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const scopeKey = params.scopeKey.trim();
    const existing = await this.prismaService.collectionRun.findUnique({
      where: { scopeKey },
      select: { collectionRunId: true },
    });

    if (existing) {
      await this.prismaService.collectionRun.update({
        where: { collectionRunId: existing.collectionRunId },
        data: {
          status: 'running',
          completedAt: null,
        },
      });
      return existing.collectionRunId;
    }

    const collectionRun = await this.prismaService.collectionRun.create({
      data: {
        scopeKey,
        pipeline: params.pipeline,
        platform: params.platform?.trim() || null,
        community: params.community?.trim() || null,
        status: 'running',
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
      select: { collectionRunId: true },
    });

    return collectionRun.collectionRunId;
  }

  private async refreshCollectionRunStatus(
    collectionRunId: string,
  ): Promise<void> {
    const extractionRuns = await this.prismaService.extractionRun.findMany({
      where: { collectionRunId },
      select: {
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!extractionRuns.length) {
      return;
    }

    const hasRunning = extractionRuns.some((run) => run.status === 'running');
    const hasFailed = extractionRuns.some((run) => run.status === 'failed');
    const status: CollectionRunStatus = hasRunning
      ? 'running'
      : hasFailed
        ? 'failed'
        : 'completed';

    const startedAt = extractionRuns.reduce(
      (earliest, run) =>
        run.startedAt.getTime() < earliest.getTime() ? run.startedAt : earliest,
      extractionRuns[0].startedAt,
    );
    const completedRuns = extractionRuns.filter(
      (run) => run.completedAt instanceof Date,
    );
    const completedAt =
      completedRuns.length === extractionRuns.length
        ? completedRuns.reduce(
            (latest, run) =>
              run.completedAt!.getTime() > latest.getTime()
                ? run.completedAt!
                : latest,
            completedRuns[0].completedAt!,
          )
        : null;

    await this.prismaService.collectionRun.update({
      where: { collectionRunId },
      data: {
        status,
        startedAt,
        completedAt,
      },
    });
  }

  private flattenSourceDocuments(
    platform: string,
    community: string | null,
    posts: LLMPost[],
  ): Array<{
    platform: string;
    community: string | null;
    sourceType: 'post' | 'comment';
    sourceId: string;
    parentSourceId: string | null;
    title: string | null;
    body: string | null;
    url: string | null;
    sourceCreatedAt: Date;
    collectedAt: Date;
    scoreSnapshot: number | null;
    rawPayload: Prisma.InputJsonObject;
  }> {
    const now = new Date();
    const byKey = new Map<
      SourceDocumentKey,
      {
        platform: string;
        community: string | null;
        sourceType: 'post' | 'comment';
        sourceId: string;
        parentSourceId: string | null;
        title: string | null;
        body: string | null;
        url: string | null;
        sourceCreatedAt: Date;
        collectedAt: Date;
        scoreSnapshot: number | null;
        rawPayload: Prisma.InputJsonObject;
      }
    >();

    posts.forEach((post) => {
      byKey.set(`post:${post.id}`, {
        platform,
        community: community ?? post.subreddit ?? null,
        sourceType: 'post',
        sourceId: post.id,
        parentSourceId: null,
        title: post.title ?? null,
        body: post.content ?? null,
        url: post.url ?? null,
        sourceCreatedAt: this.parseDate(post.created_at, now),
        collectedAt: now,
        scoreSnapshot: Number.isFinite(post.score) ? post.score : null,
        rawPayload: {
          id: post.id,
          title: post.title ?? null,
          content: post.content ?? null,
          subreddit: post.subreddit ?? null,
          author: post.author ?? null,
          url: post.url ?? null,
          score: Number.isFinite(post.score) ? post.score : null,
          created_at: post.created_at ?? null,
          extract_from_post: Boolean(post.extract_from_post),
        },
      });

      (post.comments ?? []).forEach((comment) => {
        byKey.set(`comment:${comment.id}`, {
          platform,
          community: community ?? post.subreddit ?? null,
          sourceType: 'comment',
          sourceId: comment.id,
          parentSourceId: comment.parent_id ?? post.id,
          title: null,
          body: comment.content ?? null,
          url: comment.url ?? null,
          sourceCreatedAt: this.parseDate(comment.created_at, now),
          collectedAt: now,
          scoreSnapshot: Number.isFinite(comment.score) ? comment.score : null,
          rawPayload: {
            id: comment.id,
            content: comment.content ?? null,
            author: comment.author ?? null,
            score: Number.isFinite(comment.score) ? comment.score : null,
            created_at: comment.created_at ?? null,
            parent_id: comment.parent_id ?? null,
            url: comment.url ?? null,
            post_id: post.id,
          },
        });
      });
    });

    return Array.from(byKey.values());
  }

  private toLightweightInputPayload(
    input: LLMModelInput,
  ): Prisma.InputJsonObject {
    return {
      posts: (input.posts ?? []).map(
        (post) =>
          ({
            id: post.id,
            title: post.title ?? null,
            content: post.content ?? null,
            extract_from_post: Boolean(post.extract_from_post),
            comments: (post.comments ?? []).map((comment) => ({
              id: comment.id,
              content: comment.content ?? null,
              parent_id: comment.parent_id ?? null,
            })),
          }) as Prisma.InputJsonValue,
      ),
    };
  }

  private toPersistedSourceMap(
    input: LLMProcessingInput,
  ): Prisma.InputJsonValue {
    const sourceMap = input.source_map;
    if (!sourceMap || Object.keys(sourceMap).length === 0) {
      throw new Error('Missing source_map for extraction input persistence');
    }

    return sourceMap as unknown as Prisma.InputJsonValue;
  }

  private buildInputDocumentLinks(
    input: LLMProcessingInput,
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>,
  ): Array<{ documentId: string; ordinal: number }> {
    const links: Array<{ documentId: string; ordinal: number }> = [];
    const seen = new Set<string>();
    let ordinal = 0;
    const sourceMap = input.source_map;
    const resolveCanonicalId = (sourceId: string) => {
      const canonicalId = sourceMap[sourceId]?.canonical_id;
      if (!canonicalId) {
        throw new Error(`Missing canonical mapping for source ref ${sourceId}`);
      }
      return canonicalId;
    };

    (input.posts ?? []).forEach((post) => {
      const postDocumentId = sourceDocumentIdBySourceKey.get(
        buildSourceDocumentKey('post', resolveCanonicalId(post.id)),
      );
      if (postDocumentId && !seen.has(postDocumentId)) {
        links.push({ documentId: postDocumentId, ordinal });
        seen.add(postDocumentId);
        ordinal += 1;
      }

      (post.comments ?? []).forEach((comment) => {
        const commentDocumentId = sourceDocumentIdBySourceKey.get(
          buildSourceDocumentKey('comment', resolveCanonicalId(comment.id)),
        );
        if (commentDocumentId && !seen.has(commentDocumentId)) {
          links.push({ documentId: commentDocumentId, ordinal });
          seen.add(commentDocumentId);
          ordinal += 1;
        }
      });
    });

    return links;
  }

  private parseDate(value: string | undefined, fallback: Date): Date {
    const parsed = value ? new Date(value) : fallback;
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }
}
