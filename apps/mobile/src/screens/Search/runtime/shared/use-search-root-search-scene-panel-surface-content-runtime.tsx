import React from 'react';
import { View } from 'react-native';

import EmptyState from '../../components/empty-state';
import styles from '../../styles';

export const useSearchRootSearchScenePanelSurfaceContentRuntime = ({
  resolvedResults,
  activeTab,
  onDemandNotice,
  resolutionFailure,
}: {
  resolvedResults: { metadata?: { emptyQueryMessage?: string } } | null;
  activeTab: 'dishes' | 'restaurants';
  onDemandNotice: React.ReactNode;
  resolutionFailure: {
    generation: number;
    reason: string;
    offline: boolean;
    atMs: number;
  } | null;
}) => {
  const resultsMetadata = (resolvedResults?.metadata ?? {}) as { emptyQueryMessage?: string };

  // The loading faces are GONE from this runtime (pending-block arc 2026-07-18): the
  // list's own data is the pending block while a redraw episode is live — see
  // ResultsPendingBlockCell (the one cell) and the motion fence in
  // SearchMountedSceneBody. The strip-pill header skeleton died with the cover (the
  // owner's no-header-skeleton call); the in-list strip is the list HEADER and keeps
  // its existing visibility choreography.

  const emptyContent = React.useMemo(() => {
    // FAILURE variant — a transient resting surface, not an announcement (owner spec
    // revision 2026-07-08): online failures announce via the uniform modal, and
    // dismissing it unwinds a failed enter back to origin, so this page only shows
    // behind the modal / during the slide-down. Offline it's the hang's resting copy
    // (the system banner explains; reconnect auto-retries). No inline Retry — the ONE
    // retry story is the user trying again from where they came back to.
    if (resolutionFailure != null) {
      const failureTitle = resolutionFailure.offline ? "You're offline." : 'Something went wrong.';
      const failureSubtitle = resolutionFailure.offline
        ? "Results will load when you're back online."
        : "We couldn't load results.";
      return (
        <View style={[styles.emptyState, styles.emptyStateSurfaceBlock]}>
          <EmptyState title={failureTitle} subtitle={failureSubtitle} />
        </View>
      );
    }
    const emptyTitle = activeTab === 'dishes' ? 'No dishes found.' : 'No restaurants found.';
    const emptySubtitle =
      resultsMetadata.emptyQueryMessage ?? 'Try moving the map or adjusting your search.';
    return (
      <View style={[styles.emptyState, styles.emptyStateSurfaceBlock]}>
        {onDemandNotice}
        <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
      </View>
    );
  }, [activeTab, onDemandNotice, resolutionFailure, resultsMetadata.emptyQueryMessage]);

  return React.useMemo(() => ({ emptyContent }), [emptyContent]);
};
