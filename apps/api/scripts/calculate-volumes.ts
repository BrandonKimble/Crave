/**
 * Volume Calculation Script
 *
 * Runs the actual SubredditVolumeTrackingService to calculate
 * real posting volumes from Reddit API data.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load API environment variables (same file the API uses)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { AppModule } from '../src/app.module';

async function calculateVolumes() {
  console.log('🔍 Starting Volume Calculation for Subreddits');
  console.log('==============================================');

  let app;

  try {
    // Initialize NestJS application
    console.log('\n🏗️  Initializing NestJS application...');
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    // Get the volume tracking queue
    const volumeQueue = app.get(getQueueToken('volume-tracking')) as Queue;

    console.log('✅ Volume tracking queue retrieved');

    // Queue a volume calculation job
    console.log('\n📊 Queuing volume calculation job...');
    console.log(
      '   This will make actual Reddit API calls to sample posting rates',
    );
    console.log('   Sample period: 7 days (as modified)');

    const job = await volumeQueue.add('calculate-volumes', {
      jobId: `manual-volume-calc-${Date.now()}`,
      triggeredBy: 'manual',
      sampleDays: 7, // Using 7 days as you specified
    });

    console.log(`✅ Volume calculation job queued: ${job.id}`);

    // Wait for the job to complete
    console.log('\n⏳ Waiting for volume calculation to complete...');
    let jobComplete = false;
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes with 1 second checks

    while (!jobComplete && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check job status
      const bullJob = await volumeQueue.getJob(job.id);

      if (bullJob && bullJob.finishedOn) {
        jobComplete = true;

        if (bullJob.failedReason) {
          throw new Error(
            `Volume calculation job failed: ${bullJob.failedReason}`,
          );
        }

        // Get job result
        const jobResult = bullJob.returnvalue;
        console.log('✅ Volume calculation job completed successfully');
        console.log(
          `   Subreddits processed: ${jobResult.subredditsProcessed}`,
        );
        console.log(`   Processing time: ${jobResult.processingTime}ms`);

        // The actual volume data is now in the database
      } else if (bullJob && bullJob.processedOn && !bullJob.finishedOn) {
        // Job is still processing
        if (attempts % 10 === 0) {
          console.log(`   🔄 Job is processing... (${attempts}s elapsed)`);
        }
      }

      attempts++;
    }

    if (!jobComplete) {
      throw new Error('Volume calculation job did not complete in time');
    }

    // Now read the updated volumes from the database
    const { PrismaService } = await import('../src/prisma/prisma.service');
    const prisma = app.get(PrismaService);

    const volumes = await prisma.subreddit.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    console.log('\n🎉 VOLUME CALCULATION COMPLETED');
    console.log('================================');

    for (const volume of volumes) {
      console.log(`\n📋 ${volume.name.toUpperCase()}`);
      console.log(`   📈 Posts per day: ${volume.avgPostsPerDay.toFixed(1)}`);
      console.log(
        `   📊 Safe interval days: ${volume.safeIntervalDays.toFixed(1)}`,
      );
      console.log(`   ✅ Active: ${volume.isActive}`);
      console.log(
        `   🕐 Last calculated: ${volume.lastCalculated.toISOString()}`,
      );
      console.log(
        `   🕐 Last processed: ${
          volume.lastProcessed ? volume.lastProcessed.toISOString() : 'Never'
        }`,
      );
      console.log(`   🕐 Updated at: ${volume.updatedAt.toISOString()}`);
    }

    console.log('\n💾 Data has been saved to the database');
    console.log('   The collection scheduler will now use these real values');
  } catch (error) {
    console.error(
      '\n❌ Volume calculation failed:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  } finally {
    if (app) {
      await app.close();
      console.log('\n✅ Application closed');
    }
  }
}

// Run the script
if (require.main === module) {
  calculateVolumes()
    .then(() => {
      console.log('✅ Volume calculation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Volume calculation failed:', error);
      process.exit(1);
    });
}
