import { Test, TestingModule } from '@nestjs/testing';
import { ContentRetrievalMonitoringService } from './content-retrieval-monitoring.service';
import { LoggerService } from '../../../shared';

describe('ContentRetrievalMonitoringService', () => {
  let service: ContentRetrievalMonitoringService;

  beforeEach(async () => {
    const mockLoggerService = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRetrievalMonitoringService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<ContentRetrievalMonitoringService>(
      ContentRetrievalMonitoringService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordOperation', () => {
    it('should record a successful operation', () => {
      const operationData = {
        success: true,
        responseTime: 1000,
        postsRequested: 5,
        postsRetrieved: 5,
        totalComments: 25,
        apiCallsUsed: 5,
        rateLimitHit: false,
      };

      service.recordOperation('batch_posts', operationData);

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(1000);
      expect(metrics.averagePostsPerRequest).toBe(5);
      expect(metrics.totalApiCalls).toBe(5);
    });

    it('should record a failed operation', () => {
      const operationData = {
        success: false,
        responseTime: 500,
        postsRequested: 3,
        postsRetrieved: 0,
        totalComments: 0,
        apiCallsUsed: 1,
        rateLimitHit: true,
        error: 'Rate limit exceeded',
      };

      service.recordOperation('single_post', operationData);

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.rateLimitHits).toBe(1);
    });
  });

  describe('getSuccessRates', () => {
    it('should calculate success rates correctly', () => {
      const successfulOp = {
        success: true,
        responseTime: 1000,
        postsRequested: 2,
        postsRetrieved: 2,
        totalComments: 10,
        apiCallsUsed: 2,
        rateLimitHit: false,
      };

      const failedOp = {
        success: false,
        responseTime: 500,
        postsRequested: 1,
        postsRetrieved: 0,
        totalComments: 0,
        apiCallsUsed: 1,
        rateLimitHit: false,
        error: 'Network error',
      };

      service.recordOperation('batch_posts', successfulOp);
      service.recordOperation('single_post', failedOp);

      const successRates = service.getSuccessRates();
      expect(successRates.overallSuccessRate).toBe(50);
      expect(successRates.postRetrievalSuccessRate).toBe(50);
      expect(successRates.commentRetrievalSuccessRate).toBe(100);
    });

    it('should return 100% for empty metrics', () => {
      const successRates = service.getSuccessRates();
      expect(successRates.overallSuccessRate).toBe(100);
      expect(successRates.postRetrievalSuccessRate).toBe(100);
      expect(successRates.commentRetrievalSuccessRate).toBe(100);
    });
  });

  describe('getPerformanceTrends', () => {
    it('should calculate trends correctly', () => {
      const recentOp = {
        success: true,
        responseTime: 2000,
        postsRequested: 1,
        postsRetrieved: 1,
        totalComments: 5,
        apiCallsUsed: 2,
        rateLimitHit: false,
      };

      service.recordOperation('single_post', recentOp);

      const trends = service.getPerformanceTrends(60);
      expect(trends.averageResponseTime).toBe(2000);
      expect(trends.successRate).toBe(100);
      expect(trends.rateLimitHitRate).toBe(0);
      expect(trends.dataPoints).toBe(1);
    });

    it('should return zeros for no data points', () => {
      const trends = service.getPerformanceTrends(60);
      expect(trends.averageResponseTime).toBe(0);
      expect(trends.successRate).toBe(100);
      expect(trends.apiCallsPerMinute).toBe(0);
      expect(trends.dataPoints).toBe(0);
    });
  });

  describe('getDetailedStats', () => {
    it('should determine healthy status', () => {
      const healthyOp = {
        success: true,
        responseTime: 1000,
        postsRequested: 1,
        postsRetrieved: 1,
        totalComments: 3,
        apiCallsUsed: 1,
        rateLimitHit: false,
      };

      service.recordOperation('single_post', healthyOp);

      const stats = service.getDetailedStats();
      expect(stats.healthStatus).toBe('healthy');
      expect(stats.recommendations).toHaveLength(0);
    });

    it('should determine unhealthy status for low success rate', () => {
      const failedOp = {
        success: false,
        responseTime: 1000,
        postsRequested: 1,
        postsRetrieved: 0,
        totalComments: 0,
        apiCallsUsed: 1,
        rateLimitHit: false,
        error: 'API error',
      };

      // Record multiple failed operations to get below 80% success rate
      for (let i = 0; i < 5; i++) {
        service.recordOperation('single_post', failedOp);
      }

      const stats = service.getDetailedStats();
      expect(stats.healthStatus).toBe('unhealthy');
      expect(stats.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', () => {
      const operation = {
        success: true,
        responseTime: 1000,
        postsRequested: 1,
        postsRetrieved: 1,
        totalComments: 5,
        apiCallsUsed: 1,
        rateLimitHit: false,
      };

      service.recordOperation('single_post', operation);

      let metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(1);

      service.resetMetrics();

      metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
    });
  });

  describe('exportPerformanceHistory', () => {
    it('should export performance history', () => {
      const operation = {
        success: true,
        responseTime: 1000,
        postsRequested: 1,
        postsRetrieved: 1,
        totalComments: 5,
        apiCallsUsed: 1,
        rateLimitHit: false,
      };

      service.recordOperation('single_post', operation);

      const history = service.exportPerformanceHistory();
      expect(history).toHaveLength(1);
      expect(history[0].operationType).toBe('single_post');
      expect(history[0].success).toBe(true);
    });

    it('should limit exported history when limit specified', () => {
      const operation = {
        success: true,
        responseTime: 1000,
        postsRequested: 1,
        postsRetrieved: 1,
        totalComments: 5,
        apiCallsUsed: 1,
        rateLimitHit: false,
      };

      // Record multiple operations
      for (let i = 0; i < 5; i++) {
        service.recordOperation('single_post', operation);
      }

      const history = service.exportPerformanceHistory(3);
      expect(history).toHaveLength(3);
    });
  });
});
