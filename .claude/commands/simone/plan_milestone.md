# Plan and Create New Milestone - Execute from Top to Bottom

Creates a new milestone with proper structure, documentation, and project integration based on PRD analysis and project state, with optional user refinement.

## Create a TODO with EXACTLY these 8 items

1. Parse arguments and analyze project context
2. Analyze PRD for next logical milestone
3. Define milestone scope based on PRD sections
4. Present proposal and handle user confirmation
5. Create milestone directory and meta file
6. Update project manifest with milestone
7. Validate milestone coherence and alignment
8. Report milestone creation and next steps

---

## 1 · Parse arguments and analyze project context

**CRITICAL:** You are given additional Arguments: <$ARGUMENTS>

**USE PARALLEL SUBAGENTS** to do these tasks:

- Parse arguments for suggested milestone name/focus (defaults to interactive creation)
- Read `.simone/00_PROJECT_MANIFEST.md` to understand current project state
- Scan `.simone/02_REQUIREMENTS/` to identify existing milestones and numbering
- Read `.simone/01_PROJECT_DOCS/ARCHITECTURE.md` to understand project scope
- Check latest project review in `.simone/10_STATE_OF_PROJECT/` for current status
- **IMPORTANT:** Understand project phase and what logical next milestone should be

## 2 · Analyze PRD for next logical milestone

**Automatic PRD-based milestone identification:**

1. MAP completed milestones to their `PRD sections from PROJECT_MANIFEST
2. READ the PRD overview (section 1) and both roadmap sections (9 and 10) completely
3. IDENTIFY next unimplemented or partially implemented PRD milestone in sequence
4. READ all PRD sections that are referenced by or prerequisite to the target PRDmilestone as well as any other relevant or tangentially related sections to understand dependencies, prerequisites, and scope
5. ANALYZE section dependencies and prerequisites
6. CALCULATE scope (estimated effort, complexity, deliverables count)
7. DETERMINE if this milestone should be split (>1 week = split into smaller milestones)

**Generate milestone proposal from PRD:**

- Target section(s): [X.X, Y.Y.Y, etc.] from PRD
- Suggested name: Derived from PRD section titles
- Key deliverables: Extracted from PRD requirements
- Success criteria: From PRD "Success Criteria" or "Definition of Done"
- Dependencies: Prerequisites identified from PRD

**If arguments provided specific PRD sections:**

- Validate those sections against current project state
- Ensure no critical dependencies are being skipped

**If no arguments provided:**

- Select next logical PRD section(s) based on:
  - Dependencies (what must come first)
  - Current project momentum
  - Technical prerequisites

## 3 · Define milestone scope based on PRD sections

**PRD-driven milestone definition:**

- Determine next milestone number (M##) by scanning existing milestones
- Read all PRD sections that are referenced by or prerequisite to the target milestone as well as any other relevant or tangentially related sections to extract specific deliverables and requirements
- Copy success criteria directly from PRD requirements
- Set scope boundaries based on what's NOT in selected sections
- Derive milestone name from relevant PRD context (convert to snake_case)
- Format: `M##_Milestone_Name_Snake_Case`

**Present PRD-based proposal to user:**

```
Based on PRD analysis, next milestone should be:
- M##: [Milestone Name]
- Implements: PRD sections X.X-Y.Y
- Main deliverables: [extracted from PRD]
- Definition of Done: [from PRD success criteria]

Proceed with this milestone? (Y/n)
```

**If user accepts:** Continue to step 5
**If user requests changes:** Move to step 4

## 4 · Present proposal and handle user confirmation

**Handle user response:**

If user accepts (Y or yes):

- Proceed directly to step 5 with PRD-extracted values

If user requests changes:

- **Scope adjustment**: "Which PRD sections should we include/exclude?"
- **Naming refinement**: "Suggested alternative name?"
- **Timeline**: "Split into multiple milestones?"
- Apply minimal changes and proceed to step 5

**Keep interaction minimal** - PRD should drive 90% of decisions

## 5 · Create milestone directory and meta file

**Create milestone structure:**

- Create directory: `.simone/02_REQUIREMENTS/M##_Milestone_Name/`
- Copy template from `.simone/99_TEMPLATES/milestone_meta_template.md`
- Create milestone meta file: `M##_milestone_meta.md`

**Populate milestone meta file from PRD:**

- Fill in YAML frontmatter:
  - `milestone_id: M##`
  - `title: [Milestone Name]`
  - `status: pending`
  - `prd_sections: [X.X, Y.Y.Y, etc.]` (from analysis below)
  - `last_updated: [current timestamp YYYY-MM-DD HH:MM]`
- Auto-populate sections from PRD:
  - **Goals and Key Deliverables**: READ all PRD sections that are referenced by or prerequisite to the target milestone as well as any other relevant or tangentially related sections to populate goals anddeliverables for the meta file as well as fill in the `prd_sections` field in the meta file YAML frontmatter
  - **Key Documents**: Auto-link to PRD sections being implemented
  - **Definition of Done**: Copy success criteria from PRD sections
  - **Scope Boundaries**: List next PRD sections (NOT in this milestone)
  - **Notes/Context**: Dependencies or prerequisites from PRD analysis

## 6 · Update project manifest with milestone

**UPDATE** `.simone/00_PROJECT_MANIFEST.md`:

- Add milestone to milestones section:
  - Format: `- [ ] M##: [Milestone Name] - Status: Planning`
  - Link: `[M##](02_REQUIREMENTS/M##_Milestone_Name/M##_milestone_meta.md)`
- Update project metadata:
  - Set `current_milestone` if this is the active milestone
  - Update `highest_milestone` number
  - Update `last_updated` timestamp
- **IMPORTANT:** Preserve all existing content and formatting

## 7 · Validate milestone coherence and alignment

**VERIFY** milestone quality:

- Check milestone aligns with project architecture and vision
- Ensure Definition of Done is specific and measurable
- Validate milestone scope is appropriate (not too broad/narrow)
- Confirm milestone advances project toward stated goals
- Check milestone numbering and naming follows conventions
- Verify all created files follow template structure
- **CRITICAL:** Milestone should be independently valuable and achievable

**THINK ABOUT**:

- Does this milestone make sense given the current project state?
- **Is the scope manageable?** Large PRD sections should typically be split into smaller milestones
- Are the goals realistic and well-scoped?
- Is the Definition of Done clear enough to know when it's complete?
- Does this milestone set up future milestones logically?

## 8 · Report milestone creation and next steps

**OUTPUT FORMAT**:

```markdown
✅ **Milestone Created**: M##\_[Milestone_Name]

📋 **Milestone Details**:

- ID: M##
- Title: [Milestone Name]
- Status: Planning
- PRD Sections: [X.X, Y.Y.Y, etc.]
- Focus: [One-line summary of main goal]

📚 **Created Documents**:

- Milestone meta: `02_REQUIREMENTS/M##_[Name]/M##_milestone_meta.md`
- [Any additional documents created]

🎯 **Definition of Done**:

- [Key DoD criteria from milestone]

📈 **Project Impact**:

- Updates project from M[previous] to M##
- Advances toward: [project vision alignment]

⏭️ **Recommended Next Steps**:

- Review milestone details: `02_REQUIREMENTS/M##_[Name]/M##_milestone_meta.md`
- Create supporting documentation as planned
- Break down into sprints: `/project:simone:create_sprints_from_milestone M##`
- Update with specific requirements as they become clear

🎯 **Ready for Development**: Use `/project:simone:create_sprints_from_milestone M##` when ready to start implementation planning
```

**IMPORTANT NOTES**:

- Keep milestone scope focused and achievable
- Definition of Done should be measurable
- Supporting documents can be created as needed
- Milestone planning is iterative - refine as you learn more
