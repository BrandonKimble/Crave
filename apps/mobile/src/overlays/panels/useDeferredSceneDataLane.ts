import React from 'react';
import { InteractionManager } from 'react-native';

const DEFAULT_SCENE_DATA_LANE_DELAY_MS = 350;

export const useDeferredSceneDataLane = (
  enabled: boolean,
  delayMs = DEFAULT_SCENE_DATA_LANE_DELAY_MS
): boolean => {
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
      }, delayMs);
    });

    return () => {
      cancelled = true;
      if (timeout != null) {
        clearTimeout(timeout);
      }
      task.cancel();
    };
  }, [delayMs, enabled]);

  return isReady;
};
