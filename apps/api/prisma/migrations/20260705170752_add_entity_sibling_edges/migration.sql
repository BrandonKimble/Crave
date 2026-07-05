-- Derived sibling-edges table for dense co-inclusion (see EntitySiblingEdge in
-- schema.prisma). Full-replace rebuild by EntitySiblingEdgeBuilderService; the
-- composite PK's prefix serves the anchor lookup, no extra index needed.
CREATE TABLE "derived_entity_sibling_edges" (
    "anchor_entity_id" UUID NOT NULL,
    "sibling_entity_id" UUID NOT NULL,
    "cosine" DOUBLE PRECISION NOT NULL,
    "forward_rank" INTEGER NOT NULL,
    "mutual_rank" INTEGER,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "derived_entity_sibling_edges_pkey" PRIMARY KEY ("anchor_entity_id","sibling_entity_id")
);
