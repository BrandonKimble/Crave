// ─── react-native mock (render lane) — the native boundary, stubbed thin ─────
//
// Host components render as bare string types (react-test-renderer treats them
// as host elements); NativeModules/NativeEventEmitter route through the
// harness so tests can observe native calls and emit native events. Nothing in
// here re-implements host behavior.

import { harness } from '../harness';

export const View = 'View';
export const Text = 'Text';
export const Pressable = 'Pressable';

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  flatten: (style: unknown): unknown => style,
  hairlineWidth: 1,
};

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
};

export const PixelRatio = {
  get: () => 3,
  roundToNearestPixel: (value: number) => value,
};

// APPSTATE (G-APPSTATE): the suspend/resume facts the LIVENESS BACKSTOP reads.
// Module-local (not world state) because listeners are per-mount and removed on
// unmount; specs drive it with setAppStateForTest.
const appStateListeners = new Set<(status: string) => void>();

export const AppState = {
  currentState: 'active' as string,
  addEventListener: (name: string, listener: (status: string) => void) => {
    if (name === 'change') {
      appStateListeners.add(listener);
    }
    return {
      remove: () => {
        appStateListeners.delete(listener);
      },
    };
  },
};

/** Test driver: push a foreground/background fact at the real host wiring. */
export const setAppStateForTest = (status: string): void => {
  AppState.currentState = status;
  [...appStateListeners].forEach((listener) => listener(status));
};

export const Platform = { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios };

export const Linking = {
  getInitialURL: () => Promise.resolve(null as string | null),
  addEventListener: () => ({ remove: () => undefined }),
};

// The ONE native surface under test: reads route to the live harness world at
// call time (resetHarness swaps worlds between tests).
export const NativeModules: Record<string, unknown> = {
  get TrackScrollPhysics() {
    return harness.world.nativePhysics;
  },
};

export class NativeEventEmitter {
  addListener(name: string, listener: (payload: unknown) => void): { remove: () => void } {
    const world = harness.world;
    const set = world.emitterListeners.get(name) ?? new Set<(payload: unknown) => void>();
    world.emitterListeners.set(name, set);
    set.add(listener);
    return {
      remove: () => {
        set.delete(listener);
      },
    };
  }
}

// ─── ASSISTIVE TECH (G-A11Y) ─────────────────────────────────────────────────
// The real AccessibilityInfo is a native no-op when VoiceOver is off, so it
// records nothing a test could read. Here it records: what the track SAID and
// which node it moved the cursor to.
export const AccessibilityInfo = {
  announceForAccessibility: (message: string): void => {
    harness.world.a11y.announcements.push(message);
  },
  setAccessibilityFocus: (handle: number): void => {
    harness.world.a11y.focusHandles.push(handle);
  },
};

export const requireNativeComponent = (name: string): string => name;

const handleIds = new WeakMap<object, number>();
let nextHandle = 1;
export const findNodeHandle = (instance: unknown): number | null => {
  if (instance == null) {
    return null;
  }
  const key = instance as object;
  const existing = handleIds.get(key);
  if (existing != null) {
    harness.world.a11y.nodesByHandle.set(existing, instance);
    return existing;
  }
  const id = nextHandle;
  nextHandle += 1;
  handleIds.set(key, id);
  harness.world.a11y.nodesByHandle.set(id, instance);
  return id;
};

// Types consumed via `import type` are erased at runtime; these keep any
// residual value-position uses harmless.
export type ViewProps = Record<string, unknown>;
export type ViewStyle = Record<string, unknown>;
export type LayoutChangeEvent = { nativeEvent: { layout: Record<string, number> } };
