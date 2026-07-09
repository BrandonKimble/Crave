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
  onRetryResolution,
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
  onRetryResolution: () => void;
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
    // FAILURE variant (charter: 'failed' is a designed state with a retry affordance):
    // a failed search with nothing presented renders failure copy + Retry — never a
    // blank sheet. Offline failures explain themselves (the system banner also shows)
    // and auto-retry on reconnect; Retry stays available either way.
    if (resolutionFailure != null) {
      const failureTitle = resolutionFailure.offline ? "You're offline." : 'Something went wrong.';
      const failureSubtitle = resolutionFailure.offline
        ? "Results will load when you're back online."
        : "We couldn't load results. Check your connection and try again.";
      return (
        <View style={[styles.emptyState, styles.emptyStateSurfaceBlock]}>
          <EmptyState
            title={failureTitle}
            subtitle={failureSubtitle}
            action={{
              label: 'Retry',
              onPress: onRetryResolution,
              testID: 'search-resolution-retry',
            }}
          />
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
  }, [
    activeTab,
    onDemandNotice,
    onRetryResolution,
    resolutionFailure,
    resultsMetadata.emptyQueryMessage,
  ]);

  return React.useMemo(
    () => ({
      emptyContent,
      loadingContent,
      initialLoadingContent,
    }),
    [emptyContent, initialLoadingContent, loadingContent]
  );
};
