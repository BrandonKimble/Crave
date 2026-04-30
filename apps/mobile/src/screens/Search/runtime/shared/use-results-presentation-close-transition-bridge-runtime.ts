import type React from 'react';

import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';

type UseResultsPresentationCloseTransitionBridgeRuntimeArgs = {
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  closeTransitionActions: Pick<
    ResultsCloseTransitionActions,
    'markSearchSheetCloseMapExitSettled'
  >;
};

export const useResultsPresentationCloseTransitionBridgeRuntime = ({
  markSearchSheetCloseMapExitSettledRef,
  closeTransitionActions,
}: UseResultsPresentationCloseTransitionBridgeRuntimeArgs): void => {
  markSearchSheetCloseMapExitSettledRef.current =
    closeTransitionActions.markSearchSheetCloseMapExitSettled;
};
