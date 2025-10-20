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
import { createHash } from 'crypto';
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

type OperationSummary = {
  affectedConnectionIds: string[];
  newConnectionIds: string[];
  mentionsCreated: number;
};

const createEmptySummary = (): OperationSummary => ({
  affectedConnectionIds: [],
  newConnectionIds: [],
  mentionsCreated: 0,
});

const mergeIntoSummary = (
  target: OperationSummary,
  addition: OperationSummary | null | undefined,
) => {
  if (!addition) return;
  target.affectedConnectionIds.push(...addition.affectedConnectionIds);
  target.newConnectionIds.push(...addition.newConnectionIds);
  target.mentionsCreated += addition.mentionsCreated;
};

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

  constructor(
    private readonly prismaService: PrismaService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly qualityScoreService: QualityScoreService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

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
    mentionsCreated: number;
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

    const DEFAULT_CONFIG: UnifiedProcessingConfig = {
      enableQualityScores: true,
      enableSourceAttribution: true,
      maxRetries: 3,
      batchTimeout: 300000, // 5 minutes
      batchSize: 250, // PRD 6.6.4: Start with 100-500 entities per batch
    };

    const processingConfig = { ...DEFAULT_CONFIG, ...config };

    try {
      this.logger.info('Processing LLM output directly', {
        batchId,
        mentionsCount: mentions.length,
        collectionType: sourceMetadata.collectionType,
        subreddit: sourceMetadata.subreddit,
      });

      // Create LLM output structure for existing pipeline
      const llmOutput: LLMOutputStructure = { mentions };

      // PRD 6.6.4: Check if batch needs to be split
      if (mentions.length > processingConfig.batchSize) {
        const batchResult = await this.processMentionsInBatches(
          llmOutput,
          sourceMetadata,
          batchId,
          processingConfig,
        );

        return {
          entitiesCreated:
            batchResult.entityResolution?.newEntitiesCreated || 0,
          connectionsCreated:
            batchResult.databaseOperations?.connectionsCreated || 0,
          mentionsCreated: batchResult.databaseOperations?.mentionsCreated || 0,
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
        startTime,
      );

      return {
        entitiesCreated: batchResult.entityResolution?.newEntitiesCreated || 0,
        connectionsCreated:
          batchResult.databaseOperations?.connectionsCreated || 0,
        mentionsCreated: batchResult.databaseOperations?.mentionsCreated || 0,
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
        mentionsCount: mentions.length,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        sourceBreakdown: sourceMetadata.sourceBreakdown,
      });

      throw UnifiedProcessingExceptionFactory.createProcessingFailed(
        `LLM output processing failed for batch ${batchId}`,
        error,
        {
          batchId,
          mentionsCount: mentions.length,
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
    let totalMentionsCreated = 0;
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
          Date.now(),
        );

        totalEntitiesCreated += subResult.entityResolution.newEntitiesCreated;
        totalConnectionsCreated +=
          subResult.databaseOperations.connectionsCreated;
        totalMentionsCreated += subResult.databaseOperations.mentionsCreated;
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
        mentionsCreated: totalMentionsCreated,
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
    startTime: number,
  ): Promise<ProcessingResult> {
    // Step 4a: Entity Resolution (cached for retries)
    const entityResolutionInput = this.extractEntitiesFromLLMOutput(llmOutput);
    const resolutionResult = await this.entityResolutionService.resolveBatch(
      entityResolutionInput,
      { batchSize: 100, enableFuzzyMatching: true },
    );

    // Step 4b-5: Single Consolidated Processing Phase with retry logic
    const databaseResult = await this.performConsolidatedProcessingWithRetry(
      llmOutput,
      resolutionResult,
      sourceMetadata,
      batchId,
      processingConfig.maxRetries || 3,
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

    try {
      for (const mention of llmOutput.mentions) {
        // Restaurant entities (deterministic temp IDs)
        if (mention.restaurant_name) {
          const restaurantTempId = this.buildRestaurantTempId(mention);
          mention.__restaurantTempId = restaurantTempId;
          entities.push({
            normalizedName: mention.restaurant_name,
            originalText: mention.restaurant_name,
            entityType: 'restaurant' as const,
            tempId: restaurantTempId,
          });
        } else {
          mention.__restaurantTempId = null;
        }

        // Food entity (menu item)
        if (mention.food_name) {
          const foodEntityTempId = this.buildFoodEntityTempId(mention);
          mention.__foodEntityTempId = foodEntityTempId;
          entities.push({
            normalizedName: mention.food_name,
            originalText: mention.food_name,
            entityType: 'food' as const,
            tempId: foodEntityTempId,
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
          for (const category of mention.food_categories) {
            if (!category) {
              continue;
            }
            const categoryTempId = this.buildFoodCategoryTempId(category);
            if (seenCategoryIds.has(categoryTempId)) {
              continue;
            }
            seenCategoryIds.add(categoryTempId);

            entities.push({
              normalizedName: category,
              originalText: category,
              entityType: 'food' as const,
              tempId: categoryTempId,
            });
            mention.__foodCategoryTempIds.push({
              name: category,
              tempId: categoryTempId,
            });
          }
          if (mention.__foodCategoryTempIds.length === 0) {
            delete mention.__foodCategoryTempIds;
          }
        }

        // Food attributes
        if (mention.food_attributes && Array.isArray(mention.food_attributes)) {
          const seenFoodAttrIds = new Set<string>();
          for (const attr of mention.food_attributes) {
            if (typeof attr === 'string' && attr) {
              const attributeTempId = this.buildAttributeTempId('food', attr);
              if (seenFoodAttrIds.has(attributeTempId)) {
                continue;
              }
              seenFoodAttrIds.add(attributeTempId);
              entities.push({
                normalizedName: attr,
                originalText: attr,
                entityType: 'food_attribute' as const,
                tempId: attributeTempId,
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
          for (const attr of mention.restaurant_attributes) {
            if (typeof attr === 'string' && attr) {
              const attributeTempId = this.buildAttributeTempId(
                'restaurant',
                attr,
              );
              if (seenRestaurantAttrIds.has(attributeTempId)) {
                continue;
              }
              seenRestaurantAttrIds.add(attributeTempId);
              entities.push({
                normalizedName: attr,
                originalText: attr,
                entityType: 'restaurant_attribute' as const,
                tempId: attributeTempId,
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
      mention?.restaurant_name ?? '',
      mention?.food_name ?? '',
    ];
    return `${scope}-${this.stableHash(parts.join('|'))}`;
  }

  private buildRestaurantTempId(mention: any): string {
    const normalized = this.normalizeForId(mention?.restaurant_name);
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

    const normalizedFoodName = this.normalizeForId(mention?.food_name);
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

    if (mention && mention.restaurant_name) {
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

    if (mention && mention.food_name) {
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
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    mentionsCreated: number;
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
      }

      for (const resolution of resolutionResult.resolutionResults) {
        if (resolution.entityId) {
          tempIdToEntityIdMap.set(resolution.tempId, resolution.entityId);
        }
      }

      // PRD 6.6.2: Single atomic transaction
      const result = await this.prismaService.$transaction(async (tx) => {
        this.logger.debug('Executing consolidated database transaction', {
          batchId,
          mentionsProcessed: llmOutput.mentions.length,
        });

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
                generalPraiseUpvotes: 0,
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

            const tempGroup = Array.from(
              newEntityTempGroups.get(resolution.tempId) ??
                new Set<string>([resolution.tempId]),
            );

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
        let mentionsCreated = 0;
        let newConnectionsCreated = 0;

        const mergeSummaries = (
          summary: OperationSummary | null | undefined,
        ) => {
          if (!summary) return;
          additionalAffectedIds.push(...summary.affectedConnectionIds);
          mentionsCreated += summary.mentionsCreated;
          newConnectionsCreated += summary.newConnectionIds.length;
        };

        for (const connectionOp of connectionOperations) {
          if (connectionOp.type === 'category_boost') {
            const summary = await this.handleCategoryBoost(
              tx,
              connectionOp,
              batchId,
            );
            mergeSummaries(summary);
          } else if (connectionOp.type === 'attribute_boost') {
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
          } else if (connectionOp.type === 'category_signal') {
            await this.handleCategorySignal(tx, connectionOp, batchId);
          } else if (connectionOp.type === 'general_praise_boost') {
            // No-op by design. General praise is persisted on the restaurant entity only.
          } else if (connectionOp.type === 'mention_create') {
            const created = await this.createMentionSafe(
              tx,
              connectionOp.mentionData,
            );
            if (created) {
              mentionsCreated += 1;
            }
          } else {
            // Regular upsert operation
            await tx.connection.upsert(connectionOp);
          }
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
          mentionsCreated,
          affectedConnectionIds: [
            ...new Set([...affectedConnectionIds, ...additionalAffectedIds]),
          ],
          createdEntityIds,
          createdEntitySummaries,
          reusedEntitySummaries,
        };
      });

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
  ): Promise<{
    entitiesCreated: number;
    connectionsCreated: number;
    mentionsCreated: number;
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
    mentionOperation: any | null;
    connectionOperations: any[];
    affectedConnectionIds: string[];
    generalPraiseUpvotes: number;
    restaurantEntityId: string;
  }> {
    const connectionOperations: any[] = [];
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
          mentionOperation: null,
          connectionOperations: [],
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
          mentionOperation: null,
          connectionOperations: [],
          affectedConnectionIds: [],
          generalPraiseUpvotes: 0,
          restaurantEntityId: '',
        };
      }

      // PRD 6.4.2: Calculate time-weighted mention score
      const mentionCreatedAt = new Date(mention.source_created_at);
      const daysSince =
        (Date.now() - mentionCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
      // Store mention data for later creation after connection is established
      const mentionData = {
        // mentionId will be auto-generated by database
        sourceType: mention.source_type,
        sourceId: mention.source_id,
        sourceUrl: mention.source_url,
        subreddit: mention.subreddit,
        contentExcerpt: (mention.source_content || '').substring(0, 500), // Truncate for excerpt
        upvotes: mention.source_ups,
        createdAt: mentionCreatedAt,
        processedAt: new Date(),
        // connectionId will be set when connection is created
      };

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
            mentionData: mentionData,
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
            mentionData: mentionData, // Include mention data for creation
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

      // Component 5: Category Processing (when food + is_menu_item = false)
      // PRD 6.5.1: Find existing food connections with category and boost them
      // PRD 6.5.2: Never create category connections - only boost existing ones
      else if (foodEntityLookupKey && mention.is_menu_item === false) {
        const categoryEntityId = tempIdToEntityIdMap.get(foodEntityLookupKey);
        if (categoryEntityId) {
          // PRD 6.5.1 lines 1409-1414: Category processing with attribute logic
          const categoryBoostOperation = {
            type: 'category_boost',
            restaurantEntityId,
            categoryEntityId,
            upvotes: mention.source_ups,
            isRecent,
            mentionCreatedAt,
            activityLevel,
            foodAttributeIds: [...foodAttributeIds],
            foodAttributeNames: [...foodAttributeNames],
            hasFoodAttrs,
            mentionData: mentionData, // Add mention data for Component 5
            allowCreate: false, // Component 5 never creates new connections
            categoryEntityIds,
          };
          connectionOperations.push(categoryBoostOperation);

          this.logger.debug('Component 5: Category processing queued', {
            batchId,
            restaurantEntityId,
            categoryEntityId,
            hasFoodAttrs,
          });
        }
      }

      if (
        uniqueCategoryEntityIds.length > 0 &&
        (mention.is_menu_item === false || !foodEntityLookupKey)
      ) {
        connectionOperations.push({
          type: 'category_signal',
          restaurantEntityId,
          categoryEntityIds: uniqueCategoryEntityIds,
          upvotes: mention.source_ups,
          mentionCreatedAt,
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
          mentionData: mentionData, // Add mention data for Component 6
          categoryEntityIds,
        };
        connectionOperations.push(attributeBoostOperation);
      }

      // Store general praise upvotes for later restaurant entity update
      // This will be aggregated and applied in the main transaction

      return {
        mentionOperation: null, // No direct mention operation - mentions are created via connection operations
        connectionOperations,
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
        mentionOperation: null,
        connectionOperations: [],
        affectedConnectionIds: [],
        generalPraiseUpvotes: 0,
        restaurantEntityId: '',
      };
    }
  }

  /**
   * Create mention with duplicate protection (unique by sourceType, sourceId, connectionId)
   */
  private async createMentionSafe(tx: any, mentionData: any): Promise<boolean> {
    if (!mentionData) {
      return false;
    }

    const { tempId: _tempId, sourceType, ...rest } = mentionData;

    const normalizedSourceType =
      typeof sourceType === 'string' && sourceType.toLowerCase() === 'post'
        ? 'post'
        : 'comment';

    const sanitizedMention = {
      ...rest,
      sourceType: normalizedSourceType,
    };

    try {
      await tx.mention.create({ data: sanitizedMention });
      return true;
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      if (
        msg.includes('Unique constraint') ||
        msg.includes('uniq_mentions_source_connection') ||
        e?.code === 'P2002'
      ) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Record category-only mentions for later boosting
   */
  private async handleCategorySignal(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<void> {
    const uniqueCategoryIds = Array.isArray(operation.categoryEntityIds)
      ? Array.from(new Set(operation.categoryEntityIds.filter(Boolean)))
      : [];

    if (uniqueCategoryIds.length === 0) {
      this.logger.debug('Skipping category signal with no category IDs', {
        batchId,
        restaurantEntityId: operation.restaurantEntityId,
      });
      return;
    }

    const upvotes =
      typeof operation.upvotes === 'number' && !Number.isNaN(operation.upvotes)
        ? operation.upvotes
        : 0;
    let mentionCreatedAt =
      operation.mentionCreatedAt instanceof Date
        ? operation.mentionCreatedAt
        : new Date(
            operation.mentionCreatedAt
              ? Date.parse(operation.mentionCreatedAt)
              : Date.now(),
          );
    if (Number.isNaN(mentionCreatedAt.getTime())) {
      mentionCreatedAt = new Date();
    }

    for (const categoryId of uniqueCategoryIds) {
      await tx.restaurantCategorySignal.upsert({
        where: {
          restaurantId_categoryId: {
            restaurantId: operation.restaurantEntityId,
            categoryId,
          },
        },
        update: {
          mentionsCount: { increment: 1 },
          totalUpvotes: { increment: upvotes },
          lastMentionedAt: mentionCreatedAt,
        },
        create: {
          restaurantId: operation.restaurantEntityId,
          categoryId,
          mentionsCount: 1,
          totalUpvotes: upvotes,
          firstMentionedAt: mentionCreatedAt,
          lastMentionedAt: mentionCreatedAt,
        },
      });
    }

    this.logger.debug('Category-only mention recorded', {
      batchId,
      restaurantEntityId: operation.restaurantEntityId,
      categoryIds: uniqueCategoryIds,
      upvotes,
    });
  }

  /**
   * Handle Category Boost Operations (Component 5 - PRD 6.5.1)
   * Find existing food connections with category and boost them
   * Applies optional attribute filtering per unified attribute logic
   * Returns array of affected connection IDs for top mentions update
   */
  private async handleCategoryBoost(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<OperationSummary> {
    const summary = createEmptySummary();

    try {
      const targetConnections = await tx.connection.findMany({
        where: {
          restaurantId: operation.restaurantEntityId,
          categories: { has: operation.categoryEntityId },
          ...(operation.hasFoodAttrs &&
          Array.isArray(operation.foodAttributeIds)
            ? { foodAttributes: { hasSome: operation.foodAttributeIds } }
            : {}),
        },
      });

      if (targetConnections.length === 0) {
        this.logger.debug(
          'No matching connections found for category boost - skipping per PRD',
          {
            batchId,
            restaurantId: operation.restaurantEntityId,
            categoryId: operation.categoryEntityId,
          },
        );
        return summary;
      }

      for (const connection of targetConnections) {
        summary.affectedConnectionIds.push(connection.connectionId);

        const updateData: any = {
          mentionCount: { increment: 1 },
          totalUpvotes: { increment: operation.upvotes },
          recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
          lastMentionedAt:
            operation.mentionCreatedAt > connection.lastMentionedAt
              ? operation.mentionCreatedAt
              : undefined,
          activityLevel: operation.activityLevel,
          lastUpdated: new Date(),
        };

        if (
          operation.hasFoodAttrs &&
          Array.isArray(operation.foodAttributeIds) &&
          operation.foodAttributeIds.length > 0
        ) {
          const existingAttributes = connection.foodAttributes || [];
          const mergedAttributes = [
            ...new Set([...existingAttributes, ...operation.foodAttributeIds]),
          ];
          updateData.foodAttributes = mergedAttributes;
        }

        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: updateData,
        });

        const mentionCreated = await this.createMentionSafe(tx, {
          ...operation.mentionData,
          connectionId: connection.connectionId,
        });
        if (mentionCreated) {
          summary.mentionsCreated += 1;
        }
        this.logger.debug('Boosted category connection per Component 5 logic', {
          batchId,
          connectionId: connection.connectionId,
          categoryId: operation.categoryEntityId,
          hasFoodAttrs: operation.hasFoodAttrs,
          foodAttributeNames: operation.foodAttributeNames,
        });
      }

      return summary;
    } catch (error) {
      this.logger.error('Failed to handle category boost', {
        batchId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return summary;
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

        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: {
            mentionCount: { increment: 1 },
            totalUpvotes: { increment: operation.upvotes },
            recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
            lastMentionedAt:
              operation.mentionCreatedAt > connection.lastMentionedAt
                ? operation.mentionCreatedAt
                : undefined,
            activityLevel: operation.activityLevel,
            lastUpdated: new Date(),
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

        const mentionCreated = await this.createMentionSafe(tx, {
          ...operation.mentionData,
          connectionId: connection.connectionId,
        });
        if (mentionCreated) {
          summary.mentionsCreated += 1;
        }
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
      const mentionCreated = await this.boostConnection(
        tx,
        existingConnection,
        operation,
      );
      if (mentionCreated) {
        summary.mentionsCreated += 1;
      }
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
        const mentionCreated = await this.boostConnection(
          tx,
          connection,
          operation,
          { additionalAttributeIds: operation.foodAttributeIds },
        );
        if (mentionCreated) {
          summary.mentionsCreated += 1;
        }
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
  ): Promise<boolean> {
    const updateData: any = {
      mentionCount: { increment: 1 },
      totalUpvotes: { increment: operation.upvotes },
      recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
      lastMentionedAt:
        operation.mentionCreatedAt > connection.lastMentionedAt
          ? operation.mentionCreatedAt
          : undefined,
      activityLevel: operation.activityLevel,
      lastUpdated: new Date(),
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

    if (operation.mentionData) {
      return await this.createMentionSafe(tx, {
        ...operation.mentionData,
        connectionId: connection.connectionId,
      });
    }

    return false;
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

    const newConnection = await tx.connection.create({
      data: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
        categories: uniqueCategories,
        foodAttributes: uniqueAttributes,
        mentionCount: 1,
        totalUpvotes: operation.upvotes,
        recentMentionCount: operation.isRecent ? 1 : 0,
        lastMentionedAt: operation.mentionCreatedAt,
        activityLevel: operation.activityLevel,
        foodQualityScore: operation.upvotes * 0.1,
        lastUpdated: new Date(),
        createdAt: new Date(),
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

    if (operation.mentionData) {
      const mentionCreated = await this.createMentionSafe(tx, {
        ...operation.mentionData,
        connectionId: newConnection.connectionId,
      });
      if (mentionCreated) {
        summary.mentionsCreated += 1;
      }
    }

    return summary;
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
}
