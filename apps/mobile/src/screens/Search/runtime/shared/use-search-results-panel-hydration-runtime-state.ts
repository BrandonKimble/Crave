import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type {
  SearchResultsBodyAdmissionHandoffPhase,
  SearchResultsPanelHydrationRuntimeState,
} from './search-results-panel-runtime-state-contract';
import React from 'react';

/** F1735: the redraw coordinator this used to sample was a structural fossil — the bus
 *  phase was pinned 'idle' forever. The one live derivation that survives is the body-
 *  admission handoff phase: 'idle' until a results identity exists on the surface
 *  authority, 'markers_ready' after (exactly what resolveBodyAdmissionHandoffPhase('idle')
 *  produced). The raw phase, finalize-commit getter, and commit-span pressure fields were
 *  pinned constants and are deleted. */
export const useSearchResultsPanelHydrationRuntimeState = (
  searchRuntimeBus: SearchRuntimeBus,
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority
): SearchResultsPanelHydrationRuntimeState => {
  const sampledPolicyFacts = searchRuntimeBus.getPolicyFactsSnapshot();
  const surfaceResultsIdentityKey =
    resultsPresentationSurfaceAuthority.getSnapshot().resultsIdentityKey;
  const sampledSearchSurfaceRedrawPhase: SearchResultsBodyAdmissionHandoffPhase =
    surfaceResultsIdentityKey == null ? 'idle' : 'markers_ready';

  return React.useMemo(
    () => ({
      searchSurfaceRedrawPhase: sampledSearchSurfaceRedrawPhase,
      chromeFreezeClassification: sampledPolicyFacts.freezeClassification,
    }),
    [sampledPolicyFacts.freezeClassification, sampledSearchSurfaceRedrawPhase]
  );
};
