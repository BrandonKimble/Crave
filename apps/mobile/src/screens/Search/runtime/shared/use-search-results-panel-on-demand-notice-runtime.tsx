import React from 'react';
import { View } from 'react-native';

import { Text } from '../../../../components';
import styles from '../../styles';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

type UseSearchResultsPanelOnDemandNoticeRuntimeArgs = {
  resolvedResults: SearchResultsPayload;
  onDemandNoticeQuery: string;
};

export const useSearchResultsPanelOnDemandNoticeRuntime = ({
  resolvedResults,
  onDemandNoticeQuery,
}: UseSearchResultsPanelOnDemandNoticeRuntimeArgs) => {
  return React.useMemo(() => {
    if (!resolvedResults?.metadata?.onDemandQueued) {
      return null;
    }
    const etaMs = resolvedResults?.metadata?.onDemandEtaMs;
    let etaText: string | null = null;
    if (etaMs && Number.isFinite(etaMs) && etaMs > 0) {
      const totalMinutes = Math.round(etaMs / 60000);
      if (totalMinutes < 60) {
        etaText = `${totalMinutes} min`;
      } else {
        const hours = Math.ceil(totalMinutes / 60);
        etaText = hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
      }
    }
    const prefix = onDemandNoticeQuery
      ? `We're expanding results for ${onDemandNoticeQuery}.`
      : `We're expanding results.`;
    const suffix = etaText ? ` Check back in ${etaText}.` : ' Check back soon.';
    return (
      <View style={styles.onDemandNotice}>
        <Text variant="body" style={styles.onDemandNoticeText}>
          {`${prefix}${suffix}`}
        </Text>
      </View>
    );
  }, [onDemandNoticeQuery, resolvedResults]);
};
