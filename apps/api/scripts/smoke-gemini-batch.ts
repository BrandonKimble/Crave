import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { GeminiBatchService } from '../src/modules/external-integrations/llm/gemini-batch.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Live smoke for the Gemini Batch pipeline: submit a tiny 2-item job, poll via
 * the SAME service method the cron uses, and verify the ingestor fires with
 * stored responses. Proves submit → provider poll → response persistence →
 * purpose-keyed ingestion end-to-end. Batches often complete within minutes;
 * if not done within the timeout, the job is left 'submitted' for the cron.
 *
 *   yarn ts-node scripts/smoke-gemini-batch.ts
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const batch = app.get(GeminiBatchService);
    const prisma = app.get(PrismaService);

    let ingested: { key: string; ok: boolean }[] | null = null;
    batch.registerIngestor('smoke_test', async ({ items }) => {
      ingested = items.map((item) => ({
        key: item.itemKey,
        ok: item.response !== null && !item.error,
      }));
      return Promise.resolve();
    });

    const jobId = await batch.submit({
      purpose: 'smoke_test',
      model: process.env.LLM_MODEL ?? 'gemini-3.5-flash',
      items: [
        {
          key: 'smoke-1',
          contents: 'Reply with exactly this JSON: {"ok": true, "n": 1}',
          config: { responseMimeType: 'application/json', temperature: 0 },
        },
        {
          key: 'smoke-2',
          contents: 'Reply with exactly this JSON: {"ok": true, "n": 2}',
          config: { responseMimeType: 'application/json', temperature: 0 },
        },
      ],
    });
    out(`submitted jobId=${jobId}`);

    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20000));
      await batch.poll();
      const job = await prisma.llmBatchJob.findUnique({
        where: { jobId },
        select: { status: true, error: true },
      });
      out(`status=${job?.status}${job?.error ? ` error=${job.error}` : ''}`);
      if (job?.status === 'ingested' || job?.status === 'failed') {
        break;
      }
    }
    out(`ingested items: ${JSON.stringify(ingested)}`);
    const items = await prisma.llmBatchJobItem.findMany({
      where: { jobId },
      select: { itemKey: true, response: true, error: true },
    });
    for (const item of items) {
      out(
        `  ${item.itemKey}: response=${item.response ? 'present' : 'null'} error=${item.error ?? 'none'}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
