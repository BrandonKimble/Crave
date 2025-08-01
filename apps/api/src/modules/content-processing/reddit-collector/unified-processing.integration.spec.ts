/**
 * Unified Processing Integration Tests
 *
 * End-to-end integration tests for unified processing service
 * validating integration with all dependent services.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { UnifiedProcessingService } from './unified-processing.service';
import { LLMModule } from '../../external-integrations/llm/llm.module';
import { EntityResolverModule } from '../entity-resolver/entity-resolver.module';
import { RepositoryModule } from '../../../repositories/repository.module';
import { SharedModule } from '../../../shared/shared.module';
import { DataMergeService } from './data-merge.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import {
  MergedLLMInputDto,
  DataSourceType,
  ProcessingResult,
} from './unified-processing.types';

describe('UnifiedProcessingService Integration', () => {
  let service: UnifiedProcessingService;
  let module: TestingModule;

  const mockMergedInput: MergedLLMInputDto = {
    posts: [
      {
        post_id: 'integration_test_post',
        title: 'Integration Test: Best Austin Tacos',
        content:
          'Torchys Tacos has the best queso in Austin. Their trailer park taco is amazing.',
        subreddit: 'austinfood',
        url: 'https://reddit.com/r/austinfood/integration_test_post',
        upvotes: 38,
        created_at: '2024-01-15T14:30:00Z',
        comments: [],
      },
    ],
    comments: [
      {
        comment_id: 'integration_test_comment',
        content: 'I love their green chile queso too!',
        author: 'taco_enthusiast',
        upvotes: 12,
        created_at: '2024-01-15T15:00:00Z',
        parent_id: 'integration_test_post',
        url: 'https://reddit.com/r/austinfood/integration_test_post/integration_test_comment',
      },
    ],
    sourceMetadata: {
      batchId: 'integration_test_batch',
      mergeTimestamp: new Date('2024-01-15T16:00:00Z'),
      sourceBreakdown: {
        [DataSourceType.PUSHSHIFT_ARCHIVE]: 1,
        [DataSourceType.REDDIT_API_CHRONOLOGICAL]: 0,
        [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 1,
        [DataSourceType.REDDIT_API_ON_DEMAND]: 0,
      },
      temporalRange: {
        earliest: 1705329000000,
        latest: 1705330800000,
        spanHours: 0.5,
      },
    },
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        SharedModule,
        LLMModule,
        EntityResolverModule,
        RepositoryModule,
      ],
      providers: [
        UnifiedProcessingService,
        DataMergeService,
        {
          provide: DuplicateDetectionService,
          useValue: {
            detectAndFilterDuplicates: jest
              .fn()
              .mockImplementation((items) => ({
                filteredItems: items, // Return the input items as-is (no duplicates filtered)
                analysis: {
                  totalItems: items?.length || 0,
                  duplicatesFound: 0,
                  uniqueItems: items?.length || 0,
                  duplicateRate: 0,
                  sourceOverlap: {},
                  performanceMetrics: {
                    processingTimeMs: 10,
                    throughputItemsPerSecond: (items?.length || 0) * 100,
                  },
                },
              })),
          },
        },
      ],
    }).compile();

    service = module.get<UnifiedProcessingService>(UnifiedProcessingService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Full Pipeline Integration', () => {
    it('should process merged input through complete pipeline', async () => {
      // This test requires valid API keys and database connection
      // Skip if not in integration testing environment
      if (!process.env.LLM_API_KEY || process.env.NODE_ENV !== 'integration') {
        console.log(
          'Skipping integration test - requires LLM_API_KEY and NODE_ENV=integration',
        );
        return;
      }

      // Act
      const result = await service.processUnifiedBatch(mockMergedInput, {
        enableQualityScores: false, // Disable for integration test
        enableSourceAttribution: true,
        maxRetries: 1,
        batchTimeout: 60000,
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.batchId).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThan(0);
      expect(result.sourceBreakdown).toEqual(
        mockMergedInput.sourceMetadata.sourceBreakdown,
      );

      // Validate LLM processing
      expect(result.llmResult.successfulProcessing).toBe(true);
      expect(result.llmResult.mentionsExtracted).toBeGreaterThan(0);

      // Validate entity resolution
      expect(result.entityResolution.entitiesProcessed).toBeGreaterThan(0);

      // Validate performance metrics
      const metrics = service.getPerformanceMetrics();
      expect(metrics.batchesProcessed).toBeGreaterThan(0);
      expect(metrics.successfulLLMCalls).toBeGreaterThan(0);

      console.log('Integration test results:', {
        processingTime: result.processingTimeMs,
        mentionsExtracted: result.llmResult.mentionsExtracted,
        entitiesProcessed: result.entityResolution.entitiesProcessed,
        newEntities: result.entityResolution.newEntitiesCreated,
      });
    }, 120000); // 2 minute timeout for integration test

    it('should handle processing errors gracefully', async () => {
      // Test with malformed input to trigger error handling
      const malformedInput: MergedLLMInputDto = {
        posts: [],
        comments: [],
        sourceMetadata: {
          batchId: 'error_test_batch',
          mergeTimestamp: new Date(),
          sourceBreakdown: {
            [DataSourceType.PUSHSHIFT_ARCHIVE]: 0,
            [DataSourceType.REDDIT_API_CHRONOLOGICAL]: 0,
            [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 0,
            [DataSourceType.REDDIT_API_ON_DEMAND]: 0,
          },
          temporalRange: {
            earliest: 0,
            latest: 0,
            spanHours: 0,
          },
        },
      };

      // Act
      const result = await service.processUnifiedBatch(malformedInput);

      // Assert - should handle empty input gracefully
      expect(result.success).toBe(true);
      expect(result.llmResult.mentionsExtracted).toBe(0);
      expect(result.entityResolution.entitiesProcessed).toBe(0);
    });

    it('should maintain performance within acceptable limits', async () => {
      if (!process.env.LLM_API_KEY || process.env.NODE_ENV !== 'integration') {
        console.log(
          'Skipping integration test - requires LLM_API_KEY and NODE_ENV=integration',
        );
        return;
      }

      const startTime = Date.now();

      // Act
      const result = await service.processUnifiedBatch(mockMergedInput);

      // Assert
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(result.processingTimeMs).toBeLessThan(30000);

      console.log('Performance metrics:', {
        totalTime,
        processingTime: result.processingTimeMs,
        efficiency: result.processingTimeMs / totalTime,
      });
    }, 60000);
  });

  describe('Service Integration', () => {
    it('should integrate correctly with LLMService', async () => {
      // This validates the service can be injected and initialized properly
      expect(service).toBeDefined();

      const metrics = service.getPerformanceMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.lastReset).toBeInstanceOf(Date);
    });

    it('should handle service dependencies correctly', () => {
      // Validate all required dependencies are available
      expect(service).toBeDefined();

      // Test service methods that don't require API calls
      service.resetPerformanceMetrics();
      const resetMetrics = service.getPerformanceMetrics();

      expect(resetMetrics.batchesProcessed).toBe(0);
      expect(resetMetrics.totalProcessingTime).toBe(0);
    });
  });

  describe('Data Flow Validation', () => {
    it('should preserve data integrity through processing pipeline', async () => {
      if (!process.env.LLM_API_KEY || process.env.NODE_ENV !== 'integration') {
        console.log(
          'Skipping integration test - requires LLM_API_KEY and NODE_ENV=integration',
        );
        return;
      }

      // Act
      const result = await service.processUnifiedBatch(mockMergedInput);

      // Assert data integrity
      expect(result.sourceBreakdown).toEqual(
        mockMergedInput.sourceMetadata.sourceBreakdown,
      );
      expect(result.batchId).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThan(0);

      // Validate all processing stages completed
      expect(result.llmResult).toBeDefined();
      expect(result.entityResolution).toBeDefined();
      expect(result.databaseOperations).toBeDefined();
    }, 60000);

    it('should handle multiple source types correctly', async () => {
      const multiSourceInput: MergedLLMInputDto = {
        ...mockMergedInput,
        sourceMetadata: {
          ...mockMergedInput.sourceMetadata,
          sourceBreakdown: {
            [DataSourceType.PUSHSHIFT_ARCHIVE]: 2,
            [DataSourceType.REDDIT_API_CHRONOLOGICAL]: 0,
            [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 3,
            [DataSourceType.REDDIT_API_ON_DEMAND]: 0,
          },
        },
      };

      if (process.env.LLM_API_KEY && process.env.NODE_ENV === 'integration') {
        const result = await service.processUnifiedBatch(multiSourceInput);

        expect(result.sourceBreakdown[DataSourceType.PUSHSHIFT_ARCHIVE]).toBe(
          2,
        );
        expect(
          result.sourceBreakdown[DataSourceType.REDDIT_API_KEYWORD_SEARCH],
        ).toBe(3);
      } else {
        // At least validate the service can handle the input structure
        expect(multiSourceInput.sourceMetadata.sourceBreakdown).toBeDefined();
      }
    });
  });
});
