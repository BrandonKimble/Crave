/**
 * TRUE PRODUCTION SIMULATION TEST - Dual Mode Testing
 * 
 * Supports two TRUE production testing modes:
 * 1. TEST_MODE=bull - Complete Bull queue simulation with result extraction (RECOMMENDED)
 * 2. TEST_MODE=observe - Observation mode (monitor queue status without scheduling new work)
 * 
 * Key Features:
 * ✅ Uses actual ChronologicalCollectionWorker (same code as production)
 * ✅ Bull queue mode extracts real job results via Bull API
 * ✅ Database-driven timing calculations via CollectionJobSchedulerService
 * ✅ No manual orchestration - pure production service testing
 * 
 * Production Fidelity: TRUE - Both modes use identical code paths as production
 * 
 * IMPORTANT: Set TEST_COLLECTION_JOBS_ENABLED=false in .env to prevent background jobs
 * from automatically starting and consuming quota while testing.
 * 
 * Goal: Validate that production services work end-to-end with real data
 */

// Load environment variables explicitly first
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fsSync from 'fs';
import { format } from 'util';

// Load .env file which has all the necessary configuration
dotenv.config({ path: path.join(__dirname, '.env') });

// Set log level to info for cleaner test output (removes debug logs)
// process.env.NODE_ENV = 'production';  // This sets winston log level to 'info' instead of 'debug'

// Test configuration
const parsePositiveInt = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const PIPELINE_COLLECTION = (process.env.TEST_COLLECTION ?? 'chronological').toLowerCase() as
  | 'chronological'
  | 'archive';
const EXECUTION_MODE = (process.env.TEST_EXECUTION_MODE ?? process.env.TEST_MODE ?? 'bull').toLowerCase();
const SUPPORTED_MODES = new Set(['bull', 'observe']);
let TEST_MODE = (SUPPORTED_MODES.has(EXECUTION_MODE) ? EXECUTION_MODE : 'bull') as 'bull' | 'observe';

const SHOULD_RESET_DB = process.env.TEST_RESET_DB === 'true';

const CHRONO_SUBREDDIT = process.env.TEST_CHRONO_SUBREDDIT ?? 'foodnyc';
const ARCHIVE_SUBREDDIT = process.env.TEST_ARCHIVE_SUBREDDIT ?? 'austinfood';

const CHRONO_MAX_POSTS_OVERRIDE = parsePositiveInt(process.env.TEST_CHRONO_MAX_POSTS);
const ARCHIVE_MAX_POSTS_OVERRIDE = parsePositiveInt(process.env.TEST_ARCHIVE_MAX_POSTS);
const ARCHIVE_BATCH_SIZE_OVERRIDE = parsePositiveInt(process.env.TEST_ARCHIVE_BATCH_SIZE);
const LLM_POST_SAMPLE_COUNT = parsePositiveInt(process.env.TEST_LLM_POST_SAMPLE_COUNT) ?? 0;
const LLM_POST_SAMPLE_COMMENT_LIMIT =
  parsePositiveInt(process.env.TEST_LLM_POST_SAMPLE_COMMENT_COUNT) ?? 2;

// Always collect 1000 posts (Reddit API maximum) unless overridden for testing
// Subreddit will be loaded dynamically from database or environment selection

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { AppModule } from './src/app.module';
// Removed unused imports - now using production services directly
import { CollectionJobSchedulerService } from './src/modules/content-processing/reddit-collector/chronological/collection-job-scheduler.service';
import type {
  ArchiveCollectionJobData,
  ArchiveCollectionJobResult,
} from './src/modules/content-processing/reddit-collector/archive/archive-collection.worker';
import { PrismaService } from './src/prisma/prisma.service';
import { CentralizedRateLimiter } from './src/modules/external-integrations/llm/rate-limiting/centralized-rate-limiter.service';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { SmartLLMProcessor } from './src/modules/external-integrations/llm/rate-limiting/smart-llm-processor.service';
// Enhanced services are accessed via DI container - no direct imports needed for production simulation

/**
 * Persist console output for post-run inspection.
 */
const logsDir = path.join(__dirname, 'logs');
fsSync.mkdirSync(logsDir, { recursive: true });
const logTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runLogPath = path.join(logsDir, `test-pipeline-run-${logTimestamp}.log`);
const runLogStream = fsSync.createWriteStream(runLogPath, { flags: 'a' });

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

const mirrorToLog = (level: ConsoleMethod) =>
  (...args: any[]) => {
    try {
      const message = format(...args);
      const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}\n`;
      runLogStream.write(line);
    } catch (streamError) {
      originalConsole.error('Failed to write to test pipeline log stream', streamError);
    }
    originalConsole[level](...args);
  };

console.log = mirrorToLog('log');
console.info = mirrorToLog('info');
console.warn = mirrorToLog('warn');
console.error = mirrorToLog('error');
console.debug = mirrorToLog('debug');

const closeRunLogStream = (onClosed?: () => void) => {
  if (runLogStream.closed) {
    onClosed?.();
    return;
  }
  runLogStream.end(onClosed);
};

process.once('exit', () => closeRunLogStream());
process.once('SIGINT', () => closeRunLogStream(() => process.exit(1)));
process.once('SIGTERM', () => closeRunLogStream(() => process.exit(1)));

console.log(`Test pipeline console output mirrored to ${runLogPath}`);

// Removed chunk function - no longer needed since production services handle batching

async function testPipeline() {
  const overallStartTime = Date.now();
  
  console.log(`Crave API • Production Batch Test (${TEST_MODE.toUpperCase()})`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('Configuration:');
  const pipelineLabel = PIPELINE_COLLECTION === 'archive' ? 'Archive' : 'Chronological';
  const targetSubreddit =
    PIPELINE_COLLECTION === 'archive' ? ARCHIVE_SUBREDDIT : CHRONO_SUBREDDIT;
  console.log(`- Mode: ${TEST_MODE}`);
  console.log(`- Pipeline: ${pipelineLabel}`);
  console.log(`- Subreddit: r/${targetSubreddit}`);
  if (PIPELINE_COLLECTION === 'archive') {
    if (ARCHIVE_BATCH_SIZE_OVERRIDE) {
      console.log(`- Archive batch size override: ${ARCHIVE_BATCH_SIZE_OVERRIDE}`);
    }
    if (ARCHIVE_MAX_POSTS_OVERRIDE) {
      console.log(`- Archive max posts override: ${ARCHIVE_MAX_POSTS_OVERRIDE}`);
    }
  } else {
    if (process.env.TEST_CHRONO_BATCH_SIZE) {
      console.log(
        `- Chronological batch size override: ${process.env.TEST_CHRONO_BATCH_SIZE}`,
      );
    }
    if (CHRONO_MAX_POSTS_OVERRIDE) {
      console.log(`- Chronological max posts override: ${CHRONO_MAX_POSTS_OVERRIDE}`);
    }
    console.log(`- Reddit API limit: 1000 posts`);
  }
  console.log(`- Reset DB before run: ${SHOULD_RESET_DB ? 'yes' : 'no'}`);
  if (LLM_POST_SAMPLE_COUNT > 0) {
    console.log(
      `- LLM post sample: ${LLM_POST_SAMPLE_COUNT} posts (comment preview: ${LLM_POST_SAMPLE_COMMENT_LIMIT})`,
    );
  }
  console.log(`- Shared services: chronological/archive batch pipeline`);

  let app: NestFastifyApplication | null = null;
  let chronologicalQueue: Queue | null = null;
  let chronologicalBatchQueue: Queue | null = null;
  let archiveBatchQueue: Queue | null = null;
  let archiveCollectionQueue: Queue | null = null;

  const shouldCleanupQueues = process.env.TEST_COLLECTION_JOBS_ENABLED !== 'true';

  const cleanQueue = async (queue: Queue | null | undefined, label: string): Promise<void> => {
    if (!queue) {
      return;
    }

    try {
      await queue.pause(true);
      if (typeof (queue as any).obliterate === 'function') {
        await queue.obliterate({ force: true });
      } else {
        await queue.empty();
        await Promise.allSettled([
          queue.clean(0, 'completed'),
          queue.clean(0, 'wait'),
          queue.clean(0, 'delayed'),
          queue.clean(0, 'failed'),
        ]);
      }
    } catch (error) {
      console.log(`   ⚠️  Unable to fully clean ${label} queue: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      try {
        await queue.resume(true);
      } catch {
        // ignore resume errors
      }
    }
  };

  
  
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
    chronologicalQueue = app.get<Queue>(getQueueToken('chronological-collection'));
    chronologicalBatchQueue = app.get<Queue>(
      getQueueToken('chronological-batch-processing-queue'),
    );
    archiveBatchQueue = app.get<Queue>(
      getQueueToken('archive-batch-processing-queue'),
    );
    archiveCollectionQueue = app.get<Queue>(
      getQueueToken('archive-collection'),
    );
    const prisma = app.get(PrismaService);
    // UnifiedProcessingService is in PHASE 4 - not active yet
    // const unifiedProcessingService = app.get(UnifiedProcessingService);
    // EntityResolutionService is in EntityResolverModule - not imported in PHASE 1
    // const entityResolutionService = app.get(EntityResolutionService);
    const serviceDuration = Date.now() - serviceStartTime;
    console.log(`- DI retrieval: ${serviceDuration} ms`);
    console.log('OK • Production services retrieved (shared batch pipeline)');



    if (SHOULD_RESET_DB) {
      console.log('\nStep 1b • Resetting database state for test run');
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE boosts, category_aggregates, connections, entities CASCADE',
      );
      await prisma.$executeRawUnsafe('UPDATE subreddits SET last_processed = NULL');
      await cleanQueue(chronologicalQueue, 'chronological collection');
      await cleanQueue(chronologicalBatchQueue, 'chronological batch');
      await cleanQueue(archiveBatchQueue, 'archive batch');
      await cleanQueue(archiveCollectionQueue, 'archive collection');
      console.log('OK • Database and queues reset complete');
    } else if (shouldCleanupQueues) {
      console.log('\nStep 1b • Clearing queues (TEST_COLLECTION_JOBS_ENABLED=false)');
      await cleanQueue(chronologicalQueue, 'chronological collection');
      await cleanQueue(chronologicalBatchQueue, 'chronological batch');
      await cleanQueue(archiveBatchQueue, 'archive batch');
      await cleanQueue(archiveCollectionQueue, 'archive collection');
      console.log('OK • Queues cleared for testing');
    }

    const step1Duration = Date.now() - step1StartTime;
    console.log(`Step 1 total: ${step1Duration} ms (${(step1Duration/1000).toFixed(1)} s)`);

    const seenBatchIds = new Set<string>();
    const batchSummaries: any[] = [];
    let latestCollectionResult: any = null;
    let aggregatedRawMentions: any[] = [];
    const aggregatedLlmPostSamples: any[] = [];
    let batchesProcessed = 0;
    let collectedPostIds: string[] = [];
    let totalMentionsExtracted = 0;


    const addBatchSummary = (
      job: any,
      result: any,
      success: boolean,
    ): boolean => {
      const batchId =
        (job?.data?.batchId as string | undefined) ??
        (job?.id as string | undefined) ??
        null;

      if (batchId && seenBatchIds.has(batchId)) {
        return false;
      }
      if (batchId) {
        seenBatchIds.add(batchId);
      }

      const llmPostSample = Array.isArray(result?.details?.llmPostSample)
        ? result.details.llmPostSample
        : null;

      batchSummaries.push({
        batchId,
        collectionType:
          (result?.collectionType as string | undefined) ??
          (job?.data?.collectionType as string | undefined) ??
          'chronological',
        success,
        metrics: result?.metrics ?? null,
        details: result?.details ?? null,
        createdEntityIds:
          (result?.details?.createdEntityIds as string[] | undefined) ??
          (result?.createdEntityIds as string[] | undefined) ??
          null,
        createdEntities:
          (result?.details?.createdEntities as any[] | undefined) ??
          (result?.createdEntitySummaries as any[] | undefined) ??
          null,
        reusedEntities:
          (result?.details?.reusedEntities as any[] | undefined) ??
          (result?.reusedEntitySummaries as any[] | undefined) ??
          null,
        entitiesCreated:
          (result?.metrics?.entitiesCreated as number | undefined) ??
          (result?.entitiesCreated as number | undefined) ??
          null,
        connectionsCreated:
          (result?.metrics?.connectionsCreated as number | undefined) ??
          (result?.connectionsCreated as number | undefined) ??
          null,
        mentionsExtracted:
          (result?.metrics?.mentionsExtracted as number | undefined) ??
          (result?.mentionsExtracted as number | undefined) ??
          null,
        llmPostSample,
        error: success
          ? null
          : (result?.error as string | undefined) ??
            (job?.failedReason as string | undefined) ??
            null,
      });

      if (llmPostSample) {
        aggregatedLlmPostSamples.push(...llmPostSample);
      }

      return true;
    }
    const waitForChildBatches = async (
      queue: Queue | null | undefined,
      parentJobId: string,
      expectedBatchCount: number,
    ): Promise<{ completed: any[]; failed: any[] }> => {
      if (!queue) {
        return { completed: [], failed: [] };
      }

      let iterations = 0;
      const maxIterations = 600; // 600 * 200ms ~= 120s
      let completed: any[] = [];
      let failed: any[] = [];
      const startWaitTime = Date.now();

      while (iterations < maxIterations) {
        const [waiting, active, completedAll, failedAll] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
        ]);

        completed = completedAll.filter((job: any) => job?.data?.parentJobId === parentJobId);
        failed = failedAll.filter((job: any) => job?.data?.parentJobId === parentJobId);

        const totalPending = waiting.length + active.length;
        const ourBatchTotal = completed.length + failed.length;
        const expected = expectedBatchCount > 0 ? expectedBatchCount : ourBatchTotal;

        if (totalPending === 0 && ourBatchTotal >= expected) {
          console.log(`✅ All batch jobs completed: ${completed.length} completed, ${failed.length} failed`);
          return { completed, failed };
        }

        if (iterations % 50 === 0) {
          const elapsedSeconds = Math.round((Date.now() - startWaitTime) / 1000);
          console.log(
            `   📊 Queue status (${elapsedSeconds}s): ${waiting.length} waiting, ${active.length} active, ${completed.length} completed, ${failed.length} failed`,
          );
          if (active.length > 0) {
            const activeJob = active[0];
            console.log(
              `   🔄 Active job: ${activeJob.data?.batchId || activeJob.id} (${activeJob.data?.postCount || 'unknown'} posts)`,
            );
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
        iterations += 1;
      }

      console.log('⚠️  Timed out waiting for batch jobs to complete');
      return { completed, failed };
    };

;

;

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
    // STEP 2: Collect Posts (Chronological or Archive)
    // ========================================
    console.log(`\nStep 2 • Collect posts via ${pipelineLabel} pipeline (${TEST_MODE.toUpperCase()} mode)`);
    console.log(`- Started: ${new Date().toISOString()}`);
    console.log(`- Target subreddit: r/${targetSubreddit}`);
    const step2StartTime = Date.now();

    const targetQueue = PIPELINE_COLLECTION === 'archive' ? archiveBatchQueue : chronologicalBatchQueue;
    const queueLabel = PIPELINE_COLLECTION === 'archive' ? 'Archive batch' : 'Chronological batch';

    collectedPostIds = [];
    totalMentionsExtracted = 0;
    batchesProcessed = 0;

    const waitForBatches = async (
      queue: Queue | null | undefined,
      label: string,
      parentJobId: string,
      expectedTotal: number,
    ): Promise<{ completedJobs: any[]; failedJobs: any[] }> => {
      if (!queue) {
        console.log(`⚠️  ${label} queue not available`);
        return { completedJobs: [], failedJobs: [] };
      }

      let attempts = 0;
      const startWait = Date.now();

      while (true) {
        const [waiting, active, completedAll, failedAll] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(0, -1),
          queue.getFailed(0, -1),
        ]);

        const completedJobs = completedAll.filter((job: any) => job?.data?.parentJobId === parentJobId);
        const failedJobs = failedAll.filter((job: any) => job?.data?.parentJobId === parentJobId);
        const totalHandled = completedJobs.length + failedJobs.length;
        const pending = waiting.length + active.length;

        if ((expectedTotal > 0 && totalHandled >= expectedTotal && pending === 0) || (expectedTotal === 0 && pending === 0)) {
          console.log(`✅ ${label} jobs completed: ${completedJobs.length} completed, ${failedJobs.length} failed`);
          return { completedJobs, failedJobs };
        }

        if (attempts % 50 === 0) {
          const elapsed = Math.round((Date.now() - startWait) / 1000);
          console.log(`   ⏳ ${label} queue (${elapsed}s): waiting=${waiting.length}, active=${active.length}, completed=${completedJobs.length}, failed=${failedJobs.length}`);
          if (active.length > 0) {
            const activeJob = active[0];
            console.log(`   🔄 Active job: ${activeJob.data?.batchId || activeJob.id}`);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
        attempts += 1;
      }
    };

    const observeQueue = async (queue: Queue | null | undefined, label: string): Promise<void> => {
      if (!queue) {
        console.log(`⚠️  ${label} queue not available`);
        return;
      }

      console.log(`\n👀 Observing ${label} queue... (press Ctrl+C to exit)`);
      while (true) {
        const [waiting, active, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getDelayed(),
        ]);
        const [completedCount, failedCount] = await Promise.all([
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);

        console.log(
          `   status: waiting=${waiting.length}, active=${active.length}, delayed=${delayed.length}, completed=${completedCount}, failed=${failedCount}`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };

    if (TEST_MODE === 'observe') {
      await observeQueue(targetQueue, queueLabel);
      console.log('Observer mode active. Exiting after observation.');
      return;
    }

    if (PIPELINE_COLLECTION === 'archive') {
      if (!archiveCollectionQueue) {
        throw new Error('Archive collection queue not available');
      }

      const archiveJobData: ArchiveCollectionJobData = {
        jobId: `archive-${targetSubreddit}-${Date.now()}`,
        subreddit: targetSubreddit,
        triggeredBy: 'test_pipeline',
        options: {
          batchSize: ARCHIVE_BATCH_SIZE_OVERRIDE ?? undefined,
          maxPosts: ARCHIVE_MAX_POSTS_OVERRIDE ?? undefined,
        },
      };

      console.log('\n📦 Scheduling archive collection job...');
      const archiveJob = await archiveCollectionQueue.add(
        'execute-archive-collection',
        archiveJobData,
        {
          removeOnComplete: 25,
          removeOnFail: 25,
        },
      );
      console.log(`- Archive collection job queued: ${archiveJob.id}`);

      let archiveResult: ArchiveCollectionJobResult;
      try {
        archiveResult = await archiveJob.finished();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.log(`   ❌ Archive collection job failed: ${message}`);
        throw error;
      }

      latestCollectionResult = archiveResult;
      console.log(
        `- Archive collection completed: ${archiveResult.batchesEnqueued} batches, ${archiveResult.postsQueued} posts`,
      );
      if (archiveResult.filesProcessed.length > 0) {
        archiveResult.filesProcessed.forEach((file) => {
          console.log(
            `   • ${file.fileType} file (${file.metrics.totalLines} lines, errors=${file.errorCount})`,
          );
        });
      }

      const { completedJobs, failedJobs } = await waitForBatches(
        archiveBatchQueue,
        'Archive batch',
        archiveResult.parentBatchJobId,
        archiveResult.batchesEnqueued,
      );

      let archiveMentions = 0;
      for (const job of completedJobs) {
        const rv = job?.returnvalue || {};
        const mentions =
          typeof rv.mentionsExtracted === 'number'
            ? rv.mentionsExtracted
            : typeof rv.metrics?.mentionsExtracted === 'number'
            ? rv.metrics.mentionsExtracted
            : 0;
        archiveMentions += mentions;

        const summaryAdded = addBatchSummary(job, rv, rv?.success !== false);
        if (summaryAdded) {
          if (Array.isArray(rv.rawMentionsSample) && rv.rawMentionsSample.length > 0) {
            aggregatedRawMentions.push(...rv.rawMentionsSample);
          }
          if (Array.isArray(rv.details?.llmPostSample) && rv.details.llmPostSample.length > 0) {
            aggregatedLlmPostSamples.push(...rv.details.llmPostSample);
          }
        }

        const llmPosts = Array.isArray(job?.data?.llmPosts) ? job.data.llmPosts : [];
        collectedPostIds.push(...llmPosts.map((post: any) => post?.id || ''));
      }

      failedJobs.forEach((job) => addBatchSummary(job, job?.returnvalue || {}, false));

      totalMentionsExtracted = archiveMentions;
      batchesProcessed = completedJobs.length;
      latestCollectionResult = {
        ...archiveResult,
        success: archiveResult.success && failedJobs.length === 0,
        postsProcessed: collectedPostIds.filter(Boolean).length,
        batchesProcessed,
        mentionsExtracted: archiveMentions,
        processingTime: archiveResult.processingTimeMs,
      } as any;

      if (failedJobs.length > 0) {
        console.log(`⚠️  ${failedJobs.length} archive batches failed. Check batch summaries for details.`);
      }
    } else {
      console.log(`- Timing: DB-driven (scheduler)`);
      const limitOverride = CHRONO_MAX_POSTS_OVERRIDE ?? 1000;

      try {
        const jobId = await collectionJobScheduler.scheduleManualCollection(targetSubreddit, {
          limit: limitOverride,
          priority: 10,
        });
        console.log(`OK • Bull job scheduled: ${jobId}`);

        let jobComplete = false;
        let attempts = 0;
        const maxAttempts = 120;
        let jobResult: any = null;

        while (!jobComplete && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const bullJob = await chronologicalQueue.getJob(jobId);

          if (bullJob && bullJob.finishedOn) {
            jobComplete = true;
            if (bullJob.failedReason) {
              throw new Error(`Bull queue job failed: ${bullJob.failedReason}`);
            }
            jobResult = bullJob.returnvalue;
          } else if (bullJob && bullJob.processedOn && !bullJob.finishedOn) {
            if (attempts % 10 === 0) console.log(`- Job processing... (${attempts}s)`);
          }
          attempts += 1;
        }

        if (!jobComplete || !jobResult) {
          throw new Error('Bull queue job did not complete in time');
        }

        latestCollectionResult = jobResult;
        totalMentionsExtracted = jobResult.mentionsExtracted || 0;
        batchesProcessed = jobResult.batchesProcessed || 0;
        collectedPostIds = Array.from({ length: jobResult.postsProcessed || 0 }, (_, i) => `bull-post-${i}`);

        const { completedJobs, failedJobs } = await waitForBatches(
          chronologicalBatchQueue,
          'Chronological batch',
          jobId,
          jobResult.batchesProcessed || 0,
        );

        let batchMentions = 0;
        for (const job of completedJobs) {
          const rv = job?.returnvalue || {};
          const mentions =
            typeof rv.mentionsExtracted === 'number'
              ? rv.mentionsExtracted
              : typeof rv.metrics?.mentionsExtracted === 'number'
              ? rv.metrics.mentionsExtracted
              : 0;
          batchMentions += mentions;

          const summaryAdded = addBatchSummary(job, rv, rv?.success !== false);
          if (summaryAdded) {
            if (Array.isArray(rv.rawMentionsSample) && rv.rawMentionsSample.length > 0) {
              aggregatedRawMentions.push(...rv.rawMentionsSample);
            }
            if (Array.isArray(rv.details?.llmPostSample) && rv.details.llmPostSample.length > 0) {
              aggregatedLlmPostSamples.push(...rv.details.llmPostSample);
            }
          }

          const jobPostIds = Array.isArray(job?.data?.postIds)
            ? job.data.postIds
            : Array.isArray(rv.postIds)
            ? rv.postIds
            : [];
          collectedPostIds.push(...jobPostIds.map((id: string) => id || ''));
        }

        failedJobs.forEach((job) => addBatchSummary(job, job?.returnvalue || {}, false));
        totalMentionsExtracted = batchMentions || totalMentionsExtracted;
        batchesProcessed = completedJobs.length || batchesProcessed;

      } catch (error) {
        console.log(`   ❌ Production service failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    collectedPostIds = Array.from(new Set(collectedPostIds.filter(Boolean)));
    const step2Duration = Date.now() - step2StartTime;
    console.log(`Step 2 Total Duration: ${step2Duration}ms (${(step2Duration / 1000).toFixed(1)}s)`);

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
    console.log(`Mode: ${TEST_MODE === 'bull' ? 'Bull Queue' : 'Observer'}`);
    console.log(`Pipeline: ${pipelineLabel}`);
    
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
    console.log(`- Batches processed: ${batchesProcessed}`);
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

    if (LLM_POST_SAMPLE_COUNT > 0 && aggregatedLlmPostSamples.length > 0) {
      const samplePreview = aggregatedLlmPostSamples.slice(
        0,
        Math.min(LLM_POST_SAMPLE_COUNT, aggregatedLlmPostSamples.length),
      );
      console.log(`\nLLM Post Sample Preview:`);
      samplePreview.forEach((sample, index) => {
        console.log(
          `#${index + 1} ${sample.title} (${sample.id}) • ${sample.commentCount} comments`,
        );
        sample.sampleComments?.forEach((comment: any, i: number) => {
          console.log(
            `   ↳ Comment ${i + 1}: ${comment.author} (${comment.score}) - ${comment.contentSnippet}`,
          );
        });
      });
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
        testName: `Production Orchestration - ${TEST_MODE === 'bull' ? 'Bull Queue' : 'Observer'} Mode`,
        timestamp: new Date().toISOString(),
        durationMs: overallDuration,
        mode: TEST_MODE === 'bull' ? 'Bull Queue' : 'Observer',
        pipeline: pipelineLabel,
        subreddit: targetSubreddit || 'foodnyc',
        productionFidelity: true,
        resetDatabase: SHOULD_RESET_DB,
        concurrency: isNaN(concurrencyCfg) ? 16 : concurrencyCfg,
        headroom: isNaN(headroom) ? 0.95 : headroom,
      },
      throughput: {
        posts: collectedPostIds.length,
        mentions: totalMentionsExtracted || 0,
        batches: batchesProcessed,
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
      collection: latestCollectionResult
        ? {
            success: latestCollectionResult.success ?? false,
            postsProcessed: latestCollectionResult.postsProcessed ?? 0,
            batchesProcessed:
              latestCollectionResult.batchesProcessed ?? batchSummaries.length,
            mentionsExtracted: latestCollectionResult.mentionsExtracted ?? 0,
            processingTimeMs: latestCollectionResult.processingTime ?? 0,
            nextScheduledCollection:
              latestCollectionResult.nextScheduledCollection ?? null,
            latestTimestamp: latestCollectionResult.latestTimestamp ?? null,
            componentProcessing:
              latestCollectionResult.componentProcessing ?? null,
            qualityScores: latestCollectionResult.qualityScores ?? null,
            error: latestCollectionResult.error ?? null,
          }
        : null,
      batches: batchSummaries,
      output: {
        testMode: TEST_MODE,
        rawMentionsSample: aggregatedRawMentions,
        llmPostSample:
          LLM_POST_SAMPLE_COUNT > 0
            ? aggregatedLlmPostSamples.slice(
                0,
                Math.min(LLM_POST_SAMPLE_COUNT, aggregatedLlmPostSamples.length),
              )
            : undefined,
      },
    };

    const fsPromises = await import('fs/promises');
    // Write output JSON consistently to the API package logs directory
    const resultsDir = path.resolve(__dirname, 'logs');
    const resultsPath = path.join(resultsDir, 'test-pipeline-output.json');
    await fsPromises.mkdir(resultsDir, { recursive: true });
    await fsPromises.writeFile(resultsPath, JSON.stringify(structuredResults, null, 2));
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
    if (shouldCleanupQueues) {
      console.log('\n🧹 Post-run queue cleanup (TEST_COLLECTION_JOBS_ENABLED=false)');
      await cleanQueue(chronologicalQueue, 'chronological collection');
      await cleanQueue(chronologicalBatchQueue, 'chronological batch');
      await cleanQueue(archiveBatchQueue, 'archive batch');
      await cleanQueue(archiveCollectionQueue, 'archive collection');
    }

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
