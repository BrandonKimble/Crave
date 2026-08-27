import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { buildCauseChain, LoggerService } from '../../../shared';
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
import { PromptRegistryService } from '../../external-integrations/llm/prompt-registry.service';
import {
  GeminiBatchService,
  type BatchIngestItem,
} from '../../external-integrations/llm/gemini-batch.service';
import { RelevanceGateService } from './relevance-gate.service';
import { RescoreCoordinatorService } from '../public-crave-score';
import { OpsAlertsService } from '../../external-integrations/shared/ops-alerts.service';
import {
  EnrichedLLMMention,
  EnrichedLLMOutputStructure,
  LLMModelInput,
  LLMMention,
  AdmittedMention,
  MentionEnrichment,
  LLMComment,
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
import {
  canonicalizeObservedPlaceName,
  observedSpanAppearsInSource,
} from './place-name-contract';
import { isDishMention } from '../../external-integrations/llm/llm.types';
import { isEnvFlagExplicitlyDisabled } from '../../../shared/config/env-flag';

// F9201/F4905: an item whose creation time is UNKNOWN must NEVER be stamped
// with collection-time NOW. F4905 made LLMPost/LLMComment.created_at nullable
// so an undated item is representationally distinct from "created now", but the
// enrichment fallbacks below still coerced null -> new Date() (dead before the
// field was nullable, live after). A fabricated-NOW source_created_at yields
// maximal recency in public-crave-score's recency-mass term
// power(0.5, (now() - source_created_at)/halfLife) ≈ 1.0, inflating an undated
// item's crave-score — exactly the harm F4905 removed.
//
// The persistence column source_created_at is still NOT NULL (schema.prisma),
// so the fully-ideal fix — type it nullable and EXCLUDE null rows from the
// recency term, matching computeTemporalRange's "excluded rather than
// fabricated" stance — needs an OWNER-approved migration. Until then we floor
// an unknown date to this fixed ANCIENT sentinel. It is NOT a real timestamp:
// an epoch-0 doc is ancient, so its recency weight is ~0 (the OPPOSITE of the
// maximal-recency harm) — a deliberate de-weighting floor for unknown dates.
const UNKNOWN_SOURCE_CREATED_AT_SENTINEL = '1970-01-01T00:00:00.000Z';

/** Refusal-rate alarm (redteam-l1 F4). The threshold is an operator dial,
 *  not a measured fact: certified v17 gold runs refuse well under 1 in 20,
 *  so 10% is drift no healthy prompt produces. The floor keeps a 2-mention
 *  chunk with 1 refusal from paging anyone. */
const REFUSAL_RATE_ALARM_THRESHOLD = 0.1;
const REFUSAL_RATE_ALARM_MIN_MENTIONS = 25;

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
  /** Text the OBSERVED-SPAN refusal checks against, per source: a post's
   *  title + body, a comment's body (v17 observed-span contract). */
  spanTextById: Map<string, string>;
};

/** A banked observed-span contract refusal (red team F8: never dropped). */
export type ContractRefusalRow = {
  extractionInputId: string | null;
  sourceDocumentId: string | null;
  reason: string;
  detail: string | null;
  mention: LLMMention;
};

type HydratingMention = AdmittedMention &
  Partial<
    Pick<
      MentionEnrichment,
      | 'source_type'
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
  /** VERSIONED PROMPTS (2026-08-01): extract under a specific registered
   *  prompt version instead of the active one — the shadow-replay lever.
   *  Batch mode only (shadow replays are batch by design); interactive
   *  callers must run the active prompt. */
  promptVersion?: number;
  /** REHEARSAL GENERATION (plans/shadow-sandbox.md): banking mints
   *  entities/surfaces as status='rehearsal' keyed to this run and the
   *  side-effect doors (attribute adjudication, enrichment, metro probes,
   *  projection rebuild, embedding-stale touches, live attribute merges)
   *  do not fire — they fire once, at activation. Explicit by law: never
   *  inferred from an empty activation list. */
  rehearsal?: boolean;
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

export interface ExtractionPipelineBankedMentionsParams
  extends ExtractionPipelineStoredInputsParams {
  /** Banked wire mentions to re-admit, keyed by the original stored input's
   *  inputIndex (the chunk whose source_map their refs resolve in). */
  mentionsByInputIndex: Map<number, LLMMention[]>;
  /** The recovery run records the banked run's OWN prompt contract — no LLM
   *  runs here, so nothing resolves a prompt. The registry (llm_prompts) is
   *  the content store; the hash is the run's join key. */
  systemPromptHash: string;
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
    private readonly promptRegistry: PromptRegistryService,
    private readonly rescoreCoordinator: RescoreCoordinatorService,
    private readonly opsAlerts: OpsAlertsService,
  ) {}

  /** VERSIONED PROMPTS: a shadow replay pins a registered candidate
   *  version; the coverage hash, the run record, and the batch request must
   *  all use the SAME content or coverage lies. Batch mode only — an
   *  interactive caller under a pinned version is a wiring bug.
   *
   *  The hash comes from the REGISTRY ROW, never recomputed from content:
   *  the row's fingerprint is the version identity (from v15 it folds the
   *  response schema — a schema change is a different version), and a local
   *  sha256(content) here would silently disagree with it. */
  private async resolveEffectivePrompt(
    baseParams: ExtractionPipelineBaseParams,
  ): Promise<{ content: string; contentHash: string }> {
    if (!baseParams.promptVersion) {
      // FAIL CLOSED (D6): if this process could not read the registry's
      // ACTIVE prompt, refuse to extract rather than run under the asset
      // file — an unregistered prompt hash voids coverage corpus-wide.
      this.promptRegistry.assertCollectionPromptAvailable();
      const active = await this.promptRegistry.getActive();
      return { content: active.content, contentHash: active.contentHash };
    }
    if ((baseParams.llmMode ?? this.collectionLlmMode) !== 'batch') {
      throw new Error(
        'promptVersion is only supported in batch mode (shadow replays)',
      );
    }
    const pinned = await this.promptRegistry.getVersion(
      baseParams.promptVersion,
    );
    return { content: pinned.content, contentHash: pinned.contentHash };
  }

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ExtractionPipelineService');
    // BATCH IS THE DEFAULT, because the cheap path is the correct one here:
    // every collection flow is async and none blocks a user, and batch is
    // ~50% price with a <=24h SLA. This used to require opting IN via
    // COLLECTION_LLM_MODE=batch, so the default silently paid a flat 2x on
    // the pipeline's single largest cost — and an env var cannot express
    // what actually varies, which is whether a PARTICULAR run can wait.
    // Latency tolerance belongs to the work item (params.llmMode already
    // carries it with a documented forcing reason); the env var now only
    // opts DOWN, for dev/test runs that must not wait on batch turnaround.
    this.collectionLlmMode =
      process.env.COLLECTION_LLM_MODE?.trim().toLowerCase() === 'interactive'
        ? 'interactive'
        : 'batch';
    // Relevance gate: ON for every collection type, always (owner call
    // 2026-07-07 after drop-audit review). COLLECTION_RELEVANCE_GATE=off is
    // the single explicit opt-down for debugging ("why wasn't my post
    // collected?"); the staged-rollout 'archive' mode was deleted once the
    // rollout completed.
    // Canonical env-flag dialect (F466/F401) via the OPT-DOWN reader. The
    // gate is ON by default and this var exists only to turn it off, so the
    // question is "did someone explicitly say no?" — a typo must never
    // silently disable a protection that also caps spend. 'off' is still the
    // documented spelling; 'false'/'0'/'no' now work identically.
    this.relevanceGateEnabled = !isEnvFlagExplicitlyDisabled(
      process.env.COLLECTION_RELEVANCE_GATE,
    );
    this.geminiBatchService.registerIngestor(
      'collection_extraction',
      async ({ jobId, resumeContext, items }) => {
        await this.ingestCollectionBatch(jobId, resumeContext, items);
      },
    );
    // Terminal batch-job failure (provider failed the batch, or ingest
    // exhausted its retries) → fail the owning extraction run so it doesn't
    // dangle 'running' until the stale-run reconciler.
    this.geminiBatchService.registerFailureHandler(
      'collection_extraction',
      async ({ resumeContext, error }) => {
        const { extractionRunId } = resumeContext as {
          extractionRunId: string;
        };
        await this.collectionEvidenceService.markExtractionRunFailed(
          extractionRunId,
          error,
        );
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
    // §12.1 PERSIST FIRST: every fetched document is stored — the fetch was
    // paid; a rejected document is still evidence (its verdict row is the
    // audit trail and re-judgable by replay). The one destructive write-time
    // judgment is dead.
    const allDocumentIdsBySourceKey =
      await this.collectionEvidenceService.persistSourceDocuments({
        platform: 'reddit',
        community: params.community,
        posts: params.llmPosts,
        pipeline: params.pipeline,
      });
    // Relevance is an ADMISSION judgment into the scored corpus (§12.1):
    // cheap title+body verdicts decide what proceeds to chunking/extraction —
    // AFTER persistence, never before. Fail-open inside. Poll threads are
    // exempt: the gate filters UNCURATED external content, and poll threads
    // are first-party food-framed questions — gating them is a wasted call
    // plus a silent-drop risk with no upside.
    if (this.relevanceGateEnabled && params.pipeline !== 'poll-thread') {
      const gated = await this.relevanceGate.filterPosts(
        params.platform ?? 'reddit',
        params.llmPosts,
      );
      params = { ...params, llmPosts: gated.kept };
    }
    // Downstream (chunk plan, activation) sees only ADMITTED documents; the
    // full fetched set is already durable above.
    const admittedSourceKeys = new Set(
      params.llmPosts.flatMap((post) => [
        buildSourceDocumentKey('post', post.id),
        ...post.comments.map((comment) =>
          buildSourceDocumentKey('comment', comment.id),
        ),
      ]),
    );
    const sourceDocumentIdBySourceKey = new Map(
      Array.from(allDocumentIdsBySourceKey.entries()).filter(([key]) =>
        admittedSourceKeys.has(key),
      ),
    );

    // PRE-LLM DEDUPE GATE (duplication red-team 2026-07-11; thread-level
    // refinement same day): skip posts whose every source is already covered
    // by a completed same-contract extraction or an in-flight batch job —
    // BEFORE chunking and BEFORE Gemini bills. 68%+29% of the stage-2 load's
    // duplicate spend was exactly this class (seed re-launches re-submitting
    // the whole plan). Partially-covered posts are TRIMMED to thread level:
    // only top-level threads containing an uncovered comment are resent
    // (sibling threads are self-contained worlds — a new comment that needed
    // their context would have been posted under them), with the post
    // title/body riding along as context and extract_from_post=false when the
    // post body itself is already covered. The post-LLM mention dedupe
    // remains the data-level guard.
    const effectivePrompt = await this.resolveEffectivePrompt(params);
    const currentPromptHash = effectivePrompt.contentHash;
    const allSourceIds = params.llmPosts.flatMap((post) => [
      post.id,
      ...post.comments.map((comment) => comment.id),
    ]);
    const coveredSourceIds =
      await this.collectionEvidenceService.findExtractionCoveredSourceIds({
        platform: 'reddit',
        sourceIds: allSourceIds,
        systemPromptHash: currentPromptHash,
        extractionSchemaVersion: 'v1',
      });
    // CLAIM the uncovered documents (step 3, Law 2): an atomic reservation
    // replaces the covered-check's blind window — a document another live
    // run holds simply counts as covered and gets trimmed below.
    {
      const docIdBySourceId = new Map<string, string>();
      for (const post of params.llmPosts) {
        const postDocId = sourceDocumentIdBySourceKey.get(
          buildSourceDocumentKey('post', post.id),
        );
        if (postDocId) docIdBySourceId.set(post.id, postDocId);
        for (const comment of post.comments) {
          const commentDocId = sourceDocumentIdBySourceKey.get(
            buildSourceDocumentKey('comment', comment.id),
          );
          if (commentDocId) docIdBySourceId.set(comment.id, commentDocId);
        }
      }
      const uncovered = Array.from(docIdBySourceId.entries()).filter(
        ([sourceId]) => !coveredSourceIds.has(sourceId),
      );
      const won =
        await this.collectionEvidenceService.claimDocumentsForExtraction(
          uncovered.map(([, docId]) => docId),
          currentPromptHash,
        );
      for (const [sourceId, docId] of uncovered) {
        if (!won.has(docId)) {
          coveredSourceIds.add(sourceId);
        }
      }
    }
    const originalCommentCount = params.llmPosts.reduce(
      (sum, post) => sum + post.comments.length,
      0,
    );
    const uncoveredPosts = params.llmPosts
      .map((post) =>
        this.rebuildPostForUncoveredThreads(post, coveredSourceIds),
      )
      .filter((post): post is LLMPost => post !== null);
    const skippedCount = params.llmPosts.length - uncoveredPosts.length;
    const keptCommentCount = uncoveredPosts.reduce(
      (sum, post) => sum + post.comments.length,
      0,
    );
    const trimmedCommentCount = originalCommentCount - keptCommentCount;
    if (skippedCount > 0 || trimmedCommentCount > 0) {
      this.logger.info('Pre-LLM dedupe gate skipped covered work', {
        pipeline: params.pipeline,
        community: params.community,
        skippedPosts: skippedCount,
        trimmedCoveredComments: trimmedCommentCount,
        remainingPosts: uncoveredPosts.length,
        remainingComments: keptCommentCount,
      });
    }
    if (uncoveredPosts.length === 0) {
      return this.buildFullyCoveredResult();
    }
    params = { ...params, llmPosts: uncoveredPosts };
    const llmInput: LLMModelInput = { posts: params.llmPosts };

    const chunkStartTime = Date.now();
    const chunkData = this.normalizeSourceRefsInChunkData(
      this.llmChunkingService.createContextualChunks(llmInput),
    );
    const chunkDurationMs = Date.now() - chunkStartTime;

    // ACTIVATION FROM THE EXTRACTED SET ONLY (async-integrity step 4, C1):
    // a document's pointer may flip only to a run that actually extracts
    // it. The pre-trim set included covered/trimmed documents — flipping
    // their pointer DARKENED the covering run's evidence (and activation
    // now supersede-DELETES other runs' events, which makes overreach
    // destructive, not just dark).
    const extractedDocumentIds = new Set<string>();
    for (const post of params.llmPosts) {
      // A covered post body rides along as CONTEXT ONLY
      // (extract_from_post=false) — its pointer must stay on the run that
      // covers it.
      const postDocId =
        post.extract_from_post === false
          ? undefined
          : sourceDocumentIdBySourceKey.get(
              buildSourceDocumentKey('post', post.id),
            );
      if (postDocId) extractedDocumentIds.add(postDocId);
      for (const comment of post.comments) {
        const commentDocId = sourceDocumentIdBySourceKey.get(
          buildSourceDocumentKey('comment', comment.id),
        );
        if (commentDocId) extractedDocumentIds.add(commentDocId);
      }
    }

    return this.processChunkPlan({
      baseParams: params,
      llmPosts: params.llmPosts,
      chunkData,
      sourceDocumentIdBySourceKey,
      chunkDurationMs,
      activateDocumentIds: params.activateDocumentsBeforeProcessing
        ? Array.from(extractedDocumentIds)
        : [],
    });
  }

  async processStoredInputs(
    params: ExtractionPipelineStoredInputsParams,
  ): Promise<ExtractionPipelineResult> {
    this.assertStoredInputsUseSourceRefs(params.inputChunks);

    // COVERAGE GATE (async-integrity step 3, C2): this path had NO gate —
    // a worker restart mid-reload re-submitted (and re-PAID) every
    // already-completed source run. Replay chunks are stored payloads, so
    // gating is run-grain, not thread-grain: when EVERY document is
    // already covered under the current contract (completed-with-output or
    // live in-flight batch), skip the whole run. This is also the
    // re-extract runner's crash-restart cursor.
    // The gate/claim contract is the run's EFFECTIVE prompt (a shadow
    // replay's versioned prompt, not the live one) — hashing the live
    // prompt here made every shadow re-extract read as "already covered"
    // and silently no-op (red team F3).
    const gatePromptHash = (await this.resolveEffectivePrompt(params))
      .contentHash;
    const gateSourceIds = params.sourceDocuments.map(
      (document) => document.sourceId,
    );
    const gateCovered =
      await this.collectionEvidenceService.findExtractionCoveredSourceIds({
        platform: params.platform ?? 'reddit',
        sourceIds: gateSourceIds,
        systemPromptHash: gatePromptHash,
        extractionSchemaVersion: 'v1',
      });
    if (
      gateSourceIds.length > 0 &&
      gateSourceIds.every((sourceId) => gateCovered.has(sourceId))
    ) {
      this.logger.info(
        'Stored-input replay fully covered under current contract — skipping',
        {
          batchId: params.batchId,
          documents: gateSourceIds.length,
        },
      );
      return this.buildFullyCoveredResult();
    }
    // Reserve the uncovered documents (Law 2). Replay chunks are stored
    // payloads (run-grain), so a lost claim can't trim a single document —
    // but if EVERY uncovered doc is claimed by another live run, this
    // replay is a duplicate in flight and must stand down.
    {
      const uncoveredDocIds = params.sourceDocuments
        .filter((document) => !gateCovered.has(document.sourceId))
        .map((document) => document.documentId);
      const won =
        await this.collectionEvidenceService.claimDocumentsForExtraction(
          uncoveredDocIds,
          gatePromptHash,
        );
      if (uncoveredDocIds.length > 0 && won.size === 0) {
        this.logger.info(
          'Stored-input replay: every uncovered document is claimed by a live run — standing down',
          { batchId: params.batchId, documents: uncoveredDocIds.length },
        );
        return this.buildFullyCoveredResult();
      }
    }

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

  /** BANKED-REFUSAL RECOVERY (v17 witness repair): re-admit previously
   *  REFUSED wire mentions through the real contract — admitWireMention +
   *  the identical post-LLM half the batch ingest uses — with NO LLM call.
   *  The mentions are the banked rows' own JSON; the chunk context is the
   *  original run's stored inputs, so span texts come from the pipeline's
   *  own enrichment-map builder (never a second projection). The recovery
   *  run records the SAME prompt contract the banked run extracted under
   *  (no prompt resolves here — nothing was generated), so the shadow diff
   *  counts its evidence alongside the campaign's shadow runs. Still-refused
   *  mentions re-bank under the NEW run; the caller reconciles the bank. */
  async reingestBankedMentions(
    params: ExtractionPipelineBankedMentionsParams,
  ): Promise<ExtractionPipelineResult> {
    this.assertStoredInputsUseSourceRefs(params.inputChunks);
    const sourceDocumentIdBySourceKey = new Map<SourceDocumentKey, string>(
      params.sourceDocuments.map((document) => [
        buildSourceDocumentKey(document.sourceType, document.sourceId),
        document.documentId,
      ]),
    );
    const chunkStartTime = Date.now();
    const sortedChunks = [...params.inputChunks].sort(
      (left, right) => left.inputIndex - right.inputIndex,
    );
    const chunkData = this.normalizeSourceRefsInChunkData(
      this.buildChunkDataFromStoredInputs(sortedChunks),
    );
    const chunkDurationMs = Date.now() - chunkStartTime;

    const extractionRunId =
      await this.collectionEvidenceService.createExtractionRun({
        pipeline: params.pipeline,
        collectionRunScopeKey:
          params.collectionRunScopeKey?.trim() ||
          params.parentJobId?.trim() ||
          params.batchId,
        platform: params.platform ?? 'reddit',
        community: params.community,
        model: this.llmService.getContentModel(),
        // Unused by storage — the registry is the only prompt content store;
        // the hash below is the run's contract fingerprint.
        systemPrompt: '',
        systemPromptHash: params.systemPromptHash,
        generationConfig: this.llmService.getGenerationConfigSnapshot(),
        chunkingConfig: {
          source: 'banked_refusal_replay',
          inputCount: sortedChunks.length,
          sourceInputIds: sortedChunks
            .map((chunk) => chunk.sourceInputId ?? null)
            .filter((value): value is string => Boolean(value)),
        },
        extractionSchemaVersion: 'v1',
        metadata: {
          batchId: params.batchId,
          parentJobId: params.parentJobId ?? null,
          subreddit: params.community,
          ...(params.runMetadata ?? {}),
        },
      });

    try {
      const chunkResults: ChunkProcessingResult<LLMProcessingInput>[] =
        chunkData.chunks.map((input, index) => {
          const metadata = chunkData.metadata[index];
          return {
            success: true,
            result: {
              mentions:
                params.mentionsByInputIndex.get(
                  sortedChunks[index].inputIndex,
                ) ?? [],
            },
            chunkId: metadata.chunkId,
            commentCount: metadata.commentCount ?? 0,
            duration: 0,
            metadata,
            input,
          };
        });

      const extractionInputIdByChunkId =
        await this.collectionEvidenceService.persistExtractionInputs({
          extractionRunId,
          chunkResults,
          sourceDocumentIdBySourceKey,
        });

      return await this.completeChunkPlan({
        activateDocumentIds: [],
        baseParams: params,
        llmPosts: params.llmPosts,
        chunkMetadata: chunkData.metadata,
        chunkDurationMs,
        sourceDocumentIdBySourceKey,
        extractionRunId,
        extractionInputIdByChunkId,
        chunkResults,
        processingMetrics: {
          totalDuration: 0,
          chunksProcessed: chunkResults.length,
          successRate: 1,
          topCommentsCount: 0,
          averageChunkTime: 0,
          fastestChunk: 0,
          slowestChunk: 0,
        },
        llmProcessingTimeMs: 0,
      });
    } catch (error) {
      await this.collectionEvidenceService.markExtractionRunFailed(
        extractionRunId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
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
    const effectivePrompt = await this.resolveEffectivePrompt(
      params.baseParams,
    );

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
          systemPrompt: effectivePrompt.content,
          systemPromptHash: effectivePrompt.contentHash,
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

      // Adopt the (previously ownerless) coverage claims: the run now owns
      // them; terminal-state transitions release them.
      // The stamp must hash the run's EFFECTIVE prompt — the same contract
      // the claim was inserted under — or versioned-run claims are never
      // adopted, never released, and block retries for 2h (red team F3).
      await this.collectionEvidenceService.stampCoverageClaims(
        extractionRunId,
        Array.from(new Set(params.sourceDocumentIdBySourceKey.values())),
        (await this.resolveEffectivePrompt(params.baseParams)).contentHash,
      );

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
      // Failed chunks ride along (success=false) so the evidence trail keeps
      // their inputs and completeChunkPlan's failure-rate law sees them —
      // identical to the batch-ingest path.
      const chunkResults = [
        ...processingResult.chunkResults,
        ...processingResult.failures,
      ];

      const extractionInputIdByChunkId =
        await this.collectionEvidenceService.persistExtractionInputs({
          extractionRunId,
          chunkResults,
          sourceDocumentIdBySourceKey: params.sourceDocumentIdBySourceKey,
        });

      return await this.completeChunkPlan({
        activateDocumentIds: params.activateDocumentIds,
        baseParams: params.baseParams,
        llmPosts: params.llmPosts,
        chunkMetadata: params.chunkData.metadata,
        chunkDurationMs: params.chunkDurationMs,
        sourceDocumentIdBySourceKey: params.sourceDocumentIdBySourceKey,
        extractionRunId,
        extractionInputIdByChunkId,
        chunkResults,
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

    // Resolve the candidate prompt ONCE per submission, not per stub.
    const promptOverride = params.baseParams.promptVersion
      ? (await this.promptRegistry.getVersion(params.baseParams.promptVersion))
          .content
      : undefined;
    const jobId = await this.geminiBatchService.submit({
      purpose: 'collection_extraction',
      model: this.llmService.getContentModel(),
      items: await Promise.all(
        stubs.map(async (stub) => ({
          key: stub.chunkId,
          ...(await this.llmService.buildCollectionBatchRequest(
            stub.input,
            promptOverride,
          )),
        })),
      ),
      resumeContext: {
        extractionRunId,
        // §24.3 Leg C: campaign attribution (simplest honest wiring — see
        // gemini-batch.service.ts's pollOne, the read side). Undefined for
        // any run not tied to an owner-approved campaign (steady-state
        // lanes never touch this surface, §24.3).
        campaignId: params.baseParams.runMetadata?.campaignId,
        // THE WHOLE PARAMS OBJECT RIDES (redteam-l1 F5): this used to be a
        // field-by-field hand projection, and it forgot `rehearsal` — the
        // batch ingest then read rehearsal===false and every batch-path
        // shadow minted LIVE entities/surfaces (red team 2026-08-22, the
        // v16 leak class: "one assembler forgot X"). A spread cannot forget
        // the next field; only the effective-value normalizations are
        // written out.
        baseParams: {
          ...params.baseParams,
          platform: params.baseParams.platform ?? 'reddit',
          skipSourceLedgerDedupe:
            params.baseParams.skipSourceLedgerDedupe ?? false,
          rehearsal: params.baseParams.rehearsal === true,
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
        affectedPlaceIds: [],
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

    // A chunk input with no batch item at all is a silent gap — count it as a
    // failure so completeChunkPlan's failure-rate law sees it.
    const seenChunkIds = new Set(items.map((item) => item.itemKey));
    const missingChunks = context.chunkInputs.filter(
      (chunk) => !seenChunkIds.has(chunk.chunkId),
    );
    if (missingChunks.length > 0) {
      this.logger.error('Batch response is missing chunks', {
        jobId,
        missingChunkIds: missingChunks.map((chunk) => chunk.chunkId),
      });
      for (const chunk of missingChunks) {
        failures += 1;
        chunkResults.push({
          success: false,
          result: undefined,
          chunkId: chunk.chunkId,
          commentCount: chunk.metadata?.commentCount ?? 0,
          duration: 0,
          metadata: chunk.metadata,
          input: chunk.input,
        });
      }
    }

    // Store the raw outputs onto the pre-persisted extraction inputs so the
    // evidence trail matches the interactive path.
    const inputIdByChunkId = new Map(context.inputIdEntries);
    await this.collectionEvidenceService.updateExtractionInputOutputs({
      extractionRunId: context.extractionRunId,
      chunkResults,
      inputIdByChunkId,
    });

    const succeeded = chunkResults.filter((chunk) => chunk.success).length;
    await this.completeChunkPlan({
      activateDocumentIds: context.activateDocumentIds,
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
    // §12.6 — and batch is the DEFAULT mode: submission-time markDirty
    // (reddit-batch-processing) fires hours before this ingest lands, and
    // the hourly tick clears it long before the mentions exist. The ingest
    // is the moment score inputs actually changed, so it marks dirty too
    // (red team 2026-08-19 D4; idempotent flag, best-effort like its twin).
    await this.rescoreCoordinator
      .markDirty(`batch ingest ${jobId}`)
      .catch(() => undefined);
  }

  /** POST-LLM half of the chunk plan — shared by the interactive path and the
   *  batch ingestor (identical downstream no matter how the LLM ran). */
  private async completeChunkPlan(args: {
    /** Docs whose pointer should flip to this run — filtered below to the
     *  subset whose chunk actually PRODUCED output, then applied inside the
     *  consolidated write tx (red team F1). */
    activateDocumentIds?: string[];
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
    // PER-CHUNK VALIDATION BOUNDARY (audit §7, attributed 2026-07-10): a
    // chunk whose output violates the closed-world contract (bad source_id,
    // unresolvable metadata) quarantines ITSELF — flipped to a failed chunk
    // that the failure-rate law below names loudly — instead of one throw
    // holding every other chunk's mentions hostage for the whole job.
    const enrichment = this.buildSourceEnrichmentMaps(args.llmPosts);
    const flatMentions: EnrichedLLMMention[] = [];
    const quarantinedChunks: { chunkId: string; cause: string }[] = [];
    const contractRefusals: ContractRefusalRow[] = [];
    for (const chunkResult of args.chunkResults) {
      if (!chunkResult.result) continue;
      const extractionInputId =
        args.extractionInputIdByChunkId.get(chunkResult.chunkId) ?? null;
      try {
        for (const wireMention of chunkResult.result.mentions ?? []) {
          // THE OBSERVED-SPAN CONTRACT (v17): resolve the cited sources,
          // mechanically verify the span, derive canonical name + praise
          // semantics in code. A failing mention is REFUSED — banked in
          // collection_extraction_contract_refusals, never silently dropped
          // (red team F8) and never ingested. A bad source_id still
          // quarantines the whole chunk (closed-world contract, as before).
          const admitted = this.admitWireMention(
            wireMention,
            chunkResult,
            enrichment,
            extractionInputId,
            args.sourceDocumentIdBySourceKey,
            contractRefusals,
          );
          if (!admitted) continue;
          flatMentions.push(
            this.enrichHydratedMention(
              admitted,
              enrichment,
              args.sourceDocumentIdBySourceKey,
            ),
          );
        }
      } catch (error) {
        const cause = buildCauseChain(error);
        chunkResult.success = false;
        chunkResult.result = undefined;
        quarantinedChunks.push({ chunkId: chunkResult.chunkId, cause });
        this.logger.error('Chunk quarantined: contract validation failed', {
          extractionRunId: args.extractionRunId,
          chunkId: chunkResult.chunkId,
          cause,
        });
      }
    }

    if (contractRefusals.length > 0) {
      this.logger.warn('Observed-span contract refusals banked', {
        extractionRunId: args.extractionRunId,
        refusals: contractRefusals.length,
        byReason: contractRefusals.reduce<Record<string, number>>(
          (acc, row) => {
            acc[row.reason] = (acc[row.reason] ?? 0) + 1;
            return acc;
          },
          {},
        ),
      });
      await this.collectionEvidenceService.bankContractRefusals(
        args.extractionRunId,
        contractRefusals,
      );
      // REFUSAL-RATE ALARM (redteam-l1 F4): the refusal ROWS were owned on
      // every path but the refusal RATE was nobody's — a prompt/model drift
      // pushing live refusals from 0.5% to 10% silently shrank the corpus
      // behind a logger.warn. The rate reaches the ops-alert seam here, per
      // run, deduped per pipeline+day so a bad day is one dashboard row.
      const offered = flatMentions.length + contractRefusals.length;
      const refusalRate = contractRefusals.length / offered;
      if (
        offered >= REFUSAL_RATE_ALARM_MIN_MENTIONS &&
        refusalRate >= REFUSAL_RATE_ALARM_THRESHOLD
      ) {
        this.opsAlerts.emit({
          severity: 'warn',
          kind: 'extraction-refusal-rate',
          title: 'Observed-span refusal rate above threshold',
          body:
            `Run ${args.extractionRunId} (${args.baseParams.pipeline}): ` +
            `${contractRefusals.length}/${offered} mentions refused ` +
            `(${(refusalRate * 100).toFixed(1)}% >= ${REFUSAL_RATE_ALARM_THRESHOLD * 100}%). ` +
            `The contract may be refusing real names, or the prompt/model drifted — ` +
            `read the banked rows in collection_extraction_contract_refusals.`,
          dedupeKey: `extraction-refusal-rate:${args.baseParams.pipeline}:${new Date().toISOString().slice(0, 10)}`,
        });
      }
    }

    const llmOutput: EnrichedLLMOutputStructure = {
      mentions: flatMentions,
    };

    this.ensureSurfaceDefaults(llmOutput.mentions);
    this.dropDuplicatePlaceMentions(llmOutput.mentions, enrichment);

    const rawMentionsSample = [...llmOutput.mentions];
    const llmProcessingTimeMs = args.llmProcessingTimeMs;

    const dbStartTime = Date.now();
    const sourceBreakdown = this.buildSourceBreakdown(
      args.baseParams.pipeline,
      args.llmPosts.length,
    );
    const temporalRange = this.computeTemporalRange(args.llmPosts) ?? undefined;
    // Activation set = requested docs ∩ docs of chunks that produced
    // output (post-quarantine). A failed/errored chunk's documents keep
    // their previous pointer AND their previous evidence (red team F1).
    let activateDocumentIds: string[] = [];
    if (args.activateDocumentIds?.length) {
      const successInputIds = args.chunkResults
        .filter((chunk) => chunk.success !== false && chunk.result)
        .map((chunk) => args.extractionInputIdByChunkId.get(chunk.chunkId))
        .filter((value): value is string => Boolean(value));
      const successDocIds =
        await this.collectionEvidenceService.documentIdsForInputs(
          successInputIds,
        );
      activateDocumentIds = args.activateDocumentIds.filter((documentId) =>
        successDocIds.has(documentId),
      );
      const dropped =
        args.activateDocumentIds.length - activateDocumentIds.length;
      if (dropped > 0) {
        this.logger.warn(
          'Activation trimmed to successful chunks — failed chunks keep prior evidence',
          {
            extractionRunId: args.extractionRunId,
            requested: args.activateDocumentIds.length,
            activating: activateDocumentIds.length,
            dropped,
          },
        );
      }
    }

    const extractionTrace: ExtractionTraceContext = {
      extractionRunId: args.extractionRunId,
      sourceDocumentIdBySourceKey: args.sourceDocumentIdBySourceKey,
      extractionInputIdByChunkId: args.extractionInputIdByChunkId,
      activateDocumentIds,
      rehearsal: args.baseParams.rehearsal === true,
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

    // Failure-rate honesty: a run with failed chunks (parse errors, item
    // errors, missing batch items) is FAILED, not 'completed' — the same loud
    // law as sub-batches. Successful chunks' data stays persisted above;
    // re-collection is idempotent, so a rerun fills the gap.
    const failedChunkIds = args.chunkResults
      .filter((chunk) => !chunk.success)
      .map((chunk) => chunk.chunkId);
    if (failedChunkIds.length > 0) {
      this.logger.error(
        'Chunk plan finished with failed chunks — failing run',
        {
          extractionRunId: args.extractionRunId,
          failedChunkIds,
          quarantinedChunks,
        },
      );
      const quarantineDetail = quarantinedChunks.length
        ? `; quarantined: ${quarantinedChunks
            .map((q) => `${q.chunkId} (${q.cause})`)
            .join('; ')}`
        : '';
      await this.collectionEvidenceService.markExtractionRunFailed(
        args.extractionRunId,
        `${failedChunkIds.length}/${args.chunkResults.length} chunks failed (re-collection is idempotent — rerun fills the gap)${quarantineDetail}`,
      );
      return result;
    }

    await this.collectionEvidenceService.markExtractionRunCompleted(
      args.extractionRunId,
    );

    const completionHandler = this.completionHandlers.get(
      args.baseParams.pipeline,
    );
    if (completionHandler) {
      await completionHandler(result, args.baseParams);
    }

    return result;
  }

  /** First contract stage of chunk hydration (v17 observed-span contract):
   *  resolve the wire mention's cited sources, mechanically verify that
   *  `place_observed` appears in the text of the source `place_source_id`
   *  points to (post: title+body; comment: body), derive the canonical
   *  resolver-facing name in code, and derive the legacy `general_praise`
   *  semantics from the mention's SHAPE (dish mention -> false; place
   *  mention -> its flag). Returns null when the mention is REFUSED —
   *  pushing a banked refusal row — so a too-strict contract can never
   *  shrink the corpus silently (red team F8). Throws only for a bad
   *  `source_id` (the pre-existing closed-world chunk quarantine). */
  private admitWireMention(
    wireMention: LLMMention,
    chunkResult: ChunkProcessingResult<LLMProcessingInput>,
    enrichment: SourceEnrichmentMaps,
    extractionInputId: string | null,
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>,
    refusals: ContractRefusalRow[],
  ): HydratingMention | null {
    const canonicalSourceId = this.resolveCanonicalSourceIdForMention(
      wireMention.source_id,
      chunkResult.input,
      chunkResult.chunkId,
    );
    const sourceDocumentId = this.resolveDocumentIdForCanonicalSourceId(
      canonicalSourceId,
      enrichment,
      sourceDocumentIdBySourceKey,
    );
    const refuse = (reason: string, detail: string | null): null => {
      refusals.push({
        extractionInputId,
        sourceDocumentId,
        reason,
        detail,
        mention: wireMention,
      });
      return null;
    };

    const placeObserved =
      typeof wireMention.place_observed === 'string'
        ? wireMention.place_observed.trim()
        : '';
    if (!placeObserved) {
      return refuse('missing_place_observed', null);
    }

    // F.2's asserts-nothing law, made mechanical: a PLACE mention with no
    // attributes and general_praise false claims nothing — the prompt says
    // "do not emit it", and when the model emits one anyway it is a defined
    // no-op, not data and not a refusal (nothing was wrongly claimed).
    if (
      !isDishMention(wireMention) &&
      wireMention.general_praise !== true &&
      !(wireMention.place_attributes ?? []).length
    ) {
      return null;
    }

    let canonicalPlaceSourceId: string;
    try {
      canonicalPlaceSourceId = this.resolveCanonicalSourceIdForMention(
        wireMention.place_source_id,
        chunkResult.input,
        chunkResult.chunkId,
      );
    } catch (error) {
      return refuse('unresolvable_place_source_id', buildCauseChain(error));
    }

    const spanText = enrichment.spanTextById.get(canonicalPlaceSourceId) ?? '';
    if (!observedSpanAppearsInSource(placeObserved, spanText)) {
      // WITNESS REPAIR (v17 diff triage, the 813-claim pointer class): the
      // model's CLAIM is the span; the pointer is derivable data. The
      // anti-invention guarantee needs only that the span was OBSERVED
      // somewhere in scope — witnesses=0 is invention and refuses (the
      // Luckys guard, 71/884 true hits); witnesses>=1 proves the name real,
      // and ambiguity between REAL occurrences is harmless, so the pointer
      // repairs deterministically: the witness chosen by the input's source
      // order (the depth-aware reading order the prompt itself resolves
      // references in — first occurrence wins, stable across reruns).
      const witnesses: string[] = [];
      for (const [srcId, text] of enrichment.spanTextById) {
        if (
          srcId !== canonicalPlaceSourceId &&
          observedSpanAppearsInSource(placeObserved, text)
        ) {
          witnesses.push(srcId);
        }
      }
      if (witnesses.length >= 1) {
        this.logger.debug('place_source_id repaired to witness', {
          from: canonicalPlaceSourceId,
          to: witnesses[0],
          witnessCount: witnesses.length,
          span: placeObserved,
        });
        canonicalPlaceSourceId = witnesses[0];
      } else {
        return refuse(
          'span_not_in_cited_source',
          `"${placeObserved}" not found in ${canonicalPlaceSourceId} (witnesses: 0)`,
        );
      }
    }

    const place = canonicalizeObservedPlaceName(placeObserved);
    if (!place) {
      return refuse('empty_canonical_name', placeObserved);
    }

    // THE UNION TRAVELS WHOLE (redteam-l1 F1): derived provenance is ADDED
    // alongside the wire shape — never spread over it into an
    // everything-optional carrier. `general_praise` is NOT re-stored here:
    // it exists only on the place arm of the wire union (a dish mention
    // cannot carry it, by type), and the one writer that needs the legacy
    // semantics derives it from the SHAPE at the point of use.
    return {
      ...wireMention,
      place,
      place_surface: placeObserved,
      place_observed: placeObserved,
      place_source_id: canonicalPlaceSourceId,
      source_id: canonicalSourceId,
      __inputChunkId: chunkResult.chunkId,
      __extractionInputId: extractionInputId,
    } as HydratingMention;
  }

  private resolveDocumentIdForCanonicalSourceId(
    canonicalSourceId: string,
    enrichment: SourceEnrichmentMaps,
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>,
  ): string | null {
    const sourceType =
      enrichment.metadataById.get(canonicalSourceId)?.type ??
      this.inferSourceTypeFromSourceId(canonicalSourceId);
    if (!sourceType) return null;
    return (
      sourceDocumentIdBySourceKey.get(
        buildSourceDocumentKey(sourceType, canonicalSourceId),
      ) ?? null
    );
  }

  /** Second contract stage of chunk hydration: resolve source metadata for a
   *  canonicalized mention. Throws on closed-world violations — callers run
   *  it inside the per-chunk quarantine boundary. */
  private enrichHydratedMention(
    mention: HydratingMention,
    enrichment: SourceEnrichmentMaps,
    sourceDocumentIdBySourceKey: Map<SourceDocumentKey, string>,
  ): EnrichedLLMMention {
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
    // CONSENSUS = OPINIONS, NOT APPLAUSE (owner ruling 2026-08-16): a
    // comment's upvotes co-sign that comment's specific claim, but a post's
    // upvotes applaud the THREAD — they are not co-signs of the post body's
    // claims. So a post-body claim carries exactly its creator's one ballot.
    // Poll alignment: a poll creator's pick counts once, however popular the
    // poll. (Measured before ruling: post claims were 10% of mentions but
    // 82% of upvote mass — median 31 vs 1.)
    const sourceUps =
      sourceType === 'post' ? 1 : (metadata.ups ?? mention.source_ups ?? 0);
    const sourceUrl = metadata.url ?? mention.source_url ?? '';
    // F9201/F4905: unknown date -> ancient de-weighting sentinel, never NOW.
    const createdAt =
      metadata.created_at ??
      mention.source_created_at ??
      UNKNOWN_SOURCE_CREATED_AT_SENTINEL;
    const subreddit = metadata.subreddit ?? mention.subreddit ?? 'unknown';
    const sourceDocumentId = sourceType
      ? (sourceDocumentIdBySourceKey.get(
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
    } as EnrichedLLMMention;
  }

  /** THREAD-LEVEL DEDUPE REBUILD (2026-07-11). Given the covered-source set:
   *  - fully covered post (post id + every comment) → null (drop entirely);
   *  - fully uncovered post (nothing covered) → pass through unchanged;
   *  - partially covered → keep ONLY the top-level threads (root comment +
   *    all descendants via parent_id chains) containing at least one
   *    uncovered comment. The post title/body always ride along as context
   *    for the kept threads, but the post body is only RE-EXTRACTED when the
   *    post id itself is uncovered: extract_from_post is set explicitly and
   *    the chunker honors a pre-set false (its group-0 default only applies
   *    when the pipeline didn't decide).
   *  Sibling threads with no new comments are self-contained worlds — if a
   *  new comment had needed their context it would have been posted under
   *  them — so resending them is pure duplicate spend. Comments whose
   *  parent chain doesn't resolve to another comment in the post (parent is
   *  the post, null, or missing) are treated as thread roots themselves,
   *  matching the chunker's top-level/orphan handling. */
  private rebuildPostForUncoveredThreads(
    post: LLMPost,
    coveredSourceIds: Set<string>,
  ): LLMPost | null {
    const postCovered = coveredSourceIds.has(post.id);
    const uncoveredComments = post.comments.filter(
      (comment) => !coveredSourceIds.has(comment.id),
    );
    if (postCovered && uncoveredComments.length === 0) {
      return null; // fully covered — drop
    }
    const anyCommentCovered = post.comments.length > uncoveredComments.length;
    if (!postCovered && !anyCommentCovered) {
      return post; // brand-new post — pass through unchanged
    }

    const commentById = new Map(
      post.comments.map((comment) => [comment.id, comment]),
    );
    const threadRootOf = (comment: LLMComment): string => {
      let current = comment;
      const visited = new Set<string>([current.id]);
      while (current.parent_id && commentById.has(current.parent_id)) {
        const parent = commentById.get(current.parent_id)!;
        if (visited.has(parent.id)) break; // defensive: cyclic parent_id
        visited.add(parent.id);
        current = parent;
      }
      return current.id;
    };
    const keptThreadRoots = new Set(
      uncoveredComments.map((comment) => threadRootOf(comment)),
    );
    const keptComments = post.comments.filter((comment) =>
      keptThreadRoots.has(threadRootOf(comment)),
    );
    return {
      ...post,
      comments: keptComments,
      extract_from_post: !postCovered,
    };
  }

  /** Everything in the batch was already extracted under the current
   *  contract (or is in flight): a zeroed result, no run created, no LLM
   *  spend. The gate's skip log is the audit trail. */
  private buildFullyCoveredResult(): ExtractionPipelineResult {
    return {
      extractionRunId: '',
      llmOutput: { mentions: [] },
      rawMentionsSample: [],
      dbResult: {
        entitiesCreated: 0,
        connectionsCreated: 0,
        affectedConnectionIds: [],
        affectedPlaceIds: [],
        createdEntityIds: [],
        createdEntitySummaries: [],
        reusedEntitySummaries: [],
      } as unknown as UnifiedProcessingDatabaseResult,
      llmProcessingTimeMs: 0,
      dbProcessingTimeMs: 0,
      chunkDurationMs: 0,
      chunkStats: {
        chunkCount: 0,
        totalComments: 0,
        avgComments: 0,
        minComments: 0,
        maxComments: 0,
        avgEstimatedTokens: 0,
        maxEstimatedTokens: 0,
      },
      processingMetrics: {
        totalDuration: 0,
        chunksProcessed: 0,
        successRate: 1,
        topCommentsCount: 0,
        averageChunkTime: 0,
        fastestChunk: 0,
        slowestChunk: 0,
      },
    };
  }

  private buildSourceBreakdown(
    pipeline: ExtractionPipelineBaseParams['pipeline'],
    postCount: number,
  ): SourceBreakdown {
    return {
      pushshift_archive: pipeline === 'archive' ? postCount : 0,
      reddit_api_chronological: pipeline === 'chronological' ? postCount : 0,
      reddit_api_keyword_search: pipeline === 'keyword' ? postCount : 0,
      reddit_api_on_demand: 0, // 'on-demand' pipeline ghost is dead (§12.7)
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

    // No tolerance for type-prefixed refs (t1_/t3_SRC…): the old-prompt
    // normalizer was deleted on schedule 2026-07-11 after all pre-fix batch
    // jobs drained (llm_batch_jobs: 0 non-terminal before 2026-07-09; warn
    // never fired). Contract drift fails LOUD below.
    const mappedSource = sourceMap[trimmedSourceId];
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
      // LLM_MAX_CHUNK_COMMENTS / LLM_MAX_CHUNK_CHARS were retired from the
      // chunker (packing audit 2026-07-11): chars are derived from the token
      // target inside LlmChunkingService, comments are a fixed thread-coherence
      // bound. Only the token target remains a knob.
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
    const spanTextById = new Map<string, string>();

    llmPosts.forEach((post) => {
      metadataById.set(post.id, {
        type: 'post',
        ups: post.score ?? 0,
        url: post.url ?? '',
        // F9201/F4905: unknown date -> ancient de-weighting sentinel, never NOW.
        created_at: post.created_at ?? UNKNOWN_SOURCE_CREATED_AT_SENTINEL,
        subreddit: post.subreddit ?? '',
      });
      contentById.set(post.id, post.content ?? '');
      postContextBySource.set(post.id, post.content ?? '');
      // Observed-span check text for a POST source: title + body (v17).
      spanTextById.set(
        post.id,
        [post.title ?? '', post.content ?? ''].filter(Boolean).join('\n'),
      );

      (post.comments ?? []).forEach((comment) => {
        metadataById.set(comment.id, {
          type: 'comment',
          ups: comment.score ?? 0,
          url: comment.url ?? '',
          // F9201/F4905: unknown date -> ancient de-weighting sentinel, never NOW.
          created_at: comment.created_at ?? UNKNOWN_SOURCE_CREATED_AT_SENTINEL,
          subreddit: post.subreddit ?? '',
        });
        contentById.set(comment.id, comment.content ?? '');
        postContextBySource.set(comment.id, post.content ?? '');
        // Observed-span check text for a COMMENT source: its body (v17).
        spanTextById.set(comment.id, comment.content ?? '');
      });
    });

    return {
      metadataById,
      contentById,
      postContextBySource,
      spanTextById,
    };
  }

  /** Surface defaults for the dish-side fields. The PLACE surface is set
   *  authoritatively in admitWireMention (place_surface = place_observed,
   *  the v17 wire contract) and needs no fallback here. */
  private ensureSurfaceDefaults(mentions: EnrichedLLMMention[]): void {
    mentions.forEach((mention) => {
      // Dish-arm surface defaults only exist on the dish arm of the union
      // (F1): the place arm has no item fields to default.
      if (isDishMention(mention)) {
        mention.item_surface =
          typeof mention.item_surface === 'string' &&
          mention.item_surface.trim().length > 0
            ? mention.item_surface.trim()
            : mention.item.trim();

        if (Array.isArray(mention.item_categories)) {
          mention.item_category_surfaces = mention.item_categories.map(
            (category, index) => {
              const explicitSurface = Array.isArray(
                mention.item_category_surfaces,
              )
                ? mention.item_category_surfaces[index]
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

        if (Array.isArray(mention.item_attributes)) {
          mention.item_attribute_surfaces = mention.item_attributes.map(
            (attribute, index) => {
              const explicitSurface = Array.isArray(
                mention.item_attribute_surfaces,
              )
                ? mention.item_attribute_surfaces[index]
                : null;
              if (
                typeof explicitSurface === 'string' &&
                explicitSurface.trim().length > 0
              ) {
                return explicitSurface.trim();
              }
              return typeof attribute === 'string' &&
                attribute.trim().length > 0
                ? attribute.trim()
                : null;
            },
          );
        }
      }

      if (Array.isArray(mention.place_attributes)) {
        mention.place_attribute_surfaces = mention.place_attributes.map(
          (attribute, index) => {
            const explicitSurface = Array.isArray(
              mention.place_attribute_surfaces,
            )
              ? mention.place_attribute_surfaces[index]
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

  // normalizePlaceNames DELETED (v17): it was a regex RECOVERY of a missing
  // surface field. Under the observed-span contract the model states the
  // surface (`place_observed`) and cites where it read it — the recovery is
  // dead code (v17-coherence-redteam F2).

  private dropDuplicatePlaceMentions(
    mentions: EnrichedLLMMention[],
    enrichment: SourceEnrichmentMaps,
  ): void {
    const seen = new Set<string>();

    for (let index = mentions.length - 1; index >= 0; index -= 1) {
      const mention = mentions[index];
      const sourceId = mention.source_id?.trim();
      const place = mention.place?.trim().toLowerCase();
      if (!sourceId || !place) {
        continue;
      }

      const item = mention.item?.trim().toLowerCase() ?? '';
      const placeAttributes = (mention.place_attributes ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|');
      const itemAttributes = (mention.item_attributes ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|');
      const categories = (mention.item_categories ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|');
      const content = enrichment.contentById.get(sourceId) ?? '';

      const fingerprint = [
        sourceId,
        place,
        item,
        categories,
        placeAttributes,
        itemAttributes,
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
      // Undated items (F4905: created_at can be null) are excluded from the
      // temporal range rather than fabricated to a spurious timestamp.
      .filter((value): value is string => value !== null)
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
