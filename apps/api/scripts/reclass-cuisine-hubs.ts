import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LLMService } from '../src/modules/external-integrations/llm/llm.service';
import { EntitySiblingEdgeBuilderService } from '../src/modules/entity-text-search/entity-sibling-edge-builder.service';

/**
 * One-shot CUISINE-HUB reclass migration. `{cuisine} food/meal/dish` names were
 * LLM-fabricated as dishes before the collection prompt's Step-4.2 empty-set
 * gate existed; as type='food' entities they poison search (a hub id in the
 * filter drags every restaurant of that cuisine into the ranking) and pollute
 * the dense sibling graph. This ARCHIVES them (reversible; every read path
 * filters status='active') and rebuilds the sibling edges so hub neighbors
 * vanish. Legit categories (comfort/soul/street/breakfast food, egg dish,
 * family meal…) are spared by the same semantic test the prompt gate uses,
 * via one batched LLM classification (fail-closed: unclassified = spared).
 *
 *   yarn ts-node scripts/reclass-cuisine-hubs.ts           # dry run
 *   APPLY=1 yarn ts-node scripts/reclass-cuisine-hubs.ts   # archive + rebuild
 */
async function main(): Promise<void> {
  const apply = process.env.APPLY === '1';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const llm = app.get(LLMService);

    const candidates = await prisma.$queryRawUnsafe<
      { entity_id: string; name: string; conns: bigint }[]
    >(
      `SELECT e.entity_id, e.name,
              (SELECT count(*) FROM core_restaurant_items c WHERE c.food_id = e.entity_id) AS conns
       FROM core_entities e
       WHERE e.type='food' AND e.status='active'
         AND (lower(e.name) LIKE '% food' OR lower(e.name) LIKE '% meal'
              OR lower(e.name) LIKE '% dish' OR lower(e.name) LIKE '% dishes')
       ORDER BY e.name`,
    );
    out(`Candidates: ${candidates.length}`);

    const verdicts = await llm.classifyCuisineHubs(
      candidates.map((c) => c.name),
    );
    const verdictByName = new Map(
      verdicts.map((v) => [v.name.toLowerCase(), v.isCuisineHub]),
    );

    const hubs = candidates.filter(
      (c) => verdictByName.get(c.name.toLowerCase()) === true,
    );
    const spared = candidates.filter(
      (c) => verdictByName.get(c.name.toLowerCase()) !== true,
    );

    out('');
    out(`ARCHIVE (${hubs.length} cuisine hubs):`);
    for (const h of hubs) out(`  - ${h.name}  (${h.conns} connections)`);
    out('');
    out(`SPARE (${spared.length} legit categories):`);
    for (const s of spared) out(`  - ${s.name}`);

    if (!apply) {
      out('');
      out('DRY RUN — re-run with APPLY=1 to archive + rebuild sibling edges.');
      return;
    }

    const ids = hubs.map((h) => h.entity_id);
    if (ids.length) {
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE core_entities SET status='archived', last_updated=now()
         WHERE entity_id = ANY($1::uuid[]) AND type='food'`,
        ids,
      );
      out(`Archived ${updated} entities.`);

      // De-pollute the derived graphs: sibling edges (hub neighbors vanish) and
      // category edges (hub ids can appear as categories on connections).
      const builder = app.get(EntitySiblingEdgeBuilderService);
      const { anchors, edges } = await builder.rebuildAll();
      out(`Sibling edges rebuilt: ${anchors} anchors → ${edges} edges.`);
      const purged = await prisma.$executeRawUnsafe(
        `DELETE FROM derived_food_category_edges
         WHERE category_id = ANY($1::uuid[]) OR food_id = ANY($1::uuid[])`,
        ids,
      );
      out(`Category edges purged: ${purged}.`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
