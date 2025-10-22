# Crave Search API

NestJS backend for the Crave Search food discovery platform.

## Overview

The API provides the backend infrastructure for Crave Search, implementing a modular monolith architecture with domain-driven design. It handles database operations, entity management, and provides REST endpoints for the mobile application.

## Technology Stack

- **Framework**: NestJS with Fastify adapter
- **Database**: PostgreSQL 15 with Prisma ORM
- **Caching**: Redis (for future features)
- **Testing**: Jest with integration and unit tests
- **Documentation**: Swagger/OpenAPI
- **Architecture**: Modular monolith with domain separation

## Quick Start

```bash
# From project root
cd apps/api

# Install dependencies (from root)
pnpm install

# Start development services
docker-compose up -d

# Run migrations and seed data
pnpm prisma:migrate
pnpm db:seed

# Start development server
pnpm start:dev
```

## Development Commands

### Core Commands

```bash
# Development server (with hot reload)
pnpm start:dev

# Production build and start
pnpm build
pnpm start:prod

# Testing
pnpm test              # All tests
pnpm test:e2e          # End-to-end tests
pnpm test:cov          # Coverage report
pnpm test:watch        # Watch mode

# Code quality
pnpm lint              # ESLint with auto-fix
pnpm type-check        # TypeScript check
pnpm format            # Prettier formatting
```

### Database Commands

```bash
# Migrations
pnpm prisma:migrate       # Run migrations
pnpm db:migrate:deploy    # Production deployment
pnpm db:migrate:reset     # Reset database (dev only)
pnpm db:migrate:status    # Check migration status

# Database management
pnpm prisma:generate      # Generate Prisma client
pnpm prisma:studio        # Database browser
pnpm db:seed             # Seed sample data

# Docker services
pnpm docker:up           # Start PostgreSQL + Redis
pnpm docker:down         # Stop services
```

## Environment Configuration

### Required Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database (required)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search_test"

# Application
PORT=3000
NODE_ENV=development

# Connection pooling
DATABASE_CONNECTION_POOL_MAX=10
DATABASE_CONNECTION_POOL_MIN=2

# Future features (optional for M01)
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret_key
```

### Database Configuration

The API uses PostgreSQL with connection pooling configured through Prisma:

- **Development**: Local PostgreSQL via Docker
- **Testing**: Separate test database for isolation
- **Connection Pool**: Configurable min/max connections
- **Migrations**: Prisma migrate for schema versioning

## Project Structure

```
apps/api/
├── src/
│   ├── modules/                 # Feature modules
│   │   ├── entities/           # Entity management
│   │   └── external-integrations/ # Future: Reddit, LLM APIs
│   ├── repositories/           # Data access layer
│   │   ├── base/              # Base repository pattern
│   │   ├── entity.repository.ts
│   │   ├── connection.repository.ts
│   │   └── mention.repository.ts
│   ├── shared/                # Shared utilities
│   │   ├── types/             # Type definitions
│   │   ├── exceptions/        # Custom exceptions
│   │   └── utils/             # Helper functions
│   ├── app.module.ts          # Root module
│   └── main.ts               # Application bootstrap
├── prisma/                   # Database schema and migrations
│   ├── schema.prisma         # Database schema
│   ├── migrations/           # Migration files
│   └── seed.ts              # Sample data
├── test/                    # Test configuration
│   ├── jest-e2e.json       # E2E test config
│   └── jest.setup.ts       # Test setup
└── docker-compose.yml      # Local services
```

## Database Schema

### Core Tables

- **entities**: Unified storage for restaurants, food, categories, attributes
- **connections**: Restaurant-food relationships with quality scores
- **boosts**: Category mention event log used for exponential-decay replays
- **category_aggregates**: Decayed restaurant/category fallback metrics

### Entity Types

- `restaurant`: Physical dining establishments
- `food`: Food items (dual purpose as dishes and categories)
- `food_attribute`: Food-scoped attributes (spicy, vegan, etc.)
- `restaurant_attribute`: Restaurant-scoped attributes (patio, family-friendly, etc.)

## Testing

### Test Types

- **Unit Tests**: Individual functions and services
- **Integration Tests**: Database operations and cross-module interactions
- **E2E Tests**: Complete API endpoint flows

### Test Commands

```bash
# Run all tests
pnpm test

# Specific test types
pnpm test:e2e              # End-to-end tests
pnpm test:cov              # With coverage report
pnpm test:watch            # Watch mode for development

# Test specific files
pnpm test entity.repository.spec.ts
pnpm test --testNamePattern="create entity"
```

### Test Database

Tests use a separate database (`crave_search_test`) to ensure isolation:

- Automatic setup/teardown via Jest global setup
- Test data cleanup between test runs
- Parallel test execution with proper isolation

## API Documentation

### Swagger Documentation

When the API is running, visit:
- **Swagger UI**: http://localhost:3000/api/docs
- **JSON Schema**: http://localhost:3000/api/docs-json

### Key Endpoints

```
GET  /health              # Health check
GET  /entities            # List entities
POST /entities            # Create entity
GET  /connections         # List connections
POST /connections         # Create connection
```

## Development Guidelines

### Code Organization

- **Domain-driven structure**: Organize by business domain, not technical layer
- **Repository pattern**: Data access abstraction
- **Service layer**: Business logic isolation
- **DTOs**: Data transfer objects for API boundaries

### Database Operations

- **Prisma ORM**: Type-safe database access
- **Connection pooling**: Configured for optimal performance
- **Bulk operations**: Efficient batch processing capabilities
- **Migrations**: Version-controlled schema evolution

### Error Handling

- **Custom exceptions**: Domain-specific error types
- **Global error filter**: Consistent error response format
- **Database constraints**: Proper foreign key and unique constraints
- **Validation**: Input validation using class-validator

## Performance Characteristics

### M01 Performance Baseline

Based on current implementation:

- **Entity CRUD**: <50ms for individual operations
- **Bulk operations**: 4,000+ records/second
- **Database connections**: Pool of 2-10 connections
- **Test suite**: 247 tests in <10 seconds

### Connection Pool Configuration

```env
DATABASE_CONNECTION_POOL_MAX=10    # Maximum connections
DATABASE_CONNECTION_POOL_MIN=2     # Minimum connections  
DATABASE_CONNECTION_ACQUIRE_TIMEOUT=60000  # Acquisition timeout
DATABASE_CONNECTION_IDLE_TIMEOUT=10000     # Idle timeout
```

## Troubleshooting

### Common Issues

**Database connection failed**
```bash
# Verify Docker services
docker ps | grep postgres

# Check database exists
docker exec -it <postgres-container> psql -U postgres -l

# Restart services
docker-compose down && docker-compose up -d
```

**Migration issues**
```bash
# Check migration status
pnpm prisma:migrate status

# Reset database (development only)
pnpm db:migrate:reset --force
```

**Test failures**
```bash
# Ensure test database exists
createdb crave_search_test

# Clean test data
pnpm test -- --clearCache
```

### Performance Issues

**Slow queries**
```bash
# Enable query logging in .env
DATABASE_LOGGING=true
DATABASE_SLOW_QUERY_THRESHOLD=1000

# Monitor in Prisma Studio
pnpm prisma:studio
```

## Production Considerations

**Note**: Production deployment is planned for later milestones (M02+). Current setup is optimized for local development.

For production, consider:
- Connection pool tuning based on load
- Environment-specific configuration
- Health checks and monitoring
- Security hardening

## Future Features (M02+)

Planned features for upcoming milestones:
- Reddit API integration
- LLM content processing
- Advanced caching with Redis
- Real-time data collection
- External API integrations
