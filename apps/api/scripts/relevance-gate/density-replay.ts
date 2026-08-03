/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
/**
 * Relevance-gate calibration replay — through THE PRODUCTION PATH.
 *
 * The original harness built its own GoogleGenAI client and hand-assembled
 * the request, which means it never measured the shipped configuration at
 * all: it was a parallel assembler that could (and did) drift — no thinking
 * config, prompt in the user text part while production moved it to
 * systemInstruction. A calibration number from a harness that bypasses the
 * system it calibrates is a fake measurement.
 *
 * This version boots the app and drives RelevanceGateService.filterPosts —
 * the real packing, the real gateway (caller profile, thinking level, spend
 * admission, ledger) — against the 130-post labeled corpus. Verdicts
 * persist under a throwaway platform tag so reruns are clean and prod rows
 * are untouched.
 *
 *   yarn workspace api ts-node scripts/relevance-gate/density-replay.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { RelevanceGateService } from '../../src/modules/content-processing/reddit-collector/relevance-gate.service';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';
import type { LLMPost } from '../../src/modules/external-integrations/llm/llm.types';

const DIR = __dirname;

interface Sample {
  sub: string;
  id: string;
  title: string;
  body: string;
}

async function main(): Promise<void> {
  const labels = JSON.parse(
    fs.readFileSync(path.join(DIR, 'calibration-labels.json'), 'utf8'),
  ) as Record<string, number>;
  const samples = fs
    .readFileSync(path.join(DIR, 'calibration-sample.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Sample)
    .filter((sample) => sample.id in labels);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  stopCronsForScript(app);
  try {
    const gate = app.get(RelevanceGateService);
    // Unique platform tag per run: no cached verdicts, no prod collisions.
    const platform = `calibration-${Date.now().toString(36)}`;
    const posts = samples.map((sample) => ({
      id: sample.id,
      title: sample.title,
      content: sample.body,
    })) as LLMPost[];

    const started = Date.now();
    const result = await gate.filterPosts(platform, posts);
    const keptIds = new Set(result.kept.map((post) => post.id));

    let tp = 0;
    let fn = 0;
    let fp = 0;
    let tn = 0;
    for (const sample of samples) {
      const shouldKeep = labels[sample.id] === 1;
      const kept = keptIds.has(sample.id);
      if (shouldKeep && kept) tp += 1;
      else if (shouldKeep && !kept) {
        fn += 1;
        console.log(`FALSE DROP: ${sample.id} "${sample.title}"`);
      } else if (!shouldKeep && kept) fp += 1;
      else tn += 1;
    }
    const recall = tp / Math.max(1, tp + fn);
    const precision = tp / Math.max(1, tp + fp);
    console.log(
      `\nposts=${samples.length} judged=${result.judged} in ${Math.round(
        (Date.now() - started) / 1000,
      )}s (platform=${platform})`,
    );
    console.log(
      `keep-recall=${recall.toFixed(3)} (tp=${tp} fn=${fn})  keep-precision=${precision.toFixed(3)} (fp=${fp} tn=${tn})`,
    );
    console.log(
      'Baseline under the OLD configuration (own client, prompt inline, implicit HIGH thinking): recall 1.000 / precision 0.776 at max density.',
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
