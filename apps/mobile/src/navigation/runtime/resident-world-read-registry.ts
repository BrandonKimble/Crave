import {
  resolveResidentWorldEntry,
  type RouteSceneSwitchRouteStateSnapshot,
} from './app-overlay-route-stack-algebra';
import type { OverlayRouteEntry } from './app-overlay-route-types';

/**
 * Module-level residency reader (§Q redo — the presenter's shared gate; design §2).
 * The route provider registers the live route-state read once; any module-scope
 * sender (the native render owner's flush, the source-frame publisher, future
 * presenter consumers) can ask "is a world-bearing entry resident?" without React
 * plumbing. House module-registration pattern; one writer.
 *
 * Unregistered (boot window) reads return UNDECIDED (null reader) — callers treat
 * that as "do not gate" so boot-time frames are never blocked by wiring order.
 */

let currentRouteStateReader: (() => RouteSceneSwitchRouteStateSnapshot) | null = null;

export const registerResidentWorldRouteStateReader = (
  reader: () => RouteSceneSwitchRouteStateSnapshot
): (() => void) => {
  currentRouteStateReader = reader;
  return () => {
    if (currentRouteStateReader === reader) {
      currentRouteStateReader = null;
    }
  };
};

/** null = no reader registered (undecided — do not gate). Otherwise the resident
 *  world-bearing entry, or undefined when none is resident. */
export const readCurrentResidentWorldEntry = (): OverlayRouteEntry | null | undefined => {
  if (currentRouteStateReader == null) {
    return null;
  }
  return resolveResidentWorldEntry(currentRouteStateReader()) ?? undefined;
};
