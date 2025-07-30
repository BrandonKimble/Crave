import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DualCollectionStrategyService } from './dual-collection-strategy.service';
import { ChronologicalCollectionService } from './chronological-collection.service';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { LoggerService } from '../../../shared';

describe('DualCollectionStrategyService', () => {
  let service: DualCollectionStrategyService;
  let chronologicalCollection: jest.Mocked<ChronologicalCollectionService>;
  let redditService: jest.Mocked<RedditService>;
  let configService: jest.Mocked<ConfigService>;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockChronologicalCollection = {
      initializeChronologicalCollection: jest.fn(),
      executeCollection: jest.fn(),
      getCollectionStatus: jest.fn(),
    };

    const mockRedditService = {
      getChronologicalPosts: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockLoggerService = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DualCollectionStrategyService,
        {
          provide: ChronologicalCollectionService,
          useValue: mockChronologicalCollection,
        },
        {
          provide: RedditService,
          useValue: mockRedditService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<DualCollectionStrategyService>(
      DualCollectionStrategyService,
    );
    chronologicalCollection = module.get(ChronologicalCollectionService);
    redditService = module.get(RedditService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeCollectionStrategies', () => {
    it('should initialize both collection strategies successfully', () => {
      // Arrange
      chronologicalCollection.initializeChronologicalCollection.mockReturnValue(
        true,
      );

      // Act
      const result = service.initializeCollectionStrategies();

      // Assert
      expect(result).toEqual({
        chronologicalInitialized: true,
        keywordSearchInitialized: true, // Foundation ready
        parallelProcessingReady: true,
      });
      expect(
        chronologicalCollection.initializeChronologicalCollection,
      ).toHaveBeenCalled();
      expect(loggerService.info).toHaveBeenCalledWith(
        expect.stringContaining('Initializing dual collection strategies'),
        expect.any(Object),
      );
    });

    it('should handle chronological collection initialization failure', () => {
      // Arrange
      chronologicalCollection.initializeChronologicalCollection.mockReturnValue(
        false,
      );

      // Act
      const result = service.initializeCollectionStrategies();

      // Assert
      expect(result.chronologicalInitialized).toBe(false);
      expect(result.parallelProcessingReady).toBe(false);
    });

    it('should handle errors during initialization', () => {
      // Arrange
      const testError = new Error('Initialization failed');
      chronologicalCollection.initializeChronologicalCollection.mockImplementation(
        () => {
          throw testError;
        },
      );

      // Act & Assert
      expect(() => service.initializeCollectionStrategies()).toThrow(
        'Initialization failed',
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to initialize dual collection strategies',
        ),
        expect.objectContaining({
          error: 'Initialization failed',
        }),
      );
    });
  });

  describe('executeChronologicalCollection', () => {
    it('should execute chronological collection for specified subreddits', async () => {
      // Arrange
      const subreddits = ['austinfood', 'FoodNYC'];
      const options = { limit: 50 };
      const expectedResult = {
        results: {
          austinfood: {
            subreddit: 'austinfood',
            postsCollected: 10,
            commentsCollected: 0,
            timeRange: { earliest: 1640995200, latest: 1641000000 },
            processingTime: 1000,
            rateLimitStatus: { requestsUsed: 1, remainingQuota: 99 },
          },
          FoodNYC: {
            subreddit: 'FoodNYC',
            postsCollected: 15,
            commentsCollected: 0,
            timeRange: { earliest: 1640995200, latest: 1641000000 },
            processingTime: 1200,
            rateLimitStatus: { requestsUsed: 1, remainingQuota: 99 },
          },
        },
        totalPostsCollected: 25,
        processingTime: 2200,
      };

      chronologicalCollection.executeCollection.mockResolvedValue(
        expectedResult,
      );

      // Act
      const result = await service.executeChronologicalCollection(
        subreddits,
        options,
      );

      // Assert
      expect(result).toEqual(expectedResult);
      expect(chronologicalCollection.executeCollection).toHaveBeenCalledWith(
        subreddits,
        options,
      );
    });

    it('should handle collection execution without options', async () => {
      // Arrange
      const subreddits = ['austinfood'];
      const expectedResult = {
        results: {
          austinfood: {
            subreddit: 'austinfood',
            postsCollected: 5,
            commentsCollected: 0,
            timeRange: { earliest: 1640995200, latest: 1641000000 },
            processingTime: 800,
            rateLimitStatus: { requestsUsed: 1, remainingQuota: 99 },
          },
        },
        totalPostsCollected: 5,
        processingTime: 800,
      };

      chronologicalCollection.executeCollection.mockResolvedValue(
        expectedResult,
      );

      // Act
      const result = await service.executeChronologicalCollection(subreddits);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(chronologicalCollection.executeCollection).toHaveBeenCalledWith(
        subreddits,
        undefined,
      );
    });
  });

  describe('getCollectionStatus', () => {
    it('should return collection status for both strategies', () => {
      // Arrange
      const chronologicalStatus = {
        isActive: true,
        lastCollection: new Date('2023-01-01'),
        nextScheduled: new Date('2023-01-02'),
      };
      chronologicalCollection.getCollectionStatus.mockReturnValue(
        chronologicalStatus,
      );

      // Act
      const result = service.getCollectionStatus();

      // Assert
      expect(result).toEqual({
        chronological: chronologicalStatus,
        keywordSearch: {
          isActive: false,
          lastCollection: null,
          nextScheduled: null,
        },
      });
    });
  });
});
