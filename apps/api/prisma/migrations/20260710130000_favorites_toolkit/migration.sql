-- Save-funnel toolkit (product/favorites.md): per-item note + tags.
-- UI is fast-follow; schema ships now so the funnel lands without a
-- migration dance.
ALTER TABLE "favorite_list_items"
  ADD COLUMN "note" VARCHAR(512),
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
