/**
 * PRODUCTION ORCHESTRATOR TEST
 * 
 * Tests the complete production pipeline using Bull queues and the CollectionJobSchedulerService.
 * This triggers real jobs through the production orchestration system to surface integration issues.
 * 
 * Pipeline Flow:
 * 1. Trigger manual collection via CollectionJobSchedulerService
 * 2. Job queued in Bull 'chronological-collection' queue
 * 3. ChronologicalCollectionProcessor processes the job
 * 4. Reddit API → Content Retrieval → LLM Processing → Entity Resolution → Database
 * 5. Monitor job progress via CollectionJobMonitoringService
 * 
 * Goal: Test the complete production pipeline with real Bull queue processing
 */

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test file which has all the necessary configuration
dotenv.config({ path: path.join(__dirname, '.env.test') });

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './src/app.module';
import { CollectionJobSchedulerService } from './src/modules/content-processing/reddit-collector/collection-job-scheduler.service';
import { CollectionJobMonitoringService } from './src/modules/content-processing/reddit-collector/collection-job-monitoring.service';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';

async function testProductionOrchestrator() {
  const startTime = Date.now();
  console.log('🚀 PRODUCTION ORCHESTRATOR TEST - Using Bull Queues');
  console.log('==================================================');
  console.log(`⏰ Test started at: ${new Date().toISOString()}`);

  let app: NestFastifyApplication | null = null;
  
  try {
    // ========================================
    // STEP 1: Initialize NestJS Application
    // ========================================
    console.log('\n🏗️  STEP 1: Initializing NestJS Application...');
    const step1StartTime = Date.now();
    
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      { 
        logger: ['error', 'warn', 'log', 'debug'], // Enable all logging
      }
    );
    
    await app.init();
    console.log(`✅ Application initialized in ${Date.now() - step1StartTime}ms`);

    // ========================================
    // STEP 2: Verify Bull Queue Setup
    // ========================================
    console.log('\n🔧 STEP 2: Verifying Bull Queue Setup...');
    const step2StartTime = Date.now();
    
    // Get the Bull queue instance
    const chronologicalQueue = app.get<Queue>(getQueueToken('chronological-collection'));
    
    if (!chronologicalQueue) {
      throw new Error('Bull queue "chronological-collection" not found');
    }
    
    // Check queue health
    const queueJobCounts = await chronologicalQueue.getJobCounts();
    console.log('📊 Queue Status:', queueJobCounts);
    
    // Check Redis connection
    const isReady = await chronologicalQueue.isReady();
    if (!isReady) {
      throw new Error('Bull queue is not ready - check Redis connection');
    }
    
    console.log(`✅ Bull queue verified in ${Date.now() - step2StartTime}ms`);

    // ========================================
    // STEP 3: Get Production Services
    // ========================================
    console.log('\n🔌 STEP 3: Getting Production Services...');
    const step3StartTime = Date.now();
    
    const jobScheduler = app.get(CollectionJobSchedulerService);
    const jobMonitoring = app.get(CollectionJobMonitoringService);
    
    if (!jobScheduler || !jobMonitoring) {
      throw new Error('Required services not available in DI container');
    }
    
    console.log(`✅ Services retrieved in ${Date.now() - step3StartTime}ms`);

    // ========================================
    // STEP 4: Trigger Manual Collection Job
    // ========================================
    console.log('\n🎯 STEP 4: Triggering Manual Collection Job...');
    const step4StartTime = Date.now();
    
    const subreddits = ['austinfood'];
    const options = {
      priority: 10,  // High priority for testing
      limit: 5,      // Just 5 posts for initial test
      lastProcessedTimestamp: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60), // 7 days ago
    };
    
    console.log(`📋 Job Configuration:`);
    console.log(`   Subreddits: ${subreddits.join(', ')}`);
    console.log(`   Post Limit: ${options.limit}`);
    console.log(`   Priority: ${options.priority}`);
    
    // Schedule the manual collection job
    const jobId = await jobScheduler.scheduleManualCollection(subreddits, options);
    
    console.log(`✅ Job scheduled with ID: ${jobId}`);
    console.log(`   Time to schedule: ${Date.now() - step4StartTime}ms`);

    // ========================================
    // STEP 5: Monitor Job Progress
    // ========================================
    console.log('\n📊 STEP 5: Monitoring Job Progress...');
    const step5StartTime = Date.now();
    
    let jobCompleted = false;
    let lastStatus = '';
    let pollCount = 0;
    const maxPolls = 300; // 5 minutes max (1 second intervals)
    
    while (!jobCompleted && pollCount < maxPolls) {
      pollCount++;
      
      try {
        // Get job metrics from monitoring service
        const jobMetrics = jobMonitoring.getJobMetrics(jobId);
        
        // Also check the Bull queue job directly
        const job = await chronologicalQueue.getJob(jobId);
        const jobState = job ? await job.getState() : 'unknown';
        
        if (jobState !== lastStatus) {
          console.log(`\n⚡ Job Status Changed: ${lastStatus || 'initialized'} → ${jobState}`);
          lastStatus = jobState;
          
          if (job && job.progress) {
            console.log(`   Progress: ${JSON.stringify(job.progress)}`);
          }
        }
        
        // Check if job is complete
        if (jobState === 'completed') {
          jobCompleted = true;
          console.log('\n✅ JOB COMPLETED SUCCESSFULLY!');
          console.log(`   Duration: ${Date.now() - step5StartTime}ms`);
          
          if (job && job.returnvalue) {
            const result = job.returnvalue as any;
            console.log('\n📈 Job Results:');
            console.log(`   Success: ${result.success}`);
            console.log(`   Posts Collected: ${result.totalPostsCollected || 0}`);
            console.log(`   Processing Time: ${result.processingTime || 0}ms`);
            
            if (result.results) {
              console.log('\n📊 Subreddit Results:');
              for (const [subreddit, subResult] of Object.entries(result.results)) {
                console.log(`   ${subreddit}:`);
                console.log(`     - Posts: ${(subResult as any).postsCollected || 0}`);
                console.log(`     - Status: ${(subResult as any).success ? 'Success' : 'Failed'}`);
              }
            }
          }
        } else if (jobState === 'failed') {
          jobCompleted = true;
          console.error('\n❌ JOB FAILED!');
          if (job && job.failedReason) {
            console.error(`   Error: ${job.failedReason}`);
          }
          console.error(`   Duration: ${Date.now() - step5StartTime}ms`);
        }
        
      } catch (error) {
        console.error(`\n⚠️  Error checking job status:`, error);
      }
      
      // Wait before next poll
      if (!jobCompleted) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Show progress indicator every 10 seconds
        if (pollCount % 10 === 0) {
          console.log(`   ⏳ Still processing... (${pollCount}s elapsed)`);
        }
      }
    }
    
    if (!jobCompleted && pollCount >= maxPolls) {
      console.error('\n⏱️  Job monitoring timeout - job did not complete within 5 minutes');
    }

    // ========================================
    // STEP 6: Check Queue Metrics
    // ========================================
    console.log('\n📊 STEP 6: Final Queue Metrics...');
    const finalQueueCounts = await chronologicalQueue.getJobCounts();
    console.log('   Queue Status:', finalQueueCounts);
    
    // Get performance metrics
    const performanceMetrics = jobMonitoring.getPerformanceMetrics(24);
    console.log('\n📈 Performance Metrics (Last 24 Hours):');
    console.log(`   Success Rate: ${performanceMetrics.successRate.toFixed(1)}%`);
    console.log(`   Average Duration: ${performanceMetrics.averageDuration}ms`);
    console.log(`   Total Jobs Run: ${performanceMetrics.totalJobsRun}`);
    console.log(`   Average Posts Per Job: ${performanceMetrics.averagePostsPerJob}`);
    console.log(`   Peak Processing Time: ${performanceMetrics.peakProcessingTime}ms`);

    // ========================================
    // FINAL SUMMARY
    // ========================================
    const totalDuration = Date.now() - startTime;
    console.log('\n🎯 PRODUCTION ORCHESTRATOR TEST SUMMARY');
    console.log('========================================');
    console.log(`✅ Test completed in ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);
    console.log(`✅ Job ID: ${jobId}`);
    console.log(`✅ Final Status: ${lastStatus}`);
    console.log(`✅ Polls Required: ${pollCount}`);
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`\n❌ PRODUCTION ORCHESTRATOR TEST FAILED after ${totalDuration}ms:`, 
      error instanceof Error ? error.message : String(error));
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  } finally {
    if (app) {
      console.log('\n🔄 Closing application...');
      await app.close();
      console.log('✅ Application closed');
    }
  }
}

// Run the test
if (require.main === module) {
  testProductionOrchestrator()
    .then(() => {
      console.log('\n✅ Production orchestrator test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Production orchestrator test failed:', error);
      process.exit(1);
    });
}