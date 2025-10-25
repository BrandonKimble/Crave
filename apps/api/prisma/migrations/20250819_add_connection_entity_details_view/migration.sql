-- Add a helper view that surfaces restaurant and food entity names
-- alongside connection metrics.
DROP VIEW IF EXISTS connection_entity_details;

CREATE VIEW connection_entity_details AS
SELECT
  r.name  AS restaurant_name,
  r.aliases AS restaurant_aliases,
  r.restaurant_quality_score AS restaurant_quality_score,
  f.name AS food_name,
  f.aliases AS food_aliases,
  c.food_quality_score,
  c.connection_id,
  c.restaurant_id,
  c.food_id,
  c.categories,
  c.food_attributes,
  c.activity_level,
  c.decayed_upvote_score,
  c.decayed_mention_score,
  c.total_upvotes,
  c.mention_count,
  c.recent_mention_count,
  c.last_mentioned_at,
  c.decayed_scores_updated_at,
  c.boost_last_applied_at,
  c.last_updated,
  c.created_at
FROM connections c
JOIN entities r ON r.entity_id = c.restaurant_id
JOIN entities f ON f.entity_id = c.food_id;
