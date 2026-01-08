import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { getQueueToken } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AppModule } from '../src/app.module';
import type {
  ArchiveCollectionJobData,
  ArchiveCollectionJobResult,
} from '../src/modules/content-processing/reddit-collector/archive/archive-collection.worker';

interface CliOptions {
  subreddit: string;
  batchSize?: number;
  maxPosts?: number;
  wait: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { subreddit: '', wait: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--subreddit' || token === '-s') {
      options.subreddit = argv[++i] ?? '';
    } else if (token.startsWith('--subreddit=')) {
      options.subreddit = token.split('=', 2)[1] ?? '';
    } else if (token === '--batch-size' || token === '-b') {
      options.batchSize = Number(argv[++i]);
    } else if (token.startsWith('--batch-size=')) {
      options.batchSize = Number(token.split('=', 2)[1]);
    } else if (token === '--max-posts' || token === '-m') {
      options.maxPosts = Number(argv[++i]);
    } else if (token.startsWith('--max-posts=')) {
      options.maxPosts = Number(token.split('=', 2)[1]);
    } else if (token === '--wait' || token === '-w') {
      options.wait = true;
    } else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!options.subreddit) {
    console.error('❌ Missing required --subreddit argument.');
    printHelp();
    process.exit(1);
  }

  if (typeof options.batchSize === 'number' && options.batchSize <= 0) {
    options.batchSize = undefined;
  }
  if (typeof options.maxPosts === 'number' && options.maxPosts <= 0) {
    options.maxPosts = undefined;
  }

  return options;
}

function printHelp(): void {
  console.log(`archive-collect --subreddit <name> [options]

Options:
  --subreddit, -s     Target subreddit to ingest (required)
  --batch-size, -b    Override archive batch size (default 20)
  --max-posts, -m     Limit total posts processed for this run
  --wait, -w          Wait for completion and stream results
  --help, -h          Show this help message
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      logger: ['error', 'warn'],
    },
  );
  await app.init();

  try {
    const archiveCollectionQueue = app.get<Queue>(
      getQueueToken('archive-collection'),
    );

    const jobData: ArchiveCollectionJobData = {
      jobId: `archive-${args.subreddit}-${Date.now()}`,
      subreddit: args.subreddit,
      triggeredBy: 'manual',
      options: {
        batchSize: args.batchSize,
        maxPosts: args.maxPosts,
      },
    };

    console.log('📦 Scheduling archive collection job with data:', jobData);

    const job = await archiveCollectionQueue.add(
      'execute-archive-collection',
      jobData,
      {
        removeOnComplete: 25,
        removeOnFail: 25,
      },
    );

    console.log(`✅ Archive collection job enqueued (Bull ID: ${job.id})`);

    if (!args.wait) {
      console.log('ℹ️  Use --wait to block until processing finishes.');
      return;
    }

    console.log('⏳ Waiting for archive collection to finish...');
    let result: ArchiveCollectionJobResult;
    try {
      result = await job.finished();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('❌ Archive collection failed:', message);
      throw error;
    }

    console.log('\n🏁 Archive collection completed:');
    console.log(`   Subreddit: r/${result.subreddit}`);
    console.log(`   Batches enqueued: ${result.batchesEnqueued}`);
    console.log(`   Posts queued: ${result.postsQueued}`);
    console.log(`   Parent batch job ID: ${result.parentBatchJobId}`);
    console.log(`   Processing time: ${result.processingTimeMs} ms`);

    if (result.filesProcessed.length > 0) {
      console.log('\n📊 File metrics:');
      for (const file of result.filesProcessed) {
        console.log(
          `   • ${file.fileType} (${file.metrics.totalLines} lines, errors=${file.errorCount})`,
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Archive collection script failed:', error);
  process.exit(1);
});
