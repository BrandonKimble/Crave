import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { SearchQueryInterpretationService } from '../src/modules/search/search-query-interpretation.service';
import type { NaturalSearchRequestDto } from '../src/modules/search/dto/search-query.dto';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

// NYC viewport so the market resolves to region-us-ny-new-york.
const NYC_BOUNDS = {
  northEast: { lat: 40.83, lng: -73.9 },
  southWest: { lat: 40.68, lng: -74.02 },
};

const QUERIES = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PROBES = QUERIES.length
  ? QUERIES
  : [
      'noodle village',
      'pizza near me',
      'duck larb',
      'cozy spot with outdoor seating',
    ];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const svc = app.get(SearchQueryInterpretationService);
    for (const q of PROBES) {
      const res = await svc.interpret({
        query: q,
        bounds: NYC_BOUNDS,
      } as NaturalSearchRequestDto);
      const g = res.structuredRequest.entities;
      const fmt = (label: string, arr?: { normalizedName: string }[]) =>
        arr?.length
          ? `${label}=[${arr.map((e) => e.normalizedName).join(', ')}]`
          : '';
      const parts = [
        fmt('rest', g.restaurants),
        fmt('food', g.food),
        fmt('fAttr', g.foodAttributes),
        fmt('rAttr', g.restaurantAttributes),
      ].filter(Boolean);
      const unresolved = res.unresolved
        .flatMap((u) => u.terms.map((t) => `${t}(${u.type})`))
        .join(', ');
      out('');
      out(`════ "${q}"  [${res.phaseTimings?.entityResolutionMs}ms link] ════`);
      out(`  linked:     ${parts.join('  ') || '—'}`);
      out(`  unresolved: ${unresolved || '—'}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
