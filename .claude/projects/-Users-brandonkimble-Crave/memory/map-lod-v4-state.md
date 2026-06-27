- GRANULAR LOD REDESIGN (native-owned) — Phase 1 (e8f4c1c0) + Phase 2 (93571263) DONE, 2026-06-19.
  Plan: plans/map-lod-granular-redesign.md. THE RULE: a marker is a PIN iff in the top-maxFullPins
  (40) by rank among the native on-screen set; decided NATIVELY per camera frame, drives per-pin
  pin<->dot crossfade directly — no JS round-trip, no whole-frame republish. Native:
  projectAndEmitOnScreenMarkers stashes nativePromotedKeysInOrder; driveNativeLod (gated .visible so it
  never touches the reveal preroll → no hang) sets markerRoleTable pinned/dots (+ force-promotes
  state.highlightedMarkerKeys = selected) and calls reconcileAndApplyLiveMarkerRoleOutputs scoped to
  changed markers. JS: removed the native-visible subscriber + the viewport-tick LOD publish; publishes
  resident sources ONLY on data change. Validated in-sim: reveal no-hang, pan decision evolves per-frame
  (visible 79->38, promoted tracks), pins render+evolve w/ shadows, no stuck. PENDING on-device:
  per-pin SMOOTHNESS (one-in/one-out, no group fade, no jitter) — judge in motion. Phase 3 (next):
  DELETE dead JS — buildMarkerRenderModel top-N slice + buildStableSlotMap, buildShortcutViewportProjectionToken
  (+ VIEWPORT_PROJECTION_* consts, normalizeViewportProjectionSpan — currently an eslint warning),
  motion-pressure-for-LOD, the viewport_lod publish path in publishSources, and the temporary
  [mapdiag] native_lod NSLog. Then move maxFullPins(40) from a Swift constant to a JS-pushed config.
