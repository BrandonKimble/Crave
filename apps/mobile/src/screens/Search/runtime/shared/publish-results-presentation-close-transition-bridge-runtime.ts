import type React from 'react';

import type { ResultsCloseTransitionActions } from './results-presentation-shell-runtime-contract';

type PublishResultsPresentationCloseTransitionBridgeRuntimeArgs = {
  markSearchSheetCloseMapExitSettledRef: React.MutableRefObject<(requestKey: string) => void>;
  closeTransitionActions: Pick<ResultsCloseTransitionActions, 'markSearchSheetCloseMapExitSettled'>;
};

export const publishResultsPresentationCloseTransitionBridgeRuntime = ({
  markSearchSheetCloseMapExitSettledRef,
  closeTransitionActions,
}: PublishResultsPresentationCloseTransitionBridgeRuntimeArgs): void => {
  markSearchSheetCloseMapExitSettledRef.current =
    closeTransitionActions.markSearchSheetCloseMapExitSettled;
};
