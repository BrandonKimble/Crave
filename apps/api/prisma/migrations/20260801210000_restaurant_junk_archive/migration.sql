-- CLASS ③ part 1 (data audit 2026-08): archive the CONFIRMED
-- non-restaurant set (raw-text verified by the audit) as venue-class
-- rejected SINKS: rows stay (restaurant law: place-grounded rows are
-- never deleted; archived != deleted), evidence is removed (junk-sink
-- law from class ②: rejected vocabulary absorbs invisibly and its
-- backlog goes), future mentions drop at write time. The remainder of
-- the ~201 estimated class is handled by the re-extraction prompt's
-- venue taxonomy. Chains/branch modeling (P2.2) is untouched — only
-- non-dining venues are here.
CREATE TEMP TABLE junk_restaurants AS
SELECT entity_id FROM core_entities
WHERE type = 'restaurant' AND status = 'active'
  AND btrim(regexp_replace(regexp_replace(lower(name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g')) IN (
  -- CPG brands (the frozen-pizza-at-HEB thread)
  'digiorno','home run inn','screamin sicilian','promised land','red baron',
  'tombstone','freschetta','totinos','hot pockets','newmans own','udis',
  'fairlife','so delicious','healthy choice',
  -- grocery / retail / gas (the venue is the store, not a restaurant)
  'central market','costco','sprouts','trader joes','99 ranch',
  '99 ranch market','99 ranch food market','wheatsville',
  'wheatsville food co-op','restaurant depot','sur la table','total wine',
  'archery country','aldi','amazon fresh','kroger','target','sams club',
  'h-e-b','whole foods market','chevron','citgo','texaco','valero',
  'fuel wise','flag store','sunrise mini mart',
  -- lodging / event venues
  'line','w hotel pool','jw marriott','moxy hotel','camp lucy','austin motel',
  -- individuals / caterers / institutions / entertainment / producers
  'elizabeth graf','mac lab','pej events','lets eat austin',
  'dell childrens hospital','st davids hospital','pinballz','dart bowl',
  'rozcos comedy club','coupland dance hall','boggy creek farm','mill-king',
  'roam ranch','two hives honey','kuhlman cellars',
  -- confirmed junk names + out-of-market
  'ko','php','median','best quality daughter','water stop',
  'charlie vergos rendezvous bbq','rutts hutt','lions choice','zupardis'
);

-- USER-ANCHOR EXEMPTION (round-6 red team: H-E-B carried 43 curated list
-- items + photos — archiving a venue users have anchored breaks their
-- surfaces). Anchored venues stay ACTIVE; the re-extraction prompt's
-- venue taxonomy owns their eventual classification.
DELETE FROM junk_restaurants j
WHERE EXISTS (SELECT 1 FROM curated_list_items cl WHERE cl.restaurant_id = j.entity_id OR cl.entity_id = j.entity_id)
   OR EXISTS (SELECT 1 FROM user_list_items u WHERE u.restaurant_id = j.entity_id)
   OR EXISTS (SELECT 1 FROM photos p WHERE p.restaurant_id = j.entity_id)
   OR EXISTS (SELECT 1 FROM poll_topics t WHERE t.target_restaurant_id = j.entity_id);

UPDATE core_entities SET status = 'archived'
WHERE entity_id IN (SELECT entity_id FROM junk_restaurants);

DELETE FROM core_restaurant_entity_events
WHERE restaurant_id IN (SELECT entity_id FROM junk_restaurants);
DELETE FROM core_restaurant_events
WHERE restaurant_id IN (SELECT entity_id FROM junk_restaurants);
-- their connections lose all backing evidence; unpreserved ones go
DELETE FROM core_restaurant_items c
WHERE c.restaurant_id IN (SELECT entity_id FROM junk_restaurants)
  AND NOT EXISTS (SELECT 1 FROM user_list_items u WHERE u.connection_id = c.connection_id)
  AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.connection_id = c.connection_id)
  AND NOT EXISTS (SELECT 1 FROM curated_list_items cl WHERE cl.connection_id = c.connection_id);
DELETE FROM core_restaurant_entity_signals
WHERE restaurant_id IN (SELECT entity_id FROM junk_restaurants);
DELETE FROM core_public_entity_scores
WHERE subject_id IN (SELECT entity_id FROM junk_restaurants);

SELECT count(*) AS archived FROM junk_restaurants;
