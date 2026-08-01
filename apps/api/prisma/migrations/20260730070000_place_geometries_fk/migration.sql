-- Red-team F1 (2026-07-30): place_geometries had NO foreign key to places, so
-- deleting a place row orphaned its ground — and an orphan ground could WIN
-- the aggregate's smallest-containing pick, storing a ghost place_id that
-- every reader then silently drops. Purge existing orphans (the integration
-- spec's teardown had been leaking them into dev), then make the invariant
-- structural: a ground cannot outlive its place.
DELETE FROM place_geometries pg
 WHERE NOT EXISTS (SELECT 1 FROM places p WHERE p.place_id = pg.place_id);
ALTER TABLE place_geometries
  ADD CONSTRAINT place_geometries_place_id_fkey
  FOREIGN KEY (place_id) REFERENCES places(place_id) ON DELETE CASCADE;
