import React from 'react';

import { buildResultsHeaderTitle } from './header-read-model-builder';

export const useSearchResultsListHeaderTitleRuntime = ({
  submittedQuery,
}: {
  submittedQuery: string;
}) =>
  React.useMemo(
    () => buildResultsHeaderTitle(submittedQuery),
    [submittedQuery]
  );
