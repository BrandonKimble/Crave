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
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { EntityResolutionService } from '../entity-resolver/entity-resolution.service';
import { QualityScoreService } from '../quality-score/quality-score.service';
import {
  ProcessingResult,
  UnifiedProcessingConfig,
  ProcessingPerformanceMetrics,
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
        // Restaurant entities
        if (mention.restaurant_name && mention.restaurant_temp_id) {
          entities.push({
            normalizedName: mention.restaurant_name,
            originalText: mention.restaurant_name, // Using normalized as original since we only have one
            entityType: 'restaurant' as const,
            tempId: mention.restaurant_temp_id,
          });
        }

        // Food entity (food or category)
        if (mention.food_name && mention.food_temp_id) {
          entities.push({
            normalizedName: mention.food_name,
            originalText: mention.food_name, // Using normalized as original
            entityType: 'food' as const,
            tempId: mention.food_temp_id,
          });
        }

        // Also process food_categories array if present
        if (mention.food_categories && Array.isArray(mention.food_categories)) {
          for (const category of mention.food_categories) {
            if (category && category !== mention.food_name) {
              entities.push({
                normalizedName: category,
                originalText: category,
                entityType: 'food' as const,
                tempId: uuidv4(),
              });
            }
          }
        }

        // Selective food attributes
        if (
          mention.food_attributes_selective &&
          Array.isArray(mention.food_attributes_selective)
        ) {
          for (const attr of mention.food_attributes_selective) {
            if (typeof attr === 'string' && attr) {
              entities.push({
                normalizedName: attr,
                originalText: attr,
                entityType: 'food_attribute' as const,
                tempId: `food_attr_selective_${attr}_${mention.temp_id}`, // FIXED: Predictable temp_id
              });
            }
          }
        }

        // Descriptive food attributes
        if (
          mention.food_attributes_descriptive &&
          Array.isArray(mention.food_attributes_descriptive)
        ) {
          for (const attr of mention.food_attributes_descriptive) {
            if (typeof attr === 'string' && attr) {
              entities.push({
                normalizedName: attr,
                originalText: attr,
                entityType: 'food_attribute' as const,
                tempId: `food_attr_descriptive_${attr}_${mention.temp_id}`, // FIXED: Predictable temp_id
              });
            }
          }
        }

        // Restaurant attributes (FIXED: Consistent temp_id strategy)
        if (
          mention.restaurant_attributes &&
          Array.isArray(mention.restaurant_attributes)
        ) {
          for (const attr of mention.restaurant_attributes) {
            if (typeof attr === 'string' && attr) {
              entities.push({
                normalizedName: attr,
                originalText: attr,
                entityType: 'restaurant_attribute' as const,
                tempId: `restaurant_attr_${attr}_${mention.temp_id}`, // FIXED: Predictable temp_id
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

      for (const resolution of resolutionResult.resolutionResults) {
        if (resolution.entityId) {
          tempIdToEntityIdMap.set(resolution.tempId, resolution.entityId);
        }
      }

      // Accumulate operations in-memory (PRD 6.4 requirement)
      const mentionOperations: any[] = [];
      const connectionOperations: any[] = [];
      const affectedConnectionIds: string[] = [];
      const restaurantPraiseUpvotes = new Map<string, number>(); // Aggregate general praise by restaurant
      let connectionsCreated = 0;
      let mentionsCreated = 0;

      // Process each mention with consolidated component logic
      for (const mention of llmOutput.mentions) {
        const mentionResult = await this.processConsolidatedMention(
          mention,
          tempIdToEntityIdMap,
          entityDetails,
          batchId,
          sourceMetadata?.subreddit,
        );

        if (mentionResult.mentionOperation) {
          mentionOperations.push(mentionResult.mentionOperation);
          mentionsCreated++;
        }

        connectionOperations.push(...mentionResult.connectionOperations);
        affectedConnectionIds.push(...mentionResult.affectedConnectionIds);
        connectionsCreated += mentionResult.connectionOperations.length;

        // Aggregate general praise upvotes by restaurant
        if (mentionResult.generalPraiseUpvotes > 0) {
          const currentTotal =
            restaurantPraiseUpvotes.get(mentionResult.restaurantEntityId) || 0;
          restaurantPraiseUpvotes.set(
            mentionResult.restaurantEntityId,
            currentTotal + mentionResult.generalPraiseUpvotes,
          );
        }
      }

      // PRD 6.6.2: Single atomic transaction
      const result = await this.prismaService.$transaction(async (tx) => {
        this.logger.debug('Executing consolidated database transaction', {
          batchId,
          mentionOperations: mentionOperations.length,
          connectionOperations: connectionOperations.length,
        });

        // PRD 6.6.2: Create any new entities from resolution within transaction
        // This ensures atomicity - if entity creation fails, entire batch fails
        let entitiesCreated = 0;
        const createdEntityMapping = new Map<string, string>(); // tempId -> real entityId

        for (const resolution of resolutionResult.resolutionResults) {
          if (resolution.isNewEntity && resolution.entityId === null) {
            // Let database auto-generate UUID by omitting entityId field
            const createdEntity = await tx.entity.create({
              data: {
                name: resolution.normalizedName!,
                type: resolution.entityType!,
                aliases: resolution.validatedAliases || [
                  resolution.originalInput.originalText,
                ],
                restaurantAttributes: [], // Initialize empty for all entity types
                restaurantQualityScore: 0,
                generalPraiseUpvotes: 0,
                restaurantMetadata: {},
                createdAt: new Date(),
                lastUpdated: new Date(),
              },
            });

            // Update the mapping with the database-generated ID
            createdEntityMapping.set(resolution.tempId, createdEntity.entityId);
            tempIdToEntityIdMap.set(resolution.tempId, createdEntity.entityId);
            entitiesCreated++;

            this.logger.debug(
              'Created entity in transaction with auto-generated ID',
              {
                batchId,
                tempId: resolution.tempId,
                generatedEntityId: createdEntity.entityId,
                entityType: resolution.entityType,
                name: resolution.normalizedName,
              },
            );
          }
        }

        // Mentions are now created as part of connection operations

        // Execute all connection operations and collect affected connection IDs
        const additionalAffectedIds: string[] = [];
        for (const connectionOp of connectionOperations) {
          if (connectionOp.type === 'category_boost') {
            const ids = await this.handleCategoryBoost(
              tx,
              connectionOp,
              batchId,
            );
            additionalAffectedIds.push(...ids);
          } else if (connectionOp.type === 'attribute_boost') {
            const ids = await this.handleAttributeBoost(
              tx,
              connectionOp,
              batchId,
            );
            additionalAffectedIds.push(...ids);
          } else if (connectionOp.type === 'food_attribute_processing') {
            const ids = await this.handleFoodAttributeProcessing(
              tx,
              connectionOp,
              batchId,
            );
            additionalAffectedIds.push(...ids);
          } else if (connectionOp.type === 'restaurant_metadata_update') {
            await this.handleRestaurantMetadataUpdate(
              tx,
              connectionOp,
              batchId,
            );
            // General praise no longer boosts connections; handled via entity-level upvote aggregation only
          } else if (connectionOp.type === 'general_praise_boost') {
            // No-op by design. General praise is persisted on the restaurant entity only.
          } else if (connectionOp.type === 'mention_create') {
            await this.createMentionSafe(tx, connectionOp.mentionData);
          } else {
            // Regular upsert operation
            await tx.connection.upsert(connectionOp);
          }
        }

        // Combine all affected connection IDs
        const allAffectedConnectionIds = [
          ...new Set([...affectedConnectionIds, ...additionalAffectedIds]),
        ];

        // PRD 6.4.2: Update top mentions for all affected connections
        await this.updateTopMentions(tx, allAffectedConnectionIds, batchId);

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
          connectionsCreated,
          mentionsCreated,
          affectedConnectionIds: [
            ...new Set([...affectedConnectionIds, ...additionalAffectedIds]),
          ],
        };
      });

      const processingTime = Date.now() - startTime;
      this.performanceMetrics.databaseOperations++;

      this.logger.info('Consolidated processing phase completed', {
        batchId,
        processingTimeMs: processingTime,
        ...result,
      });

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
      const restaurantEntityId = tempIdToEntityIdMap.get(
        mention.restaurant_temp_id,
      );
      if (!restaurantEntityId) {
        this.logger.warn('Restaurant entity not resolved, skipping mention', {
          batchId,
          mentionTempId: mention.temp_id,
          restaurantTempId: mention.restaurant_temp_id,
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
      const timeWeightedScore = mention.source_ups * Math.exp(-daysSince / 60);

      // Store mention data for later creation after connection is established
      const mentionData = {
        // mentionId will be auto-generated by database
        tempId: mention.temp_id,
        sourceType: mention.source_type,
        sourceId: mention.source_id,
        sourceUrl: mention.source_url,
        subreddit: mention.subreddit || subredditFallback || 'unknown',
        contentExcerpt: (mention.source_content || '').substring(0, 500), // Truncate for excerpt
        author: mention.author || null,
        upvotes: mention.source_ups,
        createdAt: mentionCreatedAt,
        processedAt: new Date(),
        timeWeightedScore: timeWeightedScore, // For later use
        // connectionId will be set when connection is created
      };

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
          const tempId = `restaurant_attr_${attr}_${mention.temp_id}`;
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
      if (mention.food_temp_id && mention.is_menu_item === true) {
        const foodEntityId = tempIdToEntityIdMap.get(mention.food_temp_id);
        if (foodEntityId) {
          const hasSelectiveAttrs =
            mention.food_attributes_selective &&
            mention.food_attributes_selective.length > 0;
          const hasDescriptiveAttrs =
            mention.food_attributes_descriptive &&
            mention.food_attributes_descriptive.length > 0;

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
            selectiveAttributes: mention.food_attributes_selective || [],
            descriptiveAttributes: mention.food_attributes_descriptive || [],
            hasSelectiveAttrs,
            hasDescriptiveAttrs,
            mentionData: mentionData, // Include mention data for creation
            allowCreate: true, // Component 4 always allows creation of new connections
          };
          connectionOperations.push(foodAttributeOperation);

          this.logger.debug('Component 4: Specific food processing queued', {
            batchId,
            restaurantEntityId,
            foodEntityId: foodEntityId,
            hasSelectiveAttrs,
            hasDescriptiveAttrs,
          });
        }
      }

      // Component 5: Category Processing (when food + is_menu_item = false)
      // PRD 6.5.1: Find existing food connections with category and boost them
      // PRD 6.5.2: Never create category connections - only boost existing ones
      else if (mention.food_temp_id && mention.is_menu_item === false) {
        const categoryEntityId = tempIdToEntityIdMap.get(mention.food_temp_id);
        if (categoryEntityId) {
          const hasSelectiveAttrs =
            mention.food_attributes_selective &&
            mention.food_attributes_selective.length > 0;
          const hasDescriptiveAttrs =
            mention.food_attributes_descriptive &&
            mention.food_attributes_descriptive.length > 0;

          // PRD 6.5.1 lines 1409-1414: Category processing with attribute logic
          const categoryBoostOperation = {
            type: 'category_boost',
            restaurantEntityId,
            categoryEntityId,
            upvotes: mention.source_ups,
            isRecent,
            mentionCreatedAt,
            activityLevel,
            selectiveAttributes: mention.food_attributes_selective || [],
            descriptiveAttributes: mention.food_attributes_descriptive || [],
            hasSelectiveAttrs,
            hasDescriptiveAttrs,
            mentionData: mentionData, // Add mention data for Component 5
            allowCreate: false, // Component 5 never creates new connections
          };
          connectionOperations.push(categoryBoostOperation);

          this.logger.debug('Component 5: Category processing queued', {
            batchId,
            restaurantEntityId,
            categoryEntityId,
            hasSelectiveAttrs,
            hasDescriptiveAttrs,
          });
        }
      }

      // Component 6: Attribute-Only Processing (when no food but food_attributes present)
      // PRD 6.5.1: Find existing food connections with ANY of the selective attributes
      // PRD 6.5.2: Never create attribute connections - only boost existing ones
      if (
        !mention.food_temp_id &&
        (mention.food_attributes_selective ||
          mention.food_attributes_descriptive)
      ) {
        if (
          mention.food_attributes_selective &&
          mention.food_attributes_selective.length > 0
        ) {
          // PRD 6.5.1: Only process selective attributes for attribute-only processing
          // Descriptive-only attributes are skipped (PRD 6.5.1 line 1416)
          const attributeBoostOperation = {
            type: 'attribute_boost',
            restaurantEntityId,
            upvotes: mention.source_ups,
            isRecent,
            mentionCreatedAt,
            activityLevel,
            selectiveAttributes: mention.food_attributes_selective,
            mentionData: mentionData, // Add mention data for Component 6
            // Note: Ignore descriptive attributes for attribute-only processing per PRD
          };
          connectionOperations.push(attributeBoostOperation);
        }
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
   * Update top mentions for connections (PRD 6.4.2)
   * Re-scores ALL existing mentions and maintains top 3-5 mentions array
   */
  private async updateTopMentions(
    tx: any,
    connectionIds: string[],
    batchId: string,
  ): Promise<void> {
    for (const connectionId of connectionIds) {
      try {
        // Get all mentions for this connection
        const mentions = await tx.mention.findMany({
          where: { connectionId: connectionId },
          orderBy: { createdAt: 'desc' },
        });

        if (mentions.length === 0) continue;

        // PRD 6.4.2: Re-score ALL existing mentions using time-weighted formula
        const scoredMentions = mentions.map((mention: any) => {
          const daysSince =
            (Date.now() - new Date(mention.createdAt).getTime()) /
            (1000 * 60 * 60 * 24);
          const timeWeightedScore = mention.upvotes * Math.exp(-daysSince / 60);

          return {
            mentionId: mention.mentionId,
            score: timeWeightedScore,
            upvotes: mention.upvotes,
            createdAt: mention.createdAt,
            sourceUrl: mention.sourceUrl,
            contentExcerpt: mention.contentExcerpt,
          };
        });

        // Sort by score descending and take top 5
        const topMentions = scoredMentions
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        // Compute trending based on top mentions recency
        const allTopMentionsRecent = topMentions.every((m) => {
          const daysSince =
            (Date.now() - new Date(m.createdAt).getTime()) /
            (1000 * 60 * 60 * 24);
          return daysSince <= 30;
        });

        // Fetch lastMentionedAt for activity determination per PRD (active = last_mentioned_at within 7 days)
        const connectionRow = await tx.connection.findUnique({
          where: { connectionId },
          select: { lastMentionedAt: true },
        });
        let isActive = false;
        if (connectionRow?.lastMentionedAt) {
          const daysSinceLast =
            (Date.now() - new Date(connectionRow.lastMentionedAt).getTime()) /
            (1000 * 60 * 60 * 24);
          isActive = daysSinceLast <= 7;
        }

        const activityLevel =
          allTopMentionsRecent && topMentions.length >= 3
            ? 'trending'
            : isActive
              ? 'active'
              : 'normal';

        // Update connection with new top mentions and activity level
        await tx.connection.update({
          where: { connectionId: connectionId },
          data: {
            topMentions: topMentions,
            activityLevel: activityLevel,
            lastUpdated: new Date(),
          },
        });

        this.logger.debug('Updated top mentions for connection', {
          batchId,
          connectionId,
          topMentionsCount: topMentions.length,
          activityLevel,
        });
      } catch (error) {
        this.logger.error('Failed to update top mentions', {
          batchId,
          connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - continue processing other connections
      }
    }
  }

  /**
   * Create mention with duplicate protection (unique by sourceType, sourceId, connectionId)
   */
  private async createMentionSafe(tx: any, mentionData: any): Promise<void> {
    try {
      await tx.mention.create({ data: mentionData });
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      if (
        msg.includes('Unique constraint') ||
        msg.includes('uniq_mentions_source_connection') ||
        e?.code === 'P2002'
      ) {
        // Duplicate mention for the same source + connection; ignore
        return;
      }
      throw e;
    }
  }

  /**
   * Handle Category Boost Operations (Component 5 - PRD 6.5.1)
   * Find existing food connections with category and boost them
   * PRD lines 1409-1414: Complex attribute logic for categories
   * Returns array of affected connection IDs for top mentions update
   */
  private async handleCategoryBoost(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<string[]> {
    try {
      let targetConnections: any[] = [];

      // PRD 6.5.1 Component 5: Different logic based on attribute combinations
      if (operation.hasSelectiveAttrs && !operation.hasDescriptiveAttrs) {
        // All Selective: Find connections with category AND filter by selective attributes
        targetConnections = await tx.connection.findMany({
          where: {
            restaurantId: operation.restaurantEntityId,
            categories: { has: operation.categoryEntityId },
            foodAttributes: { hasSome: operation.selectiveAttributes }, // PRD: Filter to connections with ANY selective
          },
        });

        this.logger.debug(
          'Component 5 All Selective: Filtered category connections',
          {
            batchId,
            categoryId: operation.categoryEntityId,
            selectiveAttributes: operation.selectiveAttributes,
            connectionsFound: targetConnections.length,
          },
        );
      } else if (
        !operation.hasSelectiveAttrs &&
        operation.hasDescriptiveAttrs
      ) {
        // All Descriptive: Find ALL connections with category (no attribute filtering)
        targetConnections = await tx.connection.findMany({
          where: {
            restaurantId: operation.restaurantEntityId,
            categories: { has: operation.categoryEntityId },
          },
        });

        this.logger.debug(
          'Component 5 All Descriptive: Found all category connections',
          {
            batchId,
            categoryId: operation.categoryEntityId,
            connectionsFound: targetConnections.length,
          },
        );
      } else if (operation.hasSelectiveAttrs && operation.hasDescriptiveAttrs) {
        // Mixed: Find connections with category AND filter by selective attributes
        targetConnections = await tx.connection.findMany({
          where: {
            restaurantId: operation.restaurantEntityId,
            categories: { has: operation.categoryEntityId },
            foodAttributes: { hasSome: operation.selectiveAttributes }, // PRD: Filter by selective first
          },
        });

        this.logger.debug(
          'Component 5 Mixed: Filtered category connections by selective',
          {
            batchId,
            categoryId: operation.categoryEntityId,
            selectiveAttributes: operation.selectiveAttributes,
            connectionsFound: targetConnections.length,
          },
        );
      } else {
        // No attributes: Find ALL connections with category
        targetConnections = await tx.connection.findMany({
          where: {
            restaurantId: operation.restaurantEntityId,
            categories: { has: operation.categoryEntityId },
          },
        });

        this.logger.debug(
          'Component 5 No Attributes: Found all category connections',
          {
            batchId,
            categoryId: operation.categoryEntityId,
            connectionsFound: targetConnections.length,
          },
        );
      }

      if (targetConnections.length === 0) {
        this.logger.debug(
          'No matching connections found for category boost - skipping per PRD',
          {
            batchId,
            restaurantId: operation.restaurantEntityId,
            categoryId: operation.categoryEntityId,
          },
        );
        return [];
      }

      const affectedIds: string[] = [];

      // Process each matching connection
      for (const connection of targetConnections) {
        affectedIds.push(connection.connectionId);

        // Build update data based on attribute logic
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

        // PRD 6.5.1: Add descriptive attributes if present (All Descriptive or Mixed cases)
        if (operation.hasDescriptiveAttrs) {
          const existingAttributes = connection.foodAttributes || [];
          const mergedAttributes = [
            ...new Set([
              ...existingAttributes,
              ...operation.descriptiveAttributes,
            ]),
          ];
          updateData.foodAttributes = mergedAttributes;

          this.logger.debug(
            'Adding descriptive attributes to category connection',
            {
              batchId,
              connectionId: connection.connectionId,
              newDescriptiveAttributes: operation.descriptiveAttributes,
              mergedAttributes,
            },
          );
        }

        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: updateData,
        });

        // Create mention linked to this connection
        await this.createMentionSafe(tx, {
          ...operation.mentionData,
          connectionId: connection.connectionId,
        });

        this.logger.debug('Boosted category connection per Component 5 logic', {
          batchId,
          connectionId: connection.connectionId,
          categoryId: operation.categoryEntityId,
          addedDescriptiveAttrs: operation.hasDescriptiveAttrs,
        });
      }
      return affectedIds;
    } catch (error) {
      this.logger.error('Failed to handle category boost', {
        batchId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Handle Attribute Boost Operations (Component 6 - PRD 6.5.1)
   * Find existing food connections with ANY of the selective attributes
   * Returns array of affected connection IDs for top mentions update
   */
  private async handleAttributeBoost(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<string[]> {
    try {
      // PRD 6.5.1: Find existing food connections with ANY of the selective attributes (OR logic)
      // Validate that selectiveAttributes is a non-empty array
      if (
        !operation.selectiveAttributes ||
        !Array.isArray(operation.selectiveAttributes) ||
        operation.selectiveAttributes.length === 0
      ) {
        this.logger.debug(
          'No selective attributes provided for attribute boost - skipping',
          {
            batchId,
            restaurantId: operation.restaurantEntityId,
          },
        );
        return [];
      }

      const existingConnections = await tx.connection.findMany({
        where: {
          restaurantId: operation.restaurantEntityId,
          foodAttributes: { hasSome: operation.selectiveAttributes },
        },
      });

      if (existingConnections.length === 0) {
        this.logger.debug(
          'No existing connections found for attribute boost - skipping',
          {
            batchId,
            restaurantId: operation.restaurantEntityId,
            attributes: operation.selectiveAttributes,
          },
        );
        return [];
      }

      const affectedIds: string[] = [];
      // Apply boost to all found connections and create mentions
      for (const connection of existingConnections) {
        affectedIds.push(connection.connectionId);
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
          },
        });

        // Create mention linked to this connection
        await this.createMentionSafe(tx, {
          ...operation.mentionData,
          connectionId: connection.connectionId,
        });

        this.logger.debug(
          'Boosted existing attribute connection and created mention',
          {
            batchId,
            connectionId: connection.connectionId,
            attributes: operation.selectiveAttributes,
          },
        );
      }
      return affectedIds;
    } catch (error) {
      this.logger.error('Failed to handle attribute boost', {
        batchId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Handle Food Attribute Processing (Component 4 - PRD 6.5.3)
   * Implements complex OR/AND logic for selective/descriptive attributes
   * PRD 6.5.2: Always creates connections for specific foods (is_menu_item = true)
   */
  private async handleFoodAttributeProcessing(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<string[]> {
    try {
      const {
        restaurantEntityId,
        foodEntityId,
        selectiveAttributes,
        descriptiveAttributes,
        hasSelectiveAttrs,
        hasDescriptiveAttrs,
        mentionData,
      } = operation;

      let affectedConnectionIds: string[] = [];

      // PRD 6.5.3: Complex attribute logic
      if (hasSelectiveAttrs && !hasDescriptiveAttrs) {
        // All Selective: Find existing connections with ANY selective attributes
        affectedConnectionIds = await this.handleAllSelectiveAttributes(
          tx,
          operation,
          batchId,
        );
      } else if (!hasSelectiveAttrs && hasDescriptiveAttrs) {
        // All Descriptive: Find ANY existing connections and add descriptive attributes
        affectedConnectionIds = await this.handleAllDescriptiveAttributes(
          tx,
          operation,
          batchId,
        );
      } else if (hasSelectiveAttrs && hasDescriptiveAttrs) {
        // Mixed: Find connections with ANY selective + add descriptive attributes
        affectedConnectionIds = await this.handleMixedAttributes(
          tx,
          operation,
          batchId,
        );
      } else {
        // No attributes: Simple food connection - find or create
        affectedConnectionIds = await this.handleSimpleFoodConnection(
          tx,
          operation,
          batchId,
        );
      }

      return affectedConnectionIds;
    } catch (error) {
      this.logger.error('Failed to handle food attribute processing', {
        batchId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
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
  ): Promise<string[]> {
    const existingConnection = await tx.connection.findUnique({
      where: {
        restaurantId_foodId: {
          restaurantId: operation.restaurantEntityId,
          foodId: operation.foodEntityId,
        },
      },
    });

    if (existingConnection) {
      // Boost existing connection
      await this.boostConnection(tx, existingConnection, operation);

      // Create mention linked to this connection
      await this.createMentionSafe(tx, {
        ...operation.mentionData,
        connectionId: existingConnection.connectionId,
      });

      return [existingConnection.connectionId];
    } else {
      // Create new connection - let database auto-generate ID
      const newConnection = await tx.connection.create({
        data: {
          restaurantId: operation.restaurantEntityId,
          foodId: operation.foodEntityId,
          categories: [],
          foodAttributes: [],
          isMenuItem: true,
          mentionCount: 1,
          totalUpvotes: operation.upvotes,
          recentMentionCount: operation.isRecent ? 1 : 0,
          lastMentionedAt: operation.mentionCreatedAt,
          activityLevel: operation.activityLevel,
          topMentions: [],
          foodQualityScore: operation.upvotes * 0.1,
          lastUpdated: new Date(),
          createdAt: new Date(),
        },
      });

      // Create mention linked to new connection
      await this.createMentionSafe(tx, {
        ...operation.mentionData,
        connectionId: newConnection.connectionId,
      });

      this.logger.debug('Created new simple food connection', {
        batchId,
        connectionId: newConnection.connectionId,
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
      });

      return [newConnection.connectionId];
    }
  }

  /**
   * Handle All Selective Attributes (PRD 6.5.3)
   * Find existing restaurant→food connections that have ANY of the selective attributes
   */
  private async handleAllSelectiveAttributes(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<string[]> {
    // Validate that selectiveAttributes is a non-empty array before using hasSome
    if (
      !operation.selectiveAttributes ||
      !Array.isArray(operation.selectiveAttributes) ||
      operation.selectiveAttributes.length === 0
    ) {
      this.logger.debug(
        'No selective attributes for food processing - creating new connection',
        { batchId },
      );
      return await this.createNewFoodConnection(tx, operation, []);
    }

    // PRD: Find existing connections with ANY of the selective attributes (OR logic)
    const existingConnections = await tx.connection.findMany({
      where: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
        foodAttributes: { hasSome: operation.selectiveAttributes }, // OR logic: match ANY
      },
    });

    if (existingConnections.length > 0) {
      // PRD: If found, boost those connections
      const affectedIds: string[] = [];
      for (const connection of existingConnections) {
        affectedIds.push(connection.connectionId);
        await this.boostConnection(tx, connection, operation);
      }

      this.logger.debug(
        'Component 4 All Selective: Boosted existing connections',
        {
          batchId,
          connectionsFound: existingConnections.length,
          selectiveAttributes: operation.selectiveAttributes,
        },
      );

      return affectedIds;
    } else {
      // PRD: If not found, create new connection with all attributes
      this.logger.debug('Component 4 All Selective: Creating new connection', {
        batchId,
        selectiveAttributes: operation.selectiveAttributes,
      });

      return await this.createNewFoodConnection(
        tx,
        operation,
        operation.selectiveAttributes,
      );
    }
  }

  /**
   * Handle All Descriptive Attributes (PRD 6.5.3)
   * Find ANY existing restaurant→food connections and add descriptive attributes
   */
  private async handleAllDescriptiveAttributes(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<string[]> {
    const existingConnections = await tx.connection.findMany({
      where: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
      },
    });

    if (existingConnections.length > 0) {
      // Boost connections and add descriptive attributes
      const affectedIds: string[] = [];
      for (const connection of existingConnections) {
        affectedIds.push(connection.connectionId);
        await this.boostConnectionAndAddAttributes(
          tx,
          connection,
          operation,
          operation.descriptiveAttributes,
        );
      }
      return affectedIds;
    } else {
      // Create new connection with all attributes
      return await this.createNewFoodConnection(
        tx,
        operation,
        operation.descriptiveAttributes,
      );
    }
  }

  /**
   * Handle Mixed Attributes (PRD 6.5.3)
   * Find connections with ANY selective + add descriptive attributes
   */
  private async handleMixedAttributes(
    tx: any,
    operation: any,
    batchId: string,
  ): Promise<string[]> {
    // Validate that selectiveAttributes is a non-empty array before using hasSome
    if (
      !operation.selectiveAttributes ||
      !Array.isArray(operation.selectiveAttributes) ||
      operation.selectiveAttributes.length === 0
    ) {
      this.logger.debug(
        'No selective attributes for mixed processing - handling as descriptive-only',
        { batchId },
      );
      return await this.handleAllDescriptiveAttributes(tx, operation, batchId);
    }

    const existingConnections = await tx.connection.findMany({
      where: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
        foodAttributes: { hasSome: operation.selectiveAttributes },
      },
    });

    if (existingConnections.length > 0) {
      // Boost connections and add descriptive attributes
      const affectedIds: string[] = [];
      for (const connection of existingConnections) {
        affectedIds.push(connection.connectionId);
        await this.boostConnectionAndAddAttributes(
          tx,
          connection,
          operation,
          operation.descriptiveAttributes,
        );
      }
      return affectedIds;
    } else {
      // Create new connection with all attributes
      const allAttributes = [
        ...operation.selectiveAttributes,
        ...operation.descriptiveAttributes,
      ];
      return await this.createNewFoodConnection(tx, operation, allAttributes);
    }
  }

  /**
   * Boost existing connection with metrics and create mention
   */
  private async boostConnection(
    tx: any,
    connection: any,
    operation: any,
  ): Promise<void> {
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
      },
    });

    // Create mention linked to this connection
    if (operation.mentionData) {
      await this.createMentionSafe(tx, {
        ...operation.mentionData,
        connectionId: connection.connectionId,
      });
    }
  }

  /**
   * Boost connection and add new descriptive attributes with mention
   */
  private async boostConnectionAndAddAttributes(
    tx: any,
    connection: any,
    operation: any,
    newAttributes: string[],
  ): Promise<void> {
    const existingAttributes = connection.foodAttributes || [];
    const mergedAttributes = [
      ...new Set([...existingAttributes, ...newAttributes]),
    ];

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
        foodAttributes: mergedAttributes,
        lastUpdated: new Date(),
      },
    });

    // Create mention linked to this connection
    if (operation.mentionData) {
      await this.createMentionSafe(tx, {
        ...operation.mentionData,
        connectionId: connection.connectionId,
      });
    }
  }

  /**
   * Create new food connection with attributes and mention
   */
  private async createNewFoodConnection(
    tx: any,
    operation: any,
    attributes: string[],
  ): Promise<string[]> {
    // Let database auto-generate connection ID
    const newConnection = await tx.connection.create({
      data: {
        restaurantId: operation.restaurantEntityId,
        foodId: operation.foodEntityId,
        categories: [],
        foodAttributes: attributes,
        isMenuItem: true,
        mentionCount: 1,
        totalUpvotes: operation.upvotes,
        recentMentionCount: operation.isRecent ? 1 : 0,
        lastMentionedAt: operation.mentionCreatedAt,
        activityLevel: operation.activityLevel,
        topMentions: [],
        foodQualityScore: operation.upvotes * 0.1,
        lastUpdated: new Date(),
        createdAt: new Date(),
      },
    });

    // Create mention linked to new connection
    if (operation.mentionData) {
      await this.createMentionSafe(tx, {
        ...operation.mentionData,
        connectionId: newConnection.connectionId,
      });
    }

    return [newConnection.connectionId];
  }

  /**
   * Handle restaurant metadata updates - Component 2 implementation
   * PRD 6.5.1: Add restaurant_attribute entity IDs to restaurant entity's metadata
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
        select: { restaurantMetadata: true },
      });

      if (!restaurant) {
        this.logger.error('Restaurant not found for metadata update', {
          batchId,
          restaurantEntityId: operation.restaurantEntityId,
        });
        return;
      }

      // Parse current metadata and add restaurant attribute IDs
      const currentMetadata = restaurant.restaurantMetadata || {};
      const existingAttributeIds = currentMetadata.restaurantAttributeIds || [];
      const updatedAttributeIds = [
        ...new Set([...existingAttributeIds, ...operation.attributeIds]),
      ];

      // Update restaurant metadata with attribute IDs
      await tx.entity.update({
        where: { entityId: operation.restaurantEntityId },
        data: {
          restaurantMetadata: {
            ...currentMetadata,
            restaurantAttributeIds: updatedAttributeIds,
          },
          lastUpdated: new Date(),
        },
      });

      this.logger.debug('Restaurant metadata updated with attributes', {
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
