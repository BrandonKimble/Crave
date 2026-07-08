import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  ChunkMetadata,
  ChunkResult,
  LLMChunkingService,
} from '../../external-integrations/llm/llm-chunking.service';
import {
  LLMConcurrentProcessingService,
  ProcessingResult as ConcurrentProcessingResult,
  type ChunkProcessingResult,
} from '../../external-integrations/llm/llm-concurrent-processing.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  GeminiBatchService,
  type BatchIngestItem,
} from '../../external-integrations/llm/gemini-batch.service';
import { RelevanceGateService } from './relevance-gate.service';
import {
  EnrichedLLMMention,
  EnrichedLLMOutputStructure,
  LLMModelInput,
  LLMMention,
  LLMPost,
  LLMProcessingInput,
  LLMOutputStructure,
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
  /** Per-call LLM mode override: pipelines whose CALLER consumes the result
   *  synchronously (poll graduation re-runs the gazetteer expecting the new
   *  entities to exist) must force 'interactive' regardless of
   *  COLLECTION_LLM_MODE. */
  llmMode?: 'interactive' | 'batch';
  // Reddit collection types plus `poll-thread` (close-time poll graduation, §6.3).
  pipeline: BatchJob['collectionType'] | 'poll-thread';
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
  /** COLLECTION_LLM_MODE=batch: the LLM work was submitted as a Gemini batch
   *  job; mentions/dbResult are ZEROED stubs and the pipeline resumes via the
   *  batch poller's ingestor when results land (hours, half price). */
  deferredBatchJobId?: string;
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
    private readonly geminiBatchService: GeminiBatchService,
    private readonly relevanceGate: RelevanceGateService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ExtractionPipelineService');
    // COLLECTION_LLM_MODE=batch defers every chunk's LLM call to a Gemini
    // batch job (~50% price; ≤24h SLA — every collection flow is async, none
    // blocks a user). 'interactive' (default) keeps the live path for dev/test
    // runs that shouldn't wait on batch turnaround.
    this.collectionLlmMode =
      process.env.COLLECTION_LLM_MODE?.trim().toLowerCase() === 'batch'
        ? 'batch'
        : 'interactive';
    // Relevance gate: ON for every collection type, always (owner call
    // 2026-07-07 after drop-audit review). COLLECTION_RELEVANCE_GATE=off is
    // the single explicit opt-down for debugging ("why wasn't my post
    // collected?"); the staged-rollout 'archive' mode was deleted once the
    // rollout completed.
    this.relevanceGateEnabled =
      process.env.COLLECTION_RELEVANCE_GATE?.trim().toLowerCase() !== 'off';
    this.geminiBatchService.registerIngestor(
      'collection_extraction',
      async ({ jobId, resumeContext, items }) => {
        await this.ingestCollectionBatch(jobId, resumeContext, items);
      },
    );
  }

  private collectionLlmMode: 'interactive' | 'batch' = 'interactive';
  private relevanceGateEnabled = true;

  /** Per-pipeline post-completion continuations (e.g. poll graduation's
   *  gazetteer backfill + leaderboard). Dispatched at the END of
   *  completeChunkPlan — which runs inline on the interactive path and at
   *  batch-ingest time on the batch path — so a consumer registers ONCE and
   *  its continuation follows the extraction no matter how the LLM ran.
   *  Handlers must be idempotent (batch ingest retries on failure). */
  private readonly completionHandlers = new Map<
    string,
    (
      result: ExtractionPipelineResult,
      baseParams: ExtractionPipelineBaseParams,
    ) => Promise<void>
  >();

  registerCompletionHandler(
    pipeline: ExtractionPipelineBaseParams['pipeline'],
    handler: (
      result: ExtractionPipelineResult,
      baseParams: ExtractionPipelineBaseParams,
    ) => Promise<void>,
  ): void {
    this.completionHandlers.set(pipeline, handler);
  }

  async processPosts(
    params: ExtractionPipelinePostsParams,
  ): Promise<ExtractionPipelineResult> {
    // Universal relevance gate: cheap title+body admission BEFORE anything is
    // persisted, chunked, or billed at extraction rates. Fail-open inside.
    // Poll threads are exempt: the gate filters UNCURATED external content,
    // and poll threads are first-party food-framed questions — gating them is
    // a wasted call plus a silent-drop risk with no upside.
    if (this.relevanceGateEnabled && params.pipeline !== 'poll-thread') {
      const gated = await this.relevanceGate.filterPosts(
        params.platform ?? 'reddit',
        params.llmPosts,
      );
      params = { ...params, llmPosts: gated.kept };
    }
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

      const llmModeForRun = params.baseParams.llmMode ?? this.collectionLlmMode;
      // Zero chunks (e.g. the relevance gate dropped every post) completes
      // inline in EITHER mode — a batch job cannot be submitted with no items.
      if (llmModeForRun === 'batch' && params.chunkData.chunks.length > 0) {
        return await this.deferChunkPlanToBatch(params, extractionRunId);
      }

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

      return await this.completeChunkPlan({
        baseParams: params.baseParams,
        llmPosts: params.llmPosts,
        chunkMetadata: params.chunkData.metadata,
        chunkDurationMs: params.chunkDurationMs,
        sourceDocumentIdBySourceKey: params.sourceDocumentIdBySourceKey,
        extractionRunId,
        extractionInputIdByChunkId,
        chunkResults: processingResult.chunkResults,
        processingMetrics: processingResult.metrics,
        llmProcessingTimeMs: Date.now() - llmStartTime,
      });
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

  /**
   * BATCH MODE: persist the run's chunk inputs (rawOutput null), submit every
   * chunk as one Gemini batch job (inline system prompt; ~50% price), and stash
   * a self-contained resume context. The poller's ingestor picks up from
   * completeChunkPlan when results land — identical downstream to interactive.
   */
  private async deferChunkPlanToBatch(
    params: {
      baseParams: ExtractionPipelineBaseParams;
      llmPosts: LLMPost[];
      chunkData: ProcessingChunkResult;
      sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>;
      activateDocumentIds: string[];
      chunkDurationMs: number;
    },
    extractionRunId: string,
  ): Promise<ExtractionPipelineResult> {
    const stubs: ChunkProcessingResult<LLMProcessingInput>[] =
      params.chunkData.chunks.map((input, index) => {
        const metadata = params.chunkData.metadata[index];
        return {
          success: false,
          result: undefined,
          chunkId: metadata?.chunkId ?? `chunk_${index}`,
          commentCount: metadata?.commentCount ?? 0,
          duration: 0,
          metadata: metadata ?? {
            chunkId: `chunk_${index}`,
            commentCount: 0,
            rootCommentScore: 0,
            estimatedProcessingTime: 0,
            threadRootId: `chunk_${index}`,
          },
          input,
        };
      });

    const extractionInputIdByChunkId =
      await this.collectionEvidenceService.persistExtractionInputs({
        extractionRunId,
        chunkResults: stubs,
        sourceDocumentIdBySourceKey: params.sourceDocumentIdBySourceKey,
      });

    const jobId = await this.geminiBatchService.submit({
      purpose: 'collection_extraction',
      model: this.llmService.getContentModel(),
      items: stubs.map((stub) => ({
        key: stub.chunkId,
        ...this.llmService.buildCollectionBatchRequest(stub.input),
      })),
      resumeContext: {
        extractionRunId,
        baseParams: {
          pipeline: params.baseParams.pipeline,
          batchId: params.baseParams.batchId,
          community: params.baseParams.community,
          platform: params.baseParams.platform ?? 'reddit',
          searchEntity: params.baseParams.searchEntity ?? null,
          skipSourceLedgerDedupe:
            params.baseParams.skipSourceLedgerDedupe ?? false,
          collectionRunScopeKey:
            params.baseParams.collectionRunScopeKey ?? null,
          parentJobId: params.baseParams.parentJobId ?? null,
          runMetadata: params.baseParams.runMetadata ?? null,
        },
        llmPosts: params.llmPosts,
        chunkInputs: stubs.map((stub) => ({
          chunkId: stub.chunkId,
          input: stub.input,
          metadata: stub.metadata,
        })),
        sourceDocEntries: [...params.sourceDocumentIdBySourceKey.entries()],
        inputIdEntries: [...extractionInputIdByChunkId.entries()],
        activateDocumentIds: params.activateDocumentIds,
        chunkDurationMs: params.chunkDurationMs,
      },
    });

    this.logger.info('Extraction deferred to Gemini batch', {
      extractionRunId,
      batchJobId: jobId,
      chunkCount: stubs.length,
    });

    return {
      extractionRunId,
      deferredBatchJobId: jobId,
      llmOutput: { mentions: [] },
      rawMentionsSample: [],
      dbResult: {
        entitiesCreated: 0,
        connectionsCreated: 0,
        affectedConnectionIds: [],
        affectedRestaurantIds: [],
      },
      llmProcessingTimeMs: 0,
      dbProcessingTimeMs: 0,
      chunkDurationMs: params.chunkDurationMs,
      chunkStats: this.summarizeChunkMetadata(params.chunkData.metadata),
      processingMetrics: {
        totalDuration: 0,
        chunksProcessed: stubs.length,
        successRate: 0,
        topCommentsCount: 0,
        averageChunkTime: 0,
        fastestChunk: 0,
        slowestChunk: 0,
      },
    };
  }

  /** Batch-poller ingestor: rebuild the chunk results from the stored resume
   *  context + item responses, then run the SAME post-LLM half. */
  private async ingestCollectionBatch(
    jobId: string,
    resumeContext: unknown,
    items: BatchIngestItem[],
  ): Promise<void> {
    const context = resumeContext as {
      extractionRunId: string;
      baseParams: ExtractionPipelineBaseParams;
      llmPosts: LLMPost[];
      chunkInputs: {
        chunkId: string;
        input: LLMProcessingInput;
        metadata: ChunkMetadata;
      }[];
      sourceDocEntries: [SourceDocumentKey, string][];
      inputIdEntries: [string, string][];
      activateDocumentIds: string[];
      chunkDurationMs: number;
    };
    const inputByChunkId = new Map(
      context.chunkInputs.map((chunk) => [chunk.chunkId, chunk]),
    );

    const chunkResults: ChunkProcessingResult<LLMProcessingInput>[] = [];
    let failures = 0;
    for (const item of items) {
      const chunk = inputByChunkId.get(item.itemKey);
      if (!chunk) {
        this.logger.warn('Batch item has no matching chunk input', {
          jobId,
          itemKey: item.itemKey,
        });
        continue;
      }
      let result: LLMOutputStructure | undefined;
      if (item.response && !item.error) {
        try {
          result = this.llmService.parseCollectionBatchResponse(item.response);
        } catch (error) {
          failures += 1;
          this.logger.warn('Batch item response failed to parse', {
            jobId,
            itemKey: item.itemKey,
            error:
              error instanceof Error
                ? { message: error.message }
                : { message: String(error) },
          });
        }
      } else if (item.error) {
        failures += 1;
      }
      chunkResults.push({
        success: Boolean(result),
        result,
        chunkId: chunk.chunkId,
        commentCount: chunk.metadata?.commentCount ?? 0,
        duration: 0,
        metadata: chunk.metadata,
        input: chunk.input,
      });
    }

    // Store the raw outputs onto the pre-persisted extraction inputs so the
    // evidence trail matches the interactive path.
    const inputIdByChunkId = new Map(context.inputIdEntries);
    await this.collectionEvidenceService.updateExtractionInputOutputs({
      extractionRunId: context.extractionRunId,
      chunkResults,
      inputIdByChunkId,
    });

    if (context.activateDocumentIds.length > 0) {
      await this.collectionEvidenceService.activateRunForDocuments(
        context.extractionRunId,
        context.activateDocumentIds,
      );
    }

    const succeeded = chunkResults.filter((chunk) => chunk.success).length;
    await this.completeChunkPlan({
      baseParams: context.baseParams,
      llmPosts: context.llmPosts,
      chunkMetadata: context.chunkInputs.map((chunk) => chunk.metadata),
      chunkDurationMs: context.chunkDurationMs,
      sourceDocumentIdBySourceKey: new Map(context.sourceDocEntries),
      extractionRunId: context.extractionRunId,
      extractionInputIdByChunkId: inputIdByChunkId,
      chunkResults,
      processingMetrics: {
        totalDuration: 0,
        chunksProcessed: chunkResults.length,
        successRate: chunkResults.length ? succeeded / chunkResults.length : 0,
        topCommentsCount: 0,
        averageChunkTime: 0,
        fastestChunk: 0,
        slowestChunk: 0,
      },
      llmProcessingTimeMs: 0,
    });
    this.logger.info('Batch extraction ingested', {
      jobId,
      extractionRunId: context.extractionRunId,
      chunks: chunkResults.length,
      failures,
    });
  }

  /** POST-LLM half of the chunk plan — shared by the interactive path and the
   *  batch ingestor (identical downstream no matter how the LLM ran). */
  private async completeChunkPlan(args: {
    baseParams: ExtractionPipelineBaseParams;
    llmPosts: LLMPost[];
    chunkMetadata: ChunkMetadata[];
    chunkDurationMs: number;
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>;
    extractionRunId: string;
    extractionInputIdByChunkId: Map<string, string>;
    chunkResults: ChunkProcessingResult<LLMProcessingInput>[];
    processingMetrics: ConcurrentProcessingResult<LLMProcessingInput>['metrics'];
    llmProcessingTimeMs: number;
  }): Promise<ExtractionPipelineResult> {
    const flatMentions: HydratingMention[] = args.chunkResults.flatMap(
      (chunkResult) =>
        (chunkResult.result?.mentions ?? []).map((mention) => ({
          ...mention,
          source_id: this.resolveCanonicalSourceIdForMention(
            mention.source_id,
            chunkResult.input,
            chunkResult.chunkId,
          ),
          __inputChunkId: chunkResult.chunkId,
          __extractionInputId:
            args.extractionInputIdByChunkId.get(chunkResult.chunkId) ?? null,
        })),
    );

    const enrichment = this.buildSourceEnrichmentMaps(args.llmPosts);
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
        const subreddit = metadata.subreddit ?? mention.subreddit ?? 'unknown';
        const sourceDocumentId = sourceType
          ? (args.sourceDocumentIdBySourceKey.get(
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
    const llmProcessingTimeMs = args.llmProcessingTimeMs;

    const dbStartTime = Date.now();
    const sourceBreakdown = this.buildSourceBreakdown(
      args.baseParams.pipeline,
      args.llmPosts.length,
    );
    const temporalRange = this.computeTemporalRange(args.llmPosts) ?? undefined;
    const extractionTrace: ExtractionTraceContext = {
      extractionRunId: args.extractionRunId,
      sourceDocumentIdBySourceKey: args.sourceDocumentIdBySourceKey,
      extractionInputIdByChunkId: args.extractionInputIdByChunkId,
    };

    const dbResult = await this.unifiedProcessingService.processLLMOutput(
      {
        mentions: llmOutput.mentions,
        sourceMetadata: {
          batchId: args.baseParams.batchId,
          collectionType: args.baseParams.pipeline,
          subreddit: args.baseParams.community,
          searchEntity: args.baseParams.searchEntity,
          sourceBreakdown,
          temporalRange,
          extractionTrace,
        },
      },
      {
        skipSourceLedgerDedupe: args.baseParams.skipSourceLedgerDedupe,
      },
    );
    const dbProcessingTimeMs = Date.now() - dbStartTime;

    await this.collectionEvidenceService.markExtractionRunCompleted(
      args.extractionRunId,
    );

    const result: ExtractionPipelineResult = {
      extractionRunId: args.extractionRunId,
      llmOutput,
      rawMentionsSample,
      dbResult,
      llmProcessingTimeMs,
      dbProcessingTimeMs,
      chunkDurationMs: args.chunkDurationMs,
      chunkStats: this.summarizeChunkMetadata(args.chunkMetadata),
      processingMetrics: args.processingMetrics,
    };

    const completionHandler = this.completionHandlers.get(
      args.baseParams.pipeline,
    );
    if (completionHandler) {
      await completionHandler(result, args.baseParams);
    }

    return result;
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
        const commentRef = assignRef(canonicalCommentId, 'comment', comment.id);

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
    const parentCandidates = [canonicalParentId, trimmedParentId].filter(
      (candidate): candidate is string => Boolean(candidate),
    );

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

    // The model occasionally type-prefixes the ref ("t1_SRC002"); the ref is
    // unambiguous after stripping, so normalize instead of failing the chunk.
    const normalizedRef = trimmedSourceId.replace(/^t[13]_(?=SRC)/i, '');
    const mappedSource = sourceMap[normalizedRef];
    if (!mappedSource) {
      const allowedRefs = Object.keys(sourceMap).sort().slice(0, 10).join(', ');
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
          throw new Error(
            `Comment ref ${commentRef} does not map to a comment`,
          );
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
      throw new Error(
        `Parent source ref must use SRC format: ${trimmedParentId}`,
      );
    }

    if (!sourceMap[trimmedParentId]) {
      throw new Error(
        `Parent source ref is missing from source_map: ${trimmedParentId}`,
      );
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
