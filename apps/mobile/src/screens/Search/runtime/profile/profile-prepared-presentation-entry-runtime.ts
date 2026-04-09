import React from 'react';

import { closePreparedProfilePresentationTransaction } from './profile-prepared-close-presentation-builder';
import { createFocusedProfileCameraPresentationTransaction } from './profile-prepared-focus-presentation-builder';
import { openPreparedProfilePresentationTransaction } from './profile-prepared-open-presentation-builder';
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
        executePreparedProfileTransaction(
          closePreparedProfilePresentationTransaction({
            transition: transactionExecution.getProfileTransitionState(),
            createTransactionId: transactionExecution.createTransactionId,
            restaurantId,
            dismissBehavior: transactionExecution.getProfileDismissBehavior(),
            shouldClearSearchOnDismiss: transactionExecution.getProfileShouldClearSearchOnDismiss(),
            isSearchOverlay: transactionExecution.isSearchOverlay,
            lastVisibleSheetSnap: transactionExecution.getLastVisibleSheetSnap(),
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
