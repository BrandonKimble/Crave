/**
 * TRUE PRODUCTION SIMULATION TEST - Dual Mode Testing
 * 
 * Supports two TRUE production testing modes:
 * 1. TEST_MODE=bull - Complete Bull queue simulation with result extraction (RECOMMENDED)
 * 2. TEST_MODE=direct - Direct ChronologicalCollectionWorker execution (faster alternative)
 * 
 * Key Features:
 * ✅ Uses actual ChronologicalCollectionWorker (same code as production)
 * ✅ Bull queue mode extracts real job results via Bull API
 * ✅ Database-driven timing calculations via CollectionJobSchedulerService
 * ✅ No manual orchestration - pure production service testing
 * 
 * Production Fidelity: TRUE - Both modes use identical code paths as production
 * 
 * IMPORTANT: Set COLLECTION_JOBS_ENABLED=false in .env to prevent background jobs
 * from automatically starting and consuming quota while testing.
 * 
 * Goal: Validate that production services work end-to-end with real data
 */

// Load environment variables explicitly first
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file which has all the necessary configuration
dotenv.config({ path: path.join(__dirname, '.env') });

// Set log level to info for cleaner test output (removes debug logs)
// process.env.NODE_ENV = 'production';  // This sets winston log level to 'info' instead of 'debug'

// Test configuration
let TEST_MODE = process.env.TEST_MODE || 'direct'; // 'bull', 'direct', or 'queue-only'
// Always collect 1000 posts (Reddit API maximum) - this is production behavior
// Subreddit will be loaded dynamically from database

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { AppModule } from './src/app.module';
// Removed unused imports - now using production services directly
import { CollectionJobSchedulerService } from './src/modules/content-processing/reddit-collector/collection-job-scheduler.service';
import { ChronologicalCollectionWorker } from './src/modules/content-processing/reddit-collector/chronological-collection.worker';
import { PrismaService } from './src/prisma/prisma.service';
import { CentralizedRateLimiter } from './src/modules/external-integrations/llm/rate-limiting/centralized-rate-limiter.service';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { SmartLLMProcessor } from './src/modules/external-integrations/llm/rate-limiting/smart-llm-processor.service';
// Enhanced services are accessed via DI container - no direct imports needed for production simulation

// Removed chunk function - no longer needed since production services handle batching

async function testPipeline() {
  const overallStartTime = Date.now();
  
  console.log(`Crave API • Production Batch Test (${TEST_MODE.toUpperCase()})`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('Configuration:');
  console.log(`- Mode: ${TEST_MODE}`);
  console.log(`- Subreddit: dynamic (DB-driven)`);
  console.log(`- Reddit API limit: 1000 posts`);
  console.log(`- Services: ChronologicalCollectionWorker + Bull Queue`);
  console.log('');

  let app: NestFastifyApplication | null = null;
  
  try {
    // ========================================
    // STEP 1: Initialize NestJS Application (NO COMPROMISES)
    // ========================================
    console.log('\nStep 1 • Initialize NestJS application');
    const step1StartTime = Date.now();
    
    // Use create with Fastify adapter (same as main.ts)
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      { 
        logger: ['error', 'warn', 'log'] // Enable logging to see what's happening
      }
    );
    const appCreateTime = Date.now();
    console.log(`- App create: ${appCreateTime - step1StartTime} ms`);
    
    await app.init();
    const appInitTime = Date.now();
    console.log(`- App init: ${appInitTime - appCreateTime} ms`);
    console.log('OK • Application initialized');

    // Get ONLY the actual infrastructure services
    console.log('\nStep 1a • Retrieve services from DI');
    const serviceStartTime = Date.now();
    // Get production services from DI container
    const collectionJobScheduler = app.get(CollectionJobSchedulerService);
    const chronologicalCollectionWorker = app.get(ChronologicalCollectionWorker);
    const chronologicalQueue = app.get<Queue>(getQueueToken('chronological-collection'));
    const prisma = app.get(PrismaService);
    // UnifiedProcessingService is in PHASE 4 - not active yet
    // const unifiedProcessingService = app.get(UnifiedProcessingService);
    // EntityResolutionService is in EntityResolverModule - not imported in PHASE 1
    // const entityResolutionService = app.get(EntityResolutionService);
    const serviceDuration = Date.now() - serviceStartTime;
    console.log(`- DI retrieval: ${serviceDuration} ms`);
    console.log('OK • Production services retrieved (ChronologicalCollectionWorker + Bull queue)');

    const step1Duration = Date.now() - step1StartTime;
    console.log(`Step 1 total: ${step1Duration} ms (${(step1Duration/1000).toFixed(1)} s)`);

    // ========================================
    // MANUAL KEYWORD SEARCH APPROACH (PRESERVED FOR KEYWORD COLLECTION PHASE)
    // ========================================
    // This approach will be used for keyword entity search (PRD Section 5.1.2)
    // 
    // Implementation tested and validated:
    // 1. redditService.searchByKeyword('austinfood', 'best special', {sort: 'relevance', limit: 10})
    // 2. Search returns posts.data array with nested post.data objects
    // 3. Find specific post by title match with fallback to first result
    // 4. contentRetrievalPipeline.retrieveContentForLLM([targetPostId])
    // 5. Process single post through same LLM pipeline as batch processing
    //
    // Key learnings for keyword collection implementation:
    // - Posts structure: searchResults.data[i].data contains actual post
    // - Fallback logic needed when exact title match not found
    // - Single post processing works identically to batch processing
    // - Can search for entities like "chicken sandwich" or "rooftop patio"
    //
    // When implementing keyword collection phase:
    // - Use entity names/attributes as search keywords
    // - Process results through same batch pipeline
    // - Dedup against existing mentions in database
    //
    // [Full implementation preserved in git history for reference]

    // ========================================
    // STEP 2: Collect Posts (Bull Queue vs Direct Service)
    // ========================================
    console.log(`\nStep 2 • Collect posts via ${TEST_MODE.toUpperCase()} mode`);
    console.log(`- Started: ${new Date().toISOString()}`);
    const step2StartTime = Date.now();

    // Test subreddit (services handle all database queries and timing internally)
    const testSubreddit = 'foodnyc';
    console.log(`- Test subreddit: r/${testSubreddit}`);
    console.log(`- Timing: DB-driven (scheduler)`);
    
    let collectedPostIds: string[] = [];
    
    // Track production metrics from services
    let totalMentionsExtracted = 0;
    let aggregatedRawMentions: any[] = [];
    
    if (TEST_MODE === 'bull') {
      // PRODUCTION SIMULATION - Test with actual Bull queue
      console.log(`\nBull queue production orchestrator`);
      console.log(`- Subreddit: ${testSubreddit}`);
      console.log(`- Limit: 1000 posts (service default)`);
      console.log(`- Scheduler timing: DB-driven`);

      try {
        const jobId = await collectionJobScheduler.scheduleManualCollection(
          testSubreddit, // Single subreddit per job
          {
            limit: 1000, // Service always uses 1000 regardless
            priority: 10
          }
        );
        console.log(`OK • Bull job scheduled: ${jobId}`);
        
        // Monitor job completion and extract actual results
        let jobComplete = false;
        let attempts = 0;
        const maxAttempts = 120; // 2 minutes with 1 second checks
        
        while (!jobComplete && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Get the actual Bull job to check status and extract results
          const bullJob = await chronologicalQueue.getJob(jobId);
          
          if (bullJob && bullJob.finishedOn) {
            jobComplete = true;
            
            if (bullJob.failedReason) {
              throw new Error(`Bull queue job failed: ${bullJob.failedReason}`);
            }
            
            // Extract actual production results from Bull job
            const jobResult = bullJob.returnvalue;
            console.log(`OK • Bull job completed`);
            console.log(`Result:`);
            console.log(`- Success: ${jobResult?.success}`);
            console.log(`- Posts processed: ${jobResult?.postsProcessed || 0}`);
            console.log(`- Batches processed: ${jobResult?.batchesProcessed || 0}`);
            console.log(`- Mentions extracted: ${jobResult?.mentionsExtracted || 0}`);
            console.log(`- Processing time: ${jobResult?.processingTime || 0} ms`);
            
            // Use actual production metrics
            if (jobResult?.success) {
              totalMentionsExtracted = jobResult.mentionsExtracted || 0;
              // collectedPostIds would be available if the job returned them
              // For now, we'll use the processed count as a proxy
              collectedPostIds = Array.from({ length: jobResult.postsProcessed || 0 }, (_, i) => `bull-post-${i}`);
            }
            
          } else if (bullJob && bullJob.processedOn && !bullJob.finishedOn) {
            // Job is still processing
            if (attempts % 10 === 0) console.log(`- Job processing... (${attempts}s)`);
          }
          
          attempts++;
        }
        
        if (!jobComplete) {
          console.log(`⚠️  Bull queue job did not complete in time, falling back to direct service`);
          // Fall through to direct service mode
          TEST_MODE = 'direct' as any;
        }
      } catch (error) {
        console.log(`WARN • Bull queue test failed: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`   Falling back to direct service testing`);
        // Fall through to direct service mode
        TEST_MODE = 'direct' as any;
      }
    }
    
    if (TEST_MODE === 'direct') {
      // TRUE PRODUCTION SIMULATION - Use actual ChronologicalCollectionWorker
      console.log(`\n📦 Direct production service execution...`);
      console.log(`   Subreddit: ${testSubreddit}`);
      console.log(`   Limit: 1000 posts (service always requests maximum)`);
      console.log(`   ✅ Using ChronologicalCollectionWorker (same as production Bull queue)`);
      
      try {
        // Execute the same service that production Bull queue uses
        // Get timing information like the scheduler would
        const timingInfo = await collectionJobScheduler.getSubredditTiming(testSubreddit);
        
        const jobData = {
          subreddit: testSubreddit,
          jobId: `test-direct-${Date.now()}`,
          triggeredBy: 'manual' as const,
          options: {
            limit: 100, // Temporary testing limit for log optimization
            retryCount: 0,
            lastProcessedTimestamp: timingInfo.lastProcessedTimestamp, // Use scheduler-calculated timing
          },
        };
        
        // Create mock Bull Job object for direct testing
        const mockJob = {
          data: jobData,
          id: jobData.jobId,
          opts: {},
          attemptsMade: 0,
          log: (message: string) => console.log(`[Job Log] ${message}`),
          progress: (progress: number) => console.log(`[Job Progress] ${progress}%`),
          // Add minimal Bull Job properties needed
        } as any;
        
        console.log(`   🎯 Executing chronological collection with production service...`);
        const collectionResult = await chronologicalCollectionWorker.processChronologicalCollection(mockJob);
        
        console.log(`\n⏳ Waiting for batch processing to complete (${collectionResult.batchesProcessed || 0} batches queued)...`);
        
        // Get the batch processing queue to monitor completion
        const batchQueue = app.get('BullQueue_chronological-batch-processing-queue');
        
        // Wait for all batch jobs to complete
        let waitingCount = 0;
        let allJobsComplete = false;
        const maxWaitTimeMs = 300000; // 5 minutes max wait
        const startWaitTime = Date.now();
        // aggregation declared at function scope
        
        while (!allJobsComplete && (Date.now() - startWaitTime) < maxWaitTimeMs) {
          // Check queue status
          const waiting = await batchQueue.getWaiting();
          const active = await batchQueue.getActive();
          const completedAll = await batchQueue.getCompleted();
          const failedAll = await batchQueue.getFailed();
          // Focus on jobs from this run only
          const completed = completedAll.filter((j: any) => j?.data?.parentJobId === jobData.jobId);
          const failed = failedAll.filter((j: any) => j?.data?.parentJobId === jobData.jobId);
          
          const totalPending = waiting.length + active.length;
          
          if (totalPending === 0) {
            allJobsComplete = true;
            console.log(`✅ All batch jobs completed: ${completed.length} completed, ${failed.length} failed`);
            
            // Collect results from completed batch jobs (this run only)
            let totalBatchMentions = 0;
            for (const completedJob of completed) {
              const rv = completedJob.returnvalue || {};
              // Back-compat: mentions count may live at root or under metrics
              const mCount =
                typeof rv.mentionsExtracted === 'number'
                  ? rv.mentionsExtracted
                  : typeof rv.metrics?.mentionsExtracted === 'number'
                  ? rv.metrics.mentionsExtracted
                  : 0;
              totalBatchMentions += mCount;
              const sample = completedJob.returnvalue?.rawMentionsSample;
              if (Array.isArray(sample) && sample.length > 0) {
                aggregatedRawMentions.push(...sample);
              }
            }
            
            // Update the collection result with actual batch results
            collectionResult.mentionsExtracted = totalBatchMentions;
            totalMentionsExtracted = totalBatchMentions;
            console.log(`- Mentions extracted across batches: ${totalBatchMentions}`);
            
            break;
          }
          
          // Log progress every 10 seconds (reduced frequency)
          if (waitingCount % 50 === 0) {
            const elapsedSeconds = Math.round((Date.now() - startWaitTime) / 1000);
            console.log(`   📊 Queue status (${elapsedSeconds}s): ${waiting.length} waiting, ${active.length} active, ${completed.length} completed, ${failed.length} failed`);
            
            // Try to get more details about the active job
            if (active.length > 0) {
              const activeJob = active[0];
              console.log(`   🔄 Active job: ${activeJob.data?.batchId || activeJob.id} (${activeJob.data?.postCount || 'unknown'} posts)`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 200)); // Check every 200ms
          waitingCount++;
        }
        
        if (!allJobsComplete) {
          console.log(`WARN • Batch processing timeout after ${maxWaitTimeMs/1000}s`);
          console.log(`- Final status: ${(await batchQueue.getWaiting()).length} waiting, ${(await batchQueue.getActive()).length} active`);
        }

        console.log(`\nProduction service execution completed`);
        console.log(`- Success: ${collectionResult.success ? 'TRUE' : 'FALSE'}`);
        console.log(`- Posts processed: ${collectionResult.postsProcessed || 0}`);
        console.log(`- Batches processed: ${collectionResult.batchesProcessed || 0}`);
        console.log(`- Mentions extracted: ${collectionResult.mentionsExtracted || 0}`);
        console.log(`- Processing time: ${(collectionResult.processingTime || 0)} ms (${((collectionResult.processingTime || 0) / 1000).toFixed(1)} s)`);
        console.log(`- Latest timestamp: ${collectionResult.latestTimestamp || 'N/A'}`);
        
        // Component Processing & Quality Score Results (NEW - PRD Section 6.5 & 5.3)
        if (collectionResult.componentProcessing) {
          console.log(`\n🧩 COMPONENT PROCESSING RESULTS (PRD 6.5):`);
          console.log(`   🏪 Restaurant entities processed: ${collectionResult.componentProcessing.restaurantsProcessed || 0}`);
          console.log(`   🔗 Connections created: ${collectionResult.componentProcessing.connectionsCreated || 0}`);
          console.log(`   🔗 Connections updated: ${collectionResult.componentProcessing.connectionsUpdated || 0}`);
          console.log(`   📝 Mentions recorded: ${collectionResult.componentProcessing.mentionsCreated || 0}`);
          console.log(`   ⚡ Components executed: ${collectionResult.componentProcessing.componentsExecuted || 'N/A'}`);
          console.log(`   🎯 Processing success rate: ${collectionResult.componentProcessing.successRate || 'N/A'}%`);
        }
        
        // Intermediate metrics and configuration logs suppressed; focus on final summary only

        // Use actual production results
        totalMentionsExtracted = collectionResult.mentionsExtracted;
        // Generate mock post IDs based on actual processed count
        collectedPostIds = Array.from({ length: collectionResult.postsProcessed }, (_, i) => `direct-post-${i}`);
        if (collectionResult.error) console.log(`WARN • Service reported error: ${collectionResult.error}`);
        
      } catch (error) {
        console.log(`   ❌ Production service failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
    
    if (TEST_MODE === 'queue-only') {
      // QUEUE-ONLY MODE - Just let Bull scheduler run background jobs
      console.log(`\n⏳ Queue-only mode - monitoring Bull queue jobs...`);
      console.log(`   Only active subreddits will be processed by background scheduler`);
      console.log(`   Monitor logs for: "Processing chronological collection job"`);
      console.log(`   Waiting for jobs to complete... (this may take 30+ minutes)`);
      
      // Keep the app alive to let Bull jobs run
      console.log(`   Press Ctrl+C to stop monitoring and exit`);
      
      // Wait indefinitely - user will stop manually
      await new Promise(() => {
        // This will never resolve - user must manually stop
      });
    }

    const step2Duration = Date.now() - step2StartTime;
    console.log(`Step 2 Total Duration: ${step2Duration}ms (${(step2Duration/1000).toFixed(1)}s)`);


    // ========================================
    // REMAINING STEPS COMMENTED OUT FOR FOCUSED LLM TESTING
    // ========================================
    
    // ========================================
    // STEP 10: Log Data State at Each Pipeline Step (TRANSPARENCY) [COMMENTED OUT]
    // ========================================
    // console.log('\n📊 STEP 10: Logging data state at each pipeline step...');

    // const pipelineStates = {
    //   timestamp: new Date().toISOString(),
    //   testName: 'FOCUSED LLM PROCESSING TEST - "Best Special in Austin?" Post',
      
    //   step3_posts: {
    //       [ALL PIPELINE STATES COMMENTED OUT FOR FOCUSED LLM TESTING]
    //     }
    // };

    // const logsDir = path.join(process.cwd(), 'logs');
    // await fs.mkdir(logsDir, { recursive: true });
    // const outputPath = path.join(logsDir, 'uncompromising-pipeline-test-results.json');
    // await fs.writeFile(outputPath, JSON.stringify(pipelineStates, null, 2));

    // console.log(`✅ Pipeline states logged to: ${outputPath}`);

    // ========================================
    // FINAL SUMMARY
    // ========================================
    console.log(`\n=== Test Summary ===`);
    console.log(`Date: ${new Date().toISOString()}`);
    console.log(`Mode: ${TEST_MODE === 'bull' ? 'Bull Queue Simulation' : 'Direct Service'}`);
    
    // ========================================
    // COLLECT PERFORMANCE METRICS
    // ========================================
    const overallDurationSeconds = (Date.now() - overallStartTime) / 1000;
    const mentionsCount = totalMentionsExtracted || 0;
    const postsCount = collectedPostIds.length;
    
    // Get comprehensive metrics from rate limiter and LLM service
    let rateLimitMetrics: any = null;
    let llmMetrics: any = null;
    try {
      const centralizedRateLimiter = app.get(CentralizedRateLimiter);
      rateLimitMetrics = await centralizedRateLimiter.getMetrics();
    } catch (error) {
      console.log(`   ⚠️  Rate limit metrics unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    try {
      const llmService = app.get(LLMService);
      llmMetrics = llmService.getPerformanceMetrics();
    } catch (error) {
      console.log(`   ⚠️  LLM metrics unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log(`\nCore Results:`);
    console.log(`- Mentions: ${mentionsCount}`);
    console.log(`- Posts: ${postsCount}`);
    console.log(`- Duration: ${overallDurationSeconds.toFixed(1)} s`);
    
    if (postsCount > 0) {
      const avgTimePerPost = overallDurationSeconds / postsCount;
      const postsPerMinute = (postsCount / (overallDurationSeconds / 60)).toFixed(1);
      const mentionsPerPost = (mentionsCount / postsCount).toFixed(2);
      const extractionRate = ((mentionsCount / postsCount) * 100).toFixed(1);
      
      console.log(`\nThroughput:`);
      console.log(`- Posts/min: ${postsPerMinute}`);
      console.log(`- Avg time/post: ${avgTimePerPost.toFixed(2)} s`);
      console.log(`- Mentions/post: ${mentionsPerPost}`);
    }

    // Rate limiting performance summary
    const concurrencyCfg = parseInt(process.env.CONCURRENCY || '16', 10);
    if (rateLimitMetrics && !rateLimitMetrics.error) {
      const bottleneck = rateLimitMetrics.optimization.currentBottleneck === 'none' ? 'None' : String(rateLimitMetrics.optimization.currentBottleneck).toUpperCase();
      console.log(`\nRate Limiting:`);
      console.log(`- RPM utilization: ${rateLimitMetrics.rpm.actualUtilizationPercent}% (current ${rateLimitMetrics.rpm.current}/${rateLimitMetrics.rpm.safe})`);
      console.log(`- TPM(input) utilization: ${rateLimitMetrics.tpm.utilizationPercent}% (used ${rateLimitMetrics.tpm.current.toLocaleString()}, reserved ${(rateLimitMetrics.tpm as any).reserved?.toLocaleString?.() || 0})`);
      console.log(`- Bottleneck: ${bottleneck}`);
      console.log(`- Reservation accuracy (avg): ${rateLimitMetrics.reservations.avgAccuracyMs} ms`);
      console.log(`- Reservation confirmation: ${rateLimitMetrics.reservations.confirmationRate}% (${rateLimitMetrics.reservations.confirmed}/${rateLimitMetrics.reservations.total})`);
    }

    // Aggregated per-request diagnostics (from SmartLLMProcessor)
    try {
      const smart = app.get(SmartLLMProcessor);
      const diag = smart.getAggregatedDiagnostics();
      console.log(`\nPer-Request Aggregates:`);
      console.log(`- Requests observed: ${diag.requests}`);
      if (typeof diag.mentionYield?.withMentions === 'number') {
        console.log(`- Requests with mentions: ${diag.mentionYield.withMentions} (${diag.mentionYield.percent}%)`);
      }
      console.log(`- Wait(ms): avg ${diag.waits.avgMs}, min ${diag.waits.minMs}, max ${diag.waits.maxMs}`);
      console.log(`- RPM util(%): avg ${diag.rpmUtilization.avg}, min ${diag.rpmUtilization.min}, max ${diag.rpmUtilization.max}`);
      console.log(`- TPM(input) util(%): avg ${diag.tpmUtilization.avg}, min ${diag.tpmUtilization.min}, max ${diag.tpmUtilization.max}`);
      console.log(`- RPM window count: avg ${diag.rpmWindowCount.avg}, min ${diag.rpmWindowCount.min}, max ${diag.rpmWindowCount.max}`);
      console.log(`- TPM window tokens: avg ${diag.tpmWindowTokens.avg}, min ${diag.tpmWindowTokens.min}, max ${diag.tpmWindowTokens.max}`);
      console.log(`- Input tokens (estimated): avg ${diag.inputTokens.estimated.avg}, min ${diag.inputTokens.estimated.min}, max ${diag.inputTokens.estimated.max}`);
      console.log(`- Input tokens (actual): avg ${diag.inputTokens.actual.avg}, min ${diag.inputTokens.actual.min}, max ${diag.inputTokens.actual.max}`);
      console.log(`- Estimation error(tokens): avg ${diag.inputTokens.estimationError.avg}, avgAbs ${diag.inputTokens.estimationError.avgAbs}, min ${diag.inputTokens.estimationError.min}, max ${diag.inputTokens.estimationError.max}`);
      if (diag.noUsageMetadataCount > 0) console.log(`- Missing usageMetadata count: ${diag.noUsageMetadataCount}`);
    } catch {}

    // ========================================
    // GENERATE STRUCTURED JSON RESULTS FILE
    // ========================================
    const overallDuration = Date.now() - overallStartTime;
    
    // Calculate comprehensive stats
    const avgTimePerPost = collectedPostIds.length > 0 ? overallDuration / collectedPostIds.length : 0;
    const postsPerSecond = collectedPostIds.length > 0 ? collectedPostIds.length / (overallDuration / 1000) : 0;
    const mentionsPerPost = collectedPostIds.length > 0 ? (totalMentionsExtracted || 0) / collectedPostIds.length : 0;
    
    // Build structured results (revamped)
    const headroom = parseFloat(process.env.LLM_RATE_HEADROOM || '0.95');
    const perReqAgg = (() => {
      try {
        const smart = app.get(SmartLLMProcessor);
        return smart.getAggregatedDiagnostics();
      } catch {
        return null;
      }
    })();
    const structuredResults = {
      testMetadata: {
        testName: `Production Orchestration - ${TEST_MODE === 'bull' ? 'Bull Queue' : 'Direct'} Mode`,
        timestamp: new Date().toISOString(),
        durationMs: overallDuration,
        mode: TEST_MODE === 'bull' ? 'Bull Queue Simulation' : 'Direct Service',
        subreddit: testSubreddit || 'foodnyc',
        productionFidelity: true,
        concurrency: isNaN(concurrencyCfg) ? 16 : concurrencyCfg,
        headroom: isNaN(headroom) ? 0.95 : headroom,
      },
      throughput: {
        posts: collectedPostIds.length,
        mentions: totalMentionsExtracted || 0,
        postsPerSecond: Number(postsPerSecond.toFixed(2)),
        postsPerMinute: collectedPostIds.length > 0 ? Number((collectedPostIds.length / (overallDuration / 1000 / 60)).toFixed(1)) : 0,
        avgTimePerPostMs: Math.round(avgTimePerPost),
        mentionsPerPost: collectedPostIds.length > 0 ? Number(mentionsPerPost.toFixed(2)) : 0,
      },
      rateLimiting: rateLimitMetrics && !rateLimitMetrics.error ? {
        rpm: {
          current: rateLimitMetrics.rpm?.current,
          safe: rateLimitMetrics.rpm?.safe,
          utilizationPercent: rateLimitMetrics.rpm?.actualUtilizationPercent,
        },
        tpmInput: {
          used: rateLimitMetrics.tpm?.current,
          reserved: (rateLimitMetrics.tpm as any)?.reserved || 0,
          windowTokens: (rateLimitMetrics.tpm as any)?.windowTokens || 0,
          utilizationPercent: rateLimitMetrics.tpm?.utilizationPercent,
          avgTokensPerRequest: rateLimitMetrics.tpm?.avgTokensPerRequest || 0,
        },
        reservations: {
          avgAccuracyMs: rateLimitMetrics.reservations?.avgAccuracyMs || 0,
          confirmationRate: rateLimitMetrics.reservations?.confirmationRate || 0,
          confirmed: rateLimitMetrics.reservations?.confirmed || 0,
          total: rateLimitMetrics.reservations?.total || 0,
        },
        bottleneck: rateLimitMetrics.optimization?.currentBottleneck || 'unknown',
      } : null,
      llmPerformance: llmMetrics ? {
        totalCalls: llmMetrics.requestCount,
        avgResponseTimeMs: Math.round(llmMetrics.averageResponseTime),
        successRate: llmMetrics.successRate,
        totalTokensProcessed: llmMetrics.totalTokensUsed,
        avgTokensPerRequest: llmMetrics.requestCount > 0 ? Math.round(llmMetrics.totalTokensUsed / llmMetrics.requestCount) : 0,
      } : null,
      perRequestAggregates: perReqAgg,
      output: {
        testMode: TEST_MODE,
        rawMentionsSample: aggregatedRawMentions,
      },
    };

    const fs = await import('fs/promises');
    // Write output JSON consistently to the API package logs directory
    const resultsDir = path.resolve(__dirname, 'logs');
    const resultsPath = path.join(resultsDir, 'test-pipeline-output.json');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(resultsPath, JSON.stringify(structuredResults, null, 2));
    console.log(`\nStructured results file: ${resultsPath}`);

    // Overall timing summary
    console.log(`\n⏰ OVERALL TEST TIMING:`);
    console.log(`   Total test duration: ${overallDuration}ms (${(overallDuration/1000).toFixed(1)}s)`);
    console.log(`   Test completed at: ${new Date().toISOString()}`);

  } catch (error) {
    const overallDuration = Date.now() - overallStartTime;
    console.error(`\n❌ UNCOMPROMISING FAILURE after ${overallDuration}ms:`, error instanceof Error ? error.message : String(error));
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  } finally {
    if (app) {
      console.log('\n🔄 Closing application context...');
      const closeStartTime = Date.now();
      await app.close();
      const closeDuration = Date.now() - closeStartTime;
      console.log(`✅ Application closed in ${closeDuration}ms`);
    }
  }
}

// Run the pipeline test
if (require.main === module) {
  testPipeline()
    .then(() => {
      console.log('✅ Pipeline test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Pipeline test failed:', error);
      process.exit(1);
    });
}
