import React from 'react';
import { View } from 'react-native';

import EmptyState from '../../components/empty-state';
import { SceneLoadingSurface } from '../../../../components/skeletons';
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

  // OWNER REVISION 2026-07-17 (supersedes the 2026-07-07 true-cutout directive): the
  // results skeleton is SELF-FROST. Frost-through-to-the-map made the bars wash out
  // and pick up map colors over light areas (the attributed "splotchy" loading state,
  // screenshots in the search-family slice notes) — the skeleton must read as uniform
  // bars like every other scene's material. The rows beneath still hide via the
  // rows-visibility level; the two designs by mode (strip pills on the initial
  // skeleton, none on the interaction skeleton) are unchanged.
  const initialLoadingContent = React.useMemo(
    () => (
      <SceneLoadingSurface
        rowType={activeTab === 'dishes' ? 'dish' : 'restaurant'}
        withFilterStripHoles
        frostBacking
      />
    ),
    [activeTab]
  );
  const loadingContent = React.useMemo(
    () => (
      <SceneLoadingSurface rowType={activeTab === 'dishes' ? 'dish' : 'restaurant'} frostBacking />
    ),
    [activeTab]
  );

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

  return React.useMemo(
    () => ({
      emptyContent,
      loadingContent,
      initialLoadingContent,
    }),
    [emptyContent, initialLoadingContent, loadingContent]
  );
};
