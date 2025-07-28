# Execute Simone Task with PRD Scope Enforcement

Implements task requirements strictly within PRD boundaries while maximizing integration with existing codebase infrastructure.

**CREATE A TODO LIST** with exactly these 6 items

1. Load task context and PRD requirements comprehensively
2. Validate task scope against PRD boundaries  
3. Execute PRD-scoped implementation with infrastructure integration
4. Perform comprehensive code review and validation
5. Finalize task completion
6. Report results

## 1 · Load task context and PRD requirements comprehensively

**Parse arguments and identify task:**
- <$ARGUMENTS> ⇒ Task ID, Sprint ID, or empty (select next open task in current sprint)
- Search `.simone/03_SPRINTS/` and `.simone/04_GENERAL_TASKS/` for target task
- If no open task matches, pause and ask user how to proceed

**Read and analyze in single context:**
- Read task file completely including description, goals, acceptance criteria, PRD references
- **CRITICAL PRD READING REQUIREMENTS:**
  - **IMPLEMENTS PRD REQUIREMENTS sections**: Read ALL PRD sections listed under "IMPLEMENTS PRD REQUIREMENTS" in the task
  - **BROADER CONTEXT sections**: Read ALL PRD sections listed under "BROADER CONTEXT" in the task 
  - **Complete Subsection Coverage**: For each section (e.g., section 4), read ALL subsections within it (4.1, 4.2, 4.3, etc.) and ALL sub-subsections (4.1.1, 4.1.2, 4.2.1, etc.)
- Read PRD sections 9 and 10 for roadmap context and scope boundaries
  - **CRITICAL:** Read ALL subsections within sections 9 and 10 completely
- Verify task dependencies are met and belongs to current sprint/milestone scope

## 2 · Validate task scope against PRD boundaries

**Critical scope validation:**
- Verify task implements ONLY requirements from referenced PRD sections
- Check task belongs in current milestone phase per PRD roadmap (sections 9-10)
- Identify what is NOT included (future milestone features, optimizations beyond PRD)
- If task references functionality from future milestones, pause for clarification

**Status Updates:**
- Find current timestamp (YYYY-MM-DD HH:MM:SS)
- Update task frontmatter: **status: active** and timestamp
- Check if this is first task in sprint:
  - If sprint status is "pending": Update sprint status to "active"
  - Update sprint meta file with current timestamp
- Update `.simone/00_PROJECT_MANIFEST.md` with task and sprint progress

## 3 · Execute PRD-scoped implementation with infrastructure integration

**Phase 1: Infrastructure Analysis & Integration**

**CRITICAL**: Before implementing ANY new code, perform comprehensive infrastructure integration:

**Existing Infrastructure Discovery:**
- **Systematic Codebase Analysis**: Use search tools (Grep, Glob, LS) to comprehensively map existing patterns, abstractions, and capabilities
- **Core Patterns**: Look for base classes, interfaces, abstract patterns, service layers, repository patterns, validation frameworks, error handling systems
- **Integration Layers**: Search for external service clients, API wrappers, authentication flows, middleware, health checks, caching abstractions
- **Development Utilities**: Find testing frameworks, configuration systems, build tools, environment management, deployment scripts
- **Domain Logic**: Identify business-specific services, utilities, helpers, processing pipelines, and domain models unique to the project
- **Quality & Monitoring**: Locate logging systems, metrics collection, performance monitoring, security utilities, audit trails
- **Data Management**: Discover database patterns, ORM abstractions, migration tools, backup systems, data transformation utilities
- **Communication Systems**: Find event systems, messaging patterns, notification services, webhook handlers, queue systems
- **Cross-Cutting Concerns**: Search for shared utilities, common helpers, constants, types, and reusable components across domains
- **Extension Points**: Identify plugin systems, configuration-driven behaviors, factory patterns, and other extensibility mechanisms
- **Dependencies & Libraries**: Examine package.json, requirements files, and import statements to map available libraries, frameworks, and tools already integrated
- **Project Standards & Infrastructure**: Locate documentation patterns, coding standards, CI/CD configurations, deployment infrastructure, and API design conventions

**Integration Strategy:**
- **Discover First, Create Last**: Always exhaustively search for existing solutions before building new
- **Extend vs Create**: Prefer extending/enhancing existing infrastructure over creating duplicate functionality
- **Pattern Consistency**: Follow ALL established architectural patterns throughout codebase
- **Maximum Reuse**: Leverage any and all existing utilities, components, services, and tools
- **Infrastructure Enhancement**: Look for opportunities to improve existing infrastructure during implementation

**Phase 2: Implementation Planning**

**CRITICAL**: After completing infrastructure discovery, create an implementation plan:
- **Re-read PRD sections** for comprehensive implementation context:
  - **IMPLEMENTS PRD REQUIREMENTS sections**: Re-read ALL sections listed under "IMPLEMENTS PRD REQUIREMENTS" 
  - **BROADER CONTEXT sections**: Re-read ALL sections listed under "BROADER CONTEXT" for full context and constraints
  - **Complete Subsection Coverage**: For each section, read ALL subsections and sub-subsections completely
  - Look for implementation nuances, constraints, integration requirements, and technical specifications
- Synthesize infrastructure findings with task requirements
- Map existing capabilities to task subtasks
- Identify what can be extended vs changed or enhanced vs what needs to be created new
- Plan integration points and dependencies
- Design a thoughtful implementation approach considering maintainability, extensibility, and user experience
- Plan elegant solutions that anticipate future needs while solving current requirements
- Consider implementation sequencing that enables safe iteration and early validation
- Design comprehensive validation strategy that builds confidence in each component
- Anticipate potential challenges and design resilient solutions from the start
- Plan implementation in meaningful increments that deliver value and enable feedback
- Use ExitPlanMode tool to present plan and get approval before proceeding

**Phase 3: PRD-Scoped Implementation**

- Follow task Description, Goals, and Acceptance Criteria exactly as specified
- Implement ONLY requirements from referenced PRD sections (no scope expansion)
- **PROACTIVE INSTALLATION**: Install required or beneficial dependencies/tools aligned with implementation goals
- Leverage discovered infrastructure to minimize code duplication and maintain consistency
- **PRD GUIDANCE**: When encountering implementation nuances, edge cases, or technical decisions, search through PRD subsections for additional guidance and specifications

**Subtask Execution:**
1. Pick next incomplete subtask
2. Implement using existing infrastructure wherever possible
3. Verify implementation stays within PRD scope boundaries  
4. Mark subtask complete
5. Log progress: `[YYYY-MM-DD HH:MM]: <message>` in **Output Log**
6. Repeat until all subtasks complete

**Critical Boundaries:**
- No features beyond current milestone's PRD requirements
- No optimizations not explicitly required by PRD
- Simplify implementation if it exceeds PRD scope

## 4 · Perform comprehensive code review and validation

**ITERATIVE CODE REVIEW LOOP - Continue until PASS**

**MANDATORY LOOP - NO SHORTCUTS ALLOWED**

Follow these steps for a Code Review (in order):

1. **Run Code Review**: include @.claude/commands/simone/code_review.md and use the Task ID as Scope
2. **Evaluate Result**:
   - On **PASS**: Move to step 5 (Finalize task completion)
   - On **FAIL**: Continue to step 3 below

3. **Fix Issues and Re-validate** (FAIL path):
   - Thoroughly understand all identified problems
   - Extend current task with identified issues as subtasks
   - Return to step "3 · Execute PRD-scoped implementation with infrastructure integration"
   - **CRITICAL STEP**: After completing fixes, **MUST** return to step 1 of this section to re-run code review
   - **Continue this loop until code review PASSES**

**LOOP REQUIREMENTS (NON-NEGOTIABLE)**:
- **Never proceed to step 5 without a PASS result**
- **Always re-run code review after fixing issues**
- **Track iterations in task Output Log with timestamps**
- **Each iteration should show measurable progress toward resolution**

**MEMORY AID**: After fixing issues, ask yourself: "Have I re-run the code review yet?" If no, go back to step 1.

## 5 · Finalize task completion

**Task Completion:**
- Set task status to **completed**
- Update task `last_updated` timestamp
- Rename task file to TX[TASK_ID]... format for completed recognition

**Sprint & Milestone Status Updates (CRITICAL):**
- Check if ALL tasks in current sprint are complete:
  - If YES: Update sprint status to "completed" in sprint meta file
  - Update sprint `last_updated` timestamp
- Check if ALL sprints in milestone are complete:
  - If YES: Update milestone status to "completed" in milestone meta file
  - Update milestone `last_updated` timestamp
  
**Project Manifest Updates (CRITICAL):**
- Update `.simone/00_PROJECT_MANIFEST.md` with task completion status
- Update manifest `last_updated` timestamp in frontmatter
- If milestone complete: Update `current_milestone_id` to next milestone if available

## 6 · Report results

**Report format:**

```markdown
✅ **Task T## Completed**: [Task_Name]

**PRD Compliance**: ✅ Implementation within [PRD sections] scope
**Infrastructure Integration**: ✅ Leveraged existing [patterns/utilities/components]
**Scope Boundaries**: Maintained - no features beyond PRD requirements

**Work Completed**: [brief summary]
**Integration Points**: [existing infrastructure leveraged]

**Project Status Updates**: 
✅ Task status set to completed
✅ Task file renamed to TX## format
[✅/❌] Sprint S## status updated to "completed" (if all tasks complete)
[✅/❌] Milestone M## status updated to "completed" (if all sprints complete)
✅ Project manifest updated with completion status

**Next Steps**: 
- Commit changes: `/simone:commit T##`
- Clear context before next task
```
