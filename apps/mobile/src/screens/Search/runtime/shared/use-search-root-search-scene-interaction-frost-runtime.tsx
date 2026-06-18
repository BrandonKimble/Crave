import React from 'react';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const INTERACTION_FROST_FADE_MS = 90;

type UseSearchRootSearchSceneInteractionFrostRuntimeArgs = {
  notifyToggleInteractionFrostReady: (intentId: string) => void;
  pendingPresentationIntentId: string | null;
  shouldShowInteractionLoadingState: boolean;
};

void Reanimated;

export const useSearchRootSearchSceneInteractionFrostRuntime = ({
  notifyToggleInteractionFrostReady,
  pendingPresentationIntentId,
  shouldShowInteractionLoadingState,
}: UseSearchRootSearchSceneInteractionFrostRuntimeArgs) => {
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
