-- Flat per-entity favorites (user_favorites) were superseded by the
-- favorite-lists system (favorite_lists / favorite_list_items); the last
-- readers (autocomplete favorites lane, entity-merge rehome) were rewired
-- or removed 2026-07-25. Dead table, zero writers — drop it.
DROP TABLE IF EXISTS "user_favorites";
