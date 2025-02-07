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

### 1.1 Natural Language Processing 

#### Core Capabilities
- Extract core search intent (dish-specific venues vs venue-specific dishes)
- Standardize location and availability terms
- Identify context relationships
- Process sentiment indicators

#### Implementation Considerations
- Focus on extracting actionable entities (restaurants, dishes)
- Maintain context through thread relationships
- Handle nested comment scenarios
- Process contextual qualifiers (price, quality indicators)

### 1.2 Launch Features (99¢ Tier)

Our search functionality focuses on core value-driving features at launch, with additional capabilities implemented post-launch once our database has matured.

#### Core Query Types
These queries represent our core value proposition, offering the most reliable recommendations backed by substantial community evidence:

- Dish-specific: "best ramen", "best chicken caesar wrap"
- Venue-specific: "best dishes at Franklin BBQ", "what to order at Uchi"
- Location/Availability Modifiers:
  - Availability: "open now", "late night", "open until midnight"
  - Distance-based: "within 2 miles"
  - Location-based: "near me", "downtown"
  - Neighborhood-specific: "south austin"

### 1.3 Post-Launch Features ($7.99 Tier)

#### Advanced Query Types
- Broad Queries: "best restaurant", "places to eat"
- Tag-Based Queries: 
  - With dish-specific: "best vegan ramen"
  - With venue-specific: "best dishes at vegan restaurants"
  - With broad: "best patio restaurants"

#### Restaurant Tag System
- Implementation:
  - Tags attached to restaurant records only
  - Identified through background data collection
  - No separate filter UI - integrated into queries
  
- Categories:
  - Dietary: vegan, vegetarian, halal, keto
  - Time-based: happy hour, brunch
  - Atmosphere: patio, quiet, good for groups
  - Service-type: sports bar, BYOB

Note: All post-launch features require a mature database with substantial dish-level data.

## 2. Data Storage & Caching Strategy

### 2.1 Database Structure

#### Core Tables
1. Restaurants
   - Basic info (name, location, hours)
   - Tag associations
   - Aggregate metrics (total mentions, recent activity)
   - Pre-computed rankings (menu rank, overall rank)

2. Dishes
   - Name and variations
   - Restaurant association
   - Mention statistics
   - Pre-computed rankings (dish-specific, overall)

3. Mentions
   - Source (post/comment ID)
   - Context (thread relationship)
   - Sentiment indicators
   - Timestamp
   - Associated entities (dish/restaurant)

#### Rankings Implementation
- Store component metrics in respective tables
- Pre-compute rankings that don't depend on queries:
  - Menu rankings (dish performance within restaurant)
  - Dish-specific rankings (dish performance across restaurants)
  - Overall restaurant rankings (based on dish performance)
- Calculate query-dependent rankings at runtime

### 2.2 Caching Strategy

#### Cache Levels & Examples

1. Hot Query Cache (1 hour retention)
   Example: "best ramen downtown"
   - First user: Full processing required
   - Next users within hour: Instant results
   - Benefits: Handles trending searches efficiently

2. Computed Results (24 hour retention)
   Example: Restaurant's top dishes
   - Computed after data updates
   - Served to all users requesting restaurant info
   - Updates when new data processed

3. Static Data (7 day retention)
   Example: Restaurant basic info
   - Location, hours, tags
   - Regular background refresh
   - High reuse across queries

### 2.3 Data Freshness & Background Processing

#### Weekly Dish Data Updates
1. Process Flow:
   - Search posts/comments for dish mentions
   - Update dish statistics
   - Recalculate rankings:
     - Menu rankings
     - Dish-specific rankings
     - Overall rankings
   
2. Cost Optimization:
   - Only fetch content since last update
   - Store post/comment IDs for history
   - Batch processing by restaurant/dish groups

#### Weekly Restaurant Updates
1. Content Processing:
   - Search for restaurant mentions
   - Extract dish associations
   - Update restaurant metrics
   - Refresh rankings

2. Basic Info Updates:
   - Google Places API refresh
   - Hours/location verification
   - Tag validation

#### Background Processing Logic
1. For New Dish Mentions:
   - Update dish statistics
   - Update associated restaurant
   - Recalculate relevant rankings

2. For New Restaurant Mentions:
   - Check for dish context
   - Update restaurant metrics
   - Process associated dishes
   - Update rankings as needed

## 3. API Integration & Data Collection

### 3.1 Reddit API Strategy

#### Initial Data Collection
1. Store all post/comment IDs encountered
2. Build comprehensive ID database
3. Enable direct access to historical content

#### Ongoing Updates
- Only fetch new content since last update
- Update existing records efficiently
- Add new restaurants/dishes as discovered

### 3.2 Google Places Integration

[Previous content remains largely the same...]

## 4. Ranking System

### 4.1 Query-Based Ranking Strategy

#### Dish-Specific Queries
- Returns: Ranked list of dishes with restaurant context
- Ranking factors:
  - Mention frequency
  - Vote counts
  - Source diversity
  - Time relevance
- Applies any relevant tags as filters

#### Venue-Specific Queries
- Returns: Ranked list of dishes for specific restaurant
- Uses pre-computed menu rankings
- Considers:
  - Dish performance within restaurant
  - Overall dish performance
  - Recent mentions

#### Broad Queries (Post-Launch)
- Returns: Ranked list of restaurants
- Uses pre-computed restaurant rankings
- Based on:
  - Overall dish performance
  - Menu consistency
  - Recent activity

### 4.2 Pre-Computed Rankings

#### Menu Rankings
- Ranks dishes within a restaurant
- Updated during background processing
- Used for venue-specific queries
- Based on mention statistics

#### Dish-Specific Rankings
- Ranks specific dishes across restaurants
- Updated during background processing
- Used for dish-specific queries
- Considers all mention contexts

#### Overall Rankings
- Restaurant rankings based on dish performance
- Updated during background processing
- Used for broad queries
- Considers menu consistency

[Rest of sections remain largely the same with minor adjustments for consistency]

## Challenges & Future Considerations

1. Nested Comment Processing
   - Reliable context tracking
   - Sentiment aggregation
   - Ranking impact

2. Generic Term Handling
   - Category system implementation
   - Specific vs generic balance
   - Search relevance optimization

3. Ranking Optimization
   - Pre-computation vs runtime calculation
   - Query-specific adjustments
   - Performance balancing