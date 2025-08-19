/**
 * LLM Performance Optimization Test
 * 
 * Systematically tests different worker counts and delay strategies
 * to find optimal configuration for Gemini API rate limits.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './src/app.module';
import { LLMPerformanceOptimizerService } from './src/modules/external-integrations/llm/llm-performance-optimizer.service';
import { LLMConcurrentProcessingService } from './src/modules/external-integrations/llm/llm-concurrent-processing.service';
import { LLMChunkingService } from './src/modules/external-integrations/llm/llm-chunking.service';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { ContentRetrievalPipelineService } from './src/modules/content-processing/reddit-collector/content-retrieval-pipeline.service';

async function testOptimization() {
  const overallStartTime = Date.now();
  
  console.log('🧪 LLM PERFORMANCE OPTIMIZATION TEST');
  console.log('=========================================');
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('');

  let app: NestFastifyApplication | null = null;
  
  try {
    // Initialize NestJS application
    console.log('🏗️  Initializing NestJS Application...');
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      { logger: ['error', 'warn', 'log'] }
    );
    await app.init();
    console.log('✅ Application initialized');

    // Get services
    const optimizer = app.get(LLMPerformanceOptimizerService);
    const concurrentService = app.get(LLMConcurrentProcessingService);
    const chunkingService = app.get(LLMChunkingService);
    const llmService = app.get(LLMService);
    const contentRetrieval = app.get(ContentRetrievalPipelineService);

    console.log('📊 Current Configuration (before optimization):');
    const currentConfig = concurrentService.getCurrentConfiguration();
    console.log(`   Workers: ${currentConfig.workerCount}`);
    console.log(`   Delay Strategy: ${currentConfig.delayStrategy}`);
    console.log(`   Delay: ${currentConfig.delayMs}ms`);
    console.log(`   Estimated Burst Rate: ${currentConfig.burstRate.toFixed(1)} req/sec`);
    console.log(`   Optimized: ${currentConfig.isOptimized}`);
    console.log('');

    // Create sample test data
    console.log('📦 Creating sample test data...');
    
    // Use a smaller sample of real data for testing
    const samplePostIds = [
      't3_1mt1t06',  // Example post IDs - replace with actual ones
      't3_1mszm7m',
      't3_1msru1m',
    ];

    try {
      // Get real content for testing
      const testContent = await contentRetrieval.retrieveContentForLLM(
        'foodnyc',
        samplePostIds,
        { depth: 10 } // Smaller depth for testing
      );

      // Create chunks for testing
      const chunkData = await chunkingService.createContextualChunks(testContent.llmInput);
      
      console.log(`   Posts: ${testContent.llmInput.posts.length}`);
      console.log(`   Chunks: ${chunkData.chunks.length}`);
      console.log(`   Comments: ${testContent.llmInput.posts.reduce((sum, p) => sum + p.comments.length, 0)}`);
      console.log('');

      // Run optimization
      console.log('🎯 Starting Performance Optimization...');
      console.log('   This will test different worker counts and delay strategies');
      console.log('   Expected duration: 2-5 minutes');
      console.log('');

      await concurrentService.optimizeConfiguration(
        chunkData,
        llmService,
        {
          maxWorkers: 20,
          testDurationLimitMs: 300000, // 5 minutes max
        }
      );

      // Show optimized configuration
      console.log('🏆 OPTIMIZATION COMPLETED');
      console.log('========================');
      const optimizedConfig = concurrentService.getCurrentConfiguration();
      console.log(`✅ Optimal Workers: ${optimizedConfig.workerCount}`);
      console.log(`✅ Optimal Delay Strategy: ${optimizedConfig.delayStrategy}`);
      console.log(`✅ Optimal Delay: ${optimizedConfig.delayMs}ms`);
      console.log(`✅ Estimated Burst Rate: ${optimizedConfig.burstRate.toFixed(1)} req/sec`);
      console.log(`✅ Now Optimized: ${optimizedConfig.isOptimized}`);
      console.log('');

      // Test the optimized configuration
      console.log('🧪 Testing Optimized Configuration...');
      const testResult = await concurrentService.processConcurrent(chunkData, llmService);
      
      console.log('📊 OPTIMIZATION TEST RESULTS:');
      console.log(`   Success Rate: ${testResult.metrics.successRate.toFixed(1)}%`);
      console.log(`   Chunks Processed: ${testResult.metrics.chunksProcessed}`);
      console.log(`   Total Duration: ${(testResult.metrics.totalDuration / 1000).toFixed(1)}s`);
      console.log(`   Average Time/Chunk: ${testResult.metrics.averageChunkTime.toFixed(1)}ms`);
      console.log(`   Mentions Extracted: ${testResult.results.reduce((sum, r) => sum + r.mentions.length, 0)}`);
      
      if (testResult.configuration) {
        console.log('');
        console.log('📈 FINAL CONFIGURATION:');
        console.log(`   Worker Count: ${testResult.configuration.workerCount}`);
        console.log(`   Delay Strategy: ${testResult.configuration.delayStrategy}`);
        console.log(`   Delay: ${testResult.configuration.delayMs}ms`);
        console.log(`   Burst Rate: ${testResult.configuration.burstRate.toFixed(1)} req/sec`);
      }

      if (testResult.failures.length > 0) {
        console.log('');
        console.log(`⚠️  ${testResult.failures.length} chunks failed:`);
        testResult.failures.forEach(f => {
          console.log(`   - Chunk ${f.chunkId}: ${f.error instanceof Error ? f.error.message : String(f.error)}`);
        });
      }

    } catch (contentError) {
      console.log('⚠️  Could not retrieve real content, using mock data for optimization');
      console.log(`   Error: ${contentError instanceof Error ? contentError.message : String(contentError)}`);
      
      // Create mock test data
      const mockChunks = Array.from({ length: 20 }, (_, i) => ({
        posts: [{
          id: `mock-post-${i}`,
          title: `Mock Post ${i}`,
          content: `This is mock content for testing optimization ${i}`,
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

      console.log('🎯 Running optimization with mock data...');
      await concurrentService.optimizeConfiguration(
        mockChunkData,
        llmService,
        {
          maxWorkers: 16,
          testDurationLimitMs: 180000, // 3 minutes for mock data
        }
      );

      const finalConfig = concurrentService.getCurrentConfiguration();
      console.log('🏆 MOCK OPTIMIZATION COMPLETED');
      console.log(`   Workers: ${finalConfig.workerCount}`);
      console.log(`   Strategy: ${finalConfig.delayStrategy}`);
      console.log(`   Delay: ${finalConfig.delayMs}ms`);
      console.log(`   Burst Rate: ${finalConfig.burstRate.toFixed(1)} req/sec`);
    }

  } catch (error) {
    console.error('❌ OPTIMIZATION TEST FAILED:', error instanceof Error ? error.message : String(error));
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  } finally {
    if (app) {
      console.log('');
      console.log('🔄 Closing application...');
      await app.close();
    }
    
    const totalDuration = Date.now() - overallStartTime;
    console.log(`⏰ Total test duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`✅ Optimization test completed at: ${new Date().toISOString()}`);
  }
}

// Run the optimization test
if (require.main === module) {
  testOptimization()
    .then(() => {
      console.log('✅ Optimization test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Optimization test failed:', error);
      process.exit(1);
    });
}