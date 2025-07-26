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
pnpm install

# 2. Start services (PostgreSQL + Redis)
make docker-up

# 3. Setup databases and run migrations  
make db-migrate
pnpm --filter api db:seed

# 4. Start development servers
pnpm dev
```

## Prerequisites

- **Node.js 18+** 
- **PNPM 8+** (package manager)
- **Docker and Docker Compose** (for PostgreSQL and Redis)

### Installation

```bash
# Install Node.js (if not already installed)
# Via nvm (recommended):
nvm install 18
nvm use 18

# Install pnpm
npm install -g pnpm

# Verify versions
node --version  # Should be v18+
pnpm --version  # Should be v8+
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
pnpm --filter api db:seed

# Open database browser (optional)
make db-studio
```

## Development Commands

### Essential Commands

```bash
# Start all apps (API + Mobile)
pnpm dev

# Start individual apps
pnpm --filter api dev          # Backend only
pnpm --filter mobile dev       # Mobile only

# Database operations
make db-migrate                # Run migrations
make db-studio                 # Open Prisma Studio
pnpm --filter api db:seed      # Seed sample data

# Services
make docker-up                 # Start PostgreSQL + Redis
make docker-down               # Stop services
```

### Quality Checks

```bash
# Run tests
pnpm test                      # All tests
pnpm --filter api test         # API tests only

# Code quality
pnpm lint                      # ESLint
pnpm type-check               # TypeScript check
pnpm format                   # Prettier formatting

# Build
pnpm build                    # Build all apps
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
- `entities`: Unified storage for restaurants, dishes, categories, attributes
- `connections`: Relationships between restaurants and dishes with quality scores
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
pnpm --filter api db:migrate:reset --force

# Or apply migrations manually
pnpm --filter api prisma:migrate
```

**Problem**: `Permission denied` on database
```bash
# Check environment variables
cat apps/api/.env | grep DATABASE_URL

# Verify Docker container permissions
docker logs $(docker ps -q -f name=postgres)
```

### Installation Issues

**Problem**: `pnpm command not found`
```bash
npm install -g pnpm
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
pnpm install
```

### Testing Issues

**Problem**: Tests failing due to database
```bash
# Ensure test database exists
createdb crave_search_test

# Reset test database
pnpm --filter api db:migrate:reset --force
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
