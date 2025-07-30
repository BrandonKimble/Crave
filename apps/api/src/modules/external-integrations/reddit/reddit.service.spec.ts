/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import type { AxiosResponse } from 'axios';
import { RedditService } from './reddit.service';
import { LoggerService } from '../../../shared';
import { RateLimitCoordinatorService } from '../shared/rate-limit-coordinator.service';
import { ExternalApiService } from '../shared/external-integrations.types';
import {
  RedditAuthenticationError,
  RedditConfigurationError,
  RedditRateLimitError,
  RedditNetworkError,
} from './reddit.exceptions';

describe('RedditService', () => {
  let service: RedditService;
  let httpService: HttpService;
  let rateLimitCoordinator: RateLimitCoordinatorService;

  const mockConfig = {
    'reddit.clientId': 'test-client-id',
    'reddit.clientSecret': 'test-client-secret',
    'reddit.username': 'test-username',
    'reddit.password': 'test-password',
    'reddit.userAgent': 'CraveSearch/1.0.0',
  };

  const mockTokenResponse: AxiosResponse = {
    data: {
      access_token: 'test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      scope: '*',
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };

  const mockMeResponse: AxiosResponse = {
    data: {
      name: 'test-username',
      id: 'test-id',
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) => mockConfig[key as keyof typeof mockConfig],
            ),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn().mockReturnThis(),
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
        {
          provide: RateLimitCoordinatorService,
          useValue: {
            requestPermission: jest.fn().mockReturnValue({
              allowed: true,
              currentUsage: 10,
              limit: 100,
              resetTime: new Date(),
            }),
            reportRateLimitHit: jest.fn(),
            getStatus: jest.fn().mockReturnValue({
              service: ExternalApiService.REDDIT,
              currentRequests: 10,
              resetTime: new Date(),
              isAtLimit: false,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedditService>(RedditService);
    httpService = module.get<HttpService>(HttpService);
    rateLimitCoordinator = module.get<RateLimitCoordinatorService>(
      RateLimitCoordinatorService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw RedditConfigurationError when required config is missing', () => {
      const incompleteConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'reddit.clientId') return undefined;
          return mockConfig[key as keyof typeof mockConfig];
        }),
      };

      expect(() => {
        new RedditService(
          httpService,
          incompleteConfigService as unknown as ConfigService,
          rateLimitCoordinator,
          {
            setContext: jest.fn().mockReturnThis(),
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          } as unknown as LoggerService,
        );
      }).toThrow(RedditConfigurationError);
    });

    it('should initialize successfully with complete config', () => {
      expect(service).toBeDefined();
      expect(service.getRedditConfig().clientId).toBe('test-client-id');
    });
  });

  describe('authenticate', () => {
    it('should successfully authenticate and store token', async () => {
      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(mockTokenResponse));

      await service.authenticate();

      expect(postSpy).toHaveBeenCalledWith(
        'https://www.reddit.com/api/v1/access_token',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic'),
            'User-Agent': 'CraveSearch/1.0.0',
          }),
        }),
      );
    });

    it('should throw RedditAuthenticationError on 401 response', async () => {
      const authError = {
        response: {
          status: 401,
          data: { error: 'invalid_grant' },
        },
        message: 'Unauthorized',
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
      } as any;

      jest
        .spyOn(httpService, 'post')

        .mockReturnValue(throwError(() => authError));

      await expect(service.authenticate()).rejects.toThrow(
        RedditAuthenticationError,
      );
    });

    it('should throw RedditRateLimitError on 429 response', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          headers: { 'retry-after': '60' },
          data: { error: 'rate_limit_exceeded' },
        },
        message: 'Too Many Requests',
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
      } as any;

      jest
        .spyOn(httpService, 'post')

        .mockReturnValue(throwError(() => rateLimitError));

      await expect(service.authenticate()).rejects.toThrow(
        RedditRateLimitError,
      );
    });

    it('should throw RedditNetworkError on network failure', async () => {
      const networkError = {
        code: 'ENOTFOUND',
        message: 'Network error',
      } as any;

      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => networkError));

      await expect(service.authenticate()).rejects.toThrow(RedditNetworkError);
    });
  });

  describe('validateAuthentication', () => {
    it('should return true for valid authentication', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(of(mockTokenResponse));
      const getSpy = jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of(mockMeResponse));

      const result = await service.validateAuthentication();

      expect(result).toBe(true);
      expect(getSpy).toHaveBeenCalledWith(
        'https://oauth.reddit.com/api/v1/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    it('should return false for invalid authentication', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(of(mockTokenResponse));

      const authError = {
        response: {
          status: 401,
          data: { error: 'invalid_token' },
        },
        message: 'Unauthorized',
        isAxiosError: true,
        toJSON: () => ({}),
        name: 'AxiosError',
      } as any;

      jest
        .spyOn(httpService, 'get')

        .mockReturnValue(throwError(() => authError));

      const result = await service.validateAuthentication();

      expect(result).toBe(false);
    });

    it('should authenticate first if no valid token exists', async () => {
      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(mockTokenResponse));
      const getSpy = jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of(mockMeResponse));

      const result = await service.validateAuthentication();

      expect(result).toBe(true);
      expect(postSpy).toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalled();
    });
  });

  describe('getAuthenticatedHeaders', () => {
    it('should return headers with valid token', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(of(mockTokenResponse));

      const headers = await service.getAuthenticatedHeaders();

      expect(headers).toEqual({
        Authorization: 'Bearer test-access-token',
        'User-Agent': 'CraveSearch/1.0.0',
      });
    });

    it('should authenticate first if no valid token exists', async () => {
      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(mockTokenResponse));

      const headers = await service.getAuthenticatedHeaders();

      expect(postSpy).toHaveBeenCalled();
      expect(headers['Authorization']).toBe('Bearer test-access-token');
    });
  });

  describe('getRedditConfig', () => {
    it('should return config without sensitive fields', () => {
      const config = service.getRedditConfig();

      expect(config).toEqual({
        clientId: 'test-client-id',
        username: 'test-username',
        userAgent: 'CraveSearch/1.0.0',
        timeout: 10000,
        retryOptions: {
          maxRetries: 3,
          retryDelay: 1000,
          retryBackoffFactor: 2,
        },
      });
      expect(config).not.toHaveProperty('clientSecret');
      expect(config).not.toHaveProperty('password');
    });
  });

  describe('Rate Limiting Integration', () => {
    beforeEach(() => {
      // Mock successful authentication
      jest.spyOn(httpService, 'post').mockReturnValue(of(mockTokenResponse));
    });

    it('should request permission from rate limiter before making API calls', async () => {
      const getSpy = jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: { data: { children: [] } },
        } as AxiosResponse),
      );

      await service.getChronologicalPosts('austinfood');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(rateLimitCoordinator.requestPermission).toHaveBeenCalledWith({
        service: ExternalApiService.REDDIT,
        operation: 'chronological_collection',
        priority: 'medium',
      });
      expect(getSpy).toHaveBeenCalled();
    });

    it('should handle rate limit error when coordinator denies request', async () => {
      (rateLimitCoordinator.requestPermission as jest.Mock).mockReturnValue({
        allowed: false,
        retryAfter: 60,
        currentUsage: 100,
        limit: 100,
        resetTime: new Date(),
      });

      const result = await service.getChronologicalPosts('austinfood');
      expect(result.data).toEqual([]);
      expect(result.performance.rateLimitHit).toBe(true);
    });

    it('should report rate limit hits to coordinator', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          headers: { 'retry-after': '120' },
        },
        message: 'Too Many Requests',
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => rateLimitError));

      try {
        await service.getChronologicalPosts('austinfood');
      } catch {
        // Expected to throw
      }

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(rateLimitCoordinator.reportRateLimitHit).toHaveBeenCalledWith(
        ExternalApiService.REDDIT,
        120,
        'chronological_collection',
      );
    });
  });

  describe('Cost Monitoring', () => {
    beforeEach(() => {
      jest.spyOn(httpService, 'post').mockReturnValue(of(mockTokenResponse));
    });

    it('should track cost metrics for API requests', async () => {
      jest.spyOn(httpService, 'get').mockReturnValue(
        of({
          data: { data: { children: [] } },
        } as AxiosResponse),
      );

      await service.getChronologicalPosts('austinfood');

      const costMetrics = service.getCostMetrics();
      expect(costMetrics.totalRequestsToday).toBeGreaterThan(0);
      expect(costMetrics.estimatedMonthlyCost).toBeGreaterThanOrEqual(0); // Reddit is free, so cost should be 0
      expect(costMetrics.freeQuotaRemaining).toBeLessThan(144000); // Should be reduced from initial
    });

    it('should return rate limit status', () => {
      const status = service.getRateLimitStatus();

      expect(status).toEqual({
        allowed: true,
        currentUsage: 10,
        limit: 100,
        resetTime: expect.any(Date),
      });
    });
  });

  describe('Real-Time Collection Methods', () => {
    beforeEach(() => {
      jest.spyOn(httpService, 'post').mockReturnValue(of(mockTokenResponse));
    });

    describe('getChronologicalPosts', () => {
      it('should fetch chronological posts successfully', async () => {
        const mockPosts = [
          { data: { id: 'post1', created_utc: 1640995200 } },
          { data: { id: 'post2', created_utc: 1640995300 } },
        ];

        jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: { data: { children: mockPosts } },
          } as AxiosResponse),
        );

        const result = await service.getChronologicalPosts('austinfood');

        expect(result.data).toEqual(mockPosts);
        expect(result.metadata.totalRetrieved).toBe(2);
        expect(result.metadata.costIncurred).toBe(0);
        expect(result.performance.apiCallsUsed).toBe(1);
      });

      it('should filter posts by timestamp when provided', async () => {
        const mockPosts = [
          { data: { id: 'post1', created_utc: 1640995200 } },
          { data: { id: 'post2', created_utc: 1640995300 } },
        ];

        jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: { data: { children: mockPosts } },
          } as AxiosResponse),
        );

        const result = await service.getChronologicalPosts(
          'austinfood',
          1640995250,
        );

        expect(result.data).toHaveLength(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(result.data[0].data.id).toBe('post2');
      });

      it('should handle rate limit errors gracefully', async () => {
        (rateLimitCoordinator.requestPermission as jest.Mock).mockReturnValue({
          allowed: false,
          retryAfter: 60,
          currentUsage: 100,
          limit: 100,
          resetTime: new Date(),
        });

        const result = await service.getChronologicalPosts('austinfood');

        expect(result.data).toEqual([]);
        expect(result.performance.rateLimitHit).toBe(true);
      });
    });

    describe('searchByKeyword', () => {
      it('should search posts by keyword successfully', async () => {
        const mockSearchResults = [
          { data: { id: 'search1', title: 'Best tacos in Austin' } },
          { data: { id: 'search2', title: 'Austin taco recommendations' } },
        ];

        jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: { data: { children: mockSearchResults } },
          } as AxiosResponse),
        );

        const result = await service.searchByKeyword('austinfood', 'tacos');

        expect(result.data).toEqual(mockSearchResults);
        expect(result.metadata.totalRetrieved).toBe(2);
        expect(result.performance.apiCallsUsed).toBe(1);
      });

      it('should encode keywords properly', async () => {
        const getSpy = jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: { data: { children: [] } },
          } as AxiosResponse),
        );

        await service.searchByKeyword('austinfood', 'tacos & burritos');

        expect(getSpy).toHaveBeenCalledWith(
          expect.stringContaining('tacos%20%26%20burritos'),
          expect.any(Object),
        );
      });

      it('should respect search options', async () => {
        const getSpy = jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: { data: { children: [] } },
          } as AxiosResponse),
        );

        await service.searchByKeyword('austinfood', 'pizza', {
          sort: 'top',
          limit: 50,
          timeframe: 'week',
        });

        expect(getSpy).toHaveBeenCalledWith(
          expect.stringContaining('sort=top'),
          expect.any(Object),
        );
        expect(getSpy).toHaveBeenCalledWith(
          expect.stringContaining('limit=50'),
          expect.any(Object),
        );
        expect(getSpy).toHaveBeenCalledWith(
          expect.stringContaining('t=week'),
          expect.any(Object),
        );
      });
    });

    describe('batchCollectFromSubreddits', () => {
      it('should collect from multiple subreddits chronologically', async () => {
        jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: { data: { children: [{ data: { id: 'test' } }] } },
          } as AxiosResponse),
        );

        // Mock the delay
        jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          fn();
          return {} as any;
        });

        const results = await service.batchCollectFromSubreddits(
          ['austinfood', 'FoodNYC'],
          'chronological',
        );

        expect(results).toHaveProperty('austinfood');
        expect(results).toHaveProperty('FoodNYC');
        expect(results.austinfood.data).toHaveLength(1);
        expect(results.FoodNYC.data).toHaveLength(1);
      });

      it('should collect from multiple subreddits by keyword', async () => {
        jest.spyOn(httpService, 'get').mockReturnValue(
          of({
            data: { data: { children: [{ data: { id: 'search' } }] } },
          } as AxiosResponse),
        );

        jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          fn();
          return {} as any;
        });

        const results = await service.batchCollectFromSubreddits(
          ['austinfood', 'FoodNYC'],
          'keyword',
          { keyword: 'pizza' },
        );

        expect(results).toHaveProperty('austinfood');
        expect(results).toHaveProperty('FoodNYC');
      });

      it('should handle individual subreddit failures gracefully', async () => {
        let callCount = 0;
        jest.spyOn(httpService, 'get').mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return throwError(() => new Error('Network error'));
          }
          return of({ data: { data: { children: [] } } } as AxiosResponse);
        });

        jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          fn();
          return {} as any;
        });

        const results = await service.batchCollectFromSubreddits(
          ['austinfood', 'FoodNYC'],
          'chronological',
        );

        expect(results.austinfood.data).toHaveLength(0);
        expect(results.austinfood.performance.rateLimitHit).toBe(false);
        expect(results.FoodNYC.data).toHaveLength(0);
      });
    });
  });
});
