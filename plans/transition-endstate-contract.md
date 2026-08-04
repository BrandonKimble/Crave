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
