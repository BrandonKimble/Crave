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
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EntityResolutionService } from '../src/modules/content-processing/entity-resolver/entity-resolution.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const NYC = 'region-us-ny-new-york';
// term, type, expectation — variants of real seeded entities the old
// Sørensen-Dice + restaurant-token heuristics used to handle, now via LLM.
const CASES: {
  term: string;
  type: EntityType;
  expect: string;
}[] = [
  // restaurants: typo / accent / dropped-descriptor / brand
  {
    term: 'Noodle Villiage',
    type: EntityType.place,
    expect: 'Noodle Village',
  },
  {
    term: 'Caffe Panna',
    type: EntityType.place,
    expect: 'Caffè Panna',
  },
  {
    term: 'Almondine',
    type: EntityType.place,
    expect: 'Almondine Bakery',
  },
  {
    term: 'Quality Bistro NYC',
    type: EntityType.place,
    expect: 'Quality Bistro',
  },
  {
    term: 'Totally Fake Diner 9000',
    type: EntityType.place,
    expect: 'new',
  },
  // foods (global): spelling variant / added word / distinct
  { term: 'duck laab', type: EntityType.item, expect: 'duck larb' },
  {
    term: 'falafel pita sandwich',
    type: EntityType.item,
    expect: 'falafel pita',
  },
  {
    term: 'mugwort gelato',
    type: EntityType.item,
    expect: 'mugwort ice cream?',
  },
  {
    term: 'zzqqx imaginary noodle thing',
    type: EntityType.item,
    expect: 'new',
  },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const svc = app.get(EntityResolutionService);
    out('llm matcher (config.useLlmMatcher=true):');
    for (const c of CASES) {
      const res = await svc.resolveBatch(
        [
          {
            tempId: `probe::${c.term}`,
            normalizedName: c.term,
            originalText: c.term,
            entityType: c.type,
          },
        ],
        {
          allowEntityCreation: false,
          enableFuzzyMatching: true,
          useLlmMatcher: true,
        },
      );
      // Unmatched + creation-off entities are absent from results (existing
      // behavior) — treat absence as "new/unmatched".
      const r = res.resolutionResults[0];
      const got = !r
        ? 'unmatched (→ would create)'
        : `${r.resolutionTier} ${r.matchedName ? `→ ${r.matchedName}` : ''} conf=${r.confidence}`;
      out(`  "${c.term}"  [expect: ${c.expect}]\n      got: ${got}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
