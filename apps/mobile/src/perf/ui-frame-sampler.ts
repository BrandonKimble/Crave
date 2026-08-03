import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { withSearchNavSwitchRuntimeAttribution } from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';

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

/**
 * F850 — WHY THIS RETURNS AN ATTACHMENT AND NOT A BARE STOP FUNCTION.
 *
 * `startUiFrameSampler` used to return a no-op `stop` when the native module
 * was absent, and say so only behind `__DEV__ && an env flag && once-per-process`
 * — i.e. NEVER on the Release lane, the one lane the 60fps assertion is supposed
 * to be measured on. A missing module, a renamed `UIFrameSampler`, or a native
 * `start` that throws all produced ZERO output, and zero output reads as zero
 * bad windows. There was no defect that could make this instrument show RED.
 *
 * Now the caller is HANDED the attach verdict and must log it. "I did not
 * measure" is a distinct, always-reported state; it can never be mistaken for
 * a perfect run.
 */
type UiFrameSamplerAttachFailureReason =
  | 'native_module_missing'
  | 'native_module_malformed'
  | 'native_start_threw';

type UiFrameSamplerAttachment = {
  /** TRUE only when the native sampler is actually running. */
  attached: boolean;
  /** Null iff attached; otherwise names WHY nothing is being measured. */
  reason: UiFrameSamplerAttachFailureReason | null;
  /** Extra context for the failure (module name, thrown message). */
  detail: string | null;
  platform: string;
  stop: () => void;
};

const notAttached = (
  reason: UiFrameSamplerAttachFailureReason,
  detail: string | null
): UiFrameSamplerAttachment => ({
  attached: false,
  reason,
  detail,
  platform: Platform.OS,
  stop: () => undefined,
});

const resolveNativeModule = ():
  | { module: UiFrameSamplerNativeModule }
  | { failure: UiFrameSamplerAttachFailureReason } => {
  const candidate = (NativeModules as Record<string, unknown>)[UI_FRAME_SAMPLER_MODULE_NAME];
  if (!candidate) {
    return { failure: 'native_module_missing' };
  }
  const typed = candidate as UiFrameSamplerNativeModule;
  if (typeof typed.start !== 'function' || typeof typed.stop !== 'function') {
    return { failure: 'native_module_malformed' };
  }
  return { module: typed };
};

const startUiFrameSampler = (options: UiFrameSamplerOptions): UiFrameSamplerAttachment => {
  const resolved = resolveNativeModule();
  if ('failure' in resolved) {
    return notAttached(resolved.failure, UI_FRAME_SAMPLER_MODULE_NAME);
  }
  const nativeModule = resolved.module;
  const emitter = new NativeEventEmitter(nativeModule as never);
  const windowSubscription = emitter.addListener(
    UI_FRAME_WINDOW_EVENT_NAME,
    (payload: UiFrameSamplerWindowSummary) => {
      withSearchNavSwitchRuntimeAttribution('uiFrameSampler', 'onWindow', () => {
        options.onWindow?.(payload);
      });
    }
  );
  const stallSubscription = emitter.addListener(
    UI_FRAME_STALL_EVENT_NAME,
    (payload: UiFrameSamplerStallEvent) => {
      withSearchNavSwitchRuntimeAttribution('uiFrameSampler', 'onStall', () => {
        options.onStall?.(payload);
      });
    }
  );
  try {
    nativeModule.start({
      windowMs: options.windowMs,
      stallFrameMs: options.stallFrameMs,
      logOnlyBelowFps: options.logOnlyBelowFps,
    });
  } catch (error) {
    windowSubscription.remove();
    stallSubscription.remove();
    return notAttached(
      'native_start_threw',
      error instanceof Error ? error.message : String(error)
    );
  }
  return {
    attached: true,
    reason: null,
    detail: null,
    platform: Platform.OS,
    stop: () => {
      windowSubscription.remove();
      stallSubscription.remove();
      nativeModule.stop();
    },
  };
};

export type {
  UiFrameSamplerAttachment,
  UiFrameSamplerAttachFailureReason,
  UiFrameSamplerOptions,
  UiFrameSamplerStallEvent,
  UiFrameSamplerWindowSummary,
};
export { startUiFrameSampler, UI_FRAME_SAMPLER_MODULE_NAME };
