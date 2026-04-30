import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  ChunkMetadata,
  ChunkResult,
  LLMChunkingService,
} from '../../external-integrations/llm/llm-chunking.service';
import {
  ChunkProcessingResult,
  LLMConcurrentProcessingService,
  ProcessingResult as ConcurrentProcessingResult,
} from '../../external-integrations/llm/llm-concurrent-processing.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  EnrichedLLMMention,
  EnrichedLLMOutputStructure,
  LLMComment,
  LLMModelInput,
  LLMMention,
  LLMPost,
  LLMProcessingInput,
  LLMSourceMap,
  LLMSourceMapEntry,
} from '../../external-integrations/llm/llm.types';
import {
  buildSourceDocumentKey,
  CollectionEvidenceService,
  ExtractionTraceContext,
  SourceDocumentKey,
} from './collection-evidence.service';
import { UnifiedProcessingService } from './unified-processing.service';
import { BatchJob } from './batch-processing-queue.types';

type SourceBreakdown = {
  pushshift_archive: number;
  reddit_api_chronological: number;
  reddit_api_keyword_search: number;
  reddit_api_on_demand: number;
};

type UnifiedProcessingDatabaseResult = Awaited<
  ReturnType<UnifiedProcessingService['processLLMOutput']>
>;

type SourceEnrichmentMaps = {
  metadataById: Map<
    string,
    {
      type: 'post' | 'comment';
      ups: number;
      url: string;
      created_at: string;
      subreddit: string;
    }
  >;
  contentById: Map<string, string>;
  postContextBySource: Map<string, string>;
};

type HydratingMention = LLMMention &
  Partial<
    Pick<
      EnrichedLLMMention,
      | 'source_type'
      | 'source_id'
      | 'source_content'
      | 'source_ups'
      | 'source_url'
      | 'source_created_at'
      | 'subreddit'
      | 'post_context'
      | '__inputChunkId'
      | '__extractionInputId'
      | '__sourceDocumentId'
    >
  >;

export interface StoredExtractionInputChunk {
  inputIndex: number;
  inputPayload: LLMModelInput;
  sourceMap: LLMSourceMap;
  sourceDocumentIds: string[];
  sourceInputId?: string | null;
}

type ProcessingChunkResult = ChunkResult<LLMProcessingInput>;

interface ExtractionPipelineBaseParams {
  pipeline: BatchJob['collectionType'];
  community: string;
  batchId: string;
  parentJobId?: string | null;
  collectionRunScopeKey?: string | null;
  platform?: string | null;
  searchEntity?: string;
  activateDocumentsBeforeProcessing?: boolean;
  skipSourceLedgerDedupe?: boolean;
  runMetadata?: Record<string, unknown>;
}

export interface ExtractionPipelinePostsParams
  extends ExtractionPipelineBaseParams {
  llmPosts: LLMPost[];
}

export interface ExtractionPipelineStoredInputsParams
  extends ExtractionPipelineBaseParams {
  llmPosts: LLMPost[];
  inputChunks: StoredExtractionInputChunk[];
  sourceDocuments: Array<{
    documentId: string;
    sourceType: 'post' | 'comment';
    sourceId: string;
  }>;
}

export interface ExtractionPipelineResult {
  extractionRunId: string;
  llmOutput: EnrichedLLMOutputStructure;
  rawMentionsSample: EnrichedLLMMention[];
  dbResult: UnifiedProcessingDatabaseResult;
  llmProcessingTimeMs: number;
  dbProcessingTimeMs: number;
  chunkDurationMs: number;
  chunkStats: {
    chunkCount: number;
    totalComments: number;
    avgComments: number;
    minComments: number;
    maxComments: number;
    avgEstimatedTokens: number;
    maxEstimatedTokens: number;
  };
  processingMetrics: ConcurrentProcessingResult['metrics'];
}

@Injectable()
export class ExtractionPipelineService implements OnModuleInit {
  private static readonly SOURCE_REF_PREFIX = 'SRC';
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly llmChunkingService: LLMChunkingService,
    private readonly llmConcurrentService: LLMConcurrentProcessingService,
    private readonly llmService: LLMService,
    private readonly collectionEvidenceService: CollectionEvidenceService,
    private readonly unifiedProcessingService: UnifiedProcessingService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ExtractionPipelineService');
  }

  async processPosts(
    params: ExtractionPipelinePostsParams,
  ): Promise<ExtractionPipelineResult> {
    const llmInput: LLMModelInput = { posts: params.llmPosts };
    const sourceDocumentIdBySourceKey =
      await this.collectionEvidenceService.persistSourceDocuments({
        platform: 'reddit',
        community: params.community,
        posts: params.llmPosts,
      });

    const chunkStartTime = Date.now();
    const chunkData = this.normalizeSourceRefsInChunkData(
      this.llmChunkingService.createContextualChunks(llmInput),
    );
    const chunkDurationMs = Date.now() - chunkStartTime;

    return this.processChunkPlan({
      baseParams: params,
      llmPosts: params.llmPosts,
      chunkData,
      sourceDocumentIdBySourceKey,
      chunkDurationMs,
      activateDocumentIds: params.activateDocumentsBeforeProcessing
        ? Array.from(new Set(sourceDocumentIdBySourceKey.values()))
        : [],
    });
  }

  async processStoredInputs(
    params: ExtractionPipelineStoredInputsParams,
  ): Promise<ExtractionPipelineResult> {
    this.assertStoredInputsUseSourceRefs(params.inputChunks);

    const sourceDocumentIdBySourceKey = new Map<SourceDocumentKey, string>(
      params.sourceDocuments.map((document) => [
        buildSourceDocumentKey(document.sourceType, document.sourceId),
        document.documentId,
      ]),
    );
    const chunkStartTime = Date.now();
    const chunkData = this.normalizeSourceRefsInChunkData(
      this.buildChunkDataFromStoredInputs(params.inputChunks),
    );
    const chunkDurationMs = Date.now() - chunkStartTime;

    return this.processChunkPlan({
      baseParams: params,
      llmPosts: params.llmPosts,
      chunkData,
      sourceDocumentIdBySourceKey,
      activateDocumentIds: params.activateDocumentsBeforeProcessing
        ? Array.from(
            new Set(
              params.inputChunks.flatMap((chunk) => chunk.sourceDocumentIds),
            ),
          )
        : [],
      chunkDurationMs,
      chunkingConfigOverride: {
        source: 'stored_inputs',
        inputCount: params.inputChunks.length,
        sourceInputIds: params.inputChunks
          .map((chunk) => chunk.sourceInputId ?? null)
          .filter((value): value is string => Boolean(value)),
      },
    });
  }

  private async processChunkPlan(params: {
    baseParams: ExtractionPipelineBaseParams;
    llmPosts: LLMPost[];
    chunkData: ProcessingChunkResult;
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>;
    activateDocumentIds: string[];
    chunkDurationMs: number;
    chunkingConfigOverride?: Record<string, unknown>;
  }): Promise<ExtractionPipelineResult> {
    let extractionRunId: string | null = null;

    try {
      extractionRunId =
        await this.collectionEvidenceService.createExtractionRun({
          pipeline: params.baseParams.pipeline,
          collectionRunScopeKey:
            params.baseParams.collectionRunScopeKey?.trim() ||
            params.baseParams.parentJobId?.trim() ||
            params.baseParams.batchId,
          platform: params.baseParams.platform ?? 'reddit',
          community: params.baseParams.community,
          model: this.llmService.getContentModel(),
          systemPrompt: this.llmService.getSystemPrompt(),
          generationConfig: this.llmService.getGenerationConfigSnapshot(),
          chunkingConfig:
            params.chunkingConfigOverride ??
            this.buildChunkingConfigSnapshot(params.chunkData),
          extractionSchemaVersion: 'v1',
          metadata: {
            batchId: params.baseParams.batchId,
            parentJobId: params.baseParams.parentJobId ?? null,
            subreddit: params.baseParams.community,
            ...(params.baseParams.runMetadata ?? {}),
          },
        });

      const llmStartTime = Date.now();
      const processingResult: ConcurrentProcessingResult<LLMProcessingInput> =
        await this.llmConcurrentService.processConcurrent(
          params.chunkData,
          this.llmService,
        );

      const extractionInputIdByChunkId =
        await this.collectionEvidenceService.persistExtractionInputs({
          extractionRunId,
          chunkResults: processingResult.chunkResults,
          sourceDocumentIdBySourceKey: params.sourceDocumentIdBySourceKey,
        });

      if (params.activateDocumentIds.length > 0) {
        await this.collectionEvidenceService.activateRunForDocuments(
          extractionRunId,
          params.activateDocumentIds,
        );
      }

      const flatMentions: HydratingMention[] =
        processingResult.chunkResults.flatMap((chunkResult) =>
          (chunkResult.result?.mentions ?? []).map((mention) => ({
            ...mention,
            source_id: this.resolveCanonicalSourceIdForMention(
              mention.source_id,
              chunkResult.input,
              chunkResult.chunkId,
            ),
            __inputChunkId: chunkResult.chunkId,
            __extractionInputId:
              extractionInputIdByChunkId.get(chunkResult.chunkId) ?? null,
          })),
        );

      const enrichment = this.buildSourceEnrichmentMaps(params.llmPosts);
      const llmOutput: EnrichedLLMOutputStructure = {
        mentions: flatMentions.map((mention) => {
          const canonicalSourceId = mention.source_id?.trim();
          if (!canonicalSourceId) {
            throw new Error('Missing source_id in model output');
          }
          const metadata = enrichment.metadataById.get(canonicalSourceId);
          if (!metadata) {
            throw new Error(
              `Unable to resolve source metadata for source_id=${canonicalSourceId}`,
            );
          }
          const contentOverride =
            enrichment.contentById.get(canonicalSourceId) ??
            mention.source_content ??
            '';
          const postContext =
            enrichment.postContextBySource.get(canonicalSourceId) ?? '';
          const sourceType =
            metadata.type ??
            mention.source_type ??
            this.inferSourceTypeFromSourceId(canonicalSourceId);
          if (!sourceType) {
            throw new Error(
              `Unable to resolve source type for mention source_id=${canonicalSourceId}`,
            );
          }
          const sourceUps = metadata.ups ?? mention.source_ups ?? 0;
          const sourceUrl = metadata.url ?? mention.source_url ?? '';
          const createdAt =
            metadata.created_at ??
            mention.source_created_at ??
            new Date().toISOString();
          const subreddit =
            metadata.subreddit ?? mention.subreddit ?? 'unknown';
          const sourceDocumentId = sourceType
            ? (params.sourceDocumentIdBySourceKey.get(
                buildSourceDocumentKey(sourceType, canonicalSourceId),
              ) ?? null)
            : null;

          return {
            ...mention,
            source_id: canonicalSourceId,
            source_content: contentOverride,
            source_type: sourceType,
            source_ups: sourceUps,
            source_url: sourceUrl,
            source_created_at: createdAt,
            subreddit,
            post_context: postContext,
            __sourceDocumentId: sourceDocumentId,
          };
        }),
      };

      this.ensureSurfaceDefaults(llmOutput.mentions);
      this.normalizeRestaurantNames(llmOutput.mentions, enrichment);
      this.dropDuplicateRestaurantMentions(llmOutput.mentions, enrichment);

      const rawMentionsSample = [...llmOutput.mentions];
      const llmProcessingTimeMs = Date.now() - llmStartTime;

      const dbStartTime = Date.now();
      const sourceBreakdown = this.buildSourceBreakdown(
        params.baseParams.pipeline,
        params.llmPosts.length,
      );
      const temporalRange =
        this.computeTemporalRange(params.llmPosts) ?? undefined;
      const extractionTrace: ExtractionTraceContext = {
        extractionRunId,
        sourceDocumentIdBySourceKey: params.sourceDocumentIdBySourceKey,
        extractionInputIdByChunkId,
      };

      const dbResult = await this.unifiedProcessingService.processLLMOutput(
        {
          mentions: llmOutput.mentions,
          sourceMetadata: {
            batchId: params.baseParams.batchId,
            collectionType: params.baseParams.pipeline,
            subreddit: params.baseParams.community,
            searchEntity: params.baseParams.searchEntity,
            sourceBreakdown,
            temporalRange,
            extractionTrace,
          },
        },
        {
          skipSourceLedgerDedupe: params.baseParams.skipSourceLedgerDedupe,
        },
      );
      const dbProcessingTimeMs = Date.now() - dbStartTime;

      await this.collectionEvidenceService.markExtractionRunCompleted(
        extractionRunId,
      );

      return {
        extractionRunId,
        llmOutput,
        rawMentionsSample,
        dbResult,
        llmProcessingTimeMs,
        dbProcessingTimeMs,
        chunkDurationMs: params.chunkDurationMs,
        chunkStats: this.summarizeChunkMetadata(params.chunkData.metadata),
        processingMetrics: processingResult.metrics,
      };
    } catch (error) {
      if (extractionRunId) {
        await this.collectionEvidenceService.markExtractionRunFailed(
          extractionRunId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }

  private buildSourceBreakdown(
    pipeline: ExtractionPipelineBaseParams['pipeline'],
    postCount: number,
  ): SourceBreakdown {
    return {
      pushshift_archive: pipeline === 'archive' ? postCount : 0,
      reddit_api_chronological: pipeline === 'chronological' ? postCount : 0,
      reddit_api_keyword_search: pipeline === 'keyword' ? postCount : 0,
      reddit_api_on_demand: pipeline === 'on-demand' ? postCount : 0,
    };
  }

  private buildChunkDataFromStoredInputs(
    inputChunks: StoredExtractionInputChunk[],
  ): ProcessingChunkResult {
    const sortedChunks = [...inputChunks].sort(
      (left, right) => left.inputIndex - right.inputIndex,
    );

    return {
      chunks: sortedChunks.map((chunk) =>
        this.buildStoredInputModelPayload(chunk),
      ),
      metadata: sortedChunks.map((chunk) =>
        this.createStoredInputMetadata(chunk),
      ),
    };
  }

  private buildStoredInputModelPayload(
    chunk: StoredExtractionInputChunk,
  ): LLMProcessingInput {
    return {
      ...chunk.inputPayload,
      source_map: chunk.sourceMap,
    };
  }

  private normalizeSourceRefsInChunkData(
    chunkData: ChunkResult<LLMModelInput>,
  ): ProcessingChunkResult {
    return {
      chunks: chunkData.chunks.map((chunk) =>
        this.normalizeSourceRefsInInput(chunk),
      ),
      metadata: chunkData.metadata,
    };
  }

  private normalizeSourceRefsInInput(
    input: LLMModelInput | LLMProcessingInput,
  ): LLMProcessingInput {
    const normalizedSourceMap = this.normalizeSourceMap(
      'source_map' in input ? input.source_map : undefined,
    );
    if (Object.keys(normalizedSourceMap).length > 0) {
      return this.assertSourceRefInput(input, normalizedSourceMap);
    }

    const canonicalToRef = new Map<string, string>();
    const refToEntry = new Map<string, LLMSourceMapEntry>();
    let nextRefIndex = 1;

    const assignRef = (
      canonicalId: string,
      sourceType: 'post' | 'comment',
      existingValue?: string | null,
    ): string => {
      const trimmedCanonicalId = canonicalId.trim();
      const existingRef =
        canonicalToRef.get(trimmedCanonicalId) ??
        this.findSourceRefForCanonicalId(
          normalizedSourceMap,
          trimmedCanonicalId,
          sourceType,
        );

      if (existingRef) {
        canonicalToRef.set(trimmedCanonicalId, existingRef);
        refToEntry.set(existingRef, {
          canonical_id: trimmedCanonicalId,
          source_type: sourceType,
        });
        return existingRef;
      }

      const preferredRef =
        typeof existingValue === 'string' && this.isSourceRef(existingValue)
          ? existingValue.trim()
          : null;
      let ref = preferredRef;

      while (!ref || refToEntry.has(ref)) {
        ref = this.formatSourceRef(nextRefIndex);
        nextRefIndex += 1;
      }

      canonicalToRef.set(trimmedCanonicalId, ref);
      refToEntry.set(ref, {
        canonical_id: trimmedCanonicalId,
        source_type: sourceType,
      });

      return ref;
    };

    const posts = (input.posts ?? []).map((post) => {
      const canonicalPostId = post.id.trim();
      const postRef = assignRef(canonicalPostId, 'post', post.id);

      const comments = (post.comments ?? []).map((comment) => {
        const canonicalCommentId = comment.id.trim();
        const commentRef = assignRef(
          canonicalCommentId,
          'comment',
          comment.id,
        );

        return {
          ...comment,
          id: commentRef,
        };
      });

      return {
        ...post,
        id: postRef,
        comments,
      };
    });

    const sourceMap = Object.fromEntries(refToEntry.entries());
    const postRefsByCanonicalId = new Map<string, string>();
    const commentRefsByCanonicalId = new Map<string, string>();

    Object.entries(sourceMap).forEach(([ref, entry]) => {
      if (entry.source_type === 'post') {
        postRefsByCanonicalId.set(entry.canonical_id, ref);
      } else {
        commentRefsByCanonicalId.set(entry.canonical_id, ref);
      }
    });

    return {
      posts: posts.map((post) => ({
        ...post,
        comments: (post.comments ?? []).map((comment) => ({
          ...comment,
          parent_id: this.resolveSourceRefParentId(
            comment.parent_id,
            sourceMap,
            postRefsByCanonicalId,
            commentRefsByCanonicalId,
          ),
        })),
      })),
      source_map: sourceMap,
    };
  }

  private normalizeSourceMap(sourceMap?: LLMSourceMap): LLMSourceMap {
    if (!sourceMap) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(sourceMap).map(([ref, entry]) => {
        const trimmedRef = ref.trim();
        const trimmedCanonicalId = entry?.canonical_id?.trim();
        const sourceType = entry?.source_type;

        if (!this.isSourceRef(trimmedRef)) {
          throw new Error(`Invalid source_map ref: ${ref}`);
        }
        if (!trimmedCanonicalId) {
          throw new Error(`Missing canonical_id for source_map ref: ${ref}`);
        }
        if (sourceType !== 'post' && sourceType !== 'comment') {
          throw new Error(`Invalid source_type for source_map ref: ${ref}`);
        }

        return [
          trimmedRef,
          {
            canonical_id: trimmedCanonicalId,
            source_type: sourceType,
          } satisfies LLMSourceMapEntry,
        ];
      }),
    );
  }

  private resolveSourceRefParentId(
    parentId: string | null | undefined,
    sourceMap: LLMSourceMap,
    postRefsByCanonicalId: Map<string, string>,
    commentRefsByCanonicalId: Map<string, string>,
  ): string | null {
    const trimmedParentId = parentId?.trim();
    if (!trimmedParentId) {
      return null;
    }

    const canonicalParentId = this.resolveCanonicalSourceIdFromInput(
      trimmedParentId,
      sourceMap,
    );
    const parentCandidates = [
      canonicalParentId,
      trimmedParentId,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of parentCandidates) {
      const commentRef = commentRefsByCanonicalId.get(candidate);
      if (commentRef) {
        return commentRef;
      }
      const postRef = postRefsByCanonicalId.get(candidate);
      if (postRef) {
        return postRef;
      }
    }

    return null;
  }

  private resolveCanonicalSourceIdFromInput(
    sourceId: string | null | undefined,
    sourceMap: LLMSourceMap,
  ): string | null {
    const trimmedSourceId = sourceId?.trim();
    if (!trimmedSourceId) {
      return null;
    }

    if (this.isSourceRef(trimmedSourceId)) {
      return sourceMap[trimmedSourceId]?.canonical_id ?? null;
    }

    return trimmedSourceId;
  }

  private resolveCanonicalSourceIdForMention(
    sourceId: string | null | undefined,
    input: LLMProcessingInput,
    chunkId: string,
  ): string {
    const trimmedSourceId = sourceId?.trim();
    if (!trimmedSourceId) {
      throw new Error('Missing source_id in model output');
    }

    const sourceMap = this.normalizeSourceMap(input.source_map);
    if (Object.keys(sourceMap).length === 0) {
      throw new Error(`Missing source_map for chunk=${chunkId}`);
    }

    const mappedSource = sourceMap[trimmedSourceId];
    if (!mappedSource) {
      const allowedRefs = Object.keys(sourceMap)
        .sort()
        .slice(0, 10)
        .join(', ');
      throw new Error(
        `Invalid source_id=${trimmedSourceId} for chunk=${chunkId}; expected one of ${allowedRefs}`,
      );
    }

    return mappedSource.canonical_id;
  }

  private findSourceRefForCanonicalId(
    sourceMap: LLMSourceMap,
    canonicalId: string,
    sourceType: 'post' | 'comment',
  ): string | null {
    for (const [ref, entry] of Object.entries(sourceMap)) {
      if (
        entry.canonical_id === canonicalId &&
        entry.source_type === sourceType
      ) {
        return ref;
      }
    }

    return null;
  }

  private getNextSourceRefIndex(sourceMap: LLMSourceMap): number {
    const numericSuffixes = Object.keys(sourceMap)
      .map((ref) => {
        const match = /^SRC(\d+)$/.exec(ref);
        return match ? Number.parseInt(match[1], 10) : null;
      })
      .filter((value): value is number => Number.isFinite(value));

    if (numericSuffixes.length === 0) {
      return 1;
    }

    return Math.max(...numericSuffixes) + 1;
  }

  private formatSourceRef(index: number): string {
    return `${ExtractionPipelineService.SOURCE_REF_PREFIX}${String(index).padStart(3, '0')}`;
  }

  private isSourceRef(value: string | null | undefined): boolean {
    return typeof value === 'string' && /^SRC\d+$/.test(value.trim());
  }

  private assertStoredInputsUseSourceRefs(
    inputChunks: StoredExtractionInputChunk[],
  ): void {
    inputChunks.forEach((chunk) => {
      if (!chunk.sourceMap || Object.keys(chunk.sourceMap).length === 0) {
        throw new Error(
          `Stored input ${chunk.sourceInputId ?? chunk.inputIndex} is missing source_map`,
        );
      }
      this.assertSourceRefInput(
        this.buildStoredInputModelPayload(chunk),
        this.normalizeSourceMap(chunk.sourceMap),
      );
    });
  }

  private assertSourceRefInput(
    input: LLMModelInput | LLMProcessingInput,
    sourceMap: LLMSourceMap,
  ): LLMProcessingInput {
    const posts = (input.posts ?? []).map((post) => {
      const postRef = post.id?.trim();
      const postEntry = postRef ? sourceMap[postRef] : null;
      if (!postRef || !this.isSourceRef(postRef) || !postEntry) {
        throw new Error(`Invalid post source ref: ${post.id ?? '<missing>'}`);
      }
      if (postEntry.source_type !== 'post') {
        throw new Error(`Post ref ${postRef} does not map to a post`);
      }

      const comments = (post.comments ?? []).map((comment) => {
        const commentRef = comment.id?.trim();
        const commentEntry = commentRef ? sourceMap[commentRef] : null;
        if (!commentRef || !this.isSourceRef(commentRef) || !commentEntry) {
          throw new Error(
            `Invalid comment source ref: ${comment.id ?? '<missing>'}`,
          );
        }
        if (commentEntry.source_type !== 'comment') {
          throw new Error(`Comment ref ${commentRef} does not map to a comment`);
        }

        return {
          ...comment,
          id: commentRef,
          parent_id: this.assertMappedParentRef(comment.parent_id, sourceMap),
        };
      });

      return {
        ...post,
        id: postRef,
        comments,
      };
    });

    return {
      posts,
      source_map: sourceMap,
    };
  }

  private assertMappedParentRef(
    parentId: string | null | undefined,
    sourceMap: LLMSourceMap,
  ): string | null {
    const trimmedParentId = parentId?.trim();
    if (!trimmedParentId) {
      return null;
    }

    if (!this.isSourceRef(trimmedParentId)) {
      throw new Error(`Parent source ref must use SRC format: ${trimmedParentId}`);
    }

    if (!sourceMap[trimmedParentId]) {
      throw new Error(`Parent source ref is missing from source_map: ${trimmedParentId}`);
    }

    return trimmedParentId;
  }

  private createStoredInputMetadata(
    chunk: StoredExtractionInputChunk,
  ): ChunkMetadata {
    const posts = Array.isArray(chunk.inputPayload.posts)
      ? chunk.inputPayload.posts
      : [];
    const comments = posts.flatMap((post) => post.comments ?? []);
    const estimatedTokenCount = this.estimateTokensFromInputPayload(
      chunk.inputPayload,
    );

    return {
      chunkId: chunk.sourceInputId
        ? `replay_input_${chunk.sourceInputId}`
        : `replay_input_index_${chunk.inputIndex}`,
      commentCount: comments.length,
      rootCommentScore: 0,
      estimatedProcessingTime: Math.max(5, comments.length * 6.4),
      threadRootId: posts[0]?.id ?? `replay_input_${chunk.inputIndex}`,
      rootCommentIds: comments
        .filter((comment) => {
          const parentId = comment.parent_id;
          return (
            !parentId ||
            parentId === posts[0]?.id ||
            parentId === posts[0]?.id.replace('t3_', '')
          );
        })
        .map((comment) => comment.id),
      rootCommentScores: [],
      postId: posts[0]?.id,
      postChunkIndex: chunk.inputIndex,
      estimatedTokenCount,
    };
  }

  private estimateTokensFromInputPayload(input: LLMModelInput): number {
    const charCount = (input.posts ?? []).reduce((sum, post) => {
      const postChars = (post.title?.length ?? 0) + (post.content?.length ?? 0);
      const commentChars = (post.comments ?? []).reduce(
        (commentSum, comment) => commentSum + (comment.content?.length ?? 0),
        0,
      );
      return sum + postChars + commentChars;
    }, 0);

    return Math.max(1, Math.floor(charCount / 4));
  }

  private inferSourceTypeFromSourceId(
    sourceId: string,
  ): 'post' | 'comment' | undefined {
    if (typeof sourceId !== 'string' || sourceId.length === 0) {
      return undefined;
    }

    if (sourceId.startsWith('t3_')) {
      return 'post';
    }

    if (sourceId.startsWith('t1_')) {
      return 'comment';
    }

    return undefined;
  }

  private buildChunkingConfigSnapshot(
    chunkData: ChunkResult,
  ): Record<string, unknown> {
    return {
      chunkCount: chunkData.metadata.length,
      chunkIds: chunkData.metadata.map((item) => item.chunkId),
      maxChunkComments: Number.parseInt(
        process.env.LLM_MAX_CHUNK_COMMENTS || '80',
        10,
      ),
      maxChunkChars: Number.parseInt(
        process.env.LLM_MAX_CHUNK_CHARS || '12000',
        10,
      ),
      targetChunkTokens: Number.parseInt(
        process.env.LLM_CHUNK_TARGET_TOKENS || '35000',
        10,
      ),
    };
  }

  private summarizeChunkMetadata(metadata: ChunkMetadata[]): {
    chunkCount: number;
    totalComments: number;
    avgComments: number;
    minComments: number;
    maxComments: number;
    avgEstimatedTokens: number;
    maxEstimatedTokens: number;
  } {
    if (!Array.isArray(metadata) || metadata.length === 0) {
      return {
        chunkCount: 0,
        totalComments: 0,
        avgComments: 0,
        minComments: 0,
        maxComments: 0,
        avgEstimatedTokens: 0,
        maxEstimatedTokens: 0,
      };
    }

    const commentCounts = metadata.map((item) => item.commentCount ?? 0);
    const estimatedTokens = metadata.map(
      (item) => item.estimatedTokenCount ?? 0,
    );
    const totalComments = commentCounts.reduce((sum, value) => sum + value, 0);
    const totalTokens = estimatedTokens.reduce((sum, value) => sum + value, 0);

    return {
      chunkCount: metadata.length,
      totalComments,
      avgComments: Math.round(totalComments / metadata.length),
      minComments: Math.min(...commentCounts),
      maxComments: Math.max(...commentCounts),
      avgEstimatedTokens: Math.round(totalTokens / metadata.length),
      maxEstimatedTokens: Math.max(...estimatedTokens),
    };
  }

  private buildSourceEnrichmentMaps(llmPosts: LLMPost[]): SourceEnrichmentMaps {
    const metadataById = new Map<
      string,
      {
        type: 'post' | 'comment';
        ups: number;
        url: string;
        created_at: string;
        subreddit: string;
      }
    >();
    const contentById = new Map<string, string>();
    const postContextBySource = new Map<string, string>();

    llmPosts.forEach((post) => {
      metadataById.set(post.id, {
        type: 'post',
        ups: post.score ?? 0,
        url: post.url ?? '',
        created_at: post.created_at ?? new Date().toISOString(),
        subreddit: post.subreddit ?? '',
      });
      contentById.set(post.id, post.content ?? '');
      postContextBySource.set(post.id, post.content ?? '');

      (post.comments ?? []).forEach((comment) => {
        metadataById.set(comment.id, {
          type: 'comment',
          ups: comment.score ?? 0,
          url: comment.url ?? '',
          created_at: comment.created_at ?? new Date().toISOString(),
          subreddit: post.subreddit ?? '',
        });
        contentById.set(comment.id, comment.content ?? '');
        postContextBySource.set(comment.id, post.content ?? '');
      });
    });

    return {
      metadataById,
      contentById,
      postContextBySource,
    };
  }

  private ensureSurfaceDefaults(mentions: EnrichedLLMMention[]): void {
    mentions.forEach((mention) => {
      mention.restaurant_surface =
        typeof mention.restaurant_surface === 'string' &&
        mention.restaurant_surface.trim().length > 0
          ? mention.restaurant_surface.trim()
          : mention.restaurant?.trim() || null;

      if (typeof mention.food === 'string' && mention.food.trim().length > 0) {
        mention.food_surface =
          typeof mention.food_surface === 'string' &&
          mention.food_surface.trim().length > 0
            ? mention.food_surface.trim()
            : mention.food.trim();
      } else {
        mention.food_surface = null;
      }

      if (Array.isArray(mention.food_categories)) {
        mention.food_category_surfaces = mention.food_categories.map(
          (category, index) => {
            const explicitSurface = Array.isArray(
              mention.food_category_surfaces,
            )
              ? mention.food_category_surfaces[index]
              : null;
            if (
              typeof explicitSurface === 'string' &&
              explicitSurface.trim().length > 0
            ) {
              return explicitSurface.trim();
            }
            return typeof category === 'string' && category.trim().length > 0
              ? category.trim()
              : null;
          },
        );
      }

      if (Array.isArray(mention.restaurant_attributes)) {
        mention.restaurant_attribute_surfaces =
          mention.restaurant_attributes.map((attribute, index) => {
            const explicitSurface = Array.isArray(
              mention.restaurant_attribute_surfaces,
            )
              ? mention.restaurant_attribute_surfaces[index]
              : null;
            if (
              typeof explicitSurface === 'string' &&
              explicitSurface.trim().length > 0
            ) {
              return explicitSurface.trim();
            }
            return typeof attribute === 'string' && attribute.trim().length > 0
              ? attribute.trim()
              : null;
          });
      }

      if (Array.isArray(mention.food_attributes)) {
        mention.food_attribute_surfaces = mention.food_attributes.map(
          (attribute, index) => {
            const explicitSurface = Array.isArray(
              mention.food_attribute_surfaces,
            )
              ? mention.food_attribute_surfaces[index]
              : null;
            if (
              typeof explicitSurface === 'string' &&
              explicitSurface.trim().length > 0
            ) {
              return explicitSurface.trim();
            }
            return typeof attribute === 'string' && attribute.trim().length > 0
              ? attribute.trim()
              : null;
          },
        );
      }
    });
  }

  private normalizeRestaurantNames(
    mentions: EnrichedLLMMention[],
    enrichment: SourceEnrichmentMaps,
  ): void {
    mentions.forEach((mention) => {
      const sourceId = mention.source_id?.trim();
      const restaurant = mention.restaurant?.trim();
      if (!restaurant) {
        return;
      }

      mention.restaurant = restaurant;
      if (
        typeof mention.restaurant_surface !== 'string' ||
        !mention.restaurant_surface.trim().length
      ) {
        mention.restaurant_surface = restaurant;
      }

      if (!sourceId) {
        return;
      }

      const content = enrichment.contentById.get(sourceId) ?? '';
      if (!content) {
        return;
      }

      const existingSurface = mention.restaurant_surface ?? restaurant;
      if (
        existingSurface &&
        content.toLowerCase().includes(existingSurface.toLowerCase())
      ) {
        return;
      }

      const regex = new RegExp(
        `\\b${restaurant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'iu',
      );
      const match = content.match(regex);
      if (match?.[0]) {
        mention.restaurant_surface = match[0];
      }
    });
  }

  private dropDuplicateRestaurantMentions(
    mentions: EnrichedLLMMention[],
    enrichment: SourceEnrichmentMaps,
  ): void {
    const seen = new Set<string>();

    for (let index = mentions.length - 1; index >= 0; index -= 1) {
      const mention = mentions[index];
      const sourceId = mention.source_id?.trim();
      const restaurant = mention.restaurant?.trim().toLowerCase();
      if (!sourceId || !restaurant) {
        continue;
      }

      const food = mention.food?.trim().toLowerCase() ?? '';
      const restaurantAttributes = (mention.restaurant_attributes ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|');
      const foodAttributes = (mention.food_attributes ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|');
      const categories = (mention.food_categories ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|');
      const content = enrichment.contentById.get(sourceId) ?? '';

      const fingerprint = [
        sourceId,
        restaurant,
        food,
        categories,
        restaurantAttributes,
        foodAttributes,
        mention.general_praise ? 'praise' : 'neutral',
        content.trim().toLowerCase(),
      ].join('::');

      if (seen.has(fingerprint)) {
        mentions.splice(index, 1);
        continue;
      }

      seen.add(fingerprint);
    }
  }

  private computeTemporalRange(llmPosts: LLMPost[]): {
    earliest: number;
    latest: number;
  } | null {
    const timestamps = llmPosts
      .flatMap((post) => [
        post.created_at,
        ...(post.comments ?? []).map((comment) => comment.created_at),
      ])
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));

    if (!timestamps.length) {
      return null;
    }

    return {
      earliest: Math.min(...timestamps),
      latest: Math.max(...timestamps),
    };
  }
}
