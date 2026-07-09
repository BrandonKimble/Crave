import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { EntityStatus, EntityType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';
import { Counter } from 'prom-client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntityRepository } from '../../../repositories/entity.repository';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { MetricsService } from '../../metrics/metrics.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  EntityTextSearchService,
  type RecallCandidate,
} from '../../entity-text-search/entity-text-search.service';
import { AliasManagementService } from './alias-management.service';
import {
  EntityResolutionInput,
  EntityResolutionResult,
  BatchResolutionResult,
  EntityResolutionConfig,
  ResolutionPerformanceMetrics,
  ContextualAttributeInput,
} from './entity-resolution.types';

type EntityResolutionCacheLayer = 'memory' | 'redis';

interface EntityResolutionCachePayload {
  entityId: string | null;
  confidence: number;
  resolutionTier: 'exact' | 'alias' | 'fuzzy' | 'unmatched';
  matchedName?: string;
}

interface EntityResolutionCacheEntry {
  payload: EntityResolutionCachePayload;
  cachedAt: string;
  version: string;
}

interface EntityResolutionCacheStats {
  total: number;
  memoryHits: number;
  redisHits: number;
  misses: number;
}

interface EntityResolutionCacheConfig {
  redisKey?: string;
  ttlSeconds?: number;
  negativeTtlSeconds?: number;
  localTtlSeconds?: number;
  localMaxEntries?: number;
  version?: string;
}

/**
 * Three-tier entity resolution service
 * Implements PRD Section 5.2.1 - Database Entity Resolution w/ Batching
 *
 * Resolution Process:
 * 1. Exact match against canonical names
 * 2. Alias matching with array operations
 * 3. Fuzzy matching with confidence scoring
 */
@Injectable()
export class EntityResolutionService implements OnModuleInit {
  private logger!: LoggerService;
  private redisClient: Redis | null = null;
  private cacheRedisKey = 'entity-resolution';
  private cacheVersion = 'v1';
  private cacheTtlSeconds = 0;
  private cacheNegativeTtlSeconds = 0;
  private cacheLocalTtlMs = 0;
  private cacheLocalMaxEntries = 0;
  private memoryCache = new Map<
    string,
    { entry: EntityResolutionCacheEntry; expiresAt: number }
  >();
  private cacheLookupCounter?: Counter<string>;

  // Max existing entities recalled as the LLM shortlist per unmatched entity.
  private static readonly LLM_MATCHER_SHORTLIST_K = 8;
  // Bound on concurrent LLM match calls within a batch (rate-limit friendly).
  private static readonly LLM_MATCHER_CONCURRENCY = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityRepository: EntityRepository,
    private readonly aliasManagementService: AliasManagementService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
    private readonly llmService: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('EntityResolutionService');

    const cacheConfig =
      this.configService.get<EntityResolutionCacheConfig>(
        'entityResolution.cache',
      ) ?? {};
    this.cacheRedisKey = cacheConfig?.redisKey ?? 'entity-resolution';
    this.cacheVersion = cacheConfig?.version ?? 'v1';
    const ttlSeconds =
      typeof cacheConfig?.ttlSeconds === 'number' ? cacheConfig.ttlSeconds : 0;
    const negativeTtlSeconds =
      typeof cacheConfig?.negativeTtlSeconds === 'number'
        ? cacheConfig.negativeTtlSeconds
        : 0;
    this.cacheTtlSeconds = Math.max(0, ttlSeconds);
    this.cacheNegativeTtlSeconds = Math.max(0, negativeTtlSeconds);
    if (this.cacheTtlSeconds <= 0) {
      this.cacheNegativeTtlSeconds = 0;
    } else if (this.cacheNegativeTtlSeconds > this.cacheTtlSeconds) {
      this.cacheNegativeTtlSeconds = this.cacheTtlSeconds;
    }

    const localTtlSeconds =
      typeof cacheConfig?.localTtlSeconds === 'number'
        ? cacheConfig.localTtlSeconds
        : 0;
    const localMaxEntries =
      typeof cacheConfig?.localMaxEntries === 'number'
        ? cacheConfig.localMaxEntries
        : 0;
    if (this.cacheTtlSeconds > 0) {
      const localTtlMs = Math.max(0, localTtlSeconds * 1000);
      this.cacheLocalTtlMs =
        localTtlMs > 0 ? Math.min(localTtlMs, this.cacheTtlSeconds * 1000) : 0;
      this.cacheLocalMaxEntries = Math.max(0, localMaxEntries);
    } else {
      this.cacheLocalTtlMs = 0;
      this.cacheLocalMaxEntries = 0;
    }

    this.redisClient = this.redisService.getOrThrow();
    this.cacheLookupCounter = this.metricsService.getCounter({
      name: 'entity_resolution_cache_lookups_total',
      help: 'Entity resolution cache lookups',
      labelNames: ['layer', 'result'],
    });
  }

  /**
   * Resolve a batch of entities using three-tier resolution
   * Implements PRD Section 5.2.1 - Three-Tier Resolution Process
   */
  async resolveBatch(
    entities: EntityResolutionInput[],
    config?: Partial<EntityResolutionConfig>,
  ): Promise<BatchResolutionResult> {
    const startTime = Date.now();
    const DEFAULT_CONFIG: EntityResolutionConfig = {
      batchSize: 100,
      enableFuzzyMatching: true,
      allowEntityCreation: true,
    };
    const resolveConfig = { ...DEFAULT_CONFIG, ...config };

    this.logger.info('Starting batch entity resolution', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'resolve_batch',
      entityCount: entities.length,
      batchSize: resolveConfig.batchSize,
    });

    try {
      const results: EntityResolutionResult[] = [];
      const tempIdToEntityIdMap = new Map<string, string>();
      const globalNewEntityMap = new Map<string, EntityResolutionResult>();
      let newEntitiesCreated = 0;

      const cacheEnabled = this.shouldUseEntityResolutionCache(resolveConfig);
      const cacheFallback: {
        cachedResults: EntityResolutionResult[];
        pendingEntities: EntityResolutionInput[];
        cacheStats: EntityResolutionCacheStats | null;
      } = {
        cachedResults: [],
        pendingEntities: entities,
        cacheStats: null,
      };
      const { cachedResults, pendingEntities, cacheStats } = cacheEnabled
        ? await this.resolveEntitiesFromCache(entities, resolveConfig)
        : cacheFallback;

      if (cacheStats) {
        this.logger.debug('Entity resolution cache stats', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'resolve_batch',
          ...cacheStats,
        });
      }

      results.push(...cachedResults);
      cachedResults.forEach((result) => {
        if (result.entityId) {
          tempIdToEntityIdMap.set(result.tempId, result.entityId);
        }
      });

      // Process entities in batches for optimal performance
      for (
        let i = 0;
        i < pendingEntities.length;
        i += resolveConfig.batchSize
      ) {
        const batch = pendingEntities.slice(i, i + resolveConfig.batchSize);
        const batchResults = await this.processBatch(
          batch,
          resolveConfig,
          globalNewEntityMap,
        );

        results.push(...batchResults.results);

        // Build ID mapping
        batchResults.results.forEach((result) => {
          if (result.entityId) {
            tempIdToEntityIdMap.set(result.tempId, result.entityId);
          }
        });

        newEntitiesCreated += batchResults.newEntitiesCreated;
      }

      if (cacheEnabled) {
        await this.setCachedEntityResolutionResults(
          results,
          resolveConfig,
          cachedResults.map((result) => result.tempId),
        );
      }

      const processingTime = Date.now() - startTime;
      const metrics = this.calculatePerformanceMetrics(results, processingTime);

      this.logger.info('Batch entity resolution completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'resolve_batch',
        processingTime,
        ...metrics,
      });

      // ADDED: Populate entity details for validation
      const entityDetails = new Map<string, any>();
      for (const result of results) {
        if (result.entityId) {
          // Fetch entity details for each resolved entity
          const entity = await this.entityRepository.findById(result.entityId);
          if (entity) {
            entityDetails.set(result.entityId, {
              entityId: entity.entityId,
              name: entity.name,
              type: entity.type,
              aliases: entity.aliases || [],
            });
          }
        }
      }

      return {
        tempIdToEntityIdMap,
        resolutionResults: results,
        newEntitiesCreated,
        performanceMetrics: metrics,
        entityDetails, // ADDED: Include entity details
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Batch entity resolution failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'resolve_batch',
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        entityCount: entities.length,
      });
      throw error;
    }
  }

  /**
   * Process a single batch using optimized three-tier approach
   */
  private async processBatch(
    entities: EntityResolutionInput[],
    config: EntityResolutionConfig,
    globalNewEntityMap: Map<string, EntityResolutionResult>,
  ): Promise<{
    results: EntityResolutionResult[];
    newEntitiesCreated: number;
  }> {
    const results: EntityResolutionResult[] = [];
    let newEntitiesCreated = 0;

    // Group entities by type for optimized batch queries
    const entitiesByType = this.groupEntitiesByType(entities);

    for (const [entityType, typeEntities] of entitiesByType) {
      const typeResults = await this.resolveEntitiesByType(
        typeEntities,
        entityType,
        config,
        globalNewEntityMap,
      );
      results.push(...typeResults);

      // Count new entities created
      newEntitiesCreated += typeResults.filter(
        (r) => r.resolutionTier === 'new' && r.isNewEntity,
      ).length;
    }

    return { results, newEntitiesCreated };
  }

  /**
   * Resolve entities of the same type using optimized three-tier process
   */
  private async resolveEntitiesByType(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    config: EntityResolutionConfig,
    globalNewEntityMap: Map<string, EntityResolutionResult>,
  ): Promise<EntityResolutionResult[]> {
    if (entityType !== 'restaurant') {
      return this.resolveEntitiesByTypeForMarket(
        entities,
        entityType,
        config,
        globalNewEntityMap,
        null,
      );
    }

    const entitiesByMarket = new Map<string, EntityResolutionInput[]>();
    for (const entity of entities) {
      const marketKey = this.normalizeMarketKey(entity.marketKey);
      if (!entitiesByMarket.has(marketKey)) {
        entitiesByMarket.set(marketKey, []);
      }
      entitiesByMarket.get(marketKey)!.push(entity);
    }

    const results: EntityResolutionResult[] = [];
    for (const [marketKey, group] of entitiesByMarket.entries()) {
      const resolved = await this.resolveEntitiesByTypeForMarket(
        group,
        entityType,
        config,
        globalNewEntityMap,
        marketKey,
      );
      results.push(...resolved);
    }

    return results;
  }

  private async resolveEntitiesByTypeForMarket(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    config: EntityResolutionConfig,
    globalNewEntityMap: Map<string, EntityResolutionResult>,
    marketKey: string | null,
  ): Promise<EntityResolutionResult[]> {
    this.logger.debug('Resolving entities by type', {
      entityType,
      marketKey: marketKey ?? undefined,
      count: entities.length,
    });

    // Tier 1: Exact match resolution (bulk query)
    const exactMatchResults = await this.performExactMatches(
      entities,
      entityType,
      marketKey,
    );
    const unmatchedAfterExact = entities.filter(
      (entity) =>
        !exactMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Exact match results', {
      entityType,
      marketKey: marketKey ?? undefined,
      matched: exactMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterExact.length,
    });

    // Tier 2: Alias matching (bulk query) - only for unmatched entities
    const aliasMatchResults = await this.performAliasMatches(
      unmatchedAfterExact,
      entityType,
      marketKey,
    );
    const unmatchedAfterAlias = unmatchedAfterExact.filter(
      (entity) =>
        !aliasMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Alias match results', {
      entityType,
      marketKey: marketKey ?? undefined,
      matched: aliasMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterAlias.length,
    });

    // Tier 3: recall (shared lexical+dense core) → LLM matcher. Only offline
    // consumers that opt in (config.useLlmMatcher) and only restaurant/food run
    // it, so the per-entity LLM latency never lands on the query-time callers
    // (autocomplete fallback, search interpretation) — they get exact+alias only.
    const useLlmMatcher =
      config.useLlmMatcher === true &&
      config.enableFuzzyMatching &&
      (entityType === 'restaurant' ||
        entityType === 'food' ||
        // Ingredient vocabulary needs the same duplicate protection as dishes
        // ("burrata" vs "burrata cheese") — without the judge, near-variants
        // accumulate as separate entities.
        entityType === 'ingredient');
    const fuzzyMatchResults = useLlmMatcher
      ? await this.performLlmMatches(unmatchedAfterAlias, entityType, marketKey)
      : [];

    const unmatchedAfterFuzzy = unmatchedAfterAlias.filter(
      (entity) =>
        !fuzzyMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Fuzzy match results', {
      entityType,
      marketKey: marketKey ?? undefined,
      matched: fuzzyMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterFuzzy.length,
    });

    // Mark unmatched entities for transaction-based creation (PRD approach)
    const primaryNewEntityMap = globalNewEntityMap;
    const newEntityResults = config.allowEntityCreation
      ? await this.markEntitiesForCreation(
          unmatchedAfterFuzzy,
          entityType,
          {
            exactMatches: exactMatchResults,
            aliasMatches: aliasMatchResults,
            fuzzyMatches: fuzzyMatchResults,
          },
          primaryNewEntityMap,
        )
      : [];

    // Combine results from all tiers
    // Each entity should appear exactly once in the final results
    const entityResultMap = new Map<string, EntityResolutionResult>();

    // Add exact match results (highest priority)
    exactMatchResults.forEach((result) => {
      if (result.entityId) {
        entityResultMap.set(result.tempId, result);
      }
    });

    // Add alias match results (only for entities not already matched)
    aliasMatchResults.forEach((result) => {
      if (result.entityId && !entityResultMap.has(result.tempId)) {
        entityResultMap.set(result.tempId, result);
      }
    });

    // Add fuzzy match results (only for entities not already matched)
    fuzzyMatchResults.forEach((result) => {
      if (result.entityId && !entityResultMap.has(result.tempId)) {
        entityResultMap.set(result.tempId, result);
      }
    });

    // Add new entity results (only for entities not already matched)
    newEntityResults.forEach((result) => {
      if (!entityResultMap.has(result.tempId)) {
        entityResultMap.set(result.tempId, result);
      }
    });

    return Array.from(entityResultMap.values());
  }

  /**
   * Tier 1: Exact match resolution using optimized bulk query
   * Single query: WHERE name IN (...) AND type = $entityType
   */
  private async performExactMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    marketKey: string | null,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    const normalizedNames = entities.map((e) =>
      e.normalizedName.toLowerCase().trim(),
    );

    try {
      // Optimized bulk query for exact matches. Archived rows are excluded:
      // a merged-away synonym must forward to its canonical via the alias
      // tier (the ontology banked its name there), not match its tombstone.
      const whereClause: Prisma.EntityWhereInput = {
        type: entityType,
        status: { not: EntityStatus.archived },
        name: {
          in: normalizedNames,
          mode: 'insensitive',
        },
      };

      if (entityType === 'restaurant') {
        whereClause.marketPresences = {
          some: {
            marketKey: this.normalizeMarketKey(marketKey),
          },
        };
      }

      const matchedEntities = await this.prisma.entity.findMany({
        where: whereClause,
        select: {
          entityId: true,
          name: true,
        },
      });

      // Create lookup map for O(1) resolution
      const nameToEntityMap = new Map(
        matchedEntities.map((entity) => [
          entity.name.toLowerCase().trim(),
          entity.entityId,
        ]),
      );

      return entities.map((entity) => {
        const entityId = nameToEntityMap.get(
          entity.normalizedName.toLowerCase().trim(),
        );
        return {
          tempId: entity.tempId,
          entityId: entityId || null,
          confidence: entityId ? 1.0 : 0.0,
          resolutionTier: entityId ? 'exact' : 'unmatched',
          matchedName: entityId ? entity.normalizedName : undefined,
          originalInput: entity,
        };
      });
    } catch (error) {
      this.logger.error('Exact match query failed', {
        error: error instanceof Error ? error.message : String(error),
        entityType,
        marketKey: marketKey ?? undefined,
        count: entities.length,
      });
      throw error;
    }
  }

  /**
   * Tier 2: Alias matching using optimized array operations
   * Single query: WHERE aliases && ARRAY[...] AND type = $entityType
   */
  private async performAliasMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    marketKey: string | null,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    // Collect all possible alias variations
    const allAliases = entities
      .flatMap((entity) => [
        entity.normalizedName,
        entity.originalText,
        ...(entity.aliases || []),
      ])
      .filter((alias) => alias && alias.trim().length > 0);

    if (allAliases.length === 0) {
      return entities.map((entity) => ({
        tempId: entity.tempId,
        entityId: null,
        confidence: 0.0,
        resolutionTier: 'unmatched' as const,
        originalInput: entity,
      }));
    }

    try {
      // Optimized alias matching query (archived excluded — same contract as
      // the exact tier: only live entities are matchable).
      const whereClause: Prisma.EntityWhereInput = {
        type: entityType,
        status: { not: EntityStatus.archived },
        aliases: {
          hasSome: allAliases,
        },
      };

      if (entityType === 'restaurant') {
        whereClause.marketPresences = {
          some: {
            marketKey: this.normalizeMarketKey(marketKey),
          },
        };
      }

      const matchedEntities = await this.prisma.entity.findMany({
        where: whereClause,
        select: {
          entityId: true,
          name: true,
          aliases: true,
        },
      });

      return entities.map((entity) => {
        const matchedEntity = this.selectBestAliasMatch(
          entity,
          matchedEntities,
        );

        return {
          tempId: entity.tempId,
          entityId: matchedEntity?.entityId || null,
          confidence: matchedEntity ? 0.95 : 0.0,
          resolutionTier: matchedEntity ? 'alias' : 'unmatched',
          matchedName: matchedEntity?.name,
          originalInput: entity,
        };
      });
    } catch (error) {
      this.logger.error('Alias match query failed', {
        error: error instanceof Error ? error.message : String(error),
        entityType,
        marketKey: marketKey ?? undefined,
        count: entities.length,
      });
      throw error;
    }
  }

  /**
   * Tier 3: Fuzzy matching with confidence scoring
   * Individual queries with edit distance ≤ 3-4 and confidence thresholds
   */
  /**
   * Tier 3 (P1.4 4.C): recall → LLM-as-matcher. For each entity unmatched by the
   * exact/alias tiers, recall the closest existing entities via the shared
   * lexical+dense core (market-scoped, dense always on — semantic gaps like
   * "BEC" ↔ "bacon egg and cheese" must surface), then ask the LLM whether the
   * term is the SAME real-world entity as any candidate. `match` resolves to that
   * entity; `new`/no-candidates falls through to creation. Fail-closed by design:
   * the LLM matcher and parser default to `new`, so uncertainty grows the graph
   * (recoverable) rather than fusing two real entities (corrupting).
   */
  private async performLlmMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    marketKey: string | null,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    const kind: 'restaurant' | 'food' | 'ingredient' =
      entityType === 'restaurant'
        ? 'restaurant'
        : entityType === 'ingredient'
          ? 'ingredient'
          : 'food';
    const unmatchedFor = (
      entity: EntityResolutionInput,
    ): EntityResolutionResult => ({
      tempId: entity.tempId,
      entityId: null,
      confidence: 0.0,
      resolutionTier: 'unmatched',
      originalInput: entity,
    });

    // Recall for every term first (shared lexical+dense core, type+market
    // scoped) — recall stays per-term concurrent; only the JUDGE is batched.
    const recalls = await this.mapLimit(
      entities,
      EntityResolutionService.LLM_MATCHER_CONCURRENCY,
      async (entity) => {
        const term = entity.normalizedName?.trim() ?? '';
        if (!term) return { entity, term, candidates: [] as RecallCandidate[] };
        const candidates = await this.entityTextSearch.retrieveCandidates(
          term,
          [entityType],
          EntityResolutionService.LLM_MATCHER_SHORTLIST_K,
          { marketKey, denseMode: 'always' },
        );
        return { entity, term, candidates };
      },
    );

    // Candidate ALIASES in one round-trip — the judge needs them ("BEC" ↔
    // "bacon egg and cheese" is decided BY the alias, which bare names dropped).
    const candidateIds = Array.from(
      new Set(recalls.flatMap((r) => r.candidates.map((c) => c.entityId))),
    );
    const aliasRows = candidateIds.length
      ? await this.prisma.entity.findMany({
          where: { entityId: { in: candidateIds } },
          select: { entityId: true, aliases: true },
        })
      : [];
    const aliasesById = new Map(aliasRows.map((r) => [r.entityId, r.aliases]));

    // Batched judge: ~10 (term, shortlist) items per request, items delimited
    // per-index, each failing closed to 'new' independently. Cuts request count
    // ~10x under the reservation-based rate budget (archive-load critical).
    const judgeable = recalls.filter((r) => r.candidates.length > 0);
    const BATCH = 10;
    const chunks: (typeof judgeable)[] = [];
    for (let i = 0; i < judgeable.length; i += BATCH) {
      chunks.push(judgeable.slice(i, i + BATCH));
    }
    const verdictByTempId = new Map<
      string,
      { decision: 'match' | 'new'; candidateId: number | null }
    >();
    await this.mapLimit(chunks, 4, async (chunk) => {
      const verdicts = await this.llmService.matchEntitiesBatch({
        kind,
        items: chunk.map((r) => ({
          term: r.term,
          candidates: r.candidates.map((c, i) => ({
            id: i,
            name: c.name,
            aliases: aliasesById.get(c.entityId) ?? undefined,
          })),
        })),
      });
      chunk.forEach((r, i) =>
        verdictByTempId.set(r.entity.tempId, verdicts[i]),
      );
    });

    return recalls.map(({ entity, candidates }) => {
      const verdict = verdictByTempId.get(entity.tempId);
      if (
        !verdict ||
        verdict.decision !== 'match' ||
        verdict.candidateId === null ||
        !candidates[verdict.candidateId]
      ) {
        return unmatchedFor(entity);
      }
      const matched = candidates[verdict.candidateId];
      return {
        tempId: entity.tempId,
        entityId: matched.entityId,
        confidence: 1.0,
        resolutionTier: 'fuzzy',
        matchedName: matched.name,
        originalInput: entity,
      };
    });
  }

  /** Damerau-free bounded Levenshtein: returns the distance if ≤ budget, else
   *  null (early-exits per row). Deterministic math — the overlay's CANDIDATE
   *  gate only; the LLM judge makes the sameness decision. */
  private boundedEditDistance(
    a: string,
    b: string,
    budget: number,
  ): number | null {
    if (Math.abs(a.length - b.length) > budget) return null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const curr = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        rowMin = Math.min(rowMin, curr[j]);
      }
      if (rowMin > budget) return null;
      prev = curr;
    }
    return prev[b.length] <= budget ? prev[b.length] : null;
  }

  /** Run `fn` over `items` with at most `concurrency` in flight, preserving order. */
  private async mapLimit<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const limit = Math.max(1, Math.min(concurrency, items.length || 1));
    const workers = Array.from({ length: limit }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    });
    await Promise.all(workers);
    return results;
  }

  private selectBestAliasMatch(
    inputEntity: EntityResolutionInput,
    candidateEntities: { entityId: string; name: string; aliases: string[] }[],
  ): { entityId: string; name: string; aliases: string[] } | null {
    const searchTerms = [
      inputEntity.normalizedName,
      inputEntity.originalText,
      ...(inputEntity.aliases || []),
    ]
      .filter((term): term is string => typeof term === 'string')
      .map((term) => term.trim())
      .filter((term) => term.length > 0);

    if (searchTerms.length === 0) {
      return null;
    }

    const normalizedSearchTerms = Array.from(
      new Set(searchTerms.map((term) => this.normalizeAliasValue(term))),
    );

    let bestCandidate: {
      entity: { entityId: string; name: string; aliases: string[] };
      exactNameMatch: boolean;
      candidateNameContainsSearch: boolean;
      bestNameSimilarity: number;
      bestAliasSimilarity: number;
    } | null = null;

    for (const candidate of candidateEntities) {
      const normalizedCandidateAliases = (candidate.aliases || [])
        .filter((alias): alias is string => typeof alias === 'string')
        .map((alias) => this.normalizeAliasValue(alias))
        .filter((alias) => alias.length > 0);

      const hasAliasOverlap = normalizedSearchTerms.some((searchTerm) =>
        normalizedCandidateAliases.includes(searchTerm),
      );

      if (!hasAliasOverlap) {
        continue;
      }

      const normalizedCandidateName = this.normalizeAliasValue(candidate.name);
      const exactNameMatch = normalizedSearchTerms.includes(
        normalizedCandidateName,
      );
      const candidateNameContainsSearch = normalizedSearchTerms.some(
        (searchTerm) =>
          searchTerm.length > 0 && normalizedCandidateName.includes(searchTerm),
      );

      let bestNameSimilarity = 0;
      let bestAliasSimilarity = 0;

      for (const searchTerm of normalizedSearchTerms) {
        const nameSimilarity = this.trigramSimilarity(
          searchTerm,
          normalizedCandidateName,
        );
        bestNameSimilarity = Math.max(bestNameSimilarity, nameSimilarity);

        for (const candidateAlias of normalizedCandidateAliases) {
          bestAliasSimilarity = Math.max(
            bestAliasSimilarity,
            this.trigramSimilarity(searchTerm, candidateAlias),
          );
        }
      }

      const candidateScore = {
        entity: candidate,
        exactNameMatch,
        candidateNameContainsSearch,
        bestNameSimilarity,
        bestAliasSimilarity,
      };

      if (!bestCandidate) {
        bestCandidate = candidateScore;
        continue;
      }

      if (this.compareAliasCandidates(candidateScore, bestCandidate) > 0) {
        bestCandidate = candidateScore;
      }
    }

    return bestCandidate?.entity ?? null;
  }

  private compareAliasCandidates(
    left: {
      exactNameMatch: boolean;
      candidateNameContainsSearch: boolean;
      bestNameSimilarity: number;
      bestAliasSimilarity: number;
      entity: { name: string };
    },
    right: {
      exactNameMatch: boolean;
      candidateNameContainsSearch: boolean;
      bestNameSimilarity: number;
      bestAliasSimilarity: number;
      entity: { name: string };
    },
  ): number {
    if (left.exactNameMatch !== right.exactNameMatch) {
      return left.exactNameMatch ? 1 : -1;
    }
    if (
      left.candidateNameContainsSearch !== right.candidateNameContainsSearch
    ) {
      return left.candidateNameContainsSearch ? 1 : -1;
    }
    if (left.bestNameSimilarity !== right.bestNameSimilarity) {
      return left.bestNameSimilarity > right.bestNameSimilarity ? 1 : -1;
    }
    if (left.bestAliasSimilarity !== right.bestAliasSimilarity) {
      return left.bestAliasSimilarity > right.bestAliasSimilarity ? 1 : -1;
    }

    return right.entity.name.length - left.entity.name.length;
  }

  private normalizeAliasValue(value: string): string {
    return value.toLowerCase().trim();
  }

  /**
   * Mark entities for transaction-based creation (PRD approach)
   * Return null entity IDs to allow database auto-generation
   */
  private async markEntitiesForCreation(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    context: {
      exactMatches: EntityResolutionResult[];
      aliasMatches: EntityResolutionResult[];
      fuzzyMatches: EntityResolutionResult[];
    },
    primaryNewEntityMap: Map<string, EntityResolutionResult>,
  ): Promise<EntityResolutionResult[]> {
    const results: EntityResolutionResult[] = [];

    // TOMBSTONE SINK (attribute vocab only): a term the ontology already
    // REJECTED lives on as an archived row. Instead of minting a fresh
    // pending entity — which the adjudicator would re-judge and re-archive
    // forever — repeat mentions resolve onto the tombstone. Its refs are
    // inert (read surfaces and match tiers are active/pending-only), so the
    // junk term is permanently absorbed at zero judge cost.
    const attributeTombstonesByName = new Map<string, string>();
    if (
      entityType === EntityType.food_attribute ||
      entityType === EntityType.restaurant_attribute
    ) {
      const names = Array.from(
        new Set(entities.map((e) => e.normalizedName.toLowerCase().trim())),
      );
      if (names.length > 0) {
        const tombstones = await this.prisma.entity.findMany({
          where: {
            type: entityType,
            status: EntityStatus.archived,
            name: { in: names, mode: 'insensitive' },
          },
          select: { entityId: true, name: true },
        });
        for (const t of tombstones) {
          attributeTombstonesByName.set(
            t.name.toLowerCase().trim(),
            t.entityId,
          );
        }
      }
    }

    for (const entity of entities) {
      try {
        // Prepare aliases using alias management service
        const aliasResult = this.aliasManagementService.addOriginalTextAsAlias(
          entity.aliases || [],
          entity.originalText,
        );

        // Validate scope constraints for attribute entities
        const scopeValidation =
          this.aliasManagementService.validateScopeConstraints(
            entityType,
            aliasResult.updatedAliases,
          );

        if (scopeValidation.violations.length > 0) {
          this.logger.warn('Scope violations detected for entity creation', {
            entityType,
            entityName: entity.normalizedName,
            violations: scopeValidation.violations,
          });
        }

        const normalizedName = entity.normalizedName.toLowerCase().trim();
        const normalizedKey =
          entityType === 'restaurant'
            ? `${entityType}:${this.normalizeMarketKey(
                entity.marketKey,
              )}:${normalizedName}`
            : `${entityType}:${normalizedName}`;
        const existingPrimary = primaryNewEntityMap.get(normalizedKey);

        if (existingPrimary) {
          const duplicateResult: EntityResolutionResult = {
            tempId: entity.tempId,
            entityId: existingPrimary.entityId ?? null,
            confidence: 1.0,
            resolutionTier: 'new',
            matchedName: entity.normalizedName,
            originalInput: entity,
            isNewEntity: false,
            entityType: entityType,
            normalizedName: entity.normalizedName,
            validatedAliases: scopeValidation.validAliases,
            primaryTempId: existingPrimary.tempId,
          };

          results.push(duplicateResult);

          this.logger.debug('Resolver reused primary new entity within batch', {
            entityType,
            normalizedName: entity.normalizedName,
            marketKey:
              entityType === 'restaurant'
                ? this.normalizeMarketKey(entity.marketKey)
                : undefined,
            primaryTempId: existingPrimary.tempId,
            duplicateTempId: entity.tempId,
          });

          continue;
        }

        const tombstoneId = attributeTombstonesByName.get(normalizedName);
        if (tombstoneId) {
          results.push({
            tempId: entity.tempId,
            entityId: tombstoneId,
            confidence: 1.0,
            resolutionTier: 'exact',
            matchedName: entity.normalizedName,
            originalInput: entity,
            isNewEntity: false,
            entityType: entityType,
            normalizedName: entity.normalizedName,
            validatedAliases: scopeValidation.validAliases,
          });
          this.logger.debug('Resolver sank mention to rejected tombstone', {
            entityType,
            normalizedName: entity.normalizedName,
            tombstoneId,
          });
          continue;
        }

        // INTRA-BATCH NEAR-DUPLICATE GUARD (the chicken-patty/patties class):
        // the recall matcher only sees PERSISTED entities, so two new dishes
        // born in the same run were invisible to each other and both created.
        // Before minting a fresh primary, screen the batch OVERLAY (this run's
        // already-decided new entities of the same type/market lane) with cheap
        // deterministic signals — bounded edit distance or containment, never a
        // lemmatizer or list — and let the SAME strict matchEntity judge decide
        // sameness (correct polarity here: "patty"↔"patties" IS one entity).
        // Fail-closed: judge says new → separate entity, exactly as today.
        const lanePrefix =
          entityType === 'restaurant'
            ? `${entityType}:${this.normalizeMarketKey(entity.marketKey)}:`
            : `${entityType}:`;
        const overlayCandidates = [...primaryNewEntityMap.entries()]
          .filter(([key]) => key.startsWith(lanePrefix))
          .map(([, primary]) => primary)
          .filter((primary) => {
            const other = (primary.normalizedName ?? '').toLowerCase().trim();
            if (!other || other === normalizedName) return false;
            // Nomination signals (candidate gate only — the judge decides):
            // containment, bounded edit distance, or word-set overlap (catches
            // word-order variants like "beef bulgogi"/"bulgogi beef" that both
            // containment and whole-string edit distance miss).
            if (
              other.includes(normalizedName) ||
              normalizedName.includes(other) ||
              this.boundedEditDistance(other, normalizedName, 3) !== null
            ) {
              return true;
            }
            const a = new Set(other.split(/\s+/));
            const b = normalizedName.split(/\s+/);
            const shared = b.filter((w) => a.has(w)).length;
            // Both names are trimmed, so both token sets are non-empty and
            // Math.min(...) >= 1 — full coverage of the smaller word set.
            return shared >= Math.min(a.size, b.length);
          })
          .slice(0, 8);
        if (overlayCandidates.length) {
          // Deliberately PER-ENTITY (audit item 7 verdict): the overlay grows
          // within this loop — entity N must see the primary that N-1 just
          // collapsed into — so cross-loop batching via matchEntitiesBatch
          // would change correctness (waves would be needed). Signal-gated +
          // capped at 8 candidates, this path fires rarely (ledger-measured);
          // one lite call per firing is the honest cost of the semantics.
          const verdict = await this.llmService.matchEntity({
            term: entity.normalizedName,
            kind:
              entityType === 'restaurant'
                ? 'restaurant'
                : entityType === 'ingredient'
                  ? 'ingredient'
                  : 'food',
            candidates: overlayCandidates.map((c, i) => ({
              id: i,
              name: c.normalizedName ?? '',
            })),
          });
          const judged =
            verdict.decision === 'match' && verdict.candidateId !== null
              ? overlayCandidates[verdict.candidateId]
              : null;
          if (judged) {
            // Reuse the pending primary; BANK the loser's surface as an alias
            // on it (this is how the near-dead alias column starts earning —
            // every collapse contributes a real variant for free).
            judged.validatedAliases = Array.from(
              new Set([
                ...(judged.validatedAliases ?? []),
                entity.normalizedName,
                ...(entity.originalText ? [entity.originalText] : []),
              ]),
            );
            results.push({
              tempId: entity.tempId,
              entityId: judged.entityId ?? null,
              confidence: 1.0,
              resolutionTier: 'new',
              matchedName: judged.normalizedName ?? entity.normalizedName,
              originalInput: entity,
              isNewEntity: false,
              entityType: entityType,
              normalizedName: judged.normalizedName ?? entity.normalizedName,
              validatedAliases: scopeValidation.validAliases,
              primaryTempId: judged.tempId,
            });
            // Collapse counter — the archive load MEASURES how common this
            // class is (grep: intra_batch_near_duplicate_collapsed).
            this.logger.info('intra_batch_near_duplicate_collapsed', {
              entityType,
              kept: judged.normalizedName,
              collapsed: entity.normalizedName,
            });
            continue;
          }
        }

        const primaryResult: EntityResolutionResult = {
          tempId: entity.tempId,
          entityId: null,
          confidence: 1.0,
          resolutionTier: 'new',
          matchedName: entity.normalizedName,
          originalInput: entity,
          isNewEntity: true,
          entityType: entityType,
          normalizedName: entity.normalizedName,
          validatedAliases: scopeValidation.validAliases,
        };

        results.push(primaryResult);
        primaryNewEntityMap.set(normalizedKey, primaryResult);

        const closestFuzzyMatch = context.fuzzyMatches
          .filter((r) => r.entityId)
          .reduce<{
            entityId: string;
            confidence: number;
            matchedName?: string;
          } | null>((best, current) => {
            if (!current.entityId) return best;
            if (!best || (current.confidence || 0) > best.confidence) {
              return {
                entityId: current.entityId,
                confidence: current.confidence || 0,
                matchedName: current.matchedName,
              };
            }
            return best;
          }, null);

        this.logger.warn('Resolver created new entity', {
          entityType,
          normalizedName: entity.normalizedName,
          marketKey:
            entityType === 'restaurant'
              ? this.normalizeMarketKey(entity.marketKey)
              : undefined,
          originalText: entity.originalText,
          aliases: entity.aliases,
          searchTerms: [
            entity.normalizedName,
            entity.originalText,
            ...(entity.aliases || []),
          ],
          closestFuzzyMatch,
        });

        this.logger.debug('Marked entity for transaction creation', {
          tempId: entity.tempId,
          entityType,
          name: entity.normalizedName,
        });
      } catch (error) {
        this.logger.error('Failed to prepare entity for creation', {
          error: error instanceof Error ? error.message : String(error),
          entityType,
          entityName: entity.normalizedName,
        });

        // Add unmatched result for failed preparation
        results.push({
          tempId: entity.tempId,
          entityId: null,
          confidence: 0.0,
          resolutionTier: 'unmatched',
          originalInput: entity,
        });
      }
    }

    return results;
  }

  /**
   * Resolve context-dependent attributes with scope awareness
   * Implements PRD Section 4.2.2 - Context-Dependent Attributes
   */
  async resolveContextualAttributes(
    attributes: ContextualAttributeInput[],
    config?: Partial<EntityResolutionConfig>,
  ): Promise<BatchResolutionResult> {
    this.logger.info('Resolving contextual attributes', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'resolve_contextual_attributes',
      count: attributes.length,
    });

    // Convert to standard resolution inputs with proper entity types
    const resolutionInputs = attributes.map((attr) => ({
      tempId: attr.tempId,
      normalizedName: attr.attributeName,
      originalText: attr.originalText,
      entityType: (attr.scope === 'food'
        ? 'food_attribute'
        : 'restaurant_attribute') as EntityType,
      aliases: attr.aliases || [],
    }));

    return this.resolveBatch(resolutionInputs, config);
  }

  /**
   * Helper method to group entities by type for batch processing
   */
  private groupEntitiesByType(
    entities: EntityResolutionInput[],
  ): Map<EntityType, EntityResolutionInput[]> {
    const grouped = new Map<EntityType, EntityResolutionInput[]>();

    for (const entity of entities) {
      if (!grouped.has(entity.entityType)) {
        grouped.set(entity.entityType, []);
      }
      grouped.get(entity.entityType)!.push(entity);
    }

    return grouped;
  }

  private normalizeMarketKey(marketKey?: string | null): string {
    const normalized =
      typeof marketKey === 'string' ? marketKey.trim().toLowerCase() : '';
    return normalized.length ? normalized : 'global';
  }

  private shouldUseEntityResolutionCache(
    config: EntityResolutionConfig,
  ): boolean {
    if (config.allowEntityCreation) {
      return false;
    }
    if (this.cacheTtlSeconds <= 0) {
      return false;
    }
    const hasMemoryLayer =
      this.cacheLocalMaxEntries > 0 && this.cacheLocalTtlMs > 0;
    const hasCacheLayer = hasMemoryLayer || Boolean(this.redisClient);
    return hasCacheLayer;
  }

  private async resolveEntitiesFromCache(
    entities: EntityResolutionInput[],
    config: EntityResolutionConfig,
  ): Promise<{
    cachedResults: EntityResolutionResult[];
    pendingEntities: EntityResolutionInput[];
    cacheStats: EntityResolutionCacheStats;
  }> {
    const cachedResults: EntityResolutionResult[] = [];
    const pendingEntities: EntityResolutionInput[] = [];
    const pendingRedis: Array<{
      entity: EntityResolutionInput;
      cacheKey: string;
    }> = [];
    const memoryEnabled =
      this.cacheLocalMaxEntries > 0 && this.cacheLocalTtlMs > 0;
    const redisEnabled = Boolean(this.redisClient);
    let memoryHits = 0;

    for (const entity of entities) {
      const cacheKey = this.buildEntityResolutionCacheKey(entity, config);
      if (!cacheKey) {
        pendingEntities.push(entity);
        continue;
      }

      if (memoryEnabled) {
        const memoryHit = this.getMemoryCachedEntityResolution(cacheKey);
        if (memoryHit) {
          memoryHits += 1;
          this.recordCacheLookup('memory', 'hit');
          cachedResults.push(
            this.buildResultFromCache(entity, memoryHit.payload),
          );
          continue;
        }
        this.recordCacheLookup('memory', 'miss');
      }
      pendingRedis.push({ entity, cacheKey });
    }

    let redisHits = 0;
    if (pendingRedis.length > 0 && redisEnabled && this.redisClient) {
      const keys = pendingRedis.map((item) => item.cacheKey);
      const rawValues = await this.redisClient.mget(...keys);
      for (let index = 0; index < pendingRedis.length; index += 1) {
        const raw = rawValues[index];
        const { entity, cacheKey } = pendingRedis[index];
        if (!raw) {
          this.recordCacheLookup('redis', 'miss');
          pendingEntities.push(entity);
          continue;
        }

        const parsed = this.parseEntityResolutionCacheEntry(raw);
        if (!parsed) {
          this.recordCacheLookup('redis', 'miss');
          pendingEntities.push(entity);
          continue;
        }

        this.recordCacheLookup('redis', 'hit');
        redisHits += 1;
        cachedResults.push(this.buildResultFromCache(entity, parsed.payload));
        this.setMemoryCachedEntityResolution(cacheKey, parsed);
      }
    } else {
      pendingEntities.push(...pendingRedis.map((item) => item.entity));
    }

    const total = entities.length;
    const misses = total - memoryHits - redisHits;

    return {
      cachedResults,
      pendingEntities,
      cacheStats: {
        total,
        memoryHits,
        redisHits,
        misses,
      },
    };
  }

  private buildResultFromCache(
    entity: EntityResolutionInput,
    payload: EntityResolutionCachePayload,
  ): EntityResolutionResult {
    return {
      tempId: entity.tempId,
      entityId: payload.entityId,
      confidence: payload.confidence,
      resolutionTier: payload.resolutionTier,
      matchedName: payload.matchedName,
      originalInput: entity,
    };
  }

  private buildEntityResolutionCacheKey(
    entity: EntityResolutionInput,
    config: EntityResolutionConfig,
  ): string | null {
    const normalizedName =
      typeof entity.normalizedName === 'string'
        ? entity.normalizedName.trim().toLowerCase()
        : '';
    if (!normalizedName) {
      return null;
    }

    const tokens = this.buildEntityResolutionCacheTokens(entity);
    const tokenSignature = this.hashString(tokens.join('|'));
    const cacheSignature = JSON.stringify({
      version: this.cacheVersion,
      entityType: entity.entityType,
      marketKey:
        entity.entityType === 'restaurant'
          ? this.normalizeMarketKey(entity.marketKey)
          : 'global',
      tokens: tokenSignature,
      config: {
        enableFuzzyMatching: config.enableFuzzyMatching,
        allowEntityCreation: config.allowEntityCreation,
        useLlmMatcher: config.useLlmMatcher ?? false,
      },
    });
    const hash = this.hashString(cacheSignature);
    return `${this.cacheRedisKey}:${hash}`;
  }

  private buildEntityResolutionCacheTokens(
    entity: EntityResolutionInput,
  ): string[] {
    const rawTokens = [
      entity.normalizedName,
      entity.originalText,
      ...(entity.aliases ?? []),
    ];
    const normalized = rawTokens
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0)
      .map((value) => value.toLowerCase());
    return Array.from(new Set(normalized)).sort();
  }

  private parseEntityResolutionCacheEntry(
    raw: string,
  ): EntityResolutionCacheEntry | null {
    try {
      const parsed = JSON.parse(raw) as EntityResolutionCacheEntry;
      if (!parsed || parsed.version !== this.cacheVersion) {
        return null;
      }
      if (!parsed.payload) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private getMemoryCachedEntityResolution(
    key: string,
  ): EntityResolutionCacheEntry | null {
    if (this.cacheLocalMaxEntries <= 0 || this.cacheLocalTtlMs <= 0) {
      return null;
    }
    const entry = this.memoryCache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }
    this.memoryCache.delete(key);
    this.memoryCache.set(key, entry);
    return entry.entry;
  }

  private setMemoryCachedEntityResolution(
    key: string,
    entry: EntityResolutionCacheEntry,
  ): void {
    if (this.cacheLocalMaxEntries <= 0 || this.cacheLocalTtlMs <= 0) {
      return;
    }
    const ttlMs = this.resolveCacheTtlMs(entry.payload);
    if (ttlMs <= 0) {
      return;
    }
    this.memoryCache.set(key, {
      entry,
      expiresAt: Date.now() + ttlMs,
    });
    this.pruneMemoryCache();
  }

  private pruneMemoryCache(): void {
    if (this.cacheLocalMaxEntries <= 0) {
      this.memoryCache.clear();
      return;
    }
    while (this.memoryCache.size > this.cacheLocalMaxEntries) {
      const oldestKey = this.memoryCache.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) {
        break;
      }
      this.memoryCache.delete(oldestKey);
    }
  }

  private resolveCacheTtlMs(payload: EntityResolutionCachePayload): number {
    const ttlSeconds = payload.entityId
      ? this.cacheTtlSeconds
      : this.cacheNegativeTtlSeconds;
    if (ttlSeconds <= 0) {
      return 0;
    }
    if (this.cacheLocalTtlMs <= 0) {
      return 0;
    }
    return Math.min(this.cacheLocalTtlMs, ttlSeconds * 1000);
  }

  private resolveCacheTtlSeconds(
    payload: EntityResolutionCachePayload,
  ): number {
    const ttlSeconds = payload.entityId
      ? this.cacheTtlSeconds
      : this.cacheNegativeTtlSeconds;
    return Math.max(0, ttlSeconds);
  }

  private async setCachedEntityResolutionResults(
    results: EntityResolutionResult[],
    config: EntityResolutionConfig,
    cachedTempIds: string[],
  ): Promise<void> {
    if (!this.shouldUseEntityResolutionCache(config)) {
      return;
    }

    const cachedTempIdSet = new Set(cachedTempIds);
    const cacheable = results.filter(
      (
        result,
      ): result is EntityResolutionResult & {
        resolutionTier: EntityResolutionCachePayload['resolutionTier'];
      } => {
        if (cachedTempIdSet.has(result.tempId)) {
          return false;
        }
        if (
          result.resolutionTier === 'new' ||
          result.isNewEntity ||
          result.primaryTempId
        ) {
          return false;
        }
        if (!result.originalInput) {
          return false;
        }
        if (!this.isCacheableResolutionTier(result.resolutionTier)) {
          return false;
        }
        return true;
      },
    );

    if (cacheable.length === 0) {
      return;
    }

    const pipeline = this.redisClient?.pipeline();

    for (const result of cacheable) {
      const cacheKey = this.buildEntityResolutionCacheKey(
        result.originalInput,
        config,
      );
      if (!cacheKey) {
        continue;
      }

      const payload: EntityResolutionCachePayload = {
        entityId: result.entityId,
        confidence: result.confidence,
        resolutionTier: result.resolutionTier,
        matchedName: result.matchedName,
      };
      const ttlSeconds = this.resolveCacheTtlSeconds(payload);
      if (ttlSeconds <= 0) {
        continue;
      }

      const entry: EntityResolutionCacheEntry = {
        payload,
        cachedAt: new Date().toISOString(),
        version: this.cacheVersion,
      };

      this.setMemoryCachedEntityResolution(cacheKey, entry);

      if (pipeline) {
        pipeline.set(cacheKey, JSON.stringify(entry), 'EX', ttlSeconds);
      }
    }

    if (pipeline) {
      try {
        await pipeline.exec();
      } catch (error) {
        this.logger.warn('Failed to persist entity resolution cache', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'resolve_batch',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  private recordCacheLookup(
    layer: EntityResolutionCacheLayer,
    result: 'hit' | 'miss',
  ): void {
    if (!this.cacheLookupCounter) {
      return;
    }
    this.cacheLookupCounter.inc({ layer, result }, 1);
  }

  private isCacheableResolutionTier(
    tier: EntityResolutionResult['resolutionTier'],
  ): tier is EntityResolutionCachePayload['resolutionTier'] {
    return (
      tier === 'exact' ||
      tier === 'alias' ||
      tier === 'fuzzy' ||
      tier === 'unmatched'
    );
  }

  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Calculate performance metrics for resolution results
   */
  private calculatePerformanceMetrics(
    results: EntityResolutionResult[],
    processingTimeMs: number,
  ): ResolutionPerformanceMetrics {
    const exactMatches = results.filter(
      (r) => r.resolutionTier === 'exact' && r.entityId,
    ).length;
    const aliasMatches = results.filter(
      (r) => r.resolutionTier === 'alias' && r.entityId,
    ).length;
    const fuzzyMatches = results.filter(
      (r) => r.resolutionTier === 'fuzzy' && r.entityId,
    ).length;
    const newEntitiesCreated = results.filter(
      (r) => r.resolutionTier === 'new' && r.entityId,
    ).length;

    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence =
      results.length > 0 ? totalConfidence / results.length : 0;

    return {
      totalProcessed: results.length,
      exactMatches,
      aliasMatches,
      fuzzyMatches,
      newEntitiesCreated,
      processingTimeMs: Math.max(processingTimeMs, 1), // Ensure minimum 1ms for testing
      averageConfidence: Math.round(averageConfidence * 100) / 100,
    };
  }

  /**
   * Jaccard similarity over character trigrams — the same trigram vocabulary the
   * shared matcher's pg_trgm `similarity()` speaks (see EntityTextSearchService's
   * `similarity(lower(e.name), v.term)`). Used only to ORDER alias candidates that
   * have already passed the hard `hasAliasOverlap` accept gate; it never gates a
   * match.
   */
  private trigramSimilarity(a: string, b: string): number {
    const grams = (s: string): Set<string> => {
      const padded = `  ${s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()}  `;
      const set = new Set<string>();
      for (let i = 0; i < padded.length - 2; i++) {
        set.add(padded.slice(i, i + 3));
      }
      return set;
    };
    const A = grams(a);
    const B = grams(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return inter / (A.size + B.size - inter);
  }
}
