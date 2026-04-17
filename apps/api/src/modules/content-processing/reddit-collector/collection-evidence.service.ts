import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { ChunkProcessingResult } from '../../external-integrations/llm/llm-concurrent-processing.service';
import { LLMPost } from '../../external-integrations/llm/llm.types';

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

  async persistExtractionInputs(params: {
    extractionRunId: string;
    chunkResults: ChunkProcessingResult[];
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
          inputPayload: this.toLightweightInputPayload(chunk.input.posts),
          rawOutput:
            chunk.result === null
              ? Prisma.JsonNull
              : (chunk.result as unknown as Prisma.InputJsonValue),
        },
        select: { inputId: true },
      });

      const inputDocumentLinks = this.buildInputDocumentLinks(
        chunk.input.posts,
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

  async markExtractionRunFailed(
    extractionRunId: string,
    errorMessage: string,
  ): Promise<void> {
    const run = await this.prismaService.extractionRun.update({
      where: { extractionRunId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        metadata: {
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

  private toLightweightInputPayload(posts: LLMPost[]): Prisma.InputJsonObject {
    return {
      posts: posts.map(
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

  private buildInputDocumentLinks(
    posts: LLMPost[],
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>,
  ): Array<{ documentId: string; ordinal: number }> {
    const links: Array<{ documentId: string; ordinal: number }> = [];
    const seen = new Set<string>();
    let ordinal = 0;

    posts.forEach((post) => {
      const postDocumentId = sourceDocumentIdBySourceKey.get(
        buildSourceDocumentKey('post', post.id),
      );
      if (postDocumentId && !seen.has(postDocumentId)) {
        links.push({ documentId: postDocumentId, ordinal });
        seen.add(postDocumentId);
        ordinal += 1;
      }

      (post.comments ?? []).forEach((comment) => {
        const commentDocumentId = sourceDocumentIdBySourceKey.get(
          buildSourceDocumentKey('comment', comment.id),
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
