---
milestone_id: M01
milestone_name: Database Foundation & Basic Setup
phase: Foundation
estimated_weeks: 2
status: in_progress
start_date: 2025-07-12
target_date: 2025-07-26
dependencies: []
success_criteria:
  - PostgreSQL + Prisma setup completed
  - Core entity model implemented
  - Basic NestJS structure established
  - Development tooling configured
---

# Milestone M01: Database Foundation & Basic Setup

## Overview

Establish the foundational database architecture and basic project setup for the Crave food discovery app. This milestone focuses on implementing the graph-based entity model that will support the app's core functionality of storing and querying dish-restaurant relationships with community evidence.

## Phase Context

**Phase 1: Foundation (Weeks 1-6)**
- M01: Database Foundation & Basic Setup ← **Current**
- M02: Entity Processing Core & External Integrations
- M03: Data Collection Implementation (Reddit API)

## Key Objectives

### 1. Database Architecture Implementation
- **Graph-Based Entity Model**: Unified entity storage with relationship tracking
- **Core Tables**: entities, connections, mentions, users
- **Quality Score Foundation**: Pre-computed ranking infrastructure
- **Performance Optimization**: Indexing strategy for fast queries

### 2. Development Environment Setup  
- **Local Development**: Docker compose for PostgreSQL + Redis
- **Monorepo Configuration**: Turborepo + pnpm workspaces
- **Code Quality**: ESLint, Prettier, Lefthook git hooks
- **CI/CD Pipeline**: GitHub Actions basic setup

### 3. Backend Foundation
- **NestJS Modular Monolith**: Domain-driven module structure
- **Database Integration**: Prisma ORM setup with type safety
- **Configuration Management**: Environment-based config system
- **Logging Infrastructure**: Winston structured logging

## Success Criteria

### ✅ Database Setup
- [ ] PostgreSQL 15 running locally via Docker
- [ ] Prisma schema defining core entity model
- [ ] Database migrations working correctly
- [ ] Prisma Studio accessible for data exploration

### ✅ Core Entity Model
- [ ] `entities` table with proper enum types
- [ ] `connections` table for entity relationships
- [ ] `mentions` table for Reddit community evidence
- [ ] `users` table for authentication foundation

### ✅ Backend Infrastructure
- [ ] NestJS app with Fastify adapter
- [ ] Modular structure for 5 core domains
- [ ] Prisma service configured and injectable
- [ ] Basic health check endpoints

### ✅ Development Tooling
- [ ] Turborepo build pipeline working
- [ ] ESLint + Prettier configured across monorepo
- [ ] Lefthook git hooks preventing bad commits
- [ ] Basic GitHub Actions workflow

### ✅ Documentation & Setup
- [ ] README updated with setup instructions
- [ ] Environment variable documentation
- [ ] Database schema documentation
- [ ] Development workflow guide

## Technical Requirements

### Database Schema Requirements

**entities table:**
```sql
- id: UUID (primary key)
- entity_type: ENUM (restaurant, dish_or_category, dish_attribute, restaurant_attribute)  
- name: VARCHAR (canonical name)
- search_terms: TEXT[] (alternative names/synonyms)
- metadata: JSONB (type-specific data)
- quality_score: FLOAT (computed ranking)
- location_data: JSONB (for restaurants)
- created_at, updated_at: TIMESTAMP
```

**connections table:**
```sql
- id: UUID (primary key)
- from_entity_id: UUID (FK to entities)
- to_entity_id: UUID (FK to entities)
- connection_type: ENUM (serves, has_attribute, category_of)
- quality_score: FLOAT (relationship strength)
- metadata: JSONB (connection-specific data)
- created_at, updated_at: TIMESTAMP
```

**mentions table:**
```sql
- id: UUID (primary key)
- reddit_post_id: VARCHAR (Reddit reference)
- content: TEXT (relevant excerpt)
- upvotes: INTEGER (community validation)
- attribution_url: VARCHAR (Reddit permalink)
- entities: UUID[] (referenced entity IDs)
- sentiment_score: FLOAT (positive/negative)
- created_at: TIMESTAMP (Reddit post date)
```

### Performance Requirements
- **Database Queries**: <50ms for simple entity lookups
- **Development Setup**: <10 minutes from clone to running
- **Build Times**: <30 seconds for incremental builds
- **Memory Usage**: <2GB RAM for full development stack

## Dependencies & Integrations

### External Dependencies
- **PostgreSQL 15**: Primary database
- **Redis 7**: Caching and job queues
- **Docker**: Local development environment

### Internal Dependencies
- **None**: This is the foundation milestone

### Blocked By
- **None**: Can start immediately

### Blocks
- **M02**: Entity Processing Core (needs database schema)
- **M03**: Data Collection (needs mention storage)

## Risk Assessment

### High Risk
- **Database Design Complexity**: Graph model requires careful planning
  - *Mitigation*: Start with simplified schema, iterate based on usage patterns

### Medium Risk  
- **Prisma Learning Curve**: Team familiarity with ORM patterns
  - *Mitigation*: Comprehensive documentation, code examples

### Low Risk
- **Docker Setup**: Well-established tooling
- **NestJS Configuration**: Framework maturity

## Deliverables

### Code Deliverables
1. **Database Schema**: Complete Prisma schema with migrations
2. **NestJS Foundation**: Modular app structure with health checks
3. **Development Scripts**: Setup, build, test, and development commands
4. **Docker Configuration**: Local development environment

### Documentation Deliverables
1. **Setup Guide**: Comprehensive development environment setup
2. **Schema Documentation**: Entity model explanation and examples
3. **Development Workflow**: Git, testing, and deployment processes
4. **Architecture Decision Records**: Key technical decisions documented

## Sprint Breakdown

### Sprint S01: Core Database & Setup (Week 1)
- PostgreSQL + Docker setup
- Prisma schema design and implementation
- Basic NestJS application structure
- Development tooling configuration

### Sprint S02: Integration & Polish (Week 2)  
- Database migrations and seeding
- Module structure implementation
- Documentation completion
- Testing setup and CI/CD

## Quality Gates

Before milestone completion, all criteria must be validated:
- [ ] **Functionality**: All success criteria demonstrated
- [ ] **Performance**: Requirements met under load testing
- [ ] **Documentation**: Complete and accurate
- [ ] **Code Quality**: Passes all linting and formatting checks
- [ ] **Testing**: Unit tests for core functionality

## Next Milestone Preview

**M02: Entity Processing Core & External Integrations**
- LLM API integration for content analysis
- Entity resolution algorithms
- Reddit API integration setup
- Background job processing framework