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

import { join } from 'path';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import {
  bootGoldApp,
  certify,
  loadGoldCases,
  out,
  parseGoldArgs,
} from './lib/gold-harness';

interface GoldCase {
  id: string;
  why: string;
  kind: 'place_attribute' | 'item_attribute';
  a: string;
  b: string;
  expected: 'merge' | 'keep';
}

async function bootstrap(): Promise<void> {
  const { repeat, only } = parseGoldArgs();
  const cases = loadGoldCases<GoldCase>(
    join(__dirname, 'fixtures/attribute-merge-gold-cases.json'),
    only,
  );
  const app = await bootGoldApp();

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

    certify(
      cases.map((c) => c.id),
      hits,
      repeat,
      {
        failureHint:
          'fix the prompt (and bump attribute-merge-rule.ts) before any apply run',
      },
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
