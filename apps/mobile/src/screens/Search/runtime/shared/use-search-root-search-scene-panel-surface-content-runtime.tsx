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

  // Owner directive (2026-07-07): loading states are TRUE CUTOUTS — the skeleton's white
  // plate is the cover and its holes are transparent down to the hoisted frosted map.
  // INITIAL loads have no rows beneath (the body is empty) so the holes are real windows.
  // INTERACTION (toggle) reloads still sit over the STALE rows, so they keep the
  // self-frost backing until the body-hide (rows at opacity 0 under the cover) lands —
  // then this fork collapses and both modes are real windows.
  const loadingContent = React.useMemo(
    () => <SceneLoadingSurface rowType={activeTab === 'dishes' ? 'dish' : 'restaurant'} />,
    [activeTab]
  );
  const interactionLoadingContent = React.useMemo(
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
      interactionLoadingContent,
    }),
    [emptyContent, interactionLoadingContent, loadingContent]
  );
};
