---
milestone_id: M03
title: Hybrid Data Collection Implementation
status: completed # pending | active | completed | blocked | on_hold
prd_sections: [1, 2, 3, 4, 5, 6, 9.3, 10] # Reference specific PRD sections
last_updated: 2025-08-01T01:21:42Z
---

## Milestone: Hybrid Data Collection Implementation

### Goals and Key Deliverables

**EXTRACTED FROM PRD SECTIONS:** [1, 2, 3, 4, 5, 6, 9.3, 10]

**Historical Data Processing (Pushshift Archives):**

- **Archive download and setup**: Download target subreddit files via torrent (referencing PRD sections 2.5, 5.1.1)
- **Stream processing implementation**: zstd decompression and ndjson parsing for efficient memory usage (PRD 5.1.1, 6.1)
- **Historical content pipeline**: Extract posts/comments from archives, process timestamps for comprehensive historical context (PRD 5.1.1, 6.1)
- **Batch processing system**: Handle large datasets efficiently without memory issues using streaming approach (PRD 5.1.1, 6.1)

**Real-Time Data Collection (Reddit API):**

- **Reddit API integration**: Authentication, rate limiting (100 requests/minute), cost management within free tier (PRD 2.5, 5.1.2)
- **Content retrieval pipeline**: Post/comment fetching, URL storage, complete thread retrieval (PRD 5.1.2, 6.1)
- **Scheduled collection jobs**: Daily/hourly updates with error handling and retry logic using dual collection strategy (PRD 5.1.2)
- **Gap tracking system**: Monitor for missed content and data continuity between historical and real-time sources (PRD 5.1.2, 9.3.1)

**Unified Processing Pipeline:**

- **Data merge logic**: Combine historical and real-time data by timestamp to prevent gaps (PRD 5.1.2, 6.1)
- **Duplicate detection**: Prevent duplicate processing of overlapping content between Pushshift archives and Reddit API (PRD 6.1, 9.3.1)
- **LLM processing integration**: Unified entity extraction for both data sources using existing M02 LLM pipeline (PRD 6.2, 6.3)

### Key Documents

**PRD Requirements Source:**
- `PRD.md` sections: [1, 2, 3, 4, 5, 6, 9.3, 10] - Authoritative requirements for this milestone
- `PRD.md` sections 9 and 10 - Roadmap context and milestone boundaries
- `CLAUDE.md` - Project architecture and development guide

**End-to-End Testing & Integration:**
- `M03_E2E_Testing_Status.md` - Real data integration testing status and milestone-level production readiness assessment
- Template: `.simone/99_TEMPLATES/milestone_e2e_testing_template.md` - Use this template to create and maintain comprehensive real data testing documentation

### Definition of Done (DoD)

**COPIED FROM PRD SUCCESS CRITERIA (9.3.2):**

- Successfully download and process sample Pushshift archive files
- Archive processing handles large files without memory or performance issues
- Reddit API authentication and basic data retrieval functional
- Scheduled collection jobs run reliably with proper error handling
- Data merge logic correctly handles overlapping content
- LLM processing pipeline extracts entities from both data sources
- Combined dataset provides comprehensive coverage (historical + real-time)
- Gap tracking identifies and reports data continuity issues

### Scope Boundaries

**ENFORCED FROM PRD ROADMAP:**

- **NOT included**: Dynamic Query System (deferred to M04 - PRD section 9.4)
- **NOT included**: Basic Ranking & Scoring algorithms (deferred to M05 - PRD section 9.5)
- **NOT included**: Complex multi-attribute queries (deferred to M06 - PRD section 9.6)
- **NOT included**: Basic Search Interface + Mobile App (deferred to M07 - PRD section 9.7)
- **NOT included**: Evidence & Attribution System (deferred to M08 - PRD section 9.8)
- **NOT included**: Advanced caching beyond basic implementation (deferred to Post-MVP milestones)
- **Boundary enforcement**: Tasks must implement ONLY requirements in PRD sections [1, 2, 3, 4, 5, 6, 9.3, 10]

### Notes / Context

**PRD Alignment:** This milestone implements PRD sections [1, 2, 3, 4, 5, 6, 9.3, 10] and must not exceed scope defined in these sections. Reference PRD roadmap sections 9-10 for milestone phase appropriateness.

**Dependencies:** Requires M01 Database Foundation & Basic Setup (✅ COMPLETED) and M02 Entity Processing Core & External Integrations (✅ COMPLETED). This milestone establishes the community content foundation that will be used by subsequent milestones M04 (Dynamic Query System) and M05 (Basic Ranking & Scoring).

**Focus Areas:**
- Hybrid data collection using both Pushshift archives and Reddit API
- Stream processing for large historical datasets without memory issues
- Real-time Reddit API integration with proper rate limiting and cost management
- Unified processing pipeline that handles both data sources seamlessly
- Gap tracking and data continuity monitoring between historical and real-time sources

**Technical Context (from PRD sections 5 & 6):**
- **Pushshift Archives**: Complete historical data through end-2024, zstd-compressed ndjson format, stream processing approach
- **Reddit API**: 100 requests/minute rate limit, dual collection strategy (chronological + keyword entity search), cost optimization within free tier
- **Processing Pipeline**: Six-step process from data retrieval to quality score updates, leveraging existing M02 LLM integration and entity resolution systems