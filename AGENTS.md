# Repository Guidelines

## Project Structure & Module Organization
- `apps/api`: NestJS service with Prisma. Tests in `apps/api/src/**/*.spec.ts` and e2e in `apps/api/test/`.
- `apps/mobile`: Expo React Native app. Source in `apps/mobile/src/`.
- `packages/shared`: Reusable TypeScript utilities published locally.
- Supporting folders: `scripts/`, `data/`, `logs/`.
- Monorepo uses `pnpm` workspaces and `turbo` for task orchestration.

## Build, Test, and Development Commands
- Install: `pnpm install` (or `make setup`).
- Dev (all): `pnpm dev` runs workspace `dev` via Turbo.
- API only: `pnpm -C apps/api start:dev`. Mobile only: `pnpm -C apps/mobile dev`.
- Build: `pnpm build`. Lint: `pnpm lint`. Type check: `pnpm type-check`. Format: `pnpm format`.
- Tests: `pnpm test` (workspace). API: `pnpm -C apps/api test`, coverage: `test:cov`, e2e: `test:e2e`.
- Database (API): start deps `make docker-up`, migrate `pnpm -C apps/api db:migrate`, studio `pnpm -C apps/api prisma:studio`.

## Coding Style & Naming Conventions
- TypeScript, 2‑space indent, single quotes, semicolons; enforced by Prettier (`.prettierrc`) and ESLint (`.eslintrc.js`).
- Naming: files kebab‑case; types/interfaces `PascalCase`; variables/functions `camelCase`; React components `PascalCase`.
- Keep modules small and colocate tests near code in API (`*.spec.ts`).

## Testing Guidelines
- API uses Jest with unit/integration and e2e. Run e2e after `make docker-up` and migrations.
- Mobile uses `jest-expo` (add tests as `*.test.tsx` under `apps/mobile`).
- Prefer fast unit tests; mark integration with clear names and keep deterministic.

## Commit & Pull Request Guidelines
- Conventional Commits style recommended: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Keep subject ≤ 72 chars.
- Pre-commit hooks (Lefthook) run ESLint, Prettier, and `gitleaks` on staged files. Ensure `pnpm lint` and `pnpm test` pass locally.
- PRs: concise description, linked issues, steps to test; include screenshots for mobile UI changes. Reference affected packages (`apps/api`, `apps/mobile`, `packages/shared`).

## Security & Configuration Tips
- Copy `.env.example` to `.env` per app; never commit secrets. Secrets scanning is enforced via `gitleaks`.
- Commit Prisma migrations in `apps/api/prisma/migrations/`. Use `docker-compose` in `apps/api/` for local DB.
