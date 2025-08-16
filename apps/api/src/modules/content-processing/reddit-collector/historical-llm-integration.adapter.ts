import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import {
  HistoricalContentBatch,
  HistoricalProcessingConfig,
} from './historical-content-pipeline.types';
import {
  LLMInputStructure,
  LLMOutputStructure,
} from '../../external-integrations/llm/llm.types';

/**
 * Historical LLM Integration Adapter
 *
 * Bridges historical archive processing with existing M02 LLM processing pipeline.
 * Implements PRD Section 5.1.1 and 6.1 integration requirements.
 *
 * Key responsibilities:
 * - Route historical data through existing LLM infrastructure
 * - Validate data structure compatibility between historical and LLM systems
 * - Provide configuration for historical data processing through M02 pipeline
 * - Handle integration failures and data format mismatches
 * - Maintain consistency with existing entity resolution systems
 */
@Injectable()
export class HistoricalLlmIntegrationAdapter implements OnModuleInit {
  private logger!: LoggerService;
  private integrationConfig!: HistoricalLlmIntegrationConfig;

  constructor(
    private readonly llmService: LLMService,
    private readonly historicalPipeline: HistoricalContentPipelineService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'HistoricalLlmIntegrationAdapter',
    );
    this.integrationConfig = this.loadIntegrationConfig();

    this.logger.info('Historical LLM integration adapter initialized', {
      enableValidation: this.integrationConfig.enableValidation,
      batchSizeLimit: this.integrationConfig.batchSizeLimit,
      preserveThreads: this.integrationConfig.preserveThreads,
    });
  }

  /**
   * Process historical batch through existing LLM pipeline
   * Uses M02 LLM infrastructure with historical data formatting
   *
   * @param batch Historical content batch from archive processing
   * @param config Processing configuration
   * @returns LLM output structure ready for entity resolution
   */
  async processHistoricalBatchThroughLLM(
    batch: HistoricalContentBatch,
    config?: Partial<HistoricalProcessingConfig>,
  ): Promise<LLMOutputStructure> {
    const startTime = Date.now();

    this.logger.info('Processing historical batch through LLM pipeline', {
      batchId: batch.batchId,
      submissions: batch.submissions.length,
      comments: batch.comments.length,
    });

    try {
      // Step 1: Validate batch compatibility
      this.validateBatchCompatibility(batch);

      // Step 2: Convert to LLM input format using existing pipeline
      const llmInput = this.historicalPipeline.convertToLLMFormat(
        batch,
        config?.preserveThreads ?? this.integrationConfig.preserveThreads,
      );

      // Step 3: Validate LLM input structure
      if (this.integrationConfig.enableValidation) {
        await this.validateLLMInput(llmInput);
      }

      // Step 4: Process through existing M02 LLM service
      const llmOutput = await this.llmService.processContent(llmInput);

      // Step 5: Validate LLM output structure
      if (this.integrationConfig.enableValidation) {
        await this.validateLLMOutput(llmOutput);
      }

      const processingTime = Date.now() - startTime;

      this.logger.info('Historical batch LLM processing completed', {
        batchId: batch.batchId,
        processingTime,
        mentionsExtracted: llmOutput.mentions.length,
        integration: 'historical-to-llm',
      });

      return llmOutput;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Historical batch LLM processing failed', {
        batchId: batch.batchId,
        processingTime,
        error: errorMessage,
        integration: 'historical-to-llm',
      });

      throw new HistoricalLlmIntegrationError(
        `Failed to process historical batch ${batch.batchId} through LLM pipeline: ${errorMessage}`,
        batch.batchId,
        error as Error,
      );
    }
  }

  /**
   * Test integration connectivity without processing real data
   * Validates that historical data can flow through LLM pipeline
   */
  async testIntegrationConnectivity(): Promise<{
    status: string;
    message: string;
    details?: Record<string, unknown>;
  }> {
    try {
      this.logger.info('Testing historical LLM integration connectivity');

      // Create minimal test batch
      const testBatch: HistoricalContentBatch = {
        submissions: [
          {
            id: 'test_submission',
            title: 'Test Integration - Franklin BBQ',
            author: 'test_user',
            subreddit: 'austinfood',
            created_utc: Math.floor(Date.now() / 1000),
            score: 1,
            url: 'https://reddit.com/test',
            num_comments: 1,
            selftext:
              'Franklin BBQ has amazing brisket for testing integration',
          },
        ],
        comments: [
          {
            id: 'test_comment',
            body: 'Their brisket is incredible',
            author: 'test_user',
            subreddit: 'austinfood',
            created_utc: Math.floor(Date.now() / 1000),
            score: 1,
            link_id: 't3_test_submission',
          },
        ],
        totalProcessed: 2,
        validItems: 2,
        invalidItems: 0,
        processingTime: 0,
        batchId: 'integration_test',
        errors: [],
      };

      // Test conversion to LLM format
      const llmInput = this.historicalPipeline.convertToLLMFormat(testBatch);

      // Test LLM processing (if enabled in config)
      if (this.integrationConfig.testWithLLM) {
        await this.llmService.processContent(llmInput);
      }

      return {
        status: 'connected',
        message: 'Historical LLM integration test passed',
        details: {
          batchConversion: 'success',
          llmProcessing: this.integrationConfig.testWithLLM
            ? 'success'
            : 'skipped',
          postsConverted: llmInput.posts.length,
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'Historical LLM integration test failed',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Get integration configuration (excluding sensitive data)
   */
  getIntegrationConfig(): Omit<HistoricalLlmIntegrationConfig, 'testWithLLM'> {
    return {
      enableValidation: this.integrationConfig.enableValidation,
      batchSizeLimit: this.integrationConfig.batchSizeLimit,
      preserveThreads: this.integrationConfig.preserveThreads,
    };
  }

  /**
   * Validate historical batch compatibility with LLM pipeline
   */
  private validateBatchCompatibility(batch: HistoricalContentBatch): void {
    const issues: string[] = [];

    // Check batch size limits
    if (batch.totalProcessed > this.integrationConfig.batchSizeLimit) {
      issues.push(
        `Batch size ${batch.totalProcessed} exceeds limit ${this.integrationConfig.batchSizeLimit}`,
      );
    }

    // Check for required data
    if (batch.submissions.length === 0 && batch.comments.length === 0) {
      issues.push('Batch contains no valid submissions or comments');
    }

    // Check error rate
    const errorRate = (batch.errors.length / batch.totalProcessed) * 100;
    if (errorRate > 50) {
      issues.push(
        `High error rate: ${errorRate.toFixed(1)}% (${batch.errors.length}/${batch.totalProcessed})`,
      );
    }

    if (issues.length > 0) {
      throw new HistoricalLlmIntegrationError(
        `Batch compatibility validation failed: ${issues.join(', ')}`,
        batch.batchId,
      );
    }
  }

  /**
   * Validate LLM input structure using existing service validators
   */
  private async validateLLMInput(input: LLMInputStructure): Promise<void> {
    const validationErrors = await this.llmService.validateInput(input);

    if (validationErrors.length > 0) {
      throw new HistoricalLlmIntegrationError(
        `LLM input validation failed: ${validationErrors.join(', ')}`,
        'validation',
      );
    }
  }

  /**
   * Validate LLM output structure using existing service validators
   */
  private async validateLLMOutput(output: LLMOutputStructure): Promise<void> {
    const validationErrors = await this.llmService.validateOutput(output);

    if (validationErrors.length > 0) {
      throw new HistoricalLlmIntegrationError(
        `LLM output validation failed: ${validationErrors.join(', ')}`,
        'validation',
      );
    }
  }

  /**
   * Load integration configuration from config service
   */
  private loadIntegrationConfig(): HistoricalLlmIntegrationConfig {
    return {
      enableValidation:
        this.configService.get<boolean>(
          'historicalLlmIntegration.enableValidation',
        ) ?? true,
      batchSizeLimit:
        this.configService.get<number>(
          'historicalLlmIntegration.batchSizeLimit',
        ) ?? 1000,
      preserveThreads:
        this.configService.get<boolean>(
          'historicalLlmIntegration.preserveThreads',
        ) ?? true,
      testWithLLM:
        this.configService.get<boolean>(
          'historicalLlmIntegration.testWithLLM',
        ) ?? false,
    };
  }
}

/**
 * Historical LLM Integration Configuration
 */
export interface HistoricalLlmIntegrationConfig {
  enableValidation: boolean;
  batchSizeLimit: number;
  preserveThreads: boolean;
  testWithLLM: boolean;
}

/**
 * Integration-specific error class
 */
export class HistoricalLlmIntegrationError extends Error {
  constructor(
    message: string,
    public readonly batchId?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'HistoricalLlmIntegrationError';
  }
}
