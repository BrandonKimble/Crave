# Map presentation: epoch-keyed derivation + derived collision participation

Ground-up shape from requirements (2026-07-11), replacing the memory-enforced lifecycle
choreography that produced the twin bug, the stale-signature bug, and the immortal dot
colliders — three costumes on one defect: participants and caches enrolled by hand at
every lifecycle edge.

## Requirements (implementation-independent)

- R1 — One world. The map presents at most one world (search results, home, a toggle
  variant). Presentation has exactly two edges: presentBegin (fade-in start) and
  presentEnd (fade-out start).
- R2 — Collision truth. Exactly the presented world's visible artifacts may claim
  placement space. At presentEnd, NOTHING of the world may keep claiming space (an
  invisible claim is a lie — opacity 0 does not release placement). At presentBegin,
  the world's colliders must be seated before the ramp reveals anything.
- R3 — Derivation, not memory. Promotion decisions, rosters, signatures, literals,
  feature-states are pure functions of (presentation, catalog, camera). When any input
  changes, the derivation is STALE BY CONSTRUCTION — staleness must be detected by
  keying, never remembered by per-edge cleanup lines.
- R4 — Cost. Recompute on demand at edges and camera idles; never per frame; no
  re-layout churn while presented.

## Shape

1. **Presentation epoch.** `state.presentationEpoch` — a monotone counter bumped by ONE
   helper (`invalidatePresentationDerivations`) at every derivation-input boundary:
   presentEnd (dismiss start / roster teardown), catalog replace, explicit redecide
   requests. The visible-set signature (the guard in front of `engine.decide`) embeds
   the epoch, so any bump makes the next projection observe `sigChanged=true` and
   re-decide. Nothing is "cleared"; staleness is structural. (R3. The old shape had
   four scattered `lastVisibleMarkerSetSignature = nil` lines and a missing fifth —
   the missing one was the dots-only-second-search bug.)

2. **Derived collision participation.** The presented world's GL presence = every style
   layer whose `source` is one of the world's managed sources (pin bundle, dots, label
   collision). The dorm/wake chokepoint derives that set from the style AT EACH CALL
   and flips `visibility` on all of it — world hidden ⇒ world's layers hidden (R2).
   The hand-maintained JS id list (`labelCollisionLayerIds`) and its native contract
   are DELETED: a new colliding layer is auto-enrolled the moment it mounts on a world
   source, and it is impossible to forget one (the twin + dot-layer bugs). Lazy
   per-call derivation also catches late-mounting layers; the calls are edge-rare (R4).
   VA colliders already obey R2 by construction (minted at presentBegin, removed at
   presentEnd) — unchanged.

3. **Chokepoints.** presentBegin = the existing reveal-preroll restore; presentEnd = the
   existing dismiss-start dormancy + teardown. Both now do exactly two things: flip the
   derived participation set, bump the epoch (end only). No other lifecycle lines exist.

4. **Loop verification is first-class.** The map verify recipe is a LOOP:
   search → dismiss → search (+ toggle → toggle → back), asserting reveal 2 promotes,
   and full basemap-label return while dismissed. Single-pass verification is what let
   this class ship.

## Delta from the pre-existing implementation

- InstanceState += presentationEpoch; one invalidation helper replaces all scattered
  signature-nil sites (catalog set, toggle redecide, under-cover reproject, dismissal
  teardown).
- `setLabelCollisionObstacleLayersVisible(idList)` → `setPresentedWorldLayersVisible`
  (style-derived set); `state.labelCollisionLayerIds` + JS payload/threading deleted
  end-to-end (same surgery shape as the labelLayerIds cut).
- JS: the dorm/wake id list in search-map.tsx (including the day-old DOT_LAYER_ID
  addition) dies — superseded by derivation.
