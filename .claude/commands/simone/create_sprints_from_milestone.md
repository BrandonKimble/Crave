# Plan Sprints from Milestone with PRD Scope Enforcement

Creates sprints that strictly adhere to milestone's PRD requirements without scope expansion.

## Create a TODO with EXACTLY these 6 items

1. Analyze milestone context and PRD requirements comprehensively
2. Identify remaining work within PRD scope boundaries
3. Design PRD-aligned sprint boundaries
4. Create sprint directories and meta files
5. Update PROJECT_MANIFEST with sprint roadmap
6. Report sprint plan with scope validation

---

## 1 · Analyze milestone context and PRD requirements comprehensively

**CRITICAL:** You are given additional Arguments: <$ARGUMENTS>

**Read and analyze in single context:**

- Parse arguments for milestone ID (defaults to current milestone from PROJECT_MANIFEST)
- Read milestone meta file from `.simone/02_REQUIREMENTS/$MILESTONE_ID/` including ALL PRD section references
- Read ALL PRD sections referenced in milestone meta AND sections 9 and 10 for roadmap context
  - **CRITICAL:** When reading each PRD section, read ALL subsections within it (e.g., for section 4, read 4.1, 4.2, 4.3, etc. and ALL sub-subsections like 4.1.1, 4.1.2, 4.2.1, etc.)
- Read `.simone/00_PROJECT_MANIFEST.md` for current progress and milestone status
- Scan existing sprints in `.simone/03_SPRINTS/` for target milestone and analyze completed work
- **CRITICAL:** Map milestone's PRD requirements to understand EXACT scope boundaries

## 2 · Identify remaining work within PRD scope boundaries

**PRD scope enforcement analysis:**

- Map milestone's Definition of Done against PRD success criteria to identify exact requirements
- Analyze completed sprints/tasks to determine what's genuinely complete vs remaining
- **CRITICAL SCOPE CHECK:** For each potential deliverable, verify it's explicitly required in milestone's PRD sections
- **ROADMAP VALIDATION:** Cross-check against PRD sections 9 and 10 to ensure deliverables belong in current milestone, not future ones
- Identify remaining deliverables that are ONLY those required for milestone DoD completion
- **REJECT any scope expansion:** Features, optimizations, or "nice-to-haves" not in PRD requirements

**Remaining work must be:**
- Explicitly mentioned in milestone's PRD sections
- Required for milestone DoD completion
- Appropriate for milestone phase (foundation vs features vs optimization per PRD)
- Not deferred to later milestones in PRD roadmap

## 3 · Design PRD-aligned sprint boundaries

**Design sprint structure for remaining PRD requirements only:**

- Group remaining deliverables into logical sprints (1-2 week completable chunks)
- Each sprint focuses on specific PRD requirements from milestone scope
- Sprint naming: `S<nn>_$milestone_id_$focus_slug`
- **PRD boundary enforcement:** No sprint includes work not in milestone's PRD sections
- **IMPORTANT:** Don't create sprints for completed work or future milestone features

## 4 · Create sprint directories and meta files

**For each planned sprint:**

- Create directory `.simone/03_SPRINTS/$FULL_SPRINT_NAME/`
- Use template from `.simone/99_TEMPLATES/sprint_meta_template.md`
- Fill sprint meta with PRD-driven content:
  - **PRD references**: Inherit ALL milestone's prd_sections PLUS any specific subsections this sprint focuses on
  - **Goal**: Clear objective aligned with PRD requirements
  - **Key deliverables**: Only items required by PRD for milestone DoD
  - **Definition of Done**: Specific to sprint's PRD scope
  - **Status**: "pending"

## 5 · Update PROJECT_MANIFEST with sprint roadmap

**Update `.simone/00_PROJECT_MANIFEST.md`:**

- Set `highest_sprint_in_milestone` to highest planned sprint number
- Update sprint summary with focus areas and PRD sections
- Mark completed sprints as ✅ and planned sprints with their scope
- Update `last_updated` timestamp

## 6 · Report sprint plan with scope validation

**Report format:**

```markdown
✅ **Sprint Plan for M##**: [Milestone_Name]

**PRD Scope Validation**: ✅ All sprints align with milestone PRD sections [X, Y]
**Sprints Created**: [count] (only for remaining PRD requirements)

**Sprint Roadmap**:
- **S##**: [Focus] - PRD sections [X] - Status: [pending/planned]
- **S##**: [Focus] - PRD sections [Y] - Status: [pending/planned]

**Scope Boundaries Enforced**:
- ❌ Excluded: [features deferred to later milestones per PRD]
- ✅ Included: [only milestone DoD requirements]

**Next Steps**:
- Create tasks: `/project:simone:create_sprint_tasks S##`
```

**CRITICAL VALIDATION COMPLETED**:
- All sprint deliverables are explicitly required in milestone's PRD sections
- No scope expansion beyond PRD requirements
- No features from future milestones included
- Sprint sequence completes milestone DoD exactly
