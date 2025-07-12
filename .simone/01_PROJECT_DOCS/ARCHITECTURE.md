# Crave - Architecture Documentation

## Overview

Crave is a mobile-first food discovery app that transforms scattered Reddit community knowledge into evidence-based dish and restaurant recommendations. The system uses a sophisticated data processing pipeline to analyze Reddit discussions and provide actionable dining insights.

## System Architecture

### Core System Flow

```
User Query → Cache Check → LLM Analysis → Entity Resolution →
Graph Database Query → Ranking Application → Result Formatting →
Cache Storage → User Response
```

### Data Collection Flow

```
Reddit API → Content Retrieval → LLM Processing →
Single Consolidated Processing Phase (Entity Resolution + Mention Scoring + Components) →
Single Database Transaction → Quality Score Computation
```

## Technology Stack

### Frontend Architecture (React Native Mobile App)

**Core Framework:**
- **React Native** with TypeScript for cross-platform mobile development
- **Nativewind** (Tailwind for React Native) for styling
- **Expo** for development tooling and deployment

**State Management:**
- **React Query** for server state and caching
- **Zustand** for client state management
- **React Native MMKV** for local storage

**Navigation & UI:**
- **React Navigation** for routing
- **React Native Maps** for location-based features
- **React Native Reanimated** for animations
- **React Hook Form** for form handling

### Backend Architecture (NestJS Modular Monolith)

**Core Framework:**
- **NestJS** with TypeScript and Fastify adapter
- **Modular Monolith** pattern organized by domain

**Domain Structure:**
1. **Content Processing**: Reddit data ingestion, LLM analysis, entity resolution
2. **Search Discovery**: Query processing, result ranking, discovery feeds
3. **User Experience**: Authentication, bookmarks, search endpoints
4. **External Integrations**: Reddit API, LLM API, Google Places
5. **Infrastructure**: Database, caching, monitoring, security

**Core Services:**
- **Prisma ORM** with PostgreSQL for data persistence
- **Redis** with Bull queues for background job processing
- **Passport.js** for authentication
- **Winston** for structured logging
- **Swagger/OpenAPI** for API documentation

### Database Architecture (Graph-Based Entity Model)

**Core Design Philosophy:**
- **Unified Entity Storage**: All entities (restaurants, dishes, categories, attributes) stored in single `entities` table
- **Graph Relationships**: `connections` table manages relationships between entities with quality scores
- **Community Evidence**: `mentions` table stores Reddit community evidence with attribution

**Key Tables:**

**entities**
```sql
- id: UUID (primary key)
- entity_type: ENUM (restaurant, dish_or_category, dish_attribute, restaurant_attribute)
- name: VARCHAR (canonical name)
- search_terms: TEXT[] (alternative names, synonyms)
- metadata: JSONB (type-specific data)
- quality_score: FLOAT (computed ranking score)
- created_at, updated_at: TIMESTAMP
```

**connections**
```sql
- id: UUID (primary key)
- from_entity_id: UUID (foreign key to entities)
- to_entity_id: UUID (foreign key to entities)
- connection_type: ENUM (serves, has_attribute, category_of, etc.)
- quality_score: FLOAT (relationship strength)
- metadata: JSONB (connection-specific data)
- created_at, updated_at: TIMESTAMP
```

**mentions**
```sql
- id: UUID (primary key)
- reddit_post_id: VARCHAR (Reddit reference)
- content: TEXT (relevant excerpt)
- upvotes: INTEGER (community validation)
- attribution_url: VARCHAR (Reddit permalink)
- entities: UUID[] (referenced entity IDs)
- sentiment_score: FLOAT (positive/negative sentiment)
- created_at: TIMESTAMP (Reddit post date)
```

**users**
```sql
- id: UUID (primary key)
- email: VARCHAR (authentication)
- subscription_tier: ENUM (free, premium)
- preferences: JSONB (user settings)
- created_at, updated_at: TIMESTAMP
```

### Infrastructure & Deployment

**Development Environment:**
- **Docker** for local PostgreSQL and Redis
- **Turborepo** for monorepo build orchestration
- **pnpm** for package management
- **Lefthook** for git hooks (ESLint, Prettier, conventional commits)

**Production Deployment:**
- **Railway.app** for initial deployment (API + PostgreSQL + Redis)
- **AWS RDS** for production PostgreSQL (eventual migration)
- **AWS ElastiCache** for Redis clusters
- **AWS S3** for file storage
- **AWS SNS** for notifications

**CI/CD Pipeline:**
- **GitHub Actions** for automated testing and deployment
- **EAS (Expo Application Services)** for mobile app builds
- **Docker** for containerization

## External API Integrations

### Reddit API
- **Purpose**: Community content retrieval and analysis
- **Rate Limits**: 100 requests/minute, $0.24/1000 calls
- **Risk Factor**: Primary dependency on comment access availability
- **Fallback**: Pushshift archived data (static, no real-time updates)

### Google Places API
- **Purpose**: Restaurant location data, business hours, ratings
- **Integration**: Real-time "open now" filtering, location-based search
- **Usage**: Restaurant verification and metadata enrichment

### LLM API (Gemini/Deepseek)
- **Purpose**: Reddit content analysis and entity extraction
- **Tasks**: Natural language processing, sentiment analysis, entity resolution
- **Architecture**: Single consolidated processing phase for efficiency

## Performance Architecture

### Caching Strategy
- **Level 1**: Hot queries (1 hour retention)
- **Level 2**: Recent results (24 hour retention)  
- **Level 3**: Static data (7+ day retention)
- **Target**: >85% cache hit rate

### Background Processing
- **Scheduled Jobs**: Weekly new entity collection, quarterly full refresh
- **Real-time Processing**: Query-driven content collection
- **Bull Queues**: Async job processing with Redis backing

### Pre-computed Quality Scores
- **Design**: All ranking calculations performed during data processing
- **Benefit**: Fast query response times (<400ms cached, <3s uncached)
- **Components**: Community validation, recency, sentiment, cross-references

## Security & Data Privacy

### Authentication
- **Strategy**: JWT-based authentication with Passport.js
- **Storage**: Secure token handling with rotation
- **Authorization**: Role-based access control

### Data Privacy
- **Reddit Attribution**: Proper attribution with community guidelines compliance
- **User Data**: Minimal collection, secure storage, GDPR considerations
- **API Security**: Rate limiting, input validation, CORS configuration

## Scalability Considerations

### MVP Targets (Weeks 1-28)
- **Concurrent Users**: 1,000-2,000
- **Search Response**: <400ms cached, <3s uncached
- **Search Throughput**: 50 searches/second
- **System Uptime**: 99.9%

### Post-MVP Scaling (Week 29+)
- **Concurrent Users**: 10,000+ (5x scale-up)
- **Search Response**: <400ms cached, <2s uncached
- **Search Throughput**: 100+ searches/second
- **Cache Hit Rate**: >90%

### Scaling Strategies
- **Database**: Connection pooling, read replicas, query optimization
- **Caching**: Redis clustering, intelligent cache warming
- **API**: Horizontal scaling with load balancing
- **Background Jobs**: Worker scaling based on queue depth

## Development Patterns

### Code Organization
- **Monorepo Structure**: Turborepo with pnpm workspaces
- **Domain-Driven Design**: Clear separation of concerns
- **Dependency Injection**: NestJS container for loose coupling
- **Repository Pattern**: Database access abstraction

### Quality Assurance
- **Testing**: Unit tests with Jest, E2E tests with Supertest
- **Code Quality**: ESLint, Prettier, TypeScript strict mode
- **Git Workflow**: Conventional commits, automated hooks
- **Documentation**: Swagger API docs, inline code documentation

## Risk Mitigation

### Reddit API Dependency
- **Primary Risk**: API access changes or pricing increases
- **Mitigation**: Pushshift fallback data, cost monitoring, usage optimization
- **Monitoring**: API call tracking, rate limit monitoring

### Performance Bottlenecks
- **Database**: Query optimization, connection pooling, indexing strategy
- **LLM Processing**: Batch operations, response caching, rate limiting
- **Mobile Performance**: Bundle optimization, image compression, lazy loading

### Infrastructure Resilience
- **Monitoring**: Application performance monitoring, error tracking
- **Backup Strategy**: Automated database backups, disaster recovery procedures
- **Health Checks**: Service monitoring, automated alerting