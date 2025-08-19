import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import pLimit from 'p-limit';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMService } from './llm.service';
import { LLMInputStructure } from './llm.types';
import { ChunkResult, ChunkMetadata } from './llm-chunking.service';

interface PerformanceTestResult {
  workerCount: number;
  delayStrategy: string;
  delayMs: number;
  successRate: number;
  averageResponseTime: number;
  totalDuration: number;
  throughput: number; // requests per second
  rateLimit429Count: number;
  errorCount: number;
  burstRate: number; // calculated instantaneous rate
}

interface OptimalConfiguration {
  workerCount: number;
  delayStrategy: 'none' | 'linear' | 'exponential' | 'jittered';
  delayMs: number;
  expectedThroughput: number;
  expectedBurstRate: number;
  confidenceLevel: number;
}

/**
 * LLM Performance Optimizer Service
 * 
 * Systematically finds optimal concurrency and delay configurations
 * to maximize throughput while respecting API rate limits.
 */
@Injectable()
export class LLMPerformanceOptimizerService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit() {
    this.logger = this.loggerService.setContext('LLMPerformanceOptimizer');
  }

  /**
   * Find optimal worker count and delay configuration through systematic testing
   */
  async findOptimalConfiguration(
    testChunks: ChunkResult,
    llmService: LLMService,
    options: {
      maxWorkers?: number;
      testDurationLimitMs?: number;
      confidenceThreshold?: number;
    } = {}
  ): Promise<OptimalConfiguration> {
    const {
      maxWorkers = 20,
      testDurationLimitMs = 300000, // 5 minutes max testing
      confidenceThreshold = 0.95
    } = options;

    this.logger.info('Starting systematic performance optimization', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'find_optimal_configuration',
      maxWorkers,
      testChunks: testChunks.chunks.length,
      testDurationLimitMs
    });

    const testResults: PerformanceTestResult[] = [];
    const startTime = Date.now();

    // Test configurations in order of likelihood to succeed
    const testConfigurations = this.generateTestConfigurations(maxWorkers);

    for (const config of testConfigurations) {
      if (Date.now() - startTime > testDurationLimitMs) {
        this.logger.warn('Test duration limit reached, stopping optimization', {
          correlationId: CorrelationUtils.getCorrelationId(),
          elapsedMs: Date.now() - startTime,
          configurationsTested: testResults.length
        });
        break;
      }

      this.logger.info('Testing configuration', {
        correlationId: CorrelationUtils.getCorrelationId(),
        config
      });

      try {
        const result = await this.testConfiguration(config, testChunks, llmService);
        testResults.push(result);

        this.logger.info('Configuration test completed', {
          correlationId: CorrelationUtils.getCorrelationId(),
          config,
          successRate: result.successRate,
          throughput: result.throughput,
          burstRate: result.burstRate,
          errors: result.errorCount
        });

        // Stop testing if we hit rate limits - higher configs will likely fail too
        if (result.rateLimit429Count > 0) {
          this.logger.info('Rate limits detected, skipping higher worker counts', {
            correlationId: CorrelationUtils.getCorrelationId(),
            workerCount: config.workerCount
          });
          break;
        }

      } catch (error) {
        this.logger.error('Configuration test failed', {
          correlationId: CorrelationUtils.getCorrelationId(),
          config,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Analyze results and find optimal configuration
    const optimal = this.analyzeResults(testResults, confidenceThreshold);

    this.logger.info('Optimization completed', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'find_optimal_configuration',
      totalTestsRun: testResults.length,
      optimalConfig: optimal,
      totalDurationMs: Date.now() - startTime
    });

    return optimal;
  }

  /**
   * Generate test configurations in order of likelihood to succeed
   */
  private generateTestConfigurations(maxWorkers: number): Array<{
    workerCount: number;
    delayStrategy: 'none' | 'linear' | 'exponential' | 'jittered';
    delayMs: number;
  }> {
    const configs: Array<{
      workerCount: number;
      delayStrategy: 'none' | 'linear' | 'exponential' | 'jittered';
      delayMs: number;
    }> = [];

    // Test different worker counts
    const workerCounts = [4, 6, 8, 10, 12, 16, 20].filter(w => w <= maxWorkers);
    
    for (const workerCount of workerCounts) {
      // Test no delay first (baseline)
      configs.push({
        workerCount,
        delayStrategy: 'none' as const,
        delayMs: 0
      });

      // Test linear delays if worker count >= 8
      if (workerCount >= 8) {
        const linearDelays = [25, 50, 100, 200];
        for (const delayMs of linearDelays) {
          configs.push({
            workerCount,
            delayStrategy: 'linear' as const,
            delayMs
          });
        }

        // Test exponential delays for higher worker counts
        if (workerCount >= 12) {
          configs.push({
            workerCount,
            delayStrategy: 'exponential' as const,
            delayMs: 25 // base delay, will be exponentially increased
          });
        }

        // Test jittered delays for highest worker counts
        if (workerCount >= 16) {
          configs.push({
            workerCount,
            delayStrategy: 'jittered' as const,
            delayMs: 50 // base delay with jitter
          });
        }
      }
    }

    return configs;
  }

  /**
   * Test a specific configuration
   */
  private async testConfiguration(
    config: {
      workerCount: number;
      delayStrategy: 'none' | 'linear' | 'exponential' | 'jittered';
      delayMs: number;
    },
    chunkData: ChunkResult,
    llmService: LLMService
  ): Promise<PerformanceTestResult> {
    const startTime = Date.now();
    const limit = pLimit(config.workerCount);
    
    // Use subset of chunks for testing (max 50 to keep tests reasonable)
    const testChunks = chunkData.chunks.slice(0, Math.min(50, chunkData.chunks.length));
    const testMetadata = chunkData.metadata.slice(0, testChunks.length);

    let successCount = 0;
    let errorCount = 0;
    let rateLimit429Count = 0;
    const responseTimes: number[] = [];
    const requestStartTimes: number[] = [];

    const promises = testChunks.map((chunk, index) =>
      limit(async () => {
        // Apply delay strategy
        await this.applyDelayStrategy(config.delayStrategy, config.delayMs, index);
        
        const requestStart = Date.now();
        requestStartTimes.push(requestStart);

        try {
          const result = await llmService.processContent(chunk);
          const duration = Date.now() - requestStart;
          responseTimes.push(duration);
          successCount++;
          return result;
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            rateLimit429Count++;
          }
          throw error;
        }
      })
    );

    // Wait for all to complete (or fail)
    const results = await Promise.allSettled(promises);
    const totalDuration = Date.now() - startTime;

    // Calculate burst rate from actual request timing
    const burstRate = this.calculateBurstRate(requestStartTimes, config.workerCount);

    return {
      workerCount: config.workerCount,
      delayStrategy: config.delayStrategy,
      delayMs: config.delayMs,
      successRate: (successCount / testChunks.length) * 100,
      averageResponseTime: responseTimes.length > 0 
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
        : 0,
      totalDuration,
      throughput: (successCount / totalDuration) * 1000, // requests per second
      rateLimit429Count,
      errorCount,
      burstRate
    };
  }

  /**
   * Apply delay strategy before starting request
   */
  private async applyDelayStrategy(
    strategy: 'none' | 'linear' | 'exponential' | 'jittered',
    baseDelayMs: number,
    workerIndex: number
  ): Promise<void> {
    if (strategy === 'none' || baseDelayMs === 0) {
      return;
    }

    let delayMs = 0;

    switch (strategy) {
      case 'linear':
        delayMs = workerIndex * baseDelayMs;
        break;
      
      case 'exponential':
        delayMs = baseDelayMs * Math.pow(1.5, workerIndex);
        break;
      
      case 'jittered':
        const jitter = Math.random() * baseDelayMs; // 0 to baseDelayMs
        delayMs = (workerIndex * baseDelayMs) + jitter;
        break;
    }

    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Calculate actual burst rate from request start times
   */
  private calculateBurstRate(requestStartTimes: number[], workerCount: number): number {
    if (requestStartTimes.length < 2) return 0;

    // Sort start times
    const sortedTimes = [...requestStartTimes].sort((a, b) => a - b);
    
    // Find the maximum number of requests in any 1-second window
    let maxRequestsInWindow = 0;
    
    for (let i = 0; i < sortedTimes.length; i++) {
      const windowStart = sortedTimes[i];
      const windowEnd = windowStart + 1000; // 1 second window
      
      let requestsInWindow = 0;
      for (let j = i; j < sortedTimes.length && sortedTimes[j] <= windowEnd; j++) {
        requestsInWindow++;
      }
      
      maxRequestsInWindow = Math.max(maxRequestsInWindow, requestsInWindow);
    }

    return maxRequestsInWindow; // requests per second
  }

  /**
   * Analyze test results and find optimal configuration
   */
  private analyzeResults(
    results: PerformanceTestResult[],
    confidenceThreshold: number
  ): OptimalConfiguration {
    if (results.length === 0) {
      throw new Error('No test results available for analysis');
    }

    // Filter to successful configurations (high success rate, no rate limits)
    const viableConfigs = results.filter(r => 
      r.successRate >= 95 && 
      r.rateLimit429Count === 0 &&
      r.errorCount <= 1 // Allow minimal errors
    );

    if (viableConfigs.length === 0) {
      // Fall back to best available if no perfect configs
      const bestAvailable = results
        .sort((a, b) => b.successRate - a.successRate)[0];
      
      this.logger.warn('No perfect configurations found, using best available', {
        correlationId: CorrelationUtils.getCorrelationId(),
        bestConfig: bestAvailable
      });

      return {
        workerCount: bestAvailable.workerCount,
        delayStrategy: bestAvailable.delayStrategy as any,
        delayMs: bestAvailable.delayMs,
        expectedThroughput: bestAvailable.throughput,
        expectedBurstRate: bestAvailable.burstRate,
        confidenceLevel: bestAvailable.successRate / 100
      };
    }

    // Find highest throughput among viable configs
    const optimal = viableConfigs
      .sort((a, b) => b.throughput - a.throughput)[0];

    return {
      workerCount: optimal.workerCount,
      delayStrategy: optimal.delayStrategy as any,
      delayMs: optimal.delayMs,
      expectedThroughput: optimal.throughput,
      expectedBurstRate: optimal.burstRate,
      confidenceLevel: optimal.successRate / 100
    };
  }

  /**
   * Get current performance statistics for monitoring
   */
  getOptimizationSummary(results: PerformanceTestResult[]): {
    totalConfigurationsTested: number;
    bestThroughput: number;
    bestWorkerCount: number;
    recommendedConfiguration: PerformanceTestResult | null;
  } {
    if (results.length === 0) {
      return {
        totalConfigurationsTested: 0,
        bestThroughput: 0,
        bestWorkerCount: 0,
        recommendedConfiguration: null
      };
    }

    const viable = results.filter(r => 
      r.successRate >= 95 && r.rateLimit429Count === 0
    );
    
    const best = viable.length > 0 
      ? viable.sort((a, b) => b.throughput - a.throughput)[0]
      : results.sort((a, b) => b.successRate - a.successRate)[0];

    return {
      totalConfigurationsTested: results.length,
      bestThroughput: best.throughput,
      bestWorkerCount: best.workerCount,
      recommendedConfiguration: best
    };
  }
}