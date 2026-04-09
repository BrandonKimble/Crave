import React from 'react';

import type { ProfileAppExecutionRuntime } from './profile-app-execution-runtime-contract';
import { useBindPreparedProfileCompletionHandler } from './profile-prepared-presentation-binding-runtime';
import { useProfilePreparedPresentationEntryRuntime } from './profile-prepared-presentation-entry-runtime';
import { type ProfilePreparedPresentationRuntime } from './profile-prepared-presentation-runtime-contract';
import { type PreparedProfilePresentationCompletionEvent } from './profile-prepared-presentation-transaction-contract';
import { useProfilePreparedPresentationTransactionRuntime } from './profile-prepared-presentation-transaction-runtime';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';

export type {
  CreateProfilePreparedPresentationRuntimeArgs,
  ProfilePreparedPresentationRuntime,
} from './profile-prepared-presentation-runtime-contract';
export type {
  PreparedProfilePresentationCompletionEvent,
  PreparedProfilePresentationTransaction,
} from './profile-prepared-presentation-transaction-contract';

export type UseProfilePreparedPresentationRuntimeArgs = {
  preparedProfileCompletionHandlerRef: React.MutableRefObject<
    ((event: PreparedProfilePresentationCompletionEvent) => void) | null
  >;
  runBatch: (fn: () => void) => void;
  nativeExecutionModel: Pick<
    ProfileNativeExecutionModel,
    'transitionExecutionModel' | 'commandExecutionModel'
  >;
  runtimeStateOwner: Pick<
    ProfileRuntimeStateOwner,
    'shellRuntimeState' | 'transitionRuntimeState' | 'closeRuntimeState' | 'hydrationRuntime'
  >;
  appExecutionRuntime: ProfileAppExecutionRuntime;
  isSearchOverlay: boolean;
};

export const useProfilePreparedPresentationRuntime = ({
  preparedProfileCompletionHandlerRef,
  runBatch,
  nativeExecutionModel,
  runtimeStateOwner,
  appExecutionRuntime,
  isSearchOverlay,
}: UseProfilePreparedPresentationRuntimeArgs): ProfilePreparedPresentationRuntime => {
  const preparedPresentationTransactionRuntime = useProfilePreparedPresentationTransactionRuntime({
    runBatch,
    nativeExecutionModel,
    runtimeStateOwner,
    appExecutionRuntime,
    isSearchOverlay,
  });
  const preparedPresentationEntryRuntime = useProfilePreparedPresentationEntryRuntime({
    executePreparedProfileTransaction:
      preparedPresentationTransactionRuntime.executePreparedProfileTransaction,
    transactionExecution: preparedPresentationTransactionRuntime.transactionExecution,
  });

  const preparedPresentationRuntime = React.useMemo<ProfilePreparedPresentationRuntime>(
    () => ({
      executePreparedProfileTransaction:
        preparedPresentationTransactionRuntime.executePreparedProfileTransaction,
      handlePreparedProfileCompletionEvent:
        preparedPresentationTransactionRuntime.handlePreparedProfileCompletionEvent,
      openPreparedProfilePresentation:
        preparedPresentationEntryRuntime.openPreparedProfilePresentation,
      closePreparedProfilePresentation:
        preparedPresentationEntryRuntime.closePreparedProfilePresentation,
      focusPreparedProfileCamera: preparedPresentationEntryRuntime.focusPreparedProfileCamera,
    }),
    [preparedPresentationEntryRuntime, preparedPresentationTransactionRuntime]
  );

  useBindPreparedProfileCompletionHandler({
    preparedProfileCompletionHandlerRef,
    handlePreparedProfileCompletionEvent:
      preparedPresentationRuntime.handlePreparedProfileCompletionEvent,
  });

  return preparedPresentationRuntime;
};
