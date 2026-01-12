# MUST READ FIRST (EVERY SESSION START)

This file is intentionally front-loaded because Codex loads the repo-root `AGENTS.md` as session context.

## Worktree-First Workflow (Non-Negotiable)

- If the task involves editing files, do the work inside a dedicated task `git worktree` (unless already in one).
- Default to a dedicated `git worktree` + branch per task (unless already in one):
  - Pick base branch (default: current branch)
  - Create branch: `ai/<task>-<yyyymmdd-hhmm>`
  - Create worktree: `mkdir -p ../.worktrees && git worktree add -b <branch> ../.worktrees/<task>-<yyyymmdd-hhmm> <base-branch>`
  - Implement only inside the worktree; commit there
  - Merge back only if the integration checkout is clean; stop on conflicts
- Do not run git commands that modify/revert the working tree (`git restore`, `git checkout`, `git reset`) unless the user explicitly asks.
- Prefer read-only git commands (`git diff`, `git status`, `git log`, `git show`, `git blame`) to inspect changes.

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

## Style

- Prettier/ESLint enforced: 2-space indent, single quotes, semicolons; filenames kebab-case; React components PascalCase

## API Notes

- API changes: finish with `yarn workspace api lint`
- API local Postgres: use credentials in `apps/api/.env` (default `postgres:postgres@localhost:5432/crave_search`), e.g. `psql -h localhost -U postgres -d crave_search -c "SELECT migration_name FROM _prisma_migrations;"`
- `psql` may require escalated permissions in Codex CLI; always request them when issuing DB queries
- Never commit secrets; if adding env vars, update `apps/api/.env` unless told otherwise
