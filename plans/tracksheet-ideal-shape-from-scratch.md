# The sheet, derived from scratch

Written 2026-07-28, after a burn-in round whose defects were all symptoms of the
same four conflations. This is not a diff against what exists. It is the shape we
would have built on day one knowing every requirement and every platform law we
now know. Anything in the tree that differs from this is, by the owner's
standard, unacceptable — not because it misbehaves today, but because it is
built on a foundation that will keep producing this class of defect.

---

## 1. The requirements, stated once

R1. Sheet travel and list scroll are ONE continuous motion. No handoff, no seam.
R2. Every point on the sheet is grabbable. No exceptions — not the title, not the
close button, not the grab handle, not a row.
R3. No wiggle. The header may never lag the content it sits on.
R4. Rubber band at both ends, always. The user must never see an edge of the
sheet — not the top, not the bottom, not the end of the content.
R5. R4 holds for arbitrarily SHORT content, without fabricated scroll length and
without hard caps.
R6. Nothing renders above the sheet's top edge.
R7. Detents settle on a critically damped spring. Momentum born in the sheet
region may never cross into the list region, or vice versa (the ballistic
wall).
R8. The divider under the chrome is absent at rest and fades in exactly as
content slides under the chrome.
R9. Cutouts (grab handle, nav action, strip, profile stat band, curated-list
boxes) punch through the sheet surface to the FROSTED layer — never to the
map, never filled white.
R10. Nav exclusion: the sheet's bottom boundary follows the nav bar in and out,
preserving the silhouette curve, in the same frame as the nav's motion.
R11. A scene switch may seat the sheet at a posture. A seat is a one-shot target
that always yields to the user's thumb.
R12. Scene switches complete a readiness transaction before the reveal.
R13. One copyable page standard. Permutations (docked strip, in-list leader,
neither) are props, not forks.

---

## 2. The four conflations — the actual root cause

Every defect in the last round traces to one of these. They are not bugs; they
are category errors in the decomposition.

**C1. Surface conflated with content.** The sheet's whiteness was carried by row
backgrounds and a footer view. So surface extent became a function of content
length. That is why a short page could be scrolled to its own end (R4/R5
violated), and why the fix kept taking the shape of fabricated padding — the
abstraction admits no other fix.

**C2. Cutouts conflated with the components that draw them.** Each strip
implemented its own hole. So a scene that didn't route through that component got
white boxes (curated lists) or a hole to the wrong layer (profile stats showing
map, not frost). R9 cannot be satisfied component-by-component: a hole is a
property of the SURFACE, and there is only one surface.

**C3. Containment conflated with padding.** `expandedTop` was applied as
contentContainer padding, which positions content but does not bound it — so
content scrolling under the chrome kept going, off the top of the screen (R6
violated). And because more than one layer claimed `expandedTop`, moving where it
was applied double-counted it.

**C4. Reachability conflated with content height.** Every detent must be
settleable, and UIKit clamps the max offset to `contentH + insetBottom −
viewport`. Expressing that as content forces a value derived from a measurement
it itself changes — a feedback loop needing a monotonic accumulator to converge.

---

## 3. The ideal decomposition

### The single source

One native `UIScrollView`. `τ = contentOffset.y`. `H = collapsedTop −
expandedTop`. `τ ∈ [0,H)` is sheet travel; `τ ≥ H` is list scroll. **Every
other visual in the system is a pure function of τ.** Nothing else is a motion
source — that is R3, and it is structural rather than a thing to be careful about.

`sheetTop(τ) = expandedTop + max(0, H − τ)`

### The layers, bottom to top

```
  map
  frost                 ← the blurred backdrop; cutouts reveal THIS
  THE PLATE             ← the sheet surface: opaque, top = sheetTop(τ),
                          unbounded downward, with N holes punched by mask
  THE TRACK             ← the scroll view: TRANSPARENT.
                          content = [spacer H][chrome][body][tail]
  nav exclusion mask    ← applied to the composite, not to any one layer
```

Four layers, four responsibilities, no overlap. Read against §2: C1 dies because
the plate is τ-derived and unbounded (R4/R5 hold for any content length, with no
padding and no cap — the property falls out, it isn't engineered). C2 dies
because there is exactly one surface and therefore exactly one place a hole can
exist.

### The origin has ONE owner

`expandedTop` is applied in exactly one place: the track's FRAME. The frame _is_
the region the sheet can ever occupy, so it clips there natively — containment
becomes a consequence of geometry rather than a mechanism (R6). No consumer
below applies it again. The double-header regression was this rule being absent,
not the frame law being wrong.

### Reachability is an inset

`insetBottom = max(0, viewportH − (contentH − H))`, `viewportH = screenH −
expandedTop`. An inset does not change `contentH`, so this converges in one step
by construction. No accumulator, no reset, no loop (R7 settles land where they
were aimed).

### The chrome is content, pinned natively

The chrome lives INSIDE the track's content, after the spacer, and is translated
by the native module in `scrollViewDidScroll` — same frame, same writer as the
scroll itself. This is what makes R3 structural: there is no second writer to lag.
It is also what makes R2 structural: every touch on the sheet is a scroll touch,
and `delaysContentTouches`/`cancelContentTouches` IS the tap-vs-drag arbiter, so
buttons work without stealing the grab. Chrome must be raised above the cells,
which paint after the header.

### Holes are registered, not drawn

A page declares holes as descriptors — rect + radius, in sheet space, each a
function of τ where it needs to be. The plate consumes the registry and punches
them in one mask. A component never draws its own hole. This is the whole of R9,
and it is the only shape in which R9 can hold for scenes that don't know about
each other.

### The divider is a derivation

`opacity = clamp01((τ − H) / k)`, read from a SHARED VALUE, suppressed while
`H ≤ 0`. If it is visible at rest, either τ rests past H (a containment
failure, §C3) or H was captured before layout. It is never independently wrong,
and must never be given its own state (R8).

### Seats and transactions

A seat is a one-shot switch command, not a standing target: it re-asserts on
attach, on prop change, and whenever the reachable range GROWS (a seat is
unreachable until content supports it), and it is cancelled outright the moment
the user touches the track (R11). A scene switch completes ONE readiness
transaction joining chrome layout, paint, and live redraw — the `[JOINT]` timeout
is that join having three ad-hoc acks instead of one bridge (R12).

---

## 4. What this makes impossible

The test of a decomposition is which defects it forbids by construction, not
which it fixes:

- A short page cannot expose its own end — surface extent is not a function of
  content.
- A scene cannot get a white box where a cutout belongs — there is one surface
  and one hole registry.
- A cutout cannot reveal the wrong layer — the plate sits directly on the frost.
- Content cannot render above the sheet — the frame doesn't extend there.
- The header cannot lag — there is one writer.
- A detent cannot be unreachable — reachability is geometry, not content.
- The divider cannot be independently wrong — it has no state.

---

## 5. Where the tree stands against this

Honest inventory, not a plan:

| Piece                                                | State                             |
| ---------------------------------------------------- | --------------------------------- |
| ONE TRACK physics, ballistic wall, native spring     | matches                           |
| Chrome as pinned content; grab; no wiggle            | matches                           |
| Seat (one-shot, yields, reachability re-assert)      | matches                           |
| Surface as content (rows + footer)                   | **C1 — must become the plate**    |
| Cutouts per component                                | **C2 — must become one registry** |
| `expandedTop` as content padding, multiple claimants | **C3 — one owner, the frame**     |
| Fabricated fill for reachability                     | **C4 — must become an inset**     |
| Nav exclusion via the production frame host          | matches (R10)                     |
| Scene readiness: three ad-hoc acks                   | **must become one join (R12)**    |

The four marked rows are the same edit, not four: introducing the plate is what
lets surface, holes, containment and reachability each land in the layer that
owns them. They cannot be done one at a time — that is what the last round
proved, and it is why the attempt regressed.

---

## 6. Execution order

Each step must be eyeballed on device before the next. The last round's failure
was landing three laws blind in one pass.

1. **Prove the origin has one owner.** Log `expandedTop`, chrome screen y, and τ
   at rest on home and polls. This is attribution, not a change, and it gates
   everything: the double-header proved the claimants are not yet known.
2. **Introduce the plate** behind the track, above the frost. Rows and footer go
   transparent. Nothing else changes. Verify: short page rubber bands both ways
   with no visible edge.
3. **Move containment to the frame** and drop the content padding. Verify:
   nothing renders above the sheet top; the divider goes absent at rest (§3 — it
   should fix itself, and if it doesn't, it is a real independent defect).
4. **Move reachability to the inset**, delete the fill. Verify: scroll length
   matches content; every detent still settles.
5. **Move holes into the plate registry.** Verify: profile stats and curated
   lists show frost.
6. **Collapse the scene acks into one join.** Verify: the `[JOINT]` error is gone
   on list entry.

---

## 7. RED TEAM (2026-07-28) — checked against the old sheet + the prototype record

Two findings invalidate parts of §2/§3. Recorded before any code is written.

### F1. C2 is WRONG — the hole registry already exists, and we are not using it

The old stack (inventory §4) is:

```
map → sheet container → nav-exclusion mask + hard clip → shadowShell →
sceneStackSurface (r22 top, overflow hidden) → [0] ONE FrostedGlassBackground
(opacity 1, never animated) → [1] scene white plate → [2] body lane +
SceneBodyFoundationSurface (white plate + FrostCutout holes) → ... →
[60] PersistentSheetHeaderHost (cutout plate) → [61] divider host
```

`SceneBodyFoundationSurface` IS the "one surface, one hole registry" §3 proposes:
a white plate with a hole store, 0 holes → plain fill, ≥1 → one content-tall
`MaskedHoleOverlay`. THE TRUE-CUTOUT LAW (2026-07-23) already established that
every see-through element punches through to ONE shared frost, with self-frost
deleted app-wide.

And the two scenes the owner reports broken are named in the record as the only
two `FrostCutout` users: **ProfilePanel stats (r16) and the HomePanel row band.**

So the defect is NOT components each implementing holes. It is that
**`FrostCutout` is a no-op outside a foundation surface — by design** — and the
track host does not reproduce the layer stack that provides one. The white
curated-list boxes and the profile band showing map are the same single fault:
a missing founding layer, not a missing abstraction.

This is banked law #20 (when production already owns a behaviour as a
component, REUSE it — a second implementation is a second writer). §3's "holes
are registered, not drawn" is right as a _law_ and already true in the tree.
Writing a new registry would have been the error the red team was for.

### F2. The short-page fact — the old system already solved R5 with ZERO padding

Boundary-physics slice 4 (2026-07-23) deleted `SHORT_PAGE_SCROLL_ROOM_PX`
outright: "a short page's interior range is honestly 0 — both boundaries at
once", and the overscroll pan treats `max === 0` as a legal bottom, "so short
pages get the real rubber-band with zero fake padding."

So the old architecture met R4/R5 by making the sheet's rubber band a SEPARATE
mechanism from the list's scroll. ONE TRACK fused them — which is why the fake
padding came back. The fusion is still right (R1 is the whole point), but it
means **reachability and opacity had no analogue in the old system and are
genuinely new obligations of ONE TRACK.** §3's inset (reachability) and plate
(opacity) stand — they are not re-solving a solved problem, they are paying the
price of the fusion. That price is worth naming honestly rather than pretending
ONE TRACK is free.

### F3. Containment — the old clip MOVED; ours is static, and that is correct

Old: `sceneStackSurface` clips with `overflow hidden` and r22 top corners, and
that container moves with the sheet. §3 makes the clip STATIC at `expandedTop`.
Both are sound, for different reasons: in ONE TRACK the spacer is transparent, so
content cannot exist above `sheetTop` while `τ < H`; the only escape is content
rising past `expandedTop` when `τ > H`, which a static clip bounds exactly. The
r22 rounded top corner must then ride `sheetTop` — that is THE PLATE's corner,
not the clip's. This is a real difference from the old system and must be
eye-checked, not assumed.

### Verdict

§3 survives, with C2 struck and rewritten: **the plate is not new construction —
it is `SceneBodyFoundationSurface`'s mechanism HOISTED from the body lane (where
it is content-sized, which is C1) to the sheet (τ-anchored, unbounded).** The
frost layer, the hole store, `MaskedHoleOverlay` and `FrostCutout` are reused
verbatim. Holes stay in content coordinates with the existing
`translateY = −clamp(scroll) − contentOverscroll` glue term.

### Revised step order (supersedes §6)

1. Attribute the origin's claimants (unchanged — still the gate).
2. **Reproduce the founding layer stack in the track host**: ONE
   `FrostedGlassBackground`, then the sheet plate, then the track. This alone
   should restore profile stats and the home row band, and it is the smallest
   change with the largest reported-defect coverage.
3. Hoist the foundation plate from content-sized to τ-anchored/unbounded (C1).
4. Containment to the frame; r22 corner onto the plate. Eye-check the corner.
5. Reachability to the inset; delete the fill.
6. Collapse the scene acks into one join.

---

## 8. RED TEAM 2 (2026-07-28) — the mechanism, proven from the tree

F1 said "a missing founding layer." That was the right shape but still a
hypothesis. It is now proven, and it is sharper than F1 stated.

### The proof

- `TrackSheetPage.tsx:491` renders the app's ONE `FrostedGlassBackground`
  **inside the chrome block**, immediately above the chrome's own
  `MaskedHoleOverlay` (:496).
- `TrackSheetRouteHost.tsx:545` wraps **every row individually** in its own
  `SceneBodyFoundationSurface`, with `scrollOffset={zeroScrollOffset}`. The
  comment at :539 records why: "FrostCutout found no surface and silently
  rendered a plain box."

So the frost is not a founding layer of the sheet at all — it is a **local
backdrop of the header**. That single fact explains the exact split the owner
reported, with no remaining mystery:

- Header cutouts (grab handle, nav action) show frost — the frost is directly
  behind that plate.
- Body cutouts (**ProfilePanel stats, HomePanel row band** — the only two
  `FrostCutout` users) show the MAP, because behind a row's plate there is
  nothing but the transparent track.

The per-row wrap at :545 was a fix aimed at C2's symptom (FrostCutout no-op'ing)
that could never work: it gave each hole a plate, but no hole a frost. It also
IS conflation C1 in its purest form — N plates, each sized to a row.

### What this settles about the design

1. **The frost must found the SHEET, not the chrome.** Old stack [0]: ONE
   `FrostedGlassBackground`, opacity 1, never animated, beneath everything. This
   is a move, not new code.
2. **One plate, not N.** The per-row surfaces collapse into the single
   τ-anchored plate of §3. This is the hoist, and it deletes the per-row wrap.
3. **One foundation surface at the LANE**, restoring the real
   `scrollOffset` glue term (`−clamp(scroll) − contentOverscroll`) that the
   per-row wrap zeroed out. Holes stay in content coordinates.
4. `TrackSheetStrip` already punches through its own plate with the same
   `MaskedHoleOverlay` — correct once a frost exists beneath it, and needing no
   change.

### Ordering correction

Step 2 and step 3 of §7 are **not separable**. Hoisting the frost without
collapsing the per-row plates leaves N opaque row plates between the frost and
the holes; collapsing the plates without the frost leaves the holes revealing
map. They land together or not at all — the same lesson as the last regression,
arrived at from the opposite direction.

### Confidence

The cutout family (§4 items 2 and 3) is now fully attributed from the tree, not
inferred. The remaining items are NOT at this confidence and must not be
implemented on the same assumption of certainty: the polls header gap, the
`[JOINT]` redraw join, and nav choppiness have no attributed mechanism yet.
