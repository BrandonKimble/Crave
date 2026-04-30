import React from 'react';
import { View } from 'react-native';

import SquircleSpinner from '../../../../components/SquircleSpinner';
import styles from '../../styles';

type SearchResultsListFooterRuntimeArgs = {
  activeSafeResultsCount: number;
  onDemandNotice: React.ReactNode;
  isInteractionLoadingActive: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  activeTabColor: string;
};

export const useSearchResultsListFooterRuntime = ({
  activeSafeResultsCount,
  onDemandNotice,
  isInteractionLoadingActive,
  isLoadingMore,
  canLoadMore,
  activeTabColor,
}: SearchResultsListFooterRuntimeArgs) =>
  React.useMemo(() => {
    const shouldShowNotice = Boolean(
      onDemandNotice && activeSafeResultsCount > 0 && !isInteractionLoadingActive
    );
    return (
      <View style={styles.loadMoreSpacer}>
        {shouldShowNotice ? onDemandNotice : null}
        {!isInteractionLoadingActive && isLoadingMore && canLoadMore ? (
          <View style={styles.loadMoreSpinner}>
            <SquircleSpinner size={18} color={activeTabColor} />
          </View>
        ) : null}
      </View>
    );
  }, [
    activeSafeResultsCount,
    activeTabColor,
    canLoadMore,
    isInteractionLoadingActive,
    isLoadingMore,
    onDemandNotice,
  ]);
