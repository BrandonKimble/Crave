# Red-Team Fix Worklog (map LOD + reveal/dismiss)

Goal (do not stop until ALL items + subitems are fixed): resolve every finding from the
2026-06-16 red-team of the map LOD + reveal/dismiss system and its plans. Each item has an
acceptance check. Mark `[x]` when done + committed. Validate native changes with
`IOS_RUN=1` (IOS_RUN=0 skips the Xcode build). Android build verify where touched.

Status legend: [ ] todo · [~] in progress · [x] done+committed

Validation harness: `IOS_RUN=1 IOS_SIMULATOR_NAME="iPhone 17 Pro" IOS_REFRESH_WRITE_ENV_LOCAL=0
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 EXPO_METRO_PORT=8082 yarn perf:scenario:ios
maestro/perf/flows/search-submit-dismiss-repeat.yaml search_map_lod_reveal_dismiss`. API on :3000
(pid may have died — `yarn workspace api start`). Sim UDID 7B0DD874-3496-46F7-9480-3EDDABCE2F31.
Key signals: handoffPhase chrome_ready/hydration_ready (no stall), isStructuralApplyLaneLeak,
flow COMPLETED count, no Flow Failed/Timed out.

---

## P0 — real problems

### 1. [ ] Android parity — bring SearchMapRenderControllerModule.java to the residency model

File: apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java (9453 lines).
Mirror the iOS residency rewrite (commits cec34d26, af0c415e, eab742c3, d40d0d08). Subitems:

- [ ] completeDismissVisualLifecycle (~5277): stop calling clearResidentSourcesAndTransientFeatureStates;
      dorm label render layers + collision-obstacle layers via visibility:none; keep derivedFamilyStates resident.
- [ ] Add setLabelRenderLayersVisible (mirror collision-visibility helper) over label layer ids.
- [ ] beginRevealVisualLifecycle: wake label layers (visibility:visible) at preroll.
- [ ] runDeferredDismissSourceCleanup (~5640): make no-op (no source clear in resident model).
- [ ] enter case: skip applySnapshot when resident + no real delta; synthesize source readiness.
- [ ] Delete dead cache machinery: residentDesiredSourceCacheBySourceId (~5289), restoreResidentDesiredSourceCacheForEnter,
      allowResidentSourceCacheRestore param, currentMountedSourceRevisions hidden-cache branch.
- [ ] Confirm JS already-resident path drives Android too (JS source controller is shared).
- [ ] Build Android (./gradlew app:compileDebugJavaWithJavac or RN android build) — verify compiles.
      Acceptance: Android dismiss keeps sources resident, no source-clear, label dormancy; compiles; parity with iOS.

### 2. [x] Opacity sweep scaling — applyPresentationOpacity must not write the full catalog every frame

File: SearchMapRenderController.swift applyPresentationOpacity (~8568) + stepPresentationOpacityAnimation (~8454).
Problem: per-display-link-frame setFeatureState over ALL features in ALL sources = full resident catalog now.

- [ ] Restrict the per-frame presentation-opacity write to the visible/transitioning set, OR drive presentation
      opacity via a LAYER-level paint property (single value) instead of per-feature feature-state.
- [ ] Apply same fix to Android.
- [ ] Validate reveal/dismiss still fade smoothly (flashReversal 0, chrome_ready) + measure cost drop.
      Acceptance: reveal/dismiss per-frame opacity work is O(visible) or O(1 layer), not O(full catalog).

### 3. [x] Natural-search residency — non-shortcut search resident like shortcut

File: use-direct-search-map-source-controller.ts (~1528 queryVisibleCandidates viewport-filter).
Problem: natural search builds candidates from current viewport bounds -> markers leaving viewport vanish
from source (membership churn on pan), violating v4 invariant 1. Only shortcut search is resident.

- [ ] Make natural-search publish the full resident candidate catalog (like shortcut, line ~1539), so LOD is
      opacity-only over a resident set, not viewport membership churn.
- [ ] Ensure LOD decision (buildMarkerRenderModel) still visibility-gates promotion correctly with resident set.
- [ ] Validate: lod_membership_churn_contract pinRemoved/dotRemoved == 0 during natural-search pan/zoom.
      Acceptance: pan/zoom on a natural search produces zero source add/remove; demotes are opacity crossfades.

---

## P1 — bad shapes / unbuilt coverage

### 4. [x] Dead handshake comment + dead notifyFrameRendered

- [ ] Rewrite the af0c415e enter-skip comment (SearchMapRenderController.swift ~1473) to state the REAL
      invariant: source readiness is set synchronously at apply completion; there is no async paint handshake.
- [ ] Delete notifyFrameRendered (Swift ~1640 resolve(nil)) + its TS interface entry
      (search-map-render-controller.ts:47) + any JS refs (grep: none expected).
- [ ] Android parity (remove its notifyFrameRendered if present).
      Acceptance: no reference to a paint handshake for readiness; dead bridge method gone.

### 5. [ ] Cluster 6 — stage sheet/chrome motion out of the reveal/dismiss window

- [ ] Wire a consumer for lanePolicy.allowSheetSnap (presentation-lane-policy.ts) — currently ZERO consumers.
- [ ] Stage sheet-snap/collapse so it does not overlap the visible reveal/dismiss opacity window
      (use-search-root-results-sheet-snap-runtime.ts + search-results-sheet.tsx).
- [ ] Add Gate-E sheet-snap-overlap diagnostic.
      Acceptance: sheet snap and visible map reveal/dismiss do not overlap; diagnostic proves it.

### 6. [ ] Cluster 2 — split structural vs presentation apply (presentation-only path)

File: use-search-map-native-render-owner.ts flushLatestDesiredFrame (~2968) / submitRenderFrameFireAndObserve.

- [ ] Route presentation/control-only frames (sourceDeltaCount===0) through a lightweight native apply
      that does not contend for the structural in-flight slot / does not re-run snapshot work.
- [ ] Confirm isStructuralApplyLaneLeak drops to ~0 for presentation/control-only frames.
      Acceptance: presentation-only frames no longer ride the structural setRenderFrame path.

### 7. [ ] Cluster 7 — sticky reapply queue

- [ ] Queue sticky/label changes discovered during forbidden phases; drain when phase allows.
      Acceptance: sticky correctness preserved without applying during reveal/dismiss windows.

### 8. [x] Plan-doc reconciliation (DONE 2026-06-16)

- [ ] search-map-reveal-dismiss-smooth-cutover-plan.md: collapse to ONE model (residency end-state); remove
      contradictory old Clusters II/4 + Ideal Sequences; fix wrong paths (crave-search -> Crave); update stale
      Measured-state (Gate B now PASS); remove references to deleted symbols.
- [ ] map-lod-ideal-model-v4.md: document natural-vs-shortcut residency asymmetry (or mark fixed after item 3);
      fix invariant-4 "safety net" framing (guard is load-bearing); mark invariant-5 jitter on-device-pending;
      note two-budget region demote possibility; note contracts are telemetry-not-gates.
- [ ] search-map-per-pin-group-cutover-plan.md: add header — LOD/slot sections superseded by v4; label/collision/press remain.
- [ ] search-dismiss-motion-plane-cutover-plan.md: add header — merged into reveal-dismiss-smooth-cutover-plan.md.
      Acceptance: no internally-contradictory or stale-path plan text in the map cluster.

---

## P2 — latent / cleanup

### 9. [x] Diagnostics map unbounded growth

File: use-search-map-native-render-owner.ts searchMapNativeFrameVisualSourceCountsByKey (~457, ~3536).

- [ ] Bound/evict (cap size or purge on frame-gen advance), not only on dismiss/unmount.
      Acceptance: no per-frame unbounded growth during a long no-dismiss pan session.

### 10. [x] Baked-role loaded gun

File: use-direct-search-map-source-controller.ts (~1904/1936 bake nativeLodOpacity/nativeDotOpacity into properties);
search-map-source-store.ts (~705 excludes TRANSIENT_VISUAL_PROPERTY_KEYS from diffKey); search-map.tsx (~2093/2108 ['get'] fallback).

- [ ] Either drop the baked role from feature properties (rely solely on stepper feature-state) OR include it in the diffKey.
      Acceptance: no marker can render a permanently-stale baked role.

### 11. [x] Dead code: emitEnterFirstVisibleFrameIfNeeded

File: SearchMapRenderController.swift (~8511) — 4 guards then no-op, every reveal frame.

- [ ] Remove it (and its call site) OR restore its intended emit. Android parity.
      Acceptance: no dead no-op in the reveal hot loop.

### 12. [x] Diagnostic set-construction outside the gate

File: use-direct-search-map-source-controller.ts (~2072-2097: lodOverlap\*/pinVisualIdentityKeys/dotVisualIdentityKeys computed unconditionally).

- [ ] Move set construction inside isPerfScenarioAttributionActive gate.
      Acceptance: zero per-publish set construction when attribution off.

### 13. [ ] Native timing payload gating

File: SearchMapRenderController.swift resolve(...) (~1618 returns ~9 timing fields every frame).

- [ ] Gate the native timing payload behind attribution-active (or omit when off).
      Acceptance: no per-frame timing payload when attribution off.

### 14. [x] Pin/dot residency-field asymmetry

File: use-search-map-native-render-owner.ts (~1519-1521: residentDotMarkerKeysInOrder exists, no resident pin equiv).

- [ ] Make pin residency representation symmetric with dots (or document why asymmetric is correct).
      Acceptance: native infers resident pins/dots the same way; no accidental asymmetry.

### 15. [ ] Acceptance-contracts-as-gates (lowest priority)

- [ ] Add at least one automated assertion/threshold (Maestro or a parity-contract check) so a contract
      violation (flashReversalCount>0, membership churn on pan) actually FAILS, not just logs.
      Acceptance: at least the core contracts are enforced, not telemetry-only.

---

## Progress log

- (init 2026-06-16) worklog created; starting top-down. iOS residency core already landed
  (commits 0bc3aaca, b40aa545, d40d0d08, cec34d26, af0c415e, eab742c3) — these items are the red-team follow-through.
