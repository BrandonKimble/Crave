/**
 * Quick Optimization Test with Mock LLM Service
 * 
 * Simulates optimization results without making real API calls
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

// Mock LLM Service for testing
class MockLLMService {
  private requestCount = 0;
  private startTime = Date.now();

  async processContent(chunk: any): Promise<any> {
    this.requestCount++;
    
    // Simulate variable response times (1-3 seconds)
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simulate rate limiting for high burst scenarios
    const timeSinceStart = Date.now() - this.startTime;
    const currentRate = this.requestCount / (timeSinceStart / 1000);
    
    // Simulate rate limit errors if burst rate > 100 req/sec
    if (currentRate > 100) {
      throw new Error('LLM API rate limit exceeded');
    }
    
    // Return mock successful response
    return {
      mentions: [
        {
          temp_id: `mention_${this.requestCount}`,
          restaurant_normalized_name: 'test restaurant',
          restaurant_original_text: 'Test Restaurant',
          restaurant_temp_id: 'rest_1',
          general_praise: true,
          source_type: 'comment' as const,
          source_id: 't1_test',
          source_content: 'Test content',
          source_ups: 5,
          source_url: 'https://reddit.com/test',
          source_created_at: new Date().toISOString()
        }
      ]
    };
  }
}

async function quickOptimizationTest() {
  console.log('🚀 QUICK OPTIMIZATION TEST');
  console.log('===========================');
  console.log('⏰ Started at:', new Date().toISOString());
  console.log('');

  const mockLLMService = new MockLLMService();

  // Create mock chunk data (20 chunks)
  const mockChunks = Array.from({ length: 20 }, (_, i) => ({
    posts: [{
      id: `mock-post-${i}`,
      title: `Mock Post ${i}`,
      content: `Mock content ${i}`,
      subreddit: 'test',
      author: 'test-user',
      url: `https://reddit.com/mock-${i}`,
      score: 10,
      created_at: new Date().toISOString(),
      comments: []
    }]
  }));

  const mockMetadata = mockChunks.map((_, i) => ({
    chunkId: `mock-chunk-${i}`,
    commentCount: 1,
    rootCommentScore: 5,
    estimatedProcessingTime: 2000,
    threadRootId: `mock-root-${i}`
  }));

  const mockChunkData = {
    chunks: mockChunks,
    metadata: mockMetadata
  };

  // Test configurations manually
  const configurations = [
    { workers: 4, strategy: 'none', delay: 0 },
    { workers: 6, strategy: 'none', delay: 0 },
    { workers: 8, strategy: 'none', delay: 0 },
    { workers: 8, strategy: 'linear', delay: 25 },
    { workers: 8, strategy: 'linear', delay: 50 },
    { workers: 10, strategy: 'linear', delay: 25 },
    { workers: 10, strategy: 'linear', delay: 50 },
    { workers: 12, strategy: 'linear', delay: 25 },
    { workers: 12, strategy: 'linear', delay: 50 },
    { workers: 16, strategy: 'linear', delay: 25 },
    { workers: 16, strategy: 'linear', delay: 50 },
  ];

  const results = [];

  console.log('📊 Testing Configurations:');
  console.log('');

  for (const [index, config] of configurations.entries()) {
    console.log(`${(index + 1).toString().padStart(2)}. Testing ${config.workers}w/${config.strategy}/${config.delay}ms...`);
    
    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    let rateLimitErrors = 0;

    try {
      // Simulate p-limit behavior
      const limit = Math.min(config.workers, mockChunks.length);
      const promises: Promise<any>[] = [];

      for (let i = 0; i < limit; i++) {
        const promise = (async () => {
          // Apply delay strategy
          let delay = 0;
          if (config.strategy === 'linear' && config.delay > 0) {
            delay = i * config.delay;
          }
          
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          try {
            const result = await mockLLMService.processContent(mockChunks[i]);
            successCount++;
            return result;
          } catch (error) {
            errorCount++;
            if (error instanceof Error && error.message.includes('rate limit')) {
              rateLimitErrors++;
            }
            throw error;
          }
        })();
        
        promises.push(promise);
      }

      await Promise.allSettled(promises);
      
    } catch (error) {
      console.log(`   Error during testing: ${error instanceof Error ? error.message : String(error)}`);
    }

    const duration = Date.now() - startTime;
    const successRate = (successCount / limit) * 100;
    const throughput = (successCount / duration) * 1000; // requests per second

    // Calculate burst rate
    let burstRate = 0;
    if (config.strategy === 'none' || config.delay === 0) {
      burstRate = config.workers / 0.01; // All start in 10ms
    } else if (config.strategy === 'linear') {
      const totalSpread = (config.workers - 1) * config.delay;
      burstRate = config.workers / Math.max(totalSpread / 1000, 0.01);
    }

    const viable = successRate >= 95 && rateLimitErrors === 0 && errorCount <= 1;

    results.push({
      workers: config.workers,
      strategy: config.strategy,
      delay: config.delay,
      successRate,
      throughput,
      burstRate,
      rateLimitErrors,
      errorCount,
      viable,
      duration
    });

    const status = viable ? '✅' : '❌';
    console.log(`    Result: ${successRate.toFixed(1)}% success, ${throughput.toFixed(1)} req/s, ${rateLimitErrors} rate limits ${status}`);
    
    // Stop testing higher worker counts if we hit rate limits
    if (rateLimitErrors > 0 && config.strategy === 'none') {
      console.log('    ↳ Rate limits detected, skipping similar configs...');
      // Skip other 'none' strategy configs
      break;
    }
  }

  console.log('');
  console.log('🏆 OPTIMIZATION RESULTS:');
  console.log('========================');

  const viable = results.filter(r => r.viable);
  console.log('✅ Viable Configurations:');
  viable.forEach((config, i) => {
    console.log(`${i + 1}. ${config.workers} workers, ${config.strategy} strategy, ${config.delay}ms delay`);
    console.log(`   Throughput: ${config.throughput.toFixed(1)} req/s, Burst: ${config.burstRate.toFixed(1)} req/s`);
  });

  if (viable.length > 0) {
    const optimal = viable.sort((a, b) => b.throughput - a.throughput)[0];
    console.log('');
    console.log('🎯 OPTIMAL CONFIGURATION:');
    console.log(`✅ Workers: ${optimal.workers}`);
    console.log(`✅ Strategy: ${optimal.strategy}`);
    console.log(`✅ Linear Delay: ${optimal.delay}ms`);
    console.log(`✅ Expected Throughput: ${optimal.throughput.toFixed(1)} req/s`);
    console.log(`✅ Expected Burst Rate: ${optimal.burstRate.toFixed(1)} req/s`);
    console.log(`✅ Success Rate: ${optimal.successRate.toFixed(1)}%`);
    console.log('');

    console.log('📈 OPTIMIZATION INSIGHTS:');
    console.log(`• ${optimal.workers} workers provides optimal throughput`);
    console.log(`• ${optimal.delay}ms linear delay keeps burst rate manageable`);
    console.log(`• Burst rate reduced from ${(optimal.workers / 0.01).toFixed(0)} to ${optimal.burstRate.toFixed(1)} req/s`);
    console.log(`• ${Math.round((optimal.workers / 0.01) / optimal.burstRate)}x improvement in rate limit compliance`);
  } else {
    console.log('❌ No viable configurations found in test');
  }

  console.log('');
  console.log(`⏰ Test completed in ${((Date.now() - Date.parse(new Date().toISOString())) / 1000).toFixed(1)}s`);
}

// Run the test
if (require.main === module) {
  quickOptimizationTest()
    .then(() => {
      console.log('✅ Quick optimization test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Quick optimization test failed:', error);
      process.exit(1);
    });
}