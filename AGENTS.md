# Frontend Runtime Refactor Guidance

Use this file as thin guidance, not ritual.

## Objective

Ship the frontend runtime refactor while preserving current UX behavior.

## Core Principles

- Cleanup-first: leave touched modules simpler; prefer deletion/replacement over additive layering.
- Delete gate is real: when a cluster is promoted to owned, remove its legacy writer path in that same promotion.
- Root-cause fixes over patch stacking.
- Preserve UX parity unless behavior change is explicitly approved.

## Default Execution Behavior

- Before starting a new slice, review the previous slice against plan exit + delete gates.
- If deviations exist, fix and re-validate before moving on.
- Continue autonomously until the active slice is promotable.
- Stop only for true blockers requiring user action.

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
