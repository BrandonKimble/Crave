import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import {
  LLMInputStructure,
  LLMPost,
} from '../../external-integrations/llm/llm.types';
import { BatchJob } from './batch-processing-queue.types';
import {
  ExtractionPipelineService,
  StoredExtractionInputChunk,
} from './extraction-pipeline.service';
import { ProjectionRebuildService } from './projection-rebuild.service';

type ReplaySourceDocument = {
  documentId: string;
  platform: string;
  community: string | null;
  sourceType: 'post' | 'comment';
  sourceId: string;
  parentSourceId: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  sourceCreatedAt: Date;
  scoreSnapshot: number | null;
  rawPayload: Prisma.JsonValue | null;
};

type ReplaySummary = {
  extractionRunId?: string;
  collectionRunId?: string;
  documentCount: number;
  chunkCount: number;
  restaurantCount: number;
  connectionCount: number;
  activated: boolean;
};

type ExtractionRunReplaySummary = ReplaySummary & {
  sourceExtractionRunId: string;
};

type CollectionRunReplaySummary = ReplaySummary & {
  sourceCollectionRunId: string;
  extractionRunCount: number;
};

@Injectable()
export class ReplayService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly extractionPipelineService: ExtractionPipelineService,
    private readonly projectionRebuildService: ProjectionRebuildService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ReplayService');
  }

  async replayExtractionRun(params: {
    sourceExtractionRunId: string;
    activate?: boolean;
  }): Promise<ExtractionRunReplaySummary> {
    const sourceRun = await this.prismaService.extractionRun.findUnique({
      where: { extractionRunId: params.sourceExtractionRunId },
      select: {
        extractionRunId: true,
        pipeline: true,
        metadata: true,
        inputs: {
          orderBy: { inputIndex: 'asc' },
          select: {
            inputId: true,
            inputIndex: true,
            inputPayload: true,
            sourceDocuments: {
              orderBy: { ordinal: 'asc' },
              select: {
                document: {
                  select: {
                    documentId: true,
                    platform: true,
                    community: true,
                    sourceType: true,
                    sourceId: true,
                    parentSourceId: true,
                    title: true,
                    body: true,
                    url: true,
                    sourceCreatedAt: true,
                    scoreSnapshot: true,
                    rawPayload: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!sourceRun) {
      throw new Error(
        `Extraction run ${params.sourceExtractionRunId} was not found`,
      );
    }

    if (!sourceRun.inputs.length) {
      throw new Error(
        `Extraction run ${params.sourceExtractionRunId} has no stored inputs to replay`,
      );
    }

    const sourceDocuments = this.collectSourceDocumentsFromInputs(
      sourceRun.inputs,
    );
    const llmPosts = this.buildPostsFromSourceDocuments(sourceDocuments);
    const inputChunks = sourceRun.inputs.map<StoredExtractionInputChunk>(
      (input) => ({
        inputIndex: input.inputIndex,
        inputPayload: this.asInputPayload(input.inputPayload),
        sourceDocumentIds: input.sourceDocuments.map(
          (documentLink) => documentLink.document.documentId,
        ),
        sourceInputId: input.inputId,
      }),
    );

    const replayResult =
      await this.extractionPipelineService.processStoredInputs({
        pipeline: this.normalizePipeline(sourceRun.pipeline),
        platform: sourceDocuments[0]?.platform ?? 'reddit',
        community: this.resolveCommunity(
          sourceDocuments,
          this.asRecord(sourceRun.metadata),
        ),
        llmPosts,
        inputChunks,
        sourceDocuments: sourceDocuments.map((document) => ({
          documentId: document.documentId,
          sourceType: document.sourceType,
          sourceId: document.sourceId,
        })),
        batchId: `replay-run-${params.sourceExtractionRunId}-${Date.now()}`,
        parentJobId: params.sourceExtractionRunId,
        collectionRunScopeKey: `replay:extraction:${params.sourceExtractionRunId}`,
        activateDocumentsBeforeProcessing: params.activate === true,
        skipSourceLedgerDedupe: true,
        runMetadata: {
          replaySource: 'extraction_run',
          replayOfExtractionRunId: params.sourceExtractionRunId,
        },
      });

    this.logger.info('Replay extraction run completed', {
      sourceExtractionRunId: params.sourceExtractionRunId,
      extractionRunId: replayResult.extractionRunId,
      documentCount: sourceDocuments.length,
      chunkCount: inputChunks.length,
      restaurantCount: replayResult.dbResult.affectedRestaurantIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    });

    return {
      sourceExtractionRunId: params.sourceExtractionRunId,
      extractionRunId: replayResult.extractionRunId,
      collectionRunId: undefined,
      documentCount: sourceDocuments.length,
      chunkCount: inputChunks.length,
      restaurantCount: replayResult.dbResult.affectedRestaurantIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    };
  }

  async replayDateRange(params: {
    platform: string;
    community?: string | null;
    start: Date;
    end: Date;
    pipeline?: BatchJob['collectionType'];
    activate?: boolean;
  }): Promise<ReplaySummary> {
    const sourceDocuments = await this.loadDateRangeSourceDocuments(params);
    if (!sourceDocuments.length) {
      throw new Error('No source documents matched the requested replay range');
    }

    const llmPosts = this.buildPostsFromSourceDocuments(sourceDocuments);
    const replayResult = await this.extractionPipelineService.processPosts({
      pipeline: params.pipeline ?? 'chronological',
      platform: params.platform,
      community: this.resolveCommunity(sourceDocuments),
      llmPosts,
      batchId: `replay-date-range-${Date.now()}`,
      parentJobId: null,
      collectionRunScopeKey: `replay:date-range:${params.platform}:${params.start.toISOString()}:${params.end.toISOString()}`,
      activateDocumentsBeforeProcessing: params.activate === true,
      skipSourceLedgerDedupe: true,
      runMetadata: {
        replaySource: 'date_range',
        platform: params.platform,
        community: params.community ?? null,
        start: params.start.toISOString(),
        end: params.end.toISOString(),
      },
    });

    this.logger.info('Replay date-range extraction completed', {
      extractionRunId: replayResult.extractionRunId,
      platform: params.platform,
      community: params.community ?? null,
      start: params.start.toISOString(),
      end: params.end.toISOString(),
      documentCount: sourceDocuments.length,
      chunkCount: replayResult.chunkStats.chunkCount,
      restaurantCount: replayResult.dbResult.affectedRestaurantIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    });

    return {
      extractionRunId: replayResult.extractionRunId,
      collectionRunId: undefined,
      documentCount: sourceDocuments.length,
      chunkCount: replayResult.chunkStats.chunkCount,
      restaurantCount: replayResult.dbResult.affectedRestaurantIds.length,
      connectionCount: replayResult.dbResult.affectedConnectionIds.length,
      activated: params.activate === true,
    };
  }

  async replayCollectionRun(params: {
    sourceCollectionRunId: string;
    activate?: boolean;
  }): Promise<CollectionRunReplaySummary> {
    const sourceCollectionRun =
      await this.prismaService.collectionRun.findUnique({
        where: { collectionRunId: params.sourceCollectionRunId },
        select: {
          collectionRunId: true,
          scopeKey: true,
          pipeline: true,
          platform: true,
          community: true,
          extractionRuns: {
            orderBy: { startedAt: 'asc' },
            select: {
              extractionRunId: true,
              pipeline: true,
              metadata: true,
              inputs: {
                orderBy: { inputIndex: 'asc' },
                select: {
                  inputId: true,
                  inputIndex: true,
                  inputPayload: true,
                  sourceDocuments: {
                    orderBy: { ordinal: 'asc' },
                    select: {
                      document: {
                        select: {
                          documentId: true,
                          platform: true,
                          community: true,
                          sourceType: true,
                          sourceId: true,
                          parentSourceId: true,
                          title: true,
                          body: true,
                          url: true,
                          sourceCreatedAt: true,
                          scoreSnapshot: true,
                          rawPayload: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!sourceCollectionRun) {
      throw new Error(
        `Collection run ${params.sourceCollectionRunId} was not found`,
      );
    }

    if (!sourceCollectionRun.extractionRuns.length) {
      throw new Error(
        `Collection run ${params.sourceCollectionRunId} has no extraction runs to replay`,
      );
    }

    const targetCollectionRunScopeKey = `replay:collection:${params.sourceCollectionRunId}:${Date.now()}`;
    let documentCount = 0;
    let chunkCount = 0;
    let restaurantCount = 0;
    let connectionCount = 0;

    for (const sourceRun of sourceCollectionRun.extractionRuns) {
      if (!sourceRun.inputs.length) {
        continue;
      }

      const sourceDocuments = this.collectSourceDocumentsFromInputs(
        sourceRun.inputs,
      );
      const llmPosts = this.buildPostsFromSourceDocuments(sourceDocuments);
      const inputChunks = sourceRun.inputs.map<StoredExtractionInputChunk>(
        (input) => ({
          inputIndex: input.inputIndex,
          inputPayload: this.asInputPayload(input.inputPayload),
          sourceDocumentIds: input.sourceDocuments.map(
            (documentLink) => documentLink.document.documentId,
          ),
          sourceInputId: input.inputId,
        }),
      );

      const replayResult =
        await this.extractionPipelineService.processStoredInputs({
          pipeline: this.normalizePipeline(sourceRun.pipeline),
          platform:
            sourceDocuments[0]?.platform ??
            sourceCollectionRun.platform ??
            'reddit',
          community:
            this.resolveCommunity(
              sourceDocuments,
              this.asRecord(sourceRun.metadata),
            ) ||
            sourceCollectionRun.community ||
            'unknown',
          llmPosts,
          inputChunks,
          sourceDocuments: sourceDocuments.map((document) => ({
            documentId: document.documentId,
            sourceType: document.sourceType,
            sourceId: document.sourceId,
          })),
          batchId: `replay-collection-run-${sourceRun.extractionRunId}-${Date.now()}`,
          parentJobId: sourceRun.extractionRunId,
          collectionRunScopeKey: targetCollectionRunScopeKey,
          activateDocumentsBeforeProcessing: params.activate === true,
          skipSourceLedgerDedupe: true,
          runMetadata: {
            replaySource: 'collection_run',
            replayOfCollectionRunId: params.sourceCollectionRunId,
            replayOfExtractionRunId: sourceRun.extractionRunId,
          },
        });

      documentCount += sourceDocuments.length;
      chunkCount += inputChunks.length;
      restaurantCount += replayResult.dbResult.affectedRestaurantIds.length;
      connectionCount += replayResult.dbResult.affectedConnectionIds.length;
    }

    const targetCollectionRun =
      await this.prismaService.collectionRun.findUnique({
        where: { scopeKey: targetCollectionRunScopeKey },
        select: {
          collectionRunId: true,
          extractionRuns: { select: { extractionRunId: true } },
        },
      });

    if (!targetCollectionRun) {
      throw new Error(
        'Replay collection run completed without creating a target collection run',
      );
    }

    return {
      sourceCollectionRunId: params.sourceCollectionRunId,
      extractionRunId: undefined,
      collectionRunId: targetCollectionRun.collectionRunId,
      documentCount,
      chunkCount,
      restaurantCount,
      connectionCount,
      extractionRunCount: targetCollectionRun.extractionRuns.length,
      activated: params.activate === true,
    };
  }

  /**
   * Cut a contiguous document subset over to an already-created extraction run.
   * This keeps replay self-documenting:
   * 1. select documents
   * 2. activate run for those documents
   * 3. rebuild affected restaurant projections
   * 4. refresh quality scores
   */
  async activateExtractionRunForDateRange(params: {
    extractionRunId: string;
    platform: string;
    community?: string | null;
    start: Date;
    end: Date;
  }): Promise<{
    extractionRunId: string;
    documentCount: number;
    restaurantCount: number;
    connectionCount: number;
  }> {
    const documents = await this.prismaService.sourceDocument.findMany({
      where: {
        platform: params.platform,
        community: params.community ?? undefined,
        sourceCreatedAt: {
          gte: params.start,
          lte: params.end,
        },
      },
      select: { documentId: true },
      orderBy: { sourceCreatedAt: 'asc' },
    });

    return this.activateExtractionRunForDocuments({
      extractionRunId: params.extractionRunId,
      documentIds: documents.map((document) => document.documentId),
    });
  }

  async activateExtractionRunForDocuments(params: {
    extractionRunId: string;
    documentIds: string[];
  }): Promise<{
    extractionRunId: string;
    documentCount: number;
    restaurantCount: number;
    connectionCount: number;
  }> {
    const documentIds = Array.from(
      new Set(
        params.documentIds.filter((value): value is string => Boolean(value)),
      ),
    );

    if (!documentIds.length) {
      return {
        extractionRunId: params.extractionRunId,
        documentCount: 0,
        restaurantCount: 0,
        connectionCount: 0,
      };
    }

    const restaurantIds = await this.collectAffectedRestaurantIds(documentIds);

    await this.prismaService.sourceDocument.updateMany({
      where: {
        documentId: { in: documentIds },
      },
      data: {
        activeExtractionRunId: params.extractionRunId,
      },
    });

    const rebuildResult =
      await this.projectionRebuildService.rebuildForRestaurants(restaurantIds);

    await this.projectionRebuildService.refreshQualityScores({
      connectionIds: rebuildResult.connectionIds,
      restaurantIds: rebuildResult.restaurantIds,
    });

    this.logger.info('Activated extraction run for document subset', {
      extractionRunId: params.extractionRunId,
      documentCount: documentIds.length,
      restaurantCount: rebuildResult.restaurantIds.length,
      connectionCount: rebuildResult.connectionIds.length,
    });

    return {
      extractionRunId: params.extractionRunId,
      documentCount: documentIds.length,
      restaurantCount: rebuildResult.restaurantIds.length,
      connectionCount: rebuildResult.connectionIds.length,
    };
  }

  private async loadDateRangeSourceDocuments(params: {
    platform: string;
    community?: string | null;
    start: Date;
    end: Date;
  }): Promise<ReplaySourceDocument[]> {
    const documents = await this.prismaService.sourceDocument.findMany({
      where: {
        platform: params.platform,
        community: params.community ?? undefined,
        sourceCreatedAt: {
          gte: params.start,
          lte: params.end,
        },
      },
      orderBy: { sourceCreatedAt: 'asc' },
      select: {
        documentId: true,
        platform: true,
        community: true,
        sourceType: true,
        sourceId: true,
        parentSourceId: true,
        title: true,
        body: true,
        url: true,
        sourceCreatedAt: true,
        scoreSnapshot: true,
        rawPayload: true,
      },
    });

    if (!documents.length) {
      return [];
    }

    const postsById = new Map(
      documents
        .filter((document) => document.sourceType === 'post')
        .map((document) => [document.sourceId, document] as const),
    );
    const missingPostIds = new Set<string>();

    documents.forEach((document) => {
      if (document.sourceType !== 'comment') {
        return;
      }
      const rawPayload = this.asRecord(document.rawPayload);
      const postId =
        this.asString(rawPayload?.post_id) ?? document.parentSourceId ?? null;
      if (postId && !postsById.has(postId)) {
        missingPostIds.add(postId);
      }
    });

    if (!missingPostIds.size) {
      return documents;
    }

    const parentPosts = await this.prismaService.sourceDocument.findMany({
      where: {
        platform: params.platform,
        sourceType: 'post',
        sourceId: { in: Array.from(missingPostIds) },
      },
      select: {
        documentId: true,
        platform: true,
        community: true,
        sourceType: true,
        sourceId: true,
        parentSourceId: true,
        title: true,
        body: true,
        url: true,
        sourceCreatedAt: true,
        scoreSnapshot: true,
        rawPayload: true,
      },
    });

    return [...documents, ...parentPosts];
  }

  private buildPostsFromSourceDocuments(
    sourceDocuments: ReplaySourceDocument[],
  ): LLMPost[] {
    const postsById = new Map<string, LLMPost>();
    const commentsByPostId = new Map<string, LLMPost['comments']>();

    const sortedDocuments = [...sourceDocuments].sort(
      (left, right) =>
        left.sourceCreatedAt.getTime() - right.sourceCreatedAt.getTime(),
    );

    sortedDocuments.forEach((document) => {
      const rawPayload = this.asRecord(document.rawPayload);
      if (document.sourceType === 'post') {
        postsById.set(document.sourceId, {
          id: document.sourceId,
          title: this.asString(rawPayload?.title) ?? document.title ?? '',
          content: this.asString(rawPayload?.content) ?? document.body ?? '',
          subreddit:
            this.asString(rawPayload?.subreddit) ?? document.community ?? '',
          author: this.asString(rawPayload?.author) ?? '',
          url: this.asString(rawPayload?.url) ?? document.url ?? '',
          score:
            this.asNumber(rawPayload?.score) ?? document.scoreSnapshot ?? 0,
          created_at:
            this.asString(rawPayload?.created_at) ??
            document.sourceCreatedAt.toISOString(),
          comments: [],
          extract_from_post: this.asBoolean(rawPayload?.extract_from_post),
        });
        return;
      }

      const postId =
        this.asString(rawPayload?.post_id) ?? document.parentSourceId ?? null;
      if (!postId) {
        return;
      }

      const comment = {
        id: document.sourceId,
        content: this.asString(rawPayload?.content) ?? document.body ?? '',
        author: this.asString(rawPayload?.author) ?? '',
        score: this.asNumber(rawPayload?.score) ?? document.scoreSnapshot ?? 0,
        created_at:
          this.asString(rawPayload?.created_at) ??
          document.sourceCreatedAt.toISOString(),
        parent_id:
          this.asString(rawPayload?.parent_id) ?? document.parentSourceId,
        url: this.asString(rawPayload?.url) ?? document.url ?? '',
      };

      const comments = commentsByPostId.get(postId) ?? [];
      comments.push(comment);
      commentsByPostId.set(postId, comments);
    });

    return Array.from(postsById.values())
      .map((post) => ({
        ...post,
        comments: [...(commentsByPostId.get(post.id) ?? [])].sort(
          (left, right) =>
            new Date(left.created_at).getTime() -
            new Date(right.created_at).getTime(),
        ),
      }))
      .sort(
        (left, right) =>
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime(),
      );
  }

  private collectSourceDocumentsFromInputs(
    inputs: Array<{
      sourceDocuments: Array<{ document: ReplaySourceDocument }>;
    }>,
  ): ReplaySourceDocument[] {
    const documentsById = new Map<string, ReplaySourceDocument>();

    inputs.forEach((input) => {
      input.sourceDocuments.forEach((documentLink) => {
        documentsById.set(
          documentLink.document.documentId,
          documentLink.document,
        );
      });
    });

    return Array.from(documentsById.values()).sort(
      (left, right) =>
        left.sourceCreatedAt.getTime() - right.sourceCreatedAt.getTime(),
    );
  }

  private async collectAffectedRestaurantIds(
    documentIds: string[],
  ): Promise<string[]> {
    const [restaurantEvents, restaurantEntityEvents] = await Promise.all([
      this.prismaService.restaurantEvent.findMany({
        where: { sourceDocumentId: { in: documentIds } },
        select: { restaurantId: true },
      }),
      this.prismaService.restaurantEntityEvent.findMany({
        where: { sourceDocumentId: { in: documentIds } },
        select: { restaurantId: true },
      }),
    ]);

    return Array.from(
      new Set([
        ...restaurantEvents.map((event) => event.restaurantId),
        ...restaurantEntityEvents.map((event) => event.restaurantId),
      ]),
    );
  }

  private resolveCommunity(
    sourceDocuments: ReplaySourceDocument[],
    metadata?: Record<string, Prisma.JsonValue> | null,
  ): string {
    const communityFromDocs = sourceDocuments.find(
      (document) =>
        typeof document.community === 'string' && document.community.length > 0,
    )?.community;
    if (communityFromDocs) {
      return communityFromDocs;
    }

    const metadataSubreddit = this.asString(metadata?.subreddit);
    if (metadataSubreddit) {
      return metadataSubreddit;
    }

    return 'unknown';
  }

  private normalizePipeline(
    pipeline: string | null | undefined,
  ): BatchJob['collectionType'] {
    if (
      pipeline === 'chronological' ||
      pipeline === 'keyword' ||
      pipeline === 'archive' ||
      pipeline === 'on-demand'
    ) {
      return pipeline;
    }

    return 'chronological';
  }

  private asInputPayload(value: Prisma.JsonValue): LLMInputStructure {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { posts: [] };
    }
    return value as unknown as LLMInputStructure;
  }

  private asRecord(
    value: Prisma.JsonValue | undefined | null,
  ): Record<string, Prisma.JsonValue> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, Prisma.JsonValue>;
  }

  private asString(value: Prisma.JsonValue | undefined | null): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private asNumber(value: Prisma.JsonValue | undefined | null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private asBoolean(value: Prisma.JsonValue | undefined | null): boolean {
    return value === true;
  }
}
