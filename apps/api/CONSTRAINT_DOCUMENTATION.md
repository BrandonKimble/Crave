# Database Constraints Documentation

**Task:** T03_S01 - Database Constraints and Relationships  
**Created:** 2025-07-20  
**Purpose:** Comprehensive documentation of all database constraints implemented for data integrity and business rule enforcement.

## Overview

The Crave Search database implements a comprehensive constraint system to ensure data integrity, enforce business rules, and maintain referential consistency across the graph-based entity model. These constraints work at the PostgreSQL database level and provide bulletproof data validation.

## Constraint Categories

### 1. UUID Array Validation Function

**Function:** `validate_entity_references(UUID[])`

- **Purpose:** Validates that all UUIDs in an array reference existing entities
- **Usage:** Used by multiple check constraints to ensure array fields contain valid entity references
- **Returns:** Boolean (true if all references exist or array is empty)

### 2. Entity Table Constraints

#### Business Rule Constraints

- **`check_restaurant_quality_score_range`**: Ensures restaurant quality scores are between 0-100
- **`check_location_consistency`**: Ensures latitude/longitude are both null or both valid coordinates (-90 to 90, -180 to 180)
- **`check_restaurant_specific_fields`**: Ensures location/address fields only populated for restaurant entities
- **`check_restaurant_attributes_exist`**: Validates restaurant attribute UUIDs reference existing entities

#### Data Integrity Rules

- Restaurant entities must have quality scores in valid range (0-100)
- Non-restaurant entities cannot have location or Google Places data
- Location coordinates must be geographically valid
- All restaurant attribute references must exist in entities table

### 3. Connection Table Constraints

#### Quality Metrics Validation

- **`check_mention_count_positive`**: Ensures mention counts are non-negative
- **`check_total_upvotes_positive`**: Ensures total upvotes are non-negative
- **`check_source_diversity_positive`**: Ensures source diversity counts are non-negative
- **`check_recent_mention_count_positive`**: Ensures recent mention counts are non-negative
- **`check_dish_quality_score_range`**: Ensures dish quality scores are between 0-100

#### Reference Integrity

- **`check_categories_exist`**: Validates category UUIDs reference existing dish_or_category entities
- **`check_dish_attributes_exist`**: Validates dish attribute UUIDs reference existing dish_attribute entities

#### Business Rules

- All quality metrics must be non-negative values
- Quality scores must be within 0-100 range for accurate ranking
- Array references must point to valid, existing entities of correct types

### 4. Mention Table Constraints

#### Data Validation

- **`check_upvotes_positive`**: Ensures upvote counts are non-negative
- **`check_created_before_processed`**: Ensures creation timestamp is before or equal to processing timestamp

#### Business Rules

- Reddit upvotes cannot be negative
- Processing must occur after or at the same time as content creation

### 5. User Management Constraints

#### Trial Period Validation

- **`check_trial_dates_consistency`**: Ensures trial start/end dates are both null or start <= end

#### Subscription Validation

- **`check_subscription_period_consistency`**: Ensures subscription period start/end dates are consistent
- **`check_cancelled_at_consistency`**: Ensures cancellation date only set for cancelled/expired subscriptions

## Constraint Implementation Strategy

### Performance Considerations

1. **Constraint Ordering**: Applied in dependency order (entities → connections → mentions)
2. **Supporting Indexes**: Created additional indexes to support constraint validation performance
3. **Function Optimization**: UUID validation function optimized for array operations

### Error Handling

- Constraints provide clear violation messages for debugging
- Each constraint is documented with purpose and rationale
- Application layer should handle constraint violations gracefully

### Migration Safety

- All constraints applied in single transaction for atomicity
- Rollback strategy available through migration system
- Constraints tested against existing data before application

## Maintenance Guidelines

### Adding New Constraints

1. Follow naming convention: `check_{purpose}_{specificity}`
2. Document constraint purpose in migration comments
3. Test constraint with edge cases before deployment
4. Consider performance impact on large datasets

### Modifying Existing Constraints

1. Create new migration to drop old constraint and add new one
2. Ensure existing data complies with new constraint rules
3. Update documentation to reflect changes
4. Test thoroughly in development environment

### Monitoring Constraint Performance

1. Monitor constraint validation performance on large datasets
2. Use EXPLAIN ANALYZE for complex constraint queries
3. Consider adding supporting indexes if validation becomes slow
4. Review constraint logs for frequent violations

## Business Rule Enforcement

### Data Quality Assurance

- **Range Validation**: Quality scores, coordinates, counts within valid ranges
- **Type Safety**: Entity-specific fields only populated for correct entity types
- **Reference Integrity**: All UUID arrays reference existing, valid entities
- **Temporal Consistency**: Date relationships maintained across related records

### Graph Model Integrity

- **Entity Uniqueness**: Enforced through unique constraints on (name, type)
- **Connection Uniqueness**: Prevents duplicate restaurant-dish relationships
- **Mention Attribution**: Ensures all mentions link to valid connections
- **User Data Consistency**: Maintains subscription and trial period integrity

## Testing and Validation

### Constraint Testing Approach

1. **Positive Tests**: Verify valid data passes all constraints
2. **Negative Tests**: Verify invalid data properly rejected
3. **Edge Cases**: Test boundary conditions and null values
4. **Performance Tests**: Verify constraint validation doesn't impact performance

### Automated Validation

- Migration tests verify constraints can be applied cleanly
- Unit tests should include constraint violation scenarios
- Integration tests verify end-to-end constraint enforcement

## Known Limitations

### PostgreSQL Constraint Limitations

1. **Subquery Restrictions**: CHECK constraints cannot use subqueries (entity type validation handled by foreign keys)
2. **Cross-Table Validation**: Some validations require application-level enforcement
3. **Dynamic Constraints**: Constraints are static and cannot adapt to changing business rules without migration

### Prisma Client Compatibility

- Check constraints not directly supported by Prisma Client
- Constraints work at database level but don't appear in generated types
- Application must handle constraint violations as database errors

## Future Enhancements

### Planned Improvements

1. **Entity Type Validation**: Application-level validation for entity type relationships
2. **Dynamic Business Rules**: Configuration-driven constraint management
3. **Performance Optimization**: Additional indexes for constraint validation
4. **Enhanced Monitoring**: Constraint violation tracking and alerting

### Schema Evolution

- Constraint system designed to support schema evolution
- New entity types can be added with corresponding constraints
- Constraint validation function can be extended for new use cases

## References

- **PRD Section 4.1**: Core Database Schema requirements
- **PRD Section 2.3**: Data Layer constraints and integrity requirements
- **Task T03_S01**: Database Constraints and Relationships implementation
- **Migration**: `20250720193242_add_advanced_constraints_validation`
