# Crave Search - Architecture Overview

## System Architecture

Crave Search is a **Turborepo monorepo** implementing a food discovery platform that transforms Reddit community discussions into actionable dining insights.

### Core Architecture Flow

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

## Monorepo Structure

### Applications

- **`apps/api/`**: NestJS backend API (modular monolith architecture)
- **`apps/mobile/`**: React Native mobile app with Expo
- **`packages/shared/`**: Shared TypeScript types and constants

### Technology Stack

#### Backend (NestJS API)

- **Framework**: NestJS with Fastify adapter
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis for multi-level caching and Bull queues
- **Authentication**: Passport with JWT
- **Logging**: Winston structured logging

#### Frontend (React Native)

- **Framework**: React Native with Expo
- **Navigation**: React Navigation (Stack + Tab)
- **State Management**: Zustand for global state
- **Server State**: React Query for caching
- **Styling**: Nativewind (Tailwind for React Native)

#### Build System

- **Monorepo**: Turborepo for build orchestration
- **Package Manager**: pnpm with workspaces
- **Git Hooks**: Lefthook for pre-commit validation

## Database Design (Graph-Based)

### Core Tables

- **`entities`**: Unified storage for restaurants, dishes, categories, attributes
- **`connections`**: Relationships between entities with quality scores
- **`mentions`**: Reddit community evidence with attribution
- **`users`**: Authentication and subscription management

### Entity Types

- `restaurant`: Physical dining establishments
- `dish_or_category`: Food items (specific dishes or categories)
- `dish_attribute`: Connection-scoped descriptors (spicy, vegan, etc.)
- `restaurant_attribute`: Restaurant-scoped descriptors (patio, romantic, etc.)

## API Architecture (Modular Monolith)

### Domain Organization

- **content-processing**: Reddit data ingestion, LLM analysis, entity resolution
- **search-discovery**: Query processing, result ranking, discovery feeds
- **user-experience**: Authentication, bookmarks, search endpoints
- **external-integrations**: Reddit API, LLM API, Google Places
- **infrastructure**: Database, caching, monitoring, security

### Performance Strategy

- **Pre-computed quality scores**: Rankings calculated during data processing
- **Multi-level caching**: Hot queries (1hr), recent results (24hr), static data (7d+)
- **Single-phase processing**: Streamlined architecture eliminating intermediate JSON structures
- **Batch operations**: Bulk entity resolution, database updates, and mention processing

## Development Workflow

### Environment Setup

1. Start Docker services: `make docker-up` (PostgreSQL + Redis)
2. Run migrations: `make db-migrate`
3. Start development: `pnpm dev`

### Essential Commands

```bash
# Development
pnpm dev                    # Start all services
pnpm --filter api dev       # Start API only
pnpm --filter mobile dev    # Start mobile app

# Database
pnpm --filter api prisma:studio    # Database browser
turbo run db:migrate                # Run migrations
pnpm --filter api db:seed           # Seed test data

# Quality
turbo run lint
turbo run type-check
```

## Current Architecture Status

**Status**:
**Current Milestone**:
**Next Phase**:

See [PRD](../../PRD.md) for complete technical specifications and implementation roadmap.
