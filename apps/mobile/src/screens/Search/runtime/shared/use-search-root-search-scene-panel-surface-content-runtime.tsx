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

  // P5: the INITIAL-load reveal cover is gone (the search leg's own skeleton page/list is the
  // loading visual now). This skeleton only renders inside the INTERACTION (toggle-reload) cover
  // (resultsLoadingCoverSurface, an opaque white layer at zIndex 20 that hides the STALE rows
  // below the toggle strip during a refetch — a query-flow surface, TR5 scope).
  //
  // frostBacking: the holes can't frost-through to the hoisted map (they'd hit the opaque cover /
  // the rows it hides), so a self-contained frost gives the holes their frosted-window contrast.
  const loadingContent = React.useMemo(
    () => (
      <SceneLoadingSurface rowType={activeTab === 'dishes' ? 'dish' : 'restaurant'} frostBacking />
    ),
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
    }),
    [emptyContent, loadingContent]
  );
};
