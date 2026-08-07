import { applyAuditReasonPolicy } from './llm-audit-policy';
import {
  resolveThinkingConfig,
  type GeminiThinkingConfig,
  type ThinkingContext,
} from './gemini-thinking';
import {
  resolveGenerationConfig,
  type GeminiGenerationConfig,
} from './gemini-generation-config';
import { DecisionLedgerService } from '../shared/decision-ledger.service';
import {
  GeminiContextCacheRegistry,
  type CacheVendorOps,
} from './gemini-context-cache.registry';
import {
  callerProfile,
  PROFILE_THINKING_LEVELS,
} from './gemini-caller-profiles';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinishReason } from '@google/genai';
import { GatedGeminiClient } from './gated-gemini-client';
import { Agent, setGlobalDispatcher, type Dispatcher } from 'undici';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { UsageLedgerService } from '../shared/usage-ledger.service';
import { GovernanceService } from '../governance/governance.service';
import { OpsAlertsService } from '../shared/ops-alerts.service';
import { msUntilVendorMonthReset } from '../shared/gemini-pricing';
import {
  LLMConfig,
  LLMModelInput,
  LLMProcessingInput,
  LLMOutputStructure,
  LLMApiResponse,
  LLMPerformanceMetrics,
  LLMSearchQueryAnalysis,
  LLMCuisineExtractionResult,
  LLMModerationResult,
  LLMAttributePlacementInput,
  LLMAttributePlacementResult,
  LLMEntityMatchInput,
  LLMEntityMatchResult,
  LLMPollSubjectResult,
  LLMPollAxis,
  LLMPollAxisConstraint,
  LLMAttributeNameInput,
  LLMRestaurantPlaceChooserCandidate,
  LLMRestaurantPlaceChooserDecision,
  LLMRestaurantPlaceChooserInput,
} from './llm.types';
import { LLMOutputDto } from './dto/llm-output.dto';
import {
  isVendorMonthlyCapError,
  vendorCapDetectorLooksRotted,
} from './vendor-cap-detector';
import {
  LLMAuthenticationError,
  LLMConfigurationError,
  LLMRateLimitError,
  LLMNetworkError,
  LLMApiError,
  LLMResponseParsingError,
} from './llm.exceptions';
import { buildRestaurantPlaceChooserPrompt } from './prompts/restaurant-place-chooser.prompt';
import {
  ATTRIBUTE_NAME_RESPONSE_JSON_SCHEMA,
  CUISINE_HUB_CLASSIFY_RESPONSE_JSON_SCHEMA,
  ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA,
  ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA,
  ENTITY_MATCH_RESPONSE_JSON_SCHEMA,
  POLL_SUBJECT_RESPONSE_JSON_SCHEMA,
  collectionResponseJsonSchemaForSourceRefs,
  jsonSchemaToTypedSchema,
  DISH_KNOWLEDGE_RESPONSE_JSON_SCHEMA,
  CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA,
  MODERATION_RESPONSE_JSON_SCHEMA,
  RESTAURANT_PLACE_CHOOSER_RESPONSE_JSON_SCHEMA,
  SEARCH_QUERY_RESPONSE_JSON_SCHEMA,
} from './prompts/llm-response-schemas';

interface GeminiCacheEntry {
  name: string;
}

type SearchQueryCacheLayer = 'memory' | 'redis';

interface LightweightComment {
  id: string;
  content: string;
  parent_id: string | null;
}

interface LightweightPost {
  id: string;
  title: string;
  content: string;
  extract_from_post: boolean;
  comments: LightweightComment[];
}

interface SearchQueryRawResponse {
  restaurants: unknown;
  foods: unknown;
  foodAttributes: unknown;
  restaurantAttributes: unknown;
  ingredients?: unknown;
}

/** Minimal remote-batch shape the transport reads — exported so the batch
 *  service needs no SDK import of its own (the lockdown spec flags any file
 *  referencing @google/genai outside the gateway). */
export interface GeminiBatchInlinedResponse {
  response?: {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      cachedContentTokenCount?: number;
    };
    modelVersion?: string;
  } | null;
  error?: unknown;
}

export interface GeminiBatchJobRemote {
  state?: unknown;
  error?: unknown;
  dest?: { inlinedResponses?: GeminiBatchInlinedResponse[] };
}

export interface BatchTransportOps {
  create(params: {
    model: string;
    src: unknown;
    config: { displayName: string };
  }): Promise<{ name?: string }>;
  cancel(name: string): Promise<void>;
  get(name: string): Promise<GeminiBatchJobRemote>;
  /** Adoption probe (async-integrity step 3, Law 2): the deterministic
   *  displayName is the submission's idempotency key — a crash between
   *  provider-create and the DB write must ADOPT the existing provider
   *  job on retry, never mint (and pay for) a second one. Returns the
   *  provider job name if a batch with this displayName already exists. */
  findByDisplayName(displayName: string): Promise<string | null>;
}

interface LLMGenerationOptions {
  /** Inline media (images) prepended to the text part — the photo gate's
   *  thumbnail classification rides the same pipeline as text callers. */
  mediaParts?: Array<{ inlineData: { mimeType: string; data: string } }>;
  generationConfig?: GeminiGenerationConfig;
  cacheName?: string | null;
  systemInstruction?: string | null;
  model?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
  thinkingOverride?: {
    includeThoughts?: boolean;
  };
  thinkingContext?: ThinkingContext;
  /** Collection extraction: the chunk's valid SRC refs. Constrains the
   *  response schema's source_id to an enum so ref typos are impossible at
   *  the decode layer (digit-count drift class, attributed 2026-07-10). */
  sourceRefs?: string[];
  /** REQUIRED distinct usage-ledger caller tag (§24 caller taxonomy,
   *  2026-07-25). Every call site must name its prompt class (e.g.
   *  'entity-resolution.match', 'query.interpret') so per-class spend is
   *  measurable. NON-OPTIONAL (F4931): the compiler now refuses a call site
   *  that omits it, so the taxonomy is a type property, not a text-scanned
   *  one. The generic 'llm.callGeminiApi' fallback remains only as a
   *  runtime dead-man for an empty-string tag. */
  usageCaller: string;
}

type CacheRefreshReason =
  | 'bootstrap'
  | 'scheduled'
  | 'gemini_403'
  | 'model_mismatch';

@Injectable()
export class LLMService implements OnModuleInit, OnModuleDestroy {
  private static fetchDiagnosticsAttached = false;
  private static dispatcherConfigured = false;
  private logger!: LoggerService;
  private llmConfig!: LLMConfig;
  private systemPrompt!: string;
  private performanceMetrics: LLMPerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    totalTokensUsed: 0,
    lastReset: new Date(),
    errorCount: 0,
    successRate: 100,
  };

  private gemini!: GatedGeminiClient;
  private redisClient: Redis | null = null;
  private systemInstructionCache: GeminiCacheEntry | null = null; // Cache for collection processing instructions
  private systemInstructionCacheExpiresAt: number | null = null;
  private systemCacheRefreshTimer: NodeJS.Timeout | null = null;
  private systemCacheRefreshInFlight: Promise<void> | null = null;
  /** Bumped by every setActiveSystemPrompt swap. A cache refresh that was
   *  already in flight when the prompt changed must NOT install its result
   *  (final red team F2). */
  private promptGeneration = 0;
  private systemCacheTtlMs = 0;
  private systemCacheRefreshLeadMs = 0;
  private queryResultCacheTtlSeconds = 0;
  private queryResultCacheRedisKey = 'llm:query-analysis';
  private queryResultCacheVersion = 'v1';
  private queryResultCacheLocalTtlMs = 0;
  private queryResultCacheLocalMaxEntries = 0;
  private queryResultCacheIncludeMetadata = false;
  private queryResultMemoryCache = new Map<
    string,
    { analysis: LLMSearchQueryAnalysis; cachedAt: string; expiresAt: number }
  >();
  private queryPrompt!: string;
  private cuisinePrompt!: string;
  private moderationPrompt!: string;
  private attributePlacementPrompt!: string;
  private entityMatchPrompt!: string;
  private pollSubjectPrompt!: string;
  private queryInstructionCache: GeminiCacheEntry | null = null;
  private queryModel!: string;
  private thoughtDebugEntries: {
    query: Record<string, unknown>[];
    content: Record<string, unknown>[];
  } = {
    query: [],
    content: [],
  };
  private thoughtDebugLoaded = {
    query: false,
    content: false,
  };

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly redisService: RedisService,
    private readonly usageLedger: UsageLedgerService,
    private readonly decisionLedger: DecisionLedgerService,
    private readonly governance: GovernanceService,
    private readonly opsAlerts: OpsAlertsService,
    private readonly cacheRegistry: GeminiContextCacheRegistry,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('LLMService');
    this.llmConfig = {
      apiKey: this.configService.get<string>('llm.apiKey') || '',
      model:
        this.configService.get<string>('llm.model') ||
        'gemini-2.5-flash-preview-09-2025',
      // Honest fallbacks mirror configuration.ts (2026-07-11 fold-in); the
      // old `|| 0` fallbacks silently disabled every timeout — a prod hang
      // risk on the interactive query path.
      queryLogOutputs:
        this.configService.get<boolean>('llm.queryLogOutputs') === true,
      baseUrl:
        this.configService.get<string>('llm.baseUrl') ||
        'https://generativelanguage.googleapis.com/v1beta',
      timeout: this.configService.get<number>('llm.timeout') ?? 600_000,
      headersTimeoutMs:
        this.configService.get<number>('llm.headersTimeoutMs') ?? 600_000,
      bodyTimeoutMs:
        this.configService.get<number>('llm.bodyTimeoutMs') ?? 600_000,
      connectTimeoutMs:
        this.configService.get<number>('llm.connectTimeoutMs') ?? 10_000,
      maxTokens: this.configService.get<number>('llm.maxTokens') || 65536, // Gemini 2.5 Flash supports up to 65,536 output tokens
      temperature: this.configService.get<number>('llm.temperature') || 0.1,
      topP: this.configService.get<number>('llm.topP') || 0.95,
      topK: this.configService.get<number>('llm.topK') || 40,
      candidateCount: this.configService.get<number>('llm.candidateCount') || 1,
      thinking: {
        level:
          this.configService.get<string>('llm.thinking.level') || undefined,
        queryLevel:
          this.configService.get<string>('llm.thinking.queryLevel') ||
          undefined,
        perCaller:
          this.configService.get<Record<string, string>>(
            'llm.thinking.perCaller',
          ) ?? undefined,
        includeThoughts:
          this.configService.get<boolean>('llm.thinking.includeThoughts') ===
          true,
      },
      thoughtDebug: {
        enabled:
          this.configService.get<boolean>('llm.thoughtDebug.enabled') === true,
        query:
          this.configService.get<boolean>('llm.thoughtDebug.query') !== false,
        content:
          this.configService.get<boolean>('llm.thoughtDebug.content') !== false,
        maxChars:
          this.configService.get<number>('llm.thoughtDebug.maxChars') || 0,
        maxQueryEntries:
          this.configService.get<number>('llm.thoughtDebug.maxQueryEntries') ||
          0,
        maxContentEntries:
          this.configService.get<number>(
            'llm.thoughtDebug.maxContentEntries',
          ) || 0,
        writeToFile:
          this.configService.get<boolean>('llm.thoughtDebug.writeToFile') ===
          true,
        filePath:
          this.configService.get<string>('llm.thoughtDebug.filePath') ||
          undefined,
        filePathQuery:
          this.configService.get<string>('llm.thoughtDebug.filePathQuery') ||
          undefined,
        filePathContent:
          this.configService.get<string>('llm.thoughtDebug.filePathContent') ||
          undefined,
      },
      retryOptions: {
        // Burned-in literals (cleanup 2026-08-01): configuration.ts has no
        // llm.retryOptions block, so these configService.get reads were
        // always undefined and the fallbacks were the real values.
        maxRetries: 3,
        retryDelay: 1000,
        retryBackoffFactor: 2.0,
      },
      cache: {
        systemTtlSeconds:
          this.configService.get<number>('llm.cache.systemTtlSeconds') ?? 10800,
        systemRefreshLeadSeconds:
          this.configService.get<number>(
            'llm.cache.systemRefreshLeadSeconds',
          ) ?? 600,
        queryResultTtlSeconds:
          this.configService.get<number>('llm.cache.queryResultTtlSeconds') ??
          0,
        queryResultRedisKey:
          this.configService.get<string>('llm.cache.queryResultRedisKey') ??
          'llm:query-analysis',
        queryResultCacheVersion:
          this.configService.get<string>('llm.cache.queryResultCacheVersion') ??
          'v1',
        queryResultLocalTtlSeconds:
          this.configService.get<number>(
            'llm.cache.queryResultLocalTtlSeconds',
          ) ?? 0,
        queryResultLocalMaxEntries:
          this.configService.get<number>(
            'llm.cache.queryResultLocalMaxEntries',
          ) ?? 0,
        queryResultIncludeMetadata:
          this.configService.get<boolean>(
            'llm.cache.queryResultIncludeMetadata',
          ) === true,
      },
    };
    this.queryModel =
      this.configService.get<string>('llm.queryModel') || this.llmConfig.model;
    this.llmConfig.queryModel = this.queryModel;
    this.queryResultCacheTtlSeconds =
      this.llmConfig.cache?.queryResultTtlSeconds ?? 0;
    this.queryResultCacheRedisKey =
      this.llmConfig.cache?.queryResultRedisKey ?? 'llm:query-analysis';
    this.queryResultCacheVersion =
      this.llmConfig.cache?.queryResultCacheVersion ?? 'v1';
    this.queryResultCacheIncludeMetadata =
      this.llmConfig.cache?.queryResultIncludeMetadata === true;
    const localTtlSeconds =
      this.llmConfig.cache?.queryResultLocalTtlSeconds ?? 0;
    const localMaxEntries =
      this.llmConfig.cache?.queryResultLocalMaxEntries ?? 0;
    if (this.queryResultCacheTtlSeconds > 0) {
      const localTtlMs = Math.max(0, localTtlSeconds * 1000);
      this.queryResultCacheLocalTtlMs =
        localTtlMs > 0
          ? Math.min(localTtlMs, this.queryResultCacheTtlSeconds * 1000)
          : 0;
      this.queryResultCacheLocalMaxEntries = Math.max(0, localMaxEntries);
    } else {
      this.queryResultCacheLocalTtlMs = 0;
      this.queryResultCacheLocalMaxEntries = 0;
    }

    // THE Gemini client. Paid surfaces run the spend gate inside the client,
    // so no call site can skip it — see gated-gemini-client.ts.
    this.gemini = new GatedGeminiClient(this.llmConfig.apiKey, () =>
      this.assertSpendBudgetOpen(),
    );
    this.redisClient = this.redisService.getOrThrow();

    // Load system prompt from collection-prompt.md
    this.systemPrompt = this.loadSystemPrompt();
    this.queryPrompt = this.loadQueryPrompt();
    this.cuisinePrompt = this.loadCuisinePrompt();
    this.moderationPrompt = this.loadModerationPrompt();
    this.attributePlacementPrompt = this.loadAttributePlacementPrompt();
    this.entityMatchPrompt = this.loadEntityMatchPrompt();
    this.pollSubjectPrompt = this.loadPollSubjectPrompt();
    this.validateConfig();

    this.logger.info('Gemini LLM service initialized with @google/genai', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'module_init',
      model: this.llmConfig.model,
      queryModel: this.queryModel,
      provider: 'google-genai-library',
      apiKeyExists: !!this.llmConfig.apiKey,
      apiKeyLength: this.llmConfig.apiKey ? this.llmConfig.apiKey.length : 0,
      apiKeyPrefix: this.llmConfig.apiKey
        ? this.llmConfig.apiKey.substring(0, 8) + '...'
        : 'none',
      maxTokens: this.llmConfig.maxTokens,
      thinkingLevel: this.llmConfig.thinking?.level,
      queryThinkingLevel: this.llmConfig.thinking?.queryLevel,
      thinkingQueryLevel: this.llmConfig.thinking?.queryLevel,
      thinkingIncludeThoughts: this.llmConfig.thinking?.includeThoughts,
      thoughtDebug: this.llmConfig.thoughtDebug,
    });

    this.configureGeminiHttpClient();
    this.attachFetchDiagnostics();

    this.initializeSystemCacheConfig();

    // THE LAW: A SCRIPT BOOT MUST NOT START BILLED OR MUTATING BACKGROUND
    // WORK (named 2026-08-03, F1257 — the sibling of `stopCronsForScript`).
    //
    // `stopCronsForScript` closes ONE member of this family: the ~20 @Cron
    // jobs a `createApplicationContext` boot registers. It was never the
    // whole family. Every Nest-booting script — including
    // `corpus-integrity.ts`, whose docstring says "PURE read-only SQL against
    // the live DB" — also inherited whatever module construction happened to
    // do, and module construction here MINTED A BILLED GEMINI CACHE: a ~20k-
    // token context rented for three hours by a nine-second read-only query.
    // Gemini cache STORAGE is priced in token-hours (scripts/lib/cost-report.ts
    // was already burned by exactly that, reporting 13 cents as 0.2 cents).
    //
    // The fix was sitting three lines below, applied to the OTHER cache: the
    // query-instruction cache is lazy because "minting it at boot made every
    // script run rent a cache it never read". That sentence applied verbatim
    // to the system cache too, and the lesson simply stopped at one sibling.
    // Both are lazy now — a cost-bearing vendor resource is acquired by the
    // CONSUMER that needs it, never by module construction.
    //
    // If the API's warm start is worth paying for, it becomes an EXPLICIT
    // warm-up on the api role — not a side effect every `ts-node` inherits.
  }

  onModuleDestroy(): void {
    if (this.systemCacheRefreshTimer) {
      clearTimeout(this.systemCacheRefreshTimer);
      this.systemCacheRefreshTimer = null;
    }
  }

  private initializeSystemCacheConfig(): void {
    const cacheConfig = this.llmConfig.cache;
    const ttlSeconds =
      typeof cacheConfig?.systemTtlSeconds === 'number' &&
      !Number.isNaN(cacheConfig.systemTtlSeconds)
        ? cacheConfig.systemTtlSeconds
        : 10800;
    this.systemCacheTtlMs = Math.max(60_000, ttlSeconds * 1000);

    const refreshLeadSeconds =
      typeof cacheConfig?.systemRefreshLeadSeconds === 'number' &&
      !Number.isNaN(cacheConfig.systemRefreshLeadSeconds)
        ? cacheConfig.systemRefreshLeadSeconds
        : 600;
    let refreshLeadMs = Math.max(30_000, refreshLeadSeconds * 1000);
    if (refreshLeadMs >= this.systemCacheTtlMs) {
      refreshLeadMs = Math.max(30_000, Math.floor(this.systemCacheTtlMs / 2));
    }
    this.systemCacheRefreshLeadMs = refreshLeadMs;
  }

  /**
   * The system-instruction cache name, minted ON FIRST USE (F1257).
   *
   * Same seam as `getQueryCacheName` beside it. Fail-open on any error: null
   * falls back to inline system instructions — paying full rate beats failing
   * a request. The registry is the cross-process store, so the common case is
   * reusing a sibling's live cache for free rather than paying a create.
   */
  private async getSystemCacheName(): Promise<string | null> {
    const memo = this.systemInstructionCache?.name;
    if (
      memo &&
      this.systemInstructionCacheExpiresAt !== null &&
      this.systemInstructionCacheExpiresAt - Date.now() > 300_000
    ) {
      return memo;
    }
    await this.bootstrapSystemInstructionCache();
    return this.systemInstructionCache?.name ?? null;
  }

  private async bootstrapSystemInstructionCache(): Promise<void> {
    // The registry is the cross-process store: this boot-time acquire is a
    // SELECT + reuse in the common case (a sibling already minted the cache
    // for this exact prompt) and pays a vendor create only when no live
    // cache exists. The old Redis persistence layer was a second source of
    // truth for the same fact and is gone.
    try {
      await this.refreshSystemInstructionCache('bootstrap');
    } catch (error) {
      this.logger.warn('Failed to bootstrap system instruction cache', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'init_system_cache',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      this.systemInstructionCache = null;
      this.systemInstructionCacheExpiresAt = null;
    }
  }

  private async refreshSystemInstructionCache(
    reason: CacheRefreshReason = 'scheduled',
  ): Promise<void> {
    if (this.systemCacheRefreshInFlight) {
      return this.systemCacheRefreshInFlight;
    }

    const refreshPromise = this.performSystemCacheRefresh(reason).finally(
      () => {
        this.systemCacheRefreshInFlight = null;
      },
    );

    this.systemCacheRefreshInFlight = refreshPromise;
    return refreshPromise;
  }

  private async performSystemCacheRefresh(
    reason: CacheRefreshReason,
  ): Promise<void> {
    const correlationId = CorrelationUtils.getCorrelationId();
    const previousCacheId = this.systemInstructionCache?.name ?? null;
    const generation = this.promptGeneration;

    this.logger.info('Creating explicit cache for system instructions', {
      correlationId,
      operation: 'refresh_system_cache',
      reason,
      systemPromptLength: this.systemPrompt.length,
    });

    const ttlSeconds = Math.max(1, Math.floor(this.systemCacheTtlMs / 1000));
    // Bad-cache reasons force a fresh mint (the registry retires the bad
    // row so sibling processes stop reusing it too); routine refreshes go
    // through lookup/extend and usually pay nothing.
    const forceRemint = reason === 'model_mismatch' || reason === 'gemini_403';
    const { name: cacheName, expiresAtMs } = await this.createLedgeredCache({
      model: this.llmConfig.model,
      systemInstruction: this.systemPrompt,
      ttlSeconds,
      caller: 'llm.systemInstructionCache',
      minRemainingMs: this.systemCacheRefreshLeadMs,
      forceRemint,
    });

    const expiresAt = expiresAtMs;
    // STALE-GENERATION GUARD (final red team F2): the boot refresh is
    // fire-and-forget, so the registry's setActiveSystemPrompt can land
    // WHILE this mint is in flight. Installing it anyway made Gemini serve
    // the OLD prompt from cache while the run was recorded under the NEW
    // prompt hash — the exact coverage lie the registry exists to prevent.
    if (this.promptGeneration !== generation) {
      this.logger.warn(
        'Discarding system-instruction cache minted for a superseded prompt',
        {
          correlationId,
          operation: 'refresh_system_cache',
          reason,
          cacheId: cacheName,
        },
      );
      return;
    }
    this.systemInstructionCache = { name: cacheName };
    this.systemInstructionCacheExpiresAt = expiresAt;

    this.logger.info('System instruction cache created successfully', {
      correlationId,
      operation: 'refresh_system_cache',
      cacheId: cacheName,
      ttlSeconds,
      reason,
      previousCacheId,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    this.scheduleSystemCacheRefresh();
  }

  private scheduleSystemCacheRefresh(): void {
    if (!this.systemInstructionCacheExpiresAt || this.systemCacheTtlMs <= 0) {
      return;
    }

    if (this.systemCacheRefreshTimer) {
      clearTimeout(this.systemCacheRefreshTimer);
    }

    const now = Date.now();
    const triggerAt =
      this.systemInstructionCacheExpiresAt - this.systemCacheRefreshLeadMs;
    const delay = Math.max(triggerAt - now, 0);

    this.systemCacheRefreshTimer = setTimeout(() => {
      this.refreshSystemInstructionCache('scheduled').catch((error) => {
        this.logger.error('Scheduled system instruction cache refresh failed', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'refresh_system_cache',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      });
    }, delay);
  }

  private clearSystemInstructionCache(): void {
    if (this.systemCacheRefreshTimer) {
      clearTimeout(this.systemCacheRefreshTimer);
      this.systemCacheRefreshTimer = null;
    }
    this.systemInstructionCache = null;
    this.systemInstructionCacheExpiresAt = null;
  }

  private async rebuildQueryInstructionCache(
    reason: CacheRefreshReason,
  ): Promise<void> {
    // Retire the bad row in the REGISTRY too — dropping only the in-process
    // memo would leave sibling processes reusing a cache we know is bad.
    const badName = this.queryInstructionCache?.name;
    if (badName) {
      await this.cacheRegistry.invalidate(badName);
    }
    this.queryInstructionCache = null;
    this.queryCacheExpiresAtMs = null;
    this.logger.info('Query instruction cache dropped; next call re-acquires', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'refresh_query_cache',
      reason,
    });
  }

  private async handleCachedContentModelMismatch(
    cacheName: string,
  ): Promise<void> {
    const correlationId = CorrelationUtils.getCorrelationId();
    if (this.systemInstructionCache?.name === cacheName) {
      this.logger.warn('System instruction cache model mismatch detected', {
        correlationId,
        operation: 'handle_cache_model_mismatch',
        cacheId: cacheName,
      });
      await this.cacheRegistry.invalidate(cacheName);
      await this.refreshSystemInstructionCache('model_mismatch');
      return;
    }
    if (this.queryInstructionCache?.name === cacheName) {
      this.logger.warn('Query instruction cache model mismatch detected', {
        correlationId,
        operation: 'handle_cache_model_mismatch',
        cacheId: cacheName,
      });
      await this.rebuildQueryInstructionCache('model_mismatch');
      return;
    }

    this.logger.warn('Cache model mismatch detected for unknown cache', {
      correlationId,
      operation: 'handle_cache_model_mismatch',
      cacheId: cacheName,
    });
  }

  /** Query-cache memo expiry (registry acquire is the source of truth). */
  private queryCacheExpiresAtMs: number | null = null;

  /**
   * LAZY query-instruction cache. This used to be minted EAGERLY at every
   * boot with no cross-process identity — so every script that loaded the
   * app graph rented a fresh cache it would never read (the dominant share
   * of the 62 abandoned storage rows / ~$27 in one day that the cache
   * metering exposed). Now nothing is acquired until a query-path call
   * actually needs it, and the registry means the common case is reusing a
   * sibling's cache for free. Fail-open on any error: null falls back to
   * inline system instructions — paying full rate beats failing a search.
   */
  private async getQueryCacheName(): Promise<string | null> {
    const memoName = this.queryInstructionCache?.name;
    if (
      memoName &&
      this.queryCacheExpiresAtMs !== null &&
      this.queryCacheExpiresAtMs - Date.now() > 300_000
    ) {
      return memoName;
    }

    const minCachedTokenCount = 1024;
    const estimatedTokens = Math.ceil(this.queryPrompt.length / 4);
    if (estimatedTokens < minCachedTokenCount) {
      return null;
    }

    try {
      const acquired = await this.createLedgeredCache({
        model: this.queryModel,
        systemInstruction: this.queryPrompt,
        ttlSeconds: 10800,
        caller: 'llm.queryInstructionCache',
      });
      this.queryInstructionCache = { name: acquired.name };
      this.queryCacheExpiresAtMs = acquired.expiresAtMs;
      return acquired.name;
    } catch (error) {
      this.logger.warn(
        'Failed to acquire query instruction cache, falling back to inline system instruction',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'init_query_cache',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      this.queryInstructionCache = null;
      this.queryCacheExpiresAtMs = null;
      return null;
    }
  }

  private loadSystemPrompt(): string {
    return this.loadRequiredPromptFile(
      'collection-prompt.md',
      'load_system_prompt',
    );
  }

  private loadQueryPrompt(): string {
    return this.loadRequiredPromptFile('query-prompt.md', 'load_query_prompt');
  }

  private loadCuisinePrompt(): string {
    return this.loadRequiredPromptFile(
      'cuisine-prompt.md',
      'load_cuisine_prompt',
    );
  }

  private loadModerationPrompt(): string {
    return this.loadRequiredPromptFile(
      'moderation-prompt.md',
      'load_moderation_prompt',
    );
  }

  private loadAttributePlacementPrompt(): string {
    return this.loadRequiredPromptFile(
      'attribute-placement-prompt.md',
      'load_attribute_placement_prompt',
    );
  }

  private loadEntityMatchPrompt(): string {
    return this.loadRequiredPromptFile(
      'entity-match-prompt.md',
      'load_entity_match_prompt',
    );
  }

  private loadPollSubjectPrompt(): string {
    return this.loadRequiredPromptFile(
      'poll-subject-prompt.md',
      'load_poll_subject_prompt',
    );
  }

  private loadRequiredPromptFile(filename: string, operation: string): string {
    // __dirname-relative (Railway cutover 2026-07-24): the old
    // process.cwd()/src/... path only worked because every runtime so far
    // happened to run from apps/api with the SOURCE tree present — the
    // Docker image ships dist only and crashed at bootstrap. __dirname
    // resolves to this module's own directory in BOTH runtimes (src under
    // ts-jest, dist under node — nest-cli.json copies prompts/*.md into
    // dist as assets).
    const promptPath = join(__dirname, 'prompts', filename);

    try {
      return readFileSync(promptPath, 'utf-8');
    } catch (error) {
      const message = `Failed to load required prompt file: ${filename}`;

      this.logger.error(message, {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation,
        promptPath,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });

      throw new Error(message);
    }
  }

  private validateConfig(): void {
    const missingFields: string[] = [];
    if (!this.llmConfig.apiKey) missingFields.push('llm.apiKey');
    if (!this.llmConfig.model) missingFields.push('llm.model');

    if (missingFields.length > 0) {
      throw new LLMConfigurationError(
        `Missing required LLM configuration: ${missingFields.join(', ')}`,
      );
    }
  }

  /**
   * Process Reddit content through Gemini LLM for entity extraction
   * Implements PRD Section 6.3 LLM Data Collection Input/Output Structures
   */
  /**
   * @param systemPromptOverride PROMPT A/B ONLY (scripts/prompt-ab.ts): run
   *  this exact system instruction instead of the active collection prompt,
   *  so a candidate can be graded against the live one through THIS gateway
   *  rather than a second Gemini client. Supplying it deliberately bypasses
   *  the collection context cache (see callLLMApi's `collectionPath`), which
   *  is what an A/B wants — neither variant may inherit the other's cache.
   *  Production callers never pass it.
   */
  async processContent(
    input: LLMModelInput,
    systemPromptOverride?: string,
  ): Promise<LLMOutputStructure> {
    this.logger.debug('Processing content through Gemini', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'process_content',
      postCount: input.posts.length,
      totalComments: input.posts.reduce(
        (sum, post) => sum + post.comments.length,
        0,
      ),
    });

    const startTime = Date.now();

    try {
      const prompt = this.buildProcessingPrompt(input);
      const shouldLogThoughts = this.shouldLogThoughts('content');
      const response = await this.callLLMApi(prompt, {
        usageCaller: 'content.extract',
        systemInstruction: systemPromptOverride ?? undefined,
        thinkingOverride: shouldLogThoughts
          ? { includeThoughts: true }
          : undefined,
        sourceRefs:
          'source_map' in input
            ? Object.keys((input as LLMProcessingInput).source_map ?? {})
            : undefined,
      });
      const parsed = this.parseResponse(response);
      parsed.usageMetadata = response.usageMetadata ?? null;
      if (shouldLogThoughts) {
        this.logThoughtDebug('content', response, {
          postCount: input.posts.length,
          postIds: input.posts.map((post) => post.id),
        });
      }

      const responseTime = Date.now() - startTime;
      this.recordSuccessMetrics(
        responseTime,
        response.usageMetadata?.totalTokenCount || 0,
      );

      this.logger.debug('Content processing completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'process_content',
        responseTime,
        mentionsExtracted: parsed.mentions.length,
      });

      return parsed;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordErrorMetrics(responseTime);

      this.logger.error('Content processing failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'process_content',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
        responseTime,
      });

      throw error;
    }
  }

  async analyzeSearchQuery(query: string): Promise<LLMSearchQueryAnalysis> {
    const queryCacheName = await this.getQueryCacheName();
    const usingQueryCache = Boolean(queryCacheName);
    this.logger.info('Analyzing search query through Gemini', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'analyze_search_query',
      query,
      usingQueryInstructionCache: usingQueryCache,
      systemInstructionSource: usingQueryCache ? 'cache_reference' : 'inline',
    });

    const prompt = this.buildSearchQueryPrompt(query);
    const shouldLogThoughts = this.shouldLogThoughts('query');
    const queryGenerationConfig: GeminiGenerationConfig = {
      temperature: Math.min(this.llmConfig.temperature ?? 0.1, 0.2),
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      maxOutputTokens: this.llmConfig.maxTokens || 65536,
      responseMimeType: 'application/json',
      responseJsonSchema: SEARCH_QUERY_RESPONSE_JSON_SCHEMA,
    };
    const queryThinkingConfig = this.getThinkingConfig(
      this.queryModel,
      'query',
      {
        includeThoughts: shouldLogThoughts,
      },
    );
    if (queryThinkingConfig) {
      queryGenerationConfig.thinkingConfig = queryThinkingConfig;
    }

    const cacheKeyResult = this.buildSearchQueryCacheKey(
      query,
      queryGenerationConfig,
    );
    if (cacheKeyResult) {
      const memoryHit = this.getMemoryCachedSearchQueryAnalysis(
        cacheKeyResult.key,
      );
      if (memoryHit) {
        this.logger.debug('Search query analysis memory cache hit', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'analyze_search_query',
          cacheKey: cacheKeyResult.key,
          cachedAt: memoryHit.cachedAt,
        });
        return this.decorateSearchQueryAnalysis(
          memoryHit.analysis,
          true,
          'memory',
        );
      }

      if (this.redisClient) {
        const cached = await this.getCachedSearchQueryAnalysis(
          cacheKeyResult.key,
        );
        if (cached) {
          this.logger.debug('Search query analysis cache hit', {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'analyze_search_query',
            cacheKey: cacheKeyResult.key,
            cachedAt: cached.cachedAt,
          });
          this.setMemoryCachedSearchQueryAnalysis(
            cacheKeyResult.key,
            cached.analysis,
          );
          return this.decorateSearchQueryAnalysis(
            cached.analysis,
            true,
            'redis',
          );
        }
      }
    }

    const response = await this.callLLMApi(prompt, {
      usageCaller: 'query.interpret',
      generationConfig: queryGenerationConfig,
      cacheName: queryCacheName,
      systemInstruction: this.queryPrompt,
      model: this.queryModel,
      maxRetries: 0,
      thinkingContext: 'query',
    });
    const content = this.extractTextContent(response, 'analyze_search_query');
    if (this.llmConfig.queryLogOutputs) {
      this.logger.info('Search query LLM raw output', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'analyze_search_query',
        query,
        outputLength: content.length,
        output: content,
      });
    }
    if (shouldLogThoughts) {
      this.logThoughtDebug('query', response, { query });
    }
    const analysis = this.parseSearchQueryResponse(content);

    const totalInterpretedEntities =
      analysis.restaurants.length +
      analysis.foods.length +
      analysis.foodAttributes.length +
      analysis.restaurantAttributes.length +
      (analysis.ingredients?.length ?? 0);
    if (totalInterpretedEntities === 0) {
      this.logger.warn('LLM returned empty search query interpretation', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'analyze_search_query',
        query,
        rawResponsePreview: content.slice(0, 500),
      });
    }

    this.logger.debug('Search query analysis completed', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'analyze_search_query',
      restaurants: analysis.restaurants.length,
      foods: analysis.foods.length,
      foodAttributes: analysis.foodAttributes.length,
      restaurantAttributes: analysis.restaurantAttributes.length,
    });

    if (cacheKeyResult) {
      this.setMemoryCachedSearchQueryAnalysis(cacheKeyResult.key, analysis);
      await this.setCachedSearchQueryAnalysis(cacheKeyResult, analysis);
    }

    return this.decorateSearchQueryAnalysis(analysis, false, null);
  }

  /**
   * BATCH-MODE request builder for the main collection prompt: the exact
   * contents + config an interactive processContent call would send, with the
   * system prompt referenced via a DEDICATED long-TTL explicit cache.
   *
   * Cost-recon red team 2026-07-11 PROVED batch implicit-cache hits bill at
   * the FULL batch input rate (the portal's ~$69 residual): sending the
   * ~17k-token prompt inline per request re-bought it 9,118 times. An
   * explicit cachedContent reference bills those reads at the cached rate
   * (10x cheaper). The old expired-cache fear is handled by TTL sizing, not
   * by giving up: the batch cache TTL (30h) covers the Batch API's 24h SLA
   * with margin, and storage costs ~$0.51/load (17k tokens x 30h x $1/M/hr) —
   * noise against ~$800 of prompt re-reads at full load.
   */
  async buildCollectionBatchRequest(
    input: LLMModelInput,
    promptOverride?: string,
  ): Promise<{
    contents: string;
    config: Record<string, unknown>;
  }> {
    const contents = this.buildProcessingPrompt(input);
    const config: Record<string, unknown> = {
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
      maxOutputTokens: callerProfile('content.extract')!.maxOutputTokens,
      responseMimeType: 'application/json',
      // The batch backend rejects responseJsonSchema (INVALID_ARGUMENT for
      // every item — attributed via single-variable slice tests) but accepts
      // and enforces the typed responseSchema form, so convert at build time.
      responseSchema: jsonSchemaToTypedSchema(
        collectionResponseJsonSchemaForSourceRefs(
          'source_map' in input
            ? Object.keys((input as LLMProcessingInput).source_map ?? {})
            : undefined,
        ),
      ),
    };
    const effectivePrompt = promptOverride ?? this.systemPrompt;
    const batchCacheName =
      await this.getOrCreateBatchSystemCache(effectivePrompt);
    if (batchCacheName) {
      config.cachedContent = batchCacheName;
    } else {
      // Fail-open to the inline prompt: paying full rate beats failing the
      // batch. The warn in getOrCreateBatchSystemCache is the audit trail.
      config.systemInstruction = effectivePrompt;
    }
    // Same caller profile as the interactive path (red team R8): without
    // the caller arg, a future content.extract perCaller thinking override
    // would apply interactively but silently NOT to batch — the default
    // extraction path. Values coincide today; the seam must not depend on
    // that.
    const thinking = this.getThinkingConfig(
      this.llmConfig.model,
      callerProfile('content.extract')!.context,
      undefined,
      'content.extract',
    );
    if (thinking) {
      config.thinkingConfig = thinking;
    }
    return { contents, config };
  }

  /** Dedicated long-TTL explicit cache for BATCH requests (separate from the
   *  3h interactive cache): TTL must outlive the Batch API's 24h SLA so an
   *  in-flight job can never reference an expired cache. Reused across
   *  submissions while fresh; keyed to the current model + prompt. */
  /** Keyed by prompt content hash — a candidate (shadow) prompt's cache
   *  coexists with the active prompt's cache; the registry dedupes minting
   *  content-addressed underneath. */
  private batchSystemCaches = new Map<
    string,
    { name: string; expiresAtMs: number }
  >();
  /** SINGLE-FLIGHT mint (red team M4): memoizing only the RESULT let a
   *  cold-cache batch build fan N concurrent acquires into the registry,
   *  each parking a Prisma connection on the advisory lock across a vendor
   *  round-trip — a pool-exhaustion wedge. The in-flight promise is the
   *  memo; late callers await the same mint. */
  private batchSystemCacheMints = new Map<string, Promise<string | null>>();
  private static readonly BATCH_CACHE_TTL_MS = 30 * 60 * 60 * 1000;
  /** Refuse to attach a cache that cannot cover a full batch SLA from NOW. */
  private static readonly BATCH_CACHE_MIN_REMAINING_MS = 25 * 60 * 60 * 1000;

  private getOrCreateBatchSystemCache(prompt: string): Promise<string | null> {
    const key = createHash('sha256').update(prompt).digest('hex');
    const inFlight = this.batchSystemCacheMints.get(key);
    if (inFlight) {
      return inFlight;
    }
    const mint = this.mintBatchSystemCache(prompt, key).finally(() => {
      this.batchSystemCacheMints.delete(key);
    });
    this.batchSystemCacheMints.set(key, mint);
    return mint;
  }

  private async mintBatchSystemCache(
    prompt: string,
    key: string,
  ): Promise<string | null> {
    const now = Date.now();
    const held = this.batchSystemCaches.get(key);
    if (
      held &&
      held.expiresAtMs - now > LLMService.BATCH_CACHE_MIN_REMAINING_MS
    ) {
      return held.name;
    }
    try {
      const ttlSeconds = Math.floor(LLMService.BATCH_CACHE_TTL_MS / 1000);
      const cache = await this.createLedgeredCache({
        model: this.llmConfig.model,
        systemInstruction: prompt,
        ttlSeconds,
        caller: 'llm.batchSystemCache',
        // Reuse only above the 25h floor: an in-flight batch job (24h SLA)
        // must never outlive its cache. Below the floor the registry EXTENDS
        // the live cache instead of abandoning it and minting a twin.
        minRemainingMs: LLMService.BATCH_CACHE_MIN_REMAINING_MS,
      });
      this.batchSystemCaches.set(key, {
        name: cache.name,
        expiresAtMs: cache.expiresAtMs,
      });
      this.logger.info('Batch system-prompt cache created', {
        cacheName: cache.name,
        ttlHours: LLMService.BATCH_CACHE_TTL_MS / 3_600_000,
      });
      return cache.name;
    } catch (error) {
      this.logger.warn(
        'Batch system-prompt cache create failed — falling back to inline prompt (full rate)',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      return null;
    }
  }

  /**
   * BATCH-MODE response parser: same parseResponse path the interactive call
   * uses, applied to a stored GenerateContentResponse from a batch item.
   */
  parseCollectionBatchResponse(response: unknown): LLMOutputStructure {
    return this.parseResponse(response as LLMApiResponse);
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /** PROMPT REGISTRY seam (versioned prompts, 2026-08-01): the registry owns
   *  which collection prompt is ACTIVE; on boot (and after activation) it
   *  swaps the in-process copy here. Context caches are content-addressed,
   *  so the next mint under the new content is automatic; the interactive
   *  3h cache refresh cycle picks it up on its own schedule. */
  setActiveSystemPrompt(content: string): void {
    if (content === this.systemPrompt) return;
    this.promptGeneration += 1;
    this.systemPrompt = content;
    this.systemInstructionCache = null;
    this.systemInstructionCacheExpiresAt = null;
    // Drop the in-flight marker too: that promise is minting the OLD
    // prompt's cache and its result is now discarded by the generation
    // guard, so a fresh refresh must be allowed to start immediately.
    this.systemCacheRefreshInFlight = null;
  }

  getContentModel(): string {
    return this.llmConfig.model;
  }

  getGenerationConfigSnapshot(): Record<string, unknown> {
    return {
      temperature: this.llmConfig.temperature ?? null,
      maxOutputTokens: this.llmConfig.maxTokens ?? null,
      topP: this.llmConfig.topP ?? null,
      topK: this.llmConfig.topK ?? null,
      candidateCount: this.llmConfig.candidateCount ?? null,
      thinking: this.llmConfig.thinking ?? null,
    };
  }

  async extractCuisineFromSummary(
    summary: string,
  ): Promise<LLMCuisineExtractionResult> {
    const trimmedSummary = summary?.trim() ?? '';
    if (!trimmedSummary) {
      return { cuisines: [] };
    }

    this.logger.info('Extracting cuisines from summary', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'extract_cuisine_summary',
      summaryLength: trimmedSummary.length,
    });

    const prompt = this.buildCuisineExtractionPrompt(trimmedSummary);
    // Cuisine extraction is a simple per-restaurant classify → cheap Lite tier.
    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('cuisine.extract')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: Math.min(this.llmConfig.temperature ?? 0.1, 0.2),
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseJsonSchema: CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA,
    };
    const thinkingConfig = this.getThinkingConfig(model, 'query');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const response = await this.callLLMApi(prompt, {
      usageCaller: 'cuisine.extract',
      generationConfig,
      systemInstruction: this.cuisinePrompt,
      model,
      maxRetries: 0,
      thinkingContext: 'query',
    });
    const content = this.extractTextContent(
      response,
      'extract_cuisine_summary',
    );
    if (this.llmConfig.queryLogOutputs) {
      this.logger.info('Cuisine extraction LLM raw output', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'extract_cuisine_summary',
        outputLength: content.length,
        output: content,
      });
    }

    const parsed = this.parseCuisineResponse(content);

    this.logger.debug('Cuisine extraction completed', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'extract_cuisine_summary',
      cuisines: parsed.cuisines.length,
    });

    return parsed;
  }

  /**
   * Food-aware content moderation via a cheap LLM pass (Lite model, MINIMAL thinking).
   * Replaces the legacy Google content-moderation classifier, which mis-flagged culinary
   * hyperbole ("killer fries", "drunken noodles") and could not be tuned around it.
   */
  async moderateText(text: string): Promise<LLMModerationResult> {
    const trimmed = text?.trim() ?? '';
    if (!trimmed) {
      return { allowed: true, reason: 'empty' };
    }

    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('moderation.classify')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseJsonSchema: MODERATION_RESPONSE_JSON_SCHEMA,
    };
    const thinkingConfig = this.getThinkingConfig(model, 'query');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const response = await this.callLLMApi(JSON.stringify({ text: trimmed }), {
      usageCaller: 'moderation.classify',
      generationConfig,
      systemInstruction: this.moderationPrompt,
      model,
      maxRetries: 0,
      thinkingContext: 'query',
    });
    const content = this.extractTextContent(response, 'moderate_text');
    const result = this.parseModerationResponse(content);
    this.decisionLedger.record({
      kind: 'moderation',
      input: { text: trimmed },
      decision: result,
      model,
    });
    return result;
  }

  private parseModerationResponse(content: string): LLMModerationResult {
    try {
      const start = content.indexOf('{');
      const json = start >= 0 ? content.slice(start) : content;
      const parsed = JSON.parse(json) as {
        allowed?: unknown;
        reason?: unknown;
      };
      return {
        // Default-allow on ambiguity (conservative blocking; this is food discussion).
        allowed: parsed.allowed !== false,
        reason:
          typeof parsed.reason === 'string' && parsed.reason.trim()
            ? parsed.reason.trim()
            : 'safe',
      };
    } catch (error) {
      this.logger.warn(
        'Failed to parse moderation response; allowing by default',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'moderate_text',
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack, name: error.name }
              : { message: String(error) },
        },
      );
      return { allowed: true, reason: 'parse_error' };
    }
  }

  /**
   * Place ONE candidate attribute term against a shortlist of existing canonicals
   * (the term's embedding-nearest neighbours). Returns match / new / reject. The
   * narrow shortlist + single-term focus is what keeps the decision reliable and
   * lets the model separate same-axis-opposite-value pairs (thick vs thin).
   * Fail-closed: an unparseable response is treated as `new` (never a destructive
   * merge or reject).
   */
  async placeAttribute(
    input: LLMAttributePlacementInput,
  ): Promise<LLMAttributePlacementResult> {
    const term = input.term?.trim() ?? '';
    if (!term) {
      return { decision: 'reject', candidateId: null, reason: 'empty term' };
    }

    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('attribute.place')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      // gemini-3 thinking tokens count against this ceiling, so a tiny JSON reply
      // still needs headroom (512 truncated mid-thought → fail-closed to `new`).
      responseMimeType: 'application/json',
      responseJsonSchema: applyAuditReasonPolicy(
        ATTRIBUTE_PLACEMENT_RESPONSE_JSON_SCHEMA,
      ),
    };
    const thinkingConfig = this.getThinkingConfig(model, 'content');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const payload = JSON.stringify({
      term,
      kind: input.kind,
      candidates: input.candidates.map((c) => ({ id: c.id, name: c.name })),
    });
    const response = await this.callLLMApi(payload, {
      usageCaller: 'attribute.place',
      generationConfig,
      systemInstruction: this.attributePlacementPrompt,
      model,
      maxRetries: 1,
      thinkingContext: 'content',
    });
    const content = this.extractTextContent(response, 'place_attribute');
    const placement = this.parseAttributePlacementResponse(content, input);
    this.decisionLedger.record({
      kind: 'attribute_placement',
      input,
      decision: placement,
      model,
    });
    return placement;
  }

  private parseAttributePlacementResponse(
    content: string,
    input: LLMAttributePlacementInput,
  ): LLMAttributePlacementResult {
    try {
      const start = content.indexOf('{');
      const json = start >= 0 ? content.slice(start) : content;
      const parsed = JSON.parse(json) as {
        decision?: unknown;
        candidate_id?: unknown;
        reason?: unknown;
      };

      const decision =
        parsed.decision === 'match' || parsed.decision === 'reject'
          ? parsed.decision
          : 'new';
      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : decision;

      // Only honour a match that names a real candidate id from the shortlist.
      const candidateId =
        typeof parsed.candidate_id === 'number' ? parsed.candidate_id : null;
      const validIds = new Set(input.candidates.map((c) => c.id));
      if (
        decision === 'match' &&
        (candidateId === null || !validIds.has(candidateId))
      ) {
        return {
          decision: 'new',
          candidateId: null,
          reason: 'match_id_invalid',
        };
      }

      return {
        decision,
        candidateId: decision === 'match' ? candidateId : null,
        reason,
      };
    } catch (error) {
      this.logger.error('Failed to parse attribute placement response', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'place_attribute',
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: String(error) },
      });
      // Fail closed: default to a non-destructive `new`.
      return { decision: 'new', candidateId: null, reason: 'parse_error' };
    }
  }

  /**
   * Match ONE newly-extracted entity (restaurant or dish) against a shortlist of
   * existing entities recalled as its closest neighbours. Returns match / new.
   * This is the precision stage of resolution: recall (lexical + dense) gathers
   * the shortlist, this judges whether `term` is the SAME real-world entity as a
   * candidate. Fail-closed: an unparseable or invalid-id response is treated as
   * `new` (a recoverable spurious entity, never a destructive merge of two reals).
   */
  /**
   * BATCHED same-entity judge: N (term, shortlist) items per request instead of
   * one thinking-enabled call per entity — request count (the scarce resource
   * under the reservation-based rate budget during archive loads) drops ~10x and
   * the system prompt + thinking overhead amortizes across items. Candidates
   * carry their ALIASES (the single-call judge saw bare names — the exact signal
   * that distinguishes "BEC" ↔ "bacon egg and cheese" was thrown away at the
   * decision boundary). Items are delimited per-index and each item fails closed
   * to 'new' independently (absent/invalid index in the response = new).
   */
  async matchEntitiesBatch(input: {
    kind: 'restaurant' | 'food' | 'ingredient';
    items: {
      term: string;
      candidates: { id: number; name: string; aliases?: string[] }[];
    }[];
  }): Promise<{ decision: 'match' | 'new'; candidateId: number | null }[]> {
    const failClosed = input.items.map(() => ({
      decision: 'new' as const,
      candidateId: null,
    }));
    if (!input.items.length) return [];

    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('entity-resolution.match_batch')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      // Output ceiling: profile-supplied; see the OUTPUT CEILING POLICY in
      // gemini-caller-profiles.ts (do not lower without replaying that lesson).
      responseMimeType: 'application/json',
      responseJsonSchema: ENTITY_MATCH_BATCH_RESPONSE_JSON_SCHEMA,
    };
    const systemInstruction =
      `You judge entity identity for a food-discovery database. For EACH item i, ` +
      `decide independently whether item i's "term" names the SAME real-world ` +
      `${input.kind === 'restaurant' ? 'restaurant' : input.kind === 'ingredient' ? 'ingredient' : 'dish'} as one of item i's own ` +
      `candidates (spelling/plural/abbreviation/alias variants of ONE thing = match; ` +
      `related-but-different things = new). NEVER compare a term against another ` +
      `item's candidates. Uncertain = new. Return JSON ` +
      `{"items":[{"index","decision","candidateId"}]} covering every input index; ` +
      `candidateId is the matched candidate's id or null.`;

    try {
      const payload = input.items.map((item, index) => ({
        index,
        term: item.term,
        candidates: item.candidates.map((c) => ({
          id: c.id,
          name: c.name,
          ...(c.aliases?.length ? { aliases: c.aliases.slice(0, 6) } : {}),
        })),
      }));
      const response = await this.callLLMApi(
        JSON.stringify({ items: payload }),
        {
          usageCaller: 'entity-resolution.match_batch',
          generationConfig,
          systemInstruction,
          model,
          maxRetries: 1,
          thinkingContext: 'query',
        },
      );
      const content = this.extractTextContent(response, 'match_entities_batch');
      const start = content.indexOf('{');
      const parsed = JSON.parse(
        start >= 0 ? content.slice(start) : content,
      ) as {
        items?: {
          index?: unknown;
          decision?: unknown;
          candidateId?: unknown;
        }[];
      };
      const results = failClosed.map(
        (r) =>
          ({ ...r }) as {
            decision: 'match' | 'new';
            candidateId: number | null;
          },
      );
      for (const item of parsed.items ?? []) {
        const idx = typeof item.index === 'number' ? item.index : -1;
        if (idx < 0 || idx >= results.length) continue;
        const cid =
          typeof item.candidateId === 'number' ? item.candidateId : null;
        const valid =
          item.decision === 'match' &&
          cid !== null &&
          input.items[idx].candidates.some((c) => c.id === cid);
        results[idx] = valid
          ? { decision: 'match', candidateId: cid }
          : { decision: 'new', candidateId: null };
      }
      for (let i = 0; i < input.items.length; i += 1) {
        this.decisionLedger.record({
          kind: 'entity_match',
          input: { kind: input.kind, ...input.items[i] },
          decision: results[i],
          model,
          metadata: { batched: true },
        });
      }
      return results;
    } catch (error) {
      this.logger.warn('matchEntitiesBatch failed; failing closed to new', {
        items: input.items.length,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      for (let i = 0; i < input.items.length; i += 1) {
        this.decisionLedger.record({
          kind: 'entity_match',
          input: { kind: input.kind, ...input.items[i] },
          decision: failClosed[i],
          model,
          metadata: { batched: true, failClosed: true },
        });
      }
      return failClosed;
    }
  }

  /**
   * KNOWLEDGE-TIER synthesis (world knowledge deliberately encouraged — this
   * is dish knowledge, not testimony; the collection prompt stays
   * source-faithful). For each dish NAME: canonical ingredients + established
   * aliases. Identity modifiers in the name govern ("vegan al pastor taco"
   * must not return pork).
   */
  async synthesizeDishKnowledgeBatch(
    dishes: { name: string }[],
  ): Promise<{ ingredients: string[]; aliases: string[] }[]> {
    const empty = dishes.map(() => ({
      ingredients: [] as string[],
      aliases: [] as string[],
    }));
    if (!dishes.length) return [];

    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseJsonSchema: DISH_KNOWLEDGE_RESPONSE_JSON_SCHEMA,
    };
    const systemInstruction =
      `You are a culinary knowledge base for a food-discovery app. For EACH dish ` +
      `name, return: (1) "ingredients" — the canonical/typical core ingredients of ` +
      `the dish AS NAMED, from world knowledge (assume the standard preparation; ` +
      `identity words in the name govern: "vegan al pastor taco" has no pork, ` +
      `"white pizza" has no tomato sauce). 3-8 core items, singular lowercase, no ` +
      `seasonings-level noise (salt, oil). Empty when the name is too ambiguous to ` +
      `have canonical contents ("combo plate", "seasonal salad"). (2) "aliases" — ` +
      `ESTABLISHED shorthand or co-names for exactly this dish ("bec" for bacon ` +
      `egg and cheese, "army stew" for budae jjigae). An alias must point to ` +
      `nothing but this dish anywhere in the food world ("marg" fails: margarita); ` +
      `never invent, shorten, pluralize, or translate yourself. Empty is the ` +
      `expected default. Return {"dishes":[{"index","ingredients","aliases"}]} ` +
      `covering every input index.`;

    try {
      const payload = dishes.map((dish, index) => ({ index, name: dish.name }));
      const response = await this.callLLMApi(
        JSON.stringify({ dishes: payload }),
        {
          usageCaller: 'dish.knowledge_synthesize',
          generationConfig,
          systemInstruction,
          model: this.llmConfig.model,
          maxRetries: 1,
          thinkingContext: 'query',
        },
      );
      const content = this.extractTextContent(response, 'dish_knowledge');
      const start = content.indexOf('{');
      const parsed = JSON.parse(
        start >= 0 ? content.slice(start) : content,
      ) as {
        dishes?: {
          index?: unknown;
          ingredients?: unknown;
          aliases?: unknown;
        }[];
      };
      const results = empty.map((r) => ({ ...r }));
      for (const item of parsed.dishes ?? []) {
        const idx = typeof item.index === 'number' ? item.index : -1;
        if (idx < 0 || idx >= results.length) continue;
        const clean = (values: unknown): string[] =>
          Array.isArray(values)
            ? Array.from(
                new Set(
                  values
                    .filter((v): v is string => typeof v === 'string')
                    .map((v) => v.trim().toLowerCase())
                    .filter((v) => v.length > 1),
                ),
              )
            : [];
        results[idx] = {
          ingredients: clean(item.ingredients).slice(0, 10),
          aliases: clean(item.aliases).slice(0, 4),
        };
      }
      return results;
    } catch (error) {
      this.logger.warn('synthesizeDishKnowledgeBatch failed; returning empty', {
        dishes: dishes.length,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      return empty;
    }
  }

  async matchEntity(input: LLMEntityMatchInput): Promise<LLMEntityMatchResult> {
    const term = input.term?.trim() ?? '';
    if (!term) {
      return { decision: 'new', candidateId: null, reason: 'empty term' };
    }
    if (!input.candidates.length) {
      return { decision: 'new', candidateId: null, reason: 'no candidates' };
    }

    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('entity-resolution.match')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      // gemini-3 thinking tokens count against this ceiling, so a tiny JSON reply
      // still needs headroom (truncated mid-thought → fail-closed to `new`).
      responseMimeType: 'application/json',
      responseJsonSchema: applyAuditReasonPolicy(
        ENTITY_MATCH_RESPONSE_JSON_SCHEMA,
      ),
    };
    const thinkingConfig = this.getThinkingConfig(model, 'query');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const payload = JSON.stringify({
      term,
      kind: input.kind,
      candidates: input.candidates.map((c) => ({ id: c.id, name: c.name })),
    });
    const response = await this.callLLMApi(payload, {
      usageCaller: 'entity-resolution.match',
      generationConfig,
      systemInstruction: this.entityMatchPrompt,
      model,
      maxRetries: 1,
      // 'query' (MINIMAL thinking) — consistent with matchEntitiesBatch; the
      // same/new judgment measured zero thought tokens either way.
      thinkingContext: 'query',
    });
    const content = this.extractTextContent(response, 'match_entity');
    const match = this.parseEntityMatchResponse(content, input);
    this.decisionLedger.record({
      kind: 'entity_match',
      input,
      decision: match,
      model,
    });
    return match;
  }

  private parseEntityMatchResponse(
    content: string,
    input: LLMEntityMatchInput,
  ): LLMEntityMatchResult {
    try {
      const start = content.indexOf('{');
      const json = start >= 0 ? content.slice(start) : content;
      const parsed = JSON.parse(json) as {
        decision?: unknown;
        candidate_id?: unknown;
        reason?: unknown;
      };

      const decision = parsed.decision === 'match' ? 'match' : 'new';
      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : decision;

      // Only honour a match that names a real candidate id from the shortlist.
      const candidateId =
        typeof parsed.candidate_id === 'number' ? parsed.candidate_id : null;
      const validIds = new Set(input.candidates.map((c) => c.id));
      if (
        decision === 'match' &&
        (candidateId === null || !validIds.has(candidateId))
      ) {
        return {
          decision: 'new',
          candidateId: null,
          reason: 'match_id_invalid',
        };
      }

      return {
        decision,
        candidateId: decision === 'match' ? candidateId : null,
        reason,
      };
    } catch (error) {
      this.logger.error('Failed to parse entity match response', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'match_entity',
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: String(error) },
      });
      // Fail closed: default to a non-destructive `new`.
      return { decision: 'new', candidateId: null, reason: 'parse_error' };
    }
  }

  /**
   * Classify a free-text poll question as `ranked` (a leaderboard over specific
   * dishes/restaurants, with an extracted axis) or `discussion` (an open thread,
   * no leaderboard). Lite model, cheap. Fail-closed: an empty/unparseable question
   * is treated as `discussion` (the safe default — a pointless empty leaderboard
   * is worse than a thread).
   */
  async inferPollSubject(question: string): Promise<LLMPollSubjectResult> {
    const q = question?.trim() ?? '';
    if (!q) {
      return {
        mode: 'discussion',
        confidence: 0,
        axis: null,
        reason: 'empty question',
      };
    }

    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('poll.infer_subject')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseJsonSchema: applyAuditReasonPolicy(
        POLL_SUBJECT_RESPONSE_JSON_SCHEMA,
      ),
    };
    const thinkingConfig = this.getThinkingConfig(model, 'query');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const response = await this.callLLMApi(JSON.stringify({ question: q }), {
      usageCaller: 'poll.infer_subject',
      generationConfig,
      systemInstruction: this.pollSubjectPrompt,
      model,
      maxRetries: 1,
      thinkingContext: 'query',
    });
    const content = this.extractTextContent(response, 'infer_poll_subject');
    return this.parsePollSubjectResponse(content);
  }

  private parsePollSubjectResponse(content: string): LLMPollSubjectResult {
    const fallback: LLMPollSubjectResult = {
      mode: 'discussion',
      confidence: 0,
      axis: null,
      reason: 'parse_error',
    };
    try {
      const start = content.indexOf('{');
      const json = start >= 0 ? content.slice(start) : content;
      const parsed = JSON.parse(json) as Record<string, unknown>;

      const mode = parsed.mode === 'ranked' ? 'ranked' : 'discussion';
      const confidence =
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0;
      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : mode;

      let axis: LLMPollAxis | null = null;
      if (mode === 'ranked') {
        axis = this.parsePollAxis(parsed.axis);
        // A ranked verdict with no usable axis is not actionable → discussion.
        if (!axis) {
          return { mode: 'discussion', confidence, axis: null, reason };
        }
      }

      return { mode, confidence, axis, reason };
    } catch (error) {
      this.logger.error('Failed to parse poll subject response', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'infer_poll_subject',
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: String(error) },
      });
      return fallback;
    }
  }

  private parsePollAxis(raw: unknown): LLMPollAxis | null {
    if (!raw || typeof raw !== 'object') return null;
    const a = raw as Record<string, unknown>;
    const targetType =
      a.target_type === 'dish' || a.target_type === 'restaurant'
        ? a.target_type
        : null;
    if (!targetType) return null;

    const validKinds = new Set([
      'category',
      'cuisine',
      'dish_attribute',
      'restaurant_attribute',
    ]);
    let constraint: LLMPollAxis['constraint'] = null;
    if (a.constraint && typeof a.constraint === 'object') {
      const c = a.constraint as Record<string, unknown>;
      const value = typeof c.value === 'string' ? c.value.trim() : '';
      if (typeof c.kind === 'string' && validKinds.has(c.kind) && value) {
        constraint = {
          kind: c.kind as LLMPollAxisConstraint['kind'],
          value,
        };
      }
    }

    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v.trim() : null;

    return {
      targetType,
      constraint,
      anchor: str(a.anchor),
      marketHint: str(a.market_hint),
    };
  }

  /**
   * Pick the best consumer-facing display name for a synonym group of attribute
   * terms. Returns one of the provided names verbatim; on any failure falls back
   * to the first name (the current canonical) so naming can never corrupt.
   */
  async chooseAttributeName(input: LLMAttributeNameInput): Promise<string> {
    const names = (input.names ?? [])
      .map((n) => n?.trim())
      .filter((n): n is string => Boolean(n));
    if (names.length <= 1) {
      return names[0] ?? '';
    }

    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('attribute.canonicalize_name')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseJsonSchema: ATTRIBUTE_NAME_RESPONSE_JSON_SCHEMA,
    };
    const thinkingConfig = this.getThinkingConfig(model, 'query');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const systemInstruction = `These terms are synonyms for one ${
      input.kind === 'food_attribute' ? 'dish' : 'restaurant'
    } attribute in a food-discovery app. Pick the single clearest consumer-facing label a diner would expect to see as a filter — conventional phrasing over slang, clear over clever, concise over verbose. Return JSON {"name": <one of the terms, copied verbatim>}.`;

    try {
      const response = await this.callLLMApi(JSON.stringify({ terms: names }), {
        usageCaller: 'attribute.canonicalize_name',
        generationConfig,
        systemInstruction,
        model,
        maxRetries: 0,
        thinkingContext: 'query',
      });
      const content = this.extractTextContent(response, 'choose_attr_name');
      const start = content.indexOf('{');
      const parsed = JSON.parse(
        start >= 0 ? content.slice(start) : content,
      ) as {
        name?: unknown;
      };
      const chosen = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      // Only honour a verbatim member of the group.
      return (
        names.find((n) => n.toLowerCase() === chosen.toLowerCase()) ?? names[0]
      );
    } catch (error) {
      this.logger.warn('Attribute naming failed; keeping current canonical', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'choose_attr_name',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return names[0];
    }
  }

  /**
   * One-shot MIGRATION classifier (not a runtime path): for each candidate food
   * name of the `{X} food/meal/dish` shape, decide whether it is a CUISINE HUB —
   * the remainder after stripping the filler noun is a cuisine/nationality/
   * regional adjective ("vietnamese food", "indian meal") — versus a legitimate
   * orderable category where the remainder is a style, meal period, format,
   * ingredient, or descriptor ("comfort food", "breakfast food", "street food",
   * "egg dish", "side dish", "family meal"). Same essence test as the collection
   * prompt's Step 4.2 empty-set gate, applied to already-persisted names.
   */
  async classifyCuisineHubs(
    names: string[],
  ): Promise<{ name: string; isCuisineHub: boolean }[]> {
    const cleaned = names.map((n) => n?.trim()).filter(Boolean);
    if (!cleaned.length) return [];

    // Model comes from THE caller profile (gemini-caller-profiles.ts) —
    // one table, keyed by the ledger's caller column.
    const model = callerProfile('cuisine.classify_hubs')!.model!;
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseJsonSchema: CUISINE_HUB_CLASSIFY_RESPONSE_JSON_SCHEMA,
    };
    const systemInstruction =
      'You classify food-entity names in a dish database. Each name has the shape ' +
      '"{X} food/meal/dish(es)". Decide per name: after removing the filler noun, is X a ' +
      'CUISINE, NATIONALITY, or REGIONAL-CUISINE adjective (then isCuisineHub=true — e.g. ' +
      '"vietnamese food", "indian meal", "sichuanese food")? Or is X a style, meal period, ' +
      'dining format, ingredient, or descriptor that makes the WHOLE name an orderable ' +
      'category a diner could ask for (then isCuisineHub=false — e.g. "comfort food", ' +
      '"breakfast food", "street food", "soul food", "egg dish", "side dish", "family meal", ' +
      '"8 course meal", "prepared food")? Return JSON {"verdicts":[{"name","isCuisineHub"}]} ' +
      'covering EVERY input name verbatim.';

    const response = await this.callLLMApi(JSON.stringify({ names: cleaned }), {
      usageCaller: 'cuisine.classify_hubs',
      generationConfig,
      systemInstruction,
      model,
      maxRetries: 1,
      thinkingContext: 'query',
    });
    const content = this.extractTextContent(response, 'classify_cuisine_hubs');
    const start = content.indexOf('{');
    const parsed = JSON.parse(start >= 0 ? content.slice(start) : content) as {
      verdicts?: { name?: unknown; isCuisineHub?: unknown }[];
    };
    const byName = new Map(
      (parsed.verdicts ?? [])
        .filter((v) => typeof v.name === 'string')
        .map((v) => [
          (v.name as string).trim().toLowerCase(),
          v.isCuisineHub === true,
        ]),
    );
    // Fail-closed per name: absent from the response => NOT a hub (never archive
    // on missing evidence).
    return cleaned.map((name) => ({
      name,
      isCuisineHub: byName.get(name.toLowerCase()) ?? false,
    }));
  }

  async chooseRestaurantPlaceCandidate(
    input: LLMRestaurantPlaceChooserInput,
  ): Promise<LLMRestaurantPlaceChooserDecision> {
    const trimmedQuery = input.query?.trim() ?? '';
    const candidates = Array.isArray(input.candidates)
      ? input.candidates.filter(
          (candidate): candidate is LLMRestaurantPlaceChooserCandidate =>
            Boolean(candidate?.candidateId?.trim()) &&
            Boolean(candidate?.name?.trim()),
        )
      : [];

    if (!trimmedQuery || candidates.length === 0) {
      return {
        decision: 'reject',
        candidateId: null,
      };
    }

    const prompt = buildRestaurantPlaceChooserPrompt({
      ...input,
      query: trimmedQuery,
      candidates,
    });

    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      responseMimeType: 'application/json',
      responseJsonSchema: RESTAURANT_PLACE_CHOOSER_RESPONSE_JSON_SCHEMA,
    };

    // Model + ceiling come from the caller profile. NOTE: this call used to
    // pass no systemInstruction and therefore silently inherited the 78KB
    // collection prompt inline — measured 19,832 avg input tokens for a
    // yes/no chooser (86 ledger rows). The gateway's fallback fix ends that.
    const response = await this.callLLMApi(prompt, {
      usageCaller: 'places.choose_candidate',
      generationConfig,
      maxRetries: 0,
      thinkingContext: 'query',
    });
    const content = this.extractTextContent(
      response,
      'choose_restaurant_place_candidate',
    );

    try {
      const parsed = JSON.parse(
        content,
      ) as Partial<LLMRestaurantPlaceChooserDecision>;
      const decision = parsed.decision === 'select' ? 'select' : 'reject';
      const candidateId =
        typeof parsed.candidateId === 'string' &&
        parsed.candidateId.trim().length
          ? parsed.candidateId.trim()
          : null;

      if (
        decision === 'select' &&
        candidateId &&
        candidates.some((candidate) => candidate.candidateId === candidateId)
      ) {
        this.logger.debug('Restaurant place chooser selected candidate', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'choose_restaurant_place_candidate',
          query: trimmedQuery,
          candidateId,
          candidateCount: candidates.length,
        });
        return { decision, candidateId };
      }

      this.logger.debug('Restaurant place chooser rejected candidates', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'choose_restaurant_place_candidate',
        query: trimmedQuery,
        candidateCount: candidates.length,
        decision,
      });
      return {
        decision,
        candidateId: decision === 'select' ? candidateId : null,
      };
    } catch (error) {
      this.logger.warn('Failed to parse restaurant place chooser response', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'choose_restaurant_place_candidate',
        query: trimmedQuery,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        },
        responsePreview: content.slice(0, 500),
      });
      return {
        decision: 'reject',
        candidateId: null,
      };
    }
  }

  /**
   * Build the processing prompt using the complete collection-prompt.md system prompt
   */
  private buildProcessingPrompt(input: LLMModelInput): string {
    // Validate input structure first to prevent undefined access errors
    if (!input || !input.posts || !Array.isArray(input.posts)) {
      throw new Error(
        `Invalid LLM input structure: ${JSON.stringify({
          hasInput: !!input,
          hasPostsProperty: input && 'posts' in input,
          postsType: input && typeof input.posts,
        })}`,
      );
    }

    // Filter out any undefined or null posts
    const validPosts = input.posts.filter((post, index) => {
      if (!post) {
        this.logger.warn(
          `Found undefined/null post at index ${index}, skipping`,
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'build_processing_prompt',
            inputPostsLength: input.posts.length,
            undefinedIndex: index,
          },
        );
        return false;
      }
      return true;
    });

    if (validPosts.length === 0) {
      throw new Error(
        `No valid posts found in LLM input. Total posts: ${input.posts.length}, valid: ${validPosts.length}`,
      );
    }

    // Return only the minimal data needed by the LLM (lightweight projection)
    const lightweightPosts: LightweightPost[] = validPosts.map((post) => {
      const comments = Array.isArray(post.comments) ? post.comments : [];
      const formattedComments: LightweightComment[] = comments.map(
        (comment) => ({
          id: comment.id,
          content: comment.content,
          parent_id: comment.parent_id ?? null,
        }),
      );

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        extract_from_post: Boolean(post.extract_from_post),
        comments: formattedComments,
      };
    });

    const promptData = JSON.stringify({ posts: lightweightPosts }, null, 2);

    // DEBUG LOGGING: Track input size for massive token generation issue
    const totalComments = lightweightPosts.reduce(
      (sum, post) => sum + post.comments.length,
      0,
    );
    const totalCommentCharacters = lightweightPosts.reduce(
      (sum, post) =>
        sum +
        post.comments.reduce(
          (commentSum, comment) => commentSum + comment.content.length,
          0,
        ),
      0,
    );
    const avgCommentLength =
      totalComments > 0 ? totalCommentCharacters / totalComments : 0;

    this.logger.debug('🔍 INPUT SIZE DEBUG - LLM prompt built', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'build_processing_prompt',
      inputStats: {
        postsCount: lightweightPosts.length,
        totalComments,
        promptCharacters: promptData.length,
        avgCommentLength: Math.round(avgCommentLength),
        postIds: lightweightPosts.map((post) => post.id),
        commentCounts: lightweightPosts.map((post) => post.comments.length),
      },
      warning: totalComments > 50 ? 'HIGH_COMMENT_COUNT' : 'NORMAL',
    });

    return promptData;
  }

  private buildSearchQueryPrompt(query: string): string {
    return JSON.stringify({ query });
  }

  private buildCuisineExtractionPrompt(summary: string): string {
    return JSON.stringify({ summary });
  }

  private normalizeSearchQueryForCache(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private buildSearchQueryCacheKey(
    query: string,
    generationConfig: GeminiGenerationConfig,
  ): { key: string; promptHash: string } | null {
    if (this.queryResultCacheTtlSeconds <= 0) {
      return null;
    }
    const hasCacheLayer =
      this.queryResultCacheLocalMaxEntries > 0 || Boolean(this.redisClient);
    if (!hasCacheLayer) {
      return null;
    }

    const normalizedQuery = this.normalizeSearchQueryForCache(query);
    if (!normalizedQuery) {
      return null;
    }

    const promptSignature = JSON.stringify({
      version: this.queryResultCacheVersion,
      model: this.queryModel,
      prompt: this.queryPrompt,
      responseMimeType: generationConfig.responseMimeType ?? null,
      responseSchema: generationConfig.responseJsonSchema ?? null,
      responseSchemaLegacy: generationConfig.responseSchema ?? null,
      thinkingConfig: generationConfig.thinkingConfig ?? null,
      temperature: generationConfig.temperature ?? null,
      topP: generationConfig.topP ?? null,
      topK: generationConfig.topK ?? null,
      maxOutputTokens: generationConfig.maxOutputTokens ?? null,
      candidateCount: generationConfig.candidateCount ?? null,
    });
    const promptHash = this.hashString(promptSignature);
    const queryHash = this.hashString(normalizedQuery);
    const key = `${this.queryResultCacheRedisKey}:${promptHash}:${queryHash}`;

    return { key, promptHash };
  }

  private async getCachedSearchQueryAnalysis(key: string): Promise<{
    analysis: LLMSearchQueryAnalysis;
    cachedAt: string;
  } | null> {
    if (!this.redisClient || this.queryResultCacheTtlSeconds <= 0) {
      return null;
    }

    try {
      const raw = await this.redisClient.get(key);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as {
        analysis?: LLMSearchQueryAnalysis;
        cachedAt?: string;
      };
      if (!parsed?.analysis) {
        return null;
      }
      return {
        analysis: parsed.analysis,
        cachedAt: parsed.cachedAt ?? new Date(0).toISOString(),
      };
    } catch (error) {
      this.logger.warn('Failed to load search query analysis cache', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'analyze_search_query',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  private async setCachedSearchQueryAnalysis(
    cacheKey: { key: string; promptHash: string },
    analysis: LLMSearchQueryAnalysis,
  ): Promise<void> {
    if (!this.redisClient || this.queryResultCacheTtlSeconds <= 0) {
      return;
    }

    const analysisPayload: LLMSearchQueryAnalysis = {
      restaurants: analysis.restaurants,
      foods: analysis.foods,
      foodAttributes: analysis.foodAttributes,
      restaurantAttributes: analysis.restaurantAttributes,
      ingredients: analysis.ingredients ?? [],
    };
    const payload = {
      analysis: analysisPayload,
      cachedAt: new Date().toISOString(),
      promptHash: cacheKey.promptHash,
      version: this.queryResultCacheVersion,
      model: this.queryModel,
    };

    try {
      await this.redisClient.set(
        cacheKey.key,
        JSON.stringify(payload),
        'EX',
        Math.max(1, this.queryResultCacheTtlSeconds),
      );
    } catch (error) {
      this.logger.warn('Failed to persist search query analysis cache', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'analyze_search_query',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private getMemoryCachedSearchQueryAnalysis(
    key: string,
  ): { analysis: LLMSearchQueryAnalysis; cachedAt: string } | null {
    if (
      this.queryResultCacheLocalMaxEntries <= 0 ||
      this.queryResultCacheLocalTtlMs <= 0
    ) {
      return null;
    }
    const entry = this.queryResultMemoryCache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.queryResultMemoryCache.delete(key);
      return null;
    }
    this.queryResultMemoryCache.delete(key);
    this.queryResultMemoryCache.set(key, entry);
    return { analysis: entry.analysis, cachedAt: entry.cachedAt };
  }

  private setMemoryCachedSearchQueryAnalysis(
    key: string,
    analysis: LLMSearchQueryAnalysis,
  ): void {
    if (
      this.queryResultCacheLocalMaxEntries <= 0 ||
      this.queryResultCacheLocalTtlMs <= 0
    ) {
      return;
    }
    const analysisPayload: LLMSearchQueryAnalysis = {
      restaurants: analysis.restaurants,
      foods: analysis.foods,
      foodAttributes: analysis.foodAttributes,
      restaurantAttributes: analysis.restaurantAttributes,
      ingredients: analysis.ingredients ?? [],
    };
    const entry = {
      analysis: analysisPayload,
      cachedAt: new Date().toISOString(),
      expiresAt: Date.now() + this.queryResultCacheLocalTtlMs,
    };
    if (this.queryResultMemoryCache.has(key)) {
      this.queryResultMemoryCache.delete(key);
    }
    this.queryResultMemoryCache.set(key, entry);
    this.pruneMemorySearchQueryCache();
  }

  private pruneMemorySearchQueryCache(): void {
    if (this.queryResultCacheLocalMaxEntries <= 0) {
      this.queryResultMemoryCache.clear();
      return;
    }
    while (
      this.queryResultMemoryCache.size > this.queryResultCacheLocalMaxEntries
    ) {
      const oldestKey = this.queryResultMemoryCache.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) {
        break;
      }
      this.queryResultMemoryCache.delete(oldestKey);
    }
  }

  private decorateSearchQueryAnalysis(
    analysis: LLMSearchQueryAnalysis,
    cacheHit: boolean,
    cacheLayer: SearchQueryCacheLayer | null,
  ): LLMSearchQueryAnalysis {
    if (!this.queryResultCacheIncludeMetadata) {
      return analysis;
    }

    const metadata = {
      ...(analysis.metadata ?? {}),
      cacheHit,
      cacheLayer,
    };
    return { ...analysis, metadata };
  }

  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private extractTextContent(
    response: LLMApiResponse,
    operation: string,
  ): string {
    if (!response.candidates || response.candidates.length === 0) {
      throw new LLMResponseParsingError(
        `No candidates in Gemini response for ${operation}`,
        JSON.stringify(response),
      );
    }

    const candidate = response.candidates[0];
    if (
      !candidate.content ||
      !candidate.content.parts ||
      candidate.content.parts.length === 0
    ) {
      throw new LLMResponseParsingError(
        `No content parts in Gemini response for ${operation}`,
        JSON.stringify(response),
      );
    }

    const textParts = candidate.content.parts.filter(
      (part) => typeof part.text === 'string' && part.thought !== true,
    );
    const content = textParts.map((part) => part.text).join('');
    if (content) {
      return content;
    }

    const fallbackContent = candidate.content.parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (!fallbackContent) {
      throw new LLMResponseParsingError(
        `Empty text content in Gemini response for ${operation}`,
        JSON.stringify(response),
      );
    }

    this.logger.warn('Gemini response only contained thought text parts', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation,
    });

    return fallbackContent;
  }

  private sanitizeJsonContent(content: string): string {
    let cleanContent = content.trim();

    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/u, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent
        .replace(/^```\s*/, '')
        .replace(/\s*```$/u, '');
    }

    if (!cleanContent.endsWith('}') && !cleanContent.endsWith(']')) {
      const lastCompleteObjectIndex = cleanContent.lastIndexOf('},');
      if (lastCompleteObjectIndex > 0) {
        const afterLastObject = cleanContent.substring(
          lastCompleteObjectIndex + 2,
        );
        const closingBracketIndex = afterLastObject.indexOf(']');
        if (
          closingBracketIndex === -1 ||
          afterLastObject.indexOf('"') < closingBracketIndex
        ) {
          cleanContent =
            cleanContent.substring(0, lastCompleteObjectIndex + 1) + '\n  ]\n}';
        }
      }
    }

    return cleanContent;
  }

  private isCachedContentMissingError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    if (!message) {
      return false;
    }

    if (message.includes('CachedContent not found')) {
      return true;
    }

    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes('cachedcontent') &&
      lowerMessage.includes('permission_denied')
    ) {
      return true;
    }

    const jsonMatch = message.match(/\{"error":\{[\s\S]*\}\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          error?: { code?: number; status?: string; message?: string };
        };
        if (
          parsed?.error?.code === 403 &&
          (parsed.error.status === 'PERMISSION_DENIED' ||
            parsed.error.message?.includes('CachedContent'))
        ) {
          return true;
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    return false;
  }

  private isCachedContentModelMismatchError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    if (!message) {
      return false;
    }
    return (
      message.includes('Model used by GenerateContent request') &&
      message.includes('CachedContent')
    );
  }

  private parseSearchQueryResponse(content: string): LLMSearchQueryAnalysis {
    const cleanContent = this.sanitizeJsonContent(content);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown JSON parse error';
      throw new LLMResponseParsingError(
        `Failed to parse search query analysis response: ${reason}`,
        content,
      );
    }

    if (!this.isSearchQueryResponse(parsed)) {
      throw new LLMResponseParsingError(
        'Search query analysis response was not in the expected format',
        content,
      );
    }

    const restaurants = this.coerceStringArray(parsed.restaurants);
    const foods = this.coerceStringArray(parsed.foods);
    const foodAttributes = this.coerceStringArray(parsed.foodAttributes);
    const restaurantAttributes = this.coerceStringArray(
      parsed.restaurantAttributes,
    );
    const ingredients = this.coerceStringArray(parsed.ingredients);

    return {
      restaurants,
      foods,
      foodAttributes,
      restaurantAttributes,
      ingredients,
    };
  }

  private parseCuisineResponse(content: string): LLMCuisineExtractionResult {
    const cleanContent = this.sanitizeJsonContent(content);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown JSON parse error';
      throw new LLMResponseParsingError(
        `Failed to parse cuisine extraction response: ${reason}`,
        content,
      );
    }

    if (!this.isCuisineResponse(parsed)) {
      throw new LLMResponseParsingError(
        'Cuisine extraction response was not in the expected format',
        content,
      );
    }

    const cuisines = this.coerceStringArray(parsed.cuisines);

    return { cuisines };
  }

  private coerceStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const set = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }
      const normalized = entry.trim();
      if (normalized.length) {
        set.add(normalized);
      }
    }

    return Array.from(set);
  }

  private isCuisineResponse(
    value: unknown,
  ): value is LLMCuisineExtractionResult {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;
    return this.isStringArray(record.cuisines);
  }

  private isSearchQueryResponse(
    value: unknown,
  ): value is SearchQueryRawResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;
    return (
      this.isStringArray(record.restaurants) &&
      this.isStringArray(record.foods) &&
      this.isStringArray(record.foodAttributes) &&
      this.isStringArray(record.restaurantAttributes)
    );
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    );
  }

  /**
   * §24.1 Tier 3 CATASTROPHE BACKSTOP — the gemini.monthlySpend gate (see
   * callLLMApi + batch submit). Demoted by §24.4 item 2: this is no longer
   * "the" work governor. Healthy operation stops spend upstream of here —
   * Tier 1 (owner-approved campaigns) via their envelope
   * (spend-campaign.service.ts), Tier 2 (steady-state lanes) via per-lane
   * cost baselines (collector-source-registry.ts's recordLaneCost) — so
   * this backstop is expected to NEVER fire in healthy operation. Its limit
   * is BACKSTOP_MULTIPLE × the trailing measured monthly spend, re-derived
   * nightly by SpendAnalyticsService (governance.service.ts's
   * gemini.monthlySpend registration comment); a firing here is an
   * INCIDENT, not scheduling — "a bug cost at most two extra months."
   */
  /** Delegates to THE gemini spend gate (GovernanceService). Kept as a thin
   *  named method because call sites read better, and because the batch path
   *  once had its own divergent copy of this logic — one implementation now. */
  async assertSpendBudgetOpen(): Promise<void> {
    await this.governance.assertGeminiSpendOpen();
  }

  /**
   * THE public gateway for Gemini calls made by services OUTSIDE LlmService.
   *
   * Before this method, every outside caller (the relevance gate, the photo
   * gate) built its own GoogleGenAI client and its own request — which is
   * exactly how each historical cost bug happened: an assembler forgetting
   * the thinking level, the admission gate, or a ledger field. Routing
   * through here gets ALL of it by construction: spend admission, caller
   * profile (model/ceiling/thinking), universal config defaults, retry
   * classification, and full ledger accounting (thinking tokens, cached
   * tokens, runKey).
   *
   * The caller declares INTENT — who it is, what it wants generated, its
   * response shape — never mechanics.
   */
  async generateForCaller(params: {
    /** §24 usageCaller tag; selects the caller profile AND the ledger tag. */
    caller: string;
    prompt: string;
    systemInstruction?: string;
    mediaParts?: Array<{ inlineData: { mimeType: string; data: string } }>;
    generationConfig?: GeminiGenerationConfig;
    maxRetries?: number;
  }): Promise<string> {
    const response = await this.callLLMApi(params.prompt, {
      usageCaller: params.caller,
      systemInstruction: params.systemInstruction,
      mediaParts: params.mediaParts,
      generationConfig: params.generationConfig,
      maxRetries: params.maxRetries ?? 1,
    });
    return this.extractTextContent(response, `caller:${params.caller}`);
  }

  /**
   * Make authenticated API call to Gemini service using @google/genai library
   */
  private async callLLMApi(
    prompt: string,
    options: LLMGenerationOptions,
  ): Promise<LLMApiResponse> {
    // §24.1 Tier 3 catastrophe backstop (demoted from work governor, §24.4
    // item 2): when the gemini.monthlySpend pool (metered from ACTUAL
    // dollars at the usage-ledger chokepoint) is spent or vendor-poisoned,
    // fail HERE — locally, instantly, zero vendor calls. Callers treat it
    // like any transient LLM failure, so queued work refills and drains
    // when the backstop reopens; nothing storms Google. Expected to never
    // fire — Tier 1/2 govern spend upstream (see assertSpendBudgetOpen).
    await this.assertSpendBudgetOpen();
    // CALLER PROFILE is the source of per-caller configuration (model,
    // output ceiling, thinking context/level) — one table keyed by the same
    // usageCaller the ledger records. An explicit option still wins, so a
    // deliberate per-call override remains possible; what is no longer
    // possible is a call site FORGETTING one of these and silently getting
    // an expensive default.
    const profile = callerProfile(options.usageCaller);
    const targetModel = options.model ?? profile?.model ?? this.llmConfig.model;
    const maxRetries =
      typeof options.maxRetries === 'number' && options.maxRetries >= 0
        ? options.maxRetries
        : (this.llmConfig.retryOptions?.maxRetries ?? 3);
    const baseDelay = this.llmConfig.retryOptions?.retryDelay ?? 1000;
    const backoff = this.llmConfig.retryOptions?.retryBackoffFactor ?? 2.0;

    type RateLimitKind = 'rpm' | 'tpm' | 'daily_quota' | 'unknown';
    type RateLimitClassification = {
      kind: RateLimitKind;
      resetTimeSeconds: number;
      providerStatusCode?: number;
      providerStatus?: string;
      providerMessage?: string;
      quotaMetric?: string;
    };

    const extractJsonObjectFromString = (
      text: string,
      startIndex: number,
    ): string | null => {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = startIndex; i < text.length; i++) {
        const ch = text[i] ?? '';
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
          continue;
        }

        if (ch === '{') {
          depth++;
          continue;
        }

        if (ch === '}') {
          depth--;
          if (depth === 0) {
            return text.slice(startIndex, i + 1);
          }
        }
      }

      return null;
    };

    const extractGoogleErrorEnvelope = (
      message: string,
    ): {
      error?: {
        code?: number;
        status?: string;
        message?: string;
        details?: unknown[];
      };
    } | null => {
      const startIndex = message.indexOf('{"error"');
      if (startIndex < 0) {
        return null;
      }
      const json = extractJsonObjectFromString(message, startIndex);
      if (!json) {
        return null;
      }

      try {
        return JSON.parse(json) as {
          error?: {
            code?: number;
            status?: string;
            message?: string;
            details?: unknown[];
          };
        };
      } catch {
        return null;
      }
    };

    const parseRetryDelaySeconds = (value: unknown): number | undefined => {
      if (typeof value === 'string') {
        const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/i);
        if (!match) {
          return undefined;
        }
        const seconds = Number.parseFloat(match[1] ?? '');
        return Number.isFinite(seconds) ? seconds : undefined;
      }

      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const secondsRaw = record.seconds;
        const nanosRaw = record.nanos;
        const seconds =
          typeof secondsRaw === 'number'
            ? secondsRaw
            : typeof secondsRaw === 'string'
              ? Number.parseFloat(secondsRaw)
              : undefined;
        const nanos =
          typeof nanosRaw === 'number'
            ? nanosRaw
            : typeof nanosRaw === 'string'
              ? Number.parseFloat(nanosRaw)
              : undefined;
        if (
          !Number.isFinite(seconds ?? NaN) &&
          !Number.isFinite(nanos ?? NaN)
        ) {
          return undefined;
        }
        return Math.max(
          0,
          (Number.isFinite(seconds ?? NaN) ? (seconds as number) : 0) +
            (Number.isFinite(nanos ?? NaN) ? (nanos as number) : 0) / 1e9,
        );
      }

      return undefined;
    };

    const classifyRateLimit = (
      err: unknown,
    ): RateLimitClassification | null => {
      const providerMessage =
        err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const lowerMessage = providerMessage.toLowerCase();
      const providerStatusCode =
        err && typeof err === 'object'
          ? (() => {
              const raw = (err as Record<string, unknown>).status;
              return typeof raw === 'number' ? raw : undefined;
            })()
          : undefined;

      const envelope = extractGoogleErrorEnvelope(providerMessage);
      const envelopeCode = envelope?.error?.code;
      const envelopeStatus = envelope?.error?.status
        ? String(envelope.error.status)
        : undefined;
      const envelopeMessage = envelope?.error?.message
        ? String(envelope.error.message)
        : undefined;
      const details = Array.isArray(envelope?.error?.details)
        ? envelope.error.details
        : [];

      const isRateLimit =
        providerStatusCode === 429 ||
        envelopeCode === 429 ||
        envelopeStatus?.toLowerCase() === 'resource_exhausted' ||
        lowerMessage.includes('rate limit') ||
        lowerMessage.includes('quota') ||
        lowerMessage.includes('429');
      if (!isRateLimit) {
        return null;
      }

      let retryAfterSeconds: number | undefined;
      let quotaMetric: string | undefined;
      for (const detail of details) {
        if (!detail || typeof detail !== 'object') {
          continue;
        }
        const record = detail as Record<string, unknown>;
        const type = typeof record['@type'] === 'string' ? record['@type'] : '';
        if (
          type.endsWith('google.rpc.RetryInfo') ||
          type.endsWith('/google.rpc.RetryInfo')
        ) {
          const parsed = parseRetryDelaySeconds(record.retryDelay);
          if (typeof parsed === 'number' && parsed > 0) {
            retryAfterSeconds = parsed;
          }
        }
        if (
          type.endsWith('google.rpc.ErrorInfo') ||
          type.endsWith('/google.rpc.ErrorInfo')
        ) {
          const metadata = record.metadata;
          if (metadata && typeof metadata === 'object') {
            const metricRaw = (metadata as Record<string, unknown>)
              .quota_metric;
            if (typeof metricRaw === 'string' && metricRaw.trim()) {
              quotaMetric = metricRaw.trim();
            }
          }
        }
        if (
          type.endsWith('google.rpc.QuotaFailure') ||
          type.endsWith('/google.rpc.QuotaFailure')
        ) {
          const violations = record.violations;
          if (Array.isArray(violations)) {
            for (const violation of violations) {
              if (!violation || typeof violation !== 'object') {
                continue;
              }
              const subject = (violation as Record<string, unknown>).subject;
              if (typeof subject === 'string' && subject.trim()) {
                quotaMetric = quotaMetric ?? subject.trim();
              }
            }
          }
        }
      }

      const classifyFromMetricOrMessage = (): RateLimitKind => {
        const text = (
          quotaMetric ??
          envelopeMessage ??
          providerMessage
        ).toLowerCase();
        if (
          text.includes('token') ||
          text.includes('tpm') ||
          text.includes('tokens_per_minute')
        ) {
          return 'tpm';
        }
        if (
          text.includes('per_day') ||
          text.includes('perday') ||
          text.includes('daily') ||
          text.includes('requests_per_day')
        ) {
          return 'daily_quota';
        }
        if (
          text.includes('request') ||
          text.includes('rpm') ||
          text.includes('per minute') ||
          text.includes('requests_per_minute')
        ) {
          return 'rpm';
        }
        return 'unknown';
      };

      const kind = classifyFromMetricOrMessage();
      const resetTimeSeconds = (() => {
        if (
          typeof retryAfterSeconds === 'number' &&
          Number.isFinite(retryAfterSeconds) &&
          retryAfterSeconds > 0
        ) {
          return Math.min(Math.ceil(retryAfterSeconds), 86_400);
        }
        if (kind === 'daily_quota') {
          return 3600;
        }
        return 60;
      })();

      return {
        kind,
        resetTimeSeconds,
        providerStatusCode: providerStatusCode ?? envelopeCode,
        providerStatus: envelopeStatus,
        providerMessage: envelopeMessage ?? providerMessage,
        quotaMetric,
      };
    };

    // UNIVERSAL defaults — true of every Gemini call we make, regardless of
    // what it is for. These MUST survive a caller supplying its own config.
    const universalDefaults: GeminiGenerationConfig = {
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
      maxOutputTokens:
        profile?.maxOutputTokens ?? (this.llmConfig.maxTokens || 65536),
    };
    const thinkingContext =
      options.thinkingContext ?? profile?.context ?? 'content';
    const baseThinkingConfig = this.getThinkingConfig(
      targetModel,
      thinkingContext,
      options.thinkingOverride,
      options.usageCaller,
    );
    if (baseThinkingConfig) {
      universalDefaults.thinkingConfig = baseThinkingConfig;
    }

    // COLLECTION-SPECIFIC defaults — the extraction response shape. These
    // apply ONLY when the caller brings no config of its own, i.e. the
    // collection path. Merging them into every caller would silently impose
    // the extraction schema on unrelated prompts.
    const collectionDefaults: GeminiGenerationConfig = {
      ...universalDefaults,
      responseMimeType: 'application/json',
      responseJsonSchema: collectionResponseJsonSchemaForSourceRefs(
        options.sourceRefs,
      ),
    };

    // NO COMPUTED DEFAULT CAN BE LOST BY A CALLER (hardened 2026-07-28).
    //
    // This started as `options.generationConfig ?? defaultGenerationConfig`,
    // which discarded the computed thinkingConfig for every caller that
    // passed a config — and Gemini 3 with no level specified thinks HIGH.
    // Measured: entity-resolution.match_batch averaged 5,694 output tokens
    // per call versus 48 for the SAME judgment through the path that set it
    // correctly, making resolution 64% of all replay spend.
    //
    // The first fix special-cased exactly ONE key (thinkingConfig). That
    // repaired the symptom and left the CLASS: every other computed default
    // was still dropped, harmless today only because all 11 callers happen
    // to re-specify what they need. Adding one default tomorrow would
    // reintroduce the identical bug silently. Now the whole universal block
    // merges, and `undefined` values in the caller's config are stripped so
    // an explicitly-undefined key cannot clobber a computed one either.
    //
    // The merge itself lives in gemini-generation-config.ts so its
    // regression spec can call THIS function rather than a copy of it.
    const generationConfig: GeminiGenerationConfig = resolveGenerationConfig(
      options.generationConfig,
      universalDefaults,
      collectionDefaults,
    );
    // The systemPrompt fallback is for the COLLECTION path only (callers
    // that pass neither an instruction nor a config are the extraction
    // flow). A gateway caller that supplies its own generationConfig but no
    // instruction (e.g. the photo gate: media + one question) must NOT
    // silently inherit the 78KB collection prompt.
    const systemInstruction =
      options.systemInstruction ??
      (options.generationConfig ? undefined : this.systemPrompt);

    const hasResponseMimeType =
      typeof generationConfig.responseMimeType === 'string' &&
      generationConfig.responseMimeType.length > 0;
    const hasResponseSchema =
      typeof generationConfig.responseSchema === 'object' &&
      generationConfig.responseSchema !== null;
    const hasResponseJsonSchema =
      typeof generationConfig.responseJsonSchema === 'object' &&
      generationConfig.responseJsonSchema !== null;

    this.logger.debug('Generation config with @google/genai', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'call_llm_api',
      hasResponseMimeType,
      hasResponseSchema,
      hasResponseJsonSchema,
      configKeys: Object.keys(generationConfig),
    });

    // Simple helper to classify transient errors from Gemini
    const isRetryable = (err: unknown): { retry: boolean; reason: string } => {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const lowerMessage = message.toLowerCase();

      const envelope = extractGoogleErrorEnvelope(message);
      const code = envelope?.error?.code ?? 0;
      const status = String(envelope?.error?.status ?? '').toLowerCase();
      const statusCode =
        err && typeof err === 'object'
          ? (() => {
              const raw = (err as Record<string, unknown>).status;
              return typeof raw === 'number' ? raw : 0;
            })()
          : 0;

      if (
        code === 503 ||
        statusCode === 503 ||
        status === 'unavailable' ||
        lowerMessage.includes('service is currently unavailable') ||
        lowerMessage.includes('model is overloaded') ||
        lowerMessage.includes('temporarily unavailable') ||
        lowerMessage.includes('unavailable') ||
        lowerMessage.includes('503')
      ) {
        return { retry: true, reason: 'gemini_unavailable' };
      }
      if (
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out') ||
        lowerMessage.includes('abort') ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return { retry: true, reason: 'timeout' };
      }
      if (
        lowerMessage.includes('econnreset') ||
        lowerMessage.includes('econnrefused')
      ) {
        return { retry: true, reason: 'network' };
      }
      if (classifyRateLimit(err)) {
        return { retry: true, reason: 'rate_limit' };
      }

      return { retry: false, reason: 'non_retryable' };
    };

    // CACHE RECOVERY IS CAPPED (red team F2). The mismatch/404 branches
    // below retry via `attempt--`, outside maxRetries — and after the
    // registry landed, each spin of the 404 branch is a PAID vendor mint
    // (forceRemint skips every lookup). A vendor that persistently 404s
    // fresh caches (key/project misconfiguration) would otherwise mint,
    // retire, and re-ledger forever. After the cap, the call falls back to
    // INLINE instructions — paying full input rate beats an infinite loop.
    let cacheRecoveryAttempts = 0;
    let forceInlineInstruction = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Red team F5: the collection system-CACHE may attach only where the
      // collection system-PROMPT would have been inlined — i.e. the caller
      // brought neither an instruction nor a config (the extraction path).
      // The old condition keyed on systemInstruction alone, so a future
      // gateway caller on the FLASH model with its own config would have
      // silently inherited the 78KB collection cache (the cached-rate twin
      // of the places.choose_candidate inline leak).
      const collectionPath =
        !options.systemInstruction && !options.generationConfig;
      const cacheName = forceInlineInstruction
        ? null
        : (options.cacheName ??
          (collectionPath && targetModel === this.llmConfig.model
            ? // LAZY (F1257): first collection call mints it; a read-only
              // script boot never reaches here, so it never rents one.
              await this.getSystemCacheName()
            : null));
      try {
        this.logger.debug('Making LLM API request via @google/genai', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'call_llm_api',
          model: targetModel,
          hasApiKey: !!this.llmConfig.apiKey,
          promptLength: prompt.length,
          library: '@google/genai',
          usingExplicitCache: !!cacheName,
          cacheId: cacheName || null,
          attempt: attempt + 1,
          maxRetries,
        });

        // Use explicit cache if available, otherwise fall back to system instruction in config
        const requestConfig: GeminiGenerationConfig = cacheName
          ? {
              ...generationConfig,
              cachedContent: cacheName,
            }
          : {
              ...generationConfig,
              // Omit the key entirely when there is no instruction — an
              // explicit undefined would still be serialized by some layers.
              ...(systemInstruction ? { systemInstruction } : {}),
            };

        const resolvedTimeoutMs = (() => {
          const raw = options.timeoutMs;
          if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
            return Math.floor(raw);
          }
          // F122 / D16: the per-caller abort ceiling comes from the profile
          // table, not from a ternary each query-class call site had to
          // copy. An explicit options.timeoutMs still wins.
          const profileTimeout = profile?.timeoutMs;
          if (
            typeof profileTimeout === 'number' &&
            Number.isFinite(profileTimeout) &&
            profileTimeout > 0
          ) {
            return Math.floor(profileTimeout);
          }
          const configTimeout = requestConfig.httpOptions?.timeout;
          if (
            typeof configTimeout === 'number' &&
            Number.isFinite(configTimeout) &&
            configTimeout > 0
          ) {
            return Math.floor(configTimeout);
          }
          const defaultTimeout = this.llmConfig.timeout;
          if (
            typeof defaultTimeout === 'number' &&
            Number.isFinite(defaultTimeout) &&
            defaultTimeout > 0
          ) {
            return Math.floor(defaultTimeout);
          }
          return 0;
        })();

        const abortController =
          resolvedTimeoutMs > 0 ? new AbortController() : null;
        let timeoutHandle: NodeJS.Timeout | null = null;
        const requestConfigWithTimeout: GeminiGenerationConfig =
          abortController && resolvedTimeoutMs > 0
            ? {
                ...requestConfig,
                abortSignal: abortController.signal,
                httpOptions: {
                  ...(requestConfig.httpOptions ?? {}),
                  timeout: resolvedTimeoutMs,
                },
              }
            : requestConfig;

        if (abortController && resolvedTimeoutMs > 0) {
          timeoutHandle = setTimeout(() => {
            abortController.abort();
          }, resolvedTimeoutMs);
        }

        const response = await (async () => {
          try {
            return await this.gemini.generateContent({
              model: targetModel,
              contents: [
                {
                  parts: [...(options.mediaParts ?? []), { text: prompt }],
                },
              ],
              config: requestConfigWithTimeout,
            });
          } finally {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
          }
        })();

        const finishReason = response.candidates?.[0]?.finishReason;
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;
        const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
        // §24 caller taxonomy: the generic tag is a dead-man default only.
        // Any warning here means a call site forgot its usageCaller tag.
        if (!options.usageCaller) {
          this.logger.warn(
            'usage-ledger record fell back to generic caller tag — tag the call site with usageCaller',
            {
              operation: 'call_llm_api',
              model: targetModel,
              correlationId: CorrelationUtils.getCorrelationId(),
            },
          );
        }
        this.usageLedger.record({
          service: 'gemini',
          operation: 'generateContent',
          model: targetModel,
          mode: 'interactive',
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          // Thinking tokens BILL as output — sum them so the ledger prices
          // what Google charges (cost-recon audit 2026-07-10).
          outputTokens:
            outputTokens + (response.usageMetadata?.thoughtsTokenCount ?? 0),
          cachedTokens: response.usageMetadata?.cachedContentTokenCount ?? 0,
          // A MAX_TOKENS truncation is PAID output the parser then discards
          // — before this column it ledgered identically to a good call, so
          // "spend on thrown-away output" was unanswerable.
          outcome:
            finishReason === FinishReason.MAX_TOKENS ? 'truncated' : 'ok',
          caller: options.usageCaller ?? 'llm.callGeminiApi',
        });
        const tokenLimit =
          typeof requestConfigWithTimeout.maxOutputTokens === 'number' &&
          Number.isFinite(requestConfigWithTimeout.maxOutputTokens)
            ? requestConfigWithTimeout.maxOutputTokens
            : typeof generationConfig.maxOutputTokens === 'number' &&
                Number.isFinite(generationConfig.maxOutputTokens)
              ? generationConfig.maxOutputTokens
              : this.llmConfig.maxTokens || 65536;

        if (finishReason === FinishReason.MAX_TOKENS) {
          this.logger.warn('🚨 TOKEN LIMIT HIT - Response truncated!', {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'call_llm_api',
            finishReason,
            outputTokens,
            totalTokens: tokensUsed,
            tokenLimit,
            contentLength:
              response.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0,
            warning:
              'JSON response may be incomplete - chunk too large for processing',
          });
        }

        // DEBUG LOGGING: Track response size for massive token generation issue
        const contentLength =
          response.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0;
        const outputTokenCount = outputTokens || 0;

        if (outputTokenCount > 20000 || contentLength > 30000) {
          this.logger.warn(
            '🔍 MASSIVE RESPONSE DEBUG - Unexpectedly large LLM output',
            {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'call_llm_api',
              responseAnalysis: {
                outputTokens: outputTokenCount,
                contentLength,
                tokensPerChar:
                  contentLength > 0
                    ? (outputTokenCount / contentLength).toFixed(3)
                    : 'N/A',
                promptLength: prompt.length,
                inputToOutputRatio:
                  prompt.length > 0
                    ? (contentLength / prompt.length).toFixed(2)
                    : 'N/A',
              },
              flags: {
                isTokenLimit: finishReason === FinishReason.MAX_TOKENS,
                isMassiveOutput: outputTokenCount > 50000,
                isHugeContent: contentLength > 50000,
              },
              responsePreview:
                response.candidates?.[0]?.content?.parts?.[0]?.text ||
                'NO_CONTENT',
            },
          );
        }

        this.logger.debug('LLM API response received via @google/genai', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'call_llm_api',
          candidatesCount: response.candidates?.length || 0,
          hasContent: !!response.candidates?.[0]?.content?.parts?.[0]?.text,
          contentLength:
            response.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0,
          finishReason,
          safetyRatings: response.candidates?.[0]?.safetyRatings,
          usageMetadata: response.usageMetadata,
          usingExplicitCache: !!cacheName,
          cachedTokenCount:
            response.usageMetadata?.cachedContentTokenCount || 0,
          attempt: attempt + 1,
        });

        const normalizedCandidates = (response.candidates ?? [])
          .map((candidate) => {
            const contentParts =
              candidate?.content?.parts?.map((part) => ({
                text: typeof part?.text === 'string' ? part.text : '',
                thought:
                  typeof part?.thought === 'boolean' ? part.thought : undefined,
                thoughtSignature:
                  typeof part?.thoughtSignature === 'string'
                    ? part.thoughtSignature
                    : undefined,
              })) ?? [];

            return {
              content: {
                parts: contentParts,
                role:
                  typeof candidate?.content?.role === 'string'
                    ? candidate.content.role
                    : undefined,
              },
              finishReason: candidate?.finishReason,
              safetyRatings: candidate?.safetyRatings?.map((rating) => ({
                category:
                  typeof rating?.category === 'string' ? rating.category : '',
                probability:
                  typeof rating?.probability === 'string'
                    ? rating.probability
                    : '',
              })),
              citationMetadata:
                candidate?.citationMetadata?.citations &&
                Array.isArray(candidate.citationMetadata.citations)
                  ? {
                      citationSources: candidate.citationMetadata.citations.map(
                        (source) => ({
                          startIndex:
                            typeof source?.startIndex === 'number'
                              ? source.startIndex
                              : 0,
                          endIndex:
                            typeof source?.endIndex === 'number'
                              ? source.endIndex
                              : 0,
                          uri:
                            typeof source?.uri === 'string' ? source.uri : '',
                          license:
                            typeof source?.license === 'string'
                              ? source.license
                              : '',
                        }),
                      ),
                    }
                  : undefined,
            };
          })
          // Ensure only candidates with at least one part are returned
          .filter(
            (candidate) =>
              Array.isArray(candidate.content.parts) &&
              candidate.content.parts.length > 0,
          );

        const usageMetadata = response.usageMetadata
          ? {
              promptTokenCount: response.usageMetadata.promptTokenCount ?? 0,
              candidatesTokenCount:
                response.usageMetadata.candidatesTokenCount ?? 0,
              totalTokenCount: response.usageMetadata.totalTokenCount ?? 0,
              thoughtsTokenCount:
                response.usageMetadata.thoughtsTokenCount ?? undefined,
              cachedContentTokenCount:
                response.usageMetadata.cachedContentTokenCount ?? undefined,
            }
          : undefined;

        const normalizedResponse: LLMApiResponse = {
          candidates: normalizedCandidates,
          usageMetadata,
          modelVersion: response.modelVersion,
          promptFeedback: response.promptFeedback,
        };

        return normalizedResponse;
      } catch (error) {
        const errorConstructor =
          error instanceof Error ? error.constructor.name : undefined;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorDetails = {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'call_llm_api',
          library: '@google/genai',
          errorType: typeof error,
          errorConstructor,
          errorName: error instanceof Error ? error.name : undefined,
          errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined,
          errorCause:
            error instanceof Error
              ? this.summarizeErrorCause(error.cause)
              : undefined,
          proxyEnv: this.describeProxyEnv(),
          attempt: attempt + 1,
          maxRetries,
        };

        // Vendor MONTHLY CAP 429: not transient — poison the spend pool
        // until the vendor's own reset (first of month PST + grace) so the
        // budget gate stops all further dispatch instead of retry-storming.
        if (isVendorMonthlyCapError(errorMessage)) {
          this.governance.pools.poisonWindow(
            'gemini.monthlySpend',
            msUntilVendorMonthReset(),
          );
          this.logger.error(
            'GEMINI VENDOR SPEND CAP HIT — spend pool poisoned until the vendor month reset; raise the AI Studio cap to resume (NOTE: GEMINI_MONTHLY_SPEND_CAP_USD only seeds the pool at boot — after the first nightly derivation the backstop comes from spend_unit_costs, bounded by GEMINI_MONTHLY_SPEND_FLOOR_USD/GEMINI_BACKSTOP_MAX_USD)',
          );
          const monthKey = new Date().toISOString().slice(0, 7);
          this.opsAlerts.emit({
            severity: 'critical',
            kind: 'gemini_vendor_cap',
            title: 'AI Studio monthly cap hit',
            body: 'AI Studio monthly cap hit — raise the cap in the console; work queued until then.',
            dedupeKey: `gemini_vendor_cap:${monthKey}`,
          });
        } else {
          // D12 — A DETECTOR FOR THE DETECTOR'S OWN ROT. The branch above is
          // a substring of Google's prose because that is the only signal
          // they give. If they reword it, it silently stops firing and the
          // processor retry-storms a hard cap forever. The contradiction
          // that reveals it: this 429's STRUCTURED payload describes a
          // month-scoped quota while the prose matcher declined to poison.
          // No "N consecutive" constant — a contradiction is wrong the first
          // time, so this alerts on first occurrence.
          const capClassification = classifyRateLimit(error);
          if (
            capClassification &&
            vendorCapDetectorLooksRotted({
              errorMessage,
              quotaMetric: capClassification.quotaMetric,
              providerStatus: capClassification.providerStatus,
              providerMessage: capClassification.providerMessage,
            })
          ) {
            const monthKey = new Date().toISOString().slice(0, 7);
            this.opsAlerts.emit({
              severity: 'critical',
              kind: 'gemini_vendor_cap_detector_rot',
              title: 'Vendor monthly-cap detector may have rotted',
              body: `A 429 carried a month-scoped quota shape (${capClassification.quotaMetric ?? capClassification.providerStatus ?? 'unknown metric'}) but the '${'monthly spending cap'}' prose match did NOT fire, so the spend pool was not poisoned. Google has probably reworded the message: check the raw error and update isVendorMonthlyCapError, or the processor will retry-storm a hard vendor cap.`,
              dedupeKey: `gemini_vendor_cap_detector_rot:${monthKey}`,
            });
          }
        }
        this.logger.error(
          'Detailed @google/genai API error',
          error,
          errorDetails,
        );

        if (cacheName && this.isCachedContentModelMismatchError(error)) {
          cacheRecoveryAttempts += 1;
          if (cacheRecoveryAttempts > 2) {
            // Recovery isn't converging — the freshly minted replacements
            // are failing too. Stop paying for mints and go inline.
            forceInlineInstruction = true;
            attempt--;
            continue;
          }
          if (options.cacheName) {
            // A caller-supplied name (the query cache) is FROZEN in options
            // for the life of this call — rebuilding the cache cannot change
            // what we resend, so retrying the same bad name loops without
            // progress (red team F3). Invalidate it for siblings and finish
            // this call inline; the caller's next call re-resolves lazily.
            await this.cacheRegistry.invalidate(cacheName);
            this.queryInstructionCache = null;
            this.queryCacheExpiresAtMs = null;
            forceInlineInstruction = true;
            attempt--;
            continue;
          }
          try {
            await this.handleCachedContentModelMismatch(cacheName);
          } catch (refreshError) {
            this.logger.error('Failed to rebuild cache after model mismatch', {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'call_llm_api',
              cacheId: cacheName,
              error: {
                message:
                  refreshError instanceof Error
                    ? refreshError.message
                    : String(refreshError),
              },
            });
            this.clearSystemInstructionCache();
            this.queryInstructionCache = null;
          }
          attempt--;
          continue;
        }

        if (options.cacheName && this.isCachedContentMissingError(error)) {
          // Caller-supplied (query) cache 404'd at the vendor: before this
          // branch existed the name was never invalidated, so every process
          // kept being served the dead row for up to 3h (red team F3).
          cacheRecoveryAttempts += 1;
          await this.cacheRegistry.invalidate(options.cacheName);
          this.queryInstructionCache = null;
          this.queryCacheExpiresAtMs = null;
          forceInlineInstruction = true;
          attempt--;
          continue;
        }
        const cacheableRequest =
          !options.cacheName && !options.systemInstruction;
        if (cacheableRequest && this.isCachedContentMissingError(error)) {
          cacheRecoveryAttempts += 1;
          if (cacheRecoveryAttempts > 2) {
            forceInlineInstruction = true;
            attempt--;
            continue;
          }
          this.logger.warn(
            'Gemini cache handle invalid; attempting refresh before retry',
            {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'call_llm_api',
              cacheId: this.systemInstructionCache?.name ?? null,
              attempt: attempt + 1,
            },
          );
          try {
            const badName = this.systemInstructionCache?.name;
            if (badName) {
              // Registry too — a vendor-404'd cache must stop being served
              // to sibling processes, not just this one.
              await this.cacheRegistry.invalidate(badName);
            }
            await this.refreshSystemInstructionCache('gemini_403');
          } catch (refreshError) {
            this.logger.error(
              'Failed to refresh system instruction cache after Gemini 403, falling back to inline instructions',
              {
                correlationId: CorrelationUtils.getCorrelationId(),
                operation: 'call_llm_api',
                cacheId: this.systemInstructionCache?.name ?? null,
                error: {
                  message:
                    refreshError instanceof Error
                      ? refreshError.message
                      : String(refreshError),
                },
              },
            );
            this.clearSystemInstructionCache();
          }
          attempt--;
          continue;
        }

        const { retry, reason } = isRetryable(error);
        if (reason === 'timeout') {
          // The vendor may have completed (and billed) generation we never
          // received. Token counts are UNKNOWN — recording zeros would be a
          // fake measurement, so the row carries only the attempt count and
          // the outcome; priced 0, visible. Before this, aborted attempts
          // ledgered as NOTHING: spend with no meter.
          this.usageLedger.record({
            service: 'gemini',
            operation: 'generateContent',
            model: targetModel,
            mode: 'interactive',
            requestCount: 1,
            outcome: 'aborted',
            caller: options.usageCaller ?? 'llm.callGeminiApi',
          });
        }
        if (retry && attempt < maxRetries) {
          if (reason === 'rate_limit') {
            const classification = classifyRateLimit(error);
            const resetTimeSeconds = classification?.resetTimeSeconds ?? 60;
            this.logger.warn(
              'Transient Gemini rate limit; handing back to processor for rescheduling',
              {
                correlationId: CorrelationUtils.getCorrelationId(),
                attempt: attempt + 1,
                rateLimitKind: classification?.kind ?? 'unknown',
                resetTimeSeconds,
                quotaMetric: classification?.quotaMetric,
              },
            );
            throw new LLMRateLimitError(
              resetTimeSeconds,
              classification ?? undefined,
            );
          }

          // Exponential backoff with jitter for other transient errors
          const delay = Math.floor(baseDelay * Math.pow(backoff, attempt));
          const jitter = Math.floor(
            Math.random() * Math.max(250, Math.floor(delay * 0.2)),
          );
          const waitMs = delay + jitter;
          this.logger.warn('Transient Gemini error; retrying with backoff', {
            correlationId: CorrelationUtils.getCorrelationId(),
            reason,
            attempt: attempt + 1,
            nextAttemptInMs: waitMs,
          });
          await new Promise((r) => setTimeout(r, waitMs));
          continue; // retry loop
        }

        // Map @google/genai errors to our custom exceptions (non-retryable or out of retries)
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (
            errorMessage.includes('api key') ||
            errorMessage.includes('authentication') ||
            errorMessage.includes('unauthorized')
          ) {
            throw new LLMAuthenticationError(
              'Invalid Gemini API key',
              error.message,
            );
          } else if (
            errorMessage.includes('network') ||
            errorMessage.includes('connection') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('abort') ||
            error.name === 'AbortError'
          ) {
            throw new LLMNetworkError(
              'Network error during Gemini API request',
              error,
            );
          }

          const classification = classifyRateLimit(error);
          if (classification) {
            throw new LLMRateLimitError(
              classification.resetTimeSeconds,
              classification,
            );
          } else {
            throw new LLMApiError(
              `Gemini API request failed: ${error.message}`,
              undefined,
              error.message,
            );
          }
        } else {
          const classification = classifyRateLimit(error);
          if (classification) {
            throw new LLMRateLimitError(
              classification.resetTimeSeconds,
              classification,
            );
          }
          throw new LLMApiError(
            `LLM request failed: ${String(error)}`,
            undefined,
            JSON.stringify(errorDetails),
          );
        }
      }
    }
    // Should be unreachable: loop either returned or threw
    throw new LLMApiError(
      'Gemini API request failed after all retry attempts',
      undefined,
      'retry_exhausted',
    );
  }

  // Local helper for sleep (used in retry)

  private attachFetchDiagnostics(): void {
    if (LLMService.fetchDiagnosticsAttached || typeof fetch !== 'function') {
      return;
    }

    const originalFetch = fetch;
    const logger = this.logger;
    const baseUrl =
      this.llmConfig?.baseUrl || 'https://generativelanguage.googleapis.com';

    const redactUrl = (rawUrl: string): string => {
      try {
        const parsed = new URL(rawUrl);
        const scrub = ['key', 'api_key', 'apiKey'];
        scrub.forEach((param) => parsed.searchParams.delete(param));
        return parsed.toString();
      } catch {
        return rawUrl.replace(/key=([^&]+)/gi, 'key=[REDACTED]');
      }
    };

    globalThis.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input?.url ?? '');
      try {
        return await originalFetch(input as RequestInfo, init);
      } catch (error) {
        if (
          url.includes('generativelanguage.googleapis.com') ||
          (baseUrl && url.includes(baseUrl))
        ) {
          logger.error('Gemini fetch failed', error, {
            operation: 'gemini_fetch',
            url: redactUrl(url),
            method: init?.method ?? 'GET',
            errorCause: this.summarizeErrorCause(
              error instanceof Error ? error.cause : undefined,
            ),
          });
        }
        throw error;
      }
    };

    LLMService.fetchDiagnosticsAttached = true;
  }

  private configureGeminiHttpClient(): void {
    if (LLMService.dispatcherConfigured) {
      return;
    }

    const normalizeTimeout = (value: number | undefined, fallback: number) => {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
      }
      return fallback;
    };

    const headersTimeoutMs = normalizeTimeout(
      this.llmConfig.headersTimeoutMs,
      120_000,
    );
    const bodyTimeoutMs = normalizeTimeout(
      this.llmConfig.bodyTimeoutMs,
      300_000,
    );
    const connectTimeoutMs = normalizeTimeout(
      this.llmConfig.connectTimeoutMs,
      30_000,
    );

    const dispatcher: Dispatcher = new Agent({
      headersTimeout: headersTimeoutMs,
      bodyTimeout: bodyTimeoutMs,
      connectTimeout: connectTimeoutMs,
    });
    const setDispatcher = setGlobalDispatcher as (
      dispatcherInstance: Dispatcher,
    ) => void;
    setDispatcher(dispatcher);

    LLMService.dispatcherConfigured = true;
    this.logger.info('Configured global fetch timeouts for Gemini', {
      operation: 'configure_gemini_http',
      headersTimeoutMs,
      bodyTimeoutMs,
      connectTimeoutMs,
    });
  }

  private describeProxyEnv(): {
    httpProxy: boolean;
    httpsProxy: boolean;
    noProxy: boolean;
    extraCaCerts: boolean;
  } {
    return {
      httpProxy: Boolean(process.env.HTTP_PROXY || process.env.http_proxy),
      httpsProxy: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
      noProxy: Boolean(process.env.NO_PROXY || process.env.no_proxy),
      extraCaCerts: Boolean(process.env.NODE_EXTRA_CA_CERTS),
    };
  }

  private summarizeErrorCause(
    cause: unknown,
  ): Record<string, unknown> | undefined {
    if (!cause) {
      return undefined;
    }
    if (cause instanceof Error) {
      const nodeCause = cause as NodeJS.ErrnoException;
      return {
        name: cause.name,
        message: cause.message,
        code: nodeCause.code,
        errno: nodeCause.errno,
        syscall: nodeCause.syscall,
        address: (nodeCause as { address?: string }).address,
        port: (nodeCause as { port?: number }).port,
        stack: cause.stack,
      };
    }
    if (typeof cause === 'object') {
      const nodeCause = cause as {
        name?: unknown;
        message?: unknown;
        code?: unknown;
        errno?: unknown;
        syscall?: unknown;
        address?: unknown;
        port?: unknown;
      };
      return {
        name: typeof nodeCause.name === 'string' ? nodeCause.name : undefined,
        message:
          typeof nodeCause.message === 'string' ? nodeCause.message : undefined,
        code:
          typeof nodeCause.code === 'string' ||
          typeof nodeCause.code === 'number'
            ? nodeCause.code
            : undefined,
        errno:
          typeof nodeCause.errno === 'string' ||
          typeof nodeCause.errno === 'number'
            ? nodeCause.errno
            : undefined,
        syscall:
          typeof nodeCause.syscall === 'string' ? nodeCause.syscall : undefined,
        address:
          typeof nodeCause.address === 'string' ? nodeCause.address : undefined,
        port: typeof nodeCause.port === 'number' ? nodeCause.port : undefined,
      };
    }
    return {
      valueType: typeof cause,
      valueTag: Object.prototype.toString.call(cause),
    };
  }

  /**
   * Acquire a context cache through THE registry (lookup-before-mint,
   * extend-instead-of-remint, retire-with-refcount; see
   * gemini-context-cache.registry.ts for the full rationale). This method
   * exists so LlmService keeps ownership of the single GoogleGenAI client —
   * the registry is pure orchestration and receives the vendor ops per call.
   */
  private async createLedgeredCache(params: {
    model: string;
    systemInstruction: string;
    ttlSeconds: number;
    caller: string;
    minRemainingMs?: number;
    forceRemint?: boolean;
  }): Promise<{ name: string; tokens: number; expiresAtMs: number }> {
    const acquired = await this.cacheRegistry.acquire(
      {
        model: params.model,
        systemInstruction: params.systemInstruction,
        ttlSeconds: params.ttlSeconds,
        // Default floor: never hand out a cache with under 5 minutes left.
        minRemainingMs: params.minRemainingMs ?? 300_000,
        caller: params.caller,
        forceRemint: params.forceRemint,
      },
      this.cacheVendorOps(),
    );
    return {
      name: acquired.name,
      tokens: acquired.tokenCount,
      expiresAtMs: acquired.expiresAtMs,
    };
  }

  /**
   * Typed vendor operations for the two non-generation consumers. The
   * re-derived ideal for "fold the stragglers" turned out NOT to be a
   * pipeline refactor — batch request ASSEMBLY already flows through the
   * shared pipeline (profiles, thinking, registry cache, the one spend
   * gate). What remained was CLIENT OWNERSHIP: three batches.* calls and
   * one embedContent were the only vendor operations outside this file.
   * Exposing them as typed ops makes the raw client literally single-owner
   * — the lockdown allowlist shrinks to this file, and "a second assembler
   * forgot X" becomes unrepresentable rather than merely audited.
   */
  batchTransportOps(): BatchTransportOps {
    return {
      create: async (params) =>
        // Gated in the OP, not only in gemini-batch.service's submit(). The
        // caller's gate is correct but it is a call site, and a call site is
        // exactly what embeddings proved can be forgotten (red team
        // 2026-08-02). An assert is a pool read, so paying for it twice on
        // the batch path is cheaper than a second caller shipping without it.
        this.gemini.createBatch(params),
      cancel: async (name) => {
        await this.gemini.cancelBatch(name);
      },
      get: async (name) => this.gemini.getBatch<GeminiBatchJobRemote>(name),
      findByDisplayName: async (displayName) => {
        const pager = await this.gemini.listBatches(100);
        // The pager auto-walks pages; cap the scan — adoption only matters
        // for a crash retried within the lease window (minutes), so the
        // job is among the most recent if it exists at all.
        let scanned = 0;
        for await (const job of pager as AsyncIterable<{
          name?: string;
          displayName?: string;
        }>) {
          if (job.displayName === displayName) {
            return job.name ?? null;
          }
          if (++scanned >= 200) {
            break;
          }
        }
        return null;
      },
    };
  }

  embedVendorOp(): (params: {
    model: string;
    contents: string[];
    config?: { taskType?: string; outputDimensionality?: number };
  }) => Promise<{ embeddings?: Array<{ values?: number[] }> }> {
    return async (params) => {
      // THE SPEND GATE BELONGS HERE, NOT AT THE CALL SITE (red team
      // 2026-08-02). embedContent is billed per input token, and this was the
      // one paid Gemini path with no admission check: generation gates in
      // callLLMApi and batch gates in submit(), so when the Tier-3 backstop
      // fired or the vendor poisoned the pool, GENERATION STOPPED AND
      // EMBEDDINGS KEPT SPENDING. The typed-vendor-op carve-out that moved
      // client ownership here quietly took the gate with it.
      //
      // It sits inside the returned op rather than beside each caller for the
      // same reason generateForCaller does it: a caller cannot forget what it
      // never has to remember. It is also the hot path — embedQuery runs on
      // search, whose only brake is a Redis cache that degrades to a live
      // embed when Redis is down.
      return this.gemini.embedContent(params);
    };
  }

  private cacheVendorOps(): CacheVendorOps {
    return {
      create: async ({ model, systemInstruction, ttlSeconds }) => {
        // Context-cache mints are billed in token-hours, so a mint is a paid
        // call and must pass the same backstop as generation (red team
        // 2026-08-02).
        const cache = await this.gemini.createCache({
          model,
          config: { systemInstruction, ttl: `${ttlSeconds}s` },
        });
        if (!cache?.name) {
          throw new Error(
            'Cache name missing from Gemini cache create response',
          );
        }
        return {
          name: cache.name,
          tokenCount: cache.usageMetadata?.totalTokenCount ?? 0,
        };
      },
      updateTtl: async (name, ttlSeconds) => {
        await this.gemini.updateCacheTtl(name, `${ttlSeconds}s`);
      },
      delete: async (name) => {
        await this.gemini.deleteCache(name);
      },
    };
  }

  /** Delegates to the shared resolver (gemini-thinking.ts) so LlmService,
   *  the relevance gate, and the batch builder cannot drift apart on what a
   *  call's thinking level is — the drift IS the cost bug. */
  private getThinkingConfig(
    model: string,
    context: ThinkingContext = 'content',
    overrides?: {
      includeThoughts?: boolean;
    },
    caller?: string,
  ): GeminiThinkingConfig | undefined {
    const { config, invalidLevel } = resolveThinkingConfig({
      model,
      context,
      // Profiles are the VALUE source for per-caller levels; a runtime
      // config override (llm.thinking.perCaller) still wins over the table.
      settings: {
        ...this.llmConfig.thinking,
        perCaller: {
          ...PROFILE_THINKING_LEVELS,
          ...this.llmConfig.thinking?.perCaller,
        },
      },
      includeThoughtsOverride: overrides?.includeThoughts,
      caller,
    });
    if (invalidLevel) {
      this.logger.warn('Invalid Gemini thinking level; using default', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'thinking_config',
        model,
        context,
        configuredLevel: invalidLevel,
      });
    }
    return config;
  }

  private getThoughtDebugMaxEntries(scope: 'query' | 'content'): number {
    const debug = this.llmConfig.thoughtDebug;
    if (!debug?.enabled) {
      return 0;
    }
    const raw =
      scope === 'query' ? debug.maxQueryEntries : debug.maxContentEntries;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }
    return 1;
  }

  private ensureThoughtDebugLoaded(
    scope: 'query' | 'content',
    filePath: string | null,
  ): void {
    if (this.thoughtDebugLoaded[scope]) {
      return;
    }
    this.thoughtDebugLoaded[scope] = true;
    if (!filePath || !existsSync(filePath)) {
      return;
    }
    try {
      const raw = readFileSync(filePath, 'utf8').trim();
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        this.thoughtDebugEntries[scope] = parsed.filter(
          (entry) => entry && typeof entry === 'object',
        ) as Record<string, unknown>[];
        return;
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { entries?: unknown }).entries)
      ) {
        this.thoughtDebugEntries[scope] = (
          (parsed as { entries?: unknown[] }).entries ?? []
        ).filter((entry) => entry && typeof entry === 'object') as Record<
          string,
          unknown
        >[];
      }
    } catch (error) {
      this.logger.warn('Failed to read LLM thought debug file', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'llm_thought_debug',
        scope,
        filePath,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private shouldLogThoughts(scope: 'query' | 'content'): boolean {
    const debug = this.llmConfig.thoughtDebug;
    if (!debug?.enabled) {
      return false;
    }
    if (scope === 'query' && !debug.query) {
      return false;
    }
    if (scope === 'content' && !debug.content) {
      return false;
    }
    const filePath = this.resolveThoughtDebugFilePath(scope);
    this.ensureThoughtDebugLoaded(scope, filePath);
    const maxEntries = this.getThoughtDebugMaxEntries(scope);
    if (maxEntries <= 0) {
      return false;
    }
    return this.thoughtDebugEntries[scope].length < maxEntries;
  }

  private resolveThoughtDebugFilePath(
    scope: 'query' | 'content',
  ): string | null {
    const debug = this.llmConfig.thoughtDebug;
    if (!debug?.writeToFile) {
      return null;
    }
    const rawPath =
      (scope === 'query' ? debug.filePathQuery : debug.filePathContent) ||
      debug.filePath ||
      (scope === 'query'
        ? 'logs/llm-thought-debug-query.json'
        : 'logs/llm-thought-debug-content.json');
    const normalizedPath = rawPath.trim();
    if (!normalizedPath) {
      return null;
    }
    if (isAbsolute(normalizedPath)) {
      return normalizedPath;
    }
    const apiRoot = resolve(__dirname, '../../../../..');
    let normalized = normalizedPath;
    if (normalized.startsWith('apps/api/')) {
      normalized = normalized.slice('apps/api/'.length);
    } else if (normalized.startsWith('apps\\api\\')) {
      normalized = normalized.slice('apps\\api\\'.length);
    }
    return join(apiRoot, normalized);
  }

  private logThoughtDebug(
    scope: 'query' | 'content',
    response: LLMApiResponse,
    details: Record<string, unknown>,
  ): void {
    const correlationId = CorrelationUtils.getCorrelationId();
    const usage = response.usageMetadata;
    const thoughtParts =
      response.candidates?.[0]?.content?.parts?.filter(
        (part) => part.thought === true,
      ) ?? [];
    const thoughtText = thoughtParts.map((part) => part.text).join('');
    const signatures = thoughtParts
      .map((part) => part.thoughtSignature)
      .filter(
        (signature): signature is string => typeof signature === 'string',
      );
    const maxChars = this.llmConfig.thoughtDebug?.maxChars ?? 0;
    let output = thoughtText;
    let truncated = false;
    if (maxChars > 0 && output.length > maxChars) {
      output = output.slice(0, maxChars);
      truncated = true;
    }

    const basePayload = {
      correlationId,
      operation: 'llm_thought_debug',
      scope,
      thoughtTokens: usage?.thoughtsTokenCount,
      promptTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      thoughtParts: thoughtParts.length,
      thoughtSignatures: signatures,
      thoughtLength: thoughtText.length,
      truncated,
    };

    this.logger.info('LLM thought debug', {
      ...basePayload,
      ...details,
      thought: output,
    });

    const filePath = this.resolveThoughtDebugFilePath(scope);
    if (!filePath) {
      return;
    }

    const maxEntries = this.getThoughtDebugMaxEntries(scope);
    this.ensureThoughtDebugLoaded(scope, filePath);
    if (
      maxEntries > 0 &&
      this.thoughtDebugEntries[scope].length >= maxEntries
    ) {
      return;
    }
    const entry = {
      ...basePayload,
      ...details,
      thought: output,
      capturedAt: new Date().toISOString(),
    };

    this.thoughtDebugEntries[scope].push(entry);
    const snapshot = {
      scope,
      maxEntries,
      entries: this.thoughtDebugEntries[scope],
      updatedAt: new Date().toISOString(),
    };

    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (error) {
      this.logger.warn('Failed to write LLM thought debug file', {
        correlationId,
        operation: 'llm_thought_debug',
        scope,
        filePath,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Parse and validate Gemini response
   */
  private parseResponse(response: LLMApiResponse): LLMOutputStructure {
    if (!response.candidates || response.candidates.length === 0) {
      throw new LLMResponseParsingError(
        'No candidates in Gemini response',
        JSON.stringify(response),
      );
    }

    const content = this.extractTextContent(response, 'content_processing');

    this.logger.debug('Parsing LLM response content', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'parse_response',
      contentLength: content.length,
      contentPreview:
        content.substring(0, 200) + (content.length > 200 ? '...' : ''),
    });

    try {
      const cleanContent = this.sanitizeJsonContent(content);
      let parsed = JSON.parse(cleanContent) as
        | LLMOutputStructure
        | LLMOutputStructure[]
        | null;

      if (Array.isArray(parsed)) {
        this.logger.warn(
          'Gemini response returned array, using first element',
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'parse_response',
            arrayLength: parsed.length,
          },
        );
        parsed = parsed[0] ?? null;
      }

      // Basic validation
      if (!parsed || typeof parsed !== 'object') {
        this.logger.warn('Gemini response parsed to empty value', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'parse_response',
          rawContentSnippet: content.substring(0, 500),
        });
        throw new LLMResponseParsingError(
          'Missing JSON object in Gemini response',
          content,
        );
      }

      const normalized = parsed;

      if (!normalized.mentions || !Array.isArray(normalized.mentions)) {
        this.logger.warn('Gemini response missing mentions array', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'parse_response',
          candidateContentLength: content.length,
          rawContentSnippet: content.substring(0, 500),
        });
        throw new LLMResponseParsingError(
          'Invalid mentions structure in Gemini response',
          content,
        );
      }

      this.logger.debug('LLM response successfully parsed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'parse_response',
        mentionsCount: normalized.mentions.length,
        mentions:
          normalized.mentions.length > 0
            ? normalized.mentions.map((m) => ({
                temp_id: m.temp_id,
                restaurant: m.restaurant,
                food: m.food,
                food_categories: m.food_categories,
              }))
            : [],
      });

      return normalized;
    } catch (error) {
      throw new LLMResponseParsingError(
        `Failed to parse JSON from Gemini response: ${
          error instanceof Error ? error.message : String(error)
        }`,
        content,
      );
    }
  }
  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): LLMPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      lastReset: new Date(),
      errorCount: 0,
      successRate: 100,
    };
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    const status: 'healthy' | 'degraded' | 'unhealthy' =
      this.performanceMetrics.successRate > 80 ? 'healthy' : 'degraded';

    return {
      service: 'llm',
      status,
      uptime: Date.now() - this.performanceMetrics.lastReset.getTime(),
      metrics: {
        requestCount: this.performanceMetrics.requestCount,
        totalResponseTime: this.performanceMetrics.totalResponseTime,
        averageResponseTime: this.performanceMetrics.averageResponseTime,
        lastReset: this.performanceMetrics.lastReset,
        errorCount: this.performanceMetrics.errorCount,
        successRate: this.performanceMetrics.successRate,
        rateLimitHits: 0, // LLM service doesn't track this separately
      },
      configuration: {
        timeout: this.llmConfig.timeout || 30000,
        retryOptions: this.llmConfig.retryOptions,
      },
    };
  }

  /**
   * Validate LLM output structure using custom validators
   */
  async validateOutput(output: LLMOutputStructure): Promise<string[]> {
    const outputDto = plainToClass(LLMOutputDto, output as object);
    const errors = await validate(outputDto);

    return errors.flatMap((error) =>
      error.constraints ? Object.values(error.constraints) : [],
    );
  }

  private recordSuccessMetrics(responseTime: number, tokensUsed: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.totalTokensUsed += tokensUsed;
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }

  private recordErrorMetrics(responseTime: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.errorCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }
}
