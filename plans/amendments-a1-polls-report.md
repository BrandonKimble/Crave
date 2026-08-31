# Amendments A-1 + poll trio — implementation report (2026-08-30)

Territory: servable-place-scope + consumers' specs, polls type lists +
comment-span scan, launch flip-list. All edits UNCOMMITTED.

## 1. A-1 visibility gate (shipped)

**Where:** inside `servablePlaceConditionsSql` in
`apps/api/src/modules/restaurant-enrichment/servable-place-scope.ts` — the one
shared fragment, so search list + map + dots (search-query.builder `r`,
search-coverage `e`) stay agreed by construction. No second predicate exists
anywhere.

**The SQL:** a place is servable when it is grounded (any
`core_restaurant_locations` row with `google_place_id IS NOT NULL`) OR carries
≥2 `core_restaurant_events` rows (existence-of-two via a `LIMIT 2` subquery on
`idx_restaurant_events_restaurant_time`). Ungrounded zero/one-mention shells
drop.

**Why mentions-only (the "attempt in flight" disjunct was dropped,
deliberately):** the only true in-flight signal is the BullMQ job in Redis
(`restaurant-primary-enrichment`, removeOnComplete/removeOnFail) — invisible
from SQL. The durable breadcrumb
(`restaurant_metadata->'lastEnrichmentAttempt'`, `enrichment_failure_count`)
records COMPLETED attempts, i.e. exactly the failures — granting visibility on
it would invert the gate (least-groundable shells most visible). Cost of
mentions-only: a one-mention real place stays dark for its grounding window
(median 5h) — the window A-1 already accepted for <2-mention mints.

**Staging semantics (SELECT-only, 2026-08-30 evening; census numbers moved
since the morning red-team census — chooser-v2 wave grounded/merged entities
all day):**

| Count (type=place, not archived, in-market) | n |
|---|---|
| Servable BEFORE gate | 8,509 |
| Servable AFTER gate | 8,002 |
| Dropped (ungrounded, <2 mentions) | 507 |
| … of which zero-mention shells | 197 (130 of them status=active — the morning census's "173" class, post-day-of-grounding) |
| Ungrounded KEPT (≥2 mentions — the median-10 cohort) | 686 |

**Spec:** new
`apps/api/src/modules/restaurant-enrichment/servable-place-visibility.integration.spec.ts`
(runs under `yarn test:db`) — shell hidden, one-mention hidden, 2-mention
cohort visible, grounded-zero-mention visible; mutation-capable against the
gate arm. Passing. The existing archived-leak coverage spec seeds grounded
locations and still passes.

## 2. Poll trio (shipped)

- **`ingredient` in the scan** (`polls.service.ts`): the two scan-site type
  arrays collapsed into one named constant `POLL_SCAN_TYPES` =
  `[place, item, ingredient, item_attribute, place_attribute]` — order IS the
  single-winner order (place first, ingredient after item per study §5). Feeds
  comment posting/editing, graduation backfill, description scan, and the
  endorsement projection (which reads the same spans).
- **Frame-word gate ported** (`dropFrameOnlySpans` in `polls.service.ts`,
  applied at both scan sites): a grounded span made entirely of frame-ruled
  units never links — same composition rule as search
  (search-query-interpretation.service.ts); in-memory
  `JudgedVocabularyService.roleOf` under 'und' (poll prose carries no detected
  locale; 'und' is certified for every corpus word). No sync hearing: unheard
  words link today (conservative, same as search) and are queued durably for
  the nightly hearing via `holdsUnjudged`. Six PollsService direct-construction
  specs gained the `judgedVocabularyDouble()` 14th ctor arg.

## 3. Ingredient tap wiring — NO mobile change needed

Poll comment spans already flow through the shared
`resolveEntityRefAction` policy
(`apps/mobile/src/navigation/runtime/entity-ref-action-policy.ts`, used by
`PollDetailPanel.tsx`), and that policy already routes `ingredient` →
`entityDesire` (the same search-submit deep link the autocomplete ingredient
tap uses). The server contract (span carries `type: 'ingredient'`) is all the
tap needs. Nothing owed to the why-this-matched agent's territory.

## 4. Flip-list doc

`plans/launch-flip-list.md`: bolded the both-red-team-verdicts-conditional-on-
hygiene note on the `RESTAURANT_NAME_CENSUS_ENABLED` and
`LOCATION_LIFECYCLE_CRON_ENABLED` rows.

## Gates

- Build: green. Targeted units (polls + search + enrichment): 425 passed.
- New integration spec: PASS against local DB. Full `yarn test:db`: 4 failures
  (open-now-parity tz=null class, iteration-bench, 2 dedupe-merge) verified
  PRE-EXISTING on a clean tree (stash-baselined); not mine.
- `yarn invariants`: 43 invariants / 88 proofs, all green.
- Boot smoke: dist boots, `/health` 200 on :3999. (SOURCE TABLE ROW COLLAPSE
  alarms in the boot log are pre-existing on this dev DB — same alarms fire in
  the long-lived shared dev API's log before this work.)
