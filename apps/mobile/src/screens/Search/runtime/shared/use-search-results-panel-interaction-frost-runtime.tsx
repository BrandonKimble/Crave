import React from 'react';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

import type { SearchResultsPanelDataRuntime } from './search-results-panel-data-runtime-contract';

const INTERACTION_FROST_FADE_MS = 90;

type UseSearchResultsPanelInteractionFrostRuntimeArgs = Pick<
  SearchResultsPanelDataRuntime,
  'notifyToggleInteractionFrostReady' | 'pendingPresentationIntentId'
> & {
  shouldShowInteractionLoadingState: boolean;
};

export type SearchResultsPanelInteractionFrostRuntime = {
  interactionFrostAnimatedStyle: AnimatedStyle<Record<string, unknown>>;
};

export const useSearchResultsPanelInteractionFrostRuntime = ({
  notifyToggleInteractionFrostReady,
  pendingPresentationIntentId,
  shouldShowInteractionLoadingState,
}: UseSearchResultsPanelInteractionFrostRuntimeArgs): SearchResultsPanelInteractionFrostRuntime => {
  const interactionFrostOpacity = useSharedValue(0);
  const lastArmedFrostIntentIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const intentId = shouldShowInteractionLoadingState ? pendingPresentationIntentId : null;
    if (!intentId) {
      lastArmedFrostIntentIdRef.current = null;
      interactionFrostOpacity.value = withTiming(0, {
        duration: INTERACTION_FROST_FADE_MS,
      });
      return;
    }
    if (lastArmedFrostIntentIdRef.current === intentId) {
      return;
    }
    lastArmedFrostIntentIdRef.current = intentId;
    interactionFrostOpacity.value = 0;
    interactionFrostOpacity.value = withTiming(
      1,
      { duration: INTERACTION_FROST_FADE_MS },
      (finished) => {
        if (finished) {
          runOnJS(notifyToggleInteractionFrostReady)(intentId);
        }
      }
    );
  }, [
    interactionFrostOpacity,
    notifyToggleInteractionFrostReady,
    pendingPresentationIntentId,
    shouldShowInteractionLoadingState,
  ]);

  const interactionFrostAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interactionFrostOpacity.value,
  }));

  return React.useMemo(
    () => ({
      interactionFrostAnimatedStyle,
    }),
    [interactionFrostAnimatedStyle]
  );
};
