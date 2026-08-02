/** Backfill BOTH app-written identity keys after the app-written-column
 *  migration (20260802050000). Idempotent; the nightly heal keeps them
 *  current afterward. Run: DATABASE_URL=... npx ts-node -T scripts/backfill-identity-keys.ts */
import { PrismaClient, Prisma } from '@prisma/client';
import {
  canonicalFold,
  entityIdentityKey,
} from '../src/modules/content-processing/entity-resolver/entity-identity';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRaw<
    Array<{ entity_id: string; name: string; type: string }>
  >`SELECT entity_id, name, type::text AS type FROM core_entities
    WHERE identity_key IS NULL OR identity_key_sorted IS NULL`;
  console.log('backfilling', rows.length);
  const B = 500;
  for (let i = 0; i < rows.length; i += B) {
    const chunk = rows.slice(i, i + B);
    const values = Prisma.join(
      chunk.map(
        (r) =>
          Prisma.sql`(${r.entity_id}::uuid, ${canonicalFold(r.name)}, ${entityIdentityKey(r.name, r.type as never)})`,
      ),
    );
    await prisma.$executeRaw`
      UPDATE core_entities e
      SET identity_key = v.k, identity_key_sorted = v.s
      FROM (VALUES ${values}) AS v(id, k, s)
      WHERE e.entity_id = v.id`;
  }
  const left = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM core_entities WHERE identity_key IS NULL`;
  console.log('remaining null:', left[0].n);
  await prisma.$disconnect();
}
void main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
