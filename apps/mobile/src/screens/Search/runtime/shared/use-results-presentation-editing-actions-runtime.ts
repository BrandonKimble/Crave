import React from 'react';

import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { SearchPresentationIntent } from './results-presentation-shell-contract';
import type { ResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';

type UseResultsPresentationEditingActionsRuntimeArgs = {
  shellLocalState: ResultsPresentationShellLocalState;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

type ResultsPresentationEditingActionsRuntime = {
  requestEditingPresentationIntent: (
    intent: Extract<SearchPresentationIntent, { kind: 'focus_editing' | 'exit_editing' }>
  ) => null;
};

export const useResultsPresentationEditingActionsRuntime = ({
  shellLocalState,
  routeSceneVisibilityPolicyRuntime,
}: UseResultsPresentationEditingActionsRuntimeArgs): ResultsPresentationEditingActionsRuntime => {
  const requestEditingPresentationIntent = React.useCallback(
    (intent: Extract<SearchPresentationIntent, { kind: 'focus_editing' | 'exit_editing' }>) => {
      const inputMode = intent.kind === 'focus_editing' ? 'editing' : 'idle';
      routeSceneVisibilityPolicyRuntime.updateInputMode(inputMode);
      shellLocalState.setInputMode(inputMode);
      return null;
    },
    [routeSceneVisibilityPolicyRuntime, shellLocalState]
  );

  return React.useMemo(
    () => ({
      requestEditingPresentationIntent,
    }),
    [requestEditingPresentationIntent]
  );
};
