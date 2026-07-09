# S-B — Entries become values (execution plan)

**Charter:** plans/trigger-nav-ideal-verdict.md S-B + §5 resolutions. Entry = value:
`{entryId, key, params, origin?}`; presentation keys off entry INSTANCES; pop restores the
popped-to entry; same-key nesting legal; nav-out derives from depth; `laneKind` loses its
unconsumed `'child'` arm. Cut-surface inventory: 2026-07-08 Explore sweep (8 groups + 8 traps),
summarized inline per slice.

**Sequencing law:** same-key top-replacement deletion (slice 4) lands LAST among the structural
slices — traps 3/4/5 (key-keyed legs + registries + params selectors) must be entry-keyed first.

## Slice 1 — entryId + value identity + reducer truth (foundation, behavior-preserving)

- `OverlayRouteEntry` gains `entryId: string` (app-overlay-route-types.ts:497).
- `createRouteEntry` (scene-switch-controller.ts:221) stamps a monotonic id — the ONLY
  constructor; `SEARCH_ROUTE` literal + `INACTIVE_DYNAMIC_CHILD_ROUTE` get stable sentinel ids.
- Equality by value identity: `areOverlayRoutesEqual` (x2: scene-switch-controller.ts:246,
  native-overlay-target-authorities.ts:231) and `areOverlayRouteEntriesEqual`
  (overlay-host-authority-controller.ts:610) short-circuit on `entryId`.
- `previousOverlayRoute` becomes DERIVED (`stack[len-2] ?? null`) — kills the popToRoot
  stale-preserve latent bug (trap 6); consumers unchanged.
- Pop targets the ENTRY: `closeActiveRoute` (app-overlay-route-command-runtime.ts:83-108)
  resolves the popped-to entry (not `getPreviousRouteKey()` string).
- NEW reducer spec: app-route-scene-switch-controller reducer coverage (push/setRoot/update/
  closeActive/popToRoot; previous-derivation; entryId stability across snapshots) — first tests
  this area has ever had.

## Slice 2 — origin on the pushed entry

- Push captures origin at departure ONTO the new entry (`entry.origin`), via the existing
  provider registry; pop applies the popped entry's origin to the revealed scene.
- The single-slot `capturedOriginContext` (overlay-session-state-controller.ts:473-505) becomes
  a compatibility seam over the top entry's origin; first-capture-wins early-return deleted.
- OriginSnapshot gains `camera?: {center, zoom}` (field only; capture wired in L2).

## Slice 3 — presentation keys off entry instances

- `mountedSceneKeys: Set<OverlayKey>` → mounted ENTRIES (scene-stack-runtime.ts:815+);
  `sceneEntryByKey` + per-key snapshot/listener maps → entryId-keyed for child scenes
  (root pages stay singleton by construction).
- Params reach a leg from ITS entry, not `activeOverlayRoute` (dynamic-scene-input-writers,
  `route.params as` guard family).
- Per-key registries (persistent-header, origin-capture provider, origin-live-state,
  sheet-motion-target, scroll-offset/segment string keys) scoped by entryId where a scene can
  stack twice.

## Slice 4 — same-key nesting

- Delete the top-replacement branch in `pushRouteState` (:297-299); `updateRouteState` updates
  the TOP matching entry only. userProfile(A) → userProfile(B) becomes real.
- Depth-K leg unmount policy + pinned data/origin retention (verdict §5.3).

## Slice 5 — depth-derived nav-out + laneKind 'child' deletion

- Nav bar: `overlayRouteStackLength > 1` (or presented-world interim clause per §5.1) replaces
  the nav-hide-intent registrant pattern for scenes; the two registrants (PollDetailPanel:584,
  PollCreationPanel:74) delete; store stays for non-scene uses if any remain, else deletes.
- `PresentationLaneKind` loses `'child'` (zero consumers, audited); docked-polls arm KEPT.

## Validation per slice

tsc + jest + rig (sim 7B0DD874, Metro :8082): poll detail open/dismiss, restaurant push from
bookmarks + dismiss-to-origin, results present/dismiss byte-identity, nav-bar behavior per the
current (pre-slice-5) contract. Slice 5 changes visible behavior BY DESIGN (restaurant/saveList
now hide the nav bar) — owner feel-check after.
