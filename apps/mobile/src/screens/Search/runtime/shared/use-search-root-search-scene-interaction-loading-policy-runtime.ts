import { useMemo } from 'react';

export const useSearchRootSearchSceneInteractionLoadingPolicyRuntime = ({
  searchSheetContentLaneKind,
}: {
  searchSheetContentLaneKind: string;
}) =>
  useMemo(
    () =>
      searchSheetContentLaneKind !== 'results_closing' &&
      searchSheetContentLaneKind !== 'persistent_poll',
    [searchSheetContentLaneKind]
  );
