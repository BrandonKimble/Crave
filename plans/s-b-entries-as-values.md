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

## RE-SEQUENCED 2026-07-09 (owner rule: chase the true ideal as context grows)

Code taught: origin-on-entry has NO live consumer until child pushes stop re-rooting (S-C) or
legs remount on pop (slices on entry-keyed presentation / same-key nesting) — AND capture-at-
push would capture the WRONG origin today (the re-root to search runs first, so the departing
top at push time is already search; the true origin only survives in the single slot captured
pre-re-root). Building it now = dead plumbing with wrong values. New order: the depth-derived
nav-out slice (immediately consumable, owner-ratified 13/13 behavior change) runs as SLICE 2;
origin-on-entry follows its consumer. Slice numbering below is superseded by this note.

## Slice 2 (executed second) — depth-derived nav-out + laneKind 'child' deletion

- Nav bar hides iff overlayRouteStackLength > 1, OR the existing search-results/suggestion
  mechanisms (the §5.1 interim clause — search present is still setRoot until S-C).
- The two useNavHideIntent registrants (PollDetailPanel, PollCreationPanel) delete; the
  nav-hide-intent store deletes if no other registrant remains.
- `PresentationLaneKind` loses the `'child'` arm (zero consumers, audited); docked-polls KEPT.
- BEHAVIOR CHANGE BY DESIGN: restaurant/saveList (and stub scenes when they get entry points)
  now hide the nav bar — the ratified 13/13 rule. Owner feel-check after.

## Slice 3 (was 2) — origin on the pushed entry (lands WITH a consumer)

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

---

## Child-leg lifecycle design (2026-07-09, pre-implementation — slice 3)

### Facts (read from code, not assumed)

- Legs are NOT pre-mounted at boot: `resolveMountedSceneKeys` grows lazily (active + presented +
  pending + handoff + static root flags) and ACCUMULATES — once mounted, a child leg stays warm
  forever. `sceneEntryByKey` + ~10 sibling maps in the scene-stack controller are all
  `Map<OverlayKey, …>`.
- Child scene params flow through the per-key scene-input authority (dynamic writers select
  `activeOverlayRoute` when its key matches); the leg never reads its stack entry.
- `PresentationFrame` speaks `OverlayKey` (active/presented/outgoing) and is consumed by many
  authorities (native targets, silhouette, sheet host) that do NOT need instance identity.

### The model

**A child leg's lifetime = its entry's lifetime in the stack (+ the settle window).**

- `SceneInstance` = root scenes: singleton per key (unchanged warm-leg behavior — tab-switch
  perf is sacred); child scenes: one instance per stack ENTRY (`key#entryId`).
- MOUNT a child instance when its entry enters the stack (push commit). KEEP it mounted while
  the entry is in the stack at any depth (stacks are shallow; depth-K eviction + pinned-snapshot
  remount is DEFERRED until world-snapshot pinning exists — noted, not built).
- UNMOUNT when the entry leaves the stack (pop/popToRoot/setRoot), holding through the settle
  window while it is the frame's outgoing leg (closeChild motion needs the leg painting).
- Re-opening after a pop is a NEW entry ⇒ a FRESH leg (seed skeleton), never the old warm leg.
  This is a deliberate behavior change: entries-as-values semantics (today's warm re-param can
  flash the previous instance's content; all child scenes are seeded, so fresh opens are the
  designed path).

**Frame gains instance identity WITHOUT retyping its key fields**: `activeEntryId` /
`presentedEntryId` / `outgoingEntryId` are ADDED (minted with the frame, in its equality).
Key-typed consumers stay untouched; instance-aware consumers (scene-stack runtime, slice-4
same-key transitions) read the ids.

### Staging (safety law: at most ONE instance per key exists until slice 4 flips the same-key

push replacement — so per-key maps stay per-key in 3a)

- **3a (this slice): lifecycle only.** Mounted-set membership derives from route-stack
  membership (+ static root flags + frame outgoing hold); popped child legs unmount and their
  per-key map entries clear. Maps stay `OverlayKey`-keyed (safe: one instance per key). Frame
  entryIds added. Scroll/segment string-keyed runtimes keep key-shaped keys.
- **3b (lands WITH slice 4): instance-keying.** The per-key maps, scene inputs (child input =
  derived from ITS entry, not `activeOverlayRoute`), snap-session ledger, and the body host
  mapping move to `key#entryId` for children; the same-key top-replacement in pushRouteState
  deletes in the same commit. Same-key transitions distinguish legs via frame entryIds.
