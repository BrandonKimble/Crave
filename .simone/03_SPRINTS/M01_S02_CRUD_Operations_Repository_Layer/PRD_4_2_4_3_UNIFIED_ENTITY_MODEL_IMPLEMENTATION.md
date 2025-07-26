# PRD Sections 4.2-4.3 Unified Entity Model Implementation

**Date**: 2025-07-24  
**Context**: Post-T06_S02 PRD Compliance Analysis  
**PRD Sections**: 4.2 Data Model Principles & 4.3 Data Model Architecture  

## Overview

Following the completion of T06_S02_Basic_Connections_CRUD, a comprehensive analysis revealed that while our database schema was PRD-compliant, we were missing critical service layer implementations for the unified `dish_or_category` entity model. This document details the implementation of the missing business logic to fully realize PRD Sections 4.2-4.3 specifications.

## Critical Gaps Identified

### 1. **Missing Context-Aware Entity Resolution**
**PRD Requirement**: "Same entity ID can represent both menu item and category" (Section 4.3.1)  
**Gap**: No service layer logic to handle dual-purpose entity contexts

### 2. **Missing Context-Dependent Attribute Management**  
**PRD Requirement**: "Italian" exists as both dish_attribute and restaurant_attribute entities (Section 4.3.2)  
**Gap**: No scope-aware entity resolution for cross-context attributes

### 3. **Limited Dual-Purpose Entity Querying**
**PRD Requirement**: Unified dish_or_category entities serve dual purposes (Section 4.2.1)  
**Gap**: No methods to leverage the dual-purpose design in queries

## Implementation Solution

### **New Service: EntityResolutionService**

Created a comprehensive service to handle context-aware entity resolution per PRD specifications:

```typescript
// Location: src/repositories/entity-resolution.service.ts
@Injectable()
export class EntityResolutionService {
  // PRD 4.3.1: Menu item context resolution
  async getEntityInMenuContext(entityId: string, restaurantId: string)
  
  // PRD 4.3.1: Category context resolution  
  async getEntityInCategoryContext(entityId: string)
  
  // PRD 4.3.2: Context-dependent attribute resolution
  async resolveContextualAttributes(attributeName: string, scope: 'dish' | 'restaurant')
  
  // PRD 4.3.1: Find entities serving dual purposes
  async findDualPurposeEntities()
  
  // PRD 4.3.2: Create/resolve scope-specific attributes
  async createOrResolveContextualAttribute(name: string, scope: 'dish' | 'restaurant')
}
```

### **Enhanced Repository Methods**

Extended `EntityRepository` with dual-purpose entity support:

```typescript
// PRD 4.3.1: Query entities by usage context
async findDishEntitiesByUsage(
  usageType: 'menu_item' | 'category' | 'both',
  restaurantId?: string
): Promise<Entity[]>

// PRD 4.3.2: Cross-type name resolution for context-dependent attributes
async findByNameAcrossTypes(
  searchTerm: string, 
  entityTypes: EntityType[]
): Promise<{ [key in EntityType]?: Entity[] }>
```

## Key PRD Compliance Features

### **1. Unified dish_or_category Entity Handling (PRD 4.3.1)**

#### **Dual Context Resolution**
- **Menu Item Context**: When `isMenuItem = true` in connections, entity represents specific dish
- **Category Context**: When stored in `categories` array, entity represents food category
- **Same Entity ID**: Can serve both purposes simultaneously

#### **Implementation Examples**:
```typescript
// Get "Ramen" as a menu item at specific restaurant
const menuItem = await entityResolutionService.getEntityInMenuContext(
  'ramen-entity-id', 
  'restaurant-123'
);

// Get "Ramen" as a category across all restaurants  
const category = await entityResolutionService.getEntityInCategoryContext(
  'ramen-entity-id'
);

// Find entities used in both contexts (dual-purpose)
const dualPurpose = await entityResolutionService.findDualPurposeEntities();
```

### **2. Context-Dependent Attribute Management (PRD 4.3.2)**

#### **Scope-Aware Entity Resolution**
- **Separate Entities by Scope**: "Italian" exists as both `dish_attribute` AND `restaurant_attribute`
- **Context-Aware Lookups**: Matches by name AND scope to find correct entity
- **Flexible Cross-Scope Analysis**: Enables precise filtering by attribute context

#### **Implementation Examples**:
```typescript
// Resolve "Italian" in dish context -> dish_attribute entity
const dishItalian = await entityResolutionService.resolveContextualAttributes(
  'Italian', 
  'dish'
);

// Resolve "Italian" in restaurant context -> restaurant_attribute entity  
const restaurantItalian = await entityResolutionService.resolveContextualAttributes(
  'Italian', 
  'restaurant'
);

// Create or find context-specific attribute
const attribute = await entityResolutionService.createOrResolveContextualAttribute(
  'Spicy', 
  'dish',
  ['Hot', 'Fiery'] // aliases
);
```

### **3. Enhanced Query Capabilities**

#### **Usage-Based Entity Filtering**:
```typescript
// Find dishes used only as menu items
const menuOnlyDishes = await entityRepository.findDishEntitiesByUsage('menu_item');

// Find dishes used only as categories
const categoryOnlyDishes = await entityRepository.findDishEntitiesByUsage('category');

// Find dishes serving dual purposes (menu item AND category)
const dualPurposeDishes = await entityRepository.findDishEntitiesByUsage('both');
```

#### **Cross-Type Attribute Search**:
```typescript
// Find "Italian" across both dish and restaurant attribute types
const italianAttributes = await entityRepository.findByNameAcrossTypes(
  'Italian',
  ['dish_attribute', 'restaurant_attribute']
);
// Returns: { dish_attribute: [Entity], restaurant_attribute: [Entity] }
```

## Architecture Compliance Status

### ✅ **Fully Compliant Areas**

1. **Graph-Based Unified Entity Model (PRD 4.2.1)**:
   - ✅ Unified `dish_or_category` entities serve dual purposes
   - ✅ Connection-scoped relationships (categories and dish attributes in connections only)
   - ✅ Restaurant-scoped attributes (stored in restaurant entities)
   - ✅ Evidence-driven connections (all relationships backed by mentions)
   - ✅ Restaurant→dish connections only (no direct category/attribute connections)

2. **Entity Type Definitions (PRD 4.2.2)**:
   - ✅ `restaurant`: Physical establishments with location data
   - ✅ `dish_or_category`: Dual-purpose food entities
   - ✅ `dish_attribute`: Connection-scoped descriptors
   - ✅ `restaurant_attribute`: Restaurant-scoped descriptors
   - ✅ Context-dependent attributes with separate entities by scope

3. **Connection Architecture (PRD 4.3.3-4.3.4)**:
   - ✅ Restaurant attributes in entity's `restaurant_attributes` array
   - ✅ Dish attributes in connection's `dish_attributes` array  
   - ✅ Categories in connection's `categories` array
   - ✅ Only restaurant-to-dish_or_category connections

### ✅ **New Implementations**

4. **Unified dish_or_category Approach (PRD 4.3.1)**:
   - ✅ Context-aware entity resolution (menu vs category)
   - ✅ Dual-purpose entity identification and querying
   - ✅ Same entity ID handling in both contexts

5. **Context-Driven Attribute Management (PRD 4.3.2)**:
   - ✅ Scope-aware attribute resolution
   - ✅ Cross-scope attribute creation and management
   - ✅ Context-dependent entity lookup capabilities

## Testing Coverage

### **Comprehensive Test Suite**
- **EntityResolutionService**: 13/13 tests passing
- **EntityRepository**: 17/17 tests passing  
- **ConnectionRepository**: 11/11 tests passing
- **Total**: 41/41 tests passing

### **Test Coverage Includes**:
- Dual-context entity resolution (menu item vs category)
- Context-dependent attribute resolution  
- Scope-aware entity creation and validation
- Cross-type attribute searching
- Dual-purpose entity identification
- Error handling and edge cases

## Files Created/Modified

### **New Service Layer**
- `src/repositories/entity-resolution.service.ts` - Core context-aware entity resolution
- `src/repositories/entity-resolution.service.spec.ts` - Comprehensive test suite

### **Enhanced Repository Layer**  
- `src/repositories/entity.repository.ts` - Added dual-purpose entity methods
- `src/repositories/repository.module.ts` - Registered new service

### **Previous PRD Alignment (T06_S02)**
- Database migration for GIN indexes
- Restaurant attributes query logic fixes
- Enhanced validation methods

## Business Value Delivered

### **1. True Unified Entity Model**
The implementation now fully realizes the PRD's vision of `dish_or_category` entities serving dual purposes, enabling:
- Same "Ramen" entity used as both menu item and category
- Efficient entity reuse without redundancy
- Flexible categorization without entity proliferation

### **2. Context-Aware Search Capabilities**
Applications can now:
- Search for "Italian" dishes vs "Italian" restaurants with precision
- Query entities by their usage context (menu item, category, or both)
- Resolve attribute names across different scopes

### **3. Production-Ready Architecture**
- Comprehensive validation for all entity contexts
- Robust error handling with specific exception types
- Full test coverage with edge case handling
- Scalable design supporting future search/discovery features

## Next Steps for Service Layer Integration

### **Priority 1: Search & Discovery Service**
Create service layer that leverages dual-purpose entities:
```typescript
@Injectable()
export class SearchDiscoveryService {
  // Unified search across menu items and categories
  async searchDishesAndCategories(query: string)
  
  // Context-aware attribute filtering
  async findByAttributes(attributes: string[], context: 'menu' | 'category')
}
```

### **Priority 2: API Endpoints**
Expose entity resolution capabilities via REST APIs:
- `GET /entities/{id}/menu-context/{restaurantId}` 
- `GET /entities/{id}/category-context`
- `GET /attributes/{name}?scope=dish|restaurant`

### **Priority 3: Integration with Query Processing**
Integrate with future LLM query processing to leverage context-aware resolution for user searches.

## Conclusion

The implementation now provides **complete PRD Sections 4.2-4.3 compliance** with production-ready service layer logic for:

- ✅ **Unified Entity Model**: Full dual-purpose `dish_or_category` support
- ✅ **Context-Dependent Attributes**: Scope-aware attribute resolution  
- ✅ **Graph-Based Architecture**: Connection-scoped vs restaurant-scoped attribute handling
- ✅ **Evidence-Driven Connections**: Validation ensures all relationships are trackable

The foundation is now in place to build sophisticated search and discovery features that fully leverage the graph-based unified entity model as envisioned in the PRD.