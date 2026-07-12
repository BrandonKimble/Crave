# Map presentation: choreography derivation (paint/placement split + epoch-fenced decide)

Ground-up shape from requirements (2026-07-12), completing what
[map-presentation-epoch-and-participation.md](map-presentation-epoch-and-participation.md)
started: that pass made _participation membership_ derived; this pass makes _choreography
time_ derived. It replaces the last edge-triggered lifecycle writers, which produced three
costumes of one defect (a lifecycle edge flipped one visual writer without the others):

1. **Dots snap out on dismiss** — dismiss-start flipped `visibility:none` on the painted
   dot layer (the collision fix borrowed the paint lever), killing its pixels on frame one
   while the VA pins/labels ran their fade-out.
2. **Pins/labels snap in after the dots' fade on every search after the first** — the
   only under-cover decide trigger was the `pendingUnderCoverReproject` edge-flag, set
   solely by `setCandidateCatalog`. A resident-catalog re-reveal (dismiss teardown bumped
   the epoch but queued nothing) and a mid-ramp catalog arrival (deferred, force-decided
   at ramp completion) both minted the VA roster at presentation=1. Attributed live via
   `[NATIVE-SNAP]`: reveal 1 `reproject_ran` at preroll (op=0.001) → roster minted under
   cover; reveal 2 `reveal_drain_no_pending` → `pin_roster_synced` at `visible op=1`.
3. **Perceived substrate skew on the fade** — mostly already solved (the one-writer tick
   fans the same scalar to the GL layer literal and the VA alphas in the same frame);
   residual skew is GL-pipeline latency (≤1 render frame), documented as inherent.

## Requirements (implementation-independent)

- C1 — **One scalar.** The presented world has exactly one visibility scalar (the
  presentation ramp). Every substrate's painted opacity is a per-tick derivation of it
  (GL layer-literal multiplier + VA `alpha = engineOpacity × scalar`), sampled once per
  display-link tick. No other writer may move painted opacity on a lifecycle edge.
- C2 — **Paint ≠ placement.** Painting (visibility, opacity) and placement participation
  (claiming collision space) are separate derived outputs with separate levers:
  - Placement participation = phase-derived: ON from ramp-start(enter) until
    dismiss-start; OFF otherwise. (S4d-1: basemap collision flips at fade START, both
    directions.)
  - `visibility` (the paint-kill switch) may flip OFF only at the scalar floor
    (dismiss-complete) and ON only at the floor (reveal preroll). Flipping it mid-ramp is
    a contract violation — that was bug 1.
- C3 — **No undecided ramp.** A ramp toward visible may not begin while the promotion
  decide is stale (`presentationEpoch != lastDecidedPresentationEpoch`, catalog
  non-empty). Decide staleness is _derived from the epoch_ — the `pendingUnderCoverReproject`
  edge-flag family (insert sites, the drain check, the completion force) is DELETED, not
  patched. A stale decide at any under-cover choreography point (preroll, ramp-start,
  under-cover tick) runs immediately; a ramp that somehow completes stale emits a LOUD
  contract violation before correcting.
- C4 — **RED-provable.** The two impossible-by-construction claims are observable in dev:
  `contract_violation_visibility_dorm_mid_ramp` and
  `contract_violation_reveal_completed_undecided` emit through the existing
  `presentation_state_snapshot` diagnostics channel.

## Shape

1. **Placement lever.** `setPresentedWorldPlacementParticipation(enabled)` — derives the
   world's SYMBOL layers from the style per call (same derivation as
   `presentedWorldLayerIds`, filtered to `type == symbol`) and writes
   `icon-ignore-placement = !enabled`. Law: every world symbol layer authors
   `iconIgnorePlacement: false` (dot layer + the two invisible obstacle twins today);
   the lever owns that property at runtime. During an exit fade the dots stop _claiming_
   (basemap labels crossfade back immediately, per the S4d-1 directive) but keep
   _yielding_ (`iconAllowOverlap:false` untouched) — a dot culled by a returning basemap
   label leaves via Mapbox's own placement fade, not a snap.
2. **Chokepoints (each does one derived thing per lever):**
   - reveal preroll (`beginRevealVisualLifecycle`): visibility ON (scalar at floor —
     legal), placement OFF (uniform under-cover state; no early basemap suppression).
   - ramp start (`startEnterPresentation`): placement ON, beside the existing VA
     `setOverlayCollisionParticipation(true)` — GL and VA colliders join in the same call.
   - dismiss start (`beginDismissVisualLifecycle`): placement OFF, beside the existing VA
     participation OFF. NO visibility write — the pixels keep fading on the scalar.
   - dismiss complete (`completeDismissVisualLifecycle`): visibility OFF (scalar at
     floor), as today.
3. **Decide staleness = epoch mismatch.** `reprojectCatalogUnderCoverIfReady` keys on
   `presentationEpoch != lastDecidedPresentationEpoch` (an empty catalog counts as
   decided). All `pendingUnderCoverReproject` sites die:
   - attach-with-preserved-catalog → `invalidatePresentationDerivations` (epoch bump);
   - `setCandidateCatalog` already bumps the epoch — the insert is redundant;
   - the reveal-begin drain calls the reproject unconditionally (no-op when current);
   - the per-tick under-cover call stays (no-op when current);
   - ramp completion checks staleness first: stale ⇒ emit
     `contract_violation_reveal_completed_undecided`, then correct (expose, never
     silently compensate).
4. **Ramp fence.** `startEnterPresentation` runs the under-cover reproject synchronously
   before arming the ramp when the decide is stale (scalar is at the preroll floor there,
   so the swap is invisible). This is mechanism, not backstop: a catalog that lands
   between preroll and the enter-start token is decided here, under cover — the class
   "roster minted at presentation=1" cannot occur.
5. **Loop verification** (per the epoch plan's rule): search → dismiss → search with
   human-timescale delays via
   `crave://perf-scenario-command?action=submit_close_then_submit_shortcut&delayMs=8000&resubmitDelayMs=8000`,
   asserting in `[NATIVE-SNAP]`: reveal 2 shows `reproject_ran` + `pin_roster_synced` at
   `preparingReveal op=0.001` (NOT at `visible op=1`); no contract violations; eye check
   that dismiss fades dots with pins/labels and reveal 2 fades everything together.

## Delta from the pre-existing implementation

- `beginDismissVisualLifecycle`: `setPresentedWorldLayersVisible(false)` →
  `setPresentedWorldPlacementParticipation(false)`.
- `beginRevealVisualLifecycle`: + placement OFF after the visibility restore.
- `startEnterPresentation`: + placement ON + synchronous stale-decide fence.
- `setPresentedWorldLayersVisible(false, …)`: asserts scalar ≤ floor, emits
  `contract_violation_visibility_dorm_mid_ramp` otherwise (then still proceeds — the
  caller is the floor path; the emit is the tripwire).
- `pendingUnderCoverReproject` (decl + 3 sites) deleted; `reprojectCatalogUnderCoverIfReady`
  guard becomes the epoch comparison; attach-preserve site bumps the epoch instead.
- JS: `search-map-render-controller.ts` snapshot-reason union + the
  `reportSearchFlowContractViolation` reason list gain the two violation reasons. No
  other JS change.
- Unchanged: LodEngine, the one-writer tick, VA mint-at-alpha-0, commit fences, LEA
  literals, obstacle reseed.

## Red-team outcome (2026-07-12)

Sweep verdict: epoch derivation, the two levers, and the synchronous decide points line
up; no mid-ramp visibility writer remains; the empty-catalog rule holds on every
transition. Remediated from the sweep: two stale comments (the dead
`setLabelRenderLayersVisible` reference, the "pins/dots are ignorePlacement" claim),
request-key context added to both contract-violation emits, and `reset()` now bumps the
epoch (`instance_reset`) — it was the one data-adjacent boundary that skipped
invalidation. Known pre-existing edge (NOT introduced here, spans both levers): a style
reload while DISMISSED remounts world layers at authored visibility/placement because
`beginSourceRecovery` early-returns when inactive — fix belongs in the recovery path
(re-derive both levers on style load), deferred.

## Accepted behavior notes

- During an exit fade, returning basemap labels may cull a few still-fading dots slightly
  early (Mapbox placement fade) — the dying world yields; this is the S4d-1 trade.
- Substrate skew ≤1 GL render frame vs the CA overlay is inherent pipeline latency; if it
  ever reads as visible, the instrument is a composited-pixel sampler, not a code change.
- A catalog replacing mid-ramp-UP (rapid-toggle race) still defers to ramp completion —
  now loud via the contract violation instead of silent.
