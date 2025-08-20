import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LLMService } from './llm.service';
import { LoggerService } from '../../../shared';
import {
  LLMConfigurationError,
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMNetworkError,
  LLMResponseParsingError,
} from './llm.exceptions';
import { LLMInputStructure, LLMOutputStructure } from './llm.types';

describe('LLMService', () => {
  let service: LLMService;
  let loggerService: LoggerService;

  const mockLogger = {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };


  beforeEach(async () => {
    // Setup default config first
    mockConfigService.get.mockImplementation((key: string): string => {
      const config: Record<string, any> = {
        'llm.apiKey': 'test-api-key',
        'llm.model': 'gemini-2.5-flash',
        'llm.baseUrl': 'https://generativelanguage.googleapis.com/v1beta',
        'llm.timeout': 30000,
        'llm.maxTokens': 4000,
        'llm.temperature': 0.1,
        'llm.topP': 0.95,
        'llm.topK': 40,
        'llm.candidateCount': 1,
        'llm.thinking.enabled': true,
        'llm.thinking.budget': 0,
      };
      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should validate configuration on initialization', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('llm.apiKey');
      expect(mockConfigService.get).toHaveBeenCalledWith('llm.model');
    });

    it('should throw configuration error when API key is missing', () => {
      const localMockConfigService = {
        get: jest.fn().mockImplementation((key: string): string => {
          if (key === 'llm.apiKey') return '';
          return 'test-value';
        }),
      };

      expect(() => {
        new LLMService(
          /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
          localMockConfigService as any,
          loggerService,
        );
      }).toThrow(LLMConfigurationError);
    });

    it('should return config without sensitive data', () => {
      const config = service.getLLMConfig();

      expect(config).toEqual({
        model: 'gemini-2.5-flash',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        timeout: 30000,
        maxTokens: 4000,
        temperature: 0.1,
        topP: 0.95,
        topK: 40,
        candidateCount: 1,
        thinking: {
          enabled: true,
          budget: 0,
        },
        retryOptions: {
          maxRetries: 3,
          retryDelay: 1000,
          retryBackoffFactor: 2,
        },
      });
      expect(config).not.toHaveProperty('apiKey');
    });
  });

  describe('Content Processing', () => {
    const mockInput: LLMInputStructure = {
      posts: [
        {
          id: 'test123',
          title: 'Great food at Franklin BBQ',
          content: 'Franklin BBQ has amazing brisket',
          subreddit: 'austinfood',
          author: 'test_author',
          url: 'https://reddit.com/test',
          score: 10,
          created_at: '2024-01-01T00:00:00Z',
          comments: [
            {
              id: 'comment123',
              content: 'Their ribs are also excellent',
              author: 'foodlover',
              score: 5,
              created_at: '2024-01-01T01:00:00Z',
              parent_id: null,
              url: 'https://reddit.com/test#comment123',
            },
          ],
        },
      ],
    };

    const mockOutput: LLMOutputStructure = {
      mentions: [
        {
          temp_id: 'mention_1',
          restaurant_normalized_name: 'franklin bbq',
          restaurant_original_text: 'Franklin BBQ',
          restaurant_temp_id: 'restaurant_1',
          restaurant_attributes: null,
          dish_primary_category: 'brisket',
          dish_original_text: 'brisket',
          dish_temp_id: 'dish_1',
          dish_attributes_selective: null,
          dish_attributes_descriptive: ['amazing'],
          dish_is_menu_item: true,
          general_praise: false,
          source_type: 'post',
          source_id: 'test123',
          source_content: 'Test post content',
          source_url: 'https://reddit.com/test',
          source_ups: 10,
          source_created_at: '2024-01-01T00:00:00Z',
        },
      ],
    };

    it('should successfully process content', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(mockOutput),
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
        config: {
          url: 'test',
          method: 'post',
          headers: {},
        } as any,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.processContent(mockInput);

      expect(result).toEqual(mockOutput);
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-api-key',
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.any(String),
                }),
              ]),
            }),
          ]),
          generationConfig: expect.objectContaining({
            temperature: 0.1,
            maxOutputTokens: 4000,
            topP: 0.95,
            topK: 40,
            candidateCount: 1,
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });

    it('should handle authentication errors', async () => {
      const mockError = {
        response: {
          status: 401,
          data: { error: 'Invalid API key' },
          headers: {},
          config: {},
          statusText: 'Unauthorized',
        },
        isAxiosError: true,
        name: 'AxiosError',
        message: 'Request failed with status code 401',
      } as unknown as AxiosError;

      mockHttpService.post.mockReturnValue(throwError(() => mockError));

      await expect(service.processContent(mockInput)).rejects.toThrow(
        LLMAuthenticationError,
      );
    });

    it('should handle rate limit errors', async () => {
      const mockError = {
        response: {
          status: 429,
          headers: { 'retry-after': '60' },
          data: {},
          config: {},
          statusText: 'Too Many Requests',
        },
        isAxiosError: true,
        name: 'AxiosError',
        message: 'Request failed with status code 429',
      } as unknown as AxiosError;

      mockHttpService.post.mockReturnValue(throwError(() => mockError));

      await expect(service.processContent(mockInput)).rejects.toThrow(
        LLMRateLimitError,
      );
    });

    it('should handle network errors', async () => {
      const mockError = {
        code: 'ENOTFOUND',
        isAxiosError: true,
        name: 'AxiosError',
        message: 'Network error',
      } as unknown as AxiosError;

      mockHttpService.post.mockReturnValue(throwError(() => mockError));

      await expect(service.processContent(mockInput)).rejects.toThrow(
        LLMNetworkError,
      );
    });

    it('should handle invalid response format', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          candidates: [],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
        config: {
          url: 'test',
          method: 'post',
          headers: {},
        } as any,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await expect(service.processContent(mockInput)).rejects.toThrow(
        LLMResponseParsingError,
      );
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'invalid json content',
                  },
                ],
              },
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
        config: {
          url: 'test',
          method: 'post',
          headers: {},
        } as any,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await expect(service.processContent(mockInput)).rejects.toThrow(
        LLMResponseParsingError,
      );
    });
  });

  describe('Connection Testing', () => {
    it('should pass connection test when LLM is accessible', async () => {
      const mockResponse: AxiosResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({ mentions: [] }),
                  },
                ],
              },
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment */
        config: {
          url: 'test',
          method: 'post',
          headers: {},
        } as any,
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.testConnection();

      expect(result.status).toBe('connected');
      expect(result.message).toBe('Gemini connection test passed');
    });

    it('should fail connection test when LLM is not accessible', async () => {
      const mockError = {
        response: {
          status: 500,
          data: {},
          headers: {},
          config: {},
          statusText: 'Internal Server Error',
        },
        isAxiosError: true,
        name: 'AxiosError',
        message: 'Request failed with status code 500',
      } as unknown as AxiosError;

      mockHttpService.post.mockReturnValue(throwError(() => mockError));

      const result = await service.testConnection();

      expect(result.status).toBe('failed');
      expect(result.message).toBe('Gemini connection test failed');
    });
  });

  describe('Performance Metrics', () => {
    it('should track performance metrics', () => {
      const metrics = service.getPerformanceMetrics();

      expect(metrics).toEqual({
        requestCount: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        totalTokensUsed: 0,
        lastReset: expect.any(Date) as Date,
        errorCount: 0,
        successRate: 100,
      });
    });

    it('should reset performance metrics', () => {
      service.resetPerformanceMetrics();
      const metrics = service.getPerformanceMetrics();

      expect(metrics.requestCount).toBe(0);
      expect(metrics.lastReset).toBeInstanceOf(Date);
    });
  });

  describe('Validation', () => {
    it('should validate input structure successfully', async () => {
      const validInput = {
        posts: [
          {
            id: 'test123',
            title: 'Great food at Franklin BBQ',
            content: 'Franklin BBQ has amazing brisket',
            subreddit: 'austinfood',
            author: 'test_author',
            url: 'https://reddit.com/test',
            score: 10,
            created_at: '2024-01-01T00:00:00Z',
            comments: [],
          },
        ],
      };

      const errors = await service.validateInput(validInput);
      expect(errors).toEqual([]);
    });

    it('should detect input validation errors', async () => {
      const invalidInput = {
        posts: [], // Empty array should trigger IsNonEmptyArray validation
      };

      const errors = await service.validateInput(invalidInput);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((error) => error.includes('non-empty array'))).toBe(
        true,
      );
    });

    it('should validate output structure successfully', async () => {
      const validOutput = {
        mentions: [
          {
            temp_id: 'mention_1',
            restaurant_normalized_name: 'franklin bbq',
            restaurant_original_text: 'Franklin BBQ',
            restaurant_temp_id: 'restaurant_1',
            restaurant_attributes: null,
            dish_primary_category: null,
            dish_original_text: null,
            dish_temp_id: null,
            dish_attributes_selective: null,
            dish_attributes_descriptive: null,
            dish_is_menu_item: true,
            general_praise: false,
            source_type: 'post' as const,
            source_id: 'test123',
            source_url: 'https://reddit.com/test',
            source_ups: 10,
            source_created_at: '2024-01-01T00:00:00Z',
            source_content: 'Test content',
          },
        ],
      };

      const errors = await service.validateOutput(validOutput);
      expect(errors).toEqual([]);
    });
  });
});
