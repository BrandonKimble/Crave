import {
  APP_OVERLAY_ROUTE_METADATA_BY_KEY,
  type OverlayKey,
  type OverlayRouteEntry,
} from './app-overlay-route-types';
import { isResidencyManagedScene } from '../../overlays/shell-residency-registry';

// ─── W1 slice 1 — entry-keyed mounts (plans/w1-listdetail-structural-spec.md §A.1 C1) ────────
//
// For CHILD-role scenes (the drill-loop set: same-key nesting is legal), the mounted body
// unit is `key#entryId`, not `key`: two stacked entries of one scene key are two live,
// independent mounted bodies; pop reveals the lower one byte-exact (its React state never
// left). Root/topLevel/shell scenes stay singleton-per-key BY CONSTRUCTION — this resolver
// returns null for them and the body host takes the legacy single-body path untouched.
//
// This module is the PURE reducer (hermetic jest home — app-route-scene-entry-mounts.spec.ts
// pins the contract). The scene-stack runtime consumes it and publishes the units on the
// per-scene body-surface snapshot; the body host renders one unit per entry, passing THE
// ENTRY as props (C2 — child bodies must not read useTopMostRouteEntryForScene).

export type SceneEntryMountUnit = {
  /** `${sceneKey}#${entryId}` — the mount identity (React key + [ENTRYMOUNT] probe tag). */
  unitKey: string;
  sceneKey: OverlayKey;
  entryId: string;
  /** The entry VALUE this unit renders — params flow from here, never from a topmost read. */
  entry: OverlayRouteEntry;
};

/**
 * Depth-K eviction (verdict §5.3, anchor-adjudicated K=3): entries deeper than K below the
 * stack top unmount their body unit but KEEP the entry (data/origin live on the entry and the
 * query cache), so a pop-return remounts skeleton-free. A memory knob, not a UX knob.
 */
export const SCENE_ENTRY_MOUNT_DEPTH_LIMIT = 3;

export const isEntryKeyedMountSceneKey = (sceneKey: OverlayKey): boolean =>
  APP_OVERLAY_ROUTE_METADATA_BY_KEY[sceneKey].role === 'child';

export const createSceneEntryMountUnitKey = (sceneKey: OverlayKey, entryId: string): string =>
  `${sceneKey}#${entryId}`;

/** L3 residency: the ONE scene-keyed unit of a residency-managed leaf — stable across
 *  entry pushes/pops so the shell tree never remounts. */
export const createResidentSceneUnitKey = (sceneKey: OverlayKey): string =>
  `resident:${sceneKey}`;

/** The unit that should be VISIBLE for a scene key = its topmost in-stack entry. */
export const resolveActiveEntryIdForScene = (
  sceneKey: OverlayKey,
  overlayRouteStack: readonly OverlayRouteEntry[]
): string | null => {
  for (let index = overlayRouteStack.length - 1; index >= 0; index -= 1) {
    const entry = overlayRouteStack[index];
    if (entry?.key === sceneKey) {
      return entry.entryId;
    }
  }
  return null;
};

/**
 * The mounted unit set for one scene key, stack order (bottom → top):
 *   • every in-stack entry of the key within depth ≤ SCENE_ENTRY_MOUNT_DEPTH_LIMIT of the top
 *   • PLUS the outgoing entry (frame.outgoingEntryId) retained from previousUnits while a
 *     pop's settle window holds it — it unmounts when the frame clears the hold (contract c).
 * Returns null for non-child scenes (the legacy singleton path). Reuses previous unit objects
 * whenever the entry value is unchanged, so downstream equality stays reference-cheap.
 */
export const resolveMountedSceneEntryUnits = ({
  sceneKey,
  overlayRouteStack,
  outgoingEntryId,
  previousUnits,
  depthLimit = SCENE_ENTRY_MOUNT_DEPTH_LIMIT,
}: {
  sceneKey: OverlayKey;
  overlayRouteStack: readonly OverlayRouteEntry[];
  outgoingEntryId: string | null;
  previousUnits: readonly SceneEntryMountUnit[] | null;
  depthLimit?: number;
}): readonly SceneEntryMountUnit[] | null => {
  if (!isEntryKeyedMountSceneKey(sceneKey)) {
    return null;
  }

  const previousUnitsByEntryId = new Map<string, SceneEntryMountUnit>();
  previousUnits?.forEach((unit) => {
    previousUnitsByEntryId.set(unit.entryId, unit);
  });

  const topIndex = overlayRouteStack.length - 1;
  const units: SceneEntryMountUnit[] = [];
  overlayRouteStack.forEach((entry, index) => {
    if (entry?.key !== sceneKey) {
      return;
    }
    const depthBelowTop = topIndex - index;
    if (depthBelowTop > depthLimit && entry.entryId !== outgoingEntryId) {
      return; // depth-K eviction — the entry stays in the stack; only the mount drops.
    }
    const previousUnit = previousUnitsByEntryId.get(entry.entryId);
    units.push(
      previousUnit != null && previousUnit.entry === entry
        ? previousUnit
        : {
            unitKey: createSceneEntryMountUnitKey(sceneKey, entry.entryId),
            sceneKey,
            entryId: entry.entryId,
            entry,
          }
    );
  });

  // Outgoing retention (settle window): a popped entry is gone from the stack but the frame
  // still holds it as the leaving leg — keep its PREVIOUS unit (same object; never rebuilt).
  if (outgoingEntryId != null && !units.some((unit) => unit.entryId === outgoingEntryId)) {
    const retained = previousUnitsByEntryId.get(outgoingEntryId);
    if (retained != null) {
      units.push(retained);
    }
  }

  // L3 RESIDENCY (one-writer consolidation slice): a residency-managed LEAF has ONE
  // SCENE-KEYED unit — a stable unitKey means React NEVER remounts the shell tree:
  // a re-push updates the entry prop in place, and a pop keeps the last entry (the
  // shell is resident; dismissal changes visibility — the manager's bit — never the
  // mount). Riding the unit list keeps the attach fact true through
  // hasRetainedEntryUnits with no second attach writer. Sim-caught bug this shape
  // fixes: entry-keyed units gave a re-push a SECOND unit of the same scene, and the
  // scene-level visibility boundary displayed both. Multi-entry managed scenes
  // (listDetail, when it migrates) need ENTRY-aware residency — recorded.
  if (isResidencyManagedScene(sceneKey)) {
    const latestEntry = units.length > 0 ? units[units.length - 1].entry : null;
    const previousResident = previousUnits?.find(
      (unit) => unit.unitKey === createResidentSceneUnitKey(sceneKey)
    );
    const residentEntry = latestEntry ?? previousResident?.entry ?? null;
    if (residentEntry == null) {
      return [];
    }
    if (
      previousResident != null &&
      previousResident.entry === residentEntry
    ) {
      return [previousResident];
    }
    return [
      {
        unitKey: createResidentSceneUnitKey(sceneKey),
        sceneKey,
        entryId: residentEntry.entryId,
        entry: residentEntry,
      },
    ];
  }

  return units;
};

export const areSceneEntryMountUnitArraysEqual = (
  left: readonly SceneEntryMountUnit[] | null,
  right: readonly SceneEntryMountUnit[] | null
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null || left.length !== right.length) {
    return false;
  }
  return left.every((unit, index) => unit === right[index]);
};
