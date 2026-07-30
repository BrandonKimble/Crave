# THE NATIVE SHELL — the final derivation

2026-07-29. Supersedes the architecture section (Part III) of
`page-world-derivation.md`. Parts I (requirements) and II (why the prototype
worked) of that document carry forward unchanged — this rewrite answers the
foundational question that document never asked: WHICH SIDE OF THE BRIDGE does
the sheet's shell live on?

The rule of the rewrite, per the owner: the scars (pins, clips,
counter-offsets, z-wars, every attribution of every regression) are DISCARDED —
artifacts of a wrong structure, not inputs. The platform laws (Part I §E) are
KEPT — they are physics, discovered expensively, and a design that ignores them
is not from-scratch, it is wrong.

---

## 1. The foundational interrogation

Three questions sit under everything. Two survive; one falls.

**Q1 — does motion live in a UIScrollView?** YES. Rubber band, momentum,
deceleration curves, and tap-vs-drag arbitration are OS-tuned and unfakeable.
Settled by the prototype.

**Q2 — is ONE TRACK right (sheet travel fused with list scroll)?** YES. It is
the only shape in which "no handoff seam" is structural rather than
choreographed. The old system's seam WAS its handoff.

**Q3 — is the sheet's SHELL built out of RN views?** NO — and this was the
unexamined assumption under every composition failure. Each one was RN layering
emulating something UIKit does natively:

| Need                           | UIKit native                   | RN emulation (what we fought)     |
| ------------------------------ | ------------------------------ | --------------------------------- |
| clip rendering, keep touches   | CALayer mask                   | overflow:hidden kills hit-testing |
| corners + escaping shadow      | one layer config               | shadow-shell/clip-view sandwiches |
| blur sampling the right layer  | UIVisualEffectView position    | frost stacking, "double frosty"   |
| a band content can't enter     | mask in the scroll's own space | z-wars, hairline seams            |
| per-frame geometry, one writer | scrollViewDidScroll            | shared values + worklets + JS lag |

The precedent is the map: it became best-in-class the day its render system
went native. The sheet's shell is the same kind of object — a high-frequency,
geometry-exact, composited surface. RN is the wrong instrument for it and the
right instrument for everything inside it.

---

## 2. The architecture

### The division of the world

**Native owns the SHELL — everything whose position is a function of τ.
RN owns the CONTENT — everything whose meaning is a function of the app.**

```
NATIVE (TrackSheetShellView, one UIView in TrackScrollKit)
  ├─ THE ENGINE     the wrapped UIScrollView delegate (exists today: KVO-durable
  │                 proxy, crossing intercept, critically damped springs,
  │                 ballistic wall, snapTo). UNCHANGED — zero motion
  │                 regressions ever; it is finished.
  ├─ THE FROST      UIVisualEffectView, top edge = sheetTop(τ), unbounded down.
  │                 The ONE material every hole in the app reveals (S1).
  ├─ THE PLATE      opaque surface above the frost, r22 top corners, the
  │                 production shadow (radius/opacity ported once, exactly),
  │                 with the CHROME HOLE REGISTRY punched via one even-odd
  │                 CAShapeLayer mask (grab handle, nav circle, strip chips).
  ├─ THE BAND MASK  CALayer mask on the scroll view: rows never RENDER above
  │                 sheetTop(τ) + chromeHeight. Rendering only — touches pass,
  │                 the whole sheet stays grabbable (M4, C2).
  ├─ THE DIVIDER    a 1pt layer at the chrome's bottom edge,
  │                 opacity = clamp01((τ−H)/k) (S5).
  ├─ THE TAIL       opaque layer at max(sheetTop, contentEnd − τ): the sheet is
  │                 solid past any content end, through any bounce, with zero
  │                 fabricated length (S2, M3). Reachability stays a
  │                 contentInset (P4).
  └─ THE CHROME SLOT a native container at sheetTop(τ), box-none.

  ALL of the above updates in ONE place: scrollViewDidScroll. One writer, one
  coordinate system, same frame as the finger. Wiggle, lag, seams, and origin
  double-counts are not fixed — they are UNWRITABLE.

RN (inside or above the shell)
  ├─ chrome content  → mounted into THE CHROME SLOT: title, extras, plus↔X,
  │                    strip chips. Pure content — it never positions itself.
  ├─ rows            → FlashList as today (renderScrollComponent=Animated,
  │                    MVCP off where needed). Rows carry their own white
  │                    plates; CONTENT cutouts (profile stats, home shelf) are
  │                    transparent holes in row plates revealing the native
  │                    frost — they scroll with rows because they ARE rows (S4).
  └─ nav exclusion   → SearchRouteSheetFrameHost wraps the composite, verbatim
                       (law #20; D1). It already works; it stays RN.
```

### The bridge, exactly two surfaces

**Commands in** (JS → native, set-and-forget; every one re-asserted on attach
per P2):

```
configure(geometry {expandedTop, collapsedTop, detents},
          chromeSpec {height, holes[]},
          surface {color, cornerRadius, shadow})
seat(tau)          one-shot; native cancels it on touch-down (M5)
```

**Facts out** (native → JS, THE ONE EMITTER — TrackFacts):

```
onSettle(detentTau, writer)   → posture memory (gesture-only) + the redraw
                                join's sheet leg + the motion fence (D3)
onScroll (the existing worklet stream) → sheetTranslateY/sheetScrollOffset
                                publications for search chrome, scrim, dismiss
                                plane (D2) — a MIRROR for consumers, never a
                                geometry source (P6 stays satisfied because
                                shell geometry no longer lives in JS at all)
```

Choreography (scene transactions, seats-from-scenes, acks) talks ONLY to these
two surfaces. There is no third path — a missing transaction leg has exactly
one file to be missing from.

### What becomes structurally impossible

- Chrome lagging or seaming against rows: they no longer share a writer,
  an edge, or a framework.
- A cutout sampling anything but frost: the band mask means nothing else is
  ever behind the plate's holes.
- A visible sheet edge at any τ or content length: the tail and frost are τ-
  derived layers, not content.
- Origin double-counts: `expandedTop` exists in ONE place — inside the shell.
  RN literally has no copy to misapply.
- A silent geometry failure: the shell can assert its own invariants natively
  (chrome slot y == sheetTop every frame) and bark loudly.

---

## 3. What survives from the current tree

Kept as-is: the ENTIRE motion core (proxy, springs, wall, snapTo, attach
retry), the seat semantics + reachability re-assert, TrackFacts producers
already written (settle observer, sheet-leg join, publications), the frost/tail
LAYERING (concept moves native, the derivation is identical),
SearchRouteSheetFrameHost reuse, the scene resolution in TrackSheetRouteHost,
the flip store. Deleted when the shell lands: every RN geometry view in
TrackSheetPage (founding/tail/clip/lane/divider views and their styles), the
pin, and all origin plumbing — TrackSheetPage shrinks to "configure the shell,
render chrome content and the list."

## 4. Build order (each rung: land → native invariant green → OWNER THUMB)

1. **ShellView + frost/plate/corners/shadow/tail** in TrackScrollKit, driven by
   the existing delegate. RN stops rendering those four views. Eye gate:
   silhouette identical, cutouts blur, short-page solid.
2. **Band mask + chrome slot + divider**; chrome content mounts into the slot;
   RN chrome geometry deleted. Eye gate: no hairline at any pan position,
   corners never squared, header cutouts live at every scroll y, whole sheet
   grabbable including chrome.
3. **configure()/seat() consolidation** — the bridge shrinks to the two
   surfaces; ad-hoc calls deleted. Gate: scene switches seat correctly, [JOINT]
   never barks.
4. Scene sweep on the standard; search/results last (D4).
5. Old-system delete pass + grep invariants + acceptance walk.
