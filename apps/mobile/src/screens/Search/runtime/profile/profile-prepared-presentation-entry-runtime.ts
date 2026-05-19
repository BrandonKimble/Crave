import React from 'react';

import { closePreparedProfilePresentationTransaction } from './profile-prepared-close-presentation-builder';
import { createFocusedProfileCameraPresentationTransaction } from '../../../../navigation/runtime/app-route-profile-prepared-focus-presentation-builder';
import { openPreparedProfilePresentationTransaction } from './profile-prepared-open-presentation-builder';
import { promotePreparedProfileCloseSnapshotToClearDismiss } from '../../../../navigation/runtime/app-route-profile-prepared-presentation-transition-runtime';
import type {
  ExecutePreparedProfilePresentationTransaction,
  ProfilePreparedPresentationRuntime,
  CreateProfilePreparedPresentationRuntimeArgs,
} from './profile-prepared-presentation-runtime-contract';

type UseProfilePreparedPresentationEntryRuntimeArgs = {
  executePreparedProfileTransaction: ExecutePreparedProfilePresentationTransaction;
  transactionExecution: CreateProfilePreparedPresentationRuntimeArgs['transactionExecution'];
};

export type ProfilePreparedPresentationEntryRuntime = Pick<
  ProfilePreparedPresentationRuntime,
  | 'openPreparedProfilePresentation'
  | 'closePreparedProfilePresentation'
  | 'focusPreparedProfileCamera'
>;

export const useProfilePreparedPresentationEntryRuntime = ({
  executePreparedProfileTransaction,
  transactionExecution,
}: UseProfilePreparedPresentationEntryRuntimeArgs): ProfilePreparedPresentationEntryRuntime =>
  React.useMemo(
    () => ({
      openPreparedProfilePresentation: (
        restaurantId,
        targetCamera,
        shouldForceSharedMiddleSnap,
        status
      ) => {
        executePreparedProfileTransaction(
          openPreparedProfilePresentationTransaction({
            transition: transactionExecution.getProfileTransitionState(),
            createTransactionId: transactionExecution.createTransactionId,
            restaurantId,
            targetCamera,
            shouldForceSharedMiddleSnap,
            status,
          })
        );
      },
      closePreparedProfilePresentation: (restaurantId) => {
        const transition = transactionExecution.getProfileTransitionState();
        if (
          transition.status === 'closing' ||
          transition.preparedSnapshot?.kind === 'profile_close' ||
          transition.completionState.dismiss.requestToken != null
        ) {
          if (transactionExecution.getProfileDismissBehavior() === 'clear') {
            promotePreparedProfileCloseSnapshotToClearDismiss({
              transition,
              shouldClearSearchOnClose:
                transactionExecution.getProfileShouldClearSearchOnDismiss(),
            });
          }
          return;
        }
        executePreparedProfileTransaction(
          closePreparedProfilePresentationTransaction({
            transition,
            createTransactionId: transactionExecution.createTransactionId,
            restaurantId,
            dismissBehavior: transactionExecution.getProfileDismissBehavior(),
            shouldClearSearchOnDismiss: transactionExecution.getProfileShouldClearSearchOnDismiss(),
          })
        );
      },
      focusPreparedProfileCamera: (targetCamera) => {
        executePreparedProfileTransaction(
          createFocusedProfileCameraPresentationTransaction(targetCamera)
        );
      },
    }),
    [executePreparedProfileTransaction, transactionExecution]
  );
