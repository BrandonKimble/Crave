# THE LAUNCH FLIP-LIST — every deliberately-off flag that must flip at launch

Created 2026-08-30 (flywheel-arming order). This is the ONE written list of
switches the iteration-phase posture (2026-08-09 ruling: staging-only, prod
LLM rails disarmed) leaves off on purpose. Each is off for a REASON that
expires at launch; a launch that forgets a row ships an app whose learning
loops silently never run. Sources: docs/llm-systems-map.md (gated-off
section), plans/dormant-systems-audit.md, CLAUDE.md/memory notes.

Flip discipline: flip on STAGING first, watch one full nightly cycle's logs
and spend (cost-reconcile after), then prod. `CRONS_ENABLED` is the master —
nothing below runs anywhere until it is true on the prod worker.

| Flag (env, prod worker) | What it arms | Why off now | Flip when |
|---|---|---|---|
| `CRONS_ENABLED` | THE MASTER: ScheduleModule itself — every @Cron below, present and future | Prod currently `false` (memory: red-team campaign note); iteration phase wants zero unattended spend | First — nothing else matters until this is true |
| `COLLECTION_SCHEDULER_ENABLED` | Collector pacer → Reddit/archive collection queues | No standing collection during prompt iteration (reextract choreography owns collection) | Launch, with the collection budget envelope set |
| `LLM_BATCH_POLL_ENABLED` | Gemini Batch submit/poll/ingest rail | Same posture: batch rail runs only during sanctioned reloads | With collection |
| `KNOWLEDGE_MAINTENANCE_ENABLED` | 6AM knowledge rail: label/vocabulary sweeps per locale + satisfies + (see next row) name census | Watermark passes re-pay on every prompt bump; iteration bumps constantly | Launch, after the final reload settles |
| `RESTAURANT_NAME_CENSUS_ENABLED` | Step 3 of the knowledge rail: generic-word census feeds the restaurant-name court (~50 LLM calls first night, then trickle). NOTE: needs `KNOWLEDGE_MAINTENANCE_ENABLED` on too — it is a step of that rail | Built 2026-08-30, default off; reload churn would waste verdicts on surfaces the reload replaces (audit: hear AFTER the reload) | Launch, post-final-reload, TOGETHER WITH the janitor row — court without janitor does not kill upheld-name ghosts ("Best", SD-3). **Both verdicts of the birth-and-linking red team (Thesis A AND Thesis B incumbents survive) are CONDITIONAL on this hygiene actually running — flipping this row is what makes them true** |
| `DEMAND_VOCABULARY_SWEEP_ENABLED` | 4:30AM demand→vocabulary retry sweep (unmet asks → identity judge → banked alias; ≤100 judge calls/night). Since the one-intake merge (2026-08-30) this is the RETRY lane — the intake below judges pieces at arrival; the sweep re-reads the ledger nightly so yesterday's left-as-demand can learn once collection mints the concept | Built 2026-08-30, default off; input is user demand and there is none pre-launch — the cron would run empty forever | Launch, once real user asks exist |
| `UNKNOWN_INTAKE_ALIAS_MATCH_ENABLED` | The one unknown-search intake's alias-match step (10-min residue drain: segment → Same-Thing Judge per piece → bank alias or route to demand; ≤100 judge calls/pass). Off = old splitter routing (pieces go straight to demand); the free fold-known filter runs regardless | Built 2026-08-30, default off; judge spend keyed to user demand, none pre-launch | Launch, together with the sweep row above |
| `LOCATION_LIFECYCLE_CRON_ENABLED` | Weekly restaurant janitor: refresh stale locations, archive all-closed + terminally-ungroundable (the SD-3 ghost-kill arm); also gates places polygon promotion family | Dev corpus has nothing worth keeping fresh (its own header says flip at launch); ~$6–27/wk Places spend | Launch. PAIRED with the name-census row above; consider raising `LOCATION_REFRESH_LIMIT` (250/wk cycles the fleet in ~53 weeks, honest rate ≈1,030/wk). **Both verdicts of the birth-and-linking red team are CONDITIONAL on this janitor running — "junk dies by lifecycle" and "junk is cured by hygiene" are claims about dormant code until this flips** |
| `DISH_KNOWLEDGE_SYNTHESIS_ENABLED` | 5AM once-per-new-dish knowledge synthesis (ingredients/aliases/cuisine) | Prompt still under iteration; re-pays per bump | Launch, after final prompt settles |
| `DEDUPE_JUDGE_LANES_ENABLED` | Food dedupe-merge judge lane (off ⇒ pairs silently `judgeHeld`) | Iteration churn creates transient dupes a reload re-cuts anyway | Launch |
| `ATTRIBUTE_MERGE_JUDGE_ENABLED` | Attribute dedupe-merge lane (built but unreachable: judge off AND `runSweep` unscheduled — scheduling it is a separate launch task, not just a flag) | Never armed; ontology still moving | Launch, and give `runSweep` a rail when flipping |
| `ENTITY_EMBEDDING_RECONCILE_ENABLED` | 5-min embedding reconciler (single writer of `name_embedding`) | Off by default posture; reloads backfill via script | Launch (or first, if search quality needs fresh embeddings sooner) |
| `ENTITY_SIBLING_EDGES_REBUILD_ENABLED` | Nightly derived sibling-edge rebuild | Derived tier follows the master posture | Launch |
| `NAME_CONTAINMENT_EDGE_BUILDER_ENABLED` | Nightly name-containment edge rebuild | Same | Launch |
| `FOOD_CATEGORY_EDGE_BUILDER_ENABLED` | Nightly food-category edge rebuild | Same | Launch |
| `SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED` | 15-min demand read-model rebuild (feeds taste profiles, curated lists) | No user signals yet | Launch |
| `CURATED_LISTS_BUILD_ENABLED` | 6AM home curated lists | Depends on scores/signals being live | Launch |

Defaults-ON, listed so nobody "flips" them redundantly:
`VOCABULARY_MAINTENANCE_ENABLED` (defaults true — the 4AM word-hearing drain
+ verdict-cache poll run wherever `CRONS_ENABLED` allows).

Not flags but launch-armed in the same breath: the entity-lexicon builder has
NO disable flag (only `CRONS_ENABLED` stops it); `RUN_KNOWLEDGE_MAINTENANCE_ON_BOOT`
is the one-shot escape hatch, never a standing switch.
