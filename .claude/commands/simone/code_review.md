# PRD-Aligned Code Review with Infrastructure Validation

Reviews code changes against PRD requirements, architectural patterns, and infrastructure integration.

## Create a TODO with EXACTLY these 5 Items

1. Analyze scope and identify code changes
2. Run automated quality checks
3. Validate against PRD requirements and infrastructure patterns  
4. Assess integration quality and consistency
5. Provide PASS/FAIL verdict with actionable feedback

Follow step by step and adhere closely to the following instructions for each step.

## DETAILS on every TODO item

## 1 · Analyze scope and identify code changes

**Parse scope and context:**
- Check <$ARGUMENTS> for task ID or read `.simone/00_PROJECT_MANIFEST.md` for current task/sprint/milestone context
- Find task file in `.simone/03_SPRINTS/` or `.simone/04_GENERAL_TASKS/`
- Read task PRD references and requirements

**Identify code changes:**
- Use `git diff HEAD~1` or specified scope to find changes
- Focus on changes relevant to task scope and requirements

## 2 · Run automated quality checks

**Detect and execute project quality tools:**

**JavaScript/TypeScript projects:**
- Check `package.json` scripts for "lint", "type-check", "format"
- Run ESLint if `.eslintrc*` exists
- Run TypeScript check if `tsconfig.json` exists (`tsc --noEmit`)
- Check Prettier formatting if configured

**Other language support:**
- Python: `ruff`, `black`, `mypy`, `flake8` based on configs
- Rust: `cargo fmt --check`, `cargo clippy`  
- Go: `go fmt`, `go vet`

**Execute and categorize issues:**
- Run detected tools and capture output
- Apply auto-fixes for formatting (safe changes only)
- Flag critical issues: type errors, syntax errors, security issues
- **CRITICAL SCOPE PRINCIPLE**: If errors appear in shared packages, dependencies, or related files that prevent task completion, they MUST be fixed regardless of whether they were "caused" by current task - the goal is working, production-ready code

## 3 · Validate against PRD requirements and infrastructure patterns

**Load comprehensive requirements context:**
- Read task file for PRD references and acceptance criteria
- Read ALL referenced PRD sections for implementation requirements
  - **CRITICAL:** When reading each PRD section, read ALL subsections within it (e.g., for section 4, read 4.1, 4.2, 4.3, etc. and ALL sub-subsections like 4.1.1, 4.1.2, 4.2.1, etc.)
- Read parent sprint and milestone meta files for scope boundaries
- Read PRD sections 9-10 for roadmap validation
  - **CRITICAL:** Read ALL subsections within sections 9 and 10 completely

**Validate implementation compliance:**
- **Data models/schemas**: Fields, types, constraints, relationships match PRD
- **APIs/interfaces**: Endpoints, params, responses align with PRD specifications
- **Behavior**: Business rules, error handling follow PRD requirements
- **Scope boundaries**: No features beyond current milestone's PRD sections

**CRITICAL**: Zero tolerance for deviations from PRD specifications

## 4 · Assess integration quality and consistency

**Infrastructure integration validation:**
- **Pattern consistency**: Code follows established architectural patterns
- **Existing infrastructure usage**: Leverages existing utilities, services, components
- **Code reuse**: Minimizes duplication by extending existing functionality
- **Integration quality**: New code properly integrates with existing systems

**Technical quality assessment:**
- **Code organization**: Follows project structure and naming conventions
- **Error handling**: Uses established error handling patterns
- **Testing**: Includes appropriate test coverage
- **Dependencies**: Uses existing dependencies vs adding unnecessary new ones

**Real data validation:**
- **Production-like testing**: Implementation tested with realistic data sources, file sizes, and conditions
- **Edge case discovery**: Real-world scenarios exposed and properly handled
- **Performance validation**: Code performs adequately under realistic load and data conditions
- **Environmental assumptions**: Implementation doesn't rely on synthetic or overly simplified test conditions

## 5 · Provide PASS/FAIL verdict with actionable feedback

**Decision criteria:**
- **FAIL**: Any deviation from PRD requirements, critical quality issues, poor infrastructure integration, OR any errors that prevent the task from being production-ready (including errors in shared code, dependencies, or related files)
- **PASS**: Full compliance with PRD requirements, good infrastructure integration, AND all code compiles/runs without errors in production-like conditions

**CRITICAL SCOPE CLARIFICATION**: 
- Fix ALL issues that prevent production readiness, even if they appear in files outside the primary task scope
- The boundary is "production-ready completion" not "only files I directly modified"
- Shared package errors, dependency issues, and related file problems MUST be resolved for PASS verdict

**Rate all issues (1-10 severity scale):**
- 8-10: Critical (PRD deviations, type errors, security issues)  
- 5-7: Major (pattern violations, poor integration, missing tests)
- 1-4: Minor (style issues, optimization opportunities)

**Output to task file:**
- Append results to task's **Output Log** with timestamp:

```
[YYYY-MM-DD HH:MM]: Code Review - PASS/FAIL
**Result**: PASS/FAIL decision
**PRD Compliance**: Adherence to referenced PRD sections
**Infrastructure Integration**: Quality of integration with existing codebase  
**Critical Issues**: [List severity 8-10 issues]
**Major Issues**: [List severity 5-7 issues]
**Recommendations**: Next steps for resolution
```

**Console summary**: Brief result for immediate feedback
