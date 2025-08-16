/**
 * Unified Processing Service Unit Tests
 *
 * Comprehensive test coverage for unified processing integration
 * following established testing patterns from existing codebase.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedProcessingService } from './unified-processing.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { EntityResolutionService } from '../entity-resolver/entity-resolution.service';
import { BulkOperationsService } from '../../../repositories/bulk-operations.service';
import { DataMergeService } from './data-merge.service';
import { LoggerService } from '../../../shared';
import {
  MergedLLMInputDto,
  DataSourceType,
  ProcessingResult,
} from './unified-processing.types';
import {
  LLMInputStructure,
  LLMOutputStructure,
} from '../../external-integrations/llm/llm.types';
import {
  UnifiedProcessingException,
  LLMIntegrationException,
} from './unified-processing.exceptions';

describe('UnifiedProcessingService', () => {
  let service: UnifiedProcessingService;
  let llmService: jest.Mocked<LLMService>;
  let entityResolutionService: jest.Mocked<EntityResolutionService>;
  let bulkOperationsService: jest.Mocked<BulkOperationsService>;
  let dataMergeService: jest.Mocked<DataMergeService>;
  let loggerService: jest.Mocked<LoggerService>;

  const mockMergedInput: MergedLLMInputDto = {
    posts: [
      {
        id: 'test_post_1',
        title: 'Best Austin BBQ',
        content: 'Franklin BBQ has amazing brisket',
        subreddit: 'austinfood',
        author: 'test_author',
        url: 'https://reddit.com/r/austinfood/test_post_1',
        score: 42,
        created_at: '2024-01-15T10:30:00Z',
        comments: [],
      },
    ],
    comments: [
      {
        id: 'test_comment_1',
        content: 'Their ribs are also incredible',
        author: 'food_lover',
        score: 15,
        created_at: '2024-01-15T11:00:00Z',
        parent_id: 'test_post_1',
        url: 'https://reddit.com/r/austinfood/test_post_1/test_comment_1',
      },
    ],
    sourceMetadata: {
      batchId: 'test_batch_1',
      mergeTimestamp: new Date('2024-01-15T12:00:00Z'),
      sourceBreakdown: {
        [DataSourceType.PUSHSHIFT_ARCHIVE]: 1,
        [DataSourceType.REDDIT_API_CHRONOLOGICAL]: 0,
        [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 0,
        [DataSourceType.REDDIT_API_ON_DEMAND]: 0,
      },
      temporalRange: {
        earliest: 1705315800000,
        latest: 1705317600000,
        spanHours: 0.5,
      },
    },
  };

  const mockLLMOutput: LLMOutputStructure = {
    mentions: [
      {
        temp_id: 'mention_1',
        restaurant_normalized_name: 'Franklin Barbecue',
        restaurant_original_text: 'Franklin BBQ',
        restaurant_temp_id: 'restaurant_1',
        restaurant_attributes: ['popular', 'bbq'],
        dish_primary_category: 'Brisket',
        dish_original_text: 'brisket',
        dish_temp_id: 'dish_1',
        dish_attributes_selective: null,
        dish_attributes_descriptive: ['amazing'],
        dish_is_menu_item: true,
        general_praise: true,
        source_type: 'post',
        source_id: 'test_post_1',
        source_content: 'Franklin BBQ has amazing brisket',
        source_url: 'https://reddit.com/r/austinfood/test_post_1',
        source_ups: 42,
        source_created_at: '2024-01-15T10:30:00Z',
      },
    ],
  };

  const mockEntityResolutionResult = {
    tempIdToEntityIdMap: new Map([
      ['restaurant_1', 'entity_1'],
      ['dish_1', 'entity_2'],
    ]),
    resolutionResults: [
      {
        entityId: 'entity_1',
        tempId: 'restaurant_1',
        confidence: 0.9,
        resolutionTier: 'exact' as const,
        originalInput: {
          normalizedName: 'Franklin Barbecue',
          originalText: 'Franklin BBQ',
          entityType: 'restaurant' as const,
          tempId: 'restaurant_1',
        },
      },
      {
        entityId: 'entity_2',
        tempId: 'dish_1',
        confidence: 0.7,
        resolutionTier: 'fuzzy' as const,
        originalInput: {
          normalizedName: 'Brisket',
          originalText: 'Brisket',
          entityType: 'dish_or_category' as const,
          tempId: 'dish_1',
        },
      },
    ],
    newEntitiesCreated: 2,
    performanceMetrics: {
      totalProcessed: 4,
      exactMatches: 1,
      aliasMatches: 1,
      fuzzyMatches: 0,
      newEntitiesCreated: 2,
      processingTimeMs: 150,
      averageConfidence: 0.8,
    },
  };

  beforeEach(async () => {
    const mockLLMService = {
      processContent: jest.fn(),
    };

    const mockEntityResolutionService = {
      resolveBatch: jest.fn(),
    };

    const mockBulkOperationsService = {
      performBulkOperations: jest.fn(),
    };

    const mockDataMergeService = {
      mergeBatch: jest.fn(),
    };

    const mockLoggerService = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedProcessingService,
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: EntityResolutionService,
          useValue: mockEntityResolutionService,
        },
        {
          provide: BulkOperationsService,
          useValue: mockBulkOperationsService,
        },
        {
          provide: DataMergeService,
          useValue: mockDataMergeService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<UnifiedProcessingService>(UnifiedProcessingService);
    llmService = module.get(LLMService);
    entityResolutionService = module.get(EntityResolutionService);
    bulkOperationsService = module.get(BulkOperationsService);
    dataMergeService = module.get(DataMergeService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processUnifiedBatch', () => {
    it('should successfully process a unified batch', async () => {
      // Arrange
      llmService.processContent.mockResolvedValue(mockLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue(
        mockEntityResolutionResult,
      );

      // Act
      const result = await service.processUnifiedBatch(mockMergedInput);

      // Assert
      expect(result.success).toBe(true);
      expect(result.llmResult.mentionsExtracted).toBe(1);
      expect(result.entityResolution.entitiesProcessed).toBe(2);
      expect(result.entityResolution.newEntitiesCreated).toBe(2);
      expect(llmService.processContent).toHaveBeenCalledTimes(1);
      expect(entityResolutionService.resolveBatch).toHaveBeenCalledTimes(1);
    });

    it('should handle LLM processing failure', async () => {
      // Arrange
      const llmError = new Error('LLM API timeout');
      llmService.processContent.mockRejectedValue(llmError);

      // Act & Assert
      await expect(
        service.processUnifiedBatch(mockMergedInput),
      ).rejects.toThrow(LLMIntegrationException);

      expect(llmService.processContent).toHaveBeenCalledTimes(1);
      expect(entityResolutionService.resolveBatch).not.toHaveBeenCalled();
    });

    it('should handle entity resolution failure', async () => {
      // Arrange
      llmService.processContent.mockResolvedValue(mockLLMOutput);
      const resolutionError = new Error('Entity resolution timeout');
      entityResolutionService.resolveBatch.mockRejectedValue(resolutionError);

      // Act & Assert
      await expect(
        service.processUnifiedBatch(mockMergedInput),
      ).rejects.toThrow(LLMIntegrationException);

      expect(llmService.processContent).toHaveBeenCalledTimes(1);
      expect(entityResolutionService.resolveBatch).toHaveBeenCalledTimes(1);
    });

    it('should process batch with custom configuration', async () => {
      // Arrange
      llmService.processContent.mockResolvedValue(mockLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue(
        mockEntityResolutionResult,
      );

      const customConfig = {
        enableQualityScores: false,
        maxRetries: 5,
      };

      // Act
      const result = await service.processUnifiedBatch(
        mockMergedInput,
        customConfig,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.qualityScoreUpdates).toBe(0); // Quality scores disabled
    });

    it('should extract entities correctly from LLM output', async () => {
      // Arrange
      llmService.processContent.mockResolvedValue(mockLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue(
        mockEntityResolutionResult,
      );

      // Act
      await service.processUnifiedBatch(mockMergedInput);

      // Assert
      const resolutionCalls = entityResolutionService.resolveBatch.mock.calls;
      expect(resolutionCalls).toHaveLength(1);

      const entityInputs = resolutionCalls[0][0];
      expect(entityInputs).toHaveLength(4); // restaurant + dish + 2 attributes

      // Check restaurant entity
      const restaurantEntity = entityInputs.find(
        (e) => e.entityType === 'restaurant',
      );
      expect(restaurantEntity).toBeDefined();
      expect(restaurantEntity!.normalizedName).toBe('Franklin Barbecue');
      expect(restaurantEntity!.originalText).toBe('Franklin BBQ');

      // Check dish entity
      const dishEntity = entityInputs.find(
        (e) => e.entityType === 'dish_or_category',
      );
      expect(dishEntity).toBeDefined();
      expect(dishEntity!.normalizedName).toBe('Brisket');
    });

    it('should convert MergedLLMInputDto to LLMInputStructure correctly', async () => {
      // Arrange
      llmService.processContent.mockResolvedValue(mockLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue(
        mockEntityResolutionResult,
      );

      // Act
      await service.processUnifiedBatch(mockMergedInput);

      // Assert
      const llmCalls = llmService.processContent.mock.calls;
      expect(llmCalls).toHaveLength(1);

      const llmInput: LLMInputStructure = llmCalls[0][0];
      expect(llmInput.posts).toHaveLength(1);
      expect(llmInput.posts[0].id).toBe('test_post_1');
      expect(llmInput.posts[0].title).toBe('Best Austin BBQ');
      expect(llmInput.posts[0].comments).toHaveLength(1);
      expect(llmInput.posts[0].comments[0].id).toBe('test_comment_1');
    });

    it('should track performance metrics correctly', async () => {
      // Arrange
      llmService.processContent.mockResolvedValue(mockLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue(
        mockEntityResolutionResult,
      );

      // Act
      await service.processUnifiedBatch(mockMergedInput);
      const metrics = service.getPerformanceMetrics();

      // Assert
      expect(metrics.batchesProcessed).toBe(1);
      expect(metrics.successfulLLMCalls).toBe(1);
      expect(metrics.failedLLMCalls).toBe(0);
      expect(metrics.entitiesResolved).toBe(4);
      expect(metrics.databaseOperations).toBe(1);
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
    });

    it('should reset performance metrics', () => {
      // Act
      service.resetPerformanceMetrics();
      const metrics = service.getPerformanceMetrics();

      // Assert
      expect(metrics.batchesProcessed).toBe(0);
      expect(metrics.totalProcessingTime).toBe(0);
      expect(metrics.averageProcessingTime).toBe(0);
      expect(metrics.successfulLLMCalls).toBe(0);
      expect(metrics.failedLLMCalls).toBe(0);
      expect(metrics.entitiesResolved).toBe(0);
      expect(metrics.databaseOperations).toBe(0);
    });
  });

  describe('data format conversion', () => {
    it('should handle empty posts array', async () => {
      // Arrange
      const emptyInput: MergedLLMInputDto = {
        ...mockMergedInput,
        posts: [],
        comments: [],
      };

      const emptyLLMOutput: LLMOutputStructure = { mentions: [] };
      llmService.processContent.mockResolvedValue(emptyLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue({
        ...mockEntityResolutionResult,
        resolutionResults: [],
        newEntitiesCreated: 0,
      });

      // Act
      const result = await service.processUnifiedBatch(emptyInput);

      // Assert
      expect(result.success).toBe(true);
      expect(result.llmResult.mentionsExtracted).toBe(0);
      expect(result.entityResolution.entitiesProcessed).toBe(0);
    });

    it('should handle posts without comments', async () => {
      // Arrange
      const inputWithoutComments: MergedLLMInputDto = {
        ...mockMergedInput,
        comments: [],
      };

      llmService.processContent.mockResolvedValue(mockLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue(
        mockEntityResolutionResult,
      );

      // Act
      const result = await service.processUnifiedBatch(inputWithoutComments);

      // Assert
      expect(result.success).toBe(true);

      const llmInput: LLMInputStructure =
        llmService.processContent.mock.calls[0][0];
      expect(llmInput.posts[0].comments).toHaveLength(0);
    });

    it('should preserve source metadata in processing', async () => {
      // Arrange
      llmService.processContent.mockResolvedValue(mockLLMOutput);
      entityResolutionService.resolveBatch.mockResolvedValue(
        mockEntityResolutionResult,
      );

      // Act
      const result = await service.processUnifiedBatch(mockMergedInput);

      // Assert
      expect(result.sourceBreakdown).toEqual(
        mockMergedInput.sourceMetadata.sourceBreakdown,
      );
    });
  });
});
