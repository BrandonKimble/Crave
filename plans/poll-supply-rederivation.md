# Poll supply — rederivation to an audience-denominated economy

Owner rulings 2026-08-09. Written to be executed by agents who were not in the
room: every claim about current code carries `file:line`, every decision carries
its why, and the options that lost are kept with the reason they lost.

Read before executing: `plans/geo-demand-foundation-rebuild.md` §3/§4/§16/§17/§18
(the ratified doctrine this plan amends), `product/polls.md` (the product
sentences, several of which this plan rewrites), and
`apps/api/src/shared/invariants/registry.ts` (the proof vocabulary §10 uses).

---

## 0. What happened — the silent fixpoint

The supply economy reached a stable state in which it produces nothing and can
never learn its way out. Four mechanisms, each individually defensible, compose
into a trap.

**The denominator was attention, not people.** `creditRate(place) =
weeklyDemandMass × answerYield ÷ viability`
(`apps/api/src/modules/polls/supply/poll-supply-controller.ts:164-166`).
`weeklyDemandMass` comes from `DemandMassReader.placeDemandMass`
(`demand-mass.reader.ts:184-237`), whose lineage CTE
(`demand-mass.reader.ts:134-160`) expands each root place to itself **∪ all DAG
ancestors ∪ all DAG descendants**, then joins `signal_demand_daily` on every
tile. The write side is correct and cheap — a continental viewport settle stores
**one** row at the coarsest contained tile
(`signal-demand-aggregate.service.ts:448-505`). The read side is where it
detonates: every one of a state's municipalities has that state on its `up`
chain, so **every town joins the single coarse row and receives the act at full
weight** — `KIND_WEIGHT_PRIOR = 1.0` (`demand-mass.reader.ts:67`), with
`subjectScope: 'any'` (`:215`) specifically admitting subjectless dwells. One
tester panning the map seeded 16,225 towns. `placesWithAnySignal`
(`:394-424`) repeats the same expansion, so those towns also became **ritual
candidates** (`poll-weekly-ritual.service.ts:188-196`).

**The estimator learned from polls nobody could see.** `harvestCohortOutcomes`
observes every closed seeded cohort (`poll-weekly-ritual.service.ts:393-539`).
The only gate on whether a cohort teaches is `attentionMass > 0`
(`poll-supply-estimators.ts:144`) — which those 16,225 ghost cohorts passed,
because their fabricated attention mass was real by the lineage read's own
algebra. Each contributed `answerCounts` of 0 and `viableAnswerCounts` of 0, and
`poll.viability` — prior 15, self-erasing at strength 1
(`poll-supply.constants.ts:51-56`) — was dragged to ~3.4. Since viability is a
**divisor**, a poisoned-low viability inflates `creditRate`, which is the wrong
direction and made the flood worse before publishing halted.

**Recovery is blocked for ~9 months.** The registry has **no durable store in
this lane** — `PollSupplyEstimators.buildRegistry()` constructs
`new EstimatorRegistry()` with no `EstimatorStateStore`
(`poll-supply-estimators.ts:81`; the store exists and is used elsewhere,
`estimators/estimator-state.store.ts`). Beliefs are therefore **replayed from
durable outcomes at every tick**. A poisoned cohort is consequently not a
transient that ages out of a live belief: it is **re-injected from scratch every
Sunday** for as long as it sits inside the harvest's `launchedAt` lower bound,
`ESTIMATOR_EVIDENCE_HORIZON_DAYS = 280` (`poll-supply.constants.ts:112-113`,
applied at `poll-weekly-ritual.service.ts:394-402`). 280 days ≈ 9.2 months. There
is no hand-revert lever, by design.

**And the trap has no exit through use.** Even after amnesty, the old math would
re-derive the same zero: `viability` can only be measured from published polls,
the frontier gates which polls exist, and the ±1 median-test dither
(`poll-supply-controller.ts:210-218`) is the only excitation — a dither around
zero is zero.

Prod at the review: **17,931 polls, 0 votes, publishing halted, 16,226
`poll_place_supply` rows.** The poll count is independently corroborated at
`plans/austin-reextract-handoff.md:114` (17,931 as of 08-01).

The diagnosis that matters: **nothing in the old economy ever asked whether a
human being would see the poll.** Attention mass answered "did a pixel of this
place pass under someone's thumb", and that question has a nonzero answer for
every populated polygon on earth.

---

## 1. The shape

> **A town's poll budget is the audience it can actually reach, times how much
> that audience engages, divided by the price of a good poll. Attention no
> longer decides *whether* a town gets polls — only *which subjects*.**

Three quantities, and the middle one is the only thing learned:

| | | |
|---|---|---|
| **audience(P)** | *counted, not estimated* | distinct users whose derived **resident place** falls in P's claimed subtree. A fact about people, read from a table. |
| **engagementRate(P)** | *the one learned quantity* | engagement acts per audience member per week. One estimator, hierarchical place→global→prior, observing **only witnessed cohorts**. |
| **price(P)** | *the self-erasing 15, re-denominated* | engagement acts at which a poll demonstrably produces strong content. The K2 prior survives; its unit changes from votes to engagement acts. |

```
budgetRate(P)  =  audience(P) × engagementRate(P) ÷ price(P)      [polls per week]
credit(P)      =  decay(credit, 14d) + budgetRate × elapsedWeeks   [the warrant]
cohortTarget   =  max( grant(P), min( round(budgetRate), floor(credit) ) )
```

`conversion` and `tailConcentration` **die** (owner ruling 5). The **frontier**
and the **median test** die with them (§3.3 adjudicates the dither the owner
asked about). `answerYield`'s ghost-town-termination role is inherited by
`engagementRate` reaching zero (§4.6). `grant(P)` is the **unmeasured-place
exploration grant** — the keystone that makes zero→one recovery one Sunday, and
the mechanism that keeps a two-person test town alive (§3.2).

What a person experiences, if it works: Alice installs the app in Manhattan,
Kansas. She searches a few times over two weeks; her resident place derives to
Manhattan, KS. Sunday 09:00 local, the town has an audience of one, an
unmeasured engagement rate, and therefore its exploration grant: one poll,
"Best restaurants in Manhattan." She gets one push at 09:00, opens a poll with
no standings and an invitation to comment, and types "Kite's has the best
burger." That is a candidate, an engagement act, and a witnessed observation, all
at once. Next Sunday the town's rate is measured for the first time and its
budget is a fact rather than a prior. No stranger panning across Kansas can
create any part of this, and no unwitnessed poll anywhere teaches the system
anything about Alice's town.

---

## 2. Foundations first

Nothing in §3 may be built before §2 lands. Each foundation is wrong in the
current system in a way that would silently corrupt the new math.

### 2.1 Resident place — the audience anchor

**What exists.** There is no per-user location anywhere.
`users` (`schema.prisma:1328-1410`) carries `onboardingCityPlaceId`
(`:1351`) — written once at onboarding (`user.service.ts:366`), read only by the
curated-list builder, never re-derived. The only live location derivation is
**per-device**: `NotificationDevice.homePlaceId` (`schema.prisma:1226`), set to
`smallestContaining(coordinate)` at push-device registration
(`notification-device.service.ts:31-41`, `places-catalog.service.ts:600`).

That column is the seam this plan was always going to need, and the client says
so in its own comment: *"A later leg can refine 'home' with dwell clustering; the
seam (registration carries a coordinate) stays identical"*
(`apps/mobile/src/providers/AuthProvider.tsx:164-169`). Its four disqualifying
properties as an audience foundation:

1. **Not continuous** — written at registration, refreshed at most every 24h and
   only when the app foregrounds and the push registrar runs
   (`AuthProvider.tsx:179`). No scheduler.
2. **Not decayed, not travel-resistant** — it is `smallestContaining(last known
   fix)`, a single latest sample. A week in another city **overwrites home and
   never recovers it**.
3. **Device-grained, not user-grained** — no FK, `VarChar(255)` userId, two
   devices in two cities are two contradictory homes with no reconciliation.
4. **Coverage is gated on push consent** — a user who declines notifications has
   no home place at all, and is invisible to every audience read.

**The derivation.** A new table, keyed by **actor**, built by a builder in the
`UserTasteProfile` mould (delete-and-reinsert, rebuildable from empty, nothing
else writes it — `signals/user-taste-profile.builder.ts:47-58,150-151`).

```prisma
/// The place a person's activity recurs in — DERIVED, decayed, one per actor.
/// Rebuildable from signal_demand_daily; never captured, never client-supplied.
model ActorResidentPlace {
  actorId        String   @id @map("actor_id") @db.Uuid
  placeId        String   @map("place_id") @db.Uuid
  /// Decayed distinct-local-day recurrence at placeId, as of derivedAt.
  recurrence     Float
  /// Runner-up margin — the derivation's own confidence, used by nothing
  /// yet and read by the /ops surface when a resident place looks wrong.
  margin         Float
  derivedAt      DateTime @map("derived_at") @db.Timestamptz(3)
  @@index([placeId])
  @@map("actor_resident_place")
}
```

**The read that fills it.** `signal_demand_daily` already *is* a per-actor ×
place × day histogram — `(day, place_id, actor_id, kind, signal_count,
last_occurred_at)`, indexed `(actorId, day)` and `(placeId, day)`
(`schema.prisma:2519-2537`), refreshed every 15 minutes by the watermark cron
(`signal-demand-aggregate.service.ts:114`), never truncated (no TTL, no partition
drop — `signal-partition-maintenance.service.ts` only creates ahead). So the
derivation needs **no new client capture, no new permission, no new PII source**.

Three properties the query must respect, each a real trap:

- **Recurrence is distinct local DAYS, not acts.** One frantic Tuesday is not
  residence. Count `COUNT(DISTINCT day)` weighted by the ratified recency kernel
  — `dayRecencySql` (`poll-supply.constants.ts:121-127`), flat 7 days then
  halving every 14. No new decay constant is minted.
- **The place rows are a containment TILING, so a naive argmax picks the
  coarsest tile.** One act writes a row at the smallest containing place *and*
  at coarser tiling levels (`schema.prisma:2509-2518`;
  `signal-demand-aggregate.service.ts:448-505`). Rank within level using the
  shared `levelSpecificitySql` (`signals/ground-containment.ts:214-229`) and take
  the most specific tile of the winning chain — never `MAX(signal_count)` across
  levels.
- **Not every kind is evidence of being somewhere.** An `entity_view` bbox is a
  restaurant you looked at; a `viewport_dwell` bbox is where you were *looking*,
  which after §2.3 carries a zoom grain. Trust, in order: poll acts (anchored,
  `place_id` set directly — `polls.service.ts:1066,1471,2366`), `search`,
  `viewport_dwell` **at town-or-finer zoom only**. Exclude `entity_view` and the
  echo kinds (`ECHO_SIGNAL_KINDS`, `signals.service.ts:73-76`).

**Cold cases, all three answered without a guard:**

| case | behavior |
|---|---|
| **Brand-new user, day one** | No signals yet → no row. The **day-one guess** is `notification_devices.home_place_id`, which continues to exist and is consulted only when `actor_resident_place` has no row. It is a *fallback read*, not a second writer. The moment two distinct days of activity exist anywhere, the derivation owns the answer and the guess is never consulted again. |
| **User with no anchorable sessions** (declined location, declined push, browses only at continental zoom) | No resident place. **They are not in anyone's audience.** This is honest, matches the ledger's existing "NULL homePlaceId → never pushed" posture (`notification-device.service.ts:74`), and fails in the safe direction: an uncounted person understates a budget; a fabricated one is how we got 16,225 towns. |
| **VPN / geo noise / a week in Tokyo** | Decayed distinct-day recurrence is exactly the right instrument. A 7-day trip contributes 7 days against a home that has been accumulating for months; the flat-7-then-halving kernel means the trip peaks at ~7 units against a home equilibrium of ~2× the weekly rate. A *move* wins after roughly three weeks, which is the correct latency for a move and the wrong latency for a holiday. **`margin` records how close the call was.** |

**Privacy posture — non-negotiable, and the build reds without it.** The census
(`identity/person-data/person-data-census.spec.ts:11-45`) enumerates every
`(table, column)` in `schema.prisma` and fails the build naming any column not
declared in `PERSON_DATA_RULES` or `COLUMN_COVERAGE`. The rule for this table:
disposition `delete_row`, locator **`personScopeSql`, not `personKey`** —

```
actor_id IN (SELECT actor_id FROM signal_actors WHERE user_id = $1::uuid)
```

— copied verbatim in shape from `user_taste_profile.actor_id`
(`person-data-class.ts:430-447`), whose header records the exact bug this avoids:
`WHERE actor_id = <userId>` matched nothing and **the inferred profile survived
deletion, silently**. Do not invent a variant. Note also the eraser's order
(`delete_row` → `null_column` → `sever`, `plans/account-deletion-ideal-shape.md:75-77`)
and the standing residual at `person-data-class.ts:1356` — do not design a rule
whose correctness depends on that ordering.

**Naming caution.** "Resident" is already the mobile scene-residency vocabulary
(`plans/residents-cutover-plan.md` is about resident legs in the track sheet, not
about people). Different layer, different word-family; the owner's term is kept,
but a reader searching `residents` will hit the UI plan first.

### 2.2 The engagement ledger — one stream for "an act that touched a poll"

**What exists, verified.** `SignalKind` is a closed union of nine
(`signals.service.ts:21-33`). Poll acts write three of them, all **anchor-shaped**
(`geo: null`, `placeId: poll.placeId`), which means poll engagement never enters
the geometric tiling path and is already clean:

| act | signal today | site |
|---|---|---|
| endorse (a "vote") | `poll_vote`, **first create only** | `polls.service.ts:2366-2397` |
| comment | `poll_comment` | `polls.service.ts:1471-1478` |
| create a poll | `poll_created` | `polls.service.ts:1066,1260` |
| **comment like** | **NONE — confirmed** | `@NoSignal('comment like is agreement with a person, not demand for a subject; no declared kind covers it')`, `polls.controller.ts:270-272` |
| poll open / read | NONE | GETs are outside the coverage audit's definition of an act (`signal-coverage.audit.ts:20-25,141`) |
| share a poll | **no writer exists at all** | — |

Owner ruling 3 says the supply economy counts **any act that touches a poll** —
bar tap, comment (even off-topic or funny), reply, comment-like. Three of those
six rows are invisible today.

**The ideal single stream.** Do **not** collapse the acts into one kind. The
ledger's own ratified law is *"kinds are ACTS; qualifiers are meta"*
(`plans/geo-demand-foundation-rebuild.md` §3), and collapsing would destroy the
distinction the leaderboard and the feed still need. Instead:

1. **Add one kind: `poll_comment_like`.** Delete the `@NoSignal` at
   `polls.controller.ts:270` and write the signal in `toggleCommentLike`
   (`polls.service.ts:1593-1615`), anchor-shaped like its siblings, meta
   `{ pollId, commentId }`. `commentId` must be added to `SIGNAL_META_KEYS`
   (`signals.service.ts:153-187`) or `compactMeta` drops it with a warn
   (`:473-491`). The `@NoSignal` reason was correct about *demand* and wrong
   about *engagement* — its own words, "agreement with a person", is precisely
   what ruling 3 says now counts.
2. **Declare the set, once:**
   `export const POLL_ENGAGEMENT_KINDS = ['poll_vote','poll_comment','poll_comment_like'] as const satisfies readonly SignalKind[];`
   beside `ECHO_SIGNAL_KINDS` in `signals.service.ts`. One literal, imported by
   the writer-side audit and the harvest reader — the `ballot-document-marker.ts`
   pattern (§10 registers the matching invariant).
3. **`poll_created` is excluded**, deliberately: a seeded poll has no creator act,
   so including it would let a place's user-poll creation rate masquerade as
   engagement with the system's own supply. Say so in the constant's comment.
4. **Poll opens and shares stay unrecorded** for now. A GET-shaped act needs the
   coverage audit's definition widened, which is a separate and larger change;
   and an open is not yet an engagement the owner ruled on. §12 Q4.

**Act identity and echo, for the new kind.** The dedupe grain is
`(kind, request-id)` with `signal_id` as the fallback identity
(`signals/act-identity.ts:17-27`), retry-deduped by the aggregate's
`ROW_NUMBER() OVER (PARTITION BY s.kind, DEDUPE_KEY_SQL …)` plus a cross-midnight
anti-join (`signal-demand-aggregate.service.ts:344-387`). A comment-like carries
no parent request id, so it is its own act — which is correct: two likes on two
comments are two engagements. `poll_comment_like` is **not** an echo kind; it is
never emitted as a side effect of another act.

**Acts, not actors — with the saturation the repo already owns.** Ruling 3 says
the supply economy counts engagement *acts*, while distinct-user rules keep
governing leaderboard standings (`polls.service.ts:1988-2004`, PK
`(pollId, subjectType, subjectId, userId)` at `schema.prisma:1195-1210`). Raw act
counting is gameable — one enthusiast liking forty comments would manufacture an
audience. The damper is not a new rule: it is the demand kernel's existing
per-actor saturation, `Σ_actors log2(1 + Σ acts)`
(`demand-mass.reader.ts:95-100`). Options and the call are in §4.2.

### 2.3 The attention resolution law — a settle is attention at its own grain

Owner ruling 6. Three changes, and one deletion that does most of the work.

**Zoom must survive into the row, and today it cannot.** The client sends exactly
`{ bounds, dwellMs }` (`apps/mobile/src/services/signals.ts:15-24`, called from
`viewport-subject-store-controller-core.ts:263-292`); the DTO has exactly two
fields (`dto/record-viewport-dwell.dto.ts:43-57`); `zoom` is not in
`SIGNAL_META_KEYS`, so even a caller that passed it would have it silently
dropped. Fix all three: DTO field, meta allow-list entry, and the controller
write (`signals.controller.ts:38-67`).

**The law.** *A settle at zoom z is attention at the grain z resolves to, and
never below it.* Concretely: the write-side tiling already stores one row at the
coarsest contained place and is **correct** — leave it alone. The defect is
entirely the read-side `up` branch of `lineageCtesSql`
(`demand-mass.reader.ts:139-146`), which hands the coarse tile to every
descendant root at weight 1. **Retire lineage descent for poll reads.**

That deletion is nearly free here, because after §3 the poll ritual no longer
reads place attention for its budget at all:

- `placesWithAnySignal` (`demand-mass.reader.ts:394-424`) **leaves the ritual**
  entirely — candidates are places with audience (`poll-weekly-ritual.service.ts:188-196`).
- `placeDemandMass` **leaves the ritual's budget path** — `weeklyDemandMass` is
  no longer a controller input.
- `subjectDemandMass` (`:253-377`) **stays**, and is already immune to the
  subjectless-dwell fan-out: it sets `subjectScope: 'entity'` (`:290`), so a
  dwell with no subject never reaches it. What survives of the fan-out there is a
  coarse *search* with a resolved entity riding the `up` chain down to every
  town — which the zoom grain now discounts.

**What attention keeps.** Both of its real jobs: **which subjects** a place polls
(`rankSubjects`, `poll-weekly-ritual.service.ts:609-663`) and **collection
targeting**. Neither is load-bearing for whether a town exists in the economy.

**Dwell duration and the settle-vs-search ratio** are the one place this section
cannot finish itself. `KIND_WEIGHT_PRIOR = 1.0` (`demand-mass.reader.ts:67`) makes
a one-second continental pan weigh the same as a deliberate search, and §16's
no-fake-estimates law forbids inventing "a settle is worth 0.25 of a search."
Per-reader kind weights are already inventoried as a K2 estimator in §16 — that
is the ideal home, but it needs an owner sentence or a measurement to start from.
**§12 Q3.**

---

## 3. The new controller math

### 3.1 The budget

```
audience(P)      = |{ u : residentPlace(u) ∈ claimedSubtree(P) }|          [people]
engagementRate(P)= estimator 'poll.engagementRate', hierarchical place→global→prior
price(P)         = estimator 'poll.price'          (the 15, re-denominated)

budgetRate(P)    = audience(P) × engagementRate(P) ÷ price(P)              [polls/week]
```

Credit accrual and decay are **retained verbatim** from
`poll-supply-controller.ts:186-198` — decay the balance on the 14d half-life, add
`budgetRate × elapsedWeeks`, spend 1 per published poll inside the publish
transaction (`poll-weekly-ritual.service.ts:902-922`). The decay *is* the
anti-trickle law and no minimum-demand constant exists anywhere; that property is
preserved exactly.

**The seat law — one person funds one town.** Hostable places are visited
finest-first each Sunday; a place's audience counts the residents of its subtree
**not already claimed by a finer place that published this week**. Without it, a
neighborhood, its city, its county and its state would each count the same person
and the ancestor chain would re-inflate exactly the way the lineage `up` branch
did.

The obvious objection is real and worth stating: a neighborhood resident who
engages with the *city's* poll inflates the city's measured rate over a
denominator that excludes them, and deflates their own neighborhood's. **This
self-corrects, and the correction is the mechanism finding the right grain**: the
neighborhood's measured rate falls, it stops publishing, its residents' seats
release upward to the city, and the city's denominator becomes correct. The seat
law converges to the grain at which engagement actually happens, which is the
grain at which polls should be hosted. It is not a guard; it is the search.

### 3.2 Warm start, and the exploration grant

A town with audience but no history has **no learned rate**, and this is where the
old design's trap would otherwise reappear at a new location: with `price` at its
prior of 15, a two-tester town computes `2 × prior_rate ÷ 15 < 1`, publishes
nothing, is therefore never witnessed, and never learns. A new fixpoint of the
same disease.

**The unmeasured-place exploration grant.** A place is granted one poll per cycle
**exactly while its engagement estimator reports no measurement** — and the
registry already computes that signal and nothing else does:
`read()` returns `uncertainty: Infinity` whenever `nEffective <
MIN_EFFECTIVE_N_FOR_MEASURED_DISPERSION = 2`
(`estimators/estimator-registry.ts:290-320`). So:

```
grant(P) = (audience(P) >= 1 && !Number.isFinite(engagementRate.uncertainty)) ? 1 : 0
cohortTarget = max( grant(P), min( round(budgetRate), floor(credit) ) )
```

Four properties fall out, and each is one the old design bought with a separate
mechanism:

- **Zero→one is one Sunday** (ruling 9). There is no learned despair to overcome:
  the grant depends on the estimator having no measurement, and on audience,
  and on nothing else. A town that gains its first resident publishes the
  following Sunday.
- **A two-tester town works**, on exactly the same code path as a real city
  (ruling: testing-scale maps to the same path). Audience 2, unmeasured, grant 1.
- **Ghost towns still terminate.** A place with residents who demonstrably do not
  engage accrues real observations of `engagementRate ≈ 0`; at `nEffective ≥ 2`
  the grant withdraws and the budget is zero. This is `answerYield`'s
  contraction-to-zero fixpoint, inherited whole (§4.6).
- **Seasonal regain is free.** Evidence decays; when `nEffective` falls back below
  2 the place is unmeasured again and re-probes. That is the `timeWidening`
  invitation spelled out in the registry's own comment (`:290-308`), obtained
  without a second mechanism.
- **The old anti-seeding law is not weakened — it is replaced by something
  stronger.** The floor used to be on the frontier and never on the credit,
  precisely so one searcher could not seed a town
  (`poll-supply-controller.ts:11-16`, fixture at
  `poll-weekly-ritual.service.spec.ts:320`). That protection existed because
  *attention* was the input and a stranger's viewport could manufacture it. The
  grant is gated on **residents**, which a stranger cannot manufacture. The
  §17 fixture survives and gets stronger: a searcher with no resident place
  produces audience 0, grant 0, and — via the unchanged no-residue guard at
  `poll-weekly-ritual.service.ts:707-714` — **zero rows**.

### 3.3 The median test and the ±1 dither — adjudicated, and they die

The owner asked directly whether the dither survives. **No, and the frontier goes
with it.**

The dither existed for one reason, stated at `poll-supply-estimators.ts:49-53`:
`poll.viability`'s consumer gates its own observations, so the closed-loop
measurement law (`estimator-registry.ts:152-159`, which *throws at registration*)
requires an excitation source, and the median test's bounded ±1 oscillation was
declared to be it.

Two things change that:

1. **The frontier is now redundant.** It was a separately-learned capacity
   governed by the median test. `budgetRate` computes capacity directly from
   audience and rate. Keeping both is two controllers measuring one thing, and
   the median test's input — the weakest poll's distinct-voter count
   (`poll-supply-controller.ts:212-217`) — is a strictly worse estimate of the
   same quantity than the rate the estimator now learns directly.
2. **`price` still gates its own observations, so it still needs exploration —
   just not this one.** Register `poll.price` with `exploration: 'timeWidening'`,
   which is legal, already implemented (`estimator-registry.ts:325-334`:
   uncertainty grows with silence), and honest: a place that has not demonstrated
   a good poll recently becomes uncertain, falls below the measured threshold, and
   receives the grant again. **The exploration is the grant, and the grant is
   already load-bearing for three other reasons.** One mechanism, four jobs.

So `SupplyState.frontier` and `SupplyState.phase` lose their meaning, `decideSupply`
loses `medianTestProbability`, `normalCdf`, `predictFrontier`, and
`lastClosedCohortAnswerCounts` as an input. `MEDIAN_TEST_MAJORITY` and
`FRONTIER_STEP` are deleted from `poll-supply.constants.ts:81-83`;
`EXPLORATION_SLOT` survives as the grant's magnitude, still K6-definitional.

`round(budgetRate)` replaces the frontier as the per-cycle cap, so credit that has
accumulated across a quiet month cannot dump a three-week burst in one Sunday
(credit equilibrates near 2.9× the weekly rate under the 14d half-life).

### 3.4 The witnessed-observation gate

**Only cohorts launched into a real audience ever teach.** This is ruling 4, and
mechanically it is one line moved, not a new subsystem.

Today `observeCohort` skips the conversion/yield observation when
`outcome.attentionMass <= 0` (`poll-supply-estimators.ts:144`), and
`attentionMass` is read back from the **birth certificate stamped at publish** —
`metadata.birthCertificate.controller.weeklyDemandMass`, first finite stamp wins
(`poll-weekly-ritual.service.ts:548-560`). The stamp exists precisely so history
is never re-evaluated: *"the stamp IS the launch-time fact, immune to ledger
backfills and reader-algebra changes"* (`:490-497`).

**Stamp `audience` on the birth certificate at publish, and gate every observation
on it.** `CohortOutcome.attentionMass` becomes `CohortOutcome.audience`; the guard
becomes `if (outcome.audience > 0)` and now covers **all** observations including
`price` (today the viability loop at `poll-supply-estimators.ts:177-185` runs
outside the mass guard — that is the exact hole through which 16,225 zero-audience
cohorts taught the estimator that a good poll needs 3.4 votes).

This same line is the **amnesty mechanism** (§6): every poll published before the
cutover has no `audience` stamp, so it is unwitnessed by construction and teaches
nothing, forever, with no date literal in the code.

**Definition of "witnessed", options mapped in §4.3. Recommendation:
`audience ≥ 1` at launch, stamped.**

---

## 4. Every decision, mapped

### 4.1 Which places host polls

| option | consequence |
|---|---|
| Every place with audience > 0, exact-match at the resident-place grain | No double counting, but a person's town has audience 0 when everyone's resident place resolves to a neighborhood — the town never publishes and the neighborhood is too small to. **Fails.** |
| Every place, subtree audience, no claim rule | The state, the county, the city and the neighborhood each count the same person. Re-creates the ancestor inflation the lineage `up` branch caused. **Fails.** |
| Structural grain (only the coarsest place below the subdivision line) | Would be elegant, but the DAG does not support it: `isSubdivisionOrBigger` is a depth-≤1-from-root test (`places/place-dag-read.ts:68-96`), and sketch chains hang municipalities under a **county** as often as a subdivision — so the "coarsest below subdivision" is frequently the county. "Best restaurants in Travis County" is not a poll. **Fails.** |
| **Every place, subtree audience, seat law (finest-first claim)** ✅ | No double counting, no grain constant, and the grain self-corrects toward wherever engagement actually happens (§3.1). Costs one ordered pass per Sunday over hostable places. |

**Recommendation: the seat law.** Note the interaction with pushes: subdivision+
places are already feed-only and never pushed
(`notifications.service.ts:54-60`), which remains true and unrelated.

### 4.2 Acts or distinct actors, for the price denominator

| option | consequence |
|---|---|
| Distinct actors | Loses exactly the richness ruling 3 exists to capture — a thread where two people exchange nine comments reads as 2. Contradicts the ruling. |
| Raw acts | One enthusiast liking forty comments manufactures an audience; the price estimator learns that a good poll needs forty acts and the town's budget collapses. |
| **Acts, saturated per actor by `log2(1 + acts)`** ✅ | The forty-like enthusiast counts as ~5.4; a nine-comment exchange between two people counts as ~6.5, comfortably more than two. Uses the demand kernel already ratified and implemented (`demand-mass.reader.ts:95-100`), so no new law and no new constant. |

**Recommendation: saturated acts.** Distinct-user rules are untouched for
leaderboard standings (`polls.service.ts:1988-2004`) — the two currencies are now
explicitly different, and `product/polls.md` line 62 already ratifies the
multi-path shape (§8).

### 4.3 What "witnessed" means

| option | consequence |
|---|---|
| `audience ≥ k` for k > 1 | `k` is an unclassifiable constant under §16 — not a fact, not an owner sentence, not a derivation. And it would make a two-tester town permanently unteachable, contradicting ruling 9. |
| "was notified" | Delivery failure is **our** bug (§7 shows it is a live one at 100/min). A poll whose push was delayed 16 hours still had a real audience; punishing the estimator for our dispatcher is measuring the wrong thing. |
| **`audience ≥ 1` at launch, stamped on the birth certificate** ✅ | Matches the existing `attentionMass > 0` shape exactly (one line re-pointed), is immune to backfills, and is the amnesty mechanism for free. |

**Recommendation: `audience ≥ 1`, stamped.**

### 4.4 The bootstrap poll under audience gating

`useBootstrap = selection.length === 0 && cohortTarget >= 1 && bootstrapAvailable`
(`poll-weekly-ritual.service.ts:736-739`) mints "Best restaurants in {place}"
inline (`:761-784`; localized via `entity-display/recipe-messages.ts:91-92`).

**It survives, and it becomes safe automatically.** Its danger was never the
question — it was that a place with fabricated attention could reach
`cohortTarget >= 1` with no subjects and mint one anyway, which is how 16,225
towns each got a "Best restaurants in nowhere" poll. Under §3, `cohortTarget >= 1`
now requires **audience ≥ 1**, so the bootstrap can only fire where somebody
lives. That is exactly the case where "Best restaurants in your town" is the right
first poll, and it is precisely the poll Alice gets in §1.

Killing it instead would leave a resident town with no ranked subjects (the
common cold-start case, since subject mass requires prior search) with a grant it
cannot spend — a town with people and no polls, which is the failure this whole
plan exists to end. **Keep it.**

### 4.5 Testing scale

No special path. Audience 2, engagement estimator unmeasured, grant 1. The
concrete loop is §9.

### 4.6 What happens to `answerYield`'s termination role

`answerYield` was the one estimator **exempt** from the closed-loop exploration
law, on the owner-ratified ground that contraction-to-zero is its *desired*
fixpoint (`poll-supply-estimators.ts:101-105`,
`estimator-registry.ts:33-36`). `engagementRate` is its successor and inherits
both the role and the exemption: register it `consumerGatesObservations: false,
exploration: 'none'`.

Is the exemption still honest? Yes, and more so. `engagementRate`'s observations
are gated by whether a poll was **published**, which the budget decides — but the
grant guarantees that any place with an audience and no measurement gets a poll,
so the estimator can never be starved into silence by its own consumer. The
excitation that the exemption used to hand-wave is now structurally present.

### 4.7 The `loadCooldowns` coupling

`product/polls.md:55` blesses it: *"A user poll targeting an entity bumps that
entity's last-polled timestamp like the scheduler does, suppressing a redundant
app poll on the same subject."* The code (`poll-weekly-ritual.service.ts:569-607`)
over-delivers on that sentence in three ways. Verdict: **bless the subject arm,
bound it, and sever the bootstrap arm.** Details in §5.4.

---

## 5. The live bugs, each with its ideal shape

### 5.1 `closesAt` is missing from `getPoll` — one timing authority

**Confirmed.** `Poll` has **no `closesAt` column** (`schema.prisma:1085-1124`:
only `scheduledFor`, `launchedAt`, `closedAt`, `graduatedAt`). `closesAt` is
computed inside `attachPollStats` (`polls.service.ts:2745-2753`), whose only two
callers are the feed (`:605`) and the user-poll list (`:2532`). `getPoll`
(`:1273-1312`) calls neither, so `GET /polls/:pollId` omits `closesAt`,
`commentCount`, `endorserCount`, `topCandidates` **and** `creator`. In-app
navigation hides this because the detail panel seeds from the feed row
(`PollDetailPanel.tsx:631,647,690,774`); a **share-link open** falls through to
`fetchPoll` and loses all five.

**Ideal shape: close time is a column, written once, read everywhere.** Add
`Poll.closesAt Timestamptz?`, computed at publish/creation from the window and
never recomputed. Three defects collapse into one fix:

- `getPoll` returns it because it is a column, not because someone remembered to
  call an enrichment helper.
- The lifecycle cron selects `WHERE closes_at <= now()` — an **indexable**
  predicate, replacing today's coarse pre-filter plus per-poll JS re-derivation
  (`poll-lifecycle.service.ts:37-60`, `poll-timing.ts:79-89`).
- The card countdown and the close pass read the same instant by construction,
  which is what `poll-timing.ts:38-41` says it wants and cannot enforce.

`resolvePollClosesAt` survives as the **single writer** of that column;
`extractCloseWindowDays` and the metadata round-trip are deleted from every read
path.

### 5.2 The leaderboard safety-net sweep is dead

**Confirmed.** `aggregateActivePolls` selects
`{ state: active, updatedAt: { gte: now-90min } }`
(`poll-aggregation.service.ts:53-61`). `Poll.updatedAt` is `@updatedAt`
(`schema.prisma:1108`) and Prisma bumps it only on a **`Poll` row update**. The
only three `prisma.poll.update` calls in the entire API are in
`poll-graduation.service.ts:151,281,387` — and the first flips `state` to
`closed`, so the row immediately fails the sweep's own predicate. Comments, likes,
endorsements and leaderboard rebuilds all write other tables
(`polls.service.ts:1453,1511,1527,1593-1613,2327,2337,2014-2026`).

Net: **the sweep matches only polls created in the last 90 minutes** and rebuilds a
leaderboard that was rebuilt inline moments earlier. A poll whose inline rebuild
threw an hour after creation is never repaired — exactly the failure the sweep
was written to catch. The index `idx_polls_state_updated_at`
(`schema.prisma:1120`) exists solely to serve this dead query.

**Ideal shape: the trigger is a projection watermark, not a timestamp nobody
writes.** `PollLeaderboardEntry` already has `updatedAt`
(`schema.prisma:1174-1193`), but a poll whose rebuild produced **zero** rows has no
row to carry it. So: record the projection's own clock per poll —
`poll_leaderboard_state(poll_id, computed_at)`, written by
`rebuildPollLeaderboard` inside its existing advisory-locked transaction
(`polls.service.ts:2006-2027`) — and let the sweep select

> active polls whose newest input (`poll_comments.loggedAt/editedAt`,
> `poll_comment_likes.loggedAt`, `poll_endorsements.createdAt`) is **newer than
> `computed_at`**.

That predicate can actually see a failed rebuild, which is the only thing that
makes a safety net a safety net rather than a cost. The alternative — **delete the
sweep** — is cheaper and more honest than what exists today, and is the right call
if the watermark table is judged not worth its weight; but it removes the only
repair path for a projection that has no other. **Recommend the watermark.**

### 5.3 Close is quantized to 02:00

**Confirmed.** Advertised close is exact to the millisecond
(`poll-timing.ts:42-61`); actual close is
`@Cron(CronExpression.EVERY_DAY_AT_2AM)` (`poll-lifecycle.service.ts:35-36`) with
**no `timeZone` option**, so it runs at 02:00 in the container's zone (UTC on
Railway). Lateness is uniform on **[0, 24h)**, ~12h average. A seeded poll
launched Sunday 09:37 local nominally closes 09:37 the following Sunday and
actually closes 02:00 Monday — **~16.4h late**. Meanwhile `formatDaysLeft`
returns null once `msLeft <= 0` (`PollsPanel.tsx:134-142`) while the card still
shows `live` (`:176-183`) and endorsements still succeed
(`polls.service.ts:2294-2299`). The user is told the poll is over and can still
vote in it.

**Ideal shape:** with `closesAt` a column (§5.1), run the close pass **hourly**
selecting `closes_at <= now()`. Lateness drops to < 1h, the same resolution the
ritual's own publish already runs at (`poll-weekly-ritual.service.ts:142`), and
the advertised "closes the following Sunday" becomes true rather than
approximately true. A finer cadence buys nothing a weekly ritual can perceive.

### 5.4 `loadCooldowns` reads user polls with no origin filter

**Confirmed.** `prisma.pollTopic.findMany({ where: { placeId: { in: placeIds } } })`
(`poll-weekly-ritual.service.ts:569-583`) — **no origin filter, no source filter,
no date bound.** User topics carry `placeId` and a target
(`polls.service.ts:995-1001`) with `metadata.source: 'user'` and no `weekOf`, so
they fall back to the `createdAt` day label — which sorts *newer* than any seeded
label and wins the max.

Consequences, each adjudicated:

- **Subject suppression is real and INTENDED** — `rankSubjects` hard-drops any
  subject failing `rampRecovered` (`:620-631`), so a user poll about a dish makes
  that dish structurally unavailable to the ritual for the ramp. This is exactly
  `product/polls.md:55`. **Bless it** — and make it deliberate rather than
  incidental by joining through `Poll.origin` and naming both arms in the query,
  so a future reader sees a decision instead of a missing `where`.
- **Bound it.** The query scans the full history of `pollTopic` for the pending
  places with no horizon (contrast the harvest's 280d bound at `:394-402`).
  Correctness is unaffected — only the max label matters — but the scan grows
  forever. Bound it by the cooldown's own derived horizon, the way
  `DEMAND_KERNEL_HORIZON_DAYS` is derived (`poll-supply.constants.ts:100-106`): no
  new constant.
- **The bootstrap arm must be severed.** `bootstrapByPlace` folds in **any**
  `best_restaurants` topic (`:591-596`). Today a user cannot create one —
  `createStructuredPoll` throws `'Unsupported poll type'`
  (`polls.service.ts:959-961`) even though the DTO accepts the enum
  (`create-poll.dto.ts:51-52`) — so the F7-class unbounded suppression is
  **latent, not live**. It becomes live the day that switch gains a case. Filter
  `bootstrapByPlace` to seeded topics now: the structural bootstrap is the
  *system's* cold-start instrument, and a user's opinion poll of the same shape
  must not be able to switch it off.

  Worth recording, because it inverts the intuition: user polls today **increase**
  bootstrap firing, since suppressing subjects drives `selection.length === 0`,
  which is the bootstrap's trigger (`:736-739`).

---

## 6. Migration and amnesty

**The amnesty needs no dates.** Ruling 7 asks for a lane-4-style clear of the
poisoned July/August cohorts: idempotent, criteria-scoped, polls stay as rows.
§3.4 delivers exactly that as a **property of the new gate rather than a
migration**: evidence requires an `audience` stamp on the birth certificate; every
poll published before the cutover has none; unstamped ⇒ unwitnessed ⇒ teaches
nothing, forever. No date literal, no list of ids, idempotent by construction,
and impossible to forget to re-run.

Belt-and-braces, and cheap: the harvest's 280-day lower bound
(`poll-weekly-ritual.service.ts:394-402`) means the pre-cutover cohorts also
physically leave the input set by ~2027-05 regardless.

| artifact | disposition | why |
|---|---|---|
| **16,226 `poll_place_supply` rows** | **DELETE ALL** | Their entire content — `frontier`, `phase`, `credit` — is denominated in a retired currency. Worse, keeping them makes every ghost town "a place WITH state", which **falls through** the no-residue guard at `poll-weekly-ritual.service.ts:707-714` and keeps ticking forever. Towns with audience re-derive their state on the first Sunday; towns without one correctly leave no trace. |
| **17,931 polls** | **KEEP, archived** | Place-grounded content is not destroyed here (the standing law), and their threads — such as they are — are already the graduation pipeline's input. They teach nothing (no `audience` stamp) and they never re-publish (no supply row). |
| **`poll_weekly_ticks`** | **KEEP** | A publish ledger. It records what happened; deleting it would make the incident unreconstructable. It also cannot cause a re-publish: the row's only effect is to *suppress* one. |
| **`poll_topics` for those polls** | **KEEP**, but see §5.4 | They feed `loadCooldowns`. Once the horizon bound lands, they age out on their own. |
| **Estimator evidence** | **Nothing to delete** | The registry has no store in this lane (`poll-supply-estimators.ts:81`); beliefs are replayed every tick. This is the same property that made recovery take 9 months, and it is now the property that makes amnesty instantaneous. |

**Closing the 17,931.** They are `state: active` with `closeWindowDays: 7` and
launch dates in the past, so the lifecycle cron will close **and graduate** them
on its next pass. Graduation submits each thread to the collection pipeline
(`poll-graduation.service.ts`). At 17,931 polls that is a **real cost risk** and
must be handled before the cron is unpaused: **graduation of a poll with zero
approved comments and zero ballots must be a no-op that stamps `graduatedAt`
without invoking collection.** Verify the current short-circuit before assuming
one exists; if it does not, it is a prerequisite of this migration, not a
follow-up. Run `./scripts/rig/cost-reconcile.sh` after the close pass regardless
(both the Gemini **and** Places lines — the $118 lesson).

**Order of operations.** (1) §2 foundations + the person-data rule, so the census
does not red the build. (2) `Poll.closesAt` backfill (§5.1) — a pure derivation
from `launchedAt` + window, safe on 17,931 rows. (3) The graduation short-circuit.
(4) `DELETE FROM poll_place_supply`. (5) The controller cutover. (6) Unpause. Heed
`apps/api/prisma/migrations/AUTHORING.md` — prod postgres has a small `/dev/shm`
and any wide rewrite needs the parallel-worker guard.

---

## 7. The notification moment

Ruling: the 09:00 appointment must actually reach phones at 09:00 local. Today it
cannot, and the reasons are structural.

**The throughput ceiling is a `take`, not a rate limiter.**
`NotificationDispatcherService.dispatchPending()` is `@Cron(EVERY_MINUTE)`
(`notification-dispatcher.service.ts:60`) with `take: 100` (`:92`), ordered
`createdAt asc`. `EXPO_BATCH_SIZE = 100` (`:43`) is a batch size, so the batching
loop always runs exactly one iteration — Expo is not the constraint, the `take`
is. **100 rows/minute, global, strict FIFO across every place.**

Sunday 09:00 local is a **moving wall**: every place in one UTC offset band
publishes inside the same minute (`poll-weekly-ritual.service.ts:213-234`, jittered
only *within* the minute at `:322-346`), minting all their notification rows at
once inside the publish transactions (`notifications.service.ts:88-92`). Fifty
towns × 2,000 devices = 100,000 rows in one minute ≈ **16.7 hours to drain**. The
whole band degrades together; the last person is notified Monday.

**The fix shape, in order of leverage:**

1. **Raise the ceiling and make it a real rate.** The `take: 100` is a K7
   plumbing bound with no stated band. Expo accepts 100 per HTTP request and many
   requests per minute; the honest shape is *N chunks of `EXPO_BATCH_SIZE` per
   tick*, with N chosen against Expo's published limit and stated as a band
   ("≫ our fleet, ≪ Expo's limit"), not a number someone picked.
2. **Order by the appointment, not by insertion.** `ORDER BY scheduledFor ASC,
   createdAt ASC`. The `scheduledFor` rail already exists end to end — honored by
   the dispatcher predicate (`:74`) and by the producer
   (`notifications.service.ts:71-78`) — and **no caller ever sets it to a future
   time.** It is a working, unused rail.
3. **Then the appointment becomes expressible.** A device's local 09:00 is
   computable today: `effectiveTimeZone(residentPlace)` +
   `localParts` (`supply/place-local-time.ts:60-79,80-…`) — the same mechanism the
   ritual already uses per place. **Caveat that must be respected:** the nautical
   longitude fallback is documented as tolerable *"inside a 15h window"* and can
   be 2h+ off (`place-local-time.ts:1-17`). That is fine for deciding whether a
   place's Sunday is open; **it is not fine for a 09:00 push.** A device whose
   resident place has no real IANA `timeZone` should be scheduled from the place's
   stored zone or not scheduled to a wall-clock hour at all.
4. **Store the device's own timezone.** Nothing stores it —
   `RegisterDeviceDto` has no field, `SIGNAL_META_KEYS` has no key, and the mobile
   app never calls `expo-localization`'s `getCalendars()`. Adding it makes the
   appointment exact instead of inferred, and it is one DTO field plus one column.

Also true and worth recording: **there is no poll-close notification at all**
(`poll-lifecycle.service.ts` has zero notification references), while
`product/polls.md:56` and line 113 still discuss it as an open question — even
though the *release* push shipped and went undocumented (§8).

---

## 8. `product/polls.md` corrections (ruling 10)

The file's own preamble forbids "superseded" notes — edit in place. Its sections
are unnumbered; the owner's "§54/§55/§62" are **line numbers**.

| line | today | correction |
|---|---|---|
| 11 | "a **per-market feed**" | Markets were exterminated 2026-07-22. It is a **bounds/place-keyed** feed (`polls.service.ts:307-308`). |
| 28 | "No market picker … 'Posting to {market}'" | Conclusion survives, vocabulary is dead — it is a **place**; the panel takes `placeName` (`PollCreationPanel.tsx:68`). |
| 35 | "active **market** polls" | active polls **in the request bounds**. |
| 52 | "3–14 day close window, default 7" | True for user polls (`poll-timing.ts:15-17`) but the client offers only **three options** — 3d / 1w / 2w (`PollCreationPanel.tsx:60-64`) — and the *un-windowed* fallback is **4 days** (`poll-timing.ts:9-11`), which the doc never mentions. State both. |
| 53 | "2 active polls per week per **market**" | Per **place**, and it counts **attempts, not creations** (`polls.service.ts:764-800`) — a failed create burns a slot, deliberately (2026-08-01: counting successes let users retry forever while we paid per vendor lookup). User-visible; say it. |
| 54 | "publishes Sunday … pins it as 'poll of the week'" | Replace with the dynamic language: a **cohort** sized by the place's audience budget, published at **Sunday 09:00 in the place's local calendar**, jittered within the minute, with a release push to resident devices (subdivision+ places feed-only). There is no "the" weekly poll. Line 111's open question inherits this and should be re-asked in the new terms. |
| 55 | "bumps that entity's last-polled timestamp" | It is a **gaussian ramp from the last poll's window close** (`COOLDOWN_GAUSSIAN_DAYS = 28`), participating multiplicatively as `mass × cooldownAvailability × resurgenceBoost` — a hard availability gate plus a soft weight, not a boolean suppression. Record that the coupling is blessed for **subjects** and severed for the **bootstrap** (§5.4). |
| 56 / 113 | close push "as a later add" / still an open question | Still true for close — but the **release** push shipped and is undocumented. Document it. |
| 62 | endorsement = distinct users, multi-path | **Keep verbatim** — it is the ratification ruling 3 builds on. Add one sentence: distinct-user rules govern **standings**; the supply economy counts **engagement acts** (§4.2). |
| 78 | "**market** match" in autocomplete relevance | place match. |
| 21 | "No pre-seeding of options. Cold start is acceptable" | The literal claim holds and ruling 8 reaffirms it. But the surrounding cold-start story is stale: the **structural bootstrap** and the audience-grant now *are* the cold-start mechanism. Add them. |
| — | nothing about audience | Add the supply model in product terms: a town's polls are budgeted by the people who live there and how much they engage, not by how often the map passed over it. |

Ruling 8 also needs a line where none exists: **a seeded poll opens as pure
discussion.** Today that is already what the client does —
`candidates.length === 0` renders *"No standings yet — start the discussion below
to put a spot on the board."* (`PollDetailPanel.tsx:1132-1137`), the card skips the
bars block entirely (`PollsPanel.tsx:201-210`), and no pre-seeded candidates exist
anywhere (`PollEntitySeedService` resolves only the poll's *target*, never a
leaderboard row; `seedEntityIds` is written at four sites and **read by nothing**).
So ruling 8 is a **documentation and copy** task, not a build: confirm the empty
state reads as an invitation rather than an absence, and write the sentence down
so nobody "fixes" it by seeding options.

---

## 9. The testing story — two testers, this month

The point is to walk the whole loop with an audience of 2 and see each step in
data, not to simulate one.

**Setup.**
1. Both testers use the app normally in the same town on ≥2 distinct local days
   (search, pan at town zoom, open a restaurant). Verify the derivation:
   `SELECT * FROM actor_resident_place a JOIN signal_actors s USING (actor_id)
   WHERE s.user_id IN (…);` — expect one row each, `place_id` = the town,
   `margin` > 0.
2. Verify audience: the town's claimed-subtree count is 2. This is the number
   that will be stamped, so read it through the same function the ritual uses,
   not a hand-written query.

**Drive a Sunday without waiting for one.** `runTick(now)` takes an injectable
`now` (`poll-weekly-ritual.service.ts:171`) and `sleep` is injectable for the
jitter (`:129`). Add a script under `apps/api/scripts/` that calls `runTick` with a
synthetic local-Sunday instant against the **local** DB. No new prod surface, no
cron change, and it exercises the identical code path — which is the whole point
of "testing scale maps to the same path".

**Observe, step by step.**

| step | the proof |
|---|---|
| the grant fired | `SELECT place_id, week_of, published_count, factors FROM poll_weekly_ticks WHERE week_of = '…';` — `published_count = 1`, and `factors.controller` shows `audience: 2`, `engagementRate` unmeasured, `grant: 1`. |
| the poll is witnessed | `SELECT metadata->'birthCertificate'->'controller'->'audience' FROM polls WHERE …;` = 2. This stamp is what makes next week's observation legal. |
| it opened as discussion | Open it on both phones: no standings, the invitation copy, an empty thread. |
| engagement is one stream | Tester A votes on nothing (there is nothing to vote on) and comments "Kite's has the best burger". Tester B likes it and replies. `SELECT kind, count(*) FROM signals WHERE meta->>'pollId' = '…' GROUP BY kind;` — expect `poll_comment` ×2 and **`poll_comment_like` ×1**, the kind that does not exist today. |
| a candidate appeared from discussion | `SELECT * FROM poll_leaderboard_entries WHERE poll_id = '…';` — Kite's, `distinctEndorsers = 2` (author + liker, `polls.service.ts:1875-1899`). Then tap the bar on B's phone → `poll_vote` signal, still 2 distinct endorsers, **3 engagement acts**. |
| the rate is learned | Re-run the tick one synthetic week later. `factors.controller.engagementRate` is now measured (`nEffective ≥ 2` → finite uncertainty), the grant withdraws, and `budgetRate` is a computed number. Record whether it is ≥1 — with audience 2 and price at its prior of 15 it will not be, and **the town correctly goes quiet**. That is not a bug; it is the price prior doing its job at a scale of two, and it is why the grant is gated on *unmeasured* rather than on *audience*. |
| nothing leaked | `SELECT count(*) FROM poll_place_supply;` = 1. One tester pans across three states at continental zoom; re-run the tick; the count is **still 1**. This is the §17 one-searcher fixture, live. |
| the notification landed | `SELECT status, scheduled_for, sent_at FROM notifications WHERE …;` and a real phone. Compare `sent_at` to the place's local 09:00. |

**Logs.** The ritual logs `'Weekly poll ritual published'` with the controller
fields (`poll-weekly-ritual.service.ts:947-953`) — extend it with `audience` and
`grant`. Per the attribution law, read the running system: `/tmp/crave-api.log`
for the API, and remember that a Prisma migration requires the rebuild-and-restart
recipe before any of these queries mean anything.

---

## 10. Proof plan

Per the repo's laws: **an invariant is a (mechanism, mutation) pair**
(`apps/api/src/shared/invariants/registry.ts:121-136`), every entry names the
incident that bought it, and `yarn invariants` runs each mutation in CI and
requires the check to **fail**.

| id | statement | mechanism | mutation that must go RED |
|---|---|---|---|
| `polls.unwitnessed-cohorts-never-teach` | A cohort with no stamped audience contributes no observation to any supply estimator. | the single `audience > 0` gate in `observeCohort` | remove the gate → the fixture cohort with `audience: 0` moves `poll.price` |
| `polls.budget-is-audience-denominated` | A place with zero audience has zero budget, whatever its attention mass. | `decideSupply` takes `audience`, not `weeklyDemandMass` | feed a 16,000-mass, 0-audience place → must still publish nothing |
| `polls.attention-never-descends` | No poll read credits a place with an ancestor tile's act. | the poll lane's reader, with the `down`/`up` expansion gone | restore the `up` branch for `placeDemandMass` in the poll path → the coarse-settle fixture credits the town |
| `polls.engagement-kinds-are-one-set` | The writer of an engagement act and the reader that counts it use one literal. | `POLL_ENGAGEMENT_KINDS`, imported by both ends | rename the constant → `tsc` fails (the `ballot-document-marker.ts` shape, `registry.ts:712-730`) |
| `polls.one-close-instant` | A poll's close time has exactly one authority. | `Poll.closesAt`, written by `resolvePollClosesAt` only | add a second computation of close time from `launchedAt` → lint/tsc |
| `identity.a-derived-location-is-erased-with-its-person` | `actor_resident_place` is destroyed by purge. | the `PERSON_DATA_RULES` entry with the actor-join scope | swap `personScopeSql` for `personKey` → the erasure proof reds (the `user_taste_profile` incident, `person-data-class.ts:430-447`) |

**Fixtures**, extending `poll-weekly-ritual.service.spec.ts` and
`poll-supply-controller.spec.ts`, each provably RED:

- zero→one in one Sunday: a town gains one resident, publishes the next tick
- the grant withdraws at `nEffective ≥ 2` and re-arms when evidence decays below
  it (seasonal regain)
- ghost-town termination: residents, sustained zero engagement, budget → 0
- the seat law: a neighborhood that publishes claims its residents; when it stops,
  they release upward and the city's audience grows by exactly that count
- Waco invariance and the ×50-traffic sanity check, carried over from §17

**DB specs must be corpus-independent (F9981 class).** Every spec here touches
`users`, `signal_actors`, `signals`, `signal_demand_daily`, `places` and
`notification_devices` — the exact families that made four suites red on an empty
database and green on a real one. **Mint the FK parents recursively; never borrow
`SELECT … LIMIT 1`.** The verdict must be a function of the code, not of whatever
happens to be in the developer's corpus. Run every new spec against a fresh
migrated database *and* the local corpus and require identical results.

**Gold entries** apply to the attribution goldens named in §17 (tiling,
inherit-down, retroactive credit): the inherit-down golden is the one this plan
changes, and its expected output must be rewritten deliberately with the reason
recorded, not regenerated.

**One class-specific caution.** The most recurrent gate defect in this repo is
tool-absence-swallow — `if rg …` / `| grep -c || true` reading exit 2 or 127 as
PASS. Any shell-shaped check added here uses `command -v` and discriminates on
status.

---

## 11. Risks

**The price prior is now the binding constraint at small scale, and it is a
guess.** `VIABILITY_PRIOR = 15` is the *surviving* legitimate seeded prior under
the no-fake-estimates law (`plans/geo-demand-foundation-rebuild.md` §16), kept
deliberately in 2026-07-24 on the ground that its error is bounded and it
self-erases at the first real answers. Under the old math it was a divisor
competing with a fabricated numerator. Under the new math the numerator is *real
people*, so 15 is what stands between a 30-person town and its first poll:
`30 × rate ÷ 15 ≥ 1` needs `rate ≥ 0.5` engagement acts per resident per week.
That may be right. It is now much more consequential, and it will be **wrong in a
newly visible way** rather than wrong in the old invisible one. The grant is the
mitigation; §12 Q1 is the escalation.

**Re-denominating the 15 changes its unit silently.** It was votes; it becomes
saturated engagement acts, which are strictly more plentiful. A poll reaching 15
*acts* is a materially lower bar than one reaching 15 *voters*. Either the prior
moves or the sentence it encodes changes. **§12 Q1.**

**The resident derivation has a three-week move latency** and no manual override.
A user who moves cities sees their old town's polls for ~three weeks. Industry
practice (Nextdoor, Strava's local segments) is to offer an explicit "set my
area." We have no settings surface at all today (`audit/FINDINGS.md` F6618 notes
the privacy policy already points at a "Help & Support" section that does not
exist). **§12 Q2.**

**Audience coverage is bounded by who generates signals.** A user who installs,
declines everything, and browses at continental zoom is in nobody's audience. That
is the safe failure, but it means early audience numbers **understate** and early
budgets will be conservative.

**The 17,931 graduations are a live cost exposure** until the empty-thread
short-circuit is verified (§6).

**`CRONS_ENABLED=false` on the prod API** — crons live on the worker. Nothing here
changes that, but every "it did not run" symptom during rollout should check it
first.

---

## 12. Open questions for the owner

Each is genuinely a judgment, not a thing I could derive.

1. **The price of a good poll, re-denominated.** The 15 is now a divisor over
   *saturated engagement acts* rather than distinct votes, and it is the number
   that decides whether a 30-person town ever publishes. Keep 15 with the new
   unit? Restate the sentence for the new unit and pick a number? Or let the grant
   carry every small town indefinitely and treat the price as a large-town
   instrument only?

2. **An explicit "my area" override.** Should a person be able to set their
   resident place by hand, overriding the derivation — accepting that it needs a
   settings surface we do not have, and that a manual home place is the one input
   a user could use to stuff a town's audience?

3. **What a map settle is worth.** Ruling 6 says dwell duration scales weight and
   a settle is worth a fraction of a deliberate search. `KIND_WEIGHT_PRIOR = 1.0`
   currently says they are equal, and the no-fake-estimates law forbids me
   inventing the fraction. Ratify a sentence ("a settle is worth about a quarter
   of a search"), or defer to the K2 per-reader kind-weight estimator already
   inventoried in §16 — which needs a starting value anyway?

4. **Does opening a poll count as engagement?** Ruling 3 enumerated acts that
   *touch* a poll — bar tap, comment, reply, comment-like. An **open** is the most
   common act of all and is currently unrecorded (GETs sit outside the coverage
   audit). Including it would multiply measured engagement by a large unknown
   factor and change what the price means. Recommend excluding it for now; say so
   explicitly, because it is the obvious next thing someone will add.

5. **The leaderboard safety-net sweep** (§5.2): build the projection watermark so
   the net can actually catch a failed rebuild, or delete the sweep and accept
   that a failed inline rebuild is repaired only by the next interaction on that
   poll? My recommendation is the watermark, but it is a new table for a failure
   nobody has yet observed.

6. **Push pacing** (§7): raising the dispatcher's `take` is straightforward, but
   the real appointment needs a device timezone we do not store. Ship the
   ordering-and-ceiling fix now and the true 09:00-local appointment as a second
   leg, or hold the release push until the appointment is exact?
