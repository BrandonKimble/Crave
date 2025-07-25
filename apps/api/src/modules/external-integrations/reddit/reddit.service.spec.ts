/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import type { AxiosResponse } from 'axios';
import { RedditService } from './reddit.service';
import { LoggerService } from '../../../shared';
import {
  RedditAuthenticationError,
  RedditConfigurationError,
  RedditRateLimitError,
  RedditNetworkError,
} from './reddit.exceptions';

describe('RedditService', () => {
  let service: RedditService;
  let httpService: HttpService;

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
      ],
    }).compile();

    service = module.get<RedditService>(RedditService);
    httpService = module.get<HttpService>(HttpService);
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
      });
      expect(config).not.toHaveProperty('clientSecret');
      expect(config).not.toHaveProperty('password');
    });
  });
});
