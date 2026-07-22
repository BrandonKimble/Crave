import React from 'react';
import { View } from 'react-native';

import { Text } from '../../../../components';
import styles from '../../styles';
import { useViewportSubjectState } from '../../../../store/viewport-subject-store';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

type UseSearchResultsPanelOnDemandNoticeRuntimeArgs = {
  resolvedResults: SearchResultsPayload;
  onDemandNoticeQuery: string;
};

export const useSearchResultsPanelOnDemandNoticeRuntime = ({
  resolvedResults,
  onDemandNoticeQuery,
}: UseSearchResultsPanelOnDemandNoticeRuntimeArgs) => {
  // HEADER SUBJECT-STORE (ratified 2026-07-21): the area label reads the ONE
  // client subject verdict once committed; the response-metadata market names
  // are only the pre-first-commit fallback (chain simplifies to: store →
  // metadata names → 'this area').
  const viewportSubject = useViewportSubjectState();
  const subjectVerdict = viewportSubject.verdict;
  return React.useMemo(() => {
    const metadata = (resolvedResults?.metadata ?? {}) as {
      onDemandQueued?: boolean;
      onDemandEtaMs?: number;
      marketResolutionStatus?: 'resolved' | 'multi_market' | 'no_market' | 'error';
      displayMarketName?: string | null;
      candidateLocalityName?: string | null;
      collectableMarketKeys?: string[];
    };
    const collectableMarketCount = Array.isArray(metadata.collectableMarketKeys)
      ? metadata.collectableMarketKeys.length
      : 0;
    const displayName =
      typeof metadata.displayMarketName === 'string' && metadata.displayMarketName.trim()
        ? metadata.displayMarketName.trim()
        : null;
    const candidateLocalityName =
      typeof metadata.candidateLocalityName === 'string' && metadata.candidateLocalityName.trim()
        ? metadata.candidateLocalityName.trim()
        : null;

    let noticeText: string | null = null;

    if (metadata.onDemandQueued) {
      const etaMs = metadata.onDemandEtaMs;
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
      // The subject store's §2 verdict is the area authority when committed
      // (it already reserves 'this area' for straddles/unnamed ground); before
      // the first commit, keep the legacy metadata chain — name the market
      // only when exactly one collectable market is in play; several ->
      // "this area" (collection fans out; naming one would lie).
      const areaLabel = subjectVerdict
        ? subjectVerdict.kind === 'place'
          ? subjectVerdict.placeName
          : 'this area'
        : collectableMarketCount > 1
          ? 'this area'
          : (displayName ?? candidateLocalityName ?? 'this area');
      const searchLabel = onDemandNoticeQuery ? ` for ${onDemandNoticeQuery}` : '';
      const suffix = etaText ? ` Check back in ${etaText}.` : ' Check back soon.';
      noticeText = `Your search${searchLabel} is helping us grow coverage in ${areaLabel}. More searches like this help us learn what people want here.${suffix} Create a poll to get answers faster.`;
    } else if (collectableMarketCount === 0) {
      if (metadata.marketResolutionStatus === 'no_market' && candidateLocalityName) {
        const searchLabel = onDemandNoticeQuery ? ` for ${onDemandNoticeQuery}` : '';
        noticeText = `Your search${searchLabel} is helping us grow coverage in ${candidateLocalityName}. More searches like this help us learn what people want here. Check back soon, or create a poll to get answers faster.`;
      } else if (displayName) {
        const searchLabel = onDemandNoticeQuery ? ` for ${onDemandNoticeQuery}` : '';
        noticeText = `Your search${searchLabel} is helping us grow coverage in ${displayName}. More searches like this help us learn what people want here. Check back soon, or create a poll to get answers faster.`;
      } else if (metadata.marketResolutionStatus === 'multi_market') {
        noticeText =
          'Coverage is limited here. Zoom out or move the map, then run the search again.';
      }
    }

    if (!noticeText) {
      return null;
    }

    return (
      <View style={styles.onDemandNotice}>
        <Text variant="body" style={styles.onDemandNoticeText}>
          {noticeText}
        </Text>
      </View>
    );
  }, [onDemandNoticeQuery, resolvedResults, subjectVerdict]);
};
