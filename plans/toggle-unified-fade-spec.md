# Spec: the unified-fade TOGGLE lane (map-LOD-v6)

**From:** the toggle workstream. **For:** the residency session that owns
`SearchMapRenderController.swift` + `MapLodKit/LodEngine.swift` + the pin overlay.
**Supersedes:** `plans/promote-under-cover-spec.md` (pre-v6, stale — v6 already seeds promotion into
the reveal frame). Backed by two reassessment workflows (ws7nuoj65 system, w7rvnbhmy fade-sync).

**Why it's yours:** the fix is native (engine + presentation animator + the CALayer pin overlay you
own and that is still uncommitted), it improves reveal too, and the toggle JS side is a thin
cover-gating change that depends on a native signal you emit.

## The ideal user flow (the TARGET — what the user should feel)

Every toggle — the dish/restaurant SEGMENT and every FILTER chip (Open now / Price / votes / Rising)
— behaves identically:

1. **Press-up → the strip flips instantly.** The pill slides / the chip colors immediately. Zero wait
   on the network — pure optimistic feedback.
2. **The strip stays put; a loading cover slides in UNDER it** — never over it, never a white-wash.
3. **Pins + dots + labels fade out together, instantly** — the map's reaction is as immediate as the
   strip's, because the fade-out needs no data. (This is the key responsiveness win: you don't wait
   for the new results to *start* reacting.)
4. **Under the fade (invisible at opacity 0):** the new ranking/filter resolves (in-memory for
   sort/segment, network for filters), the engine re-decides the promoted set, labels settle. Basemap
   street labels stay suppressed (residency keeps dots placed even at opacity 0).
5. **On settle → pins + dots + labels fade in together, in lockstep with the result cards revealing.**
   The cover lifts on the deterministic settled signal, with the correct rank pins already picked —
   no pop, no re-jig.
6. **Rapid-tap:** hammer it — the map stays faded out while you decide, the last tap wins, it fades in
   once. Trivial to reason about (wait-for-settle, exactly like the cover).
7. **Toggle to zero results:** fades in to a clean empty state — and *only here* do the basemap street
   labels return.
8. **A selected restaurant that gets filtered out:** its callout closes inside the same transition —
   no dangling popup over an empty spot.
9. **Moved the map far away, then toggled:** same flow — fade out → swap → fade in — whether or not
   the new pins overlap the old.

**Why this shape (and not a surgical per-marker morph):** the unified fade is *responsive* (fade-out
decoupled from data), *simple under rapid-tap* (wait-for-settle), and *choreographically coherent* —
the map fades out *with* the cover and fades in *with* the cards, so the whole surface moves as one
gesture instead of the map doing its own thing on a lagged data-delta. The surgical per-marker
crossfade stays the engine's native *panning* behavior (where spatial continuity matters); a
deliberate toggle wants the clean unified fade. And it is the **same** fade as reveal and dismiss —
one discipline across all three transitions. Everything below is HOW to deliver this.

## This is THE toggle standard — reusable across every strip, every page (load-bearing)

The flow above is **not a search feature** — it is the **standard interaction for any toggle strip in
the app**, present and future, and that is why we build it uncompromisingly the first time. Concrete
motivation: **favorites lists** will get their own toggle strip (sort + slice your saved places), and
a favorite list **renders on the map like a search** — it rides the **same results+map pipeline**
(favorites-as-search, already BE+FE done), just with different API calls. Polls and other surfaces
will want the same. **The toggles differ per strip; the effect and flow of toggling must be identical.**

So this is built ONCE as a reusable primitive — never baked into search — so standing up a new strip
is *"declare your toggles + provide a data fetcher"* and the entire flow (optimistic flip, cover,
unified fade, sync, settle, rapid-tap, empty, selection) comes **for free and correct on the first
try**, with no way to re-introduce the bugs we fixed.

**The separation that makes it reusable (source-agnostic by construction):**

- **Toggle-strip UI primitive** — the chips/segment shell, parameterized by a toggle config (labels,
  active state, mutual-exclusion, what each emits). Search / favorites / polls each pass a different
  config; the component is identical. All the committed strip behavior (frost/cutout, cover-offset,
  scroll-away, strip-persistence, color-flip-on-press-up) lives here ONCE.
- **Toggle interaction lifecycle** — the shared runtime: press → optimistic flip → coalesce
  (latest-wins) → interaction_loading cover → await settle. It does NOT know search from favorites.
- **The unified-fade map discipline (native)** — keyed on the SHARED results+map surface + the
  transaction, NOT on "search." Whether markers came from a search query or a favorites slice, the
  map holds resident markers, the toggle re-ranks/re-filters them, and the same fade plays. The native
  fade lane must take a generic "content re-rank/re-filter on the map surface" signal, not a
  search-specific one.
- **The data fetcher is the ONLY per-strip difference** — search hits the search API, favorites hits
  the favorites API; both feed the same catalog/ranking pipeline → same engine → same fade. Different
  inputs, identical presentation.

**Acceptance test for "standardized" (the bar):** a second strip — favorites slice/sort — can be
stood up by supplying *only* a toggle config + a data fetcher, and it exhibits the EXACT user flow
above (same fade timing, same sync, same edge handling) with **zero new fade/sync/cover code**. If
standing up favorites requires re-touching the fade, the cover gating, or the sync contract, the
primitive was not extracted correctly — that is the regression signal.

This is the motivation for doing it completely right, uncompromisingly, the first time: it becomes the
app's toggle standard, and every future strip (favorites, polls, and beyond) inherits the ideal flow
by configuration, not by re-implementation.

## Build order: search-first, favorites-ready (do NOT build favorites first)

Do not build the favorites toggle strip before this lands. Reasoning:
- **The hard/risky/cross-session-blocked part — the native unified-fade + sync — is source-agnostic by
  nature** (keyed on the shared results+map surface + the transaction, not "search"). Getting it right
  for search IS getting it right for favorites; there is no favorites-specific fade work to discover.
- **The expensive seam (the data FETCHER: viewport+filters/sort → ranked catalog) is ALREADY proven
  shared** — favorites renders on the map via the same results+map pipeline (favorites-as-search, done).
- **The only seam with real one-consumer risk is the toggle CONFIG (the chips) — de-risk it on PAPER,
  not by building.** Favorites leans on SORT + SLICE (by date/name/score, by sub-list) more than
  search's on/off filters. Confirm NOW that the config shape expresses: a mutually-exclusive SEGMENT
  (primary) + toggle FILTER chips + a mutually-exclusive SORT group. Search's "Rising" is already a
  sort, so sorts are in scope regardless. If favorites would need a config shape search doesn't reveal,
  fix the config interface NOW (cheap), not after favorites exists.

This is "design for the known second consumer," not speculative abstraction (favorites is concretely
planned, the shared surface exists, the fade is inherently generic).

Order: (1) build the primitive SOURCE-AGNOSTIC — strip-UI shell + interaction lifecycle + native fade
lane, with config + fetcher seams; NO search-specific chips/API baked into the lifecycle or the fade.
(2) Wire SEARCH as the first consumer (search toggle config + search fetcher). (3) Paper-validate:
sketch the favorites config + fetcher; confirm zero fade/cover/sync changes needed. (4) Favorites
(later) = drop in a config + fetcher; the acceptance test above is the real proof then.

## The model: a toggle is ONE unified fade — "be dismiss, both directions"

A toggle is a **global presentation-opacity fade**, NOT a surgical per-marker re-decide. Press →
fade all three families (pins/dots/labels) **out together instantly** (no gate) → under cover apply
the new ranked catalog + re-decide + settle labels → on settle fade all three **in together**. The
surgical/selective per-marker crossfade stays the engine's NATIVE *panning* behavior; a deliberate
toggle wants the clean unified fade that stays in lockstep with the sheet cover/card reveal.
(Owner-confirmed 2026-06-29: instant fade-out = responsiveness; rapid-tap = stay faded out until
settle, like the cover.)

This is literally **the dismiss path, run in both directions** — which is also why it's correct.

## The SYNC CONTRACT (non-negotiable — this is the crux)

Reveal looks desynced because it composes opacity from TWO overlapping curves (300ms smoothstep
presentation ramp × 180ms linear engine crossfade) across THREE CADisplayLinks on TWO substrates
(CA-overlay pin = synchronous this-CA-pass; GL dot/label = async `setFeatureState` next render),
behind a reveal-only placement gate. **Dismiss is synced because it FREEZES the engine** (the
live-pin animators self-cancel on `.dismissing`) → one scalar (`nativePresentationOpacity` 1→0), one
clock, no placement gate. The toggle must do the same:

1. **One clock owns all three families.** The presentation/toggle animator tick must, in the SAME
   callback: compute the eased scalar, `setFeatureState(nativePresentationOpacity)` for the GL
   dot+label, AND write the overlay pin `tile.opacity` for the same value. Concretely: have
   `stepPresentationOpacityAnimation` also call `refreshOverlayFrame`. The overlay's own display link
   stays responsible for POSITION only (`point(for:)`), never for the fade multiplier.
2. **Freeze the engine during the toggle** — exactly as dismiss cancels the live-pin animators. A
   toggle is a global opacity change, not a role change; ONE curve, never two. If a role crossfade
   is in flight when the toggle starts, snap it to its target first.
3. **Fade-out instant on press, gated by nothing**, and **DEFER overlay teardown until the scalar
   reaches 0** — today `syncOverlayRoster` on a camera frame during `.dismissing` calls
   `teardownOverlay` which SNAPS pins; the toggle must fade them, not snap.
4. **Fade-in not gated by placement once it starts.** Placement may gate the START; once the ramp
   begins it runs on the toggle clock alone, and obstacle-reseed must not move labels mid-ramp.
   CAVEAT: a toggle firing right after a data refresh inherits the full placement-readiness saga; a
   re-show of already-placed markers is trivial.
5. **Keep GL dot/label opacity-transitions at 0ms** (no `*OpacityTransition`) — preserve this or the
   refactor silently stacks Mapbox's 300ms default ease on the toggle clock.
6. The residual ≤1-frame CA-vs-GL async skew is the irreducible floor; it's symmetric so it doesn't
   read as a desync. Do NOT "fix" it with a fixed one-frame CA delay (GL upload latency varies with
   frame load).

**Non-negotiable:** pin + dot + label all derive from the SAME toggle scalar, on the SAME clock,
written the SAME tick, engine FROZEN, placement OUT of the fade path, both directions.

## Applying the contract to the INITIAL REVEAL (the original complaint)

The reveal fade-in desync (pins/dots/labels not arriving together) is the **same three sources** as
above, so it gets the **same fixes** — reveal, toggle, and dismiss should all share ONE fade
discipline: *one presentation scalar × frozen/settled engine, both substrates written the same tick,
placement committed under cover.* Dismiss already does it; bring reveal and toggle into line.

What the reveal specifically needs:

1. **Settle the engine UNDER COVER before the presentation fade-in starts** (kills Mismatch #1, the
   300ms-ramp-vs-180ms-engine overlap). v6 already *seeds* top-N rank pins into the reveal frame
   (`55891756`) for a single-phase fade — the requirement is that the seeded per-marker opacities are
   at their **settled** values (promoted pin=1/dot=0, demoted dot=1/pin=0) by the time
   `animatePresentationOpacity(to:1)` fires, NOT still mid-`engine.step` crossfade. On a fresh reveal
   there is no dot↔pin crossfade to show (markers start at their final role), so the engine should be
   **snapped settled** under cover, leaving the presentation ramp as the only moving curve — exactly
   like dismiss. **DEVICE-GATE first** (checklist #1 below): confirm whether engine fades are actually
   in flight at `presentation_opacity_animation_start`; if they've already settled under cover, this
   fix is moot and the reveal only needs #2.
2. **One clock writes both substrates the same tick** (kills Mismatch #2, the CA-pin-synchronous vs
   GL-dot/label-async skew) — identical to the toggle contract item 1: have
   `stepPresentationOpacityAnimation` also drive `refreshOverlayFrame` so the overlay pin and the GL
   feature-state move from the same value on the same tick. This applies to reveal verbatim.
3. **Placement: keep the gate, but commit under cover** (Mismatch #3). Unlike toggle/dismiss, the
   reveal *legitimately* needs the placement gate (labels must be placed before they can show). The
   discipline is: the gate may delay the *start* of the fade-in, but placement must be **committed
   under cover** (v6's `handleRenderFrameFinishedForHiddenPlacement` / `enter_mounted_hidden` work) so
   that once the ramp begins, nothing re-places or jumps mid-fade (obstacle-reseed must not move
   labels during the ramp).

Net: after #1–#3 the reveal reduces to the dismiss shape (one scalar, frozen engine, both substrates
co-timed, placement pre-committed) → pins/dots/labels fade in together. The toggle then literally
reuses the same fade path in both directions.

## The static-camera re-decide (so the cover settles)

Under cover (scalar at 0) the new ranked catalog must actually re-project on a STATIC camera. Today
`setCandidateCatalog` nils `lastVisibleMarkerSetSignature` + calls `engine.setRanking(...)` but fires
NO projection until a camera tick (its own comment: "force the next camera tick to re-emit"). On a
static toggle there is no camera tick → no re-decide → cover can hang.

**Shipping precedent to copy: the tap-promote path (~SearchMapRenderController.swift:2962-2970):**
`signature=nil → projectAndEmitOnScreenMarkers(reason:"…", isMoving:false) → updateLivePinTransition
→ applyV5ObstacleReseed`. Run that exact recipe under cover on a toggle, **plus the one new call the
precedent predates: `syncOverlayRoster`** (the overlay roster only syncs from the camera handler at
~11058, so the overlay goes stale on any non-camera reproject). Then fade in. Emit a deterministic
settled event (e.g. `presentation_toggle_settled`) on fade-in completion — UNCONDITIONALLY (so
any→empty / empty→empty still lifts the cover).

## JS side (toggle session, clean files)

- Gate the `interaction_loading` cover lift on the new deterministic settled event, NOT the racy
  `nativeMarkerFrameReady`/`presentation_enter_settled` (search-surface-runtime.ts ~177;
  use-results-presentation-marker-enter-runtime.ts; use-search-map-native-render-owner.ts).
- If you add a `fade_swap`/toggle transaction kind: extend `deriveSearchMapVisualFrameTransactionKind`
  + the `setRenderFrame` switch. (The enum today: bootstrap|hidden_preload|enter|live_update|dismiss|
  clear_hidden — no toggle kind; static toggles currently route through `live_update`.)
- Add a fallback flag (like `lodV5Enabled`) so the lane can revert to `live_update` on regression
  without reverting the commit.

## Edge branches (don't skip — from the completeness critic)

- **Selection reconciliation:** `forcedKeys = highlightedMarkerKeys` feeds `decide`. If a filter drops
  the selected restaurant, intersect with the new catalog at the swap point; if it survived, keep it
  forced; if dropped, emit a selection-cleared event so the open callout closes in the same trough.
- **Camera moves mid-toggle:** let the normal camera decide+roster path take over and finish the fade
  against the live camera (the swap just isn't perfectly hidden). Document the rule.
- **Cross-lane dismiss collision:** a dismiss must cancel any in-flight toggle completion hook before
  starting its own fade (shared per-instance `presentationOpacityAnimators`), so an under-cover
  apply/reproject never fires on a dismissing instance.
- **Empty result:** settled event fires from fade-in completion unconditionally.

## Ground-truth checklist (enable the oracle first)

Set `lodDebugLoggingEnabled = true` (~line 10862) and rebuild, then on a confirmed-fresh binary
(stat the app vs the .swift mtime):
1. **Does the toggle still hang post-`467b14c5`?** (single most load-bearing unknown — our hang
   evidence is stale.) Grep the `[LODDBG]`/proj-reason logs after a toggle on a static camera.
2. Which production toggles change the on-screen KEY SET vs only re-rank the same set (decides how
   often the static gap fires).
3. Does the dish↔restaurant SEGMENT toggle re-search or re-present the same keys? (watch
   `setCandidateCatalog` on a segment tap).
4. **REVEAL sync (gates fix #1 of the reveal section):** are engine fades actually in flight at
   `presentation_opacity_animation_start` (→ Mismatch #1 real, needs the under-cover settle), or
   already settled under cover (→ moot, reveal only needs the one-clock-both-substrates fix)? Log the
   in-flight engine-fade count at that instant.
5. Post-fix (slow-mo capture): on BOTH reveal AND toggle, pins/dots/labels cross 50% opacity **within
   the same frame** on fade-out (press) and fade-in (settle); pins **fade, not snap** when the camera
   moves mid-toggle; dot/label opacity transitions still 0ms (GAP-A regression check).
6. Empty-result toggle settles deterministically (cover lifts on an empty map).

## Sequencing

The pin-overlay subsystem (`syncOverlayRoster`/`PinOverlayView`) MUST land before/atomically with any
toggle fix that calls `syncOverlayRoster` — committing the toggle fix first strands the overlay (a
correctness ordering, not just a merge concern). Strip the interleaved `[PINFIX]` scaffolding before
committing the overlay.
