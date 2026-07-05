import * as fs from 'fs';
import * as path from 'path';

/**
 * Tripwire for the `name_embedding` HNSW index.
 *
 * Prisma cannot model an HNSW index in schema.prisma, so `prisma migrate dev`
 * diffs it as drift and emits a `DROP INDEX` into whatever migration it is
 * generating — that is exactly how the index silently vanished once (dropped in
 * 20260618201804, an unrelated poll migration; recreated in 20260705003434).
 *
 * This spec replays every migration IN ORDER and fails if the NET final state of
 * `idx_entities_name_embedding_hnsw` is "dropped". A create→drop→create history
 * passes; a new Prisma-generated DROP with no matching re-create fails CI.
 * (Runtime second guard: EntityEmbeddingReconcilerService.onApplicationBootstrap
 * self-heals with CREATE INDEX IF NOT EXISTS.)
 */
const INDEX_NAME = 'idx_entities_name_embedding_hnsw';
const MIGRATIONS_DIR = path.join(__dirname, '../../../prisma/migrations');

describe('name_embedding HNSW index migration tripwire', () => {
  it('net effect of all migrations keeps the HNSW index present', () => {
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort(); // timestamp-prefixed → lexicographic == chronological

    let present = false;
    let lastEvent: string | null = null;
    for (const dir of dirs) {
      const file = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      if (!fs.existsSync(file)) continue;
      // Strip `--` line comments first — migration comments legitimately MENTION
      // "DROP INDEX ..." (e.g. the recreation migration's warning text) and must
      // not read as events.
      const sql = fs.readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
      // Process statements in file order so a drop+create in one file nets out.
      const events = sql.match(
        new RegExp(
          `(CREATE\\s+INDEX[^;]*${INDEX_NAME}|DROP\\s+INDEX[^;]*${INDEX_NAME})[^;]*`,
          'gi',
        ),
      );
      for (const evt of events ?? []) {
        present = /^CREATE/i.test(evt.trim());
        lastEvent = `${dir}: ${evt.trim().slice(0, 80)}`;
      }
    }

    expect(lastEvent).not.toBeNull(); // the index must appear in history at all
    if (!present) {
      throw new Error(
        `The net effect of prisma/migrations drops "${INDEX_NAME}" (last event: ${lastEvent}). ` +
          'This is Prisma drift-diffing an index it cannot model — delete the generated ' +
          'DROP INDEX from the new migration (see migration 20260705003434 for context).',
      );
    }
  });
});
