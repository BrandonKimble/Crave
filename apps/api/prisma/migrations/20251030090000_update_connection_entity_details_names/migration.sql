-- Add category and food attribute names to connection_entity_details view
DROP VIEW IF EXISTS connection_entity_details;

CREATE VIEW connection_entity_details AS
SELECT
  r.name AS restaurant_name,
  r.aliases AS restaurant_aliases,
  r.restaurant_quality_score AS restaurant_quality_score,
  f.name AS food_name,
  f.aliases AS food_aliases,
  c.food_quality_score,
  c.connection_id,
  c.restaurant_id,
  c.food_id,
  c.categories,
  COALESCE(cat.category_names, ARRAY[]::text[]) AS category_names,
  c.food_attributes,
  COALESCE(fa.food_attribute_names, ARRAY[]::text[]) AS food_attribute_names,
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
JOIN entities f ON f.entity_id = c.food_id
LEFT JOIN LATERAL (
  SELECT array_agg(e.name ORDER BY e.name) AS category_names
  FROM entities e
  WHERE c.categories IS NOT NULL AND e.entity_id = ANY(c.categories)
) cat ON TRUE
LEFT JOIN LATERAL (
  SELECT array_agg(e.name ORDER BY e.name) AS food_attribute_names
  FROM entities e
  WHERE c.food_attributes IS NOT NULL AND e.entity_id = ANY(c.food_attributes)
) fa ON TRUE;
