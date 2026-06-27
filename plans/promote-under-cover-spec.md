# Spec: promote rank pins UNDER COVER (before the reveal fade-in)

**From:** the toggle/fade-swap workstream. **For:** the residency session that owns
`SearchMapRenderController.swift`.
**Why it's yours:** it's a reveal-lane reorder (your domain), it fixes submit-reveal, AND the
dish/restaurant + filter toggles inherit it for free (they now ride the reveal lane). One change,
two wins.

## The choreography contract (the old good state)

The loading cover must lift ONLY once the promoted rank pins are already PICKED and their labels
already SETTLED **under the cover**, and the cover lift is synced to the moment the map content
BEGINS to fade in — so the *correct* pins fade in already-settled. No pin pop, no re-jig after the
fade.

## The current gap

Pin promotion runs too late. `projectAndEmitOnScreenMarkers(reason: "reveal_promote")` +
`driveNativeLod` live in **`settleEnterAfterRenderedFrame`** — i.e. at SETTLE, which runs AFTER
`startEnterPresentation` has already kicked the opacity fade-in. So:

- ✓ labels ARE settled under cover before the fade (your recent
  `handleRenderFrameFinishedForHiddenPlacement` placement-commit fix — good).
- ✓ cover lift is wired to `mounted_hidden` (under cover) via JS `nativeMarkerFrameReady`.
- ✗ **the promoted set isn't decided until settle** → the fade-in begins with un-promoted markers
  and promotion lands during/after the fade. That's the violation.

## The change

Move promotion **under the cover, before the mount-emit**, so the order becomes:

1. mount markers hidden (preroll presentation opacity ~0.001) — already happens
2. **PROMOTE here**: `projectAndEmitOnScreenMarkers` + `driveNativeLod` while still under cover
3. label-placement commit runs for the PROMOTED set (your existing under-cover placement path)
4. `emitExecutionBatchMountedHidden` → JS `nativeMarkerFrameReady` → cover-lift gate opens with the
   correct pins already picked + labeled
5. `startEnterPresentation` fade-in 0.001→1 reveals the already-settled correct pins
6. `settleEnterAfterRenderedFrame` no longer needs the promotion kick (becomes settle-only)

Net: the existing `reveal_promote` kick moves OUT of `settleEnterAfterRenderedFrame` and INTO the
under-cover mount/preroll path, ahead of the `mounted_hidden` emit (and ahead of the label-placement
commit so labels are placed for the promoted set).

## Gotchas (the parts that bite)

1. **`projectAndEmitOnScreenMarkers` guards on `.visible`** (`guard visualSourceLifecycleState ==
   .visible else { return }`, ~line 11182). Under cover the state is `.preparingReveal`/`.revealing`,
   so a naive call early-returns. The guard needs to also allow the under-cover preroll states for
   this promotion pass (or factor the projection body so the preroll path can call it).
2. **Promote BEFORE the label-placement commit**, not after — promotion decides which markers are
   pins, and labels are per promoted pin. If you promote after placement commits, labels were placed
   for the wrong set. So: promote → place → commit → mounted_hidden.
3. **`driveNativeLod`'s pin↔dot crossfades under cover are invisible** (effective opacity =
   `nativePresentationOpacity` (~0 under cover) × `nativeLodOpacity`), which is what we want — role
   flips happen invisibly, then the presentation fade-in reveals the settled result. Just confirm the
   stepper doesn't fight the preroll opacity.
4. **Empty result set**: keep the existing empty-enter handling; promotion of 0 is fine (cover still
   lifts, empty state shows). (Basemap street labels should return only on zero results — that's the
   only case we want them un-suppressed.)
5. **Toggle re-search rides this same lane** — verify a static-camera toggle re-search (dish↔restaurant
   or a filter like Open now) promotes under cover too (this was the toggle's stuck-cover / `roleP:0`
   symptom; promoting under cover before the mounted_hidden emit is exactly what unblocks it
   deterministically).

## Verification (per the LOD harness)

- `[lodev]` `frame` event with the promote reason fires BEFORE `mounted_hidden`/fade-in (not at
  settle), `promotedRanks` contiguous `1..N`, `roleP == renderP`, matching the cards.
- On reveal AND on a toggle re-search: the cover lifts and the *already-correct* pins fade in — no
  pin pop / re-jig mid-fade.
- Toggle into a changed/filtered set with a static camera settles deterministically (no stuck
  spinner, `roleP > 0`).
- No regression to the wiggle/jank metrics (`mut` bundle adds/removes ~0 while moving).
</content>
