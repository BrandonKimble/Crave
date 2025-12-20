CREATE OR REPLACE VIEW public.connection_entity_names AS
SELECT
  c.connection_id,
  c.restaurant_id,
  r.name AS restaurant_name,
  r.aliases AS restaurant_aliases,
  r.restaurant_attributes AS restaurant_attribute_ids,
  COALESCE(restaurant_attribute_names.restaurant_attribute_names, ARRAY[]::text[])
    AS restaurant_attribute_names,
  c.food_id,
  f.name AS food_name,
  f.aliases AS food_aliases,
  c.categories AS category_ids,
  COALESCE(category_names.category_names, ARRAY[]::text[]) AS category_names,
  c.food_attributes AS food_attribute_ids,
  COALESCE(food_attribute_names.food_attribute_names, ARRAY[]::text[])
    AS food_attribute_names,
  c.mention_count,
  c.total_upvotes,
  c.recent_mention_count,
  c.last_mentioned_at,
  c.activity_level,
  c.food_quality_score,
  c.decayed_mention_score,
  c.decayed_upvote_score,
  c.decayed_scores_updated_at,
  c.boost_last_applied_at,
  c.last_updated,
  c.created_at
FROM public.core_connections c
JOIN public.core_entities r ON r.entity_id = c.restaurant_id
JOIN public.core_entities f ON f.entity_id = c.food_id
LEFT JOIN LATERAL (
  SELECT array_agg(e.name ORDER BY u.ordinality) FILTER (WHERE e.name IS NOT NULL)
    AS category_names
  FROM unnest(c.categories) WITH ORDINALITY AS u(entity_id, ordinality)
  LEFT JOIN public.core_entities e ON e.entity_id = u.entity_id
) category_names ON TRUE
LEFT JOIN LATERAL (
  SELECT array_agg(e.name ORDER BY u.ordinality) FILTER (WHERE e.name IS NOT NULL)
    AS food_attribute_names
  FROM unnest(c.food_attributes) WITH ORDINALITY AS u(entity_id, ordinality)
  LEFT JOIN public.core_entities e ON e.entity_id = u.entity_id
) food_attribute_names ON TRUE
LEFT JOIN LATERAL (
  SELECT array_agg(e.name ORDER BY u.ordinality) FILTER (WHERE e.name IS NOT NULL)
    AS restaurant_attribute_names
  FROM unnest(r.restaurant_attributes) WITH ORDINALITY AS u(entity_id, ordinality)
  LEFT JOIN public.core_entities e ON e.entity_id = u.entity_id
) restaurant_attribute_names ON TRUE;
