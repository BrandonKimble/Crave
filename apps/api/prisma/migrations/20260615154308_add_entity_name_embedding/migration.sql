-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "core_entities" ADD COLUMN     "name_embedding" vector(768);

-- HNSW index for cosine-distance ANN over entity name embeddings (the semantic
-- recall lane). m/ef_construction left at pgvector defaults — fine at this scale.
CREATE INDEX "idx_entities_name_embedding_hnsw"
  ON "core_entities" USING hnsw ("name_embedding" vector_cosine_ops);
