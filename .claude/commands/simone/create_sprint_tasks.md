# Create PRD-Aligned Tasks for Sprint

Create tasks that strictly implement sprint's PRD requirements without scope expansion.

## Create a TODO with EXACTLY these 6 Items

1. Load sprint context and PRD requirements comprehensively
2. Extract exact PRD deliverables and constraints
3. Create PRD-scoped task files with roadmap validation
4. Audit tasks against PRD roadmap boundaries
5. Update sprint meta with task references
6. Validate task scope alignment

## 1 · Load sprint context and PRD requirements comprehensively

**CRITICAL:** You are given additional Arguments: <$ARGUMENTS>

**Read and analyze in single context:**

- Parse sprint ID from arguments (required, e.g., S02)
- Verify sprint directory exists in `.simone/03_SPRINTS/` and sprint meta file exists
- Read sprint meta file completely including prd_references and deliverables
- Read parent milestone meta from `.simone/02_REQUIREMENTS/` to understand milestone scope
- Read ALL PRD sections referenced in sprint meta AND parent milestone
- Read PRD sections 9 and 10 for roadmap context and milestone boundaries
- **CRITICAL:** Map sprint deliverables to specific PRD requirements for exact scope

## 2 · Extract exact PRD deliverables and constraints

**PRD requirement extraction:**

- Map each sprint deliverable to specific PRD requirements and success criteria
- Extract technical constraints, performance targets, and implementation requirements from PRD
- Identify integration points and dependencies mentioned in PRD sections
- **SCOPE BOUNDARY:** Document what is NOT required (future milestone features per PRD roadmap)
- **ROADMAP VALIDATION:** Verify all deliverables belong in current milestone phase per sections 9/10

**Critical scope enforcement:**
- Tasks implement ONLY what's required in sprint's PRD sections
- No optimization, features, or "nice-to-haves" beyond PRD requirements
- No features that belong in later milestones per PRD roadmap

## 3 · Create PRD-scoped task files with roadmap validation

**Break down sprint deliverables into implementable tasks:**

- Create concrete tasks for each sprint deliverable based on PRD requirements
- Map each task to specific PRD sections and success criteria
- Use naming: `T<NN>_S<NN>_<Descriptive_Name>.md` in sprint directory
- Follow task template structure from `.simone/99_TEMPLATES/task_template.md`

**For each task file, populate with PRD-driven content:**

- **Description**: Clear objective aligned with PRD requirements
- **Goal/Objectives**: Specific outcomes required by PRD
- **PRD References**: Link to exact PRD sections implemented by this task
- **Acceptance Criteria**: Derived from PRD success criteria
- **Subtasks**: Minimal steps to achieve PRD requirements
- **Scope boundaries**: Explicitly state what is NOT included (future milestone features)

**CRITICAL SCOPE VALIDATION:**
- Each task implements ONLY PRD requirements for current milestone
- No advanced features that belong in later milestones per PRD roadmap
- No optimization or "nice-to-haves" beyond PRD scope
- Tasks aim for simplest working solution meeting PRD requirements

## 4 · Audit tasks against PRD roadmap boundaries

**CRITICAL ROADMAP VERIFICATION:**

- Audit each created task against PRD roadmap to ensure milestone alignment
- **Milestone boundary check**: Verify task belongs in current milestone per PRD sections 9/10
- **Phase appropriateness**: Confirm task fits milestone phase (foundation vs features vs optimization)
- **Dependency validation**: Check prerequisites from earlier milestones are complete

**TASK AUDIT ACTIONS:**

- **Remove tasks** that belong in later milestones per PRD roadmap
- **Reduce scope** of tasks with features beyond current milestone requirements
- **Renumber tasks** sequentially (T01, T02, T03...) after any removals
- **Update PRD references** to ensure all remaining tasks map to specific PRD requirements

## 5 · Update sprint meta with task references

**Update sprint meta file:**

- Add final task list with PRD section mappings
- Include audit summary showing what was removed/deferred
- Update with task count and scope boundaries enforced

## 6 · Validate task scope alignment

**Final validation checks:**

- Verify all tasks are Low or Medium complexity (split High complexity tasks)
- Confirm task numbering is sequential (T01, T02, T03...)
- Validate all tasks passed PRD roadmap audit
- Ensure all tasks map to specific PRD requirements

**Report format:**

```markdown
✅ **Sprint S## Tasks Created**: [Sprint_Name]

**PRD Alignment**: ✅ All tasks implement only current milestone requirements
**Tasks Created**: [count] (Low: [X], Medium: [Y])

**Roadmap Audit Summary**:
- ❌ Deferred: [X] tasks to later milestones per PRD roadmap
- ✅ Included: [Y] tasks required for milestone DoD

**Task List**:
1. T01_S## - [Title] - PRD sections [X] (Complexity: [Level])
2. T02_S## - [Title] - PRD sections [Y] (Complexity: [Level])

**Scope Boundaries Enforced**:
- No advanced features from future milestones
- No optimization beyond PRD requirements
- Tasks achieve PRD success criteria with minimal viable implementation

**Next Steps**:
- Begin implementation: `/project:simone:do_task T01_S##`
```
