/**
 * @script-class: probe
 * @finding: banked in plans/sameness-court-report.md ("Rulings applied
 *   2026-08-30" section) — population-scale replay of historical attribute
 *   placement/merge decisions (staging llm_decision_records sample) through
 *   the searcher-tolerance-rederived prompts. READ-ONLY: reports what WOULD
 *   change; never writes.
 *
 *   yarn workspace api ts-node scripts/attribute-replay-rulings.ts \
 *     --placement=<sample.json> --merge=<sample.json>
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface PlacementRow {
  id: string;
  input: {
    term: string;
    kind: 'place_attribute' | 'item_attribute';
    candidates: { id: number; name: string }[];
  };
  decision: { decision: string; candidateId: number | null; reason?: string };
}

interface MergeRow {
  id: string;
  input: { a: string; b: string; kind: 'place_attribute' | 'item_attribute' };
  decision: { decision: string; reason?: string };
}

async function bootstrap(): Promise<void> {
  let placementPath: string | null = null;
  let mergePath: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--placement=')) placementPath = arg.slice(12);
    else if (arg.startsWith('--merge=')) mergePath = arg.slice(8);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const out = (msg = '') => process.stdout.write(`${msg}\n`);
  const llm = app.get(LLMService);

  try {
    if (mergePath) {
      const rows = JSON.parse(readFileSync(mergePath, 'utf8')) as MergeRow[];
      const tally = new Map<string, number>();
      const flips: string[] = [];
      for (const kind of ['place_attribute', 'item_attribute'] as const) {
        const slice = rows.filter((r) => r.input.kind === kind);
        for (let i = 0; i < slice.length; i += 25) {
          const batch = slice.slice(i, i + 25);
          const verdicts = await llm.judgeAttributeMergesBatch({
            kind,
            pairs: batch.map((r) => ({ a: r.input.a, b: r.input.b })),
          });
          batch.forEach((row, j) => {
            const oldD = row.decision.decision;
            const newD = verdicts[j]?.decision ?? 'keep';
            tally.set(
              `${oldD}->${newD}`,
              (tally.get(`${oldD}->${newD}`) ?? 0) + 1,
            );
            if (oldD !== newD)
              flips.push(
                `  ${kind}  "${row.input.a}" vs "${row.input.b}"  ${oldD}->${newD}  (${verdicts[j]?.reason ?? ''})`,
              );
          });
        }
      }
      out(`\n==== MERGE LANE (${rows.length} historical pairs) ====`);
      for (const [k, v] of [...tally].sort()) out(`  ${k}: ${v}`);
      out(`flips (${flips.length}):`);
      flips.forEach((f) => out(f));
    }

    if (placementPath) {
      const rows = JSON.parse(
        readFileSync(placementPath, 'utf8'),
      ) as PlacementRow[];
      const tally = new Map<string, number>();
      const flips: string[] = [];
      for (const row of rows) {
        const result = await llm.placeAttribute({
          term: row.input.term,
          kind: row.input.kind,
          candidates: row.input.candidates,
        });
        const oldD = row.decision.decision;
        const newD = result.decision;
        const same =
          oldD === newD &&
          (newD !== 'match' || result.candidateId === row.decision.candidateId);
        const key = same ? `${oldD} (same)` : `${oldD}->${newD}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
        if (!same) {
          const oldC =
            row.decision.candidateId != null
              ? row.input.candidates.find(
                  (c) => c.id === row.decision.candidateId,
                )?.name
              : null;
          const newC =
            result.candidateId != null
              ? row.input.candidates.find((c) => c.id === result.candidateId)
                  ?.name
              : null;
          flips.push(
            `  ${row.input.kind}  "${row.input.term}"  ${oldD}${oldC ? `(${oldC})` : ''}->${newD}${newC ? `(${newC})` : ''}  (${result.reason ?? ''})`,
          );
        }
      }
      out(`\n==== PLACEMENT LANE (${rows.length} historical decisions) ====`);
      for (const [k, v] of [...tally].sort()) out(`  ${k}: ${v}`);
      out(`changes (${flips.length}):`);
      flips.forEach((f) => out(f));
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
