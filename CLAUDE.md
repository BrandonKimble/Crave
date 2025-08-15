# CLAUDE.md - Project Memory & Context

## Process Memory Bank

### Common Mistakes to Avoid
- **Code Review Loop**: Always re-run code review after fixes (don't skip to completion)
- **Project Manifest**: Update `.simone/00_PROJECT_MANIFEST.md` along with sprint/milestone status in step 5 of do_task.md command
- **Task Renaming**: Rename completed tasks to `TX##_` format for recognition

## Project Overview

**Crave Search**: Food discovery app providing evidence-based restaurant/dish recommendations from Reddit community knowledge.

**Architecture**: NestJS modular monolith + React Native mobile + PostgreSQL graph-based entity model

## Key Domains
- **content-processing**: Reddit data → LLM analysis → entity resolution
- **search-discovery**: Query processing, ranking, discovery feeds  
- **user-experience**: Auth, bookmarks, search endpoints
- **external-integrations**: Reddit API, LLM API, Google Places
- **infrastructure**: Database, caching, monitoring, security

## Essential Commands

```bash
# Development
pnpm dev                          # Start all services
pnpm --filter api dev            # API only
make docker-up                   # PostgreSQL + Redis
make db-migrate                  # Run migrations

# Quality checks  
turbo run lint && turbo run type-check
```

## Key Tech Stack
- **Backend**: NestJS + Prisma + PostgreSQL + Redis
- **Mobile**: React Native + Expo + Zustand 
- **Build**: Turborepo + pnpm + TypeScript

## Architectural Approach: Balanced DI & FP

### When to Use Dependency Injection
- **Stateful Services**: Database connections, external APIs, cache management
- **Lifecycle Management**: Services needing initialization/cleanup (OnModuleInit/OnModuleDestroy)
- **Cross-Cutting Concerns**: Logging, metrics, authentication
- **Request-Scoped Data**: Per-request isolation needs

### When to Use Utility Functions
- **Pure Transformations**: Data mapping, formatting, calculations
- **Simple Operations**: Deduplication, merging, validation
- **Business Rules**: Score calculation, ranking logic
- **Stateless Processing**: Any operation without side effects

## Code Patterns
- **Modules**: Domain-driven structure in `src/modules/`
- **Core Infrastructure**: `/src/core/` for cache, events, config, errors
- **Utilities**: `/src/utils/` for pure functions and helpers
- **Schemas**: `/src/schemas/` for Zod validation schemas
- **Database**: Prisma with DI for stateful operations
- **Errors**: Unified AppException with error codes (not 15+ custom classes)
- **Config**: Single source in `/src/core/config/app.config.ts`
- **Events**: Event-driven decoupling with EventEmitter2

## Database Schema (Key Tables)
- **entities**: Restaurants, dishes_or_categories, attributes (unified with `entity_type`)
- **connections**: Entity relationships with quality scores  
- **mentions**: Reddit community evidence with attribution

## TypeScript Guidelines
- Avoid `any` - use `unknown` for external data + type guards
- Custom exceptions in `src/shared/exceptions/` extending base classes
- Use ESLint disables with explicit reasons for framework necessities

## Task Memories & Discoveries

### T02_S02 External Integrations Module (2025-07-28)
- **Key Insight**: Broke iterative code review loop - fixed instructions to emphasize MANDATORY loop
- **Architecture**: BaseExternalApiService + RateLimitCoordinatorService + shared types pattern
- **Technical**: TypeScript union types need explicit variables, not ternary returns for proper inference
- **Process**: Always re-run code review after fixes - never proceed to completion without PASS

## Project Folders and Locations

### Simone Framework
- **Sprints & Tasks**: `.simone/03_SPRINTS/`
- **Commands**: `.claude/commands/simone/`
- **Project Manifest**: `.simone/00_PROJECT_MANIFEST.md`

### Code Structure  
- **API Modules**: `apps/api/src/modules/` (domain-driven folders)
- **Shared Code**: `apps/api/src/shared/` (utilities, exceptions, types)
- **Mobile**: `apps/mobile/src/` (screens, components, services)
- **Shared Package**: `packages/shared/` (cross-app types)

### Key Files
- **Main Config**: `apps/api/src/app.module.ts`
- **Database**: `apps/api/prisma/schema.prisma`
- **Environment**: `.env` files in each app folder