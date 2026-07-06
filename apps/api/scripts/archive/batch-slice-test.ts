import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
process.env.COLLECTION_LLM_MODE = process.env.SLICE_MODE ?? 'batch';

import { spawn } from 'child_process';
import * as readline from 'readline';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ExtractionPipelineService } from '../../src/modules/content-processing/reddit-collector/extraction-pipeline.service';
import { GeminiBatchService } from '../../src/modules/external-integrations/llm/gemini-batch.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { LLMPost } from '../../src/modules/external-integrations/llm/llm.types';

/**
 * REAL archive slice through the BATCH pipeline: parse a few recent austinfood
 * posts + their comments straight from the pushshift archive, run
 * ExtractionPipelineService.processPosts under COLLECTION_LLM_MODE=batch
 * (chunk → persist inputs → Gemini batch job), then poll until the ingestor
 * has run the full post-LLM half (mentions → entities → projections). The
 * end-to-end proof for the Austin load.
 *
 *   yarn ts-node scripts/archive/batch-slice-test.ts
 */
const BASE = `${process.env.PUSHSHIFT_LOCAL_ARCHIVE_PATH}/austinfood`;
const POSTS = Number(process.env.SLICE_POSTS ?? 5);

async function streamZst(
  file: string,
  onLine: (obj: Record<string, unknown>) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('zstd', ['-dc', '--long=31', file]);
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      try {
        onLine(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* skip malformed */
      }
    });
    rl.on('close', resolve);
    proc.on('error', reject);
  });
}

async function main(): Promise<void> {
  const out = (m = '') => process.stdout.write(`${m}\n`);
  const cutoff = Math.floor(Date.now() / 1000) - 5 * 365 * 86400;

  // 1) Pick recent posts with a healthy comment count.
  const candidates: Record<string, unknown>[] = [];
  await streamZst(`${BASE}/austinfood_submissions.zst`, (o) => {
    const created = Number(o.created_utc ?? 0);
    const n = Number(o.num_comments ?? 0);
    if (created >= cutoff && n >= 4 && n <= 20 && o.selftext !== '[removed]') {
      candidates.push(o);
    }
  });
  candidates.sort((a, b) => Number(b.created_utc) - Number(a.created_utc));
  const offset = Number(process.env.SLICE_OFFSET ?? 0);
  const picked = candidates.slice(offset, offset + POSTS);
  const wanted = new Set(picked.map((p) => `t3_${String(p.id)}`));
  out(`picked ${picked.length} posts: ${picked.map((p) => p.id).join(', ')}`);

  // 2) Gather their comments.
  const commentsByLink = new Map<string, Record<string, unknown>[]>();
  await streamZst(`${BASE}/austinfood_comments.zst`, (o) => {
    const link = String((o.link_id as string) ?? '');
    if (!wanted.has(link)) return;
    const list = commentsByLink.get(link) ?? [];
    if (list.length < 25) list.push(o);
    commentsByLink.set(link, list);
  });

  const llmPosts: LLMPost[] = picked.map((p) => ({
    id: `t3_${String(p.id)}`,
    title: String((p.title as string) ?? ''),
    content: String((p.selftext as string) ?? ''),
    subreddit: 'austinfood',
    author: 'redacted',
    url: `https://reddit.com${String((p.permalink as string) ?? '')}`,
    score: Number(p.score ?? 0),
    created_at: new Date(Number(p.created_utc) * 1000).toISOString(),
    comments: (commentsByLink.get(`t3_${String(p.id)}`) ?? []).map((c) => ({
      id: `t1_${String(c.id)}`,
      content: String((c.body as string) ?? ''),
      author: 'redacted',
      score: Number(c.score ?? 0),
      created_at: new Date(Number(c.created_utc) * 1000).toISOString(),
      parent_id: String((c.parent_id as string) ?? ''),
      url: '',
    })),
  }));
  out(
    `comments: ${llmPosts.map((p) => p.comments.length).join(', ')} per post`,
  );

  // 3) Run the REAL pipeline in batch mode.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const pipeline = app.get(ExtractionPipelineService);
    const batch = app.get(GeminiBatchService);
    const prisma = app.get(PrismaService);

    const before = await prisma.entity.count();
    const result = await pipeline.processPosts({
      pipeline: 'archive',
      community: 'austinfood',
      batchId: `batch-slice-test-${Date.now()}`,
      llmPosts,
      activateDocumentsBeforeProcessing: true,
    });
    if (process.env.SLICE_MODE === 'interactive') {
      const after = await prisma.entity.count();
      out(
        `interactive run=${result.extractionRunId}; entities: ${before} -> ${after} (+${after - before})`,
      );
      return;
    }
    out(
      `deferred: batchJobId=${result.deferredBatchJobId} run=${result.extractionRunId}`,
    );
    if (!result.deferredBatchJobId) {
      out('ERROR: expected deferral in batch mode');
      return;
    }

    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20000));
      await batch.poll();
      const job = await prisma.llmBatchJob.findUnique({
        where: { jobId: result.deferredBatchJobId },
        select: { status: true, error: true },
      });
      out(`status=${job?.status}${job?.error ? ` err=${job.error}` : ''}`);
      if (job?.status === 'ingested' || job?.status === 'failed') break;
    }

    const after = await prisma.entity.count();
    const run = await prisma
      .$queryRawUnsafe<
        { status: string }[]
      >(`SELECT status FROM collection_extraction_runs WHERE run_id = $1::uuid`, result.extractionRunId)
      .catch(() => [] as { status: string }[]);
    out(
      `entities: ${before} -> ${after} (+${after - before}); run status=${run[0]?.status ?? 'unknown'}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
