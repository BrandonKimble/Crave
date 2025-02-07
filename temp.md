# Local Food Discovery App - Product Requirements Document

## Overview

This app enables users to make confident dining decisions by surfacing evidence-based dish and restaurant recommendations from community knowledge. It transforms scattered social proof into actionable insights about specific dishes and dining experiences.

## Core System Flow

1. User Query → NLP → Search Terms
2. Cache/DB Check → Skip or Continue to API
3. Optimized API Data Collection
4. Data Analysis & Processing
5. Ranking & Evidence Compilation
6. Result Presentation

## 1. Query Processing & Understanding

### 1.1 Launch Features (99¢ Tier)

Our search functionality focuses on core value-driving features at launch, with additional capabilities implemented post-launch once our database has matured.

#### Core Query Types

These queries represent our core value proposition, offering the most reliable recommendations backed by substantial community evidence.

- Dish-specific: "best ramen", "best chicken caesar wrap"
- Venue-specific: "best dishes at Franklin BBQ", "what to order at Uchi"
- Dish-level broad queries: "best dishes in Austin" (requires database maturity)

#### Location & Availability

Implemented through Google Maps/Places API integration:

- Availability: "open now", "late night", "open until midnight"
- Distance-based: "within 2 miles"
- Location-based: "near me", "downtown"
- Neighborhood-specific: "south austin"

### 1.2 Post-Launch Features ($7.99 Tier)

#### Advanced Query Types

- Restaurant-level broad queries: "best restaurant open now", "best patio spots"
- Tag-Based Queries
  - With dish-specific: "best vegan ramen", "happy hour sushi"
  - With venue-specific: "best dishes at vegan restaurants"
  - With broad: "best patio restaurants"

#### Restaurant Tag System

Implementation Strategy:

- Tags attached to restaurant records only
- Tags identified through background data collection
- Natural language processing for tag requests in queries
- No separate filter UI - integrated into queries

Tag Categories:

- Dietary: vegan, vegetarian, halal, keto
- Time-based: happy hour, brunch
- Atmosphere: patio, quiet, good for groups
- Service-type: sports bar, BYOB

*Note: All post-launch features require a mature database with substantial dish-level data.*

### 1.3 Search Limitations

Unsupported Query Types:

- Dish Modifications: "ramen with no egg"
- Specific Price Points: "under $15"
- Ingredient Exclusions: "dairy free pad thai"
- Portion Specifications: "large portions"
- Custom Combinations: "extra crispy"

### 1.4 Natural Language Processing


#### Query Processing

- Extract search intent and type (dish-specific, venue-specific, broad)
- Identify location and availability requirements
- Detect and validate tag requests
- Map generic terms to specific categories
   - Create new categories if needed
- Handle query term variations and expansions
- Process nested query requirements

#### Content Processing

- Entity extraction (restaurants, dishes, categories)
- Sentiment analysis (positive/negative classification)
- Comment thread context maintenance and association
   -  Link dishes to restaurants in nested comments, and vice versa
- Relationship mapping between entities
- Term normalization and categorization
- Discard negative sentiment content
- Process implicit dish recommendations
- Handle term variations/expansions if needed

Key Processing Tasks:
- Entity Recognition: Identify restaurants and dishes
- Context Association: Link dishes to restaurants in nested comments, and vice versa
- Sentiment Analysis: Binary positive/negative classification
- Term Expansion: Handle dish name variations

Implementation Challenge: Thread Context
- Issue: Complex comment threads with multiple context levels
- Example: Parent post asks about salads, comment mentions restaurant, sub-comment specifies dish
- Solution Strategy:
  - Track parent-child relationships
  - Maintain context through comment chain
  - Associate entities across thread levels
  - Extract implicit recommendations

## 2. Data Architecture

### 2.1 Database Structure

#### Core Tables & Relationships
1. Restaurants
   - Basic info (name, location, hours)
   - Tag associations
   - Aggregate metrics
   - Pre-computed rankings:
     - Menu rankings (dish performance within restaurant)
     - Overall restaurant ranking (based on menu performance, post-launch)

2. Dishes
   - Name and variations
   - Restaurant association
   - Mention statistics
   - Pre-computed rankings:
     - Overall dish rankings (performance across all dishes, post-launch)
     - Category or dish-specific rankings (performance across restaurants)
     - Specific dish rankings

3. Mentions
   - Source (post/comment ID)
   - Thread context/relationships
   - Sentiment indicators
   - Associated entities (dish/restaurant)
   - Timestamp

*Note: Query-dependent rankings like dish-specific rankings may have to calculated at runtime to be cost effective*

### 2.2 Data Collection

#### Initial Data Collection (Query-Driven)
Triggered when query results fall below threshold:

1. Query-Specific Search:
   - Search Reddit posts for exact query terms
   - Process all comments in relevant posts
   - Search Reddit comments independently
   - Focus on collecting data specific to query intent

2. Entity Processing:
   - New restaurant → Create record, search mentions, begin tracking
   - New dish → Search mentions, associate with restaurant, track stats
   - New generic dish → Create category, collect related mentions
   - Restaurant only → Search for dish associations

3. Scope:
   - Limited to query-relevant entities
   - Ignores unrelated mentions
   - Focuses on building immediate result set
   - Stores IDs for future processing

### 2.3 Data Freshness

#### Background Processing (Database-Driven)

- Continuously enrich existing restaurant/dish data
- Track new dishes mentioned for known restaurants
- Build relationship networks between entities
- Maintain post/comment ID database for historical access

Systematic updates of tracked entities:

1. Weekly Restaurant Updates:
   - Query Reddit for new mentions
   - Process associated dish mentions
   - Update metrics and recalculate all rankings
   - Update basic info via Google Places

2. Weekly Dish Updates:
   - Search for new mentions
   - Update dish metrics and recalculate all rankings
   - Process new associations

3. Relationship Building:
   - Enhance entity connections
   - Build category networks
   - Update tag associations
   - Strengthen data relationships

4. Optimization Strategy:
   - Store post/comment IDs for historical access (bypasses Reddit search limitations)
   - Batch similar operations
   - Process during off-peak hours
   - Prioritize high-activity entities

### 2.4 Caching Strategy

#### Cache Levels & Implementation

1. Hot Query Cache (1 hour retention)

   Purpose: Handle high-frequency and trending searches

   Example: "best ramen downtown"
   - First query: Process and cache results
   - Same query within hour: Return cached results
   - Benefits: Handles viral/trending searches efficiently

2. Recent Search Results (24 hour retention)
   
   Purpose: Optimize for follow-up searches
   
   Example: User searches "best tacos", comes back later
   - Store complete result sets
   - Include ranking context
   - Update if significant new data

3. Static Data (7 day retention)
   
   Purpose: Reduce database load for common data
   
   Example: Restaurant basic info, historical trends
   - Location/hours data
   - Historical rankings
   - Tag associations

## 3. External Integration

### 3.1 Reddit API Strategy

#### Implementation Challenges
- 1000 post search limit
- Limited historical data access
- Cost: $0.24/1000 calls
- Rate limit: 100 requests/minute

Example Impact:
"best tacos" search might require:
- Initial post search (1 call)
- Comment fetching (multiple calls)
- Historical data access (saved post IDs)
Total: 5-10 API calls per comprehensive search

#### Solution Strategy
1. Build Historical Access:
   - Store all encountered post/comment IDs
   - Enable direct content access
   - Bypass search limitations

2. Optimize Updates:
   - Track last check timestamp
   - Only fetch new content
   - Batch similar requests

3. Cost Management:
   - Aggressive result caching
   - Smart update scheduling
   - Maintain post ID database

### 3.2 Google Places Integration

Primary Functions:
- Basic restaurant information
- Location data/geocoding
- Operating hours
- Order/reservation links

Implementation Strategy:
- Limited review access (5 most recent only)
- Focus on core business data
- Consider third-party review data sources
- Optimize API call patterns

## 4. Ranking System

### 4.1 Unified Ranking Architecture

Core System:
- Maintains continuously updated rankings
- Stores pre-computed scores
- Supports runtime filtering
- Adapts to query specificity

#### Base Rankings (Pre-computed) and Factors


1. Restaurant Rankings
   - Overall digital menu performance

2. Menu Rankings
   - Dish performance within restaurant
   - Time relevance (minimal impact)

3. Dish/Category Rankings
   - Mention frequency
   - Vote counts
   - Source diversity
   - Time relevance (minimal impact)

Pre-computed rankings stored in Database:
- Restaurant overall ranking (post-maturity)
- Dish overall ranking (post-maturity)
- Category rankings (broad dish types)
- Menu rankings (within restaurant)
- Dish-specific rankings (across restaurants)

### 4.2 Query-Driven Ranking Behavior

Adapts based on query specificity:

1. Broad Queries
   - Returns: Overall restaurant rankings (list of restaurants/dishes)
   - Example: "best restaurants" "best food"
   - Uses: Base restaurant/dish performance

2. Category Queries
   - Returns: Category-specific rankings (list of dishes)
   - Example: "best tacos"
   - Uses: Category rankings + restaurant context

3. Specific Dish Queries
   - Returns: Specific dish rankings (list of dishes)
   - Example: "best pad thai"
   - Uses: Dish-specific rankings

4. Venue Queries
   - Returns: Menu rankings (list of dishes)
   - Example: "what to order at Franklin BBQ"
   - Uses: Restaurant menu rankings

### 4.3 Runtime Rankings

Filters applied to pre-computed rankings (Caluculated per query):
- Location constraints
- Availability checks/time-sensitive modifications
- Tag requirements

## 5. Implementation Challenges

### 5.1 Generic Term/Dish Category Handling
Challenge: Balancing specific vs broad dishes
Example: "best salad" vs "best caesar salad"
Proposed Solution:
- Implement dish category system
- Maintain hierarchy of specificity
- Store category relationships
- Compute specific rankings at query time
Open Questions:
- How to classify a Reuben as a sandwich
- Reliable categorization method
- Possibility of a tagging system
- Performance implications
- Hierarchy maintenance

### 5.2 Thread Context Processing
Challenge: Maintaining context in nested comments
Example: Parent asks about tacos, sub-comment recommends specific dish
Strategy:
- Track thread relationships
- Store context indicators
- Link related mentions
- Process full conversation chains

### 5.3 Ranking Optimization
Challenge: Balance pre-computation vs runtime
Considerations:
- Storage vs computation trade-offs
- Query performance requirements
- Data freshness needs
- Approach:
   - Pre-compute stable rankings
   - Runtime calculation for dynamic factors
   - Caching for common patterns