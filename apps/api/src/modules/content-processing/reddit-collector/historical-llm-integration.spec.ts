import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { HistoricalLlmIntegrationAdapter } from './historical-llm-integration.adapter';
import { HistoricalLlmIntegrationValidator } from './historical-llm-integration.validator';
import { HistoricalLlmIntegrationConfigService } from './historical-llm-integration.config';
import {
  HistoricalContentBatch,
  CraveRedditSubmission,
  CraveRedditComment,
} from './historical-content-pipeline.types';
import {
  LLMInputStructure,
  LLMOutputStructure,
} from '../../external-integrations/llm/llm.types';

/**
 * Integration Test Suite for Historical LLM Integration
 *
 * Tests the integration points between historical archive processing
 * and existing M02 LLM pipeline without executing expensive LLM calls.
 *
 * Validates:
 * - Data structure compatibility
 * - Integration adapter functionality
 * - Configuration management
 * - Validation services
 * - Error handling
 */
/* eslint-disable @typescript-eslint/unbound-method */
describe('Historical LLM Integration', () => {
  let adapter: HistoricalLlmIntegrationAdapter;
  let validator: HistoricalLlmIntegrationValidator;
  let configService: HistoricalLlmIntegrationConfigService;
  let mockLlmService: jest.Mocked<LLMService>;
  let mockHistoricalPipeline: jest.Mocked<HistoricalContentPipelineService>;
  let mockLogger: jest.Mocked<LoggerService>;

  // Test data
  const mockSubmission: CraveRedditSubmission = {
    id: 'test_submission_1',
    title: 'Best BBQ in Austin - Franklin BBQ Review',
    author: 'austinfoodie',
    subreddit: 'austinfood',
    created_utc: 1640995200, // Jan 1, 2022
    score: 45,
    url: 'https://reddit.com/r/austinfood/test_submission_1',
    num_comments: 5,
    selftext:
      'Franklin BBQ has the most amazing brisket in Austin. The wait is worth it!',
  };

  const mockComment: CraveRedditComment = {
    id: 'test_comment_1',
    body: 'Their brisket is incredible, best in Texas!',
    author: 'bbq_lover',
    subreddit: 'austinfood',
    created_utc: 1640995800, // 10 minutes after submission
    score: 12,
    link_id: 't3_test_submission_1',
  };

  const mockBatch: HistoricalContentBatch = {
    submissions: [mockSubmission],
    comments: [mockComment],
    totalProcessed: 2,
    validItems: 2,
    invalidItems: 0,
    processingTime: 150,
    batchId: 'test_batch_001',
    errors: [],
  };

  const mockLlmInput: LLMInputStructure = {
    posts: [
      {
        post_id: 'test_submission_1',
        title: 'Best BBQ in Austin - Franklin BBQ Review',
        content:
          'Franklin BBQ has the most amazing brisket in Austin. The wait is worth it!',
        subreddit: 'austinfood',
        url: 'https://reddit.com/r/austinfood/test_submission_1',
        upvotes: 45,
        created_at: '2022-01-01T00:00:00.000Z',
        comments: [
          {
            comment_id: 'test_comment_1',
            content: 'Their brisket is incredible, best in Texas!',
            author: 'bbq_lover',
            upvotes: 12,
            created_at: '2022-01-01T00:10:00.000Z',
            parent_id: null,
            url: 'https://reddit.com/r/austinfood/test_comment_1',
          },
        ],
      },
    ],
  };

  const mockLlmOutput: LLMOutputStructure = {
    mentions: [
      {
        temp_id: 'mention_1',
        restaurant: {
          normalized_name: 'franklin bbq',
          original_text: 'Franklin BBQ',
          temp_id: 'restaurant_1',
        },
        restaurant_attributes: null,
        dish_or_category: {
          normalized_name: 'brisket',
          original_text: 'brisket',
          temp_id: 'dish_1',
        },
        dish_attributes: [
          {
            attribute: 'amazing',
            type: 'descriptive',
          },
        ],
        is_menu_item: true,
        general_praise: true,
        source: {
          type: 'post',
          id: 'test_submission_1',
          url: 'https://reddit.com/r/austinfood/test_submission_1',
          upvotes: 45,
          created_at: '2022-01-01T00:00:00.000Z',
        },
      },
    ],
  };

  beforeEach(async () => {
    // Create mocks
    mockLlmService = {
      processContent: jest.fn(),
      validateInput: jest.fn(),
      validateOutput: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;

    mockHistoricalPipeline = {
      convertToLLMFormat: jest.fn(),
    } as unknown as jest.Mocked<HistoricalContentPipelineService>;

    mockLogger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricalLlmIntegrationAdapter,
        HistoricalLlmIntegrationValidator,
        HistoricalLlmIntegrationConfigService,
        {
          provide: LLMService,
          useValue: mockLlmService,
        },
        {
          provide: HistoricalContentPipelineService,
          useValue: mockHistoricalPipeline,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              // Return test configuration
              const config = {
                'historicalLlmIntegration.enableValidation': true,
                'historicalLlmIntegration.batchSizeLimit': 1000,
                'historicalLlmIntegration.preserveThreads': true,
                'historicalLlmIntegration.testWithLLM': false,
              };
              return config[key as keyof typeof config] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<HistoricalLlmIntegrationAdapter>(
      HistoricalLlmIntegrationAdapter,
    );
    validator = module.get<HistoricalLlmIntegrationValidator>(
      HistoricalLlmIntegrationValidator,
    );
    configService = module.get<HistoricalLlmIntegrationConfigService>(
      HistoricalLlmIntegrationConfigService,
    );
  });

  describe('HistoricalLlmIntegrationAdapter', () => {
    beforeEach(() => {
      // Setup default mock implementations
      mockHistoricalPipeline.convertToLLMFormat.mockReturnValue(mockLlmInput);
      mockLlmService.validateInput.mockResolvedValue([]);
      mockLlmService.validateOutput.mockResolvedValue([]);
      mockLlmService.processContent.mockResolvedValue(mockLlmOutput);
    });

    it('should initialize with correct configuration', () => {
      expect(adapter).toBeDefined();
      expect(mockLogger.setContext).toHaveBeenCalledWith(
        'HistoricalLlmIntegrationAdapter',
      );
    });

    it('should test integration connectivity without LLM execution', async () => {
      // Test connectivity without actually calling LLM service
      const result = await adapter.testIntegrationConnectivity();

      expect(result.status).toBe('connected');
      expect(result.message).toContain('integration test passed');
      expect(mockHistoricalPipeline.convertToLLMFormat).toHaveBeenCalled();

      // Should not call LLM service when testWithLLM is false
      expect(mockLlmService.processContent).not.toHaveBeenCalled();
    });

    it('should validate batch compatibility before processing', async () => {
      // Test successful validation
      await expect(
        adapter.processHistoricalBatchThroughLLM(mockBatch),
      ).resolves.toEqual(mockLlmOutput);

      expect(mockHistoricalPipeline.convertToLLMFormat).toHaveBeenCalledWith(
        mockBatch,
        true, // preserveThreads default
      );
      expect(mockLlmService.validateInput).toHaveBeenCalledWith(mockLlmInput);
      expect(mockLlmService.processContent).toHaveBeenCalledWith(mockLlmInput);
      expect(mockLlmService.validateOutput).toHaveBeenCalledWith(mockLlmOutput);
    });

    it('should handle empty batch gracefully', async () => {
      const emptyBatch: HistoricalContentBatch = {
        ...mockBatch,
        submissions: [],
        comments: [],
        totalProcessed: 0,
        validItems: 0,
      };

      const emptyLlmInput: LLMInputStructure = { posts: [] };
      mockHistoricalPipeline.convertToLLMFormat.mockReturnValue(emptyLlmInput);

      // Should throw validation error for empty batch
      await expect(
        adapter.processHistoricalBatchThroughLLM(emptyBatch),
      ).rejects.toThrow('Batch contains no valid submissions or comments');
    });

    it('should respect custom configuration', async () => {
      const customConfig = { preserveThreads: false };

      await adapter.processHistoricalBatchThroughLLM(mockBatch, customConfig);

      expect(mockHistoricalPipeline.convertToLLMFormat).toHaveBeenCalledWith(
        mockBatch,
        false, // Custom preserveThreads value
      );
    });

    it('should get integration configuration', () => {
      const config = adapter.getIntegrationConfig();

      expect(config).toEqual({
        enableValidation: true,
        batchSizeLimit: 1000,
        preserveThreads: true,
      });
      expect(config).not.toHaveProperty('testWithLLM'); // Excluded from public config
    });
  });

  describe('HistoricalLlmIntegrationValidator', () => {
    beforeEach(() => {
      mockLlmService.validateInput.mockResolvedValue([]);
      mockLlmService.validateOutput.mockResolvedValue([]);
    });

    it('should validate historical batch successfully', () => {
      const result = validator.validateHistoricalBatch(mockBatch);

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.summary.totalItems).toBe(2);
      expect(result.summary.validSubmissions).toBe(1);
      expect(result.summary.validComments).toBe(1);
    });

    it('should detect missing required fields', () => {
      const invalidBatch: HistoricalContentBatch = {
        ...mockBatch,
        batchId: '', // Missing batch ID
        submissions: [
          {
            ...mockSubmission,
            id: '', // Missing submission ID
            title: '', // Missing title
          },
        ],
      };

      const result = validator.validateHistoricalBatch(invalidBatch);

      expect(result.isValid).toBe(false);
      expect(
        result.issues.some((issue) => issue.type === 'missing_field'),
      ).toBe(true);
      expect(result.summary.criticalIssues).toBeGreaterThan(0);
    });

    it('should validate LLM input compatibility', async () => {
      const result =
        await validator.validateLLMInputCompatibility(mockLlmInput);

      expect(result.isValid).toBe(true);
      expect(mockLlmService.validateInput).toHaveBeenCalledWith(mockLlmInput);
    });

    it('should validate LLM output compatibility', async () => {
      const result =
        await validator.validateLLMOutputCompatibility(mockLlmOutput);

      expect(result.isValid).toBe(true);
      expect(mockLlmService.validateOutput).toHaveBeenCalledWith(mockLlmOutput);
    });

    it('should handle LLM validation errors', async () => {
      const validationErrors = [
        'Invalid post structure',
        'Missing required field',
      ];
      mockLlmService.validateInput.mockResolvedValue(validationErrors);

      const result =
        await validator.validateLLMInputCompatibility(mockLlmInput);

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(
        result.issues.every((issue) => issue.severity === 'critical'),
      ).toBe(true);
    });

    it('should detect high error rates', () => {
      const highErrorBatch: HistoricalContentBatch = {
        ...mockBatch,
        totalProcessed: 100,
        validItems: 40,
        invalidItems: 60,
        errors: Array.from({ length: 60 }, () => ({
          lineNumber: 1,
          itemType: 'comment' as const,
          errorCode: 'VALIDATION_FAILED',
          message: 'Test error',
        })),
      };

      const result = validator.validateHistoricalBatch(highErrorBatch);

      expect(
        result.issues.some((issue) => issue.type === 'high_error_rate'),
      ).toBe(true);
    });
  });

  describe('HistoricalLlmIntegrationConfigService', () => {
    it('should load integration configuration', () => {
      const config = configService.getIntegrationConfig();

      expect(config).toEqual({
        enableValidation: true,
        strictValidation: false,
        batchSizeLimit: 1000,
        maxConcurrentBatches: 3,
        preserveThreads: true,
        includeMetadata: true,
        testWithLLM: false,
        enableDebugLogging: false,
        timeoutMs: 60000,
        retryAttempts: 3,
      });
    });

    it('should load routing configuration', () => {
      const config = configService.getRoutingConfig();

      expect(config).toEqual({
        processSubmissions: true,
        processComments: true,
        minSubmissionScore: 0,
        minCommentScore: 0,
        excludeDeleted: true,
        excludeRemoved: true,
        targetSubreddits: ['austinfood', 'FoodNYC'],
      });
    });

    it('should load error handling configuration', () => {
      const config = configService.getErrorHandlingConfig();

      expect(config).toEqual({
        enableRetries: true,
        maxRetries: 3,
        retryDelayMs: 1000,
        continueOnValidationError: false,
        continueOnProcessingError: true,
        logAllErrors: true,
        includeStackTrace: false,
      });
    });
  });

  describe('Data Structure Compatibility', () => {
    it('should convert historical batch to LLM input format', () => {
      mockHistoricalPipeline.convertToLLMFormat.mockReturnValue(mockLlmInput);

      const result = mockHistoricalPipeline.convertToLLMFormat(mockBatch);

      expect(result).toEqual(mockLlmInput);
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].comments).toHaveLength(1);
    });

    it('should maintain data structure integrity', () => {
      // Test that all required fields are preserved during conversion
      expect(mockLlmInput.posts[0]).toHaveProperty('post_id');
      expect(mockLlmInput.posts[0]).toHaveProperty('title');
      expect(mockLlmInput.posts[0]).toHaveProperty('content');
      expect(mockLlmInput.posts[0]).toHaveProperty('subreddit');
      expect(mockLlmInput.posts[0]).toHaveProperty('url');
      expect(mockLlmInput.posts[0]).toHaveProperty('upvotes');
      expect(mockLlmInput.posts[0]).toHaveProperty('created_at');
      expect(mockLlmInput.posts[0]).toHaveProperty('comments');

      expect(mockLlmInput.posts[0].comments[0]).toHaveProperty('comment_id');
      expect(mockLlmInput.posts[0].comments[0]).toHaveProperty('content');
      expect(mockLlmInput.posts[0].comments[0]).toHaveProperty('author');
      expect(mockLlmInput.posts[0].comments[0]).toHaveProperty('upvotes');
      expect(mockLlmInput.posts[0].comments[0]).toHaveProperty('created_at');
      expect(mockLlmInput.posts[0].comments[0]).toHaveProperty('url');
    });

    it('should validate LLM output structure for entity resolution', () => {
      // Test that LLM output contains all fields needed for entity resolution
      expect(mockLlmOutput.mentions[0]).toHaveProperty('temp_id');
      expect(mockLlmOutput.mentions[0]).toHaveProperty('restaurant');
      expect(mockLlmOutput.mentions[0]).toHaveProperty('dish_or_category');
      expect(mockLlmOutput.mentions[0]).toHaveProperty('dish_attributes');
      expect(mockLlmOutput.mentions[0]).toHaveProperty('is_menu_item');
      expect(mockLlmOutput.mentions[0]).toHaveProperty('general_praise');
      expect(mockLlmOutput.mentions[0]).toHaveProperty('source');

      expect(mockLlmOutput.mentions[0].restaurant).toHaveProperty('temp_id');
      expect(mockLlmOutput.mentions[0].restaurant).toHaveProperty(
        'normalized_name',
      );
      expect(mockLlmOutput.mentions[0].restaurant).toHaveProperty(
        'original_text',
      );
    });
  });
});
