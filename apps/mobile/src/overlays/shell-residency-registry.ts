import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';

// ─── THE RESIDENCY REGISTRY (L3 — the strangler's pure fact) ────────────────────────
//
// Which scenes are residency-managed is a PURE fact consulted by pure modules (the
// entry-unit resolver runs in hermetic node tests) — so it lives apart from the
// manager, which imports react-native for its prewarm scheduler. Grows per-slice per
// the migration bridge order; the census table in the design doc names every key's
// target. Deleted-with-the-strangler when every scene is managed.

export const RESIDENCY_MANAGED_SCENES: readonly SheetSceneKey[] = ['notifications', 'settings'];

export const isResidencyManagedScene = (scene: OverlayKey): boolean =>
  (RESIDENCY_MANAGED_SCENES as readonly string[]).includes(scene);
