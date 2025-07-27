# Integration Testing Documentation

This document outlines the integration testing patterns and best practices implemented for the Crave Search API's repository and service layer interactions.

## Overview

Integration tests validate complete workflows from service layer through repository to database, ensuring proper dependency injection, transaction boundaries, error propagation, and data consistency across the application's modular monolith architecture.

## Test Structure

### Files Created

1. **`integration-test.setup.ts`** - Core testing infrastructure
2. **`entities.service.integration.spec.ts`** - EntitiesService integration tests
3. **`entity-context.service.integration.spec.ts`** - EntityContextService integration tests
4. **`entity.repository.integration.spec.ts`** - EntityRepository integration tests
5. **`connection.repository.integration.spec.ts`** - ConnectionRepository integration tests
6. **`cross-service-integration.spec.ts`** - Cross-service workflow tests

### Key Testing Patterns

#### 1. Database Isolation Strategy

```typescript
// Transaction-based isolation - all changes rolled back after each test
await testSetup.withTransaction(async (prisma) => {
  // Test operations here
  // Automatic rollback ensures test isolation
});
```

#### 2. Real Database Connections

```typescript
// Uses actual PrismaService, not mocked
const module = await testSetup.createTestingModule([
  EntitiesService,
  EntityRepository,
  // ... other providers
]);
```

#### 3. Test Data Seeding

```typescript
// Consistent test data creation
const testData = await testSetup.seedTestData(prisma);
// Returns: { restaurant, dishOrCategory, dishAttribute, restaurantAttribute }
```

## Test Coverage Areas

### Service Layer Integration

- **EntitiesService**: CRUD operations, validation, error handling
- **EntityContextService**: Entity context lookups, contextual attribute resolution, dual-purpose entities
- Complete service-repository-database interaction chains
- Business logic validation with real database constraints

### Repository Layer Integration

- **EntityRepository**: Entity creation, querying, updates, deletions
- **ConnectionRepository**: Relationship management, constraint enforcement
- Database constraint validation (foreign keys, unique constraints, enums)
- Geospatial queries and location-based operations

### Cross-Service Workflows

- Complete entity creation and resolution workflows
- Service layer orchestration across multiple repositories
- Transactional consistency across service boundaries
- Complex dual-purpose entity handling

### Error Propagation

- Database constraint violations through all layers
- Prisma error mapping and exception handling
- Validation errors from repository to service layers
- Graceful handling of invalid data and edge cases

### Performance & Concurrency

- Performance baseline testing for integration scenarios
- Concurrent operation handling and database locking
- Data consistency during parallel operations
- Resource cleanup and connection management

## Running Integration Tests

### Prerequisites

```bash
# Ensure database is running
pnpm --filter api docker:up

# Ensure migrations are current
pnpm --filter api db:migrate
```

### Execution

```bash
# Run all integration tests
pnpm --filter api test -- --testNamePattern="Integration"

# Run specific integration test file
pnpm --filter api test entities.service.integration.spec.ts

# Run with coverage
pnpm --filter api test:cov -- --testNamePattern="Integration"
```

### Environment Variables

Integration tests require:
- `DATABASE_URL` or `TEST_DATABASE_URL` - Database connection string
- Test environment automatically set by test setup

## Architecture Patterns Validated

### 1. Unified Entity Model

Tests validate the graph-based entity-relationship model:
- Entities table with type differentiation
- Connections table for relationships
- Proper constraint enforcement

### 2. Repository Pattern

Tests ensure proper abstraction:
- Service layer business logic separation
- Repository layer database access isolation
- Clean dependency injection patterns

### 3. NestJS Integration

Tests validate framework integration:
- TestingModule configuration
- Dependency injection container
- Real vs. mocked service resolution

### 4. Database Transactions

Tests ensure transactional integrity:
- Multi-entity operations
- Rollback scenarios
- Consistency during failures

## Best Practices Implemented

### Test Organization

- **Descriptive test names** indicating integration path tested
- **Grouped by business workflow** for logical organization
- **Comprehensive coverage** of acceptance criteria

### Database Testing

- **Transaction isolation** prevents test interference
- **Real database operations** validate actual behavior
- **Constraint validation** ensures database integrity

### Error Handling

- **Error propagation testing** validates layer boundaries
- **Graceful degradation** for connection issues
- **Proper error context** preservation

### Performance

- **Performance thresholds** for integration operations
- **Concurrent operation testing** for scalability
- **Resource cleanup** prevents memory leaks

## Maintenance Guidelines

### Adding New Integration Tests

1. **Use existing patterns** from established test files
2. **Follow transaction isolation** with `withTransaction`
3. **Include error scenarios** alongside happy paths
4. **Validate end-to-end workflows** not just individual operations

### Updating Test Data

1. **Update `seedTestData`** method in integration-test.setup.ts
2. **Maintain consistency** across all test files
3. **Document changes** that affect multiple test suites

### Performance Monitoring

1. **Monitor test execution times** for regressions
2. **Update performance thresholds** as system evolves
3. **Profile database queries** during test runs

## Integration with CI/CD

These integration tests are designed to:
- **Run in parallel** with proper test isolation
- **Work with any PostgreSQL database** via environment variables
- **Provide clear failure diagnostics** for debugging
- **Complete within reasonable time bounds** for CI pipelines

## Troubleshooting

### Common Issues

1. **Database connection failures**
   - Check `DATABASE_URL` environment variable
   - Ensure PostgreSQL is running and accessible

2. **Test isolation failures**
   - Verify all tests use `withTransaction` wrapper
   - Check for test data leakage between tests

3. **Timeout issues**
   - Review performance thresholds in tests
   - Check for hanging database connections

4. **Constraint violations**
   - Verify test data consistency
   - Check entity relationship integrity

### Debug Configuration

```typescript
// Enable query logging in tests
process.env.DATABASE_LOG_ENABLED = 'true';
process.env.DATABASE_LOG_SLOW_QUERY_THRESHOLD = '100';
```

This integration testing approach ensures comprehensive validation of the service-repository-database interaction layer while maintaining test reliability and performance.