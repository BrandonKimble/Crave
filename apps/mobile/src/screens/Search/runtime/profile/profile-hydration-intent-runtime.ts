import React from 'react';

import type { ProfileControllerState } from './profile-runtime-state-record';
import {
  getActiveHydrationIntentFromRecord,
  getRestaurantProfileRequestSeqFromRecord,
  incrementRestaurantProfileRequestSeqOnRecord,
  setActiveHydrationIntentOnRecord,
  setRestaurantProfileRequestSeqOnRecord,
} from './profile-mutable-state-record';

export type ProfileHydrationIntentRuntime = {
  getRestaurantProfileRequestSeq: () => number;
  setRestaurantProfileRequestSeq: (requestSeq: number) => void;
  cancelActiveHydrationIntent: (
    reason:
      | 'superseded_profile_hydration_intent'
      | 'profile_hydration_cancelled_on_overlay_dismiss',
    context?: {
      nextRequestSeq?: number;
      nextRestaurantId?: string | null;
    }
  ) => void;
  beginRestaurantProfileHydrationIntent: (restaurantId: string) => number;
  isRestaurantProfileRequestCurrent: (requestSeq: number) => boolean;
};

type UseProfileHydrationIntentRuntimeArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  emitRuntimeMechanismEvent: (
    event: 'profile_intent_cancelled',
    payload: Record<string, unknown>
  ) => void;
};

export const useProfileHydrationIntentRuntime = ({
  profileControllerStateRef,
  emitRuntimeMechanismEvent,
}: UseProfileHydrationIntentRuntimeArgs): ProfileHydrationIntentRuntime => {
  const getRestaurantProfileRequestSeq = React.useCallback(
    () => getRestaurantProfileRequestSeqFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const setRestaurantProfileRequestSeq = React.useCallback(
    (requestSeq: number) => {
      setRestaurantProfileRequestSeqOnRecord(profileControllerStateRef.current, requestSeq);
    },
    [profileControllerStateRef]
  );

  const cancelActiveHydrationIntent = React.useCallback(
    (
      reason:
        | 'superseded_profile_hydration_intent'
        | 'profile_hydration_cancelled_on_overlay_dismiss',
      context?: {
        nextRequestSeq?: number;
        nextRestaurantId?: string | null;
      }
    ) => {
      const activeIntent = getActiveHydrationIntentFromRecord(profileControllerStateRef.current);
      if (!activeIntent) {
        return;
      }
      emitRuntimeMechanismEvent('profile_intent_cancelled', {
        reason,
        restaurantId: activeIntent.restaurantId,
        requestSeq: activeIntent.requestSeq,
        activeRequestSeq:
          context?.nextRequestSeq ??
          getRestaurantProfileRequestSeqFromRecord(profileControllerStateRef.current),
        nextRestaurantId: context?.nextRestaurantId ?? null,
      });
      setActiveHydrationIntentOnRecord(profileControllerStateRef.current, null);
    },
    [emitRuntimeMechanismEvent, profileControllerStateRef]
  );

  const beginRestaurantProfileHydrationIntent = React.useCallback(
    (restaurantId: string) => {
      const requestSeq = incrementRestaurantProfileRequestSeqOnRecord(
        profileControllerStateRef.current
      );
      cancelActiveHydrationIntent('superseded_profile_hydration_intent', {
        nextRequestSeq: requestSeq,
        nextRestaurantId: restaurantId,
      });
      setActiveHydrationIntentOnRecord(profileControllerStateRef.current, {
        requestSeq,
        restaurantId,
      });
      return requestSeq;
    },
    [cancelActiveHydrationIntent, profileControllerStateRef]
  );

  const isRestaurantProfileRequestCurrent = React.useCallback(
    (requestSeq: number) =>
      requestSeq === getRestaurantProfileRequestSeqFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  return React.useMemo<ProfileHydrationIntentRuntime>(
    () => ({
      getRestaurantProfileRequestSeq,
      setRestaurantProfileRequestSeq,
      cancelActiveHydrationIntent,
      beginRestaurantProfileHydrationIntent,
      isRestaurantProfileRequestCurrent,
    }),
    [
      beginRestaurantProfileHydrationIntent,
      cancelActiveHydrationIntent,
      getRestaurantProfileRequestSeq,
      isRestaurantProfileRequestCurrent,
      setRestaurantProfileRequestSeq,
    ]
  );
};
