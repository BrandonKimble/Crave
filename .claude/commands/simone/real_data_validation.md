# Real Data E2E Integration Validation

Validates seamless integration using **REAL DATA** across all implemented services to ensure Crave app components work together toward unified user experience goals.

**Key Focus**: This command creates and maintains a comprehensive "testing story" - a detailed technical account of real-world validation that gets rewritten (not appended) with each validation run, building understanding of how the complete app functions as services and features are added on the path to production readiness.

## Create a TODO with EXACTLY these 4 Items

1. Load context and PRD requirements
2. Assess current integration state
3. Execute comprehensive E2E testing scenarios with real data flows
4. Provide production readiness verdict with detailed technical validation account

Follow step by step and adhere closely to the following instructions for each step.

## DETAILS on every TODO item

## 1 · Load context and PRD requirements

**Load Sprint and Milestone Context Comprehensively:**

**Parse current sprint and context:**
- Check <$ARGUMENTS> for task ID or read `.simone/00_PROJECT_MANIFEST.md` for current task/sprint/milestone context
- Find task file in `.simone/03_SPRINTS/`
- **Read PRD sections systematically in this order:**

1. **Read TASK PRD SECTIONS**: Locate and read ALL sections listed under "IMPLEMENTS PRD REQUIREMENTS" in the task
   - Extract: Specific requirements, acceptance criteria, technical specifications
   - Read ALL subsections completely (e.g., section 4 = read 4.1, 4.2, 4.3, 4.1.1, 4.1.2, etc.)

2. **Read CONTEXT PRD SECTIONS**: Locate and read ALL sections listed under "BROADER CONTEXT" in the task  
   - Extract: Constraints, integration requirements, architectural context, dependencies
   - Read ALL subsections completely for full understanding

3. **Read ROADMAP SECTIONS**: Read PRD sections 9 and 10 completely
   - Extract: Scope boundaries, milestone context, what NOT to implement
   - Read ALL subsections within 9 and 10

**Parse Previous Task Context:**
- Read ALL task files in current sprint (both T## and TX## files) to understand complete implementation scope
- Extract: What services have been implemented, integration points created, data flows established
- Identify: API endpoints, database schemas, external integrations, processing pipelines built during sprint
- Map: Dependencies between tasks and how they work together as a unified system

**Parse Previous Milestone Context:**
- Read ALL milestone meta files from `.simone/02_REQUIREMENTS/` (M01, M02, etc.) up to current milestone
- Extract: Foundation services, core capabilities, architectural patterns established in previous milestones
- Identify: What infrastructure, services, and integrations are available from previous work
- Understand: How current sprint builds upon and integrates with existing foundation

## 2 · Assess current integration state

**Read Current E2E Status:**
- Read current milestone's `M##_E2E_Testing_Status.md` from `.simone/02_REQUIREMENTS/M##_Milestone_Name/`
- If starting new milestone and file doesn't exist, read previous milestone's E2E testing status for context
- Identify currently testable E2E scenarios with real data sources
- Map existing API integrations and data flows between services
- Understand current system capabilities and integration points

**Evaluate the current integration landscape using all accumulated context:**
- Take note of all complete data flows and service integrations implemented across ALL milestones, sprints, and tasks.
- Note how services are connected to deliver end-to-end user journeys.
- Note the critical integration points that must be tested with real data.
- Keep in mind comprehensive E2E scenarios that would validate the complete sprint implementation as an integrated system.
- Remember to reference PRD requirements if needed to ensure E2E testing covers all specified integration points and user journeys.

## 3 · Execute comprehensive E2E testing scenarios with real data flows

**Setup Production-Like Environment:**
- Use real APIs, databases, and data sources (no mocks or test data)
- Use real API keys, tokens, and authentication for live service calls
- Verify all services (PostgreSQL, Redis, external APIs) are running and accessible
- Configure realistic network conditions and resource constraints
- Identify specific subreddits, data sources, and authentic content volumes to use

**Execute Complete E2E Scenarios:**
- **Cross-Service Data Flow**: Test complete user journeys across all implemented services
  - Reddit data → LLM processing → Database storage → API responses
  - Google Places integration with location processing
  - Any other service integrations with real data flows

- **User Experience Validation**: Test realistic scenarios with actual app workflows
  - Complete food discovery journeys with real restaurant/dish data
  - User search queries with authentic Reddit community responses
  - Seamless experience across all touchpoints

- **System Integration Points**: Test all integration points with real data
  - Database operations with realistic volumes and query patterns
  - Caching, queueing, and async processing under production-like loads
  - Monitoring, logging, and error tracking with real system behavior

**Performance & Resilience Validation:**
- Test sustained load across all services with realistic usage patterns
- Measure performance under expected peak loads and identify bottlenecks
- Test network failures, API outages, and recovery scenarios
- Validate retry logic, circuit breakers, and fallback mechanisms
- Monitor resource usage (CPU, memory, network) under integrated loads
- Test edge cases and boundary conditions with actual production data
- Assess service coordination effectiveness and data consistency across boundaries
- Validate complete food discovery journey performance and recommendation quality

## 4 · Provide production readiness verdict with detailed technical validation account

**Decision criteria:**

**✅ PRODUCTION READY - SEAMLESS INTEGRATION**
- All external integrations tested with **REAL APIS** and authentication across complete system
- Core E2E data processing validated with production-scale real datasets flowing through all services
- Cross-service performance meets requirements under realistic integrated load conditions
- Error handling proven effective with real failure scenarios across complete system
- Security and data integrity validated with real-world conditions
- Monitoring and observability working with real system behavior across all services
- Complete E2E user scenarios working with **REAL DATA** flows through entire system
- Resource usage and costs acceptable for production deployment
- Services work together effectively toward unified Crave app vision
- Complete user journeys align with seamless food discovery experience goals
- All components integrate without breaking existing functionality
**⚠️ MINOR INTEGRATION ISSUES**
- Most E2E scenarios work but minor performance issues exist
- Some integration edge cases need handling improvements
- Monitoring or logging needs enhancement
- Issues are non-blocking but affect system quality
**❌ MAJOR INTEGRATION ISSUES**
- Critical E2E functionality fails with real data across services
- Cross-service performance significantly below requirements
- Integration points unstable or unreliable
- Major error handling gaps in service communication
- Security or data integrity concerns
- Complete user journeys not ready for production deployment

**CRITICAL FINAL STEP:**
After completing all validation phases, **UPDATE** the current milestone's `M##_E2E_Testing_Status.md` file in `.simone/02_REQUIREMENTS/M##_Milestone_Name/` using the structured template at `.simone/99_TEMPLATES/milestone_e2e_testing_template.md`. 

**The template provides comprehensive structure for documenting:**
- Current system capabilities and integration status
- Real data testing scenarios and results
- Performance metrics and edge case discoveries
- Production readiness assessment with evidence
- Next testing opportunities and success criteria

**Focus on "Testing Story" - Detailed Technical Validation Account:**
Within the template structure, provide a comprehensive chronological narrative of the complete testing process that serves as both documentation and guidance for future validation runs. This account should be **rewritten each time** (not appended to) as system capabilities evolve and more features become testable together.

**The testing story should document:**
1. **Environment Setup & Real Data Configuration**: Complete setup process, data sources used, production-like conditions established
2. **Testing Execution Journey**: Chronological account of what was tested, specific scenarios with actual data, performance observations, integration validations
3. **Issues, Resolutions & Insights**: Problems discovered, root cause analysis, fixes applied, lessons learned from real-world conditions
4. **Evidence of Production Readiness**: Concrete validation results, integration quality assessment, capability demonstrations
