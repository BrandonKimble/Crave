# Search-Map Ideal-Shape Effort — Master Issue Ledger

**Owner:** unified session (merged the map-merge/reveal-LEA session + the layer-level-presentation/toggle session; single authority now).
**Goal:** the ideal, long-term, **portable/future-proof** shape for the entire search-map presentation flow — LOD render (dots/labels), the canonical fade (reveal/dismiss/toggle unified), the collision↔basemap crossfade, live label side-selection, and a **standardized toggle primitive** reusable for favorites lists / profile shared-lists / any future toggle. Nothing is deployed; no users; no data to preserve. **Be destructive; chase the ideal.**

## The one sacred thing (DO NOT redesign)

The **pin↔dot LOD engine** — the promote/demote crossfade in `LodEngine.swift` (Fade / step / decide / snapSettled) and the pin↔dot complementarity. This finally works and is the ideal. Everything built _on top_ of it (labels, reveal, dismiss, toggle, collision, frost, the source-frame publish path) is on the table for first-principles redesign. Baseline "good state" = the pin↔dot-LOD commit (identify precisely in Stage 1; candidate `ed080fd9` "migrate iOS pins to self-owned CA overlay").

## Current architecture (inherited, mostly good — validate, don't assume)

- **Opacity product per layer:** dot `iconOpacity = ['*', presentation[1], nativeDotOpacity/__lea_lod__ [2]]`; label `textOpacity = ['*', presentation[1], nativeLabelOpacity/__lea_lod__ [2], nativeLabelSelected/__lea_revealed__ [3], base[4]]` (`search-map.tsx` ~2275 / ~2377).
- **Presentation = element [1]:** a plain layer-level number, written O(1) via `setLayerPresentationOpacity` (RMW element [1], preserves LEA [2+]) each fade-tick. **Reveal + dismiss + toggle all reuse `applyPresentationOpacity` → one canonical 300ms Hermite-smoothstep fade** on a CADisplayLink (`SearchMapRenderController.swift` ~8830). This is the layer-level O(1) rework (8.6ms→0.17ms/tick, ~50×). **KEEP this direction.**
- **LEA literals (reparse-immune, GL):** `__lea_lod__` (dot/label LOD floor, keyed to `lastPromotedInOrder` = the RETARGET) + `__lea_revealed__` (label one-of-four winner set), swapped by `swapLeaLiteral`/`replaceSentinelLiteral` (preserve element [1]).
- **Substrate split:** pins = self-owned CA overlay (`refreshOverlayFrame`, `tile.opacity = engine.pinOpacity × presentation`, reparse-immune); dots + labels = GL SymbolLayers **in the collision index** (must collide with each other / pins / labels / basemap street names → CA is ruled out for them). Pins participate in collision via an invisible GL obstacle keyed to `lastPromotedInOrder`.
- **Writer-contract** ([[toggle-label-dot-unification]]): ONE writer per factor of the opacity product. Must be preserved by any redesign.
- **Two writers of `__lea_revealed__` currently CONFLICT** (see L1): the observation selector (`applyLabelOneOfFourSelector`) vs the reveal commit (`commitSettledLeaAuthorityUnderCover`).

## Reference docs (agents: READ before designing)

Memory (`/Users/brandonkimble/.claude/projects/-Users-brandonkimble-Crave/memory/`): `layer-level-presentation-rework.md` (the rework + 6 issues + root causes), `toggle-label-dot-unification.md` (writer-contract), `unified-fade-toggle-architecture.md` (toggle genealogy + no-dropped-frames bar + 300ms debounce), `map-lod-render-substrate-decision.md` (CA/GL split + LEA + wiggle), `map-dots-substrate-decision.md` (dots GL + the flash archaeology + irreducible triangle), `map-lod-label-attribution.md` (label saga + collision constraints). Workflow artifacts: `handoff-redteam-layer-level-presentation.json` (7-agent red-team + ordered Edits A–H), `handoff-fade-machinery-map.json` (fade machinery file:line map). Repo: `SESSION-HANDOFF.md` (root), `CLAUDE.md` (discipline: instrument, don't static-guess).

---

## ISSUES (exhaustive; ID'd for tracking)

### PINS

- **P0 (SACRED):** pin↔dot LOD interaction is ideal — do not touch the engine. Pin render (CA overlay) is good. Red-team only for zoom-extreme artifacts, but changes here are last-resort.

### DOTS

- **D1:** Dots currently look fixed (bloom resolved by the RETARGET; residual ≤1-frame reparse bloom measured sub-perceptual). **Red-team hard for large-zoom-change artifacts** — a user zooming all the way in/out must see NO dot artifact ever (production-frequent, unacceptable to break). See `map-dots-substrate-decision.md`.
- **D2 (requirement):** maintain proper crossfades; keep collision with basemap labels + pins + labels + each-other; keep dense thinning.

### LABELS

- **L1 (flashing on reveal — DIAGNOSED this session):** `__lea_revealed__` has TWO writers racing. `applyLabelOneOfFourSelector` (observation, correct, progressive 10→71) vs `commitSettledLeaAuthorityUnderCover` (persisted-winner map, near-empty on fresh search → overwrites/wipes the selector's set 10→2→71). Labels snap out ~500ms then back = "fade in → snap out → fade back in." **Fix direction:** single authority for `__lea_revealed__` (selector owns it; reveal-commit stops writing it / instead run the selector under-cover so the correct winner set is committed before fade-in).
- **L2 (snap-in on reveal):** labels snap in during reveal instead of the canonical fade (see R1). Was worse before (separate-time fades); now snaps together.
- **L3 (batch side-pick on pan/TWIST — NEW, not yet attributed):** during panning, esp. **twisting**, labels **wait then all pick a side at once in a batch after a settle**, instead of live/independent/immediate like the LOD. Not mutually exclusive with live updates (some update live, some batch). Suspicion: not retrying free sides often enough / an observation-cadence gate that batches on twist. **Needs instrumentation.**
- **L4 (snap-vs-fade mixture — NEW; owner wants STANDARDIZED SNAP):** labels currently mix snapping (reposition to new free side) and fading (fade out when colliding with no free side). Owner PREFERS **snap everywhere**: if the pin is promoted and the label collides — whether switching to a new side OR no side is free (pin ends up label-less) — the label should **SNAP** (snap to new side / snap out), never fade. Standardize on snap while the pin is promoted.
- **L5 (POSITIONING — GOOD, preserve):** labels now pick a free side, don't leave a free side unused, one label per restaurant. Keep this behavior.

### REVEAL

- **R1 (snap-in, not canonical fade — PRIMARY):** running a search: pins+labels+dots **snap in together** instead of using the canonical fade-in. (Discrepancy: the other session validated "fade synchronized by construction" — reconcile: is the presentation ramp not running at reveal, or is the double-fade/snap masking it?) The reveal fade-in MUST be the SAME canonical fade as dismiss/toggle.
- **R2 / #5 (double-fade-in — ROOT-CAUSED, not fixed):** snap-in → snap-out → fade-in. INDEPENDENT of presentation — baked `nativeDotOpacity`/`nativeLabelOpacity` feature-state racing the `__lea_lod__` literal + `resetLiveMarkerEnterState` under cover. **Proposed fix (unimpl.):** in `commitSettledLeaAuthorityUnderCover` (~8396), before `updateLeaMembershipLiterals`, clear baked `nativeDotOpacity`/`nativeLabelOpacity` for the promoted set so the coalesce fallback aligns atomically with the fresh literal. (Overlaps L1 for labels.)
- **R3 (collision↔basemap crossfade on reveal — NEW requirement):** when map objects fade IN, **collision must turn ON in sync** so our dots/labels crossfade with the Mapbox basemap street labels (basemap names cull as ours appear). Currently missing/immediate.

### DISMISS

- **Dis1 (fade-out — GOOD, protect):** dismiss fade-out of all map objects works well + in sync. Verify it stays canonical; do not regress. Dismiss Gate B (clean empty map, coverage dots fade) currently PASSES.
- **Dis2 (collision↔basemap crossfade on dismiss — NEW requirement):** reverse of R3 — turn collision OFF as map objects fade OUT so the basemap street labels fade back in naturally (crossfade).
- **Dis3 (intermittent label snap on dismiss):** owner saw labels snap-out→snap-in mid-dismiss (intermittent; did not reproduce in one trace — likely the L1 two-writer conflict firing mid-dismiss).

### TOGGLE (dish/restaurant segment + filter chips; the FUTURE-PROOF primitive)

- **T1 (frame drop AT CLICK — PRIMARY):** a big frame drop right when the toggle is clicked, blocking the toggle animation. (The presentation-sweep frame drop was fixed by the O(1) rework; this at-click drop is likely a DIFFERENT cause — source re-projection / re-decide / JS work on the click frame. **Needs attribution.**)
- **T2 / #6-adjacent (double fade-in after settle — intermittent):** after the toggle settles, pins/labels/dots fade in twice.
- **T3 (cutout white strip flashes clear — during rapid toggling):** the toggle-strip cutout white area flashes transparent / unmounts and returns next frame. (Frost handoff-floor fix exists — verify it covers this; may be a separate cutout-plate issue.)
- **T4 / #6 (TOGGLE-BACK STALENESS — BIG, ROOT-CAUSED not fixed):** toggle restaurant→dish works (dish markers fade in); toggle back dish→restaurant fades the SAME (dish) data — map data doesn't switch. Cards switch, map doesn't. **Root:** source-frame publish/DEDUP (`search-map-source-frame-port.ts` `areSearchMapSourceFrameSnapshotsEqual` ~134) — published-but-not-rendered vs deduped. **Next:** add `didPublishSourceFrame` logging to the FULL projection path + retest on a dataset where dishes ≠ restaurants. `search-map-source-frame-port.ts` untouched.

### TOGGLE REQUIREMENTS (the portable pattern)

- **TR1:** ZERO dropped frames during the toggle pill animation (Google-grade; no main-thread work competes).
- **TR2:** On press-up: all map objects fade OUT; user may toggle as fast as they want; **wait for a settle** before re-grabbing new data based on where it settled; then fade IN.
- **TR3:** the fade-IN is synchronized with the results-card reveal.
- **TR4:** reveal / dismiss / toggle all use the **same canonical fade** (already the direction via `applyPresentationOpacity`).
- **TR5 (PORTABLE PRIMITIVE — the strategic goal):** the toggle strip + toggle flow must be a **standardized, reusable, portable** primitive — the same one used on the results sheet, the favorites-list sheet, profile shared-lists, and future toggles (only filters/sorts differ). This is a "gold-source" pattern to accelerate future development. Design for this from the start.

### FROST / CUTOUT

- **F1 (frost flash — FIXED, needs eye):** interaction frost dropped before the reveal cover was up (cover-handoff gap). Fixed via `FROST_HANDOFF_FLOOR_MS = 50` fade-OUT delay. Code-verified only — **needs a human finger-test.**

### CROSS-CUTTING

- **X1 (two-session fighting):** changes since the good-LOD state came from two overlapping efforts and started fighting (esp. the `__lea_revealed__` two-writer conflict, the reveal-commit vs selector). Be SKEPTICAL of every post-good-state change; unify authority per factor.
- **X2 (canonical fade = one fade):** the fade used for reveal/dismiss/toggle must be literally one mechanism. Confirm it is (and that reveal actually runs it — R1).
- **X3 (instrument first):** per CLAUDE.md — attribute every runtime bug by instrumenting the running app + a reproducible mimic flow (owner will drive search/zoom/twist/toggle), NOT by static reasoning.

### HARNESS (owner-requested)

- **H1:** build a durable, expandable **map-object telemetry harness** now that the pin/dot/label architecture is ~settled — track everything each of pins/dots/labels is doing (opacity, LOD role, side-pick, collision, presentation, source-frame publish) so future issues attribute fast. Owner will drive a mimic flow (search + zoom + twist + toggle) to feed it.

## Effort plan (staged; owner wants a HUGE concerted multi-team effort → consensus, not fighting)

1. **Stage 1 — GROUND + ATTRIBUTE + SKEPTIC** (workflow): verify current-state map (file:line), identify the good-LOD baseline, attribute the NOT-yet-root-caused issues (R1 reveal-snap, L3 batch-pick, L4 snap-mixture, T1 at-click frame-drop, collision-crossfade gap), skeptic pass on post-good-state changes, full constraint/requirement ledger.
2. **Stage 2 — DESIGN** (workflow): multiple independent first-principles ideal architectures for the whole flow (LOD render + canonical fade + collision-crossfade + live-label snap + PORTABLE toggle primitive), destructive/from-scratch, given this ledger + history + constraints.
3. **Stage 3 — RED-TEAM + IMPLEMENTATION-MENTAL-MODEL** (workflow): adversarially break each design vs every issue + every zoom scenario; mentally implement each in real code, hit blockers, write implementation plans.
4. **Stage 4 — SYNTHESIS**: master plan(s) (likely: LOD/labels plan, canonical-fade+collision-crossfade plan, portable-toggle-primitive plan).
5. **Stage 5 — INSTRUMENT + IMPLEMENT**: build H1 harness, prove each fix on the mimic flow, implement per plan, validate, then a cleanup + commit pass (strip scaffolding, `lodDebugLoggingEnabled=false`).
