---
task_id: T02_S03
sprint_sequence_id: S03
status: open
complexity: High
last_updated: 2025-01-25T18:30:00Z
---

# Task: Integration Tests for Repository and Service Layer Interactions

## Description

Create comprehensive integration tests covering all repository and service layer interactions in the Crave Search API. These tests will validate complete workflows from service layer through repository to database, ensuring proper dependency injection, transaction boundaries, error propagation, and data consistency across the application's modular monolith architecture.

The integration tests will complement existing unit tests by testing real database interactions, service-repository integration patterns, and end-to-end business logic workflows without mocking the database layer.

## Goal / Objectives

Establish thorough integration test coverage that validates the complete service-repository-database interaction layer:

- Test all service layer methods with real database operations
- Validate proper dependency injection across service and repository layers
- Ensure transaction boundaries and rollback behavior work correctly
- Test error propagation from database through repository to service layers
- Validate data consistency and constraint enforcement at integration level
- Test cross-service interactions and entity resolution workflows

## Acceptance Criteria

- [ ] Integration tests created for all major service classes (EntitiesService, EntityResolutionService)
- [ ] Integration tests created for all repository classes (EntityRepository, ConnectionRepository, etc.)
- [ ] Database transaction testing with rollback scenarios implemented
- [ ] Error propagation testing from database through all layers validated
- [ ] Dependency injection testing for service-repository interactions verified
- [ ] Cross-service integration patterns tested (EntityResolutionService + EntityRepository + ConnectionRepository)
- [ ] Integration test database setup with proper isolation implemented
- [ ] All tests follow NestJS testing patterns with TestingModule
- [ ] Test coverage includes edge cases, constraint violations, and concurrent operations
- [ ] Integration tests can run independently and in parallel without interference

## PRD References

**Primary PRD Sections:**
- **1** Product Vision - Unified Entity Model Implementation
- **2** Essential Libraries - Database architecture patterns
- **3** Development Principles - Repository pattern implementation
- **4** Unified Entity Model Implementation - Entity resolution service implementation
- **9.1.2 Success Criteria**: "Test suite runs successfully with >80% code coverage for database operations"
- **4.1 Core Database Schema**: Unified entity-relationship model requiring end-to-end validation
- **2.3 Data Layer**: Database connection pooling, basic database operations, transaction handling
- **3.4 Development and Design Principles**: Integration testing standards and quality assurance practices

**Specific Requirements Addressed:**
- M01 Success Criteria: "Basic CRUD operations functional for all entity types" - validated through integration tests
- Database integrity: "Database schema created and all foreign key relationships properly enforced"
- Connection pooling: "Connection pooling configured and functional" - tested through service-repository integration
- Testing infrastructure: "Test suite runs successfully" - comprehensive integration test coverage

**Supporting PRD Sections:**
- **4.1.1 Graph-Based Model**: Entity Management - Validates unified entity model through complete workflows  
- **4.1.2 Connection Management**: Tests restaurant-dish relationship integrity
- **4.1.3 Dual-Purpose Entity Design**: Validates context-aware entity resolution
- **Data Quality Requirements**: Ensures constraint enforcement through integration testing

## Subtasks

- [ ] Research existing integration test patterns and database setup
- [ ] Create integration test database configuration and isolation strategy
- [ ] Implement EntitiesService integration tests with real database operations
- [ ] Implement EntityResolutionService integration tests with connection validation
- [ ] Implement EntityRepository integration tests with constraint validation
- [ ] Implement ConnectionRepository integration tests with entity relationship validation
- [ ] Create cross-service integration tests for entity resolution workflows
- [ ] Implement transaction boundary and rollback testing
- [ ] Add error propagation testing across all layers
- [ ] Create concurrent operation testing for data consistency
- [ ] Add performance baseline testing for integration scenarios
- [ ] Document integration test patterns and best practices

## Technical Guidance

### NestJS Testing Utilities

The codebase uses NestJS testing utilities for integration testing. Key patterns identified:

```typescript
// TestingModule setup for integration tests
const module: TestingModule = await Test.createTestingModule({
  imports: [
    ConfigModule.forRoot({ /* test config */ }),
    PrismaModule,
    RepositoryModule,
  ],
  providers: [ServiceClass, RepositoryClass],
}).compile();

// Real database connection (not mocked)
const service = module.get<ServiceClass>(ServiceClass);
const repository = module.get<RepositoryClass>(RepositoryClass);
```

### Database Connections for Integration Tests

Based on existing patterns in `/Users/brandonkimble/crave-search/apps/api/test/app.e2e-spec.ts` and `/Users/brandonkimble/crave-search/apps/api/test/reddit-integration.spec.ts`:

- Use real database connections, not mocked PrismaService
- Implement database isolation using transactions or separate test database
- Follow existing e2e test patterns for TestingModule configuration
- Use Fastify adapter configuration for realistic HTTP context

### Service Layer Interfaces

Key service layer patterns to test:

```typescript
// EntitiesService patterns
async create(data: { entityType: EntityType; name: string; ... }): Promise<Entity>
async findMany(params: { where?: Prisma.EntityWhereInput; ... }): Promise<Entity[]>
async validateEntityExists(entityId: string, expectedType?: EntityType): Promise<boolean>

// EntityResolutionService patterns  
async getEntityInMenuContext(entityId: string, restaurantId: string)
async resolveContextualAttributes(attributeName: string, scope: 'dish' | 'restaurant')
async findDualPurposeEntities(): Promise<Array<{ entity: Entity; menuItemUsage: number; categoryUsage: number }>>
```

## Implementation Notes

### Step-by-Step Integration Testing Approach

1. **Database Test Setup**
   - Create isolated test database configuration
   - Implement transaction-based test isolation using Prisma
   - Set up proper beforeEach/afterEach cleanup patterns
   - Configure TestingModule with real database connections

2. **Service-Repository Integration Testing**
   - Test EntitiesService with real EntityRepository and database
   - Validate all CRUD operations flow through service → repository → database
   - Test business logic validation at service layer with database constraints
   - Verify proper error handling and propagation across layers

3. **Dependency Injection Testing**
   - Test service constructor injection with repository dependencies
   - Validate logger context setting and correlation tracking
   - Test service layer performance logging with real database timings
   - Verify proper cleanup and resource management

4. **Database Transaction Testing**
   - Test transaction boundaries for multi-entity operations
   - Implement rollback testing for failed operations
   - Test concurrent operation handling and database locking
   - Validate consistency during partial failure scenarios

5. **Cross-Service Integration Workflows**
   - Test EntityResolutionService + EntityRepository + ConnectionRepository interactions
   - Validate dual-purpose entity resolution with real database queries
   - Test contextual attribute resolution across service boundaries
   - Verify performance characteristics of complex resolution workflows

6. **Error Propagation Validation**
   - Test database constraint violations propagating through layers
   - Validate Prisma error mapping through PrismaErrorMapper
   - Test validation exceptions from repository layer reaching service layer
   - Verify proper error context and correlation ID preservation

7. **Integration Test Organization**
   - Create test files following pattern: `*.integration.spec.ts`
   - Organize by service layer with comprehensive repository interaction coverage
   - Use descriptive test names indicating the integration path being tested
   - Group related integration tests by business workflow

### Database Isolation Strategy

Based on the existing codebase patterns, implement one of these strategies:

1. **Transaction Rollback Pattern** (Preferred)
   ```typescript
   beforeEach(async () => {
     await prisma.$transaction(async (tx) => {
       // Run test in transaction that gets rolled back
     });
   });
   ```

2. **Separate Test Database** (Alternative)
   - Use `process.env.DATABASE_URL` with test-specific database
   - Implement proper database seeding and cleanup
   - Ensure parallel test execution doesn't interfere

### Testing Entity Resolution Integration

Focus on these critical integration paths:

- `EntitiesService.create()` → `EntityRepository.createRestaurant()` → Database constraints
- `EntityResolutionService.getEntityInMenuContext()` → Multiple repository calls → Connection validation
- Service layer error handling → Repository exceptions → Prisma error mapping
- Cross-repository operations through service orchestration

## Output Log

_(This section is populated as work progresses on the task)_