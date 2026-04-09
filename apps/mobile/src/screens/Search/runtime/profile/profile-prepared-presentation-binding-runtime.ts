import React from 'react';

import type { ProfilePreparedPresentationRuntime } from './profile-prepared-presentation-runtime-contract';
import type { PreparedProfilePresentationCompletionEvent } from './profile-prepared-presentation-transaction-contract';

export const useBindPreparedProfileCompletionHandler = ({
  preparedProfileCompletionHandlerRef,
  handlePreparedProfileCompletionEvent,
}: {
  preparedProfileCompletionHandlerRef: React.MutableRefObject<
    ((event: PreparedProfilePresentationCompletionEvent) => void) | null
  >;
  handlePreparedProfileCompletionEvent: ProfilePreparedPresentationRuntime['handlePreparedProfileCompletionEvent'];
}) => {
  React.useEffect(() => {
    preparedProfileCompletionHandlerRef.current = handlePreparedProfileCompletionEvent;
    return () => {
      preparedProfileCompletionHandlerRef.current = null;
    };
  }, [handlePreparedProfileCompletionEvent, preparedProfileCompletionHandlerRef]);
};
