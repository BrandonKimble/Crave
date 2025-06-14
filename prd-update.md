# Crave App: Comprehensive System Design & Implementation Guide

## Section 1: LLM Context & Processing Guidelines

*These sections function together as a logical processing flow for the LLM: first establishing data structures, then classification frameworks and processing rules, then providing step-by-step extraction and processing instructions.*

### 1.1 LLM Input/Output Structures

#### Data Collection Input Structure
```json
{
  "posts": [
    {
      "post_id": "string",
      "title": "string", 
      "content": "string",
      "subreddit": "string",
      "url": "string",
      "upvotes": number,
      "created_at": "timestamp",
      "comments": [
        {
          "comment_id": "string",
          "content": "string", 
          "author": "string",
          "upvotes": number,
          "created_at": "timestamp",
          "parent_id": "string|null",
          "url": "string"
        }
      ]
    }
  ]
}
```

#### Data Collection Output Structure
```json
{
  "mentions": [
    {
      "temp_id": "string",
      "restaurant": {
        "normalized_name": "string",
        "original_text": "string",
        "temp_id": "string"
      },
      "restaurant_attributes": ["string"] | null,
      "dish_or_category": {
        "normalized_name": "string", 
        "original_text": "string",
        "temp_id": "string"
      } | null,
      "dish_attributes": [
        {
          "attribute": "string",
          "type": "selective|descriptive"
        }
      ] | null,
      "is_menu_item": boolean,
      "general_praise": boolean,
      "source": {
        "type": "post|comment",
        "id": "string",
        "url": "string",
        "upvotes": number,
        "created_at": "timestamp"
      }
    }
  ]
}
```

#### Query Processing Input Structure
```json
{
  "query": "string",
  "location_bounds": {
    "ne_lat": number,
    "ne_lng": number, 
    "sw_lat": number,
    "sw_lng": number
  },
  "open_now": boolean,
  "user_context": "string|null"
}
```

#### Query Processing Output Structure
```json
{
  "query_type": "dish_specific|category_specific|venue_specific|attribute_specific|broad",
  "entities": {
    "restaurants": [
      {
        "normalized_name": "string",
        "original_text": "string"
      }
    ],
    "dish_or_categories": [
      {
        "normalized_name": "string",
        "original_text": "string"
      }
    ],
    "attributes": [
      {
        "normalized_name": "string",
        "original_text": "string",
        "scope": "restaurant|dish"
      }
    ]
  },
  "filters": {
    "location_bounds": "object",
    "open_now": boolean
  }
}
```

### 1.2 Core Comment & Post Processing Criteria

#### Entity Inheritance Principle
Comments may inherit entities (restaurants, dishes, attributes) from parent comment/post when connection is unambiguous. Short affirmations ("+1", "seconded", "this", "agreed", etc.) automatically inherit all entities and sentiment from the parent comment.

#### Core Processing Criteria - Process ONLY When ALL Are Met
1. **Sentiment Criterion:** Content expresses or affirms positive sentiment about food/restaurant quality
2. **Entity Criterion:** Content can be linked to:
   - Restaurant entity AND EITHER:
     - Dish/category entity, OR
     - Restaurant attribute, OR  
     - Clear general praise for the restaurant
3. **Relevance Criterion:** Content appears to describe current offerings

#### Skip Conditions (Overrides All Other Rules)
- Content fails to meet ANY of the core requirements above
- Focused exclusively on non-food aspects
- Promotional or marketing content

#### General Praise Identification
**General Praise (general_praise: true):**
Set to true when mention contains any holistic restaurant praise, regardless of whether it also contains specific praise.

Examples:
- "This place is amazing" → true
- "Franklin BBQ is amazing and their brisket is great" → true
- "Their brisket is great" → false

#### Context and Entity Inference Note
**For posts/comments that don't contain directly processable information:** Even if content doesn't meet the core processing criteria, it can still provide valuable context for entity inheritance, restaurant identification, or setting up context for subsequent comments in the thread.

### 1.3 Entity Types & Classification Rules

#### Entity Types
- **restaurant**: Physical dining establishments
- **dish_or_category**: Food items that can serve as both specific menu items and general categories
- **dish_attribute**: Descriptive terms that apply to dishes (connection-scoped)
- **restaurant_attribute**: Descriptive terms that apply to restaurants (restaurant-scoped)

#### Strict Type Separation
**ONLY dish types can be categories:**
- Nouns that represent types of food items
- Examples: pizza, taco, burger, sandwich, soup, salad, pasta

**Dish-only attributes (connection-scoped only):**
- Cuisine terms: Italian, Mexican, Thai, Mediterranean
- Meal periods: breakfast, lunch, dinner, brunch
- Preparation: grilled, fried, spicy, crispy
- Flavor descriptors: sweet, savory, tangy, rich
- Special times: happy hour, daily specials, weekend specials
- Value/Quality (for dishes): cheap, expensive, best, worth-it

**Restaurant-scoped attributes (stored directly on restaurant entities):**
- Ambiance: romantic, casual, family-friendly, quiet
- Features: patio, rooftop, outdoor, bar seating
- Service: quick, friendly, attentive
- Value/Quality (for restaurants): affordable, expensive, budget-friendly

#### Selective vs Descriptive Classification
**Selective attributes:** Help filter or categorize options
- "great vegan choices" → vegan is selective
- "best Italian restaurants" → Italian is selective
- "good breakfast spots" → breakfast is selective

**Descriptive attributes:** Characterize or describe specific items
- "this pasta is very vegan" → vegan is descriptive
- "their sandwich is so Italian" → Italian is descriptive
- "feels breakfast-y" → breakfast is descriptive

**Principle:** Is it about what type of thing it is (selective) or how that thing is (descriptive)?

### 1.4 Compound Term Processing Rules (Food Terms Only)

*Apply these rules only to food-related compound terms, not restaurant names or other entities.*

#### Complete Preservation Rule
Always store the complete compound food term as primary category in singular form, **excluding any terms identified as attributes**.

#### Hierarchical Decomposition Rule
Create all meaningful food noun combinations as additional categories:
- Include significant ingredients as standalone categories
- Convert all category terms to singular form
- Include parent categories when term represents specific subtype
- **Exclude any terms identified as attributes from decomposition**

#### Attribute Exclusion Principle
Before applying compound term processing to food mentions, exclude any terms that are preparation methods, cooking styles, dietary restrictions, cuisines, or meal periods. Apply compound term processing only to remaining food substance terms.

Examples:
- "spicy ramen" → Extract "spicy" as attribute, process only "ramen" for compound terms
- "breakfast burrito" → Extract "breakfast" as attribute, process only "burrito" for compound terms
- "house-made carnitas taco" → Extract "house-made" as preparation attribute, process "carnitas taco" for compound terms

#### Inference Rules
- Infer parent categories for specific dish subtypes even when not explicitly mentioned
- Derive broader cuisine attributes from specific ones
- Apply known culinary relationships

### 1.5 Menu Item Identification Rules

When setting the is_menu_item flag on restaurant→dish connections (applied to clean food terms after attribute extraction):

#### Specificity
- More specific dishes are likely menu items
- Example: "brisket" at Franklin BBQ (is_menu_item = true)
- Example: "BBQ" (is_menu_item = false)

#### Plurality
- Singular forms often indicate menu items
- Example: "the burger" (is_menu_item = true)
- Example: "burgers" (is_menu_item = false)

#### Modifiers
- Specific preparation details suggest menu items
- Example: "house-made carnitas taco" (is_menu_item = true)
- Example: "seafood" (is_menu_item = false)

#### Context
- "Try their X" typically indicates menu item
- "Known for X" typically indicates menu item
- "Type of X" typically indicates category
- Example: "Try their migas taco" (is_menu_item = true)
- Example: "They have all types of tacos" (is_menu_item = false)

#### Hierarchical Position
- If entity is mentioned alongside more specific versions, likely a category
- Example: In "great ramen, especially the tonkotsu"
  "tonkotsu ramen" (is_menu_item = true)
  "ramen" (is_menu_item = false)

#### Default Case
- If uncertain, check if dish is mentioned as something specifically ordered
- Example: "I ordered the pad thai" (is_menu_item = true)
- Example: "They specialize in Thai food" (is_menu_item = false)

### 1.6 Central Entity Extraction & Processing Guide

#### Processing Flow Overview
Use this central guide to extract entities systematically, referencing the appropriate classification rules and processing guidelines at each step:

#### Step 1: Initial Content Assessment
- Apply **Core Comment & Post Processing Criteria** (Section 1.2) to determine if content should be processed
- **Entity Inheritance:** Check if entities can be inherited from parent comment/post when connection is unambiguous
- **Short Affirmations:** Handle "+1", "seconded", "this", "agreed" by automatically inheriting all entities and sentiment from parent
- **General Praise Identification:** Determine if mention contains holistic restaurant praise using guidelines from Section 1.2

#### Step 2: Entity Identification & Classification
- Extract restaurant mentions (explicit or contextually inferred)
- For food mentions, apply **Entity Types & Classification Rules** (Section 1.3) to identify:
  - Which terms are dish_or_category entities (food nouns)
  - Which terms are dish_attributes (preparation, cuisine, meal periods, etc.)
  - Which terms are restaurant_attributes (ambiance, features, service)

#### Step 3: Food Term Processing
- For food mentions, apply **Compound Term Processing Rules** (Section 1.4):
  - Exclude attribute terms identified in Step 2
  - Apply hierarchical decomposition to remaining food substance terms
  - Create parent-child category relationships
- Apply **Menu Item Identification Rules** (Section 1.5) to determine is_menu_item flag

#### Step 4: Attribute Classification
- For identified attributes, apply **Selective vs Descriptive Classification** (Section 1.3)
- Ensure proper scope assignment (dish attributes vs restaurant attributes)

#### Step 5: Normalization & Output
- Convert to lowercase canonical forms
- Remove unnecessary articles (the, a, an)
- Standardize punctuation and spacing
- Store original mention text separately for alias creation
- Handle common abbreviations and nicknames
- Output in standardized JSON structure

#### Key Processing Examples
- "Their tonkotsu ramen is amazing" → Create restaurant→"tonkotsu ramen" connection with "ramen" in categories
- "Great breakfast tacos here" → Find/boost taco dishes with "breakfast" in dish_attributes
- "Great patio dining at Uchiko" → Add "patio" entity ID to Uchiko's restaurant_attributes array in metadata

## Section 2: System Architecture & Implementation

### 2.1 Database Schema

#### Entities Table
```sql
entities {
  entity_id: uuid PRIMARY KEY
  name: varchar(255) -- Canonical normalized name
  type: enum('restaurant', 'dish_or_category', 'dish_attribute', 'restaurant_attribute')
  aliases: text[] -- Original texts and known variations
  metadata: jsonb -- Location, hours for restaurants; restaurant_attributes: uuid[] for restaurants
  global_quality_score: decimal(10,4) -- Pre-computed ranking score
  last_updated: timestamp
  created_at: timestamp
}
```

#### Connections Table  
```sql
connections {
  connection_id: uuid PRIMARY KEY
  restaurant_id: uuid REFERENCES entities(entity_id)
  dish_or_category_id: uuid REFERENCES entities(entity_id) -- Can be null
  categories: uuid[] -- References to dish_or_category entities this dish belongs to
  dish_attributes: uuid[] -- References to dish_attribute entities (connection-scoped)
  is_menu_item: boolean -- True for specific menu items
  metrics: jsonb {
    mention_count: integer
    total_upvotes: integer
    source_diversity: integer
    recent_mention_count: integer
    top_mentions: array[mention_id]
    last_mentioned_at: timestamp
    activity_level: enum('trending', 'active', 'normal')
  }
  last_updated: timestamp
  created_at: timestamp
}
```

#### Mentions Table
```sql
mentions {
  mention_id: uuid PRIMARY KEY
  connection_id: uuid REFERENCES connections(connection_id)
  source_type: enum('post', 'comment')
  source_id: varchar(255) -- Reddit post/comment ID
  source_url: varchar(500) -- Full Reddit URL
  subreddit: varchar(100)
  content_excerpt: text
  author: varchar(255)
  upvotes: integer
  created_at: timestamp
}
```

### 2.2 Component-Based DB Processing Guide

#### Unified LLM Output Structure
LLM always outputs the same structure regardless of entity combinations:
```json
{
  "restaurant": {entity},
  "restaurant_attributes": [array] | null,
  "dish_or_category": {entity} | null,
  "dish_attributes": [
    {"attribute": "string", "type": "selective|descriptive"}
  ] | null,
  "is_menu_item": boolean,
  "general_praise": boolean
}
```

#### Modular Processing Components
All applicable components process independently for each mention.

**Component 1: Restaurant Entity Processing**
- Always Processed
- Action: Create restaurant entity if missing from database

**Component 2: Restaurant Attributes Processing**  
- Processed when: restaurant_attributes is present
- Action: Add restaurant_attribute entity IDs to restaurant entity's metadata

**Component 3: General Praise Processing**
- Processed when: general_praise is true (mentions containing holistic restaurant praise)
- Action: Boost all existing dish connections for this restaurant
- Note: Do not create dish connections if none exist

**Component 4: Specific Dish Processing**
- Processed when: dish_or_category is present AND is_menu_item is true

With Dish Attributes:
- **All Selective:** Find existing restaurant→dish connections for the same dish that have ANY of the selective attributes; If found: boost those connections; If not found: create new connection with all attributes
- **All Descriptive:** Find ANY existing restaurant→dish connections for the same dish; If found: boost connections + add descriptive attributes; If not found: create new connection with all attributes
- **Mixed:** Find existing connections for the same dish that have ANY of the selective attributes; If found: boost + add descriptive attributes; If not found: create new connection with all attributes

Without Dish Attributes:
- Action: Find/create restaurant→dish connection and boost it

**Component 5: Category Processing**
- Processed when: dish_or_category is present AND is_menu_item is false

With Dish Attributes:
- **All Selective:** Find existing dish connections with category; Filter to connections with ANY of the selective attributes; Boost filtered connections; Do not create if no matches found
- **All Descriptive:** Find existing dish connections with category; Boost all found connections; Add descriptive attributes to those connections; Do not create if no category dishes exist
- **Mixed:** Find existing dish connections with category; Filter to connections with ANY of the selective attributes; Boost filtered connections + add descriptive attributes; Do not create if no matches found

Without Dish Attributes:
- Action: Find existing dish connections with category and boost them
- Do not create if no category dishes exist

**Component 6: Attribute-Only Processing**
- Processed when: dish_or_category is null AND dish_attributes is present

- **All Selective:** Find existing dish connections with ANY of the selective attributes; Boost those connections; Do not create if no matches found
- **All Descriptive:** Skip processing (no target for descriptive attributes)
- **Mixed:** Find existing dish connections with ANY of the selective attributes; Boost those connections; Ignore descriptive attributes

#### Entity Creation Rules

**Always Create:**
- Restaurant entities: When restaurant is missing from database
- Specific dish connections: When is_menu_item: true and no matching connection exists

**Never Create (Skip Processing):**
- Category dishes: When category mentioned but no dishes with that category exist
- Attribute matches: When attribute filtering finds no existing dishes
- General praise dish connections: When general_praise: true but no dish connections exist
- Descriptive-only attributes: When no dish_or_category is present

#### Attribute Processing Logic
**Selective Attributes (OR Logic):**
When finding existing connections with selective attributes, use OR logic (match ANY of the selective attributes):
- "great vegan and gluten-free options" → Boost dishes that are vegan OR gluten-free
- "spicy reuben is amazing" → Find reuben connections that have spicy OR any other selective attributes

**Descriptive Attributes (AND Logic):**
When adding descriptive attributes to connections, ALL descriptive attributes are added together:
- "this pasta is very creamy and rich" → Add both "creamy" AND "rich" to the pasta connection
- Descriptive attributes characterize the specific item, so they all apply simultaneously

**Why This Logic:**
- Selective attributes represent filtering criteria - users want options that satisfy any of their dietary/preference needs
- Descriptive attributes describe specific characteristics of individual items - they all describe the same dish
- OR logic for selective maximizes relevant results; AND logic for descriptive ensures complete characterization

#### Core Principles
1. **Modular Processing:** All applicable components process independently
2. **Additive Logic:** Multiple processing components can apply to the same mention
3. **Selective = Filtering:** Find existing connections that match any of the selective attributes
4. **Descriptive = Enhancement:** Add attributes to existing connections
5. **OR Logic:** Multiple selective attributes use OR logic (any match qualifies)
6. **Create Specific Only:** Only create new connections for specific dishes (menu items)
7. **No Placeholder Creation:** Never create category dishes or attribute matches that don't exist
8. **Restaurant Always Created:** Restaurant entities are always created if missing

### 2.3 Data Model Architecture

#### Unified dish_or_category Entity Approach
- Single entity type serves dual purposes:
  - Node entity (when is_menu_item = true)
  - Connection-scope metadata (stored in categories array)
- Same entity ID can represent both menu item and category
- Eliminates redundancy and ambiguity in food terminology

#### All Connections are Restaurant-to-Dish
- **Restaurant attributes:** Stored as entity IDs in restaurant entity's metadata (restaurant_attributes: uuid[])
- **Dish attributes:** Connection-scoped entity IDs stored in dish_attributes array
- **Categories:** Connection-scoped entity IDs stored in categories array  
- Only restaurant-to-dish_or_category connections exist in the connections table

#### Categories in Connection Scope Only
- Categories stored as entity ID references in restaurant→dish connections
- Restaurant-category mentions boost scores of all related dishes
- Enables flexible categorization without entity proliferation

### 2.4 Global Quality Score Computation

#### Dish-Specific Quality Score (85-90%)
Primary component based on connection strength:
- Mention count
- Total upvotes
- Source diversity (unique threads)
- Recent activity bonus

Secondary component (10-15%):
- Restaurant context factor from parent restaurant score
- Serves as effective tiebreaker

#### Restaurant Quality Score (80% + 20%)
Primary component (80%):
- Top 3-5 dish connections by strength
- Captures standout offerings that define restaurant

Secondary component (20%):
- Average quality across all mentioned dishes
- Rewards overall menu consistency

#### Category/Attribute Performance Score
For restaurant ranking in category/attribute queries:
- Find all restaurant's dishes in category or with attribute
- Calculate weighted average of dish-specific quality scores for those relevant dishes
- Boost with direct category mentions from restaurant-category references
- Used instead of global restaurant score for contextual relevance

### 2.5 Template-Based Query System & Standardized Return Format

#### Template-Based Query Processing
The system uses specialized query templates for each fundamental search type, combined with dynamic parameter injection:

**Dish-Specific Template:** Optimized for finding specific dishes across restaurants
**Category-Specific Template:** Optimized for finding dishes within categories
**Venue-Specific Template:** Optimized for finding dishes at specific restaurants
**Attribute-Specific Template:** Optimized for finding entities with specific attributes
**Broad Template:** Optimized for general discovery across all entities

Each template has well-defined extension points for filters, ordering, and other parameters while maintaining performance optimization.

#### Standardized Return Format Rules
**Single List Returns:**
- **Dish-specific queries:** Return only dish list
- **Venue-specific queries:** Return only dish list for that venue

**Dual List Returns:**
- **Category-specific queries:** Return both dish list (dishes in category) and restaurant list (restaurants ranked by performance of their dishes in that category)
- **Attribute-specific queries:** Return both dish list (dishes with attribute) and restaurant list (restaurants ranked by performance of their dishes with that attribute)
- **Broad queries:** Return both dish list (top dishes) and restaurant list (restaurants ranked by overall dish performance)

#### Query Type Processing Alignment
- **Dish-specific queries:** Return only dish list (single list exception)
- **Venue-specific queries:** Return only dish list for that venue (single list exception)
- **Category-specific queries:** Return both dish list (dishes in category) and restaurant list (restaurants ranked by performance of their dishes in that category)
- **Attribute-specific queries:** Return both dish list (dishes with attribute) and restaurant list (restaurants ranked by performance of their dishes with that attribute)
- **Broad queries:** Return both dish list (top dishes) and restaurant list (restaurants ranked by overall dish performance)

### 2.6 Entity Resolution System

#### Multi-Phase Resolution Process
**Phase 1:** LLM entity extraction and normalization
**Phase 2:** Database entity resolution with batching:
1. Exact match against canonical names (single query: WHERE name IN (...))
2. Alias matching (single query with array operations: WHERE aliases && ARRAY[...])
3. Fuzzy matching for remaining entities (individual queries, edit distance ≤3-4)

**Phase 3:** ID mapping and bulk operations
- Build temporary ID to database ID mapping
- Use single transaction with UPSERT operations
- Batch all insertions and updates for performance

#### Resolution Decision Logic
- High confidence match (>0.85): Merge with existing entity
- Medium confidence (0.7-0.85): Apply heuristic rules
- Low confidence (<0.7): Create new entity
- Add original text as alias when merging with existing entities

#### Fuzzy Matching Performance Optimizations
If fuzzy matching becomes a bottleneck, implement these alternatives:

**Efficient Algorithm Alternatives:**
- BK-tree or locality-sensitive hashing for faster string matching
- Use approximate string matching libraries optimized for this use case
- Pre-compute common variations/misspellings for high-frequency entities

**Processing Optimizations:**
- Process fuzzy matching in smaller sub-batches to prevent memory issues
- Set time limits per entity rather than count limits
- Use parallel processing for the fuzzy matching step specifically

**Async Processing Approach:**
- Do exact/alias matching first, create entities for non-matches
- Run fuzzy matching in background and merge duplicates later
- Prioritize system responsiveness over perfect deduplication

### 2.7 Complete Optimized Workflow

#### Core Workflow
LLM Output (already normalized) → Batched Resolution → ID Mapping → Bulk Database Operations

#### Essential Optimizations
**Foundation:**
- Connection pooling - Establish database connection pool at application startup
- Prepared statements - Cache query execution plans for all resolution and insertion queries

**Processing Optimizations:**
- Batched resolution lookups - Three-tier resolution with query batching:
  - Tier 1: Single exact match query (WHERE name IN (...))
  - Tier 2: Single alias match query (WHERE aliases && ARRAY[...])
  - Tier 3: Individual fuzzy match queries for remaining entities (edit distance ≤3-4)
- Single transaction with UPSERT - ON CONFLICT DO UPDATE/NOTHING for all operations
- Simple in-memory ID mapping - {temp_id → db_id} dictionary built from resolution results
- Bulk operations - Multi-row inserts/updates (biggest performance gain)

**Infrastructure:**
- Core indexes - On entity names, aliases, and normalized fields
- Performance metrics collection - Track resolution time by type, batch processing time vs. batch size, database operation timing, memory usage

#### Implementation Focus
- Start with straightforward sequential processing
- Use simple batch size tuning (start with 100-500 entities per batch)
- Add basic instrumentation to measure bottlenecks
- Focus on getting the fundamentals right

#### Modified Data Collection Flow for Reddit Integration
1. LLM processes content → outputs all mentions with URLs
2. Entity resolution 
3. Top mention scoring and comparison:
   - Re-score ALL existing top mentions: upvotes × e^(-days_since / 60)
   - Score new mentions with same formula  
   - Compare and update top 3-5 mentions array
   - Update last_mentioned_at: For each new mention, compare mention timestamp against current last_mentioned_at value and update connection metadata if newer
   - Calculate activity level: "trending" if all top mentions within 30 days, "active" if last_mentioned_at within 7 days
4. Bulk DB operations with updated metrics and activity levels

### 2.8 Reddit Community Growth & Engagement Strategy

#### Enhanced Attribution System (Foundation Feature)
**UI Implementation:**
```
🌮 Franklin BBQ Brisket 🔥
"Worth every minute of the wait, incredible bark"
- u/bbqfan23 on r/austinfood, 2 days ago, 67↑
💬 Join conversation
```

**Technical Details:**
- Quote text is clickable → links to specific comment thread
- "Join conversation" button → same link (clear CTA for users)
- Fall back to post URL if comment URL unavailable
- Source subreddit of top quote/mention → links to subreddit homepage
- Subtle "Powered by Reddit communities" in app footer/settings
- No separate discussion count needed (already showing thread count in metrics suite)

#### Activity Indicators (Integrated into Attribution)
**Simple Visual Cues:**
- 🕐 "Active discussion" for connections with mentions within 7 days
- 🔥 "Trending" if all top 3-5 mentions are within 30 days
- Calculated during/after mention rescoring phase

**Technical Implementation:**
- Activity level determined during mention processing
- Simple conditional rendering in UI
- No additional API calls needed

#### Bookmark Page Share Extension (High Value for Reddit)
**Implementation as Extension to Existing Bookmark Page:**
```
[Existing saved dishes/restaurants list]

[Share/Contribute Your Discovery] (prominent button)
↓ Opens modal with:
- Text area with optional template:
  "Just tried [dish] at [restaurant] - found through community 
   recommendations. [Your experience here]. Thanks r/austinfood!"
- "Post to r/austinfood" button → Reddit create post with pre-filled content
```

**Technical Requirements:**
- Extend existing bookmark page functionality
- Template generation based on saved items
- Deep link to Reddit post creation with subreddit auto-selection
- Optional: draft saving capability

#### Database Schema Updates for Reddit Integration
```
Connections Table (add):
- last_mentioned_at: timestamp
- activity_level: enum('trending', 'active', 'normal') 

Mentions Table (modify):
- Store full Reddit URLs instead of just post/comment IDs
- Add subreddit field OR extract subreddit from source URL during display
```

#### Attribution Link Strategy
- Both quote and button link to the same Reddit thread
- Provides flexibility: users can click quote naturally or use explicit CTA
- Maintains clean UI while maximizing click-through opportunities

#### Measurable Value Creation
**Trackable Metrics:**
- Click-through rate to Reddit (via join conversation clicks)
- Share feature usage and completion rate
- UTM parameters for traffic attribution  
- Geographic expansion requests

**Key Benefits for Reddit:**
- High-quality mobile traffic directed to specific discussions
- Users land at relevant comment threads, not just posts
- Content creation assistance drives new posts to food communities
- Attribution maintains Reddit as authoritative source

### 2.9 Caching Strategy

#### Multi-Level Cache Implementation
**Hot Query Cache (1 hour):** Handle high-frequency and trending searches
**Recent Search Results (24 hours):** Optimize follow-up searches with complete result sets
**Static Data Cache (7 days):** Restaurant basic info, entity metadata, common patterns

#### Cache Invalidation
- Time-based expiration for different data types
- Smart invalidation on entity updates
- Trend-based cache warming for popular queries