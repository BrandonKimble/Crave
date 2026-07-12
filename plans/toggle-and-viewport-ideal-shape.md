# Toggles + Search-this-area + the viewport — the ground-up ideal shape

**Status:** synthesis of record (2026-07-11). Distilled from three plans —
`toggle-system-ideal.md` (the revise protocol), `trigger-nav-ideal-verdict.md` (the
desire/push/revise algebra), `world-camera-multilocation-foundation.md` (CameraIntent +
camera-in-origin) — PLUS the one principle the STA hang/fade + camera-restore bugs
(2026-07-11, commits 7c9d7fa8 + cd59e8a2) forced into focus. The prior plans had ~90% of
this; the missing 10% is §D below (ONE viewport value), and it is the principle whose
absence caused BOTH shipped bugs. This doc is the "if we started over" answer: it is
already the design of record, and we reach it by the strangler strides already in flight —
not a big-bang rewrite.

## A. ONE desire value

A search is a value: `Desire = { identity, area, filters, tab, sort, mode }`. (Substantially
built — the S1–S4 tuple.) Nothing else is "search state." The desire is the single writer's
single output.

## B. Every toggle is a pure facet-writer: `revise(desirePatch)`

No toggle knows about presentation, the reveal, the map, or an id. Each writes ONE facet:

- filter chips → `revise({ filters })`
- tab pill → `revise({ tab })`
- sort → `revise({ sort })`
- **Search-this-area → `revise({ area: <current viewport> })`** — STA is NOT a special flow.
  It is simply **the toggle that revises the AREA facet**. Every other toggle leaves the area
  alone; STA's whole identity is the new area. That single difference — area vs filter — is
  the entire reason STA ever touched the camera/viewport system differently. It is not a
  different _kind_ of thing.
- Availability conditions (STA only appears when the map moved) = a **pure predicate over the
  desire**: `staAvailable = (liveViewport ≠ desire.area)`. No imperative `mapMovedSinceSearch`
  flag. (Already the stated ideal — toggle-system-ideal.md notes "derive the flag from
  camera-vs-committedBounds, no imperative flag.")

## C. ONE revise pipeline (the toggle engine — BUILT)

Optimistic facet flip on press-up → restarting quiet-window debounce → the reconciler
classifies the delta and re-resolves the world → present in place through **ONE reveal joint
keyed to ONE interaction id** → visual-sync finalize clears the interaction cover. That is
the whole protocol, uniform for every toggle including STA.

> **The STA hang/fade (7c9d7fa8) was a violation of "ONE lane, ONE id."** STA had a _second_
> presentation arm keyed to a different id-space (the episode token, not the toggle-intent
> id): the finalize could never match → the cover hung; the pins faded on the first arm while
> the dots were stranded on the second → the "pins fade, dots stay" desync. Both symptoms were
> the SAME stuck cover on a parallel lane. The ideal makes this **unrepresentable** — a toggle
> has no way to open a second lane; it only writes a facet and the ONE pipeline does the rest.

## D. ONE viewport value (THE missing principle — the root of both bugs)

Today the "where the map is looking" value exists in THREE parallel representations that drift:
`viewportBoundsService` (fresh, bounds-only), `lastCameraStateRef` (lagged — idle-only,
skipped when busy, missed by raw arbiter commits), and the tuple's `committedBounds` (fresh at
trigger). The camera-restore bug was precisely two of these disagreeing: the origin was
captured from the lagged `lastCameraStateRef` while the search ran against the fresh
`committedBounds` → dismiss flew to a stale location.

**Ideal: the live map viewport is ONE value, and it flows, unforked, into everything that needs
"where you searched":**

- read once at each trigger → it IS `desire.area` (what the search resolves against).
- the SAME value is the entry's captured camera (camera-in-origin). They are one value, so they
  **cannot diverge** — the dismiss restore is, by construction, exactly what the search ran.
- STA's availability predicate compares the live viewport to `desire.area` — same one value.
- No `lastCameraStateRef` vs `viewportBoundsService` vs `committedBounds` triplication.

> **The camera-to-wrong-place bug (cd59e8a2) was a violation of "ONE viewport value."** The
> shipped fix already moved the origin onto `committedBounds` (the search's own viewport) and
> made it per-search-trigger — a strangler STEP toward this principle. The end state collapses
> the three representations into one derived-from-live-camera value.

## E. The camera is a pure function of desire + world (world-camera L1–L5)

The reveal HOLDS the camera for revise-class (filter/tab/sort/area — you already moved it, or
it doesn't move). The camera moves ONLY for `focus` (profile/selection) and `fitAll` (lists),
via ONE choreographer synchronized with the reveal ramp. `CameraIntent = hold | fitAll | focus`
is a value on the world, not imperative calls. (Designed in world-camera §3.2; pending L2.)

## F. The nav stack is entries-as-values (trigger-nav S-B)

Each entry carries its captured presentation (origin, detent, scroll, **camera = its area at
trigger**). A revise (chip, STA) mutates the CURRENT entry's desire in place. A drill-in
(tap a result → profile) pushes a NEW entry with its own captured camera. Dismiss pops the
stack; each pop restores its entry's viewport — the same one value from §D.

---

## Why this shape makes both shipped bugs UNREPRESENTABLE

- **Hang / pin-dot desync:** there is one presentation lane and one interaction id; a toggle
  cannot open a second arm. STA rides the exact chip pipeline. Nothing to strand, nothing to
  hang.
- **Camera-to-wrong-place:** the origin camera and `desire.area` are the same value from one
  source; the restore can't diverge from what the search ran.

Both bugs were parallel-structure / dual-source-of-truth defects — the recurring disease. The
ideal is the same cure both times: **collapse to one.**

## Can we get there? — yes, by the strangler already in flight

No big-bang rewrite (ethos: ideal shape, sequenced strangler, all in git). The path:

- **Revise protocol (§B, §C):** BUILT — the toggle engine (Gate 1), the visual ports (Gate 2),
  STA-onto-the-chip-lane (7c9d7fa8). Done and proven.
- **ONE viewport value (§D): SHIPPED 2026-07-11 (127de8e9; camera half).** The viewport
  service stores an atomic `{bounds, camera:{center,zoom}}` from the SAME native MapState
  event (camera-changed + idle + perf writers supply it; bounds-only writers keep the last
  event's camera); `captureCommittedBounds` snapshots bounds+polygon+camera in one
  synchronous read so `tuple.committedBounds.camera` IS the searched viewport's camera;
  the origin runtime reads only that (its `lastCameraStateRef` read + `getBoundsCenter`
  derivation DELETED — the ref survives untouched as the profile lane's tracker, an L3
  survivor). Camera is excluded from `areSearchCommittedBoundsEqual` + world keys (like
  `viewportPolygon`) so revise classification and caching stay bounds-facts — reconciler
  specs prove it. FOUND DURING THE COLLAPSE — a FOURTH representation: the service's
  `searchBaselineBounds`+`submittedPolygon` (the STA "map moved" baseline), a second
  independent capture of the searched viewport taken at `resetMapMoveFlag` time instead of
  the tuple write. Its collapse (baseline becomes a mirror written from `committedBounds`
  at the tuple write; the async polygon refine stays a service-only accuracy upgrade and
  must NEVER write the tuple — the refined AABB differs slightly and would phantom-classify
  `area_rerun`) is the REMAINING §D slice. Open questions for that slice: clear-owner null
  semantics at session dismiss, the press-before-write ordering window, and that its readers
  include `restaurant-location-selection.ts` (foundation-session anchor-rule lane — readers
  must stay untouched; only the capture instant moves).
  **RED-TEAMED 2026-07-11 (5 lenses, verdict clean; hardening shipped 2df804fc + a91946a9:**
  bootstrap seeds the service camera pre-first-event; fresh-capture reads camera off the
  same native snapshot as the fresh bounds; setBounds rejects explicit-null camera).
  **WATCH ITEM** (unverified reachability, no action): the origin restore commits the raw
  captured camera center with `padding: null` — if a tuple commit ever becomes reachable
  while the profile lane's non-null `mapCameraPadding` is active, the captured center is the
  padded-frame center and the restore lands offset ~half the padding. No such commit path
  exists today (chips/STA occluded under the profile sheet); re-check if one appears.
- **Camera-as-value + one choreographer (§E):** world-camera L1–L5 (foundation session).
- **Entries-as-values (§F):** trigger-nav S-B (foundation session).

The only thing the prior plans were MISSING is §D stated as a first-class principle; fold it
into `world-camera-multilocation-foundation.md` and the two shipped fixes become the first two
strangler steps toward it rather than one-off patches.
