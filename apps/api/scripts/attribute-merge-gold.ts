/**
 * @script-class: probe
 * @finding: banked per-run in plans/attribute-merge-system.md (certification
 *   section) — 3x all-PASS is the release bar for attribute-merge-prompt.md.
 *
 * GOLD-CASE CERTIFICATION for the attribute-merge judge (the prompt-gold.ts
 * pattern applied to the merge lane): every contested boundary pinned by a
 * REAL case on BOTH sides, --repeat runs per case, PASS/FLAKY/FAIL. Goes
 * through LLMService (never a second Gemini client); never writes anything.
 *
 *   yarn workspace api ts-node scripts/attribute-merge-gold.ts [--repeat=3] [--only=<id>]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface GoldCase {
  id: string;
  why: string;
  kind: 'place_attribute' | 'item_attribute';
  a: string;
  b: string;
  expected: 'merge' | 'keep';
}

async function bootstrap(): Promise<void> {
  let repeat = 3;
  let only: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--repeat=')) repeat = Number(arg.split('=')[1]) || 3;
    else if (arg.startsWith('--only=')) only = arg.split('=')[1];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const fixture = JSON.parse(
    readFileSync(
      join(__dirname, 'fixtures/attribute-merge-gold-cases.json'),
      'utf8',
    ),
  ) as { cases: GoldCase[] };
  const cases = only
    ? fixture.cases.filter((c) => c.id === only)
    : fixture.cases;
  if (!cases.length) throw new Error(`No cases matched --only=${only}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (msg = '') => process.stdout.write(`${msg}\n`);

  try {
    const llm = app.get(LLMService);
    const hits = new Map<string, number>();
    for (let run = 1; run <= repeat; run += 1) {
      // One batched call per (kind, run) — the SAME transport the lane uses.
      for (const kind of ['place_attribute', 'item_attribute'] as const) {
        const slice = cases.filter((c) => c.kind === kind);
        if (!slice.length) continue;
        const verdicts = await llm.judgeAttributeMergesBatch({
          kind,
          pairs: slice.map((c) => ({ a: c.a, b: c.b })),
        });
        slice.forEach((goldCase, i) => {
          const got = verdicts[i]?.decision ?? 'keep';
          const pass = got === goldCase.expected;
          if (pass) hits.set(goldCase.id, (hits.get(goldCase.id) ?? 0) + 1);
          out(
            `run ${run}  ${pass ? 'PASS' : 'FAIL'}  ${goldCase.id}  ` +
              `"${goldCase.a}" vs "${goldCase.b}" -> ${got} ` +
              `(want ${goldCase.expected})  ${verdicts[i]?.reason ?? ''}`,
          );
        });
      }
    }

    out('\n==== CERTIFICATION ====');
    let allPass = true;
    for (const goldCase of cases) {
      const n = hits.get(goldCase.id) ?? 0;
      const grade = n === repeat ? 'PASS' : n > 0 ? 'FLAKY' : 'FAIL';
      if (grade !== 'PASS') allPass = false;
      out(`  ${grade.padEnd(6)} ${n}/${repeat}  ${goldCase.id}`);
    }
    out(
      allPass
        ? `\nALL ${cases.length} CASES PASS x${repeat} — prompt certified`
        : '\nNOT CERTIFIED — fix the prompt (and bump attribute-merge-rule.ts) before any apply run',
    );
    if (!allPass) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
