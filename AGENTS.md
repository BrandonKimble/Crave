# Frontend Runtime Refactor Guidance

Use this file as thin guidance, not ritual.

## Objective

Ship the frontend runtime refactor slice-by-slice while preserving current UX behavior.

## Core Principles

- Cleanup-first: leave touched modules simpler; prefer deletion/replacement over additive layering.
- One owner per concern: avoid long-lived dual control paths.
- Delete gate is real: when a cluster is promoted to owned, remove its legacy writer path in that same promotion.
- Root-cause fixes over patch stacking.
- Preserve UX parity unless behavior change is explicitly approved.

## Source of Truth (Read First)

1. `/Users/brandonkimble/crave-search/plans/shortcut-submit-architecture-refactor-plan.md`
2. `/Users/brandonkimble/crave-search/plans/autonomy-playbook.md`
3. `/Users/brandonkimble/crave-search/plans/shortcut-submit-investigation-log.md` (evidence memory only)

## Default Execution Behavior

- Work one slice/cluster at a time.
- Before starting a new slice, review the previous slice against plan exit + delete gates.
- If deviations exist, fix and re-validate before moving on.
- Continue autonomously until the active slice is promotable.
- Stop only for true blockers requiring user action.

## Validation (Contextual, Not Blanket)

Always run:
- relevant lint/tests for touched files
- `bash /Users/brandonkimble/crave-search/scripts/no-bypass-search-runtime.sh`

Run when relevant:
- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-natural-cutover-contract.sh`
- `bash /Users/brandonkimble/crave-search/scripts/search-runtime-s4-mode-cutover-contract.sh`
- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh promote-slice <SLICE_ID>`

Refresh baseline only if harness signature / settle-boundary policy changed:
- `bash /Users/brandonkimble/crave-search/scripts/perf-shortcut-local-ci.sh record-baseline`

## Repo Quick Guide

- `apps/api`: NestJS + Prisma
- `apps/mobile`: Expo React Native app
- `packages/shared`: shared TypeScript utilities
- Monorepo: Yarn workspaces + Turbo

Common commands:
- `yarn install`
- `yarn dev`
- `yarn workspace @crave-search/mobile dev`
- `yarn lint`
- `yarn test`
