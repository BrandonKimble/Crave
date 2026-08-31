/**
 * @script-class: probe
 *
 * THE STANDING VERDICT-REPLAY REGRESSION HARNESS (owner-ordered
 * 2026-08-30; design in plans/verdict-replay-harness.md). For any judged
 * lane: sample its ledgered verdicts (stratified — recent + random +
 * every outcome class), re-judge each under the CURRENT prompt/rule
 * version, and print the change table:
 *
 *   unchanged     today's judge agrees with the ledger
 *   flipped       old→new with both reasons — the drift signal
 *   unreplayable  inputs no longer reconstructable, counted honestly
 *
 * READ-ONLY ALWAYS: no verdict is ever written. Spend is bounded by the
 * sample cap (default 100, hard cap 500 per lane) and reported as
 * MEASURED usage-ledger traffic. Exempt from the rehearing budget by
 * design: that budget bounds verdict-BUYING drains; this buys none.
 *
 *   yarn workspace api ts-node scripts/verdict-replay.ts --lane=entity_match
 *   yarn workspace api ts-node scripts/verdict-replay.ts --all --sample=50 \
 *     --out=/tmp/replay-summary.json
 *
 * Point DATABASE_URL at staging for a staging replay; the harness only
 * reads claim_verdicts/core tables and only writes stdout + --out.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { writeFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { WordVocabularyJudgeService } from '../src/modules/content-processing/entity-resolver/word-vocabulary-judge.service';
import { buildVerdictReplayRegistry } from '../src/modules/content-processing/verdict-replay/verdict-replay-adapters';
import { VerdictReplayRunner } from '../src/modules/content-processing/verdict-replay/verdict-replay.service';
import {
  DEFAULT_SAMPLE,
  HARD_SAMPLE_CAP,
  LaneReplayReport,
  ReplaySummary,
} from '../src/modules/content-processing/verdict-replay/verdict-replay.types';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function bootstrap(): Promise<void> {
  let lane: string | null = null;
  let sample = DEFAULT_SAMPLE;
  let all = false;
  let outPath: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--lane=')) lane = arg.slice(7);
    else if (arg === '--all') all = true;
    else if (arg.startsWith('--sample=')) sample = Number(arg.slice(9)) || 0;
    else if (arg.startsWith('--out=')) outPath = arg.slice(6);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!lane && !all) {
    throw new Error('Pass --lane=<lane> or --all');
  }
  if (sample < 1 || sample > HARD_SAMPLE_CAP) {
    throw new Error(
      `--sample must be 1..${HARD_SAMPLE_CAP} (the invocation spend cap)`,
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (msg = '') => process.stdout.write(`${msg}\n`);

  try {
    const registry = buildVerdictReplayRegistry({
      prisma: app.get(PrismaService),
      llm: app.get(LLMService),
      wordJudge: app.get(WordVocabularyJudgeService),
    });
    const runner = new VerdictReplayRunner(app.get(PrismaService), registry);
    const lanes = all ? registry.lanes() : [lane as string];

    const reports: LaneReplayReport[] = [];
    for (const laneName of lanes) {
      out(`\n==== LANE ${laneName} (sample cap ${sample}) ====`);
      const report = await runner.replayLane(laneName, sample);
      reports.push(report);
      if (!report.implemented) {
        out(`  NO ADAPTER — ${report.noAdapterReason}`);
        continue;
      }
      out(
        `  rule v${report.currentRuleVersion} | sampled ${report.sampled} | ` +
          `unchanged ${report.unchanged} | flipped ${report.flipped.length} ` +
          `(rate ${(report.flipRate * 100).toFixed(1)}%) | ` +
          `unreplayable ${report.unreplayable}`,
      );
      for (const [note, count] of Object.entries(report.unreplayableNotes)) {
        out(`    unreplayable ${note}: ${count}`);
      }
      for (const [key, count] of Object.entries(report.flipTransitions)) {
        out(`    flip ${key}: ${count}`);
      }
      for (const flip of report.flipped) {
        out(
          `    FLIP ${flip.claimKey}\n` +
            `      stored (v${flip.storedRuleVersion}): ${flip.storedOutcome}` +
            ` — ${flip.storedReason}\n` +
            `      now: ${flip.newOutcome} — ${flip.newReason ?? '(no reason)'}`,
        );
      }
      out(
        `  measured usage: ${report.usage.requests} gemini requests, ` +
          `${report.usage.inputTokens} in / ${report.usage.outputTokens} out tokens`,
      );
    }

    const summary: ReplaySummary = {
      generatedAt: new Date().toISOString(),
      sampleCapPerLane: sample,
      lanes: reports,
    };
    if (outPath) {
      writeFileSync(outPath, JSON.stringify(summary, null, 2));
      out(`\nSummary written to ${outPath}`);
    }
    out('\n==== DRIFT SUMMARY ====');
    for (const report of reports) {
      out(
        report.implemented
          ? `  ${report.lane}: flip-rate ${(report.flipRate * 100).toFixed(1)}% ` +
              `(${report.flipped.length}/${report.unchanged + report.flipped.length} compared)`
          : `  ${report.lane}: NO ADAPTER`,
      );
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
