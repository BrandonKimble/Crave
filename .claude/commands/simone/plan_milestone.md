# Plan and Create New Milestone - Execute from Top to Bottom

Creates a new milestone with proper structure, documentation, and project integration based on comprehensive PRD analysis and project state.

## Create a TODO with EXACTLY these 6 items

1. Analyze project context and PRD roadmap comprehensively
2. Define milestone scope from PRD requirements
3. Create milestone directory and meta file with PRD mapping
4. Update project manifest with milestone
5. Validate milestone alignment with PRD roadmap
6. Report milestone creation

---

## 1 · Analyze project context and PRD roadmap comprehensively

**CRITICAL:** You are given additional Arguments: <$ARGUMENTS>

**Read and analyze systematically in single context:**

- Parse arguments for suggested milestone ID/focus (defaults to next sequential milestone)
- Read `.simone/00_PROJECT_MANIFEST.md` for current project state and milestone progression
- Read `PRD.md` sections 9 and 10 completely to understand full roadmap structure and dependencies
  - **CRITICAL:** Read ALL subsections within sections 9 and 10 (e.g., 9.1, 9.2, 9.3, etc. and 10.1, 10.2, etc.)
- Scan `.simone/02_REQUIREMENTS/` to identify existing milestones and numbering
- Read existing milestone meta files to understand implemented vs remaining PRD requirements
- **CRITICAL:** Map completed milestones to their PRD sections from PROJECT_MANIFEST

## 2 · Define milestone scope from PRD requirements

**PRD-driven milestone identification and definition:**

- Identify next unimplemented PRD milestone in sections 9/10 sequence based on completed work
- Read all PRD sections referenced by target milestone AND all related/tangentially relevant sections for comprehensive context
  - **CRITICAL:** When reading each PRD section, read ALL subsections within it (e.g., for section 4, read 4.1, 4.2, 4.3, etc. and ALL sub-subsections like 4.1.1, 4.1.2, 4.2.1, etc.)
- Extract specific deliverables, success criteria, and dependencies from PRD
- Determine milestone number (M##) by scanning existing milestones
- Derive milestone name from PRD section title (convert to snake_case format: `M##_Milestone_Name`)
- Set scope boundaries: what IS included (from target PRD sections) and what is NOT (future sections)
- Validate no critical dependencies are skipped

**PRD roadmap enforcement:**
- Ensure milestone aligns with PRD sequence and dependencies
- Check scope is appropriate for milestone phase (basic setup vs features vs optimization)
- Verify deliverables match PRD requirements exactly - no scope expansion

**Present proposal:**
```
Based on PRD roadmap analysis:
- M##: [Name from PRD section]
- Implements: PRD sections [X.X, Y.Y]
- Deliverables: [extracted from PRD]
- Success criteria: [from PRD]

Proceed? (Y/n)
```

## 3 · Create milestone directory and meta file with PRD mapping

**Create and populate milestone structure:**

- Create directory: `.simone/02_REQUIREMENTS/M##_Milestone_Name/`
- Use template from `.simone/99_TEMPLATES/milestone_meta_template.md`
- Fill YAML frontmatter: milestone_id, title, status (pending), prd_sections (from analysis), timestamp
- Populate from PRD analysis:
  - **Goals and Key Deliverables**: Extract from target PRD sections and all related sections read
  - **Key Documents**: Link to implemented PRD sections
  - **Definition of Done**: Copy success criteria from PRD sections exactly
  - **Scope Boundaries**: List PRD features/sections NOT in this milestone
  - **Notes/Context**: Dependencies and prerequisites from PRD

## 4 · Update project manifest with milestone

**Update `.simone/00_PROJECT_MANIFEST.md`:**

- Add milestone to appropriate section with status and PRD section links
- Update project metadata: current_milestone, highest_milestone, last_updated
- Preserve all existing content and formatting

## 5 · Validate milestone alignment with PRD roadmap

**Critical validation checks:**

- Milestone scope matches PRD requirements exactly (no scope expansion)
- Definition of Done is specific and measurable from PRD success criteria
- Milestone dependencies align with PRD sequence
- Scope is appropriate for milestone phase (foundation vs features vs optimization)
- All created files follow template structure and naming conventions

## 6 · Report milestone creation

**Report format:**

```markdown
✅ **Milestone M## Created**: [Milestone_Name]

**PRD Implementation**: Sections [X, Y]
**Status**: Planning
**Key Deliverables**: [from PRD analysis]
**DoD**: [PRD success criteria]

**Files Created**:
- `02_REQUIREMENTS/M##_[Name]/M##_milestone_meta.md`

**Next Steps**:
- Break down into sprints: `/project:simone:create_sprints_from_milestone M##`
```
