/**
 * @script-class: probe
 * @finding: retro-validation of the owned-domain gate against every executed
 *   place merge (2026-09-03) — banked in plans/alias-clean-slate.md. For each
 *   historical (loser → winner) place merge, asks: would today's deterministic
 *   gate (placeNamesAgree, the pair-level core of brandClusterPurity) have
 *   let it through, or held it for the same-business court? Read-only.
 *
 *   DATABASE_URL=<target> npx ts-node -T scripts/alias-clean-slate/retro-validate-domain-gate.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { placeNamesAgree } from '../../src/modules/restaurant-enrichment/business-identity-rules';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const pairs = await prisma.$queryRaw<
    Array<{ loser: string; winner: string; domain: string | null }>
  >`
    SELECT l.name AS loser, w.name AS winner, w.canonical_domain AS domain
      FROM entity_redirects r
      JOIN core_entities l ON l.entity_id = r.from_entity_id
      JOIN core_entities w ON w.entity_id = r.to_entity_id
     WHERE l.type = 'place' AND w.type = 'place'
     ORDER BY w.name, l.name`;
  let pass = 0;
  const held: string[] = [];
  for (const p of pairs) {
    if (placeNamesAgree(p.loser, p.winner)) pass += 1;
    else
      held.push(`"${p.loser}" -> "${p.winner}" (${p.domain ?? 'no domain'})`);
  }
  console.log(
    `${pairs.length} historical place merges: ${pass} would pass the name-agreement core, ${held.length} would be HELD for the court:`,
  );
  for (const h of held) console.log(`  HELD ${h}`);
}

void main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.stack : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
