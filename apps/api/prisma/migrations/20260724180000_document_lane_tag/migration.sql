-- §24 tracked follow-ups (plans/geo-demand-foundation-rebuild.md §24):
--   Task 2 — chronological lane cost attribution needs a lane tag on the
--     document, stamped at collection time from the pipeline context.
--     Legacy rows (collected before this migration) have lane = NULL and
--     self-heal as new collection stamps tags going forward.
--   Task 3 — the coarse-polygon seed campaign stamps campaign_id onto the
--     queue rows it enqueues, so the drain can check dispatchability and
--     record spend against the right campaign.

ALTER TABLE "collection_source_documents"
  ADD COLUMN "lane" VARCHAR(32);

ALTER TABLE "place_geometry_promotions"
  ADD COLUMN "campaign_id" UUID;
