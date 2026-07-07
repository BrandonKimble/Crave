# Search Desired-State Architecture — the chartered ideal shape (R2–R4 realized)

**Status:** red-teamed and AMENDED 2026-07-06. A 4-lens adversarial panel (concurrency/native
seam · domain coverage · performance+migration · alternative paradigms) attacked the initial
"pure desired-state reconciliation" brief, grounded in code (file:line). Every failure they
found mapped to a missing SPECIFICATION, never to a needed guard — the paradigm holds. But
the pure form was wrong in four load-bearing ways, corrected below. This document is the
authoritative shape; `plans/search-flow-plan.md` §D6 (R0–R4) is its parent charter.

**Ethos (binding):** no tactical fixes, patches, or guards — ever. Resilience comes from
illegal states being unrepresentable. Watchdogs/contracts may MEASURE and report loudly;
they never actuate. No shim may exist at any migration stage.

---

## 1. Verdict

**The most ideal shape is a HYBRID, not pure reconciliation:**

- **Desired-state reconciliation is the spine** — it is what makes arbitrary interleaving
  (zoom→toggle→zoom→toggle→zoom-out→retoggle) collapse to tuple overwrites with nothing to
  strand. Alternatives were steelmanned and lose: a pure statechart re-derives today's maze
  (the 13-key middle layer IS an informal statechart grown over interleavings); pure
  query-cache solves only the data half; event-sourcing is the worst native-seam fit;
  server-driven single-request is a resolver-internal optimization, not a paradigm.
- **The world cache adopts query-cache semantics wholesale** (keys, staleness/TTL,
  in-flight dedupe, cancellation policy, versioned pages) instead of reinventing them.
- **The reveal choreography is owned by a SMALL explicit statechart subordinate to the
  reconciler** — because the joint is genuinely sequenced (fade-out ack → covered →
  armed → joint reveal → acked) and pretending it is derivable from two values would smuggle
  hidden state into the reconciler. The statechart stays tiny and closed because the
  reconciler eats all source/interleaving combinatorics upstream: sources never talk to it.
- **Steal from the losers:** query-cache semantics (above); model-based testing of the
  reveal statechart (its full state×event table is enumerable); event-sourcing's
  append-only measurement trace (every tuple write, resolution landing, phase transition —
  replay-grade attribution as LABELS, never lifecycle).

## 2. The three-value model (amended from two)

`(desiredTuple, presentedWorld, presentingPhase)` — the panel proved two values cannot
represent in-flight presentation; the phase is real state with exactly ONE owner.

- **desiredTuple** — on the SearchRuntimeBus, ~6 keys. Written by every trigger source
  (chip, tab pill, price-sheet Done, search-this-area tap, submit, favorites launch, poll
  entity tap, deep link, future pick-mode) as their ONLY action.
  - `queryIdentity` is a SUM TYPE (extends §D6-D4's request union):
    `natural(query) | shortcut(tab-label) | entities(favorites list) | entity(poll tap)
| profileSeed(restaurantId, seedPayload)` — absorbing today's out-of-model map writers
    (seeded markers, restaurantOnly) via zero-network derivation. One writer surface is
    only true if EVERYTHING that paints the map is a tuple kind.
  - `filterVariant` (openNow, priceLevels, rising, includeSimilar), `committedBounds`,
    `tab`.
  - **Bounds enter the tuple only at commit moments** (adopt-viewport policy per trigger;
    "commit moment" reads the SETTLED camera). Live camera is an **ephemeral view input** —
    a named category that derives chrome (search-this-area chip visibility = live ≠
    committed) and NEVER enters the tuple. (Verified: no camera key exists on the bus
    today; gesture-rate changes cannot reach the reconciler.)
  - **DRAFT is a third input class:** price-sheet sliders, typed-but-unsubmitted query text
    — widget-owned buffers, invisible to the reconciler, committed as ONE tuple write at
    the commit gesture. "Chips read desired" is a per-trigger policy (chips optimistic at
    press-up; sheet commits on Done), and is stated as such.
  - **Persistence:** the tuple seeds ONCE from the persist mirror at boot; the mirror is
    demoted to write-through-only — nothing else ever reads it (kills the dual-source
    class definitionally, incl. the measured cold-start coverage/ranked split).
- **presentedWorld** — the worldId whose substrates are visibly presented. Updated ONLY
  from native acks + JS commit acknowledgments, never assumed.
- **presentingPhase** — `idle | covering(W→?) | covered | arming(W') | revealing(W') `,
  owned by the reveal statechart (§5). Replaces the 13-key/17-reason/2-watchdog maze with
  one enum in one module.

## 3. The world (amended: two resolution keys, one composition)

A **world** is the atomic presentational unit: cards (dual-list, both tabs) + pin catalog +
coverage + metadata. But resolution is TWO named keys with an explicit composition
contract (the code already disagrees with a single key — coverage is tab+filters-keyed
`includeTopDish`, cards are tab-agnostic):

- `cardsWorld(queryIdentity, filterVariant, committedBounds)` — dual-list response.
- `coverageWorld(queryIdentity, filterVariant, committedBounds, tab)` — per-tab coverage.
- **Composition:** a world for tuple T = cardsWorld(T∖tab) ⊕ coverageWorld(T). The
  sibling tab's coverageWorld is a resolver-internal WARM (today's sibling prefetch,
  kept), never part of the atomic joint. Coverage FeatureCollections are SHARED
  SUBSTRUCTURE deduped by coverage key across worlds differing only in view key.
- **Resolver ladder:** cache → local derivation → network. The derivation tier is
  LOAD-BEARING world infrastructure (it is the generalization of the two shipped T1
  fixes: dual co-mounted per-tab lists + prewarmed fingerprint frames — cardsAdmit→
  rampStart 0.8–9.4ms measured). Tab toggle and page-1 include-similar are derivations.
  A naive rebuild that drops these regresses T1 to ~300–490ms; they are part of the spec.
- **Value model:** identity = tuple; value is VERSIONED (never mutated in place).
  Pagination appends create a new value version under the same identity — choreography
  fires on identity change only. Append resolutions are keyed to their WORLD's identity
  (they may land into a non-presented cached world); only identity resolutions race
  against the desired tuple. Superseded identity resolutions COMPLETE INTO CACHE, never
  present (free resilience for A→B→A retoggle).
- **World states:** `resolving | ready(rows | empty(reason)) | failed`.
  `empty` carries a reason enum: `no_results | on_demand_pending | filtered_out` (three
  different empty-state messages). Empty is a first-class render state: message + cleared
  pins + live strip.
- **Time axis:** worlds carry `resolvedAt`; staleness/TTL semantics are explicit
  (openNow worlds are wrong after wall-clock time — a tuple-equality reconciler would
  otherwise be permanently green while factually stale). A stale-beyond-TTL cache hit is
  a designed state: present-stale + revalidate (stale-while-covered), with the reveal
  fast-path of §5.
- **Partial failure (designed, not guarded):** worlds commit both-or-neither; the
  resolver's INTERNAL sub-fetches are independently cached, so retrying a failed world
  re-fetches only the missing half (a coverage blip never re-runs the ranked search).
  On failure the world is `failed` — and the TUPLE reconciliation rule is explicit:
  desired stays, presentation shows the failed state with retry affordance; the chip
  renders its desired value with an error affordance (the optimistic chip may never
  show a state the world can silently never reach).
- **Cache residency:** every live scene-stack entry's world is PINNED (return-to-origin
  is a pin, not an LRU lottery); unpinned variant worlds are LRU'd. A pop onto an evicted
  world is a DESIGNED state (skeleton-on-pop), not a failure. Cache-hit pops skip the
  cover but still run the atomic joint (native ack round-trip is the floor).

## 4. Scenes and scope

Desired state is **per-scene-stack-entry**; the world cache is global. Whether a stack
entry OWNS a tuple is structural registry metadata (`plans/page-registry.md` §4's
"search-flow trigger vs plain push" split) — plain children (profile, settings,
followList) own no tuple and never fade the map. The persistent poll lane coexists by
scope, not by guards. Return-to-origin = repointing presentation at the origin entry's
tuple (pinned world ⇒ cache hit).

**Shared-store precondition:** no module-level mutable "current" pointers anywhere in the
presentation substrate (today's mounted-results store singletons and the coverage
active-pointer are last-writer-wins globals — the stale-236 class). Every read is keyed
by the world being presented; the mounted-results store becomes per-scene/world-keyed
BEFORE per-scene desired state ships.

## 5. The reveal statechart (subordinate, tiny, closed)

States: `idle → covering → covered → arming → revealing → idle`. Inputs ONLY:
desired≠presented edge (from the reconciler), world-ready (from the resolver), native
acks. Preemptible back to `covering` by a new generation at any state. Its full
state×event table is enumerated and model-tested; RED self-mutations prove each illegal
transition is rejected loudly.

- **Covering:** starts at the tuple write (press-up). Map fade-OUT starts NOW; our items'
  basemap-collision membership flips OFF at fade-out START (with a DECLARED min-dwell on
  collision membership — a choreography constant, RED-testable, protecting the basemap
  labels' native crossfade from retoggle churn; zero-dwell is specified out).
- **Covered-episode monotonicity:** intermediate desired changes EXTEND the episode
  (re-asserting covered is idempotent); the cover lifts only at equality. No debounce on
  desired-tuple writes. A→B→A mid-fade is a REVERSAL choreography: fade back in from
  current opacity, collision back ON — an explicit transition, not a smoothed timer.
- **Arming:** ALL substrates constructed and mounted hidden UNDER COVER, across as many
  ticks as needed (rows prepared, source frame fingerprint-built, native sources applied
  with ack). **The atomic joint is a VISIBILITY FLIP, not atomic construction** — cards +
  strip + pin fade-in start on the same tick with O(1) JS cost (this is §D6c's
  mounted-hidden election, kept and named).
- **Readiness is a DATA fact, never a render fact** (perf-fork finding, 2026-07-06):
  today "cardsReady" derives from the list's layoutEffect — RENDERING is the readiness
  oracle, so the joint is hostage to JS-thread saturation (~335ms measured while 20 cards
  lay out under cover) and the empty variant strands because zero rows can't
  "render-ready." In this design: world-ready = prepared rows COMMITTED (a store fact) +
  native sources ACKED; the list paints under the cover but is never gated on. Rendering
  under cover may overlap arming freely — it just can't hold the joint.
- **Exactly ONE structural frame per world** — an explicit RED-provable invariant (the
  perf fork measured every toggle paying TWO full five-source structural applies, ~430ms
  apart). Frame identity = worldId; a second apply for the same worldId is an acked
  native no-op by §6, and the JS frame builder emitting twice for one world is a loud
  contract violation.
- **Revealing → idle:** joint opens when the armed world == the CURRENT desired tuple's
  world; collision ON at fade-in start; `presented ← worldId` on ack.
- A wedge (desired ≠ presented beyond budget) is REPRESENTABLE and LOUD — a contract
  event with the full three-value snapshot. Nothing actuates on it.

## 6. The native contract (real protocol change, budgeted)

Native today is edge-triggered with silent-drop paths (JSON-equality dedupe :2831,
dismiss-in-progress swallow :2849 — no ack, no state update). The contract becomes:

- **Level-apply keyed by (worldId, phase), idempotent.** Re-asserting the current state
  is an acked no-op (dedup on worldId+phase, never on content — an empty→empty world
  transition still acks the new worldId; this is what kills the empty-variant/T4DEDUP
  starvation).
- **Ack EVERYTHING:** `accepted | superseded_by | dropped(reason)` + state snapshot, on
  every payload including drops. JS `presentedWorld` updates ONLY from these acks; the
  reconciler subscribes to acks with the same priority as tuple writes.
- **Acks are native EVENTS with native (mach-clock) timestamps, never JS promise
  resolutions** (perf-fork finding: the 'applied' ack rides a JS promise today, so a
  saturated JS thread delays the ack — and everything gated on it — by hundreds of ms
  while cards lay out; the measured "native apply" time was mostly starved-callback time).
  Native timestamps also make the joint-gap metric honest.
- **Retarget algebra:** a reveal assertion implies dismiss-key-clear; a reveal-key change
  during ANY phase is a retarget (the enter-lane reset already exists); the
  reveal-during-dismiss wedge (dismiss key present blocks enter forever) becomes
  unrepresentable in the payload shape itself.
- Fade-hold timers and no-active-request auto-hide heuristics are DELETED in the same
  commit the inequality-hold is born (never both alive). The existing ack plumbing
  (`NativeRenderOwnerSourceAck`, commitSequence/acknowledgedSequence) is the seed —
  rename its identity to worldId at S4.
- RED instrument: periodic native `read_state()` snapshot diffed against JS
  `presentedWorld`; divergence is a loud contract.
- LOD/collision doctrine untouched beyond the declared collision-at-fade-start + dwell.

## 7. Migration — presentation LAST, one native writer per stage (corrected)

**PROGRESS (2026-07-06/07, this campaign):**

- **Foundations SHIPPED** (b2b85f1c): tuple contract (sum-type identity incl.
  profileSeed/idle; cardsWorld/coverageWorld keys) + the pure reveal statechart with 10
  model tests (totality + RED joint invariant).
- **S1 SHIPPED** (37aa22d2 + acd4379d): coverage is a world FIELD (per-tab entries,
  identity-keyed carry-forward convergence, both commit orders converge structurally);
  the frame reads coverage ONLY from the world; the covNotReady ladder + the
  dotFeaturesRef active pointer (stale-236 class) are DELETED; failed coverage = LOUD
  degraded frame. Validated: initial/open-now/tab/zoom-then-toggle all green, the
  owner-reported zoom-vanish lane works.
- **S2 SHIPPED** (6a55bfae + a8b09439 + 7fda1311 + 1304ff3c + 0c7d8506): desiredTuple/
  generation/cause on the bus; writeSearchDesiredTuple is the ONE writer (idempotent,
  per-key delta projection of legacy keys — deleted in S4); chips/price/tab/submits
  (shortcut incl. STA + deep link, natural)/favorites/dismiss/boot-seed all write the
  tuple; the thin reader (in the orchestrator, chip-cause-scoped) adapts filter changes
  into the existing commit lanes; persist mirror is write-through-only with a LOUD
  late-rehydrate skip. Trace: append-only [TUPLE] lines (generation/cause/worldKey).
  Deferred to S3 per the edit map: entity taps fold into the sum type, profileSeed
  zero-network derivation, lane-A legacy publish deletion (values already identical).
- **S3 IN FLIGHT** (executable map: plans/search-s3-resolver-edit-map.md):
  - **Substrate SHIPPED** (9655997f world cache, d543d58f resolver core — both
    model-tested).
  - **S3-pre SHIPPED** (61e9a5cc): captureFreshCommittedBounds (writer-side settled-camera
    adopt; chips + STA adopt the CURRENT viewport in the same tuple write — the
    zoom-then-toggle lane proven on-rig via [TUPLE] worldKey bounds); entities identity
    carries listId/listType; resolver + seam landed dark.
  - **S3a SHIPPED** (7b774d21): chip-cause reruns resolve through the WORLD RESOLVER
    (cache→derivation→network); the seam's commitWorldToMountedState is the one commit
    body; coverage (BOTH tabs) fetched in parallel with cards and folded into the world
    value (the controller's post-response coverage lane starves resolver worlds — its
    snapshot registry is legacy-relay-primed — so the relay bypass the map called for
    was REQUIRED in S3a, not deferrable); load-more guards gate on isResolving().
    On-rig: A→B→A retoggle = dataReadyFrom 'cache', instant zero-network reveal.
    RED-contract lesson: world_recommitted must scope to the PRESENTED world (grounded
    in the mounted snapshot's identity), else it kills the cache's whole point.
  - **S3a leftovers → S3b:** includeSimilar page-1 local swap still legacy
    (applyIncludeSimilarLocalSwap; moves to the derivation tier once submits populate
    the cache); bbf97e85 interim block still serves legacy STA reruns; natural-identity
    chip rerun path routed but only exercised for shortcut on-rig.
  - **S3b-1 SHIPPED** (f00c95a0): shortcut initial submits + STA = tuple write +
    resolve; beginResolverSubmitForegroundUi = the surviving foreground effects;
    seam REPRESENT-NOOP (re-assert of the on-screen world skips the structural batch
    by construction and completes choreography — invariant enforced, not warned);
    onWorldCommitted keeps lastSearchRequestIdRef truthful; coverage parallel when
    market known / serialized behind cards on first-in-market; DEAD:
    executeShortcutInitialAttempt + createShortcutStructuredInitialAttemptConfig +
    primeShortcutStructuredRequest. On-rig: cold submit reveal + chip toggle +
    represent_noop resubmit all green, zero contract noise.
  - **Next: S3b-2** — natural submits through the resolver: prepareNaturalSearchEntry
    already writes the tuple; route submitSearch's non-append path to resolve();
    needs the response tab-adopt as a 'response_tab_adopt' tuple write decided from
    the landed response (resolveNaturalResponseActiveTab), history push +
    keyboard/scroll as thin post-commit effects, single-restaurant candidate
    (hide-sheet + profile auto-open) as world metadata. Then S3c (launches +
    pagination), S3d (delete the owner chain).
- S4 pending.

The brief's "native holds first" order is REJECTED: it forces a transactionId→worldId
shim and two lifecycle owners writing the same native ramp — a coexistence that cannot be
guard-free. The invariant: **exactly one native presentation writer at every stage.**

- **S1 (= R0+R1):** loud contracts + one ResultsState — and coverage folds INTO the world
  value here (a field, not a separately-keyed resource) → the covNotReady ladder
  (:1599-1664) becomes structurally unrepresentable and is deleted.
- **S2 — desired tuple, write-only:** all trigger sources convert to tuple writes (this
  completes what TR5-N's bus-read fix started); one thin reader adapts tuple changes into
  the existing submit owners. Chips read DESIRED from here. Nothing downstream changes;
  still one native writer.
- **S3 — resolver + global world cache** replace the 7 submit owners (~5k lines),
  feeding the EXISTING enter machinery through the existing single data-keyed seam
  (`handlePageOneResultsCommitted`). Transaction machine remains sole presentation writer.
- **S4 — the swap, one stage:** reveal statechart + reconciler replace the transaction
  machine; native renames to (worldId, phase) + ack-everything; fade-hold heuristics die
  in the same commit. By now identity, ack, and under-cover apply all exist — this is a
  delete-and-rename, not a coexistence. ~12–18k lines die across S3+S4.

Reusable and load-bearing (do NOT rebuild): the bus (key-scoped listeners, batch,
diagnostics), the native ack seed, the fingerprint/prewarm frame caches, sibling coverage
prefetch, dual co-mounted lists, readiness SIGNALS (their gating orchestration dies).

**Acceptance harness:** the TR5-N rig lanes + RED self-mutations become the per-stage
gates; each stage ships whole with measurements (joint gap ≤ 1 frame, zero strands under
a scripted zoom/toggle/zoom/toggle/zoom-out/retoggle torture lane, chip stability,
empty-variant reveal, basemap-label crossfade eyeball). The append-only trace (tuple
writes, resolutions, phase transitions) is the attribution substrate.
Rig gotcha (perf fork): the `toggle` perf scenario is NOT in the attribution allowlist —
lifecycle/gate events are invisible under it; drive timelines with
`search_submit_dismiss_repeat`.

**Measured latency baseline (perf fork, 2026-07-06 — the numbers each stage must beat):**
server /search/run 224–366ms for a shortcut open-now toggle (LLM not in path — the server
refactor works); coverage serialization behind the search cost ~300–460ms and was
parallelized in the fork (bbf97e85 — a resolver-shaped interim: coverage fetches against
the current viewport while the page-1 rerun is in flight; S3's resolver absorbs and
replaces this); post-response pipeline 300–470ms decomposing to rows prepare + layout +
readiness commit ~135ms, structural-frame queued→applied ~335ms (mostly JS-starved
promise-ack time, not native work — see §6 native-event acks), plus a fully redundant
SECOND five-source structural apply ~430ms later (see §5 one-frame-per-world invariant).
The joint opened at +441ms post-commit on the matched drive after the coverage fix.
S3+S4 acceptance: joint ≤ ~250ms post-commit on the same drive (server RTT + one apply),
one structural frame per world, ack delivered natively. Also measured: the circular
redraw-phase chain for reruns (rows release waits on a phase that only advances after the
reveal; resolves via a side path today) — dies with the transaction machine in S4.

**Later (resolver-internal, not architectural):** merge coverage into /search/run — one
round trip per world; the fork's serialization measurement quantifies the win.
Payload-size numbers required first.

## 8. Bug classes this makes unrepresentable (the test of the design)

covNotReady strand (coverage is world-value, not a second keyed resource) · silent staged
death (level-triggered phase machine; nothing is edge-armed) · fade-hold wedge +
basemap-labels-never-return (no native timers; hold = inequality; collision flips at fade
start with dwell) · chip-vs-handler stale-lane splits (chips read desired; one tuple) ·
cross-keyed cache mismatch (two NAMED keys with a composition contract, worldId end-to-end)
· cold-start persistence split (one seeded tuple, write-through mirror) · empty-variant
starvation (worldId-keyed acks, content-dedup banned) · toggle-back stale-pointer class
(no mutable current pointers; world-keyed reads only).
