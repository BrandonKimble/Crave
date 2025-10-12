import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  LLMConfig,
  LLMInputStructure,
  LLMOutputStructure,
  LLMApiResponse,
  LLMPerformanceMetrics,
} from './llm.types';
import { LLMInputDto, LLMOutputDto } from './dto';
import {
  LLMAuthenticationError,
  LLMConfigurationError,
  LLMRateLimitError,
  LLMNetworkError,
  LLMApiError,
  LLMResponseParsingError,
} from './llm.exceptions';

@Injectable()
export class LLMService implements OnModuleInit {
  private logger!: LoggerService;
  private llmConfig!: LLMConfig;
  private systemPrompt!: string;
  private performanceMetrics: LLMPerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    totalTokensUsed: 0,
    lastReset: new Date(),
    errorCount: 0,
    successRate: 100,
  };

  private genAI!: GoogleGenAI;
  private systemInstructionCache: any = null; // Cache for system instructions

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('LLMService');
    this.llmConfig = {
      apiKey: this.configService.get<string>('llm.apiKey') || '',
      model: this.configService.get<string>('llm.model') || 'gemini-2.5-flash',
      baseUrl:
        this.configService.get<string>('llm.baseUrl') ||
        'https://generativelanguage.googleapis.com/v1beta',
      timeout: this.configService.get<number>('llm.timeout') || 0,
      maxTokens: this.configService.get<number>('llm.maxTokens') || 65536, // Gemini 2.5 Flash supports up to 65,536 output tokens
      temperature: this.configService.get<number>('llm.temperature') || 0.1,
      topP: this.configService.get<number>('llm.topP') || 0.95,
      topK: this.configService.get<number>('llm.topK') || 40,
      candidateCount: this.configService.get<number>('llm.candidateCount') || 1,
      thinking: {
        enabled:
          this.configService.get<boolean>('llm.thinking.enabled') === true,
        budget: this.configService.get<number>('llm.thinking.budget') || 0,
      },
      retryOptions: {
        maxRetries:
          this.configService.get<number>('llm.retryOptions.maxRetries') || 3,
        retryDelay:
          this.configService.get<number>('llm.retryOptions.retryDelay') || 1000,
        retryBackoffFactor:
          this.configService.get<number>(
            'llm.retryOptions.retryBackoffFactor',
          ) || 2.0,
      },
    };

    // Initialize GoogleGenAI client
    this.genAI = new GoogleGenAI({ apiKey: this.llmConfig.apiKey });

    // Load system prompt from llm-content-processing.md
    this.systemPrompt = this.loadSystemPrompt();
    this.validateConfig();

    this.logger.info('Gemini LLM service initialized with @google/genai', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'module_init',
      model: this.llmConfig.model,
      provider: 'google-genai-library',
      apiKeyExists: !!this.llmConfig.apiKey,
      apiKeyLength: this.llmConfig.apiKey ? this.llmConfig.apiKey.length : 0,
      apiKeyPrefix: this.llmConfig.apiKey
        ? this.llmConfig.apiKey.substring(0, 8) + '...'
        : 'none',
      maxTokens: this.llmConfig.maxTokens,
      thinkingEnabled: this.llmConfig.thinking?.enabled,
      thinkingBudget: this.llmConfig.thinking?.budget,
    });

    // Initialize explicit cache for system instructions (async, non-blocking)
    this.initializeSystemInstructionCache().catch((error) => {
      this.logger.warn(
        'System instruction cache initialization failed, continuing with fallback',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'module_init',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    });
  }

  /**
   * Initialize explicit cache for system instructions to optimize token usage
   */
  private async initializeSystemInstructionCache(): Promise<void> {
    try {
      this.logger.info('Creating explicit cache for system instructions', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'init_system_cache',
        systemPromptLength: this.systemPrompt.length,
      });

      // Create explicit cache with system instructions
      this.systemInstructionCache = await this.genAI.caches.create({
        model: this.llmConfig.model,
        config: {
          systemInstruction: this.systemPrompt,
          ttl: '10800s', // 3 hour cache
        },
      });

      this.logger.info('System instruction cache created successfully', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'init_system_cache',
        cacheId: this.systemInstructionCache.name,
        ttl: '10800s',
      });
    } catch (error) {
      this.logger.warn(
        'Failed to create explicit cache, falling back to implicit caching',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'init_system_cache',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      // Continue without explicit caching - implicit caching will still work
      this.systemInstructionCache = null;
    }
  }

  private loadSystemPrompt(): string {
    try {
      // Path to llm-content-processing.md in project root (relative from apps/api when running)
      const promptPath = join(
        process.cwd(),
        '..',
        '..',
        'llm-content-processing.md',
      );
      return readFileSync(promptPath, 'utf-8');
    } catch (error) {
      this.logger.error(
        'Failed to load system prompt from llm-content-processing.md',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'load_system_prompt',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );

      // Fallback to basic prompt if file cannot be loaded
      return `You are an expert entity extraction system for a food discovery app. Your task is to extract structured information about restaurants, food, and attributes from Reddit food community content.

EXTRACTION GUIDELINES:
1. Only process content with positive sentiment about food/restaurant quality
2. Extract entities: restaurants, food/categories, food attributes, restaurant attributes
3. Apply context-dependent attribute scoping (food vs restaurant)
4. Use hierarchical category decomposition for food terms
5. Set is_menu_item based on specificity and context
6. Mark general_praise for holistic restaurant praise

OUTPUT FORMAT: Return valid JSON matching the LLMOutputStructure exactly.`;
    }
  }

  private validateConfig(): void {
    const missingFields: string[] = [];
    if (!this.llmConfig.apiKey) missingFields.push('llm.apiKey');
    if (!this.llmConfig.model) missingFields.push('llm.model');

    if (missingFields.length > 0) {
      throw new LLMConfigurationError(
        `Missing required LLM configuration: ${missingFields.join(', ')}`,
      );
    }
  }

  /**
   * Process Reddit content through Gemini LLM for entity extraction
   * Implements PRD Section 6.3 LLM Data Collection Input/Output Structures
   */
  async processContent(input: LLMInputStructure): Promise<LLMOutputStructure> {
    this.logger.info('Processing content through Gemini', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'process_content',
      postCount: input.posts.length,
      totalComments: input.posts.reduce(
        (sum, post) => sum + post.comments.length,
        0,
      ),
    });

    const startTime = Date.now();

    try {
      const prompt = this.buildProcessingPrompt(input);
      const response = await this.callLLMApi(prompt);
      const parsed = this.parseResponse(response);
      // Attach usage metadata to parsed output for downstream TPM tracking
      try {
        Object.defineProperty(parsed as any, 'usageMetadata', {
          value: response.usageMetadata || null,
          enumerable: false,
          writable: false,
        });
      } catch (_) {
        // Non-fatal if property cannot be defined
      }

      const responseTime = Date.now() - startTime;
      this.recordSuccessMetrics(
        responseTime,
        response.usageMetadata?.totalTokenCount || 0,
      );

      this.logger.info('Content processing completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'process_content',
        responseTime,
        mentionsExtracted: parsed.mentions.length,
      });

      return parsed;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordErrorMetrics(responseTime);

      this.logger.error('Content processing failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'process_content',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
        responseTime,
      });

      throw error;
    }
  }

  /**
   * Build the processing prompt using the complete llm-content-processing.md system prompt
   */
  private buildProcessingPrompt(input: LLMInputStructure): string {
    // Validate input structure first to prevent undefined access errors
    if (!input || !input.posts || !Array.isArray(input.posts)) {
      throw new Error(
        `Invalid LLM input structure: ${JSON.stringify({ hasInput: !!input, hasPostsProperty: input && 'posts' in input, postsType: input && typeof input.posts })}`,
      );
    }

    // Filter out any undefined or null posts
    const validPosts = input.posts.filter((post, index) => {
      if (!post) {
        this.logger.warn(
          `Found undefined/null post at index ${index}, skipping`,
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'build_processing_prompt',
            inputPostsLength: input.posts.length,
            undefinedIndex: index,
          },
        );
        return false;
      }
      return true;
    });

    if (validPosts.length === 0) {
      throw new Error(
        `No valid posts found in LLM input. Total posts: ${input.posts.length}, valid: ${validPosts.length}`,
      );
    }

    // Return only the minimal data needed by the LLM (lightweight projection)
    const lightweightPosts = validPosts.map((post) => {
      const comments = Array.isArray(post.comments) ? post.comments : [];
      return {
        id: post.id,
        title: post.title,
        content: post.content,
        extract_from_post: !!post.extract_from_post,
        comments: comments.map((c) => ({
          id: c.id,
          content: c.content,
          parent_id: c.parent_id ?? null,
        })),
      };
    });

    const promptData = JSON.stringify({ posts: lightweightPosts }, null, 2);

    // DEBUG LOGGING: Track input size for massive token generation issue
    const totalComments = lightweightPosts.reduce(
      (sum, post: any) => sum + (post.comments?.length || 0),
      0,
    );
    const avgCommentLength =
      lightweightPosts.reduce((sum: number, post: any) => {
        const commentText =
          post.comments
            ?.map((c: any) => (c.content || '').length)
            .reduce((a: number, b: number) => a + b, 0) || 0;
        return sum + commentText;
      }, 0) / Math.max(totalComments, 1);

    this.logger.info('🔍 INPUT SIZE DEBUG - LLM prompt built', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'build_processing_prompt',
      inputStats: {
        postsCount: lightweightPosts.length,
        totalComments,
        promptCharacters: promptData.length,
        avgCommentLength: Math.round(avgCommentLength),
        postIds: lightweightPosts.map((p: any) => p.id),
        commentCounts: lightweightPosts.map(
          (p: any) => p.comments?.length || 0,
        ),
      },
      warning: totalComments > 50 ? 'HIGH_COMMENT_COUNT' : 'NORMAL',
    });

    return promptData;
  }

  /**
   * Make authenticated API call to Gemini service using @google/genai library
   */
  private async callLLMApi(prompt: string): Promise<LLMApiResponse> {
    const maxRetries = this.llmConfig.retryOptions?.maxRetries ?? 3;
    const baseDelay = this.llmConfig.retryOptions?.retryDelay ?? 1000;
    const backoff = this.llmConfig.retryOptions?.retryBackoffFactor ?? 2.0;

    const generationConfig = {
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
      maxOutputTokens: this.llmConfig.maxTokens || 65536,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        description:
          'Restaurant and food mentions extracted from Reddit content',
        properties: {
          mentions: {
            type: 'array',
            description:
              'Array of restaurant/food mentions with entity details',
            items: {
              type: 'object',
              description:
                'Single mention of restaurant or food with complete metadata',
              properties: {
                // Core identifiers (shortened names for complexity reduction)
                temp_id: {
                  type: 'string',
                  description: 'Unique identifier for this mention',
                },
                restaurant_temp_id: {
                  type: 'string',
                  description: 'Unique identifier for the restaurant entity',
                },

                // Restaurant info (required)
                restaurant_name: {
                  type: 'string',
                  description:
                    'Canonical restaurant name: lowercase, no articles (the/a/an), standardized spacing',
                },
                restaurant_attributes: {
                  type: 'array',
                  description:
                    'Restaurant-scoped attributes: ambiance, features, service model, cuisine when applied to restaurant',
                  items: { type: 'string' },
                  nullable: true,
                },

                // Food info (optional with nullable)
                food_temp_id: {
                  type: 'string',
                  description: 'Unique identifier for food if mentioned',
                  nullable: true,
                },
                food_name: {
                  type: 'string',
                  description:
                    'Complete compound food term as primary name, singular form, excluding attributes',
                  nullable: true,
                },
                food_categories: {
                  type: 'array',
                  description:
                    'Hierarchical decomposition: parent categories, ingredient categories, related food terms',
                  items: { type: 'string' },
                  nullable: true,
                },
                food_attributes_selective: {
                  type: 'array',
                  description:
                    'Selective attributes: help filter or categorize food options',
                  items: { type: 'string' },
                  nullable: true,
                },
                food_attributes_descriptive: {
                  type: 'array',
                  description:
                    'Descriptive attributes: characterize or describe specific food items',
                  items: { type: 'string' },
                  nullable: true,
                },
                is_menu_item: {
                  type: 'boolean',
                  description:
                    'True if specific menu item, false if general food type',
                  nullable: true,
                },

                // Sentiment (required)
                general_praise: {
                  type: 'boolean',
                  description:
                    'True if mention contains holistic restaurant praise, regardless of specific food praise',
                },

                source_id: {
                  type: 'string',
                  description: 'Reddit ID of the source (t3_ or t1_ prefixed)',
                },
                // Note: other source_* fields (type, ups, url, created_at) are injected server-side
              },
              required: [
                'temp_id',
                'restaurant_temp_id',
                'restaurant_name',
                'general_praise',
                'source_id',
              ],
              propertyOrdering: [
                'temp_id',
                'restaurant_temp_id',
                'restaurant_name',
                'restaurant_attributes',
                'food_temp_id',
                'food_name',
                'food_categories',
                'is_menu_item',
                'food_attributes_selective',
                'food_attributes_descriptive',
                'general_praise',
                'source_id',
              ],
            },
          },
        },
        required: ['mentions'],
        propertyOrdering: ['mentions'],
      },
      // Always include thinkingConfig for explicit control (Google's recommended approach)
      thinkingConfig: {
        thinkingBudget: this.llmConfig.thinking?.enabled
          ? this.llmConfig.thinking.budget || -1 // Dynamic thinking if no budget specified
          : 0, // Explicitly disable thinking (Google's proper way)
      },
    };

    // Debug logging to verify structured output config
    this.logger.info('Generation config with @google/genai', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'call_llm_api',
      hasResponseMimeType: !!generationConfig.responseMimeType,
      hasResponseSchema: !!generationConfig.responseSchema,
      configKeys: Object.keys(generationConfig),
    });

    // Simple helper to classify transient errors from Gemini
    const isRetryable = (err: any): { retry: boolean; reason: string } => {
      try {
        const msg = (err?.message || String(err) || '').toLowerCase();
        // Try to parse JSON error bodies of the shape { error: { code, status, message } }
        let code = 0;
        let status = '';
        const jsonMatch = String(err?.message || '').match(
          /\{\"error\":\{[^}]*\}\}/,
        );
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            code = parsed?.error?.code || 0;
            status = String(parsed?.error?.status || '').toLowerCase();
          } catch {}
        }

        if (
          code === 503 ||
          status === 'unavailable' ||
          msg.includes('service is currently unavailable') ||
          msg.includes('model is overloaded') ||
          msg.includes('temporarily unavailable') ||
          msg.includes('unavailable') ||
          msg.includes('503')
        ) {
          return { retry: true, reason: 'gemini_unavailable' };
        }
        if (msg.includes('timeout') || msg.includes('timed out')) {
          return { retry: true, reason: 'timeout' };
        }
        if (msg.includes('ecconnreset') || msg.includes('econnrefused')) {
          return { retry: true, reason: 'network' };
        }
        if (
          msg.includes('rate limit') ||
          msg.includes('quota') ||
          msg.includes('429')
        ) {
          return { retry: true, reason: 'rate_limit' };
        }
      } catch {}
      return { retry: false, reason: 'non_retryable' };
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info('Making LLM API request via @google/genai', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'call_llm_api',
          model: this.llmConfig.model,
          hasApiKey: !!this.llmConfig.apiKey,
          promptLength: prompt.length,
          library: '@google/genai',
          usingExplicitCache: !!this.systemInstructionCache,
          cacheId: this.systemInstructionCache?.name || null,
          attempt: attempt + 1,
          maxRetries,
        });

        // Use explicit cache if available, otherwise fall back to system instruction in config
        const requestConfig = this.systemInstructionCache
          ? {
              ...generationConfig,
              cachedContent: this.systemInstructionCache.name,
            }
          : {
              ...generationConfig,
              systemInstruction: this.systemPrompt,
            };

        const response = await this.genAI.models.generateContent({
          model: this.llmConfig.model,
          contents: [{ parts: [{ text: prompt }] }],
          config: requestConfig,
        });

        const finishReason = response.candidates?.[0]?.finishReason;
        const tokensUsed = response.usageMetadata?.totalTokenCount || 0;
        const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

        if (finishReason === 'MAX_TOKENS') {
          this.logger.warn('🚨 TOKEN LIMIT HIT - Response truncated!', {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'call_llm_api',
            finishReason,
            outputTokens,
            totalTokens: tokensUsed,
            tokenLimit: 65536,
            contentLength:
              response.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0,
            warning:
              'JSON response may be incomplete - chunk too large for processing',
          });
        }

        // DEBUG LOGGING: Track response size for massive token generation issue
        const contentLength =
          response.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0;
        const outputTokenCount = outputTokens || 0;

        if (outputTokenCount > 20000 || contentLength > 30000) {
          this.logger.warn(
            '🔍 MASSIVE RESPONSE DEBUG - Unexpectedly large LLM output',
            {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'call_llm_api',
              responseAnalysis: {
                outputTokens: outputTokenCount,
                contentLength,
                tokensPerChar:
                  contentLength > 0
                    ? (outputTokenCount / contentLength).toFixed(3)
                    : 'N/A',
                promptLength: prompt.length,
                inputToOutputRatio:
                  prompt.length > 0
                    ? (contentLength / prompt.length).toFixed(2)
                    : 'N/A',
              },
              flags: {
                isTokenLimit: finishReason === 'MAX_TOKENS',
                isMassiveOutput: outputTokenCount > 50000,
                isHugeContent: contentLength > 50000,
              },
              responsePreview:
                response.candidates?.[0]?.content?.parts?.[0]?.text ||
                'NO_CONTENT',
            },
          );
        }

        this.logger.info('LLM API response received via @google/genai', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'call_llm_api',
          candidatesCount: response.candidates?.length || 0,
          hasContent: !!response.candidates?.[0]?.content?.parts?.[0]?.text,
          contentLength:
            response.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0,
          finishReason,
          safetyRatings: response.candidates?.[0]?.safetyRatings,
          usageMetadata: response.usageMetadata,
          usingExplicitCache: !!this.systemInstructionCache,
          cachedTokenCount:
            response.usageMetadata?.cachedContentTokenCount || 0,
          attempt: attempt + 1,
        });

        return {
          candidates: response.candidates || [],
          usageMetadata: response.usageMetadata,
          promptFeedback: response.promptFeedback,
        } as LLMApiResponse;
      } catch (error) {
        const errorDetails = {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'call_llm_api',
          library: '@google/genai',
          errorType: typeof error,
          errorConstructor: error?.constructor?.name,
          errorMessage: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
          maxRetries,
        };

        this.logger.error('Detailed @google/genai API error', errorDetails);

        const { retry, reason } = isRetryable(error);
        if (retry && attempt < maxRetries) {
          if (reason === 'rate_limit') {
            this.logger.warn('Transient Gemini rate limit; handing back to processor for rescheduling', {
              correlationId: CorrelationUtils.getCorrelationId(),
              attempt: attempt + 1,
            });
            throw new LLMRateLimitError(60);
          }

          // Exponential backoff with jitter for other transient errors
          const delay = Math.floor(baseDelay * Math.pow(backoff, attempt));
          const jitter = Math.floor(
            Math.random() * Math.max(250, Math.floor(delay * 0.2)),
          );
          const waitMs = delay + jitter;
          this.logger.warn('Transient Gemini error; retrying with backoff', {
            correlationId: CorrelationUtils.getCorrelationId(),
            reason,
            attempt: attempt + 1,
            nextAttemptInMs: waitMs,
          });
          await new Promise((r) => setTimeout(r, waitMs));
          continue; // retry loop
        }

        // Map @google/genai errors to our custom exceptions (non-retryable or out of retries)
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (
            errorMessage.includes('api key') ||
            errorMessage.includes('authentication') ||
            errorMessage.includes('unauthorized')
          ) {
            throw new LLMAuthenticationError(
              'Invalid Gemini API key',
              error.message,
            );
          } else if (
            errorMessage.includes('quota') ||
            errorMessage.includes('rate limit') ||
            errorMessage.includes('429')
          ) {
            throw new LLMRateLimitError(60);
          } else if (
            errorMessage.includes('network') ||
            errorMessage.includes('connection') ||
            errorMessage.includes('timeout')
          ) {
            throw new LLMNetworkError(
              'Network error during Gemini API request',
              error,
            );
          } else {
            throw new LLMApiError(
              `Gemini API request failed: ${error.message}`,
              undefined,
              error.message,
            );
          }
        } else {
          throw new LLMApiError(
            `LLM request failed: ${String(error)}`,
            undefined,
            JSON.stringify(errorDetails),
          );
        }
      }
    }
    // Should be unreachable: loop either returned or threw
    throw new LLMApiError(
      'Gemini API request failed after all retry attempts',
      undefined,
      'retry_exhausted',
    );
  }

  // Local helper for sleep (used in retry)
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse and validate Gemini response
   */
  private parseResponse(response: LLMApiResponse): LLMOutputStructure {
    if (!response.candidates || response.candidates.length === 0) {
      throw new LLMResponseParsingError(
        'No candidates in Gemini response',
        JSON.stringify(response),
      );
    }

    const candidate = response.candidates[0];
    if (
      !candidate.content ||
      !candidate.content.parts ||
      candidate.content.parts.length === 0
    ) {
      throw new LLMResponseParsingError(
        'No content parts in Gemini response',
        JSON.stringify(response),
      );
    }

    const content = candidate.content.parts[0].text;
    if (!content) {
      throw new LLMResponseParsingError(
        'Empty text content in Gemini response',
        JSON.stringify(response),
      );
    }

    this.logger.debug('Parsing LLM response content', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'parse_response',
      contentLength: content.length,
      contentPreview:
        content.substring(0, 200) + (content.length > 200 ? '...' : ''),
    });

    try {
      // Remove markdown code block formatting if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent
          .replace(/^```json\s*/, '')
          .replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent
          .replace(/^```\s*/, '')
          .replace(/\s*```$/, '');
      }

      // Check for truncated JSON and attempt to fix simple cases
      if (!cleanContent.endsWith('}') && !cleanContent.endsWith(']')) {
        // Try to find the last complete object/array and truncate there
        const lastCompleteObjectIndex = cleanContent.lastIndexOf('},');
        if (lastCompleteObjectIndex > 0) {
          // Look for the closing of the mentions array
          const afterLastObject = cleanContent.substring(
            lastCompleteObjectIndex + 2,
          );
          const mentionsArrayClose = afterLastObject.indexOf(']');
          if (
            mentionsArrayClose === -1 ||
            afterLastObject.indexOf('"') < mentionsArrayClose
          ) {
            // Close the mentions array and root object
            cleanContent =
              cleanContent.substring(0, lastCompleteObjectIndex + 1) +
              '\n  ]\n}';
          }
        }
      }

      const parsed = JSON.parse(cleanContent) as LLMOutputStructure;

      // Basic validation
      if (!parsed.mentions || !Array.isArray(parsed.mentions)) {
        throw new LLMResponseParsingError(
          'Invalid mentions structure in Gemini response',
          content,
        );
      }

      this.logger.debug('LLM response successfully parsed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'parse_response',
        mentionsCount: parsed.mentions.length,
        mentions:
          parsed.mentions.length > 0
            ? parsed.mentions.map((m) => ({
                temp_id: m.temp_id,
                restaurant: m.restaurant_name,
                food: m.food_name,
                food_categories: m.food_categories,
              }))
            : [],
      });

      return parsed;
    } catch (error) {
      throw new LLMResponseParsingError(
        `Failed to parse JSON from Gemini response: ${
          error instanceof Error ? error.message : String(error)
        }`,
        content,
      );
    }
  }

  /**
   * Test Gemini connectivity and authentication
   */
  async testConnection(): Promise<{
    status: string;
    message: string;
    details?: any;
  }> {
    try {
      const testInput: LLMInputStructure = {
        posts: [
          {
            id: 'test',
            title: 'Test connection',
            content: 'Franklin BBQ has amazing brisket',
            subreddit: 'austinfood',
            author: 'test_user',
            url: 'https://reddit.com/test',
            score: 1,
            created_at: new Date().toISOString(),
            comments: [],
          },
        ],
      };

      await this.processContent(testInput);

      return {
        status: 'connected',
        message: 'Gemini connection test passed',
        details: this.performanceMetrics,
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'Gemini connection test failed',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get Gemini configuration (excluding sensitive data)
   */
  getLLMConfig(): Omit<LLMConfig, 'apiKey'> {
    return {
      model: this.llmConfig.model,
      baseUrl: this.llmConfig.baseUrl,
      timeout: this.llmConfig.timeout,
      maxTokens: this.llmConfig.maxTokens,
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
      thinking: this.llmConfig.thinking,
      retryOptions: this.llmConfig.retryOptions,
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): LLMPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      lastReset: new Date(),
      errorCount: 0,
      successRate: 100,
    };
  }

  /**
   * Get service health status
   * Compatible with BaseExternalApiService interface
   */
  getHealthStatus() {
    const status: 'healthy' | 'degraded' | 'unhealthy' =
      this.performanceMetrics.successRate > 80 ? 'healthy' : 'degraded';

    return {
      service: 'llm',
      status,
      uptime: Date.now() - this.performanceMetrics.lastReset.getTime(),
      metrics: {
        requestCount: this.performanceMetrics.requestCount,
        totalResponseTime: this.performanceMetrics.totalResponseTime,
        averageResponseTime: this.performanceMetrics.averageResponseTime,
        lastReset: this.performanceMetrics.lastReset,
        errorCount: this.performanceMetrics.errorCount,
        successRate: this.performanceMetrics.successRate,
        rateLimitHits: 0, // LLM service doesn't track this separately
      },
      configuration: {
        timeout: this.llmConfig.timeout || 30000,
        retryOptions: this.llmConfig.retryOptions,
      },
    };
  }

  /**
   * Validate LLM input structure using custom validators
   */
  async validateInput(input: LLMInputStructure): Promise<string[]> {
    const inputDto = plainToClass(LLMInputDto, input);
    const errors = await validate(inputDto);

    return errors.flatMap((error) =>
      error.constraints ? Object.values(error.constraints) : [],
    );
  }

  /**
   * Validate LLM output structure using custom validators
   */
  async validateOutput(output: LLMOutputStructure): Promise<string[]> {
    const outputDto = plainToClass(LLMOutputDto, output);
    const errors = await validate(outputDto);

    return errors.flatMap((error) =>
      error.constraints ? Object.values(error.constraints) : [],
    );
  }

  private recordSuccessMetrics(responseTime: number, tokensUsed: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.totalTokensUsed += tokensUsed;
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }

  private recordErrorMetrics(responseTime: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.errorCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }
}
