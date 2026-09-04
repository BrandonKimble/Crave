import { MetroAdoptionService } from './metro-adoption.service';
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { EntityStatus, EntityType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { itemNameVariants } from './food-lemma';
import {
  admitsAtExactTier,
  canonicalFold,
  diacriticFold,
  entityLockKey,
  identityInsertData,
  isAccented,
  spellingOf,
  type SurfaceSpelling,
} from './entity-identity';
import { identityMergeLockKey } from '../reddit-collector/extraction-scope.service';
import { recallScope } from '../../../shared/locale';

import { LoggerService, CorrelationUtils } from '../../../shared';
import { localeLookupChain } from '../../../shared/locale/accept-language';
import { LLMService } from '../../external-integrations/llm/llm.service';
import {
  EntityTextSearchService,
  type RecallCandidate,
} from '../../entity-text-search/entity-text-search.service';
import { AliasManagementService } from './alias-management.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import {
  ENTITY_MATCH_LANE,
  entityMatchLane,
  type EntityMatchClaim,
} from './entity-match-lane';
import {
  ENTITY_DEDUPE_RULE_FINGERPRINT,
  ENTITY_DEDUPE_RULE_VERSION,
} from './entity-dedupe-rule';
import { identityGradeSql } from './entity-surface.service';
import {
  EntityResolutionInput,
  EntityResolutionResult,
  BatchResolutionResult,
  EntityResolutionConfig,
  ResolutionPerformanceMetrics,
} from './entity-resolution.types';

/**
 * The ACCENT-FREE tokens of a probe — the positions where the per-token
 * admission rule may have to ask the registry "is this a word, or a skipped
 * accent?". A token whose two folds agree carries no accent; those are exactly
 * the tokens the banked-plain-forms discriminator rules on.
 */
function plainTokensOf(probe: string): string[] {
  const typed = diacriticFold(probe).split(' ');
  const folded = canonicalFold(probe).split(' ');
  if (typed.length !== folded.length) return [];
  return typed.filter((token, i) => token === folded[i] && token.length > 0);
}

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
/** Number variance applies to what people ORDER, not to proper nouns:
 *  "Torchy's Tacos" is not "Torchy's Taco". Shared by the exact-match tier
 *  and the within-batch creation dedupe so the two cannot drift apart. */
function entityTypeUsesNumberVariants(entityType: EntityType): boolean {
  return entityType === EntityType.item || entityType === EntityType.ingredient;
}

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

  // Max existing entities recalled as the LLM shortlist per unmatched entity.
  // K=8 TESTED vs K=15 2026-07-11 (scripts/search-harness/shortlist-k-probe.ts,
  // 150 alias→canonical pairs through the real recall core): 148/150 true
  // entities rank in the top 8; the single rank-9..15 case judged 'new' at
  // BOTH K values (zero verdict flips), while K=15 inflates the judge's
  // candidate payload +46%. Re-run the probe before changing.
  private static readonly LLM_MATCHER_SHORTLIST_K = 8;
  // Bound on concurrent LLM match calls within a batch (rate-limit friendly).
  private static readonly LLM_MATCHER_CONCURRENCY = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasManagementService: AliasManagementService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly llmService: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    private readonly metroAdoption: MetroAdoptionService,
    private readonly claimLedger: ClaimVerdictLedgerService,
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

      return {
        tempIdToEntityIdMap,
        resolutionResults: results,
        newEntitiesCreated,
        performanceMetrics: metrics,
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
    // LANGUAGE IS A SCOPE, LIKE THE ENGINE. The surface slice a mention may
    // ground through is decided by the language of the DOCUMENT it was said
    // in, so mentions from documents of different languages cannot share one
    // query — exactly as restaurants from different engines cannot. Grouping
    // it here keeps the tiers below single-scoped and unchanged in shape.
    // The corpus is one language per community today, so this is one group
    // in practice; it is a partition, not a loop over languages.
    const results: EntityResolutionResult[] = [];
    for (const [localeScope, localeGroup] of this.groupEntitiesByDocumentLocale(
      entities,
    )) {
      results.push(
        ...(await this.resolveEntitiesByTypeForLocale(
          localeGroup,
          entityType,
          config,
          globalNewEntityMap,
          localeScope,
        )),
      );
    }
    return results;
  }

  /** The document locale a mention grounds under. null = locale-less caller
   *  (query-time linking, poll seeding, the gate's own untagged fixtures):
   *  `localeLookupChain(null)` is `['und']`, the pre-flip scope exactly. */
  private normalizeDocumentLocale(
    documentLocale: string | null | undefined,
  ): string | null {
    const trimmed = (documentLocale ?? '').trim();
    if (!trimmed || trimmed.toLowerCase() === 'und') {
      return null;
    }
    return trimmed;
  }

  private groupEntitiesByDocumentLocale(
    entities: EntityResolutionInput[],
  ): Map<string | null, EntityResolutionInput[]> {
    const groups = new Map<string | null, EntityResolutionInput[]>();
    for (const entity of entities) {
      const scope = this.normalizeDocumentLocale(entity.documentLocale);
      if (!groups.has(scope)) {
        groups.set(scope, []);
      }
      groups.get(scope)!.push(entity);
    }
    return groups;
  }

  private async resolveEntitiesByTypeForLocale(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    config: EntityResolutionConfig,
    globalNewEntityMap: Map<string, EntityResolutionResult>,
    documentLocale: string | null,
  ): Promise<EntityResolutionResult[]> {
    if (entityType !== 'place') {
      return this.resolveEntitiesByTypeForEngine(
        entities,
        entityType,
        config,
        globalNewEntityMap,
        null,
        documentLocale,
      );
    }

    const entitiesByEngine = new Map<string, EntityResolutionInput[]>();
    for (const entity of entities) {
      const engineScope = this.normalizeEngineScope(entity.engineId);
      if (!entitiesByEngine.has(engineScope)) {
        entitiesByEngine.set(engineScope, []);
      }
      entitiesByEngine.get(engineScope)!.push(entity);
    }

    const results: EntityResolutionResult[] = [];
    for (const [engineScope, group] of entitiesByEngine.entries()) {
      const resolved = await this.resolveEntitiesByTypeForEngine(
        group,
        entityType,
        config,
        globalNewEntityMap,
        engineScope === 'global' ? null : engineScope,
        documentLocale,
      );
      results.push(...resolved);
    }

    return results;
  }

  private async resolveEntitiesByTypeForEngine(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    config: EntityResolutionConfig,
    globalNewEntityMap: Map<string, EntityResolutionResult>,
    engineId: string | null,
    documentLocale: string | null,
  ): Promise<EntityResolutionResult[]> {
    this.logger.debug('Resolving entities by type', {
      entityType,
      engineId: engineId ?? undefined,
      documentLocale: documentLocale ?? undefined,
      count: entities.length,
    });

    const rehearsalRunId = config.rehearsalRunId ?? null;

    // Tier 1: Exact match resolution (bulk query)
    const exactMatchResults = await this.performExactMatches(
      entities,
      entityType,
      engineId,
      documentLocale,
      rehearsalRunId,
    );
    const unmatchedAfterExact = entities.filter(
      (entity) =>
        !exactMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Exact match results', {
      entityType,
      engineId: engineId ?? undefined,
      matched: exactMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterExact.length,
    });

    // Tier 2: Alias matching (bulk query) - only for unmatched entities
    const aliasMatchResults = await this.performAliasMatches(
      unmatchedAfterExact,
      entityType,
      engineId,
      documentLocale,
      rehearsalRunId,
    );
    const unmatchedAfterAlias = unmatchedAfterExact.filter(
      (entity) =>
        !aliasMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Alias match results', {
      entityType,
      engineId: engineId ?? undefined,
      matched: aliasMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterAlias.length,
    });

    // Tier 2.5: joined-identity claim (space/join twins). Deterministic,
    // guarded — see performJoinedIdentityMatches. Results carry tier 'alias'
    // (a surface-identity claim at the same 0.95 confidence) and flow through
    // the metro gate with the other alias matches below.
    const joinedMatchResults = await this.performJoinedIdentityMatches(
      unmatchedAfterAlias,
      entityType,
      engineId,
      documentLocale,
      rehearsalRunId,
    );
    const unmatchedAfterJoined = unmatchedAfterAlias.filter(
      (entity) =>
        !joinedMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    // Tier 3: recall (shared lexical+dense core) → LLM matcher. Only offline
    // consumers that opt in (config.useLlmMatcher) and only restaurant/food run
    // it, so the per-entity LLM latency never lands on the query-time callers
    // (autocomplete fallback, search interpretation) — they get exact+alias only.
    const useLlmMatcher =
      config.useLlmMatcher === true &&
      config.enableFuzzyMatching &&
      (entityType === 'place' ||
        entityType === 'item' ||
        // Ingredient vocabulary needs the same duplicate protection as dishes
        // ("burrata" vs "burrata cheese") — without the judge, near-variants
        // accumulate as separate entities.
        entityType === 'ingredient');
    const fuzzyMatchResults = useLlmMatcher
      ? await this.performLlmMatches(
          unmatchedAfterJoined,
          entityType,
          engineId,
          documentLocale,
          rehearsalRunId,
        )
      : [];

    const unmatchedAfterFuzzy = unmatchedAfterJoined.filter(
      (entity) =>
        !fuzzyMatchResults.find(
          (r) => r.tempId === entity.tempId && r.entityId,
        ),
    );

    this.logger.debug('Fuzzy match results', {
      entityType,
      engineId: engineId ?? undefined,
      matched: fuzzyMatchResults.filter((r) => r.entityId).length,
      unmatched: unmatchedAfterFuzzy.length,
    });

    // P2.2 METRO ADOPTION GATE (restaurants only): a candidate with no
    // location in the mention's metro may be adopted ONLY via an exact
    // full-name match to the single global candidate. Nickname/alias/
    // fuzzy matches demote to unmatched and resolve locally (mint with
    // metro-biased grounding; the nightly domain-merge converges true
    // branches). Executed evidence: "Rudy's" in r/austinfood reached an
    // NYC bar through fold matching — 182 misattributed events.
    const demotedInputs =
      entityType === 'place' && engineId
        ? await this.applyMetroAdoptionGate(
            [
              ...exactMatchResults,
              ...aliasMatchResults,
              ...joinedMatchResults,
              ...fuzzyMatchResults,
            ],
            engineId,
          )
        : [];
    const unmatchedForCreation = demotedInputs.length
      ? [
          ...unmatchedAfterFuzzy,
          ...entities.filter((entity) => demotedInputs.includes(entity.tempId)),
        ]
      : unmatchedAfterFuzzy;

    // Mark unmatched entities for transaction-based creation (PRD approach)
    const primaryNewEntityMap = globalNewEntityMap;
    const newEntityResults = config.allowEntityCreation
      ? await this.markEntitiesForCreation(
          unmatchedForCreation,
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

    // Add joined-identity results (only for entities not already matched)
    joinedMatchResults.forEach((result) => {
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

    // Round-13 F8: with creation disabled, a demoted restaurant must
    // surface as an explicit unmatched result, not silently vanish.
    if (!config.allowEntityCreation && demotedInputs.length) {
      for (const tier of [
        exactMatchResults,
        aliasMatchResults,
        joinedMatchResults,
        fuzzyMatchResults,
      ]) {
        for (const result of tier) {
          if (
            demotedInputs.includes(result.tempId) &&
            !entityResultMap.has(result.tempId)
          ) {
            entityResultMap.set(result.tempId, result);
          }
        }
      }
    }

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
  /** Returns tempIds DEMOTED to unmatched. Mutates demoted results
   *  (entityId → null) in place so the tier merge naturally skips them. */
  private async applyMetroAdoptionGate(
    results: EntityResolutionResult[],
    engineId: string,
  ): Promise<string[]> {
    const matched = results.filter((result) => result.entityId);
    if (!matched.length) {
      return [];
    }
    const anchor = await this.metroAdoption.anchorForEngine(engineId);
    if (!anchor) {
      return []; // no metro anchor — the gate stands down
    }
    const candidateIds = Array.from(
      new Set(matched.map((result) => result.entityId as string)),
    );
    const verdicts = await this.metroAdoption.geoVerdicts(candidateIds, anchor);
    // 'unknown' (no geocoded location anywhere) stands the gate down —
    // round-13 F5: 22.7% of active restaurants are ungrounded and were
    // being treated as remote-everywhere, so every nickname mention of
    // them minted a duplicate.
    const remote = matched.filter(
      (result) => verdicts.get(result.entityId as string) === 'remote',
    );
    if (!remote.length) {
      return [];
    }
    // exact-tier remote matches may stand IF the name is globally unique
    const exactRemote = remote.filter(
      (result) => result.resolutionTier === 'exact',
    );
    const uniqueNames = await this.metroAdoption.globallyUniqueExactNames(
      exactRemote.map((result) => result.originalInput.normalizedName),
    );
    const demoted: string[] = [];
    for (const result of remote) {
      const isExactUnique =
        result.resolutionTier === 'exact' &&
        uniqueNames.has(
          result.originalInput.normalizedName.toLowerCase().trim(),
        );
      if (isExactUnique) {
        continue; // a full exact name can travel across the country
      }
      // LOCAL RE-RESOLVE before demoting (round-13 F4): "resolve
      // locally" must mean resolve — a locally-present candidate carrying
      // this surface as name or alias is adopted instead of minting.
      const localSibling = await this.metroAdoption.findLocalByNameOrAlias(
        result.originalInput.normalizedName,
        anchor,
      );
      if (localSibling) {
        this.logger.info('Metro gate re-resolved to a local sibling', {
          engineId,
          name: result.originalInput.normalizedName,
          remoteCandidate: result.entityId,
          localSibling,
        });
        result.entityId = localSibling;
        result.matchedName = result.originalInput.normalizedName;
        continue;
      }
      this.logger.warn('Metro gate demoted a remote adoption', {
        engineId,
        name: result.originalInput.normalizedName,
        candidate: result.entityId,
        tier: result.resolutionTier,
      });
      result.entityId = null;
      result.confidence = 0;
      result.resolutionTier = 'unmatched';
      demoted.push(result.tempId);
    }
    return demoted;
  }

  private async performExactMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    engineId: string | null,
    documentLocale: string | null,
    rehearsalRunId: string | null,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    const normalizedNames = entities.map((e) =>
      e.normalizedName.toLowerCase().trim(),
    );

    // SINGULAR/PLURAL IS DECIDED HERE, IN CODE, NOT BY THE JUDGE.
    // Attribution (llm_decision_records, 2026-07-28): the LLM judge answered
    // the IDENTICAL question "is 'dumplings' the same as 'dumpling'?" —
    // same candidate list — `match` five times and `new` once, and the one
    // `new` minted the duplicate permanently, because this exact tier then
    // finds it forever and the judge is never asked again. 11.6% of repeated
    // identical questions across the ledger disagree with themselves. A
    // plural is a morphological fact, so we never ask: probing the number
    // variants here removes the question from the stochastic tier entirely
    // (cheaper AND exact). Foods and ingredients only — restaurant names
    // carry number as branding ("Torchy's Tacos" is not "Torchy's Taco").
    const usesNumberVariants = entityTypeUsesNumberVariants(entityType);
    const probeNames = usesNumberVariants
      ? Array.from(
          new Set(entities.flatMap((e) => itemNameVariants(e.normalizedName))),
        )
      : normalizedNames;
    // IDENTITY-KEY PROBE (2026-08-11, the v7 shadow twin class). The
    // case-insensitive name probe is BYTE equality modulo case: "Mcdonalds"
    // never matched "McDonald's" (apostrophe), "Alamo Springs Cafe" never
    // matched "Alamo Springs Café" (accent) — 23 duplicate restaurants minted
    // in one full-corpus replay for trivial spelling variants the judge then
    // fail-closed on. `core_entities.identity_key` IS `canonicalFold(name)`,
    // app-written on every create (identityInsertData) and indexed
    // (idx_entities_type_identity_key) — the ONE stored identity fold — so
    // the tier probes it with the SAME fold on the input side. Same-fold =
    // same name modulo case/accents/apostrophes/punctuation runs; that is a
    // deterministic identity fact, never the judge's question.
    const foldedProbes = Array.from(
      new Set(probeNames.map((name) => canonicalFold(name)).filter(Boolean)),
    );

    try {
      // Optimized bulk query for exact matches. Archived rows are excluded:
      // a merged-away synonym must forward to its canonical via the alias
      // tier (the ontology banked its name there), not match its tombstone.
      const whereClause: Prisma.EntityWhereInput = {
        type: entityType,
        // Archived rows forward via the alias tier; rehearsal rows are
        // visible ONLY to their own run (plans/shadow-sandbox.md): a live
        // run must never adopt an invisible mint, and a rehearsal must see
        // its own so its chunks cohere. This sandbox means two COMPLETED
        // shadow runs over the same doc would mint identity twins (junk
        // RC7, 2026-08-27) — that double-extraction is refused upstream at
        // the replay chokepoint (replay.service.ts, one shadow extraction
        // per source run per prompt hash), never patched here.
        AND: [
          { status: { not: EntityStatus.archived } },
          rehearsalRunId
            ? {
                OR: [
                  { status: { not: EntityStatus.rehearsal } },
                  { bornExtractionRunId: rehearsalRunId },
                ],
              }
            : { status: { not: EntityStatus.rehearsal } },
        ],
        OR: [
          {
            name: {
              in: probeNames,
              mode: 'insensitive',
            },
          },
          // Names with no foldable identity (emoji-only) carry NULL identity
          // keys and are unreachable here by construction — foldedProbes is
          // filtered non-empty, and NULL never equals a probe.
          ...(foldedProbes.length
            ? [{ identityKey: { in: foldedProbes } }]
            : []),
        ],
      };

      const matchedEntities = await this.prisma.entity.findMany({
        where: whereClause,
        select: {
          entityId: true,
          name: true,
          identityKey: true,
        },
      });

      // Create lookup maps for O(1) resolution
      const nameToEntityMap = new Map(
        matchedEntities.map((entity) => [
          entity.name.toLowerCase().trim(),
          entity.entityId,
        ]),
      );
      // ONE owner per fold, picked in a TOTAL ORDER (2026-08-12 red team).
      // This used to keep whichever row came back first — but `findMany`
      // carries no `orderBy`, so "first" was whatever plan and heap order the
      // database happened to produce, and the corpus really does hold live
      // fold collisions (11 measured: "Alamo Springs Café"/"Alamo Springs
      // Cafe", "Texsueño"/"Texsueno", "Valentina’s"/"Valentinas" …). An
      // unordered pick means the SAME mention grounds on a different twin
      // from run to run and splits one restaurant's evidence across both — a
      // resolver whose answer depends on physical row order is not
      // deterministic, and determinism is this tier's whole claim over the
      // judge. Sorting by entityId is arbitrary but TOTAL and STABLE: uuids
      // do not change, so every run of every process picks the same owner
      // until a merge removes one. The raw-spelling map above still outranks
      // this per input, so a fold twin can never steal an input whose own
      // spelling exists. The stored NAME rides along for the accent-evidence
      // check below.
      const identityToEntityMap = new Map<
        string,
        { entityId: string; name: string }
      >();
      for (const entity of [...matchedEntities].sort((a, b) =>
        a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0,
      )) {
        if (
          entity.identityKey &&
          !identityToEntityMap.has(entity.identityKey)
        ) {
          identityToEntityMap.set(entity.identityKey, {
            entityId: entity.entityId,
            name: entity.name,
          });
        }
      }
      // ACCENT EVIDENCE ON THE FOLD ARM (2026-08-11 multilingual audit;
      // REFINED 2026-08-12 after the red team executed it).
      //
      // canonicalFold strips accents, and on Vietnamese accents are PHONEMIC:
      // "cơm chay" (vegetarian rice) and "cơm cháy" (scorched rice) share one
      // fold, as do "bò" (beef) and "bơ" (butter/avocado) — the exact pairs
      // the diacriticFold doctrine names (entity-identity.ts).
      //
      // THE ORIGINAL RULE COULD NOT FIRE. It refused only when BOTH sides
      // carried accents. But our entity NAMES are the English-corpus,
      // de-accented spellings ('bun', 'bo', 'bap', 'banh cuon'), so
      // `storedAccented` is false for exactly the words the rule was written
      // for, and the guard never triggered: a full 31,516-row locale-tagged
      // surface sweep found ZERO both-accented refusals and 11 live wrong
      // claims sailing through at confidence 1.0 — Vietnamese "bún"
      // (vermicelli) claiming the English bread "bun", "bơ" (butter) claiming
      // "bo", "bắp" (corn) claiming "bap", "bánh cuộn" (wrap) claiming the
      // different-toned "bánh cuốn".
      //
      // THE RULE THAT DOES FIRE, and needs no list of languages or words: an
      // ACCENTED INPUT IS EVIDENCE, and the entity must answer it. When the
      // input carries accents and the stored name's accent-preserving fold
      // disagrees, the tier claims only if the entity HOLDS that accented
      // spelling — some active surface, in the document's own locale chain,
      // whose diacriticFold equals the input's. That is the entity saying "I
      // am also called this, in this language", in its own banked data.
      //   - "Café" in an en document still claims the `cafe` attribute: it
      //     banks 'café' as an en surface.
      //   - "phở" in a vi document still claims `pho`: it banks 'phở' (vi).
      //   - "bún" in a vi document does NOT claim `bun`, whose only vi
      //     surfaces are 'bánh mì burger' and 'vỏ bánh burger'. It falls to
      //     tier 2/the judge, exactly as before the identity-key probe.
      // An UNACCENTED input asserts nothing (de-diacritized typing is how
      // most people type Vietnamese on a US keyboard), so the folded key
      // rules there and "pho" == "Phở" is untouched. Names stay
      // locale-UNSCOPED (loc-05): the locale chain scopes the EVIDENCE we
      // consult, never which names are probeable.
      //
      // DISPLAY ROWS COUNT AS EVIDENCE HERE, unlike the recall slice. A
      // display row is the entity's LABEL in that language — 'chả lụa' is
      // the vi label of the entity named 'cha lua' — and a label is the
      // entity asserting its own accented spelling. The recall slice excludes
      // display rows because grounding ON one would resurrect a refused
      // recall claim; here the row is not being grounded on, it is being read
      // as spelling testimony for a claim the identity fold already made.
      // Deprecated rows are remembered-as-wrong and are excluded.
      // Which (owner, input) pairs need evidence? Collected before any query
      // so the lookup is ONE round trip, and skipped entirely — the common,
      // all-ASCII case — when no probe carries an accent.
      const foldProbesFor = (entity: EntityResolutionInput): string[] => {
        const raw = entity.normalizedName.toLowerCase().trim();
        return usesNumberVariants ? [raw, ...itemNameVariants(raw)] : [raw];
      };
      // WHOSE spellings must we go and read? An owner whose stored name
      // already agrees with the probe accent-for-accent proves itself from the
      // row we hold; anyone else may still hold the spelling on a surface, so
      // ask the database once, for all of them, in one round trip. Note there
      // is NO `isAccented(probe)` gate on this loop: under the per-token rule
      // a fully PLAIN probe can also be refused — 'com chay' must not claim
      // 'cơm cháy' when 'chay' is a banked vi word — and the accent-free
      // common case is still free, because an ASCII probe with an ASCII owner
      // name agrees on the line below and asks for nothing.
      const ownersNeedingEvidence = new Set<string>();
      const plainTokensInPlay = new Set<string>();
      for (const entity of entities) {
        for (const probe of foldProbesFor(entity)) {
          const owner = identityToEntityMap.get(canonicalFold(probe));
          if (!owner) continue;
          if (diacriticFold(owner.name) === diacriticFold(probe)) continue;
          ownersNeedingEvidence.add(owner.entityId);
          for (const token of plainTokensOf(probe))
            plainTokensInPlay.add(token);
        }
      }

      const { spellings: accentEvidence, bankedPlainForms } =
        await this.accentSpellingsFor(
          Array.from(ownersNeedingEvidence),
          documentLocale,
          Array.from(plainTokensInPlay),
        );

      const claimByFold = (probe: string): string | undefined => {
        const folded = canonicalFold(probe);
        if (!folded) return undefined;
        const owner = identityToEntityMap.get(folded);
        if (!owner) return undefined;
        // THE ONE ADMISSION RULE (entity-identity.ts), the same call the query
        // gazetteer makes: token by token, an accented token must be answered,
        // a plain token asks nothing unless the registry banks it as a whole
        // word of this language. The entity's own name is evidence #1; its
        // locale-chain surfaces are the rest.
        return admitsAtExactTier(
          { folded, diacritic: diacriticFold(probe) },
          [
            spellingOf(owner.name),
            ...(accentEvidence.get(owner.entityId) ?? []),
          ],
          bankedPlainForms,
        )
          ? owner.entityId
          : undefined;
      };

      return entities.map((entity) => {
        const raw = entity.normalizedName.toLowerCase().trim();
        // Exact spelling wins; the identity fold is next; a number variant is
        // the last fallback, so an input never jumps to a plural twin when
        // its own form exists.
        let entityId = nameToEntityMap.get(raw);
        if (!entityId) {
          entityId = claimByFold(raw);
        }
        if (!entityId && usesNumberVariants) {
          for (const variant of itemNameVariants(raw)) {
            entityId = nameToEntityMap.get(variant) ?? claimByFold(variant);
            if (entityId) break;
          }
        }
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
        engineId: engineId ?? undefined,
        count: entities.length,
      });
      throw error;
    }
  }

  /**
   * WHICH SPELLINGS CAN THESE ENTITIES PROVE THEY HOLD — the one
   * implementation of the accent-evidence read, shared by BOTH tiers that ask
   * the question (tier 1's identity fold, tier 2's surface fold). Returns the
   * folded/accent-preserving spelling pair of every active surface the entity
   * carries in this document's locale chain, plus the banked-plain-forms
   * discriminator the admission rule needs.
   *
   * TWO READINGS OF ONE QUERY, which is how the resolver and the query
   * gazetteer end up on one design (2026-08-12). The gazetteer builds the same
   * two things out of its own grounding query: the raw spellings of everything
   * that matched, and — from the LANGUAGE-TAGGED ('und' excluded) slice — the
   * set of accent-free strings the registry banks as complete words. Here the
   * data source is the document's locale chain (loc-05: the chain scopes the
   * EVIDENCE, never which names are probeable) and the plain-forms set is that
   * chain minus its universal tail. Same rule, same two inputs, one query
   * each: 'und' is the de-diacritized romanization bucket, so a form banked
   * there says nothing about how a word is SPELLED in this language, while a
   * form banked under 'vi' does — which is exactly the difference between
   * 'chay' (a complete vi word) and 'pho' (a romanization of phở).
   *
   * DISPLAY ROWS COUNT AS EVIDENCE HERE, unlike the recall slice. A display row
   * is the entity's LABEL in that language — 'chả lụa' is the vi label of the
   * entity named 'cha lua' — and a label is the entity asserting its own
   * accented spelling. The recall slice excludes display rows because grounding
   * ON one would resurrect a refused recall claim; here the row is not being
   * grounded on, it is being read as spelling testimony for a claim the fold
   * already made. Deprecated rows are remembered-as-wrong and are excluded.
   *
   * One extra query, and only when some probe's spelling disagrees with its
   * owner's — the caller passes an empty list in the common all-ASCII case and
   * no query is issued at all.
   */
  private async accentSpellingsFor(
    entityIds: string[],
    documentLocale: string | null,
    /** Every ACCENT-FREE token appearing in a probe whose owner is being
     *  checked. These are the strings the discriminator has to rule on: is
     *  this a word somebody spelled, or an accent somebody skipped? */
    plainTokens: string[],
  ): Promise<{
    spellings: Map<string, SurfaceSpelling[]>;
    bankedPlainForms: Set<string>;
  }> {
    const spellings = new Map<string, SurfaceSpelling[]>();
    const bankedPlainForms = new Set<string>();
    if (entityIds.length === 0) return { spellings, bankedPlainForms };
    const chain = localeLookupChain(documentLocale);
    // The chain WITHOUT its universal tail. 'und' is the de-diacritized
    // romanization bucket, so a form banked there says nothing about how a
    // word is SPELLED in this language; only a language-tagged row can make a
    // plain string a complete word. A null-locale document has no tagged
    // chain at all, the set comes back empty, and the rule falls back to pure
    // per-token evidence — the conservative side.
    const languageChain = chain.filter((tag) => tag !== 'und');
    const owners = new Set(entityIds);
    const tokens = languageChain.length ? plainTokens : [];
    // Prisma.sql, not a bare $queryRaw template: the locale chain is bound
    // inside a composed fragment, and $queryRaw's own template would bind a
    // fragment as a parameter instead of splicing a predicate.
    const rows = await this.prisma.$queryRaw<
      Array<{ entity_id: string; form: string; locale: string }>
    >(Prisma.sql`
      SELECT s.entity_id, s.form, LOWER(s.locale) AS locale
        FROM entity_surface s
       WHERE s.status = 'active'
         AND (
              (s.entity_id = ANY(${entityIds}::uuid[])
               AND LOWER(s.locale) = ANY(${chain}::text[]))
           OR (LOWER(s.locale) = ANY(${languageChain}::text[])
               AND s.form_folded = ANY(${tokens}::text[]))
         )`);
    for (const row of rows) {
      const spelling = spellingOf(row.form);
      if (owners.has(row.entity_id)) {
        const held = spellings.get(row.entity_id);
        if (held) held.push(spelling);
        else spellings.set(row.entity_id, [spelling]);
      }
      // The accent-complete discriminator: a form banked under the document's
      // OWN language whose accent-preserving spelling is already accent-free
      // is a word someone spelled in full, not an accent anybody skipped.
      // ANY entity may supply it — 'chay' (vegetarian) is banked on the
      // vegetarian attribute, not on the rice dish it protects, so an
      // owner-scoped read would leave the discriminator permanently inert.
      if (
        row.locale !== 'und' &&
        spelling.folded &&
        spelling.folded === spelling.diacritic
      ) {
        bankedPlainForms.add(spelling.folded);
      }
    }
    return { spellings, bankedPlainForms };
  }

  /**
   * TIER 2 — SURFACE MATCHING. A mention grounds at confidence 0.95 when it
   * equals a form some pass has banked on an entity.
   *
   * FOLD-SYMMETRIC (§11 item 4 / I-2, 2026-08-09). This used to be
   * `aliases: { hasSome: [...] }` — a Postgres array overlap, which is BYTE
   * equality. So "santo taco" typed in a review did not match the banked
   * surface "Santo Taco", "despana" did not match "Despaña", and the tier's
   * recall depended on the casing accident of whichever pass banked the form
   * first. The read is now `form_folded = ANY(canonicalFold(...))`: the SAME
   * fold on both sides, written by the one app function that owns it, so case,
   * accents and possessives stop deciding whether a mention grounds. Verified
   * on the live corpus by scripts/search-harness/entity-resolution-gate.ts —
   * ten fixtures flipped from unmatched to correctly grounded, zero near-miss
   * fixtures loosened (the fold is equality, never fuzz).
   *
   * SCOPE: the und/active/non-display recall slice (see recallFormsSql for why
   * each predicate is load-bearing). That is exactly the set the retired
   * `aliases[]` projection contained, so the widening here is the FOLD and
   * nothing else.
   */
  /**
   * IDENTITY AUTHORITY (plans/alias-clean-slate.md item 2) — which surface
   * rows may ROUTE A MENTION. Grade decides, never `source`:
   *   observed — always (a person wrote it about this entity);
   *   judged   — only while its origin verdict's rule is THE RULE IN FORCE
   *              for its lane (the `=` law: forward or back, any other rule
   *              re-opens the question). A rule bump therefore demotes every
   *              judged alias to search-recall-only, silently and instantly,
   *              until the re-hearing re-arms it;
   *   recall   — never. A model's guess about how people type serves search
   *              and nothing else. This single predicate is what ends the
   *              alias ratchet: a stale or unledgered claim can still be
   *              FOUND (search), but it can no longer DECIDE (identity).
   */
  private async performAliasMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    engineId: string | null,
    documentLocale: string | null,
    rehearsalRunId: string | null,
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

    // Fold BOTH sides with the one implementation (the fold law): the probe
    // set here, `form_folded` in the table.
    const foldedProbes = Array.from(
      new Set(allAliases.map((alias) => canonicalFold(alias)).filter(Boolean)),
    );
    if (foldedProbes.length === 0) {
      return entities.map((entity) => ({
        tempId: entity.tempId,
        entityId: null,
        confidence: 0.0,
        resolutionTier: 'unmatched' as const,
        originalInput: entity,
      }));
    }

    try {
      // Archived excluded — same contract as the exact tier: only live
      // entities are matchable. One round trip: the matching entities AND
      // every recall form they carry, so the in-memory ranking below never
      // needs a second query.
      // Prisma.sql, not a bare tagged template: the scope/grade predicates
      // are SQL FRAGMENTS, and $queryRaw's own template turns every
      // interpolation into a bind parameter — a fragment would arrive as a
      // parameter object instead of a predicate.
      // IDENTITY-GRADE FORMS ONLY (identityGradeSql): this tier routes
      // mentions, so recall-grade guesses are invisible to it — they still
      // serve search, the judge's candidate recall, and autocomplete, but
      // they no longer claim a mention at 0.95 with the judge never asked.
      // REHEARSAL ENTITIES follow Tier 1's law (shadow-sandbox): visible
      // only to their own run — this predicate was missing here, so a
      // foreign shadow mint was alias-matchable by live runs.
      const rehearsalEntitySql = rehearsalRunId
        ? Prisma.sql`AND (e.status <> 'rehearsal'::entity_status
                       OR e.born_extraction_run_id = ${rehearsalRunId}::uuid)`
        : Prisma.sql`AND e.status <> 'rehearsal'::entity_status`;
      const surfaceRows = await this.prisma.$queryRaw<
        Array<{ entity_id: string; name: string; forms: string[] }>
      >(Prisma.sql`
        SELECT e.entity_id, e.name,
               array_agg(s.form) AS forms
          FROM core_entities e
          JOIN entity_surface s ON s.entity_id = e.entity_id
         WHERE e.type = ${entityType}::entity_type
           AND e.status <> 'archived'::entity_status
           ${rehearsalEntitySql}
           AND ${recallScope(documentLocale)}
           AND ${identityGradeSql()}
           AND EXISTS (
             SELECT 1 FROM entity_surface m
              WHERE m.entity_id = e.entity_id
                AND ${recallScope(documentLocale, 'm')}
                AND ${identityGradeSql('m')}
                AND m.form_folded = ANY(${foldedProbes}::text[])
           )
         GROUP BY e.entity_id, e.name`);

      const matchedEntities = surfaceRows.map((row) => ({
        entityId: row.entity_id,
        name: row.name,
        aliases: row.forms ?? [],
      }));

      // ACCENT EVIDENCE ON THE SURFACE FOLD (2026-08-12) — the same rule tier 1
      // got, one tier down, because the hole was the same hole.
      //
      // `form_folded` IS canonicalFold, so this tier is accent-BLIND by
      // construction: the moment tier 1 refused "bún" the surface read handed
      // it straight back to the English bread `bun` at 0.95, and the acc-01/02
      // fixtures recorded exactly that residue. A guard that only moves a wrong
      // claim from confidence 1.0 to confidence 0.95 has not refused anything.
      //
      // THE RULE, identical in shape and in language-neutrality: an ACCENTED
      // INPUT IS EVIDENCE, and the entity must answer it. When the input
      // carries accents, a candidate may only be claimed through a surface
      // whose accents AGREE (diacriticFold equality) — or, failing that, by
      // proving it holds that accented spelling somewhere in the document's
      // locale chain (`accentEvidenceFor`, display rows included). An
      // unaccented input asserts nothing, so the fold still rules there and
      // de-diacritized typing is untouched: "pho" still reaches the banked
      // "phở".
      //
      // A REFUSED CANDIDATE IS NOT A REFUSED MENTION. Only this candidate's
      // claim dies; another candidate that DOES agree on accents still wins the
      // mention, and if none does the mention falls through to the judge/new
      // exactly as an unmatched surface always has. Nothing is silently
      // claimed, nothing is silently dropped.
      const aliasProbesOf = (entity: EntityResolutionInput): string[] =>
        [entity.normalizedName, entity.originalText, ...(entity.aliases ?? [])]
          .filter((term): term is string => typeof term === 'string')
          .map((term) => term.trim())
          .filter((term) => term.length > 0);

      // The candidate's own matching forms are evidence #1, exactly as the
      // entity's name is at tier 1.
      const spellingsOfCandidate = (candidate: {
        aliases: string[];
      }): SurfaceSpelling[] =>
        candidate.aliases.map((form) => spellingOf(form));

      const wholeStringAgrees = (
        candidate: { aliases: string[] },
        term: string,
      ): boolean => {
        const folded = canonicalFold(term);
        const dia = diacriticFold(term);
        return candidate.aliases.some(
          (form) =>
            canonicalFold(form) === folded && diacriticFold(form) === dia,
        );
      };

      // No `isAccented(term)` gate, for the tier-1 reason: under the per-token
      // rule a plain term can also be refused when the registry banks that
      // exact string as a word of this language. A candidate that already
      // agrees on the WHOLE string needs nothing read — whole agreement admits
      // under any per-token reading — so the all-ASCII case still issues no
      // query at all.
      const candidatesNeedingEvidence = new Set<string>();
      const plainTokensInPlay = new Set<string>();
      for (const entity of entities) {
        for (const term of aliasProbesOf(entity)) {
          const folded = canonicalFold(term);
          for (const candidate of matchedEntities) {
            // Only candidates this term could actually claim, and only those
            // whose own matching forms do NOT already agree on accents — the
            // agreeing ones are proven by the rows we already hold.
            const overlaps = candidate.aliases.some(
              (form) => canonicalFold(form) === folded,
            );
            if (!overlaps) continue;
            if (wholeStringAgrees(candidate, term)) continue;
            candidatesNeedingEvidence.add(candidate.entityId);
            for (const token of plainTokensOf(term))
              plainTokensInPlay.add(token);
          }
        }
      }
      const { spellings: accentEvidence, bankedPlainForms } =
        await this.accentSpellingsFor(
          Array.from(candidatesNeedingEvidence),
          documentLocale,
          Array.from(plainTokensInPlay),
        );

      const accentAdmits = (
        candidate: { entityId: string; aliases: string[] },
        term: string,
      ): boolean =>
        admitsAtExactTier(
          { folded: canonicalFold(term), diacritic: diacriticFold(term) },
          [
            ...spellingsOfCandidate(candidate),
            ...(accentEvidence.get(candidate.entityId) ?? []),
          ],
          bankedPlainForms,
        );

      return entities.map((entity) => {
        const matchedEntity = this.selectBestAliasMatch(
          entity,
          matchedEntities,
          accentAdmits,
        );

        // The trace records the surface spelling that carried the claim —
        // the first of the candidate's forms sharing a probe fold.
        const probeFolds = new Set(
          aliasProbesOf(entity)
            .map((term) => canonicalFold(term))
            .filter(Boolean),
        );
        const matchedForm = matchedEntity?.aliases.find((form) =>
          probeFolds.has(canonicalFold(form)),
        );

        return {
          tempId: entity.tempId,
          entityId: matchedEntity?.entityId || null,
          confidence: matchedEntity ? 0.95 : 0.0,
          resolutionTier: matchedEntity ? 'alias' : 'unmatched',
          matchedName: matchedEntity?.name,
          ...(matchedEntity
            ? { matchedVia: { tier: 'alias', form: matchedForm } }
            : {}),
          originalInput: entity,
        };
      });
    } catch (error) {
      this.logger.error('Surface match query failed', {
        error: error instanceof Error ? error.message : String(error),
        entityType,
        engineId: engineId ?? undefined,
        count: entities.length,
      });
      throw error;
    }
  }

  /**
   * TIER 2.5 — JOINED-IDENTITY CLAIM (2026-08-11, the space/join twin class).
   *
   * `canonicalFold` maps every punctuation/separator run to ONE SPACE, so
   * spellings that JOIN or SPLIT words produce DIFFERENT folds: "Pulltab
   * Coffee" -> `pulltab coffee` vs "Pull-tab Coffee" -> `pull tab coffee`;
   * "ChiCha San Chen" -> `chicha san chen` vs "Chi Cha San Chen" ->
   * `chi cha san chen`; "Honeymoon Spiritlounge" vs "Honey Moon Spirit
   * Lounge". Neither the exact tier (identity_key) nor the surface tier
   * (form_folded) can see through that, and in the v7 shadow replay the
   * fail-closed judge minted duplicates for exactly these. Spacing is a
   * spelling accident, not identity — but ERASING spaces is a lossy fold, so
   * this tier claims only under two guards, both language-neutral:
   *
   *   1. NO ACCENT EVIDENCE ON EITHER SIDE. `diacriticFold(x) !==
   *      canonicalFold(x)` is precisely "x carries an accent" (the invariant
   *      documented on diacriticFold). Vietnamese "bò né" folds to `bo ne`
   *      and squeezes to `bone` — a REAL collision with the English word —
   *      and tone marks are phonemic, so an accent-bearing form never enters
   *      a squeezed claim in either direction. It falls to the LLM judge,
   *      exactly as before this tier existed.
   *   2. EXACTLY ONE candidate entity shares the squeezed key. Two owners of
   *      one squeezed key is ambiguity; ambiguity is the judge's job.
   *
   * The SQL side squeezes with `replace(x, ' ', '')`. That is NOT a fold
   * expression in the sense the fold law forbids: both inputs
   * (`identity_key`, `form_folded`) are APP-WRITTEN by canonicalFold, whose
   * output separator is by construction a single ASCII space, and replacing
   * a literal ASCII byte is platform-independent — no Unicode character
   * class is evaluated in the database.
   *
   * Results carry tier 'alias' at 0.95: the claim is a deterministic
   * surface-identity fact of the same species the surface tier asserts, and
   * the metro gate must treat it as demotable (never as an exact name that
   * can travel across the country).
   */
  private async performJoinedIdentityMatches(
    entities: EntityResolutionInput[],
    entityType: EntityType,
    engineId: string | null,
    documentLocale: string | null,
    rehearsalRunId: string | null,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    // The one accent-evidence predicate, from the module that owns the folds.
    const accentFree = (value: string): boolean => !isAccented(value);
    const squeeze = (value: string): string =>
      canonicalFold(value).replace(/ /g, '');

    // Probe with the same term set the surface tier uses — but only forms
    // that carry no accent evidence (guard 1, input side).
    const probesByTempId = new Map<string, string[]>();
    const allSqueezed = new Set<string>();
    for (const entity of entities) {
      const terms = [
        entity.normalizedName,
        entity.originalText,
        ...(entity.aliases || []),
      ].filter(
        (term): term is string =>
          typeof term === 'string' && term.trim().length > 0,
      );
      const squeezed = Array.from(
        new Set(
          terms
            .filter((term) => accentFree(term))
            .map((term) => squeeze(term))
            .filter((key) => key.length > 0),
        ),
      );
      probesByTempId.set(entity.tempId, squeezed);
      squeezed.forEach((key) => allSqueezed.add(key));
    }

    const unmatchedFor = (
      entity: EntityResolutionInput,
    ): EntityResolutionResult => ({
      tempId: entity.tempId,
      entityId: null,
      confidence: 0.0,
      resolutionTier: 'unmatched',
      originalInput: entity,
    });
    if (allSqueezed.size === 0) {
      return entities.map(unmatchedFor);
    }
    const probeArray = Array.from(allSqueezed);

    try {
      // Two arms, one squeezed key space: the entity's own NAME (via its
      // app-written identity_key — an entity need not have banked a surface
      // row to be claimable by its name) and its recall surfaces (same
      // scope predicates as the surface tier). `form` is returned so the
      // accent guard can be applied to the exact stored spelling app-side —
      // the fold law keeps every fold comparison in the app.
      const rows = await this.prisma.$queryRaw<
        Array<{ entity_id: string; name: string; form: string; key: string }>
      >(Prisma.sql`
        SELECT e.entity_id, e.name, e.name AS form,
               replace(e.identity_key, ' ', '') AS key
          FROM core_entities e
         WHERE e.type = ${entityType}::entity_type
           AND e.status <> 'archived'::entity_status
           AND (e.status <> 'rehearsal'::entity_status
                OR e.born_extraction_run_id = ${rehearsalRunId}::uuid)
           AND e.identity_key IS NOT NULL
           AND replace(e.identity_key, ' ', '') = ANY(${probeArray}::text[])
        UNION
        SELECT e.entity_id, e.name, s.form,
               replace(s.form_folded, ' ', '') AS key
          FROM core_entities e
          JOIN entity_surface s ON s.entity_id = e.entity_id
         WHERE e.type = ${entityType}::entity_type
           AND e.status <> 'archived'::entity_status
           AND (e.status <> 'rehearsal'::entity_status
                OR e.born_extraction_run_id = ${rehearsalRunId}::uuid)
           AND ${recallScope(documentLocale)}
           -- A joined-spelling claim is an IDENTITY claim, same as Tier 2:
           -- only identity-grade forms may make it.
           AND ${identityGradeSql()}
           AND replace(s.form_folded, ' ', '') = ANY(${probeArray}::text[])`);

      // Per squeezed key: the distinct owning entities, and whether ANY
      // matching stored form carries accent evidence (guard 1, stored side —
      // one accented owner poisons the key for deterministic claiming, even
      // if an accent-free owner also exists: the ambiguity is real).
      const byKey = new Map<
        string,
        { owners: Map<string, string>; accented: boolean }
      >();
      for (const row of rows) {
        let slot = byKey.get(row.key);
        if (!slot) {
          slot = { owners: new Map(), accented: false };
          byKey.set(row.key, slot);
        }
        slot.owners.set(row.entity_id, row.name);
        if (!accentFree(row.form)) {
          slot.accented = true;
        }
      }

      return entities.map((entity) => {
        for (const key of probesByTempId.get(entity.tempId) ?? []) {
          const slot = byKey.get(key);
          if (!slot || slot.accented || slot.owners.size !== 1) {
            continue; // guard failed — the judge inherits the question
          }
          const [entityId, name] = slot.owners.entries().next().value as [
            string,
            string,
          ];
          this.logger.info('joined_identity_claimed', {
            entityType,
            engineId: engineId ?? undefined,
            term: entity.normalizedName,
            matchedName: name,
            squeezedKey: key,
          });
          return {
            tempId: entity.tempId,
            entityId,
            confidence: 0.95,
            resolutionTier: 'alias' as const,
            matchedName: name,
            matchedVia: { tier: 'joined-identity', form: name },
            originalInput: entity,
          };
        }
        return unmatchedFor(entity);
      });
    } catch (error) {
      this.logger.error('Joined-identity match query failed', {
        error: error instanceof Error ? error.message : String(error),
        entityType,
        engineId: engineId ?? undefined,
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
    engineId: string | null,
    documentLocale: string | null,
    rehearsalRunId: string | null,
  ): Promise<EntityResolutionResult[]> {
    if (entities.length === 0) return [];

    const kind: 'place' | 'item' | 'ingredient' =
      entityType === 'place'
        ? 'place'
        : entityType === 'ingredient'
          ? 'ingredient'
          : 'item';
    const unmatchedFor = (
      entity: EntityResolutionInput,
    ): EntityResolutionResult => ({
      tempId: entity.tempId,
      entityId: null,
      confidence: 0.0,
      resolutionTier: 'unmatched',
      originalInput: entity,
    });

    // TOMBSTONE PRE-SINK (the reject verdict's memory, 2026-08-30): a term
    // the judge already REJECTED lives on as an archived row with NO merge
    // redirect (a redirect means merge-loser, never junk). Repeat mentions
    // resolve onto the tombstone BEFORE recall runs, so a judged reject is
    // free forever — the same absorption the attribute vocabulary has had
    // all along (markEntitiesForCreation's attribute sink). Rehearsal runs
    // sink too: the tombstone is inert either way.
    //
    // ACTIVE-TWIN STANDDOWN (red-team F1, 2026-08-30): a pre-sink hit is
    // lawful ONLY when no live entity shares the fold. If an active (or
    // pending — matchable) row exists alongside the tombstone — a term
    // rejected in one era, legitimately minted in another, or the same
    // surface naming both junk and a real thing (junk "best" vs a real bar
    // named "Best") — the mention MUST reach recall and the judge; the
    // judge separates the readings, and only a fresh reject sinks it. A
    // tombstone that absorbs mentions ahead of a live twin permanently
    // silences the real entity — the exact failure the reject asymmetry
    // exists to prevent. The NOT EXISTS below is index-backed
    // (idx_entities_type_identity_key). Rehearsal-status rows do not stand
    // the sink down: shadow mints must not change live behavior.
    const tombstoneByFold = new Map<string, { entityId: string }>();
    {
      const folds = Array.from(
        new Set(
          entities
            .map((e) => canonicalFold(e.normalizedName?.trim() ?? ''))
            .filter((f) => f.length > 0),
        ),
      );
      if (folds.length) {
        // Two arms, one standdown law. Arm 1: the tombstone's own name key
        // (the original reject sink). Arm 2 — CLOSED-PLACE STANDDOWN
        // (plans/alias-clean-slate.md item 4): an archived redirect-free
        // entity also absorbs mentions matching its OBSERVED spellings. A
        // real place that closed (janitor-archived after Google reported it
        // gone) still owns its name: "mandala" must sink into the archived
        // Mandala Kitchen — hidden from search, mention absorbed — rather
        // than mint a duplicate or drift to the nearest look-alike
        // spelling. Observed grade only: a judged/recall alias on a dead
        // entity is not the dead entity's name. The active-twin standdown
        // applies to both arms per FOLD: any live entity holding the fold
        // as its identity key stands the sink down and the judge decides.
        const rows = await this.prisma.$queryRaw<
          Array<{ entity_id: string; fold: string }>
        >(Prisma.sql`
          SELECT x.entity_id, x.fold FROM (
            SELECT e.entity_id, e.identity_key AS fold
              FROM core_entities e
             WHERE e.type = ${entityType}::entity_type
               AND e.status = 'archived'
               -- A REJECT TOMBSTONE IS A LIVE JUDGMENT, NEVER A REJECTED
               -- SHADOW'S RESIDUE (red team 2026-09-04 T1-1): a shadow
               -- that was rejected archives its mints WITH their born run
               -- id (rehearsal-generation.reject), and the flip path
               -- already tells the two apart by exactly this column. A
               -- sink that ignored it made every name a rejected shadow
               -- coined first a permanent black hole for live mentions.
               AND e.born_extraction_run_id IS NULL
               AND e.identity_key = ANY(${folds}::text[])
            UNION
            SELECT e.entity_id, s.form_folded AS fold
              FROM core_entities e
              JOIN entity_surface s ON s.entity_id = e.entity_id
             WHERE e.type = ${entityType}::entity_type
               AND e.status = 'archived'
               AND e.born_extraction_run_id IS NULL
               AND s.claim_grade = 'observed'
               AND s.status IN ('active', 'deprecated')
               AND s.form_folded = ANY(${folds}::text[])
          ) x
           WHERE NOT EXISTS (
               SELECT 1 FROM entity_redirects r
                WHERE r.from_entity_id = x.entity_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM core_entities live
                WHERE live.type = ${entityType}::entity_type
                  AND live.identity_key = x.fold
                  AND live.status IN ('active', 'pending')
             )
           -- Deterministic ownership: without an order, the winning
           -- tombstone for a shared fold could flip between batches.
           ORDER BY x.fold, x.entity_id`);
        for (const row of rows) {
          // First owner wins deterministically enough for a sink; two
          // archived owners of one fold is a wipe-era edge the clean slate
          // removes.
          if (!tombstoneByFold.has(row.fold)) {
            tombstoneByFold.set(row.fold, { entityId: row.entity_id });
          }
        }
      }
    }
    const sunk = new Map<string, EntityResolutionResult>();
    const stillLive: EntityResolutionInput[] = [];
    for (const entity of entities) {
      const fold = canonicalFold(entity.normalizedName?.trim() ?? '');
      const tombstone = fold ? tombstoneByFold.get(fold) : undefined;
      if (tombstone) {
        sunk.set(entity.tempId, {
          tempId: entity.tempId,
          entityId: tombstone.entityId,
          confidence: 1.0,
          resolutionTier: 'exact',
          matchedName: entity.normalizedName,
          matchedVia: { tier: 'tombstone-sink' },
          originalInput: entity,
          isNewEntity: false,
        });
        this.logger.info('entity_match_reject_tombstone_sink', {
          entityType,
          term: entity.normalizedName,
          tombstoneId: tombstone.entityId,
        });
      } else {
        stillLive.push(entity);
      }
    }

    // Recall for every term first (shared lexical+dense core, type+market
    // scoped) — recall stays per-term concurrent; only the JUDGE is batched.
    const recalls = await this.mapLimit(
      stillLive,
      EntityResolutionService.LLM_MATCHER_CONCURRENCY,
      async (entity) => {
        const term = entity.normalizedName?.trim() ?? '';
        if (!term) return { entity, term, candidates: [] as RecallCandidate[] };
        const candidates = await this.entityTextSearch.retrieveCandidates(
          term,
          [entityType],
          EntityResolutionService.LLM_MATCHER_SHORTLIST_K,
          {
            engineId,
            denseMode: 'always',
            // THE DOCUMENT'S LANGUAGE OPENS THE LOCALIZED-SURFACE LANE.
            // Without it this recall could only ever see und rows, so a
            // Spanish document's mention could never reach the es surfaces
            // the same corpus banked — the judge would be shown an English-
            // only shortlist and correctly answer 'new', minting a duplicate
            // concept per language. null (locale-less callers) behaves
            // exactly as before: the lane does not run.
            requestLocale: documentLocale,
          },
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
      ? await this.prisma.$queryRaw<
          Array<{ entity_id: string; forms: string[] }>
        >(Prisma.sql`
          SELECT s.entity_id, array_agg(s.form) AS forms
            FROM entity_surface s
           WHERE s.entity_id = ANY(${candidateIds}::uuid[])
             AND ${recallScope(documentLocale)}
           GROUP BY s.entity_id`)
      : [];
    const aliasesById = new Map(
      aliasRows.map((r) => [r.entity_id, r.forms ?? []]),
    );

    // Candidate HOME RESTAURANTS in one round-trip (D2 context standard —
    // the OTOKO rule made mechanical). Items live in connections directly;
    // ingredients appear inside connections' evidence arrays. Places need
    // none: they ARE the home. Top homes by mention weight, capped at the
    // wire's home-place bound.
    const homesById = new Map<string, string[]>();
    if (candidateIds.length && entityType !== 'place') {
      const homeRows =
        entityType === 'item'
          ? await this.prisma.$queryRaw<
              Array<{ entity_id: string; homes: string[] }>
            >(Prisma.sql`
              SELECT c.food_id AS entity_id,
                     (array_agg(r.name ORDER BY c.mention_count DESC))[1:3]
                       AS homes
                FROM core_restaurant_items c
                JOIN core_entities r ON r.entity_id = c.restaurant_id
               WHERE c.food_id = ANY(${candidateIds}::uuid[])
               GROUP BY c.food_id`)
          : await this.prisma.$queryRaw<
              Array<{ entity_id: string; homes: string[] }>
            >(Prisma.sql`
              SELECT i.ingredient_id AS entity_id,
                     (array_agg(DISTINCT r.name))[1:3] AS homes
                FROM (
                  SELECT unnest(c.ingredients) AS ingredient_id,
                         c.restaurant_id
                    FROM core_restaurant_items c
                ) i
                JOIN core_entities r ON r.entity_id = i.restaurant_id
               WHERE i.ingredient_id = ANY(${candidateIds}::uuid[])
               GROUP BY i.ingredient_id`);
      for (const row of homeRows) {
        homesById.set(row.entity_id, row.homes ?? []);
      }
    }
    const samePlaceFor = (
      mentionPlace: string | null | undefined,
      homes: string[],
    ): boolean | undefined => {
      const anchor = canonicalFold(mentionPlace?.trim() ?? '');
      if (!anchor) return undefined;
      return homes.some((home) => canonicalFold(home) === anchor);
    };

    // THE HEARING LEDGER'S MEMORY, before any judge is paid (2026-08-13).
    // Every (term, candidate) pair the shortlist proposes is a claim the
    // entity-match lane may have ALREADY decided at the rule version in force
    // (the same canonical entity-match rule the dedupe lane fingerprints —
    // both transports render prompts/entity-match-prompt.md, so
    // ENTITY_DEDUPE_RULE_VERSION is this judge's rule version too, not a
    // borrowed number). A remembered 'match' resolves on the spot; a
    // remembered 'new' strikes that candidate from the docket — and a term
    // whose whole shortlist is struck never reaches the LLM at all, which is
    // the point: this fail-closed judge re-rolled its expensive "no"s on
    // every re-mention forever.
    const pairClaim = (term: string, candidateEntityId: string) =>
      ({ kind, term, candidateEntityId }) satisfies EntityMatchClaim;
    const judgeable = recalls.filter((r) => r.candidates.length > 0);
    const remembered = await this.claimLedger.decidedVerdicts(
      ENTITY_MATCH_LANE,
      ENTITY_DEDUPE_RULE_VERSION,
      entityMatchLane.keyFoldVersion,
      judgeable.flatMap((r) =>
        r.candidates.map((c) =>
          entityMatchLane.canonicalClaimKey(pairClaim(r.term, c.entityId)),
        ),
      ),
      { rehearsalRunId },
    );
    const priorOf = (
      term: string,
      candidateEntityId: string,
    ): { outcome: string; reason: string } | undefined =>
      remembered.get(
        entityMatchLane.canonicalClaimKey(pairClaim(term, candidateEntityId)),
      );

    const resolvedFromMemory = new Map<string, RecallCandidate>();
    const stillDue: Array<{
      entity: EntityResolutionInput;
      term: string;
      candidates: RecallCandidate[];
      /** The shortlist actually shown to the judge — remembered-'new'
       *  candidates struck; indexes into THIS array come back as ids. */
      shown: RecallCandidate[];
    }> = [];
    for (const r of judgeable) {
      const rememberedMatch = r.candidates.find(
        (c) => priorOf(r.term, c.entityId)?.outcome === 'match',
      );
      if (rememberedMatch) {
        resolvedFromMemory.set(r.entity.tempId, rememberedMatch);
        this.logger.info('entity_match_verdict_remembered', {
          entityType,
          term: r.term,
          matchedEntityId: rememberedMatch.entityId,
          outcome: 'match',
        });
        continue;
      }
      const shown = r.candidates.filter(
        (c) => priorOf(r.term, c.entityId)?.outcome !== 'new',
      );
      if (!shown.length) {
        // Every candidate carries a judged 'new' — the whole question is
        // settled and the term falls through to creation without a hearing.
        this.logger.info('entity_match_verdict_remembered', {
          entityType,
          term: r.term,
          outcome: 'new',
          struckCandidates: r.candidates.length,
        });
        continue;
      }
      stillDue.push({ ...r, shown });
    }

    // Batched judge: ~10 (term, shortlist) items per request, items delimited
    // per-index, each failing closed to 'new' independently. Cuts request count
    // ~10x under the reservation-based rate budget (archive-load critical).
    const BATCH = 10;
    const chunks: (typeof stillDue)[] = [];
    for (let i = 0; i < stillDue.length; i += BATCH) {
      chunks.push(stillDue.slice(i, i + BATCH));
    }
    const verdictByTempId = new Map<
      string,
      {
        decision: 'match' | 'new' | 'reject';
        candidate: RecallCandidate | null;
      }
    >();
    // 4 concurrent judge requests: uncalibrated rate-limit-friendly bound;
    // total judge latency = ceil(chunks/4) round-trips, any small value works.
    await this.mapLimit(chunks, 4, async (chunk) => {
      const verdicts = await this.llmService.matchEntitiesBatch({
        kind,
        items: chunk.map((r) => ({
          term: r.term,
          // D2 context standard: the verbatim mention + thread restaurant.
          mention: r.entity.mentionQuote ?? null,
          threadPlace: r.entity.mentionPlace ?? null,
          candidates: r.shown.map((c, i) => {
            const homes = homesById.get(c.entityId) ?? [];
            return {
              id: i,
              name: c.name,
              aliases: aliasesById.get(c.entityId) ?? undefined,
              ...(homes.length ? { homePlaces: homes } : {}),
              ...(homes.length
                ? {
                    samePlace: samePlaceFor(r.entity.mentionPlace, homes),
                  }
                : {}),
            };
          }),
        })),
      });
      for (let i = 0; i < chunk.length; i += 1) {
        const r = chunk[i];
        const verdict = verdicts[i];
        const matched =
          verdict &&
          verdict.decision === 'match' &&
          verdict.candidateId !== null
            ? (r.shown[verdict.candidateId] ?? null)
            : null;
        const decision: 'match' | 'new' | 'reject' = matched
          ? 'match'
          : verdict?.decision === 'reject'
            ? 'reject'
            : 'new';
        verdictByTempId.set(r.entity.tempId, {
          decision,
          candidate: matched,
        });
        // A reject is a TERM-level ruling, not a pair ruling — its durable
        // memory is the tombstone row the sink below writes, so it is
        // deliberately NOT recorded in the pair-keyed entity_match lane.
        if (decision !== 'reject') {
          await this.recordEntityMatchVerdicts(
            r.term,
            r.shown,
            {
              matched,
              reason: verdict?.reason?.trim() ?? '',
              kind,
            },
            rehearsalRunId,
          );
        }
      }
    });

    // REJECTED TERMS become archived TOMBSTONES: junk ("5 piece", "clay",
    // "South Lamar Location") must stop minting entities — the judge's own
    // reasons have called these garbage all along while `new` was the only
    // non-match verdict (judge-ledger audit, top failure pattern #1). The
    // mention resolves onto the tombstone (refs are inert: read surfaces and
    // match tiers are active/pending-only) and the pre-sink above absorbs
    // every future occurrence for free. Rehearsal runs do NOT mint live
    // tombstones (shadow isolation) — their rejects fall through to the
    // quarantined creation path exactly as before.
    const rejectResults = new Map<string, EntityResolutionResult>();
    for (const r of stillDue) {
      if (verdictByTempId.get(r.entity.tempId)?.decision !== 'reject') {
        continue;
      }
      if (rehearsalRunId) continue;
      const tombstoneId = await this.ensureRejectTombstone(
        r.entity.normalizedName,
        entityType,
      );
      if (!tombstoneId) continue;
      rejectResults.set(r.entity.tempId, {
        tempId: r.entity.tempId,
        entityId: tombstoneId,
        confidence: 1.0,
        resolutionTier: 'fuzzy',
        matchedName: r.entity.normalizedName,
        // The trace must say a REJECT happened, not look like a judge match
        // (red team 2026-09-03 #8d).
        matchedVia: { tier: 'fuzzy:reject-tombstoned' },
        originalInput: r.entity,
        isNewEntity: false,
      });
      this.logger.info('entity_match_rejected_term_tombstoned', {
        entityType,
        term: r.entity.normalizedName,
        tombstoneId,
      });
    }

    const judged = recalls.map(
      ({ entity, candidates }): EntityResolutionResult => {
        const rejected = rejectResults.get(entity.tempId);
        if (rejected) return rejected;
        const matched =
          resolvedFromMemory.get(entity.tempId) ??
          verdictByTempId.get(entity.tempId)?.candidate ??
          null;
        if (
          !matched ||
          !candidates.some((c) => c.entityId === matched.entityId)
        ) {
          return unmatchedFor(entity);
        }
        return {
          tempId: entity.tempId,
          entityId: matched.entityId,
          confidence: 1.0,
          resolutionTier: 'fuzzy',
          matchedName: matched.name,
          matchedVia: {
            tier: resolvedFromMemory.has(entity.tempId)
              ? 'fuzzy:remembered'
              : 'fuzzy:judge',
            claimKey: entityMatchLane.canonicalClaimKey({
              kind,
              term: entity.normalizedName,
              candidateEntityId: matched.entityId,
            }),
          },
          originalInput: entity,
        };
      },
    );
    return [...sunk.values(), ...judged];
  }

  /**
   * Find-or-create the archived tombstone a rejected term sinks into.
   *
   * Takes the SAME advisory xact lock the entity creator takes
   * (identityMergeLockKey over entityLockKey — the one 'entity:' lock
   * namespace), so a concurrent batch rejecting the same junk cannot mint
   * twin tombstones and a concurrent CREATE of the same identity is
   * serialized against the mint. This matters because the schema's only
   * identity-key unique (`uq_attribute_identity_key`) is an attributes-only
   * partial — for items/ingredients nothing at the storage layer stops
   * twins, so the lock is the whole race protection (red-team F1).
   *
   * Under the lock:
   *   - an ACTIVE/PENDING same-fold row exists → stand down (return null).
   *     The live entity wins; a tombstone minted beside a live twin is the
   *     pre-sink silencing bug waiting to happen. The term falls through to
   *     quarantined creation, exactly the pre-tombstone behavior.
   *   - an archived non-redirected same-fold row exists → adopt it.
   *   - otherwise → mint the tombstone.
   *
   * Only a genuine unique collision (P2002 — attribute partial unique) is
   * absorbed (adopt-or-stand-down probe); every other storage error
   * rethrows — a connection loss must not be silently converted into a
   * verdict reroute (red-team G3).
   */
  private async ensureRejectTombstone(
    name: string,
    entityType: EntityType,
  ): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const fold = canonicalFold(trimmed);
    if (!fold) return null;
    const adoptableTombstoneSql = Prisma.sql`
      SELECT e.entity_id
        FROM core_entities e
       WHERE e.type = ${entityType}::entity_type
         AND e.status = 'archived'
         AND e.identity_key = ${fold}
         AND NOT EXISTS (
           SELECT 1 FROM entity_redirects r
            WHERE r.from_entity_id = e.entity_id
         )
       LIMIT 1`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identityMergeLockKey(entityType, entityLockKey(trimmed, entityType))}))`;
        const liveTwin = await tx.$queryRaw<Array<{ entity_id: string }>>(
          Prisma.sql`
            SELECT e.entity_id
              FROM core_entities e
             WHERE e.type = ${entityType}::entity_type
               AND e.status IN ('active', 'pending')
               AND e.identity_key = ${fold}
             LIMIT 1`,
        );
        if (liveTwin.length) {
          this.logger.info('entity_match_reject_tombstone_standdown', {
            entityType,
            term: trimmed,
            liveTwinId: liveTwin[0].entity_id,
          });
          return null;
        }
        const adoptable = await tx.$queryRaw<Array<{ entity_id: string }>>(
          adoptableTombstoneSql,
        );
        if (adoptable.length) return adoptable[0].entity_id;
        const identity = identityInsertData(trimmed, entityType);
        const created = await tx.entity.create({
          data: {
            name: trimmed,
            type: entityType,
            status: EntityStatus.archived,
            identityKey: identity.identityKey,
            identityKeySorted: identity.identityKeySorted,
            foldVersion: identity.foldVersion,
          },
          select: { entityId: true },
        });
        return created.entityId;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Real unique collision (attribute partial unique): adopt an
        // existing archived non-redirected twin if one exists; otherwise
        // stand down.
        const rows = await this.prisma.$queryRaw<Array<{ entity_id: string }>>(
          adoptableTombstoneSql,
        );
        return rows[0]?.entity_id ?? null;
      }
      throw error;
    }
  }

  /**
   * BANK WHAT THE JUDGE SAID — the entity-match lane's verdict memory
   * (hearing-ledger adoption, 2026-08-13).
   *
   * VERDICT-MEMORY-ONLY, deliberately, and here is the argument against the
   * wave-1 contracts rather than around them: the wave-1 shape stores an
   * ABSOLUTE effect so a crash between verdict and effect can be resumed.
   * This lane's "effect" is the RESOLUTION RESULT ITSELF — a value the caller
   * consumes synchronously in the same pass (the mention resolves to the
   * candidate, or falls through to creation) — and the caller's own pipeline
   * owns everything durable that follows. There is no corpus mutation this
   * lane orders, so there is nothing a resume could replay: a crash before
   * the caller consumed the verdict re-runs the whole resolution, which now
   * finds the verdict REMEMBERED and re-derives the same result without
   * paying the judge — that re-read IS this lane's resume path. `executed_at`
   * is therefore stamped at record time (the effect demonstrably happened:
   * the verdict was handed to the caller), exactly as the pre-ledger backfill
   * stamps rows whose effect already exists, so `pendingExecution` can never
   * hand this lane's subjects to a replayer that has nothing to do.
   *
   * WHAT IS RECORDED, per amendment (d): only verdicts with a stated ground.
   * matchEntitiesBatch fails CLOSED to a reasonless 'new', so an outage
   * records nothing and the question stays open — the same doctrine as the
   * dedupe lane.
   *   - decision 'match' on candidate X: ONE verdict, (term, X) = 'match'.
   *     The other shown candidates were not ruled on — the judge picked the
   *     best answer, it did not assert the rest are strangers — so they stay
   *     unheard.
   *   - decision 'new': the judge looked at EVERY shown candidate and said
   *     "none of these" — one 'new' verdict per shown pair, which is what
   *     lets a fully-judged shortlist skip the LLM next time.
   */
  private async recordEntityMatchVerdicts(
    term: string,
    shown: readonly RecallCandidate[],
    verdict: {
      matched: RecallCandidate | null;
      reason: string;
      kind: EntityMatchClaim['kind'];
    },
    rehearsalRunId: string | null,
  ): Promise<void> {
    if (!verdict.reason) return;
    const judged = verdict.matched ? [verdict.matched] : shown;
    const outcome = verdict.matched ? 'match' : 'new';
    for (const candidate of judged) {
      const claim: EntityMatchClaim = {
        kind: verdict.kind,
        term,
        candidateEntityId: candidate.entityId,
      };
      const claimKey = entityMatchLane.canonicalClaimKey(claim);
      await this.claimLedger.record({
        lane: ENTITY_MATCH_LANE,
        claimKey,
        ruleVersion: ENTITY_DEDUPE_RULE_VERSION,
        foldVersion: entityMatchLane.keyFoldVersion,
        outcome,
        reason: verdict.reason,
        ruleFingerprint: ENTITY_DEDUPE_RULE_FINGERPRINT,
        subject: { ...claim, candidateName: candidate.name, outcome },
        ...(rehearsalRunId
          ? { source: `rehearsal:${rehearsalRunId}` as const }
          : {}),
      });
      await this.claimLedger.markExecuted(
        ENTITY_MATCH_LANE,
        claimKey,
        ENTITY_DEDUPE_RULE_VERSION,
        entityMatchLane.keyFoldVersion,
      );
    }
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

  /**
   * `accentAdmits` is the accent-evidence veto (see performAliasMatches): it
   * answers, per (candidate, typed term), whether an ACCENTED term is one this
   * candidate may be claimed by. It is required, not optional — a default
   * "always admit" would let a new call site re-open the hole silently.
   */
  private selectBestAliasMatch(
    inputEntity: EntityResolutionInput,
    candidateEntities: { entityId: string; name: string; aliases: string[] }[],
    accentAdmits: (
      candidate: { entityId: string; aliases: string[] },
      term: string,
    ) => boolean,
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
    // The RAW spellings, deduped — the veto reads accents, which the fold has
    // already destroyed, so the overlap test below has to run on what was
    // actually typed.
    const rawSearchTerms = Array.from(new Set(searchTerms));

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

      // THE OVERLAP IS WHAT MAKES THE CLAIM, so the veto belongs here: a term
      // whose accents this candidate cannot answer is not an overlap at all.
      // Every other signal below (name similarity, containment) only ORDERS
      // candidates that already have one, so a vetoed candidate never competes.
      const hasAliasOverlap = rawSearchTerms.some(
        (searchTerm) =>
          normalizedCandidateAliases.includes(
            this.normalizeAliasValue(searchTerm),
          ) && accentAdmits(candidate, searchTerm),
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
      entity: { entityId: string; name: string };
    },
    right: {
      exactNameMatch: boolean;
      candidateNameContainsSearch: boolean;
      bestNameSimilarity: number;
      bestAliasSimilarity: number;
      entity: { entityId: string; name: string };
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

    // SHORTEST NAME WINS — the most specific concept that carries the word,
    // rather than a longer dish that merely contains it.
    if (left.entity.name.length !== right.entity.name.length) {
      return right.entity.name.length - left.entity.name.length;
    }
    // AND THE LAST TIE-BREAK IS TOTAL (2026-08-12, the same red team that
    // ordered the tier-1 fold owners). Two candidates equal on every signal
    // used to be settled by whichever row the query returned first — and the
    // surface query carries no ORDER BY, so "first" was heap and plan order.
    // A mention would then ground on a different twin from run to run and
    // split one concept's evidence across both. Name, then entityId: both are
    // stable, and together they are a total order, so every run of every
    // process picks the same candidate until a merge removes one.
    if (left.entity.name !== right.entity.name) {
      return left.entity.name < right.entity.name ? 1 : -1;
    }
    return left.entity.entityId < right.entity.entityId ? 1 : -1;
  }

  /**
   * The in-memory half of the surface comparison. It MUST be the same fold the
   * SQL arm used, or it would undo the tier's own match: a lowercase-only
   * normalizer accepts "joes shanghai" against "Joes Shanghai" but rejects
   * "despana" against "Despaña", so the DB would hand up a row that this
   * function then silently discarded.
   */
  private normalizeAliasValue(value: string): string {
    return canonicalFold(value);
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
      entityType === EntityType.item_attribute ||
      entityType === EntityType.place_attribute
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
        // The within-batch identity is the FOLD, not the raw spelling
        // (2026-08-11): a batch carrying both "Mcdonalds" and "McDonald's"
        // with neither in the database used to mint two primaries — the
        // spelling-variant question the exact tier answers with identity_key
        // was un-asked between two new entities of the same run. Emoji-only
        // names fold to '' and fall back to the raw form (the same totality
        // rule as entityLockKey).
        const identityName = canonicalFold(normalizedName) || normalizedName;
        const baseKey =
          entityType === 'place'
            ? `${entityType}:${this.normalizeEngineScope(
                entity.engineId,
              )}:${identityName}`
            : `${entityType}:${identityName}`;
        // THE ACCENT VETO, AT MINT (R2, 2026-08-12) — and WHY IT IS NOT
        // `admitsAtExactTier` (ruled 2026-08-12, when the tiers were ported to
        // the shared rule and this site was ported with them, then reverted).
        //
        // The admission rule reads a typed string against a BANKED one, and its
        // per-token subtlety only works because the registry can be asked which
        // accent-free strings are complete words ('chay' is banked; 'bo' is
        // not). At mint there is no banked side at all: both names are
        // unpersisted mentions from the same batch, so the discriminator is
        // empty — and with it empty the per-token rule reads "cơm chay" against
        // "cơm cháy" as a plain token asking nothing, and MERGES vegetarian
        // rice into scorched rice at confidence 1.0. Without evidence the
        // conservative side is the whole-string test: two names that BOTH carry
        // accents and disagree on them are different words; one-sided accents
        // still fold, so de-diacritized typing keeps collapsing ("pho"/"phở").
        //
        // The recall the per-token rule buys is not lost here, because it is
        // won one step earlier: a "phở bo" whose "phở bò" already EXISTS now
        // grounds at tier 1 and never reaches this path. Only names the whole
        // corpus could not answer are minted, and for those a twin (mergeable)
        // beats a wrong merge (a claim). A vetoed newcomer keys by its
        // accent-preserving fold, so its OWN later duplicates still collapse
        // deterministically.
        const occupantForVeto = primaryNewEntityMap.get(baseKey);
        const occupantName = occupantForVeto?.normalizedName ?? '';
        const accentVetoed =
          occupantForVeto !== undefined &&
          isAccented(normalizedName) &&
          isAccented(occupantName) &&
          diacriticFold(occupantName) !== diacriticFold(normalizedName);
        const normalizedKey = accentVetoed
          ? `${baseKey}#${diacriticFold(normalizedName)}`
          : baseKey;
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
            engineScope:
              entityType === 'place'
                ? this.normalizeEngineScope(entity.engineId)
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
          entityType === 'place'
            ? `${entityType}:${this.normalizeEngineScope(entity.engineId)}:`
            : `${entityType}:`;
        // Dedupe by tempId (red team R5): number-variant registration puts
        // ONE primary under several keys, and without this the judge's
        // 8-candidate budget could fill with clones of a single entity,
        // crowding out genuinely distinct near-duplicates.
        const overlayCandidates = [
          ...new Map(
            [...primaryNewEntityMap.entries()]
              .filter(([key]) => key.startsWith(lanePrefix))
              .map(([, primary]) => [primary.tempId, primary] as const),
          ).values(),
        ]
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
            // D2 context standard — same evidence the batch judge carries.
            mention: entity.mentionQuote ?? null,
            threadPlace: entity.mentionPlace ?? null,
            kind:
              entityType === 'place'
                ? 'place'
                : entityType === 'ingredient'
                  ? 'ingredient'
                  : 'item',
            candidates: overlayCandidates.map((c, i) => {
              const name = c.normalizedName ?? '';
              // The SAME alias evidence the batch judge carries: overlay
              // primaries are this run's unpersisted entities, so their
              // evidence is the extraction's own aliases + original text
              // (red team 2026-08-12 — the single judge used to see the
              // bare name while the batch judge saw the full synonym set).
              const aliases = [
                ...new Set(
                  [
                    ...(c.originalInput.aliases ?? []),
                    c.originalInput.originalText,
                  ]
                    .map((alias) => alias?.trim() ?? '')
                    .filter(
                      (alias) =>
                        alias.length > 0 &&
                        alias.toLowerCase() !== name.toLowerCase(),
                    ),
                ),
              ];
              return {
                id: i,
                name,
                ...(aliases.length ? { aliases } : {}),
              };
            }),
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

        // WITHIN-BATCH number dedupe. The exact tier closes input-vs-
        // EXISTING, but this map keyed only the raw name — so a single batch
        // containing both "taco" and "tacos" with NEITHER in the database
        // minted two entities, and the tier that would have caught it never
        // ran. That is precisely the reload's path: with an empty entity
        // table every string resolves cold, so the split would re-form at
        // the one moment the fix matters most. Registering the new primary
        // under its number variants makes the later form find it. First
        // primary wins; never steal a key another primary already owns.
        if (entityTypeUsesNumberVariants(entityType)) {
          for (const variant of itemNameVariants(identityName)) {
            const variantKey = `${entityType}:${canonicalFold(variant) || variant}`;
            if (!primaryNewEntityMap.has(variantKey)) {
              primaryNewEntityMap.set(variantKey, primaryResult);
            }
          }
        }

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
          engineScope:
            entityType === 'place'
              ? this.normalizeEngineScope(entity.engineId)
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

  private normalizeEngineScope(engineId?: string | null): string {
    const normalized = typeof engineId === 'string' ? engineId.trim() : '';
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
          cachedResults.push(
            this.buildResultFromCache(entity, memoryHit.payload),
          );
          continue;
        }
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
          pendingEntities.push(entity);
          continue;
        }

        const parsed = this.parseEntityResolutionCacheEntry(raw);
        if (!parsed) {
          pendingEntities.push(entity);
          continue;
        }

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
      engineScope:
        entity.entityType === 'place'
          ? this.normalizeEngineScope(entity.engineId)
          : 'global',
      // The document's language is part of WHAT WAS ASKED: the same word out
      // of an es document and an en document sees different surface slices,
      // so one cached verdict may not answer for both.
      documentLocale: this.normalizeDocumentLocale(entity.documentLocale),
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

    return {
      totalProcessed: results.length,
      exactMatches,
      aliasMatches,
      fuzzyMatches,
      newEntitiesCreated,
      processingTimeMs: Math.max(processingTimeMs, 1), // Ensure minimum 1ms for testing
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
      // F476: fold through canonicalFold (script-agnostic `\p{L}\p{N}`)
      // instead of stripping `[^a-z0-9]`. Stripping erased every non-ASCII
      // character, so a Cyrillic/CJK name (Пельменная, 食べ放題) produced an
      // EMPTY gram set and graded 0 against its identical twin — defeating the
      // multilingual identity the fold one layer down deliberately preserves.
      const padded = `  ${canonicalFold(s)}  `;
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
