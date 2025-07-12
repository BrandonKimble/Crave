---
project_name: Crave - Local Food Discovery App
current_milestone_id: M01
highest_milestone: M01
highest_sprint_in_milestone: S01
current_sprint_id: S01
status: active
last_updated: 2025-07-12 14:44
---

# Project Manifest: Crave - Local Food Discovery App

This manifest serves as the central reference point for the Crave project. It tracks the current focus and links to key documentation.

## 1. Project Vision & Overview

**Crave** transforms scattered Reddit community knowledge into evidence-based dish and restaurant recommendations. The app enables users to quickly make confident dining decisions by surfacing specific community mentions and upvotes about dishes and restaurants.

**Core Value Proposition:**
- **Evidence-Based Discovery**: Every recommendation backed by specific community mentions and upvotes
- **Dish-Centric Focus**: Find the best version of what you're craving, not just good restaurants  
- **Community-Powered**: Leverages authentic discussions from Reddit food communities
- **Mobile-First Experience**: Optimized for quick decisions with detailed evidence when needed

This project follows a milestone-based development approach with a **30-week Pre-MVP roadmap**.

## 2. Current Focus

- **Milestone:** M01 - Database Foundation & Basic Setup
- **Sprint:** S01 - Core Architecture & Database Schema Implementation

## 3. Sprints in Current Milestone

### S01 Database Foundation (🚧 IN PROGRESS)

🚧 PostgreSQL + Prisma setup with graph-based entity model
📋 Core tables: entities, connections, mentions, users
📋 Basic NestJS modular monolith structure
📋 Essential development tooling and CI/CD pipeline

## 4. Key Documentation

- [Architecture Documentation](./01_PROJECT_DOCS/ARCHITECTURE.md)
- [Product Requirements Document](../prd.md) - **Authoritative Source**
- [Current Milestone Requirements](./02_REQUIREMENTS/M01_Database_Foundation/)
- [General Tasks](./04_GENERAL_TASKS/)

## Milestones Overview (30-Week Pre-MVP Roadmap)

### Phase 1: Foundation (Weeks 1-6)
- [🚧] M01: Database Foundation & Basic Setup - Status: In Progress
- [ ] M02: Entity Processing Core & External Integrations - Status: Planned  
- [ ] M03: Data Collection Implementation (Reddit API) - Status: Planned

### Phase 2: Core Search (Weeks 7-15)
- [ ] M04: Dynamic Query System - Status: Planned
- [ ] M05: Basic Ranking & Scoring - Status: Planned
- [ ] M06: Complex Multi-Attribute Queries - Status: Planned
- [ ] M07: Basic Search Interface + Open Now Filtering - Status: Planned

### Phase 3: User Features (Weeks 16-25)
- [ ] M08: Evidence & Attribution System - Status: Planned
- [ ] M09: User Management & Authentication - Status: Planned
- [ ] M10: Bookmarking System - Status: Planned
- [ ] M11: Share/Contribute Tools - Status: Planned
- [ ] M12: Enhanced History & Food Maps - Status: Planned

### Phase 4: MVP Launch (Weeks 26-31)
- [ ] M13: Payment Integration - Status: Planned
- [ ] M14: UI Polish & Mobile Optimization - Status: Planned
- [ ] M15: MVP LAUNCH CHECKPOINT - Status: Planned

## 5. Quick Links

- **Current Sprint:** [S01 Sprint Folder](./03_SPRINTS/S01_M01_Database_Foundation/)
- **Active Tasks:** Check sprint folder for T##_S01_*.md files
- **Project Reviews:** [Latest Review](./10_STATE_OF_PROJECT/)
- **Architecture Decisions:** [ADR Log](./05_ARCHITECTURAL_DECISIONS/)

## 6. Technology Stack Summary

**Frontend:** React Native + TypeScript + Nativewind + Expo
**Backend:** NestJS + TypeScript + Fastify + Prisma + PostgreSQL + Redis
**Infrastructure:** AWS (RDS, ElastiCache, S3, SNS) + Railway.app + Docker
**External APIs:** Reddit API + Google Places API + Gemini/Deepseek LLM