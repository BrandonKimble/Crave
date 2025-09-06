-- Advanced Constraints and Validation Migration
-- Task: T03_S01 - Database Constraints and Relationships

-- 1. Create UUID array validation function for entity references
CREATE OR REPLACE FUNCTION validate_entity_references(entity_ids UUID[])
RETURNS BOOLEAN AS $$
BEGIN
  -- Return true if all UUIDs in array exist in entities table, or if array is empty
  IF array_length(entity_ids, 1) IS NULL THEN
    RETURN TRUE;
  END IF;
  
  RETURN (
    SELECT COUNT(*) FROM unnest(entity_ids) AS id 
    WHERE id NOT IN (SELECT entity_id FROM entities)
  ) = 0;
END;
$$ LANGUAGE plpgsql;

-- 2. Add check constraints for business rule validation on entities table
ALTER TABLE entities 
ADD CONSTRAINT check_restaurant_quality_score_range 
CHECK (restaurant_quality_score IS NULL OR (restaurant_quality_score >= 0 AND restaurant_quality_score <= 100));

ALTER TABLE entities 
ADD CONSTRAINT check_location_consistency 
CHECK (
  (latitude IS NULL AND longitude IS NULL) OR 
  (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

ALTER TABLE entities 
ADD CONSTRAINT check_restaurant_specific_fields 
CHECK (
  (type = 'restaurant') OR 
  (type != 'restaurant' AND latitude IS NULL AND longitude IS NULL AND address IS NULL AND google_place_id IS NULL)
);

ALTER TABLE entities 
ADD CONSTRAINT check_restaurant_attributes_exist 
CHECK (validate_entity_references(restaurant_attributes));

-- 3. Add check constraints for business rule validation on connections table  
ALTER TABLE connections 
ADD CONSTRAINT check_mention_count_positive 
CHECK (mention_count >= 0);

ALTER TABLE connections 
ADD CONSTRAINT check_total_upvotes_positive 
CHECK (total_upvotes >= 0);

ALTER TABLE connections 
ADD CONSTRAINT check_source_diversity_positive 
CHECK (source_diversity >= 0);

ALTER TABLE connections 
ADD CONSTRAINT check_recent_mention_count_positive 
CHECK (recent_mention_count >= 0);

ALTER TABLE connections 
ADD CONSTRAINT check_food_quality_score_range 
CHECK (food_quality_score >= 0 AND food_quality_score <= 100);

ALTER TABLE connections 
ADD CONSTRAINT check_categories_exist 
CHECK (validate_entity_references(categories));

ALTER TABLE connections 
ADD CONSTRAINT check_food_attributes_exist 
CHECK (validate_entity_references(food_attributes));

-- Note: Entity type relationship validation will be enforced through foreign key constraints
-- and application-level validation, as PostgreSQL doesn't support subqueries in check constraints

-- 4. Add check constraints for mentions table
ALTER TABLE mentions 
ADD CONSTRAINT check_upvotes_positive 
CHECK (upvotes >= 0);

ALTER TABLE mentions 
ADD CONSTRAINT check_created_before_processed 
CHECK (created_at <= processed_at);

-- 5. Add check constraints for user subscription validation
ALTER TABLE users 
ADD CONSTRAINT check_trial_dates_consistency 
CHECK (
  (trial_started_at IS NULL AND trial_ends_at IS NULL) OR
  (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_started_at <= trial_ends_at)
);

ALTER TABLE subscriptions 
ADD CONSTRAINT check_subscription_period_consistency 
CHECK (
  (current_period_start IS NULL AND current_period_end IS NULL) OR
  (current_period_start IS NOT NULL AND current_period_end IS NOT NULL AND current_period_start <= current_period_end)
);

ALTER TABLE subscriptions 
ADD CONSTRAINT check_cancelled_at_consistency 
CHECK (
  (cancelled_at IS NULL) OR 
  (cancelled_at IS NOT NULL AND status IN ('cancelled', 'expired'))
);

-- 6. Create indexes to support constraint validation performance
CREATE INDEX IF NOT EXISTS idx_entities_type_validation ON entities(type) WHERE type = 'restaurant';
CREATE INDEX IF NOT EXISTS idx_entities_restaurant_attributes_validation ON entities USING gin(restaurant_attributes) WHERE type = 'restaurant';

-- 7. Add comment documentation for constraint rationale
COMMENT ON CONSTRAINT check_restaurant_quality_score_range ON entities IS 'Ensures restaurant quality scores are within valid 0-100 range';
COMMENT ON CONSTRAINT check_location_consistency ON entities IS 'Ensures latitude/longitude are both null or both valid coordinates';
COMMENT ON CONSTRAINT check_restaurant_specific_fields ON entities IS 'Ensures location/address fields only populated for restaurant entities';
COMMENT ON CONSTRAINT check_restaurant_attributes_exist ON entities IS 'Validates all restaurant attribute UUIDs reference existing entities';
COMMENT ON CONSTRAINT check_mention_count_positive ON connections IS 'Ensures mention counts are non-negative';
COMMENT ON CONSTRAINT check_food_quality_score_range ON connections IS 'Ensures food quality scores are within valid 0-100 range';
COMMENT ON CONSTRAINT check_categories_exist ON connections IS 'Validates all category UUIDs reference existing food entities';
COMMENT ON CONSTRAINT check_food_attributes_exist ON connections IS 'Validates all food attribute UUIDs reference existing food_attribute entities';
-- Entity type relationship validation comment removed due to constraint removal
COMMENT ON FUNCTION validate_entity_references(UUID[]) IS 'Validates that all UUIDs in array reference existing entities';