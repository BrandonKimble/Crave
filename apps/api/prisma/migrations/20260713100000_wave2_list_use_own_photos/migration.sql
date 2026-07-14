-- Wave-2 §2 "Use your photos": per-list flag — the tile gallery renders the owner's
-- own photos instead of the top-ranked restaurant photos.
ALTER TABLE "favorite_lists" ADD COLUMN "use_own_photos" BOOLEAN NOT NULL DEFAULT false;
