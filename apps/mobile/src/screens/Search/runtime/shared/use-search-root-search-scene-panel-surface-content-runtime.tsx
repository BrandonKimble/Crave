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

  // Owner directive (2026-07-07): EVERY loading state is a TRUE CUTOUT — the skeleton's
  // white plate is the cover and its holes are transparent down to the hoisted frosted
  // map. The rows beneath hide via the rows-visibility level (same frame as the cover),
  // so the holes never show stale content and no self-frost fallback exists here.
  // TWO DESIGNS by mode (owner): the INITIAL/reveal skeleton carries static pill holes
  // where the toggle strip sits (the real strip is hidden then); the INTERACTION skeleton
  // omits them — the live strip renders above that cover and stays tappable.
  const initialLoadingContent = React.useMemo(
    () => (
      <SceneLoadingSurface
        rowType={activeTab === 'dishes' ? 'dish' : 'restaurant'}
        withFilterStripHoles
      />
    ),
    [activeTab]
  );
  const loadingContent = React.useMemo(
    () => <SceneLoadingSurface rowType={activeTab === 'dishes' ? 'dish' : 'restaurant'} />,
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
