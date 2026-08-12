/**
 * @script-class: probe
 * @finding: 2026-08-11 — after the identity-key exact probe + joined-identity
 * tier, all 18 v7-shadow twin names resolve 18/18 via DETERMINISTIC tiers
 * (LLM matcher off): 10 exact, 8 alias/joined, zero judge calls.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EntityResolutionService } from '../src/modules/content-processing/entity-resolver/entity-resolution.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';
import { EntityType } from '@prisma/client';

const TWINS = [
  'Arlo S',
  'Birdies',
  'Chi Cha San Chen',
  'Deans',
  'Dunkin',
  'Gaidos',
  'Hildas Tortillas',
  'Honeymoon Spiritlounge',
  'House Of Three Gorges',
  'Joes Bakery',
  'Justines',
  'Mcdonalds',
  'Pf Changs',
  'Pulltab Coffee',
  'Rabels Roadhaus Bbq',
  'Susie Cakes',
  'Vincents',
  'Every Daily',
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  try {
    const resolver = app.get(EntityResolutionService);
    const { resolutionResults } = await resolver.resolveBatch(
      TWINS.map((name, i) => ({
        tempId: `t${i}`,
        normalizedName: name,
        originalText: name,
        entityType: EntityType.restaurant,
      })),
      {
        batchSize: 100,
        enableFuzzyMatching: true,
        allowEntityCreation: false,
        useLlmMatcher: false,
      },
    );
    let claimed = 0;
    for (let i = 0; i < TWINS.length; i++) {
      const r = resolutionResults.find((x) => x.tempId === `t${i}`);
      const ok = r?.entityId ? 'CLAIMED' : 'MISS   ';
      if (r?.entityId) claimed++;
      console.log(
        `${ok} ${TWINS[i]} -> ${r?.matchedName ?? '-'} [${r?.resolutionTier ?? 'dropped'}]`,
      );
    }
    console.log(
      `\n${claimed}/${TWINS.length} claimed by DETERMINISTIC tiers (LLM matcher off)`,
    );
  } finally {
    await app.close();
  }
}
void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
