import type { SharedValue } from 'react-native-reanimated';

/**
 * Dismiss-boundary swap gate (Phase-3 Leg 3 — design §4.2, ledger N-3/O-2).
 *
 * The freeze-mode dismiss's visible content swap must land in the SAME UI frame the
 * sheet crosses the target snap. The scene-stack host stages the swap at dismiss-arm
 * (liveSwapRoles written, paintAck pinned 0 — outgoing bundle held opaque over the
 * premounted destination); the ONLY thing between the crossing and the swap is
 * paintAck flipping to 1. Today that flip rides runOnJS → store publish → React
 * commit (1-2+ frames late — the owner's "slightly late" home-dismiss switch).
 *
 * This module hands the dismiss motion plane a UI-thread-writable handle to the live
 * player's paintAck so the crossing worklet can flip it in the crossing frame; the
 * existing runOnJS(commitDismissBoundary) remains as the trailing store/React cleanup.
 *
 * House module-registry pattern (same as the header-nav-action registry): the host
 * registers on mount; readers capture the handle at render for worklet use.
 */

let currentGate: SharedValue<number> | null = null;
const listeners = new Set<() => void>();

export const registerDismissBoundarySwapGate = (gate: SharedValue<number>): (() => void) => {
  currentGate = gate;
  listeners.forEach((listener) => listener());
  return () => {
    if (currentGate === gate) {
      currentGate = null;
      listeners.forEach((listener) => listener());
    }
  };
};

export const readDismissBoundarySwapGate = (): SharedValue<number> | null => currentGate;

/** useSyncExternalStore-compatible: consumers re-render (and their worklets re-capture
 *  the handle) when the host registers/unregisters the live player's gate. */
export const subscribeDismissBoundarySwapGate = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
