import React from 'react';
import { View } from 'react-native';

import SquircleSpinner from '../../../../components/SquircleSpinner';
import EmptyState from '../../components/empty-state';
import { ACTIVE_TAB_COLOR } from '../../constants/search';
import styles from '../../styles';

const RESULTS_LOADING_SPINNER_OFFSET = 96;

export const useSearchRootSearchScenePanelSurfaceContentRuntime = ({
  resolvedResults,
  activeTab,
  onDemandNotice,
  surfaceMode,
}: {
  resolvedResults: { metadata?: { emptyQueryMessage?: string } } | null;
  activeTab: 'dishes' | 'restaurants';
  onDemandNotice: React.ReactNode;
  surfaceMode: 'none' | 'initial_loading' | 'empty' | 'interaction_loading';
}) => {
  const resultsMetadata =
    (resolvedResults?.metadata ?? {}) as { emptyQueryMessage?: string };

  return React.useMemo(() => {
    if (surfaceMode === 'none') {
      return null;
    }
    if (surfaceMode === 'empty') {
      const emptyTitle =
        activeTab === 'dishes'
          ? 'No dishes found.'
          : 'No restaurants found.';
      const emptySubtitle =
        resultsMetadata.emptyQueryMessage ??
        'Try moving the map or adjusting your search.';
      return (
        <View style={styles.emptyState}>
          {onDemandNotice}
          <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
        </View>
      );
    }

    return (
      <View style={{ paddingTop: RESULTS_LOADING_SPINNER_OFFSET }}>
        <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
      </View>
    );
  }, [
    activeTab,
    onDemandNotice,
    resultsMetadata.emptyQueryMessage,
    surfaceMode,
  ]);
};
