-- Constraint Validation Test Cases
-- Task: T03_S01 - Database Constraints and Relationships

-- Test 1: Invalid restaurant quality score (should fail)
-- INSERT INTO entities (name, type, restaurant_quality_score) 
-- VALUES ('Test Restaurant', 'restaurant', 150);

-- Test 2: Invalid location coordinates (should fail)
-- INSERT INTO entities (name, type, latitude, longitude) 
-- VALUES ('Test Restaurant 2', 'restaurant', 91.0, 0.0);

-- Test 3: Non-restaurant entity with location data (should fail)
-- INSERT INTO entities (name, type, latitude, longitude) 
-- VALUES ('Test Dish', 'dish_or_category', 40.7128, -74.0060);

-- Test 4: Invalid mention count (should fail)
-- First insert valid entities and connection, then try invalid data
-- INSERT INTO entities (entity_id, name, type) VALUES 
-- ('550e8400-e29b-41d4-a716-446655440001', 'Test Restaurant', 'restaurant'),
-- ('550e8400-e29b-41d4-a716-446655440002', 'Test Dish', 'dish_or_category');

-- INSERT INTO connections (restaurant_id, dish_or_category_id, mention_count) 
-- VALUES ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', -5);

-- Test 5: Invalid quality score range (should fail)
-- INSERT INTO connections (restaurant_id, dish_or_category_id, dish_quality_score) 
-- VALUES ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 150);

-- Test 6: Valid data (should succeed)
INSERT INTO entities (entity_id, name, type, restaurant_quality_score, latitude, longitude) 
VALUES ('550e8400-e29b-41d4-a716-446655440003', 'Valid Restaurant', 'restaurant', 85.5, 40.7128, -74.0060);

INSERT INTO entities (entity_id, name, type) 
VALUES ('550e8400-e29b-41d4-a716-446655440004', 'Valid Dish', 'dish_or_category');

INSERT INTO connections (restaurant_id, dish_or_category_id, mention_count, total_upvotes, dish_quality_score) 
VALUES ('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004', 10, 25, 75.0);

-- Test 7: Valid mention (should succeed)
INSERT INTO mentions (connection_id, source_type, source_id, source_url, subreddit, content_excerpt, upvotes, created_at)
SELECT connection_id, 'post', 'test_post_123', 'https://reddit.com/test', 'food', 'Great restaurant!', 15, NOW()
FROM connections 
WHERE restaurant_id = '550e8400-e29b-41d4-a716-446655440003' 
AND dish_or_category_id = '550e8400-e29b-41d4-a716-446655440004';

-- Test validation function
SELECT validate_entity_references(ARRAY['550e8400-e29b-41d4-a716-446655440003'::uuid]) as should_be_true;
SELECT validate_entity_references(ARRAY['550e8400-e29b-41d4-a716-446655440999'::uuid]) as should_be_false;
SELECT validate_entity_references(ARRAY[]::uuid[]) as empty_array_should_be_true;