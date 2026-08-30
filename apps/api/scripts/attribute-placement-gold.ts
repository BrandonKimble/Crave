/**
 * @script-class: probe
 * @finding: banked per-run in plans/sameness-court-report.md (certification
 *   section) — 3x all-PASS is the release bar for attribute-placement-prompt.md.
 *
 * GOLD-CASE CERTIFICATION for the placement bench (the attribute-merge-gold
 * pattern applied to the intake court): every WRONG verdict from
 * plans/judge-ledger-audit.md lane 3 pinned correct-side, every contested
 * boundary pinned both sides. Goes through LLMService.placeAttribute — the
 * SAME transport the ontology uses — and never writes anything.
 *
 *   yarn workspace api ts-node scripts/attribute-placement-gold.ts [--repeat=3] [--only=<id>]
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
  term: string;
  candidates: { name: string; usedBy?: string[] }[];
  expected: 'match' | 'new' | 'reject';
  expectedCandidate?: number;
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
      join(__dirname, 'fixtures/attribute-placement-gold-cases.json'),
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
      for (const goldCase of cases) {
        const result = await llm.placeAttribute({
          term: goldCase.term,
          kind: goldCase.kind,
          candidates: goldCase.candidates.map((c, i) => ({
            id: i,
            name: c.name,
            usedBy: c.usedBy,
          })),
        });
        const wantId = goldCase.expectedCandidate ?? 0;
        const pass =
          result.decision === goldCase.expected &&
          (goldCase.expected !== 'match' || result.candidateId === wantId);
        if (pass) hits.set(goldCase.id, (hits.get(goldCase.id) ?? 0) + 1);
        out(
          `run ${run}  ${pass ? 'PASS' : 'FAIL'}  ${goldCase.id}  ` +
            `"${goldCase.term}" -> ${result.decision}` +
            `${result.candidateId != null ? `#${result.candidateId}` : ''} ` +
            `(want ${goldCase.expected})  ${result.reason ?? ''}`,
        );
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
        : '\nNOT CERTIFIED — fix the prompt before the ontology hears with it',
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
