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
}: {
  resolvedResults: { metadata?: { emptyQueryMessage?: string } } | null;
  activeTab: 'dishes' | 'restaurants';
  onDemandNotice: React.ReactNode;
}) => {
  const resultsMetadata = (resolvedResults?.metadata ?? {}) as { emptyQueryMessage?: string };

  const loadingContent = React.useMemo(
    () => (
      <View style={{ paddingTop: RESULTS_LOADING_SPINNER_OFFSET }}>
        <SquircleSpinner size={22} color={ACTIVE_TAB_COLOR} />
      </View>
    ),
    []
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
