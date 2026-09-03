/**
 * @script-class: probe
 * @finding: banked per-run in plans/sameness-court-report.md (certification
 *   section) — 3x all-PASS is the release bar for entity-match-prompt.md.
 *
 * GOLD-CASE CERTIFICATION for the identity court (the attribute-merge-gold
 * pattern applied to the entity_match/entity_dedupe judge): every WRONG
 * verdict from plans/judge-ledger-audit.md pinned on its correct side, every
 * doctrine boundary pinned both sides, --repeat runs per case,
 * PASS/FLAKY/FAIL. Goes through LLMService.matchEntitiesBatch — the SAME
 * transport both lanes use — and never writes anything.
 *
 *   yarn workspace api ts-node scripts/entity-match-gold.ts [--repeat=3] [--only=<id>]
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

interface GoldCandidate {
  name: string;
  aliases?: string[];
  homePlaces?: string[];
  samePlace?: boolean;
}

interface GoldCase {
  id: string;
  why: string;
  kind: 'place' | 'item' | 'ingredient';
  term: string;
  mention?: string;
  threadPlace?: string;
  termHomePlaces?: string[];
  candidates: GoldCandidate[];
  expected: 'match' | 'new' | 'reject';
  /** For multi-candidate matches: the candidate index the match must name.
   *  Defaults to 0 when expected === 'match'. */
  expectedCandidate?: number;
}

async function bootstrap(): Promise<void> {
  const { repeat, only } = parseGoldArgs();
  const cases = loadGoldCases<GoldCase>(
    join(__dirname, 'fixtures/entity-match-gold-cases.json'),
    only,
  );
  const app = await bootGoldApp();

  try {
    const llm = app.get(LLMService);
    const hits = new Map<string, number>();
    for (let run = 1; run <= repeat; run += 1) {
      // One batched call per (kind, run) — the SAME transport the lanes use.
      for (const kind of ['place', 'item', 'ingredient'] as const) {
        const slice = cases.filter((c) => c.kind === kind);
        if (!slice.length) continue;
        const verdicts = await llm.matchEntitiesBatch({
          kind,
          items: slice.map((c) => ({
            term: c.term,
            mention: c.mention ?? null,
            threadPlace: c.threadPlace ?? null,
            termHomePlaces: c.termHomePlaces,
            candidates: c.candidates.map((cand, i) => ({
              id: i,
              name: cand.name,
              aliases: cand.aliases,
              homePlaces: cand.homePlaces,
              samePlace: cand.samePlace,
            })),
          })),
        });
        slice.forEach((goldCase, i) => {
          const got = verdicts[i]?.decision ?? 'new';
          const wantId = goldCase.expectedCandidate ?? 0;
          const pass =
            got === goldCase.expected &&
            (goldCase.expected !== 'match' ||
              verdicts[i]?.candidateId === wantId);
          if (pass) hits.set(goldCase.id, (hits.get(goldCase.id) ?? 0) + 1);
          out(
            `run ${run}  ${pass ? 'PASS' : 'FAIL'}  ${goldCase.id}  ` +
              `"${goldCase.term}" -> ${got}` +
              `${verdicts[i]?.candidateId != null ? `#${verdicts[i]?.candidateId}` : ''} ` +
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
          'fix the prompt (and bump entity-dedupe-rule.ts) before it ships',
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
