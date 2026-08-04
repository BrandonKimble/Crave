# THE TRANSITION END-STATE CONTRACT

2026-08-03. Phase 0 of the final transition plan. This document is the CONTRACT
every rung answers to — built under the post-archaeology regime, because the
archaeology proved how five ratified standards died: rungs were staffed by
symptoms, rewrites re-derived scope from code instead of the previous ledger,
"restored X" commits restored artifacts without wiring, and nothing barked.

## THE REGIME (process law, binding on this plan)

1. Every requirement row carries a FALSIFIER — the RED-able check (grep
   invariant, dev bark, or jest) that screams if the row is dropped. A rung is
   not done until its falsifier lands IN THE SAME COMMIT.
2. Deferral is legal only when the receiving rung is appended to this file's
   rung list in the same commit. A parenthesis is not a schedule.
3. Any commit that deletes a structure must grep this file for rows keyed on
   it and re-home them in the same commit.
4. The plan itself is red-teamed before implementation; the result is
   red-teamed after; the owner's thumb is the final gate.

## PART 1 — THE UNIFORM MODEL (the owner's thesis, adopted)

ONE transition operation for ANY pair of pages, in ANY direction, at ANY
nesting depth. Every difference between transitions is POLICY DATA consumed by
that one operation — never a second mechanism.

- **The unit is the ENTRY, not the scene kind.** Scroll memory, residency,
  and state key on stack entry identity (`sceneKey#entryId`). Two stacked DM
  threads are two entries. This is the ONE new abstraction this plan adds.
- **The operation** (exists today, proven): swap data on the one track +
  refuse() carries posture and restores the incoming entry's scroll + chrome
  opacity-flips in the same commit. Single painted frame when warm.
- **Readiness is an axis, not a branch order.** Every entry exposes
  isReady; a not-ready entry presents THE skeleton (foundation-spec shape) in
  the flip commit; content is the entry's own next state. (The dead branch in
  resolveLegList becomes reachable by condition, not by luck.)
- **Seats are table rows** (already true): snapTo / promoteAtLeast /
  preserveLiveY / rememberedDetent+fallback / hidden — data, not code paths.
- **Triggers are the only choreographic variable.** Press-up for everything
  except dismiss-to-map, whose swap fires at the τ-crossing of the bottom
  boundary (user-paced, no watchdog). Same operation, different trigger time.

## PART 2 — THE CLASSIFICATION of every old mechanism

From the reconstructed old-system spec (child/dismiss/nested; see git history
of this file's companion agent reports for full file:line citations).

### SUBSUMED BY ATOMICITY (do not port; falsifier proves absence of need)

- Freeze-mode dismissal chrome (existed because chrome could lead a slow
  reveal; our swaps are single-frame — nothing to freeze).
- Held-dissolve / four-lane content player / liveSwapRoles (superseded by the
  atomic data swap).
- Paint-ack joined reveal for warm entries (the commit IS the join).
- H5 strip-gap measured-height cache (persistent strips + computed geometry).

### BECOMES POLICY DATA (rows in existing tables; no new mechanism)

- Child seats: pollCreation instant-cover expanded; detail children spring
  expanded; settings expanded + grabHandle hidden; restaurant promoteAtLeast
  middle; listDetail ABSOLUTE middle (deliberately demotes an expanded sheet —
  the map must show).
- Dismiss seats: pollDetail rememberedDetent→middle; listDetail/settings
  rememberedDetent→expanded; all other children preserveLiveY.
- Seat mode ('instant' vs spring) — one field the seat socket must honor.
- Depth-K body eviction (K=3) — the residency memory knob.
- Docked-polls resurrect posture.

### REAL GAPS (the work; each gets a falsifier in Part 3)

- G-ENTRY: entry-keyed identity (mounts, scroll memory, residency) — the
  abstraction change. Old W1 semantics: pop reveals the buried entry
  byte-exact; params from the entry value; outgoing retention through settle.
- G-READY: the readiness axis + skeleton-by-condition + two-phase cold flip.
- G-SKEL: skeleton material from the foundation spec (rowType per scene,
  strip-in-skeleton pills — the SKELETON-STRIP LAW on the track).
- G-HIDDEN: 'hidden' as a reachable seat (the sheet can leave the screen);
  onHidden lifecycle; dismiss-to-map swap-at-boundary trigger; docked
  resurrect.
- G-PREWARM: idle prewarm (warm-before-navigate law, machinery exists on the
  dead path; bark must fire on the live one).
- G-ACTIVITY: body activity derived from (presented, posture) — no all-true.
- G-LIVENESS: the visibility bit gets a writer on the track path.
- G-RESTORE: dismiss-return scroll restore folds into entry-keyed scroll
  memory (falls out of G-ENTRY; verify the staged-restore cases: offset-0
  valid, segment-before-scroll on profile).
- G-RETAP: re-tap semantics — OWNER MUST RECONCILE two ratified behaviors
  (extend-only promote vs scroll-to-top; see Part 5).
- G-SIGNALS: drag/settle/momentum fan-out to map/search riders.
- G-KEYS: per-scene keyboard policy on the one track.
- G-TOUCHGATE: input freeze during choreography (or a verdict that atomicity
  subsumes it — decide in derivation, with evidence).
- G-DIVIDER: static-scroll bodies (dmSession) publish divider offsets.
- G-EXTRAS: header Extras slot in track chrome.
- G-NAVCURVE: nav silhouette curve on the track (last recorded state:
  missing — re-verify first).
- G-REDS: the dev RED contracts ported (chrome-geometry bark, descriptor
  barks) — the falsifier infrastructure itself.

## PART 3 — FALSIFIERS (samples; every G-row gets one before its rung starts)

- G-READY: dev bark — "cold first visit painted rows before a skeleton
  frame" (the warm-before-navigate analogue). grep-invariant: the skeleton
  branch has a reachable condition (a test renders a not-ready entry and
  asserts SceneLoadingSurface).
- G-SKEL: jest — render the skeleton for every SCENE_FOUNDATION_SPECS key,
  assert the spec's rowType and strip pills where declared.
- G-ENTRY: jest — push A, push B (same scene), pop; assert A's state object
  identity survived. grep-invariant: no scene-keyed scroll-memory writes.
- G-HIDDEN: sim acceptance — dismiss-to-map reaches hidden, onHidden fires,
  boundary swap lands in the τ-crossing frame.
- G-LIVENESS: grep-invariant — setVisibleResidentScene (or successor) has
  ≥1 caller on the flip-on path.
- G-ACTIVITY: jest — a collapsed/hidden entry's body reports inactive.
- G-PREWARM: the existing "warm-before-navigate violated" bark rewired to the
  live path; RED-proven once by forcing a mid-transition compile.
- Rung-5 deletes: grep-invariants — zero held-dissolve hits, zero flip forks,
  one skeleton material (already specced in the residents plan, never run).

## PART 4 — PHASES

- P1 DERIVATION: the uniform model written against the code; red team vs code
  AND old code (the proven pattern). Output: amendments to Parts 1-2.
- P2 RUNGS (cut from Part 2/3, NOT from symptoms; falsifier-in-same-commit):
  R1 G-ENTRY + G-RESTORE. R2 G-READY + G-SKEL (+ two-phase flip).
  R3 G-PREWARM. R4 G-HIDDEN (dismiss family). R5 G-ACTIVITY + G-LIVENESS.
  R6 remaining G-rows by owner priority. R7 search/results (deliberately
  last). R8 the old-system delete pass + full grep-invariant suite +
  acceptance walk (gated on owner burn-in).
- P3 END RED TEAM + owner thumb.

## PART 5 — OWNER RATIFICATIONS OWED

1. Re-tap semantics: extend-only promote (root-snap-law leg 5, built) vs
   animated scroll-to-top (residents E2, ratified later). Pick one.
2. Slow-network law (progressive above-fold vs shimmer-timeout→error).
3. Result-list dish tap destination (profile vs results) — open since the
   transition-engine plan.

---

## PHASE 1 AMENDMENTS (2026-08-03, binding — supersede the sections they name)

The plan red team returned ten findings; the model survives for press-
triggered switches and falls in two places. Amendments:

**A1 (supersedes Part 1 "triggers are the only variable") — THE HIDDEN
EXCURSION IS A SECOND MOTION PRIMITIVE.** τ is contentOffset; collapsed is
τ=0 and a UIScrollView cannot REST below 0 — "the sheet leaves the screen"
is not expressible as a τ excursion on the one track. G-HIDDEN therefore
requires a DECLARED second primitive: either (a) native τ-domain extension
below collapsed (physics change; the legitimacy filter audits only the MAX
edge today and must learn the MIN edge), or (b) a container translation with
a specified mid-gesture handoff point from scroll physics. The derivation
picks (a) or (b) with evidence; Part 1's sentence is amended to: "press-up
triggers every switch; the hidden excursion is the ONE declared second
primitive."

**A2 (supersedes the SUBSUMED verdict on freeze-chrome) — DEFERRED SWAP IS
REAL FOR THE DISMISS FAMILY.** The dismiss slide is user-paced and multi-
frame; the outgoing entry AND its chrome must ride it fully opaque, and the
swap fires when the sheet crosses the SCREEN EDGE (not the collapsed
detent — swapping at τ=0 flips chrome while the band is still visible).
Freeze-mode moves from SUBSUMED to G-HIDDEN's scope, including deleting the
track host's freezeUntilSnap seal-bypass guard when the new path lands
(Regime rule 3). Falsifier: assert outgoing chrome present during the slide.
SUBSUMED remains correct for every press-triggered swap.

**A3 (expands G-ENTRY) — ENTRY IDENTITY REACHES REACT ELEMENT IDENTITY.**
The track has ONE component instance per scene; two stacked DM threads
would share composer draft and hook state, and pop-back is not byte-exact.
G-ENTRY's scope now enumerates every scene-keyed store that becomes entry-
keyed: leg identity/keyExtractor, mounted-body React key (per-entry
instances with depth-K retention, reconciled with the hide-never-unmount
Fabric constraint), scroll memory, strip/title/chrome caches, and scene-
keyed publications (dmSession header-offset). The jest falsifier runs
against the TRACK page.

**A4 (falsifier repairs).** G-LIVENESS's grep is vacuous (the old host
calls the writer on a dead path): replace with runtime — after a flip-on
switch, the residency manager's visible scene equals the presented scene.
G-RESTORE loses "falls out of G-ENTRY": own falsifiers — remembered
offset-0 is honored (the ?? 0 default currently makes no-memory and
remembered-0 indistinguishable), restore applies after leg attach, profile
segment-before-scroll ordering.

**A5 (new row) G-INTERRUPT.** Switch during in-flight spring; switch during
active drag (seat dies + settleToken rides the 700ms deadline today);
promoteAtLeast resolves against the SPRING TARGET, not instantaneous
posture (±2pt mid-flight reads misclassify). G-TOUCHGATE becomes a sub-
case, and on a user-paced dismiss the drag IS the choreography — the gate
protects press-triggered flights only. Falsifier: jest on
resolveCurrentSnapTarget mid-flight.

**A6 (new row) G-MODAL.** price/scoreInfo (motion 'none') are overlay-
presented, NOT track content: the track's presented entry must not change.
Falsifier asserts exactly that.

**A7 (rung order).** G-ACTIVITY moves into R2: "cold" is defined by
activity, and the two-phase flip must not mount content whose data lanes
fire eagerly. Its falsifier extends to NON-PRESENTED resident legs (the
case today's all-true gets wrong). R1's per-entry retention multiplies
all-true's cost — R1 lands with a bark budget if activity is not yet in.

**A8 (new rows, per Regime rule 2 — scheduled, not parenthesized):**
G-ROTATE (snap points derive from a startup seed; dimension changes must
recompute), G-APPSTATE (settle deadlines/tokens across suspend), G-DEEPLINK
(cold deep link builds the stack — parent entry under child — and the cold-
child two-phase flip), G-A11Y (a data swap on one persistent list emits no
screen-reader navigation event; announce + move focus on switch). All
placed in R6 unless the derivation promotes them.

**A9 (G-KEYS extension).** The keyboard-aware chin renders outside the mask
for the presented scene only; the row specifies chin behavior DURING a
transition (flips with the presented entry, same commit).

**What the red team confirmed intact:** swap+refuse+opacity-flip atomicity
for press-triggered warm switches; seats-as-data (including instant mode,
promoteAtLeast, rememberedDetent, preserveLiveY catch-all); entry identity
as THE abstraction change; pollCreation-as-form is not a counterexample.
