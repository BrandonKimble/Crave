import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';

type ExecutionStage = ResultsPresentationTransportState['executionStage'];

/**
 * The single source of truth for "what work is allowed in each presentation phase"
 * (plans/search-map-reveal-dismiss-smooth-cutover-plan.md, Gates A–E; the v4 execution
 * sequencing in plans/map-lod-ideal-model-v4.md).
 *
 * Reveal and dismiss must be PRESENTATION-ONLY: during the visible `enter_executing` /
 * `exit_executing` windows the only work allowed is the opacity/phase animation. The
 * heavy lanes — structural source republish, rendered-label observation, results-sheet
 * snap — are staged OUT of those windows: structural publish runs under cover
 * (`enter_mounted_hidden`) or after dismiss settles (`idle`), and observation runs only
 * when `settled` (live).
 *
 * This is the contract the gating points are migrating to. Some current gates are looser
 * than this (documented "known leak" exceptions, e.g. preparing-enter label placement
 * during `enter_mounted_hidden`); each cluster of the cutover tightens a gate to match.
 */
export type PresentationLanePolicy = {
  /** Full source / desired-snapshot republish to native (structural lane). */
  allowStructuralApply: boolean;
  /** Rendered-label observation / queryRenderedFeatures / sticky refresh (observation lane). */
  allowObservation: boolean;
  /** Results-sheet snap motion (chrome lane). */
  allowSheetSnap: boolean;
};

export const resolvePresentationLanePolicy = (
  executionStage: ExecutionStage
): PresentationLanePolicy => {
  switch (executionStage) {
    case 'enter_pending_mount':
    case 'enter_mounted_hidden':
      // Covered mount: structural publish is hidden by the cover, so it is cheap to do
      // here. Observation is forbidden — nothing is visibly rendered to observe yet.
      // Sheet snap, if staged under cover, is the chrome lane's decision (Cluster 6).
      return { allowStructuralApply: true, allowObservation: false, allowSheetSnap: false };
    case 'enter_executing':
    case 'exit_requested':
    case 'exit_executing':
      // Visible reveal / dismiss: presentation-only. NOTHING heavy in the hot window.
      return { allowStructuralApply: false, allowObservation: false, allowSheetSnap: false };
    case 'settled':
      // Live: every lane is allowed.
      return { allowStructuralApply: true, allowObservation: true, allowSheetSnap: true };
    case 'idle':
    default:
      // Idle / post-dismiss cleanup: structural cleanup OK, no observation.
      return { allowStructuralApply: true, allowObservation: false, allowSheetSnap: true };
  }
};
