import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CollectionSchedulingService } from './collection-scheduling.service';
import { LoggerService } from '../../../shared';

describe('CollectionSchedulingService', () => {
  let service: CollectionSchedulingService;
  let configService: jest.Mocked<ConfigService>;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
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
        CollectionSchedulingService,
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

    service = module.get<CollectionSchedulingService>(
      CollectionSchedulingService,
    );
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateSafetyBuffer', () => {
    it('should calculate safety buffer using PRD equation', () => {
      // Arrange
      const subreddit = 'austinfood';
      const averagePostsPerDay = 15; // PRD example

      // Act
      const result = service.calculateSafetyBuffer(
        subreddit,
        averagePostsPerDay,
      );

      // Assert
      expect(result.subreddit).toBe(subreddit);
      expect(result.averagePostsPerDay).toBe(averagePostsPerDay);
      expect(result.calculatedInterval).toBe(750 / 15); // 50 days per PRD example
      expect(result.constrainedInterval).toBe(50); // Within 7-60 day constraints
      expect(result.reasoning).toBe('Standard calculation within constraints');
      expect(result.nextCollectionTimestamp).toBeGreaterThan(Date.now());
    });

    it('should apply minimum constraint for high-volume subreddits', () => {
      // Arrange
      const subreddit = 'HighVolume';
      const averagePostsPerDay = 200; // Would result in 3.75 days

      // Act
      const result = service.calculateSafetyBuffer(
        subreddit,
        averagePostsPerDay,
      );

      // Assert
      expect(result.calculatedInterval).toBe(750 / 200); // 3.75 days
      expect(result.constrainedInterval).toBe(7); // Constrained to minimum
      expect(result.reasoning).toContain('below minimum');
    });

    it('should apply maximum constraint for low-volume subreddits', () => {
      // Arrange
      const subreddit = 'LowVolume';
      const averagePostsPerDay = 5; // Would result in 150 days

      // Act
      const result = service.calculateSafetyBuffer(
        subreddit,
        averagePostsPerDay,
      );

      // Assert
      expect(result.calculatedInterval).toBe(750 / 5); // 150 days
      expect(result.constrainedInterval).toBe(60); // Constrained to maximum
      expect(result.reasoning).toContain('above maximum');
    });
  });

  describe('initializeSubredditScheduling', () => {
    it('should initialize scheduling for known subreddit', () => {
      // Arrange
      const subreddit = 'austinfood';

      // Act
      const result = service.initializeSubredditScheduling(subreddit);

      // Assert
      expect(result.subreddit).toBe(subreddit);
      expect(result.averagePostsPerDay).toBe(15); // From PRD default
      expect(result.safeInterval).toBe(50); // Calculated from 750/15
      expect(result.lastCalculated).toBeInstanceOf(Date);
      expect(result.nextCollectionDue).toBeInstanceOf(Date);
    });

    it('should initialize scheduling for unknown subreddit with default', () => {
      // Arrange
      const subreddit = 'unknownfood';

      // Act
      const result = service.initializeSubredditScheduling(subreddit);

      // Assert
      expect(result.subreddit).toBe(subreddit);
      expect(result.averagePostsPerDay).toBe(20); // Default fallback
      expect(result.safeInterval).toBe(37.5); // Calculated from 750/20
    });
  });

  describe('updatePostingVolume', () => {
    it('should update posting volume using weighted average', async () => {
      // Arrange
      const subreddit = 'austinfood';
      service.initializeSubredditScheduling(subreddit); // Initialize with 15 posts/day

      const observedPostsPerDay = 25;

      // Act
      const result = service.updatePostingVolume(
        subreddit,
        observedPostsPerDay,
      );

      // Assert
      // Expected: (15 * 0.7) + (25 * 0.3) = 10.5 + 7.5 = 18
      expect(result.averagePostsPerDay).toBeCloseTo(18, 1);
      expect(result.safeInterval).toBeCloseTo(750 / 18, 1); // ~41.67 days
    });

    it('should initialize if subreddit does not exist', async () => {
      // Arrange
      const subreddit = 'newfood';
      const observedPostsPerDay = 12;

      // Act
      const result = service.updatePostingVolume(
        subreddit,
        observedPostsPerDay,
      );

      // Assert
      expect(result.subreddit).toBe(subreddit);
      expect(result.averagePostsPerDay).toBe(20); // Uses default, not observed
    });
  });

  describe('isCollectionDue', () => {
    it('should return true for uninitialized subreddit', () => {
      // Act
      const result = service.isCollectionDue('nonexistent');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for recently scheduled subreddit', async () => {
      // Arrange
      const subreddit = 'austinfood';
      service.initializeSubredditScheduling(subreddit);

      // Act
      const result = service.isCollectionDue(subreddit);

      // Assert
      expect(result).toBe(false); // Should be scheduled for future
    });
  });

  describe('getSchedulingStatistics', () => {
    it('should return correct statistics', async () => {
      // Arrange
      service.initializeSubredditScheduling('austinfood');
      service.initializeSubredditScheduling('FoodNYC');

      // Act
      const stats = service.getSchedulingStatistics();

      // Assert
      expect(stats.totalSubreddits).toBe(2);
      expect(stats.duForCollection).toBe(0); // Both should be scheduled for future
      expect(stats.averageInterval).toBeCloseTo((50 + 18.75) / 2, 1); // ~34.375
      expect(stats.nextCollectionTime).toBeInstanceOf(Date);
    });

    it('should handle empty configuration', () => {
      // Act
      const stats = service.getSchedulingStatistics();

      // Assert
      expect(stats.totalSubreddits).toBe(0);
      expect(stats.duForCollection).toBe(0);
      expect(stats.averageInterval).toBe(0);
      expect(stats.nextCollectionTime).toBeNull();
    });
  });
});
