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

**CRITICAL: This section requires ACTUAL DATA PROCESSING, not just connectivity testing**

**Setup Production-Like Environment:**
- Use real APIs, databases, and data sources (no mocks or test data)
- Use real API keys, tokens, and authentication for live service calls
- Verify all services (PostgreSQL, Redis, external APIs) are running and accessible
- Configure realistic network conditions and resource constraints
- **MANDATORY**: Clear existing database tables to ensure fresh data processing validation

**MANDATORY REAL DATA PROCESSING REQUIREMENTS:**

**1. ACTUAL PUSHSHIFT ARCHIVE PROCESSING (Required for Historical Data tasks):**
- **MUST DO**: Download and process at least one real Pushshift archive file (minimum 100MB)
- **MUST DO**: Stream process the file line-by-line through the complete pipeline
- **MUST DO**: Verify entities, connections, and mentions tables are populated with real data
- **MUST DO**: Process minimum 1,000 posts/comments through LLM → entity resolution → database
- **Database Population Check**: Query and count actual records in all tables after processing
- **Performance Measurement**: Record actual processing times, memory usage, and throughput

**2. ACTUAL REDDIT API DATA COLLECTION (Required for Real-Time Collection tasks):**
- **MUST DO**: Execute real Reddit API calls to fetch live data from target subreddits
- **MUST DO**: Process minimum 100 posts/comments through the complete pipeline
- **MUST DO**: Verify real Reddit content is processed through LLM and stored in database
- **MUST DO**: Execute both chronological collection and keyword search scenarios with real API
- **Database Population Check**: Confirm new entities/connections created from live Reddit data

**3. ACTUAL LLM PROCESSING WITH REAL CONTENT:**
- **MUST DO**: Process real Reddit discussions about food/restaurants through LLM service
- **MUST DO**: Extract minimum 50 real entity mentions (restaurants, dishes, attributes)
- **MUST DO**: Validate LLM output contains actual restaurant names, dish names, attributes from Reddit
- **Content Verification**: Manually verify extracted entities match original Reddit content

**4. ACTUAL DATABASE POPULATION VALIDATION:**
- **MANDATORY DATABASE CHECKS** - Execute these SQL queries and report results:
  ```sql
  SELECT COUNT(*) FROM entities WHERE entity_type = 'restaurant';
  SELECT COUNT(*) FROM entities WHERE entity_type = 'dish_or_category';  
  SELECT COUNT(*) FROM entities WHERE entity_type = 'dish_attribute';
  SELECT COUNT(*) FROM entities WHERE entity_type = 'restaurant_attribute';
  SELECT COUNT(*) FROM connections;
  SELECT COUNT(*) FROM mentions;
  ```
- **MINIMUM REQUIREMENTS**: 
  - At least 25 restaurant entities
  - At least 50 dish/category entities
  - At least 100 attribute entities
  - At least 75 connections
  - At least 200 mentions
- **CONTENT VALIDATION**: Sample actual entity names and verify they are real restaurants/dishes

**5. ACTUAL END-TO-END DATA FLOW VALIDATION:**
- **MUST DO**: Execute complete pipeline: Raw Reddit data → LLM processing → Entity resolution → Database storage
- **MUST DO**: Trace specific Reddit posts through entire pipeline and verify final database records
- **MUST DO**: Validate source attribution - ensure mentions link back to original Reddit URLs
- **Performance Requirements**: Complete pipeline must process 100 items within 10 minutes

**EXPLICIT ACTIONS REQUIRED (Not Just Testing):**
- Start database services and clear tables
- Download real archive files or execute real Reddit API calls  
- Run actual stream processing or collection services with real data
- Execute LLM processing on real Reddit content about food
- Perform entity resolution on real extracted entities
- Execute bulk database operations with real processed data
- Query database tables and report actual record counts
- Verify real restaurant names, dish names exist in database
- Measure actual processing times and resource usage

**FAILURE CONDITIONS - Mark as MAJOR ISSUES if:**
- Database tables remain empty or have <10 records after "processing"
- No real restaurant/dish names found in entities table
- LLM processing was not executed with real Reddit content
- Archive files were not actually downloaded and processed
- Reddit API was not called with real authentication
- Processing pipeline was simulated rather than executed

## 4 · Provide production readiness verdict with detailed technical validation account

**Decision criteria:**

**✅ PRODUCTION READY - SEAMLESS INTEGRATION**
- **ACTUAL DATA PROCESSED**: Database tables populated with minimum required record counts (25+ restaurants, 50+ dishes, 100+ attributes, 75+ connections, 200+ mentions)
- **REAL REDDIT CONTENT**: Actual Reddit discussions about food processed through LLM with verified entity extraction
- **COMPLETE PIPELINE EXECUTION**: Raw data successfully flowed through entire pipeline (Reddit → LLM → Entity Resolution → Database) with measurable results
- **REAL RESTAURANT/DISH NAMES**: Database contains actual restaurant names and dish names that can be verified as real establishments/foods
- **PERFORMANCE VALIDATED**: Processing times measured with real data volumes (not simulated), memory usage tracked, throughput documented
- **SOURCE ATTRIBUTION**: Mentions table contains actual Reddit URLs linking back to original posts/comments
- **CROSS-SERVICE INTEGRATION**: All services successfully processed real data without failures
- **DATABASE PERSISTENCE**: Data successfully committed to database with proper foreign key relationships
- **ERROR HANDLING PROVEN**: Real-world error scenarios encountered and handled gracefully during actual data processing
- **SCALABILITY DEMONSTRATED**: System successfully processed hundreds of real items within performance targets
**⚠️ MINOR INTEGRATION ISSUES**
- Most E2E scenarios work but minor performance issues exist
- Some integration edge cases need handling improvements
- Monitoring or logging needs enhancement
- Issues are non-blocking but affect system quality
**❌ MAJOR INTEGRATION ISSUES**
- **DATABASE TABLES EMPTY**: Entities, connections, or mentions tables have <10 records after processing
- **NO REAL DATA PROCESSED**: Pushshift archives not downloaded/processed OR Reddit API not called with real data
- **LLM NOT EXECUTED**: No actual Reddit content processed through LLM service OR simulated responses used
- **PIPELINE FAILURES**: Raw data failed to flow through complete pipeline to database storage
- **NO RESTAURANT/DISH DATA**: Database contains no recognizable restaurant names or dish names
- **PROCESSING SIMULATION**: Testing only validated connectivity/mocks rather than actual data processing
- **PERFORMANCE FAILURES**: System unable to process minimum data volumes within time requirements
- **DATA INTEGRITY ISSUES**: Foreign key relationships broken, data corruption, or attribution lost
- **SERVICE INTEGRATION FAILURES**: Cross-service data flow broken under real load conditions

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
1. **Environment Setup & Real Data Configuration**: Database cleared, services started, real API keys configured, actual data sources identified
2. **Actual Data Processing Execution**: Specific files downloaded, exact API calls made, actual Reddit content processed, LLM responses received, database records created
3. **Database Population Results**: SQL query results showing actual record counts in all tables, sample entity names extracted, performance metrics measured
4. **End-to-End Data Flow Validation**: Specific Reddit posts traced through complete pipeline, source attribution verified, data integrity confirmed
5. **Issues, Resolutions & Insights**: Real-world processing failures encountered, memory/performance bottlenecks discovered, data quality issues resolved
6. **Evidence of Production Readiness**: Concrete database population, verified restaurant/dish names, measured processing performance, demonstrated scalability
