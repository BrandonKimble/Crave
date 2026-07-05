-- Recreate the HNSW ANN index on core_entities.name_embedding (the semantic recall
-- lane used by searchByEmbedding AND findDenseNeighbors / dense co-inclusion).
--
-- It was created in 20260615154308 and then ACCIDENTALLY dropped in
-- 20260618201804 — Prisma cannot model an HNSW index in schema.prisma, so a later
-- `prisma migrate dev` diffed it as drift and generated a DROP inside an unrelated
-- poll migration. Without it, every vector ORDER BY does a full Seq Scan + top-N
-- heapsort over all active entities.
--
-- ⚠️ Prisma will try to drop this again on the next `migrate dev` (same root cause).
-- `migrate deploy` (prod) does NOT diff, so prod is safe. On dev, REJECT any
-- auto-generated `DROP INDEX ... idx_entities_name_embedding_hnsw`.
CREATE INDEX IF NOT EXISTS "idx_entities_name_embedding_hnsw"
  ON "core_entities" USING hnsw ("name_embedding" vector_cosine_ops);
