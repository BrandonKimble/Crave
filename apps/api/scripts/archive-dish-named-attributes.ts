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
