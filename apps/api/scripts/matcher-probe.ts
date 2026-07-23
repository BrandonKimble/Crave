import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EntityResolutionService } from '../src/modules/content-processing/entity-resolver/entity-resolution.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const NYC = 'region-us-ny-new-york';
// term, type, market, expectation — variants of real seeded entities the old
// Sørensen-Dice + restaurant-token heuristics used to handle, now via LLM.
const CASES: {
  term: string;
  type: EntityType;
  market?: string;
  expect: string;
}[] = [
  // restaurants (market-scoped): typo / accent / dropped-descriptor / brand
  {
    term: 'Noodle Villiage',
    type: EntityType.restaurant,
    market: NYC,
    expect: 'Noodle Village',
  },
  {
    term: 'Caffe Panna',
    type: EntityType.restaurant,
    market: NYC,
    expect: 'Caffè Panna',
  },
  {
    term: 'Almondine',
    type: EntityType.restaurant,
    market: NYC,
    expect: 'Almondine Bakery',
  },
  {
    term: 'Quality Bistro NYC',
    type: EntityType.restaurant,
    market: NYC,
    expect: 'Quality Bistro',
  },
  {
    term: 'Totally Fake Diner 9000',
    type: EntityType.restaurant,
    market: NYC,
    expect: 'new',
  },
  // foods (global): spelling variant / added word / distinct
  { term: 'duck laab', type: EntityType.food, expect: 'duck larb' },
  {
    term: 'falafel pita sandwich',
    type: EntityType.food,
    expect: 'falafel pita',
  },
  {
    term: 'mugwort gelato',
    type: EntityType.food,
    expect: 'mugwort ice cream?',
  },
  {
    term: 'zzqqx imaginary noodle thing',
    type: EntityType.food,
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
            marketKey: c.market ?? null,
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
