---
sprint_folder_name: S<SprintSequenceID>_M<MilestoneID>_<Short_Name>
sprint_sequence_id: S<ID>
milestone_id: M<ID>
prd_references: [] # Reference specific PRD sections (e.g., [9.1, 9.2.1])
title: Sprint Title - Focus of this Sprint
status: pending # pending | active | completed | aborted
goal: Clearly state the primary objective of this sprint.
last_updated: YYYY-MM-DDTHH:MM:SSZ
---

# Sprint: {{ title }} ({{ sprint_sequence_id }})

## Sprint Goal

**PRD-ALIGNED OBJECTIVE:** {{ goal }}

## Scope & Key Deliverables

**IMPLEMENTS PRD SECTIONS:** {{ prd_references }}

- [List specific deliverables required by referenced PRD sections]
- [Ensure all deliverables contribute to parent milestone DoD]
- [No features beyond PRD requirements]

## Definition of Done (for the Sprint)

**DERIVED FROM PRD SUCCESS CRITERIA:**

- [Map sprint completion to specific PRD success criteria]
- [Ensure sprint advances milestone toward PRD-defined success]
- [No acceptance criteria beyond PRD scope]

## Scope Boundaries

**ENFORCED FROM PRD ROADMAP:**

- **NOT included**: [Features from future milestones per PRD sections 9-10]
- **NOT included**: [Optimizations not required by PRD]
- **Boundary**: Tasks implement ONLY {{ prd_references }} requirements
