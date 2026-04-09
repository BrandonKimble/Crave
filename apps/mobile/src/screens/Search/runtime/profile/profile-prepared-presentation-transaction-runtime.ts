import React from 'react';

import type { ProfileAppExecutionRuntime } from './profile-app-execution-runtime-contract';
import { createPreparedProfileCompletionEventHandler } from './profile-prepared-presentation-event-runtime';
import { executePreparedProfilePresentationTransaction } from './profile-prepared-presentation-state-executor';
import type {
  CreateProfilePreparedPresentationRuntimeArgs,
  ExecutePreparedProfilePresentationTransaction,
} from './profile-prepared-presentation-runtime-contract';
import type { PreparedProfilePresentationCompletionEvent } from './profile-prepared-presentation-transaction-contract';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import type { ProfileNativeExecutionModel } from './profile-native-execution-runtime-contract';

type UseProfilePreparedPresentationTransactionRuntimeArgs = {
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

export type ProfilePreparedPresentationTransactionRuntime = {
  executePreparedProfileTransaction: ExecutePreparedProfilePresentationTransaction;
  handlePreparedProfileCompletionEvent: (event: PreparedProfilePresentationCompletionEvent) => void;
  transactionExecution: CreateProfilePreparedPresentationRuntimeArgs['transactionExecution'];
};

export const useProfilePreparedPresentationTransactionRuntime = ({
  runBatch,
  nativeExecutionModel,
  runtimeStateOwner,
  appExecutionRuntime,
  isSearchOverlay,
}: UseProfilePreparedPresentationTransactionRuntimeArgs): ProfilePreparedPresentationTransactionRuntime => {
  const {
    transitionExecutionModel: { getLastVisibleSheetSnap },
    commandExecutionModel: {
      restaurantSheetRuntimeModel,
      executeAndStripNativeSheetCommands,
      commitProfileCameraTargetCommand,
    },
  } = nativeExecutionModel;
  const {
    shellRuntimeState: { setProfileCameraPadding },
    transitionRuntimeState: { setProfileTransitionStatus, getProfileTransitionState },
    closeRuntimeState: {
      policyRuntimeState: { getProfileDismissBehavior, getProfileShouldClearSearchOnDismiss },
    },
    hydrationRuntime,
  } = runtimeStateOwner;

  const profilePreparedPresentationTransactionSeqRef = React.useRef(0);
  const createPreparedProfilePresentationTransactionId = React.useCallback(
    () =>
      `profile-presentation-transaction:${(profilePreparedPresentationTransactionSeqRef.current += 1)}`,
    []
  );

  const preparedPresentationRuntimeArgs =
    React.useMemo<CreateProfilePreparedPresentationRuntimeArgs>(
      () => ({
        runBatch,
        commandExecutionRuntime: {
          restaurantSheetRuntimeModel,
          nativeCommandExecutionModel: {
            executeAndStripNativeSheetCommands,
            commitProfileCameraTargetCommand,
          },
          appExecutionRuntime,
          setProfileCameraPadding,
        },
        stateExecutionRuntime: {
          setProfileTransitionStatus,
          appExecutionRuntime,
        },
        completionExecution: {
          getRequestSeq: hydrationRuntime.getRestaurantProfileRequestSeq,
          setRequestSeq: hydrationRuntime.setRestaurantProfileRequestSeq,
          cancelHydrationIntentOnOverlayDismiss: (nextRequestSeq) => {
            hydrationRuntime.cancelActiveHydrationIntent(
              'profile_hydration_cancelled_on_overlay_dismiss',
              {
                nextRequestSeq,
                nextRestaurantId: null,
              }
            );
          },
          getProfileTransitionState,
        },
        transactionExecution: {
          createTransactionId: createPreparedProfilePresentationTransactionId,
          getProfileTransitionState,
          getProfileDismissBehavior,
          getProfileShouldClearSearchOnDismiss,
          isSearchOverlay,
          getLastVisibleSheetSnap,
        },
      }),
      [
        appExecutionRuntime,
        commitProfileCameraTargetCommand,
        createPreparedProfilePresentationTransactionId,
        executeAndStripNativeSheetCommands,
        getLastVisibleSheetSnap,
        getProfileDismissBehavior,
        getProfileShouldClearSearchOnDismiss,
        getProfileTransitionState,
        hydrationRuntime,
        isSearchOverlay,
        restaurantSheetRuntimeModel,
        runBatch,
        setProfileCameraPadding,
        setProfileTransitionStatus,
      ]
    );

  return React.useMemo(() => {
    const executePreparedProfileTransaction: ExecutePreparedProfilePresentationTransaction = (
      transaction
    ) => {
      executePreparedProfilePresentationTransaction({
        transaction,
        runBatch: preparedPresentationRuntimeArgs.runBatch,
        commandExecutionRuntime: preparedPresentationRuntimeArgs.commandExecutionRuntime,
        stateExecutionRuntime: preparedPresentationRuntimeArgs.stateExecutionRuntime,
      });
    };

    return {
      executePreparedProfileTransaction,
      handlePreparedProfileCompletionEvent: createPreparedProfileCompletionEventHandler({
        completionExecution: preparedPresentationRuntimeArgs.completionExecution,
        executePreparedProfileTransaction,
      }),
      transactionExecution: preparedPresentationRuntimeArgs.transactionExecution,
    };
  }, [preparedPresentationRuntimeArgs]);
};
