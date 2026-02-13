import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type UiFrameSamplerWindowSummary = {
  event: 'window';
  nowMs: number;
  windowMs: number;
  frameCount: number;
  avgFrameMs: number;
  avgFps: number;
  floorFps: number;
  p95FrameMs: number;
  p95Fps: number;
  maxFrameMs: number;
  stallCount: number;
  stallLongestMs: number;
  droppedFrameEstimate: number;
  droppedFrameRatio: number;
  displayHz: number;
};

type UiFrameSamplerStallEvent = {
  event: 'stall';
  nowMs: number;
  frameMs: number;
  fps: number | null;
};

type UiFrameSamplerOptions = {
  windowMs: number;
  stallFrameMs: number;
  logOnlyBelowFps: number;
  onWindow?: (summary: UiFrameSamplerWindowSummary) => void;
  onStall?: (event: UiFrameSamplerStallEvent) => void;
};

type UiFrameSamplerNativeModule = {
  start: (options?: { windowMs?: number; stallFrameMs?: number; logOnlyBelowFps?: number }) => void;
  stop: () => void;
};

const UI_FRAME_SAMPLER_MODULE_NAME = 'UIFrameSampler';
const UI_FRAME_WINDOW_EVENT_NAME = 'uiFrameSamplerWindow';
const UI_FRAME_STALL_EVENT_NAME = 'uiFrameSamplerStall';
let hasLoggedMissingUiFrameSampler = false;

const resolveNativeModule = (): UiFrameSamplerNativeModule | null => {
  const candidate = (NativeModules as Record<string, unknown>)[UI_FRAME_SAMPLER_MODULE_NAME];
  if (!candidate) {
    return null;
  }
  const typed = candidate as UiFrameSamplerNativeModule;
  if (typeof typed.start !== 'function' || typeof typed.stop !== 'function') {
    return null;
  }
  return typed;
};

const startUiFrameSampler = (options: UiFrameSamplerOptions): (() => void) => {
  const nativeModule = resolveNativeModule();
  if (!nativeModule) {
    if (__DEV__ && !hasLoggedMissingUiFrameSampler) {
      hasLoggedMissingUiFrameSampler = true;
      // eslint-disable-next-line no-console
      console.log(
        `[SearchPerf][UiFrameSampler] ${JSON.stringify({
          event: 'native_module_missing',
          module: UI_FRAME_SAMPLER_MODULE_NAME,
          platform: Platform.OS,
        })}`
      );
    }
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(nativeModule as never);
  const windowSubscription = emitter.addListener(
    UI_FRAME_WINDOW_EVENT_NAME,
    (payload: UiFrameSamplerWindowSummary) => {
      options.onWindow?.(payload);
    }
  );
  const stallSubscription = emitter.addListener(
    UI_FRAME_STALL_EVENT_NAME,
    (payload: UiFrameSamplerStallEvent) => {
      options.onStall?.(payload);
    }
  );
  nativeModule.start({
    windowMs: options.windowMs,
    stallFrameMs: options.stallFrameMs,
    logOnlyBelowFps: options.logOnlyBelowFps,
  });
  return () => {
    windowSubscription.remove();
    stallSubscription.remove();
    nativeModule.stop();
  };
};

export type { UiFrameSamplerOptions, UiFrameSamplerStallEvent, UiFrameSamplerWindowSummary };
export { startUiFrameSampler };
