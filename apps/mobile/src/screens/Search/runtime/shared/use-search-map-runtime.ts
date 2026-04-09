import { useMapInteractionController } from '../map/map-interaction-controller';
import { useSearchStableMapHandlersRuntime } from './use-search-stable-map-handlers-runtime';

type UseSearchMapRuntimeArgs = {
  interactionArgs: Parameters<typeof useMapInteractionController>[0];
  stableHandlersArgs: Omit<
    Parameters<typeof useSearchStableMapHandlersRuntime>[0],
    | 'handleMapPress'
    | 'handleNativeViewportChanged'
    | 'handleMapIdle'
    | 'handleCameraAnimationComplete'
  >;
};

export type SearchMapRuntime = ReturnType<typeof useSearchStableMapHandlersRuntime> & {
  handleMapTouchStart: ReturnType<typeof useMapInteractionController>['handleMapTouchStart'];
  handleMapTouchEnd: ReturnType<typeof useMapInteractionController>['handleMapTouchEnd'];
};

export const useSearchMapRuntime = ({
  interactionArgs,
  stableHandlersArgs,
}: UseSearchMapRuntimeArgs): SearchMapRuntime => {
  const {
    handleMapPress,
    handleNativeViewportChanged,
    handleMapIdle,
    handleCameraAnimationComplete,
    handleMapTouchStart,
    handleMapTouchEnd,
  } = useMapInteractionController(interactionArgs);
  const stableHandlers = useSearchStableMapHandlersRuntime({
    ...stableHandlersArgs,
    handleMapPress,
    handleNativeViewportChanged,
    handleMapIdle,
    handleCameraAnimationComplete,
  });

  return {
    ...stableHandlers,
    handleMapTouchStart,
    handleMapTouchEnd,
  };
};
