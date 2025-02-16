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

##### These queries represent our core value proposition, offering the most reliable recommendations backed by substantial community evidence.

- Dish-specific: "best ramen", "best chicken caesar wrap"
- Venue-specific: "best dishes at Franklin BBQ", "what to order at Uchi"
- Dish-level broad queries: "best dishes in Austin" (requires database maturity)

#### Location & Availability

##### Implemented through Google Maps/Places API integration:

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

##### Implementation Strategy:

- Tags attached to restaurant records only
- Tags identified through background data collection
- Natural language processing for tag requests in queries
- No separate filter UI - integrated into queries

##### Tag Categories:

- Dish Categories: thai, sandwich, noodles, asian, etc.
- Dietary: vegan, vegetarian, halal, keto
- Time-based: happy hour, brunch
- Atmosphere: patio, quiet, good for groups
- Service-type: sports bar, BYOB

_Note: All post-launch features require a mature database with substantial dish-level data._

### 1.3 Search Limitations

##### Unsupported Query Types:

- Dish Modifications: "ramen with no egg"
- Specific Price Points: "under $15"
- Ingredient Exclusions: "dairy free pad thai"
- Portion Specifications: "large portions"
- Custom Combinations: "extra crispy"

### 1.4 Natural Language Processing

#### Query Processing

- Extract search intent and type (dish-specific, venue-specific, broad)
- Entity extraction (restaurants, dishes, experience and category tags)
- Identify location and availability requirements
- Detect and validate tag requests
- Map generic terms to specific tags
  - Create new categories if needed
- Handle query term variations and expansions
- Process nested query requirements

#### Content Processing

- Entity extraction (restaurants, dishes, experience and category tags)
- Sentiment analysis (positive/negative classification)
- Comment thread context maintenance and association
  - Link dishes to restaurants in nested comments, and vice versa
- Relationship mapping between entities
- Term normalization and categorization
- Discard negative sentiment content
- Process implicit entity connections
- Handle term variations/expansions if needed

## 2. Data Architecture

### 2.1 Database Structure

#### Core Tables & Relationships

##### 1. Restaurants

- Basic info (name, location, hours)
- Experience tags
- Digital menu
- Aggregate metrics and stats

##### 2. Dishes

- Name and variations
- Restaurant association
- Category tags
- Dietary tags (maybe)
- Mention metrics and statistics
- Base score

##### 3. Mentions

- Source (post/comment ID)
- Content excerpt
- Thread context/relationships
- Sentiment indicator
- Associated entities (dish/restaurant)
- Upvotes
- Timestamp

_Note: Query-dependent rankings like dish-specific rankings may have to calculated at runtime to be cost effective_

### 2.2 Data Collection

The system uses two distinct collection processes: initial query-driven collection for immediate user needs and background collection for comprehensive data enrichment. Both processes leverage AI for entity extraction and relationship analysis.

#### Initial Data Collection (Query-Driven)

Triggered when query results fall below threshold:

##### 1. Query-Specific Search:

- Search Reddit posts and comments for query terms
- Collect full context:
  - Post content
  - All comment threads
  - Parent-child relationships
  - Discussion context

##### 2. AI-Powered Analysis:

- Send structured data to AI:
  - Combined posts and comments
  - Thread hierarchies
  - Contextual relationships/semantic connections
- AI extracts:
  - Entities (restaurants, dishes, experience and category tags)
  - Sentiment analysis
  - Entity relationships

##### 3. Scope:

- Process only data from query-related searches
- Store all entities and relationships identified by AI
- No additional API calls for discovered entities
- Focus on quick result generation

#### Background Data Collection and Freshness (Database-Driven)

##### 1. Entity Processing Cycle

For each tracked entity (restaurant, dish, experience and category tags):

- Call Reddit search API for posts and comments
- Collect complete discussion contexts
- Send structured data to AI for analysis
- Update existing entity metrics
- Add newly discovered entities
- Assign standardized experience and category tags

##### 2. Relationship Processing

- AI analyzes discussion context to identify:
  - Restaurant-dish associations
  - Experience and category tag assignments
  - Implicit entity connections
  - Sentiment patterns
  - New data
- System updates:
  - Entity metrics
  - Associations
  - Tags

##### 3. Implementation Strategy

- Weekly processing during off-peak hours
- Update basic info via Google Places API
- Store post/comment IDs for historical access (bypasses Reddit API limitations)
- Optimization techniques:
  - Batch similar API calls
  - Prioritize high-activity entities
  - Cache intermediate results

##### 4. Key Behaviors

- Continuous Enrichment:

  - Update existing entity metrics
  - Add newly discovered entities
  - Refresh entity relationships
  - Update experience and category tags

- Progressive Building:
  - New entities become tracked entities
  - Each cycle builds on previous data
  - Metrics become more comprehensive
  - Relationships grow more detailed

### 2.4 Caching Strategy

#### Cache Levels & Implementation

##### 1. Hot Query Cache (1 hour retention)

Purpose: Handle high-frequency and trending searches

Example: "best ramen downtown"

- First query: Process and cache results
- Same query within hour: Instant results
- Benefits: Handles viral/trending searches efficiently

##### 2. Recent Search Results (24 hour retention)

Purpose: Optimize for follow-up searches

Example: User searches "best tacos", comes back later

- Store complete result sets
- Include ranking context
- Update if significant new data

##### 3. Static Data (7 day retention)

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

##### Example Impact:

"best tacos" search might require:

- Initial post search (1 call)
- Comment fetching (multiple calls)
- Historical data access (saved post IDs)
  Total: 5-10 API calls per comprehensive search

#### Solution Strategy

##### 1. Build Historical Access:

- Store all encountered post/comment IDs
- Enable direct content access
- Bypass search limitations

##### 2. Optimize Updates:

- Track last check timestamp
- Only fetch new content
- Batch similar requests

##### 3. Cost Management:

- Aggressive result caching
- Smart update scheduling
- Maintain post ID database

### 3.2 Google Places Integration

##### Primary Functions:

- Basic restaurant information
- Location data/geocoding
- Operating hours
- Order/reservation links

##### Implementation Strategy:

- Limited review access (5 most recent only)
- Focus on core business data
- Consider third-party review data sources
- Optimize API call patterns

## 4. Ranking System

### 4.1 Scoring Architecture

##### Core System:

- Maintains continuously updated base scores
- Supports dynamic filtering
- Enables flexible query-time ranking
- Adapts to query context

#### Base Score Components

##### 1. Dish Scoring

Calculated from Mention frequency, Vote count, Source diversity, and Time relevance (minimal impact)

- Updated with new mentions
- Independent of other dishes
- Reflects community sentiment

##### 2. Restaurant Scoring

Derived from top dish scores

- Updated automatically with dish changes
- Independent of other restaurants

### 4.2 Query-Time Ranking

##### Adapts based on query specificity:

1. Broad Queries

   - Returns: Dishes/Restaurants ranked via base scores
   - Filtered by: Any specified tags
   - Example: "best restaurants" "best food"

2. Category Queries

   - Returns: Dishes with matching tags
   - Ranked by: Base score
   - Example: "best sandwiches"

3. Specific Dish Queries

   - Returns: Matching dishes across restaurants
   - Ranked by: Base score
   - Example: "best pad thai"

4. Venue Queries
   - Returns: Restaurant's dishes
   - Uses: Restaurant menu rankings
   - Example: "what to order at [restaurant]"

### 4.3 Runtime Modifications

Filters applied during query processing:

- Tag requirements
- Location constraints
- Availability checks
- Time sensitivity

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
