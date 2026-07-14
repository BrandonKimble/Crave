# Search results: unify list ⇄ map onto one schedule-carrying set (open-now → client)

**Design of record, 2026-07-14.** Prompted by the "22 open pins / 1 card" bug and the
owner's question: _is the two-phase fix the ideal, or a patch?_ Verdict: the fix is a
correct, RED-proven increment (filter-before-paginate is genuinely right, and its
hydrate-by-ids half is part of the ideal), but it operates inside a deeper compromise it
does not resolve. This doc is the from-scratch ideal + a non-regressing migration.

## The compromise the fix works within

- The **list** (`/search/run` → executor → `buildRestaurantQuery`) and the **map**
  (`/search/shortcut/coverage` → `SearchCoverageService`) are **two independent server
  queries**. Both compute openness server-side at request time
  (`evaluateOperatingStatus(new Date())`) — the list over its page, coverage over the
  viewport. The S0 fix made them _agree_ (same eval, same viewport) but they remain two
  computations that can silently re-diverge (the list carries an inventory-exists floor +
  plan conditions coverage lacks; semantic searches rank the list by relevance while
  coverage ranks by `percentile_rank`).
- Server-computed live openness is **exactly the anti-pattern we rejected for profile
  hours**: un-cacheable (stale by the minute), tied to the server clock, recomputed per
  request per candidate — and here, duplicated across two endpoints.
- The owner's _first_ observation (1 card while ~20 pins) is the same root in the
  no-filter case: the list is page-1, the map is the whole viewport — two sets, not one.

## The tell: we already solved this shape and it's our cleanest surface

Profile hours = ship the **immutable schedule** once (cacheable) + compute **live status**
on the client from the device clock via one pure engine (`resolveHoursState`,
`apps/mobile/src/features/restaurant-hours/hours-engine.ts`). "Open now" is the same
question — _is this open right now_ — and must have the same answer.

## Ideal shape

1. **One ranked set** per (query, viewport): lightweight rows
   `{ restaurantId, lat/lng, score/rank, StructuredWeeklyHours }`. Openness-agnostic ⇒
   **cacheable** (changes only when Places data does). This is today's `coverage` upgraded
   to carry the **schedule** instead of a computed `isOpen`. It is the single source for
   **both** the map pins and the list's ordering/total.
2. **List = a hydrated, paginated projection** of that set — rich card data hydrated for a
   page of ids via **hydrate-by-ids** (the S0 `restrictToRestaurantIds` endpoint, reused).
   The list stops running its own independent ranked query.
3. **Open-now = a client filter** over the shared set via `resolveHoursState(schedule,
now)`. Map + list both project from the **same** filtered id list.
4. **Stable filters (relevance, price, rising) stay server-side** — they define the ranked
   set. Rule: **time-dependent filter → client; stable filter → server.**
5. **Delete**: coverage's `isOpen` post-filter, the executor's server-side open-now pass
   (S0's candidate query), and `search-open-now-variant`'s provisional server true-up.
   **Keep**: hydrate-by-ids, the pure `selectOpenNowRestaurantPage` logic (moves
   client-side), the hours engine.

## The invariant that makes the bug structurally impossible (RED-provable)

`listOpenIdSet === mapOpenIdSet` — the list's ids are exactly the client-filtered
projection of the map set's ids (SET equality; order may differ for relevance-ranked
semantic searches, which is fine — pins aren't visually ordered). One set + one filter ⇒
they cannot diverge. A test drives a viewport where top-by-score are closed and asserts the
list ids equal the open projection of the coverage ids.

## Amendment (2026-07-14, post-review): open-now is a LENS, not a WORLD

The above still treats open-now as a filter that produces a different world. The sharper
ideal: **remove `openNow` from the desired-tuple / request key entirely.**

- One world per (query, viewport). The open/closed sibling worlds, the derivation tier's
  provisional variant, and the background true-up (`search-open-now-variant.ts`) are
  DELETED, not relocated — that machinery exists only because open-now pretends to be a
  server parameter. World-cache space halves; the "derived world disagrees with network
  world" bug class dies structurally.
- Open-now = a projection applied at selection/render time: `resolveHoursState(schedule,
deviceNow)` over the world's set. Instant AND exact (no true-up), and stays correct as
  the clock ticks — a place closing at 10:00 drops out of the list AND the pins at 10:00
  with zero network. No server shape can do that.
- Every entry point (search bar, comment-span searches, list-detail pages, profile pages,
  future surfaces) funnels through the same world resolver — a lens over any
  schedule-carrying set is inherited by all of them for free, with zero per-surface wiring.

**The standing law for toggles** — classify by: does it change what the candidate set IS,
or how shipped facts are VIEWED?

- Retrieval-semantic toggles → server, key the world: the query, relevance/include-similar
  (needs the DB's exact-vs-widened split), rising-as-ranking.
- Fact-projection toggles → client lens, never in the request key: open-now (schedule +
  clock), price levels (once the set ships each row's price band), and future predicates
  (distance-under-X, has-photos, sort flips).
  The code already half-knows this (includeSimilar is excluded from the coverage key;
  open-now is client-derived-then-trued-up) — the architecture has been straining toward
  lenses-over-one-set; this finishes the move. Same law the hours hero established, promoted
  from one card to the whole search surface.
- **D5 (new):** migrate price-levels to the lens model once the set carries price.
- **S2 (amended):** removing `openNow` from the world key IS the S2 move (not just
  relocating the filter); `search-open-now-variant.ts` retires entirely.

## Genuine owner decisions

- **D1 — schedule payload on the set.** Ship `StructuredWeeklyHours` per feature
  (~100–300 B × N; ~100 KB for a dense ~600-restaurant downtown viewport, cacheable).
  Options: ship it as-is (recommend — it's cacheable and unlocks everything) / compact-encode
  (bitmask per 15-min slot) / ship schedule only within a tighter "list-eligible" bound.
- **D2 — open-now only, or unify for ALL searches?** The full prize (list = projection of
  the map set for _every_ search) also fixes the original page-1/everything mismatch, but
  needs coverage to rank by the query's ranking (relevance for semantic, not always
  `percentile_rank`). Bigger blast radius. Recommend: **yes, general unification** — it's
  the real ideal — but stage it after the open-now unification proves out.
- **D3 — pagination model.** Client picks which ids (open, ranked); server hydrates that
  page. The resolver already does variant derivation (include-similar, provisional
  open-now), so this is an evolution, not a new concept.

## Migration (staged, each step non-regressing, RED-gated)

- **S0 — DONE ✅** Server filter-before-paginate + hydrate-by-ids. Stops the bleeding today;
  ships the reusable hydrate half. (open-now-list-map-parity: 6/6 spec, 36-vs-1 real data.)
- **S1** Coverage/set carries `StructuredWeeklyHours` (additive; nothing consumes it yet —
  zero behavior change; spec asserts schedules present + correct).
- **S2** Client computes open-now over the schedule-carrying set via `resolveHoursState`;
  the list open-now hydrates a page of the client-filtered ids (reuse S0 endpoint). Map
  already reads coverage. **Assert `listOpenIdSet === mapOpenIdSet`.**
- **S3** Delete the server-side open-now filters (executor pass + coverage `isOpen`) once
  the client path is authoritative. Openness now computed once, client-side, live.
- **S4 — the full prize (optional, after D2).** List = hydrated projection of the shared set
  for ALL searches; retire the separate list ranked query; coverage ranks by the query's
  ranking.

## What survives from S0 into the ideal

- `restrictToRestaurantIds` hydrate-by-ids — the ideal's list-hydrate mechanism.
- `selectOpenNowRestaurantPage` pure logic — moves to the client, same contract.
- The bug is already dead today; S1–S3 make it _structurally impossible_, cacheable, and
  consistent with the one hours engine used by profile + list + map.
