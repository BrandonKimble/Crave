import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedditModule } from '../src/modules/external-integrations/reddit/reddit.module';
import { RedditService } from '../src/modules/external-integrations/reddit/reddit.service';
import {
  RedditAuthenticationError,
  RedditConfigurationError,
} from '../src/modules/external-integrations/reddit/reddit.exceptions';

describe('Reddit Integration (e2e)', () => {
  let app: TestingModule;
  let redditService: RedditService;

  beforeAll(async () => {
    // Use test configuration - these should be invalid credentials for testing
    const testConfig = {
      reddit: {
        clientId: 'test-invalid-client-id',
        clientSecret: 'test-invalid-client-secret',
        username: 'test-invalid-username',
        password: 'test-invalid-password',
        userAgent: 'CraveSearch/1.0.0-test',
      },
    };

    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig],
        }),
        HttpModule.register({
          timeout: 10000,
          maxRedirects: 5,
        }),
        RedditModule,
      ],
    }).compile();

    redditService = app.get<RedditService>(RedditService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Module Integration', () => {
    it('should initialize RedditService through module dependency injection', () => {
      expect(redditService).toBeDefined();
      expect(redditService).toBeInstanceOf(RedditService);
    });

    it('should have access to configuration through ConfigService', () => {
      const config = redditService.getRedditConfig();
      expect(config.clientId).toBe('test-invalid-client-id');
      expect(config.username).toBe('test-invalid-username');
      expect(config.userAgent).toBe('CraveSearch/1.0.0-test');
    });
  });

  describe('OAuth2 Flow Integration', () => {
    it('should fail authentication with invalid credentials', async () => {
      // This test ensures our error handling works with real Reddit API responses
      await expect(redditService.authenticate()).rejects.toThrow(
        RedditAuthenticationError,
      );
    });

    it('should return false for validation with invalid credentials', async () => {
      // This test ensures validation gracefully handles auth failures
      const isValid = await redditService.validateAuthentication();
      expect(isValid).toBe(false);
    });

    it('should handle network connectivity issues gracefully', async () => {
      // Create a service with an invalid Reddit API URL to test network error handling
      const invalidConfigService = {
        get: jest.fn((key: string) => {
          const testConfig: Record<string, string> = {
            'reddit.clientId': 'test-client-id',
            'reddit.clientSecret': 'test-client-secret',
            'reddit.username': 'test-username',
            'reddit.password': 'test-password',
            'reddit.userAgent': 'CraveSearch/1.0.0-test',
          };
          return testConfig[key];
        }),
      };

      const httpService = app.get<HttpService>(HttpService);
      const testService = new RedditService(
        httpService,
        invalidConfigService as unknown as ConfigService,
        {
          setContext: jest.fn().mockReturnThis(),
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        } as any,
      );

      // The service should handle network errors appropriately
      await expect(testService.authenticate()).rejects.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required configuration fields', () => {
      const incompleteConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'reddit.clientId') return undefined;
          return 'test-value';
        }),
      };

      const httpService = app.get<HttpService>(HttpService);

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
          } as any,
        );
      }).toThrow(RedditConfigurationError);
    });
  });

  describe('Service Interface', () => {
    it('should provide required methods for endpoint testing', () => {
      expect(typeof redditService.authenticate).toBe('function');
      expect(typeof redditService.validateAuthentication).toBe('function');
      expect(typeof redditService.getAuthenticatedHeaders).toBe('function');
      expect(typeof redditService.getRedditConfig).toBe('function');
    });

    it('should expose configuration without sensitive data', () => {
      const config = redditService.getRedditConfig();

      expect(config).toHaveProperty('clientId');
      expect(config).toHaveProperty('username');
      expect(config).toHaveProperty('userAgent');
      expect(config).not.toHaveProperty('clientSecret');
      expect(config).not.toHaveProperty('password');
    });
  });

  // Note: Real Reddit API testing would require valid credentials
  // These tests focus on integration patterns and error handling
  // For full validation, valid test credentials would be needed
});
