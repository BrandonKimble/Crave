/**
 * @script-class: repair
 *
 * SURFACE-CLAIM RECONCILIATION — collapse the two surface stores into ONE
 * claims registry (concept-graph §9.9, owner-ruled 2026-08-07).
 *
 * Labels were being searched as grounding surfaces (lane 4) with NO claim
 * law — five wrong labels (`taco` on "good taco") ground confidently past a
 * guard that only watches aliases. The ideal: surfaces GROUND, labels
 * DISPLAY, one store per law. This script performs the one-time move:
 *
 *   1. Every active label surface absent from the alias store is offered to
 *      `addAliases` (the guard applies — uncontested surfaces bank).
 *   2. Blocked surfaces go to the WORD-CLAIM ADJUDICATOR: testimony wins
 *      without a hearing; inferred-vs-inferred conflicts get a judge verdict
 *      (both / evict incumbent / refuse newcomer-remembered).
 *   3. Lane 4 is then removable — labels stop grounding (separate commit).
 *
 * Run:  npx ts-node -T scripts/reconcile-surface-claims.ts [--dry-run] [--limit N]
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { bootstrap, out } from './search-harness/_shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { WordClaimAdjudicatorService } from '../src/modules/content-processing/entity-resolver/word-claim-adjudicator.service';
import {
  addAliases,
  type AliasSource,
} from '../src/modules/content-processing/entity-resolver/entity-alias.service';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const limitIndex = argv.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : 100000;

  const app = await bootstrap();
  try {
    const prisma = app.get(PrismaService);
    const adjudicator = app.get(WordClaimAdjudicatorService);

    // Label-only surfaces: active label on an active entity, absent from the
    // alias store for that entity, and NOT the entity's own identity (a
    // proper-noun label is its own display, never a locale search word).
    const rows = await prisma.$queryRawUnsafe<
      Array<{ entity_id: string; form: string; locale: string }>
    >(
      `SELECT l.entity_id::text AS entity_id, l.form, l.locale
         FROM entity_labels l
         JOIN core_entities e ON e.entity_id = l.entity_id AND e.status = 'active'
        WHERE l.status = 'active'
          AND l.form_folded <> e.identity_key
          AND NOT EXISTS (
            SELECT 1 FROM entity_alias a
             WHERE a.entity_id = l.entity_id
               AND a.form_folded = l.form_folded)
        ORDER BY l.entity_id
        LIMIT $1`,
      limit,
    );
    out(`label-only surfaces to reconcile: ${rows.length}`);

    let banked = 0;
    const contested: Array<{
      form: string;
      locale: string;
      entityId: string;
      source: AliasSource;
    }> = [];
    for (const row of rows) {
      if (dryRun) continue;
      const result = await prisma.$transaction((tx) =>
        addAliases(tx, row.entity_id, [
          { form: row.form, locale: row.locale, source: 'vocabulary' },
        ]),
      );
      if (result.blocked.length) {
        contested.push({
          form: row.form,
          locale: row.locale,
          entityId: row.entity_id,
          source: 'vocabulary',
        });
      } else {
        banked += 1;
      }
    }
    out(`banked uncontested: ${banked}`);
    out(`contested → adjudicator: ${contested.length}`);

    if (contested.length) {
      const summary = await adjudicator.adjudicate(contested, { dryRun });
      out(JSON.stringify(summary));
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
