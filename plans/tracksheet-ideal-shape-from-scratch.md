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
