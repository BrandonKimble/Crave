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
  term: string;
  candidates: { name: string; usedBy?: string[] }[];
  expected: 'match' | 'new' | 'reject';
  expectedCandidate?: number;
}

async function bootstrap(): Promise<void> {
  const { repeat, only } = parseGoldArgs();
  const cases = loadGoldCases<GoldCase>(
    join(__dirname, 'fixtures/attribute-placement-gold-cases.json'),
    only,
  );
  const app = await bootGoldApp();

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

    certify(
      cases.map((c) => c.id),
      hits,
      repeat,
      { failureHint: 'fix the prompt before the ontology hears with it' },
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
