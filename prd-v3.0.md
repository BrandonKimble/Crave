# Crave - Local Food Discovery App

## Product Requirements Document v3.0

---

## 1. Overview & Core System Architecture

### 1.1 Product Vision

Crave transforms scattered community food knowledge into confident dining decisions by surfacing evidence-based dish and restaurant recommendations. Users discover specific dishes through authentic community consensus with a premium, paywall-first experience.

### 1.2 System Architecture Overview

#### Core System Flow

```
User Query → Cache Check → LLM Analysis → Entity Resolution →
Graph Database Query → Ranking Application → Result Formatting →
Cache Storage → User Response
```

#### Data Collection Flow

```
Reddit API → Content Retrieval → LLM Processing (see LLM_Guidelines.md) →
Entity Resolution → Graph Database Storage → Quality Score Computation →
Metric Aggregation
```

### 1.3 Architectural Principles

- **Graph-based data model**: Entities connected through relationships with metadata
- **Pre-computed rankings**: Global quality scores calculated during data processing
- **Template-based queries**: Optimized SQL for each query type
- **Modular processing**: Independent components for different entity combinations
- **Cache-first performance**: Multi-level caching for sub-second responses

---

## 2. Data Model & Database Architecture

### 2.1 Core Database Schema

#### Entities Table

```sql
CREATE TABLE entities (
  entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- Canonical normalized name
  type entity_type NOT NULL,
  aliases TEXT[] DEFAULT '{}', -- Original texts and known variations
  metadata JSONB DEFAULT '{}', -- Type-specific data
  global_quality_score DECIMAL(10,4) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(name, type),
  INDEX idx_entities_type_score (type, global_quality_score DESC),
  INDEX idx_entities_name_gin (name gin_trgm_ops),
  INDEX idx_entities_aliases_gin (aliases gin_trgm_ops),
  INDEX idx_entities_location ON entities USING gist(((metadata->>'location')::jsonb))
);

CREATE TYPE entity_type AS ENUM (
  'restaurant',
  'dish_or_category',
  'dish_attribute',
  'restaurant_attribute'
);
```

#### Restaurant Metadata Structure

```json
{
  "location": {"lat": 30.2672, "lng": -97.7431},
  "address": "1234 Main St, Austin, TX",
  "hours": {"monday": "11:00-22:00", ...},
  "phone": "+1-512-555-0123",
  "google_place_id": "ChIJ...",
  "restaurant_attributes": ["uuid1", "uuid2"], // References to restaurant_attribute entities
  "last_places_update": "2024-01-15T10:30:00Z"
}
```

#### Connections Table

```sql
CREATE TABLE connections (
  connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES entities(entity_id),
  dish_or_category_id UUID NOT NULL REFERENCES entities(entity_id),
  categories UUID[] DEFAULT '{}', -- dish_or_category entity IDs
  dish_attributes UUID[] DEFAULT '{}', -- dish_attribute entity IDs
  is_menu_item BOOLEAN NOT NULL DEFAULT true,
  metrics JSONB NOT NULL DEFAULT '{}',
  last_mentioned_at TIMESTAMP,
  activity_level activity_level DEFAULT 'normal',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(restaurant_id, dish_or_category_id, dish_attributes),
  INDEX idx_connections_restaurant (restaurant_id),
  INDEX idx_connections_dish (dish_or_category_id),
  INDEX idx_connections_categories_gin (categories),
  INDEX idx_connections_attributes_gin (dish_attributes),
  INDEX idx_connections_menu_item (is_menu_item),
  INDEX idx_connections_activity (activity_level),
  INDEX idx_connections_last_mentioned (last_mentioned_at DESC)
);

CREATE TYPE activity_level AS ENUM ('trending', 'active', 'normal');
```

#### Connection Metrics Structure

```json
{
  "mention_count": 12,
  "total_upvotes": 234,
  "source_diversity": 8,
  "recent_mention_count": 3,
  "top_mentions": [
    {
      "mention_id": "uuid",
      "score": 45.2,
      "upvotes": 67,
      "age_days": 2
    }
  ]
}
```

#### Mentions Table

```sql
CREATE TABLE mentions (
  mention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES connections(connection_id),
  source_type mention_source NOT NULL,
  source_id VARCHAR(255) NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  subreddit VARCHAR(100) NOT NULL,
  content_excerpt TEXT NOT NULL,
  author VARCHAR(255),
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_mentions_connection (connection_id),
  INDEX idx_mentions_source (source_type, source_id),
  INDEX idx_mentions_subreddit (subreddit),
  INDEX idx_mentions_created (created_at DESC)
);

CREATE TYPE mention_source AS ENUM ('post', 'comment');
```

#### User & Subscription Tables

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trial_started_at TIMESTAMP,
  trial_ends_at TIMESTAMP,
  subscription_status subscription_status DEFAULT 'trialing',
  stripe_customer_id VARCHAR(255),
  referral_code VARCHAR(50) UNIQUE,
  referred_by UUID REFERENCES users(user_id),

  INDEX idx_users_email (email),
  INDEX idx_users_subscription_status (subscription_status),
  INDEX idx_users_trial_ends (trial_ends_at)
);

CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'cancelled', 'expired');

CREATE TABLE subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  status subscription_status NOT NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_subscriptions_user (user_id),
  INDEX idx_subscriptions_status (status),
  INDEX idx_subscriptions_period_end (current_period_end)
);

CREATE TABLE user_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_events_user_type (user_id, event_type),
  INDEX idx_user_events_created (created_at DESC)
);
```

### 2.2 Data Model Principles

#### Unified Entity Model

- **dish_or_category entities**: Serve dual purposes as specific menu items AND general categories
- **Connection-scoped metadata**: Categories and dish attributes exist only in restaurant→dish relationships
- **Restaurant attributes**: Stored directly on restaurant entities in metadata
- **All connections are restaurant→dish**: No direct category or attribute connections

#### Entity Type Definitions

- **restaurant**: Physical dining establishments with location and operational data
- **dish_or_category**: Food items that can be both specific dishes and categories
- **dish_attribute**: Connection-scoped descriptors (spicy, vegan, house-made)
- **restaurant_attribute**: Restaurant-scoped descriptors (patio, romantic, family-friendly)

---

## 3. Query Processing System

### 3.1 Query Processing Pipeline

```
1. User Query Input
2. Cache Check (Hot Query Cache - 1 hour)
3. LLM Query Analysis (see LLM_Guidelines.md for processing rules)
4. Entity Resolution
5. Template Selection based on query type
6. Dynamic Parameter Injection
7. Graph Database Query Execution
8. Ranking Application (pre-computed scores)
9. Result Formatting
10. Cache Storage
11. Response Delivery
```

### 3.2 Query Type Classification

The system processes queries through LLM analysis (see LLM_Guidelines.md) to classify into:

1. **Dish-Specific**: "best ramen", "chicken caesar wrap"
2. **Category-Specific**: "best sandwiches", "Italian food"
3. **Venue-Specific**: "best dishes at Franklin BBQ"
4. **Attribute-Specific**: "vegan restaurants", "patio dining"
5. **Broad**: "best food", "best restaurants"

### 3.3 Template-Based Query Architecture

Each query type has an optimized SQL template with extension points:

```sql
-- Example: Dish-Specific Template
WITH filtered_connections AS (
  SELECT c.*, e_dish.name as dish_name, e_rest.name as restaurant_name
  FROM connections c
  JOIN entities e_dish ON c.dish_or_category_id = e_dish.entity_id
  JOIN entities e_rest ON c.restaurant_id = e_rest.entity_id
  WHERE e_dish.entity_id = $1 -- Resolved dish entity ID
    AND ST_Within(
      (e_rest.metadata->>'location')::geometry,
      ST_MakeEnvelope($2, $3, $4, $5) -- Map bounds
    )
    AND ($6 = false OR is_open_now(e_rest.metadata->>'hours'))
)
SELECT * FROM filtered_connections
ORDER BY (SELECT global_quality_score FROM entities WHERE entity_id = dish_or_category_id) DESC
LIMIT $7;
```

### 3.4 Standardized Return Formats

#### Single List Returns

- **Dish-specific queries**: Only dish list with restaurant context
- **Venue-specific queries**: Only dish list for specified restaurant

#### Dual List Returns

- **Category/attribute/broad queries**: Both dish list and restaurant list
- **Restaurant ranking**: Based on aggregated performance of relevant dishes

#### Result Structure

```json
{
  "query_type": "string",
  "dish_results": [
    {
      "dish_name": "string",
      "restaurant_name": "string",
      "quality_score": number,
      "activity_level": "trending|active|normal",
      "evidence": {
        "mention_count": number,
        "total_upvotes": number,
        "recent_activity": boolean,
        "top_quote": {
          "text": "string",
          "subreddit": "string",
          "url": "string",
          "upvotes": number,
          "created_at": "timestamp"
        }
      },
      "restaurant_info": {
        "location": {},
        "hours": {},
        "status": "open|closed"
      }
    }
  ],
  "restaurant_results": [ // Only for dual-list queries
    {
      "restaurant_name": "string",
      "category_performance_score": number, // Aggregated score for relevant dishes
      "relevant_dishes": ["string"], // Top dishes in queried category/attribute
      "restaurant_info": {"location": {}, "hours": {}, "status": "open|closed"}
    }
  ]
}
```

---

## 4. Data Collection & Processing

### 4.1 Data Collection Strategy

#### Scheduled Background Collection

1. **Weekly New Entity Enrichment**

   - Process entities created but not yet enriched
   - Fetch Reddit content for new restaurants and dishes
   - Apply LLM processing (see LLM_Guidelines.md)
   - Update connections and quality scores

2. **Quarterly Full Refresh**
   - Comprehensive update of all entities
   - Prioritize entities with oldest data
   - Capture new mentions and trends
   - Refresh global quality scores

#### On-Demand Query-Driven Collection

- **Trigger**: Query results below quality threshold
- **Scope**: Narrow focus on query-relevant entities
- **Processing**: Rapid LLM analysis and immediate result enhancement

### 4.2 Reddit Data Collection Flow

```
1. Entity Selection (based on collection cycle)
2. Reddit API Search (with rate limiting)
3. Post/Comment Retrieval (store IDs for historical access)
4. LLM Content Processing (see LLM_Guidelines.md)
5. Entity Resolution
6. Mention Scoring: upvotes × e^(-days_since / 60)
7. Activity Level Calculation
8. Bulk Database Operations
```

### 4.3 Entity Resolution Process

#### Three-Tier Resolution

1. **Exact Match**: Single query `WHERE name IN (...)`
2. **Alias Match**: Single query `WHERE aliases && ARRAY[...]`
3. **Fuzzy Match**: Individual queries with Levenshtein distance ≤ 3

#### Resolution Decision Logic

- **High confidence (>0.85)**: Merge with existing entity
- **Medium confidence (0.7-0.85)**: Apply heuristic rules
- **Low confidence (<0.7)**: Create new entity

#### Performance Optimizations

- Batch deduplication before resolution
- In-memory ID mapping for bulk operations
- Single transaction with UPSERT statements
- Prepared statement caching

### 4.4 Component-Based Processing

The system processes LLM output through modular components (implementation details in backend services):

1. **Restaurant Processing**: Always create/update restaurant entities
2. **Restaurant Attributes**: Update restaurant metadata
3. **General Praise**: Boost existing dish connections
4. **Specific Dishes**: Create/update restaurant→dish connections
5. **Category References**: Boost existing dishes in category
6. **Attribute Filtering**: Find and boost dishes with attributes

---

## 5. Ranking & Scoring System

### 5.1 Global Quality Score Computation

#### Dish Quality Score Formula

```
Primary Component (85-90%):
- mention_count × recency_weight
- total_upvotes × time_decay
- source_diversity × diversity_multiplier
- recent_activity_bonus

Secondary Component (10-15%):
- restaurant_context_score × 0.15
```

#### Restaurant Quality Score Formula

```
Primary Component (80%):
- top_3_5_dish_scores (aggregated)
- direct_category_connections

Secondary Component (20%):
- average_dish_quality
- menu_breadth_factor
```

### 5.2 Activity Indicators

- **Trending (🔥)**: All top 3-5 mentions within 30 days
- **Active (🕐)**: Recent mentions within 7 days
- **Normal**: Standard display without indicators

### 5.3 Category/Attribute Performance Scoring

For contextual restaurant ranking:

1. Find all restaurant's relevant dishes
2. Calculate weighted average of dish scores
3. Apply category mention boost
4. Replace global score with contextual score

---

## 6. Caching Strategy

### 6.1 Multi-Level Cache Architecture

#### Level 1: Hot Query Cache (1 hour TTL)

- Exact query matches
- Complete result sets
- Handles trending searches

#### Level 2: Recent Search Results (24 hour TTL)

- User-specific recent searches
- Partial match capabilities
- Follow-up query optimization

#### Level 3: Static Data Cache (7 day TTL)

- Restaurant metadata
- Entity information
- Common query patterns

### 6.2 Cache Implementation

```javascript
// Redis key structure
const cacheKey = {
  hotQuery: `query:${hash(queryParams)}:${timestamp}`,
  userRecent: `user:${userId}:recent:${queryType}`,
  staticData: `static:${entityType}:${entityId}`
};

// Cache invalidation triggers
- New mentions for entity
- Quality score updates
- Restaurant info changes
- Time-based expiration
```

---

## 7. User Experience & Features

### 7.1 Subscription Model

#### $7.99/month (Single Tier)

All features included with 3-day free trial:

- **Core Search**

  - Natural language query processing
  - Evidence-based recommendations
  - Activity indicators (🔥🕐)
  - Map-based location filtering
  - "Open Now" toggle

- **Discovery Feed**

  - Trending Deep Dives
  - Neighborhood Insights
  - Time-Based Trends
  - Category Reports
  - Rising Stars

- **Personalization**

  - Smart Alerts
  - Custom notifications
  - Search history
  - Personal food maps
  - Bookmarking system

- **Community Features**
  - Reddit attribution with links
  - Share discoveries
  - Curated lists
  - Social proof display

### 7.2 User Onboarding Flow

```
1. App Download → Value Proposition Screen
   "Never Have a Mediocre Meal Again"

2. Trial Signup
   - Email required
   - Payment method required
   - 3-day free trial messaging

3. Immediate Access
   - Full feature availability
   - Guided first search
   - Bookmark prompt

4. Trial Management
   - In-app trial countdown
   - Value reinforcement emails
   - Conversion optimization
```

### 7.3 Reddit Attribution System

```
🌮 Franklin BBQ Brisket 🔥
"Worth every minute of the wait, incredible bark"
- u/bbqfan23 on r/austinfood, 2 days ago, 67↑
💬 Join conversation
```

**Implementation**:

- Quote links to Reddit comment
- "Join conversation" explicit CTA
- Subreddit links maintained
- Full URL attribution stored

---

## 8. External Integrations

### 8.1 Reddit API Integration

#### Cost Management

- **Pricing**: $0.24/1000 API calls
- **Rate Limit**: 100 requests/minute
- **Optimization**: Batch processing, historical ID storage, smart caching

#### Implementation Strategy

```javascript
// Batch processing for efficiency
const batchSize = 50;
const rateLimitDelay = 600; // ms between batches

// Store post IDs for direct access
const postIdCache = new Map();

// Cost tracking
const apiCallTracker = {
  daily: 0,
  monthly: 0,
  costEstimate: () => (monthly * 0.24) / 1000,
};
```

### 8.2 Google Places API Integration

#### Primary Functions

- Restaurant metadata (location, hours, contact)
- Geocoding for map functionality
- Operating hours for "Open Now" feature
- Order/reservation deep links

#### Optimization Strategy

- Batch location updates daily
- Cache operating hours (24 hour TTL)
- Selective detail fetching
- Fallback for API failures

### 8.3 Payment Integration (Stripe)

#### Subscription Management

```javascript
// Webhook events to handle
const stripeWebhooks = {
  'customer.subscription.created': handleTrialStart,
  'customer.subscription.updated': handleSubscriptionChange,
  'customer.subscription.deleted': handleCancellation,
  'invoice.payment_failed': handlePaymentFailure,
};

// Grace period for failed payments
const PAYMENT_GRACE_PERIOD_DAYS = 3;
```

### 8.4 LLM Integration

Content processing follows rules defined in `LLM_Guidelines.md`:

- Entity extraction and normalization
- Query understanding and classification
- Sentiment analysis
- Relationship identification

---

## 9. Technology Stack

### 9.1 Frontend Architecture

#### Core Framework

- **React Native** with TypeScript
- **Expo** for accelerated development
- **NativeWind** for utility-first styling

#### Essential Libraries

```json
{
  "state": ["zustand", "react-query"],
  "navigation": "react-navigation",
  "maps": "react-native-maps",
  "forms": "react-hook-form",
  "animations": "react-native-reanimated",
  "storage": "react-native-mmkv",
  "payments": "stripe-react-native"
}
```

### 9.2 Backend Architecture

#### Core Framework

- **NestJS** with TypeScript
- **Fastify** adapter for performance
- **Modular monolith** architecture

#### Module Structure

```
src/
├── modules/
│   ├── content-processing/
│   ├── search-discovery/
│   ├── user-management/
│   ├── external-integrations/
│   └── infrastructure/
```

#### Essential Services

```json
{
  "queues": "@nestjs/bull",
  "cache": "@nestjs/cache-manager",
  "auth": "passport",
  "payments": "stripe",
  "validation": "class-validator",
  "logging": "winston",
  "monitoring": "sentry"
}
```

### 9.3 Data Layer

- **PostgreSQL 15** with advanced features
- **Prisma** for type-safe database access
- **Redis** for caching and queues
- **Bull** for job processing

### 9.4 Infrastructure

#### AWS Services

- **RDS** for PostgreSQL
- **ElastiCache** for Redis
- **S3** for static assets
- **CloudFront** for CDN

#### Deployment

- **Railway.app** for initial deployment
- **Docker** containerization
- **GitHub Actions** CI/CD
- **Expo EAS** for mobile builds

#### Monitoring

- **Sentry** for error tracking
- **Prometheus + Grafana** for metrics
- **PostHog** for analytics

---

## 10. Performance Requirements

### 10.1 Response Time Targets

- Search queries: <500ms (cached), <2s (uncached)
- Discovery feed: <1s
- Authentication: <200ms
- Payment processing: <3s

### 10.2 Scalability Targets

- Support 10,000 concurrent users
- Handle 100 searches/second
- Process 10,000 Reddit mentions/hour
- Maintain 99.9% uptime

### 10.3 Data Processing Requirements

- Entity resolution: <2s for 100 entity batch
- Quality score computation: <5 minutes for full refresh
- Cache hit rate: >90% for popular queries
- Database connection pool: 100 connections

---

## 11. Security & Compliance

### 11.1 Data Security

- All API endpoints require authentication
- Stripe PCI compliance for payments
- Rate limiting on all public endpoints
- Input validation and sanitization

### 11.2 Privacy Requirements

- User data encryption at rest
- Secure password storage (bcrypt)
- GDPR-compliant data handling
- Clear data retention policies

---

## 12. Implementation Phases

### Phase 1: Core MVP with Paywall (Months 1-2)

- Payment integration and trial flow
- Basic search with LLM processing
- Reddit data collection pipeline
- Essential ranking system
- Bookmarking and sharing system

### Phase 2: Enhanced Discovery (Months 3-4)

- Discovery feed features
- Smart alerts system
- Advanced ranking algorithms
- Performance optimizations
- Reddit attribution system
- Core caching implementation

### Phase 3: Growth Features (Months 5-6)

- Share functionality
- Referral system
- Advanced personalization
- Additional data sources
- A/B testing framework

### Phase 4: Scale & Expand (Months 7+)

- Multi-city support
- Restaurant partnerships (optional)
- Advanced analytics
- API platform
- White-label opportunities

---

## 13. Success Metrics

### 13.1 Technical Metrics

- API response times
- Cache hit rates
- System uptime
- Error rates
- Processing throughput

### 13.2 Product Metrics

- Trial-to-paid conversion: >40%
- Monthly churn: <10%
- Weekly active users: >70%
- Searches per user: 8-12/month
- NPS score: >50

### 13.3 Business Metrics

- MRR growth: 20-30%/month
- CAC payback: <3 months
- LTV:CAC ratio: >3:1
- Gross margin: >80%

---

## Appendices

### A. API Documentation

See separate API specification document

### B. LLM Processing Guidelines

See `LLM_Guidelines.md` for detailed content processing rules

### C. Database Migrations

See migration files in `/prisma/migrations`

### D. Error Codes

See error handling specification document
