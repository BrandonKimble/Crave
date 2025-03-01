# Crave Search App

Evidence-based food discovery powered by community knowledge.

## Project Structure

This is a monorepo containing:
- `apps/api`: NestJS backend
- `apps/mobile`: React Native mobile app
- `packages/shared`: Shared types and utilities

## Getting Started

### Prerequisites
- Node.js 18+
- PNPM 8+
- Docker and Docker Compose

### Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Start development services: `make docker-up`
4. Initialize database: `make db-migrate`
5. Start the development servers: `pnpm dev`

### Environment Variables

Copy the example environment files for each project:
- `apps/api/.env.example` → `apps/api/.env`
- `apps/mobile/.env.example` → `apps/mobile/.env`

## Development

- Run backend only: `pnpm --filter @crave-search/api dev`
- Run mobile only: `pnpm --filter @crave-search/mobile dev`
- Run everything: `pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`

## Database

- View database: `make db-studio`
- Run migrations: `make db-migrate`

## Docker

- Start containers: `make docker-up`
- Stop containers: `make docker-down`

## Documentation

- API documentation is available at `http://localhost:3000/api/docs` when the backend is running
