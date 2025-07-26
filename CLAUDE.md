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

- **`restaurant`**: Physical dining establishments with location and operational data
- **`dish_or_category`**: Food items serving dual purposes as specific dishes OR general categories
  - Same entity can be both menu item (`is_menu_item = true`) and category (in `categories` array)
  - Eliminates redundancy in food terminology (e.g., "ramen" works as both dish and category)
- **`dish_attribute`**: Connection-scoped descriptors (spicy, vegan, house-made)
- **`restaurant_attribute`**: Restaurant-scoped descriptors (patio, romantic, family-friendly)

**Context-Dependent Attributes**: Many attributes exist as separate entities based on scope:
- "Italian" → `dish_attribute` entity (for Italian dishes) + `restaurant_attribute` entity (for Italian restaurants)
- "vegan" → `dish_attribute` entity + `restaurant_attribute` entity
- Enables precise query targeting and flexible cross-scope analysis

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

## TypeScript Strict Typing Guidelines

### Safe `any` Usage Policy

The codebase follows a **graduated tolerance approach** for TypeScript `any` usage:

#### **🟢 Tier 1: Acceptable (Framework Integration)**
These patterns are acceptable with proper documentation:

```typescript
// BaseRepository and core infrastructure - explicitly disabled
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// Reason: Prisma generic operations require any for delegate pattern

abstract class BaseRepository<T, TWhereInput, TCreateInput, TUpdateInput> {
  protected abstract getDelegate(): any; // Framework necessity
}
```

#### **🟡 Tier 2: Improve Gradually (Error Handling)**
Create proper interfaces for external data that comes as `any`:

```typescript
// Instead of: error.code (any access)
interface PrismaError {
  code?: string;
  meta?: Record<string, unknown>;
  message: string;
}

interface HttpError {
  status?: number;
  statusCode?: number;
  message: string;
  stack?: string;
}

// Use type guards for safe checking
function isPrismaError(error: unknown): error is PrismaError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isHttpError(error: unknown): error is HttpError {
  return typeof error === 'object' && error !== null && 
         ('status' in error || 'statusCode' in error);
}

// Safe usage in error handlers
protected handleError(error: unknown): Error {
  if (isPrismaError(error)) {
    return new DatabaseException(error.code, error.message);
  }
  if (isHttpError(error)) {
    return new HttpException(error.status || error.statusCode);
  }
  return new Error('Unknown error');
}
```

#### **🔴 Tier 3: Fix Immediately (Test Patterns)**
Always use proper typing for test utilities and return types:

```typescript
// ❌ Bad: Test generators using any
declare global {
  var testGenerators: any; // Unsafe
}

// ✅ Good: Proper test interface
interface TestGenerators {
  generateBulkEntityData: (
    count: number,
    type: EntityType,
    baseName: string,
  ) => Prisma.EntityCreateInput[];
  generateBulkConnectionData: (
    count: number,
    restaurantIds: string[],
    dishIds: string[],
  ) => Prisma.ConnectionCreateInput[];
}

declare global {
  var testGenerators: TestGenerators | undefined;
}

// ❌ Bad: Service return types using any
async getEntityInMenuContext(): Promise<{
  entity: Entity;
  connection: any; // Unsafe
}> 

// ✅ Good: Import proper types
import { Connection } from '@prisma/client';

async getEntityInMenuContext(): Promise<{
  entity: Entity;
  connection: Connection; // Type-safe
}>
```

### Error Handling Best Practices

#### **For Database Operations**
```typescript
import { Prisma } from '@prisma/client';

// Create specific error types
class DatabaseOperationError extends Error {
  constructor(
    public operation: string,
    public entityType: string,
    public originalError: unknown,
  ) {
    super(`${operation} failed for ${entityType}`);
  }
}

// Safe error handling without any
protected handlePrismaError(error: unknown, operation: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new UniqueConstraintException(this.entityName, error.meta?.target);
      case 'P2003':
        return new ForeignKeyConstraintException(this.entityName, error.meta?.field_name);
      default:
        return new DatabaseOperationError(operation, this.entityName, error);
    }
  }
  return new DatabaseOperationError(operation, this.entityName, error);
}
```

#### **For External API Responses**
```typescript
// Define expected response shapes
interface RedditApiResponse {
  data?: {
    children?: Array<{
      data: Record<string, unknown>;
    }>;
  };
  error?: string;
}

// Safe parsing with validation
function parseRedditResponse(response: unknown): RedditApiResponse | null {
  if (typeof response !== 'object' || response === null) {
    return null;
  }
  
  const obj = response as Record<string, unknown>;
  return {
    data: obj.data as RedditApiResponse['data'],
    error: typeof obj.error === 'string' ? obj.error : undefined,
  };
}
```

### Test-Specific Patterns

#### **Global Test Utilities**
```typescript
// Create typed test interfaces
interface IntegrationTestContext {
  prisma: PrismaService;
  entityRepository: EntityRepository;
  connectionRepository: ConnectionRepository;
}

// Use proper typing for test setup
declare global {
  var integrationTestContext: IntegrationTestContext | undefined;
}

// Safe access patterns
const testContext = globalThis.integrationTestContext;
if (!testContext) {
  throw new Error('Test context not available');
}
```

#### **Test Data Factories**
```typescript
// Instead of any, use proper factory interfaces
interface EntityTestFactory {
  restaurant: (overrides?: Partial<Prisma.EntityCreateInput>) => Prisma.EntityCreateInput;
  dish: (overrides?: Partial<Prisma.EntityCreateInput>) => Prisma.EntityCreateInput;
}

const testDataFactory: EntityTestFactory = {
  restaurant: (overrides = {}) => ({
    name: 'Test Restaurant',
    type: 'restaurant',
    latitude: 40.7128,
    longitude: -74.006,
    ...overrides,
  }),
  dish: (overrides = {}) => ({
    name: 'Test Dish',
    type: 'dish_or_category',
    ...overrides,
  }),
};
```

### Progressive Migration Strategy

#### **For New Code**
- Always use strict typing from the start
- Create proper interfaces for external data
- Use type guards for runtime validation
- Never introduce new `any` usage without explicit justification

#### **For Existing Code**
1. **High Priority**: Fix test patterns and return types
2. **Medium Priority**: Add interfaces for error handling
3. **Low Priority**: Document framework necessities with ESLint disables

#### **ESLint Configuration**
```typescript
// For legitimate framework integration
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// Reason: [Specific explanation of why any is required]
```

#### **Code Review Checklist**
- [ ] No new `any` usage without proper justification
- [ ] Error handling uses type guards instead of `any` access
- [ ] Test utilities have proper interface definitions
- [ ] Return types are fully specified
- [ ] External API responses are validated and typed

### When to Use `unknown` vs `any`

```typescript
// ✅ Use unknown for external data
function processExternalData(data: unknown): ProcessedData | null {
  if (typeof data === 'object' && data !== null) {
    // Type narrowing required - safer than any
    return processKnownShape(data);
  }
  return null;
}

// ❌ Only use any for framework necessities
abstract class BaseClass {
  protected abstract getDelegate(): any; // Framework requirement
}
```

## Project Folders and Locations

- Simone sprints and tasks are located @.simone/03_SPRINTS
- Simone commands are located @.claude/commands/simone