/**
 * @script-class: operational (one-shot triage lever for the v7 shadow diff)
 *
 * AUTO tier of the re-extract diff review (skill: .claude/skills/reextract):
 * shadow-minted restaurant entities whose NORMALIZED name equals an existing
 * anchor's, with overlapping community evidence, are the same venue — the
 * resolver missed only because shadow mode defers Places grounding (the
 * place_id merge net). Merge the shadow twin INTO the anchor via the ONE
 * merge rule (RestaurantEntityMergeService), which rehomes events and
 * rebuilds projections.
 *
 *   yarn workspace api ts-node scripts/reextract-merge-twins.ts [--apply]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RestaurantEntityMergeService } from '../src/modules/restaurant-enrichment/restaurant-entity-merge.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

// anchor (canonical, pre-existing) <- shadow twin (duplicate, v7-minted).
// Derived from logs/reextract-review-20260810-055636.txt + a community-
// overlap check; the "bo ne"/"bone" fold collision (Vietnamese bò né) and
// the food_attribute rows are deliberately NOT here — restaurants only.
const PAIRS: Array<[string, string]> = [
  [
    'b3b81d12-2def-40e5-b811-5eb1beb64cc0',
    '2731ad9f-f508-470d-a40d-207e22fb768a',
  ],
  [
    '14006768-0a58-4f83-9bd5-57c53def2f04',
    '190293a2-96a1-4a1c-9041-f5742f43ac97',
  ],
  [
    '5d37585a-b1f7-4332-80b1-a7d899407f1d',
    '3b7b4d5f-9883-4c43-8e77-1096d2e8d992',
  ],
  [
    '13c0e896-eaba-450d-917e-c00f009dbf97',
    '168aed25-37b4-4ea9-84d9-2c267428cf75',
  ],
  [
    'f0276ae7-6a56-4897-9f81-848623cd80fb',
    '27f1c5a9-c9cc-48dc-9025-e8fd8a0982b5',
  ],
  [
    '811c3e5d-e91d-402d-b0e9-0e15ac97aa21',
    '68a8af55-ca2f-4e51-8792-eb43e436cc1c',
  ],
  [
    'afff1fc3-9c79-4948-b06e-66031bfa97b0',
    '0b34b634-9886-45bb-be47-853849f0ae8a',
  ],
  [
    '3d10220f-3d3b-45bf-8d86-efd6b99d93b2',
    '5f65876a-02ac-4215-94fd-817f250874f3',
  ],
  [
    'dd612976-b40c-424e-b7e1-574ed74364ac',
    'd9379c40-dbef-431b-b97d-3dc3c5aee3e8',
  ],
  [
    'ccd15a96-055b-4a15-bc35-12afd4c86e9a',
    '57c8d885-4786-4768-a545-11043539d5f3',
  ],
  [
    '01e9f4e2-458c-4ab6-bf7c-5615e99ba4ea',
    'c1fef8dd-f50b-4416-bfb2-86dd378cbce2',
  ],
  [
    'f8493c8a-8a0e-436d-aef1-cf880628200b',
    '8910743c-4cd4-4482-a338-369af487ee82',
  ],
  [
    '3f76eedc-6a63-47ee-9b2b-f2c6ca4810d1',
    '75263f09-46cf-403a-9597-67f022bb1a74',
  ],
  [
    'df5b530a-c43f-440f-ba04-b493d422fb89',
    '9487e0db-a5fb-42f4-ac45-fd27c8bfcf36',
  ],
  [
    '194b8eb7-0cc9-4278-a7b8-28567ab02f7f',
    '140ad361-7721-4ec8-8fef-ef6cf4ecc404',
  ],
  [
    '9dbea2d9-fa27-4e16-b63c-b504feea916f',
    'cb11ec90-2f6b-445a-9797-43ce1ee37f7f',
  ],
  [
    '275e66c8-5c10-4125-8532-81d722fd7139',
    'dea15ccb-1f7f-42ed-912c-0554128749b9',
  ],
  [
    'e9ba83f4-f64d-4606-8071-da06f8372999',
    '80452092-8d5c-4515-a28d-b5339bcaa8cf',
  ],
  [
    '6c4774b2-b990-4ab3-a8cf-2ec0c0caa49c',
    '9d035d3f-7d00-4011-9f19-82728d58254d',
  ],
  [
    'e043ca0f-0986-4aaf-a33a-31b6a0fd59c8',
    'd8c83bca-0184-4edc-b45c-83f19214a8d3',
  ],
  [
    '08c09740-134b-4697-b488-882fb2c03adf',
    '701800d4-1053-44b4-85c6-6d2c7f9560f1',
  ],
  [
    '88657994-f74f-4bdc-8b30-84e00a8dfc0a',
    '35b9a879-1d6f-49c8-be80-73a3a69763d9',
  ],
  [
    '8d1d0d84-2f52-4975-90c5-29a71de15ae7',
    '438d98eb-31bb-4e9d-9611-ace1d5c1c554',
  ],
];

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m: string) => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const merger = app.get(RestaurantEntityMergeService);
    let merged = 0;
    for (const [anchorId, shadowId] of PAIRS) {
      const canonical = await prisma.entity.findUnique({
        where: { entityId: anchorId },
      });
      const duplicate = await prisma.entity.findUnique({
        where: { entityId: shadowId },
      });
      if (!canonical || !duplicate) {
        out(`SKIP  ${anchorId} <- ${shadowId} (missing row)`);
        continue;
      }
      if (canonical.type !== 'restaurant' || duplicate.type !== 'restaurant') {
        out(`SKIP  ${canonical.name} (non-restaurant)`);
        continue;
      }
      out(
        `${apply ? 'MERGE' : 'would'} ${canonical.name} <- ${duplicate.name}`,
      );
      if (apply) {
        await merger.mergeDuplicateRestaurant({
          canonical: canonical as never,
          duplicate: duplicate as never,
          canonicalUpdate: {},
        });
        merged += 1;
      }
    }
    out(`${apply ? 'APPLIED' : 'dry-run'}: merged=${merged}/${PAIRS.length}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
