# Collection Scheduler Consolidation (audit item 5)

**Mandate:** owner 2026-07-08 — fix, not defer. One scheduler owns WHEN we
talk to Reddit; today two independent systems plan against one account-wide
API budget.

## Today (the fragmentation)

- **CollectionJobSchedulerService** (chronological): Bull DELAYED jobs, one
  subreddit per job, durable across restarts. Flag `COLLECTION_SCHEDULER_ENABLED`.
- **KeywordSearchSchedulerService**: its own polling loop
  (`KEYWORD_SEARCH_POLL_INTERVAL_MS`), **in-memory schedule map** (restart
  amnesia), entity-priority term selection, hot-spike on-demand jobs, sort-plan
  logic (heavy sorts every ~60d). Flag `KEYWORD_SEARCH_ENABLED`.
- No coordination: both can pile jobs into the same window; the rate
  coordinator serializes calls but can't plan. The chronological scheduler has
  a TODO admitting keyword cycles belong inside it.

## Target shape

**One `CollectionSchedulerService`** owning a durable per-(community, workKind)
cadence table — `collection_schedules`: community, workKind
(`chronological` | `keyword` | `on_demand_hot_spike`), nextDueAt, lastRanAt,
intervalDays, enabled. All three kinds become **job variants on the existing
Bull queues** (the workers don't change — only WHO decides WHEN).

- **Single planning loop** (one cron): reads due rows ordered by priority,
  enqueues within a **per-cycle Reddit budget** (requests/cycle derived from
  the coordinator's limits), advances nextDueAt. Anything over budget waits
  for the next cycle — planned, not queued-and-contending.
- **Keyword term selection + hot-spike scoring stay as they are** (they're
  good) — they become _providers_ the scheduler consults when a keyword/
  on-demand row comes due, not schedulers themselves.
- **Durable state**: the in-memory schedule map dies; restart resumes from
  `collection_schedules`. Sort-plan state (lastTopRelevanceRunAt) moves into
  the row's metadata.
- **One flag**: `COLLECTION_SCHEDULER_ENABLED` governs the loop;
  `KEYWORD_SEARCH_ENABLED` reduces to whether keyword rows are seeded/enabled
  (per-row `enabled` is the real control). Onboarding (provisionCollection-
  Community) seeds the schedule rows for a new community.

## Strangler sequence

1. `collection_schedules` table + seed rows from current config for existing
   communities (migration backfill).
2. New scheduler loop enqueues CHRONOLOGICAL variants from the table; old
   chronological scheduler's planning disabled (workers untouched). Verify:
   jobs fire on cadence, survive restart.
3. Move keyword planning: scheduler consults slice-selection/sort-plan
   providers when keyword rows come due; delete the keyword polling loop +
   in-memory map. Verify keyword jobs fire identically (same payloads).
4. Move hot-spike: scorer becomes a provider; scheduler enqueues its jobs
   under the same budget.
5. Delete `CollectionJobSchedulerService` planning half +
   `KeywordSearchSchedulerService`; keep their worker/provider halves.
   Budget accounting logs per cycle (ledger-style).

## Verification gates

- Restart test: kill mid-cycle, restart → no lost or duplicated cadence.
- Budget test: seed schedules to overflow a cycle → overflow verifiably
  deferred, not contending.
- Behavior parity: keyword job payloads byte-comparable to the old path on
  the same due state.
