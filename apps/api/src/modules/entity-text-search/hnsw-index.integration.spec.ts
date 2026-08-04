/**
 * THE HNSW INDEX EXISTS — asked of Postgres, after every migration has run.
 *
 * Prisma cannot model an HNSW index in schema.prisma, so `prisma migrate dev`
 * diffs it as drift and emits a `DROP INDEX` into whatever migration it happens
 * to be generating. That is not hypothetical: the index vanished once inside an
 * unrelated POLL migration (20260618201804) and was recreated two weeks later
 * (20260705003434). In between, every dense query fell back to a sequential
 * scan and nothing said so.
 *
 * WHAT THIS REPLACED. A spec parsed every migration.sql in order, regexed
 * CREATE/DROP events for the index name, and asserted the net final state.
 * It worked, and it was still a model of the database rather than the database:
 *
 *   - it could only see DROPs spelled the way its regex expected — a
 *     `DROP INDEX IF EXISTS public.idx_...` with a schema qualifier, a rename,
 *     or an `ALTER TABLE ... DROP CONSTRAINT` that took the index with it all
 *     read as nothing happening;
 *   - it could not see the index's TYPE or its operator class, so a
 *     `USING btree` recreation — which is valid SQL, keeps the name, and
 *     destroys ANN performance completely — passed;
 *   - it had to be kept in sync with a directory naming convention.
 *
 * CI applies every migration to a real Postgres before running `yarn test:db`,
 * so the question can just be asked. The runtime self-heal
 * (EntityEmbeddingReconcilerService.onApplicationBootstrap, CREATE INDEX IF NOT
 * EXISTS) remains the second guard; this is the one that fails the build.
 *
 * Run: yarn test:db  (needs DATABASE_URL — a dev database, never prod)
 */
import { PrismaClient } from '@prisma/client';

const INDEX = 'idx_entities_name_embedding_hnsw';
const TABLE = 'core_entities';
const COLUMN = 'name_embedding';

const prisma = new PrismaClient();

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — a skipped index tripwire proves nothing.',
    );
  }
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the name_embedding HNSW index survives every migration', () => {
  it('exists on the right table and column', async () => {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_indexes WHERE indexname = ${INDEX}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].tablename).toBe(TABLE);
  });

  it('is an HNSW index, not a btree wearing its name', async () => {
    // The failure the migration scanner could not see. A btree recreation is
    // valid SQL, keeps the name, satisfies "the index is present", and makes
    // every ANN query a sequential scan.
    const [row] = await prisma.$queryRaw<{ method: string; def: string }[]>`
      SELECT am.amname AS method, pg_get_indexdef(i.indexrelid) AS def
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_am am ON am.oid = c.relam
      WHERE c.relname = ${INDEX}
    `;
    expect(row.method).toBe('hnsw');
    expect(row.def).toContain(COLUMN);
  });

  it('uses the COSINE operator class the queries are written against', async () => {
    // vector_l2_ops and vector_ip_ops are also valid hnsw operator classes.
    // An index built with the wrong one is simply not used by a `<=>` query —
    // present, correctly typed, and silently useless.
    const [row] = await prisma.$queryRaw<{ def: string }[]>`
      SELECT pg_get_indexdef(c.oid) AS def
      FROM pg_class c WHERE c.relname = ${INDEX}
    `;
    expect(row.def).toContain('vector_cosine_ops');
  });

  it('is VALID — a failed concurrent build leaves it present but unusable', async () => {
    const [row] = await prisma.$queryRaw<{ isvalid: boolean }[]>`
      SELECT i.indisvalid AS isvalid
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = ${INDEX}
    `;
    expect(row.isvalid).toBe(true);
  });
});
