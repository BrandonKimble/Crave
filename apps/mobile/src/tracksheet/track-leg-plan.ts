// ─── THE LEG BODY PLAN (host extraction 3, pure half) ─────────────────────────
//
// The host resolved a leg's body TWICE per commit with the same branch order:
// once to name the RESOLUTION (readiness input) and once, inside resolveLegList,
// to build the list from whichever lane won. Two hand-kept copies of one branch
// order is the class this system deletes everywhere else, so the decision is one
// pure function that names the WINNING SOURCE and the resolution together; the
// host executes the source it is handed.
//
// RN-free on purpose (pure jest lane).

import type { TrackEntryBodyResolution } from './track-entry-readiness';

/** Which lane won this leg's body this commit. */
export type TrackLegBodySource = 'published' | 'parts' | 'mounted' | 'none';

export type TrackLegBodyFacts = {
  /**
   * A published 'list' spec is readable by this leg. The published scene-input
   * lane is SCENE-keyed, so only the PRESENTED entry may read it (a hidden
   * same-scene entry reading it would alias the presented entry's rows: the
   * exact G-ENTRY collision), and a STAMPED publication must have been rendered
   * FOR the presented entry (R6 entry-stamp gate). Both gates are applied by
   * the caller; null means "no readable published list for this leg".
   */
  publishedListRowCount: number | null;
  /** The scene's list-parts hook published a 'list' spec (null otherwise). */
  partsListRowCount: number | null;
  /** The scene declares body.kind 'mounted' in the scene schema. */
  usesMountedBody: boolean;
};

export type TrackLegBodyPlan = {
  source: TrackLegBodySource;
  resolution: TrackEntryBodyResolution;
};

/** THE BRANCH ORDER, stated once: published lane, then the scene's list-parts
 *  hook, then the mounted registry, then nothing. */
export const planTrackLegBody = ({
  publishedListRowCount,
  partsListRowCount,
  usesMountedBody,
}: TrackLegBodyFacts): TrackLegBodyPlan => {
  if (publishedListRowCount != null) {
    return { source: 'published', resolution: { kind: 'list', rowCount: publishedListRowCount } };
  }
  if (partsListRowCount != null) {
    return { source: 'parts', resolution: { kind: 'list', rowCount: partsListRowCount } };
  }
  if (usesMountedBody) {
    return { source: 'mounted', resolution: { kind: 'mounted' } };
  }
  return { source: 'none', resolution: { kind: 'none' } };
};

/** The row cell's surface treatment — the host maps each kind to a style.
 *  'mounted-edge-to-edge' / 'mounted' are transparent cells over the foundation
 *  plate; 'padded' is production's OVERLAY_HORIZONTAL_PADDING row inset;
 *  'bare' is no cell style at all. */
export type TrackLegRowSurfaceKind = 'mounted' | 'mounted-edge-to-edge' | 'padded' | 'bare';

export const resolveTrackLegRowSurfaceKind = ({
  usesMountedBody,
  mountedBodyIsEdgeToEdge,
  presentedLegHasPublishedList,
  declaresSharedRowSurface,
}: {
  usesMountedBody: boolean;
  mountedBodyIsEdgeToEdge: boolean;
  /** This leg IS the presented one AND a 'list' publication is live for its
   *  scene. NOTE the deliberate asymmetry preserved from the host: this reads
   *  the publication's surfaceKind WITHOUT the entry-stamp gate that
   *  planTrackLegBody applies — the cell inset is a layout fact about the
   *  scene's lane, not about which entry's rows won. */
  presentedLegHasPublishedList: boolean;
  declaresSharedRowSurface: boolean;
}): TrackLegRowSurfaceKind => {
  if (usesMountedBody) {
    return mountedBodyIsEdgeToEdge ? 'mounted-edge-to-edge' : 'mounted';
  }
  return presentedLegHasPublishedList || declaresSharedRowSurface ? 'padded' : 'bare';
};
