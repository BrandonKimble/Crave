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

<!-- TASKMASTER_EXPORT_START -->

> 🎯 **Taskmaster Export** - 2025-07-10 02:08:42 UTC
> 📋 Export: with subtasks • Status filter: none
> 🔗 Powered by [Task Master](https://task-master.dev?utm_source=github-readme&utm_medium=readme-export&utm_campaign=crave-search&utm_content=task-export-link)

```
╭─────────────────────────────────────────────────────────╮╭─────────────────────────────────────────────────────────╮
│                                                         ││                                                         │
│   Project Dashboard                                     ││   Dependency Status & Next Task                         │
│   Tasks Progress: ░░░░░░░░░░░░░░░░░░░░ 0%    ││   Dependency Metrics:                                   │
│   0%                                                   ││   • Tasks with no dependencies: 1                      │
│   Done: 0  In Progress: 0  Pending: 10  Blocked: 0     ││   • Tasks ready to work on: 1                          │
│   Deferred: 0  Cancelled: 0                             ││   • Tasks blocked by dependencies: 9                    │
│                                                         ││   • Most depended-on task: #3 (2 dependents)           │
│   Subtasks Progress: ░░░░░░░░░░░░░░░░░░░░     ││   • Avg dependencies per task: 1.0                      │
│   0% 0%                                               ││                                                         │
│   Completed: 0/61  In Progress: 0  Pending: 61      ││   Next Task to Work On:                                 │
│   Blocked: 0  Deferred: 0  Cancelled: 0                 ││   ID: 1 - Setup Turborepo Monorepo Structure     │
│                                                         ││   Priority: high  Dependencies: None                    │
│   Priority Breakdown:                                   ││   Complexity: ● 6                                       │
│   • High priority: 4                                   │╰─────────────────────────────────────────────────────────╯
│   • Medium priority: 6                                 │
│   • Low priority: 0                                     │
│                                                         │
╰─────────────────────────────────────────────────────────╯
┌───────────┬──────────────────────────────────────┬─────────────────┬──────────────┬───────────────────────┬───────────┐
│ ID        │ Title                                │ Status          │ Priority     │ Dependencies          │ Complexi… │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 1         │ Setup Turborepo Monorepo Structure   │ ○ pending       │ high         │ None                  │ ● 6       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 1.1       │ └─ Create monorepo directory structu │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 1.2       │ └─ Configure Turborepo setup         │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 1.3       │ └─ Setup workspace configuration     │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 1.4       │ └─ Create shared packages setup      │ ○ pending       │ -            │ 2, 3                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 1.5       │ └─ Configure development workflow an │ ○ pending       │ -            │ 4                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 2         │ Database Schema Implementation       │ ○ pending       │ high         │ 1                     │ ● 8       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 2.1       │ └─ Database Creation and Configurati │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 2.2       │ └─ Table Schema Design               │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 2.3       │ └─ Index Optimization Strategy       │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 2.4       │ └─ Prisma ORM Setup and Configuratio │ ○ pending       │ -            │ 3                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 2.5       │ └─ Migration System Implementation   │ ○ pending       │ -            │ 4                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 2.6       │ └─ Performance Validation with Bulk  │ ○ pending       │ -            │ 5                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3         │ NestJS Backend Foundation            │ ○ pending       │ high         │ 2                     │ ● 7       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3.1       │ └─ NestJS Application Initialization │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3.2       │ └─ Module Architecture Setup         │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3.3       │ └─ Infrastructure Services Integrati │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3.4       │ └─ Configuration Management System   │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3.5       │ └─ Security Implementation           │ ○ pending       │ -            │ 4                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3.6       │ └─ Authentication Scaffolding        │ ○ pending       │ -            │ 5                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 3.7       │ └─ Health Monitoring Setup           │ ○ pending       │ -            │ 3, 6                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 4         │ External API Integrations            │ ○ pending       │ high         │ 3                     │ ● 7       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 4.1       │ └─ Reddit API Client Implementation  │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 4.2       │ └─ Google Places API Integration     │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 4.3       │ └─ LLM API Client Development        │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 4.4       │ └─ Error Handling and Resilience Pat │ ○ pending       │ -            │ 1, 2, 3               │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 4.5       │ └─ API Key Management System         │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 4.6       │ └─ API Monitoring and Observability  │ ○ pending       │ -            │ 1, 2, 3, 4            │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 5         │ Entity Resolution System             │ ○ pending       │ medium       │ 4                     │ ● 8       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 5.1       │ └─ Implement three-tier matching sys │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 5.2       │ └─ Develop scope-aware resolution lo │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 5.3       │ └─ Create in-memory ID mapping syste │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 5.4       │ └─ Implement bulk processing optimiz │ ○ pending       │ -            │ 2, 3                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 5.5       │ └─ Build alias management with merge │ ○ pending       │ -            │ 4                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6         │ Content Processing Pipeline          │ ○ pending       │ medium       │ 5                     │ ● 9       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6.1       │ └─ Reddit Content Retrieval System   │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6.2       │ └─ LLM Entity Extraction Service     │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6.3       │ └─ Entity Resolution Integration     │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6.4       │ └─ Six Processing Components Impleme │ ○ pending       │ -            │ 3                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6.5       │ └─ Mention Scoring System            │ ○ pending       │ -            │ 4                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6.6       │ └─ Bulk Database Operations          │ ○ pending       │ -            │ 5                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 6.7       │ └─ Background Job Orchestration      │ ○ pending       │ -            │ 6                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 7         │ Dynamic Query System                 │ ○ pending       │ medium       │ 6                     │ ● 8       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 7.1       │ └─ Implement Dynamic Query Builder   │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 7.2       │ └─ Develop LLM Query Processing Engi │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 7.3       │ └─ Create Scope-Aware Filtering Syst │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 7.4       │ └─ Build Return Format Determination │ ○ pending       │ -            │ 2, 3                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 7.5       │ └─ Implement Geographic Filtering Ca │ ○ pending       │ -            │ 3                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 7.6       │ └─ Develop Contextual Ranking System │ ○ pending       │ -            │ 4, 5                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 8         │ Multi-Level Caching System           │ ○ pending       │ medium       │ 7                     │ ● 6       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 8.1       │ └─ Redis Infrastructure Setup        │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 8.2       │ └─ Three-Tier Caching Implementation │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 8.3       │ └─ Cache Invalidation Strategy       │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 8.4       │ └─ Performance Monitoring            │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 8.5       │ └─ Cache Warming with Geographic Seg │ ○ pending       │ -            │ 3, 4                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 9         │ User Management and Payment System   │ ○ pending       │ medium       │ 3                     │ ● 7       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 9.1       │ └─ User Authentication System        │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 9.2       │ └─ Subscription Management           │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 9.3       │ └─ Stripe Payment Integration        │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 9.4       │ └─ User Onboarding Flow              │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 9.5       │ └─ Access Control Middleware         │ ○ pending       │ -            │ 1, 2                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 9.6       │ └─ User Event Tracking and Referral  │ ○ pending       │ -            │ 1, 4                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10        │ React Native Mobile Application      │ ○ pending       │ medium       │ 8, 9                  │ ● 9       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.1       │ └─ React Native App Initialization   │ ○ pending       │ -            │ None                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.2       │ └─ Search Interface Implementation   │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.3       │ └─ Results Display with Evidence Car │ ○ pending       │ -            │ 2                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.4       │ └─ Map Integration                   │ ○ pending       │ -            │ 3                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.5       │ └─ User Authentication Screens       │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.6       │ └─ Bookmark System                   │ ○ pending       │ -            │ 3, 5                  │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.7       │ └─ State Management Setup            │ ○ pending       │ -            │ 1                     │ N/A       │
├───────────┼──────────────────────────────────────┼─────────────────┼──────────────┼───────────────────────┼───────────┤
│ 10.8       │ └─ Attribution System with Deep Link │ ○ pending       │ -            │ 7                     │ N/A       │
└───────────┴──────────────────────────────────────┴─────────────────┴──────────────┴───────────────────────┴───────────┘
```

╭────────────────────────────────────────────── ⚡ RECOMMENDED NEXT TASK ⚡ ──────────────────────────────────────────────╮
│ │
│ 🔥 Next Task to Work On: #1 - Setup Turborepo Monorepo Structure │
│ │
│ Priority: high Status: ○ pending │
│ Dependencies: None │
│ │
│ Description: Initialize the hybrid monorepo architecture with Turborepo, establishing the foundation for API and mobile applications │
│ │
│ Subtasks: │
│ 1.1 [pending] Create monorepo directory structure │
│ 1.2 [pending] Configure Turborepo setup │
│ 1.3 [pending] Setup workspace configuration │
│ 1.4 [pending] Create shared packages setup │
│ 1.5 [pending] Configure development workflow and git hooks │
│ │
│ Start working: task-master set-status --id=1 --status=in-progress │
│ View details: task-master show 1 │
│ │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯

╭──────────────────────────────────────────────────────────────────────────────────────╮
│ │
│ Suggested Next Steps: │
│ │
│ 1. Run task-master next to see what to work on next │
│ 2. Run task-master expand --id=<id> to break down a task into subtasks │
│ 3. Run task-master set-status --id=<id> --status=done to mark a task as complete │
│ │
╰──────────────────────────────────────────────────────────────────────────────────────╯

> 📋 **End of Taskmaster Export** - Tasks are synced from your project using the `sync-readme` command.

<!-- TASKMASTER_EXPORT_END -->
