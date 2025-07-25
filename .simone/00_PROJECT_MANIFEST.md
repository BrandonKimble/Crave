---
project_name: Crave Search
current_milestone_id: M01
highest_milestone: M01
highest_sprint_in_milestone: S03
current_sprint_id: S02
status: active
last_updated: 2025-07-25T00:41:00Z
---

# Project Manifest: Crave Search

This manifest serves as the central reference point for the Crave Search food discovery platform. It tracks the current focus and links to key documentation.

## 1. Project Vision & Overview

**Crave Search** transforms scattered Reddit food discussions into actionable dining insights. Users can quickly make confident dining decisions through evidence-based dish and restaurant recommendations powered by community knowledge.

**Core Value Proposition:**

- **Evidence-Based Discovery**: Every recommendation backed by specific community mentions and upvotes
- **Dish-Centric Focus**: Find the best version of what you're craving, not just good restaurants
- **Community-Powered**: Leverages authentic discussions from Reddit food communities
- **Mobile-First Experience**: Optimized for quick decisions with detailed evidence when needed

This project follows a milestone-based development approach with a comprehensive 31-week pre-MVP roadmap.

## 2. Current Focus

**Milestone M01: Database Foundation & Basic Setup** (Week 1-2)

Building the foundational database layer with PostgreSQL and Prisma ORM. This includes creating the core schema for entities, connections, and mentions tables, implementing basic CRUD operations, and setting up the testing infrastructure.

## 3. Current Milestone Progress

### Active Milestones

- [ ] **M01: Database Foundation & Basic Setup** - Status: In Progress
  - PRD Sections: 4.1, 2.3, 3.4, 2.7, 9.1
  - [Milestone Details](./02_REQUIREMENTS/M01_Database_Foundation_Basic_Setup/M01_milestone_meta.md)

### Sprint Roadmap for M01

- [x] **S01: Database Schema Foundation** - Status: Complete (TX05_S01 ✅)

  - Focus: Complete schema implementation and migrations
  - [Sprint Details](./03_SPRINTS/S01_M01_Database_Schema_Foundation/S01_M01_sprint_meta.md)

- [ ] **S02: CRUD Operations & Repository Layer** - Status: In Progress (TX01_S02 ✅, TX02_S02 ✅, TX03_S02 ✅, TX04_S02 ✅, TX05_S02 ✅, TX06_S02 ✅)

  - Focus: Business logic and data access implementation
  - [Sprint Details](./03_SPRINTS/S02_M01_CRUD_Operations_Repository_Layer/S02_M01_sprint_meta.md)

- [ ] **S03: Testing & Performance Validation** - Status: Planned
  - Focus: Quality assurance and performance optimization
  - [Sprint Details](./03_SPRINTS/S03_M01_Testing_Performance_Validation/S03_M01_sprint_meta.md)

## 4. Key Documentation

- [Architecture Documentation (CLAUDE.md)](../CLAUDE.md)
- [Complete PRD with Roadmap](../../PRD.md)
- [Current Milestone Requirements](./02_REQUIREMENTS/M01_Database_Foundation_Basic_Setup/)
- [General Tasks](./04_GENERAL_TASKS/)

## Upcoming Milestones

## 5. Quick Links

- **Current Sprint:** [S01 Sprint Folder](./03_SPRINTS/S01_M01_Database_Schema_Foundation/)
- **PRD & Roadmap:** [Complete PRD](../../PRD.md)
- **Project Setup:** [CLAUDE.md](../CLAUDE.md)
- **Technical Architecture:** [API Documentation](../../apps/api/README.md)
