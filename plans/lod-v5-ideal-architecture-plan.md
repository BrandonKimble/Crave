# Map LOD — Ideal V5 Architecture + Complete V4 Excision (PLAN, awaiting approval)

Status: planned via red-teamed 12-agent consensus (2026-06-26), grounded in the runtime
attribution in `lod-v5-canonicalization-worklog.md`. NOT yet implemented.

## Root cause (corrected — the inventory's headline was runtime-refuted)
The "two-authority opacity write" is NOT the root. Code-verified: `updateLivePinTransitions`
(`SearchMapRenderController.swift:7064`) writes only the in-memory struct (`setDerivedFamilyState`
7260); its GPU writer `applyLivePinTransitionFeatureStates` early-returns under v5 (8951), writing
NOTHING to the GPU under v5. Matches our runtime (`v4_authority_fire` fired, but `gpu_demote_census`
showed the stranded-mid pins were the engine's OWN, not v4-driven; `fsdrop=0`). So the v4 path running
under v5 is a cheap cleanup, not the cause.

The TRUE root has three parts (all fixed together — no single fix suffices):
- **ROOT-A — rate-incremental ease + internal-accumulator prune.** `LodEngine.advance` is dt-rate
  (`next = current + (target-current)*min(1, dt/fadeSeconds)`); under the 12–18fps render jank
  (dt 54–90ms) each step jumps 30–55% (the staircase = "snapping"). `step()` prunes a key the instant
  its INTERNAL scalar==target — decoupled from the GPU/painted value — so once a write desyncs internal
  from painted, the engine believes it settled and never writes again → stranded at 0.1–0.5.
- **ROOT-B — budget-boundary want-oscillation, no commit-invariant.** `decide` re-aims the fade at the
  new target from mid-opacity every tick; the v4 commit-invariant (7195) lives only in the dead v4 path,
  so rank≈30 markers ping-pong mid-range under camera jitter.
- **ROOT-C — residency not airtight.** A settle-time bundle re-add can CLEAR a promoted pin's
  `nativeLodOpacity` (the reason `idle_reassert` exists), and the engine won't rewrite (internal==target).

The "no self-heal path" the user named is a SYMPTOM of A+B+C, not the root.

## Ideal design (single-authority, time-based, no heal)
- **Time-based wall-clock fade.** Per-key `Fade{from, target, startMs}`; `opacity(nowMs) =
  from + (target-from)*clamp((nowMs-startMs)/fadeMs, 0, 1)`. `step(nowMs)` is a PURE PROJECTION; prune
  only at `clamp==1` (emits exactly target). `dt` never appears in the opacity math. `decide` restarts a
  Fade ONLY on a target CHANGE (`from=current, startMs=now`). Reaches target on schedule regardless of
  frame rate/drops/stalls → ROOT-A gone.
- **Engine-internal commit-invariant.** A target flip mid-fade is DEFERRED until the in-flight Fade
  settles at its endpoint, then the opposite Fade starts → ROOT-B gone.
- **Guaranteed residency.** All candidates resident; LOD is opacity-only, never a source add/remove → a
  re-add can never clear a promoted pin's fs → ROOT-C gone, and `idle_reassert` becomes provably dead.
- **Single authority.** `applyV5OpacityWrites` is the only opacity writer; `LodEngine.decide` the only
  promotion decider and only writer of `markerRoleTable.pinnedMarkerKeysInOrder`. All v4 transition
  machinery deleted.

## Heal verdict
A heal is AVOIDABLE — but only with all three fixes together (red-team unanimous: fade model alone is
insufficient). `idle_reassert` is deleted, but ONLY after residency is proven airtight at runtime
(`fsdrop=0`, `paint_stuck=0`, `idle_reassert writes=0`). If residency can't be made airtight, the fallback
is an EASED reseed-on-mutation (re-enter the legitimate fade from the current value) — NOT a heal. The
un-eased batch `idle_reassert` is deleted regardless.

## Implementation sequence (each phase verified via the file-sink harness)
1. **Gate the leak/noise** — wrap ONLY the `updateLivePinTransitions`/`updateLiveDotTransitions` CALLS
   (5337/5353) in `!lodV5Enabled` (NOT the reconcile body — it builds admission v5 needs). Verify
   `v4_authority_fire=0`, map not `life:hidden`. Low-risk, reversible.
2. **Time-based engine + commit-invariant** — rewrite `LodEngine` (Fade struct, pure `opacity(nowMs)`,
   prune at clamp==1, commit-invariant, `setRanking` preserves survivor Fades); drop the 0.1s dt clamp;
   interface `dtSeconds→nowMs`; update the 28 unit tests. Verify: demotes descend to 0 and STAY;
   `gpu_demote_census` perceptible drops to ~budget (no mid-band); LOD CPU still ~5ms.
   **(Step 7 runs alongside: real-device `dtMs` read — decides the smoothness/render question.)**
3. **Residency + engine-truth membership** — unconditional residency on the data path (replace
   `retainResidentDemotesFlag` 5331); migrate `applyV5ObstacleReseed` (8859) to
   `engine.lastPromotedInOrder`. Verify `fsdrop=0`, `paint_stuck=0`, `idle_reassert→0`.
4. **Delete pure-v4** (now unreachable) — `updateLivePin/DotTransitions`, `startAwaiting*` (×2),
   `applyLivePinTransitionFeatureStates` v4 body, `driveNativeLod`, the transition structs/fields.
   FIRST relocate the label-render-state producer (7168) to a v5 helper (or confirm the JS frame
   populates `labelFeatures`) or name-labels freeze. Compiler enforces completeness = the re-entry guard.
5. **Retire the heal** — delete `idle_reassert` (8697-8704). Conditional on Step 3 proving residency;
   else install the eased reseed-on-mutation fallback.
6. **Collapse the flag + (optional) budget hysteresis** — inline `lodV5Enabled=true` everywhere; with
   user sign-off, re-enable `membershipRetentionPad` (4–6) for residual boundary oscillation.
7. **Jank device test** — dense-zoom flow on a REAL device reading `dtMs`. ~17ms → fade fix sufficient,
   no render work. 40–90ms → collision/symbol-load reduction is a SEPARATE follow-up PR (not bundled).

## Key risks
- Gate scope: gate the two CALLS, not the reconcile top (prior B1 dropped map to `life:hidden`).
- Label producer `labelFeatures` (7168) is inside a to-be-deleted v4 fn AND the JS path (~1993) — verify
  before deleting or labels freeze.
- Commit-invariant must land in Phase 2 (validating fade with pad=0 and no invariant still oscillates).
- `idle_reassert` deletion gated on airtight residency.
- Display-link cancellation (8143-8176) freezes in-flight fades — orthogonal strand vector; measure.
- Re-enabling `membershipRetentionPad` reverses a prior user ban — needs sign-off, sequenced last.
- Engine interface change touches all 28 unit tests (rewrite for clock semantics).

## Open decisions for the user
1. Re-enable `membershipRetentionPad` (4–6) for boundary oscillation, sequenced last after the
   commit-invariant? (You previously banned dampers; the invariant removes the masking concern.)
2. Smoothstep vs strict-linear time-based curve?
3. If device still janks (40–90ms): collision/render-load reduction as a SEPARATE PR (recommended) or folded in?
4. Residency-fallback policy if Step 3 fails: accept eased reseed-on-mutation, or invest to make residency unconditional?
