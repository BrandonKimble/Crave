/**
 * @script-class: operational
 *
 * RE-DERIVE `core_entities.aliases[]` FROM THE ALIAS ROWS.
 *
 * The array is a PROJECTION of the active, UNTAGGED (`locale='und'`) alias rows
 * — that is the P0-a law in the concept-graph plan. It exists because the array
 * is the unlocalized hub of the lexical system: the recall core's six arms, the
 * entity embedding doc, and the typo dictionary all read it, and none of them
 * takes a locale. A locale-tagged form in there matches for EVERY language.
 *
 * Rows written before P0-a projected tagged forms too, so this reconciles the
 * corpus to the law. It is idempotent and safe to re-run: `projectAliases` is
 * the one sanctioned writer, it takes its own row lock, and it only writes when
 * the projection actually differs (so unchanged entities are not touched and
 * their embeddings are not marked stale).
 *
 * Run:
 *   npx ts-node -T scripts/reproject-aliases.ts            # dry run
 *   npx ts-node -T scripts/reproject-aliases.ts --apply
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { projectAliases } from '../src/modules/content-processing/entity-resolver/entity-alias.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (message: string) => process.stdout.write(`${message}\n`);

  try {
    const prisma = app.get(PrismaService);

    // Entities whose array disagrees with the und-only projection. Two ways to
    // disagree: it CONTAINS a tagged form (the pre-P0-a leak), or it is missing
    // an untagged one (drift from any historical writer).
    const drifted = await prisma.$queryRawUnsafe<
      Array<{ entity_id: string; name: string }>
    >(`
      SELECT e.entity_id::text, e.name
      FROM core_entities e
      WHERE EXISTS (
              -- A tagged form in the array is a leak ONLY when no untagged row
              -- justifies it. Words identical across languages ('halal',
              -- 'kosher') carry BOTH an und row and a tagged one, and the und
              -- row is what legitimately puts them in the array.
              SELECT 1 FROM entity_alias ea
              WHERE ea.entity_id = e.entity_id
                AND ea.status = 'active' AND ea.locale <> 'und'
                AND ea.form = ANY(e.aliases)
                AND NOT EXISTS (
                      SELECT 1 FROM entity_alias u
                      WHERE u.entity_id = e.entity_id AND u.form = ea.form
                        AND u.locale = 'und' AND u.status = 'active'
                    )
            )
         OR EXISTS (
              SELECT 1 FROM entity_alias ea
              WHERE ea.entity_id = e.entity_id
                AND ea.status = 'active' AND ea.locale = 'und'
                AND NOT (ea.form = ANY(COALESCE(e.aliases, ARRAY[]::varchar[])))
            )
      ORDER BY e.name
    `);

    out(`entities needing re-projection: ${drifted.length}`);
    for (const row of drifted.slice(0, 15)) {
      out(`  ${row.name}`);
    }
    if (drifted.length > 15) {
      out(`  … and ${drifted.length - 15} more`);
    }

    if (!apply) {
      out('DRY RUN — nothing written. Re-run with --apply.');
      return;
    }

    let rewritten = 0;
    for (const row of drifted) {
      // markEmbeddingStale: the doc is built from the array, so a changed
      // projection genuinely changes the embedding input.
      await prisma.$transaction(async (tx) => {
        await projectAliases(tx, row.entity_id, { markEmbeddingStale: true });
      });
      rewritten += 1;
    }
    out(`re-projected ${rewritten} entities`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
