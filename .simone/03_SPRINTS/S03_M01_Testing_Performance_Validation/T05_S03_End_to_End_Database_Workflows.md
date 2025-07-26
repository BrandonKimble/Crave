---
task_id: T05_S03
sprint_sequence_id: S03
status: open
complexity: Medium
last_updated: 2025-07-26T12:15:00Z
---

# Task: End-to-End Database Workflows

## Description

**SCOPE ADJUSTED FOR REALISM**: Implement focused end-to-end tests for core database workflows that represent the most critical system usage patterns. This task focuses on 2-3 essential workflows rather than comprehensive coverage, establishing a foundation for future E2E testing expansion.

The current codebase has basic E2E tests but lacks core database workflow testing for the most critical business processes.

## Goal / Objectives

**SCOPE REDUCED - Focus on Core Workflows:**

- Implement E2E tests for essential entity resolution workflows 
- Test basic connection creation with entity relationship validation
- Validate core cross-entity query patterns (most common use cases)
- Ensure database transaction integrity for critical multi-step workflows
- Basic performance validation (functional, not comprehensive benchmarking)

## Acceptance Criteria

**SCOPE REDUCED - Core Workflow Focus:**

- [ ] E2E test suite covers essential entity resolution workflows (restaurant + dish creation and linking)
- [ ] Basic connection creation workflows tested end-to-end with entity validation
- [ ] Core cross-entity query workflows validate primary relationship navigation patterns
- [ ] Database state management ensures proper test isolation and cleanup
- [ ] Transaction integrity validated for critical multi-step operations
- [ ] Test suite integrates with existing E2E infrastructure (`jest-e2e.json`)
- [ ] Basic database fixtures support core workflow scenarios
- [ ] Essential error handling and rollback scenarios tested

## PRD References

**Primary PRD Sections:**
- **1** Overview & Core System Architecture (all subsections)
- **2** Technology Stack (all subsections) 
- **3** Hybrid Monorepo & Modular Monolith Architecture (all subsections)
- **4** Data Model & Database Architecture (all subsections)
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

**SCOPE REDUCED - Core Workflow Focus:**

- [ ] Research existing E2E patterns and identify core workflow integration points
- [ ] Design focused workflow test scenarios for essential business processes
- [ ] Implement entity resolution workflow tests (restaurant + dish creation and resolution)
- [ ] Create basic connection creation workflow tests with entity validation
- [ ] Develop core cross-entity query workflow tests for primary relationship patterns
- [ ] Implement database state management with proper test isolation
- [ ] Add transaction integrity validation for critical multi-step operations
- [ ] Integrate with existing E2E infrastructure (`jest-e2e.json`)
- [ ] Add essential error handling and rollback scenario testing
- [ ] Document core workflow test patterns for future expansion

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

**SIMPLIFIED STEP-BY-STEP APPROACH:**

1. **Foundation Setup:**
   - Create `test/workflows/` directory structure
   - Setup basic database fixture management
   - Configure test database isolation strategy

2. **Core Workflow Tests:**
   - Implement essential entity resolution workflow tests (restaurant + dish)
   - Build basic connection creation workflow tests
   - Create core cross-entity query workflow validation

3. **Integration & Quality:**
   - Integrate with existing E2E infrastructure
   - Add essential error scenario testing
   - Document core workflow test patterns for future expansion

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