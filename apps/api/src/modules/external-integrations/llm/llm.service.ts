import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
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
  GeminiApiRequest,
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

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    if (this.loggerService) {
      this.logger = this.loggerService.setContext('LLMService');
    }
    this.llmConfig = {
      apiKey: this.configService.get<string>('llm.apiKey') || '',
      model: this.configService.get<string>('llm.model') || 'gemini-2.5-flash',
      baseUrl:
        this.configService.get<string>('llm.baseUrl') ||
        'https://generativelanguage.googleapis.com/v1beta',
      timeout: this.configService.get<number>('llm.timeout') || 0,
      maxTokens: this.configService.get<number>('llm.maxTokens') || 0,
      temperature: this.configService.get<number>('llm.temperature') || 0.1,
      topP: this.configService.get<number>('llm.topP') || 0.95,
      topK: this.configService.get<number>('llm.topK') || 40,
      candidateCount: this.configService.get<number>('llm.candidateCount') || 1,
      thinking: {
        enabled:
          this.configService.get<boolean>('llm.thinking.enabled') !== false,
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

    // Load system prompt from llm-content-processing.md
    this.systemPrompt = this.loadSystemPrompt();
    this.validateConfig();

    this.logger.info('Gemini LLM service initialized', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'module_init',
      model: this.llmConfig.model,
      provider: 'google-gemini',
      apiKeyExists: !!this.llmConfig.apiKey,
      apiKeyLength: this.llmConfig.apiKey ? this.llmConfig.apiKey.length : 0,
      apiKeyPrefix: this.llmConfig.apiKey ? this.llmConfig.apiKey.substring(0, 8) + '...' : 'none',
      maxTokens: this.llmConfig.maxTokens,
      thinkingEnabled: this.llmConfig.thinking?.enabled,
      thinkingBudget: this.llmConfig.thinking?.budget,
    });
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
          error: error instanceof Error ? error.message : String(error),
        },
      );

      // Fallback to basic prompt if file cannot be loaded
      return `You are an expert entity extraction system for a food discovery app. Your task is to extract structured information about restaurants, dishes, and attributes from Reddit food community content.

EXTRACTION GUIDELINES:
1. Only process content with positive sentiment about food/restaurant quality
2. Extract entities: restaurants, dishes/categories, dish attributes, restaurant attributes
3. Apply context-dependent attribute scoping (dish vs restaurant)
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
        error: error instanceof Error ? error.message : String(error),
        responseTime,
      });

      throw error;
    }
  }

  /**
   * Build the processing prompt using the complete llm-content-processing.md system prompt
   */
  private buildProcessingPrompt(input: LLMInputStructure): string {
    const userPrompt = `Extract entities from this Reddit content:\n\n${JSON.stringify(
      input,
      null,
      2,
    )}`;

    return `${this.systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant: `;
  }

  /**
   * Make authenticated API call to Gemini service
   */
  private async callLLMApi(prompt: string): Promise<LLMApiResponse> {
    const headers = {
      'Content-Type': 'application/json',
    };

    const generationConfig: GeminiApiRequest['generationConfig'] = {
      temperature: this.llmConfig.temperature,
      topP: this.llmConfig.topP,
      topK: this.llmConfig.topK,
      candidateCount: this.llmConfig.candidateCount,
    };

    // Only include maxOutputTokens if it's greater than 0 (0 means no limit)
    if (this.llmConfig.maxTokens && this.llmConfig.maxTokens > 0) {
      generationConfig.maxOutputTokens = this.llmConfig.maxTokens;
    }

    // Always add thinking configuration to explicitly control it
    generationConfig.thinkingConfig = {
      thinkingBudget: this.llmConfig.thinking?.enabled ? this.llmConfig.thinking.budget : 0,
    };

    // Add structured output configuration
    (generationConfig as any).responseMimeType = 'application/json';
    (generationConfig as any).responseSchema = {
      type: 'object',
      properties: {
        mentions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              temp_id: { type: 'string' },
              restaurant_temp_id: { type: 'string' },
              restaurant_normalized_name: { type: 'string' },
              restaurant_original_text: { type: 'string' },
              restaurant_attributes: { 
                type: 'array', 
                items: { type: 'string' },
                nullable: true 
              },
              dish_temp_id: { type: 'string', nullable: true },
              dish_primary_category: { type: 'string', nullable: true },
              dish_categories: { 
                type: 'array', 
                items: { type: 'string' },
                nullable: true 
              },
              dish_original_text: { type: 'string', nullable: true },
              dish_attributes: { 
                type: 'array', 
                items: { type: 'string' },
                nullable: true 
              },
              dish_is_menu_item: { type: 'boolean' },
              general_praise: { type: 'boolean' },
              source_type: { type: 'string', enum: ['post', 'comment'] },
              source_id: { type: 'string' },
              source_content: { type: 'string' },
              source_created_at: { type: 'string' },
              source_upvotes: { type: 'number' },
              source_url: { type: 'string' }
            },
            required: [
              'temp_id', 'restaurant_temp_id', 'restaurant_normalized_name', 
              'restaurant_original_text', 'dish_is_menu_item', 'general_praise',
              'source_type', 'source_id', 'source_content', 'source_created_at', 
              'source_upvotes', 'source_url'
            ]
          }
        }
      },
      required: ['mentions']
    };

    // Debug logging to verify structured output config
    this.logger.info('Generation config after adding structured output', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'call_llm_api',
      hasResponseMimeType: !!(generationConfig as any).responseMimeType,
      hasResponseSchema: !!(generationConfig as any).responseSchema,
      configKeys: Object.keys(generationConfig),
    });

    const payload: GeminiApiRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig,
    };

    try {
      const url = `${this.llmConfig.baseUrl}/models/${this.llmConfig.model}:generateContent?key=${this.llmConfig.apiKey}`;
      
      this.logger.info('Making LLM API request', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'call_llm_api',
        url: url.replace(/key=.*$/, 'key=***'),
        model: this.llmConfig.model,
        hasApiKey: !!this.llmConfig.apiKey,
        promptLength: prompt.length,
        generationConfig: generationConfig,
        payloadKeys: Object.keys(payload),
      });

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers,
          timeout: this.llmConfig.timeout,
        }),
      );

      this.logger.info('LLM API response received', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'call_llm_api',
        status: response.status,
        candidatesCount: response.data?.candidates?.length || 0,
        hasContent: !!response.data?.candidates?.[0]?.content?.parts?.[0]?.text,
        contentLength: response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0,
        finishReason: response.data?.candidates?.[0]?.finishReason,
        safetyRatings: response.data?.candidates?.[0]?.safetyRatings,
        rawResponse: JSON.stringify(response.data, null, 2),
      });

      return response.data as LLMApiResponse;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (
        axiosError.response?.status === 401 ||
        axiosError.response?.status === 403
      ) {
        throw new LLMAuthenticationError(
          'Invalid Gemini API key',
          JSON.stringify(axiosError.response.data),
        );
      } else if (axiosError.response?.status === 429) {
        throw new LLMRateLimitError(
          parseInt(
            String(axiosError.response.headers?.['retry-after'] || '60'),
          ),
        );
      } else if (
        axiosError.code === 'ENOTFOUND' ||
        axiosError.code === 'ECONNREFUSED' ||
        axiosError.code === 'ETIMEDOUT'
      ) {
        throw new LLMNetworkError(
          'Network error during Gemini API request',
          error as Error,
        );
      } else {
        throw new LLMApiError(
          'Gemini API request failed',
          axiosError.response?.status,
          JSON.stringify(axiosError.response?.data),
        );
      }
    }
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
      contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
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
        mentions: parsed.mentions.length > 0 ? parsed.mentions.map(m => ({
          temp_id: m.temp_id,
          restaurant: m.restaurant_normalized_name || m.restaurant_original_text,
          dish: m.dish_primary_category || m.dish_original_text,
          dish_categories: m.dish_categories,
        })) : [],
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
            post_id: 'test',
            title: 'Test connection',
            content: 'Franklin BBQ has amazing brisket',
            subreddit: 'austinfood',
            url: 'https://reddit.com/test',
            upvotes: 1,
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
