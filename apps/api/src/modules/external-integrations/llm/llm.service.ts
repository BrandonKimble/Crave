import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
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
  private readonly logger: LoggerService;
  private readonly llmConfig: LLMConfig;
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
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('LLMService');
    this.llmConfig = {
      apiKey: this.configService.get<string>('llm.apiKey') || '',
      model: this.configService.get<string>('llm.model') || 'gpt-3.5-turbo',
      baseUrl:
        this.configService.get<string>('llm.baseUrl') ||
        'https://api.openai.com/v1',
      timeout: this.configService.get<number>('llm.timeout') || 30000,
      maxTokens: this.configService.get<number>('llm.maxTokens') || 4000,
      temperature: this.configService.get<number>('llm.temperature') || 0.1,
    };

    this.validateConfig();
  }

  onModuleInit() {
    this.logger.info('LLM service initialized', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'module_init',
      model: this.llmConfig.model,
    });
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
   * Process Reddit content through LLM for entity extraction
   * Implements PRD Section 6.3 LLM Data Collection Input/Output Structures
   */
  async processContent(input: LLMInputStructure): Promise<LLMOutputStructure> {
    this.logger.info('Processing content through LLM', {
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
        response.usage?.total_tokens || 0,
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
   * Build the processing prompt using the llm-content-processing.md guidelines
   */
  private buildProcessingPrompt(input: LLMInputStructure): string {
    const systemPrompt = `You are an expert entity extraction system for a food discovery app. Your task is to extract structured information about restaurants, dishes, and attributes from Reddit food community content.

EXTRACTION GUIDELINES:
1. Only process content with positive sentiment about food/restaurant quality
2. Extract entities: restaurants, dishes/categories, dish attributes, restaurant attributes
3. Apply context-dependent attribute scoping (dish vs restaurant)
4. Use hierarchical category decomposition for food terms
5. Set is_menu_item based on specificity and context
6. Mark general_praise for holistic restaurant praise

OUTPUT FORMAT: Return valid JSON matching the LLMOutputStructure exactly.`;

    const userPrompt = `Extract entities from this Reddit content:\n\n${JSON.stringify(input, null, 2)}`;

    return `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant: `;
  }

  /**
   * Make authenticated API call to LLM service
   */
  private async callLLMApi(prompt: string): Promise<LLMApiResponse> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.llmConfig.apiKey}`,
    };

    const payload = {
      model: this.llmConfig.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: this.llmConfig.maxTokens,
      temperature: this.llmConfig.temperature,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.llmConfig.baseUrl}/chat/completions`,
          payload,
          {
            headers,
            timeout: this.llmConfig.timeout,
          },
        ),
      );

      return response.data as LLMApiResponse;
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.response?.status === 401) {
        throw new LLMAuthenticationError(
          'Invalid LLM API key',
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
          'Network error during LLM API request',
          error as Error,
        );
      } else {
        throw new LLMApiError(
          'LLM API request failed',
          axiosError.response?.status,
          JSON.stringify(axiosError.response?.data),
        );
      }
    }
  }

  /**
   * Parse and validate LLM response
   */
  private parseResponse(response: LLMApiResponse): LLMOutputStructure {
    if (!response.choices || response.choices.length === 0) {
      throw new LLMResponseParsingError(
        'No choices in LLM response',
        JSON.stringify(response),
      );
    }

    const content = response.choices[0].message.content;
    if (!content) {
      throw new LLMResponseParsingError(
        'Empty content in LLM response',
        JSON.stringify(response),
      );
    }

    try {
      const parsed = JSON.parse(content) as LLMOutputStructure;

      // Basic validation
      if (!parsed.mentions || !Array.isArray(parsed.mentions)) {
        throw new LLMResponseParsingError(
          'Invalid mentions structure in LLM response',
          content,
        );
      }

      return parsed;
    } catch {
      throw new LLMResponseParsingError(
        'Failed to parse JSON from LLM response',
        content,
      );
    }
  }

  /**
   * Test LLM connectivity and authentication
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
        message: 'LLM connection test passed',
        details: this.performanceMetrics,
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'LLM connection test failed',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get LLM configuration (excluding sensitive data)
   */
  getLLMConfig(): Omit<LLMConfig, 'apiKey'> {
    return {
      model: this.llmConfig.model,
      baseUrl: this.llmConfig.baseUrl,
      timeout: this.llmConfig.timeout,
      maxTokens: this.llmConfig.maxTokens,
      temperature: this.llmConfig.temperature,
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
