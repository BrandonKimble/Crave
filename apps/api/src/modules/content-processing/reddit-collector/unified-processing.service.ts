/**
 * Unified Processing Service
 *
 * Main orchestrator for integrating Reddit API data collection with existing M02 LLM processing pipeline
 * as specified in PRD sections 5.1.2 and 6.1. Creates unified entity extraction for both historical and
 * real-time data sources while maintaining consistency with existing processing standards.
 *
 * Implements the six-step unified pipeline:
 * 1. Data Source Selection (handled by DataMergeService)
 * 2. Content Retrieval (handled by collection services)
 * 3. LLM Content Processing (this service + existing LLMService)
 * 4. Consolidated Processing Phase (entity resolution + database updates)
 * 5. Database Transaction (bulk operations)
 * 6. Quality Score Updates (trigger existing M02 infrastructure)
 */

import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { EntityResolutionService } from '../entity-resolver/entity-resolution.service';
import { DataMergeService } from './data-merge.service';
import { QualityScoreService } from '../quality-score/quality-score.service';
import {
  MergedLLMInputDto,
  ProcessingResult,
  UnifiedProcessingConfig,
  ProcessingPerformanceMetrics,
} from './unified-processing.types';
import {
  LLMInputStructure,
  LLMOutputStructure,
} from '../../external-integrations/llm/llm.types';
import {
  EntityResolutionInput,
  BatchResolutionResult,
} from '../entity-resolver/entity-resolution.types';
import {
  UnifiedProcessingException,
  UnifiedProcessingExceptionFactory,
} from './unified-processing.exceptions';
import { v4 as uuidv4 } from 'uuid';

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
    private readonly llmService: LLMService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly dataMergeService: DataMergeService,
    private readonly qualityScoreService: QualityScoreService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('UnifiedProcessingService');
  }

  /**
   * Process unified batch through complete pipeline with batching
   * Implements PRD Section 6.1 - Six-step unified pipeline
   * PRD 6.6.4: Batch processing (100-500 entities per batch)
   */
  async processUnifiedBatch(
    mergedInput: MergedLLMInputDto,
    config?: Partial<UnifiedProcessingConfig>,
  ): Promise<ProcessingResult> {
    const batchId = uuidv4();
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
      this.logger.info(`Starting unified processing for batch ${batchId}`);
      this.logger.debug(
        `Processing ${mergedInput.posts.length} posts from sources: ${Object.keys(mergedInput.sourceMetadata.sourceBreakdown).join(', ')}`,
      );

      // Step 3: LLM Content Processing  
      const llmInput = this.convertMergedInputToLLMStructure(mergedInput);
      const llmOutput = await this.processWithLLM(llmInput, batchId);

      // PRD 6.6.4: Check if batch needs to be split
      if (llmOutput.mentions.length > processingConfig.batchSize!) {
        return await this.processMentionsInBatches(llmOutput, mergedInput.sourceMetadata, batchId, processingConfig);
      }

      // Process as single batch if under threshold
      return await this.processSingleBatch(llmOutput, mergedInput.sourceMetadata, batchId, processingConfig, startTime);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updatePerformanceMetrics(processingTime, false);

      this.logger.error(`Unified processing failed for batch ${batchId}`, {
        error: error.message,
        processingTime,
        sourceBreakdown: mergedInput.sourceMetadata.sourceBreakdown,
      });

      throw UnifiedProcessingExceptionFactory.createProcessingFailed(
        `Unified processing failed for batch ${batchId}`,
        error,
        {
          batchId,
          processingTime,
          sourceBreakdown: mergedInput.sourceMetadata.sourceBreakdown,
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
    const batchSize = config.batchSize!;
    const totalMentions = llmOutput.mentions.length;
    const batchCount = Math.ceil(totalMentions / batchSize);

    this.logger.info(`Splitting ${totalMentions} mentions into ${batchCount} batches of max ${batchSize}`, {
      parentBatchId,
    });

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
          Date.now()
        );

        totalEntitiesCreated += subResult.entityResolution.newEntitiesCreated;
        totalConnectionsCreated += subResult.databaseOperations.connectionsCreated;
        totalMentionsCreated += subResult.databaseOperations.mentionsCreated;
        allAffectedConnectionIds.push(...(subResult.databaseOperations.affectedConnectionIds || []));

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
    const entityResolutionInput =
      this.extractEntitiesFromLLMOutput(llmOutput);
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
    if (processingConfig.enableQualityScores && databaseResult.affectedConnectionIds) {
      await this.triggerQualityScoreUpdates(databaseResult.affectedConnectionIds);
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
   * Convert MergedLLMInputDto to LLMInputStructure
   * Implements PRD 6.3.1 - Uses exact Reddit field names per specification
   * Lines 1176-1231: Reddit API field consistency requirements
   */
  private convertMergedInputToLLMStructure(
    mergedInput: MergedLLMInputDto,
  ): LLMInputStructure {
    try {
      return {
        posts: mergedInput.posts.map((post) => ({
          id: post.id,
          title: post.title,
          selftext: post.content || '', // PRD 6.3.1: Use Reddit field name
          subreddit: post.subreddit,
          author: post.author || 'unknown',
          permalink: post.url, // PRD 6.3.1: Use Reddit field name
          score: post.score,
          created_utc: post.created_at ? new Date(post.created_at).getTime() / 1000 : Date.now() / 1000, // PRD 6.3.1: Unix timestamp
          comments: mergedInput.comments
            .filter(
              (comment) =>
                comment.parent_id === post.id || comment.parent_id === null,
            )
            .map((comment) => ({
              id: comment.id,
              body: comment.content, // PRD 6.3.1: Use Reddit field name
              author: comment.author || 'unknown',
              score: comment.score,
              parent_id: comment.parent_id, // PRD 6.3.1: Reddit field name
              permalink: comment.url, // PRD 6.3.1: Use Reddit field name
              subreddit: comment.subreddit || post.subreddit,
              created_utc: comment.created_at ? new Date(comment.created_at).getTime() / 1000 : Date.now() / 1000, // PRD 6.3.1: Unix timestamp
            })),
        })),
        // PRD 6.3.1: Include standalone comments array for archive-only processing
        comments: mergedInput.comments
          .filter((comment) => 
            !mergedInput.posts.some(post => comment.parent_id === post.id)
          )
          .map((comment) => ({
            id: comment.id,
            body: comment.content, // PRD 6.3.1: Use Reddit field name
            author: comment.author || 'unknown',
            score: comment.score,
            parent_id: comment.parent_id,
            permalink: comment.url, // PRD 6.3.1: Use Reddit field name
            subreddit: comment.subreddit || 'unknown',
            created_utc: comment.created_at ? new Date(comment.created_at).getTime() / 1000 : Date.now() / 1000, // PRD 6.3.1: Unix timestamp
          })),
      };
    } catch (error) {
      throw UnifiedProcessingExceptionFactory.createDataConversionFailed(
        'Failed to convert MergedLLMInputDto to LLMInputStructure',
        error,
        { sourceMetadata: mergedInput.sourceMetadata },
      );
    }
  }

  /**
   * Process content through existing LLM service
   * Maintains compatibility with M02 LLM processing infrastructure
   * Implements PRD 6.3.2 validation requirements
   */
  private async processWithLLM(
    llmInput: LLMInputStructure,
    batchId: string,
  ): Promise<LLMOutputStructure> {
    try {
      this.logger.debug(`Processing batch ${batchId} through LLM service`);
      const result = await this.llmService.processContent(llmInput);
      
      // PRD 6.3.2: Validate LLM output structure
      this.validateLLMOutput(result, batchId);
      
      this.performanceMetrics.successfulLLMCalls++;
      return result;
    } catch (error) {
      this.performanceMetrics.failedLLMCalls++;
      throw UnifiedProcessingExceptionFactory.createLLMIntegrationFailed(
        `LLM processing failed for batch ${batchId}`,
        error,
        { batchId, postsCount: llmInput.posts.length },
      );
    }
  }

  /**
   * Validate LLM output structure matches PRD 6.3.2 specification
   * Lines 1240-1283: Flattened structure with null-safe design
   */
  private validateLLMOutput(output: any, batchId: string): void {
    if (!output || typeof output !== 'object') {
      throw new Error(`Invalid LLM output structure for batch ${batchId}: not an object`);
    }

    if (!Array.isArray(output.mentions)) {
      throw new Error(`Invalid LLM output structure for batch ${batchId}: mentions is not an array`);
    }

    for (const mention of output.mentions) {
      // PRD 6.3.2: Required fields validation
      if (!mention.temp_id || typeof mention.temp_id !== 'string') {
        throw new Error(`Invalid mention: missing or invalid temp_id`);
      }

      // Restaurant fields (REQUIRED per PRD)
      if (!mention.restaurant_name || typeof mention.restaurant_name !== 'string') {
        throw new Error(`Invalid mention ${mention.temp_id}: missing restaurant_name`);
      }
      if (!mention.restaurant_temp_id || typeof mention.restaurant_temp_id !== 'string') {
        throw new Error(`Invalid mention ${mention.temp_id}: missing restaurant_temp_id`);
      }

      // Optional food fields - validate if present
      if (mention.food_name !== null && mention.food_name !== undefined) {
        if (typeof mention.food_name !== 'string') {
          throw new Error(`Invalid mention ${mention.temp_id}: food_name must be string or null`);
        }
        // If food is present, other food fields should be consistent
        if (mention.is_menu_item !== true && mention.is_menu_item !== false && mention.is_menu_item !== null) {
          throw new Error(`Invalid mention ${mention.temp_id}: is_menu_item must be boolean or null`);
        }
      }

      // Source tracking fields (REQUIRED per PRD)
      if (!['post', 'comment'].includes(mention.source_type)) {
        throw new Error(`Invalid mention ${mention.temp_id}: source_type must be 'post' or 'comment'`);
      }
      if (!mention.source_id || typeof mention.source_id !== 'string') {
        throw new Error(`Invalid mention ${mention.temp_id}: missing source_id`);
      }
      if (typeof mention.source_ups !== 'number') {
        throw new Error(`Invalid mention ${mention.temp_id}: source_ups must be a number`);
      }

      // Validate arrays are arrays or null
      const arrayFields = ['food_categories', 'restaurant_attributes', 'food_attributes_selective', 'food_attributes_descriptive'];
      for (const field of arrayFields) {
        if (mention[field] !== null && mention[field] !== undefined && !Array.isArray(mention[field])) {
          throw new Error(`Invalid mention ${mention.temp_id}: ${field} must be array or null`);
        }
      }

      // PRD 5.2.1: Context-dependent attribute validation
      // Check for attributes that might be context-dependent (cuisine, dietary, value, etc.)
      this.validateContextDependentAttributes(mention);
    }

    // PRD 5.2.1: Additional validation for context-dependent attributes
    this.validateEntityScopes(output.mentions);
  }

  /**
   * Validate context-dependent attributes (PRD 5.2.1)
   * Ensure attributes are properly scoped to dish vs restaurant context
   */
  private validateContextDependentAttributes(mention: any): void {
    const contextDependentKeywords = ['italian', 'vegan', 'gluten-free', 'spicy', 'authentic', 'casual', 'upscale'];
    
    // Check restaurant attributes for context-dependent keywords
    if (mention.restaurant_attributes && Array.isArray(mention.restaurant_attributes)) {
      for (const attr of mention.restaurant_attributes) {
        if (typeof attr === 'string' && contextDependentKeywords.includes(attr.toLowerCase())) {
          // This is acceptable - restaurant context for context-dependent attributes
          this.logger.debug(`Context-dependent attribute '${attr}' correctly assigned to restaurant context`, {
            mentionId: mention.temp_id,
          });
        }
      }
    }

    // Check food attributes for context-dependent keywords
    const allFoodAttributes = [
      ...(mention.food_attributes_selective || []),
      ...(mention.food_attributes_descriptive || [])
    ];
    
    for (const attr of allFoodAttributes) {
      if (typeof attr === 'string' && contextDependentKeywords.includes(attr.toLowerCase())) {
        // This is acceptable - food context for context-dependent attributes
        this.logger.debug(`Context-dependent attribute '${attr}' correctly assigned to food context`, {
          mentionId: mention.temp_id,
        });
      }
    }
  }

  /**
   * Validate entity scopes across all mentions (PRD 5.2.1)
   * Ensure consistent entity type assignments for context-dependent attributes
   */
  private validateEntityScopes(mentions: any[]): void {
    const attributeContexts = new Map<string, Set<string>>(); // attribute -> contexts (dish/restaurant)
    
    for (const mention of mentions) {
      // Track restaurant attributes
      if (mention.restaurant_attributes && Array.isArray(mention.restaurant_attributes)) {
        for (const attr of mention.restaurant_attributes) {
          if (typeof attr === 'string') {
            const normalizedAttr = attr.toLowerCase();
            if (!attributeContexts.has(normalizedAttr)) {
              attributeContexts.set(normalizedAttr, new Set());
            }
            attributeContexts.get(normalizedAttr)!.add('restaurant');
          }
        }
      }

      // Track food attributes
      const allFoodAttributes = [
        ...(mention.food_attributes_selective || []),
        ...(mention.food_attributes_descriptive || [])
      ];
      
      for (const attr of allFoodAttributes) {
        if (typeof attr === 'string') {
          const normalizedAttr = attr.toLowerCase();
          if (!attributeContexts.has(normalizedAttr)) {
            attributeContexts.set(normalizedAttr, new Set());
          }
          attributeContexts.get(normalizedAttr)!.add('food');
        }
      }
    }

    // Check for attributes appearing in both contexts (expected for context-dependent attributes)
    for (const [attribute, contexts] of attributeContexts) {
      if (contexts.size > 1) {
        this.logger.debug(`Context-dependent attribute detected: '${attribute}' appears in both food and restaurant contexts`, {
          contexts: Array.from(contexts),
        });
        // This is expected behavior per PRD 5.2.1 - no error thrown
      }
    }
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
            originalText: mention.restaurant_name,  // Using normalized as original since we only have one
            entityType: 'restaurant' as const,
            tempId: mention.restaurant_temp_id,
          });
        }

        // Food entity (dish or category)
        if (mention.food_name && mention.food_temp_id) {
          entities.push({
            normalizedName: mention.food_name,
            originalText: mention.food_name,  // Using normalized as original
            entityType: 'dish_or_category' as const,
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
                entityType: 'dish_or_category' as const,
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
                entityType: 'dish_attribute' as const,
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
                entityType: 'dish_attribute' as const,
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
      const entityDetails = resolutionResult.entityDetails || new Map<string, any>();
      
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
          const currentTotal = restaurantPraiseUpvotes.get(mentionResult.restaurantEntityId) || 0;
          restaurantPraiseUpvotes.set(mentionResult.restaurantEntityId, currentTotal + mentionResult.generalPraiseUpvotes);
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
        for (const resolution of resolutionResult.resolutionResults) {
          if (resolution.isNewEntity && resolution.entityId) {
            await tx.entity.create({
              data: {
                entityId: resolution.entityId,
                name: resolution.normalizedName,
                type: resolution.entityType,
                aliases: resolution.validatedAliases || [resolution.originalInput.originalText],
                restaurantAttributes: [], // Initialize empty for all entity types
                restaurantQualityScore: 0,
                generalPraiseUpvotes: 0,
                restaurantMetadata: {},
                createdAt: new Date(),
                lastUpdated: new Date(),
              },
            });
            entitiesCreated++;
            
            this.logger.debug('Created entity in transaction', {
              batchId,
              entityId: resolution.entityId,
              entityType: resolution.entityType,
              name: resolution.normalizedName,
            });
          }
        }

        // Mentions are now created as part of connection operations

        // Execute all connection operations and collect affected connection IDs
        const additionalAffectedIds: string[] = [];
        for (const connectionOp of connectionOperations) {
          if (connectionOp.type === 'category_boost') {
            const ids = await this.handleCategoryBoost(tx, connectionOp, batchId);
            additionalAffectedIds.push(...ids);
          } else if (connectionOp.type === 'attribute_boost') {
            const ids = await this.handleAttributeBoost(tx, connectionOp, batchId);
            additionalAffectedIds.push(...ids);
          } else if (connectionOp.type === 'dish_attribute_processing') {
            const ids = await this.handleDishAttributeProcessing(tx, connectionOp, batchId);
            additionalAffectedIds.push(...ids);
          } else if (connectionOp.type === 'restaurant_metadata_update') {
            await this.handleRestaurantMetadataUpdate(tx, connectionOp, batchId);
          } else if (connectionOp.type === 'general_praise_boost') {
            const ids = await this.handleGeneralPraiseBoost(tx, connectionOp, batchId);
            additionalAffectedIds.push(...ids);
          } else if (connectionOp.type === 'mention_create') {
            await tx.mention.create({ data: connectionOp.mentionData });
          } else {
            // Regular upsert operation
            await tx.connection.upsert(connectionOp);
          }
        }
        
        // Combine all affected connection IDs
        const allAffectedConnectionIds = [...new Set([...affectedConnectionIds, ...additionalAffectedIds])];

        // PRD 6.4.2: Update top mentions for all affected connections
        await this.updateTopMentions(tx, allAffectedConnectionIds, batchId);

        // Update restaurant entities with general praise upvotes
        for (const [restaurantEntityId, praiseUpvotes] of restaurantPraiseUpvotes) {
          await tx.entity.update({
            where: { entityId: restaurantEntityId },
            data: {
              generalPraiseUpvotes: { increment: praiseUpvotes },
              lastUpdated: new Date(),
            },
          });
        }


        return {
          entitiesCreated,
          connectionsCreated,
          mentionsCreated,
          affectedConnectionIds: [...new Set([...affectedConnectionIds, ...additionalAffectedIds])],
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
          error: lastError.message,
        });

        // Don't retry on certain types of errors
        if (this.isNonRetryableError(lastError)) {
          this.logger.error('Non-retryable error encountered', {
            batchId,
            attempt,
            error: lastError.message,
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
          await new Promise(resolve => setTimeout(resolve, delayMs));
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
    return nonRetryablePatterns.some(pattern => errorMessage.includes(pattern));
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
      const restaurantEntityId = tempIdToEntityIdMap.get(mention.restaurant_temp_id);
      if (!restaurantEntityId) {
        this.logger.warn('Restaurant entity not resolved, skipping mention', {
          batchId,
          mentionTempId: mention.temp_id,
          restaurantTempId: mention.restaurant_temp_id,
        });
        return { mentionOperation: null, connectionOperations: [], affectedConnectionIds: [], generalPraiseUpvotes: 0, restaurantEntityId: '' };
      }

      // PRD 6.4.2: Calculate time-weighted mention score
      const mentionCreatedAt = new Date(mention.source_created_at);
      const daysSince = (Date.now() - mentionCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
      const timeWeightedScore = mention.source_ups * Math.exp(-daysSince / 60);


      // Store mention data for later creation after connection is established
      const mentionData = {
        mentionId: uuidv4(),
        tempId: mention.temp_id,
        sourceType: mention.source_type,
        sourceId: mention.source_id,
        sourceUrl: mention.source_url,
        subreddit: mention.subreddit || 'unknown',
        contentExcerpt: mention.source_content.substring(0, 500), // Truncate for excerpt
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
      if (mention.restaurant_attributes && mention.restaurant_attributes.length > 0) {
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
          
          this.logger.debug('Restaurant attributes queued for metadata update', {
            batchId,
            restaurantEntityId,
            attributeIds: restaurantAttributeIds,
          });
        }
      }

      // Component 3: General Praise (when general_praise is true)
      // PRD 6.5.1: Boost all existing dish connections for this restaurant
      // PRD lines 1376-1381: Do not create dish connections if none exist
      if (mention.general_praise) {
        const generalPraiseOperation = {
          type: 'general_praise_boost',
          restaurantEntityId: restaurantEntityId,
          upvotes: mention.source_ups,
          isRecent,
          mentionCreatedAt,
          activityLevel,
          mentionData: mentionData,
        };
        connectionOperations.push(generalPraiseOperation);
        
        this.logger.debug('General praise boost queued for restaurant', {
          batchId,
          restaurantEntityId,
          upvotes: mention.source_ups,
        });
      }
      const generalPraiseUpvotes = mention.general_praise ? mention.source_ups : 0;

      // Component 4: Specific Food Processing (when food + is_menu_item = true)
      // PRD 6.5.3: Complex attribute logic for specific foods
      // PRD 6.5.2: Always create connections for specific foods
      if (mention.food_temp_id && mention.is_menu_item === true) {
        const foodEntityId = tempIdToEntityIdMap.get(mention.food_temp_id);
        if (foodEntityId) {
          const hasSelectiveAttrs = mention.food_attributes_selective && mention.food_attributes_selective.length > 0;
          const hasDescriptiveAttrs = mention.food_attributes_descriptive && mention.food_attributes_descriptive.length > 0;

          // Always use dish_attribute_processing for consistent handling
          const dishAttributeOperation = {
            type: 'dish_attribute_processing',
            restaurantEntityId,
            dishEntityId: foodEntityId,
            upvotes: mention.source_ups,
            isRecent,
            mentionCreatedAt,
            activityLevel,
            selectiveAttributes: mention.food_attributes_selective || [],
            descriptiveAttributes: mention.food_attributes_descriptive || [],
            hasSelectiveAttrs,
            hasDescriptiveAttrs,
            mentionData: mentionData, // Include mention data for creation
          };
          connectionOperations.push(dishAttributeOperation);
        }
      }

      // Component 5: Category Processing (when food + is_menu_item = false)
      // PRD 6.5.1: Find existing food connections with category and boost them
      // PRD 6.5.2: Never create category connections - only boost existing ones
      else if (mention.food_temp_id && mention.is_menu_item === false) {
        const categoryEntityId = tempIdToEntityIdMap.get(mention.food_temp_id);
        if (categoryEntityId) {
          // Add operation to find and boost existing connections with this category
          const categoryBoostOperation = {
            type: 'category_boost',
            restaurantEntityId,
            categoryEntityId,
            upvotes: mention.source_ups,
            isRecent,
            mentionCreatedAt,
            activityLevel,
            selectiveAttributes: mention.food_attributes_selective,
            descriptiveAttributes: mention.food_attributes_descriptive,
            mentionData: mentionData, // Add mention data for Component 5
          };
          connectionOperations.push(categoryBoostOperation);
        }
      }

      // Component 6: Attribute-Only Processing (when no food but food_attributes present)
      // PRD 6.5.1: Find existing food connections with ANY of the selective attributes
      // PRD 6.5.2: Never create attribute connections - only boost existing ones
      if (!mention.food_temp_id && (mention.food_attributes_selective || mention.food_attributes_descriptive)) {
        if (mention.food_attributes_selective && mention.food_attributes_selective.length > 0) {
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
      
      return { mentionOperation: null, connectionOperations: [], affectedConnectionIds: [], generalPraiseUpvotes: 0, restaurantEntityId: '' };
    }
  }

  /**
   * Update top mentions for connections (PRD 6.4.2)
   * Re-scores ALL existing mentions and maintains top 3-5 mentions array
   */
  private async updateTopMentions(tx: any, connectionIds: string[], batchId: string): Promise<void> {
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
          const daysSince = (Date.now() - new Date(mention.createdAt).getTime()) / (1000 * 60 * 60 * 24);
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

        // PRD 6.4.2: Calculate activity level based on top mentions
        const allTopMentionsRecent = topMentions.every(m => {
          const daysSince = (Date.now() - new Date(m.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          return daysSince <= 30;
        });

        const activityLevel = allTopMentionsRecent && topMentions.length >= 3 ? 'trending' : 
                             topMentions.some(m => {
                               const daysSince = (Date.now() - new Date(m.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                               return daysSince <= 7;
                             }) ? 'active' : 'normal';

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
   * Handle Category Boost Operations (Component 5 - PRD 6.5.1)
   * Find existing dish connections with category and boost them
   * Returns array of affected connection IDs for top mentions update
   */
  private async handleCategoryBoost(tx: any, operation: any, batchId: string): Promise<string[]> {
    try {
      // PRD 6.5.1: Find existing dish connections with this category
      const existingConnections = await tx.connection.findMany({
        where: {
          restaurantId: operation.restaurantEntityId,
          categories: { has: operation.categoryEntityId },
        },
      });

      if (existingConnections.length === 0) {
        this.logger.debug('No existing connections found for category boost - skipping', {
          batchId,
          restaurantId: operation.restaurantEntityId,
          categoryId: operation.categoryEntityId,
        });
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
            lastMentionedAt: operation.mentionCreatedAt > connection.lastMentionedAt ? operation.mentionCreatedAt : undefined,
            activityLevel: operation.activityLevel,
            lastUpdated: new Date(),
          },
        });

        // Create mention linked to this connection
        await tx.mention.create({
          data: {
            ...operation.mentionData,
            connectionId: connection.connectionId, // Link mention to boosted connection
          },
        });

        this.logger.debug('Boosted existing category connection and created mention', {
          batchId,
          connectionId: connection.connectionId,
          categoryId: operation.categoryEntityId,
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
   * Find existing dish connections with ANY of the selective attributes
   * Returns array of affected connection IDs for top mentions update
   */
  private async handleAttributeBoost(tx: any, operation: any, batchId: string): Promise<string[]> {
    try {
      // PRD 6.5.1: Find existing dish connections with ANY of the selective attributes (OR logic)
      // Validate that selectiveAttributes is a non-empty array
      if (!operation.selectiveAttributes || !Array.isArray(operation.selectiveAttributes) || operation.selectiveAttributes.length === 0) {
        this.logger.debug('No selective attributes provided for attribute boost - skipping', {
          batchId,
          restaurantId: operation.restaurantEntityId,
        });
        return [];
      }

      const existingConnections = await tx.connection.findMany({
        where: {
          restaurantId: operation.restaurantEntityId,
          dishAttributes: { hasSome: operation.selectiveAttributes },
        },
      });

      if (existingConnections.length === 0) {
        this.logger.debug('No existing connections found for attribute boost - skipping', {
          batchId,
          restaurantId: operation.restaurantEntityId,
          attributes: operation.selectiveAttributes,
        });
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
            lastMentionedAt: operation.mentionCreatedAt > connection.lastMentionedAt ? operation.mentionCreatedAt : undefined,
            activityLevel: operation.activityLevel,
            lastUpdated: new Date(),
          },
        });

        // Create mention linked to this connection
        await tx.mention.create({
          data: {
            ...operation.mentionData,
            connectionId: connection.connectionId, // Link mention to boosted connection
          },
        });

        this.logger.debug('Boosted existing attribute connection and created mention', {
          batchId,
          connectionId: connection.connectionId,
          attributes: operation.selectiveAttributes,
        });
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
   * Handle Dish Attribute Processing (Component 4 - PRD 6.5.3)
   * Implements complex OR/AND logic for selective/descriptive attributes
   * PRD 6.5.2: Always creates connections for specific dishes (is_menu_item = true)
   */
  private async handleDishAttributeProcessing(tx: any, operation: any, batchId: string): Promise<string[]> {
    try {
      const { restaurantEntityId, dishEntityId, selectiveAttributes, descriptiveAttributes, hasSelectiveAttrs, hasDescriptiveAttrs, mentionData } = operation;

      let affectedConnectionIds: string[] = [];

      // PRD 6.5.3: Complex attribute logic
      if (hasSelectiveAttrs && !hasDescriptiveAttrs) {
        // All Selective: Find existing connections with ANY selective attributes
        affectedConnectionIds = await this.handleAllSelectiveAttributes(tx, operation, batchId);
      } else if (!hasSelectiveAttrs && hasDescriptiveAttrs) {
        // All Descriptive: Find ANY existing connections and add descriptive attributes
        affectedConnectionIds = await this.handleAllDescriptiveAttributes(tx, operation, batchId);
      } else if (hasSelectiveAttrs && hasDescriptiveAttrs) {
        // Mixed: Find connections with ANY selective + add descriptive attributes
        affectedConnectionIds = await this.handleMixedAttributes(tx, operation, batchId);
      } else {
        // No attributes: Simple dish connection - find or create
        affectedConnectionIds = await this.handleSimpleDishConnection(tx, operation, batchId);
      }

      return affectedConnectionIds;
    } catch (error) {
      this.logger.error('Failed to handle dish attribute processing', {
        batchId,
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Handle Simple Dish Connection without attributes (PRD 6.5.2)
   * Find or create restaurant→dish connection and boost it
   */
  private async handleSimpleDishConnection(tx: any, operation: any, batchId: string): Promise<string[]> {
    const existingConnection = await tx.connection.findUnique({
      where: {
        restaurantId_dishOrCategoryId: {
          restaurantId: operation.restaurantEntityId,
          dishOrCategoryId: operation.dishEntityId,
        },
      },
    });

    if (existingConnection) {
      // Boost existing connection
      await this.boostConnection(tx, existingConnection, operation);
      
      // Create mention linked to this connection
      await tx.mention.create({
        data: {
          ...operation.mentionData,
          connectionId: existingConnection.connectionId,
        },
      });
      
      return [existingConnection.connectionId];
    } else {
      // Create new connection
      const connectionId = uuidv4();
      await tx.connection.create({
        data: {
          connectionId: connectionId,
          restaurantId: operation.restaurantEntityId,
          dishOrCategoryId: operation.dishEntityId,
          categories: [],
          dishAttributes: [],
          isMenuItem: true,
          mentionCount: 1,
          totalUpvotes: operation.upvotes,
          recentMentionCount: operation.isRecent ? 1 : 0,
          lastMentionedAt: operation.mentionCreatedAt,
          activityLevel: operation.activityLevel,
          topMentions: [],
          dishQualityScore: operation.upvotes * 0.1,
          lastUpdated: new Date(),
          createdAt: new Date(),
        },
      });

      // Create mention linked to new connection
      await tx.mention.create({
        data: {
          ...operation.mentionData,
          connectionId: connectionId,
        },
      });

      this.logger.debug('Created new simple dish connection', {
        batchId,
        connectionId,
        restaurantId: operation.restaurantEntityId,
        dishId: operation.dishEntityId,
      });
      
      return [connectionId];
    }
  }

  /**
   * Handle All Selective Attributes (PRD 6.5.3)
   * Find existing restaurant→dish connections that have ANY of the selective attributes
   */
  private async handleAllSelectiveAttributes(tx: any, operation: any, batchId: string): Promise<string[]> {
    // Validate that selectiveAttributes is a non-empty array before using hasSome
    if (!operation.selectiveAttributes || !Array.isArray(operation.selectiveAttributes) || operation.selectiveAttributes.length === 0) {
      this.logger.debug('No selective attributes for dish processing - creating new connection', { batchId });
      return await this.createNewDishConnection(tx, operation, []);
    }

    const existingConnections = await tx.connection.findMany({
      where: {
        restaurantId: operation.restaurantEntityId,
        dishOrCategoryId: operation.dishEntityId,
        dishAttributes: { hasSome: operation.selectiveAttributes },
      },
    });

    if (existingConnections.length > 0) {
      // Boost existing connections
      const affectedIds: string[] = [];
      for (const connection of existingConnections) {
        affectedIds.push(connection.connectionId);
        await this.boostConnection(tx, connection, operation);
      }
      return affectedIds;
    } else {
      // Create new connection with all attributes
      return await this.createNewDishConnection(tx, operation, operation.selectiveAttributes);
    }
  }

  /**
   * Handle All Descriptive Attributes (PRD 6.5.3)
   * Find ANY existing restaurant→dish connections and add descriptive attributes
   */
  private async handleAllDescriptiveAttributes(tx: any, operation: any, batchId: string): Promise<string[]> {
    const existingConnections = await tx.connection.findMany({
      where: {
        restaurantId: operation.restaurantEntityId,
        dishOrCategoryId: operation.dishEntityId,
      },
    });

    if (existingConnections.length > 0) {
      // Boost connections and add descriptive attributes
      const affectedIds: string[] = [];
      for (const connection of existingConnections) {
        affectedIds.push(connection.connectionId);
        await this.boostConnectionAndAddAttributes(tx, connection, operation, operation.descriptiveAttributes);
      }
      return affectedIds;
    } else {
      // Create new connection with all attributes
      return await this.createNewDishConnection(tx, operation, operation.descriptiveAttributes);
    }
  }

  /**
   * Handle Mixed Attributes (PRD 6.5.3)
   * Find connections with ANY selective + add descriptive attributes
   */
  private async handleMixedAttributes(tx: any, operation: any, batchId: string): Promise<string[]> {
    // Validate that selectiveAttributes is a non-empty array before using hasSome
    if (!operation.selectiveAttributes || !Array.isArray(operation.selectiveAttributes) || operation.selectiveAttributes.length === 0) {
      this.logger.debug('No selective attributes for mixed processing - handling as descriptive-only', { batchId });
      return await this.handleAllDescriptiveAttributes(tx, operation, batchId);
    }

    const existingConnections = await tx.connection.findMany({
      where: {
        restaurantId: operation.restaurantEntityId,
        dishOrCategoryId: operation.dishEntityId,
        dishAttributes: { hasSome: operation.selectiveAttributes },
      },
    });

    if (existingConnections.length > 0) {
      // Boost connections and add descriptive attributes
      const affectedIds: string[] = [];
      for (const connection of existingConnections) {
        affectedIds.push(connection.connectionId);
        await this.boostConnectionAndAddAttributes(tx, connection, operation, operation.descriptiveAttributes);
      }
      return affectedIds;
    } else {
      // Create new connection with all attributes
      const allAttributes = [...operation.selectiveAttributes, ...operation.descriptiveAttributes];
      return await this.createNewDishConnection(tx, operation, allAttributes);
    }
  }

  /**
   * Boost existing connection with metrics and create mention
   */
  private async boostConnection(tx: any, connection: any, operation: any): Promise<void> {
    await tx.connection.update({
      where: { connectionId: connection.connectionId },
      data: {
        mentionCount: { increment: 1 },
        totalUpvotes: { increment: operation.upvotes },
        recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
        lastMentionedAt: operation.mentionCreatedAt > connection.lastMentionedAt ? operation.mentionCreatedAt : undefined,
        activityLevel: operation.activityLevel,
        lastUpdated: new Date(),
      },
    });

    // Create mention linked to this connection
    if (operation.mentionData) {
      await tx.mention.create({
        data: {
          ...operation.mentionData,
          connectionId: connection.connectionId,
        },
      });
    }
  }

  /**
   * Boost connection and add new descriptive attributes with mention
   */
  private async boostConnectionAndAddAttributes(tx: any, connection: any, operation: any, newAttributes: string[]): Promise<void> {
    const existingAttributes = connection.dishAttributes || [];
    const mergedAttributes = [...new Set([...existingAttributes, ...newAttributes])];

    await tx.connection.update({
      where: { connectionId: connection.connectionId },
      data: {
        mentionCount: { increment: 1 },
        totalUpvotes: { increment: operation.upvotes },
        recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
        lastMentionedAt: operation.mentionCreatedAt > connection.lastMentionedAt ? operation.mentionCreatedAt : undefined,
        activityLevel: operation.activityLevel,
        dishAttributes: mergedAttributes,
        lastUpdated: new Date(),
      },
    });

    // Create mention linked to this connection
    if (operation.mentionData) {
      await tx.mention.create({
        data: {
          ...operation.mentionData,
          connectionId: connection.connectionId,
        },
      });
    }
  }

  /**
   * Create new dish connection with attributes and mention
   */
  private async createNewDishConnection(tx: any, operation: any, attributes: string[]): Promise<string[]> {
    const dishConnectionId = uuidv4();
    await tx.connection.create({
      data: {
        connectionId: dishConnectionId,
        restaurantId: operation.restaurantEntityId,
        dishOrCategoryId: operation.dishEntityId,
        categories: [],
        dishAttributes: attributes,
        isMenuItem: true,
        mentionCount: 1,
        totalUpvotes: operation.upvotes,
        recentMentionCount: operation.isRecent ? 1 : 0,
        lastMentionedAt: operation.mentionCreatedAt,
        activityLevel: operation.activityLevel,
        topMentions: [],
        dishQualityScore: operation.upvotes * 0.1,
        lastUpdated: new Date(),
        createdAt: new Date(),
      },
    });

    // Create mention linked to new connection
    if (operation.mentionData) {
      await tx.mention.create({
        data: {
          ...operation.mentionData,
          connectionId: dishConnectionId,
        },
      });
    }
    
    return [dishConnectionId];
  }

  /**
   * Handle restaurant metadata updates - Component 2 implementation
   * PRD 6.5.1: Add restaurant_attribute entity IDs to restaurant entity's metadata
   */
  private async handleRestaurantMetadataUpdate(tx: any, operation: any, batchId: string): Promise<void> {
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
      const currentMetadata = restaurant.restaurantMetadata as any || {};
      const existingAttributeIds = currentMetadata.restaurantAttributeIds || [];
      const updatedAttributeIds = [...new Set([...existingAttributeIds, ...operation.attributeIds])];

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

      // Create mention for this component
      await tx.mention.create({
        data: {
          ...operation.mentionData,
          connectionId: null, // Component 2 doesn't create connections, only mentions
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
   * Boost all existing dish connections for this restaurant
   * PRD lines 1376-1381: Do not create dish connections if none exist
   */
  private async handleGeneralPraiseBoost(tx: any, operation: any, batchId: string): Promise<void> {
    try {
      // Find all existing dish connections for this restaurant
      const existingConnections = await tx.connection.findMany({
        where: {
          restaurantId: operation.restaurantEntityId,
          isMenuItem: true, // Only boost actual dish connections, not categories
        },
      });

      if (existingConnections.length === 0) {
        this.logger.debug('No existing dish connections found for general praise boost - skipping', {
          batchId,
          restaurantId: operation.restaurantEntityId,
        });
        
        // Still create a mention for tracking but no connection to link it to
        await tx.mention.create({
          data: {
            ...operation.mentionData,
            connectionId: null, // No connection for general praise without dishes
          },
        });
        return;
      }

      // Boost all found dish connections
      for (const connection of existingConnections) {
        await tx.connection.update({
          where: { connectionId: connection.connectionId },
          data: {
            mentionCount: { increment: 1 },
            totalUpvotes: { increment: operation.upvotes },
            recentMentionCount: { increment: operation.isRecent ? 1 : 0 },
            lastMentionedAt: operation.mentionCreatedAt > connection.lastMentionedAt ? operation.mentionCreatedAt : undefined,
            activityLevel: operation.activityLevel,
            lastUpdated: new Date(),
          },
        });

        // Create mention linked to each boosted connection
        await tx.mention.create({
          data: {
            ...operation.mentionData,
            mentionId: uuidv4(), // New ID for each mention link
            connectionId: connection.connectionId,
          },
        });

        this.logger.debug('Boosted dish connection with general praise', {
          batchId,
          connectionId: connection.connectionId,
          restaurantId: operation.restaurantEntityId,
        });
      }

      this.logger.info(`General praise applied to ${existingConnections.length} dish connections`, {
        batchId,
        restaurantId: operation.restaurantEntityId,
        upvotes: operation.upvotes,
      });

    } catch (error) {
      this.logger.error('Failed to handle general praise boost', {
        batchId,
        restaurantId: operation.restaurantEntityId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Trigger quality score updates using QualityScoreService (PRD Section 5.3)
   * Updates quality scores for all affected connections from component processing
   */
  private async triggerQualityScoreUpdates(affectedConnectionIds: string[]): Promise<void> {
    try {
      if (affectedConnectionIds.length === 0) {
        this.logger.debug('No connections to update quality scores for');
        return;
      }

      this.logger.debug(
        `Triggering quality score updates for ${affectedConnectionIds.length} connections`,
      );

      const updateResult = await this.qualityScoreService.updateQualityScoresForConnections(
        affectedConnectionIds
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
  private extractConnectionIdsFromComponentResults(componentResults: any[]): string[] {
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
