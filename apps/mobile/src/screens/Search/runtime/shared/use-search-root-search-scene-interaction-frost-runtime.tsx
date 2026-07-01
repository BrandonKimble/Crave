import React from 'react';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
  // The commit is now driven by the toggle debounce, not by this fade completing, so the
  // frost no longer signals readiness. Kept in the args for wiring parity.
  void notifyToggleInteractionFrostReady;

  const interactionFrostOpacity = useSharedValue(0);
  const isCoveredRef = React.useRef(false);

  // BOOLEAN-driven cover: fade IN once when the interaction starts and HOLD opaque across
  // the entire rapid-tap + debounce window — the old per-intentId reset-to-0 made the cover
  // flicker on every rapid tap (part of the "glitched out" look). Fade OUT only when the
  // interaction clears at commit, handing the cover to the redraw transaction's own fade.
  const shouldCover = shouldShowInteractionLoadingState && pendingPresentationIntentId != null;

  React.useEffect(() => {
    if (shouldCover === isCoveredRef.current) {
      return;
    }
    isCoveredRef.current = shouldCover;
    interactionFrostOpacity.value = withTiming(shouldCover ? 1 : 0, {
      duration: INTERACTION_FROST_FADE_MS,
    });
  }, [interactionFrostOpacity, shouldCover]);

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
