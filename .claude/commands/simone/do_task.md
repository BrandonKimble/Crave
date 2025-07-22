# Process Simone Task based on $Argument

**IMPORTANT:** Follow from Top to Bottom - don't skip anything!

**CREATE A TODO LIST** with exactly these 8 items

1. Analyse scope from argument
2. Identify task file
3. Analyse the task
4. Set status to in_progress
5. Execute task work
6. Infrastructure Integration Check
7. Execute Code review
8. Finalize Task status

## 1 · Analyse scope from argument

<$ARGUMENTS> ⇒ Task ID, Sprint ID, or empty (select next open task in current sprint).

## 2 · Identify task file

Search .simone/03_SPRINTS/ and .simone/04_GENERAL_TASKS/.
If no open task matches, pause and ask the user how to proceed.

## 3 · Analyse the task

Read the task description. If anything is unclear, ask clarifying questions before continuing.

**CRITICAL CONTEXT VALIDATION:** Before executing any task spin up Parallel Subagents for these tasks:

1. **Sprint Context:** Confirm task belongs to current sprint scope
2. **Dependencies:** Check if any dependent tasks need to be completed first
3. **Requirements:** Read relevant requirements docs in `.simone/02_REQUIREMENTS/`
4. **Scope Verification:** Ensure task aligns with current sprint objectives

**IMPORTANT:** If task references functionality from future sprints or has unmet dependencies, pause and ask for clarification.

## 4 · Set status to in_progress

- Find out the current local timestamp (YYYY-MM-DD HH:MM).
- Update front-matter to **status: in_progress** and set Updated time.
- Update ./simone/00_PROJECT_MANIFEST.md to set task in progress, updated time and current Sprint Status.

## 5 · Execute task work

- Read `PRD.md` sections that are referenced by or prerequisite to the target PRD milestone as well as any other relevant or tangentially related section for implementation guidance, context, requirement details and constraints
- Follow Description, Goal and Acceptance Criteria
- Consult supporting docs in .simone/01_PROJECT_DOCS/ and .simone/02_REQUIREMENTS/
- **SCOPE DISCIPLINE**: Implement ONLY what's in the acceptance criteria - resist feature creep
- **PROACTIVE INSTALLATION POLICY:**: You should proactively install any helpful or required dependencies, tools, or services needed to complete tasks as long as they align with our overall implementation goals
- Iterate over subtasks:
  1. Pick the next incomplete subtask
  2. Implement the required changes, consulting the `PRD.md` and other docs as needed
  3. Verify implementation doesn't exceed specified scope
  4. Mark the subtask done
  5. Append a log entry to **## Output Log** using the format `[YYYY-MM-DD HH:MM]: <message>`
  6. Repeat until all subtasks are complete

## 6 · Infrastructure Integration Check

**CRITICAL:** Before moving to code review, perform an infrastructure integration audit:

**Parallel Subagent Task:** Launch a subagent to analyze existing infrastructure that could be leveraged:

1. **Identify Existing Infrastructure:**
   - Search for unused/underutilized services, repositories, validators, utilities
   - Look for "dead code" that's actually valuable infrastructure waiting to be integrated
   - Check for established patterns not being followed consistently

2. **Integration Opportunities:**
   - **Repository Pattern**: Are services using repositories or accessing Prisma directly?
   - **Validation Layer**: Are custom validators being used in DTOs?
   - **Error Handling**: Are custom exceptions being used consistently?
   - **Logging**: Is structured logging being used throughout?
   - **Monitoring**: Are metrics and health checks connected?

3. **Architecture Consistency:**
   - Are new features following established architectural patterns?
   - Is the new code properly integrated with existing infrastructure?
   - Are there opportunities to enhance existing infrastructure rather than bypass it?

4. **Technical Debt Assessment:**
   - What existing infrastructure needs updating to support new features?
   - Are there incomplete implementations that should be finished?
   - What "temporary" solutions have become permanent and need proper integration?

**ACTION REQUIRED:** If gaps are found, add integration subtasks to the current task before proceeding to code review and continue with the task.

**PHILOSOPHY:** Every task should leave the codebase more integrated and consistent, not just functionally complete.

## 7 · Execute Code Review

Follow these steps for a Code Review (in order)

- include @.claude/commands/simone/code_review.md and use the Task ID as Scope
- Follow the instructions in the file to run a code review in **PARALLEL SUBAGENTS**
- Note: This now includes automated linting and type-checking as part of the review process
- When done continue acting on the results accordingly
- Understand and think about the results
- on **FAIL**
  - thoroughly understand the problem
  - extend the Current Task with the Subtasks identified by the review
  - go back to "5 · Execute task work"
- on **PASS**
  - move on to next step

## 8 · Finalize task status

- set the Task status to **completed**
- Rename the Task file accordingly to enable proper Completed recognition from the filename (TX[TASK_ID]...)
- Update .simone/00_PROJECT_MANIFEST.md to reflect the new status
- **Report** the result to the user

  ✅ **Result**: Quick statement of success

  🔎 **Scope**: Identified task or reason none was processed

  💬 **Summary**: One-paragraph recap of what was done or why blocked

  ⏭️ **Next steps**: Recommended follow-up actions

- **Suggestions** for the User:

  - 🛠️ Use /project:simone:commit `TASK_ID` to commit the changes to git
  - 🧹 Use /clear to clear the context before starting the next Task
