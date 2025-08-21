# Entity Resolution System - Gap Analysis & Implementation Plan

## Executive Summary
Current implementation covers **25%** of PRD requirements. While three-tier entity resolution is complete, the critical **component-based processing**, **connection management**, **mention scoring**, and **quality computation** systems are entirely missing.

---

## 🔴 Critical Missing Components

### 1. Component-Based Processing System
**PRD Reference**: Section 6.5 - Component-Based DB Processing Guide  
**Current Status**: ❌ **COMPLETELY MISSING**

#### Required Components (PRD 6.5.1):

##### Component 1: Restaurant Entity Processing
- **Always Processed**: Yes
- **Action**: Create restaurant entity if missing from database
- **Current**: ✅ EntityRepository.createRestaurant() exists

##### Component 2: Restaurant Attributes Processing  
- **Processed when**: restaurant_attributes is present
- **Action**: Add restaurant_attribute entity IDs to restaurant entity's metadata
- **Current**: ❌ No implementation

##### Component 3: General Praise Processing
- **Processed when**: general_praise is true
- **Action**: Boost ALL existing dish connections for restaurant
- **Note**: Do NOT create dish connections if none exist
- **Current**: ❌ No implementation

##### Component 4: Specific Dish Processing
- **Processed when**: dish_or_category present AND is_menu_item is true
- **With Attributes**: Complex selective/descriptive logic
- **Without Attributes**: Find/create restaurant→dish connection
- **Current**: ❌ No implementation

##### Component 5: Category Processing
- **Processed when**: dish_or_category present AND is_menu_item is false
- **Action**: Find existing dishes with category and boost
- **Note**: Never create category dishes that don't exist
- **Current**: ❌ No implementation

##### Component 6: Attribute-Only Processing
- **Processed when**: dish_or_category is null AND dish_attributes present
- **Action**: Find and boost existing connections with attributes
- **Current**: ❌ No implementation

#### Implementation Design Space:
```typescript
// TODO: Design ConnectionProcessingService
interface ComponentProcessor {
  process(mention: ProcessedMention, entities: ResolvedEntities): ComponentResult;
}

class RestaurantAttributeProcessor implements ComponentProcessor {
  // Implementation here
}

class GeneralPraiseProcessor implements ComponentProcessor {
  // Implementation here
}

class SpecificDishProcessor implements ComponentProcessor {
  // Implementation here
}

class CategoryProcessor implements ComponentProcessor {
  // Implementation here
}

class AttributeOnlyProcessor implements ComponentProcessor {
  // Implementation here
}
```

---

### 2. Connection Management System
**PRD Reference**: Section 4.1.2 - Connections Table Schema  
**Current Status**: ❌ **COMPLETELY MISSING**

#### Required Connection Fields (Not Utilized):
- `connection_id`: UUID primary key
- `restaurant_id`: Foreign key to restaurant entity
- `dish_or_category_id`: Foreign key to dish_or_category entity
- `categories`: Array of category entity IDs
- `dish_attributes`: Array of dish_attribute entity IDs
- `restaurant_attributes`: Array of restaurant_attribute entity IDs
- `is_menu_item`: Boolean (true = specific dish, false = category)
- `mention_count`: Total mentions for this connection
- `total_upvotes`: Sum of all mention upvotes
- `source_diversity`: Count of unique threads
- `recent_mention_count`: Mentions within 30 days
- `last_mentioned_at`: Most recent mention timestamp
- `activity_level`: Enum (trending/active/normal)
- `top_mentions`: JSONB array of scored mentions
- `connection_quality_score`: Pre-computed quality score

#### Implementation Design Space:
```typescript
// TODO: Design ConnectionRepository
interface ConnectionRepository {
  findExistingConnection(
    restaurantId: string,
    dishOrCategoryId: string,
    attributes?: ConnectionAttributes
  ): Promise<Connection | null>;
  
  createConnection(data: CreateConnectionInput): Promise<Connection>;
  
  updateConnectionMetrics(
    connectionId: string,
    metrics: ConnectionMetrics
  ): Promise<Connection>;
  
  boostConnection(
    connectionId: string,
    mention: MentionData
  ): Promise<void>;
}

interface ConnectionAttributes {
  categories?: string[];
  dishAttributes?: string[];
  restaurantAttributes?: string[];
  isMenuItem: boolean;
}
```

---

### 3. Mention Scoring & Activity System
**PRD Reference**: Section 6.4.2 - Mention Scoring & Activity Calculation  
**Current Status**: ❌ **COMPLETELY MISSING**

#### Required Functionality:

##### Top Mention Scoring (PRD 6.4.2)
- **Formula**: `upvotes × e^(-days_since / 60)`
- **Process**: Re-score ALL existing mentions when new ones arrive
- **Storage**: Top 3-5 mentions in `connections.top_mentions` JSONB
- **Format**: `{"mention_id": "uuid", "score": 45.2, "upvotes": 67, ...}`

##### Activity Level Calculation
- **"trending" (🔥)**: All top 3-5 mentions within 30 days
- **"active" (🕐)**: `last_mentioned_at` within 7 days  
- **"normal"**: Default state
- **Storage**: `connections.activity_level` enum field

#### Implementation Design Space:
```typescript
// TODO: Design MentionScoringService
interface MentionScoringService {
  calculateMentionScore(
    upvotes: number,
    createdAt: Date
  ): number;
  
  updateTopMentions(
    existingMentions: TopMention[],
    newMention: MentionData
  ): TopMention[];
  
  determineActivityLevel(
    topMentions: TopMention[],
    lastMentionedAt: Date
  ): ActivityLevel;
}

interface TopMention {
  mention_id: string;
  score: number;
  upvotes: number;
  created_at: Date;
  permalink: string;
  author: string;
}

enum ActivityLevel {
  TRENDING = 'trending',
  ACTIVE = 'active',
  NORMAL = 'normal'
}
```

---

### 4. Consolidated Processing Pipeline
**PRD Reference**: Section 6.4 - Consolidated Processing Phase  
**Current Status**: ❌ **MISSING ORCHESTRATION**

#### Required Pipeline (PRD 6.1):
```
LLM Output → Entity Resolution (4a) → Mention Scoring (4b) → 
Component Processing (4c) → Single Database Transaction
```

#### Single Transaction Requirements (PRD 6.6.2):
1. Entity resolution results (updates/creates)
2. Connection updates (metrics, attributes, categories)
3. Top mention updates (replace arrays)
4. Quality score updates

#### Implementation Design Space:
```typescript
// TODO: Design ConsolidatedProcessingService
interface ConsolidatedProcessingService {
  async processBatch(
    llmOutput: LLMOutput
  ): Promise<ProcessingResult> {
    // Phase 1: Entity Resolution
    const resolvedEntities = await this.entityResolver.resolveBatch(...);
    
    // Phase 2: Mention Scoring
    const scoredMentions = await this.mentionScorer.scoreMentions(...);
    
    // Phase 3: Component Processing (parallel)
    const componentResults = await Promise.all([
      this.restaurantProcessor.process(...),
      this.restaurantAttributeProcessor.process(...),
      this.generalPraiseProcessor.process(...),
      this.specificDishProcessor.process(...),
      this.categoryProcessor.process(...),
      this.attributeOnlyProcessor.process(...)
    ]);
    
    // Phase 4: Single Atomic Transaction
    return await this.executeTransaction(
      resolvedEntities,
      scoredMentions,
      componentResults
    );
  }
}
```

---

### 5. Attribute Processing Logic
**PRD Reference**: Section 6.5.3 - Attribute Processing Logic  
**Current Status**: ❌ **COMPLETELY MISSING**

#### Critical Logic Rules:

##### Selective Attributes (OR Logic)
- **Finding**: Match ANY of the selective attributes
- **Example**: "vegan and gluten-free" → Find dishes that are vegan OR gluten-free
- **Rationale**: Users want options satisfying any dietary need

##### Descriptive Attributes (AND Logic)  
- **Adding**: ALL descriptive attributes added together
- **Example**: "creamy and rich pasta" → Add BOTH "creamy" AND "rich"
- **Rationale**: All describe the same dish simultaneously

#### Implementation Design Space:
```typescript
// TODO: Design AttributeProcessor
interface AttributeProcessor {
  findConnectionsWithSelectiveAttributes(
    restaurantId: string,
    dishOrCategoryId: string,
    selectiveAttributes: string[]
  ): Promise<Connection[]>;
  
  addDescriptiveAttributes(
    connectionId: string,
    descriptiveAttributes: string[]
  ): Promise<void>;
  
  processAttributeMix(
    selective: string[],
    descriptive: string[],
    connection: Connection
  ): Promise<ProcessedAttributes>;
}
```

---

### 6. Quality Score Computation
**PRD Reference**: Section 5.3 - Quality Score Computation  
**Current Status**: ❌ **COMPLETELY MISSING**

#### Required Scores:

##### Dish Quality Score (PRD 5.3.1)
- **Primary (85-90%)**: Connection strength metrics
  - Mention count with time decay
  - Total upvotes with time decay
  - Source diversity
- **Secondary (10-15%)**: Restaurant context factor

##### Restaurant Quality Score (PRD 5.3.2)
- **Primary (80%)**: Top 3-5 highest-scoring dishes
- **Secondary (20%)**: Average quality across all dishes

##### Category/Attribute Performance (PRD 5.3.3)
- Find relevant dishes in category/with attribute
- Calculate weighted average of dish quality scores
- Use contextual score for ranking

#### Implementation Design Space:
```typescript
// TODO: Design QualityScoreService
interface QualityScoreService {
  calculateDishQualityScore(
    connection: Connection,
    restaurantScore: number
  ): number;
  
  calculateRestaurantQualityScore(
    topDishScores: number[],
    averageMenuScore: number
  ): number;
  
  calculateCategoryPerformanceScore(
    restaurantId: string,
    category: string
  ): number;
}
```

---

## 📊 Implementation Status Matrix

| Component | PRD Section | Current Status | Implementation Priority |
|-----------|-------------|---------------|------------------------|
| Entity Resolution | 5.2.1 | ✅ 90% Complete | Low |
| Alias Management | 5.2.1 | ✅ 85% Complete | Low |
| Component Processing | 6.5 | ❌ 0% | **CRITICAL** |
| Connection Management | 4.1.2 | ❌ 0% | **CRITICAL** |
| Mention Scoring | 6.4.2 | ❌ 0% | **CRITICAL** |
| Activity Levels | 6.4.2 | ❌ 0% | High |
| Quality Scores | 5.3 | ❌ 0% | High |
| Transaction Orchestration | 6.6 | ❌ 0% | **CRITICAL** |
| Attribute Logic | 6.5.3 | ❌ 0% | **CRITICAL** |

---

## 🎯 Implementation Roadmap

### Phase 1: Foundation (Week 1)
1. **ConnectionRepository** - CRUD operations for connections table
2. **MentionRepository** - CRUD operations for mentions table
3. **Database Schema Validation** - Ensure all PRD fields exist

### Phase 2: Core Processing (Week 2)
1. **Component Processors** - All 6 component implementations
2. **Attribute Processing Logic** - Selective vs Descriptive handling
3. **Connection Finding Logic** - Complex attribute matching

### Phase 3: Scoring & Activity (Week 3)
1. **MentionScoringService** - Time-weighted formula implementation
2. **Activity Level Calculator** - Trending/Active/Normal logic
3. **Top Mention Management** - Array replacement logic

### Phase 4: Orchestration (Week 4)
1. **ConsolidatedProcessingService** - Pipeline orchestrator
2. **Transaction Management** - Single atomic commits
3. **Quality Score Computation** - All three score types

### Phase 5: Integration & Testing (Week 5)
1. **End-to-end Pipeline Testing**
2. **Performance Optimization**
3. **Error Handling & Retry Logic**

---

## 🚨 Critical Design Decisions Needed

### 1. Component Processing Order
Should components process in parallel or sequence? PRD suggests parallel (6.4.3).

**Decision**: _____________________

### 2. Medium Confidence Heuristics
What rules for 0.7-0.85 confidence matches? PRD says "heuristic rules or flag for review".

**Decision**: _____________________

### 3. Transaction Rollback Strategy
How to handle partial failures in consolidated processing?

**Decision**: _____________________

### 4. Mention Storage Limit
Top 3 or top 5 mentions? PRD says "3-5".

**Decision**: _____________________

### 5. Activity Level Cache Strategy
Calculate on-demand or pre-compute during processing?

**Decision**: _____________________

---

## 📝 Implementation Notes Section

### ConnectionProcessingService Design
```typescript
// Start implementation design here...
```

### MentionScoringService Design
```typescript
// Start implementation design here...
```

### Component Processor Implementations
```typescript
// Start implementation design here...
```

### Transaction Orchestration Design
```typescript
// Start implementation design here...
```

---

## 🔍 PRD Quick Reference Links

- **Entity Resolution**: Section 5.2
- **Component Processing**: Section 6.5
- **Mention Scoring**: Section 6.4.2
- **Quality Scores**: Section 5.3
- **Database Schema**: Section 4.1
- **Processing Pipeline**: Section 6.1
- **Bulk Operations**: Section 6.6

---

## ✅ Acceptance Criteria

### Must Have (PRD Compliant)
- [ ] All 6 component processors implemented
- [ ] Connection creation and updating logic
- [ ] Mention scoring with time decay formula
- [ ] Activity level calculation (trending/active/normal)
- [ ] Single atomic transaction for all updates
- [ ] Selective (OR) vs Descriptive (AND) attribute logic
- [ ] Top 3-5 mention management
- [ ] Quality score computation for all entity types

### Should Have (Performance)
- [ ] Batch processing optimization
- [ ] Parallel component processing
- [ ] Connection caching for repeated lookups
- [ ] Prepared statement usage

### Could Have (Future)
- [ ] BK-tree fuzzy matching optimization
- [ ] Redis caching layer
- [ ] Async fuzzy matching pipeline
- [ ] Real-time activity indicators

---

## 🐛 Known Issues & Blockers

1. **Missing Database Columns**: Verify all PRD fields exist in Prisma schema
2. **Transaction Scope**: NestJS/Prisma transaction boundaries need design
3. **Performance Unknowns**: Component processing parallelization impact
4. **Testing Data**: Need comprehensive test data for all 6 components

---

## 📅 Timeline Estimate

**Total Effort**: 5 weeks (1 developer)
**Complexity**: High - requires careful orchestration and transaction management
**Risk**: Medium - PRD is detailed but implementation has many moving parts

---

*Last Updated: 2025-08-21*
*PRD Version: 3.0*
*Current Implementation: 25% Complete*