# Sheet V4 — The Foundation Pass (DISCUSSION DRAFT)

> Successor to `overlay-sheet-system-redesign-v2.md`. This is the **final** sheet-architecture
> pass before we bet the whole polls + future UI on it. Goal: make the existing custom
> reanimated sheet core **provably** world-class — zero frame drops, no map interference during
> sheet motion, one simple nav↔sheet rule, and a test/contract/harness foundation so any new
> sheet inherits that quality for free.
>
> **Not a rewrite.** Audit (2026-06-19) shows the v2 plan is ~80% executed. V4 = finish the
> residual, _prove_ it with gates, _consolidate_ the nav rule, and _generalize_ for poll
> navigation. If we ever can't hold the bar on the custom core, a library switch is the fallback —
> but nothing found says we're there.

## Where v2 actually landed (audited, not assumed)

| v2 phase                        | Intent                                  | Real status (2026-06-19)                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — zero JS during drag         | no React state churn on drag/settle     | **NOT done (red-team, 2026-06-19).** The worst offender (full-screen `setState` in `Search/index.tsx`) is gone, BUT `useBottomSheetSharedSnapPublicationRuntime` still `runOnJS(notifyDragStateChange/notifySettleStateChange)` on drag/settle _transitions_ (a few calls/gesture, not per-frame). **Must verify the consumers don't `setState`/re-render mid-gesture** — this is the real V4 work I earlier under-stated. |
| 2 — row/measurement idle-gating | no heavy work during settle             | **Verify.** `use-top-food-measurement` + `restaurant-result-card` — confirm measurement is idle-gated, not `setTimeout`-on-settle.                                                                                                                                                                                                                                                                                         |
| 3 — map isolation               | map smooth, untouched by sheet flicks   | **Largely done.** Heavy map-LOD/perf work landed all session (native LOD ownership, residency, jitter flows). Confirm `handleCameraChanged` is idle/throttled and `SearchMap` is memoized against sheet state.                                                                                                                                                                                                             |
| 4 — frosted cutout fix          | true blur through cutouts, no gray wash | **Verify.** `OverlaySheetHeaderChrome` now does SVG-mask cutouts; confirm `SearchFilters` toggle strip no longer uses a `whiteFill` that washes the blur.                                                                                                                                                                                                                                                                  |
| 5 — unify last non-core sheet   | one animation core                      | **DONE.** `SecondaryBottomSheet`/`PollCreationSheet` are gone; poll creation runs on the shared scene-stack core.                                                                                                                                                                                                                                                                                                          |
| 6 — validation guardrails       | perf gate + smoke test                  | **The real gap.** Rich `apps/mobile/src/perf/` harness + many maestro flows exist, but **no sheet-drag-during-map-motion perf contract/gate**. This is the heart of V4.                                                                                                                                                                                                                                                    |

## Goals (your bar, restated)

- **Zero frame drops** during any sheet drag/settle; **map never janks** while a sheet moves.
- **Simple + extensible**: adding a new sheet (or a poll detail page) is a small declarative
  registration, inheriting motion + perf + nav behavior — no per-sheet boilerplate.
- **One nav↔sheet rule, in one place**: nav bar **hidden** during the search _result_ sheet;
  **visible** during _nav-sheet_ pages (polls, profile, bookmarks). Today this logic is spread
  across ~10 runtime files — consolidate to a single authority + contract.
- **Provable + automated**: contracts (compile-time), maestro perf flows (runtime), harness logs +
  attribution (so when something regresses we get real-time, localized feedback — not a guess).

## V4 scope

### A. Close the residual v2 items (verify-then-fix; small)

Audit + finish Phases 1–4 above. Each is a targeted confirmation; only fix what's actually still
open. No behavior change beyond closing the named gaps.

### B. Consolidate the nav↔sheet rule into ONE authority (the "rules are very important" piece)

- Single source of truth: a `nav-visibility authority` that maps **active sheet kind → nav
  visibility**, driven by shared values (UI-thread), JS only after settle.
  - `result` sheet → nav hidden (+ hidden during its motion).
  - `nav` sheet (polls / profile / bookmarks) → nav visible.
  - New sheets declare their kind; the rule is automatic, not re-implemented.
- Collapse the ~10 nav/chrome runtime files into that one authority + a thin contract. This is the
  highest-leverage simplification and the thing most likely to bite us as we add poll screens.

### C. The proof foundation (the heart of V4 — your "contracts + maestro + harness + logs")

- **Perf contract**: a named scenario "sheet-drag-while-map-live" with hard gates — UI ≥ ~58fps,
  JS ≥ 50fps (no drops to 0), map stays interactive. Wire into the existing
  `PerfScenarioCoordinator` + `perf-scenario-attribution` so a violation names the offending
  subsystem (sheet / list / map / markers).
- **Maestro flow(s)**: `sheet-drag-during-map-motion.yaml` (flick mid↔expanded while the map has
  live pins) + extend the existing `search-map-jitter-swipe` family. These run in CI/local and emit
  the harness logs you can read in real time.
- **Contract gate**: exit-non-zero on violation (mirror the existing LOD contract gates) so a sheet
  regression can't land silently.

### D. Generalize for the poll UI's needs (so the polls plan builds on solid ground)

- **Detail page = FLAT content-swap (the one-sheet ethos), NOT nested push** (red-team correction).
  Confirmed: all scenes are pre-mounted and swapped by visibility; the sheet never unmounts; a hidden
  scene keeps its scroll position. So "poll list → poll detail → back" is a `pollDetail` _scene swap_,
  exactly like restaurant-profile swaps in over search results — no new push/pop primitive needed.
  The one thing to formalize: **content picks the snap target on switch** (the sheet owns snap rules;
  a scene can request its initial snap when it becomes displayed). This matches "content can dictate a
  few things like what it snaps to when the sheet switches."
- **Confirm modal-drag need**: if poll flows want a draggable modal (e.g. a confirm/compose
  sheet), decide now whether to fold `OverlayModalSheet` into the core or keep it as the explicit
  "non-draggable utility modal" (price/score). Likely keep the split — it's a clean separation, not
  fragmentation — but make the call deliberately.

## Non-goals

- No library switch (no `@gorhom/bottom-sheet`); no from-scratch rebuild.
- No restyle of existing sheets beyond the frosted-cutout fix.

## Sequencing

0. **Measure** the current state against the gates (establish the baseline; confirm which v2
   residuals are real). ← do this first; it sizes the rest.
1. Close residual v2 items (A).
2. Consolidate nav rule (B).
3. Build the proof foundation (C) — and leave it running as the regression guard.
4. Generalize detail-page navigation (D).
   Then → poll UI (`polls-frontend-plan.md`) builds on this.

## Open questions

- Exact fps gates (58/50? stricter?) and on which devices (the perf baseline device matters).
- Keep `OverlayModalSheet` separate (recommended) vs fold into core?
- Does any nav sheet need a _different_ nav rule than "visible" (e.g. poll detail page)? You said
  poll page keeps nav visible **for now** — confirm that's the V4 default.
