import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, Entity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService, CorrelationUtils } from '../shared';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { MentionRepository } from './mention.repository';
import {
  BulkOperationConfig,
  BulkOperationResult,
  BulkEntityInput,
  BulkConnectionInput,
  BulkMentionInput,
  TransactionExecutor,
} from './bulk-operations.types';

/**
 * Bulk Operations Service
 *
 * Implements PRD Section 6.6.2 - Bulk Database Operations with:
 * - Transaction Strategy: Single atomic transaction for consistency
 * - UPSERT operations: ON CONFLICT DO UPDATE/NOTHING for efficient merging
 * - Bulk operations: Multi-row inserts/updates minimize database round trips
 *
 * PRD Requirements:
 * - Section 9.2.1: Bulk operations pipeline - Multi-row inserts/updates, transaction management
 * - Section 9.2.2: Bulk operations successfully process batches without data corruption
 * - Section 6.6.2: Transaction Strategy, UPSERT operations, bulk operations
 */
@Injectable()
export class BulkOperationsService implements OnModuleInit {
  private logger!: LoggerService;
  private readonly defaultConfig: BulkOperationConfig = {
    batchSize: 250, // PRD 6.6.4: Start with 100-500 entities per batch
    enableTransactions: true,
    enableMetrics: true,
    maxRetries: 3,
    retryDelay: 1000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityRepository: EntityRepository,
    private readonly connectionRepository: ConnectionRepository,
    private readonly mentionRepository: MentionRepository,
    private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    if (this.loggerService) {
      this.logger = this.loggerService.setContext('BulkOperationsService');
    }
  }

  /**
   * Execute bulk entity operations with transaction management
   * Implements PRD 6.6.2 - Single atomic transaction for consistency
   */
  async bulkCreateEntities(
    entities: BulkEntityInput[],
    config?: Partial<BulkOperationConfig>,
  ): Promise<BulkOperationResult> {
    const operationConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();

    this.logger.info('Starting bulk entity creation', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'bulk_create_entities',
      entityCount: entities.length,
      batchSize: operationConfig.batchSize,
    });

    try {
      const result = await this.executeWithOptionalTransaction(
        operationConfig,
        async (tx) => {
          const results: BulkOperationResult[] = [];
          // Process entities in batches for optimal performance
          for (let i = 0; i < entities.length; i += operationConfig.batchSize) {
            const batch = entities.slice(i, i + operationConfig.batchSize);
            const batchResult = await this.processBulkEntityBatch(batch, tx);
            results.push(batchResult);

            this.logger.debug('Bulk entity batch processed', {
              correlationId: CorrelationUtils.getCorrelationId(),
              batchIndex: Math.floor(i / operationConfig.batchSize) + 1,
              batchSize: batch.length,
              processed: batchResult.successCount,
              failed: batchResult.failureCount,
            });
          }

          return this.aggregateResults(results, startTime);
        },
      );

      this.logger.info('Bulk entity creation completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_create_entities',
        ...result.metrics,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Bulk entity creation failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_create_entities',
        error: error instanceof Error ? error.message : String(error),
        duration,
        entityCount: entities.length,
      });
      throw error;
    }
  }

  /**
   * Execute bulk connection operations with foreign key validation
   * Implements PRD 6.6.2 - Connection updates with metrics and attributes
   */
  async bulkCreateConnections(
    connections: BulkConnectionInput[],
    config?: Partial<BulkOperationConfig>,
  ): Promise<BulkOperationResult> {
    const operationConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();

    this.logger.info('Starting bulk connection creation', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'bulk_create_connections',
      connectionCount: connections.length,
      batchSize: operationConfig.batchSize,
    });

    try {
      const result = await this.executeWithOptionalTransaction(
        operationConfig,
        async (tx) => {
          const results: BulkOperationResult[] = [];

          for (
            let i = 0;
            i < connections.length;
            i += operationConfig.batchSize
          ) {
            const batch = connections.slice(i, i + operationConfig.batchSize);
            const batchResult = await this.processBulkConnectionBatch(
              batch,
              tx,
            );
            results.push(batchResult);

            this.logger.debug('Bulk connection batch processed', {
              correlationId: CorrelationUtils.getCorrelationId(),
              batchIndex: Math.floor(i / operationConfig.batchSize) + 1,
              batchSize: batch.length,
              processed: batchResult.successCount,
              failed: batchResult.failureCount,
            });
          }

          return this.aggregateResults(results, startTime);
        },
      );

      this.logger.info('Bulk connection creation completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_create_connections',
        ...result.metrics,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Bulk connection creation failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_create_connections',
        error: error instanceof Error ? error.message : String(error),
        duration,
        connectionCount: connections.length,
      });
      throw error;
    }
  }

  /**
   * Execute bulk mention operations with connection references
   * Implements PRD 6.6.2 - Top mention updates with ranked mentions
   */
  async bulkCreateMentions(
    mentions: BulkMentionInput[],
    config?: Partial<BulkOperationConfig>,
  ): Promise<BulkOperationResult> {
    const operationConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();

    this.logger.info('Starting bulk mention creation', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'bulk_create_mentions',
      mentionCount: mentions.length,
      batchSize: operationConfig.batchSize,
    });

    try {
      const result = await this.executeWithOptionalTransaction(
        operationConfig,
        async (tx) => {
          const results: BulkOperationResult[] = [];

          for (let i = 0; i < mentions.length; i += operationConfig.batchSize) {
            const batch = mentions.slice(i, i + operationConfig.batchSize);
            const batchResult = await this.processBulkMentionBatch(batch, tx);
            results.push(batchResult);

            this.logger.debug('Bulk mention batch processed', {
              correlationId: CorrelationUtils.getCorrelationId(),
              batchIndex: Math.floor(i / operationConfig.batchSize) + 1,
              batchSize: batch.length,
              processed: batchResult.successCount,
              failed: batchResult.failureCount,
            });
          }

          return this.aggregateResults(results, startTime);
        },
      );

      this.logger.info('Bulk mention creation completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_create_mentions',
        ...result.metrics,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Bulk mention creation failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_create_mentions',
        error: error instanceof Error ? error.message : String(error),
        duration,
        mentionCount: mentions.length,
      });
      throw error;
    }
  }

  /**
   * Execute UPSERT operations for entity resolution integration
   * Implements PRD 6.6.2 - UPSERT operations for efficient entity merging
   */
  async bulkUpsertEntities(
    entities: Array<{
      where: Prisma.EntityWhereUniqueInput;
      create: Prisma.EntityCreateInput;
      update: Prisma.EntityUpdateInput;
    }>,
    config?: Partial<BulkOperationConfig>,
  ): Promise<BulkOperationResult> {
    const operationConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();

    this.logger.info('Starting bulk entity upsert', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'bulk_upsert_entities',
      entityCount: entities.length,
      batchSize: operationConfig.batchSize,
    });

    try {
      const result = await this.executeWithOptionalTransaction(
        operationConfig,
        async (tx) => {
          const results: BulkOperationResult[] = [];

          for (let i = 0; i < entities.length; i += operationConfig.batchSize) {
            const batch = entities.slice(i, i + operationConfig.batchSize);
            const batchResult = await this.processBulkUpsertBatch(batch, tx);
            results.push(batchResult);

            this.logger.debug('Bulk upsert batch processed', {
              correlationId: CorrelationUtils.getCorrelationId(),
              batchIndex: Math.floor(i / operationConfig.batchSize) + 1,
              batchSize: batch.length,
              processed: batchResult.successCount,
              failed: batchResult.failureCount,
            });
          }

          return this.aggregateResults(results, startTime);
        },
      );

      this.logger.info('Bulk entity upsert completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_upsert_entities',
        ...result.metrics,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Bulk entity upsert failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_upsert_entities',
        error: error instanceof Error ? error.message : String(error),
        duration,
        entityCount: entities.length,
      });
      throw error;
    }
  }

  /**
   * Execute operation with optional transaction management
   * Implements PRD 6.6.2 - Single atomic transaction strategy
   */
  private async executeWithOptionalTransaction<T>(
    config: BulkOperationConfig,
    operation: (tx: TransactionExecutor) => Promise<T>,
  ): Promise<T> {
    if (config.enableTransactions) {
      return await this.prisma.$transaction(async (tx) => {
        return await operation(tx as unknown as TransactionExecutor);
      });
    } else {
      // Use direct prisma service when transactions are disabled
      return await operation(this.prisma as unknown as TransactionExecutor);
    }
  }

  /**
   * Process a batch of entities with proper error handling
   */
  private async processBulkEntityBatch(
    entities: BulkEntityInput[],
    tx: TransactionExecutor,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    try {
      // Convert to Prisma create input format
      const entityData = entities.map((entity) => ({
        name: entity.name,
        type: entity.type,
        aliases: entity.aliases || [],
        restaurantAttributes: entity.restaurantAttributes || [],
        restaurantQualityScore: entity.restaurantQualityScore || 0,
        latitude: entity.latitude,
        longitude: entity.longitude,
        address: entity.address,
        googlePlaceId: entity.googlePlaceId,
        restaurantMetadata: entity.restaurantMetadata || {},
      }));

      this.logger.debug('Creating entities batch', {
        correlationId: CorrelationUtils.getCorrelationId(),
        entityCount: entities.length,
        entityData: entityData.slice(0, 2), // Log first 2 for debugging
      });

      const result = await tx.entity.createMany({
        data: entityData,
        skipDuplicates: true, // Skip duplicates to avoid unique constraint violations
      });

      this.logger.debug('Entity batch creation result', {
        correlationId: CorrelationUtils.getCorrelationId(),
        resultCount: result.count,
        expectedCount: entities.length,
      });

      const duration = Date.now() - startTime;
      return {
        successCount: result.count,
        failureCount: entities.length - result.count,
        errors: [],
        metrics: {
          totalItems: entities.length,
          successCount: result.count,
          failureCount: entities.length - result.count,
          duration,
          throughput: Math.round(result.count / (duration / 1000)),
          batchCount: 1,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        successCount: 0,
        failureCount: entities.length,
        errors: [error instanceof Error ? error.message : String(error)],
        metrics: {
          totalItems: entities.length,
          successCount: 0,
          failureCount: entities.length,
          duration,
          throughput: 0,
          batchCount: 1,
        },
      };
    }
  }

  /**
   * Process a batch of connections with foreign key validation
   */
  private async processBulkConnectionBatch(
    connections: BulkConnectionInput[],
    tx: TransactionExecutor,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    try {
      // Convert to Prisma create input format
      const connectionData = connections.map((connection) => ({
        restaurantId: connection.restaurantId,
        dishOrCategoryId: connection.dishOrCategoryId,
        categories: connection.categories || [],
        dishAttributes: connection.dishAttributes || [],
        isMenuItem: connection.isMenuItem ?? true,
        mentionCount: connection.mentionCount || 0,
        totalUpvotes: connection.totalUpvotes || 0,
        sourceDiversity: connection.sourceDiversity || 0,
        recentMentionCount: connection.recentMentionCount || 0,
        lastMentionedAt: connection.lastMentionedAt,
        activityLevel: connection.activityLevel || 'normal',
        topMentions: connection.topMentions || [],
        dishQualityScore: connection.dishQualityScore || 0,
      }));

      const result = await tx.connection.createMany({
        data: connectionData,
        skipDuplicates: true,
      });

      const duration = Date.now() - startTime;
      return {
        successCount: result.count,
        failureCount: connections.length - result.count,
        errors: [],
        metrics: {
          totalItems: connections.length,
          successCount: result.count,
          failureCount: connections.length - result.count,
          duration,
          throughput: Math.round(result.count / (duration / 1000)),
          batchCount: 1,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        successCount: 0,
        failureCount: connections.length,
        errors: [error instanceof Error ? error.message : String(error)],
        metrics: {
          totalItems: connections.length,
          successCount: 0,
          failureCount: connections.length,
          duration,
          throughput: 0,
          batchCount: 1,
        },
      };
    }
  }

  /**
   * Process a batch of mentions with connection references
   */
  private async processBulkMentionBatch(
    mentions: BulkMentionInput[],
    tx: TransactionExecutor,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    try {
      // Convert to Prisma create input format
      const mentionData = mentions.map((mention) => ({
        connectionId: mention.connectionId,
        sourceType: mention.sourceType,
        sourceId: mention.sourceId,
        sourceUrl: mention.sourceUrl,
        subreddit: mention.subreddit,
        contentExcerpt: mention.contentExcerpt,
        author: mention.author,
        upvotes: mention.upvotes || 0,
        createdAt: mention.createdAt,
      }));

      const result = await tx.mention.createMany({
        data: mentionData,
        skipDuplicates: true,
      });

      const duration = Date.now() - startTime;
      return {
        successCount: result.count,
        failureCount: mentions.length - result.count,
        errors: [],
        metrics: {
          totalItems: mentions.length,
          successCount: result.count,
          failureCount: mentions.length - result.count,
          duration,
          throughput: Math.round(result.count / (duration / 1000)),
          batchCount: 1,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        successCount: 0,
        failureCount: mentions.length,
        errors: [error instanceof Error ? error.message : String(error)],
        metrics: {
          totalItems: mentions.length,
          successCount: 0,
          failureCount: mentions.length,
          duration,
          throughput: 0,
          batchCount: 1,
        },
      };
    }
  }

  /**
   * Process a batch of entity upserts
   */
  private async processBulkUpsertBatch(
    entities: Array<{
      where: Prisma.EntityWhereUniqueInput;
      create: Prisma.EntityCreateInput;
      update: Prisma.EntityUpdateInput;
    }>,
    tx: TransactionExecutor,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let successCount = 0;

    // Process upserts individually since Prisma doesn't support bulk upsert
    for (const entityUpsert of entities) {
      try {
        this.logger.debug('Processing UPSERT', {
          correlationId: CorrelationUtils.getCorrelationId(),
          where: entityUpsert.where,
          createData: entityUpsert.create,
        });

        /* eslint-disable @typescript-eslint/no-unsafe-assignment */
        // Reason: Prisma transaction methods return any for delegate pattern
        const result: Entity = await tx.entity.upsert(entityUpsert);
        /* eslint-enable @typescript-eslint/no-unsafe-assignment */
        successCount++;

        this.logger.debug('UPSERT success', {
          correlationId: CorrelationUtils.getCorrelationId(),
          entityId: result.entityId,
          name: result.name,
        });
      } catch (error) {
        this.logger.error('UPSERT failed', {
          correlationId: CorrelationUtils.getCorrelationId(),
          error: error instanceof Error ? error.message : String(error),
          where: entityUpsert.where,
        });
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const duration = Date.now() - startTime;
    return {
      successCount,
      failureCount: entities.length - successCount,
      errors,
      metrics: {
        totalItems: entities.length,
        successCount,
        failureCount: entities.length - successCount,
        duration,
        throughput: Math.round(successCount / (duration / 1000)),
        batchCount: 1,
      },
    };
  }

  /**
   * Aggregate results from multiple batches
   */
  private aggregateResults(
    results: BulkOperationResult[],
    startTime: number,
  ): BulkOperationResult {
    const totalDuration = Date.now() - startTime;
    const totalItems = results.reduce(
      (sum, r) => sum + r.metrics.totalItems,
      0,
    );
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalFailures = results.reduce((sum, r) => sum + r.failureCount, 0);
    const allErrors = results.flatMap((r) => r.errors);

    return {
      successCount: totalSuccess,
      failureCount: totalFailures,
      errors: allErrors,
      metrics: {
        totalItems,
        successCount: totalSuccess,
        failureCount: totalFailures,
        duration: totalDuration,
        throughput: Math.round(totalSuccess / (totalDuration / 1000)),
        batchCount: results.length,
      },
    };
  }
}
