/**
 * @script-class: probe
 * @finding: banked in plans/sameness-court-report.md (ablation section).
 *
 * CONTEXT-ABLATION REPLAY (owner-mandated validation for the sameness
 * court's D2 context standard): every gold case — which includes every
 * WRONG verdict from plans/judge-ledger-audit.md plus correct controls — is
 * judged twice through the rederived prompts: once BARE (context stripped:
 * no mention, no thread/home restaurants, no carriers — what the old judge
 * saw) and once ENRICHED (the full D2 wire). The flip table shows whether
 * the enriched context, not just the prompt text, is doing the work:
 *
 *   wrong→correct   context fixed it
 *   wrong→wrong     context is not the limiting factor for this case
 *   correct→broken  context REGRESSED it (must be zero)
 *
 * Cases whose doctrine needs no context (pure identity pins) land in
 * correct→correct and act as controls. Read-only; goes through LLMService.
 *
 *   yarn workspace api ts-node scripts/judge-context-ablation.ts [--repeat=1]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

interface EntityCase {
  id: string;
  kind: 'place' | 'item' | 'ingredient';
  term: string;
  mention?: string;
  threadPlace?: string;
  termHomePlaces?: string[];
  candidates: {
    name: string;
    aliases?: string[];
    homePlaces?: string[];
    samePlace?: boolean;
  }[];
  expected: 'match' | 'new' | 'reject';
  expectedCandidate?: number;
}

interface AttributeCase {
  id: string;
  kind: 'place_attribute' | 'item_attribute';
  term: string;
  candidates: { name: string; usedBy?: string[] }[];
  expected: 'match' | 'new' | 'reject';
  expectedCandidate?: number;
}

type Outcome = 'correct' | 'wrong';

async function bootstrap(): Promise<void> {
  let repeat = 1;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--repeat=')) repeat = Number(arg.split('=')[1]) || 1;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const entityCases = (
    JSON.parse(
      readFileSync(
        join(__dirname, 'fixtures/entity-match-gold-cases.json'),
        'utf8',
      ),
    ) as { cases: EntityCase[] }
  ).cases;
  const attributeCases = (
    JSON.parse(
      readFileSync(
        join(__dirname, 'fixtures/attribute-placement-gold-cases.json'),
        'utf8',
      ),
    ) as { cases: AttributeCase[] }
  ).cases;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (msg = '') => process.stdout.write(`${msg}\n`);

  const table = {
    'wrong→correct': [] as string[],
    'wrong→wrong': [] as string[],
    'correct→broken': [] as string[],
    'correct→correct': [] as string[],
  };

  try {
    const llm = app.get(LLMService);

    const judgeEntities = async (
      cases: EntityCase[],
      enriched: boolean,
    ): Promise<Map<string, Outcome>> => {
      const outcomes = new Map<string, Outcome>();
      for (const kind of ['place', 'item', 'ingredient'] as const) {
        const slice = cases.filter((c) => c.kind === kind);
        if (!slice.length) continue;
        const tally = new Map<string, number>();
        for (let run = 0; run < repeat; run += 1) {
          const verdicts = await llm.matchEntitiesBatch({
            kind,
            items: slice.map((c) => ({
              term: c.term,
              ...(enriched
                ? {
                    mention: c.mention ?? null,
                    threadPlace: c.threadPlace ?? null,
                    termHomePlaces: c.termHomePlaces,
                  }
                : {}),
              candidates: c.candidates.map((cand, i) => ({
                id: i,
                name: cand.name,
                aliases: cand.aliases,
                ...(enriched
                  ? { homePlaces: cand.homePlaces, samePlace: cand.samePlace }
                  : {}),
              })),
            })),
          });
          slice.forEach((c, i) => {
            const wantId = c.expectedCandidate ?? 0;
            const pass =
              verdicts[i]?.decision === c.expected &&
              (c.expected !== 'match' || verdicts[i]?.candidateId === wantId);
            if (pass) tally.set(c.id, (tally.get(c.id) ?? 0) + 1);
          });
        }
        for (const c of slice) {
          outcomes.set(
            c.id,
            (tally.get(c.id) ?? 0) > repeat / 2 ? 'correct' : 'wrong',
          );
        }
      }
      return outcomes;
    };

    const judgeAttributes = async (
      cases: AttributeCase[],
      enriched: boolean,
    ): Promise<Map<string, Outcome>> => {
      const outcomes = new Map<string, Outcome>();
      for (const c of cases) {
        let passes = 0;
        for (let run = 0; run < repeat; run += 1) {
          const result = await llm.placeAttribute({
            term: c.term,
            kind: c.kind,
            candidates: c.candidates.map((cand, i) => ({
              id: i,
              name: cand.name,
              ...(enriched ? { usedBy: cand.usedBy } : {}),
            })),
          });
          const wantId = c.expectedCandidate ?? 0;
          if (
            result.decision === c.expected &&
            (c.expected !== 'match' || result.candidateId === wantId)
          ) {
            passes += 1;
          }
        }
        outcomes.set(c.id, passes > repeat / 2 ? 'correct' : 'wrong');
      }
      return outcomes;
    };

    out(
      `Ablation replay: ${entityCases.length} entity + ${attributeCases.length} attribute cases, repeat=${repeat}\n`,
    );
    const [entityBare, entityRich, attrBare, attrRich] = [
      await judgeEntities(entityCases, false),
      await judgeEntities(entityCases, true),
      await judgeAttributes(attributeCases, false),
      await judgeAttributes(attributeCases, true),
    ];

    const fold = (
      bare: Map<string, Outcome>,
      rich: Map<string, Outcome>,
      prefix: string,
    ) => {
      for (const [id, before] of bare) {
        const after = rich.get(id);
        const key =
          before === 'wrong'
            ? after === 'correct'
              ? 'wrong→correct'
              : 'wrong→wrong'
            : after === 'correct'
              ? 'correct→correct'
              : 'correct→broken';
        table[key].push(`${prefix}:${id}`);
      }
    };
    fold(entityBare, entityRich, 'entity');
    fold(attrBare, attrRich, 'attr');

    out('==== FLIP TABLE (bare context → enriched context) ====');
    for (const [key, ids] of Object.entries(table)) {
      out(`\n${key} (${ids.length}):`);
      for (const id of ids) out(`  ${id}`);
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
