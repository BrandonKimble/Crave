# MUST READ FIRST (EVERY SESSION START)

## Cleanup-First Policy (Top Priority)

- Leave modules simpler than you found them: organize while you touch code, and prefer subtraction/replacement over accumulation.
- Default to one ideal path; remove legacy/duplicate/fallback branches when they are not explicitly required.
- Proactively spot dead or unused code and remove it; if uncertain, call it out and propose removal instead of keeping silent bloat.
- Keep fallbacks rare and temporary: only when required, behavior-matching, and documented with a clear removal trigger.

This file is intentionally front-loaded because Codex loads the repo-root `AGENTS.md` as session context.

## Frontend Refactor Continuity (Read Before Coding)

When working on frontend runtime implementation, always reload context in this order:

1. `/Users/brandonkimble/crave-search/plans/shortcut-submit-architecture-refactor-plan.md` (execution source of truth)
2. `/Users/brandonkimble/crave-search/plans/autonomy-playbook.md` (how to execute safely)
3. `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md` (historical evidence and rejected paths)
4. `/Users/brandonkimble/crave-search/plans/agent-log.md` (append task entry before edits)

Rules:

- Treat `plans/shortcut-submit-architecture-refactor-plan.md` as the canonical implementation contract.
- Treat `plans/shortcut-submit-investigation-log.md` as evidence memory only; do not run old probe loops by default.
- Preserve UX contract unless a behavior change is explicitly approved.
- This continuity section is orientation, not ritual: skip any step that cannot change a decision, risk, or promotion outcome.
- Do not re-run rejected perf candidates unless new evidence justifies it.

## Lean Execution Cycle (Refactor Default)

Use this cycle for each slice/cluster:

1. Define a 5-line slice card before coding:
   - cluster,
   - target owner,
   - delete gate,
   - validation required,
   - rollback trigger.
2. Run one focused implementation burst (single cluster only; avoid multi-cluster drift).
3. Run quick validations (lint/tests/no-bypass/contract checks).
4. Run local perf gate only when runtime-critical paths changed (submit/map/list/hydration/gesture lanes).
5. Promote only with explicit evidence; otherwise iterate the same cluster.

Judgment override:
- This is the default cycle, not a hard ritual checklist.
- If a step cannot produce new signal for the active cluster, skip it and note the skip reason in one line.
- If two cycles in a row produce no new decision signal, stop looping and switch to redesign/root-cause reframing.

Status updates should stay compact:
- `Now:` what is currently being changed.
- `Evidence:` pass/fail signal from checks.
- `Next:` immediate next action.

## Execution Latch (When Requested)

If the user explicitly requests strict no-checkpoint autonomy, treat it as a persistent latch for that thread and declared mode:

- `implementation mode` (default): execute checkpoint-to-checkpoint autonomously and report only on milestone/blocker/update-request.
- `investigation mode` (optional): run repeated perf loops with threshold stop condition.

Common rules:
- do not treat context compaction/reload as latch reset,
- stop/update only when threshold/milestone is achieved, blocker requires user action, or user asks for an update.

## Shared-Checkout Workflow (Multi-Session Friendly)

We frequently run multiple Codex chat sessions in parallel on the same repo. Treat the working tree as a shared space.

- Default to editing files directly in the current checkout (no `git worktree` requirement).
- Assume any existing staged/unstaged changes were made by another session and are intentional.
- Never delete, revert, “clean up”, or overwrite someone else’s changes just because they’re out of scope.
- Before editing any file:
  - Check `git status --porcelain` and identify which files are already modified.
  - If the file you need is already modified, inspect the diff and merge your change into the current state (preserve both).
- Minimize accidental clobbering:
  - Avoid large refactors/renames/reformatting unless explicitly requested.
  - Prefer additive changes over rewrites, especially in files already modified.
  - If you must touch the same area as an existing change, merge carefully; if intent is ambiguous, stop and ask.
- Git safety:
  - Do not run git commands that modify/revert history or the working tree (`git restore`, `git checkout`, `git reset`, `git clean`) unless explicitly asked.
  - Prefer read-only git commands (`git diff`, `git status`, `git log`, `git show`, `git blame`) to understand context.
- When done:
  - Re-check `git diff` and ensure only the intended files/lines changed.

## Coordination Plan (Required)

Goal: multiple Codex chat sessions can safely work in the same checkout without deleting/overwriting each other’s work.

One-time setup (developer machine):

- Run `bash scripts/install-agent-hooks.sh` (enables `.githooks/` and enforces the log at commit time).

For every task (every session):

1. Claim the work:
   - Append a bullet under `plans/agent-log.md` → `## Entries` describing your task + the files/areas you expect to touch.
2. Before editing each file:
   - Run `git status --porcelain` and inspect existing diffs for that file (assume they’re intentional from another session).
   - Merge your change into the current state; do not revert or delete others’ changes.
   - Update your log bullet if you start touching new files/areas.
3. When committing:
   - `plans/agent-log.md` must contain at least one bullet under `## Entries` (pre-commit hook enforces this).
   - After a successful commit, the log is automatically reset (post-commit hook).

## Principles (Leave It Better Than You Found It)

- Optimize for a better foundation, not patch-stacking: if the "obvious" change adds complexity because the underlying code is awkward, improve the underlying structure first.
- Broaden scope when it directly improves the current outcome: refactor/rename/reorganize when it makes the solution cleaner, more maintainable, or simpler to extend (and reduces net code).
- Fix root causes over symptoms: prefer deleting/avoiding code via a better design to adding more conditionals, flags, or "just in case" glue.
- Make small, continuous improvements: whenever touching a module, leave it measurably clearer (naming, boundaries, tests, ergonomics, performance) without introducing unrelated churn.
- Keep changes intentional: avoid "drive-by" rewrites that don't help the task; if a larger cleanup is warranted, explain why and keep it contained to what unblocks or improves the work.

# Repo Quick Guide

## Structure

- `apps/api`: NestJS + Prisma (tests: `apps/api/src/**/*.spec.ts`, e2e: `apps/api/test/`)
- `apps/mobile`: Expo React Native app (source: `apps/mobile/src/`)
- `packages/shared`: shared TypeScript utilities
- Monorepo: Yarn workspaces + Turbo

## Commands

- Install: `yarn install`
- Dev (all): `yarn dev`
- API dev: `yarn workspace api start:dev`
- Mobile dev: `yarn workspace @crave-search/mobile dev`
- Lint: `yarn lint` (API: `yarn workspace api lint`)
- Tests: `yarn test` (API: `yarn workspace api test`)
- Perf baseline (local): `bash ./scripts/perf-shortcut-local-ci.sh record-baseline`
- Perf gate (local): `bash ./scripts/perf-shortcut-local-ci.sh gate`

## Style

- Prettier/ESLint enforced: 2-space indent, single quotes, semicolons; filenames kebab-case; React components PascalCase

## API Notes

- API changes: finish with `yarn workspace api lint`
- API local Postgres: use credentials in `apps/api/.env` (default `postgres:postgres@localhost:5432/crave_search`), e.g. `psql -h localhost -U postgres -d crave_search -c "SELECT migration_name FROM _prisma_migrations;"`
- `psql` may require escalated permissions in Codex CLI; always request them when issuing DB queries
- Never commit secrets; if adding env vars, update `apps/api/.env` unless told otherwise
