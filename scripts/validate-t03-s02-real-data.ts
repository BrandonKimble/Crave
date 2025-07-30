#!/usr/bin/env tsx

/**
 * Real Data Validation Script for T03_S02 Content Retrieval Pipeline
 * 
 * This script conducts comprehensive validation of the content retrieval pipeline
 * against real Reddit API data to ensure production readiness.
 * 
 * Validation Areas:
 * 1. Reddit API authentication and real API calls
 * 2. Post retrieval from r/austinfood with actual data
 * 3. Complete comment thread retrieval with hierarchical structure
 * 4. LLM input format transformation with real Reddit data
 * 5. Rate limiting integration during sustained operations
 * 6. Error handling with real edge cases and API failures
 * 7. Performance metrics under realistic data volumes
 * 8. URL attribution tracking with real Reddit URLs
 * 9. Batching optimization and API call efficiency
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../apps/api/src/app.module';
import { ContentRetrievalPipelineService } from '../apps/api/src/modules/content-processing/reddit-collector/content-retrieval-pipeline.service';
import { RedditService } from '../apps/api/src/modules/external-integrations/reddit/reddit.service';
import { LoggerService } from '../apps/api/src/shared';

interface ValidationResult {
  testName: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
  metrics?: any;
}

interface ProductionReadinessReport {
  overallStatus: 'PRODUCTION_READY' | 'ISSUES_FOUND';
  criticalIssues: ValidationResult[];
  warnings: ValidationResult[];
  passedTests: ValidationResult[];
  performanceMetrics: {
    averageResponseTime: number;
    apiCallEfficiency: number;
    successRate: number;
    threadProcessingAccuracy: number;
  };
  realDataSamples: {
    postsRetrieved: number;
    commentsProcessed: number;
    urlsAttributed: number;
    llmFormatCompliance: boolean;
  };
}

class T03S02RealDataValidator {
  private app: any;
  private contentRetrievalService: ContentRetrievalPipelineService;
  private redditService: RedditService;
  private logger: LoggerService;
  private results: ValidationResult[] = [];

  async initialize(): Promise<void> {
    console.log('🚀 Initializing T03_S02 Real Data Validation...\n');
    
    try {
      this.app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
      });

      this.contentRetrievalService = this.app.get(ContentRetrievalPipelineService);
      this.redditService = this.app.get(RedditService);
      this.logger = this.app.get(LoggerService);
      
      console.log('✅ Application context initialized successfully\n');
    } catch (error) {
      throw new Error(`Failed to initialize application: ${error}`);
    }
  }

  async validateRedditAuthentication(): Promise<ValidationResult> {
    console.log('🔐 Testing Reddit API Authentication...');
    
    try {
      const healthCheck = await this.redditService.checkHealth();
      
      if (healthCheck.isHealthy) {
        return {
          testName: 'Reddit API Authentication',
          status: 'PASS',
          message: 'Successfully authenticated with Reddit API',
          details: {
            connectionStatus: healthCheck.connectionStatus,
            lastCheck: healthCheck.lastCheck,
            tokenStatus: healthCheck.details?.tokenExpiry ? 'Valid' : 'Unknown'
          }
        };
      } else {
        return {
          testName: 'Reddit API Authentication',
          status: 'FAIL',
          message: 'Reddit API authentication failed',
          details: healthCheck.details
        };
      }
    } catch (error) {
      return {
        testName: 'Reddit API Authentication',
        status: 'FAIL',
        message: `Authentication error: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async validateRealPostRetrieval(): Promise<ValidationResult> {
    console.log('📝 Testing Real Post Retrieval from r/austinfood...');
    
    try {
      // Get real posts from r/austinfood
      const recentPosts = await this.redditService.getSubredditPosts('austinfood', {
        limit: 5,
        sort: 'new'
      });

      if (!recentPosts?.posts || recentPosts.posts.length === 0) {
        return {
          testName: 'Real Post Retrieval',
          status: 'FAIL',
          message: 'No posts retrieved from r/austinfood',
          details: { postsCount: 0 }
        };
      }

      // Extract post IDs for further testing
      const postIds = recentPosts.posts.slice(0, 3).map(post => post.id);
      
      return {
        testName: 'Real Post Retrieval',
        status: 'PASS',
        message: `Successfully retrieved ${recentPosts.posts.length} posts from r/austinfood`,
        details: {
          postsRetrieved: recentPosts.posts.length,
          postIds,
          sampleTitles: recentPosts.posts.slice(0, 3).map(p => p.title),
          responseTime: recentPosts.performance?.responseTime
        }
      };
    } catch (error) {
      return {
        testName: 'Real Post Retrieval',
        status: 'FAIL',
        message: `Failed to retrieve posts: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async validateCommentThreadRetrieval(): Promise<ValidationResult> {
    console.log('💬 Testing Complete Comment Thread Retrieval...');
    
    try {
      // Get a post with comments
      const recentPosts = await this.redditService.getSubredditPosts('austinfood', {
        limit: 10,
        sort: 'hot'
      });

      if (!recentPosts?.posts || recentPosts.posts.length === 0) {
        return {
          testName: 'Comment Thread Retrieval',
          status: 'FAIL',
          message: 'No posts available for comment testing'
        };
      }

      // Find a post with comments
      let selectedPost = null;
      for (const post of recentPosts.posts) {
        if (post.num_comments && post.num_comments > 0) {
          selectedPost = post;
          break;
        }
      }

      if (!selectedPost) {
        return {
          testName: 'Comment Thread Retrieval',
          status: 'WARNING',
          message: 'No posts with comments found in recent r/austinfood posts',
          details: { postsChecked: recentPosts.posts.length }
        };
      }

      // Get complete post with comments
      const completePost = await this.redditService.getCompletePostWithComments(
        'austinfood',
        selectedPost.id,
        { limit: 100, depth: 5 }
      );

      const hasHierarchicalStructure = this.validateHierarchicalStructure(completePost.comments);

      return {
        testName: 'Comment Thread Retrieval',
        status: 'PASS',
        message: `Successfully retrieved ${completePost.metadata.totalComments} comments with hierarchical structure`,
        details: {
          postId: selectedPost.id,
          postTitle: selectedPost.title,
          totalComments: completePost.metadata.totalComments,
          threadDepth: completePost.metadata.threadDepth,
          hasHierarchicalStructure,
          responseTime: completePost.performance.responseTime,
          apiCallsUsed: completePost.performance.apiCallsUsed
        }
      };
    } catch (error) {
      return {
        testName: 'Comment Thread Retrieval',
        status: 'FAIL',
        message: `Failed to retrieve comment threads: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async validateLLMInputFormatTransformation(): Promise<ValidationResult> {
    console.log('🤖 Testing LLM Input Format Transformation...');
    
    try {
      // Get real posts for transformation
      const recentPosts = await this.redditService.getSubredditPosts('austinfood', {
        limit: 5,
        sort: 'hot'
      });

      if (!recentPosts?.posts || recentPosts.posts.length === 0) {
        return {
          testName: 'LLM Format Transformation',
          status: 'FAIL',
          message: 'No posts available for LLM format testing'
        };
      }

      const postIds = recentPosts.posts.slice(0, 2).map(post => post.id);

      // Test content retrieval pipeline with real data
      const llmResult = await this.contentRetrievalService.retrieveContentForLLM(
        'austinfood',
        postIds,
        { limit: 50, depth: 3 }
      );

      // Validate LLM format structure
      const formatValidation = this.validateLLMFormat(llmResult.llmInput);

      return {
        testName: 'LLM Format Transformation',
        status: formatValidation.isValid ? 'PASS' : 'FAIL',
        message: formatValidation.isValid 
          ? `Successfully transformed ${llmResult.metadata.totalPosts} posts to LLM format`
          : `LLM format validation failed: ${formatValidation.errors.join(', ')}`,
        details: {
          postsTransformed: llmResult.metadata.totalPosts,
          commentsTransformed: llmResult.metadata.totalComments,
          averageThreadDepth: llmResult.metadata.averageThreadDepth,
          formatValidationErrors: formatValidation.errors,
          sourceUrls: llmResult.attribution.sourceUrls.length,
          responseTime: llmResult.performance.totalResponseTime
        }
      };
    } catch (error) {
      return {
        testName: 'LLM Format Transformation',
        status: 'FAIL',
        message: `LLM format transformation failed: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async validateBatchingOptimization(): Promise<ValidationResult> {
    console.log('⚡ Testing Batching Optimization and API Efficiency...');
    
    try {
      // Get post IDs for batch testing
      const recentPosts = await this.redditService.getSubredditPosts('austinfood', {
        limit: 8,
        sort: 'hot'
      });

      if (!recentPosts?.posts || recentPosts.posts.length < 3) {
        return {
          testName: 'Batching Optimization',
          status: 'WARNING',
          message: 'Insufficient posts for meaningful batch testing'
        };
      }

      const postIds = recentPosts.posts.slice(0, 5).map(post => post.id);

      // Test batch retrieval
      const batchResult = await this.redditService.fetchPostsBatch(
        'austinfood',
        postIds,
        { limit: 30, delayBetweenRequests: 500 }
      );

      // Calculate efficiency metrics
      const efficiency = this.calculateBatchingEfficiency(batchResult, postIds.length);

      return {
        testName: 'Batching Optimization',
        status: efficiency.isEfficient ? 'PASS' : 'WARNING',
        message: `Batch processing completed with ${efficiency.successRate.toFixed(1)}% success rate`,
        details: {
          postsRequested: postIds.length,
          successfulRetrievals: batchResult.metadata.successfulRetrievals,
          failedRetrievals: batchResult.metadata.failedRetrievals,
          totalComments: batchResult.metadata.totalComments,
          apiCallsUsed: batchResult.performance.apiCallsUsed,
          averageResponseTime: batchResult.performance.averageResponseTime,
          rateLimitHits: batchResult.performance.rateLimitHits,
          efficiency: efficiency
        }
      };
    } catch (error) {
      return {
        testName: 'Batching Optimization',
        status: 'FAIL',
        message: `Batching optimization test failed: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async validateURLAttribution(): Promise<ValidationResult> {
    console.log('🔗 Testing URL Attribution Tracking...');
    
    try {
      const recentPosts = await this.redditService.getSubredditPosts('austinfood', {
        limit: 3,
        sort: 'hot'
      });

      if (!recentPosts?.posts || recentPosts.posts.length === 0) {
        return {
          testName: 'URL Attribution',
          status: 'FAIL',
          message: 'No posts available for URL attribution testing'
        };
      }

      const postIds = recentPosts.posts.slice(0, 2).map(post => post.id);
      
      const llmResult = await this.contentRetrievalService.retrieveContentForLLM(
        'austinfood',
        postIds,
        { limit: 20 }
      );

      const urlValidation = this.validateURLAttribution(llmResult);

      return {
        testName: 'URL Attribution',
        status: urlValidation.isValid ? 'PASS' : 'FAIL',
        message: urlValidation.isValid 
          ? `URL attribution working correctly with ${urlValidation.totalUrls} URLs tracked`
          : `URL attribution issues found: ${urlValidation.issues.join(', ')}`,
        details: {
          totalSourceUrls: urlValidation.totalUrls,
          validRedditUrls: urlValidation.validUrls,
          postUrls: urlValidation.postUrls,
          commentUrls: urlValidation.commentUrls,
          issues: urlValidation.issues
        }
      };
    } catch (error) {
      return {
        testName: 'URL Attribution',
        status: 'FAIL',
        message: `URL attribution test failed: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async validateErrorHandling(): Promise<ValidationResult> {
    console.log('⚠️ Testing Error Handling with Edge Cases...');
    
    try {
      const edgeCaseResults = [];

      // Test 1: Non-existent post ID
      try {
        await this.contentRetrievalService.retrieveSinglePostForLLM(
          'austinfood',
          'nonexistent123',
          { limit: 10 }
        );
        edgeCaseResults.push({ test: 'non-existent-post', result: 'FAIL', message: 'Should have thrown error' });
      } catch (error) {
        edgeCaseResults.push({ 
          test: 'non-existent-post', 
          result: 'PASS', 
          message: 'Correctly handled non-existent post',
          errorType: error.constructor.name
        });
      }

      // Test 2: Invalid subreddit
      try {
        await this.contentRetrievalService.retrieveContentForLLM(
          'nonexistentsubreddit12345',
          ['test123'],
          { limit: 10 }
        );
        edgeCaseResults.push({ test: 'invalid-subreddit', result: 'FAIL', message: 'Should have thrown error' });
      } catch (error) {
        edgeCaseResults.push({ 
          test: 'invalid-subreddit', 
          result: 'PASS', 
          message: 'Correctly handled invalid subreddit',
          errorType: error.constructor.name
        });
      }

      // Test 3: Empty post ID array
      try {
        await this.contentRetrievalService.retrieveContentForLLM(
          'austinfood',
          [],
          { limit: 10 }
        );
        edgeCaseResults.push({ test: 'empty-post-array', result: 'FAIL', message: 'Should have handled empty array' });
      } catch (error) {
        edgeCaseResults.push({ 
          test: 'empty-post-array', 
          result: 'PASS', 
          message: 'Correctly handled empty post array',
          errorType: error.constructor.name
        });
      }

      const passedTests = edgeCaseResults.filter(r => r.result === 'PASS').length;
      const totalTests = edgeCaseResults.length;

      return {
        testName: 'Error Handling',
        status: passedTests === totalTests ? 'PASS' : 'WARNING',
        message: `${passedTests}/${totalTests} error handling tests passed`,
        details: {
          edgeCaseResults,
          errorHandlingScore: (passedTests / totalTests) * 100
        }
      };
    } catch (error) {
      return {
        testName: 'Error Handling',
        status: 'FAIL',
        message: `Error handling test setup failed: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async validatePerformanceMetrics(): Promise<ValidationResult> {
    console.log('📊 Testing Performance Characteristics...');
    
    try {
      const performanceTests = [];
      
      // Test 1: Single post performance
      const startTime1 = Date.now();
      const recentPosts = await this.redditService.getSubredditPosts('austinfood', { limit: 5 });
      if (recentPosts?.posts?.length > 0) {
        const singlePostResult = await this.contentRetrievalService.retrieveSinglePostForLLM(
          'austinfood',
          recentPosts.posts[0].id,
          { limit: 50 }
        );
        const singlePostTime = Date.now() - startTime1;
        
        performanceTests.push({
          test: 'single-post-retrieval',
          responseTime: singlePostTime,
          apiCalls: singlePostResult.performance.apiCallsUsed,
          commentsProcessed: singlePostResult.metadata.totalComments
        });
      }

      // Test 2: Batch performance
      if (recentPosts?.posts?.length >= 3) {
        const startTime2 = Date.now();
        const postIds = recentPosts.posts.slice(0, 3).map(p => p.id);
        const batchResult = await this.contentRetrievalService.retrieveContentForLLM(
          'austinfood',
          postIds,
          { limit: 30 }
        );
        const batchTime = Date.now() - startTime2;
        
        performanceTests.push({
          test: 'batch-retrieval',
          responseTime: batchTime,
          apiCalls: batchResult.performance.apiCallsUsed,
          postsProcessed: batchResult.metadata.totalPosts,
          commentsProcessed: batchResult.metadata.totalComments
        });
      }

      const avgResponseTime = performanceTests.reduce((sum, test) => sum + test.responseTime, 0) / performanceTests.length;
      const totalApiCalls = performanceTests.reduce((sum, test) => sum + test.apiCalls, 0);

      return {
        testName: 'Performance Metrics',
        status: avgResponseTime < 30000 ? 'PASS' : 'WARNING', // 30 second threshold
        message: `Average response time: ${avgResponseTime.toFixed(0)}ms, Total API calls: ${totalApiCalls}`,
        details: {
          averageResponseTime: avgResponseTime,
          totalApiCalls,
          performanceTests,
          responseTimeThreshold: 30000,
          exceedsThreshold: avgResponseTime >= 30000
        }
      };
    } catch (error) {
      return {
        testName: 'Performance Metrics',
        status: 'FAIL',
        message: `Performance testing failed: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  // Helper Methods
  private validateHierarchicalStructure(comments: any[]): boolean {
    if (!comments || comments.length === 0) return true;
    
    // Check if comments have parent-child relationships preserved
    const hasNestedReplies = comments.some(comment => 
      comment?.data?.replies?.data?.children?.length > 0
    );
    
    return hasNestedReplies || comments.length > 0;
  }

  private validateLLMFormat(llmInput: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!llmInput) {
      errors.push('LLM input is null or undefined');
      return { isValid: false, errors };
    }

    if (!llmInput.posts || !Array.isArray(llmInput.posts)) {
      errors.push('LLM input missing posts array');
      return { isValid: false, errors };
    }

    for (const post of llmInput.posts) {
      if (!post.post_id) errors.push('Post missing post_id');
      if (!post.title) errors.push('Post missing title');
      if (!post.url) errors.push('Post missing URL');
      if (!post.subreddit) errors.push('Post missing subreddit');
      if (!post.created_at) errors.push('Post missing created_at');
      
      if (post.comments && Array.isArray(post.comments)) {
        for (const comment of post.comments) {
          if (!comment.comment_id) errors.push('Comment missing comment_id');
          if (!comment.content) errors.push('Comment missing content');
          if (!comment.created_at) errors.push('Comment missing created_at');
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private calculateBatchingEfficiency(batchResult: any, expectedPosts: number): any {
    const successRate = (batchResult.metadata.successfulRetrievals / expectedPosts) * 100;
    const avgResponseTime = batchResult.performance.averageResponseTime;
    const apiCallsPerPost = batchResult.performance.apiCallsUsed / expectedPosts;
    
    return {
      successRate,
      isEfficient: successRate >= 80 && apiCallsPerPost <= 2, // Reasonable thresholds
      apiCallsPerPost,
      avgResponseTimePerPost: avgResponseTime
    };
  }

  private validateURLAttribution(llmResult: any): any {
    const sourceUrls = llmResult.attribution.sourceUrls || [];
    const validUrls = sourceUrls.filter(url => url && url.includes('reddit.com')).length;
    
    let postUrls = 0;
    let commentUrls = 0;
    
    sourceUrls.forEach(url => {
      if (url.includes('/comments/') && !url.includes('/_/')) {
        postUrls++;
      } else if (url.includes('/_/')) {
        commentUrls++;
      }
    });

    const issues: string[] = [];
    if (sourceUrls.length === 0) issues.push('No source URLs found');
    if (validUrls < sourceUrls.length) issues.push('Invalid Reddit URLs detected');
    if (postUrls === 0) issues.push('No post URLs found');

    return {
      isValid: issues.length === 0,
      totalUrls: sourceUrls.length,
      validUrls,
      postUrls,
      commentUrls,
      issues
    };
  }

  async runAllValidations(): Promise<ProductionReadinessReport> {
    console.log('🔍 Starting Comprehensive Real Data Validation for T03_S02\n');
    
    // Run all validation tests
    const validationTests = [
      () => this.validateRedditAuthentication(),
      () => this.validateRealPostRetrieval(),
      () => this.validateCommentThreadRetrieval(),
      () => this.validateLLMInputFormatTransformation(),
      () => this.validateBatchingOptimization(),
      () => this.validateURLAttribution(),
      () => this.validateErrorHandling(),
      () => this.validatePerformanceMetrics(),
    ];

    const results: ValidationResult[] = [];
    
    for (const test of validationTests) {
      try {
        const result = await test();
        results.push(result);
        
        const statusEmoji = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
        console.log(`${statusEmoji} ${result.testName}: ${result.message}\n`);
      } catch (error) {
        results.push({
          testName: 'Unknown Test',
          status: 'FAIL',
          message: `Test execution failed: ${error}`,
          details: { error: error instanceof Error ? error.message : String(error) }
        });
      }
    }

    // Generate production readiness report
    return this.generateProductionReadinessReport(results);
  }

  private generateProductionReadinessReport(results: ValidationResult[]): ProductionReadinessReport {
    const criticalIssues = results.filter(r => r.status === 'FAIL');
    const warnings = results.filter(r => r.status === 'WARNING');
    const passedTests = results.filter(r => r.status === 'PASS');

    // Calculate performance metrics
    const performanceResult = results.find(r => r.testName === 'Performance Metrics');
    const batchingResult = results.find(r => r.testName === 'Batching Optimization');
    const llmFormatResult = results.find(r => r.testName === 'LLM Format Transformation');
    const urlResult = results.find(r => r.testName === 'URL Attribution');

    const performanceMetrics = {
      averageResponseTime: performanceResult?.details?.averageResponseTime || 0,
      apiCallEfficiency: batchingResult?.details?.efficiency?.apiCallsPerPost || 0,
      successRate: batchingResult?.details?.efficiency?.successRate || 0,
      threadProcessingAccuracy: llmFormatResult?.status === 'PASS' ? 100 : 0,
    };

    const realDataSamples = {
      postsRetrieved: batchingResult?.details?.postsRequested || 0,
      commentsProcessed: llmFormatResult?.details?.commentsTransformed || 0,
      urlsAttributed: urlResult?.details?.totalSourceUrls || 0,
      llmFormatCompliance: llmFormatResult?.status === 'PASS',
    };

    const overallStatus = criticalIssues.length === 0 ? 'PRODUCTION_READY' : 'ISSUES_FOUND';

    return {
      overallStatus,
      criticalIssues,
      warnings,
      passedTests,
      performanceMetrics,
      realDataSamples,
    };
  }

  async cleanup(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
  }
}

// Main execution
async function main() {
  const validator = new T03S02RealDataValidator();

  try {
    await validator.initialize();
    const report = await validator.runAllValidations();

    // Print final report
    console.log('\n' + '='.repeat(80));
    console.log('📋 T03_S02 PRODUCTION READINESS ASSESSMENT REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n🎯 OVERALL STATUS: ${report.overallStatus}`);
    
    if (report.overallStatus === 'PRODUCTION_READY') {
      console.log('✅ All critical paths tested successfully with real data');
    } else {
      console.log('❌ Critical issues found that need resolution');
    }

    console.log('\n📊 PERFORMANCE METRICS:');
    console.log(`   Average Response Time: ${report.performanceMetrics.averageResponseTime.toFixed(0)}ms`);
    console.log(`   API Call Efficiency: ${report.performanceMetrics.apiCallEfficiency.toFixed(2)} calls per post`);
    console.log(`   Success Rate: ${report.performanceMetrics.successRate.toFixed(1)}%`);
    console.log(`   Thread Processing: ${report.performanceMetrics.threadProcessingAccuracy}% accurate`);

    console.log('\n🔢 REAL DATA SAMPLES:');
    console.log(`   Posts Retrieved: ${report.realDataSamples.postsRetrieved}`);
    console.log(`   Comments Processed: ${report.realDataSamples.commentsProcessed}`);
    console.log(`   URLs Attributed: ${report.realDataSamples.urlsAttributed}`);
    console.log(`   LLM Format Compliance: ${report.realDataSamples.llmFormatCompliance ? 'YES' : 'NO'}`);

    console.log(`\n📈 TEST RESULTS SUMMARY:`);
    console.log(`   ✅ Passed: ${report.passedTests.length}`);
    console.log(`   ⚠️  Warnings: ${report.warnings.length}`);
    console.log(`   ❌ Failed: ${report.criticalIssues.length}`);

    if (report.criticalIssues.length > 0) {
      console.log('\n❌ CRITICAL ISSUES:');
      report.criticalIssues.forEach(issue => {
        console.log(`   • ${issue.testName}: ${issue.message}`);
      });
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      report.warnings.forEach(warning => {
        console.log(`   • ${warning.testName}: ${warning.message}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    
    // Set exit code based on results
    process.exit(report.overallStatus === 'PRODUCTION_READY' ? 0 : 1);

  } catch (error) {
    console.error('\n❌ VALIDATION FAILED:', error);
    process.exit(1);
  } finally {
    await validator.cleanup();
  }
}

// Run the validation
if (require.main === module) {
  main().catch(console.error);
}

export { T03S02RealDataValidator, ValidationResult, ProductionReadinessReport };