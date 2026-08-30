/**
 * @script-class: probe
 * @finding: banked in plans/category-move-report.md (D4 category move wild
 *   sample, 2026-08-30).
 *
 * WILD SANITY for the dish-knowledge `categories` facet (D4): run the v4
 * prompt on ~30 real staging dish names (sampled read-only 2026-08-30,
 * ORDER BY md5(entity_id)) plus the study's defect dishes, print the full
 * knowledge tuple per dish. Dry-run style — reads nothing from and writes
 * nothing to any database; goes through LlmService (never a second client).
 *
 *   yarn workspace api ts-node scripts/wild-dish-knowledge-categories.ts
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

const STAGING_SAMPLE = [
  'ube latte',
  'lemon bar',
  'hoyveyolay',
  'clams oreganata',
  'xochitl tamales',
  'gin gimlet',
  'corn salad',
  'banana muffin',
  'holy schnikes wings',
  'rice',
  'lunch sandwiches',
  'lamb',
  'cauliflower wings',
  'redfish fried rice',
  'penicillin',
  'pretzel burger',
  'tom kha',
  'cowboy',
  'bbq pork and wonton noodle soup',
  'mushroom sandwich',
  'no. 11 cocktail',
  'smoked duck',
  'double pepper chicken',
  'crab asparagus soup',
  'cashiola',
  'asian chicken salad',
  'picadillo taco',
  'reuben',
  'shepherds pie',
  'cottage cheese and peaches',
  'fried green tomato sandwich',
  'dry sauteed green bean',
  'machaca taco',
];

/** The study's hand-judged defect dishes (post-reconciliation errors). */
const STUDY_DEFECTS = [
  'eggplant parm',
  'soup dumplings',
  'omakase',
  'spring roll',
  'queso and chips',
  'italian beef sandwich',
  'spinach and mushroom enchiladas',
  '7 course menu',
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const llm = app.get(LLMService);
  const names = [...STAGING_SAMPLE, ...STUDY_DEFECTS];
  const results = await llm.synthesizeDishKnowledgeBatch(
    names.map((name) => ({ name })),
  );
  for (let i = 0; i < names.length; i += 1) {
    const r = results[i];
    console.log(
      JSON.stringify({
        dish: names[i],
        categories: r?.categories ?? [],
        cuisines: r?.cuisines ?? [],
      }),
    );
  }
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
