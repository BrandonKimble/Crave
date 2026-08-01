# THE RESIDENTS CUTOVER — plan + the choreography reconstruction (2026-08-01)

## Part A — what the record actually says (owner memory: VERIFIED)

The audit of the plans (transition-engine-final-master-plan, page-composition
L0–L4, THE SKELETON SHEET spec 2026-07-18) and the code confirms every element
of the owner's account:

1. THE RATIFIED SWITCH STANDARD (still the standard): skeleton-first
   HARD-SWAP. "PIVOT 2026-06-29: the cross-dissolve is RETIRED; the engine
   ships as HARD-SWAP + SKELETON." Press-up order: CHROME LEADS — header
   title, nav action, AND the strip render real from the first frame; the
   skeleton shows immediately for cold content; real content is the first
   beat AFTER the reveal, never inside it. Forward and back are one
   descriptor, never two paths.
2. ONE SHARED SKELETON MATERIAL: L0's one loading material (the cutout plate
   — plate + holes + shimmer), skeleton as a CELL RENDERING MODE; THE
   SKELETON SHEET laws (a skeleton sheet IS a real sheet body; true cutouts;
   no header skeleton; the length law; honest divider). Exactly what the
   owner asked for: one format now, per-screen customization later.
3. THE FADE the owner remembers seeing: held-dissolve from the transition
   engine's EARLIER design — RETIRED 2026-06-29, never the ratified standard.
   The owner's "that's weird" was correct. Its scaffolding survives as dead
   code (~8 hits) and its player runs only in the flip-off host.
4. RESIDENCY WAS PLANNED, MEASURED, AND RATIFIED: L3 SHELL RESIDENCY —
   "every scene's shell mounts once and stays resident; switches retarget
   visibility"; prototypes measured (20 empty shells ≈ 11-13ms, RSS ≈ 0,
   60fps); THE EVICTION LAW (shells never evict; CONTENT evicts under a
   budget); WARM-BEFORE-NAVIGATE (first-visit shells compile at idle or
   press-down, never inside the transition window — mid-transition compile is
   a loud violation). The industry-standard model was already in the design.
5. THE STRIP GAP is a known, named disease (audit §0.6/0.7) with a ratified
   answer: THE SKELETON-STRIP LAW — "blank strip regions are unrepresentable"
   (live strip or strip-in-skeleton pills, always).

## Part B — what the track migration actually did (code truth)

The migration preserved motion/shell/surface and VIOLATED the ratified
choreography in four ways:

V1. Residency dropped. The track host renders one scene's body in one list
(scenes as visitors); the residency manager's visibility writer is dead
with the flip on (prewarm scheduling still runs, consumers stale).
V2. Skeleton standard dropped at the switch. No skeleton-on-press-up wiring;
the host's cold fallback is 30 bare gray placeholder rows (an improvised
L0 violation). Real skeletons appear only incidentally (panels'
ListEmptyComponents / mounted bodies' own gates, some reading a dead
liveness context).
V3. The strip gap: chrome DOES swap in one commit (title+strip memoized on
scene), but TrackSheetDockedStrip REMOUNTS per scene, so chips re-measure
and paint a frame late inside the already-swapped band — the owner's gap,
both directions. The skeleton-strip law is not implemented in the track
chrome.
V4. Two-and-a-half paths alive: track held-swap (live), old paint-ack player
(flip-off, dead but present), retired held-dissolve scaffolding, plus the
motion executor writing to a target only the old host registers. The
owner's requirement: ONE path, no flip forks.

## Part C — the target (one path, everything already ratified, fused)

THE RESIDENT PAGE: per-scene resident legs under the residency budget
(eviction law, warm-before-navigate), ONE native engine attaching to the
presented leg (slot-era facts: setOffset+range law seed τ; only the attached
leg's handler feeds τ; slots are scene-agnostic native and never swap).

THE SWITCH (one choreography, forward = back):
press-up → chrome swaps in the same commit (title + nav action + STRIP,
with the strip persistent per scene — no remount, no re-measure ⇒ the gap
is unwritable) → the presented leg display-flips:
warm leg → full content instantly (nothing to hold, ack, or fade)
cold leg → THE ONE SKELETON immediately (the cutout-plate material as
cell rendering mode, per THE SKELETON SHEET laws), content
lands as the leg's own state when ready — together, including
the strip-dependent regions per the skeleton-strip law
native: refuse() carries posture exactly; seat spring only on descriptor
crossings (via the motion-target socket, deleting the parallel seat).

THE DELETE PASS (the "one perfect path" requirement): the old host's player +
held-dissolve scaffolding + flip fork (after burn-in) + gray placeholder rows

- the dead liveness context reads. Search/results reveal stays: it is a world
  redraw, not a page switch, and its skeleton/strip exceptions are already
  specified by the owner.

## Part D — rungs (each: land → instruments green → owner thumb)

1. RESIDENT LEGS: per-scene lists co-mounted (display-flip visibility, one
   writer of the bit), engine attach choreography, per-leg band mask +
   scroll memory; residency budget + warm-before-navigate restored.
2. THE SKELETON RESTORATION: skeleton-on-press-up for cold legs via the ONE
   material; gray rows deleted; skeleton-strip law in the track chrome.
3. THE STRIP PERSISTENCE: per-scene strip instances kept warm with their
   legs (no remount, no late chips), same-commit chrome swap preserved.
4. THE SEAT SOCKET: register the track host as the motion target (flip-gate
   the old registrant first); delete the parallel seat resolution.
5. THE DELETE PASS + grep invariants (no held-dissolve hits, no flip forks in
   switch choreography, one skeleton material) + acceptance walk.

Red team this plan against the code before rung 1 lands, per standing law.

## Part E — industry-standard additions (owner-requested sweep, 2026-08-01)

Missing from our inventory but standard in every major tab bar:

E1. LAZY FIRST MOUNT: a leg mounts on FIRST visit, not at boot (RN bottom-tabs
default; also implied by warm-before-navigate). Boot cost stays flat as
scenes are added.
E2. RE-TAP = TOP: tapping the ACTIVE tab scrolls its page to top (iOS HIG /
every major app). In τ-space: presented leg, active-tab press → animated
settle to listY 0 (posture unchanged).
E3. MEMORY-PRESSURE TRIM: the eviction law's CONTENT trim should also fire on
real OS memory warnings, not only the budget (shells never evict).
E4. SUBSCRIPTION LIVENESS: hidden legs subscribe to nothing (L3 A#9 —
display-detached legs must also pause queries/stores, or residency trades
frames for battery).
E5. STATE PRESERVATION on return (scroll, filters, strip selection) — already
ours via per-leg scroll memory + resident state; named so it stays tested.

## Part F — rung 1 implementation shape (decided)

NOT N full pages. ONE TrackSheetPage keeps the singletons — chrome twins,
slots, shell, physics, τ — and hosts N ROW LEGS inside it: per-scene
FlashLists as absolute-fill siblings, display-flipped, mounted lazily on
first visit. The engine attaches to the presented leg's scroll view on flip
(attach is per-scroll-view and idempotent already); refuse() restores the
leg's τ; hidden legs emit no scroll events, so τ keeps ONE writer without any
new machinery. Slots/chrome never duplicate (they were never per-scene).
