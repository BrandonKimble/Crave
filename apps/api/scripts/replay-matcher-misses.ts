/**
 * @script-class: probe
 * @finding: (to be recorded) — replay the resolver's RECALL layer for the 23
 * v7 shadow twin names: was the anchor IN the shortlist (judge fail-open said
 * 'new') or ABSENT (recall miss)? Distinguishes which free layer underperforms.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { EntityType } from '@prisma/client';

const CASES: Array<[string, string]> = [
  ['Arlo S', "Arlo's"],
  ['Birdies', "Birdie's"],
  ['Chi Cha San Chen', 'ChiCha San Chen'],
  ['Deans', "Dean's"],
  ['Dunkin', "Dunkin'"],
  ['Gaidos', "Gaido's"],
  ['Hildas Tortillas', "Hilda's Tortillas"],
  ['Honeymoon Spiritlounge', 'Honey Moon Spirit Lounge'],
  ['House Of Three Gorges', 'House of Three Gorges (三峡人家)'],
  ['Joes Bakery', "Joe's Bakery"],
  ['Justines', "Justine's"],
  ['Mcdonalds', "McDonald's"],
  ['Pf Changs', "P.F. Chang's"],
  ['Pulltab Coffee', 'Pull-tab Coffee'],
  ['Rabels Roadhaus Bbq', 'Rabel’s Roadhaus BBQ'],
  ['Susie Cakes', 'Susiecakes'],
  ['Vincents', "Vincent's"],
  ['Every Daily', 'everydaily'],
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  try {
    const search = app.get(EntityTextSearchService);
    let inShortlist = 0;
    for (const [twin, anchor] of CASES) {
      const cands = await search.retrieveCandidates(
        twin.toLowerCase(),
        [EntityType.restaurant],
        8,
        { engineId: null, denseMode: 'always', requestLocale: null },
      );
      const names = cands.map((c) => (c as { name?: string }).name ?? '');
      const hit = names.some(
        (n) =>
          n.toLowerCase().replace(/[^a-z0-9]/g, '') ===
          anchor.toLowerCase().replace(/[^a-z0-9]/g, ''),
      );
      if (hit) inShortlist += 1;
      console.log(
        `${hit ? 'SHORTLISTED' : 'RECALL-MISS'}  ${twin} -> ${anchor}  [${names.slice(0, 4).join(' | ')}]`,
      );
    }
    console.log(
      `\n${inShortlist}/${CASES.length} anchors were in the shortlist (judge declined) — the rest never reached the judge`,
    );
  } finally {
    await app.close();
  }
}
void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
