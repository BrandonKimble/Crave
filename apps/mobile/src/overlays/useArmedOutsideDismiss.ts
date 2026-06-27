import React from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

/**
 * Instagram/Google "armed-outside" modal dismiss — the standardized dismiss gesture for
 * every modal-type surface in the app (the price/score sheets, the in-app alert modal, the
 * active compose chin).
 *
 * Attach the returned gesture to a region that represents OUTSIDE the modal — e.g. the
 * full-bleed backdrop behind a modal card/sheet, which (because the modal is a sibling
 * painted ON TOP) only ever receives touches that land outside the modal.
 *
 * Behaviour: a touch landing on that region does NOTHING on touch-DOWN. It dismisses on the
 * FIRST finger MOVE, or on LIFT if the finger never moved. The touch-down no-op is the whole
 * point — it lets a "press, then reconsider" cancel by lifting back over the modal, and it
 * avoids the jarring instant-dismiss the moment a finger grazes the backdrop.
 *
 * `manualActivation` + `cancelsTouchesInView(false)` keep the gesture from swallowing touches
 * we choose not to act on, so anything underneath the dismiss region still works.
 */
export const useArmedOutsideDismiss = ({
  enabled,
  onDismiss,
}: {
  enabled: boolean;
  onDismiss: () => void;
}) => {
  const fired = useSharedValue(false);
  // Latest onDismiss reachable from the worklet without rebuilding the gesture every render.
  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const dismiss = React.useCallback(() => onDismissRef.current(), []);

  return React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .manualActivation(true)
        .cancelsTouchesInView(false)
        .onTouchesDown(() => {
          'worklet';
          fired.value = false;
        })
        .onTouchesMove((_event, stateManager) => {
          'worklet';
          if (fired.value) {
            return;
          }
          // First movement after an outside touch-down → dismiss.
          fired.value = true;
          stateManager.activate();
          runOnJS(dismiss)();
        })
        .onTouchesUp((_event, stateManager) => {
          'worklet';
          if (!fired.value) {
            // Lifted without moving → dismiss.
            fired.value = true;
            runOnJS(dismiss)();
          }
          stateManager.fail();
        }),
    [dismiss, enabled, fired]
  );
};
