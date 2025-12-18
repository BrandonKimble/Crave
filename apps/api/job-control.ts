#!/usr/bin/env npx ts-node

/**
 * Job Control Script - Monitor and control background collection jobs
 */

import 'dotenv/config';
import Redis from 'ioredis';

function resolveAppEnv(): string {
  const raw = process.env.APP_ENV || process.env.CRAVE_ENV;
  if (raw && raw.trim()) {
    return raw.trim();
  }

  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    return 'prod';
  }
  return 'dev';
}

function resolveBullPrefix(): string {
  const explicit = process.env.BULL_PREFIX;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  return `crave:${resolveAppEnv()}`;
}

function resolveLlmRateLimiterPrefix(): string {
  const explicit = process.env.LLM_RATE_LIMIT_PREFIX;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  return `crave:${resolveAppEnv()}:llm-rate-limiter`;
}

async function jobControl() {
  const command = process.argv[2];

  if (!command || !['status', 'clear', 'enable', 'disable'].includes(command)) {
    console.log('📋 JOB CONTROL SCRIPT');
    console.log('====================\n');
    console.log('Usage: npx ts-node job-control.ts <command>\n');
    console.log('Commands:');
    console.log('  status   - Show current job status and settings');
    console.log('  clear    - Clear all queued jobs (emergency stop)');
    console.log(
      '  enable   - Enable background jobs (set TEST_COLLECTION_JOBS_ENABLED=true)',
    );
    console.log(
      '  disable  - Disable background jobs (set TEST_COLLECTION_JOBS_ENABLED=false)',
    );
    return;
  }

  const redis = new Redis({
    host: 'localhost',
    port: 6379,
  });

  try {
    switch (command) {
      case 'status':
        await showStatus(redis);
        break;
      case 'clear':
        await clearJobs(redis);
        break;
      case 'enable':
        await toggleJobs(true);
        break;
      case 'disable':
        await toggleJobs(false);
        break;
    }
  } finally {
    await redis.disconnect();
  }
}

async function showStatus(redis: Redis) {
  console.log('📊 BACKGROUND JOB STATUS');
  console.log('========================\n');

  const bullPrefix = resolveBullPrefix();
  const llmRateLimiterPrefix = resolveLlmRateLimiterPrefix();

  // Check environment setting
  const jobsEnabled =
    process.env.TEST_COLLECTION_JOBS_ENABLED?.toLowerCase() === 'true';
  console.log(
    `🔧 Environment Setting: TEST_COLLECTION_JOBS_ENABLED=${
      process.env.TEST_COLLECTION_JOBS_ENABLED || 'true'
    } (${jobsEnabled ? 'ENABLED' : 'DISABLED'})`,
  );
  console.log(
    `   ↳ This flag now gates both the chronological scheduler (COLLECTION_SCHEDULER_ENABLED) and keyword auto-execution (KEYWORD_SEARCH_ENABLED).`,
  );
  console.log(`\n🧭 REDIS PREFIXES:`);
  console.log(`   - Bull prefix: ${bullPrefix}`);
  console.log(`   - LLM limiter prefix: ${llmRateLimiterPrefix}`);

  // Check detailed queue status
  console.log(`\n📋 DETAILED QUEUE STATUS:`);

  // Check for active jobs (currently processing)
  const activeJobs = await redis.lrange(
    `${bullPrefix}:chronological-collection:active`,
    0,
    -1,
  );
  console.log(`   🟢 Active (Running): ${activeJobs.length} jobs`);
  if (activeJobs.length > 0) {
    activeJobs.slice(0, 3).forEach((job) => {
      const jobData = JSON.parse(job);
      console.log(
        `      - Job ID: ${jobData.id} (started: ${new Date(
          jobData.processedOn || jobData.timestamp,
        ).toLocaleTimeString()})`,
      );
    });
    if (activeJobs.length > 3)
      console.log(`      ... and ${activeJobs.length - 3} more`);
  }

  // Check for waiting jobs (queued)
  const waitingJobs = await redis.lrange(
    `${bullPrefix}:chronological-collection:wait`,
    0,
    -1,
  );
  console.log(`   🟡 Waiting (Queued): ${waitingJobs.length} jobs`);
  if (waitingJobs.length > 0) {
    waitingJobs.slice(0, 3).forEach((job) => {
      try {
        const jobData = JSON.parse(job);
        console.log(
          `      - Job ID: ${jobData.id} (queued: ${new Date(
            jobData.timestamp,
          ).toLocaleTimeString()})`,
        );
      } catch (e) {
        console.log(`      - Job: ${job.substring(0, 50)}...`);
      }
    });
    if (waitingJobs.length > 3)
      console.log(`      ... and ${waitingJobs.length - 3} more`);
  }

  // Check for delayed jobs (scheduled for future)
  const delayedJobs = await redis.zrange(
    `${bullPrefix}:chronological-collection:delayed`,
    0,
    -1,
    'WITHSCORES',
  );
  const delayedCount = delayedJobs.length / 2; // zrange with scores returns pairs
  console.log(`   ⏰ Delayed (Scheduled): ${delayedCount} jobs`);
  if (delayedCount > 0) {
    for (let i = 0; i < Math.min(6, delayedJobs.length); i += 2) {
      try {
        const jobData = JSON.parse(delayedJobs[i]);
        const executeTime = new Date(parseInt(delayedJobs[i + 1]));
        console.log(
          `      - Job ID: ${
            jobData.id
          } (scheduled: ${executeTime.toLocaleString()})`,
        );
      } catch (e) {
        console.log(
          `      - Delayed job at: ${new Date(
            parseInt(delayedJobs[i + 1]),
          ).toLocaleString()}`,
        );
      }
    }
    if (delayedCount > 3) console.log(`      ... and ${delayedCount - 3} more`);
  }

  // Check failed jobs
  const failedJobs = await redis.lrange(
    `${bullPrefix}:chronological-collection:failed`,
    0,
    -1,
  );
  console.log(`   🔴 Failed: ${failedJobs.length} jobs`);

  // Check completed jobs
  const completedJobs = await redis.lrange(
    `${bullPrefix}:chronological-collection:completed`,
    0,
    -1,
  );
  console.log(`   ✅ Completed: ${completedJobs.length} jobs`);

  // Check all other Bull keys for comprehensive view
  const queueNames = [
    'chronological-collection',
    'volume-tracking',
    'chronological-batch-processing-queue',
    'keyword-batch-processing-queue',
    'keyword-search-execution',
    'archive-batch-processing-queue',
    'archive-collection',
  ];
  const allBullKeys = (
    await Promise.all(
      queueNames.map((queueName) => redis.keys(`${bullPrefix}:${queueName}:*`)),
    )
  ).flat();
  const otherKeys = allBullKeys.filter(
    (key) =>
      !key.includes('active') &&
      !key.includes('wait') &&
      !key.includes('delayed') &&
      !key.includes('failed') &&
      !key.includes('completed') &&
      !key.includes('logs') &&
      !key.includes('id'),
  );

  if (otherKeys.length > 0) {
    console.log(`   🗂️  Other Bull data: ${otherKeys.length} keys`);
  }

  // Check rate limiter usage
  const rateLimiterKeys = await redis.keys(`${llmRateLimiterPrefix}:*`);
  console.log(`\n⚡ RATE LIMITER STATUS:`);
  console.log(`   📊 Total keys: ${rateLimiterKeys.length}`);

  if (rateLimiterKeys.includes(`${llmRateLimiterPrefix}:reservations`)) {
    const reservations = await redis.zcard(
      `${llmRateLimiterPrefix}:reservations`,
    );
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentReservations = await redis.zcount(
      `${llmRateLimiterPrefix}:reservations`,
      oneMinuteAgo,
      '+inf',
    );
    console.log(
      `   🎫 Current reservations: ${reservations} total, ${recentReservations} in last minute`,
    );
  }

  if (rateLimiterKeys.includes(`${llmRateLimiterPrefix}:active`)) {
    const activeRequests = await redis.zcard(`${llmRateLimiterPrefix}:active`);
    console.log(`   🔄 Active LLM requests: ${activeRequests}`);
  }

  // Summary and recommendations
  const totalActiveWork = activeJobs.length + waitingJobs.length + delayedCount;

  console.log(`\n💡 SUMMARY & RECOMMENDATIONS:`);
  if (totalActiveWork > 0) {
    console.log(
      `   ⚠️  JOBS DETECTED: ${totalActiveWork} total jobs (${activeJobs.length} running, ${waitingJobs.length} queued, ${delayedCount} scheduled)`,
    );
    console.log(`   🔥 These jobs WILL consume quota if enabled!`);
    if (jobsEnabled) {
      console.log(
        `   🚨 URGENT: Jobs are ENABLED - they are likely consuming quota right now!`,
      );
      console.log(
        `   💊 IMMEDIATE ACTION: Run 'npx ts-node job-control.ts disable && npx ts-node job-control.ts clear'`,
      );
    } else {
      console.log(
        `   ⚠️  Jobs are disabled but queues exist - clear them to be safe`,
      );
      console.log(`   🧹 Run: npx ts-node job-control.ts clear`);
    }
  } else if (!jobsEnabled) {
    console.log(
      `   ✅ SAFE: Jobs disabled and no work queued - safe for testing`,
    );
  } else {
    console.log(
      `   ✅ READY: Jobs enabled but no work queued - controlled testing ready`,
    );
  }
}

async function clearJobs(redis: Redis) {
  console.log('🧹 CLEARING ALL BACKGROUND JOBS');
  console.log('================================\n');

  const bullPrefix = resolveBullPrefix();
  const llmRateLimiterPrefix = resolveLlmRateLimiterPrefix();
  const queueNames = [
    'chronological-collection',
    'volume-tracking',
    'chronological-batch-processing-queue',
    'keyword-batch-processing-queue',
    'keyword-search-execution',
    'archive-batch-processing-queue',
    'archive-collection',
  ];
  const keys = (
    await Promise.all(
      queueNames.map((queueName) => redis.keys(`${bullPrefix}:${queueName}:*`)),
    )
  ).flat();
  if (keys.length === 0) {
    console.log('✅ No Bull queue data found - already clean');
  }

  if (keys.length > 0) {
    console.log(`Found ${keys.length} Bull queue keys, clearing...`);
    await redis.del(...keys);
  }

  // Also clear rate limiter data for clean slate
  const rateLimiterKeys = await redis.keys(`${llmRateLimiterPrefix}:*`);
  if (rateLimiterKeys.length > 0) {
    console.log(`Clearing ${rateLimiterKeys.length} rate limiter keys...`);
    await redis.del(...rateLimiterKeys);
  }

  console.log('✅ All background jobs and rate limiter data cleared');
  console.log('   Safe to run tests without quota consumption');
}

async function toggleJobs(enable: boolean) {
  const fs = await import('fs');
  const path = await import('path');

  console.log(`🔧 ${enable ? 'ENABLING' : 'DISABLING'} BACKGROUND JOBS`);
  console.log('=======================================\n');

  const envPath = path.join(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  if (envContent.includes('TEST_COLLECTION_JOBS_ENABLED=')) {
    envContent = envContent.replace(
      /TEST_COLLECTION_JOBS_ENABLED=.*/,
      `TEST_COLLECTION_JOBS_ENABLED=${enable}`,
    );
  } else {
    envContent += `\nTEST_COLLECTION_JOBS_ENABLED=${enable}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Updated .env: TEST_COLLECTION_JOBS_ENABLED=${enable}`);
  console.log(`   Restart the application for changes to take effect`);

  if (!enable) {
    console.log(
      `\n💡 Tip: Run 'npx ts-node job-control.ts clear' to remove existing queued jobs`,
    );
  }
}

jobControl().catch(console.error);
