import React from 'react';
import { View } from 'react-native';

import EmptyState from '../../components/empty-state';
import { SceneLoadingSurface } from '../../../../components/skeletons';
import styles from '../../styles';

export const useSearchRootSearchScenePanelSurfaceContentRuntime = ({
  resolvedResults,
  activeTab,
  onDemandNotice,
}: {
  resolvedResults: { metadata?: { emptyQueryMessage?: string } } | null;
  activeTab: 'dishes' | 'restaurants';
  onDemandNotice: React.ReactNode;
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
    const emptyTitle = activeTab === 'dishes' ? 'No dishes found.' : 'No restaurants found.';
    const emptySubtitle =
      resultsMetadata.emptyQueryMessage ?? 'Try moving the map or adjusting your search.';
    return (
      <View style={styles.emptyState}>
        {onDemandNotice}
        <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
      </View>
    );
  }, [activeTab, onDemandNotice, resultsMetadata.emptyQueryMessage]);

  return React.useMemo(
    () => ({
      emptyContent,
      loadingContent,
      initialLoadingContent,
    }),
    [emptyContent, initialLoadingContent, loadingContent]
  );
};
