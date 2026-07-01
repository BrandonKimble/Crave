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

  // Hard-swap reveal cover: while surfaceMode='initial_loading', paint a structure-matched
  // results skeleton (dish or restaurant rows) instead of a bare spinner so the search→results
  // reveal lands on structure the moment it crosses over.
  //
  // frostBacking: the skeleton renders inside the results LOADING COVER (resultsLoadingCoverSurface,
  // an opaque white layer at zIndex 20 that hides the OUTGOING feed during the reveal). The holes
  // therefore can't frost-through to the hoisted map (they'd hit the cover / the feed it hides), so
  // a self-contained frost gives the holes their frosted-window contrast.
  const loadingContent = React.useMemo(
    () => <SceneLoadingSurface rowType={activeTab === 'dishes' ? 'dish' : 'restaurant'} frostBacking />,
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
