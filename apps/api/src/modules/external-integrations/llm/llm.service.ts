import { applyAuditReasonPolicy } from './llm-audit-policy';
import { DecisionLedgerService } from '../shared/decision-ledger.service';
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { Agent, setGlobalDispatcher, type Dispatcher } from 'undici';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { Counter } from 'prom-client';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { MetricsService } from '../../metrics/metrics.service';
import { UsageLedgerService } from '../shared/usage-ledger.service';
import {
  LLMConfig,
  LLMModelInput,
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
  SystemInstructionCacheState,
} from './llm.types';
import { LLMInputDto, LLMOutputDto } from './dto';
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
  COLLECTION_RESPONSE_JSON_SCHEMA,
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

type GeminiGenerationConfig = Record<string, unknown> & {
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  responseJsonSchema?: Record<string, unknown>;
  cachedContent?: string;
  systemInstruction?: string;
  httpOptions?: {
    timeout?: number;
  };
  abortSignal?: AbortSignal;
  thinkingConfig?: {
    thinkingBudget?: number;
    thinkingLevel?: string;
    includeThoughts?: boolean;
  };
};

interface LLMGenerationOptions {
  generationConfig?: GeminiGenerationConfig;
  cacheName?: string | null;
  systemInstruction?: string | null;
  model?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
  thinkingOverride?: {
    includeThoughts?: boolean;
  };
  thinkingContext?: 'content' | 'query';
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

  private genAI!: GoogleGenAI;
  private redisClient: Redis | null = null;
  private systemInstructionCache: GeminiCacheEntry | null = null; // Cache for collection processing instructions
  private systemInstructionCacheExpiresAt: number | null = null;
  private systemCacheRefreshTimer: NodeJS.Timeout | null = null;
  private systemCacheRefreshInFlight: Promise<void> | null = null;
  private systemCacheTtlMs = 0;
  private systemCacheRefreshLeadMs = 0;
  private systemCacheRedisKey = 'llm:system-instruction-cache';
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
  private queryCacheLookupCounter?: Counter<string>;
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
    private readonly metricsService: MetricsService,
    private readonly usageLedger: UsageLedgerService,
    private readonly decisionLedger: DecisionLedgerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('LLMService');
    this.llmConfig = {
      apiKey: this.configService.get<string>('llm.apiKey') || '',
      model:
        this.configService.get<string>('llm.model') ||
        'gemini-2.5-flash-preview-09-2025',
      queryTimeout: this.configService.get<number>('llm.queryTimeout') || 0,
      queryLogOutputs:
        this.configService.get<boolean>('llm.queryLogOutputs') === true,
      baseUrl:
        this.configService.get<string>('llm.baseUrl') ||
        'https://generativelanguage.googleapis.com/v1beta',
      timeout: this.configService.get<number>('llm.timeout') || 0,
      headersTimeoutMs:
        this.configService.get<number>('llm.headersTimeoutMs') || 0,
      bodyTimeoutMs: this.configService.get<number>('llm.bodyTimeoutMs') || 0,
      connectTimeoutMs:
        this.configService.get<number>('llm.connectTimeoutMs') || 0,
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
        maxRetries:
          this.configService.get<number>('llm.retryOptions.maxRetries') || 3,
        retryDelay:
          this.configService.get<number>('llm.retryOptions.retryDelay') || 1000,
        retryBackoffFactor:
          this.configService.get<number>(
            'llm.retryOptions.retryBackoffFactor',
          ) || 2.0,
      },
      cache: {
        systemTtlSeconds:
          this.configService.get<number>('llm.cache.systemTtlSeconds') ?? 10800,
        systemRefreshLeadSeconds:
          this.configService.get<number>(
            'llm.cache.systemRefreshLeadSeconds',
          ) ?? 600,
        redisKey:
          this.configService.get<string>('llm.cache.redisKey') ??
          'llm:system-instruction-cache',
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

    this.queryCacheLookupCounter = this.metricsService.getCounter({
      name: 'llm_search_query_cache_lookups_total',
      help: 'LLM search query cache lookups',
      labelNames: ['layer', 'result'],
    });

    // Initialize GoogleGenAI client
    this.genAI = new GoogleGenAI({ apiKey: this.llmConfig.apiKey });
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
    // Initialize explicit cache for system instructions (async, non-blocking)
    this.bootstrapSystemInstructionCache().catch((error) => {
      this.logger.warn(
        'System instruction cache initialization failed, continuing with fallback',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'module_init',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    });

    this.initializeQueryInstructionCache().catch((error) => {
      this.logger.warn(
        'Query instruction cache initialization failed, continuing with fallback',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'module_init',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    });
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

    this.systemCacheRedisKey =
      cacheConfig?.redisKey ?? 'llm:system-instruction-cache';
  }

  private async bootstrapSystemInstructionCache(): Promise<void> {
    const correlationId = CorrelationUtils.getCorrelationId();
    try {
      const persisted = await this.loadPersistedSystemCacheState();
      if (!persisted) {
        await this.refreshSystemInstructionCache('bootstrap');
        return;
      }

      const { expiresAt, refreshedAt, cacheId } = persisted;

      if (this.isCacheStateFresh(persisted)) {
        const expiresAtIso = new Date(Number(expiresAt)).toISOString();
        const refreshedAtIso = new Date(Number(refreshedAt)).toISOString();
        this.systemInstructionCache = { name: cacheId };
        this.systemInstructionCacheExpiresAt = expiresAt;
        this.logger.info('Using persisted system instruction cache', {
          correlationId,
          operation: 'init_system_cache',
          cacheId,
          expiresAt: expiresAtIso,
          refreshedAt: refreshedAtIso,
          source: 'redis',
        });
        this.scheduleSystemCacheRefresh();
        return;
      }

      const expiresAtIso = new Date(Number(expiresAt)).toISOString();
      this.logger.debug('Persisted cache is stale or expired, refreshing', {
        correlationId,
        operation: 'init_system_cache',
        cacheId,
        expiresAt: expiresAtIso,
        now: new Date().toISOString(),
      });

      await this.refreshSystemInstructionCache('bootstrap');
    } catch (error) {
      this.logger.warn('Failed to bootstrap system instruction cache', {
        correlationId,
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

    this.logger.info('Creating explicit cache for system instructions', {
      correlationId,
      operation: 'refresh_system_cache',
      reason,
      systemPromptLength: this.systemPrompt.length,
    });

    const ttlSeconds = Math.max(1, Math.floor(this.systemCacheTtlMs / 1000));
    const cache = await this.genAI.caches.create({
      model: this.llmConfig.model,
      config: {
        systemInstruction: this.systemPrompt,
        ttl: `${ttlSeconds}s`,
      },
    });
    const cacheName = cache?.name;
    if (!cacheName) {
      throw new Error('Cache name missing from Gemini cache create response');
    }

    const refreshedAt = Date.now();
    const expiresAt = refreshedAt + this.systemCacheTtlMs;
    this.systemInstructionCache = { name: cacheName };
    this.systemInstructionCacheExpiresAt = expiresAt;

    await this.persistSystemInstructionCacheState({
      cacheId: cacheName,
      refreshedAt,
      expiresAt,
      promptHash: this.getSystemPromptCacheFingerprint(),
      model: this.llmConfig.model,
    });

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

  private isCacheStateFresh(
    state: SystemInstructionCacheState | null,
  ): state is SystemInstructionCacheState {
    if (
      !state ||
      typeof state.cacheId !== 'string' ||
      typeof state.expiresAt !== 'number' ||
      typeof state.promptHash !== 'string' ||
      typeof state.model !== 'string'
    ) {
      return false;
    }
    if (state.promptHash !== this.getSystemPromptCacheFingerprint()) {
      return false;
    }
    if (state.model !== this.llmConfig.model) {
      return false;
    }
    const freshnessBoundary = state.expiresAt - this.systemCacheRefreshLeadMs;
    return Date.now() < freshnessBoundary;
  }

  private async loadPersistedSystemCacheState(): Promise<SystemInstructionCacheState | null> {
    if (!this.redisClient) {
      return null;
    }
    try {
      const raw = await this.redisClient.get(this.systemCacheRedisKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as SystemInstructionCacheState;
      if (
        typeof parsed?.cacheId === 'string' &&
        typeof parsed?.expiresAt === 'number' &&
        typeof parsed?.refreshedAt === 'number' &&
        typeof parsed?.promptHash === 'string' &&
        typeof parsed?.model === 'string'
      ) {
        return parsed;
      }
    } catch (error) {
      this.logger.warn('Failed to load cached system instruction metadata', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'load_system_cache_state',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return null;
  }

  private async persistSystemInstructionCacheState(
    state: SystemInstructionCacheState | null,
  ): Promise<void> {
    if (!this.redisClient) {
      return;
    }
    try {
      if (!state) {
        await this.redisClient.del(this.systemCacheRedisKey);
        return;
      }

      const ttl = Math.max(
        60_000,
        state.expiresAt - Date.now() + this.systemCacheRefreshLeadMs,
      );
      await this.redisClient.set(
        this.systemCacheRedisKey,
        JSON.stringify(state),
        'PX',
        ttl,
      );
    } catch (error) {
      this.logger.warn('Failed to persist system instruction cache metadata', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'persist_system_cache_state',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async clearSystemInstructionCache(): Promise<void> {
    if (this.systemCacheRefreshTimer) {
      clearTimeout(this.systemCacheRefreshTimer);
      this.systemCacheRefreshTimer = null;
    }
    this.systemInstructionCache = null;
    this.systemInstructionCacheExpiresAt = null;
    await this.persistSystemInstructionCacheState(null);
  }

  private getSystemPromptCacheFingerprint(): string {
    return this.hashString(
      JSON.stringify({
        model: this.llmConfig.model,
        systemPrompt: this.systemPrompt,
      }),
    );
  }

  private async rebuildQueryInstructionCache(
    reason: CacheRefreshReason,
  ): Promise<void> {
    this.queryInstructionCache = null;
    this.logger.info('Reinitializing query instruction cache', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'refresh_query_cache',
      reason,
    });
    await this.initializeQueryInstructionCache();
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

  private async initializeQueryInstructionCache(): Promise<void> {
    const minCachedTokenCount = 1024;
    const estimatedTokens = Math.ceil(this.queryPrompt.length / 4);
    if (estimatedTokens < minCachedTokenCount) {
      this.logger.info('Skipping query instruction cache (prompt too small)', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'init_query_cache',
        model: this.queryModel,
        promptLength: this.queryPrompt.length,
        estimatedTokens,
        minCachedTokenCount,
      });
      this.queryInstructionCache = null;
      return;
    }

    try {
      this.logger.info('Creating explicit cache for query instructions', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'init_query_cache',
        model: this.queryModel,
        promptLength: this.queryPrompt.length,
      });

      const cache = await this.genAI.caches.create({
        model: this.queryModel,
        config: {
          systemInstruction: this.queryPrompt,
          ttl: '10800s',
        },
      });
      const cacheName = cache?.name;
      if (!cacheName) {
        throw new Error('Cache name missing from Gemini cache create response');
      }
      this.queryInstructionCache = { name: cacheName };

      this.logger.info('Query instruction cache created successfully', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'init_query_cache',
        model: this.queryModel,
        cacheId: this.queryInstructionCache?.name,
        ttl: '10800s',
      });
    } catch (error) {
      this.logger.warn(
        'Failed to create query instruction cache, falling back to direct system instruction usage',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'init_query_cache',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      this.queryInstructionCache = null;
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
    const promptPath = join(
      process.cwd(),
      'src',
      'modules',
      'external-integrations',
      'llm',
      'prompts',
      filename,
    );

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
  async processContent(input: LLMModelInput): Promise<LLMOutputStructure> {
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
        thinkingOverride: shouldLogThoughts
          ? { includeThoughts: true }
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
    const usingQueryCache = Boolean(this.queryInstructionCache?.name);
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
      maxOutputTokens: Math.min(this.llmConfig.maxTokens || 2048, 2048),
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
        this.recordQueryCacheLookup('memory', 'hit');
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
      this.recordQueryCacheLookup('memory', 'miss');

      if (this.redisClient) {
        const cached = await this.getCachedSearchQueryAnalysis(
          cacheKeyResult.key,
        );
        if (cached) {
          this.recordQueryCacheLookup('redis', 'hit');
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
        this.recordQueryCacheLookup('redis', 'miss');
      }
    }

    const response = await this.callLLMApi(prompt, {
      generationConfig: queryGenerationConfig,
      cacheName: this.queryInstructionCache?.name ?? null,
      systemInstruction: this.queryPrompt,
      model: this.queryModel,
      timeoutMs:
        typeof this.llmConfig.queryTimeout === 'number' &&
        Number.isFinite(this.llmConfig.queryTimeout) &&
        this.llmConfig.queryTimeout > 0
          ? this.llmConfig.queryTimeout
          : undefined,
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
   * contents + config an interactive processContent call would send, minus the
   * cached-content reference (a Gemini batch may run hours later — an expired
   * explicit cache would fail the whole item, so batch requests carry the
   * system prompt INLINE; the Batch API's 50% discount applies to those tokens).
   */
  buildCollectionBatchRequest(input: LLMModelInput): {
    contents: string;
    config: Record<string, unknown>;
  } {
    const contents = this.buildProcessingPrompt(input);
    const config: Record<string, unknown> = {
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
      maxOutputTokens: this.llmConfig.maxTokens || 65536,
      responseMimeType: 'application/json',
      // The batch backend rejects responseJsonSchema (INVALID_ARGUMENT for
      // every item — attributed via single-variable slice tests) but accepts
      // and enforces the typed responseSchema form, so convert at build time.
      responseSchema: jsonSchemaToTypedSchema(COLLECTION_RESPONSE_JSON_SCHEMA),
      systemInstruction: this.systemPrompt,
    };
    const thinking = this.getThinkingConfig(this.llmConfig.model, 'content');
    if (thinking) {
      config.thinkingConfig = thinking;
    }
    return { contents, config };
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
    const model = 'gemini-3.1-flash-lite-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: Math.min(this.llmConfig.temperature ?? 0.1, 0.2),
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
      responseJsonSchema: CUISINE_EXTRACTION_RESPONSE_JSON_SCHEMA,
    };
    const thinkingConfig = this.getThinkingConfig(model, 'query');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const response = await this.callLLMApi(prompt, {
      generationConfig,
      systemInstruction: this.cuisinePrompt,
      model,
      timeoutMs:
        typeof this.llmConfig.queryTimeout === 'number' &&
        Number.isFinite(this.llmConfig.queryTimeout) &&
        this.llmConfig.queryTimeout > 0
          ? this.llmConfig.queryTimeout
          : undefined,
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

    const model = 'gemini-3.1-flash-lite-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
      responseJsonSchema: MODERATION_RESPONSE_JSON_SCHEMA,
    };
    const thinkingConfig = this.getThinkingConfig(model, 'query');
    if (thinkingConfig) {
      generationConfig.thinkingConfig = thinkingConfig;
    }

    const response = await this.callLLMApi(JSON.stringify({ text: trimmed }), {
      generationConfig,
      systemInstruction: this.moderationPrompt,
      model,
      timeoutMs:
        typeof this.llmConfig.queryTimeout === 'number' &&
        Number.isFinite(this.llmConfig.queryTimeout) &&
        this.llmConfig.queryTimeout > 0
          ? this.llmConfig.queryTimeout
          : undefined,
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

    const model = 'gemini-3-flash-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      // gemini-3 thinking tokens count against this ceiling, so a tiny JSON reply
      // still needs headroom (512 truncated mid-thought → fail-closed to `new`).
      maxOutputTokens: 2048,
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

    const model = 'gemini-3-flash-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      // 16384: thinking tokens bill against maxOutputTokens on this model —
      // at 4096 a 12-item batch hit MAX_TOKENS mid-JSON and EVERY item
      // silently failed closed to 'new' (found 2026-07-07 via the decision
      // ledger; explains the judge's earlier "conservative flip-flops").
      maxOutputTokens: 16384,
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
      maxOutputTokens: 8192,
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

    const model = 'gemini-3-flash-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      // gemini-3 thinking tokens count against this ceiling, so a tiny JSON reply
      // still needs headroom (truncated mid-thought → fail-closed to `new`).
      maxOutputTokens: 2048,
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

    const model = 'gemini-3.1-flash-lite-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      maxOutputTokens: 1024,
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

    const model = 'gemini-3.1-flash-lite-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      maxOutputTokens: 256,
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

    const model = 'gemini-3.1-flash-lite-preview';
    const generationConfig: GeminiGenerationConfig = {
      temperature: 0,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: 1,
      maxOutputTokens: 4096,
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
      maxOutputTokens: this.llmConfig.maxTokens || 65536,
      responseMimeType: 'application/json',
      responseJsonSchema: RESTAURANT_PLACE_CHOOSER_RESPONSE_JSON_SCHEMA,
    };

    const response = await this.callLLMApi(prompt, {
      generationConfig,
      model: 'gemini-3.1-flash-lite-preview',
      timeoutMs:
        typeof this.llmConfig.queryTimeout === 'number' &&
        Number.isFinite(this.llmConfig.queryTimeout) &&
        this.llmConfig.queryTimeout > 0
          ? this.llmConfig.queryTimeout
          : undefined,
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

  private recordQueryCacheLookup(
    layer: SearchQueryCacheLayer,
    result: 'hit' | 'miss',
  ): void {
    if (!this.queryCacheLookupCounter) {
      return;
    }
    this.queryCacheLookupCounter.inc({ layer, result }, 1);
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
   * Make authenticated API call to Gemini service using @google/genai library
   */
  private async callLLMApi(
    prompt: string,
    options: LLMGenerationOptions = {},
  ): Promise<LLMApiResponse> {
    const targetModel = options.model ?? this.llmConfig.model;
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

    const defaultGenerationConfig: GeminiGenerationConfig = {
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
      maxOutputTokens: this.llmConfig.maxTokens || 65536,
      responseMimeType: 'application/json',
      responseJsonSchema: COLLECTION_RESPONSE_JSON_SCHEMA,
    };
    const thinkingContext = options.thinkingContext ?? 'content';
    const baseThinkingConfig = this.getThinkingConfig(
      targetModel,
      thinkingContext,
      options.thinkingOverride,
    );
    if (baseThinkingConfig) {
      defaultGenerationConfig.thinkingConfig = baseThinkingConfig;
    }

    const generationConfig: GeminiGenerationConfig =
      options.generationConfig ?? defaultGenerationConfig;
    const systemInstruction = options.systemInstruction ?? this.systemPrompt;

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
        lowerMessage.includes('ecconnreset') ||
        lowerMessage.includes('econnrefused')
      ) {
        return { retry: true, reason: 'network' };
      }
      if (classifyRateLimit(err)) {
        return { retry: true, reason: 'rate_limit' };
      }

      return { retry: false, reason: 'non_retryable' };
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const cacheName =
        options.cacheName ??
        (options.systemInstruction
          ? null
          : targetModel === this.llmConfig.model
            ? (this.systemInstructionCache?.name ?? null)
            : null);
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
              systemInstruction,
            };

        const resolvedTimeoutMs = (() => {
          const raw = options.timeoutMs;
          if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
            return Math.floor(raw);
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
            return await this.genAI.models.generateContent({
              model: targetModel,
              contents: [{ parts: [{ text: prompt }] }],
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
        this.usageLedger.record({
          service: 'gemini',
          operation: 'generateContent',
          model: targetModel,
          mode: 'interactive',
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens,
          cachedTokens: response.usageMetadata?.cachedContentTokenCount ?? 0,
          caller: 'llm.callGeminiApi',
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

        this.logger.error(
          'Detailed @google/genai API error',
          error,
          errorDetails,
        );

        if (cacheName && this.isCachedContentModelMismatchError(error)) {
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
            await this.clearSystemInstructionCache();
            this.queryInstructionCache = null;
          }
          attempt--;
          continue;
        }

        const cacheableRequest =
          !options.cacheName && !options.systemInstruction;
        if (cacheableRequest && this.isCachedContentMissingError(error)) {
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
            await this.clearSystemInstructionCache();
          }
          attempt--;
          continue;
        }

        const { retry, reason } = isRetryable(error);
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
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  private normalizeThinkingLevel(
    level: string | undefined,
  ): string | undefined {
    if (!level) {
      return undefined;
    }
    const normalized = level.trim().toUpperCase();
    const cleaned = normalized
      .replace(/^THINKING_LEVEL[._]/u, '')
      .replace(/^THINKINGLEVEL[._]/u, '');
    if (
      cleaned === 'MINIMAL' ||
      cleaned === 'LOW' ||
      cleaned === 'MEDIUM' ||
      cleaned === 'HIGH'
    ) {
      return cleaned;
    }
    return undefined;
  }

  private isGemini3Model(model: string): boolean {
    return /gemini-3/i.test(model);
  }

  private getThinkingConfig(
    model: string,
    context: 'content' | 'query' = 'content',
    overrides?: {
      includeThoughts?: boolean;
    },
  ):
    | {
        thinkingLevel?: string;
        includeThoughts?: boolean;
      }
    | undefined {
    const includeThoughts =
      overrides?.includeThoughts ??
      this.llmConfig.thinking?.includeThoughts === true;

    // Gemini 3+ uses thinkingLevel. ALWAYS send one so we never silently default
    // to HIGH (Gemini 3's default when no level is specified). Defaults: query →
    // MINIMAL (cheap classify/parse), content → LOW.
    if (this.isGemini3Model(model)) {
      const configuredLevel =
        context === 'query'
          ? (this.llmConfig.thinking?.queryLevel ??
            this.llmConfig.thinking?.level)
          : this.llmConfig.thinking?.level;
      const normalized = this.normalizeThinkingLevel(configuredLevel);
      if (configuredLevel && !normalized) {
        this.logger.warn('Invalid Gemini thinking level; using default', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'thinking_config',
          model,
          context,
          configuredLevel,
        });
      }
      const level = normalized ?? (context === 'query' ? 'MINIMAL' : 'LOW');
      return {
        thinkingLevel: level,
        ...(includeThoughts ? { includeThoughts } : {}),
      };
    }

    // Non-Gemini-3 models are not used in this codebase; no thinking control.
    return includeThoughts ? { includeThoughts } : undefined;
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
   * Test Gemini connectivity and authentication
   */
  async testConnection(): Promise<{
    status: string;
    message: string;
    details?: LLMPerformanceMetrics;
    error?: string;
  }> {
    try {
      const testInput: LLMModelInput = {
        posts: [
          {
            id: 'test',
            title: 'Test connection',
            content: 'Franklin BBQ has amazing brisket',
            subreddit: 'austinfood',
            author: 'test_user',
            url: 'https://reddit.com/test',
            score: 1,
            created_at: new Date().toISOString(),
            comments: [],
          },
        ],
      };

      await this.processContent(testInput);

      return {
        status: 'connected',
        message: 'Gemini connection test passed',
        details: this.performanceMetrics,
        error: undefined,
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'Gemini connection test failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get Gemini configuration (excluding sensitive data)
   */
  getLLMConfig(): Omit<LLMConfig, 'apiKey'> {
    return {
      model: this.llmConfig.model,
      queryModel: this.queryModel,
      baseUrl: this.llmConfig.baseUrl,
      timeout: this.llmConfig.timeout,
      maxTokens: this.llmConfig.maxTokens,
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
      thinking: this.llmConfig.thinking,
      retryOptions: this.llmConfig.retryOptions,
    };
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
   * Compatible with BaseExternalApiService interface
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
   * Validate LLM input structure using custom validators
   */
  async validateInput(input: LLMModelInput): Promise<string[]> {
    const inputDto = plainToClass(LLMInputDto, input);
    const errors = await validate(inputDto);

    return errors.flatMap((error) =>
      error.constraints ? Object.values(error.constraints) : [],
    );
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
