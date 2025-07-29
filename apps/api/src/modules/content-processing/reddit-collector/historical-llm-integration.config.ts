import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

/**
 * Historical LLM Integration Configuration Service
 *
 * Centralizes configuration management for routing historical archive data
 * through existing M02 LLM processing infrastructure.
 *
 * Implements PRD Section 6.1 configuration requirements for historical data integration.
 */
@Injectable()
export class HistoricalLlmIntegrationConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get complete integration configuration
   */
  getIntegrationConfig(): HistoricalLlmIntegrationConfig {
    return {
      // Validation settings
      enableValidation: this.getEnableValidation(),
      strictValidation: this.getStrictValidation(),

      // Processing limits
      batchSizeLimit: this.getBatchSizeLimit(),
      maxConcurrentBatches: this.getMaxConcurrentBatches(),

      // Thread and format settings
      preserveThreads: this.getPreserveThreads(),
      includeMetadata: this.getIncludeMetadata(),

      // Testing and debugging
      testWithLLM: this.getTestWithLLM(),
      enableDebugLogging: this.getEnableDebugLogging(),

      // Performance settings
      timeoutMs: this.getTimeoutMs(),
      retryAttempts: this.getRetryAttempts(),
    };
  }

  /**
   * Get routing configuration for different data types
   */
  getRoutingConfig(): HistoricalDataRoutingConfig {
    return {
      // Route submissions through LLM pipeline
      processSubmissions: this.configService.get<boolean>(
        'historicalLlmIntegration.routing.processSubmissions',
        true,
      ),

      // Route comments through LLM pipeline
      processComments: this.configService.get<boolean>(
        'historicalLlmIntegration.routing.processComments',
        true,
      ),

      // Minimum quality thresholds for routing
      minSubmissionScore: this.configService.get<number>(
        'historicalLlmIntegration.routing.minSubmissionScore',
        0,
      ),
      minCommentScore: this.configService.get<number>(
        'historicalLlmIntegration.routing.minCommentScore',
        0,
      ),

      // Content filtering
      excludeDeleted: this.configService.get<boolean>(
        'historicalLlmIntegration.routing.excludeDeleted',
        true,
      ),
      excludeRemoved: this.configService.get<boolean>(
        'historicalLlmIntegration.routing.excludeRemoved',
        true,
      ),

      // Target subreddits for processing
      targetSubreddits: this.configService.get<string[]>(
        'historicalLlmIntegration.routing.targetSubreddits',
        ['austinfood', 'FoodNYC'],
      ),
    };
  }

  /**
   * Get error handling configuration
   */
  getErrorHandlingConfig(): HistoricalErrorHandlingConfig {
    return {
      // Retry configuration
      enableRetries: this.configService.get<boolean>(
        'historicalLlmIntegration.errorHandling.enableRetries',
        true,
      ),
      maxRetries: this.getRetryAttempts(),
      retryDelayMs: this.configService.get<number>(
        'historicalLlmIntegration.errorHandling.retryDelayMs',
        1000,
      ),

      // Failure handling
      continueOnValidationError: this.configService.get<boolean>(
        'historicalLlmIntegration.errorHandling.continueOnValidationError',
        false,
      ),
      continueOnProcessingError: this.configService.get<boolean>(
        'historicalLlmIntegration.errorHandling.continueOnProcessingError',
        true,
      ),

      // Logging
      logAllErrors: this.configService.get<boolean>(
        'historicalLlmIntegration.errorHandling.logAllErrors',
        true,
      ),
      includeStackTrace: this.configService.get<boolean>(
        'historicalLlmIntegration.errorHandling.includeStackTrace',
        false,
      ),
    };
  }

  // Individual configuration getters

  private getEnableValidation(): boolean {
    return this.configService.get<boolean>(
      'historicalLlmIntegration.enableValidation',
      true,
    );
  }

  private getStrictValidation(): boolean {
    return this.configService.get<boolean>(
      'historicalLlmIntegration.strictValidation',
      false,
    );
  }

  private getBatchSizeLimit(): number {
    return this.configService.get<number>(
      'historicalLlmIntegration.batchSizeLimit',
      1000,
    );
  }

  private getMaxConcurrentBatches(): number {
    return this.configService.get<number>(
      'historicalLlmIntegration.maxConcurrentBatches',
      3,
    );
  }

  private getPreserveThreads(): boolean {
    return this.configService.get<boolean>(
      'historicalLlmIntegration.preserveThreads',
      true,
    );
  }

  private getIncludeMetadata(): boolean {
    return this.configService.get<boolean>(
      'historicalLlmIntegration.includeMetadata',
      true,
    );
  }

  private getTestWithLLM(): boolean {
    return this.configService.get<boolean>(
      'historicalLlmIntegration.testWithLLM',
      false,
    );
  }

  private getEnableDebugLogging(): boolean {
    return this.configService.get<boolean>(
      'historicalLlmIntegration.enableDebugLogging',
      false,
    );
  }

  private getTimeoutMs(): number {
    return this.configService.get<number>(
      'historicalLlmIntegration.timeoutMs',
      60000,
    );
  }

  private getRetryAttempts(): number {
    return this.configService.get<number>(
      'historicalLlmIntegration.retryAttempts',
      3,
    );
  }
}

/**
 * Complete integration configuration interface
 */
export interface HistoricalLlmIntegrationConfig {
  // Validation settings
  enableValidation: boolean;
  strictValidation: boolean;

  // Processing limits
  batchSizeLimit: number;
  maxConcurrentBatches: number;

  // Thread and format settings
  preserveThreads: boolean;
  includeMetadata: boolean;

  // Testing and debugging
  testWithLLM: boolean;
  enableDebugLogging: boolean;

  // Performance settings
  timeoutMs: number;
  retryAttempts: number;
}

/**
 * Data routing configuration interface
 */
export interface HistoricalDataRoutingConfig {
  // Content type routing
  processSubmissions: boolean;
  processComments: boolean;

  // Quality filtering
  minSubmissionScore: number;
  minCommentScore: number;

  // Content filtering
  excludeDeleted: boolean;
  excludeRemoved: boolean;

  // Subreddit targeting
  targetSubreddits: string[];
}

/**
 * Error handling configuration interface
 */
export interface HistoricalErrorHandlingConfig {
  // Retry configuration
  enableRetries: boolean;
  maxRetries: number;
  retryDelayMs: number;

  // Failure handling
  continueOnValidationError: boolean;
  continueOnProcessingError: boolean;

  // Logging
  logAllErrors: boolean;
  includeStackTrace: boolean;
}

/**
 * Default configuration values for development and testing
 */
export const DEFAULT_HISTORICAL_LLM_INTEGRATION_CONFIG: HistoricalLlmIntegrationConfig =
  {
    enableValidation: true,
    strictValidation: false,
    batchSizeLimit: 1000,
    maxConcurrentBatches: 3,
    preserveThreads: true,
    includeMetadata: true,
    testWithLLM: false,
    enableDebugLogging: false,
    timeoutMs: 60000,
    retryAttempts: 3,
  };

/**
 * Default routing configuration
 */
export const DEFAULT_HISTORICAL_DATA_ROUTING_CONFIG: HistoricalDataRoutingConfig =
  {
    processSubmissions: true,
    processComments: true,
    minSubmissionScore: 0,
    minCommentScore: 0,
    excludeDeleted: true,
    excludeRemoved: true,
    targetSubreddits: ['austinfood', 'FoodNYC'],
  };

/**
 * Default error handling configuration
 */
export const DEFAULT_HISTORICAL_ERROR_HANDLING_CONFIG: HistoricalErrorHandlingConfig =
  {
    enableRetries: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    continueOnValidationError: false,
    continueOnProcessingError: true,
    logAllErrors: true,
    includeStackTrace: false,
  };