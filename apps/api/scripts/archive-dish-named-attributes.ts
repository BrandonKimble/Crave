/**
 * @script-class: probe
 * @finding: BANKED 2026-08-09 (junk-entity rederivation) — DO NOT --apply IN
 *   ITS CURRENT FORM. Dry run reports 36 collisions / 4,668 refs, but the
 *   name-collides-with-active-food predicate now sweeps in LEGITIMATE
 *   cuisine and dietary attributes (vegan, thai, sichuan, sicilian, turkish,
 *   vietnamese...) that only "collide" because cuisine-as-food residue
 *   entities still exist — applying would violate the dietary-never-dropped
 *   ruling (owner 2026-07-30) and the cuisine-both-sides law. The TRUE
 *   dish-type-attribute class (pizza: 166 events, ramen, sushi, salad bar)
 *   is now prevented at the source by the candidate prompt's "a dish type is
 *   never an attribute" rule (Step D.3) and its existing rows are repaired
 *   by the re-extract, which replaces the venue-attr claims with food
 *   claims. This script stays as the measurement probe only.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AttributeOntologyService,
  type AttributeEntityType,
  type CanonicalizationPlan,
} from '../src/modules/attribute-ontology/attribute-ontology.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * One-time cleanup (extraction-ideal-shape Phase 2b): archive every ACTIVE
 * attribute entity whose normalized name collides with an active FOOD
 * entity ("ramen", "pho", "sushi"... — 261 found on first audit). Reuses
 * applyPlan's rejection path so refs are stripped from food_attributes /
 * restaurant_attributes arrays and the tombstone becomes a resolution sink.
 * Report by default; --apply to execute.
 *
 *   yarn workspace api ts-node scripts/archive-dish-named-attributes.ts [--apply]
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const ontology = app.get(AttributeOntologyService);

    for (const type of [
      'food_attribute',
      'restaurant_attribute',
    ] as AttributeEntityType[]) {
      const collisions = await prisma.$queryRaw<
        Array<{ entityId: string; name: string }>
      >`
        SELECT a.entity_id AS "entityId", a.name
        FROM core_entities a
        WHERE a.type = ${type}::entity_type AND a.status = 'active'
          AND EXISTS (
            SELECT 1 FROM core_entities f
            WHERE f.type = 'food' AND f.status = 'active'
              AND lower(regexp_replace(f.name, '\s+', ' ', 'g')) =
                  lower(regexp_replace(a.name, '\s+', ' ', 'g'))
          )
        ORDER BY a.name
      `;
      out(`\n${type}: ${collisions.length} dish-named active attributes`);
      collisions.forEach((c) => out(`  ${c.name} (${c.entityId})`));
      if (!collisions.length) continue;

      const plan: CanonicalizationPlan = {
        type,
        scope: 'pending',
        candidateCount: collisions.length,
        promotions: [],
        merges: [],
        renames: [],
        rejections: collisions.map((c) => ({
          entityId: c.entityId,
          name: c.name,
          reason: 'dish-named attribute cleanup (Phase 2b)',
        })),
      };
      const result = await ontology.applyPlan(plan, { apply });
      out(
        `  ${apply ? 'APPLIED' : 'dry-run'}: rejections=${result.rejections} refsRemoved=${result.refsRemoved}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
