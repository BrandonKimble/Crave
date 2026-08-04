import React from 'react';
import { InteractionManager } from 'react-native';

// F932(a): this used to take a `delayMs` override. It had exactly ONE call site
// (SaveListPanel), which omitted it — a parameterized API with one caller and one
// value, i.e. a knob nobody turns wearing the cost of a dep-array entry. The delay is
// the lane's own policy now; a second scene that genuinely needs a different one adds
// the parameter back WITH its caller.
const SCENE_DATA_LANE_DELAY_MS = 350;

export const useDeferredSceneDataLane = (enabled: boolean): boolean => {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) {
      setIsReady(false);
      return undefined;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => {
        if (cancelled) {
          return;
        }
        setIsReady(true);
      }, SCENE_DATA_LANE_DELAY_MS);
    });

    return () => {
      cancelled = true;
      if (timeout != null) {
        clearTimeout(timeout);
      }
      task.cancel();
    };
  }, [enabled]);

  return isReady;
};
