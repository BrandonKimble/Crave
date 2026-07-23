import React from 'react';
import { View } from 'react-native';

import { Text } from '../../../../components';
import styles from '../../styles';
import { useViewportSubjectState } from '../../../../store/viewport-subject-store';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';
import { resolveOnDemandNoticeText, type OnDemandNoticeMetadata } from './on-demand-notice-copy';

type UseSearchResultsPanelOnDemandNoticeRuntimeArgs = {
  resolvedResults: SearchResultsPayload;
  onDemandNoticeQuery: string;
};

export const useSearchResultsPanelOnDemandNoticeRuntime = ({
  resolvedResults,
  onDemandNoticeQuery,
}: UseSearchResultsPanelOnDemandNoticeRuntimeArgs) => {
  // HEADER SUBJECT-STORE (ratified 2026-07-21): the area label reads the ONE
  // client subject verdict once committed; the response-metadata place names
  // are only the pre-first-commit fallback (chain simplifies to: store →
  // metadata names → 'this area').
  const viewportSubject = useViewportSubjectState();
  const subjectVerdict = viewportSubject.verdict;
  return React.useMemo(() => {
    const metadata = (resolvedResults?.metadata ?? {}) as OnDemandNoticeMetadata;

    // The subject store's §2 verdict is the area authority once committed —
    // it gates the area label in BOTH arms of the pure core (place name or
    // 'this area'); the response-metadata name (displayPlaceName) serves
    // STRICTLY pre-first-commit.
    const verdictAreaLabel = subjectVerdict
      ? subjectVerdict.kind === 'place'
        ? subjectVerdict.placeName
        : 'this area'
      : null;

    const noticeText = resolveOnDemandNoticeText({
      metadata,
      verdictAreaLabel,
      onDemandNoticeQuery,
    });

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
