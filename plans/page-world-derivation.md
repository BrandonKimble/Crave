# THE PAGE WORLD — the full derivation, from zero

2026-07-29. Written after the mask landing froze the sheet and was reverted —
the fourth composition regression in three days against ZERO motion regressions.
That asymmetry is the datum this document is built on. The current
implementation is deliberately not consulted except as evidence; where it
happens to match the derivation, that is noted at the end, not assumed.

The owner's charter: consider every requirement, constraint, want, and issue
ever raised; derive the ideal shape as if nothing existed; getting it right
should be easy because every abstraction is the right one. Implementation may
be hard — CORRECTNESS must be easy.

---

## PART I — The complete requirement inventory

Everything ever asked for, in one place. A derivation that omits a requirement
is wrong even if elegant. Sources: owner messages across the arc, the
acceptance inventory, the old-system audit, the prototype record.

### A. Motion (proven; the prototype and every round since)

- M1. Sheet travel + list scroll are ONE continuous motion; no handoff seam.
- M2. Rubber band at both extremes, velocity-continuous; critically damped
  detent settles; THE BALLISTIC WALL (momentum never crosses H in either
  direction).
- M3. Short content changes NOTHING about feel: full rubber band, every detent
  reachable, no fabricated scroll length, no hard caps.
- M4. Every point of the sheet is grabbable — title, buttons, handle, rows,
  strip. UIScrollView owns tap-vs-drag arbitration.
- M5. Programmatic seats: one-shot, re-assert until reachable, always yield to
  the finger. Gesture settles write posture memory; programmatic ones don't.

### B. Surface (the sheet as a material object)

- S1. ONE frosted layer founds every sheet; every see-through element punches to
  IT (THE TRUE-CUTOUT LAW — self-frost is banned, owner-rejected as fake).
- S2. The sheet reads as one solid plate: no visible edge top/bottom/end, at any
  τ, through any bounce, for any content length.
- S3. Rounded top corners (r22) + the production shadow, riding the sheet's top
  edge exactly; the scroll may never square them off.
- S4. Cutout inventory: grab handle, close/plus circle, toggle-strip chips,
  profile stat band, home curated-list boxes, skeleton blocks. Holes exist in
  CONTENT too (profile, home) — not only in chrome — and content holes scroll
  with their rows while still revealing the one static frost.
- S5. The divider: absent at rest, fades in exactly as content slides under the
  chrome, sits at the chrome's true bottom edge on every permutation.

### C. Chrome (the header system)

- C1. One shared header system: title slot, extras, plus↔X nav action,
  grab handle; strip band with true cutouts; exact production metrics
  (68.25 header; +32 band +8 spacer on strip scenes; fractional heights are
  REAL and must not be able to open seams).
- C2. Content never renders in the chrome band; the chrome's cutouts sample
  only frost, at every scroll position ("you shouldn't be able to grab the
  scroll through the header" = the header band belongs to the chrome visually
  while remaining sheet-grabbable).
- C3. No wiggle: chrome and body may never disagree by a frame while moving.

### D. Choreography (the app around the sheet)

- D1. Nav exclusion: the sheet's bottom boundary follows the nav bar in/out,
  silhouette curve preserved, same frame as the nav's motion (the hard-won
  transition on parent↔child switches and result reveal).
- D2. Search interplay: the search bar + shortcut buttons live BEHIND the sheet
  scrim and transition against sheet position (publication values
  sheetTranslateY/sheetScrollOffset feed the search chrome transition, scrim,
  dismiss plane, origin capture).
- D3. Scene switches are transactions: chrome ack + paint ack + redraw join
  ({cards, mapFrame, sheet}) — a reveal never lands mid-slide (the fence), and
  a world-backed panel holds rows until the join (the [JOINT] contract).
- D4. Scene permutations, all real today: plain header; header+strip (polls,
  lists); in-list leader; content cutouts (profile, home); horizontal galleries
  inside rows (home); child pages (listDetail, pollDetail) with enter/exit nav
  choreography; search/results with its dual-band composition (hardest, LAST).
- D5. Pagination signals, MVCP off on re-sortable feeds, FlashList recycling
  intact (virtualization must not starve).

### E. Platform laws (all RED-proven this arc; the derivation must respect

### every one)

- P1. Reanimated scroll events: velocity and contentSize are NULL.
- P2. Fabric replaces scroll delegates → KVO re-wrap; attach retries; every
  native wiring re-asserts (refs fire child-first).
- P3. Direct contentOffset writes don't stop live deceleration; only
  setContentOffset:animated:NO does.
- P4. UIKit clamps settles to contentH + insetBottom − viewport.
- P5. FlashList: needs renderScrollComponent=Animated; IGNORES `top` in its
  style prop (measured — caused three shift regressions); sticky headers are
  JS-driven (one-frame lag — unusable for chrome).
- P6. Worklets must read geometry from SHARED VALUES; boot captures are wrong
  forever. Nothing samples the track from the JS thread while it moves.
- P7. overflow:hidden clips HIT-TESTING with rendering. A CALayer mask clips
  rendering only. (The mask landing froze the sheet anyway — the mechanism's
  hit-testing claim is true, so the freeze came from something else in that
  landing; MUST be attributed during rebuild, not assumed away.)
- P8. Per-frame contentOffset overrides during gestures kill the drag; bounds
  are insets, never per-frame writes.
- P9. Chrome overlays must be pointerEvents box-none or they eat the grab.

---

## PART II — Why the prototype succeeded and production keeps failing

The prototype proved A (motion) with a toy composition: one scroll view, plain
rows, a fake header, nothing else. It worked because THERE WAS NOTHING ELSE.

Production failure has never been the motion. It has been four systems asking
one component to be all of them:

1. The TRACK (motion engine) was also asked to RENDER the surface → short-page
   edges, fabricated fills.
2. It was asked to CARRY the chrome → wiggle fixes, pins, z-wars, hairline
   seams at fractional heights, cutouts sampling rows.
3. It was asked to express CONTAINMENT → clip/counter-offset regressions on a
   component that drops `top`.
4. Its events were ad-hoc wired into CHOREOGRAPHY → the [JOINT] hang.

The conclusion is not "composition is hard." It is: **the scroll view must be
demoted to exactly two jobs — the finger and the rows — and every other pixel
and signal must be a DERIVATION of its offset.** The prototype was right
because, accidentally, that was true of it.

---

## PART III — The architecture

### The one law

**τ is the only variable. One native writer moves it. Everything else — every
layer, every transition, every transaction fact — is a pure function of
(τ, scene, navState).** Anything that cannot be written as such a function is
either a new input (a finger, a scene switch, nav motion) or a bug.

Derived quantities, owned by ONE geometry authority module and published as
shared values (P6):

```
H            = collapsedTop − expandedTop
sheetTop(τ)  = expandedTop + max(0, H − τ)        (the sheet's material edge)
bodyTop(τ)   = sheetTop(τ) + chromeHeight(scene)   (where content may appear)
listY(τ)     = max(0, τ − H)                       (in-page scroll)
divider(τ)   = clamp01((τ − H)/k)
navBoundary  = f(navState)                          (D1; independent input)
```

`expandedTop` is applied by exactly ONE consumer (the geometry authority);
every other layer receives sheetTop/bodyTop as values. The [ORIGIN] invariant
(chrome window-y === sheetTop, drift barks with numbers) is permanent, not a
debug probe — this exact defect shipped three times.

### The stack — six layers, six owners, zero overlap

```
z0   MAP
z1   FROST        anchored at sheetTop(τ), unbounded down, r22 corners +
                  production shadowShell (shadow on the non-clipping wrapper).
                  ONE instance. Every hole in the app reveals this. (S1,S3)
z2   THE TRACK    full-bleed transparent UIScrollView (the finger owns all of
                  it — M4). Content = [spacer H][chrome reserve][rows][tail].
                  Renders ROWS ONLY. Rows carry their own white plates and may
                  punch holes (S4) — content holes scroll with rows for free
                  because they ARE rows. Natively masked so rows never RENDER
                  above bodyTop (C2) — mask, not overflow (P7), re-asserted on
                  attach (P2).
z3   THE TAIL     white plate anchored at max(sheetTop, contentEnd − τ):
                  the below-content surface. With row plates, this completes
                  S2 with zero fabricated length (M3; reachability handled
                  separately as contentInset.bottom, P4).
z4   THE CHROME   a LANE at translateY = sheetTop(τ), box-none (P9, M4).
                  White plate with the chrome hole registry punched through to
                  z1. Divider pinned at its bottom edge, opacity = divider(τ).
                  Never inside the scroll (C1–C3): no shared edge with rows ⇒
                  no wiggle to fight and no fractional-height seam to leak.
z5   NAV MASK     the production SearchRouteSheetFrameHost wrapping the
                  composite — the animated pair + hard clip, reused verbatim
                  (D1; law #20).
```

Who moves per frame: z1, z4 by ONE shared derivation of τ; z2 by the engine
itself; z3 by its own τ derivation; z5 by navState. There is no frame where two
writers disagree about the sheet's edge, because there is only one definition
of the edge.

### The choreography port — one bridge, not ad-hoc acks

A single `TrackFacts` boundary owns every outbound signal:

- τ mirror → sheetTranslateY / sheetScrollOffset publications (D2).
- settle(detentTau, writer) → posture memory (gesture-only) AND the redraw
  join's sheet leg (writer-agnostic; ready immediately when a redraw arms at
  rest) AND the motion fence (pending at motion start, restored at settle —
  motion-keyed on BOTH sides, per the old contract's warning).
- attach/chrome/paint acks for scene-switch transactions (D3).

Inbound is exactly two commands: `seat(τ)` (M5 semantics) and
`setScene(geometry, chromeSpec)`. Choreography never touches the scroll view;
the sheet never reaches into choreography. The [JOINT] class of bug becomes
impossible to write silently: there is one file where legs can be missing.

### What this forbids by construction

- Rows behind a chrome cutout (rows can't render there) — the blur can only
  sample frost.
- A visible sheet edge on short pages (surface is τ-derived, not content-sized).
- Wiggle and hairline seams (chrome shares no edge with content).
- Origin double-counts (one consumer of expandedTop + a barking invariant).
- Squared corners (the scroll never reaches the corner radius; it's z1's).
- A hung reveal with no culprit (one bridge file owns every leg).

---

## PART IV — Prototype question, answered

No new toy page. A second prototype would repeat the original sin: validating
in an environment with no composition. The flip store already gives the real
app as the testbed with `?on=0` rollback — the real scenes, real transactions,
real nav ARE the prototype. What was missing was never a sandbox; it was
per-rung verification discipline.

## PART V — The build order (each rung: land → instrument → OWNER THUMB → next)

0. ATTRIBUTE THE FREEZE from the mask landing (grab dead everywhere). Candidates
   the landing changed at once: chrome-lane children eating touches despite
   box-none wrapper; the mask's coordinate space (bounds already track
   contentOffset — the +contentOffset.y term may be double-applied, masking
   ALL rows out and reading as "frozen"); the deleted clip wrapper. One probe
   each. The mask mechanism is not condemned — the landing that carried it is.
1. Geometry authority + [ORIGIN] invariant as permanent RED instruments.
2. z1/z3 (frost + tail) — already match the derivation from fb039e40/2baddb4f;
   verify against invariants, don't rebuild what matches.
3. z4 chrome lane + z2 render mask, landed as ONE rung this time but verified
   with the rung-0 probes before the eye pass.
4. TrackFacts bridge consolidation (move the existing acks/settle/publication
   wiring into the one file; delete ad-hoc paths).
5. Scene sweep on the standard; search/results last (D4).
6. Old-system delete pass + grep invariants + full acceptance walk.

Status of the current tree vs this derivation: motion core, seats, frost/tail,
nav-mask reuse, divider derivation, and the settle/join producers match. Chrome
placement (in-content) and the missing render mask are the open deltas — rung 3
is the cutover moment, and it is the exact place three landings failed, which
is why rung 0 exists.
