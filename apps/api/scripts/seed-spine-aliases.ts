/** M3 spine surface seeding: the seeded spine LABELS' forms are also the
 *  correct MATCHING surfaces for those concepts — bank them as tagged
 *  entity_alias rows through the one projection writer, so the gazetteer's
 *  alias arm grounds them ("vegetariano" → vegetarian). Labels stay
 *  display-only; this is the separate, deliberate write into the recall
 *  store. Idempotent. Run: DATABASE_URL=... npx ts-node -T scripts/seed-spine-aliases.ts */
import { PrismaClient } from '@prisma/client';
import { addAliases } from '../src/modules/content-processing/entity-resolver/entity-alias.service';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const labels = await prisma.$queryRaw<
    Array<{ entity_id: string; locale: string; form: string }>
  >`SELECT entity_id, locale, form FROM entity_labels WHERE status='active' AND source='seed'`;
  let banked = 0;
  for (const label of labels) {
    await prisma.$transaction(async (tx) => {
      await addAliases(tx, label.entity_id, [
        {
          form: label.form,
          locale: label.locale,
          source: 'seed',
          confidence: 1,
        },
      ]);
    });
    banked += 1;
  }
  console.log(`spine surfaces banked: ${banked}`);
  await prisma.$disconnect();
}
void main().catch((error) => {
  console.error('FATAL', error);
  process.exit(1);
});
