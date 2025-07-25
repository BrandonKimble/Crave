---
task_id: T05_S03
sprint_sequence_id: S03
status: open
complexity: High
last_updated: 2025-01-25T00:00:00Z
---

# Task: End-to-End Database Workflows

## Description

Implement comprehensive end-to-end tests for complete database workflows and transactions that represent real system usage patterns. This includes testing complete data flows from Reddit ingestion through entity resolution, connection creation, mention processing, and cross-entity queries that mirror production workflows.

The current codebase has basic E2E tests (`/Users/brandonkimble/crave-search/apps/api/test/app.e2e-spec.ts`, `/Users/brandonkimble/crave-search/apps/api/test/comment-thread-retrieval.e2e-spec.ts`) but lacks comprehensive database workflow testing that validates complete business processes from start to finish.

## Goal / Objectives

- Implement E2E tests that validate complete database workflows representing real system usage
- Test entity resolution workflows including dual-purpose dish_or_category entities
- Validate connection creation with comprehensive entity relationship validation
- Test mention processing workflows from Reddit data to database storage
- Implement cross-entity query testing that validates complex relationship traversals
- Ensure database transaction integrity across multi-step workflows
- Validate performance characteristics of complete workflow chains

## Acceptance Criteria

- [ ] E2E test suite covers complete entity resolution workflows with context-aware processing
- [ ] Connection creation workflows are tested end-to-end with full validation chains
- [ ] Mention processing workflows test complete Reddit-to-database data flows
- [ ] Cross-entity query workflows validate complex relationship navigation
- [ ] Database state management ensures proper test isolation and cleanup
- [ ] Transaction integrity is validated across multi-step operations
- [ ] Performance benchmarks are established for workflow completion times
- [ ] Test suite integrates with existing E2E infrastructure (`jest-e2e.json`)
- [ ] Database fixtures and test data support realistic workflow scenarios
- [ ] Error handling and rollback scenarios are comprehensively tested

## PRD References

**Primary PRD Sections:**
- **1** Product Vision - Unified Entity Model Implementation
- **2** Essential Libraries - Database architecture patterns
- **3** Development Principles - Repository pattern implementation
- **4** Unified Entity Model Implementation - Entity resolution service implementation
- **9.1.2 Success Criteria**: "Database schema created and all foreign key relationships properly enforced" - validated through complete workflows
- **4.1 Core Database Schema**: Graph-based entity model requiring end-to-end workflow validation
- **2.3 Data Layer**: Database operations and transaction handling tested in complete scenarios
- **3.4 Development and Design Principles**: End-to-end testing standards ensuring system reliability

**Specific Requirements Addressed:**
- M01 Success Criteria: "Basic CRUD operations functional for all entity types" - validated through complete workflows
- Database integrity: "Migration system successfully creates and applies schema changes" - tested in realistic scenarios
- Connection pooling: "Connection pooling configured and functional" - tested under workflow load
- Local development: "Local development environment setup documented and reproducible" - validated with E2E workflows

**Supporting PRD Sections:**
- **4.1.1 Graph-Based Model**: Unified dish_or_category Entity Approach - dual-purpose entity testing
- **4.1.2 Connection Model**: Entity relationship validation through complete workflow chains
- **Database design**: Graph-based entity model requiring comprehensive workflow validation
- **Transaction integrity**: Multi-step operations ensuring data consistency

## Subtasks

- [ ] Research existing E2E patterns and database workflow integration points
- [ ] Design comprehensive workflow test scenarios covering major business processes
- [ ] Implement entity resolution workflow tests with dual-purpose entity handling
- [ ] Create connection creation workflow tests with full validation chains
- [ ] Build mention processing workflow tests from ingestion to storage
- [ ] Develop cross-entity query workflow tests for complex relationship traversals
- [ ] Implement database state management with proper test isolation
- [ ] Add transaction integrity validation across multi-step operations
- [ ] Create performance benchmarking for workflow completion times
- [ ] Integrate with existing E2E infrastructure and CI/CD pipeline
- [ ] Add comprehensive error handling and rollback scenario testing
- [ ] Document workflow test patterns for future development

## Technical Guidance

### E2E Testing Approach

The implementation should follow patterns established in existing E2E tests while extending to comprehensive database workflows:

**Test Infrastructure:**
- Extend existing Jest E2E configuration (`/Users/brandonkimble/crave-search/apps/api/test/jest-e2e.json`)
- Use NestJS TestingModule for full application context
- Leverage existing Fastify adapter pattern from `app.e2e-spec.ts`
- Integrate with PrismaService for direct database interaction validation

**Database State Management:**
- Implement proper test database isolation using transactions or database reset
- Create realistic test fixtures that represent production data patterns
- Use Prisma's transaction capabilities for atomic test operations
- Ensure complete cleanup between test runs to prevent interference

**Workflow Validation Pattern:**
```typescript
// Example workflow test structure
describe('Entity Resolution Workflow (e2e)', () => {
  beforeEach(async () => {
    // Setup clean database state
    // Prepare test fixtures
  });

  it('should complete full entity resolution workflow', async () => {
    // Step 1: Create base entities
    // Step 2: Process entity resolution
    // Step 3: Validate contextual usage
    // Step 4: Verify database consistency
  });

  afterEach(async () => {
    // Clean up test data
  });
});
```

### Database Workflow Coverage

**Entity Resolution Workflows:**
- Test dual-purpose dish_or_category entity creation and resolution
- Validate contextual attribute resolution across dish and restaurant scopes
- Test entity deduplication and alias handling workflows

**Connection Creation Workflows:**
- Test complete validation chains from EntityResolutionService and ConnectionRepository
- Validate restaurant-dish relationship creation with attribute validation
- Test menu item vs category context handling in connections

**Mention Processing Workflows:**
- Test Reddit comment processing from raw data to mention storage
- Validate connection updates based on mention statistics
- Test quality score recalculation workflows

**Cross-Entity Query Workflows:**
- Test complex relationship traversals using repository methods
- Validate query performance across entity relationships
- Test aggregation workflows for statistics and scoring

### Implementation Notes

**Step-by-Step Approach:**

1. **Foundation Setup:**
   - Create `test/workflows/` directory structure
   - Setup database fixture management system
   - Configure test database isolation strategy

2. **Core Workflow Tests:**
   - Implement entity resolution workflow test suite
   - Build connection creation workflow tests
   - Create mention processing workflow validation

3. **Advanced Scenarios:**
   - Add cross-entity query workflow tests
   - Implement transaction integrity validation
   - Build performance benchmarking framework

4. **Integration & Quality:**
   - Integrate with existing CI/CD pipeline
   - Add comprehensive error scenario testing
   - Document workflow test patterns

**Key Services to Test:**
- EntityResolutionService: Context-aware entity resolution workflows
- ConnectionRepository: Complex validation and creation workflows
- MentionRepository: Statistics and aggregation workflows
- All repository integration points for cross-entity operations

**Database Transaction Testing:**
- Use Prisma's `$transaction` API for atomic operation testing
- Test rollback scenarios when workflow steps fail
- Validate consistency across related entities after workflow completion

**Performance Considerations:**
- Benchmark complete workflow execution times
- Test workflow performance under realistic data volumes
- Validate database query optimization across workflow steps

The implementation should create a comprehensive test suite that validates complete business processes rather than isolated components, ensuring database workflows function correctly in production-like scenarios.

## Output Log

_(This section is populated as work progresses on the task)_

[YYYY-MM-DD HH:MM:SS] Started task
[YYYY-MM-DD HH:MM:SS] Modified files: file1.js, file2.js
[YYYY-MM-DD HH:MM:SS] Completed subtask: Implemented feature X
[YYYY-MM-DD HH:MM:SS] Task completed