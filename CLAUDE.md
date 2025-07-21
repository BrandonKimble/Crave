# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Crave Search is a food discovery app that provides evidence-based dish and restaurant recommendations from Reddit community knowledge. The system transforms scattered social proof into actionable dining insights.

## Architecture

### Monorepo Structure

- **Turborepo** with pnpm workspaces for build orchestration and dependency management
- **apps/api**: NestJS backend implementing modular monolith architecture
- **apps/mobile**: React Native mobile app with Expo
- **packages/shared**: Shared TypeScript types and constants

### API Architecture (Modular Monolith)

The API follows domain-driven design with these core domains:

- **content-processing**: Reddit data ingestion, LLM analysis, entity resolution
- **search-discovery**: Query processing, result ranking, discovery feeds
- **user-experience**: Authentication, bookmarks, search endpoints
- **external-integrations**: Reddit API, LLM API, Google Places
- **infrastructure**: Database, caching, monitoring, security

### Database Design

Uses graph-based entity model with PostgreSQL:

- **entities** table: Unified storage for restaurants, dishes, categories, attributes
- **connections** table: Relationships between entities with quality scores
- **mentions** table: Reddit community evidence with attribution
- All entities differentiated by `entity_type` enum

## Development Commands

### Essential Daily Commands

```bash
# Start all services
pnpm dev

# Start specific apps
pnpm --filter api dev
pnpm --filter mobile dev

# Local services (must start before API)
pnpm --filter api docker:up      # PostgreSQL + Redis
pnpm --filter api prisma:studio  # Database browser

# Database operations
turbo run db:migrate              # Run migrations
turbo run db:generate             # Generate Prisma client
pnpm --filter api db:seed         # Seed test data

# Quality checks
turbo run lint
turbo run type-check
```

### Makefile Commands

```bash
make setup        # Install dependencies and setup
make dev          # Start development
make docker-up    # Start PostgreSQL + Redis
make docker-down  # Stop services
make db-migrate   # Run database migrations
make db-studio    # Open Prisma Studio
```

### Testing

```bash
# API tests
pnpm --filter api test           # Unit tests
pnpm --filter api test:e2e       # End-to-end tests
pnpm --filter api test:cov       # Coverage report

# Mobile tests
pnpm --filter mobile test
```

## Code Organization

### API Module Structure

When creating new API modules, follow the domain-driven structure:

- Place modules in appropriate domain folders under `src/modules/`
- Use NestJS dependency injection for cross-module communication
- Implement repository pattern for database access
- Create shared utilities in `src/shared/`

### Mobile Architecture

- **Navigation**: Stack + Tab navigation with TypeScript types
- **State Management**: Zustand for global state
- **Styling**: Nativewind (Tailwind for React Native)
- **Screens**: Organized by feature (Home, Search, Details, Bookmarks, Profile)

### Shared Package

- Contains TypeScript types and constants used across apps
- Built with tsup for CJS/ESM/DTS output
- Import as `@crave-search/shared`

## Database Schema

### Key Tables

- **entities**: Unified entity storage with type differentiation
- **connections**: Entity relationships with quality scores and metrics
- **mentions**: Reddit community evidence with attribution links
- **users**: Authentication and subscription management

### Entity Types

- `restaurant`: Physical dining establishments
- `dish_or_category`: Food items (can be specific dishes or categories)
- `dish_attribute`: Connection-scoped descriptors (spicy, vegan, etc.)
- `restaurant_attribute`: Restaurant-scoped descriptors (patio, romantic, etc.)

## Development Workflow

### Git Hooks

Pre-commit hooks automatically run via Lefthook:

- ESLint with auto-fix
- Prettier formatting
- Conventional commit message validation (`feat:`, `fix:`, `chore:`)

### Environment Setup

1. Copy `.env.example` to `.env` in both `apps/api` and `apps/mobile`
2. Start Docker services: `make docker-up`
3. Run migrations: `make db-migrate`
4. Start development: `pnpm dev`

### API Documentation

Swagger/OpenAPI documentation available at `http://localhost:3000/api/docs` when API is running.

## Key Technologies

### Backend

- **NestJS** with Fastify adapter
- **Prisma** ORM with PostgreSQL
- **Redis** for caching and Bull queues
- **Winston** for logging
- **Passport** for authentication

### Frontend

- **React Native** with Expo
- **React Navigation** for routing
- **Zustand** for state management
- **React Query** for server state
- **Nativewind** for styling

### Build Tools

- **Turborepo** for monorepo orchestration
- **pnpm** for package management
- **tsup** for TypeScript bundling
- **Lefthook** for git hooks

## Performance Considerations

### API Performance

- Pre-computed quality scores for fast ranking
- Multi-level caching strategy (Redis)
- Bulk database operations for entity processing
- Background job processing with Bull

### Build Performance

- Turborepo caching across packages
- Incremental builds with dependency tracking
- Parallel execution where possible

## Common Patterns

### Database Access

Use Prisma through the PrismaService, accessed via dependency injection:

```typescript
constructor(private readonly prisma: PrismaService) {}
```

### Error Handling

Use NestJS built-in exception filters and custom exception classes in `src/shared/exceptions/`.

### Configuration

Environment-specific config through `@nestjs/config` with validation.

### Testing

- Unit tests co-located with source files
- Integration tests in `test/` directory
- Use NestJS testing utilities for DI container testing
