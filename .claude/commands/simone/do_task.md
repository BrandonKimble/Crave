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
- Read ALL PRD sections referenced in task AND parent sprint/milestone
  - **CRITICAL:** When reading each PRD section, read ALL subsections within it (e.g., for section 4, read 4.1, 4.2, 4.3, etc. and ALL sub-subsections like 4.1.1, 4.1.2, 4.2.1, etc.)
- Read PRD sections 9 and 10 for roadmap context and scope boundaries
  - **CRITICAL:** Read ALL subsections within sections 9 and 10 completely
- Verify task dependencies are met and belongs to current sprint/milestone scope

## 2 · Validate task scope against PRD boundaries

**Critical scope validation:**
- Verify task implements ONLY requirements from referenced PRD sections
- Check task belongs in current milestone phase per PRD roadmap (sections 9-10)
- Identify what is NOT included (future milestone features, optimizations beyond PRD)
- If task references functionality from future milestones, pause for clarification

- Find current timestamp (YYYY-MM-DD HH:MM)
- Update task frontmatter: **status: in_progress** and timestamp
- Update `.simone/00_PROJECT_MANIFEST.md` with task progress

## 3 · Execute PRD-scoped implementation with infrastructure integration

**Phase 1: Infrastructure Analysis & Integration**

**CRITICAL**: Before implementing ANY new code, perform comprehensive infrastructure integration:

**Existing Infrastructure Discovery:**
- **Comprehensively search codebase** for ALL existing infrastructure, tools, and capabilities
- **Core Infrastructure**: Repository patterns, service layers, validation systems, DTOs, custom exceptions, database utilities
- **Frontend Infrastructure**: UI components, styling systems, navigation patterns, state management, hooks, contexts
- **External Integrations**: API clients, authentication flows, middleware, health checks, monitoring, caching systems
- **Development Infrastructure**: Testing utilities, configuration management, build processes, deployment tools, scripts
- **Domain-Specific Tools**: Any specialized utilities, helpers, or services unique to this project
- **Third-Party Integrations**: External service wrappers, SDK implementations, specialized libraries
- **Automation & Tooling**: Custom scripts, generators, validators, formatters, or workflow tools
- **Performance & Optimization**: Caching layers, optimization utilities, performance monitoring tools
- **Security Infrastructure**: Authentication helpers, authorization middleware, security utilities
- **Data Processing**: Transformation utilities, parsing tools, serialization helpers, batch processing systems
- **Communication**: Event systems, notification services, messaging utilities, webhook handlers

**Integration Strategy:**
- **Discover First, Create Last**: Always exhaustively search for existing solutions before building new
- **Extend vs Create**: Prefer extending/enhancing existing infrastructure over creating duplicate functionality
- **Pattern Consistency**: Follow ALL established architectural patterns throughout codebase
- **Maximum Reuse**: Leverage any and all existing utilities, components, services, and tools
- **Infrastructure Enhancement**: Look for opportunities to improve existing infrastructure during implementation

**Phase 2: PRD-Scoped Implementation**

- Follow task Description, Goals, and Acceptance Criteria exactly as specified
- Implement ONLY requirements from referenced PRD sections (no scope expansion)
- **PROACTIVE INSTALLATION**: Install required or beneficial dependencies/tools aligned with implementation goals
- Leverage discovered infrastructure to minimize code duplication and maintain consistency

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

**Execute code review using optimized process:**

- Use `/simone:code_review` with Task ID as scope  
- Follow automated linting, type-checking, and quality validation
- Review infrastructure integration and pattern consistency

**Handle review results:**
- **FAIL**: Add identified issues as subtasks, return to implementation phase
- **PASS**: Proceed to task finalization

## 5 · Finalize task completion

- Set task status to **completed**
- Rename task file to TX[TASK_ID]... format for completed recognition
- Update `.simone/00_PROJECT_MANIFEST.md` with completion status

## 6 · Report results

**Report format:**

```markdown
✅ **Task T## Completed**: [Task_Name]

**PRD Compliance**: ✅ Implementation within [PRD sections] scope
**Infrastructure Integration**: ✅ Leveraged existing [patterns/utilities/components]
**Scope Boundaries**: Maintained - no features beyond PRD requirements

**Work Completed**: [brief summary]
**Integration Points**: [existing infrastructure leveraged]

**Next Steps**: 
- Commit changes: `/simone:commit T##`
- Clear context before next task
```
