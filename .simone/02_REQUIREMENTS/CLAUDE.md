# CLAUDE.md - Requirements Folder Structure Guide

## Overview

This folder contains all project milestones and their associated requirements documentation. Each milestone represents a major project phase or feature set.

## Milestone Naming Convention

**CRITICAL**: Milestone folders MUST follow this exact pattern:

```
M##_Milestone_Name/
```

- `M##` - Two-digit milestone number (M01, M02, etc.)
- `_` - Single underscore separator
- `Milestone_Name` - Descriptive name using underscores for spaces

### Examples:

- ✅ `M01_Backend_Setup/`
- ✅ `M02_Frontend_UI/`
- ✅ `M03_Authentication_System/`
- ❌ `M1_Backend/` (missing leading zero)
- ❌ `M01-Backend-Setup/` (wrong separator)
- ❌ `Backend_Setup/` (missing M## prefix)

## Milestone Structure

Each milestone folder MUST contain:

### 1. Milestone Meta File (REQUIRED)

- **Name**: `M##_milestone_meta.md`
- **Purpose**: Contains milestone metadata and overview
- **Location**: Root of milestone folder

### 2. End-to-End Testing Status (REQUIRED for Active Milestones)

- **Name**: `M##_E2E_Testing_Status.md`
- **Purpose**: Track real data integration testing and milestone-level production readiness
- **Template**: Use `.simone/99_TEMPLATES/milestone_e2e_testing_template.md`
- **Focus**: Seamless integration testing with REAL DATA across all implemented services

## Example Structure

```
02_REQUIREMENTS/
├── M01_Database_Foundation_Basic_Setup/
│   ├── M01_milestone_meta.md
│   └── M01_E2E_Testing_Status.md (if active/testing)
├── M02_Entity_Processing_Core_External_Integrations/
│   ├── M02_milestone_meta.md
│   └── M02_E2E_Testing_Status.md (if active/testing)
└── M03_Hybrid_Data_Collection_Implementation/
    ├── M03_milestone_meta.md
    └── M03_E2E_Testing_Status.md (active milestone)
```

## Important Notes for Claude Code

1. **Always use the M## prefix** when creating milestone folders
2. **Use underscores** for spaces in milestone names
3. **Create the milestone meta file first** using the template from `99_TEMPLATES/milestone_meta_template.md`
4. **Create E2E testing status file** for active milestones using `99_TEMPLATES/milestone_e2e_testing_template.md`
5. **Update the project manifest** (`00_PROJECT_MANIFEST.md`) when creating new milestones
6. **Maintain sequential numbering** - don't skip milestone numbers

## Common Mistakes to Avoid

- Creating milestones without the M## prefix
- Using hyphens instead of underscores
- Forgetting the milestone meta file or E2E testing status file
- Not updating the project manifest
- Creating milestones in the wrong location (must be in 02_REQUIREMENTS)
