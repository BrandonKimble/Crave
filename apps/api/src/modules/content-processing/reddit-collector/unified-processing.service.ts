/**
 * Unified Processing Service
 *
 * Database operations service for processed LLM output in the async queue architecture.
 * Handles entity resolution, database transactions, and quality score updates.
 * Used by async batch workers that have already completed LLM processing.
 *
 * Core responsibilities:
 * 1. Process pre-extracted LLM mentions and source metadata
 * 2. Entity resolution and database updates via consolidated transactions
 * 3. Component processing logic (food, category, attribute, praise handling)
 * 4. Quality score updates for affected connections
 */

import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma, $Enums } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { EntityResolutionService } from '../entity-resolver/entity-resolution.service';
import { QualityScoreService } from '../quality-score/quality-score.service';
import {
  ProcessingResult,
  UnifiedProcessingConfig,
  ProcessingPerformanceMetrics,
  CreatedEntitySummary,
} from './unified-processing.types';
import {
  EnrichedLLMOutputStructure,
  EnrichedLLMMention,
} from '../../external-integrations/llm/llm.types';
import {
  EntityResolutionInput,
  BatchResolutionResult,
} from '../entity-resolver/entity-resolution.types';
import { UnifiedProcessingExceptionFactory } from './unified-processing.exceptions';
import { RestaurantLocationEnrichmentService } from '../../restaurant-enrichment';
import { MarketRegistryService } from '../../markets/market-registry.service';
import type { ExtractionTraceContext } from './collection-evidence.service';
import { ProjectionRebuildService } from './projection-rebuild.service';

const DEFAULT_UNIFIED_PROCESSING_TX_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_RESTAURANT_ENRICHMENT_CONCURRENCY = 5;
const DEFAULT_SUBREDDIT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_SUBREDDIT_CACHE_MAX_ENTRIES = 1024;

type SourceLedgerRecord = Prisma.ProcessedSourceCreateManyInput;
type RestaurantEventRecord = Prisma.RestaurantEventCreateManyInput;
type RestaurantEntityEventRecord = Prisma.RestaurantEntityEventCreateManyInput;

type SourceBreakdown = {
  pushshift_archive: number;
  reddit_api_chronological: number;
  reddit_api_keyword_search: number;
  reddit_api_on_demand: number;
};

type MarketKeyRecord = {
  marketKey: string | null;
  name: string;
} | null;

type RestaurantEnrichmentDispatchContext = {
  locationBias?: {
    lat: number;
    lng: number;
    radiusMeters?: number;
  };
};

type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

interface SourceMetadata {
  batchId: string;
  collectionType?: string;
  subreddit?: string;
  searchEntity?: string;
  sourceBreakdown: SourceBreakdown;
  temporalRange?: {
    earliest: number;
    latest: number;
  };
  extractionTrace: ExtractionTraceContext;
}

type ProcessableMention = EnrichedLLMMention;
type PrismaTransaction = Prisma.TransactionClient;

interface RestaurantMetadataUpdateOperation {
  type: 'restaurant_metadata_update';
  restaurantEntityId: string;
  attributeIds: string[];
}

const DEFAULT_UNIFIED_BATCH_SIZE = 250;
const DEFAULT_ENTITY_RESOLUTION_BATCH_SIZE = 100;

const GENERIC_FOOD_PLACEHOLDERS = new Set<string>([
  'food',
  'foods',
  'the food',
  'good food',
  'great food',
  'awesome food',
  'amazing food',
  'delicious food',
  'some food',
  'meal',
  'meals',
  'the meal',
  'dish',
  'dishes',
]);

const GENERIC_RESTAURANT_PLACEHOLDERS = new Set<string>([
  'restaurant',
  'restaurants',
  'the restaurant',
  'place',
  'places',
  'the place',
  'spot',
  'spots',
  'the spot',
  'joint',
  'joints',
]);

@Injectable()
export class UnifiedProcessingService implements OnModuleInit {
  private logger!: LoggerService;
  private performanceMetrics: ProcessingPerformanceMetrics = {
    batchesProcessed: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0,
    successfulLLMCalls: 0,
    failedLLMCalls: 0,
    entitiesResolved: 0,
    databaseOperations: 0,
    lastReset: new Date(),
  };
  private readonly defaultBatchSize: number;
  private readonly entityResolutionBatchSize: number;
  private readonly dryRunEnabled: boolean;
  private readonly transactionTimeoutMs: number;
  private readonly restaurantEnrichmentConcurrency: number;
  private readonly subredditCacheTtlMs: number;
  private readonly subredditCacheMaxEntries: number;
  private readonly subredditLocationCache = new Map<
    string,
    TimedCacheEntry<{ latitude: number; longitude: number }>
  >();
  private readonly subredditMarketCache = new Map<
    string,
    TimedCacheEntry<string>
  >();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly qualityScoreService: QualityScoreService,
    private readonly projectionRebuildService: ProjectionRebuildService,
    private readonly configService: ConfigService,
    private readonly restaurantLocationEnrichmentService: RestaurantLocationEnrichmentService,
    private readonly marketRegistry: MarketRegistryService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {
    this.defaultBatchSize = this.getNumericConfig(
      'UNIFIED_PROCESSING_BATCH_SIZE',
      DEFAULT_UNIFIED_BATCH_SIZE,
    );
    this.entityResolutionBatchSize = this.getNumericConfig(
      'ENTITY_RESOLUTION_BATCH_SIZE',
      DEFAULT_ENTITY_RESOLUTION_BATCH_SIZE,
    );
    this.transactionTimeoutMs = DEFAULT_UNIFIED_PROCESSING_TX_TIMEOUT_MS;
    this.restaurantEnrichmentConcurrency = this.getNumericConfig(
      'RESTAURANT_ENRICHMENT_CONCURRENCY',
      DEFAULT_RESTAURANT_ENRICHMENT_CONCURRENCY,
    );
    this.subredditCacheTtlMs = this.getNumericConfig(
      'UNIFIED_PROCESSING_SUBREDDIT_CACHE_TTL_MS',
      DEFAULT_SUBREDDIT_CACHE_TTL_MS,
    );
    this.subredditCacheMaxEntries = this.getNumericConfig(
      'UNIFIED_PROCESSING_SUBREDDIT_CACHE_MAX_ENTRIES',
      DEFAULT_SUBREDDIT_CACHE_MAX_ENTRIES,
    );
    this.dryRunEnabled =
      this.configService.get<boolean>('unifiedProcessing.dryRun') === true;
  }

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('UnifiedProcessingService');
    this.logger.debug('Initialized subreddit lookup caches', {
      subredditCacheTtlMs: this.subredditCacheTtlMs,
      subredditCacheMaxEntries: this.subredditCacheMaxEntries,
    });
  }

  private normalizePlaceholder(term: string): string {
    return term.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private isGenericFoodPlaceholder(term: string): boolean {
    if (typeof term !== 'string') {
      return true;
    }
    const normalized = this.normalizePlaceholder(term);
    return normalized.length === 0 || GENERIC_FOOD_PLACEHOLDERS.has(normalized);
  }

  private isGenericRestaurantPlaceholder(term: string): boolean {
    if (typeof term !== 'string') {
      return true;
    }
    const normalized = this.normalizePlaceholder(term);
    return (
      normalized.length === 0 ||
      GENERIC_RESTAURANT_PLACEHOLDERS.has(normalized) ||
      GENERIC_FOOD_PLACEHOLDERS.has(normalized)
    );
  }

  private sanitizeFoodTerm(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed.length || this.isGenericFoodPlaceholder(trimmed)) {
      return null;
    }
    return trimmed;
  }

  private filterMentionArray(
    values: unknown,
    surfaces: unknown,
    predicate: (value: string) => boolean,
  ): { values: string[]; surfaces: string[] } {
    const valueArray = Array.isArray(values) ? (values as unknown[]) : [];
    const surfaceArray = Array.isArray(surfaces) ? (surfaces as unknown[]) : [];

    const filteredValues: string[] = [];
    const filteredSurfaces: string[] = [];

    valueArray.forEach((rawValue, index) => {
      if (typeof rawValue !== 'string') {
        return;
      }
      const trimmed = rawValue.trim();
      if (!trimmed.length) {
        return;
      }
      if (!predicate(trimmed)) {
        return;
      }

      filteredValues.push(trimmed);

      const surfaceCandidate = surfaceArray[index];
      if (
        typeof surfaceCandidate === 'string' &&
        surfaceCandidate.trim().length > 0
      ) {
        filteredSurfaces.push(surfaceCandidate);
      } else {
        filteredSurfaces.push(trimmed);
      }
    });

    return { values: filteredValues, surfaces: filteredSurfaces };
  }

  private sanitizeMention(mention: ProcessableMention): void {
    mention.food = this.sanitizeFoodTerm(mention.food);

    const categoryResult = this.filterMentionArray(
      mention.food_categories,
      mention.food_category_surfaces,
      (value) => !this.isGenericFoodPlaceholder(value),
    );
    mention.food_categories = categoryResult.values;
    mention.food_category_surfaces = categoryResult.surfaces;

    const foodAttrResult = this.filterMentionArray(
      mention.food_attributes,
      mention.food_attribute_surfaces,
      (value) => !this.isGenericFoodPlaceholder(value),
    );
    mention.food_attributes = foodAttrResult.values;
    mention.food_attribute_surfaces = foodAttrResult.surfaces;

    const restaurantAttrResult = this.filterMentionArray(
      mention.restaurant_attributes,
      mention.restaurant_attribute_surfaces,
      (value) => !this.isGenericRestaurantPlaceholder(value),
    );
    mention.restaurant_attributes = restaurantAttrResult.values;
    mention.restaurant_attribute_surfaces = restaurantAttrResult.surfaces;
  }

  /**
   * Process LLM output directly without additional LLM processing
   * Clean interface for async queue workers that already have LLM output
   *
   * @param llmOutputData - Contains mentions and source metadata
   * @param config - Optional processing configuration
   * @returns Processing result with metrics
   */
  async processLLMOutput(
    llmOutputData: {
      mentions: ProcessableMention[];
      sourceMetadata: SourceMetadata;
    },
    config?: Partial<UnifiedProcessingConfig>,
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    affectedConnectionIds: string[];
    affectedRestaurantIds: string[];
    createdEntityIds?: string[];
    createdEntitySummaries?: CreatedEntitySummary[];
    reusedEntitySummaries?: {
      tempId: string;
      entityId: string;
      entityType: string;
      normalizedName?: string;
      originalText?: string;
      canonicalName?: string;
    }[];
  }> {
    const { mentions, sourceMetadata } = llmOutputData;
    const batchId = sourceMetadata.batchId;
    const startTime = Date.now();

    const defaultConfig = this.buildDefaultProcessingConfig();
    const processingConfig = { ...defaultConfig, ...config };
    const pipelineKey = this.resolvePipelineKey(sourceMetadata.collectionType);

    const { filteredMentions, newRecordsBySourceId, skippedCount } =
      await this.prepareSourceLedgerRecords(
        mentions,
        pipelineKey,
        sourceMetadata.subreddit,
        processingConfig.skipSourceLedgerDedupe,
      );

    if (skippedCount > 0) {
      this.logger.debug('Skipped previously processed sources', {
        batchId,
        skippedCount,
        collectionType: sourceMetadata.collectionType,
      });
    }

    if (filteredMentions.length === 0) {
      this.logger.info('No new mentions to process after dedupe', {
        batchId,
        collectionType: sourceMetadata.collectionType,
        totalMentions: mentions.length,
        dedupedMentions: 0,
      });

      return {
        entitiesCreated: 0,
        connectionsCreated: 0,
        affectedConnectionIds: [],
        affectedRestaurantIds: [],
        createdEntityIds: [],
        createdEntitySummaries: [],
        reusedEntitySummaries: [],
      };
    }

    try {
      this.logger.info('Processing LLM output directly', {
        batchId,
        mentionsCount: filteredMentions.length,
        collectionType: sourceMetadata.collectionType,
        subreddit: sourceMetadata.subreddit,
      });

      if (this.dryRunEnabled) {
        const marketKey = await this.resolveMarketKey(
          sourceMetadata.subreddit ?? null,
        );
        const resolutionResult = await this.resolveEntitiesForOutput(
          { mentions: filteredMentions },
          marketKey,
        );

        this.logger.info('Unified processing dry run enabled', {
          batchId,
          mentionsCount: filteredMentions.length,
          collectionType: sourceMetadata.collectionType,
          subreddit: sourceMetadata.subreddit,
          entitiesResolved: resolutionResult.resolutionResults.length,
          newEntitiesPotential: resolutionResult.newEntitiesCreated,
        });

        return {
          entitiesCreated: resolutionResult.newEntitiesCreated,
          connectionsCreated: 0,
          affectedConnectionIds: [],
          affectedRestaurantIds: [],
          createdEntityIds: [],
          createdEntitySummaries: [],
          reusedEntitySummaries: [],
        };
      }

      // Create LLM output structure for existing pipeline
      const llmOutput: EnrichedLLMOutputStructure = {
        mentions: filteredMentions,
      };

      // PRD 6.6.4: Check if batch needs to be split
      if (filteredMentions.length > processingConfig.batchSize) {
        const batchResult = await this.processMentionsInBatches(
          llmOutput,
          sourceMetadata,
          batchId,
          processingConfig,
          newRecordsBySourceId,
        );

        return {
          entitiesCreated:
            batchResult.entityResolution?.newEntitiesCreated || 0,
          connectionsCreated:
            batchResult.databaseOperations?.connectionsCreated || 0,
          affectedConnectionIds:
            batchResult.databaseOperations?.affectedConnectionIds || [],
          affectedRestaurantIds:
            batchResult.databaseOperations?.affectedRestaurantIds || [],
          createdEntityIds:
            batchResult.databaseOperations?.createdEntityIds || [],
          createdEntitySummaries:
            batchResult.databaseOperations?.createdEntitySummaries || [],
          reusedEntitySummaries:
            batchResult.databaseOperations?.reusedEntitySummaries || [],
        };
      }

      // Process as single batch
      const batchResult = await this.processSingleBatch(
        llmOutput,
        sourceMetadata,
        batchId,
        processingConfig,
        newRecordsBySourceId,
        startTime,
      );

      const singleBatchEntitySummaries =
        batchResult.databaseOperations?.createdEntitySummaries || [];
      await this.scheduleRestaurantEnrichment(
        singleBatchEntitySummaries,
        sourceMetadata,
      );

      return {
        entitiesCreated: batchResult.entityResolution?.newEntitiesCreated || 0,
        connectionsCreated:
          batchResult.databaseOperations?.connectionsCreated || 0,
        affectedConnectionIds:
          batchResult.databaseOperations?.affectedConnectionIds || [],
        affectedRestaurantIds:
          batchResult.databaseOperations?.affectedRestaurantIds || [],
        createdEntityIds:
          batchResult.databaseOperations?.createdEntityIds || [],
        createdEntitySummaries:
          batchResult.databaseOperations?.createdEntitySummaries || [],
        reusedEntitySummaries:
          batchResult.databaseOperations?.reusedEntitySummaries || [],
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updatePerformanceMetrics(processingTime, false);
      const errorCause = error instanceof Error ? error : undefined;

      this.logger.error('LLM output processing failed', {
        batchId,
        mentionsCount: filteredMentions.length,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        sourceBreakdown: sourceMetadata.sourceBreakdown,
      });

      throw UnifiedProcessingExceptionFactory.createProcessingFailed(
        `LLM output processing failed for batch ${batchId}`,
        errorCause,
        {
          batchId,
          mentionsCount: filteredMentions.length,
          processingTime,
          sourceBreakdown: sourceMetadata.sourceBreakdown,
        },
      );
    }
  }

  /**
   * Process mentions in smaller batches (PRD 6.6.4)
   * Sequential processing with robust error handling
   */
  private async processMentionsInBatches(
    llmOutput: EnrichedLLMOutputStructure,
    sourceMetadata: SourceMetadata,
    parentBatchId: string,
    config: UnifiedProcessingConfig,
    ledgerRecordsBySourceId: Map<string, SourceLedgerRecord>,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const batchSize = config.batchSize;
    const totalMentions = llmOutput.mentions.length;
    const batchCount = Math.ceil(totalMentions / batchSize);

    this.logger.info(
      `Splitting ${totalMentions} mentions into ${batchCount} batches of max ${batchSize}`,
      {
        parentBatchId,
      },
    );

    let totalEntitiesCreated = 0;
    let totalConnectionsCreated = 0;
    const allAffectedConnectionIds: string[] = [];
    const createdEntityIds: string[] = [];
    const createdEntitySummaries: CreatedEntitySummary[] = [];
    const reusedEntitySummaries: {
      tempId: string;
      entityId: string;
      entityType: string;
      normalizedName?: string;
      originalText?: string;
      canonicalName?: string;
    }[] = [];

    // Process each batch sequentially for robust error handling
    for (let i = 0; i < batchCount; i++) {
      const batchStart = i * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, totalMentions);
      const batchMentions = llmOutput.mentions.slice(batchStart, batchEnd);

      const subBatchId = `${parentBatchId}_batch_${i + 1}`;

      this.logger.debug(`Processing sub-batch ${i + 1}/${batchCount}`, {
        subBatchId,
        mentionsCount: batchMentions.length,
      });

      try {
        const subLlmOutput = { mentions: batchMentions };
        const subResult = await this.processSingleBatch(
          subLlmOutput,
          sourceMetadata,
          subBatchId,
          config,
          ledgerRecordsBySourceId,
          Date.now(),
        );

        totalEntitiesCreated += subResult.entityResolution.newEntitiesCreated;
        totalConnectionsCreated +=
          subResult.databaseOperations.connectionsCreated;
        allAffectedConnectionIds.push(
          ...(subResult.databaseOperations.affectedConnectionIds || []),
        );
        if (subResult.databaseOperations.createdEntityIds?.length) {
          createdEntityIds.push(
            ...subResult.databaseOperations.createdEntityIds,
          );
        }
        if (subResult.databaseOperations.createdEntitySummaries?.length) {
          createdEntitySummaries.push(
            ...subResult.databaseOperations.createdEntitySummaries,
          );
        }
        if (subResult.databaseOperations.reusedEntitySummaries?.length) {
          reusedEntitySummaries.push(
            ...subResult.databaseOperations.reusedEntitySummaries,
          );
        }
      } catch (error) {
        this.logger.error(`Sub-batch ${subBatchId} failed`, {
          error: error instanceof Error ? error.message : String(error),
          batchIndex: i + 1,
          totalBatches: batchCount,
        });
        // Continue processing other batches despite failures
      }
    }

    const processingTime = Date.now() - startTime;
    this.updatePerformanceMetrics(processingTime, true);

    const uniqueCreatedEntityIds = Array.from(new Set(createdEntityIds));
    const createdEntitySummaryMap = new Map<string, CreatedEntitySummary>();
    for (const summary of createdEntitySummaries) {
      if (!createdEntitySummaryMap.has(summary.entityId)) {
        createdEntitySummaryMap.set(summary.entityId, summary);
      }
    }
    const uniqueCreatedEntitySummaries = Array.from(
      createdEntitySummaryMap.values(),
    );

    await this.scheduleRestaurantEnrichment(
      uniqueCreatedEntitySummaries,
      sourceMetadata,
    );

    const reusedEntitySummaryMap = new Map<
      string,
      (typeof reusedEntitySummaries)[number]
    >();
    for (const summary of reusedEntitySummaries) {
      const key = `${summary.entityId}:${summary.tempId}`;
      if (!reusedEntitySummaryMap.has(key)) {
        reusedEntitySummaryMap.set(key, summary);
      }
    }
    const uniqueReusedEntitySummaries = Array.from(
      reusedEntitySummaryMap.values(),
    );

    return {
      batchId: parentBatchId,
      success: true,
      processingTimeMs: processingTime,
      sourceBreakdown: sourceMetadata.sourceBreakdown,
      llmResult: {
        mentionsExtracted: totalMentions,
        successfulProcessing: true,
      },
      entityResolution: {
        entitiesProcessed: totalMentions,
        newEntitiesCreated: totalEntitiesCreated,
        existingEntitiesMatched: 0, // Would need to aggregate from sub-batches
      },
      databaseOperations: {
        entitiesCreated: totalEntitiesCreated,
        connectionsCreated: totalConnectionsCreated,
        affectedConnectionIds: [...new Set(allAffectedConnectionIds)],
        createdEntityIds: uniqueCreatedEntityIds,
        createdEntitySummaries: uniqueCreatedEntitySummaries,
        reusedEntitySummaries: uniqueReusedEntitySummaries,
      },
      qualityScoreUpdates: config.enableQualityScores
        ? [...new Set(allAffectedConnectionIds)].length
        : 0,
    };
  }

  /**
   * Process a single batch with retry logic (PRD approach)
   */
  private async processSingleBatch(
    llmOutput: EnrichedLLMOutputStructure,
    sourceMetadata: SourceMetadata,
    batchId: string,
    processingConfig: UnifiedProcessingConfig,
    ledgerRecordsBySourceId: Map<string, SourceLedgerRecord>,
    startTime: number,
  ): Promise<ProcessingResult> {
    // Step 4a: Entity Resolution (cached for retries)
    const marketKey = await this.resolveMarketKey(
      sourceMetadata.subreddit ?? null,
    );
    if (!marketKey) {
      this.logger.warn('Market key missing for ingestion batch', {
        batchId,
        collectionType: sourceMetadata.collectionType,
        subreddit: sourceMetadata.subreddit,
        searchEntity: sourceMetadata.searchEntity,
        sourceBreakdown: sourceMetadata.sourceBreakdown,
      });
    }
    const resolutionResult = await this.resolveEntitiesForOutput(
      llmOutput,
      marketKey,
    );

    // Step 4b-5: Single Consolidated Processing Phase with retry logic
    const ledgerRecords = this.collectLedgerRecordsForMentions(
      llmOutput.mentions,
      ledgerRecordsBySourceId,
    );
    const databaseResult = await this.performConsolidatedProcessingWithRetry(
      llmOutput,
      resolutionResult,
      sourceMetadata,
      batchId,
      processingConfig.maxRetries || 3,
      ledgerRecords,
    );

    if (databaseResult.affectedRestaurantIds.length > 0) {
      const rebuildResult =
        await this.projectionRebuildService.rebuildForRestaurants(
          databaseResult.affectedRestaurantIds,
        );
      databaseResult.affectedConnectionIds = [
        ...new Set([
          ...(databaseResult.affectedConnectionIds ?? []),
          ...rebuildResult.connectionIds,
        ]),
      ];
    }

    // Step 6: Quality Score Updates (PRD Section 5.3)
    if (
      processingConfig.enableQualityScores &&
      (databaseResult.affectedConnectionIds.length > 0 ||
        databaseResult.affectedRestaurantIds.length > 0)
    ) {
      await this.triggerQualityScoreUpdates(
        databaseResult.affectedConnectionIds,
        databaseResult.affectedRestaurantIds,
      );
    }

    const processingTime = Date.now() - startTime;
    this.updatePerformanceMetrics(processingTime, true);

    const result: ProcessingResult = {
      batchId,
      success: true,
      processingTimeMs: processingTime,
      sourceBreakdown: sourceMetadata.sourceBreakdown,
      llmResult: {
        mentionsExtracted: llmOutput.mentions.length,
        successfulProcessing: true,
      },
      entityResolution: {
        entitiesProcessed: resolutionResult.resolutionResults.length,
        newEntitiesCreated: resolutionResult.newEntitiesCreated,
        existingEntitiesMatched:
          resolutionResult.performanceMetrics.exactMatches +
          resolutionResult.performanceMetrics.aliasMatches +
          resolutionResult.performanceMetrics.fuzzyMatches,
      },
      databaseOperations: databaseResult,
      qualityScoreUpdates: processingConfig.enableQualityScores
        ? databaseResult.affectedConnectionIds?.length || 0
        : 0,
    };

    this.logger.info(
      `Single batch processing completed successfully for ${batchId} in ${processingTime}ms`,
    );
    return result;
  }

  private async resolveEntitiesForOutput(
    llmOutput: EnrichedLLMOutputStructure,
    marketKey: string | null,
  ): Promise<BatchResolutionResult> {
    const entityResolutionInput = this.extractEntitiesFromLLMOutput(llmOutput, {
      marketKey,
    });
    return this.entityResolutionService.resolveBatch(entityResolutionInput, {
      batchSize: this.entityResolutionBatchSize,
      enableFuzzyMatching: true,
    });
  }

  /**
   * Extract entities from LLM output for resolution
   * Converts LLM mentions to entity resolution input format
   */
  private extractEntitiesFromLLMOutput(
    llmOutput: EnrichedLLMOutputStructure,
    options: { marketKey?: string | null } = {},
  ): EntityResolutionInput[] {
    const entities: EntityResolutionInput[] = [];
    const normalizedMarketKey =
      typeof options.marketKey === 'string'
        ? options.marketKey.trim().toLowerCase()
        : null;

    const getSurfaceString = (surface: unknown, fallback: unknown): string => {
      if (typeof surface === 'string' && surface.length > 0) {
        return surface;
      }
      if (typeof fallback === 'string' && fallback.length > 0) {
        return fallback;
      }
      return '';
    };

    const getSurfaceArray = (
      canonical: unknown,
      surfaces: unknown,
    ): string[] => {
      if (!Array.isArray(canonical)) {
        return [];
      }
      const canonicalArray = canonical as unknown[];
      const surfaceArray = Array.isArray(surfaces)
        ? (surfaces as unknown[])
        : [];

      return canonicalArray.map((value, index) => {
        const surfaceCandidate = surfaceArray[index];
        if (
          typeof surfaceCandidate === 'string' &&
          surfaceCandidate.length > 0
        ) {
          return surfaceCandidate;
        }
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
        return '';
      });
    };

    try {
      for (const mention of llmOutput.mentions) {
        this.sanitizeMention(mention);
        // Restaurant entities (deterministic temp IDs)
        if (mention.restaurant) {
          const restaurantTempId = this.buildRestaurantTempId(mention);
          mention.__restaurantTempId = restaurantTempId;
          const restaurantSurface = getSurfaceString(
            mention.restaurant_surface,
            mention.restaurant,
          );
          entities.push({
            normalizedName: this.normalizeEntityName(
              mention.restaurant,
              'restaurant',
            ),
            originalText: restaurantSurface,
            entityType: 'restaurant' as const,
            tempId: restaurantTempId,
            marketKey: normalizedMarketKey,
            aliases:
              restaurantSurface && restaurantSurface !== mention.restaurant
                ? [restaurantSurface]
                : [],
          });
        } else {
          mention.__restaurantTempId = null;
        }

        // Food entity (menu item)
        if (mention.food) {
          const foodEntityTempId = this.buildFoodEntityTempId(mention);
          mention.__foodEntityTempId = foodEntityTempId;
          const foodSurface = getSurfaceString(
            mention.food_surface,
            mention.food,
          );
          entities.push({
            normalizedName: this.normalizeEntityName(mention.food, 'food'),
            originalText: foodSurface,
            entityType: 'food' as const,
            tempId: foodEntityTempId,
            aliases:
              foodSurface && foodSurface !== mention.food ? [foodSurface] : [],
          });
        } else {
          mention.__foodEntityTempId = null;
        }

        // Also process food_categories array if present (deterministic IDs)
        if (mention.food_categories && Array.isArray(mention.food_categories)) {
          if (!Array.isArray(mention.__foodCategoryTempIds)) {
            mention.__foodCategoryTempIds = [];
          }
          const seenCategoryIds = new Set<string>();
          const categorySurfaces = getSurfaceArray(
            mention.food_categories,
            mention.food_category_surfaces,
          );
          for (let i = 0; i < mention.food_categories.length; i += 1) {
            const category = mention.food_categories[i];
            if (!category) {
              continue;
            }
            const categoryTempId = this.buildFoodCategoryTempId(category);
            if (seenCategoryIds.has(categoryTempId)) {
              continue;
            }
            seenCategoryIds.add(categoryTempId);
            const categorySurface = categorySurfaces[i] || category;

            entities.push({
              normalizedName: this.normalizeEntityName(category, 'food'),
              originalText: categorySurface || category,
              entityType: 'food' as const,
              tempId: categoryTempId,
              aliases:
                categorySurface && categorySurface !== category
                  ? [categorySurface]
                  : [],
            });
            mention.__foodCategoryTempIds.push({
              name: category,
              tempId: categoryTempId,
              surface: categorySurface || category,
            });
          }
          if (mention.__foodCategoryTempIds.length === 0) {
            delete mention.__foodCategoryTempIds;
          }
        }

        // Food attributes
        if (mention.food_attributes && Array.isArray(mention.food_attributes)) {
          const seenFoodAttrIds = new Set<string>();
          const foodAttributeSurfaces = getSurfaceArray(
            mention.food_attributes,
            mention.food_attribute_surfaces,
          );
          for (let i = 0; i < mention.food_attributes.length; i += 1) {
            const attr = mention.food_attributes[i];
            if (typeof attr === 'string' && attr) {
              const attributeTempId = this.buildAttributeTempId('food', attr);
              if (seenFoodAttrIds.has(attributeTempId)) {
                continue;
              }
              seenFoodAttrIds.add(attributeTempId);
              const attrSurface = foodAttributeSurfaces[i] || attr;
              entities.push({
                normalizedName: this.normalizeEntityName(
                  attr,
                  'food_attribute',
                ),
                originalText: attrSurface || attr,
                entityType: 'food_attribute' as const,
                tempId: attributeTempId,
                aliases:
                  attrSurface && attrSurface !== attr ? [attrSurface] : [],
              });
            }
          }
        }

        // Restaurant attributes (FIXED: Consistent temp_id strategy)
        if (
          mention.restaurant_attributes &&
          Array.isArray(mention.restaurant_attributes)
        ) {
          const seenRestaurantAttrIds = new Set<string>();
          const restaurantAttrSurfaces = getSurfaceArray(
            mention.restaurant_attributes,
            mention.restaurant_attribute_surfaces,
          );
          for (let i = 0; i < mention.restaurant_attributes.length; i += 1) {
            const attr = mention.restaurant_attributes[i];
            if (typeof attr === 'string' && attr) {
              const attributeTempId = this.buildAttributeTempId(
                'restaurant',
                attr,
              );
              if (seenRestaurantAttrIds.has(attributeTempId)) {
                continue;
              }
              seenRestaurantAttrIds.add(attributeTempId);
              const attrSurface = restaurantAttrSurfaces[i] || attr;
              entities.push({
                normalizedName: this.normalizeEntityName(
                  attr,
                  'restaurant_attribute',
                ),
                originalText: attrSurface || attr,
                entityType: 'restaurant_attribute' as const,
                tempId: attributeTempId,
                aliases:
                  attrSurface && attrSurface !== attr ? [attrSurface] : [],
              });
            }
          }
        }
      }

      this.performanceMetrics.entitiesResolved += entities.length;
      return entities;
    } catch (error) {
      const errorCause = error instanceof Error ? error : undefined;
      throw UnifiedProcessingExceptionFactory.createEntityExtractionFailed(
        'Failed to extract entities from LLM output',
        errorCause,
        { mentionsCount: llmOutput.mentions.length },
      );
    }
  }

  private normalizeForId(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }

    const stringValue =
      typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : '';

    if (!stringValue) {
      return '';
    }

    return stringValue
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private stableHash(value: string): string {
    return createHash('sha256').update(value).digest('hex').substring(0, 12);
  }

  private createFallbackId(
    scope: string,
    mention?: ProcessableMention,
    subject?: string,
  ): string {
    const parts = [
      scope,
      subject ?? '',
      mention?.source_id ?? '',
      mention?.temp_id ?? '',
      mention?.restaurant ?? '',
      mention?.food ?? '',
    ];
    return `${scope}-${this.stableHash(parts.join('|'))}`;
  }

  private buildRestaurantTempId(mention: ProcessableMention): string {
    const normalized = this.normalizeForId(mention?.restaurant);
    if (normalized) {
      return `restaurant::${normalized}`;
    }
    return this.createFallbackId('restaurant', mention);
  }

  private buildFoodEntityTempId(mention: ProcessableMention): string {
    const restaurantTempId =
      typeof mention?.__restaurantTempId === 'string' &&
      mention.__restaurantTempId
        ? mention.__restaurantTempId
        : this.buildRestaurantTempId(mention);

    const normalizedFoodName = this.normalizeForId(mention?.food);
    if (normalizedFoodName) {
      return `${restaurantTempId}::food::${normalizedFoodName}`;
    }
    return `${restaurantTempId}::${this.createFallbackId('food', mention)}`;
  }

  private buildFoodCategoryTempId(categoryName: string): string {
    const normalized = this.normalizeForId(categoryName);
    if (normalized) {
      return `food-category::${normalized}`;
    }
    return `food-category::${this.stableHash(categoryName ?? '')}`;
  }

  private normalizeEntityName(
    value: string | undefined,
    type?: string,
  ): string {
    const sanitized = (value ?? '').trim().replace(/\s+/g, ' ');
    if (!sanitized.length) {
      return sanitized;
    }

    if (type !== 'restaurant') {
      return sanitized.toLowerCase();
    }

    return sanitized
      .split(' ')
      .map((word) =>
        word.length > 0
          ? word[0].toUpperCase() + word.slice(1).toLowerCase()
          : word,
      )
      .join(' ');
  }

  private buildAttributeTempId(
    scope: 'food' | 'restaurant',
    attributeName: string,
  ): string {
    const normalized = this.normalizeForId(attributeName);
    const prefix = scope === 'restaurant' ? 'restaurant-attr' : 'food-attr';

    if (normalized) {
      return `${prefix}::${normalized}`;
    }

    return `${prefix}::${this.stableHash(attributeName ?? '')}`;
  }

  private getRestaurantEntityLookupKey(
    mention: ProcessableMention,
  ): string | null {
    if (
      mention &&
      typeof mention.__restaurantTempId === 'string' &&
      mention.__restaurantTempId.trim().length > 0
    ) {
      return mention.__restaurantTempId.trim();
    }

    if (mention && mention.restaurant) {
      const generatedId = this.buildRestaurantTempId(mention);
      mention.__restaurantTempId = generatedId;
      return generatedId;
    }

    return null;
  }

  private getFoodEntityLookupKey(mention: ProcessableMention): string | null {
    if (
      mention &&
      typeof mention.__foodEntityTempId === 'string' &&
      mention.__foodEntityTempId.trim().length > 0
    ) {
      return mention.__foodEntityTempId.trim();
    }

    if (mention && mention.food) {
      const generatedId = this.buildFoodEntityTempId(mention);
      mention.__foodEntityTempId = generatedId;
      return generatedId;
    }

    return null;
  }

  private buildMentionKey(mention: ProcessableMention): string {
    const parts = [
      mention.source_id ?? '',
      mention.temp_id ?? '',
      mention.restaurant ?? '',
      mention.food ?? '',
      Array.isArray(mention.food_categories)
        ? mention.food_categories.join('|')
        : '',
      Array.isArray(mention.food_attributes)
        ? mention.food_attributes.join('|')
        : '',
      Array.isArray(mention.restaurant_attributes)
        ? mention.restaurant_attributes.join('|')
        : '',
      mention.general_praise ? 'praise' : 'neutral',
    ];

    return `mention::${this.stableHash(parts.join('||'))}`;
  }

  private getMentionProvenance(mention: ProcessableMention): {
    inputId: string | null;
    sourceDocumentId: string | null;
    mentionKey: string;
  } {
    return {
      inputId:
        typeof mention.__extractionInputId === 'string' &&
        mention.__extractionInputId.trim().length > 0
          ? mention.__extractionInputId.trim()
          : null,
      sourceDocumentId:
        typeof mention.__sourceDocumentId === 'string' &&
        mention.__sourceDocumentId.trim().length > 0
          ? mention.__sourceDocumentId.trim()
          : null,
      mentionKey: this.buildMentionKey(mention),
    };
  }

  /**
   * Single Consolidated Processing Phase - PRD Section 6.4
   * Performs all operations in-memory within one database transaction
   * Input: LLM output structure | Output: Direct database updates
   */
  private async performConsolidatedProcessing(
    llmOutput: EnrichedLLMOutputStructure,
    resolutionResult: BatchResolutionResult,
    sourceMetadata: SourceMetadata,
    batchId: string,
    sourceLedgerRecords: SourceLedgerRecord[],
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    affectedConnectionIds: string[];
    affectedRestaurantIds: string[];
  }> {
    const startTime = Date.now();
    const resolvedMarketKey = await this.resolveMarketKey(
      sourceMetadata.subreddit ?? null,
    );

    try {
      this.logger.debug('Starting consolidated processing phase', {
        batchId,
        mentionsCount: llmOutput.mentions.length,
        resolvedEntitiesCount: resolutionResult.resolutionResults.length,
      });

      // PRD 6.4: Single consolidated processing phase - all operations in-memory
      // PRD 6.4: Single consolidated processing phase - all operations in-memory
      // Build temp_id to entity_id mapping from resolution result
      const tempIdToEntityIdMap = new Map<string, string>();
      const newEntityTempGroups = new Map<string, Set<string>>();
      const resolutionByTempId = new Map<
        string,
        (typeof resolutionResult.resolutionResults)[number]
      >();

      for (const resolution of resolutionResult.resolutionResults) {
        if (resolution.resolutionTier !== 'new') {
          continue;
        }

        const primaryTempId = resolution.isNewEntity
          ? resolution.tempId
          : resolution.primaryTempId;

        if (!primaryTempId) {
          continue;
        }

        if (!newEntityTempGroups.has(primaryTempId)) {
          newEntityTempGroups.set(primaryTempId, new Set());
        }

        newEntityTempGroups.get(primaryTempId)!.add(resolution.tempId);
        resolutionByTempId.set(resolution.tempId, resolution);
      }

      for (const resolution of resolutionResult.resolutionResults) {
        if (resolution.entityId) {
          tempIdToEntityIdMap.set(resolution.tempId, resolution.entityId);
        }
      }

      // PRD 6.6.2: Single atomic transaction
      const result = await this.prismaService.$transaction(
        async (tx) => {
          this.logger.debug('Executing consolidated database transaction', {
            batchId,
            mentionsProcessed: llmOutput.mentions.length,
          });

          if (
            Array.isArray(sourceLedgerRecords) &&
            sourceLedgerRecords.length > 0
          ) {
            await tx.processedSource.createMany({
              data: sourceLedgerRecords.map((record) => ({
                pipeline: record.pipeline,
                sourceId: record.sourceId,
                community: record.community ?? null,
                processedAt: record.processedAt ?? new Date(),
              })),
              skipDuplicates: true,
            });
          }

          // PRD 6.6.2: Create any new entities from resolution within transaction
          // This ensures atomicity - if entity creation fails, entire batch fails
          let entitiesCreated = 0;
          const createdEntitySummaries: CreatedEntitySummary[] = [];
          const createdEntityIds: string[] = [];
          const reusedEntitySummaries: {
            tempId: string;
            entityId: string;
            entityType: string;
            normalizedName?: string;
            originalText?: string;
            canonicalName?: string;
          }[] = [];
          const normalizedSubreddit = sourceMetadata.subreddit
            ? sourceMetadata.subreddit.trim().toLowerCase()
            : null;
          const subredditLocation = await this.resolveSubredditLocation(
            tx,
            normalizedSubreddit,
          );
          for (const resolution of resolutionResult.resolutionResults) {
            if (!resolution.isNewEntity) {
              continue;
            }

            const tempGroupSet =
              newEntityTempGroups.get(resolution.tempId) ??
              new Set<string>([resolution.tempId]);
            const tempGroup = Array.from(tempGroupSet);
            const aggregatedAliasSet = new Set<string>();

            for (const tempId of tempGroup) {
              const groupResolution = resolutionByTempId.get(tempId);
              if (!groupResolution) {
                continue;
              }

              const candidateAliases = groupResolution.validatedAliases || [];
              for (const alias of candidateAliases) {
                if (typeof alias === 'string' && alias.length > 0) {
                  aggregatedAliasSet.add(alias);
                }
              }

              const originalSurface =
                groupResolution.originalInput?.originalText;
              if (
                typeof originalSurface === 'string' &&
                originalSurface.length > 0
              ) {
                aggregatedAliasSet.add(originalSurface);
              }
            }

            if (aggregatedAliasSet.size === 0) {
              const fallbackAlias =
                typeof resolution.originalInput.originalText === 'string' &&
                resolution.originalInput.originalText.length > 0
                  ? resolution.originalInput.originalText
                  : resolution.normalizedName || '';
              if (fallbackAlias) {
                aggregatedAliasSet.add(fallbackAlias);
              }
            }

            const aggregatedAliases = Array.from(aggregatedAliasSet);
            resolution.validatedAliases = aggregatedAliases;

            if (!resolution.entityType) {
              this.logger.warn('Skipping new entity without type', {
                batchId,
                tempId: resolution.tempId,
                originalText: resolution.originalInput.originalText,
              });
              continue;
            }

            const entityType = resolution.entityType;

            const canonicalName = this.normalizeEntityName(
              resolution.normalizedName ||
                resolution.originalInput.originalText ||
                '',
              entityType,
            );
            resolution.normalizedName = canonicalName;
            let entityMarketKey: string;
            if (entityType === 'restaurant') {
              if (!resolvedMarketKey) {
                this.logger.warn(
                  'Skipping restaurant entity creation without resolved market',
                  {
                    batchId,
                    tempId: resolution.tempId,
                    normalizedName: canonicalName,
                    subreddit: sourceMetadata.subreddit ?? undefined,
                  },
                );
                continue;
              }
              entityMarketKey = resolvedMarketKey;
            } else {
              entityMarketKey = 'global';
            }

            const existing = await tx.entity.findFirst({
              where: {
                name: canonicalName,
                type: entityType,
                ...(entityType === 'restaurant'
                  ? {
                      marketPresences: {
                        some: { marketKey: entityMarketKey },
                      },
                    }
                  : {}),
              },
              select: {
                entityId: true,
                aliases: true,
                name: true,
              },
            });

            let entityId: string | null = null;
            let createdNew = false;

            if (existing) {
              entityId = existing.entityId;

              this.logger.warn(
                'Resolver indicated new entity but canonical record already exists',
                {
                  batchId,
                  tempId: resolution.tempId,
                  entityId,
                  entityType,
                  normalizedName: resolution.normalizedName,
                  originalText: resolution.originalInput.originalText,
                  canonicalName: existing.name,
                },
              );

              if (
                resolution.validatedAliases &&
                resolution.validatedAliases.length > 0
              ) {
                const mergedAliases = Array.from(
                  new Set([
                    ...(existing.aliases || []),
                    ...resolution.validatedAliases,
                  ]),
                );

                const aliasesChanged =
                  mergedAliases.length !== (existing.aliases || []).length;

                if (aliasesChanged) {
                  await tx.entity.update({
                    where: { entityId },
                    data: {
                      aliases: mergedAliases,
                      lastUpdated: new Date(),
                    },
                  });
                }
              }

              this.logger.debug(
                'Entity already existed; reusing canonical record',
                {
                  batchId,
                  tempId: resolution.tempId,
                  entityId,
                  entityType,
                  name: resolution.normalizedName,
                },
              );
            } else {
              const aliasSet =
                resolution.validatedAliases &&
                resolution.validatedAliases.length > 0
                  ? resolution.validatedAliases.map((alias) => alias.trim())
                  : [
                      (resolution.originalInput.originalText || '')
                        .trim()
                        .replace(/\s+/g, ' '),
                    ];

              const entityData: Prisma.EntityCreateInput = {
                name: this.normalizeEntityName(
                  resolution.normalizedName ||
                    resolution.originalInput.originalText ||
                    '',
                  entityType,
                ),
                type: entityType,
                aliases: Array.from(new Set(aliasSet.filter(Boolean))),
                createdAt: new Date(),
                lastUpdated: new Date(),
              };

              if (entityType === 'restaurant') {
                entityData.marketPresences = {
                  create: [{ marketKey: entityMarketKey }],
                };
                entityData.restaurantAttributes = { set: [] };
                entityData.restaurantQualityScore = 0;
                entityData.generalPraiseUpvotes = 0;
                entityData.restaurantMetadata = Prisma.DbNull;
                if (subredditLocation) {
                  entityData.latitude = new Prisma.Decimal(
                    subredditLocation.latitude.toFixed(8),
                  );
                  entityData.longitude = new Prisma.Decimal(
                    subredditLocation.longitude.toFixed(8),
                  );
                }
              } else {
                entityData.generalPraiseUpvotes = null;
              }

              const createdEntity = await tx.entity.create({
                data: entityData,
              });

              entityId = createdEntity.entityId;
              createdNew = true;

              if (entityType === 'restaurant') {
                const location = await tx.restaurantLocation.create({
                  data: {
                    restaurantId: createdEntity.entityId,
                    latitude: subredditLocation
                      ? new Prisma.Decimal(
                          subredditLocation.latitude.toFixed(8),
                        )
                      : null,
                    longitude: subredditLocation
                      ? new Prisma.Decimal(
                          subredditLocation.longitude.toFixed(8),
                        )
                      : null,
                    isPrimary: true,
                  },
                });

                await tx.entity.update({
                  where: { entityId: createdEntity.entityId },
                  data: { primaryLocationId: location.locationId },
                });
              }

              this.logger.debug('Created new entity during batch processing', {
                batchId,
                tempId: resolution.tempId,
                entityId,
                entityType,
                name: resolution.normalizedName,
              });

              createdEntitySummaries.push({
                entityId,
                name: resolution.normalizedName,
                entityType,
                primaryTempId: resolution.tempId,
                tempIds: tempGroup,
              });
              createdEntityIds.push(entityId);
            }

            if (!entityId) {
              throw UnifiedProcessingExceptionFactory.createEntityProcessingFailed(
                'Failed to resolve entity ID for new entity',
                undefined,
                {
                  batchId,
                  tempId: resolution.tempId,
                  normalizedName: resolution.normalizedName,
                  entityType,
                },
              );
            }

            tempIdToEntityIdMap.set(resolution.tempId, entityId);
            resolution.entityId = entityId;

            if (createdNew) {
              entitiesCreated++;
            }
          }

          // Propagate entity IDs to duplicates that reference a primary temp ID
          for (const resolution of resolutionResult.resolutionResults) {
            if (!resolution.entityId && resolution.primaryTempId) {
              const primaryEntityId = tempIdToEntityIdMap.get(
                resolution.primaryTempId,
              );
              if (primaryEntityId) {
                tempIdToEntityIdMap.set(resolution.tempId, primaryEntityId);
                resolution.entityId = primaryEntityId;
                this.logger.debug(
                  'Resolved duplicate new entity to primary entity ID',
                  {
                    batchId,
                    tempId: resolution.tempId,
                    primaryTempId: resolution.primaryTempId,
                    entityId: primaryEntityId,
                  },
                );
              }
            }
          }

          const restaurantMetadataOperations: RestaurantMetadataUpdateOperation[] =
            [];
          const affectedConnectionIds: string[] = [];
          const affectedRestaurantIds = new Set<string>();
          const restaurantEvents: RestaurantEventRecord[] = [];
          const restaurantEntityEvents: RestaurantEntityEventRecord[] = [];

          for (const mention of llmOutput.mentions) {
            const mentionResult = this.processConsolidatedMention(
              mention,
              tempIdToEntityIdMap,
              batchId,
              sourceMetadata.extractionTrace,
            );

            restaurantMetadataOperations.push(
              ...mentionResult.restaurantMetadataOperations,
            );
            affectedConnectionIds.push(...mentionResult.affectedConnectionIds);
            restaurantEvents.push(...mentionResult.restaurantEvents);
            restaurantEntityEvents.push(
              ...mentionResult.restaurantEntityEvents,
            );
            if (mentionResult.restaurantEntityId) {
              affectedRestaurantIds.add(mentionResult.restaurantEntityId);
            }
          }

          for (const metadataOperation of restaurantMetadataOperations) {
            await this.handleRestaurantMetadataUpdate(
              tx,
              metadataOperation,
              batchId,
            );
          }

          if (restaurantEvents.length > 0) {
            await this.recordRestaurantEvents(tx, restaurantEvents);
          }

          if (restaurantEntityEvents.length > 0) {
            await this.recordRestaurantEntityEvents(tx, restaurantEntityEvents);
          }

          return {
            entitiesCreated,
            connectionsCreated: 0,
            affectedConnectionIds: [...new Set(affectedConnectionIds)],
            affectedRestaurantIds: Array.from(affectedRestaurantIds),
            createdEntityIds,
            createdEntitySummaries,
            reusedEntitySummaries,
          };
        },
        { timeout: this.transactionTimeoutMs },
      );

      const processingTime = Date.now() - startTime;
      this.performanceMetrics.databaseOperations++;

      this.logger.info('Consolidated processing phase completed', {
        batchId,
        processingTimeMs: processingTime,
        ...result,
      });

      if (result.createdEntitySummaries?.length) {
        this.logger.debug('New entities persisted during batch', {
          batchId,
          count: result.createdEntitySummaries.length,
          names: result.createdEntitySummaries.map((summary) => summary.name),
        });
      }

      if (result.reusedEntitySummaries?.length) {
        this.logger.debug('Resolver reuse summaries', {
          batchId,
          count: result.reusedEntitySummaries.length,
          names: result.reusedEntitySummaries.map(
            (summary) => summary.canonicalName ?? summary.normalizedName,
          ),
        });
      }

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Consolidated processing phase failed', {
        batchId,
        processingTimeMs: processingTime,
        error: error instanceof Error ? error.message : String(error),
      });

      const errorCause = error instanceof Error ? error : undefined;

      throw UnifiedProcessingExceptionFactory.createDatabaseIntegrationFailed(
        `Database operations failed for batch ${batchId}`,
        errorCause,
        { batchId, mentionsCount: llmOutput.mentions.length },
      );
    }
  }

  /**
   * Consolidated Processing with retry logic (PRD approach)
   * Cached resolution results enable efficient retries
   */
  private async performConsolidatedProcessingWithRetry(
    llmOutput: EnrichedLLMOutputStructure,
    resolutionResult: BatchResolutionResult,
    sourceMetadata: SourceMetadata,
    batchId: string,
    maxRetries: number,
    sourceLedgerRecords: SourceLedgerRecord[],
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    affectedConnectionIds: string[];
    affectedRestaurantIds: string[];
  }> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug('Attempting consolidated processing', {
          batchId,
          attempt,
          maxRetries,
        });

        return await this.performConsolidatedProcessing(
          llmOutput,
          resolutionResult, // Cached resolution result - no re-resolution needed
          sourceMetadata,
          batchId,
          sourceLedgerRecords,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.warn('Consolidated processing attempt failed', {
          batchId,
          attempt,
          maxRetries,
          error: {
            message:
              lastError instanceof Error
                ? lastError.message
                : String(lastError),
            stack: lastError instanceof Error ? lastError.stack : undefined,
            name: lastError instanceof Error ? lastError.name : 'UnknownError',
          },
        });

        // Don't retry on certain types of errors
        if (this.isNonRetryableError(lastError)) {
          this.logger.error('Non-retryable error encountered', {
            batchId,
            attempt,
            error: {
              message:
                lastError instanceof Error
                  ? lastError.message
                  : String(lastError),
              stack: lastError instanceof Error ? lastError.stack : undefined,
              name:
                lastError instanceof Error ? lastError.name : 'UnknownError',
            },
          });
          throw lastError;
        }

        // Exponential backoff for retries
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          this.logger.debug('Retrying after delay', {
            batchId,
            attempt,
            delayMs,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.logger.error('All retry attempts exhausted', {
      batchId,
      maxRetries,
      finalError: lastError?.message || 'Unknown error',
    });
    throw lastError || new Error('All retry attempts exhausted');
  }

  /**
   * Check if error is non-retryable (e.g., validation errors)
   */
  private isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      'validation',
      'invalid',
      'malformed',
      'constraint violation',
      'duplicate key',
    ];

    const errorMessage = error.message.toLowerCase();
    return nonRetryablePatterns.some((pattern) =>
      errorMessage.includes(pattern),
    );
  }

  /**
   * Process individual mention with consolidated component logic (PRD 6.5)
   * Implements all 6 component processors inline within single processing phase
   */
  private processConsolidatedMention(
    mention: ProcessableMention,
    tempIdToEntityIdMap: Map<string, string>,
    batchId: string,
    extractionTrace: ExtractionTraceContext,
  ): {
    restaurantMetadataOperations: RestaurantMetadataUpdateOperation[];
    affectedConnectionIds: string[];
    restaurantEntityId: string;
    restaurantEvents: RestaurantEventRecord[];
    restaurantEntityEvents: RestaurantEntityEventRecord[];
  } {
    const restaurantMetadataOperations: RestaurantMetadataUpdateOperation[] =
      [];
    const affectedConnectionIds: string[] = [];
    const restaurantEvents: RestaurantEventRecord[] = [];
    const restaurantEntityEvents: RestaurantEntityEventRecord[] = [];

    try {
      // Validate required restaurant data
      const restaurantLookupKey = this.getRestaurantEntityLookupKey(mention);
      if (!restaurantLookupKey) {
        this.logger.warn('Restaurant entity key missing, skipping mention', {
          batchId,
          mentionTempId: mention.temp_id,
        });
        return {
          restaurantMetadataOperations: [],
          affectedConnectionIds: [],
          restaurantEntityId: '',
          restaurantEvents: [],
          restaurantEntityEvents: [],
        };
      }

      const restaurantEntityId = tempIdToEntityIdMap.get(restaurantLookupKey);
      if (!restaurantEntityId) {
        this.logger.warn('Restaurant entity not resolved, skipping mention', {
          batchId,
          mentionTempId: mention.temp_id,
          restaurantTempId: restaurantLookupKey,
        });
        return {
          restaurantMetadataOperations: [],
          affectedConnectionIds: [],
          restaurantEntityId: '',
          restaurantEvents: [],
          restaurantEntityEvents: [],
        };
      }

      const mentionCreatedAt = new Date(mention.source_created_at);

      const foodEntityLookupKey = this.getFoodEntityLookupKey(mention);

      // Resolve category entity IDs emitted by the LLM for this mention
      const categoryEntityIds: string[] = [];
      if (Array.isArray(mention.__foodCategoryTempIds)) {
        for (const categoryRef of mention.__foodCategoryTempIds) {
          if (categoryRef?.tempId) {
            const categoryEntityId = tempIdToEntityIdMap.get(
              categoryRef.tempId,
            );
            if (categoryEntityId) {
              categoryEntityIds.push(categoryEntityId);
            }
          }
        }
      }
      const uniqueCategoryEntityIds = Array.from(
        new Set(categoryEntityIds.filter(Boolean)),
      );
      const { inputId, sourceDocumentId, mentionKey } =
        this.getMentionProvenance(mention);

      // Resolve attribute entity IDs emitted by the LLM for this mention
      const foodAttributeNames: string[] = Array.isArray(
        mention.food_attributes,
      )
        ? mention.food_attributes
        : [];

      const foodAttributeIds: string[] = [];

      for (const attr of foodAttributeNames) {
        const tempId = this.buildAttributeTempId('food', attr);
        const attributeEntityId = tempIdToEntityIdMap.get(tempId);
        if (attributeEntityId) {
          foodAttributeIds.push(attributeEntityId);
        } else {
          this.logger.debug('Food attribute entity not resolved', {
            batchId,
            tempId,
            attribute: attr,
            mentionTempId: mention.temp_id,
          });
        }
      }

      const restaurantAttributeIds: string[] = [];

      if (
        mention.restaurant_attributes &&
        mention.restaurant_attributes.length > 0
      ) {
        // Get restaurant attribute entity IDs from tempIdToEntityIdMap
        for (const attr of mention.restaurant_attributes) {
          const tempId = this.buildAttributeTempId('restaurant', attr);
          const attributeEntityId = tempIdToEntityIdMap.get(tempId);
          if (attributeEntityId) {
            restaurantAttributeIds.push(attributeEntityId);
          }
        }

        // Add restaurant attributes to metadata operation
        if (restaurantAttributeIds.length > 0) {
          const metadataOperation: RestaurantMetadataUpdateOperation = {
            type: 'restaurant_metadata_update',
            restaurantEntityId: restaurantEntityId,
            attributeIds: restaurantAttributeIds,
          };
          restaurantMetadataOperations.push(metadataOperation);

          this.logger.debug(
            'Restaurant attributes queued for metadata update',
            {
              batchId,
              restaurantEntityId,
              attributeIds: restaurantAttributeIds,
            },
          );
        }
      }

      if (mention.general_praise) {
        this.logger.debug(
          'General praise detected; recording restaurant event only',
          {
            batchId,
            restaurantEntityId,
            upvotes: mention.source_ups,
          },
        );
      }

      if (inputId && sourceDocumentId && mention.general_praise) {
        restaurantEvents.push({
          extractionRunId: extractionTrace.extractionRunId,
          inputId,
          sourceDocumentId,
          restaurantId: restaurantEntityId,
          mentionKey,
          evidenceType: 'general_praise',
          mentionedAt: mentionCreatedAt,
          sourceUpvotes: mention.source_ups ?? 0,
          metadata: {},
        });
      }

      if (inputId && sourceDocumentId) {
        const foodEntityId = foodEntityLookupKey
          ? (tempIdToEntityIdMap.get(foodEntityLookupKey) ?? null)
          : null;

        if (foodEntityId) {
          restaurantEntityEvents.push({
            extractionRunId: extractionTrace.extractionRunId,
            inputId,
            sourceDocumentId,
            restaurantId: restaurantEntityId,
            mentionKey,
            entityId: foodEntityId,
            entityType: 'food',
            evidenceType:
              mention.is_menu_item === true ? 'menu_item_food' : 'food_mention',
            isMenuItem: mention.is_menu_item ?? null,
            mentionedAt: mentionCreatedAt,
            sourceUpvotes: mention.source_ups ?? 0,
            metadata: {},
          });
        }

        uniqueCategoryEntityIds.forEach((categoryId) => {
          restaurantEntityEvents.push({
            extractionRunId: extractionTrace.extractionRunId,
            inputId,
            sourceDocumentId,
            restaurantId: restaurantEntityId,
            mentionKey,
            entityId: categoryId,
            entityType: 'food',
            evidenceType: 'food_category',
            isMenuItem: mention.is_menu_item ?? null,
            mentionedAt: mentionCreatedAt,
            sourceUpvotes: mention.source_ups ?? 0,
            metadata: {},
          });
        });

        foodAttributeIds.forEach((attributeId) => {
          restaurantEntityEvents.push({
            extractionRunId: extractionTrace.extractionRunId,
            inputId,
            sourceDocumentId,
            restaurantId: restaurantEntityId,
            mentionKey,
            entityId: attributeId,
            entityType: 'food_attribute',
            evidenceType: 'food_attribute',
            isMenuItem: mention.is_menu_item ?? null,
            mentionedAt: mentionCreatedAt,
            sourceUpvotes: mention.source_ups ?? 0,
            metadata: {},
          });
        });

        restaurantAttributeIds.forEach((attributeId) => {
          restaurantEntityEvents.push({
            extractionRunId: extractionTrace.extractionRunId,
            inputId,
            sourceDocumentId,
            restaurantId: restaurantEntityId,
            mentionKey,
            entityId: attributeId,
            entityType: 'restaurant_attribute',
            evidenceType: 'restaurant_attribute',
            isMenuItem: null,
            mentionedAt: mentionCreatedAt,
            sourceUpvotes: mention.source_ups ?? 0,
            metadata: {},
          });
        });
      }

      return {
        restaurantMetadataOperations,
        affectedConnectionIds,
        restaurantEntityId,
        restaurantEvents,
        restaurantEntityEvents,
      };
    } catch (error) {
      this.logger.error('Failed to process consolidated mention', {
        batchId,
        mentionTempId: mention.temp_id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        restaurantMetadataOperations: [],
        affectedConnectionIds: [],
        restaurantEntityId: '',
        restaurantEvents: [],
        restaurantEntityEvents: [],
      };
    }
  }

  private async recordRestaurantEvents(
    tx: PrismaTransaction,
    events: RestaurantEventRecord[],
  ): Promise<void> {
    if (!events.length) {
      return;
    }

    await tx.restaurantEvent.createMany({
      data: events,
      skipDuplicates: true,
    });
  }

  private async recordRestaurantEntityEvents(
    tx: PrismaTransaction,
    events: RestaurantEntityEventRecord[],
  ): Promise<void> {
    if (!events.length) {
      return;
    }

    await tx.restaurantEntityEvent.createMany({
      data: events,
      skipDuplicates: true,
    });
  }

  /**
   * Handle restaurant attribute updates (Component 2 - PRD 6.5.1)
   * Stores restaurant_attribute entity IDs directly on the restaurant entity
   */
  private async handleRestaurantMetadataUpdate(
    tx: PrismaTransaction,
    operation: RestaurantMetadataUpdateOperation,
    batchId: string,
  ): Promise<void> {
    try {
      // Get current restaurant metadata
      const restaurant = await tx.entity.findUnique({
        where: { entityId: operation.restaurantEntityId },
        select: { restaurantAttributes: true },
      });

      if (!restaurant) {
        this.logger.error('Restaurant not found for metadata update', {
          batchId,
          restaurantEntityId: operation.restaurantEntityId,
        });
        return;
      }

      const existingAttributeIds = restaurant.restaurantAttributes || [];
      const updatedAttributeIds = [
        ...new Set([...existingAttributeIds, ...operation.attributeIds]),
      ];

      // Update restaurant entity with attribute IDs
      await tx.entity.update({
        where: { entityId: operation.restaurantEntityId },
        data: {
          restaurantAttributes: updatedAttributeIds,
          lastUpdated: new Date(),
        },
      });

      this.logger.debug('Restaurant attributes updated', {
        batchId,
        restaurantEntityId: operation.restaurantEntityId,
        attributeIds: operation.attributeIds,
      });
    } catch (error) {
      this.logger.error('Failed to handle restaurant metadata update', {
        batchId,
        restaurantEntityId: operation.restaurantEntityId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle General Praise Boost Operations (Component 3 - PRD 6.5.1)
   * Boost all existing food connections for this restaurant
   * PRD lines 1376-1381: Do not create food connections if none exist
   */
  // General praise handler removed by design; persistence handled at entity level

  /**
   * Trigger quality score updates using QualityScoreService (PRD Section 5.3)
   * Updates quality scores for all affected connections from component processing
   */
  private async triggerQualityScoreUpdates(
    affectedConnectionIds: string[],
    affectedRestaurantIds: string[] = [],
  ): Promise<void> {
    try {
      if (
        affectedConnectionIds.length === 0 &&
        affectedRestaurantIds.length === 0
      ) {
        this.logger.debug('No projections to update quality scores for');
        return;
      }

      this.logger.debug(
        `Triggering quality score refresh for ${affectedConnectionIds.length} connections and ${affectedRestaurantIds.length} restaurants`,
      );

      await this.projectionRebuildService.refreshQualityScores({
        connectionIds: affectedConnectionIds,
        restaurantIds: affectedRestaurantIds,
      });

      this.logger.info('Quality score refresh completed', {
        affectedConnectionIds: affectedConnectionIds.length,
        affectedRestaurantIds: affectedRestaurantIds.length,
      });
    } catch (error) {
      // Non-critical error - log and continue
      this.logger.error('Quality score refresh batch failed', {
        error: error instanceof Error ? error.message : String(error),
        affectedConnectionIds: affectedConnectionIds.length,
        affectedRestaurantIds: affectedRestaurantIds.length,
      });
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(
    processingTime: number,
    success: boolean,
  ): void {
    this.performanceMetrics.batchesProcessed++;
    this.performanceMetrics.totalProcessingTime += processingTime;
    this.performanceMetrics.averageProcessingTime =
      this.performanceMetrics.totalProcessingTime /
      this.performanceMetrics.batchesProcessed;

    if (success) {
      this.performanceMetrics.successfulLLMCalls++;
    } else {
      this.performanceMetrics.failedLLMCalls++;
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): ProcessingPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      batchesProcessed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      successfulLLMCalls: 0,
      failedLLMCalls: 0,
      entitiesResolved: 0,
      databaseOperations: 0,
      lastReset: new Date(),
    };
  }

  private resolvePipelineKey(collectionType?: string): string {
    if (!collectionType) {
      return 'unknown';
    }

    const normalized = collectionType.toLowerCase();
    switch (normalized) {
      case 'chronological':
      case 'archive':
      case 'keyword':
      case 'on-demand':
      case 'on_demand':
        return normalized.replace('_', '-');
      default:
        return normalized || 'unknown';
    }
  }

  private async prepareSourceLedgerRecords(
    mentions: ProcessableMention[],
    pipeline: string,
    defaultSubreddit?: string,
    skipDedupe?: boolean,
  ): Promise<{
    filteredMentions: ProcessableMention[];
    newRecordsBySourceId: Map<string, SourceLedgerRecord>;
    skippedCount: number;
  }> {
    if (!Array.isArray(mentions) || mentions.length === 0) {
      return {
        filteredMentions: [],
        newRecordsBySourceId: new Map(),
        skippedCount: 0,
      };
    }

    if (skipDedupe) {
      return {
        filteredMentions: [...mentions],
        newRecordsBySourceId: new Map(),
        skippedCount: 0,
      };
    }

    const normalizedPipeline = pipeline || 'unknown';
    const sourceIdSet = new Set<string>();

    for (const mention of mentions) {
      const sourceId = mention.source_id.trim();
      if (sourceId.length > 0) {
        sourceIdSet.add(sourceId);
      }
    }

    if (sourceIdSet.size === 0) {
      return {
        filteredMentions: [...mentions],
        newRecordsBySourceId: new Map(),
        skippedCount: 0,
      };
    }

    const sourceIds = Array.from(sourceIdSet);
    const existingRecords = await this.prismaService.processedSource.findMany({
      where: {
        pipeline: normalizedPipeline,
        sourceId: { in: sourceIds },
      },
      select: { sourceId: true },
    });

    const existingSet = new Set(
      existingRecords.map((record) => record.sourceId),
    );
    const newRecordsBySourceId = new Map<string, SourceLedgerRecord>();
    let skippedCount = existingSet.size;

    for (const mention of mentions) {
      const rawSourceId = mention.source_id.trim();

      if (!rawSourceId) {
        continue;
      }

      if (
        newRecordsBySourceId.has(rawSourceId) ||
        existingSet.has(rawSourceId)
      ) {
        continue;
      }

      let mentionSubreddit = '';
      if (typeof mention.subreddit === 'string') {
        mentionSubreddit = mention.subreddit.trim();
      }

      const subredditValue =
        mentionSubreddit.length > 0
          ? mentionSubreddit
          : (defaultSubreddit ?? null);

      newRecordsBySourceId.set(rawSourceId, {
        pipeline: normalizedPipeline,
        sourceId: rawSourceId,
        community: subredditValue,
        processedAt: new Date(),
      });
    }

    return {
      filteredMentions: [...mentions],
      newRecordsBySourceId,
      skippedCount,
    };
  }

  private collectLedgerRecordsForMentions(
    mentions: ProcessableMention[],
    ledgerMap: Map<string, SourceLedgerRecord>,
  ): SourceLedgerRecord[] {
    if (!ledgerMap || ledgerMap.size === 0 || !Array.isArray(mentions)) {
      return [];
    }

    const records: SourceLedgerRecord[] = [];
    const seen = new Set<string>();

    for (const mention of mentions) {
      const sourceId = mention.source_id.trim();
      if (!sourceId || seen.has(sourceId)) {
        continue;
      }

      const ledgerRecord = ledgerMap.get(sourceId);
      if (ledgerRecord) {
        records.push(ledgerRecord);
        seen.add(sourceId);
      }
    }

    return records;
  }

  private buildDefaultProcessingConfig(): UnifiedProcessingConfig {
    return {
      enableQualityScores: true,
      enableSourceAttribution: true,
      maxRetries: 3,
      batchTimeout: 300000, // 5 minutes
      batchSize: this.defaultBatchSize,
      skipSourceLedgerDedupe: false,
    };
  }

  private getNumericConfig(envKey: string, fallback: number): number {
    const raw = this.configService.get<string | number | undefined>(envKey);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }

    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private async resolveSubredditLocation(
    tx: PrismaTransaction | PrismaService,
    subreddit?: string | null,
  ): Promise<{ latitude: number; longitude: number } | null> {
    if (!subreddit || !subreddit.trim()) {
      return null;
    }

    const cacheKey = subreddit.trim().toLowerCase();
    const cached = this.getCachedValue(this.subredditLocationCache, cacheKey);
    if (cached) {
      return cached;
    }

    const resolvedMarketKey = await this.resolveMarketKey(subreddit);
    if (!resolvedMarketKey) {
      return null;
    }

    const marketRecord = await tx.market.findFirst({
      where: {
        marketKey: resolvedMarketKey,
        isActive: true,
      },
      select: {
        centerLatitude: true,
        centerLongitude: true,
      },
    });

    if (!marketRecord) {
      return null;
    }

    const latitude = this.toNumeric(marketRecord.centerLatitude);
    const longitude = this.toNumeric(marketRecord.centerLongitude);

    if (
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      typeof longitude === 'number' &&
      Number.isFinite(longitude)
    ) {
      const coords = { latitude, longitude };
      this.setCachedValue(this.subredditLocationCache, cacheKey, coords);
      return coords;
    }

    return null;
  }

  private async resolveMarketKey(
    subreddit?: string | null,
  ): Promise<string | null> {
    if (!subreddit || !subreddit.trim()) {
      return null;
    }

    const cacheKey = subreddit.trim().toLowerCase();
    const cached = this.getCachedValue(this.subredditMarketCache, cacheKey);
    if (cached) {
      return cached;
    }

    const mappedMarketKey =
      await this.marketRegistry.resolveMarketKeyForCommunity(subreddit);
    if (!mappedMarketKey) {
      return null;
    }

    this.setCachedValue(this.subredditMarketCache, cacheKey, mappedMarketKey);
    return mappedMarketKey;
  }

  private getCachedValue<T>(
    cache: Map<string, TimedCacheEntry<T>>,
    key: string,
  ): T | null {
    if (this.subredditCacheTtlMs <= 0 || this.subredditCacheMaxEntries <= 0) {
      return null;
    }

    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    // Refresh recency for hot keys (LRU-ish).
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
  }

  private setCachedValue<T>(
    cache: Map<string, TimedCacheEntry<T>>,
    key: string,
    value: T,
  ): void {
    if (this.subredditCacheTtlMs <= 0 || this.subredditCacheMaxEntries <= 0) {
      return;
    }

    cache.set(key, {
      value,
      expiresAt: Date.now() + this.subredditCacheTtlMs,
    });
    this.pruneCache(cache);
  }

  private pruneCache<T>(cache: Map<string, TimedCacheEntry<T>>): void {
    if (this.subredditCacheMaxEntries <= 0) {
      cache.clear();
      return;
    }

    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }

    while (cache.size > this.subredditCacheMaxEntries) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
    }
  }

  private toNumeric(
    value: Prisma.Decimal | number | null | undefined,
  ): number | null {
    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return null;
  }

  private async scheduleRestaurantEnrichment(
    summaries: CreatedEntitySummary[],
    sourceMetadata?: SourceMetadata,
  ): Promise<void> {
    if (!summaries.length) {
      return;
    }

    const restaurantIds = Array.from(
      new Set(
        summaries
          .filter((summary) => summary.entityType === 'restaurant')
          .map((summary) => summary.entityId),
      ),
    );

    if (!restaurantIds.length) {
      return;
    }

    const concurrency = Math.max(1, this.restaurantEnrichmentConcurrency);
    const enrichmentContext =
      await this.resolveRestaurantEnrichmentDispatchContext(
        sourceMetadata?.subreddit ?? null,
      );

    for (let index = 0; index < restaurantIds.length; index += concurrency) {
      const batch = restaurantIds.slice(index, index + concurrency);
      const enrichmentPromises = batch.map((entityId) =>
        this.restaurantLocationEnrichmentService
          .enrichRestaurantById(entityId, {
            locationBias: enrichmentContext.locationBias,
          })
          .catch((error) => {
            this.logger.warn('Restaurant enrichment failed', {
              entityId,
              error: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              },
            });
          }),
      );

      await Promise.all(enrichmentPromises);
    }
  }

  private async resolveRestaurantEnrichmentDispatchContext(
    subreddit?: string | null,
  ): Promise<RestaurantEnrichmentDispatchContext> {
    const preferredMarketKey = await this.resolveMarketKey(subreddit);
    const location = await this.resolveSubredditLocation(
      this.prismaService,
      subreddit,
    );

    if (!location) {
      return {};
    }

    const radiusMeters = preferredMarketKey
      ? await this.resolveMarketBiasRadiusMeters(preferredMarketKey)
      : undefined;

    return {
      locationBias: {
        lat: location.latitude,
        lng: location.longitude,
        radiusMeters,
      },
    };
  }

  private async resolveMarketBiasRadiusMeters(
    marketKey: string,
  ): Promise<number> {
    const market = await this.prismaService.market.findFirst({
      where: {
        marketKey: {
          equals: marketKey,
          mode: 'insensitive',
        },
        isActive: true,
      },
      select: {
        centerLatitude: true,
        centerLongitude: true,
        bboxNeLat: true,
        bboxNeLng: true,
        bboxSwLat: true,
        bboxSwLng: true,
      },
    });

    const centerLatitude = this.toNumeric(market?.centerLatitude);
    const centerLongitude = this.toNumeric(market?.centerLongitude);
    const northEastLat = this.toNumeric(market?.bboxNeLat);
    const northEastLng = this.toNumeric(market?.bboxNeLng);
    const southWestLat = this.toNumeric(market?.bboxSwLat);
    const southWestLng = this.toNumeric(market?.bboxSwLng);

    if (
      centerLatitude === null ||
      centerLongitude === null ||
      northEastLat === null ||
      northEastLng === null ||
      southWestLat === null ||
      southWestLng === null
    ) {
      throw new Error(
        `Missing market bbox/center for enrichment bias radius: ${marketKey}`,
      );
    }

    const northEastDistance = this.calculateDistanceMeters(
      { lat: centerLatitude, lng: centerLongitude },
      { lat: northEastLat, lng: northEastLng },
    );
    const southWestDistance = this.calculateDistanceMeters(
      { lat: centerLatitude, lng: centerLongitude },
      { lat: southWestLat, lng: southWestLng },
    );

    return Math.max(
      15000,
      Math.min(Math.max(northEastDistance, southWestDistance) + 5000, 50000),
    );
  }

  private calculateDistanceMeters(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
  ): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6371000;

    const originLatRad = toRadians(origin.lat);
    const destinationLatRad = toRadians(destination.lat);
    const deltaLat = toRadians(destination.lat - origin.lat);
    const deltaLng = toRadians(destination.lng - origin.lng);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(originLatRad) *
        Math.cos(destinationLatRad) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(earthRadiusMeters * c);
  }
}
