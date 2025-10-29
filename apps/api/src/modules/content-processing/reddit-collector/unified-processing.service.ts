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
import { Prisma } from '@prisma/client';
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
import { LLMOutputStructure } from '../../external-integrations/llm/llm.types';
import {
  EntityResolutionInput,
  BatchResolutionResult,
} from '../entity-resolver/entity-resolution.types';
import {
  UnifiedProcessingException,
  UnifiedProcessingExceptionFactory,
} from './unified-processing.exceptions';
import { RestaurantLocationEnrichmentService } from '../../restaurant-enrichment';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type OperationSummary = {
  affectedConnectionIds: string[];
  newConnectionIds: string[];
};

type CategoryBoostEvent = {
  restaurantId: string;
  categoryId: string;
  mentionCreatedAt: Date;
  upvotes: number;
  foodAttributeIds: string[];
};

type CategoryReplayKey = {
  restaurantId: string;
  categoryId: string;
};

type SourceLedgerRecord = Prisma.SourceCreateManyInput;

const createEmptySummary = (): OperationSummary => ({
  affectedConnectionIds: [],
  newConnectionIds: [],
});

const mergeIntoSummary = (
  target: OperationSummary,
  addition: OperationSummary | null | undefined,
) => {
  if (!addition) return;
  target.affectedConnectionIds.push(...addition.affectedConnectionIds);
  target.newConnectionIds.push(...addition.newConnectionIds);
};

const DEFAULT_UNIFIED_BATCH_SIZE = 250;
const DEFAULT_ENTITY_RESOLUTION_BATCH_SIZE = 100;

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

  constructor(
    private readonly prismaService: PrismaService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly qualityScoreService: QualityScoreService,
    private readonly configService: ConfigService,
    private readonly restaurantLocationEnrichmentService: RestaurantLocationEnrichmentService,
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
  }

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('UnifiedProcessingService');
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
      mentions: any[];
      sourceMetadata: {
        batchId: string;
        collectionType?: string;
        subreddit?: string;
        searchEntity?: string;
        sourceBreakdown: {
          pushshift_archive: number;
          reddit_api_chronological: number;
          reddit_api_keyword_search: number;
          reddit_api_on_demand: number;
        };
        temporalRange?: {
          earliest: number;
          latest: number;
        };
      };
    },
    config?: Partial<UnifiedProcessingConfig>,
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    affectedConnectionIds: string[];
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

      // Create LLM output structure for existing pipeline
      const llmOutput: LLMOutputStructure = { mentions: filteredMentions };

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

      return {
        entitiesCreated: batchResult.entityResolution?.newEntitiesCreated || 0,
        connectionsCreated:
          batchResult.databaseOperations?.connectionsCreated || 0,
        affectedConnectionIds:
          batchResult.databaseOperations?.affectedConnectionIds || [],
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

      this.logger.error('LLM output processing failed', {
        batchId,
        mentionsCount: filteredMentions.length,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        sourceBreakdown: sourceMetadata.sourceBreakdown,
      });

      throw UnifiedProcessingExceptionFactory.createProcessingFailed(
        `LLM output processing failed for batch ${batchId}`,
        error,
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
    llmOutput: LLMOutputStructure,
    sourceMetadata: any,
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

    this.scheduleRestaurantEnrichment(uniqueCreatedEntitySummaries);

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
    llmOutput: LLMOutputStructure,
    sourceMetadata: any,
    batchId: string,
    processingConfig: UnifiedProcessingConfig,
    ledgerRecordsBySourceId: Map<string, SourceLedgerRecord>,
    startTime: number,
  ): Promise<ProcessingResult> {
    // Step 4a: Entity Resolution (cached for retries)
    const entityResolutionInput = this.extractEntitiesFromLLMOutput(llmOutput);
    const resolutionResult = await this.entityResolutionService.resolveBatch(
      entityResolutionInput,
      {
        batchSize: this.entityResolutionBatchSize,
        enableFuzzyMatching: true,
      },
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

    // Step 6: Quality Score Updates (PRD Section 5.3)
    if (
      processingConfig.enableQualityScores &&
      databaseResult.affectedConnectionIds
    ) {
      await this.triggerQualityScoreUpdates(
        databaseResult.affectedConnectionIds,
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

  /**
   * Extract entities from LLM output for resolution
   * Converts LLM mentions to entity resolution input format
   */
  private extractEntitiesFromLLMOutput(
    llmOutput: LLMOutputStructure,
  ): EntityResolutionInput[] {
    const entities: EntityResolutionInput[] = [];

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
        // Restaurant entities (deterministic temp IDs)
        if (mention.restaurant) {
          const restaurantTempId = this.buildRestaurantTempId(mention);
          mention.__restaurantTempId = restaurantTempId;
          const restaurantSurface = getSurfaceString(
            mention.restaurant_surface,
            mention.restaurant,
          );
          entities.push({
            normalizedName: mention.restaurant,
            originalText: restaurantSurface,
            entityType: 'restaurant' as const,
            tempId: restaurantTempId,
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
            normalizedName: mention.food,
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
              normalizedName: category,
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
                normalizedName: attr,
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
                normalizedName: attr,
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
      throw UnifiedProcessingExceptionFactory.createEntityExtractionFailed(
        'Failed to extract entities from LLM output',
        error,
        { mentionsCount: llmOutput.mentions.length },
      );
    }
  }

  private normalizeForId(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }
    return value
      .toString()
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
    mention?: any,
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

  private buildRestaurantTempId(mention: any): string {
    const normalized = this.normalizeForId(mention?.restaurant);
    if (normalized) {
      return `restaurant::${normalized}`;
    }
    return this.createFallbackId('restaurant', mention);
  }

  private buildFoodEntityTempId(mention: any): string {
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

  private getRestaurantEntityLookupKey(mention: any): string | null {
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

  private getFoodEntityLookupKey(mention: any): string | null {
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

  /**
   * Single Consolidated Processing Phase - PRD Section 6.4
   * Performs all operations in-memory within one database transaction
   * Input: LLM output structure | Output: Direct database updates
   */
  private async performConsolidatedProcessing(
    llmOutput: LLMOutputStructure,
    resolutionResult: BatchResolutionResult,
    sourceMetadata: any,
    batchId: string,
    sourceLedgerRecords: SourceLedgerRecord[],
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    affectedConnectionIds: string[];
  }> {
    const startTime = Date.now();

    try {
      this.logger.debug('Starting consolidated processing phase', {
        batchId,
        mentionsCount: llmOutput.mentions.length,
        resolvedEntitiesCount: resolutionResult.resolutionResults.length,
      });

      // PRD 6.4: Single consolidated processing phase - all operations in-memory
      // Build temp_id to entity_id mapping from resolution result
      const tempIdToEntityIdMap = new Map<string, string>();
      const entityDetails =
        resolutionResult.entityDetails || new Map<string, any>();
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

      const categoryBoostEvents: CategoryBoostEvent[] = [];
      const categoryReplayMap = new Map<string, Set<string>>();

      // PRD 6.6.2: Single atomic transaction
      const result = await this.prismaService.$transaction(async (tx) => {
        this.logger.debug('Executing consolidated database transaction', {
          batchId,
          mentionsProcessed: llmOutput.mentions.length,
        });

        if (
          Array.isArray(sourceLedgerRecords) &&
          sourceLedgerRecords.length > 0
        ) {
          await tx.source.createMany({
            data: sourceLedgerRecords.map((record) => ({
              pipeline: record.pipeline,
              sourceId: record.sourceId,
              subreddit: record.subreddit ?? null,
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

            const originalSurface = groupResolution.originalInput?.originalText;
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

          const existing = await tx.entity.findUnique({
            where: {
              name_type: {
                name: resolution.normalizedName!,
                type: resolution.entityType!,
              },
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
                entityType: resolution.entityType,
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
                entityType: resolution.entityType,
                name: resolution.normalizedName,
              },
            );
          } else {
            const createdEntity = await tx.entity.create({
              data: {
                name: resolution.normalizedName!,
                type: resolution.entityType!,
                aliases:
                  resolution.validatedAliases &&
                  resolution.validatedAliases.length > 0
                    ? resolution.validatedAliases
                    : [resolution.originalInput.originalText],
                restaurantAttributes: [],
                restaurantQualityScore: 0,
                generalPraiseUpvotes:
                  resolution.entityType === 'restaurant' ? 0 : null,
                restaurantMetadata: {},
                createdAt: new Date(),
                lastUpdated: new Date(),
              },
            });

            entityId = createdEntity.entityId;
            createdNew = true;

            this.logger.debug('Created new entity during batch processing', {
              batchId,
              tempId: resolution.tempId,
              entityId,
              entityType: resolution.entityType,
              name: resolution.normalizedName,
            });

            createdEntitySummaries.push({
              entityId,
              name: resolution.normalizedName!,
              entityType: resolution.entityType!,
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
                entityType: resolution.entityType,
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

        const connectionOperations: any[] = [];
        const affectedConnectionIds: string[] = [];
        const restaurantPraiseUpvotes = new Map<string, number>();

        for (const mention of llmOutput.mentions) {
          const mentionResult = await this.processConsolidatedMention(
            mention,
            tempIdToEntityIdMap,
            entityDetails,
            batchId,
            sourceMetadata?.subreddit,
          );

          connectionOperations.push(...mentionResult.connectionOperations);
          affectedConnectionIds.push(...mentionResult.affectedConnectionIds);
          if (
            Array.isArray(mentionResult.categoryBoostEvents) &&
            mentionResult.categoryBoostEvents.length > 0
          ) {
            categoryBoostEvents.push(...mentionResult.categoryBoostEvents);
            for (const key of mentionResult.categoryReplayKeys) {
              if (!categoryReplayMap.has(key.restaurantId)) {
                categoryReplayMap.set(key.restaurantId, new Set());
              }
              categoryReplayMap.get(key.restaurantId)!.add(key.categoryId);
            }
          }

          if (mentionResult.generalPraiseUpvotes > 0) {
            const currentTotal =
              restaurantPraiseUpvotes.get(mentionResult.restaurantEntityId) ||
              0;
            restaurantPraiseUpvotes.set(
              mentionResult.restaurantEntityId,
              currentTotal + mentionResult.generalPraiseUpvotes,
            );
          }
        }

        // Execute all connection operations and collect affected connection IDs
        const additionalAffectedIds: string[] = [];
        let newConnectionsCreated = 0;

        const mergeSummaries = (
          summary: OperationSummary | null | undefined,
        ) => {
          if (!summary) return;
          additionalAffectedIds.push(...summary.affectedConnectionIds);
          newConnectionsCreated += summary.newConnectionIds.length;
        };

        for (const connectionOp of connectionOperations) {
          if (connectionOp.type === 'attribute_boost') {
            const summary = await this.handleAttributeBoost(
              tx,
              connectionOp,
              batchId,
            );
            mergeSummaries(summary);
          } else if (connectionOp.type === 'food_attribute_processing') {
            const summary = await this.handleFoodAttributeProcessing(
              tx,
              connectionOp,
              batchId,
            );
            mergeSummaries(summary);
          } else if (connectionOp.type === 'restaurant_metadata_update') {
            await this.handleRestaurantMetadataUpdate(
              tx,
              connectionOp,
              batchId,
            );
            // General praise no longer boosts connections; handled via entity-level upvote aggregation only
          } else if (connectionOp.type === 'general_praise_boost') {
            // No-op by design. General praise is persisted on the restaurant entity only.
          } else {
            // Regular upsert operation
            await tx.connection.upsert(connectionOp);
          }
        }

        if (categoryBoostEvents.length > 0) {
          await this.recordCategoryBoostEvents(
            tx,
            categoryBoostEvents,
            batchId,
          );
        }

        // Update restaurant entities with aggregated general praise upvotes
        for (const [restaurantEntityId, upvotes] of restaurantPraiseUpvotes) {
          if (upvotes && upvotes > 0) {
            await tx.entity.update({
              where: { entityId: restaurantEntityId },
              data: {
                generalPraiseUpvotes: { increment: upvotes },
                lastUpdated: new Date(),
              },
            });
          }
        }

        return {
          entitiesCreated,
          connectionsCreated: newConnectionsCreated,
          affectedConnectionIds: [
            ...new Set([...affectedConnectionIds, ...additionalAffectedIds]),
          ],
          createdEntityIds,
          createdEntitySummaries,
          reusedEntitySummaries,
        };
      });

      if (categoryReplayMap.size > 0) {
        const replayTargets = Array.from(categoryReplayMap.entries()).map(
          ([restaurantId, categorySet]) => ({
            restaurantId,
            categoryIds: Array.from(categorySet),
          }),
        );

        const replayedConnectionIds = await this.replayCategoryBoosts(
          replayTargets,
          batchId,
        );
        if (replayedConnectionIds.length > 0) {
          result.affectedConnectionIds = [
            ...new Set([
              ...(result.affectedConnectionIds || []),
              ...replayedConnectionIds,
            ]),
          ];
        }
      }

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

      throw UnifiedProcessingExceptionFactory.createDatabaseIntegrationFailed(
        `Database operations failed for batch ${batchId}`,
        error,
        { batchId, mentionsCount: llmOutput.mentions.length },
      );
    }
  }

  /**
   * Consolidated Processing with retry logic (PRD approach)
   * Cached resolution results enable efficient retries
   */
  private async performConsolidatedProcessingWithRetry(
    llmOutput: LLMOutputStructure,
    resolutionResult: BatchResolutionResult,
    sourceMetadata: any,
    batchId: string,
    maxRetries: number,
    sourceLedgerRecords: SourceLedgerRecord[],
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    affectedConnectionIds: string[];
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
  private async processConsolidatedMention(
    mention: any,
    tempIdToEntityIdMap: Map<string, string>,
    entityDetails: Map<string, any>,
    batchId: string,
    subredditFallback?: string,
  ): Promise<{
    connectionOperations: any[];
    categoryBoostEvents: CategoryBoostEvent[];
    categoryReplayKeys: CategoryReplayKey[];
    affectedConnectionIds: string[];
    generalPraiseUpvotes: number;
    restaurantEntityId: string;
  }> {
    const connectionOperations: any[] = [];
    const categoryBoostEvents: CategoryBoostEvent[] = [];
    const categoryReplayKeys: CategoryReplayKey[] = [];
    const affectedConnectionIds: string[] = [];

    try {
      // Validate required restaurant data
      const restaurantLookupKey = this.getRestaurantEntityLookupKey(mention);
      if (!restaurantLookupKey) {
        this.logger.warn('Restaurant entity key missing, skipping mention', {
          batchId,
          mentionTempId: mention.temp_id,
        });
        return {
          connectionOperations: [],
          categoryBoostEvents: [],
          categoryReplayKeys: [],
          affectedConnectionIds: [],
          generalPraiseUpvotes: 0,
          restaurantEntityId: '',
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
          connectionOperations: [],
          categoryBoostEvents: [],
          categoryReplayKeys: [],
          affectedConnectionIds: [],
          generalPraiseUpvotes: 0,
          restaurantEntityId: '',
        };
      }

      // PRD 6.4.2: Calculate time-weighted mention score
      const mentionCreatedAt = new Date(mention.source_created_at);
      const daysSince =
        (Date.now() - mentionCreatedAt.getTime()) / (1000 * 60 * 60 * 24);

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

      const hasFoodAttrs = foodAttributeIds.length > 0;

      // PRD 6.5 Component Processing Logic (inline implementation)

      // Component 1: Restaurant Entity (always processed)
      // PRD 6.6.3: Implement proper metric aggregation
      const isRecent = daysSince <= 30; // Within last 30 days

      // PRD 6.4.2: Activity level calculation
      let activityLevel = 'normal';
      if (daysSince <= 7) {
        activityLevel = 'active'; // 🕐 active if within 7 days
      }
      // Note: "trending" (🔥) requires checking if ALL top mentions are within 30 days
      // This will be calculated in Step 6 quality score updates

      // Component 1: Restaurant Entity (always processed)
      // Note: Component 1 processes restaurant entities, not connections
      // Restaurant entity processing is handled by entity resolution
      // No restaurant→restaurant connections needed per PRD architecture

      // Component 2: Restaurant Attributes (when present)
      // PRD 6.5.1: Add restaurant_attribute entity IDs to restaurant entity's metadata
      if (
        mention.restaurant_attributes &&
        mention.restaurant_attributes.length > 0
      ) {
        // Get restaurant attribute entity IDs from tempIdToEntityIdMap
        const restaurantAttributeIds: string[] = [];
        for (const attr of mention.restaurant_attributes) {
          const tempId = this.buildAttributeTempId('restaurant', attr);
          const attributeEntityId = tempIdToEntityIdMap.get(tempId);
          if (attributeEntityId) {
            restaurantAttributeIds.push(attributeEntityId);
          }
        }

        // Add restaurant attributes to metadata operation
        if (restaurantAttributeIds.length > 0) {
          connectionOperations.push({
            type: 'restaurant_metadata_update',
            restaurantEntityId: restaurantEntityId,
            attributeIds: restaurantAttributeIds,
          });

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

      // Component 3: General Praise (when general_praise is true)
      // Updated design: Only increment restaurant.generalPraiseUpvotes (no connection boosts or mentions)
      if (mention.general_praise) {
        this.logger.debug(
          'General praise detected; aggregating restaurant upvotes only',
          {
            batchId,
            restaurantEntityId,
            upvotes: mention.source_ups,
          },
        );
      }
      const generalPraiseUpvotes = mention.general_praise
        ? mention.source_ups
        : 0;

      // Component 4: Specific Food Processing (when food + is_menu_item = true)
      // PRD 6.5.3: Complex attribute logic for specific foods
      // PRD 6.5.2: Always create connections for specific foods
      if (foodEntityLookupKey && mention.is_menu_item === true) {
        const foodEntityId = tempIdToEntityIdMap.get(foodEntityLookupKey);
        if (foodEntityId) {
          // Always use food_attribute_processing for consistent handling
          // PRD 6.5.1 Component 4: Clear distinction between boost existing vs create new
          // The handler will check for existing connections and decide whether to boost or create
          const foodAttributeOperation = {
            type: 'food_attribute_processing',
            restaurantEntityId,
            foodEntityId: foodEntityId,
            upvotes: mention.source_ups,
            isRecent,
            mentionCreatedAt,
            activityLevel,
            foodAttributeIds: [...foodAttributeIds],
            foodAttributeNames: [...foodAttributeNames],
            hasFoodAttrs,
            allowCreate: true, // Component 4 always allows creation of new connections
            categoryEntityIds,
          };
          connectionOperations.push(foodAttributeOperation);

          this.logger.debug('Component 4: Specific food processing queued', {
            batchId,
            restaurantEntityId,
            foodEntityId: foodEntityId,
            hasFoodAttrs,
          });
        }
      }

      // Category boosts now recorded as events for later replay and aggregation.
      if (
        uniqueCategoryEntityIds.length > 0 &&
        (mention.is_menu_item === false || !foodEntityLookupKey)
      ) {
        for (const categoryId of uniqueCategoryEntityIds) {
          categoryBoostEvents.push({
            restaurantId: restaurantEntityId,
            categoryId,
            mentionCreatedAt,
            upvotes: mention.source_ups ?? 0,
            foodAttributeIds: [...foodAttributeIds],
          });
          categoryReplayKeys.push({
            restaurantId: restaurantEntityId,
            categoryId,
          });
        }

        this.logger.debug('Category boost events queued for replay', {
          batchId,
          restaurantEntityId,
          categoryIds: uniqueCategoryEntityIds,
          hasFoodAttrs,
          foodAttributeNames,
        });
      }

      // Component 6: Attribute-Only Processing (when no food but food_attributes present)
      // PRD 6.5.1: Find existing food connections with ANY overlapping attributes
      // PRD 6.5.2: Never create attribute connections - only boost existing ones
      if (!foodEntityLookupKey && hasFoodAttrs) {
        const attributeBoostOperation = {
          type: 'attribute_boost',
          restaurantEntityId,
          upvotes: mention.source_ups,
          isRecent,
          mentionCreatedAt,
          activityLevel,
          foodAttributeIds: [...foodAttributeIds],
          foodAttributeNames: [...foodAttributeNames],
          categoryEntityIds,
        };
        connectionOperations.push(attributeBoostOperation);
      }

      // Store general praise upvotes for later restaurant entity update
      // This will be aggregated and applied in the main transaction

      return {
        connectionOperations,
        categoryBoostEvents,
        categoryReplayKeys,
        affectedConnectionIds,
        generalPraiseUpvotes,
        restaurantEntityId,
      };
    } catch (error) {
      this.logger.error('Failed to process consolidated mention', {
        batchId,
        mentionTempId: mention.temp_id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        connectionOperations: [],
        categoryBoostEvents: [],
        categoryReplayKeys: [],
        affectedConnectionIds: [],
        generalPraiseUpvotes: 0,
        restaurantEntityId: '',
      };
    }
  }

  /**
   * Handle Attribute Boost Operations (Component 6 - PRD 6.5.1)
   * Find existing food connections with matching attributes
   * Returns array of affected connection IDs for top mentions update
   */
  private async handleAttributeBoost(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<OperationSummary> {
    const summary = createEmptySummary();

    try {
      if (
        !operation.foodAttributeIds ||
        !Array.isArray(operation.foodAttributeIds) ||
        operation.foodAttributeIds.length === 0
      ) {
        this.logger.debug(
          'No food attributes provided for attribute boost - skipping',
          {
            batchId,
            restaurantId: operation.restaurantEntityId,
          },
        );
        return summary;
      }

      const existingConnections = await tx.connection.findMany({
        where: {
          restaurantId: operation.restaurantEntityId,
          foodAttributes: { hasSome: operation.foodAttributeIds },
        },
      });

      if (existingConnections.length === 0) {
        this.logger.debug(
          'No existing connections found for attribute boost - skipping',
          {
            batchId,
            restaurantId: operation.restaurantEntityId,
            attributes: operation.foodAttributeNames,
          },
        );
        return summary;
      }

      for (const connection of existingConnections) {
        summary.affectedConnectionIds.push(connection.connectionId);

        const decayUpdate = this.computeDecayedScoreUpdate(
          connection,
          operation.mentionCreatedAt,
          1,
          operation.upvotes ?? 0,
        );

        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: {
            mentionCount: { increment: 1 },
            totalUpvotes: { increment: operation.upvotes ?? 0 },
            recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
            lastMentionedAt:
              operation.mentionCreatedAt > connection.lastMentionedAt
                ? operation.mentionCreatedAt
                : undefined,
            activityLevel: operation.activityLevel,
            lastUpdated: new Date(),
            decayedMentionScore: decayUpdate.decayedMentionScore,
            decayedUpvoteScore: decayUpdate.decayedUpvoteScore,
            decayedScoresUpdatedAt: decayUpdate.decayedScoresUpdatedAt,
            ...(Array.isArray(operation.foodAttributeIds) &&
            operation.foodAttributeIds.length > 0
              ? {
                  foodAttributes: [
                    ...new Set([
                      ...(connection.foodAttributes || []),
                      ...operation.foodAttributeIds,
                    ]),
                  ],
                }
              : {}),
          },
        });

        this.logger.debug('Boosted existing attribute connection', {
          batchId,
          connectionId: connection.connectionId,
          attributes: operation.foodAttributeNames,
        });
      }

      return summary;
    } catch (error) {
      this.logger.error('Failed to handle attribute boost', {
        batchId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return summary;
    }
  }

  /**
   * Handle Food Attribute Processing (Component 4 - PRD 6.5.3)
   * Uses unified OR-matching logic for food attributes
   * PRD 6.5.2: Always creates connections for specific foods (is_menu_item = true)
   */
  private async handleFoodAttributeProcessing(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<OperationSummary> {
    const summary = createEmptySummary();

    try {
      const { hasFoodAttrs } = operation;

      if (hasFoodAttrs) {
        mergeIntoSummary(
          summary,
          await this.handleFoodAttributes(tx, operation, batchId),
        );
      } else {
        mergeIntoSummary(
          summary,
          await this.handleSimpleFoodConnection(tx, operation, batchId),
        );
      }

      return summary;
    } catch (error) {
      this.logger.error('Failed to handle food attribute processing', {
        batchId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return summary;
    }
  }

  /**
   * Handle Simple Food Connection without attributes (PRD 6.5.2)
   * Find or create restaurant→food connection and boost it
   */
  private async handleSimpleFoodConnection(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<OperationSummary> {
    const summary = createEmptySummary();

    const existingConnection = await tx.connection.findFirst({
      where: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
      },
    });

    if (existingConnection) {
      summary.affectedConnectionIds.push(existingConnection.connectionId);
      await this.boostConnection(tx, existingConnection, operation);
    } else {
      mergeIntoSummary(
        summary,
        await this.createNewFoodConnection(tx, operation, []),
      );

      this.logger.debug('Created new simple food connection', {
        batchId,
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
      });
    }

    return summary;
  }

  private async handleFoodAttributes(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<OperationSummary> {
    const summary = createEmptySummary();

    if (
      !operation.foodAttributeIds ||
      !Array.isArray(operation.foodAttributeIds) ||
      operation.foodAttributeIds.length === 0
    ) {
      this.logger.debug(
        'No food attributes provided for attribute processing - falling back to simple handling',
        { batchId },
      );
      mergeIntoSummary(
        summary,
        await this.handleSimpleFoodConnection(tx, operation, batchId),
      );
      return summary;
    }

    const existingConnections = await tx.connection.findMany({
      where: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
        foodAttributes: { hasSome: operation.foodAttributeIds },
      },
    });

    if (existingConnections.length > 0) {
      for (const connection of existingConnections) {
        summary.affectedConnectionIds.push(connection.connectionId);
        await this.boostConnection(tx, connection, operation, {
          additionalAttributeIds: operation.foodAttributeIds,
        });
      }
      return summary;
    }

    mergeIntoSummary(
      summary,
      await this.createNewFoodConnection(
        tx,
        operation,
        operation.foodAttributeIds,
      ),
    );
    return summary;
  }

  private async boostConnection(
    tx: any,
    connection: any,
    operation: any,
    options: { additionalAttributeIds?: string[] } = {},
  ): Promise<void> {
    const decayUpdate = this.computeDecayedScoreUpdate(
      connection,
      operation.mentionCreatedAt,
      1,
      operation.upvotes ?? 0,
    );

    const updateData: any = {
      mentionCount: { increment: 1 },
      totalUpvotes: { increment: operation.upvotes ?? 0 },
      recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
      lastMentionedAt:
        operation.mentionCreatedAt > connection.lastMentionedAt
          ? operation.mentionCreatedAt
          : undefined,
      activityLevel: operation.activityLevel,
      lastUpdated: new Date(),
      decayedMentionScore: decayUpdate.decayedMentionScore,
      decayedUpvoteScore: decayUpdate.decayedUpvoteScore,
      decayedScoresUpdatedAt: decayUpdate.decayedScoresUpdatedAt,
    };

    if (
      Array.isArray(operation.categoryEntityIds) &&
      operation.categoryEntityIds.length > 0
    ) {
      const existingCategories = connection.categories || [];
      const mergedCategories = [
        ...new Set([...existingCategories, ...operation.categoryEntityIds]),
      ];
      updateData.categories = mergedCategories;
    }

    if (
      Array.isArray(options.additionalAttributeIds) &&
      options.additionalAttributeIds.length > 0
    ) {
      const existingAttributes = connection.foodAttributes || [];
      const mergedAttributes = [
        ...new Set([...existingAttributes, ...options.additionalAttributeIds]),
      ];
      updateData.foodAttributes = mergedAttributes;
    }

    await tx.connection.update({
      where: { connectionId: connection.connectionId },
      data: updateData,
    });
  }

  private computeDecayedScoreUpdate(
    connection: any,
    mentionCreatedAtInput: Date | string | undefined,
    mentionWeight = 1,
    upvoteIncrement = 0,
  ): {
    decayedMentionScore: number;
    decayedUpvoteScore: number;
    decayedScoresUpdatedAt: Date;
  } {
    const config = this.qualityScoreService.getConfig();

    let mentionCreatedAt =
      mentionCreatedAtInput instanceof Date
        ? mentionCreatedAtInput
        : new Date(mentionCreatedAtInput || Date.now());
    if (Number.isNaN(mentionCreatedAt.getTime())) {
      mentionCreatedAt = new Date();
    }

    const lastUpdatedRaw =
      connection.decayedScoresUpdatedAt ||
      connection.lastMentionedAt ||
      connection.createdAt ||
      mentionCreatedAt;
    const lastUpdatedAt =
      lastUpdatedRaw instanceof Date
        ? lastUpdatedRaw
        : new Date(lastUpdatedRaw);

    const deltaMs = Math.max(
      0,
      mentionCreatedAt.getTime() - lastUpdatedAt.getTime(),
    );

    const mentionDecayMs = Math.max(
      1,
      config.timeDecay.mentionCountDecayDays * MS_PER_DAY,
    );
    const upvoteDecayMs = Math.max(
      1,
      config.timeDecay.upvoteDecayDays * MS_PER_DAY,
    );

    const mentionDecayFactor = Math.exp(-deltaMs / mentionDecayMs);
    const upvoteDecayFactor = Math.exp(-deltaMs / upvoteDecayMs);

    const previousMentionScore = Number(connection.decayedMentionScore ?? 0);
    const previousUpvoteScore = Number(connection.decayedUpvoteScore ?? 0);

    const decayedMentionScore =
      previousMentionScore * mentionDecayFactor + Math.max(0, mentionWeight);
    const decayedUpvoteScore =
      previousUpvoteScore * upvoteDecayFactor + Math.max(0, upvoteIncrement);

    return {
      decayedMentionScore,
      decayedUpvoteScore,
      decayedScoresUpdatedAt: mentionCreatedAt,
    };
  }

  private async createNewFoodConnection(
    tx: any,
    operation: any,
    attributes: string[],
  ): Promise<OperationSummary> {
    const summary = createEmptySummary();
    const uniqueCategories = Array.isArray(operation.categoryEntityIds)
      ? Array.from(new Set(operation.categoryEntityIds))
      : [];
    const uniqueAttributes = Array.from(new Set(attributes));

    const upvoteValue = operation.upvotes ?? 0;
    const mentionCreatedAt = operation.mentionCreatedAt
      ? new Date(operation.mentionCreatedAt)
      : new Date();

    const newConnection = await tx.connection.create({
      data: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
        categories: uniqueCategories,
        foodAttributes: uniqueAttributes,
        mentionCount: 1,
        totalUpvotes: upvoteValue,
        recentMentionCount: operation.isRecent ? 1 : 0,
        lastMentionedAt: mentionCreatedAt,
        activityLevel: operation.activityLevel,
        // Seed with 0 and let the quality score batch recompute the final value
        foodQualityScore: 0,
        lastUpdated: new Date(),
        createdAt: new Date(),
        decayedMentionScore: 1,
        decayedUpvoteScore: Math.max(0, upvoteValue),
        decayedScoresUpdatedAt: mentionCreatedAt,
      },
    });

    this.logger.debug('Created new food connection', {
      restaurantId: operation.restaurantEntityId,
      foodId: operation.foodEntityId,
      attributeIds: uniqueAttributes,
      foodAttributeNames: operation.foodAttributeNames || [],
    });

    summary.affectedConnectionIds.push(newConnection.connectionId);
    summary.newConnectionIds.push(newConnection.connectionId);

    return summary;
  }

  private async recordCategoryBoostEvents(
    tx: any,
    events: CategoryBoostEvent[],
    batchId: string,
  ): Promise<void> {
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    const sortedEvents = [...events].sort(
      (a, b) => a.mentionCreatedAt.getTime() - b.mentionCreatedAt.getTime(),
    );

    await tx.boost.createMany({
      data: sortedEvents.map((event) => ({
        restaurantId: event.restaurantId,
        categoryId: event.categoryId,
        foodAttributeIds: Array.from(new Set(event.foodAttributeIds || [])),
        mentionCreatedAt: event.mentionCreatedAt,
        upvotes: event.upvotes ?? 0,
      })),
    });

    for (const event of sortedEvents) {
      await this.applyCategoryAggregateUpdate(tx, event);
    }

    this.logger.debug('Category boost events recorded', {
      batchId,
      count: sortedEvents.length,
      restaurantIds: Array.from(
        new Set(sortedEvents.map((event) => event.restaurantId)),
      ),
    });
  }

  private async applyCategoryAggregateUpdate(
    tx: any,
    event: CategoryBoostEvent,
  ): Promise<void> {
    const mentionCreatedAt =
      event.mentionCreatedAt instanceof Date
        ? event.mentionCreatedAt
        : new Date(event.mentionCreatedAt);
    const upvotes = event.upvotes ?? 0;

    const existing = await tx.categoryAggregate.findUnique({
      where: {
        restaurantId_categoryId: {
          restaurantId: event.restaurantId,
          categoryId: event.categoryId,
        },
      },
    });

    if (!existing) {
      await tx.categoryAggregate.create({
        data: {
          restaurantId: event.restaurantId,
          categoryId: event.categoryId,
          mentionsCount: 1,
          totalUpvotes: upvotes,
          firstMentionedAt: mentionCreatedAt,
          lastMentionedAt: mentionCreatedAt,
          decayedMentionScore: 1,
          decayedUpvoteScore: Math.max(0, upvotes),
          decayedScoresUpdatedAt: mentionCreatedAt,
        },
      });
      return;
    }

    const update = this.computeDecayedScoreUpdate(
      {
        decayedMentionScore: existing.decayedMentionScore,
        decayedUpvoteScore: existing.decayedUpvoteScore,
        decayedScoresUpdatedAt:
          existing.decayedScoresUpdatedAt ??
          existing.lastMentionedAt ??
          existing.firstMentionedAt,
        lastMentionedAt: existing.lastMentionedAt,
        createdAt: existing.firstMentionedAt,
      },
      mentionCreatedAt,
      1,
      upvotes,
    );

    const nextLastMentionedAt =
      mentionCreatedAt > existing.lastMentionedAt
        ? mentionCreatedAt
        : existing.lastMentionedAt;

    await tx.categoryAggregate.update({
      where: {
        restaurantId_categoryId: {
          restaurantId: event.restaurantId,
          categoryId: event.categoryId,
        },
      },
      data: {
        mentionsCount: { increment: 1 },
        totalUpvotes: { increment: upvotes },
        lastMentionedAt: nextLastMentionedAt,
        decayedMentionScore: update.decayedMentionScore,
        decayedUpvoteScore: update.decayedUpvoteScore,
        decayedScoresUpdatedAt: update.decayedScoresUpdatedAt,
      },
    });
  }

  private async replayCategoryBoosts(
    targets: { restaurantId: string; categoryIds: string[] }[],
    batchId: string,
  ): Promise<string[]> {
    if (!Array.isArray(targets) || targets.length === 0) {
      return [];
    }

    const affectedConnectionIds: string[] = [];
    const config = this.qualityScoreService.getConfig();
    const recentThresholdMs =
      config.timeDecay.recentMentionThresholdDays * MS_PER_DAY;
    const activeThresholdMs = 7 * MS_PER_DAY;
    const now = Date.now();

    for (const { restaurantId } of targets) {
      try {
        const connections = await this.prismaService.connection.findMany({
          where: {
            restaurantId,
          },
        });

        if (connections.length === 0) {
          continue;
        }

        let minLastApplied: Date | null = null;
        for (const connection of connections) {
          if (!connection.boostLastAppliedAt) {
            minLastApplied = null;
            break;
          }
          if (
            !minLastApplied ||
            connection.boostLastAppliedAt < minLastApplied
          ) {
            minLastApplied = connection.boostLastAppliedAt;
          }
        }

        const events = await this.prismaService.boost.findMany({
          where: {
            restaurantId,
            ...(minLastApplied
              ? { mentionCreatedAt: { gt: minLastApplied } }
              : {}),
          },
          orderBy: { mentionCreatedAt: 'asc' },
        });

        if (events.length === 0) {
          continue;
        }

        for (const connection of connections) {
          const connectionCategorySet = new Set(connection.categories || []);
          if (connectionCategorySet.size === 0) {
            continue;
          }

          const relevantEvents = events.filter((event) =>
            connectionCategorySet.has(event.categoryId),
          );

          if (relevantEvents.length === 0) {
            continue;
          }

          const connectionAttributes = new Set(connection.foodAttributes || []);

          let mentionIncrement = 0;
          let upvoteIncrement = 0;
          let recentIncrement = 0;
          let latestAppliedAt: Date | null = null;
          let latestProcessedAt: Date | null = null;
          let activityLevel: string | null = null;
          const attributeMerge = new Set(connection.foodAttributes || []);

          let decayedMentionScore = Number(connection.decayedMentionScore ?? 0);
          let decayedUpvoteScore = Number(connection.decayedUpvoteScore ?? 0);
          let decayedScoresUpdatedAt =
            connection.decayedScoresUpdatedAt ||
            connection.lastMentionedAt ||
            connection.createdAt;
          let lastMentionedAt =
            connection.lastMentionedAt || connection.createdAt;

          for (const event of relevantEvents) {
            const eventTime =
              event.mentionCreatedAt instanceof Date
                ? event.mentionCreatedAt
                : new Date(event.mentionCreatedAt);
            if (
              !latestProcessedAt ||
              eventTime.getTime() > latestProcessedAt.getTime()
            ) {
              latestProcessedAt = eventTime;
            }

            if (
              connection.boostLastAppliedAt &&
              eventTime.getTime() <= connection.boostLastAppliedAt.getTime()
            ) {
              continue;
            }

            const eventAttributes = Array.isArray(event.foodAttributeIds)
              ? event.foodAttributeIds
              : [];
            if (
              eventAttributes.length > 0 &&
              !eventAttributes.some((attr) => connectionAttributes.has(attr))
            ) {
              continue;
            }

            const synthetic = {
              decayedMentionScore,
              decayedUpvoteScore,
              decayedScoresUpdatedAt,
              lastMentionedAt,
              createdAt: connection.createdAt,
            };

            const update = this.computeDecayedScoreUpdate(
              synthetic,
              eventTime,
              1,
              event.upvotes ?? 0,
            );

            decayedMentionScore = update.decayedMentionScore;
            decayedUpvoteScore = update.decayedUpvoteScore;
            decayedScoresUpdatedAt = update.decayedScoresUpdatedAt;
            if (eventTime.getTime() > lastMentionedAt.getTime()) {
              lastMentionedAt = eventTime;
            }

            mentionIncrement += 1;
            upvoteIncrement += event.upvotes ?? 0;

            if (now - eventTime.getTime() <= recentThresholdMs) {
              recentIncrement += 1;
            }

            if (eventAttributes.length > 0) {
              eventAttributes.forEach((attr) => attributeMerge.add(attr));
            }

            if (now - eventTime.getTime() <= activeThresholdMs) {
              activityLevel =
                connection.activityLevel === 'trending' ? 'trending' : 'active';
            }

            if (
              !latestAppliedAt ||
              eventTime.getTime() > latestAppliedAt.getTime()
            ) {
              latestAppliedAt = eventTime;
            }
          }

          if (!latestProcessedAt) {
            continue;
          }

          const previousBoostApplied = connection.boostLastAppliedAt
            ? connection.boostLastAppliedAt.getTime()
            : 0;
          const latestProcessedTime = latestProcessedAt.getTime();

          const updateData: any = {
            lastUpdated: new Date(),
            boostLastAppliedAt:
              latestProcessedTime > previousBoostApplied
                ? latestProcessedAt
                : connection.boostLastAppliedAt,
          };

          if (mentionIncrement > 0) {
            updateData.mentionCount = { increment: mentionIncrement };
            updateData.totalUpvotes = { increment: upvoteIncrement };
            if (recentIncrement > 0) {
              updateData.recentMentionCount = { increment: recentIncrement };
            }
            updateData.decayedMentionScore = decayedMentionScore;
            updateData.decayedUpvoteScore = decayedUpvoteScore;
            updateData.decayedScoresUpdatedAt = decayedScoresUpdatedAt;
            if (
              latestAppliedAt &&
              (!connection.lastMentionedAt ||
                latestAppliedAt > connection.lastMentionedAt)
            ) {
              updateData.lastMentionedAt = latestAppliedAt;
            }
            if (attributeMerge.size !== connectionAttributes.size) {
              updateData.foodAttributes = Array.from(attributeMerge);
            }
            if (activityLevel && activityLevel !== connection.activityLevel) {
              updateData.activityLevel = activityLevel;
            }

            await this.prismaService.connection.update({
              where: { connectionId: connection.connectionId },
              data: updateData,
            });
            affectedConnectionIds.push(connection.connectionId);
          } else if (
            updateData.boostLastAppliedAt &&
            updateData.boostLastAppliedAt !== connection.boostLastAppliedAt
          ) {
            await this.prismaService.connection.update({
              where: { connectionId: connection.connectionId },
              data: {
                boostLastAppliedAt: updateData.boostLastAppliedAt,
                lastUpdated: new Date(),
              },
            });
          }
        }
      } catch (error) {
        this.logger.error('Failed to replay category boosts', {
          batchId,
          restaurantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return affectedConnectionIds;
  }

  /**
   * Handle restaurant attribute updates (Component 2 - PRD 6.5.1)
   * Stores restaurant_attribute entity IDs directly on the restaurant entity
   */
  private async handleRestaurantMetadataUpdate(
    tx: any,
    operation: any,
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
  ): Promise<void> {
    try {
      if (affectedConnectionIds.length === 0) {
        this.logger.debug('No connections to update quality scores for');
        return;
      }

      this.logger.debug(
        `Triggering quality score updates for ${affectedConnectionIds.length} connections`,
      );

      const updateResult =
        await this.qualityScoreService.updateQualityScoresForConnections(
          affectedConnectionIds,
        );

      this.logger.info('Quality score updates completed', {
        connectionsUpdated: updateResult.connectionsUpdated,
        restaurantsUpdated: updateResult.restaurantsUpdated,
        errors: updateResult.errors.length,
        averageTimeMs: updateResult.averageProcessingTimeMs,
      });

      if (updateResult.errors.length > 0) {
        this.logger.warn('Some quality score updates failed', {
          errorCount: updateResult.errors.length,
          errors: updateResult.errors.slice(0, 5), // Log first 5 errors
        });
      }
    } catch (error) {
      // Non-critical error - log and continue
      this.logger.error('Quality score update batch failed', {
        error: error instanceof Error ? error.message : String(error),
        affectedConnectionIds: affectedConnectionIds.length,
      });
    }
  }

  /**
   * Extract connection IDs from component processing results
   * Used to trigger quality score updates for affected connections
   */
  private extractConnectionIdsFromComponentResults(
    componentResults: any[],
  ): string[] {
    const connectionIds = new Set<string>();

    for (const result of componentResults) {
      if (result.operations) {
        for (const operation of result.operations) {
          if (operation.connectionId) {
            connectionIds.add(operation.connectionId);
          }
        }
      }
    }

    return Array.from(connectionIds);
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
    mentions: any[],
    pipeline: string,
    defaultSubreddit?: string,
  ): Promise<{
    filteredMentions: any[];
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

    const normalizedPipeline = pipeline || 'unknown';
    const sourceIdSet = new Set<string>();

    for (const mention of mentions) {
      const sourceId =
        typeof mention?.source_id === 'string' ? mention.source_id.trim() : '';
      if (sourceId) {
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
    const existingRecords = await this.prismaService.source.findMany({
      where: {
        pipeline: normalizedPipeline,
        sourceId: { in: sourceIds },
      },
      select: { sourceId: true },
    });

    const existingSet = new Set(
      existingRecords.map((record) => record.sourceId),
    );
    const filteredMentions: any[] = [];
    const newRecordsBySourceId = new Map<string, SourceLedgerRecord>();
    const seenInBatch = new Set<string>();
    let skippedCount = 0;

    for (const mention of mentions) {
      const rawSourceId =
        typeof mention?.source_id === 'string' ? mention.source_id.trim() : '';

      if (!rawSourceId) {
        filteredMentions.push(mention);
        continue;
      }

      if (seenInBatch.has(rawSourceId) || existingSet.has(rawSourceId)) {
        skippedCount += 1;
        continue;
      }

      seenInBatch.add(rawSourceId);
      filteredMentions.push(mention);

      newRecordsBySourceId.set(rawSourceId, {
        pipeline: normalizedPipeline,
        sourceId: rawSourceId,
        subreddit:
          typeof mention?.subreddit === 'string' &&
          mention.subreddit.trim().length > 0
            ? mention.subreddit.trim()
            : (defaultSubreddit ?? null),
        processedAt: new Date(),
      });
    }

    return {
      filteredMentions,
      newRecordsBySourceId,
      skippedCount,
    };
  }

  private collectLedgerRecordsForMentions(
    mentions: any[],
    ledgerMap: Map<string, SourceLedgerRecord>,
  ): SourceLedgerRecord[] {
    if (!ledgerMap || ledgerMap.size === 0 || !Array.isArray(mentions)) {
      return [];
    }

    const records: SourceLedgerRecord[] = [];
    const seen = new Set<string>();

    for (const mention of mentions) {
      const sourceId =
        typeof mention?.source_id === 'string' ? mention.source_id.trim() : '';
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

  private scheduleRestaurantEnrichment(
    summaries: CreatedEntitySummary[],
  ): void {
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

    for (const entityId of restaurantIds) {
      this.restaurantLocationEnrichmentService
        .enrichRestaurantById(entityId)
        .catch((error) => {
          this.logger.warn('Restaurant enrichment failed', {
            entityId,
            error: {
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          });
        });
    }
  }
}
