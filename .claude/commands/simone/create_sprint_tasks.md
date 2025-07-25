# Create Tasks for Sprint - Execute top to bottom

Create detailed tasks for an existing sprint with integrated implementation guidance.

## Create a TODO with EXACTLY these 9 Items

1. Identify target sprint and verify it exists
2. Load sprint context and related documentation
3. Extract `PRD.md` requirements and technical constraints
4. Analyze sprint deliverables for task breakdown
5. Create individual task files with implementation guidance
6. Audit tasks against PRD roadmap for milestone alignment
7. Link `PRD.md` sections to relevant tasks
8. Update sprint meta with task references
9. Check quality of your work

Follow step by step and adhere closely to the following instructions for each step.

## DETAILS on every TODO item

### 1. Identify target sprint and verify it exists

Check: <$ARGUMENTS>

**REQUIRED:** Sprint ID must be provided (e.g., S02). If empty, ask user to specify which sprint to detail.

- VERIFY sprint directory exists in `.simone/03_SPRINTS/`
- CHECK sprint meta file exists (e.g., `S02_sprint_meta.md`)
- VERIFY sprint status is not already "completed"
- If tasks already exist, ask user if they want to recreate them or any other guidance

### 2. Load sprint context and related documentation

Use PARALLEL SUBAGENTS to READ and UNDERSTAND the project's context:

- READ `.simone/00_PROJECT_MANIFEST.md` for project context
- READ sprint meta file completely to understand goals and deliverables
- READ parent milestone requirements from `.simone/02_REQUIREMENTS/`
- READ `.simone/01_PROJECT_DOCS/ARCHITECTURE.md` for technical context and decisions

**IMPORTANT:** Sprint tasks must align with sprint goals and PRD requirements - no scope expansion.

### 3. Read PRD sections and extract technical guidance and constraints

**FIND referenced `PRD.md` sections:**

- CHECK sprint meta for `prd_references` field; if found, skip to rest of step 3 and before reading those PRD sections
- IF no sprint PRD references: Check parent milestone for `prd_sections` and READ those

**READ each `PRD.md` section to EXTRACT and document these elements:**

- Technical requirements and constraints that affect implementation
- Specific implementation requirements for each deliverable
- Performance targets or scalability requirements
- Success criteria that will validate task completion
- Dependencies or integration points mentioned in PRD

**CRITICAL:** PRD requirements define authoritative scope - tasks must implement these requirements precisely, no more, no less.

### 4. Analyze sprint deliverables for task breakdown

Based on sprint goals and deliverables:

- BREAK DOWN high-level deliverables into concrete, implementable tasks
- ENSURE each task represents a coherent feature or component
- CONSIDER logical dependencies between tasks
- MAP tasks to specific PRD requirements and success criteria
- DEFER complexity assessment until after tasks are fully created with subtasks

**SCOPE CONTROL:** Tasks implement PRD requirements precisely - avoid nice-to-haves, premature optimization, or scope expansion.

### 5. Create individual task files with implementation guidance

**NOW** For each identified Task spin up a Parallel Subagent with these Instructions:

    #### Create a TODO for EACH task

    1. Create basic task structure
    2. Research codebase interfaces
    3. Add technical guidance
    4. Validate task completeness

    ### 1. Create basic task structure

    - ALL TASK FILES must to be created in the Sprint Directory (where the sprint meta file is)
    - CREATE file with naming: `T<NN>_S<NN>_<Descriptive_Name>.md`
    - USE sequential numbering starting from T01
    - FOLLOW task template structure exactly from `.simone/99_TEMPLATES/task_template.md`
    - ADD basic description and objectives from sprint goals

    ### 2. Research codebase interfaces

    - EXAMINE existing codebase for similar patterns and interfaces
    - IDENTIFY specific classes, functions, and imports that will be needed
    - FIND integration points with existing modules
    - NOTE database models, API endpoints, or services to interface with
    - CHECK existing error handling and logging patterns

    ### 3. Add technical guidance

    Add these sections to the task file (add to template if not present):

    **Technical Guidance section:**

    - Key interfaces and integration points in the codebase
    - **PRD implementation notes**: Specific requirements from referenced PRD sections if applicable
    - Specific imports and module references
    - Existing patterns to follow
    - Database models or API contracts to work with
    - Error handling approach used in similar code

    **Implementation Notes section:**

    - Step-by-step implementation approach
    - Key architectural decisions to respect
    - Testing approach based on existing test patterns
    - Performance considerations if relevant
    - **MVP Focus**: What constitutes "good enough" for this task
    - **Out of Scope**: What NOT to implement (future optimizations, nice-to-haves)

    **IMPORTANT:**
    - Tasks should aim for the simplest working solution that meets PRD requirements.
    - Do NOT include code examples. Provide structural guidance and references only.

    #### 4. Validate task completeness

    - ENSURE task has clear implementation path
    - VERIFY all integration points are documented
    - CHECK that guidance references actual codebase elements
    - CONFIRM task is self-contained and actionable

    **REPEAT** `### 5. Create individual task files with implementation guidance` for every Task

### 6. Audit tasks against PRD roadmap for milestone alignment

**CRITICAL ROADMAP VERIFICATION:** Now that tasks are fully detailed, audit each task against the PRD roadmap to ensure proper milestone alignment.

**READ `PRD.md` roadmap section (section 9 and 10) to:**

- IDENTIFY what belongs in the current milestone vs later milestones
- UNDERSTAND the intended scope and dependencies for the current milestone
- CHECK the progression from basic setup to advanced features across milestones

**AUDIT EACH CREATED TASK:**

- **Milestone Alignment Check**: Does this task's scope belong in the current milestone according to the PRD roadmap?
- **Implementation Complexity**: Is this task appropriate for the current phase (foundation vs features vs optimization)?
- **Dependency Analysis**: Are the required prerequisites from earlier milestones actually complete?
- **Scope Appropriateness**: Is this foundational work or premature feature development?

**TASK AUDIT DECISIONS:**

- **Keep As-Is**: Tasks that properly belong in current milestone
- **Defer to Later Milestones**: Tasks to remove with target milestone identified
- **Reduce Scope**: Tasks that need simplified to fit current milestone (remove advanced features)
- **Merge Tasks**: Tasks that can be combined for better logical flow
- **Reorder Tasks**: Adjust sequence for proper dependencies

**IMPLEMENTATION:**

- **Remove tasks** that belong in later milestones (DELETE task files)
- **Reduce scope** of tasks that are partially appropriate (EDIT task files to remove advanced features)
- **Renumber tasks** sequentially (T01, T02, T03...) after removals
- **Update task IDs** in task file frontmatter and content to match new numbering
- **Update dependencies** between remaining tasks

### 7. Link `PRD.md` sections to relevant tasks

**PRD MAPPING FOR FINAL TASKS:** Now that tasks have been audited and finalized, link them to specific PRD requirements.

- FOR each remaining task:
  - IDENTIFY which PRD requirements it implements
  - ADD specific PRD section references to the task's PRD References section
  - ENSURE each reference includes the specific requirement being addressed
  - INCLUDE any other tangentially relevant PRD sections with task implications
  - MAP success criteria from PRD to task acceptance criteria
- VERIFY all PRD requirements for the sprint are covered by final tasks

### 8. Update sprint meta with task references

- EDIT sprint meta file to add/update task list
- ORGANIZE tasks by logical grouping or dependency order
- ADD brief description for each task
- **Include roadmap audit summary** showing what was deferred/modified

### 9. Check quality of your work

Review all created tasks for complexity and split any High complexity tasks:

**Complexity Assessment Process:**

- READ each task file completely including description, goals, acceptance criteria, and subtasks
- ASSESS complexity using your judgment about the overall scope and challenge
- DO NOT base complexity on simple metrics like file counts or estimated hours
- CONSIDER the conceptual difficulty, integration challenges, and unknowns
- MARK complexity as Low, Medium, or High in the task frontmatter

**If ANY task is marked as High complexity:**

- SPLIT the task into 2-3 smaller tasks of Low or Medium complexity
- CREATE new task files with proper sequential numbering
- UPDATE the original high-complexity task file or DELETE it
- ENSURE the split tasks together achieve the original goal
- MAINTAIN logical grouping and dependencies

**After all tasks are finalized:**

- VERIFY all tasks are Low or Medium complexity only
- CHECK task numbering is sequential (T01, T02, T03...)
- CONFIRM all remaining tasks passed roadmap audit in step 6
- UPDATE sprint meta file with final task list
- UPDATE project manifest sprint section to reflect actual tasks created
- GENERATE completion report

**Output format:**

    ```Markdown
    ## Sprint Detailed - [YYYY-MM-DD HH:MM]

    **Sprint:** [Sprint ID] - [Sprint Name]

    **Status:** Planning Complete

    **Tasks Created:** [final count after any splits]
    - Medium Complexity: [count]
    - Low Complexity: [count]

    **Task Splitting Summary:**
    - [Original T03 split into T03 and T04 due to scope]
    - [No other splits needed]

    **Roadmap Audit Summary:**
    - [Deferred X tasks to Milestone Y due to scope misalignment]
    - [Reduced scope on Y tasks to fit current milestone]
    - [Tasks properly aligned with milestone objectives]

    **Final Task List:**
    1. T01_S02 - [Title] (Complexity: [Level])
    2. T02_S02 - [Title] (Complexity: [Level])
    [Continue for all tasks]

    **Next Steps:**
    - Review tasks for completeness
    - Run `/do_task [FIRST_TASK_IN_SPRINT]` to begin implementation
    ```
