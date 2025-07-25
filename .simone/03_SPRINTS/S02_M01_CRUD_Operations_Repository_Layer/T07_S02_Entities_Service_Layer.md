---
task_id: T07_S02
sprint_sequence_id: S02
status: open
complexity: Medium
last_updated: 2025-07-21T00:00:00Z
---

# Task: Entities Service Layer - Basic Foundation

## Description

Implement basic service layer operations for the entities table that serves as the unified storage for restaurants, dishes, categories, and attributes. This foundational service provides basic CRUD operations through the repository layer.

## Goal / Objectives

Create a basic service layer for the entities table that provides essential CRUD operations for database foundation setup.

- Implement basic CRUD operations for all entity types
- Handle basic entity type validation
- Support basic querying and filtering by entity type
- Provide basic entity management operations
- Ensure basic data integrity

## Acceptance Criteria

- [ ] EntitiesService class implements basic CRUD operations (create, findById, findMany, update, delete)
- [ ] Basic entity type differentiation (restaurant, dish_or_category, dish_attribute, restaurant_attribute)
- [ ] Basic type-specific validation for each entity type
- [ ] Basic querying by entity type with simple filtering
- [ ] Basic entity constraints are properly handled
- [ ] Basic integration patterns for repository layer
- [ ] Basic error handling for constraint violations
- [ ] Service follows established patterns and conventions

## Dependencies

- **T01_S02**: Repository Layer Foundation - Requires base repository infrastructure and patterns
- **T02_S02**: Database Configuration & Connection Pooling - Requires optimized database connection setup
- **T03_S02**: Error Handling & Validation - Requires error handling infrastructure for service operations
- **T04_S02**: Logging Infrastructure - Requires logging setup for service operations
- **T05_S02**: Entities Repository Layer - Requires entities repository for service layer implementation
- **T06_S02**: Basic Connections CRUD - Requires connections functionality for complete entity service

## PRD References

- Section 4.2.4.3: Unified Entity Model Implementation - Entity resolution service implementation
- Section 3.4: Development Principles - Repository pattern implementation
- Section 2.7: Development Tools - Database architecture patterns

## Subtasks

- [ ] Create EntitiesService class with repository integration
- [ ] Implement basic CRUD operations (create, findById, findMany, update, delete)
- [ ] Add basic entity type validation and constraints handling
- [ ] Implement basic type-specific methods (findRestaurants, findDishes, findCategories, findAttributes)
- [ ] Create basic entity validation logic
- [ ] Implement basic entity operations
- [ ] Add basic entity management capabilities
- [ ] Write basic JSDoc documentation
- [ ] Export service through entities module
- [ ] Create basic unit tests for CRUD operations

## Technical Guidance

### Entities Table Schema and Type System

The entities table uses a unified structure with type differentiation:
- **entityId**: UUID primary key
- **entityType**: Enum (restaurant, dish_or_category, dish_attribute, restaurant_attribute)
- **name**: Entity name/title
- **description**: Optional detailed description
- **location**: JSON field for restaurant coordinates and address
- **metadata**: JSON field for type-specific additional data
- **Quality Metrics**: qualityScore, totalMentions, lastUpdated
- **Status**: isActive, isVerified flags

### Entity Type Handling and Validation

Entity type-specific validation requirements:
- **Restaurant**: Must have location data, address validation
- **Dish/Category**: Name uniqueness within type, optional category hierarchy
- **Dish Attribute**: Scoped to dish connections, validation rules
- **Restaurant Attribute**: Scoped to restaurant properties, validation rules

### Location-Based Querying for Restaurants

```typescript
interface LocationQuery {
  centerPoint: { lat: number; lng: number };
  radiusKm: number;
  includeInactive?: boolean;
}

interface RestaurantEntity extends BaseEntity {
  location: {
    coordinates: { lat: number; lng: number };
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
}
```

### Entity Type-Specific Operations

```typescript
// Type-specific finder methods
async findRestaurants(filter: RestaurantFilter): Promise<RestaurantEntity[]>
async findDishes(filter: DishFilter): Promise<DishEntity[]>
async findCategories(filter: CategoryFilter): Promise<CategoryEntity[]>
async findAttributes(filter: AttributeFilter): Promise<AttributeEntity[]>

// Location-based restaurant queries
async findNearbyRestaurants(location: LocationQuery): Promise<RestaurantEntity[]>
```

## Implementation Notes

### Entity CRUD with Type Validation

```typescript
interface CreateEntityDto {
  entityType: EntityType;
  name: string;
  description?: string;
  location?: LocationData; // Required for restaurants
  metadata?: Record<string, any>;
}

async create(dto: CreateEntityDto): Promise<Entity> {
  // 1. Validate required fields for entity type
  // 2. Check entity name uniqueness within type
  // 3. Validate location data for restaurants
  // 4. Handle type-specific metadata validation
  // 5. Create entity with proper defaults
}
```

### Entity Uniqueness and Constraints

- **Name Uniqueness**: Enforce within entity type where applicable
- **Location Validation**: Ensure valid coordinates for restaurants
- **Metadata Schemas**: Type-specific validation for metadata fields
- **Status Management**: Handle active/inactive and verification states

### Integration with Connection System

```typescript
// Helper methods for connection validation
async validateEntityExists(entityId: string, expectedType?: EntityType): Promise<boolean>
async getEntitiesForConnections(connectionIds: string[]): Promise<Entity[]>
```

## Output Log

_(This section is populated as work progresses on the task)_

[YYYY-MM-DD HH:MM:SS] Started task
[YYYY-MM-DD HH:MM:SS] Modified files: entities.repository.ts, entities.module.ts
[YYYY-MM-DD HH:MM:SS] Completed subtask: Implemented basic CRUD operations
[YYYY-MM-DD HH:MM:SS] Task completed