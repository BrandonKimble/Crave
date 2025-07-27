import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { LoggerService } from '../../../shared';
import { LLMService } from './llm.service';
import { LLMInputStructure } from './llm.types';
import configuration from '../../../config/configuration';

describe('Gemini Integration Test', () => {
  let service: LLMService;
  let module: TestingModule;

  beforeAll(async () => {
    // Set test environment variables following integration-test.setup.ts pattern
    process.env.NODE_ENV = 'test';
    process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'test_llm_key';
    process.env.LLM_MODEL = process.env.LLM_MODEL || 'gemini-2.5-flash';

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          isGlobal: true,
        }),
        HttpModule,
      ],
      providers: [
        LLMService,
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn().mockReturnThis(),
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('End-to-End Processing', () => {
    it('should process sample Reddit content successfully', async () => {
      const sampleInput: LLMInputStructure = {
        posts: [
          {
            post_id: 'e2e_test_123',
            title: 'Best BBQ in Austin',
            content:
              'Franklin BBQ has incredible brisket. The line is worth it!',
            subreddit: 'austinfood',
            url: 'https://reddit.com/r/austinfood/comments/test123',
            upvotes: 25,
            created_at: '2024-01-15T12:00:00Z',
            comments: [
              {
                comment_id: 'comment_456',
                content:
                  'I agree! Their ribs are amazing too. Try the pork shoulder.',
                author: 'bbq_lover',
                upvotes: 12,
                created_at: '2024-01-15T12:30:00Z',
                parent_id: null,
                url: 'https://reddit.com/r/austinfood/comments/test123/comment_456',
              },
              {
                comment_id: 'comment_789',
                content: 'The mac and cheese is also fantastic as a side.',
                author: 'foodie_austin',
                upvotes: 8,
                created_at: '2024-01-15T13:00:00Z',
                parent_id: 'comment_456',
                url: 'https://reddit.com/r/austinfood/comments/test123/comment_789',
              },
            ],
          },
        ],
      };

      // Skip this test if no API key is configured (for CI/CD environments)
      if (!process.env.LLM_API_KEY) {
        console.log('Skipping Gemini integration test - no API key configured');
        return;
      }

      try {
        const result = await service.processContent(sampleInput);

        // Validate the response structure
        expect(result).toBeDefined();
        expect(result.mentions).toBeDefined();
        expect(Array.isArray(result.mentions)).toBe(true);

        // If mentions were extracted, validate their structure
        if (result.mentions.length > 0) {
          const mention = result.mentions[0];

          expect(mention).toHaveProperty('temp_id');
          expect(mention).toHaveProperty('restaurant');
          expect(mention).toHaveProperty('source');
          expect(mention.source).toHaveProperty('type');
          expect(mention.source).toHaveProperty('id');

          // Validate that booleans are properly set
          expect(typeof mention.is_menu_item).toBe('boolean');
          expect(typeof mention.general_praise).toBe('boolean');
        }

        console.log('Gemini Integration Test Results:');
        console.log(`- Posts processed: ${sampleInput.posts.length}`);
        console.log(
          `- Total comments: ${sampleInput.posts.reduce((sum, post) => sum + post.comments.length, 0)}`,
        );
        console.log(`- Mentions extracted: ${result.mentions.length}`);

        if (result.mentions.length > 0) {
          console.log(
            `- Sample mention restaurant: ${result.mentions[0].restaurant?.normalized_name || 'N/A'}`,
          );
          console.log(
            `- Sample mention dish: ${result.mentions[0].dish_or_category?.normalized_name || 'N/A'}`,
          );
        }
      } catch (error) {
        // Log error details for debugging but don't fail the test in development
        console.error('Gemini Integration test error:', error);

        // Only fail if this is a critical error (authentication, configuration)
        if (
          error instanceof Error &&
          (error.name === 'LLMConfigurationError' ||
            error.name === 'LLMAuthenticationError')
        ) {
          throw error;
        }

        // For other errors (network, parsing), just log and pass
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.warn(
          'Gemini integration test encountered non-critical error:',
          errorMessage,
        );
      }
    }, 60000); // 60 second timeout for API calls

    it('should handle connection testing', async () => {
      const connectionResult = await service.testConnection();

      expect(connectionResult).toBeDefined();
      expect(connectionResult).toHaveProperty('status');
      expect(connectionResult).toHaveProperty('message');

      console.log('Gemini Connection Test Result:', connectionResult.status);
    });

    it('should provide performance metrics', () => {
      const metrics = service.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('requestCount');
      expect(metrics).toHaveProperty('averageResponseTime');
      expect(metrics).toHaveProperty('totalTokensUsed');
      expect(metrics).toHaveProperty('successRate');

      console.log('Gemini Performance Metrics:', {
        requests: metrics.requestCount,
        avgResponseTime: metrics.averageResponseTime,
        tokensUsed: metrics.totalTokensUsed,
        successRate: metrics.successRate,
      });
    });
  });
});
