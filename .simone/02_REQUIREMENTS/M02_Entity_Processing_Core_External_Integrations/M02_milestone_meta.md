---
milestone_id: M02
title: Entity Processing Core & External Integrations
status: pending # pending | active | completed | blocked | on_hold
prd_sections: [1, 2, 3, 4, 5, 6, 9.2, 10] # Reference specific PRD sections
last_updated: 2025-07-26 17:30
---

## Milestone: Entity Processing Core & External Integrations

### Goals and Key Deliverables

**EXTRACTED FROM PRD SECTIONS:** [1, 2, 3, 4, 5, 6, 9.2, 10]

- **LLM integration**: API connectivity, structured input/output handling (see llm-content-processing.md for LLM details)
- **Complete entity resolution system**: Three-phase system with LLM normalization, database matching (exact, alias, fuzzy), and batched processing pipeline
- **Alias management**: Automatic alias creation, duplicate prevention, scope-aware resolution
- **Context-dependent attribute handling**: Separate entities by scope (dish vs restaurant attributes), referencing section 4.2.2's entity type definitions
- **Bulk operations pipeline**: Multi-row inserts/updates, transaction management
- **Google Places API integration**: Restaurant data enrichment, location services setup
- **External integrations module**: Centralized API management, basic rate limiting for google-places, reddit-api, llm-api
- **Basic security essentials**: Input validation, basic rate limiting, essential API security

### Key Documents

**PRD Requirements Source:**
- `PRD.md` sections: [1, 2, 3, 4, 5, 6, 9.2, 10] - Authoritative requirements for this milestone
- `PRD.md` sections 9 and 10 - Roadmap context and milestone boundaries
- `CLAUDE.md` - Project architecture and development guide

### Definition of Done (DoD)

**COPIED FROM PRD SUCCESS CRITERIA:**

- LLM integration successfully processes test content and extracts entities
- Entity resolution system correctly handles exact matches, aliases, and fuzzy matching
- Context-dependent attributes (Italian, vegan, etc.) resolve to correct scope
- Bulk operations successfully process batches of entities without data corruption
- Google Places API integration enriches restaurant entities with location and hours data
- External integrations module handles API errors gracefully with proper retry logic
- Basic security validation prevents common injection attacks and malformed requests
- System processes sample data end-to-end without critical errors

### Scope Boundaries

**ENFORCED FROM PRD ROADMAP:**

- **NOT included**: Hybrid Data Collection Implementation (deferred to M03 - PRD section 9.3)
- **NOT included**: Dynamic Query System (deferred to M04 - PRD section 9.4)
- **NOT included**: Ranking & Scoring algorithms (deferred to M05 - PRD section 9.5)
- **NOT included**: Complex multi-attribute queries (deferred to M06 - PRD section 9.6)
- **NOT included**: Mobile app implementation (deferred to M07 - PRD section 9.7)
- **NOT included**: Advanced caching beyond basic implementation (deferred to Post-MVP milestones)
- **Boundary enforcement**: Tasks must implement ONLY requirements in PRD sections 1, 2, 3, 4, 5, 6, 9.2, 10

### Notes / Context

**PRD Alignment:** This milestone implements PRD sections 1, 2, 3, 4, 5, 6, 9.2, 10 and must not exceed scope defined in these sections. Reference PRD roadmap sections 9-10 for milestone phase appropriateness.

**Dependencies:** Requires M01 Database Foundation & Basic Setup to be completed (which is already done). This milestone establishes the foundation for content processing and location services that will be used by subsequent milestones M03 (Data Collection) and M04 (Query System).

**Focus Areas:**
- Entity processing pipeline with LLM integration
- External API integrations (Google Places, future Reddit API, LLM API)
- Security fundamentals for API interactions
- Foundation for content processing without implementing data collection yet