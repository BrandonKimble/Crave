---
milestone_id: M<ID>
title: Milestone Title
status: pending # pending | active | completed | blocked | on_hold
prd_sections: [] # Reference specific PRD sections (e.g., [9.1, 9.2.1])
last_updated: YYYY-MM-DD HH:MM
---

## Milestone: {{ title }}

### Goals and Key Deliverables

**EXTRACTED FROM PRD SECTIONS:** {{ prd_sections }}

- [List deliverables directly from PRD requirements]
- [Map each deliverable to specific PRD success criteria]
- [Ensure alignment with PRD milestone phase and dependencies]

### Key Documents

**PRD Requirements Source:**
- `PRD.md` sections: {{ prd_sections }} - Authoritative requirements for this milestone
- `PRD.md` sections 9 and 10 - Roadmap context and milestone boundaries

### Definition of Done (DoD)

**COPIED FROM PRD SUCCESS CRITERIA:**

- [Copy success criteria directly from referenced PRD sections]
- [Ensure measurable conditions aligned with PRD requirements]
- [No additional requirements beyond PRD scope]

### Scope Boundaries

**ENFORCED FROM PRD ROADMAP:**

- **NOT included**: [List features deferred to later PRD milestones - reference specific sections]
- **NOT included**: [Optimizations or enhancements beyond PRD requirements]
- **Boundary enforcement**: Tasks must implement ONLY requirements in {{ prd_sections }}

### Notes / Context

**PRD Alignment:** This milestone implements PRD sections {{ prd_sections }} and must not exceed scope defined in these sections. Reference PRD roadmap sections 9-10 for milestone phase appropriateness.
