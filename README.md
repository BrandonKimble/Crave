# Crave Search

Evidence-based food discovery powered by community knowledge.

## Project Structure

This is a Turborepo monorepo containing:

- `apps/api`: NestJS backend with PostgreSQL and Prisma
- `apps/mobile`: React Native mobile app with Expo
- `packages/shared`: Shared TypeScript types and utilities

## Quick Start

```bash
# 1. Clone and install
git clone <repository-url>
yarn install

# 2. Start services (PostgreSQL + Redis)
make docker-up

# 3. Setup databases and run migrations
make db-migrate
yarn workspace api db:seed

# 4. Start development servers
yarn dev
```

## Prerequisites

- **Node.js 18+**
- **Yarn 1.22+** (package manager)
- **Docker and Docker Compose** (for PostgreSQL and Redis)

### Installation

```bash
# Install Node.js (if not already installed)
# Via nvm (recommended):
nvm install 18
nvm use 18

# Enable Yarn (via Corepack)
corepack enable
corepack prepare yarn@1.22.22 --activate

# Verify versions
node --version  # Should be v18+
yarn --version  # Should be v1.22+
docker --version # Should be v20+
```

## Environment Setup

### 1. Environment Variables

Copy and configure environment files:

```bash
# API environment
cp apps/api/.env.example apps/api/.env

# Mobile environment (if running mobile app)
cp apps/mobile/.env.example apps/mobile/.env
```

Identity & billing now rely on external providers. Populate the following keys in the respective `.env` files before running auth-guarded endpoints:

```
# apps/api/.env
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_DEFAULT_PRICE_ID=price_...
REVENUECAT_API_KEY=rc_...
REVENUECAT_WEBHOOK_SECRET=rc_webhook_secret

# apps/mobile/.env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Ask your platform admin (or create the accounts yourself) for the Clerk publishable/secret keys, a Stripe test secret + webhook signing secret, and the RevenueCat API/webhook tokens. Without them, the new identity and billing endpoints will return 401/503 errors.

### 2. Database Configuration

The API uses PostgreSQL with Prisma ORM. Default development configuration:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crave_search_test"
```

### 3. Start Development Services

```bash
# Start PostgreSQL and Redis containers
make docker-up

# Verify services are running
docker ps  # Should show postgres and redis containers
```

### 4. Database Setup

```bash
# Run database migrations
make db-migrate

# Seed with sample data
yarn workspace api db:seed

# Open database browser (optional)
make db-studio
```

## Development Commands

### Essential Commands

```bash
# Start all apps (API + Mobile)
yarn dev

# Start individual apps
yarn workspace api start:dev                # Backend only
yarn workspace @crave-search/mobile dev     # Mobile only

# Database operations
make db-migrate                # Run migrations
make db-studio                 # Open Prisma Studio
yarn workspace api db:seed     # Seed sample data

# Services
make docker-up                 # Start PostgreSQL + Redis
make docker-down               # Stop services
```

### Quality Checks

```bash
# Run tests
yarn test                      # All tests
yarn workspace api test        # API tests only

# Code quality
yarn lint                      # ESLint
yarn type-check                # TypeScript check
yarn format                    # Prettier formatting

# Build
yarn build                     # Build all apps
```

## Project Architecture

### Backend (apps/api)

- **Framework**: NestJS with Fastify
- **Database**: PostgreSQL 15 with Prisma ORM
- **Architecture**: Modular monolith with domain-driven design
- **Testing**: Jest with integration and unit tests
- **Documentation**: Swagger/OpenAPI at `/api/docs`

### Database Schema

Core tables:

- `entities`: Unified storage for restaurants, food, categories, attributes
- `connections`: Relationships between restaurants and food with quality scores
- `mentions`: Reddit community evidence with attribution

### Mobile (apps/mobile)

- **Framework**: React Native with Expo
- **Navigation**: React Navigation
- **State**: Zustand for global state
- **Styling**: Nativewind (Tailwind for React Native)

## Troubleshooting

### Database Issues

**Problem**: `Database connection failed`

```bash
# Check if Docker services are running
docker ps

# Restart services if needed
make docker-down && make docker-up

# Verify database exists
docker exec -it $(docker ps -q -f name=postgres) psql -U postgres -l
```

**Problem**: `Migration failed` or schema drift

```bash
# Reset database (WARNING: destroys all data)
yarn workspace api db:migrate:reset --force

# Or apply migrations manually
yarn workspace api prisma:migrate
```

**Problem**: `Permission denied` on database

```bash
# Check environment variables
cat apps/api/.env | grep DATABASE_URL

# Verify Docker container permissions
docker logs $(docker ps -q -f name=postgres)
```

### Installation Issues

**Problem**: `yarn command not found`

```bash
corepack enable
corepack prepare yarn@1.22.22 --activate
```

**Problem**: `Docker not available`

```bash
# Install Docker Desktop or Docker Engine
# macOS: https://docs.docker.com/desktop/mac/
# Linux: https://docs.docker.com/engine/install/
```

**Problem**: Node.js version issues

```bash
# Use nvm to manage Node versions
nvm install 18
nvm use 18
```

### Build/Runtime Issues

**Problem**: `Port already in use`

```bash
# Change port in apps/api/.env
PORT=3001

# Or kill process using port
lsof -ti:3000 | xargs kill -9
```

**Problem**: `Module not found` errors

```bash
# Reinstall dependencies
rm -rf node_modules **/node_modules
yarn install
```

### Testing Issues

**Problem**: Tests failing due to database

```bash
# Ensure test database exists
createdb crave_search_test

# Reset test database
yarn workspace api db:migrate:reset --force
```

## Production Deployment

**Note**: Production deployment is planned for later milestones (M02+). Current setup is optimized for local development.

For production considerations, see:

- `apps/api/README.md` - API deployment notes
- `CLAUDE.md` - Architecture documentation

## API Documentation

When the API is running locally:

- **Swagger UI**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/health

## Getting Help

- Check `CLAUDE.md` for architecture details
- Review `apps/api/README.md` for API-specific setup
- See troubleshooting section above for common issues
- Ensure all prerequisites are installed and services are running
