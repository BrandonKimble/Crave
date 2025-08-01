# Real Data Pipeline Validation

**UNCOMPROMISING MANDATE**: Process ACTUAL Reddit data through complete pipeline with unrelenting effort and focus, fix EVERY issue encountered, continue until production-ready. No mocks, no shortcuts.

## Create TODO with these 5 items:

1. Load comprehensive project context (PRD + completed tasks)
2. Systematically understand current system architecture and requirements
3. Process real Reddit data through complete pipeline with systematic diagnosis
4. Fix all issues encountered during processing with understanding-first approach
5. Update milestone E2E status with validation results

## 1 · Load comprehensive project context (PRD + completed tasks)

**Read PRD and all subsections systematically in this order:**

**Core System Understanding:**
1. **Read PRD Section 1**: Project Overview and Architecture
2. **Read PRD Section 2**: Data Sources and Collection Methods  
3. **Read PRD Section 3**: Content Processing Pipeline
4. **Read PRD Section 4**: Entity Resolution and Database Design
5. **Read PRD Section 5**: LLM Integration and Content Analysis

**System Requirements and Processing Criteria:**
6. **Read PRD Section 6**: Quality Standards and Validation Rules
7. **Read PRD Section 7**: Performance and Scale Requirements
8. **Read PRD Section 8**: Integration Points and Dependencies

**Scope and Context:**
9. **Read PRD Section 9**: Roadmap and Milestone Boundaries
10. **Read PRD Section 10**: Current Phase Scope and Limitations

**Read completed task context:**
- **Search and read all completed tasks** (TX## files) across all milestones
- Extract: Implementation patterns, architectural decisions, infrastructure discoveries, lessons learned
- Identify: What's already built, what works, current system state, processing requirements

## 2 · Systematically understand current system architecture and requirements

**CRITICAL**: Before testing, understand the system's design criteria:

**Infrastructure Analysis:**
- **Map existing services**: Reddit API, LLM service, Entity Resolution, Database layers
- **Understand data flow**: API response structures, transformation requirements, processing criteria
- **Identify system requirements**: LLM content criteria (sentiment, entity clarity), API authentication, rate limits

**Processing Requirements Discovery:**
- **LLM Processing Criteria**: What content types/sentiment levels meet processing thresholds
- **Data Transformation Rules**: How Reddit API responses need to be structured/flattened
- **Entity Resolution Logic**: Exact/alias/fuzzy matching requirements and scoring
- **Database Constraints**: Required fields, relationship validation, quality thresholds

## 3 · Process real Reddit data through complete pipeline with systematic diagnosis

**SYSTEMATIC TESTING APPROACH:**

**Component Interaction Testing:**
- Clear database tables, start all services with real API keys
- **Test complete data flow end-to-end**, not just individual services
- Fetch 100+ Reddit posts/comments from food subreddits using live Reddit API
- **Verify data transformation** at each pipeline stage (API → processing → storage)
- Process actual content through LLM service to extract restaurant/dish entities
- Execute entity resolution and store results in database
- **Report every error, fix, and breakthrough immediately**

**Content Selection Strategy:**
- **Use content that meets system specifications**: positive sentiment, clear food entities
- Test with Reddit comments (typically contain more sentiment) vs posts
- Verify content meets LLM processing criteria before assuming LLM is broken

**MINIMUM SUCCESS CRITERIA:**
- Database populated: 25+ restaurants, 50+ dishes, 100+ attributes, 75+ connections, 200+ mentions
- Pipeline processes real Reddit discussions about food without failures
- Actual restaurant names (like "Franklin BBQ") and dish names visible in database
- **All services working together seamlessly**, not just individually

## 4 · Fix all issues encountered during processing with understanding-first approach

**SYSTEMATIC DIAGNOSIS FIRST:**
- **Debug each pipeline component individually** when issues found
- **UNDERSTAND BEFORE FIXING**: Distinguish between "broken components" vs "working components with unmet criteria"
  - Verify data transformation requirements (API response structures, nested data handling)
  - Understand processing criteria (LLM content requirements, sentiment thresholds)
  - Test with content that meets system specifications before assuming code is broken
- **Component vs Integration Issues**: Test individual services, then test service interactions

**RELENTLESS DEBUGGING:**
- Fix dependency injection errors, API authentication issues, data transformation problems
- Fix parsing failures, database constraints, rate limiting issues
- **NO EXCEPTIONS**: Fix issues in any service, shared package, or dependency that blocks real data flow
- Continue debugging until complete pipeline works with real data

**CRITICAL**: After each fix, re-test the complete pipeline to ensure changes work end-to-end

## 5 · Update milestone E2E status with validation results

**Update** current milestone's `M##_E2E_Testing_Status.md` file with:
- **What was actually processed**: Specific Reddit content, API calls made, database records created
- **Issues found and fixed**: Every error encountered and how it was resolved
- **Production readiness verdict**: ✅ PRODUCTION READY / ❌ MAJOR ISSUES based on actual database population

**PRODUCTION READY** = Database populated with real food entities from actual Reddit discussions + pipeline processes 100+ items without failures