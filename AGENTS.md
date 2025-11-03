# Repository Guidelines

## Project Structure & Module Organization

- `apps/api`: NestJS service with Prisma. Tests in `apps/api/src/**/*.spec.ts` and e2e in `apps/api/test/`.
- `apps/mobile`: Expo React Native app. Source in `apps/mobile/src/`.
- `packages/shared`: Reusable TypeScript utilities published locally.
- Supporting folders: `scripts/`, `data/`, `logs/`.
- Monorepo uses Yarn workspaces and `turbo` for task orchestration.

## Build, Test, and Development Commands

- Install: `yarn install` (or `make setup`).
- Dev (all): `yarn dev` runs workspace `dev` via Turbo.
- API only: `yarn workspace api start:dev`. Mobile only: `yarn workspace @crave-search/mobile dev`.
- Build: `yarn build`. Lint: `yarn lint`. Type check: `yarn type-check`. Format: `yarn format`.
- Tests: `yarn test` (workspace). API: `yarn workspace api test`, coverage: `test:cov`, e2e: `test:e2e`.
- Database (API): start deps `make docker-up`, migrate `yarn workspace api db:migrate`, studio `yarn workspace api prisma:studio`.

## Coding Style & Naming Conventions

- TypeScript, 2‑space indent, single quotes, semicolons; enforced by Prettier (`.prettierrc`) and ESLint (`.eslintrc.js`).
- Naming: files kebab‑case; types/interfaces `PascalCase`; variables/functions `camelCase`; React components `PascalCase`.
- Keep modules small and colocate tests near code in API (`*.spec.ts`).

## Testing Guidelines

- API uses Jest with unit/integration and e2e. Run e2e after `make docker-up` and migrations.
- Mobile uses `jest-expo` (add tests as `*.test.tsx` under `apps/mobile`).
- Prefer fast unit tests; mark integration with clear names and keep deterministic.
- All API changes must finish with a clean `yarn workspace api lint` run so the `no-unsafe-*` checks stay at zero; re-run this lint task before committing any server-side TypeScript updates.

## Commit & Pull Request Guidelines

- Conventional Commits style recommended: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Keep subject ≤ 72 chars.
- Pre-commit hooks (Lefthook) run ESLint, Prettier, and `gitleaks` on staged files. Ensure `yarn lint` and `yarn test` pass locally.
- PRs: concise description, linked issues, steps to test; include screenshots for mobile UI changes. Reference affected packages (`apps/api`, `apps/mobile`, `packages/shared`).

## Security & Configuration Tips

- Copy `.env.example` to `.env` per app; never commit secrets. Secrets scanning is enforced via `gitleaks`.
- Commit Prisma migrations in `apps/api/prisma/migrations/`. Use `docker-compose` in `apps/api/` for local DB.
